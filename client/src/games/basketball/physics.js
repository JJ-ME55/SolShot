import {
    BALL_RELEASE_HEIGHT_M, BALL_RELEASE_FORWARD_M, BALL_RELEASE_LATERAL_M,
    RIM_X_BASE_M, RIM_HEIGHT_M, RIM_FORWARD_M,
    RIM_INNER_RADIUS_M, RIM_TUBE_RADIUS_M,
    BACKBOARD_X_BASE_M, BACKBOARD_Z_M, BACKBOARD_HALF_WIDTH_M,
    BACKBOARD_TOP_Y_M, BACKBOARD_BOTTOM_Y_M,
    SHOOTER_SQUARE_HALF_WIDTH_M, SHOOTER_SQUARE_BOTTOM_Y_M, SHOOTER_SQUARE_TOP_Y_M,
    BALL_RADIUS_M,
    GRAVITY_M_S2, PHYSICS_DT,
    VELOCITY_SCALE_M_S, VELOCITY_BASELINE_M_S, SHOT_ELEVATION_RAD,
    MIN_ANGLE_RAD, MAX_ANGLE_RAD, MIN_POWER, MAX_POWER,
    MIN_ELEVATION_RAD, MAX_ELEVATION_RAD,
    RIM_BOUNCE_FACTOR, RIM_TANGENT_FRICTION_MU,
    BACKBOARD_BOUNCE_FACTOR, BACKBOARD_TANGENT_FRICTION_MU,
    AIR_DRAG_PER_STEP,
    INITIAL_BACKSPIN_HZ, BALL_MOI_FACTOR,
    FLOOR_Y_M,
} from './data/constants.js';
import { backboardOffsetX, backboardOffsetAtPhase, frequencyForShot } from './backboard.js';

/**
 * Basketball Hoops — CLIENT MIRROR of server 3D physics.
 *
 * Exact functional copy of server/services/games/basketball/physics.js
 * with the import path adjusted. Used by the bridge so the offline v0
 * prototype matches what the server will return at Phase 4 integration.
 */

const MAX_TRAJECTORY_STEPS = 600;

export function validateShotInput({ angle, power, elevation }) {
    if (typeof angle !== 'number' || !Number.isFinite(angle)) return 'angle_invalid';
    if (typeof power !== 'number' || !Number.isFinite(power)) return 'power_invalid';
    if (angle < MIN_ANGLE_RAD || angle > MAX_ANGLE_RAD) return 'angle_out_of_range';
    if (power < MIN_POWER || power > MAX_POWER) return 'power_out_of_range';
    if (elevation !== undefined && elevation !== null) {
        if (typeof elevation !== 'number' || !Number.isFinite(elevation)) return 'elevation_invalid';
        if (elevation < MIN_ELEVATION_RAD || elevation > MAX_ELEVATION_RAD) return 'elevation_out_of_range';
    }
    return null;
}

export function simulateShot({ angle, power, elevation, attemptSeed, shotIndex, shotStartT = 0, motionStartT = 0, rimPhaseAtShotStart = null }) {
    const err = validateShotInput({ angle, power, elevation });
    if (err) {
        return { result: 'invalid', reason: err, trajectory: [], hitBackboard: false, hitRim: false };
    }

    const elev = (elevation === undefined || elevation === null) ? SHOT_ELEVATION_RAD : elevation;
    // Baseline+linear power-to-velocity (mirrors server).
    const powerNorm = (power - MIN_POWER) / (MAX_POWER - MIN_POWER);
    const v = VELOCITY_BASELINE_M_S + powerNorm * (VELOCITY_SCALE_M_S - VELOCITY_BASELINE_M_S);
    const vyInit = v * Math.sin(elev);
    const vHoriz = v * Math.cos(elev);
    let vx = vHoriz * Math.sin(angle);
    let vy = vyInit;
    let vz = vHoriz * Math.cos(angle);

    // Initial backspin (mirrors server). Spin axis perpendicular to
    // horizontal flight direction; top of ball rotates against motion.
    const omegaMag = 2 * Math.PI * INITIAL_BACKSPIN_HZ;
    const vh0 = Math.sqrt(vx * vx + vz * vz);
    let ox = vh0 > 1e-6 ? -omegaMag * (vz / vh0) : 0;
    let oy = 0;
    let oz = vh0 > 1e-6 ?  omegaMag * (vx / vh0) : 0;

    let x = BALL_RELEASE_LATERAL_M;
    let y = BALL_RELEASE_HEIGHT_M;
    let z = BALL_RELEASE_FORWARD_M;

    const trajectory = [{ x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz) }];
    // Events captured during simulation so the client can fire sound
    // effects + net animation at the right moment in playback.
    const events = [];

    let hitBackboard = false;
    let hitRim = false;
    let scored = false;
    // Set true when the ball's centre crosses the rim plane within
    // the cleanZone — drives swish-vs-rim_in classification.
    let cleanCross = false;

    // Per-shot rim frequency (constant during the shot). When the
    // caller supplied a phase snapshot, use phase-based motion so the
    // rim stays phase-continuous across tier-boundary speed changes.
    const shotFreqHz = frequencyForShot(shotIndex);
    const phaseRatePerStep = 2 * Math.PI * shotFreqHz * PHYSICS_DT;

    for (let step = 1; step <= MAX_TRAJECTORY_STEPS; step++) {
        const t = step * PHYSICS_DT;
        let rigOffset;
        if (rimPhaseAtShotStart !== null) {
            const phase = rimPhaseAtShotStart + step * phaseRatePerStep;
            rigOffset = backboardOffsetAtPhase(shotIndex, phase);
        } else {
            const motionT = (shotStartT - motionStartT) + t;
            rigOffset = backboardOffsetX(attemptSeed, shotIndex, motionT);
        }
        const rimX = RIM_X_BASE_M + rigOffset;
        const bbX = BACKBOARD_X_BASE_M + rigOffset;

        const prevY = y;
        const prevZ = z;
        const prevX = x;
        vy -= GRAVITY_M_S2 * PHYSICS_DT;
        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;
        z += vz * PHYSICS_DT;

        // --- Rim torus collision ---
        const dx = x - rimX;
        const dz = z - RIM_FORWARD_M;
        const horizDist = Math.sqrt(dx * dx + dz * dz);
        if (horizDist > 1e-6) {
            const ringPx = rimX + (RIM_INNER_RADIUS_M * dx / horizDist);
            const ringPz = RIM_FORWARD_M + (RIM_INNER_RADIUS_M * dz / horizDist);
            const ringPy = RIM_HEIGHT_M;
            const ddx = x - ringPx;
            const ddy = y - ringPy;
            const ddz = z - ringPz;
            const distSq = ddx * ddx + ddy * ddy + ddz * ddz;
            const minDist = BALL_RADIUS_M + RIM_TUBE_RADIUS_M;
            if (distSq < minDist * minDist) {
                const dist = Math.sqrt(distSq) || 1e-6;
                const nx = ddx / dist;
                const ny = ddy / dist;
                const nz = ddz / dist;
                // Spin-coupled rim contact — mirrors server. Friction
                // is computed against the *contact-point* velocity
                // (linear + ω × r) and updates both linear and angular
                // velocity. See server physics.js for the full
                // derivation.
                const rcX = -BALL_RADIUS_M * nx;
                const rcY = -BALL_RADIUS_M * ny;
                const rcZ = -BALL_RADIUS_M * nz;
                const spinVx = oy * rcZ - oz * rcY;
                const spinVy = oz * rcX - ox * rcZ;
                const spinVz = ox * rcY - oy * rcX;
                const vcx = vx + spinVx;
                const vcy = vy + spinVy;
                const vcz = vz + spinVz;

                const dot = vx * nx + vy * ny + vz * nz;
                const vtx = vcx - dot * nx;
                const vty = vcy - dot * ny;
                const vtz = vcz - dot * nz;
                const vtMag = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);

                const newVnx = -RIM_BOUNCE_FACTOR * dot * nx;
                const newVny = -RIM_BOUNCE_FACTOR * dot * ny;
                const newVnz = -RIM_BOUNCE_FACTOR * dot * nz;

                const frictionImpulseMag = Math.min(
                    vtMag,
                    RIM_TANGENT_FRICTION_MU * Math.abs(dot) * (1 + RIM_BOUNCE_FACTOR),
                );
                let Jfx = 0, Jfy = 0, Jfz = 0;
                if (vtMag > 1e-9) {
                    const k = -frictionImpulseMag / vtMag;
                    Jfx = vtx * k;
                    Jfy = vty * k;
                    Jfz = vtz * k;
                }
                vx = (vx - dot * nx) + newVnx + Jfx;
                vy = (vy - dot * ny) + newVny + Jfy;
                vz = (vz - dot * nz) + newVnz + Jfz;

                const Iinv = 1 / (BALL_MOI_FACTOR * BALL_RADIUS_M * BALL_RADIUS_M);
                ox += (rcY * Jfz - rcZ * Jfy) * Iinv;
                oy += (rcZ * Jfx - rcX * Jfz) * Iinv;
                oz += (rcX * Jfy - rcY * Jfx) * Iinv;
                x = ringPx + nx * (minDist + 0.001);
                y = ringPy + ny * (minDist + 0.001);
                z = ringPz + nz * (minDist + 0.001);
                hitRim = true;
                events.push({ step, type: 'rim' });
            }
        }

        // --- Backboard front-face collision (swept + spin-coupled) ---
        // Rebuilt to mirror the rim contact: swept detection against
        // the ball-centre contact plane (fast banks no longer tunnel
        // through the board), normal/tangential decomposition using the
        // contact-point velocity (v + ω×r), Coulomb friction across the
        // full x-y tangent plane, and an angular-impulse update.
        // Supersedes the old `vz = -|vz|·BOUNCE` + vx-only damping. The
        // "vy unchanged" caveat in PHYSICS_RESEARCH.md §5 Rec 3 / §6 Q3
        // applied to the pre-spin model — a spin-coupled impulse
        // necessarily resolves across the whole tangent plane, which is
        // what gives banks a correct deflection angle instead of the
        // old "every bank looks identical" behaviour.
        const bbContactZ = BACKBOARD_Z_M - BALL_RADIUS_M;
        if (vz > 0 && prevZ < bbContactZ && z >= bbContactZ) {
            // Ball centre crossed the front-face contact plane this
            // step. Interpolate the crossing so the in-bounds test and
            // the repositioning are tunnelling-proof.
            const span = z - prevZ;
            const tCross = span > 1e-9 ? (bbContactZ - prevZ) / span : 0;
            const hitX = prevX + (x - prevX) * tCross;
            const hitY = prevY + (y - prevY) * tCross;
            // STRICT bounds — ball CENTRE must be inside the board.
            // The previous +BALL_RADIUS_M margin was physically motivated
            // (ball edge grazes the board edge → corner contact) but
            // the visual result was misses-that-look-over still
            // bouncing back. Fish's call: balls that visually clear
            // the board fly past. Edge-graze realism trades against
            // miss readability; readability wins here.
            const inX = Math.abs(hitX - bbX) <= BACKBOARD_HALF_WIDTH_M;
            const inY = hitY >= BACKBOARD_BOTTOM_Y_M && hitY <= BACKBOARD_TOP_Y_M;
            if (inX && inY) {
                // Front-face outward normal points back toward the
                // player; the contact point is on the ball's +z side.
                const nx = 0, ny = 0, nz = -1;
                const rcX = -BALL_RADIUS_M * nx;
                const rcY = -BALL_RADIUS_M * ny;
                const rcZ = -BALL_RADIUS_M * nz;
                const spinVx = oy * rcZ - oz * rcY;
                const spinVy = oz * rcX - ox * rcZ;
                const spinVz = ox * rcY - oy * rcX;
                const vcx = vx + spinVx;
                const vcy = vy + spinVy;
                const vcz = vz + spinVz;

                const dot = vx * nx + vy * ny + vz * nz;
                const vtx = vcx - dot * nx;
                const vty = vcy - dot * ny;
                const vtz = vcz - dot * nz;
                const vtMag = Math.sqrt(vtx * vtx + vty * vty + vtz * vtz);

                const newVnx = -BACKBOARD_BOUNCE_FACTOR * dot * nx;
                const newVny = -BACKBOARD_BOUNCE_FACTOR * dot * ny;
                const newVnz = -BACKBOARD_BOUNCE_FACTOR * dot * nz;

                const frictionImpulseMag = Math.min(
                    vtMag,
                    BACKBOARD_TANGENT_FRICTION_MU * Math.abs(dot) * (1 + BACKBOARD_BOUNCE_FACTOR),
                );
                let Jfx = 0, Jfy = 0, Jfz = 0;
                if (vtMag > 1e-9) {
                    const k = -frictionImpulseMag / vtMag;
                    Jfx = vtx * k;
                    Jfy = vty * k;
                    Jfz = vtz * k;
                }
                // PHYSICS_RESEARCH.md §5 Rec 3 / §6 Q3: leave vy
                // UNCHANGED by backboard friction. The earlier spin-
                // coupled rebuild applied friction to the full tangent
                // plane, which killed the descent gravity needs to drop
                // bank shots into the rim — centred banks in the lower
                // 75% of the board should drop, and don't unless vy
                // passes through. Restoring the research-recommended
                // behaviour for the backboard. (Rim still uses the
                // full spin-coupled impulse — different surface, real
                // basketballs DO grip the rim much more than glass.)
                Jfy = 0;
                vx = (vx - dot * nx) + newVnx + Jfx;
                vy = (vy - dot * ny) + newVny + Jfy;
                vz = (vz - dot * nz) + newVnz + Jfz;

                const Iinv = 1 / (BALL_MOI_FACTOR * BALL_RADIUS_M * BALL_RADIUS_M);
                ox += (rcY * Jfz - rcZ * Jfy) * Iinv;
                oy += (rcZ * Jfx - rcX * Jfz) * Iinv;
                oz += (rcX * Jfy - rcY * Jfx) * Iinv;

                // Snap to the contact point — undoes any single-step
                // tunnelling past the board face.
                x = hitX;
                y = hitY;
                z = bbContactZ - 0.001;
                if (!hitBackboard) events.push({ step, type: 'backboard' });
                hitBackboard = true;

                // Shooter's-square auto-guide. A board hit INSIDE the
                // painted red rectangle overrides the post-bounce
                // velocity to free-fall from the hit point into the
                // rim centre — the iconic "bank off the square"
                // almost-always-goes-in shot. Skill stays in HITTING
                // the rectangle; reward is reliability.
                if (hitY > SHOOTER_SQUARE_BOTTOM_Y_M
                    && hitY < SHOOTER_SQUARE_TOP_Y_M
                    && Math.abs(hitX - bbX) < SHOOTER_SQUARE_HALF_WIDTH_M
                    && hitY > RIM_HEIGHT_M + 0.05) {
                    // Free-fall time from hit Y to rim height — gives
                    // a natural gravity-driven drop with vy = 0 at the
                    // board. The lateral + depth velocities carry the
                    // ball over to the rim in the same time T.
                    const dropDist = hitY - RIM_HEIGHT_M;
                    const T = Math.sqrt(2 * dropDist / GRAVITY_M_S2);
                    if (T > 1e-3) {
                        vx = (rimX - hitX) / T;
                        vy = 0;
                        vz = (RIM_FORWARD_M - z) / T;
                        ox = 0; oy = 0; oz = 0;
                    }
                }
            }
        }

        // --- Score detection (v0.5: forgiving "rim friendly" zone) ---
        if (!scored && prevY > RIM_HEIGHT_M && y <= RIM_HEIGHT_M && vy < 0) {
            const t01 = (prevY - RIM_HEIGHT_M) / (prevY - y || 1e-9);
            const crossX = prevX + (x - prevX) * t01;
            const crossZ = prevZ + (z - prevZ) * t01;
            const crossDx = crossX - rimX;
            const crossDz = crossZ - RIM_FORWARD_M;
            const crossHoriz = Math.sqrt(crossDx * crossDx + crossDz * crossDz);
            // Mirrors server. Widened to rim_r + ball_r/2 so descending
            // crosses within half-a-ball past the rim ring read as swish.
            const cleanZone = RIM_INNER_RADIUS_M + BALL_RADIUS_M * 0.5;
            const outerZone = RIM_INNER_RADIUS_M + BALL_RADIUS_M * 1.3;
            // Mirrors server. Latches cleanCross on any descending
            // cross within cleanZone so post-rattle centred drops
            // still classify as swishes.
            const isClean = crossHoriz <= cleanZone;
            if (isClean) cleanCross = true;
            if (!scored && crossHoriz <= outerZone) {
                const willScore = isClean || hitRim || hitBackboard;
                if (willScore) {
                    events.push({ step, type: 'score' });
                }
                scored = willScore;
            }
        }

        // --- Air drag --- linear + angular (mirrors server)
        vx *= AIR_DRAG_PER_STEP;
        vy *= AIR_DRAG_PER_STEP;
        vz *= AIR_DRAG_PER_STEP;
        ox *= AIR_DRAG_PER_STEP;
        oy *= AIR_DRAG_PER_STEP;
        oz *= AIR_DRAG_PER_STEP;

        // --- Termination ---
        // Floor-touch terminates first. The z/x cuts below catch
        // way-off shots so they don't simulate for 3+ s (which
        // emptied the strict 4-ball rack and felt like "can't flick").
        // Thresholds are MUCH looser than the old z>BACKBOARD_Z_M+1.0
        // / |x-rimX|>2.0 cuts: the ball still visibly travels past the
        // cage wall before terminating; we just don't simulate all the
        // way to the floor 7-8 m back.
        if (y <= FLOOR_Y_M + BALL_RADIUS_M) {
            trajectory.push({ x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz) });
            return classifyOutcome({ scored, hitBackboard, hitRim, cleanCross, x, y, z, rimX, trajectory, events });
        }
        if (z > BACKBOARD_Z_M + 2.5) {
            trajectory.push({ x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz) });
            return classifyOutcome({ scored, hitBackboard, hitRim, cleanCross, x, y, z, rimX, trajectory, events });
        }
        if (Math.abs(x - rimX) > 3.0) {
            trajectory.push({ x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz) });
            return classifyOutcome({ scored, hitBackboard, hitRim, cleanCross, x, y, z, rimX, trajectory, events });
        }

        trajectory.push({ x: r3(x), y: r3(y), z: r3(z), vx: r3(vx), vy: r3(vy), vz: r3(vz) });
    }

    return classifyOutcome({ scored, hitBackboard, hitRim, cleanCross, x, y, z, rimX: RIM_X_BASE_M, trajectory });
}

function classifyOutcome({ scored, hitBackboard, hitRim, cleanCross, x, y, z, rimX, trajectory, events }) {
    if (scored) {
        let result;
        if (hitBackboard) result = 'bank_in';
        else if (cleanCross) result = 'swish';
        else result = 'rim_in';
        return { result, trajectory, hitBackboard, hitRim, events };
    }
    if (hitBackboard) return { result: 'bank_out', trajectory, hitBackboard, hitRim, events };
    if (hitRim) return { result: 'rim_out', trajectory, hitBackboard, hitRim, events };
    if (z < RIM_FORWARD_M - RIM_INNER_RADIUS_M) {
        return { result: 'short', trajectory, hitBackboard, hitRim, events };
    }
    if (z > BACKBOARD_Z_M) {
        return { result: 'long', trajectory, hitBackboard, hitRim, events };
    }
    return { result: 'wide', trajectory, hitBackboard, hitRim, events };
}

function r3(v) { return Math.round(v * 1000) / 1000; }
