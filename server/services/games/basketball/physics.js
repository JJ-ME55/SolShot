import {
    VIRTUAL_WIDTH, VIRTUAL_HEIGHT,
    BALL_RADIUS, BALL_START_X, BALL_START_Y,
    HOOP_X_BASE, HOOP_Y, HOOP_INNER_WIDTH, RIM_CIRCLE_RADIUS,
    BACKBOARD_X_BASE, BACKBOARD_Y, BACKBOARD_WIDTH, BACKBOARD_HEIGHT,
    GRAVITY, VELOCITY_SCALE, PHYSICS_DT, MAX_TRAJECTORY_STEPS,
    BACKBOARD_BOUNCE_FACTOR, RIM_BOUNCE_FACTOR,
    MIN_ANGLE_RAD, MAX_ANGLE_RAD, MIN_POWER, MAX_POWER,
} from './constants.js';
import { backboardOffsetX } from './backboard.js';

/**
 * Basketball Hoops — server-side physics + collision
 *
 * Simulates a single shot:
 *  - input:   { angle, power } encoded by the client (flick on mobile,
 *             mouse arrow on desktop — same encoding)
 *  - process: deterministic trajectory under gravity, collision against
 *             rim circles + backboard rect (both moving with the
 *             backboard offset for this shotIndex), score-line check
 *             when the ball crosses the hoop plane
 *  - output:  { result, trajectory, hitBackboard, hitRim }
 *
 * result ∈
 *   'swish'   — passed through rim, no rim/backboard contact
 *   'rim_in'  — went in but grazed a rim
 *   'bank_in' — bounced off backboard and went in
 *   'rim_out' — rim contact but didn't go in
 *   'bank_out'— backboard contact but didn't go in
 *   'airball' — no contact, didn't reach the hoop
 *   'invalid' — input failed validation
 *
 * The integrity invariant: same inputs always produce the same outputs.
 * Required for fair wagered matches and for the server to be the sole
 * judge of whether a shot scored.
 */

/**
 * Validate shot input. Returns null on success, an error string on
 * failure so callers can route back to the client.
 */
export function validateShotInput({ angle, power }) {
    if (typeof angle !== 'number' || !Number.isFinite(angle)) return 'angle_invalid';
    if (typeof power !== 'number' || !Number.isFinite(power)) return 'power_invalid';
    if (angle < MIN_ANGLE_RAD || angle > MAX_ANGLE_RAD) return 'angle_out_of_range';
    if (power < MIN_POWER || power > MAX_POWER) return 'power_out_of_range';
    return null;
}

/**
 * Simulate one shot. Pure — same inputs always produce identical output.
 *
 * @param {object} params
 * @param {number} params.angle - radians from vertical (positive = right)
 * @param {number} params.power - normalized [0, 1]
 * @param {number} params.attemptSeed - drives backboard motion
 * @param {number} params.shotIndex - 0-indexed shot within attempt
 * @returns {{
 *   result: string,
 *   trajectory: Array<{x:number, y:number, vx:number, vy:number}>,
 *   hitBackboard: boolean,
 *   hitRim: boolean,
 *   reason?: string,
 * }}
 */
export function simulateShot({ angle, power, attemptSeed, shotIndex }) {
    const validationError = validateShotInput({ angle, power });
    if (validationError) {
        return { result: 'invalid', reason: validationError, trajectory: [], hitBackboard: false, hitRim: false };
    }

    const velocity = power * VELOCITY_SCALE;
    let vx = velocity * Math.sin(angle);
    let vy = -velocity * Math.cos(angle); // up = -y in screen space
    let x = BALL_START_X;
    let y = BALL_START_Y;
    let prevX = x;
    let prevY = y;

    const trajectory = [{ x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy) }];

    let hitBackboard = false;
    let hitRim = false;
    let crossedHoopPlane = false;

    for (let step = 1; step <= MAX_TRAJECTORY_STEPS; step++) {
        const t = step * PHYSICS_DT;
        const tPrev = (step - 1) * PHYSICS_DT;

        prevX = x;
        prevY = y;

        // Euler step
        vy += GRAVITY * PHYSICS_DT;
        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;

        // Backboard + hoop x-offset at this moment (moves the whole rig)
        const hoopOffset = backboardOffsetX(attemptSeed, shotIndex, t);
        const hoopXNow = HOOP_X_BASE + hoopOffset;
        const backboardXNow = BACKBOARD_X_BASE + hoopOffset;

        // --- Out-of-bounds check ---
        if (x - BALL_RADIUS < 0
            || x + BALL_RADIUS > VIRTUAL_WIDTH
            || y > VIRTUAL_HEIGHT) {
            trajectory.push({ x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy) });
            return finishMiss(trajectory, hitBackboard, hitRim);
        }

        // --- Backboard collision ---
        if (intersectsBackboard(x, y, BALL_RADIUS, backboardXNow)) {
            const leftEdge = backboardXNow - BACKBOARD_WIDTH / 2;
            const rightEdge = backboardXNow + BACKBOARD_WIDTH / 2;
            const topEdge = BACKBOARD_Y - BACKBOARD_HEIGHT / 2;
            const bottomEdge = BACKBOARD_Y + BACKBOARD_HEIGHT / 2;

            const penLeft = (x + BALL_RADIUS) - leftEdge;
            const penRight = rightEdge - (x - BALL_RADIUS);
            const penTop = (y + BALL_RADIUS) - topEdge;
            const penBottom = bottomEdge - (y - BALL_RADIUS);
            const minPen = Math.min(penLeft, penRight, penTop, penBottom);

            if (minPen === penTop) {
                vy = -Math.abs(vy) * BACKBOARD_BOUNCE_FACTOR;
                y = topEdge - BALL_RADIUS - 1;
            } else if (minPen === penBottom) {
                vy = Math.abs(vy) * BACKBOARD_BOUNCE_FACTOR;
                y = bottomEdge + BALL_RADIUS + 1;
            } else if (minPen === penLeft) {
                vx = -Math.abs(vx) * BACKBOARD_BOUNCE_FACTOR;
                x = leftEdge - BALL_RADIUS - 1;
            } else {
                vx = Math.abs(vx) * BACKBOARD_BOUNCE_FACTOR;
                x = rightEdge + BALL_RADIUS + 1;
            }
            hitBackboard = true;
        }

        // --- Rim collision (two pole circles at the rim ends) ---
        const leftRimX = hoopXNow - HOOP_INNER_WIDTH / 2;
        const rightRimX = hoopXNow + HOOP_INNER_WIDTH / 2;
        for (const rimX of [leftRimX, rightRimX]) {
            const dx = x - rimX;
            const dy = y - HOOP_Y;
            const dist2 = dx * dx + dy * dy;
            const minDist = BALL_RADIUS + RIM_CIRCLE_RADIUS;
            if (dist2 < minDist * minDist) {
                const dist = Math.sqrt(dist2) || 0.0001;
                const nx = dx / dist;
                const ny = dy / dist;
                const dot = vx * nx + vy * ny;
                vx = (vx - 2 * dot * nx) * RIM_BOUNCE_FACTOR;
                vy = (vy - 2 * dot * ny) * RIM_BOUNCE_FACTOR;
                x = rimX + nx * (minDist + 0.5);
                y = HOOP_Y + ny * (minDist + 0.5);
                hitRim = true;
            }
        }

        // --- Score-line crossing (ball crosses y=HOOP_Y moving down, between rims) ---
        if (!crossedHoopPlane && prevY < HOOP_Y && y >= HOOP_Y && vy > 0) {
            // Interpolate to find exact crossing x
            const t01 = (HOOP_Y - prevY) / ((y - prevY) || 1e-9);
            const crossingX = prevX + (x - prevX) * t01;
            const tCross = tPrev + (t - tPrev) * t01;
            const hoopOffsetCross = backboardOffsetX(attemptSeed, shotIndex, tCross);
            // Pull the bounds in by the rim circle radius — if the ball
            // is right at the rim circle, it should have been caught by
            // rim collision above, not counted as a clean pass.
            const leftBound = HOOP_X_BASE + hoopOffsetCross - HOOP_INNER_WIDTH / 2 + RIM_CIRCLE_RADIUS;
            const rightBound = HOOP_X_BASE + hoopOffsetCross + HOOP_INNER_WIDTH / 2 - RIM_CIRCLE_RADIUS;
            if (crossingX >= leftBound && crossingX <= rightBound) {
                crossedHoopPlane = true;
            }
        }

        trajectory.push({ x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy) });

        // If we've scored AND the ball is clearly past the rim, stop
        // simulating — the rest is just visual follow-through.
        if (crossedHoopPlane && y > HOOP_Y + BALL_RADIUS * 3) {
            return finishScored(trajectory, hitBackboard, hitRim);
        }
    }

    // Hit the step cap without exiting bounds
    if (crossedHoopPlane) return finishScored(trajectory, hitBackboard, hitRim);
    return finishMiss(trajectory, hitBackboard, hitRim);
}

function finishScored(trajectory, hitBackboard, hitRim) {
    let result;
    if (hitBackboard) result = 'bank_in';
    else if (hitRim) result = 'rim_in';
    else result = 'swish';
    return { result, trajectory, hitBackboard, hitRim };
}

function finishMiss(trajectory, hitBackboard, hitRim) {
    let result;
    if (hitBackboard) result = 'bank_out';
    else if (hitRim) result = 'rim_out';
    else result = 'airball';
    return { result, trajectory, hitBackboard, hitRim };
}

function intersectsBackboard(ballX, ballY, ballR, backboardXNow) {
    const leftEdge = backboardXNow - BACKBOARD_WIDTH / 2;
    const rightEdge = backboardXNow + BACKBOARD_WIDTH / 2;
    const topEdge = BACKBOARD_Y - BACKBOARD_HEIGHT / 2;
    const bottomEdge = BACKBOARD_Y + BACKBOARD_HEIGHT / 2;
    const cx = clamp(ballX, leftEdge, rightEdge);
    const cy = clamp(ballY, topEdge, bottomEdge);
    const dx = ballX - cx;
    const dy = ballY - cy;
    return (dx * dx + dy * dy) < (ballR * ballR);
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }
