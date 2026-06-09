/**
 * Tests for sim/weapons.js.
 *
 * Plan-deviation notes:
 *  - Plan listed weapons: AK47, M4A1, SMG, SHOTGUN, SNIPER, BULLPUP, REVOLVER,
 *    KNIFE. Source has no BULLPUP — instead it has PISTOL. The 8 ported weapons
 *    are AK47, M4A1, SMG, SHOTGUN, SNIPER, PISTOL, REVOLVER, KNIFE. Tests
 *    follow source.
 *  - Plan listed WeaponState as IDLE / FIRING / RELOADING / EMPTY / ... — source
 *    has IDLE, FIRING, RELOADING, DRAWING, KNIFE_ATTACK (no EMPTY). Tests follow
 *    source.
 *  - Plan said `canReload` with magazine full + reserve > 0 → "verify". Source
 *    returns FALSE in that case (`magazine < config.magazine` guard). Tested.
 *  - WeaponSystem.fire() in source returns { weaponType, shotIndex, damage } —
 *    NOT a tick, NOT a vector. shotIndex is 0-indexed (shotsFired - 1).
 *  - Reload ammo refill happens at 50% of reloadTime (CS:S Decision D8). Tested.
 *  - Weapon-type args are bare strings ('AK47' etc.) because source WeaponType
 *    is a TS string-enum (`AK47 = 'AK47'`) — same convention as recoilPatterns.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_COMMIT,
  WeaponType,
  WeaponState,
  weaponConfig,
  WeaponSystem,
} from '../../services/games/shootout/sim/weapons.js';

// ---------- SOURCE_COMMIT ----------

test('SOURCE_COMMIT is set to a real-looking sha', () => {
  assert.match(SOURCE_COMMIT, /^[0-9a-f]{40}$/);
});

// ---------- WeaponType enum ----------

test('WeaponType has all 9 weapons as frozen string-enum', () => {
  assert.equal(WeaponType.AK47, 'AK47');
  assert.equal(WeaponType.M4A1, 'M4A1');
  assert.equal(WeaponType.BULLPUP, 'BULLPUP');
  assert.equal(WeaponType.SMG, 'SMG');
  assert.equal(WeaponType.SHOTGUN, 'SHOTGUN');
  assert.equal(WeaponType.SNIPER, 'SNIPER');
  assert.equal(WeaponType.PISTOL, 'PISTOL');
  assert.equal(WeaponType.REVOLVER, 'REVOLVER');
  assert.equal(WeaponType.KNIFE, 'KNIFE');
  assert.equal(Object.values(WeaponType).length, 9);
  assert.ok(Object.isFrozen(WeaponType));
});

// ---------- WeaponState enum ----------

test('WeaponState has all 5 states as frozen string-enum', () => {
  assert.equal(WeaponState.IDLE, 'IDLE');
  assert.equal(WeaponState.FIRING, 'FIRING');
  assert.equal(WeaponState.RELOADING, 'RELOADING');
  assert.equal(WeaponState.DRAWING, 'DRAWING');
  assert.equal(WeaponState.KNIFE_ATTACK, 'KNIFE_ATTACK');
  assert.equal(Object.values(WeaponState).length, 5);
  assert.ok(Object.isFrozen(WeaponState));
});

// ---------- weaponConfig ----------

test('weaponConfig(AK47) returns expected stats', () => {
  const c = weaponConfig('AK47');
  assert.equal(c.type, 'AK47');
  assert.equal(c.fireRate, 0.1);
  assert.equal(c.baseDamage, 36);
  assert.equal(c.magazine, 30);
  assert.equal(c.reserve, 90);
  assert.equal(c.reloadTime, 2.5);
  assert.equal(c.drawTime, 0.7);
  assert.equal(c.movementSpeed, 215);
  assert.equal(c.hasAmmo, true);
  assert.equal(c.price, 2500);
  assert.equal(c.displayName, 'AK-47');
  assert.equal(c.category, 'rifle');
});

test('weaponConfig(SHOTGUN) has magazine=2 + per-pellet damage=26', () => {
  const c = weaponConfig('SHOTGUN');
  assert.equal(c.magazine, 2);
  assert.equal(c.baseDamage, 26);
  assert.equal(c.fireRate, 0.85);
  assert.equal(c.reloadTime, 1.6);
  assert.equal(c.category, 'heavy');
});

test('weaponConfig(SNIPER) one-shot body damage', () => {
  const c = weaponConfig('SNIPER');
  assert.equal(c.baseDamage, 115);
  assert.equal(c.fireRate, 1.2);
  assert.equal(c.price, 4750);
});

test('weaponConfig(PISTOL) is free default sidearm', () => {
  const c = weaponConfig('PISTOL');
  assert.equal(c.price, 0);
  assert.equal(c.baseDamage, 25);
  assert.equal(c.magazine, 20);
});

test('weaponConfig(KNIFE) has no ammo', () => {
  const c = weaponConfig('KNIFE');
  assert.equal(c.hasAmmo, false);
  assert.equal(c.magazine, 0);
  assert.equal(c.reserve, 0);
  assert.equal(c.baseDamage, 40);
  assert.equal(c.category, 'knife');
});

test('all 8 weapons resolvable via weaponConfig', () => {
  for (const t of Object.values(WeaponType)) {
    const c = weaponConfig(t);
    assert.ok(c, `missing config for ${t}`);
    assert.equal(c.type, t);
  }
});

// ---------- WeaponSystem constructor + default state ----------

test('WeaponSystem defaults to AK47 + IDLE + full mag/reserve', () => {
  const w = new WeaponSystem();
  assert.equal(w.currentWeapon, 'AK47');
  assert.equal(w.state, 'IDLE');
  assert.equal(w.stateTime, 0);
  assert.equal(w.shotsFired, 0);
  const ammo = w.getAmmo();
  assert.equal(ammo.magazine, 30);
  assert.equal(ammo.reserve, 90);
});

test('WeaponSystem accepts explicit starting weapon', () => {
  const w = new WeaponSystem('SNIPER');
  assert.equal(w.currentWeapon, 'SNIPER');
  const ammo = w.getAmmo();
  assert.equal(ammo.magazine, 10);
  assert.equal(ammo.reserve, 30);
});

// ---------- canFire / fire ----------

test('canFire is true for fresh AK47', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.canFire(), true);
});

test('canFire is false for KNIFE (use knifeAttack instead)', () => {
  const w = new WeaponSystem('KNIFE');
  assert.equal(w.canFire(), false);
});

test('fire() decrements magazine, returns FireResult, enters FIRING', () => {
  const w = new WeaponSystem('AK47');
  const r = w.fire(1.0);
  assert.ok(r);
  assert.equal(r.weaponType, 'AK47');
  assert.equal(r.shotIndex, 0);
  assert.equal(r.damage, 36);
  assert.equal(w.state, 'FIRING');
  assert.equal(w.getAmmo().magazine, 29);
  assert.equal(w.shotsFired, 1);
  assert.equal(w.lastShotTime, 1.0);
});

test('canFire is false during fireRate window after firing', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);
  assert.equal(w.canFire(), false); // still FIRING
});

test('fire() returns null when magazine empty', () => {
  const w = new WeaponSystem('SHOTGUN'); // magazine: 2
  w.fire(0);
  w.update(1.0, 1.0); // clear FIRING (fireRate=0.85)
  w.fire(1.0);
  w.update(1.0, 2.0);
  assert.equal(w.getAmmo().magazine, 0);
  assert.equal(w.fire(3.0), null);
});

// ---------- canReload / startReload ----------

test('canReload is true in IDLE when magazine missing rounds + reserve > 0', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);
  w.update(0.2, 0.2); // back to IDLE (fireRate=0.1)
  assert.equal(w.state, 'IDLE');
  assert.equal(w.canReload(), true);
});

test('canReload is true in FIRING (the fix — reload tap within fireRate works)', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0); // now FIRING
  assert.equal(w.state, 'FIRING');
  assert.equal(w.canReload(), true);
});

test('canReload is false during RELOADING', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);
  w.update(0.2, 0.2); // IDLE
  w.startReload();
  assert.equal(w.state, 'RELOADING');
  assert.equal(w.canReload(), false);
});

test('canReload is false when magazine full + reserve > 0', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.getAmmo().magazine, 30);
  assert.equal(w.getAmmo().reserve, 90);
  assert.equal(w.canReload(), false);
});

test('canReload is false for KNIFE', () => {
  const w = new WeaponSystem('KNIFE');
  assert.equal(w.canReload(), false);
});

test('startReload transitions IDLE → RELOADING, refills at 50% timer', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);             // shot 1, enter FIRING
  w.update(0.2, 0.2);    // back to IDLE
  w.fire(0.2);           // shot 2, enter FIRING
  w.update(0.2, 0.4);    // back to IDLE
  assert.equal(w.state, 'IDLE');
  assert.equal(w.getAmmo().magazine, 28);

  assert.equal(w.startReload(), true);
  assert.equal(w.state, 'RELOADING');
  assert.equal(w.stateTime, 0);

  // Just before 50% — no refill yet
  w.update(1.2, 1.4); // stateTime ~1.2, reloadTime*0.5 = 1.25
  assert.equal(w.getAmmo().magazine, 28);

  // Cross 50% — refill triggers
  w.update(0.1, 1.5); // stateTime ~1.3 > 1.25
  assert.equal(w.getAmmo().magazine, 30);
  assert.equal(w.getAmmo().reserve, 88);
  assert.equal(w.state, 'RELOADING'); // still reloading until 100%

  // Finish reload
  w.update(1.3, 2.8); // stateTime ~2.6 > 2.5
  assert.equal(w.state, 'IDLE');
});

// ---------- update() state transitions ----------

test('FIRING state auto-returns to IDLE after fireRate elapses', () => {
  const w = new WeaponSystem('AK47'); // fireRate=0.1
  w.fire(0);
  assert.equal(w.state, 'FIRING');
  w.update(0.05, 0.05);
  assert.equal(w.state, 'FIRING');
  w.update(0.06, 0.11);
  assert.equal(w.state, 'IDLE');
});

test('spray resets to 0 after 0.45s of no firing', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);            // shotsFired=1, FIRING
  w.update(0.2, 0.2);   // IDLE
  w.fire(0.2);          // shotsFired=2, FIRING, lastShotTime=0.2
  w.update(0.2, 0.4);   // IDLE
  assert.equal(w.shotsFired, 2);
  // currentTime - lastShotTime > 0.45 → reset
  w.update(0.5, 0.7);
  assert.equal(w.shotsFired, 0);
});

// ---------- canSwitch / switchWeapon ----------

test('canSwitch is true in IDLE and FIRING, false in RELOADING', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.canSwitch(), true);
  w.fire(0);
  assert.equal(w.canSwitch(), true); // FIRING ok
  w.update(0.2, 0.2);
  w.startReload();
  assert.equal(w.canSwitch(), false);
});

test('switchWeapon swaps current weapon + enters DRAWING', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.switchWeapon('PISTOL'), true);
  assert.equal(w.currentWeapon, 'PISTOL');
  assert.equal(w.state, 'DRAWING');
});

test('switchWeapon to same weapon returns false', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.switchWeapon('AK47'), false);
});

test('DRAWING auto-returns to IDLE after drawTime', () => {
  const w = new WeaponSystem('AK47');
  w.switchWeapon('PISTOL'); // drawTime=0.5
  assert.equal(w.state, 'DRAWING');
  w.update(0.4, 0.4);
  assert.equal(w.state, 'DRAWING');
  w.update(0.2, 0.6);
  assert.equal(w.state, 'IDLE');
});

// ---------- knifeAttack ----------

test('knifeAttack returns null when not holding KNIFE', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.knifeAttack(false), null);
});

test('knifeAttack left-click does 40, right-click backstab does 180', () => {
  const w = new WeaponSystem('KNIFE');
  const swing = w.knifeAttack(false);
  assert.deepEqual(swing, { isBackstab: false, damage: 40 });
  assert.equal(w.state, 'KNIFE_ATTACK');

  // Wait for swing to finish
  w.update(0.5, 0.5);
  assert.equal(w.state, 'IDLE');

  const back = w.knifeAttack(true);
  assert.deepEqual(back, { isBackstab: true, damage: 180 });
});

test('knifeAttack returns null mid-swing (state !== IDLE)', () => {
  const w = new WeaponSystem('KNIFE');
  w.knifeAttack(false);
  assert.equal(w.knifeAttack(false), null);
});

// ---------- getMovementSpeed ----------

test('getMovementSpeed reflects current weapon', () => {
  const w = new WeaponSystem('AK47');
  assert.equal(w.getMovementSpeed(), 215);
  w.switchWeapon('KNIFE');
  assert.equal(w.getMovementSpeed(), 250);
});

// ---------- resetAll ----------

test('resetAll refills every weapon + clears state', () => {
  const w = new WeaponSystem('AK47');
  w.fire(0);
  w.fire(0);
  w.update(0.2, 0.2);
  w.startReload();
  assert.equal(w.state, 'RELOADING');

  w.resetAll();
  assert.equal(w.state, 'IDLE');
  assert.equal(w.stateTime, 0);
  assert.equal(w.shotsFired, 0);
  assert.equal(w.lastShotTime, 0);
  assert.equal(w.getAmmo().magazine, 30);
  assert.equal(w.getAmmo().reserve, 90);

  // Sanity: refilled across all weapons, not just current
  w.switchWeapon('SHOTGUN');
  assert.equal(w.getAmmo().magazine, 2);
  assert.equal(w.getAmmo().reserve, 32);
});

// ---------- getAmmo returns a defensive copy ----------

test('getAmmo returns a copy — mutating it does not affect state', () => {
  const w = new WeaponSystem('AK47');
  const a = w.getAmmo();
  a.magazine = 0;
  assert.equal(w.getAmmo().magazine, 30);
});
