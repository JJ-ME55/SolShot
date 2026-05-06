import crypto from 'crypto';

/**
 * SolShot Server-Side Physics Engine
 *
 * Extracts EXACT formulas from client-side Weapon.js / Standard.js / Terrain.js
 * to ensure server-authoritative physics match client rendering.
 *
 * Key constants (from client):
 *   Default gravity: 300 (Weapon.js line 53)
 *   Power factor: 8 (Turret.js)
 *   Bounce factor: 0.6 (Weapon.js line 297)
 *   Terrain canvas: width=1200, height = 800 (full screen height)
 */

// === WEAPON DEFINITIONS (blast radius + damage factor for all 15 launch weapons + 5 prestige) ===
// Extracted from Standard.js defaultUpdateScore calls
// Litepaper v2.0: 15 launch + 5 prestige = 20 total
export const WEAPON_DATA = {
    // --- FREE ---
    0:  { name: 'Single Shot',    blastRadius: 46, damageFactor: 35/46,  type: 'single',         gravity: 300, bounceCount: 3 },
    // --- STANDARD ---
    25: { name: 'Dirt Ball',      blastRadius: 0,  damageFactor: 0,      type: 'terrain_create',  gravity: 300, bounceCount: 3 },
    12: { name: 'Magic Wall',     blastRadius: 0,  damageFactor: 0,      type: 'wall',            gravity: 300, bounceCount: 0 },
    // --- TACTICAL ---
    20: { name: 'Skipper',        blastRadius: 52, damageFactor: 55/52,  type: 'bouncer',         gravity: 300, bounceCount: 4 },
    2:  { name: '3 Shot',         blastRadius: 46, damageFactor: 22/46,  type: 'multi',           gravity: 300, bounceCount: 3, count: 3 },
    10: { name: 'Spider',         blastRadius: 28, damageFactor: 22/28,  type: 'spider',          gravity: 300, bounceCount: 0, count: 6 },
    5:  { name: 'Heatseeker',     blastRadius: 80, damageFactor: 50/80,  type: 'homing',          gravity: 300, bounceCount: 0 },
    // --- RARE ---
    15: { name: 'Napalm',         blastRadius: 60, damageFactor: 25/60,  type: 'area',            gravity: 300, bounceCount: 0 },
    7:  { name: 'Pile Driver',    blastRadius: 46, damageFactor: 25/46,  type: 'drill',           gravity: 300, bounceCount: 0, drillCount: 6 },
    11: { name: 'Sniper Rifle',   blastRadius: 1,  damageFactor: 100,    type: 'sniper',          gravity: 300, bounceCount: 0 },
    1:  { name: 'Big Shot',       blastRadius: 90, damageFactor: 35/90,  type: 'single',          gravity: 300, bounceCount: 3 },
    // --- EPIC ---
    17: { name: 'Ground Hog',     blastRadius: 70, damageFactor: 60/70,  type: 'tunnel',          gravity: 300, bounceCount: 0 },
    4:  { name: 'Jackhammer',     blastRadius: 36, damageFactor: 14/36,  type: 'drill',           gravity: 300, bounceCount: 0, drillCount: 5 },
    16: { name: 'Hail Storm',     blastRadius: 36, damageFactor: 12/36,  type: 'rain',            gravity: 300, bounceCount: 0, count: 10 },
    // --- LEGENDARY ---
    9:  { name: 'Crazy Ivan',     blastRadius: 36, damageFactor: 22/36,  type: 'scatter',         gravity: 300, bounceCount: 0, count: 15 },
    // --- PRESTIGE ---
    24: { name: 'Homing Missile', blastRadius: 80, damageFactor: 50/80,  type: 'homing',          gravity: 300, bounceCount: 0 },
    29: { name: 'Cruiser',        blastRadius: 80, damageFactor: 70/80,  type: 'roller',          gravity: 300, bounceCount: 0 },
    26: { name: 'Tommy Gun',      blastRadius: 16, damageFactor: 22/16,  type: 'multi',           gravity: 300, bounceCount: 3, count: 12 },
    21: { name: 'Chain Reaction', blastRadius: 46, damageFactor: 22/46,  type: 'chain',           gravity: 300, bounceCount: 0, count: 15 },
    22: { name: 'Pineapple',      blastRadius: 80, damageFactor: 40/80,  type: 'fragment',        gravity: 300, bounceCount: 3, count: 20, subBlastRadius: 20, subDamageFactor: 32/20 },
};

// Physics constants matching client
const DEFAULT_GRAVITY = 300;
const POWER_FACTOR = 8;
// Canvas dimensions — 16:9 native (1422 × 800). Was 1200 × 800 (3:2) prior
// to 2026-05-06; widened to fill phone landscape viewports edge-to-edge
// without letterbox, while preserving the 800px height so existing
// trajectory + blast tunings stay valid (peak arcs comfortably fit).
// Tank spawn positions auto-distribute across the new width via the
// `width` parameter to generateTankPositions(). Heightmap snapshot
// bandwidth grows ~18% per shot — negligible.
const TERRAIN_WIDTH = 1422;
const TERRAIN_HEIGHT = 800;  // full screen height — terrain canvas is now full height
const PHYSICS_DT = 1 / 60;  // 60fps physics step
const MAX_TRAJECTORY_STEPS = 3000; // safety cap (~50 seconds of flight)

/**
 * Generate wind value for a battle round.
 * Integer in [-60, 60]. Positive = rightward, negative = leftward.
 * Uses crypto CSPRNG for fairness in wagered matches.
 */
export function generateWind() {
    return crypto.randomInt(121) - 60;
}

/**
 * Task 2.1: Calculate trajectory for a projectile
 *
 * Mirrors Weapon.js defaultShoot:
 *   velocity = power * powerFactor (default 8)
 *   rotation = turretRotation - PI/2
 *   vx = velocity * cos(rotation)
 *   vy = velocity * sin(rotation)
 *   gravity applied each frame to vy
 *   wind applied each frame to vx (horizontal acceleration)
 *
 * Uses Euler integration matching Phaser's arcade physics step.
 *
 * @param {number} angle - Turret rotation in radians
 * @param {number} power - Tank power slider value (0-100)
 * @param {number} gravity - Gravity (default 300)
 * @param {number} startX - Turret tip X
 * @param {number} startY - Turret tip Y
 * @param {number} wind - Wind horizontal acceleration (px/s², + = right)
 * @returns {Array<{x: number, y: number, vx: number, vy: number}>} trajectory points per frame
 */
export function calculateTrajectory(angle, power, gravity = DEFAULT_GRAVITY, startX, startY, wind = 0) {
    const velocity = power * POWER_FACTOR;
    const rotation = angle - Math.PI / 2;

    let vx = velocity * Math.cos(rotation);
    let vy = velocity * Math.sin(rotation);
    let x = startX;
    let y = startY;

    const points = [{ x, y, vx, vy }];

    for (let step = 0; step < MAX_TRAJECTORY_STEPS; step++) {
        // Euler integration matching Phaser arcade physics
        vy += gravity * PHYSICS_DT;
        vx += wind * PHYSICS_DT;   // wind — horizontal acceleration
        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;

        points.push({ x, y, vx, vy });

        // Bounds check — stop if out of play area
        if (x <= 0 || x >= TERRAIN_WIDTH - 1) break;
        if (y >= TERRAIN_HEIGHT) break;
    }

    return points;
}

/**
 * Task 2.2: Calculate impact point — where trajectory meets terrain or tank
 *
 * Mirrors Weapon.js defaultUpdate collision checks:
 *   1. Out of bounds (x <= 0 or x >= terrain.width - 1)
 *   2. Below terrain floor (y >= terrain.height)
 *   3. Inside terrain (terrain[x] exists and y >= terrain[x])
 *   4. Inside tank hitbox
 *
 * @param {Array<{x: number, y: number}>} trajectory - From calculateTrajectory
 * @param {number[]} terrain - 1D heightmap (terrain[x] = ground Y at that X)
 * @param {Array<{x: number, y: number, width: number, height: number}>} tankPositions - Tank bounding boxes
 * @returns {{x: number, y: number, type: string, tankIndex?: number, frameIndex: number}}
 */
export function calculateImpact(trajectory, terrain, tankPositions) {
    // Launch grace period: skip terrain & tank collision for first N frames.
    // Projectile starts at/near the turret tip which may be at or below terrain surface.
    // Without this, the projectile collides with the shooter's own terrain/tank immediately.
    // Client-side weapons have similar near-launch ignore logic.
    const LAUNCH_GRACE = 10;

    for (let i = 1; i < trajectory.length; i++) {
        const { x, y } = trajectory[i];
        const ix = Math.floor(x);
        const iy = Math.floor(y);

        // Out of bounds — always check (even during grace period)
        if (ix <= 0 || ix >= TERRAIN_WIDTH - 1) {
            return { x, y, type: 'outOfBounds', frameIndex: i };
        }

        // Below terrain canvas floor — always check
        if (iy >= TERRAIN_HEIGHT) {
            return { x, y: TERRAIN_HEIGHT - 1, type: 'base', frameIndex: i };
        }

        // Skip if above screen
        if (iy < 0) continue;

        // Skip terrain & tank collision during launch grace period
        if (i < LAUNCH_GRACE) continue;

        // Terrain collision: projectile is at or below ground level
        if (ix >= 0 && ix < terrain.length && terrain[ix] !== undefined) {
            if (iy >= terrain[ix]) {
                const surfaceY = terrain[ix];
                return { x, y: surfaceY, type: 'terrain', frameIndex: i };
            }
        }

        // Tank collision check
        for (let t = 0; t < tankPositions.length; t++) {
            const tank = tankPositions[t];
            if (tank && isPointInTank(x, y, tank)) {
                return { x, y, type: 'tank', tankIndex: t, frameIndex: i };
            }
        }
    }

    // Projectile flew off screen without hitting anything
    const last = trajectory[trajectory.length - 1];
    return { x: last.x, y: last.y, type: 'outOfBounds', frameIndex: trajectory.length - 1 };
}

/**
 * Check if a point is inside a tank's hitbox
 * Mirrors Tank.js isPointInside — rectangular bounding box check
 */
function isPointInTank(x, y, tank) {
    const halfW = (tank.width || 40) / 2;
    const halfH = (tank.height || 30) / 2;
    return (
        x >= tank.x - halfW &&
        x <= tank.x + halfW &&
        y >= tank.y - halfH &&
        y <= tank.y + halfH
    );
}

/**
 * Task 2.3: Calculate damage from an impact
 *
 * Mirrors Weapon.js defaultUpdateScore:
 *   - Direct hit (inside tank): damage = ceil(blastRadius * factor)
 *   - Self-hit: damage = -floor(blastRadius * factor)
 *   - Splash: damage = ceil((blastRadius - distance) * factor) when distance < blastRadius
 *   - Self-splash: negative of above
 *
 * @param {{x: number, y: number}} impactPoint
 * @param {number} weaponId
 * @param {Array<{id: string, x: number, y: number}>} tankPositions - [{id, x, y}, ...]
 * @param {string} shooterId - ID of the player who fired
 * @returns {{[playerId: string]: number}} damage dealt to each player (positive = damage TO them)
 */
export function calculateDamage(impactPoint, weaponId, tankPositions, shooterId) {
    const weapon = WEAPON_DATA[weaponId];
    if (!weapon || weapon.blastRadius === 0) return {};

    // Sniper: constant 100 damage on direct tank hit, 0 on miss (1px blast)
    if (weapon.type === 'sniper') {
        const damage = {};
        for (const tank of tankPositions) {
            const directHit = isPointInTank(impactPoint.x, impactPoint.y, tank);
            if (directHit) {
                if (tank.id === shooterId) {
                    damage[tank.id] = (damage[tank.id] || 0) - 100;
                } else {
                    damage[tank.id] = (damage[tank.id] || 0) + 100;
                }
            }
        }
        return damage;
    }

    const blastRadius = weapon.blastRadius;
    const factor = weapon.damageFactor;
    const damage = {};

    for (const tank of tankPositions) {
        const dist = Math.sqrt(
            (impactPoint.x - tank.x) ** 2 + (impactPoint.y - tank.y) ** 2
        );

        // Direct hit check
        const directHit = isPointInTank(impactPoint.x, impactPoint.y, tank);

        if (directHit) {
            if (tank.id === shooterId) {
                // Self-damage
                damage[tank.id] = (damage[tank.id] || 0) - Math.floor(blastRadius * factor);
            } else {
                // Opponent damage
                damage[tank.id] = (damage[tank.id] || 0) + Math.ceil(blastRadius * factor);
            }
        } else if (dist < blastRadius) {
            // Splash damage — distance-based falloff
            const splashDamage = Math.ceil((blastRadius - dist) * factor);
            if (tank.id === shooterId) {
                damage[tank.id] = (damage[tank.id] || 0) - splashDamage;
            } else {
                damage[tank.id] = (damage[tank.id] || 0) + splashDamage;
            }
        }
    }

    return damage;
}

/**
 * Task 2.4: Deform terrain after an explosion
 *
 * Mirrors Blast.js crater creation:
 *   - Circular crater centered at impact point
 *   - Radius = weapon's blastRadius
 *   - For each x in range, raise terrain[x] if it was within blast circle
 *   - Terrain "settles down" (gravity collapse handled client-side visually)
 *
 * Server just computes new heightmap values.
 *
 * @param {number[]} terrain - Current 1D heightmap
 * @param {{x: number, y: number}} impactPoint
 * @param {number} blastRadius
 * @returns {number[]} new terrain heightmap
 */
export function deformTerrain(terrain, impactPoint, blastRadius) {
    const newTerrain = [...terrain];
    const cx = Math.floor(impactPoint.x);
    const cy = Math.floor(impactPoint.y);

    const startX = Math.max(0, cx - blastRadius);
    const endX = Math.min(terrain.length - 1, cx + blastRadius);

    for (let x = startX; x <= endX; x++) {
        // Circle equation: (x-cx)^2 + (y-cy)^2 = r^2
        // Solve for how deep the crater goes at this x
        const dx = x - cx;
        const craterDepth = Math.sqrt(Math.max(0, blastRadius * blastRadius - dx * dx));

        // The crater removes terrain between (cy - craterDepth) and (cy + craterDepth)
        const craterTop = cy - craterDepth;
        const craterBottom = cy + craterDepth;

        // If terrain surface is within the blast zone, push it down
        if (newTerrain[x] !== undefined && newTerrain[x] < craterBottom) {
            if (newTerrain[x] >= craterTop) {
                // Terrain surface is inside the blast — lower it to crater bottom
                newTerrain[x] = Math.min(Math.floor(craterBottom), TERRAIN_HEIGHT);
            }
        }
    }

    return newTerrain;
}

/**
 * Task 2.9: Generate terrain server-side
 *
 * Mirrors graphics/terrain.js makePath + getAngle exactly:
 *   - Random walk with angle constraints
 *   - Bias toward center-height
 *   - Returns path points AND converts to 1D heightmap
 *
 * @param {number} width - Terrain width (default 1200)
 * @param {number} height - Terrain height (default 800)
 * @param {number} seed - Optional seed for reproducibility
 * @returns {{path: Array<{x: number, y: number}>, heightmap: number[]}}
 */
export function generateTerrain(width = TERRAIN_WIDTH, height = TERRAIN_HEIGHT, seed = null) {
    // Use seeded random if provided, otherwise Math.random
    const random = seed !== null ? seededRandom(seed) : Math.random;

    const path = [];
    let x = -200;
    let y = height * 0.65 + height * 0.3 * (1 - random() * random());
    let prevX = x;
    let prevY = y;
    path.push({ x, y });

    while (x !== width + 200) {
        const factor = Math.floor(random() * 1); // Always 0
        const radius = Math.floor(random() * 30 + 10);
        const angle = getAngle(prevX, prevY, width, height, random);

        x = prevX + radius * Math.cos(angle);
        y = prevY + radius * Math.sin(angle);

        if (x > width + 200) x = width + 200;
        if (y > height) y = height;
        if (y < height * 0.55) y = prevY - radius * Math.sin(angle);

        if (factor === 0) {
            if (random() < 0.2) {
                x = prevX + radius;
                y = prevY;
            }
            path.push({ x, y });
        }

        prevX = x;
        prevY = y;
    }

    // Convert path to 1D heightmap by interpolation
    const heightmap = pathToHeightmap(path, width);

    return { path, heightmap };
}

/**
 * Angle generation matching client getAngle exactly
 */
function getAngle(x, y, width, height, random) {
    let angle = random() * Math.PI - Math.PI / 2;
    if (y > height * 0.72) {
        angle = (angle - Math.PI / 2 * Math.sqrt(random())) / 2;
    }
    if (y < height * 0.72) {
        angle = (angle + Math.PI / 2 * Math.sqrt(random())) / 2;
    }
    if (x < width / 2) {
        angle = (angle - Math.PI / 2 * Math.sqrt(random())) / 2;
    }
    if (x > width / 2) {
        angle = (angle + Math.PI / 2 * Math.sqrt(random())) / 2;
    }
    return angle;
}

/**
 * Convert terrain path points to a 1D heightmap array
 * Uses linear interpolation between path points
 *
 * @param {Array<{x: number, y: number}>} path
 * @param {number} width
 * @returns {number[]} heightmap where heightmap[x] = Y of terrain surface
 */
function pathToHeightmap(path, width) {
    const heightmap = new Array(width).fill(TERRAIN_HEIGHT);

    // Filter and sort path by x
    const sorted = path
        .filter(p => p.x >= 0 && p.x < width)
        .sort((a, b) => a.x - b.x);

    if (sorted.length === 0) return heightmap;

    // Add boundary points for interpolation
    if (sorted[0].x > 0) {
        sorted.unshift({ x: 0, y: sorted[0].y });
    }
    if (sorted[sorted.length - 1].x < width - 1) {
        sorted.push({ x: width - 1, y: sorted[sorted.length - 1].y });
    }

    // Linear interpolation between consecutive path points.
    // Use ceil(p1.x) for startX so t is always >= 0, preventing
    // extrapolation that overwrites correct values from previous segments
    // (bug: when two path points share the same integer x column,
    // floor(p1.x) could cause t < 0, placing heightmap above terrain).
    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const startX = Math.max(0, Math.ceil(p1.x));
        const endX = Math.min(width - 1, Math.floor(p2.x));

        for (let x = startX; x <= endX; x++) {
            const t = (p2.x - p1.x) !== 0 ? (x - p1.x) / (p2.x - p1.x) : 0;
            heightmap[x] = Math.floor(p1.y + t * (p2.y - p1.y));
        }
    }

    return heightmap;
}

/**
 * Simple seeded pseudo-random number generator (mulberry32)
 * Used to ensure both server and clients can generate identical terrain from a seed
 */
function seededRandom(seed) {
    let s = seed;
    return function () {
        s |= 0;
        s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/**
 * Generate starting tank positions on the terrain for N players.
 *
 * For N=2: preserves original left/right distribution for backward compatibility.
 *   - Player 0 spawns in left zone  (20%-35% of width)
 *   - Player 1 spawns in right zone (65%-80% of width)
 *
 * For N>2: divides the usable terrain [10%, 90%] into N equal zones and places
 *   one tank per zone, randomly within the inner 60% of each zone.
 *
 * @param {number[]} heightmap
 * @param {number} N - Number of players (default 2)
 * @param {number} width - Terrain width in pixels (default TERRAIN_WIDTH)
 * @returns {Array<{x: number, y: number}>} Array of N positions
 */
export function generateTankPositions(heightmap, N = 2, width = TERRAIN_WIDTH) {
    if (N === 2) {
        // Preserve original 2-player behavior exactly for backward compat
        const hostX = Math.floor(width * 0.2 + (crypto.randomInt(1000) / 1000) * width * 0.15);
        const playerX = Math.floor(width * 0.65 + (crypto.randomInt(1000) / 1000) * width * 0.15);
        // Tank shape is drawn in the top half of its 24px canvas; with default
        // center origin the visible bottom aligns with the sprite position.
        // Offset 0 = tank bottom sits exactly on terrain surface.
        return [
            { x: hostX, y: heightmap[hostX] },
            { x: playerX, y: heightmap[playerX] },
        ];
    }
    // N > 2: divide [10%, 90%] into N equal zones
    const usableStart = Math.floor(width * 0.1);
    const usableWidth = Math.floor(width * 0.8);
    const zoneWidth = Math.floor(usableWidth / N);
    const positions = [];
    for (let i = 0; i < N; i++) {
        const zoneStart = usableStart + i * zoneWidth;
        const innerStart = Math.floor(zoneStart + zoneWidth * 0.2);
        const innerWidth = Math.floor(zoneWidth * 0.6);
        const x = Math.min(width - 1, innerStart + Math.floor(crypto.randomInt(Math.max(1, innerWidth))));
        positions.push({ x, y: heightmap[x] });
    }
    return positions;
}

// ============================================================
// MULTI-HIT PHYSICS HELPERS
// ============================================================

/**
 * Calculate damage from a single blast at a given point.
 * Reusable helper for multi-hit weapon handlers that need to
 * accumulate damage from multiple sub-impacts.
 *
 * @param {{x: number, y: number}} point - Impact/blast center
 * @param {number} blastRadius - Blast radius for this sub-impact
 * @param {number} damageFactor - Damage factor for this sub-impact
 * @param {Array<{id: string, x: number, y: number}>} tanks
 * @param {string} shooterId
 * @returns {{[playerId: string]: number}} damage map
 */
function calculateDamageWithRadius(point, blastRadius, damageFactor, tanks, shooterId) {
    if (blastRadius <= 0) return {};
    const damage = {};
    for (const tank of tanks) {
        const dist = Math.sqrt((point.x - tank.x) ** 2 + (point.y - tank.y) ** 2);
        const directHit = isPointInTank(point.x, point.y, tank);
        if (directHit) {
            const dmg = tank.id === shooterId
                ? -Math.floor(blastRadius * damageFactor)
                : Math.ceil(blastRadius * damageFactor);
            damage[tank.id] = (damage[tank.id] || 0) + dmg;
        } else if (dist < blastRadius) {
            const splashDamage = Math.ceil((blastRadius - dist) * damageFactor);
            const dmg = tank.id === shooterId ? -splashDamage : splashDamage;
            damage[tank.id] = (damage[tank.id] || 0) + dmg;
        }
    }
    return damage;
}

/**
 * Merge sub-impact damage into a running total.
 * @param {{[id: string]: number}} total - Accumulated damage (mutated in place)
 * @param {{[id: string]: number}} sub - Damage from one sub-impact
 */
function mergeDamage(total, sub) {
    for (const [id, dmg] of Object.entries(sub)) {
        total[id] = (total[id] || 0) + dmg;
    }
}

/**
 * Trim trajectory to impact frame and round for network efficiency.
 */
function trimTrajectory(trajectory, frameIndex) {
    return trajectory.slice(0, frameIndex + 1).map(p => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10
    }));
}

/**
 * Deterministic seeded random for multi-hit weapons.
 * Uses weapon ID + impact position as seed so server and client agree.
 */
function weaponSeededRandom(weaponId, impactX, impactY) {
    const seed = (weaponId * 73856093) ^ (Math.floor(impactX) * 19349663) ^ (Math.floor(impactY) * 83492791);
    return seededRandom(Math.abs(seed));
}


// ============================================================
// TYPE-SPECIFIC SHOT PROCESSORS
// ============================================================

/**
 * Standard single-impact shot (Single Shot, Big Shot, Ground Hog, Heatseeker)
 */
function processSingleShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let damage = {};
    let newTerrain = terrain;

    if (impact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
        damage = calculateDamage(impact, weapon.weaponId, tanks, shooterId);
        newTerrain = deformTerrain(terrain, impact, weapon.blastRadius);
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain
    };
}

/**
 * Sniper — flat 100 on direct tank hit, 0 on miss, no terrain deform (1px blast)
 */
function processSniperShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let damage = {};
    let newTerrain = terrain;

    if (impact.type !== 'outOfBounds') {
        damage = calculateDamage(impact, weapon.weaponId, tanks, shooterId);
        // Small crater (8px) for visual feedback on impact
        newTerrain = deformTerrain(terrain, impact, 8);
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain
    };
}

/**
 * Drill — N sequential blasts at increasing depth below impact.
 * Pile Driver (6 blasts, 46px radius, ~20dmg each = 120 max)
 * Jackhammer (5 blasts, 36px radius, ~10dmg each = 50 max)
 */
function processDrillShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;

    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        const count = weapon.drillCount || 5;
        const spacing = weapon.blastRadius * 0.8; // vertical spacing between drill blasts

        for (let i = 0; i < count; i++) {
            const subPoint = {
                x: impact.x,
                y: impact.y + (i * spacing)
            };
            // Clamp to terrain bounds
            if (subPoint.y >= TERRAIN_HEIGHT) subPoint.y = TERRAIN_HEIGHT - 1;

            scatterPoints.push({ x: Math.round(subPoint.x), y: Math.round(subPoint.y) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, weapon.blastRadius);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Multi-shot — N projectiles at spread angles from firing position.
 * 3 Shot (3 projectiles, 46px radius)
 * Tommy Gun (12 projectiles, 16px radius)
 */
function processMultiShot(weapon, trajectory, terrain, tanks, shooterId, angle, power, startX, startY) {
    const count = weapon.count || 3;
    const damage = {};
    let newTerrain = terrain;
    let firstImpact = null;
    let firstTrajectory = null;
    const subTrajectories = [];

    // Spread angle: total spread proportional to count
    const totalSpread = count <= 3 ? 0.15 : 0.30; // radians (~8.5° or ~17°)
    const startAngle = angle - totalSpread / 2;
    const angleStep = count > 1 ? totalSpread / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
        const subAngle = startAngle + (i * angleStep);
        // Small power variation for spread effect
        const subPower = power * (0.95 + 0.1 * (i / Math.max(1, count - 1)));

        const subTraj = calculateTrajectory(subAngle, subPower, weapon.gravity, startX, startY, weapon.wind || 0);
        const subImpact = calculateImpact(subTraj, newTerrain, tanks);

        if (subImpact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
            const subDmg = calculateDamageWithRadius(subImpact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subImpact, weapon.blastRadius);
        }

        // Send ALL sub-trajectories to client for visual split
        subTrajectories.push(trimTrajectory(subTraj, subImpact.frameIndex));

        // Use the first (center) projectile as the primary trajectory for client
        if (i === Math.floor(count / 2)) {
            firstImpact = subImpact;
            firstTrajectory = subTraj;
        }
    }

    // Fallback if center wasn't set
    if (!firstImpact) {
        firstImpact = calculateImpact(trajectory, terrain, tanks);
        firstTrajectory = trajectory;
    }

    return {
        trajectory: trimTrajectory(firstTrajectory, firstImpact.frameIndex),
        impact: { x: firstImpact.x, y: firstImpact.y, type: firstImpact.type },
        damage,
        newTerrain,
        subTrajectories
    };
}

/**
 * Scatter — N random explosions around impact point.
 * Crazy Ivan (15 random blasts, 36px radius)
 */
function processScatterShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;
    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        const count = weapon.count || 15;
        const scatterRadius = 150; // how far sub-explosions spread from impact
        const rng = weaponSeededRandom(weapon.weaponId, impact.x, impact.y);

        for (let i = 0; i < count; i++) {
            const offsetX = (rng() - 0.5) * 2 * scatterRadius;
            const offsetY = (rng() - 0.5) * 2 * scatterRadius * 0.5; // less vertical spread
            const subPoint = {
                x: Math.max(0, Math.min(TERRAIN_WIDTH - 1, impact.x + offsetX)),
                y: Math.max(0, Math.min(TERRAIN_HEIGHT - 1, impact.y + offsetY))
            };

            scatterPoints.push({ x: Math.round(subPoint.x), y: Math.round(subPoint.y) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, weapon.blastRadius);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Spider — main impact triggers proximity explosion + 6 crawling sub-munitions.
 * Sub-munitions spread outward along terrain surface from impact.
 */
function processSpiderShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;
    const spiderLegs = [];

    if (impact.type !== 'outOfBounds') {
        // Main impact
        const mainDmg = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
        mergeDamage(damage, mainDmg);
        newTerrain = deformTerrain(newTerrain, impact, weapon.blastRadius);

        // Sub-munitions crawl along terrain surface
        const subCount = weapon.count || 6;
        const subSpacing = 40; // pixels apart along terrain

        for (let i = 0; i < subCount; i++) {
            // Alternate left/right from impact
            const direction = i % 2 === 0 ? 1 : -1;
            const distance = Math.ceil((i + 1) / 2) * subSpacing;
            const subX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.floor(impact.x) + direction * distance));
            const subY = newTerrain[subX] !== undefined ? newTerrain[subX] : impact.y;

            const subPoint = { x: subX, y: subY };
            spiderLegs.push({ x: Math.round(subPoint.x), y: Math.round(subPoint.y) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, weapon.blastRadius);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        spiderLegs
    };
}

/**
 * Area / Napalm — damage-over-time converted to burst equivalent.
 * 5 overlapping burns across impact zone ≈ 100 max damage.
 */
function processAreaShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;

    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        // Napalm: 5 burn ticks spread along terrain
        const burnCount = 5;
        const burnSpread = weapon.blastRadius * 0.6;

        for (let i = 0; i < burnCount; i++) {
            const offsetX = (i - Math.floor(burnCount / 2)) * (burnSpread / burnCount);
            const subX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.floor(impact.x + offsetX)));
            const subY = newTerrain[subX] !== undefined ? newTerrain[subX] : impact.y;
            const subPoint = { x: subX, y: subY };

            scatterPoints.push({ x: Math.round(subX), y: Math.round(subY) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            // Napalm melts terrain
            newTerrain = deformTerrain(newTerrain, subPoint, Math.floor(weapon.blastRadius * 0.5));
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Rain — N projectiles fall vertically over a wide area.
 * Hail Storm (10 vertical drops, 36px radius each)
 */
function processRainShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;

    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        const count = weapon.count || 10;
        const rainWidth = 200; // total spread width in pixels
        const rng = weaponSeededRandom(weapon.weaponId, impact.x, impact.y);

        for (let i = 0; i < count; i++) {
            // Distribute drops across the rain zone centered on impact
            const offsetX = (i / (count - 1) - 0.5) * rainWidth + (rng() - 0.5) * 20;
            const dropX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.floor(impact.x + offsetX)));
            const dropY = newTerrain[dropX] !== undefined ? newTerrain[dropX] : impact.y;
            const subPoint = { x: dropX, y: dropY };

            scatterPoints.push({ x: Math.round(dropX), y: Math.round(dropY) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, weapon.blastRadius);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Chain Reaction — N sequential blasts along terrain surface from impact.
 * Chain Reaction (15 blasts, 46px radius)
 */
function processChainShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;

    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        const count = weapon.count || 15;
        const chainSpacing = weapon.blastRadius * 0.7; // spacing between chain blasts

        // Determine chain direction: toward the nearest enemy tank
        let direction = 1; // default: rightward
        for (const tank of tanks) {
            if (tank.id !== shooterId) {
                direction = tank.x > impact.x ? 1 : -1;
                break;
            }
        }

        for (let i = 0; i < count; i++) {
            const subX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, Math.floor(impact.x + direction * i * chainSpacing)));
            const subY = newTerrain[subX] !== undefined ? newTerrain[subX] : impact.y;
            const subPoint = { x: subX, y: subY };

            scatterPoints.push({ x: Math.round(subX), y: Math.round(subY) });
            const subDmg = calculateDamageWithRadius(subPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, weapon.blastRadius);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Fragment / Pineapple — main blast + N radial fragment sub-munitions.
 * Pineapple: 80px main + 20 fragments with 20px sub-blasts (32dmg each)
 */
function processFragmentShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    const damage = {};
    let newTerrain = terrain;

    const scatterPoints = [];

    if (impact.type !== 'outOfBounds') {
        // Main blast
        const mainDmg = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
        mergeDamage(damage, mainDmg);
        newTerrain = deformTerrain(newTerrain, impact, weapon.blastRadius);

        // Fragment sub-munitions radiate outward
        const fragCount = weapon.count || 20;
        const subBlastR = weapon.subBlastRadius || 20;
        const subFactor = weapon.subDamageFactor || 32 / 20;
        const fragRadius = weapon.blastRadius * 1.5; // how far fragments travel from center
        const rng = weaponSeededRandom(weapon.weaponId, impact.x, impact.y);

        for (let i = 0; i < fragCount; i++) {
            const angle = (2 * Math.PI * i) / fragCount;
            const dist = fragRadius * (0.6 + 0.4 * rng()); // seeded randomness in distance
            const subX = Math.max(0, Math.min(TERRAIN_WIDTH - 1, impact.x + Math.cos(angle) * dist));
            const subY = Math.max(0, Math.min(TERRAIN_HEIGHT - 1, impact.y + Math.sin(angle) * dist));
            const subPoint = { x: subX, y: subY };

            scatterPoints.push({ x: Math.round(subX), y: Math.round(subY) });
            const subDmg = calculateDamageWithRadius(subPoint, subBlastR, subFactor, tanks, shooterId);
            mergeDamage(damage, subDmg);
            newTerrain = deformTerrain(newTerrain, subPoint, subBlastR);
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        scatterPoints
    };
}

/**
 * Wall — creates a terrain wall at impact, no damage.
 * Magic Wall
 */
function processWallShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let newTerrain = [...terrain];
    let wallPlacement = null;

    if (impact.type !== 'outOfBounds') {
        // Raise terrain in a narrow vertical wall at impact X
        // Matches original: 8px wide, 140px tall
        const wallWidth = 8;
        const wallHeight = 140;
        const cx = Math.floor(impact.x);
        const xMin = Math.max(0, cx - wallWidth / 2);
        const xMax = Math.min(TERRAIN_WIDTH - 1, cx + wallWidth / 2);

        // Save original heights for decay/revert
        const originalHeights = {};
        for (let x = xMin; x <= xMax; x++) {
            const ix = Math.floor(x);
            if (newTerrain[ix] !== undefined) {
                originalHeights[ix] = newTerrain[ix];
                newTerrain[ix] = Math.max(0, newTerrain[ix] - wallHeight);
            }
        }

        wallPlacement = { cx, xMin, xMax, originalHeights };
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage: {},  // no damage
        newTerrain,
        wallPlacement,
    };
}

/**
 * Decay expired walls — revert terrain to pre-wall heights.
 * Called after each turn to check for walls that have exceeded their lifespan.
 *
 * @param {number[]} heightmap - Current terrain heightmap (mutated in place)
 * @param {Array} walls - Room's wall tracking array
 * @param {number} currentTurn - Current turn count
 * @param {number} wallLifespan - Turns before a wall decays (default 6)
 * @returns {{ decayed: boolean, decayedWalls: Array }} Whether any walls decayed
 */
export function decayWalls(heightmap, walls, currentTurn, wallLifespan = 6) {
    if (!walls || walls.length === 0) return { decayed: false, decayedWalls: [] };

    const decayedWalls = [];
    const remaining = [];

    for (const wall of walls) {
        if (currentTurn - wall.turnPlaced >= wallLifespan) {
            // Revert terrain to original heights (or close — other explosions may have altered it)
            for (const [ix, origHeight] of Object.entries(wall.originalHeights)) {
                const i = Number(ix);
                if (heightmap[i] !== undefined) {
                    // Only revert if terrain is still raised (wall hasn't been blasted away)
                    // Original was higher (more toward ground), wall made it lower (raised surface)
                    // If current is still below original, revert toward original
                    if (heightmap[i] < origHeight) {
                        heightmap[i] = origHeight;
                    }
                }
            }
            decayedWalls.push(wall);
        } else {
            remaining.push(wall);
        }
    }

    // Replace walls array contents
    walls.length = 0;
    walls.push(...remaining);

    return { decayed: decayedWalls.length > 0, decayedWalls };
}

/**
 * Terrain Create — raises terrain at impact, no damage.
 * Dirt Ball
 */
function processTerrainCreateShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let newTerrain = [...terrain];

    if (impact.type !== 'outOfBounds') {
        // Raise terrain in a mound shape at impact
        // Matches original: 70px radius mound
        const moundRadius = 70;
        const moundHeight = 70;
        const cx = Math.floor(impact.x);

        for (let x = Math.max(0, cx - moundRadius); x <= Math.min(TERRAIN_WIDTH - 1, cx + moundRadius); x++) {
            const ix = Math.floor(x);
            const dx = ix - cx;
            // Circular mound profile
            const rise = Math.sqrt(Math.max(0, moundRadius * moundRadius - dx * dx)) / moundRadius * moundHeight;
            if (newTerrain[ix] !== undefined) {
                newTerrain[ix] = Math.max(0, Math.floor(newTerrain[ix] - rise));
            }
        }
    }

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage: {},  // no damage
        newTerrain
    };
}

/**
 * Bouncer / Skipper — projectile bounces across terrain surface.
 * Damage on each bounce + final impact.
 */
function processBouncerShot(weapon, trajectory, terrain, tanks, shooterId) {
    const damage = {};
    let newTerrain = terrain;
    let currentTerrain = terrain;
    let lastImpact = null;
    let fullTrajectory = [];
    const bounceCount = weapon.bounceCount || 4;
    const bounceFactor = 0.6; // velocity retained per bounce

    // First trajectory
    let traj = trajectory;
    let bounces = 0;

    while (bounces <= bounceCount) {
        const impact = calculateImpact(traj, currentTerrain, tanks);

        // Accumulate trajectory points
        const segPoints = traj.slice(0, impact.frameIndex + 1);
        fullTrajectory = fullTrajectory.concat(segPoints);
        lastImpact = impact;

        // Calculate damage at each bounce point
        if (impact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
            // Only deal damage on the last bounce (final impact) or on tank hit
            if (bounces === bounceCount || impact.type === 'tank') {
                const subDmg = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
                mergeDamage(damage, subDmg);
                newTerrain = deformTerrain(currentTerrain, impact, weapon.blastRadius);
                currentTerrain = newTerrain;
                break;
            }
        }

        if (impact.type === 'outOfBounds') break;

        // Bounce: reflect velocity, reduce by bounce factor
        const lastPoint = traj[impact.frameIndex];
        if (!lastPoint) break;

        // Approximate bounce by launching a new trajectory from impact with reflected velocity
        const reflectedVy = -Math.abs(lastPoint.vy) * bounceFactor;
        const reflectedVx = lastPoint.vx * bounceFactor;

        // Create new trajectory from bounce point
        // We manually simulate from the bounce point with reflected velocity
        const bounceTraj = [];
        let bx = impact.x;
        let by = impact.y - 2; // slight lift to avoid immediate re-collision
        let bvx = reflectedVx;
        let bvy = reflectedVy;

        bounceTraj.push({ x: bx, y: by, vx: bvx, vy: bvy });
        for (let s = 0; s < MAX_TRAJECTORY_STEPS; s++) {
            bvy += weapon.gravity * PHYSICS_DT;
            bvx += (weapon.wind || 0) * PHYSICS_DT;
            bx += bvx * PHYSICS_DT;
            by += bvy * PHYSICS_DT;
            bounceTraj.push({ x: bx, y: by, vx: bvx, vy: bvy });
            if (bx <= 0 || bx >= TERRAIN_WIDTH - 1) break;
            if (by >= TERRAIN_HEIGHT) break;
        }

        traj = bounceTraj;
        bounces++;
    }

    // Trim the full trajectory for transmission
    const trimmed = fullTrajectory.map(p => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10
    }));

    return {
        trajectory: trimmed,
        impact: lastImpact ? { x: lastImpact.x, y: lastImpact.y, type: lastImpact.type } : { x: 0, y: 0, type: 'outOfBounds' },
        damage,
        newTerrain
    };
}

/**
 * Homing — trajectory curves toward nearest enemy tank.
 * Used by Heatseeker and Homing Missile.
 * Server approximation: normal trajectory with extra gravity toward target.
 */
function processHomingShot(weapon, trajectory, terrain, tanks, shooterId) {
    // Find target tank (nearest enemy by Euclidean distance)
    const startPoint = trajectory[0];
    let target = null;
    let minDist = Infinity;
    for (const tank of tanks) {
        if (tank.id === shooterId) continue;
        const d = Math.hypot(tank.x - startPoint.x, tank.y - startPoint.y);
        if (d < minDist) { minDist = d; target = tank; }
    }

    if (!target) {
        // No target — fall back to single shot behavior
        return processSingleShot(weapon, trajectory, terrain, tanks, shooterId);
    }

    // Recalculate trajectory with rotation-based homing
    // Matches original client: tracks within 200px, smoothly rotates toward target
    // startPoint already declared above for nearest-enemy distance calculation
    const homingTraj = [{ x: startPoint.x, y: startPoint.y, vx: startPoint.vx, vy: startPoint.vy }];

    let x = startPoint.x;
    let y = startPoint.y;
    let vx = startPoint.vx;
    let vy = startPoint.vy;
    const HOMING_RANGE = 200;  // Only track within 200px of target
    const TURN_RATE = 0.1;     // Matches original: angleDiff / 10

    for (let step = 0; step < MAX_TRAJECTORY_STEPS; step++) {
        // Normal gravity + wind
        vy += weapon.gravity * PHYSICS_DT;
        vx += (weapon.wind || 0) * PHYSICS_DT;

        // Homing: rotation-based tracking (matches original client weapon)
        // Only activates after apex (vy > 0 = descending) and within range
        const dx = target.x - x;
        const dy = target.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < HOMING_RANGE && vy > 0) {
            const targetAngle = Math.atan2(dy, dx);
            const currentAngle = Math.atan2(vy, vx);
            let angleDiff = targetAngle - currentAngle;
            // Wrap to [-PI, PI]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

            const newAngle = currentAngle + angleDiff * TURN_RATE;
            const speed = Math.sqrt(vx * vx + vy * vy);
            vx = Math.cos(newAngle) * speed;
            vy = Math.sin(newAngle) * speed;
        }

        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;
        homingTraj.push({ x, y, vx, vy });

        if (x <= 0 || x >= TERRAIN_WIDTH - 1) break;
        if (y >= TERRAIN_HEIGHT) break;
    }

    // Use the homing trajectory for impact
    const impact = calculateImpact(homingTraj, terrain, tanks);
    let damage = {};
    let newTerrain = terrain;

    if (impact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
        damage = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
        newTerrain = deformTerrain(terrain, impact, weapon.blastRadius);
    }

    return {
        trajectory: trimTrajectory(homingTraj, impact.frameIndex),
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain
    };
}

/**
 * Roller / Cruiser — projectile follows terrain surface after landing.
 * Standard trajectory until terrain contact, then rolls along terrain toward enemy.
 */
function processRollerShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let damage = {};
    let newTerrain = terrain;

    if (impact.type === 'outOfBounds') {
        return {
            trajectory: trimTrajectory(trajectory, impact.frameIndex),
            impact: { x: impact.x, y: impact.y, type: impact.type },
            damage: {},
            newTerrain: terrain
        };
    }

    if (impact.type === 'tank') {
        // Direct tank hit — process as single impact
        damage = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
        newTerrain = deformTerrain(terrain, impact, weapon.blastRadius);
        return {
            trajectory: trimTrajectory(trajectory, impact.frameIndex),
            impact: { x: impact.x, y: impact.y, type: impact.type },
            damage,
            newTerrain
        };
    }

    // Terrain contact — roll along surface toward nearest enemy
    let rollX = Math.floor(impact.x);
    let direction = 0;
    for (const tank of tanks) {
        if (tank.id !== shooterId) {
            direction = tank.x > rollX ? 1 : -1;
            break;
        }
    }
    if (direction === 0) direction = 1;

    const rollDistance = 200; // max pixels to roll
    let finalX = rollX;
    let rolledIntoTank = false;

    // Roll along terrain
    for (let d = 0; d < rollDistance; d++) {
        const nextX = rollX + direction;
        if (nextX < 0 || nextX >= TERRAIN_WIDTH) break;
        rollX = nextX;

        // Check if rolled into a tank
        const terrainY = terrain[rollX] !== undefined ? terrain[rollX] : impact.y;
        for (const tank of tanks) {
            if (isPointInTank(rollX, terrainY - 5, tank)) {
                finalX = rollX;
                rolledIntoTank = true;
                break;
            }
        }
        if (rolledIntoTank) break;
    }

    finalX = rolledIntoTank ? finalX : rollX;
    const finalY = terrain[finalX] !== undefined ? terrain[finalX] : impact.y;
    const finalPoint = { x: finalX, y: finalY };

    damage = calculateDamageWithRadius(finalPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
    newTerrain = deformTerrain(terrain, finalPoint, weapon.blastRadius);

    // Extend trajectory to show the roll
    const impactTraj = trimTrajectory(trajectory, impact.frameIndex);
    // Add roll segment points
    const rollPoints = [];
    const startRollX = Math.floor(impact.x);
    const step = direction;
    for (let rx = startRollX; rx !== finalX + step; rx += step) {
        if (rx < 0 || rx >= TERRAIN_WIDTH) break;
        const ry = terrain[rx] !== undefined ? terrain[rx] - 5 : impact.y;
        rollPoints.push({ x: rx, y: ry });
    }

    return {
        trajectory: impactTraj.concat(rollPoints.map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))),
        impact: { x: finalPoint.x, y: finalPoint.y, type: rolledIntoTank ? 'tank' : 'terrain' },
        damage,
        newTerrain
    };
}

/**
 * Tunnel / Ground Hog — projectile tunnels through terrain, emerges on other side, detonates.
 * Standard trajectory until terrain hit, then tunnels forward underground, pops out, explodes.
 */
function processTunnelShot(weapon, trajectory, terrain, tanks, shooterId) {
    const impact = calculateImpact(trajectory, terrain, tanks);
    let damage = {};
    let newTerrain = terrain;

    if (impact.type === 'outOfBounds') {
        return {
            trajectory: trimTrajectory(trajectory, impact.frameIndex),
            impact: { x: impact.x, y: impact.y, type: impact.type },
            damage: {},
            newTerrain: terrain
        };
    }

    if (impact.type === 'tank') {
        // Direct tank hit — explode immediately
        damage = calculateDamageWithRadius(impact, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
        newTerrain = deformTerrain(terrain, impact, weapon.blastRadius);
        return {
            trajectory: trimTrajectory(trajectory, impact.frameIndex),
            impact: { x: impact.x, y: impact.y, type: impact.type },
            damage,
            newTerrain
        };
    }

    // Tunnel through terrain
    // Determine tunnel direction from velocity at impact
    const impactPoint = trajectory[impact.frameIndex];
    const tunnelDir = impactPoint && impactPoint.vx >= 0 ? 1 : -1;
    const tunnelSpeed = 3; // pixels per step underground
    const maxTunnel = 300;

    let tx = Math.floor(impact.x);
    let tunnelExitX = tx;
    let foundExit = false;

    // Tunnel underground: move horizontally until we find open air (terrain surface above us)
    for (let d = 0; d < maxTunnel; d++) {
        tx += tunnelDir * tunnelSpeed;
        if (tx < 0 || tx >= TERRAIN_WIDTH) break;

        const terrainY = terrain[tx];
        if (terrainY === undefined) continue;

        // Check if we're past the terrain (emerged on other side of a hill)
        // We're underground if our Y is below terrain surface
        const tunnelY = impact.y;
        if (tunnelY < terrainY) {
            // We've emerged — terrain surface is below us now
            tunnelExitX = tx;
            foundExit = true;
            break;
        }
    }

    // Emerge and explode
    const exitX = foundExit ? tunnelExitX : tx;
    const exitY = terrain[Math.max(0, Math.min(TERRAIN_WIDTH - 1, exitX))] || impact.y;
    const exitPoint = { x: exitX, y: exitY };

    damage = calculateDamageWithRadius(exitPoint, weapon.blastRadius, weapon.damageFactor, tanks, shooterId);
    newTerrain = deformTerrain(terrain, exitPoint, weapon.blastRadius);

    return {
        trajectory: trimTrajectory(trajectory, impact.frameIndex),
        impact: { x: exitPoint.x, y: exitPoint.y, type: 'terrain' },
        tunnelEntry: { x: Math.round(impact.x), y: Math.round(impact.y) },
        tunnelExit: { x: Math.round(exitPoint.x), y: Math.round(exitPoint.y) },
        damage,
        newTerrain
    };
}


// ============================================================
// MAIN ENTRY POINT — TYPE-BASED DISPATCH
// ============================================================

/**
 * Process a complete shot: trajectory → type-based multi-hit physics → damage → terrain update
 * This is the main function called by the socket handler on 'fire' events.
 *
 * Returns the same contract as before:
 *   { trajectory, impact, damage, newTerrain, weaponId }
 * Multi-hit weapons accumulate damage from all sub-impacts into a single damage map.
 *
 * @param {object} params
 * @param {number} params.angle - Turret angle
 * @param {number} params.power - Power (0-100)
 * @param {number} params.weaponId - Weapon ID
 * @param {number} params.startX - Turret tip X
 * @param {number} params.startY - Turret tip Y
 * @param {string} params.shooterId - Player ID who fired
 * @param {number[]} params.terrain - Current heightmap
 * @param {Array<{id: string, x: number, y: number, width?: number, height?: number}>} params.tanks
 * @returns {{trajectory: Array, impact: object, damage: object, newTerrain: number[], weaponId: number}}
 */
export function processShot({ angle, power, weaponId, startX, startY, shooterId, terrain, tanks, wind = 0 }) {
    const weapon = WEAPON_DATA[weaponId];
    if (!weapon) {
        return { trajectory: [], impact: null, damage: {}, newTerrain: terrain, weaponId };
    }

    // Attach weaponId + wind to weapon data for helpers that need it
    const w = { ...weapon, weaponId, wind };

    // Calculate primary trajectory (used by most weapon types)
    const trajectory = calculateTrajectory(angle, power, w.gravity, startX, startY, wind);

    // Type-based dispatch
    let result;
    switch (w.type) {
        case 'sniper':
            result = processSniperShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'drill':
            result = processDrillShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'multi':
            result = processMultiShot(w, trajectory, terrain, tanks, shooterId, angle, power, startX, startY);
            break;

        case 'scatter':
            result = processScatterShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'spider':
            result = processSpiderShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'area':
            result = processAreaShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'rain':
            result = processRainShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'chain':
            result = processChainShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'fragment':
            result = processFragmentShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'wall':
            result = processWallShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'terrain_create':
            result = processTerrainCreateShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'bouncer':
            result = processBouncerShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'homing':
            result = processHomingShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'roller':
            result = processRollerShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'tunnel':
            result = processTunnelShot(w, trajectory, terrain, tanks, shooterId);
            break;

        case 'single':
        default:
            result = processSingleShot(w, trajectory, terrain, tanks, shooterId);
            break;
    }

    return {
        ...result,
        weaponId
    };
}
