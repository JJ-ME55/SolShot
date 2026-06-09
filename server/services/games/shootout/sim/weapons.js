/**
 * Per-weapon configs + per-player WeaponSystem state machine.
 *
 * Port of c:\Users\jacob\fps-staking-game\src\engine\weapons.ts.
 * Pure data + small state-machine. No DOM, no Three.js. Used by sim/runner.js
 * to validate fire/reload events authoritatively and by sim/economy.js to
 * read prices for the buy menu.
 *
 * MUST stay in sync with the client engine file. Bump SOURCE_COMMIT on every
 * re-sync from BillionaireBonkClub/shootout master.
 *
 * Port date: 2026-06-05.
 *
 * Notes:
 *  - Source `WeaponType` / `WeaponState` are TS string-enums; ported as frozen
 *    object literals. Runtime values are identical (`WeaponType.AK47 === 'AK47'`).
 *  - No imports from sim/damage.js or sim/recoilPatterns.js — those modules
 *    duck-type the weapon-type string and read config fields off duck-typed
 *    WeaponConfig objects. Keeping the dependency arrow one-way (callers wire
 *    things up) matches source's import graph.
 *  - `canReload` allows IDLE *or* FIRING (so a reload tapped within fireRate of
 *    a shot is not silently dropped). Preserved verbatim.
 *  - Reload ammo refills at 50% of reloadTime (CS:S Decision D8).
 *  - `getAmmo` returns a shallow copy so callers can't mutate internal state.
 *  - Source switch-cases in `update()` declare bare `const` per case (legal in
 *    TS, where the compiler emits per-case lets). Ported with `case ...: { ... }`
 *    blocks because JS scopes `const` to the entire switch, not the case.
 *    Behavior identical; semantics preserved.
 */

export const SOURCE_COMMIT = '5531febdc6c6289f0d12a05352acb2fad7a08a60'; // bump on every Fish-sync

// ========== ENUMS ==========

export const WeaponType = Object.freeze({
  AK47: 'AK47',
  M4A1: 'M4A1',
  BULLPUP: 'BULLPUP',
  SMG: 'SMG',
  SHOTGUN: 'SHOTGUN',
  SNIPER: 'SNIPER',
  PISTOL: 'PISTOL',
  REVOLVER: 'REVOLVER',
  KNIFE: 'KNIFE',
});

export const WeaponState = Object.freeze({
  IDLE: 'IDLE',
  FIRING: 'FIRING',
  RELOADING: 'RELOADING',
  DRAWING: 'DRAWING',
  KNIFE_ATTACK: 'KNIFE_ATTACK',
});

// ========== WEAPON CONFIGS ==========

// CS:S authentic values from CONTEXT.md.
const WEAPON_CONFIGS = {
  [WeaponType.AK47]: {
    type: WeaponType.AK47,
    fireRate: 0.1,        // 600 RPM
    baseDamage: 36,
    magazine: 30,
    reserve: 90,
    reloadTime: 2.5,
    drawTime: 0.7,
    movementSpeed: 215,
    hasAmmo: true,
    price: 2500,
    displayName: 'AK-47',
    category: 'rifle',
  },
  [WeaponType.M4A1]: {
    type: WeaponType.M4A1,
    fireRate: 0.09,       // 667 RPM
    baseDamage: 32,
    magazine: 30,
    reserve: 90,
    reloadTime: 3.1,
    drawTime: 0.7,
    movementSpeed: 221,
    hasAmmo: true,
    price: 3100,
    displayName: 'M4A1',
    category: 'rifle',
  },
  [WeaponType.BULLPUP]: {
    type: WeaponType.BULLPUP,
    fireRate: 0.10,       // 600 RPM — slower than M4A1
    baseDamage: 36,       // heavier round
    magazine: 30,
    reserve: 90,
    reloadTime: 3.3,
    drawTime: 0.8,
    movementSpeed: 221,
    hasAmmo: true,
    price: 3300,
    displayName: 'Bullpup',
    category: 'rifle',
  },
  [WeaponType.SMG]: {
    type: WeaponType.SMG,
    fireRate: 0.07,       // ~860 RPM, high rate, lower damage
    baseDamage: 26,
    magazine: 30,
    reserve: 120,
    reloadTime: 2.2,
    drawTime: 0.6,
    movementSpeed: 235,
    hasAmmo: true,
    price: 1250,
    displayName: 'SMG',
    category: 'smg',
  },
  [WeaponType.SHOTGUN]: {
    type: WeaponType.SHOTGUN,
    fireRate: 0.85,       // Pump action — delay between shots while cocking
    baseDamage: 26,       // PER PELLET (fires 8 pellets); lethal close, weak at range
    magazine: 2,          // 2 shells before reload
    reserve: 32,
    reloadTime: 1.6,      // ~2 shells
    drawTime: 0.7,
    movementSpeed: 210,
    hasAmmo: true,
    price: 1100,
    displayName: 'Shotgun',
    category: 'heavy',
  },
  [WeaponType.SNIPER]: {
    type: WeaponType.SNIPER,
    fireRate: 1.2,        // Bolt action
    baseDamage: 115,      // One-shot body kill
    magazine: 10,
    reserve: 30,
    reloadTime: 3.5,
    drawTime: 0.9,
    movementSpeed: 200,
    hasAmmo: true,
    price: 4750,
    displayName: 'Sniper',
    category: 'sniper',
  },
  [WeaponType.PISTOL]: {
    type: WeaponType.PISTOL,
    fireRate: 0.15,       // ~400 RPM
    baseDamage: 25,
    magazine: 20,
    reserve: 120,
    reloadTime: 2.2,
    drawTime: 0.5,
    movementSpeed: 240,
    hasAmmo: true,
    price: 0,             // Default sidearm (free)
    displayName: 'Pistol',
    category: 'pistol',
  },
  [WeaponType.REVOLVER]: {
    type: WeaponType.REVOLVER,
    fireRate: 0.4,        // Hard-hitting sidearm
    baseDamage: 51,
    magazine: 8,
    reserve: 24,
    reloadTime: 2.3,
    drawTime: 0.6,
    movementSpeed: 235,
    hasAmmo: true,
    price: 600,
    displayName: 'Revolver',
    category: 'pistol',
  },
  [WeaponType.KNIFE]: {
    type: WeaponType.KNIFE,
    fireRate: 0.4,        // Swing time
    baseDamage: 40,       // Left-click damage
    magazine: 0,
    reserve: 0,
    reloadTime: 0,
    drawTime: 0.25,
    movementSpeed: 250,
    hasAmmo: false,
    price: 0,
    displayName: 'Knife',
    category: 'knife',
  },
};

// Look up a weapon's static config (price, displayName, category, stats).
export function weaponConfig(type) {
  return WEAPON_CONFIGS[type];
}

// ========== WEAPON SYSTEM ==========

export class WeaponSystem {
  constructor(startingWeapon = WeaponType.AK47) {
    this.currentWeapon = startingWeapon;
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this.shotsFired = 0;
    this.lastShotTime = 0;
    this.ammoRefilled = false;

    // Initialize ammo for all weapons
    this.ammo = new Map();
    for (const type of Object.values(WeaponType)) {
      const config = WEAPON_CONFIGS[type];
      this.ammo.set(type, {
        magazine: config.magazine,
        reserve: config.reserve,
      });
    }
  }

  // Update state machine
  update(dt, currentTime) {
    this.stateTime += dt;

    // Check for spray reset (0.45s of no firing)
    if (currentTime - this.lastShotTime > 0.45) {
      this.shotsFired = 0;
    }

    switch (this.state) {
      case WeaponState.DRAWING: {
        const config = this.getWeaponConfig();
        if (this.stateTime >= config.drawTime) {
          this.state = WeaponState.IDLE;
          this.stateTime = 0;
        }
        break;
      }

      case WeaponState.RELOADING: {
        const reloadConfig = this.getWeaponConfig();

        // Ammo refills at 50% through animation (CS:S Decision D8)
        if (!this.ammoRefilled && this.stateTime >= reloadConfig.reloadTime * 0.5) {
          const ammoState = this.ammo.get(this.currentWeapon);
          const needed = reloadConfig.magazine - ammoState.magazine;
          const toReload = Math.min(needed, ammoState.reserve);

          ammoState.magazine += toReload;
          ammoState.reserve -= toReload;
          this.ammoRefilled = true;
        }

        // Complete reload
        if (this.stateTime >= reloadConfig.reloadTime) {
          this.state = WeaponState.IDLE;
          this.stateTime = 0;
        }
        break;
      }

      case WeaponState.FIRING: {
        const fireConfig = this.getWeaponConfig();
        if (this.stateTime >= fireConfig.fireRate) {
          this.state = WeaponState.IDLE;
          this.stateTime = 0;
        }
        break;
      }

      case WeaponState.KNIFE_ATTACK: {
        // Knife swing duration
        const knifeSwingTime = 0.4;
        if (this.stateTime >= knifeSwingTime) {
          this.state = WeaponState.IDLE;
          this.stateTime = 0;
        }
        break;
      }

      case WeaponState.IDLE:
        // No auto-reload here: reloads are driven by the player (R / empty-fire)
        // through the game layer so the FP animation, sound, and HUD all fire.
        break;
    }
  }

  // Can fire check
  canFire() {
    if (this.state !== WeaponState.IDLE) return false;
    if (this.currentWeapon === WeaponType.KNIFE) return false;

    const ammoState = this.ammo.get(this.currentWeapon);

    return ammoState.magazine > 0;
  }

  // Can reload check
  canReload() {
    // Allow reloading from IDLE or right after a shot (FIRING) — otherwise a
    // reload tapped within fireRate of a shot is silently dropped.
    if (this.state !== WeaponState.IDLE && this.state !== WeaponState.FIRING) return false;
    if (this.currentWeapon === WeaponType.KNIFE) return false;

    const config = this.getWeaponConfig();
    const ammoState = this.ammo.get(this.currentWeapon);

    return ammoState.magazine < config.magazine && ammoState.reserve > 0;
  }

  // Can switch check
  canSwitch() {
    // Can switch during IDLE or FIRING, but not during RELOADING or DRAWING
    return this.state === WeaponState.IDLE || this.state === WeaponState.FIRING;
  }

  // Fire weapon
  fire(currentTime) {
    if (!this.canFire()) return null;

    const config = this.getWeaponConfig();
    const ammoState = this.ammo.get(this.currentWeapon);

    // Consume ammo
    ammoState.magazine -= 1;

    // Update spray tracking
    this.shotsFired += 1;
    this.lastShotTime = currentTime;

    // Enter firing state
    this.state = WeaponState.FIRING;
    this.stateTime = 0;

    return {
      weaponType: this.currentWeapon,
      shotIndex: this.shotsFired - 1, // 0-indexed for pattern lookup
      damage: config.baseDamage,
    };
  }

  // Start reload
  startReload() {
    if (!this.canReload()) return false;

    this.state = WeaponState.RELOADING;
    this.stateTime = 0;
    this.ammoRefilled = false;
    this.shotsFired = 0; // Reset spray pattern on reload

    return true;
  }

  // Switch weapon
  switchWeapon(type) {
    if (!this.canSwitch()) return false;
    if (this.currentWeapon === type) return false;

    this.currentWeapon = type;
    this.state = WeaponState.DRAWING;
    this.stateTime = 0;
    this.shotsFired = 0; // Reset spray pattern on switch

    return true;
  }

  // Knife attack
  knifeAttack(isRightClick) {
    if (this.currentWeapon !== WeaponType.KNIFE) return null;
    if (this.state !== WeaponState.IDLE) return null;

    this.state = WeaponState.KNIFE_ATTACK;
    this.stateTime = 0;

    if (isRightClick) {
      // Right-click: backstab (instant kill if from behind)
      return {
        isBackstab: true,
        damage: 180, // High enough to kill through armor
      };
    } else {
      // Left-click: normal swing
      return {
        isBackstab: false,
        damage: 40,
      };
    }
  }

  // Get movement speed for current weapon
  getMovementSpeed() {
    return this.getWeaponConfig().movementSpeed;
  }

  // Get current weapon config
  getWeaponConfig() {
    return WEAPON_CONFIGS[this.currentWeapon];
  }

  // Get current ammo state
  getAmmo() {
    return { ...this.ammo.get(this.currentWeapon) };
  }

  // Reset all ammo (for round start)
  resetAll() {
    for (const type of Object.values(WeaponType)) {
      const config = WEAPON_CONFIGS[type];
      this.ammo.set(type, {
        magazine: config.magazine,
        reserve: config.reserve,
      });
    }

    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this.shotsFired = 0;
    this.lastShotTime = 0;
    this.ammoRefilled = false;
  }
}

export default WeaponSystem;
