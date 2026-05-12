import {
    BALL_START_X, BALL_START_Y, BALL_RADIUS,
    MIN_ANGLE_RAD, MAX_ANGLE_RAD, MIN_POWER, MAX_POWER,
    FLICK_DISTANCE_FOR_FULL_POWER, FLICK_REFERENCE_TIME_SEC,
    FLICK_MIN_DURATION_SEC, FLICK_MAX_DURATION_SEC,
    COLORS,
} from '../data/constants.js';

/**
 * Touch flick input — mobile primary input scheme.
 *
 * Player presses on the ball (or near it), drags upward, releases.
 *  - Direction of the flick (from start to release) = shot angle
 *  - Speed of the flick (distance / time) = shot power
 *
 * While dragging, a faint trail follows the finger so the player can
 * see what they're committing to. On release we compute (angle, power)
 * and call the supplied onShot callback.
 *
 * Angles outside ±60° from vertical are clamped to the bounds. Flicks
 * that are too slow or too fast are ignored as not-a-shot.
 *
 * @param {Phaser.Scene} scene
 * @param {(shot: { angle: number, power: number }) => void} onShot
 * @returns {() => void} detach function — call to remove listeners
 */
export function attachTouchFlick(scene, onShot) {
    let trackingPointerId = null;
    let startX = 0;
    let startY = 0;
    let startTimeMs = 0;
    const trail = scene.add.graphics();

    function isNearBall(x, y) {
        const dx = x - BALL_START_X;
        const dy = y - BALL_START_Y;
        return (dx * dx + dy * dy) <= (BALL_RADIUS * 4) * (BALL_RADIUS * 4);
    }

    function onDown(pointer) {
        if (trackingPointerId !== null) return;
        if (!isNearBall(pointer.x, pointer.y)) return;
        trackingPointerId = pointer.id;
        startX = pointer.x;
        startY = pointer.y;
        startTimeMs = pointer.downTime || performance.now();
        trail.clear();
    }

    function onMove(pointer) {
        if (pointer.id !== trackingPointerId) return;
        trail.clear();
        trail.lineStyle(4, COLORS.flickTrail, 0.7);
        trail.beginPath();
        trail.moveTo(startX, startY);
        trail.lineTo(pointer.x, pointer.y);
        trail.strokePath();
    }

    function onUp(pointer) {
        if (pointer.id !== trackingPointerId) return;
        const endX = pointer.x;
        const endY = pointer.y;
        const dx = endX - startX;
        const dy = endY - startY;
        const endTimeMs = pointer.upTime || performance.now();
        const dtSec = Math.max(0.001, (endTimeMs - startTimeMs) / 1000);

        trackingPointerId = null;
        trail.clear();

        // Only forward-and-up flicks count. dy must be negative (toward
        // the top of the screen) since up is -y.
        if (dy >= 0) return;
        if (dtSec < FLICK_MIN_DURATION_SEC || dtSec > FLICK_MAX_DURATION_SEC) return;

        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 30) return; // too small to be a flick

        // Angle from vertical, positive = right
        const angle = clamp(Math.atan2(dx, -dy), MIN_ANGLE_RAD, MAX_ANGLE_RAD);

        // Power based on flick speed normalized against reference
        const speed = distance / dtSec;
        const referenceSpeed = FLICK_DISTANCE_FOR_FULL_POWER / FLICK_REFERENCE_TIME_SEC;
        const power = clamp(speed / referenceSpeed, MIN_POWER, MAX_POWER);

        onShot({ angle, power });
    }

    scene.input.on('pointerdown', onDown);
    scene.input.on('pointermove', onMove);
    scene.input.on('pointerup', onUp);
    scene.input.on('pointerupoutside', onUp);

    return () => {
        scene.input.off('pointerdown', onDown);
        scene.input.off('pointermove', onMove);
        scene.input.off('pointerup', onUp);
        scene.input.off('pointerupoutside', onUp);
        trail.destroy();
    };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
