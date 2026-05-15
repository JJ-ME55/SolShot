import {
    BALL_RELEASE_HEIGHT_M, BALL_RELEASE_LATERAL_M,
    CAMERA_Y_M, HORIZON_Y_PX, K_NEAR_PX_PER_M, VIRTUAL_WIDTH,
    MIN_POWER, MAX_POWER,
    SHOT_ELEVATION_RAD,
    MOUSE_DRAG_FULL_POWER_PX, MOUSE_DEAD_ZONE_PX,
} from '../data/constants.js';

/**
 * Mouse aim input — desktop primary input scheme (v0.8, variable
 * elevation).
 *
 * Slingshot model: the cursor below the ball is the pull-back. Length
 * of the pull = power; *direction* of the pull (inverted) = launch
 * direction in 3D world space. Specifically:
 *
 *   - Total drag length L → power (clamped to [MIN_POWER, MAX_POWER]).
 *   - Pull-back unit vector (dx, dy) in screen pixels (dy > 0 below
 *     the ball) is mirrored to (-dx, -dy) and converted to a 3D
 *     launch direction by setting:
 *       world_vx ∝ -dx
 *       world_vy ∝  dy   (screen-y inverted maps to world-up)
 *       world_vz  = fixed forward baseline = sin/cos decomposition
 *                   that reproduces the original 55° elevation when
 *                   the pull is purely vertical.
 *
 * Geometric consequence: the ball's *screen-space* trajectory at
 * release starts in the inverted-flick direction — drag down-left,
 * ball flies up-right along the mirror line. The trajectory then
 * bends under gravity, but its initial heading matches the arrow.
 *
 * Click to release. Cursor positions inside the dead zone around the
 * ball, or above the ball, don't fire.
 */

// Project the ball's release point to screen coords (constant — the
// ball sits at this position before each shot). Uses the same K(z)
// projection scheme as scene.js — K at z=BALL_RELEASE_FORWARD_M is
// exactly K_NEAR_PX_PER_M by definition.
function ballScreenPos() {
    return {
        x: VIRTUAL_WIDTH / 2 + BALL_RELEASE_LATERAL_M * K_NEAR_PX_PER_M,
        y: HORIZON_Y_PX - (BALL_RELEASE_HEIGHT_M - CAMERA_Y_M) * K_NEAR_PX_PER_M,
    };
}

export function attachMouseArrow(scene, onShot) {
    const arrow = scene.add.graphics();
    const ballScreen = ballScreenPos();
    let cursorX = ballScreen.x;
    let cursorY = ballScreen.y + MOUSE_DRAG_FULL_POWER_PX / 2;

    function onMove(pointer) {
        cursorX = pointer.x;
        cursorY = pointer.y;
        redrawArrow();
    }

    function onDown(pointer) {
        const shot = computeShotFromCursor(pointer.x, pointer.y);
        if (!shot) return;
        onShot(shot);
        arrow.clear();
    }

    function redrawArrow() {
        arrow.clear();
        const shot = computeShotFromCursor(cursorX, cursorY);
        if (!shot) return;
        const dxC = cursorX - ballScreen.x;
        const dyC = cursorY - ballScreen.y;
        const length = Math.min(MOUSE_DRAG_FULL_POWER_PX,
            Math.hypot(dxC, dyC));
        // Power-gauge colour: green (low) → yellow (mid) → red (max)
        const color = powerToColor(shot.power);
        const dxN = dxC / (length || 1);
        const dyN = dyC / (length || 1);
        const tipX = ballScreen.x + dxN * length;
        const tipY = ballScreen.y + dyN * length;
        arrow.lineStyle(6, color, 0.95);
        arrow.beginPath();
        arrow.moveTo(ballScreen.x, ballScreen.y);
        arrow.lineTo(tipX, tipY);
        arrow.strokePath();
        // Arrowhead
        const headSize = 14;
        const hx = -dxN;
        const hy = -dyN;
        const perpX = -hy;
        const perpY = hx;
        arrow.fillStyle(color, 0.95);
        arrow.fillTriangle(
            tipX, tipY,
            tipX + hx * headSize + perpX * headSize * 0.6, tipY + hy * headSize + perpY * headSize * 0.6,
            tipX + hx * headSize - perpX * headSize * 0.6, tipY + hy * headSize - perpY * headSize * 0.6,
        );
    }

    /**
     * Lerp green → yellow → red as power ramps 0 → 1. Used as the
     * visual power-gauge cue.
     */
    function powerToColor(power) {
        const p = Math.max(0, Math.min(1, power));
        let r, g;
        if (p < 0.5) {
            // green → yellow
            const t = p * 2;
            r = Math.round(t * 255);
            g = 255;
        } else {
            // yellow → red
            const t = (p - 0.5) * 2;
            r = 255;
            g = Math.round((1 - t) * 255);
        }
        return (r << 16) | (g << 8);
    }

    function computeShotFromCursor(cx, cy) {
        const dx = cx - ballScreen.x;
        const dy = cy - ballScreen.y;
        const dist = Math.hypot(dx, dy);
        if (dist < MOUSE_DEAD_ZONE_PX) return null;
        // Cursor must be BELOW the ball — pull-back direction
        if (dy <= 0) return null;
        // Power from total drag distance (length of the pull-back).
        const power = clamp(dist / MOUSE_DRAG_FULL_POWER_PX, MIN_POWER, MAX_POWER);
        // Build the 3D launch direction from the inverted pull-back.
        //   horizScale = sin(SHOT_ELEVATION_RAD): how much of the unit
        //   launch goes into the screen-visible (vx, vy) components.
        //   fwdScale   = cos(SHOT_ELEVATION_RAD): the fixed forward
        //   component, sized so a pure-vertical pull reproduces 55°.
        // Together horizScale² + fwdScale² = 1, so the resulting
        // (vx, vy, vz) is a unit vector and total speed = power · VEL.
        const horizScale = Math.sin(SHOT_ELEVATION_RAD);
        const fwdScale = Math.cos(SHOT_ELEVATION_RAD);
        // LATERAL_AIM_SENSITIVITY (0.65) damps the sideways component
        // of the pull so a small unintended off-axis tilt doesn't
        // throw the ball way off target. Trades a little of the 1:1
        // "ball follows the arrow" fidelity for a more forgiving aim
        // — playtest showed the raw mapping was punishingly twitchy.
        const LATERAL_AIM_SENSITIVITY = 0.65;
        const vxNorm = (-dx / dist) * horizScale * LATERAL_AIM_SENSITIVITY;
        const vyNorm = (dy / dist) * horizScale;
        const vzNorm = fwdScale;
        // Convert unit-direction back to (angle, elevation) for the
        // simulateShot API.
        const vhNorm = Math.sqrt(vxNorm * vxNorm + vzNorm * vzNorm);
        const angle = Math.atan2(vxNorm, vzNorm);
        const elevation = Math.atan2(vyNorm, vhNorm);
        return { angle, power, elevation };
    }

    scene.input.on('pointermove', onMove);
    scene.input.on('pointerdown', onDown);
    redrawArrow();

    return () => {
        scene.input.off('pointermove', onMove);
        scene.input.off('pointerdown', onDown);
        arrow.destroy();
    };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
