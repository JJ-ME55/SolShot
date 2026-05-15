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
    FLOOR_Y_M,
} from './constants.js';

/**
 * Client-mirror physics for live render. Uses the same math as the
 * server's simulateRound, but stepped continuously by the scene's
 * update loop instead of replayed deterministically from an event log.
 *
 * applyTap + isTapInsideHitbox are byte-identical to the server. At
 * handoff (Phase 7) these get diff-checked and reconciled into a single
 * shared module.
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

export function isTapInsideHitbox(ballX, ballY, tapX, tapY) {
    const dx = tapX - ballX;
    const dy = tapY - ballY;
    return dx * dx + dy * dy <= HITBOX_RADIUS_M * HITBOX_RADIUS_M;
}

/**
 * Step the ball forward by `dt` seconds. Mutates `ball` in place
 * (caller passes a fresh ball state each attempt). Returns
 * `{ gameOver: bool }` so the caller can transition state.
 */
export function stepPhysics(ball, worldWidth, dt) {
    const prevY = ball.y;

    // Magnus + gravity
    const aMagnusX = -MAGNUS_COEFFICIENT * ball.spin * ball.vy;
    const aMagnusY = MAGNUS_COEFFICIENT * ball.spin * ball.vx;
    ball.vx += aMagnusX * dt;
    ball.vy += (aMagnusY - GRAVITY_M_S2) * dt;

    // Integrate
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Walls — elastic, instant.
    if (ball.x < BALL_RADIUS_M) {
        ball.x = BALL_RADIUS_M;
        ball.vx = -ball.vx * WALL_RESTITUTION;
    } else if (ball.x > worldWidth - BALL_RADIUS_M) {
        ball.x = worldWidth - BALL_RADIUS_M;
        ball.vx = -ball.vx * WALL_RESTITUTION;
    }

    // Floor — swept detection per playbook ch.4.2.
    const floorContactY = FLOOR_Y_M + BALL_RADIUS_M;
    if (ball.vy < 0 && prevY > floorContactY && ball.y <= floorContactY) {
        ball.y = floorContactY;
        return { gameOver: true };
    }

    return { gameOver: false };
}

/**
 * Fresh ball at idle start position.
 */
export function makeIdleBall(worldWidth, ballStartXFrac, ballStartY) {
    return {
        x: worldWidth * ballStartXFrac,
        y: ballStartY,
        vx: 0,
        vy: 0,
        spin: 0,
    };
}
