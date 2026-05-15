import {
    BALL_RELEASE_HEIGHT_M, BALL_RELEASE_LATERAL_M,
    CAMERA_Y_M, HORIZON_Y_PX, K_NEAR_PX_PER_M, VIRTUAL_WIDTH,
    BALL_RADIUS_M,
    MIN_POWER, MAX_POWER,
    SHOT_ELEVATION_RAD,
    FLICK_DISTANCE_FOR_FULL_POWER, FLICK_REFERENCE_TIME_SEC,
    FLICK_MIN_DURATION_SEC, FLICK_MAX_DURATION_SEC,
    COLORS,
} from '../data/constants.js';

/**
 * Touch flick input — mobile primary scheme (v0.8, variable elevation).
 *
 * Player presses near the ball, flicks upward (toward the hoop),
 * releases. Unlike the desktop pull-back, the flick direction IS the
 * launch direction (no inversion — the finger pushes the ball where
 * you flick).
 *
 *   - Flick speed (distance / time) → power.
 *   - Flick unit vector → 3D launch direction:
 *       world_vx ∝  dx   (right flick → ball right)
 *       world_vy ∝ -dy   (upward flick = screen-up = world-up)
 *       world_vz  = fixed forward baseline, sized so a pure-vertical
 *                   flick reproduces the original 55° elevation.
 *
 * Flicks below ~30 px or outside the duration window are ignored.
 */

function ballScreenPos() {
    return {
        x: VIRTUAL_WIDTH / 2 + BALL_RELEASE_LATERAL_M * K_NEAR_PX_PER_M,
        y: HORIZON_Y_PX - (BALL_RELEASE_HEIGHT_M - CAMERA_Y_M) * K_NEAR_PX_PER_M,
    };
}

export function attachTouchFlick(scene, onShot) {
    const ballScreen = ballScreenPos();
    const ballScreenRadius = BALL_RADIUS_M * K_NEAR_PX_PER_M;
    let tracking = null;
    const trail = scene.add.graphics();

    function isNearBall(px, py) {
        const dx = px - ballScreen.x;
        const dy = py - ballScreen.y;
        return (dx * dx + dy * dy) <= (ballScreenRadius * 4) ** 2;
    }

    function onDown(pointer) {
        // Stale-tracking guard. A missed pointerup — multi-touch
        // (palm/second finger ghosting), focus loss mid-drag, edge-
        // swipe browser gestures — can leave `tracking` set forever
        // because onUp bails when pointer.id !== tracking.id. Without
        // this guard the next flick never registers ("the next ball
        // won't flick, everything else continues" — Fish's stuck-bug
        // symptom). Anything older than a max-duration flick + buffer
        // is dead state; reset it so this onDown can take over.
        if (tracking !== null && performance.now() - tracking.startT > FLICK_MAX_DURATION_SEC * 1000 + 700) {
            tracking = null;
            trail.clear();
        }
        if (tracking !== null) return;
        if (!isNearBall(pointer.x, pointer.y)) return;
        tracking = { id: pointer.id, startX: pointer.x, startY: pointer.y, startT: pointer.downTime || performance.now() };
        trail.clear();
    }

    function onMove(pointer) {
        if (!tracking || pointer.id !== tracking.id) return;
        trail.clear();
        trail.lineStyle(4, COLORS.flickTrail, 0.7);
        trail.beginPath();
        trail.moveTo(tracking.startX, tracking.startY);
        trail.lineTo(pointer.x, pointer.y);
        trail.strokePath();
    }

    function onUp(pointer) {
        if (!tracking || pointer.id !== tracking.id) return;
        const dx = pointer.x - tracking.startX;
        const dy = pointer.y - tracking.startY;
        const endT = pointer.upTime || performance.now();
        const dtSec = Math.max(0.001, (endT - tracking.startT) / 1000);

        tracking = null;
        trail.clear();

        // Only upward flicks count (dy negative = toward top of screen)
        if (dy >= 0) return;
        if (dtSec < FLICK_MIN_DURATION_SEC || dtSec > FLICK_MAX_DURATION_SEC) return;
        const distance = Math.hypot(dx, dy);
        if (distance < 30) return;

        // Power from flick speed (magnitude / time)
        const speed = distance / dtSec;
        const referenceSpeed = FLICK_DISTANCE_FOR_FULL_POWER / FLICK_REFERENCE_TIME_SEC;
        const power = clamp(speed / referenceSpeed, MIN_POWER, MAX_POWER);

        // 3D launch direction from flick unit vector. Same math as
        // mouseArrow but WITHOUT inversion (the flick IS the launch
        // direction for touch). horizScale + fwdScale together make
        // the resulting (vx, vy, vz) a unit vector — total speed
        // remains power · VEL.
        const horizScale = Math.sin(SHOT_ELEVATION_RAD);
        const fwdScale = Math.cos(SHOT_ELEVATION_RAD);
        // LATERAL_AIM_SENSITIVITY (0.65) damps the sideways flick
        // component — a slightly-off flick no longer throws the ball
        // way wide. More forgiving aim at the cost of a little 1:1
        // flick fidelity. Mirrors mouseArrow.
        const LATERAL_AIM_SENSITIVITY = 0.65;
        const vxNorm = (dx / distance) * horizScale * LATERAL_AIM_SENSITIVITY;
        const vyNorm = (-dy / distance) * horizScale;  // dy<0 for upward flick → +vy
        const vzNorm = fwdScale;
        const vhNorm = Math.sqrt(vxNorm * vxNorm + vzNorm * vzNorm);
        const angle = Math.atan2(vxNorm, vzNorm);
        const elevation = Math.atan2(vyNorm, vhNorm);

        onShot({ angle, power, elevation });
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
