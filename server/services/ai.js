/**
 * SolShot Shot Bot AI Service
 *
 * Server-side AI logic for single-player practice mode.
 * Uses probabilistic aiming with calibration — each shot has random luck,
 * so the bot isn't a fixed difficulty ramp. It gets better over time but
 * can still whiff or land a lucky hit early.
 */

import { WEAPON_DATA } from './physics.js';

// --- Module-level calibration state keyed by roomId ---
const calibration = {};

// --- Weapon prices (matching client data) ---
const WEAPON_PRICES = {
  25: 150,   // Dirt Ball
  12: 150,   // Magic Wall
  20: 200,   // Skipper
  2:  200,   // 3 Shot
  10: 200,   // Spider
  5:  350,   // Heatseeker
  15: 400,   // Napalm
  7:  400,   // Pile Driver
  11: 500,   // Sniper Rifle
  1:  600,   // Big Shot
  17: 600,   // Ground Hog
  4:  700,   // Jackhammer
  16: 700,   // Hail Storm
  9:  2500,  // Crazy Ivan
};

// Weapon types that deal direct damage (aim at opponent)
const DIRECT_DAMAGE_TYPES = new Set([
  'single', 'multi', 'scatter', 'fragment', 'chain',
  'area', 'rain', 'drill', 'sniper', 'bouncer'
]);

// ============================================================
// Public API
// ============================================================

/**
 * Initialize calibration state for a new AI match.
 * @param {string} roomId
 */
export function initAI(roomId) {
  calibration[roomId] = {
    errorFactor: 1.0,
    lastTargetX: null,
    lastTargetY: null,
    shotCount: 0,
  };
}

/**
 * Clean up calibration state when the match ends.
 * @param {string} roomId
 */
export function cleanupAI(roomId) {
  delete calibration[roomId];
}

/**
 * Pick a weapon from the AI's inventory based on situation awareness.
 *
 * @param {number[]} inventory - Array of weapon IDs the AI owns
 * @param {{ x: number, y: number }} aiPos - AI tank position
 * @param {{ x: number, y: number }} targetPos - Opponent tank position
 * @param {number[]} terrain - Terrain height array (index = x, value = surface y)
 * @returns {number} Weapon ID to use
 */
export function pickWeapon(inventory, aiPos, targetPos, terrain) {
  const dx = targetPos.x - aiPos.x;
  const dy = targetPos.y - aiPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const aiHigher = aiPos.y < targetPos.y; // lower y = higher on screen
  const hasLOS = checkLineOfSight(aiPos, targetPos, terrain);

  // Build a list of candidate weapons with context
  const candidates = [];

  for (const id of inventory) {
    const wep = WEAPON_DATA[id];
    if (!wep) continue;

    // Homing — always a good pick, it tracks
    if (wep.type === 'homing') {
      candidates.push({ id, weight: 1.0 });
      continue;
    }

    // Magic Wall — 15% chance to use defensively
    if (wep.type === 'wall') {
      if (Math.random() < 0.15) {
        candidates.push({ id, weight: 1.0 });
      }
      continue;
    }

    // Dirt Ball — 15% chance to bury opponent
    if (wep.type === 'terrain_create') {
      if (Math.random() < 0.15) {
        candidates.push({ id, weight: 1.0 });
      }
      continue;
    }

    // Roller/Tunnel — prefer when on higher ground or far away
    if (wep.type === 'roller' || wep.type === 'tunnel') {
      if ((aiHigher || dist > 400) && Math.random() < 0.40) {
        candidates.push({ id, weight: 1.0 });
      }
      continue;
    }

    // Direct damage weapons — default aim at opponent
    if (DIRECT_DAMAGE_TYPES.has(wep.type)) {
      candidates.push({ id, weight: 1.0 });
      continue;
    }

    // Spider or any other type — treat as direct damage fallback
    candidates.push({ id, weight: 0.5 });
  }

  // If we have candidates, pick one at random
  if (candidates.length > 0) {
    const idx = Math.floor(Math.random() * candidates.length);
    return candidates[idx].id;
  }

  // Last resort: Single Shot (id 0) is always available
  return 0;
}

/**
 * Calculate aim (angle + power) for the AI's current shot.
 * Uses probabilistic error with calibration — NOT a fixed ramp.
 *
 * @param {string} roomId
 * @param {{ x: number, y: number }} aiPos
 * @param {{ x: number, y: number }} targetPos
 * @param {number} wind - Wind value (positive = rightward)
 * @param {number} weaponId
 * @returns {{ angle: number, power: number }}
 */
export function calculateAim(roomId, aiPos, targetPos, wind, weaponId) {
  const cal = calibration[roomId];
  if (!cal) {
    // No calibration state — init on the fly
    initAI(roomId);
    return calculateAim(roomId, aiPos, targetPos, wind, weaponId);
  }

  const wep = WEAPON_DATA[weaponId] || WEAPON_DATA[0];

  // --- Recalibration: if target moved significantly, reset some progress ---
  if (cal.lastTargetX !== null && cal.lastTargetY !== null) {
    const movedX = Math.abs(targetPos.x - cal.lastTargetX);
    const movedY = Math.abs(targetPos.y - cal.lastTargetY);
    if (movedX > 30 || movedY > 20) {
      cal.errorFactor = Math.min(1.0, cal.errorFactor + 0.3 + Math.random() * 0.2);
      cal.shotCount = Math.max(0, cal.shotCount - 2);
    }
  }
  cal.lastTargetX = targetPos.x;
  cal.lastTargetY = targetPos.y;

  // --- Calculate "perfect" aim ---
  const dx = targetPos.x - aiPos.x;
  const dy = targetPos.y - aiPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Base angle: atan2 gives direction, convert to game angle (0-180)
  // In game coords: 0° = right, 90° = straight up, 180° = left
  // We want a lofted arc, so aim ~55-70° above horizontal
  const horizontalAngle = Math.atan2(-dy, Math.abs(dx)) * (180 / Math.PI);
  // Loft: closer targets need higher arc, farther need flatter
  const loft = Math.max(45, Math.min(75, 65 - dist * 0.02));
  let perfectAngle = loft;

  // Flip for left-facing shots (target is to the left)
  if (dx < 0) {
    perfectAngle = 180 - perfectAngle;
  }

  // Power: scale with distance. Power range is 0-100.
  // At ~600px distance, power should be ~80-90
  let perfectPower = Math.min(100, Math.max(20, dist * 0.14 + 10));

  // --- Wind compensation (~60%) ---
  // Wind pushes projectile horizontally; compensate by adjusting power and angle
  // Positive wind = rightward push
  const windCompensation = 0.6;
  const windEffect = wind * windCompensation;

  // If shooting right (dx > 0): headwind (wind < 0) needs more power, tailwind less
  // If shooting left (dx < 0): opposite
  if (dx > 0) {
    perfectPower -= windEffect * 0.15;
  } else {
    perfectPower += windEffect * 0.15;
  }
  perfectPower = Math.min(100, Math.max(10, perfectPower));

  // --- Special weapon overrides ---

  // Homing weapons: minimal error, they track anyway
  if (wep.type === 'homing') {
    const angleErr = (Math.random() - 0.5) * 10;  // ±5°
    const powerErr = (Math.random() - 0.5) * 10;  // ±5
    cal.shotCount++;
    return {
      angle: clampAngleToRadians(perfectAngle + angleErr),
      power: clampPower(perfectPower + powerErr),
    };
  }

  // Magic Wall: aim to place between self and opponent (~20-35% of the way from AI)
  if (wep.type === 'wall') {
    const wallFraction = 0.20 + Math.random() * 0.15; // 20-35%
    const wallX = aiPos.x + dx * wallFraction;
    const wallDx = wallX - aiPos.x;
    const wallDist = Math.abs(wallDx);
    let wallAngle = Math.max(50, Math.min(80, 70 - wallDist * 0.02));
    if (wallDx < 0) wallAngle = 180 - wallAngle;
    const wallPower = Math.min(100, Math.max(15, wallDist * 0.14 + 5));
    cal.shotCount++;
    return {
      angle: clampAngleToRadians(wallAngle),
      power: clampPower(wallPower),
    };
  }

  // Dirt Ball (terrain_create): aim at opponent with small error
  if (wep.type === 'terrain_create') {
    const angleErr = (Math.random() - 0.5) * 8;  // ±4°
    const powerErr = (Math.random() - 0.5) * 8;  // ±4
    cal.shotCount++;
    return {
      angle: clampAngleToRadians(perfectAngle + angleErr),
      power: clampPower(perfectPower + powerErr),
    };
  }

  // --- Standard probabilistic aiming ---

  // Roll shot luck (0-1): determines how accurate THIS particular shot is
  const shotLuck = Math.random();
  // Effective error: even with high errorFactor, 30% of the time the shot is decent
  const effectiveError = cal.errorFactor * (0.3 + shotLuck * 0.7);

  // Apply random error scaled by effective error
  // Base angle error: ±20°, base power error: ±25%
  const angleError = (Math.random() - 0.5) * 2 * 20 * effectiveError;
  const powerError = (Math.random() - 0.5) * 2 * (perfectPower * 0.25) * effectiveError;

  const finalAngle = perfectAngle + angleError;
  const finalPower = perfectPower + powerError;

  // --- Improve calibration after each shot ---
  cal.shotCount++;
  cal.errorFactor -= (0.15 + Math.random() * 0.1);
  cal.errorFactor = Math.max(0.15, cal.errorFactor); // never perfect

  return {
    angle: clampAngleToRadians(finalAngle),
    power: clampPower(finalPower),
  };
}

/**
 * Auto-buy a random weapon loadout for Shot Bot.
 *
 * @param {number} goldBudget - How much gold the AI has to spend
 * @returns {number[]} Array of weapon IDs purchased
 */
export function autoBuyWeapons(goldBudget) {
  // Always start with Single Shot (free)
  const loadout = [0];
  let remaining = goldBudget;

  // Shuffle available weapons
  const available = shuffle(Object.keys(WEAPON_PRICES).map(Number));

  for (const weaponId of available) {
    const price = WEAPON_PRICES[weaponId];
    if (remaining < 150) break; // stop when can't afford cheapest
    if (price > remaining) continue;

    // Buy it
    loadout.push(weaponId);
    remaining -= price;

    // 30% chance to buy a duplicate
    if (Math.random() < 0.30 && price <= remaining) {
      loadout.push(weaponId);
      remaining -= price;
    }
  }

  return loadout;
}

// ============================================================
// Private helpers
// ============================================================

/**
 * Rough line-of-sight check between two positions.
 * Samples terrain every 20px horizontally; returns false if terrain blocks.
 *
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {number[]} terrain - Terrain height array (index = x, value = surface y)
 * @returns {boolean} True if clear LOS
 */
function checkLineOfSight(from, to, terrain) {
  if (!terrain || terrain.length === 0) return true;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.floor(dist / 20));

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sampleX = Math.round(from.x + dx * t);
    const sampleY = from.y + dy * t; // interpolated y along the line

    // Bounds check
    if (sampleX < 0 || sampleX >= terrain.length) continue;

    // Terrain surface y at this x (lower y = higher on screen)
    const surfaceY = terrain[sampleX];
    // If the line is below the terrain surface, LOS is blocked
    if (sampleY > surfaceY) {
      return false;
    }
  }

  return true;
}

/**
 * Clamp angle to valid game range [0, 180] degrees, then convert to radians.
 * The server physics expects turret rotation in radians:
 *   radians = (degrees * PI / 180) - PI / 2
 * This matches the client's handleAngleFromReact conversion.
 * @param {number} angleDeg - Angle in degrees (0=right, 90=up, 180=left)
 * @returns {number} Angle in radians for processShot
 */
function clampAngleToRadians(angleDeg) {
  const clamped = Math.max(0, Math.min(180, angleDeg));
  return (clamped * Math.PI / 180) - Math.PI / 2;
}

/**
 * Clamp power to valid range [1, 100].
 * @param {number} power
 * @returns {number}
 */
function clampPower(power) {
  return Math.max(1, Math.min(100, Math.round(power)));
}

/**
 * Fisher-Yates shuffle (returns new array).
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
