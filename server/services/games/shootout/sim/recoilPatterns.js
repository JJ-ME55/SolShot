/**
 * Recoil patterns + accuracy model for hipfire / scoped fire.
 *
 * Port of c:\Users\jacob\fps-staking-game\src\engine\recoil-patterns.ts.
 * Pure data + small state-machine. No DOM, no Three.js. Used by sim/weapons.js
 * (and later sim/runner.js) to compute viewpunch + bullet spread.
 *
 * MUST stay in sync with the client engine file. Bump SOURCE_COMMIT on every
 * re-sync from BillionaireBonkClub/shootout master.
 *
 * Port date: 2026-06-05.
 *
 * Notes:
 *  - Source imports `WeaponType` from `./weapons` for typing AND for enum
 *    comparisons (`weaponType === WeaponType.AK47`). The TS string-enum compiles
 *    to bare string literals (`'AK47'`, `'M4A1'`, etc.), so at runtime the
 *    comparisons are plain string equality. Port duck-types weaponType as a
 *    string — no import from sim/weapons.js needed.
 *  - Source uses `Math.random()` in PISTOL recoil + `getSpreadAngle`. Preserved
 *    verbatim — callers (sim/runner.js etc.) get the same non-determinism.
 *  - `getFinalShotAngle` allocates a fresh `AccuracyModel` per call to reuse
 *    `getSpreadAngle`. Mirroring source — do not refactor without re-syncing
 *    with engine file.
 */

export const SOURCE_COMMIT = 'c68323282af7443efbd96130029d0e16ada85a20'; // bump on every Fish-sync

// AK-47 30-shot spray pattern (CS:S faithful)
// Harder recoil: climbs up strongly, pulls LEFT after ~5-6 shots
export const AK47_PATTERN = [
  { x: 0.0, y: 0.6 },   // Shot 1: straight up
  { x: 0.0, y: 0.8 },   // Shot 2: continue up
  { x: 0.0, y: 0.9 },   // Shot 3: peak climb rate
  { x: 0.0, y: 0.8 },   // Shot 4: still climbing
  { x: -0.2, y: 0.7 },  // Shot 5: begin left pull
  { x: -0.3, y: 0.6 },  // Shot 6: left pull stronger
  { x: -0.4, y: 0.5 },  // Shot 7: strong left
  { x: -0.5, y: 0.4 },  // Shot 8: left dominant
  { x: -0.5, y: 0.3 },  // Shot 9: left continues
  { x: -0.4, y: 0.3 },  // Shot 10: left continues
  { x: -0.3, y: 0.2 },  // Shot 11: moderate left
  { x: -0.2, y: 0.2 },  // Shot 12: moderate left
  { x: -0.1, y: 0.2 },  // Shot 13: slight left
  { x: 0.0, y: 0.2 },   // Shot 14: center
  { x: 0.1, y: 0.1 },   // Shot 15: slight right
  { x: 0.2, y: 0.1 },   // Shot 16: oscillate right
  { x: 0.3, y: 0.1 },   // Shot 17: right
  { x: 0.4, y: 0.0 },   // Shot 18: right
  { x: 0.4, y: 0.0 },   // Shot 19: right
  { x: 0.3, y: 0.0 },   // Shot 20: right
  { x: 0.2, y: -0.1 },  // Shot 21: slight down
  { x: 0.1, y: -0.1 },  // Shot 22: slight down
  { x: 0.0, y: -0.1 },  // Shot 23: center down
  { x: -0.1, y: -0.1 }, // Shot 24: return left
  { x: -0.2, y: 0.0 },  // Shot 25: return left
  { x: -0.2, y: 0.0 },  // Shot 26: left
  { x: -0.1, y: 0.0 },  // Shot 27: left
  { x: -0.1, y: 0.0 },  // Shot 28: left
  { x: 0.0, y: 0.0 },   // Shot 29: center
  { x: 0.0, y: 0.0 },   // Shot 30: center
];

// M4A1 30-shot spray pattern (CS:S faithful)
// Easier recoil: climbs up more gently, drifts RIGHT, more controllable
export const M4A1_PATTERN = [
  { x: 0.0, y: 0.5 },   // Shot 1: straight up (less than AK)
  { x: 0.0, y: 0.6 },   // Shot 2: continue up
  { x: 0.0, y: 0.7 },   // Shot 3: peak climb
  { x: 0.0, y: 0.6 },   // Shot 4: still climbing
  { x: 0.1, y: 0.5 },   // Shot 5: begin right drift
  { x: 0.2, y: 0.4 },   // Shot 6: right drift
  { x: 0.3, y: 0.4 },   // Shot 7: right
  { x: 0.3, y: 0.3 },   // Shot 8: right
  { x: 0.4, y: 0.3 },   // Shot 9: right continues
  { x: 0.4, y: 0.2 },   // Shot 10: right
  { x: 0.3, y: 0.2 },   // Shot 11: moderate right
  { x: 0.3, y: 0.2 },   // Shot 12: moderate right
  { x: 0.2, y: 0.1 },   // Shot 13: slight right
  { x: 0.2, y: 0.1 },   // Shot 14: slight right
  { x: 0.1, y: 0.1 },   // Shot 15: slight right
  { x: 0.0, y: 0.1 },   // Shot 16: center
  { x: -0.1, y: 0.0 },  // Shot 17: oscillate left
  { x: -0.2, y: 0.0 },  // Shot 18: left
  { x: -0.2, y: 0.0 },  // Shot 19: left
  { x: -0.1, y: 0.0 },  // Shot 20: left
  { x: -0.1, y: -0.1 }, // Shot 21: slight down
  { x: 0.0, y: -0.1 },  // Shot 22: slight down
  { x: 0.0, y: -0.1 },  // Shot 23: slight down
  { x: 0.1, y: 0.0 },   // Shot 24: return right
  { x: 0.1, y: 0.0 },   // Shot 25: right
  { x: 0.1, y: 0.0 },   // Shot 26: right
  { x: 0.1, y: 0.0 },   // Shot 27: right
  { x: 0.0, y: 0.0 },   // Shot 28: center
  { x: 0.0, y: 0.0 },   // Shot 29: center
  { x: 0.0, y: 0.0 },   // Shot 30: center
];

// Get recoil angle for a specific shot
export function getRecoilAngle(weaponType, shotIndex) {
  switch (weaponType) {
    case 'AK47':
      // Wrap around if beyond pattern length
      return AK47_PATTERN[shotIndex % AK47_PATTERN.length];

    case 'M4A1':
      // Wrap around if beyond pattern length
      return M4A1_PATTERN[shotIndex % M4A1_PATTERN.length];

    case 'BULLPUP': {
      // AUG/Steyr-style: similar arc to M4A1 with slightly tighter
      // horizontal spread — bullpup ergonomics handle recoil better.
      const m4 = M4A1_PATTERN[shotIndex % M4A1_PATTERN.length];
      return { x: m4.x * 0.85, y: m4.y * 1.05 };
    }

    case 'SMG': {
      // SMG: lighter, faster climb — reuse the M4 pattern at reduced magnitude.
      const smg = M4A1_PATTERN[shotIndex % M4A1_PATTERN.length];
      return { x: smg.x * 0.7, y: smg.y * 0.65 };
    }

    case 'PISTOL':
      // Pistol has no fixed pattern, small upward kick with minor random horizontal
      return {
        x: (Math.random() - 0.5) * 0.2,
        y: 0.4 + Math.random() * 0.2,
      };

    case 'KNIFE':
      // Knife has no recoil
      return { x: 0, y: 0 };

    default:
      return { x: 0, y: 0 };
  }
}

// Accuracy model class
export class AccuracyModel {
  constructor() {
    this.accuracy = 1.0;     // 0.0 = wildly inaccurate, 1.0 = perfect
    this.lastAccuracyCheck = 0;
  }

  // Update accuracy based on player state
  update(dt, speed, onGround, crouching, timeSinceLastShot, weaponType) {
    let targetAccuracy = 1.0;

    // Airborne: completely inaccurate (CS:S severity)
    if (!onGround) {
      if (weaponType === 'PISTOL') {
        targetAccuracy = 0.1; // Pistol very inaccurate in air
      } else {
        targetAccuracy = 0.0; // Rifles wildly inaccurate in air
      }
    }
    // Moving: severe penalty for rifles, moderate for pistol
    else if (speed > 10) {
      if (weaponType === 'PISTOL') {
        targetAccuracy = 0.4; // Pistol more forgiving while moving
      } else {
        targetAccuracy = 0.1; // Rifles wildly inaccurate while moving
      }
    }
    // Standing still or counter-strafing: perfect first-shot accuracy
    else {
      targetAccuracy = 1.0;
    }

    // Spray penalty: accuracy degrades with sustained fire, recovers over 0.45s
    if (timeSinceLastShot < 0.45) {
      const recoveryProgress = timeSinceLastShot / 0.45;
      targetAccuracy *= recoveryProgress;
    }

    // Crouching bonus: tighter spread (multiply spread by 0.7)
    // This is applied in getSpreadAngle, but we track it here for reference
    // (actual implementation multiplies final spread by 0.7 when crouched)

    // Counter-strafe instant accuracy restore
    const blendSpeed = (speed < 10 && onGround) ? 100 : 5;

    // Smooth blend to target accuracy
    this.accuracy += (targetAccuracy - this.accuracy) * Math.min(1, dt * blendSpeed);

    // Clamp to [0, 1]
    this.accuracy = Math.max(0, Math.min(1, this.accuracy));
  }

  // Get random spread angle based on accuracy
  getSpreadAngle(weaponType, crouching) {
    // Max spread in degrees
    const maxSpread = weaponType === 'PISTOL' ? 3.0 : 5.0;

    // Spread radius based on accuracy (1.0 = no spread, 0.0 = max spread)
    let spreadRadius = (1.0 - this.accuracy) * maxSpread;

    // Crouching bonus: tighter spread
    if (crouching) {
      spreadRadius *= 0.7;
    }

    // Random angle within cone
    const randomAngle = Math.random() * Math.PI * 2;
    const randomDist = Math.random() * spreadRadius;

    return {
      x: Math.cos(randomAngle) * randomDist,
      y: Math.sin(randomAngle) * randomDist,
    };
  }

  // Reset accuracy to perfect
  reset() {
    this.accuracy = 1.0;
  }
}

// Get final shot angle combining pattern and spread
export function getFinalShotAngle(weaponType, shotIndex, accuracy, crouching) {
  // Get pattern delta for this shot
  const patternDelta = getRecoilAngle(weaponType, shotIndex);

  // Get random spread based on accuracy
  const accuracyModel = new AccuracyModel();
  accuracyModel.accuracy = accuracy;
  const spread = accuracyModel.getSpreadAngle(weaponType, crouching);

  // Combine pattern + spread
  return {
    x: patternDelta.x + spread.x,
    y: patternDelta.y + spread.y,
  };
}
