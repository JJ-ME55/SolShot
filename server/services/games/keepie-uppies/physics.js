import {
    BALL_RADIUS_M,
    HITBOX_RADIUS_M,
    GRAVITY_M_S2,
    MAGNUS_COEFFICIENT,
    BASE_UP_M_S,
    LATERAL_GAIN,
    VERTICAL_GAIN,
    SPIN_GAIN,
    WALL_RESTITUTION,
    DEFAULT_WORLD_WIDTH_M,
    FLOOR_Y_M,
    PHYSICS_DT_S,
    MAX_FLIGHT_STEPS,
    BALL_START_X_FRAC,
    BALL_START_Y_M,
} from './constants.js';

/**
 * Keepie-Uppies — server-side 2D physics + scoring (v0.1)
 *
 * Simulates a single attempt as a deterministic replay of the player's
 * tap event log. Per design: tap inside ball hitbox → score++ +
 * velocity/spin reset; tap outside → silently ignored; floor contact →
 * game over.
 *
 * Coordinate system (right-handed, 2D):
 *   x = lateral (right is +x), bounds [0, worldWidth]
 *   y = vertical (up is +y), floor at y=0, no ceiling
 *
 * Magnus force in 2D: F = C_M * (ω × v) where ω is scalar (signed,
 * ccw positive). Component form:
 *   F.x = -C_M * ω * v.y
 *   F.y =  C_M * ω * v.x
 */

// ─── input validation ───────────────────────────────────────────────

export function validateRoundInput(input) {
    if (input == null || typeof input !== 'object') return 'input_invalid';

    const { seed, tapEvents, worldWidth } = input;

    if (!Number.isFinite(seed)) return 'seed_invalid';

    if (!Array.isArray(tapEvents)) return 'tap_events_invalid';
    if (tapEvents.length > MAX_FLIGHT_STEPS) return 'tap_events_too_many';

    let lastTimestamp = -Infinity;
    for (let i = 0; i < tapEvents.length; i++) {
        const e = tapEvents[i];
        if (e == null || typeof e !== 'object') return 'tap_event_invalid';
        if (!Number.isFinite(e.tapX)) return 'tap_x_invalid';
        if (!Number.isFinite(e.tapY)) return 'tap_y_invalid';
        if (!Number.isFinite(e.timestamp)) return 'tap_timestamp_invalid';
        if (e.timestamp < lastTimestamp) return 'tap_timestamps_non_monotonic';
        if (e.timestamp < 0) return 'tap_timestamp_negative';
        lastTimestamp = e.timestamp;
    }

    if (worldWidth !== undefined) {
        if (!Number.isFinite(worldWidth)) return 'world_width_invalid';
        if (worldWidth <= 2 * BALL_RADIUS_M) return 'world_width_too_small';
    }

    return null;
}

// ─── tap-impulse model ──────────────────────────────────────────────

/**
 * Pure function: given the current ball state and a tap point, return
 * the post-tap velocity and spin. Velocity and spin are FULLY REPLACED
 * (not added to). Tap dead-centre → straight up at BASE_UP, spin 0.
 *
 * Caller is responsible for checking the tap is inside the hitbox
 * BEFORE calling this — applyTap doesn't validate (so it's pure
 * arithmetic, easy to test).
 */
export function applyTap(ballX, ballY, tapX, tapY) {
    const offsetX = tapX - ballX;
    const offsetY = tapY - ballY;
    const offsetX_norm = offsetX / BALL_RADIUS_M;
    const offsetY_norm = offsetY / BALL_RADIUS_M;

    return {
        vx: -offsetX_norm * LATERAL_GAIN,
        vy: BASE_UP_M_S - offsetY_norm * VERTICAL_GAIN,
        spin: offsetX_norm * SPIN_GAIN,
    };
}

/**
 * Hit test — is the tap point inside the ball's hitbox?
 * Hitbox is inflated 20% over visual radius for mobile forgiveness.
 */
export function isTapInsideHitbox(ballX, ballY, tapX, tapY) {
    const dx = tapX - ballX;
    const dy = tapY - ballY;
    return dx * dx + dy * dy <= HITBOX_RADIUS_M * HITBOX_RADIUS_M;
}

// ─── core simulation ────────────────────────────────────────────────

/**
 * simulateRound — deterministic replay of an attempt.
 *
 * @param {object} input
 * @param {number} input.seed — reserved for future randomness (unused v0.1)
 * @param {Array<{tapX, tapY, timestamp}>} input.tapEvents — sorted by timestamp
 * @param {number} [input.worldWidth] — playfield width in metres
 *
 * @returns {{
 *   score: number,
 *   terminationReason: 'floor' | 'max_steps' | 'invalid',
 *   terminationStep: number,
 *   ballPath: Array<{x, y, vx, vy, spin, step}>,  // sampled trajectory
 *   missedTapCount: number,
 *   reason?: string  // present when terminationReason === 'invalid'
 * }}
 */
export function simulateRound(input) {
    const validationError = validateRoundInput(input);
    if (validationError) {
        return {
            score: 0,
            terminationReason: 'invalid',
            terminationStep: 0,
            ballPath: [],
            missedTapCount: 0,
            reason: validationError,
        };
    }

    const tapEvents = input.tapEvents;
    const worldWidth = input.worldWidth ?? DEFAULT_WORLD_WIDTH_M;

    // Ball state.
    let x = worldWidth * BALL_START_X_FRAC;
    let y = BALL_START_Y_M;
    let vx = 0;
    let vy = 0;
    let spin = 0;

    // Trajectory sampling — record state every TRAJECTORY_SAMPLE_INTERVAL steps
    // to keep ballPath manageable. Always record taps and termination.
    const TRAJECTORY_SAMPLE_INTERVAL = 6;  // 6 steps @ 120Hz = 50ms
    const ballPath = [];
    const recordSample = (step) => {
        ballPath.push({ x, y, vx, vy, spin, step });
    };
    recordSample(0);

    let score = 0;
    let missedTapCount = 0;
    let nextTapIdx = 0;
    const floorContactY = FLOOR_Y_M + BALL_RADIUS_M;

    for (let step = 1; step <= MAX_FLIGHT_STEPS; step++) {
        const t = step * PHYSICS_DT_S;

        // Process any tap events that fire at or before this step's time.
        // Multiple taps in the same step window get processed in order;
        // each replaces velocity/spin in turn (last one wins, in practice).
        while (nextTapIdx < tapEvents.length && tapEvents[nextTapIdx].timestamp <= t) {
            const ev = tapEvents[nextTapIdx];
            nextTapIdx++;

            if (isTapInsideHitbox(x, y, ev.tapX, ev.tapY)) {
                const impulse = applyTap(x, y, ev.tapX, ev.tapY);
                vx = impulse.vx;
                vy = impulse.vy;
                spin = impulse.spin;
                score++;
                ballPath.push({ x, y, vx, vy, spin, step, tap: 'hit' });
            } else {
                missedTapCount++;
            }
        }

        // Capture pre-integration position for swept floor detection.
        const prevY = y;

        // Apply forces: gravity + Magnus.
        // Acceleration form: a_magnus = (-C_M * ω * vy, +C_M * ω * vx)
        const aMagnusX = -MAGNUS_COEFFICIENT * spin * vy;
        const aMagnusY = MAGNUS_COEFFICIENT * spin * vx;

        vx += aMagnusX * PHYSICS_DT_S;
        vy += (aMagnusY - GRAVITY_M_S2) * PHYSICS_DT_S;

        // Integrate position.
        x += vx * PHYSICS_DT_S;
        y += vy * PHYSICS_DT_S;

        // Wall collisions (elastic, instant). Clamp position + flip vx.
        if (x < BALL_RADIUS_M) {
            x = BALL_RADIUS_M;
            vx = -vx * WALL_RESTITUTION;
        } else if (x > worldWidth - BALL_RADIUS_M) {
            x = worldWidth - BALL_RADIUS_M;
            vx = -vx * WALL_RESTITUTION;
        }

        // Floor — swept detection. Game over if ball-bottom crosses floor.
        if (vy < 0 && prevY > floorContactY && y <= floorContactY) {
            // Snap to contact and end.
            y = floorContactY;
            recordSample(step);
            return {
                score,
                terminationReason: 'floor',
                terminationStep: step,
                ballPath,
                missedTapCount,
            };
        }

        if (step % TRAJECTORY_SAMPLE_INTERVAL === 0) recordSample(step);
    }

    // Hit MAX_FLIGHT_STEPS without floor contact — defensive cap.
    recordSample(MAX_FLIGHT_STEPS);
    return {
        score,
        terminationReason: 'max_steps',
        terminationStep: MAX_FLIGHT_STEPS,
        ballPath,
        missedTapCount,
    };
}
