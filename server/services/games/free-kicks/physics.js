import {
    BALL_MASS_KG, BALL_RADIUS_M, BALL_AREA_M2,
    GRAVITY_M_S2, AIR_DENSITY_KG_M3,
    DRAG_COEFFICIENT_CD,
    CL_BASE, SP_BASE, CL_SLOPE_PER_SP, CL_MIN, CL_MAX,
    PHYSICS_DT, PHYSICS_SUBSTEPS, MAX_TRAJECTORY_STEPS,
    TERM_Z_MAX_M, TERM_Y_MIN_M, TERM_X_ABS_MAX_M,
    GOAL_HALF_WIDTH_M, GOAL_HEIGHT_M, GOAL_PLANE_Z_M, POST_RADIUS_M,
    WALL_DISTANCE_FROM_BALL_M, DEFENDER_WIDTH_M, DEFENDER_HEIGHT_M, DEFENDER_DEPTH_M,
    BALL_RELEASE_HEIGHT_M,
    MIN_POWER_M_S, MAX_POWER_M_S,
    MIN_AZIMUTH_RAD, MAX_AZIMUTH_RAD,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
    MAX_SPIN_RAD_S,
    TARGET_HALF_WIDTH_M, TARGET_HALF_HEIGHT_M,
    HEART_HALF_WIDTH_M, HEART_HALF_HEIGHT_M,
    BOUNCE_RESTITUTION, BOUNCE_FRICTION_H, MAX_BOUNCES, MIN_BOUNCE_SPEED_M_S,
    POST_BOUNCE_RESTITUTION,
    NET_RESTITUTION_BACK, NET_RESTITUTION_SIDE, NET_RESTITUTION_TOP, NET_RESTITUTION_GROUND,
    NET_DEPTH_M, MIN_NET_SPEED_M_S,
} from './constants.js';

/**
 * Free-Kick Madness — server-side 3D physics + collision (v0.1)
 *
 * Simulates a single free-kick shot in 3D space.
 *
 *   Input: derived shot inputs (power, azimuth, elevation, spin)
 *          + scenario (ballPos, wall geometry, target zones).
 *   Output: { result, trajectory, hit, targetHit }.
 *
 * Forces modelled:
 *   - Gravity (constant -g·ŷ)
 *   - Aerodynamic drag: F_d = -½·ρ·A·Cd·|v|·v
 *   - Magnus force:     F_m =  ½·ρ·A·Cl·|v|²·(ω̂ × v̂)
 *
 * Cl is computed as a linear function of the spin parameter
 * Sp = r·|ω|/|v|, clamped to a measured envelope.
 *
 * Integration: 4th-order Runge-Kutta. Spin is treated as constant
 * during flight (decay <5% over typical 1.5 s — see PHYSICS_RESEARCH.md
 * §4). Each frame-step is sub-stepped PHYSICS_SUBSTEPS times for
 * stability.
 *
 * COORDINATE SYSTEM:
 *   x = lateral   (player's right = +x)
 *   y = vertical  (up = +y)
 *   z = depth     (toward goal = +z)
 *   Goal-line plane at z = 0. Player kicks from z < 0 toward z > 0.
 *
 * SPIN CONVENTION:
 *   ω is angular velocity in rad/s.
 *   For v1 we only model SIDE spin (ω along y axis):
 *     +ωy = ball curves to player's right (clockwise from above)
 *     -ωy = ball curves to player's left
 *   Topspin / backspin (ω along x) is supported by the physics but
 *   not exposed in the v1 input model.
 *
 * RESULT outcomes:
 *   'goal'              — ball crossed goal-plane within frame
 *   'goal_plus10'       — goal AND ball passed through +10 zone
 *   'goal_heart'        — goal AND ball passed through ❤️ zone
 *   'goal_plus10_heart' — goal through both zones (rare)
 *   'blocked'           — ball hit a wall defender
 *   'post'              — ball hit goalpost or crossbar
 *   'over'              — ball cleared crossbar (out of bounds high)
 *   'wide'              — ball passed outside left/right post
 *   'short'             — ball never reached goal plane (fell to pitch)
 *   'invalid'           — input failed validation
 *
 * Determinism: same inputs → identical outputs. Pure function.
 */


// ============================================================
// === Input validation ===
// ============================================================

export function validateShotInput({ power, azimuth, elevation, spin }) {
    if (!isFiniteNum(power)) return 'power_invalid';
    if (!isFiniteNum(azimuth)) return 'azimuth_invalid';
    if (!isFiniteNum(elevation)) return 'elevation_invalid';
    if (!isFiniteNum(spin)) return 'spin_invalid';
    if (power < MIN_POWER_M_S || power > MAX_POWER_M_S) return 'power_out_of_range';
    if (azimuth < MIN_AZIMUTH_RAD || azimuth > MAX_AZIMUTH_RAD) return 'azimuth_out_of_range';
    if (elevation < MIN_ELEVATION_RAD || elevation > MAX_ELEVATION_RAD) return 'elevation_out_of_range';
    if (Math.abs(spin) > MAX_SPIN_RAD_S) return 'spin_out_of_range';
    return null;
}

function isFiniteNum(x) {
    return typeof x === 'number' && Number.isFinite(x);
}


// ============================================================
// === Scenario helpers ===
// ============================================================

/**
 * Compute ball release position for a shot scenario.
 *
 * @param {object} scenario
 * @param {number} scenario.distanceM     — distance from goal CENTRE
 * @param {number} scenario.angleRad      — angle from straight-on
 *                                          (+ve = player's right)
 * @returns {{x:number, y:number, z:number}}
 */
export function ballReleasePos({ distanceM, angleRad }) {
    return {
        x: distanceM * Math.sin(angleRad),
        y: BALL_RELEASE_HEIGHT_M,
        z: -distanceM * Math.cos(angleRad),
    };
}

/**
 * Compute wall position — centred on the ball → near-post line, at
 * WALL_DISTANCE_FROM_BALL_M from the ball.
 *
 * Near-post convention: for a player on the +x side of the pitch
 * (angle > 0), the +x post is the near post. For straight shots
 * (angle = 0) the wall is on the ball → goal-centre line.
 *
 * @returns {{ centerX:number, centerY:number, centerZ:number,
 *             halfWidth:number, halfHeight:number, halfDepth:number,
 *             defenders: Array<{minX, maxX, minY, maxY, minZ, maxZ}> }}
 */
export function wallGeometry({ ballPos, scenario }) {
    const { wallSize, angleRad } = scenario;

    // Pick near post. For angle === 0 the wall sits on the
    // ball→goal-centre line (target = origin).
    let targetX;
    if (angleRad > 0)      targetX = +GOAL_HALF_WIDTH_M;     // player on right → +x post near
    else if (angleRad < 0) targetX = -GOAL_HALF_WIDTH_M;     // player on left  → -x post near
    else                   targetX = 0;                       // straight → centre

    // Direction vector from ball toward near-post target (on goal plane).
    const dx = targetX - ballPos.x;
    const dz = GOAL_PLANE_Z_M - ballPos.z;
    const dist = Math.hypot(dx, dz);
    const ux = dx / dist;
    const uz = dz / dist;

    // Wall centre: WALL_DISTANCE_FROM_BALL_M along this unit vector.
    const centerX = ballPos.x + ux * WALL_DISTANCE_FROM_BALL_M;
    const centerZ = ballPos.z + uz * WALL_DISTANCE_FROM_BALL_M;
    const centerY = DEFENDER_HEIGHT_M / 2;  // standing on pitch

    // Wall is perpendicular to the (ux, uz) direction. The lateral
    // axis of the wall is the perpendicular in the horizontal plane.
    const perpX = -uz;  // rotated 90° in horizontal plane
    const perpZ = +ux;

    // Build defender AABBs along the wall.
    // For v1 we use axis-aligned hitboxes that approximate the wall
    // even when it's oblique — the wall's bounding box is the union
    // of defender boxes. For a straight wall this is exact; for
    // oblique walls it slightly over-estimates the hit zone, which
    // is fine for arcade play (errs on side of "wall blocks more").
    //
    // v1.16: scenario.wallShiftX is an optional lateral offset applied
    // to every defender. The renderer slides the wall sideways on shots
    // tagged with wallMotion.active and captures the current offset at
    // fire-time — physics then evaluates the wall at the position the
    // player actually kicked against.
    //
    // v1.19: dummies shrink slightly on long shots so the goal stays
    // visible past the wall. The same scale factor is applied to the
    // rendered mesh in scene3d so what you see is what you can hit.
    const dummyScale = dummyScaleForDistance(scenario.distanceM);
    const defW = DEFENDER_WIDTH_M * dummyScale;
    const defH = DEFENDER_HEIGHT_M * dummyScale;
    const defD = DEFENDER_DEPTH_M * dummyScale;
    const wallTotalHalfWidth = (wallSize * defW) / 2;
    const shiftX = scenario.wallShiftX || 0;
    const defenders = [];
    for (let i = 0; i < wallSize; i++) {
        // i-th defender's offset from wall centre (along perp).
        const offset = (i - (wallSize - 1) / 2) * defW;
        const cx = centerX + perpX * offset + shiftX;
        const cz = centerZ + perpZ * offset;
        defenders.push({
            minX: cx - defW / 2,
            maxX: cx + defW / 2,
            minY: 0,
            maxY: defH,
            minZ: cz - defD / 2,
            maxZ: cz + defD / 2,
        });
    }

    return {
        centerX: centerX + shiftX,
        centerY, centerZ,
        halfWidth: wallTotalHalfWidth,
        halfHeight: defH / 2,
        halfDepth: defD / 2,
        defenders,
        dummyScale,
    };
}

// Linear fall-off: full size at 20 m, clamped at 0.78 from ~37 m onward.
// Used by both wallGeometry (physics) and scene3d (visual scale).
export function dummyScaleForDistance(distanceM) {
    return Math.max(0.78, Math.min(1.0, 1.0 - (distanceM - 20) * 0.012));
}


// ============================================================
// === Aerodynamics ===
// ============================================================

/**
 * Compute lift coefficient Cl from spin parameter Sp = r·|ω|/|v|.
 *
 * v0.7: pure proportional Cl(Sp) = (CL_BASE / SP_BASE) · Sp, clamped
 * to [CL_MIN, CL_MAX]. Proportional model has the natural property
 * that ZERO SPIN → ZERO CURL (Fish's playtest requirement: straight
 * swipes must give straight shots). Anchored at the Beckham-spec
 * reference point (Sp=0.18, Cl=0.20).
 *
 * Trade-off: the proportional model slightly over-predicts Cl at
 * very high Sp vs Asai's wind-tunnel data — that's the arcade-feel
 * choice. Real-football realism is sacrificed for wider dynamic
 * range between mild and dramatic curls.
 */
export function liftCoefficient({ speed, spinMag }) {
    if (speed < 1e-6 || spinMag < 1e-6) return 0;
    const sp = (BALL_RADIUS_M * spinMag) / speed;
    const raw = (CL_BASE / SP_BASE) * sp;
    return Math.max(CL_MIN, Math.min(CL_MAX, raw));
}

/**
 * Compute the total aerodynamic + gravitational acceleration on the
 * ball given current state.
 *
 * @returns {{ax:number, ay:number, az:number}}  acceleration in m/s²
 */
function acceleration(state, omega) {
    const { vx, vy, vz } = state;
    const speed = Math.hypot(vx, vy, vz);

    if (speed < 1e-6) {
        return { ax: 0, ay: -GRAVITY_M_S2, az: 0 };
    }

    // Unit velocity vector
    const ux = vx / speed;
    const uy = vy / speed;
    const uz = vz / speed;

    // Drag force magnitude / mass  =  -½·ρ·A·Cd·|v|² / m
    // Direction opposite to velocity.
    const dragMag = 0.5 * AIR_DENSITY_KG_M3 * BALL_AREA_M2 * DRAG_COEFFICIENT_CD * speed * speed / BALL_MASS_KG;

    // Magnus force / mass  =  ½·ρ·A·Cl·|v|² / m  ·  (ω̂ × v̂)
    const spinMag = Math.hypot(omega.wx, omega.wy, omega.wz);
    let magnusX = 0, magnusY = 0, magnusZ = 0;
    if (spinMag > 1e-6) {
        const cl = liftCoefficient({ speed, spinMag });
        const magnusMag = 0.5 * AIR_DENSITY_KG_M3 * BALL_AREA_M2 * cl * speed * speed / BALL_MASS_KG;
        // ω̂ × v̂
        const owx = omega.wx / spinMag;
        const owy = omega.wy / spinMag;
        const owz = omega.wz / spinMag;
        const crossX = owy * uz - owz * uy;
        const crossY = owz * ux - owx * uz;
        const crossZ = owx * uy - owy * ux;
        magnusX = magnusMag * crossX;
        magnusY = magnusMag * crossY;
        magnusZ = magnusMag * crossZ;
    }

    return {
        ax: -dragMag * ux + magnusX,
        ay: -dragMag * uy + magnusY - GRAVITY_M_S2,
        az: -dragMag * uz + magnusZ,
    };
}


// ============================================================
// === RK4 integrator ===
// ============================================================

/**
 * Advance the state by dt using 4th-order Runge-Kutta. Spin is
 * treated as constant (decay <5% per 1.5 s — see PHYSICS_RESEARCH.md
 * §4). Returns a new state object — does NOT mutate input.
 */
function rk4Step(state, omega, dt) {
    const { x, y, z, vx, vy, vz } = state;

    // k1
    const a1 = acceleration(state, omega);
    // k2 — state at +dt/2 using k1
    const s2 = {
        x: x + vx * dt / 2,
        y: y + vy * dt / 2,
        z: z + vz * dt / 2,
        vx: vx + a1.ax * dt / 2,
        vy: vy + a1.ay * dt / 2,
        vz: vz + a1.az * dt / 2,
    };
    const a2 = acceleration(s2, omega);
    // k3 — state at +dt/2 using k2
    const s3 = {
        x: x + s2.vx * dt / 2,
        y: y + s2.vy * dt / 2,
        z: z + s2.vz * dt / 2,
        vx: vx + a2.ax * dt / 2,
        vy: vy + a2.ay * dt / 2,
        vz: vz + a2.az * dt / 2,
    };
    const a3 = acceleration(s3, omega);
    // k4 — state at +dt using k3
    const s4 = {
        x: x + s3.vx * dt,
        y: y + s3.vy * dt,
        z: z + s3.vz * dt,
        vx: vx + a3.ax * dt,
        vy: vy + a3.ay * dt,
        vz: vz + a3.az * dt,
    };
    const a4 = acceleration(s4, omega);

    // Weighted average: (k1 + 2·k2 + 2·k3 + k4) / 6
    const avgVx = (vx + 2 * s2.vx + 2 * s3.vx + s4.vx) / 6;
    const avgVy = (vy + 2 * s2.vy + 2 * s3.vy + s4.vy) / 6;
    const avgVz = (vz + 2 * s2.vz + 2 * s3.vz + s4.vz) / 6;
    const avgAx = (a1.ax + 2 * a2.ax + 2 * a3.ax + a4.ax) / 6;
    const avgAy = (a1.ay + 2 * a2.ay + 2 * a3.ay + a4.ay) / 6;
    const avgAz = (a1.az + 2 * a2.az + 2 * a3.az + a4.az) / 6;

    return {
        x: x + avgVx * dt,
        y: y + avgVy * dt,
        z: z + avgVz * dt,
        vx: vx + avgAx * dt,
        vy: vy + avgAy * dt,
        vz: vz + avgAz * dt,
    };
}


// ============================================================
// === Collision detection ===
// ============================================================

// AABB hit test for a moving ball (treats ball as a point + radius).
// Returns true if the swept segment from prevState to state intersects
// the defender's AABB (expanded by ball radius).
function hitDefender(prevState, state, defender) {
    // Expand AABB by ball radius (Minkowski sum trick — point-vs-AABB
    // becomes the test for a sphere-vs-AABB intersection at instant).
    const minX = defender.minX - BALL_RADIUS_M;
    const maxX = defender.maxX + BALL_RADIUS_M;
    const minY = defender.minY - BALL_RADIUS_M;
    const maxY = defender.maxY + BALL_RADIUS_M;
    const minZ = defender.minZ - BALL_RADIUS_M;
    const maxZ = defender.maxZ + BALL_RADIUS_M;

    // Check both endpoints — if either is inside expanded box, hit.
    // (For higher fidelity use slab-based swept test; the substep
    // size is small enough that endpoint checks rarely miss.)
    if (pointInsideAABB(state.x, state.y, state.z, minX, maxX, minY, maxY, minZ, maxZ)) return true;
    if (pointInsideAABB(prevState.x, prevState.y, prevState.z, minX, maxX, minY, maxY, minZ, maxZ)) return true;

    // Swept test along the segment — use parametric line-vs-AABB.
    return segmentHitsAABB(prevState, state, minX, maxX, minY, maxY, minZ, maxZ);
}

function pointInsideAABB(px, py, pz, minX, maxX, minY, maxY, minZ, maxZ) {
    return px >= minX && px <= maxX && py >= minY && py <= maxY && pz >= minZ && pz <= maxZ;
}

function segmentHitsAABB(prev, curr, minX, maxX, minY, maxY, minZ, maxZ) {
    // Parametric segment p(t) = prev + t·(curr - prev), t ∈ [0,1].
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = curr.z - prev.z;

    let tEnter = 0;
    let tExit = 1;

    for (const [p, d, lo, hi] of [
        [prev.x, dx, minX, maxX],
        [prev.y, dy, minY, maxY],
        [prev.z, dz, minZ, maxZ],
    ]) {
        if (Math.abs(d) < 1e-12) {
            if (p < lo || p > hi) return false;
        } else {
            const t1 = (lo - p) / d;
            const t2 = (hi - p) / d;
            const tMin = Math.min(t1, t2);
            const tMax = Math.max(t1, t2);
            tEnter = Math.max(tEnter, tMin);
            tExit = Math.min(tExit, tMax);
            if (tEnter > tExit) return false;
        }
    }
    return tEnter <= tExit;
}

// Crossbar / post collision — treated as vertical cylinder.
// Post: vertical from y=0 to y=GOAL_HEIGHT_M at fixed x, z=0.
// Crossbar: horizontal cylinder from x=-GOAL_HALF_WIDTH to +GOAL_HALF_WIDTH at y=GOAL_HEIGHT_M, z=0.
function hitPost(prevState, state, postX) {
    // Post is along y axis at (postX, *, 0). Ball is sphere.
    // Check if 2D distance from segment to (postX, 0) line < (BALL + POST radius)
    // in the x-z plane, AND y is within [0, GOAL_HEIGHT_M] at the contact instant.
    const totalR = BALL_RADIUS_M + POST_RADIUS_M;

    // Closest distance from segment to point in x-z plane
    const dx1 = prevState.x - postX;
    const dz1 = prevState.z; // post z = 0
    const dx2 = state.x - postX;
    const dz2 = state.z;
    const dx = dx2 - dx1;
    const dz = dz2 - dz1;
    const lenSq = dx * dx + dz * dz;
    let t = 0;
    if (lenSq > 1e-12) {
        t = -(dx1 * dx + dz1 * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
    }
    const closestX = dx1 + t * dx;
    const closestZ = dz1 + t * dz;
    const dist = Math.hypot(closestX, closestZ);

    if (dist > totalR) return false;

    // Check that ball y at contact instant is within post height range
    const yAtContact = prevState.y + t * (state.y - prevState.y);
    return yAtContact >= 0 - BALL_RADIUS_M && yAtContact <= GOAL_HEIGHT_M + BALL_RADIUS_M;
}

function hitCrossbar(prevState, state) {
    // Crossbar at y = GOAL_HEIGHT_M, z = 0, x ∈ [-GOAL_HALF, +GOAL_HALF].
    // Treat as horizontal cylinder along x axis.
    const totalR = BALL_RADIUS_M + POST_RADIUS_M;
    const dy1 = prevState.y - GOAL_HEIGHT_M;
    const dz1 = prevState.z;
    const dy2 = state.y - GOAL_HEIGHT_M;
    const dz2 = state.z;
    const dy = dy2 - dy1;
    const dz = dz2 - dz1;
    const lenSq = dy * dy + dz * dz;
    let t = 0;
    if (lenSq > 1e-12) {
        t = -(dy1 * dy + dz1 * dz) / lenSq;
        t = Math.max(0, Math.min(1, t));
    }
    const closestY = dy1 + t * dy;
    const closestZ = dz1 + t * dz;
    const dist = Math.hypot(closestY, closestZ);

    if (dist > totalR) return false;

    // Check x range at contact instant
    const xAtContact = prevState.x + t * (state.x - prevState.x);
    return Math.abs(xAtContact) <= GOAL_HALF_WIDTH_M + BALL_RADIUS_M;
}

// Goal-line plane crossing — returns the (x, y) point where the
// trajectory crossed z=0, or null if no crossing in this step.
function goalPlaneCrossing(prevState, state) {
    // Only count forward crossings (z went from <0 to >=0).
    if (prevState.z >= GOAL_PLANE_Z_M || state.z < GOAL_PLANE_Z_M) return null;
    if (state.z === prevState.z) return null;

    const t = (GOAL_PLANE_Z_M - prevState.z) / (state.z - prevState.z);
    return {
        x: prevState.x + t * (state.x - prevState.x),
        y: prevState.y + t * (state.y - prevState.y),
        t,
    };
}

// Check whether (x, y) is inside the goal frame (not the woodwork).
function insideGoalFrame(x, y) {
    return Math.abs(x) <= GOAL_HALF_WIDTH_M && y >= 0 && y <= GOAL_HEIGHT_M;
}

// Surface normal at the ball-impact point on a vertical goalpost.
// Post axis is at (postX, *, 0). Normal direction = ball horizontal
// offset from post centre, in the x-z plane.
function computeVerticalPostNormal(state, postX) {
    const dx = state.x - postX;
    const dz = state.z - GOAL_PLANE_Z_M;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) {
        // Degenerate: ball center exactly on post axis. Default normal
        // pointing toward camera (-z in physics ≡ toward player).
        return { nx: 0, ny: 0, nz: -1 };
    }
    return { nx: dx / len, ny: 0, nz: dz / len };
}

// Surface normal at the ball-impact point on the crossbar.
// Crossbar axis at y=GOAL_HEIGHT_M, z=0, x ∈ [-GOAL_HALF, +GOAL_HALF].
// Normal direction = ball offset from crossbar axis in the y-z plane.
function computeCrossbarNormal(state) {
    const dy = state.y - GOAL_HEIGHT_M;
    const dz = state.z - GOAL_PLANE_Z_M;
    const len = Math.hypot(dy, dz);
    if (len < 1e-9) {
        return { nx: 0, ny: 0, nz: -1 };
    }
    return { nx: 0, ny: dy / len, nz: dz / len };
}

// Reflect a velocity across a surface normal and apply restitution
// damping. Modifies state in place.
function applyReflection(state, normal, restitution) {
    const vdotn = state.vx * normal.nx + state.vy * normal.ny + state.vz * normal.nz;
    state.vx = (state.vx - 2 * vdotn * normal.nx) * restitution;
    state.vy = (state.vy - 2 * vdotn * normal.ny) * restitution;
    state.vz = (state.vz - 2 * vdotn * normal.nz) * restitution;
}

// Handle ball physics inside the net: bounce off the back, side
// walls, top panel, and ground with heavy damping.
function handleNetPhysics(state) {
    // Back of net at z = NET_DEPTH_M (ball must stay behind this when in net)
    if (state.z >= NET_DEPTH_M && state.vz > 0) {
        state.z = NET_DEPTH_M;
        state.vz = -NET_RESTITUTION_BACK * state.vz;
        state.vx *= NET_RESTITUTION_BACK;
        state.vy *= NET_RESTITUTION_BACK;
    }
    // Side walls
    if (state.x > GOAL_HALF_WIDTH_M && state.vx > 0) {
        state.x = GOAL_HALF_WIDTH_M;
        state.vx = -NET_RESTITUTION_SIDE * state.vx;
        state.vz *= NET_RESTITUTION_SIDE;
    }
    if (state.x < -GOAL_HALF_WIDTH_M && state.vx < 0) {
        state.x = -GOAL_HALF_WIDTH_M;
        state.vx = -NET_RESTITUTION_SIDE * state.vx;
        state.vz *= NET_RESTITUTION_SIDE;
    }
    // Top of net
    if (state.y > GOAL_HEIGHT_M && state.vy > 0) {
        state.y = GOAL_HEIGHT_M;
        state.vy = -NET_RESTITUTION_TOP * state.vy;
        state.vx *= NET_RESTITUTION_TOP;
        state.vz *= NET_RESTITUTION_TOP;
    }
    // Ground inside net
    if (state.y <= BALL_RADIUS_M && state.vy < 0) {
        state.y = BALL_RADIUS_M;
        state.vy = -NET_RESTITUTION_GROUND * state.vy;
        state.vx *= NET_RESTITUTION_GROUND;
        state.vz *= NET_RESTITUTION_GROUND;
    }
}

// Check whether (x, y) is inside a target zone. Half-dimensions are
// passed by the caller so the bullseye and heart can have different
// hit-box sizes.
function insideTargetZone(x, y, target, halfW, halfH) {
    if (!target) return false;
    return Math.abs(x - target.x) <= halfW
        && Math.abs(y - target.y) <= halfH;
}


// ============================================================
// === simulateShot — the public entry point ===
// ============================================================

/**
 * Simulate one free-kick shot. Pure — same inputs always produce
 * identical output.
 *
 * @param {object} params
 * @param {object} params.shotInput
 *   { power, azimuth, elevation, spin }
 *   - power [m/s]      — initial speed
 *   - azimuth [rad]    — horizontal aim angle (+ve = player's right)
 *   - elevation [rad]  — vertical aim angle (+ve = upward)
 *   - spin [rad/s]     — side spin around vertical axis
 *                        (+ve = right curl, -ve = left curl)
 * @param {object} params.scenario
 *   { distanceM, angleRad, wallSize, plus10Target, heartTarget }
 *   - plus10Target / heartTarget: { x, y } position in goal-plane
 *     coordinates, or null if absent.
 *
 * @returns {{
 *   result: string,
 *   trajectory: Array<{x,y,z,vx,vy,vz}>,
 *   crossing: {x, y} | null,
 *   targetHit: { plus10: boolean, heart: boolean },
 *   reason?: string,
 * }}
 */
export function simulateShot({ shotInput, scenario, skipWall = false }) {
    const validationError = validateShotInput(shotInput);
    if (validationError) {
        return {
            result: 'invalid',
            reason: validationError,
            trajectory: [],
            crossing: null,
            targetHit: { plus10: false, heart: false },
        };
    }

    const { power, azimuth, elevation, spin } = shotInput;

    // Player aims TOWARD the goal centre, plus their azimuth offset.
    // The ball-centre direction is along -z (from -distance·cos toward
    // 0). The player's facing angle is OPPOSITE to the position-angle
    // from goal centre.
    const ballPos = ballReleasePos(scenario);
    // The "straight-ahead" direction from ball toward goal centre:
    const facingDx = 0 - ballPos.x;
    const facingDz = 0 - ballPos.z;
    const facingLen = Math.hypot(facingDx, facingDz);
    const facingX = facingDx / facingLen;
    const facingZ = facingDz / facingLen;
    // Apply azimuth as deviation from straight-ahead, in PLAYER-RELATIVE
    // terms: positive azimuth = aim toward player's right.
    //   aim = facing * cos(azimuth)  +  playerRight * sin(azimuth)
    // where playerRight = (facingZ, 0, -facingX) (perpendicular to
    // facing in the horizontal plane, pointing to the kicker's right).
    // For a centre shot (facing = +z): playerRight = +x → aimX =
    // sin(azimuth), aimZ = cos(azimuth). Positive azimuth → ball goes +x.
    const cosA = Math.cos(azimuth);
    const sinA = Math.sin(azimuth);
    const aimX =  facingX * cosA + facingZ * sinA;
    const aimZ = -facingX * sinA + facingZ * cosA;
    // Apply elevation (tilt up)
    const cosE = Math.cos(elevation);
    const sinE = Math.sin(elevation);
    // Horizontal component of velocity has magnitude power·cos(elevation),
    // vertical is power·sin(elevation).
    const vHoriz = power * cosE;
    const initialVx = vHoriz * aimX;
    const initialVy = power * sinE;
    const initialVz = vHoriz * aimZ;

    // Spin: side spin around vertical axis only for v1.
    const omega = { wx: 0, wy: spin, wz: 0 };

    // Compute wall geometry for collision tests.
    const wall = wallGeometry({ ballPos, scenario });

    // Initialise trajectory.
    let state = {
        x: ballPos.x, y: ballPos.y, z: ballPos.z,
        vx: initialVx, vy: initialVy, vz: initialVz,
    };
    const trajectory = [{ ...state }];

    const innerDt = PHYSICS_DT / PHYSICS_SUBSTEPS;

    let result = null;
    let crossing = null;
    let targetHit = { plus10: false, heart: false };
    let reason = null;
    let bounceCount = 0;
    let touchedPost = false;
    let inNet = false;
    let settled = false;

    for (let step = 0; step < MAX_TRAJECTORY_STEPS && !settled; step++) {

        for (let sub = 0; sub < PHYSICS_SUBSTEPS && !settled; sub++) {
            const next = rk4Step(state, omega, innerDt);

            if (inNet) {
                // Ball is captured in the net — special collision rules.
                // Net surfaces dampen heavily. Ball eventually settles.
                handleNetPhysics(next);
                const speed = Math.hypot(next.vx, next.vy, next.vz);
                if (speed < MIN_NET_SPEED_M_S) {
                    next.vx = 0; next.vy = 0; next.vz = 0;
                    state = next;
                    settled = true;
                    break;
                }
                state = next;
                continue;
            }

            // POST / CROSSBAR check first — if hit, bounce + continue.
            // (Posts sit AT the goal-plane z=0, so this must run before
            // goal-plane crossing detection.)
            let postNormal = null;
            if (hitPost(state, next, +GOAL_HALF_WIDTH_M)) {
                postNormal = computeVerticalPostNormal(next, +GOAL_HALF_WIDTH_M);
            } else if (hitPost(state, next, -GOAL_HALF_WIDTH_M)) {
                postNormal = computeVerticalPostNormal(next, -GOAL_HALF_WIDTH_M);
            } else if (hitCrossbar(state, next)) {
                postNormal = computeCrossbarNormal(next);
            }
            if (postNormal) {
                if (result === null) result = 'post';
                touchedPost = true;
                applyReflection(next, postNormal, POST_BOUNCE_RESTITUTION);
                // Nudge ball slightly OUT of the post to avoid re-collision
                next.x += postNormal.nx * 0.02;
                next.y += postNormal.ny * 0.02;
                next.z += postNormal.nz * 0.02;
                state = next;
                continue;
            }

            // Goal-plane crossing
            const cross = goalPlaneCrossing(state, next);
            if (cross) {
                crossing = cross;
                if (insideGoalFrame(cross.x, cross.y)) {
                    // GOAL — switch to net mode, keep simulating
                    targetHit.plus10 = insideTargetZone(cross.x, cross.y, scenario.plus10Target, TARGET_HALF_WIDTH_M, TARGET_HALF_HEIGHT_M);
                    targetHit.heart  = insideTargetZone(cross.x, cross.y, scenario.heartTarget,  HEART_HALF_WIDTH_M,  HEART_HALF_HEIGHT_M);
                    if (targetHit.plus10 && targetHit.heart)      result = 'goal_plus10_heart';
                    else if (targetHit.plus10)                    result = 'goal_plus10';
                    else if (targetHit.heart)                     result = 'goal_heart';
                    else                                          result = 'goal';
                    inNet = true;
                    state = next;
                    continue;
                } else {
                    // MISS — terminate (woodwork-grazed cases already handled above)
                    if (cross.y > GOAL_HEIGHT_M + POST_RADIUS_M)                    result = 'over';
                    else if (Math.abs(cross.x) > GOAL_HALF_WIDTH_M + POST_RADIUS_M) result = 'wide';
                    else                                                             result = 'post';
                    state = next;
                    settled = true;
                    break;
                }
            }

            // Wall (defender) collision — terminate as 'blocked'.
            // skipWall=true (fire-ball / hat-trick mode) lets the ball
            // pass straight through the wall on its way to goal.
            if (!skipWall) {
                let hitWall = false;
                for (const def of wall.defenders) {
                    if (hitDefender(state, next, def)) {
                        hitWall = true;
                        break;
                    }
                }
                if (hitWall) {
                    if (result === null) result = 'blocked';
                    state = next;
                    settled = true;
                    break;
                }
            }

            // Pitch bounce (outside the goal frame)
            if (next.y <= BALL_RADIUS_M && next.vy < 0) {
                bounceCount++;
                next.y = BALL_RADIUS_M;
                next.vy = -BOUNCE_RESTITUTION * next.vy;
                next.vx *= BOUNCE_FRICTION_H;
                next.vz *= BOUNCE_FRICTION_H;

                const speedAfter = Math.hypot(next.vx, next.vy, next.vz);
                if (bounceCount >= MAX_BOUNCES || speedAfter < MIN_BOUNCE_SPEED_M_S) {
                    next.vx = 0; next.vy = 0; next.vz = 0;
                    state = next;
                    if (result === null) result = touchedPost ? 'post' : 'short';
                    settled = true;
                    break;
                }
            }

            state = next;
        }

        trajectory.push({ ...state });

        if (settled) break;

        // Outer safety nets
        if (state.y < -1.0 + BALL_RADIUS_M) {
            if (result === null) result = touchedPost ? 'post' : 'short';
            settled = true;
        }
        if (!inNet && state.z > TERM_Z_MAX_M) {
            if (result === null) result = touchedPost ? 'post' : 'over';
            settled = true;
        }
        if (Math.abs(state.x) > TERM_X_ABS_MAX_M) {
            if (result === null) result = touchedPost ? 'post' : 'wide';
            settled = true;
        }
    }

    if (result === null) {
        // Step cap reached — extremely unlikely; treat as short.
        result = 'short';
        reason = 'max_steps_reached';
    }

    return {
        result,
        trajectory,
        crossing,
        targetHit,
        ...(reason ? { reason } : {}),
    };
}
