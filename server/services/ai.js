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
    lastSelfX: null,
    lastSelfY: null,
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
 * ANGLE CONVENTION (matching client slider):
 *   0° = flat LEFT, 90° = straight UP, 180° = flat RIGHT
 *   Converted to radians via: (deg * PI/180) - PI/2
 *
 * POWER: physics-based. Range ≈ v²·sin(2θ)/g where v = power·8, g = 300.
 *   Solving: power = sqrt(range · g / sin(2θ)) / 8
 *
 * @param {string} roomId
 * @param {{ x: number, y: number }} aiPos
 * @param {{ x: number, y: number }} targetPos
 * @param {number} wind - Wind value (positive = rightward)
 * @param {number} weaponId
 * @returns {{ angle: number, power: number }}
 */
export function calculateAim(roomId, aiPos, targetPos, wind, weaponId, terrain) {
  const cal = calibration[roomId];
  if (!cal) {
    initAI(roomId);
    return calculateAim(roomId, aiPos, targetPos, wind, weaponId, terrain);
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

  // --- Recalibration: if SELF moved significantly (took a hit, fell into a crater),
  //     the previous shot's calibration is no longer valid. Reset more aggressively. ---
  if (cal.lastSelfX !== null && cal.lastSelfY !== null) {
    const selfMovedX = Math.abs(aiPos.x - cal.lastSelfX);
    const selfMovedY = Math.abs(aiPos.y - cal.lastSelfY);
    if (selfMovedX > 20 || selfMovedY > 15) {
      // Bot was knocked around — need to re-aim from fresh.
      cal.errorFactor = Math.min(1.0, cal.errorFactor + 0.4 + Math.random() * 0.2);
      cal.shotCount = Math.max(0, cal.shotCount - 3);
    }
  }
  cal.lastSelfX = aiPos.x;
  cal.lastSelfY = aiPos.y;

  // --- Calculate "perfect" aim ---
  // Slider convention: 0° = flat LEFT, 90° = UP, 180° = flat RIGHT
  // Coordinate system: lower Y = higher on screen (target above bot → dy < 0)
  const dx = targetPos.x - aiPos.x;
  const dy = targetPos.y - aiPos.y;
  const horizontalDist = Math.abs(dx);

  // Loft angle from horizontal: 30-50° depending on distance
  // Closer targets need steeper arc, farther need flatter
  let loftDeg = Math.max(30, Math.min(50, 45 - horizontalDist * 0.01));

  // --- Terrain peak clearance ---
  // Check if there's terrain higher than aiPos on the path to target.
  // If so, the loft must be steep enough to clear it — bump up loft proportionally.
  if (terrain && terrain.length > 0) {
    const peakHeight = findPeakBetween(aiPos, targetPos, terrain);
    if (peakHeight !== null) {
      // peak above bot's position by this much (positive value = peak is higher)
      const peakRise = aiPos.y - peakHeight;
      if (peakRise > 30) {
        // Need to clear the peak. Steeper loft (closer to 60-65°)
        const extraLoft = Math.min(20, peakRise / 8);
        loftDeg = Math.min(65, loftDeg + extraLoft);
      }
    }
  }

  // Convert loft to slider degrees:
  // Shooting LEFT (dx < 0): slider angle = 90 - loft (toward 0° = flat left)
  // Shooting RIGHT (dx > 0): slider angle = 90 + loft (toward 180° = flat right)
  let perfectAngle;
  if (dx < 0) {
    perfectAngle = 90 - loftDeg; // e.g. 90-40 = 50° (up-left)
  } else {
    perfectAngle = 90 + loftDeg; // e.g. 90+40 = 130° (up-right)
  }

  // Power: physics-based using projectile range formula
  // range = v²·sin(2θ)/g, v = power·8, g = 300
  // power = sqrt(range · g / sin(2·loftRad)) / 8
  const GRAVITY = 300;
  const POWER_FACTOR = 8;
  const loftRad = loftDeg * Math.PI / 180;
  const sinFactor = Math.sin(2 * loftRad);
  // Use horizontal distance as range, add ~10% to overshoot slightly (gravity eats range)
  let effectiveRange = horizontalDist * 1.1;

  // Vertical compensation: if target is higher (dy < 0 in screen coords),
  // we need MORE range to land short of overshooting, OR more power to climb.
  // Simple heuristic: add range proportional to height differential.
  // dy < 0 = target above us → fire farther (needs more power to gain altitude)
  // dy > 0 = target below us → fire shorter (gravity helps)
  if (dy < 0) {
    effectiveRange += Math.abs(dy) * 1.5; // climbing — pump power
  } else if (dy > 30) {
    effectiveRange -= Math.min(horizontalDist * 0.2, dy * 0.6); // shooting downhill
  }

  let perfectPower = Math.sqrt(Math.max(50, effectiveRange) * GRAVITY / Math.max(0.1, sinFactor)) / POWER_FACTOR;
  perfectPower = Math.max(15, Math.min(95, perfectPower));

  // --- Wind compensation (~60%) ---
  // Wind pushes projectile horizontally; compensate by adjusting power
  const windComp = wind * 0.6;
  // Headwind (opposing shot direction) needs more power, tailwind needs less
  if (dx > 0) {
    perfectPower -= windComp * 0.1; // shooting right: rightward wind = tailwind
  } else {
    perfectPower += windComp * 0.1; // shooting left: rightward wind = headwind
  }
  perfectPower = Math.max(15, Math.min(95, perfectPower));

  // --- Special weapon overrides ---

  // Homing weapons: minimal error, they track anyway
  if (wep.type === 'homing') {
    cal.shotCount++;
    return {
      angle: degToServerAngle(perfectAngle + (Math.random() - 0.5) * 10),
      power: clampPower(perfectPower + (Math.random() - 0.5) * 10),
    };
  }

  // Magic Wall: place between self and opponent (~20-35% of the way)
  if (wep.type === 'wall') {
    const wallDist = horizontalDist * (0.20 + Math.random() * 0.15);
    const wallLoft = 50; // steep arc for short distance
    const wallAngle = dx < 0 ? 90 - wallLoft : 90 + wallLoft;
    const wallPower = Math.sqrt(wallDist * GRAVITY / Math.sin(2 * wallLoft * Math.PI / 180)) / POWER_FACTOR;
    cal.shotCount++;
    return {
      angle: degToServerAngle(wallAngle),
      power: clampPower(Math.max(15, Math.min(60, wallPower))),
    };
  }

  // Dirt Ball: aim at opponent with small error
  if (wep.type === 'terrain_create') {
    cal.shotCount++;
    return {
      angle: degToServerAngle(perfectAngle + (Math.random() - 0.5) * 8),
      power: clampPower(perfectPower + (Math.random() - 0.5) * 6),
    };
  }

  // --- Standard probabilistic aiming ---

  // Roll shot luck: determines how accurate THIS particular shot is
  const shotLuck = Math.random();
  const effectiveError = cal.errorFactor * (0.3 + shotLuck * 0.7);

  // Apply random error (in slider degrees and power units)
  const angleError = (Math.random() - 0.5) * 2 * 20 * effectiveError;
  const powerError = (Math.random() - 0.5) * 2 * (perfectPower * 0.25) * effectiveError;

  const finalAngle = perfectAngle + angleError;
  const finalPower = perfectPower + powerError;

  // Improve calibration
  cal.shotCount++;
  cal.errorFactor -= (0.15 + Math.random() * 0.1);
  cal.errorFactor = Math.max(0.15, cal.errorFactor);

  return {
    angle: degToServerAngle(finalAngle),
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
 * Find the highest peak in the terrain between two x-positions.
 * Returns the surface Y of the highest peak (smallest Y value), or null if no terrain.
 * Skips the immediate vicinity of `from` and `to` so the bot's own footing
 * doesn't trigger spurious peak-clearance.
 *
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @param {number[]} terrain - Terrain height array (index = x, value = surface y)
 * @returns {number|null} Peak Y (lowest value = highest on screen)
 */
function findPeakBetween(from, to, terrain) {
  if (!terrain || terrain.length === 0) return null;
  const startX = Math.max(0, Math.min(from.x, to.x));
  const endX = Math.min(terrain.length - 1, Math.max(from.x, to.x));
  if (endX - startX < 40) return null;
  // Skip 30px around each endpoint so the bot's own ledge doesn't count.
  const sampleStart = Math.floor(startX + 30);
  const sampleEnd = Math.ceil(endX - 30);
  if (sampleEnd <= sampleStart) return null;
  let peak = Infinity; // smaller Y = higher peak
  for (let x = sampleStart; x <= sampleEnd; x += 4) {
    const y = terrain[x];
    if (typeof y === 'number' && y < peak) peak = y;
  }
  return peak === Infinity ? null : peak;
}

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
 * Convert slider degrees to the radian value processShot expects.
 *
 * Slider convention: 0° = flat LEFT, 90° = straight UP, 180° = flat RIGHT
 * Server convention: angle passed to processShot = turret.rotation from client
 *   = (sliderDeg * PI / 180) - PI / 2
 *
 * Verification:
 *   0° (LEFT):  (0 · π/180) - π/2 = -π/2  → rotation=-π  → vx<0 ✓
 *   90° (UP):   (π/2) - π/2 = 0            → rotation=-π/2 → vy<0 ✓
 *   180° (RIGHT): (π) - π/2 = π/2          → rotation=0    → vx>0 ✓
 *
 * @param {number} sliderDeg - Angle in slider degrees (0=left, 90=up, 180=right)
 * @returns {number} Angle in radians for processShot
 */
function degToServerAngle(sliderDeg) {
  const clamped = Math.max(0, Math.min(180, sliderDeg));
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
