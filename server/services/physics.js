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
 *   Terrain canvas: width=1200, height = screenHeight * 2/3
 */

// === WEAPON DEFINITIONS (blast radius + damage factor for all 13 launch weapons) ===
// Extracted from Standard.js defaultUpdateScore calls
export const WEAPON_DATA = {
    0:  { name: 'Single Shot',  blastRadius: 46, damageFactor: 60/46,  type: 'single',  gravity: 300, bounceCount: 3 },
    1:  { name: 'Big Shot',     blastRadius: 90, damageFactor: 30/90,  type: 'single',  gravity: 300, bounceCount: 3 },
    2:  { name: '3 Shot',       blastRadius: 46, damageFactor: 20/46,  type: 'multi',   gravity: 300, bounceCount: 3, count: 3 },
    3:  { name: '5 Shot',       blastRadius: 46, damageFactor: 20/46,  type: 'multi',   gravity: 300, bounceCount: 3, count: 5 },
    4:  { name: 'Jackhammer',   blastRadius: 36, damageFactor: 10/36,  type: 'drill',   gravity: 300, bounceCount: 0, drillCount: 5 },
    5:  { name: 'Heatseeker',   blastRadius: 80, damageFactor: 40/80,  type: 'homing',  gravity: 300, bounceCount: 0 },
    7:  { name: 'Pile Driver',  blastRadius: 70, damageFactor: 50/70,  type: 'single',  gravity: 300, bounceCount: 0 },
    9:  { name: 'Crazy Ivan',   blastRadius: 36, damageFactor: 20/36,  type: 'scatter', gravity: 300, bounceCount: 0, count: 15 },
    10: { name: 'Spider',       blastRadius: 28, damageFactor: 20/28,  type: 'spider',  gravity: 300, bounceCount: 0, count: 6 },
    11: { name: 'Sniper Rifle', blastRadius: 40, damageFactor: 40/40,  type: 'single',  gravity: 300, bounceCount: 0 },
    12: { name: 'Magic Wall',   blastRadius: 0,  damageFactor: 0,      type: 'wall',    gravity: 300, bounceCount: 0 },
    15: { name: 'Napalm',       blastRadius: 60, damageFactor: 20/60,  type: 'area',    gravity: 300, bounceCount: 0 },
    16: { name: 'Hail Storm',   blastRadius: 36, damageFactor: 10/36,  type: 'rain',    gravity: 300, bounceCount: 0, count: 10 },
};

// Physics constants matching client
const DEFAULT_GRAVITY = 300;
const POWER_FACTOR = 8;
const TERRAIN_WIDTH = 1200;
const TERRAIN_HEIGHT = 534;  // approx 800 * 2/3
const PHYSICS_DT = 1 / 60;  // 60fps physics step
const MAX_TRAJECTORY_STEPS = 3000; // safety cap (~50 seconds of flight)

/**
 * Task 2.1: Calculate trajectory for a projectile
 *
 * Mirrors Weapon.js defaultShoot:
 *   velocity = power * powerFactor (default 8)
 *   rotation = turretRotation - PI/2
 *   vx = velocity * cos(rotation)
 *   vy = velocity * sin(rotation)
 *   gravity applied each frame to vy
 *
 * Uses Euler integration matching Phaser's arcade physics step.
 *
 * @param {number} angle - Turret rotation in radians
 * @param {number} power - Tank power slider value (0-100)
 * @param {number} gravity - Gravity (default 300)
 * @param {number} startX - Turret tip X
 * @param {number} startY - Turret tip Y
 * @returns {Array<{x: number, y: number, vx: number, vy: number}>} trajectory points per frame
 */
export function calculateTrajectory(angle, power, gravity = DEFAULT_GRAVITY, startX, startY) {
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
    for (let i = 1; i < trajectory.length; i++) {
        const { x, y } = trajectory[i];
        const ix = Math.floor(x);
        const iy = Math.floor(y);

        // Out of bounds
        if (ix <= 0 || ix >= TERRAIN_WIDTH - 1) {
            return { x, y, type: 'outOfBounds', frameIndex: i };
        }

        // Below terrain canvas floor
        if (iy >= TERRAIN_HEIGHT) {
            return { x, y: TERRAIN_HEIGHT - 1, type: 'base', frameIndex: i };
        }

        // Skip if above screen
        if (iy < 0) continue;

        // Terrain collision: projectile is at or below ground level
        if (ix >= 0 && ix < terrain.length && terrain[ix] !== undefined) {
            if (iy >= terrain[ix]) {
                // Retract to find exact surface point (simpler server-side version)
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
 * @param {number} height - Terrain height (default 534)
 * @param {number} seed - Optional seed for reproducibility
 * @returns {{path: Array<{x: number, y: number}>, heightmap: number[]}}
 */
export function generateTerrain(width = TERRAIN_WIDTH, height = TERRAIN_HEIGHT, seed = null) {
    // Use seeded random if provided, otherwise Math.random
    const random = seed !== null ? seededRandom(seed) : Math.random;

    const path = [];
    let x = -200;
    let y = height * (1 - random() * random());
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
        if (y < height / 5) y = prevY - radius * Math.sin(angle);

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
    if (y > height / 1.5) {
        angle = (angle - Math.PI / 2 * Math.sqrt(random())) / 2;
    }
    if (y < height / 1.5) {
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

    // Linear interpolation between consecutive path points
    for (let i = 0; i < sorted.length - 1; i++) {
        const p1 = sorted[i];
        const p2 = sorted[i + 1];
        const startX = Math.max(0, Math.floor(p1.x));
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
 * Generate starting tank positions on the terrain
 * Mirrors client: host on left third, player on right third
 *
 * @param {number[]} heightmap
 * @param {number} width
 * @returns {{host: {x: number, y: number}, player: {x: number, y: number}}}
 */
export function generateTankPositions(heightmap, width = TERRAIN_WIDTH) {
    // Host spawns in left third, player in right third
    const hostX = Math.floor(width * 0.2 + Math.random() * width * 0.15);
    const playerX = Math.floor(width * 0.65 + Math.random() * width * 0.15);

    return {
        host: { x: hostX, y: heightmap[hostX] - 15 },    // -15 for tank height offset
        player: { x: playerX, y: heightmap[playerX] - 15 }
    };
}

/**
 * Process a complete shot: trajectory → impact → damage → terrain update
 * This is the main function called by the socket handler on 'fire' events.
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
 * @returns {{trajectory: Array, impact: object, damage: object, newTerrain: number[]}}
 */
export function processShot({ angle, power, weaponId, startX, startY, shooterId, terrain, tanks }) {
    const weapon = WEAPON_DATA[weaponId];
    if (!weapon) {
        return { trajectory: [], impact: null, damage: {}, newTerrain: terrain };
    }

    // 1. Calculate trajectory
    const trajectory = calculateTrajectory(angle, power, weapon.gravity, startX, startY);

    // 2. Find impact point
    const impact = calculateImpact(trajectory, terrain, tanks);

    // 3. Calculate damage
    let damage = {};
    if (impact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
        damage = calculateDamage(impact, weaponId, tanks, shooterId);
    }

    // 4. Deform terrain
    let newTerrain = terrain;
    if (impact.type !== 'outOfBounds' && weapon.blastRadius > 0) {
        newTerrain = deformTerrain(terrain, impact, weapon.blastRadius);
    }

    // 5. Trim trajectory to impact frame for transmission efficiency
    const trimmedTrajectory = trajectory.slice(0, impact.frameIndex + 1).map(p => ({
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10
    }));

    return {
        trajectory: trimmedTrajectory,
        impact: { x: impact.x, y: impact.y, type: impact.type },
        damage,
        newTerrain,
        weaponId
    };
}
