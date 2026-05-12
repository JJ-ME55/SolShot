/**
 * Basketball Hoops — client constants.
 *
 * The physics-and-position values here MUST stay in sync with
 * server/services/games/basketball/constants.js — the server is the
 * authority and the client renders against the same coordinate space.
 *
 * The COLORS / FLICK_* / MOUSE_* sections are client-only and don't
 * have a server analog.
 */

// === Canvas (mirror of server) ===
export const VIRTUAL_WIDTH = 800;
export const VIRTUAL_HEIGHT = 1200;

// === Ball (mirror) ===
export const BALL_RADIUS = 32;
export const BALL_START_X = VIRTUAL_WIDTH / 2;
export const BALL_START_Y = VIRTUAL_HEIGHT - 150;

// === Hoop (mirror) ===
export const HOOP_X_BASE = VIRTUAL_WIDTH / 2;
export const HOOP_Y = 280;
export const HOOP_INNER_WIDTH = 96;
export const RIM_CIRCLE_RADIUS = 6;

// === Backboard (mirror) ===
export const BACKBOARD_X_BASE = VIRTUAL_WIDTH / 2;
export const BACKBOARD_Y = 180;
export const BACKBOARD_WIDTH = 260;
export const BACKBOARD_HEIGHT = 160;

// === Physics tick (mirror — used to step through trajectories) ===
export const PHYSICS_DT = 1 / 60;

// === Input bounds (mirror — reject before sending to server) ===
export const MIN_ANGLE_RAD = -Math.PI / 3;
export const MAX_ANGLE_RAD = Math.PI / 3;
export const MIN_POWER = 0.05;
export const MAX_POWER = 1.0;

// === Visuals (client-only) ===
export const COLORS = Object.freeze({
    bg: 0x0c0c0c,
    backboardFill: 0xf3ead4,
    backboardLine: 0x1a1a1a,
    backboardSquare: 0xb91c1c,
    rim: 0xef4444,
    netStrand: 0xe5e5e5,
    ball: 0xe07a1f,
    ballLine: 0x6b3410,
    arrowAim: 0xffcc00,
    arrowAimDim: 0x554400,
    flickTrail: 0xffffff,
    flickTrailHot: 0xffcc00,
    text: 0xffffff,
    textHeat: 0xff8800,
});

// === Mobile flick mapping (client-only) ===
// A flick covering FLICK_DISTANCE_FOR_FULL_POWER pixels in
// FLICK_REFERENCE_TIME_SEC seconds maps to power = 1.0. We compute
// speed = distance / time and normalize against the reference.
export const FLICK_DISTANCE_FOR_FULL_POWER = 380;
export const FLICK_REFERENCE_TIME_SEC = 0.18;
export const FLICK_MIN_DURATION_SEC = 0.03;   // anything faster is a tap/glitch
export const FLICK_MAX_DURATION_SEC = 0.8;    // anything slower is a drag, not a flick

// === Desktop mouse-arrow mapping (client-only) ===
// Cursor below the ball: vertical distance maps to power, horizontal
// offset maps to angle.
export const MOUSE_DRAG_FULL_POWER_PX = 380;
// How far below the ball the cursor must be before it counts as a shot
// (small dead zone right at the ball center to prevent accidental fires).
export const MOUSE_DEAD_ZONE_PX = 24;
