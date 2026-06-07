import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  PlayerHealth,
  DamageSystem,
} from '../../services/games/shootout/sim/damage.js';

// Plan deviation: the Checkpoint 1 plan sketched a free `applyDamage(victim, {...})`
// function — source actually exposes only `DamageSystem.applyDamage(shooterId, hitResult,
// weaponConfig)` which mutates a registered PlayerHealth. Tests follow the real API.
//
// Plan deviation: plan suggested `assert.equal(ph.hp, 85)` after 30-damage chest shot
// with armor — actual formula rounds (30 * 1.0 * 0.5 = 15 dmg, hp 85). The number
// happens to match. Verified against source: rawDamage = base * multiplier; armor
// halves to 0.5 * rawDamage; result rounded. Tests below use AK-47/M4A1 numbers
// lifted from the source's own _selfTestDamage().
//
// `WeaponType` enum lives in weapons.ts (not yet ported). The damage system only
// reads `weaponConfig.type` as a pass-through string and embeds `'KNIFE'` for
// knife kill events. Tests pass `type: 'AK47'` etc. as plain strings — matches
// enum string values exactly.

// ---------- helpers ----------

const AK47 = {
  type: 'AK47',
  baseDamage: 36,
  fireRate: 0.1,
  magazine: 30,
  reserve: 90,
  reloadTime: 2.5,
  drawTime: 0.7,
  movementSpeed: 215,
  hasAmmo: true,
};

const M4A1 = {
  type: 'M4A1',
  baseDamage: 32,
  fireRate: 0.09,
  magazine: 30,
  reserve: 90,
  reloadTime: 3.1,
  drawTime: 0.7,
  movementSpeed: 221,
  hasAmmo: true,
};

function hit(zone, multiplier, armorProtected, targetId = 'target') {
  return {
    targetId,
    zone,
    multiplier,
    distance: 10,
    hitPosition: { x: 0, y: 0, z: 0 },
    hitNormal: { x: 0, y: 1, z: 0 },
    isHeadshot: zone === 'head',
    armorProtected,
  };
}

// ---------- PlayerHealth ----------

test('PlayerHealth constructor — hp 100, armor 100, helmet, alive', () => {
  const ph = new PlayerHealth();
  assert.equal(ph.hp, 100);
  assert.equal(ph.armor, 100);
  assert.equal(ph.hasHelmet, true);
  assert.equal(ph.alive, true);
  assert.equal(ph.tagSpeedMultiplier, 1.0);
  assert.equal(ph.tagTimeRemaining, 0);
});

test('PlayerHealth.reset() restores full state', () => {
  const ph = new PlayerHealth();
  ph.hp = 5;
  ph.armor = 0;
  ph.hasHelmet = false;
  ph.alive = false;
  ph.tagSpeedMultiplier = 0.5;
  ph.tagTimeRemaining = 0.07;
  ph.reset();
  assert.equal(ph.hp, 100);
  assert.equal(ph.armor, 100);
  assert.equal(ph.hasHelmet, true);
  assert.equal(ph.alive, true);
  assert.equal(ph.tagSpeedMultiplier, 1.0);
  assert.equal(ph.tagTimeRemaining, 0);
});

test('PlayerHealth.update() decrements tag timer and clears at zero', () => {
  const ph = new PlayerHealth();
  ph.tagSpeedMultiplier = 0.5;
  ph.tagTimeRemaining = 0.1;
  ph.update(0.05);
  assert.equal(ph.tagTimeRemaining, 0.1 - 0.05);
  assert.equal(ph.tagSpeedMultiplier, 0.5); // still slowed
  ph.update(0.06); // overshoot
  assert.equal(ph.tagTimeRemaining, 0);
  assert.equal(ph.tagSpeedMultiplier, 1.0); // restored
});

// ---------- DamageSystem: register / get / reset ----------

test('DamageSystem register + getHealth + removePlayer', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('a');
  const ph = ds.getHealth('a');
  assert.ok(ph instanceof PlayerHealth);
  assert.equal(ph.hp, 100);
  ds.removePlayer('a');
  assert.equal(ds.getHealth('a'), undefined);
});

test('DamageSystem resetPlayer + resetAll', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('a');
  ds.registerPlayer('b');
  ds.getHealth('a').hp = 10;
  ds.getHealth('b').hp = 20;
  ds.resetPlayer('a');
  assert.equal(ds.getHealth('a').hp, 100);
  assert.equal(ds.getHealth('b').hp, 20);
  ds.resetAll();
  assert.equal(ds.getHealth('b').hp, 100);
  assert.deepEqual(ds.getKillEvents(), []); // resetAll clears kill events too
});

// ---------- CS:S armor damage formula (numbers from source self-test) ----------

test('AK-47 chest with armor — 36 * 1.0 * 0.5 = 18 dmg', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyDamage('shooter', hit('chest', 1.0, true), AK47);
  assert.equal(r.damageDealt, 18);
  assert.equal(ds.getHealth('target').hp, 82);
});

test('M4A1 chest with armor — 32 * 1.0 * 0.5 = 16 dmg (source TEST 4)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyDamage('shooter', hit('chest', 1.0, true), M4A1);
  assert.equal(r.damageDealt, 16);
  assert.equal(r.killed, false);
});

test('AK-47 headshot WITH helmet — 36 * 4.0 * 0.5 = 72 dmg, survives (source TEST 1)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyDamage('shooter', hit('head', 4.0, true), AK47);
  assert.equal(r.damageDealt, 72);
  assert.equal(r.killed, false);
  assert.equal(r.isHeadshot, true);
  assert.equal(ds.getHealth('target').hp, 28);
});

test('AK-47 headshot NO helmet — 36 * 4.0 * 1.0 = 144 dmg, KILL (source TEST 2)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  ds.getHealth('target').hasHelmet = false;
  const r = ds.applyDamage('shooter', hit('head', 4.0, true), AK47);
  assert.equal(r.damageDealt, 144);
  assert.equal(r.killed, true);
  assert.equal(ds.getHealth('target').hp, 0);
  assert.equal(ds.getHealth('target').alive, false);
});

test('AK-47 leg shot — armorProtected=false → 36 * 0.75 = 27 dmg, no armor consumed (source TEST 6)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyDamage('shooter', hit('leg_l', 0.75, false), AK47);
  assert.equal(r.damageDealt, 27);
  assert.equal(r.armorDamaged, 0);
  assert.equal(ds.getHealth('target').armor, 100);
});

test('AK-47 stomach with armor — 36 * 1.25 * 0.5 = 22.5 → round to 23 (source TEST 5)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyDamage('shooter', hit('stomach', 1.25, true), AK47);
  assert.equal(r.damageDealt, 23);
});

// ---------- Kill detection + KillEvent ----------

test('kill detection fires KillEvent with killer/victim/weapon/headshot/damage', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('victim');
  ds.getHealth('victim').hasHelmet = false;
  ds.applyDamage('killer', hit('head', 4.0, true, 'victim'), AK47);
  const events = ds.getKillEvents();
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    killerId: 'killer',
    victimId: 'victim',
    weaponType: 'AK47',
    isHeadshot: true,
    damageDealt: 144,
  });
});

test('applyDamage returns null for unknown / dead target', () => {
  const ds = new DamageSystem();
  assert.equal(ds.applyDamage('s', hit('chest', 1.0, true), AK47), null);
  ds.registerPlayer('target');
  ds.getHealth('target').alive = false;
  assert.equal(ds.applyDamage('s', hit('chest', 1.0, true), AK47), null);
});

test('clearKillEvents empties the buffer', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('v');
  ds.getHealth('v').hasHelmet = false;
  ds.applyDamage('k', hit('head', 4.0, true, 'v'), AK47);
  assert.equal(ds.getKillEvents().length, 1);
  ds.clearKillEvents();
  assert.equal(ds.getKillEvents().length, 0);
});

// ---------- Knife ----------

test('knife left-click — 40 flat dmg, ignores armor (source TEST 7)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyKnifeDamage('shooter', 'target', false);
  assert.equal(r.damageDealt, 40);
  assert.equal(r.armorDamaged, 0);
  assert.equal(r.killed, false);
  assert.equal(ds.getHealth('target').armor, 100); // armor untouched
});

test('knife backstab — 200 dmg, instant kill, KillEvent weaponType KNIFE (source TEST 8)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  const r = ds.applyKnifeDamage('shooter', 'target', true);
  assert.equal(r.damageDealt, 200);
  assert.equal(r.killed, true);
  const ev = ds.getKillEvents()[0];
  assert.equal(ev.weaponType, 'KNIFE');
  assert.equal(ev.isHeadshot, false);
});

// ---------- Tagging ----------

test('tagging — 50 dmg yields 0.5 speed multiplier, 0.1s duration (source TEST 9)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  ds.applyDamage('s', hit('chest', 1.0, false), { ...AK47, baseDamage: 50 });
  const ph = ds.getHealth('target');
  assert.equal(ph.tagSpeedMultiplier, 0.5);
  assert.equal(ph.tagTimeRemaining, 0.1);
});

test('tagging — caps at 80% slow (multiplier 0.2) regardless of damage (source TEST 10)', () => {
  const ds = new DamageSystem();
  ds.registerPlayer('target');
  ds.applyDamage('s', hit('chest', 1.0, false), { ...AK47, baseDamage: 100 });
  // Source produces 1.0 - 0.8 = 0.19999999999999996 due to float math; assert
  // against the same expression rather than the literal 0.2.
  assert.equal(ds.getHealth('target').tagSpeedMultiplier, 1.0 - 0.8);
});
