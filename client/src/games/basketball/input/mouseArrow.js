import {
    BALL_START_X, BALL_START_Y,
    MIN_ANGLE_RAD, MAX_ANGLE_RAD, MIN_POWER, MAX_POWER,
    MOUSE_DRAG_FULL_POWER_PX, MOUSE_DEAD_ZONE_PX,
    COLORS,
} from '../data/constants.js';

/**
 * Mouse aim input — desktop primary input scheme.
 *
 * Player moves the mouse to a position BELOW the ball. A directional
 * arrow draws from the ball toward the cursor; the inverse direction
 * (ball away from cursor) is where the ball will fly. Cursor distance
 * from the ball below = power.
 *
 *   cursor up-right of ball  → ball would fly down-left (no good)
 *   cursor below ball        → ball flies straight up at angle 0
 *   cursor below-and-right   → ball flies up-and-left
 *   cursor far below ball    → power = full
 *
 * Click to release the shot.
 *
 * Angles outside the valid range get clamped. If the cursor is in the
 * dead zone immediately around the ball, no shot fires (too easy to
 * misclick).
 *
 * @param {Phaser.Scene} scene
 * @param {(shot: { angle: number, power: number }) => void} onShot
 * @returns {() => void} detach function
 */
export function attachMouseArrow(scene, onShot) {
    const arrow = scene.add.graphics();
    let cursorX = BALL_START_X;
    let cursorY = BALL_START_Y + MOUSE_DRAG_FULL_POWER_PX / 2;

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
        // Arrow draws from ball toward cursor (the "pull-back" direction).
        // Visual cue: the longer the arrow, the more power.
        const length = Math.min(
            MOUSE_DRAG_FULL_POWER_PX,
            Math.hypot(cursorX - BALL_START_X, cursorY - BALL_START_Y)
        );
        const color = shot.power < 0.2 ? COLORS.arrowAimDim : COLORS.arrowAim;
        const dxN = (cursorX - BALL_START_X) / (length || 1);
        const dyN = (cursorY - BALL_START_Y) / (length || 1);
        const tipX = BALL_START_X + dxN * length;
        const tipY = BALL_START_Y + dyN * length;
        arrow.lineStyle(5, color, 0.9);
        arrow.beginPath();
        arrow.moveTo(BALL_START_X, BALL_START_Y);
        arrow.lineTo(tipX, tipY);
        arrow.strokePath();
        // Arrowhead
        const headSize = 14;
        const hx = -dxN;
        const hy = -dyN;
        const perpX = -hy;
        const perpY = hx;
        arrow.fillStyle(color, 0.9);
        arrow.fillTriangle(
            tipX, tipY,
            tipX + hx * headSize + perpX * headSize * 0.6, tipY + hy * headSize + perpY * headSize * 0.6,
            tipX + hx * headSize - perpX * headSize * 0.6, tipY + hy * headSize - perpY * headSize * 0.6,
        );
    }

    function computeShotFromCursor(cx, cy) {
        const dx = cx - BALL_START_X;
        const dy = cy - BALL_START_Y;
        const dist = Math.hypot(dx, dy);
        if (dist < MOUSE_DEAD_ZONE_PX) return null;
        // Cursor must be BELOW the ball (dy > 0) — that's how you aim "back" before releasing
        if (dy <= 0) return null;
        // Ball flies in the OPPOSITE direction from the pull-back vector
        // pull = (dx, dy)  → fly = (-dx, -dy)
        // Convert fly vector to angle-from-vertical (positive = right)
        const flyX = -dx;
        const flyY = -dy;
        const angle = clamp(Math.atan2(flyX, -flyY), MIN_ANGLE_RAD, MAX_ANGLE_RAD);
        const power = clamp(dist / MOUSE_DRAG_FULL_POWER_PX, MIN_POWER, MAX_POWER);
        return { angle, power };
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
