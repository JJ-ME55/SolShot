/**
 * Basketball Hoops — physics + scoring constants
 *
 * Server-authoritative. The matching client constants in
 * client/src/games/basketball/data/constants.js MUST mirror anything
 * that affects rendering (positions, sizes, ball start) so the visual
 * trajectory the client draws lines up with the server's truth.
 *
 * All positions in virtual canvas coordinates — the Phaser scene
 * scales the virtual canvas to fit the device viewport.
 */

// === Canvas ===
export const VIRTUAL_WIDTH = 800;
export const VIRTUAL_HEIGHT = 1200;

// === Ball ===
export const BALL_RADIUS = 32;
export const BALL_START_X = VIRTUAL_WIDTH / 2;
export const BALL_START_Y = VIRTUAL_HEIGHT - 150;

// === Hoop ===
// Hoop sits near the top of the canvas. Inner width is the rim diameter
// the ball needs to pass through to score.
export const HOOP_X_BASE = VIRTUAL_WIDTH / 2;
export const HOOP_Y = 280;
export const HOOP_INNER_WIDTH = 96;
// Each rim end is modelled as a small circle for collision purposes —
// this is the visual "thickness" of the rim where the ball can graze.
export const RIM_CIRCLE_RADIUS = 6;

// === Backboard ===
// Sits directly above the rim. When the backboard moves side-to-side
// (per backboard.js), the hoop is treated as rigidly attached and moves
// with it.
export const BACKBOARD_X_BASE = VIRTUAL_WIDTH / 2;
export const BACKBOARD_Y = 180;
export const BACKBOARD_WIDTH = 260;
export const BACKBOARD_HEIGHT = 160;

// === Physics ===
// Gravity tuned so a mid-power shot reaches the hoop in ~0.8-1.2s.
// Final tuning happens in playtest.
export const GRAVITY = 2400;
// power ∈ [0, 1] maps to initial velocity magnitude.
export const VELOCITY_SCALE = 2200;
export const PHYSICS_DT = 1 / 60;
// ~10s flight cap — safety, real shots resolve much faster.
export const MAX_TRAJECTORY_STEPS = 600;
// Energy retained on bounce.
export const BACKBOARD_BOUNCE_FACTOR = 0.55;
export const RIM_BOUNCE_FACTOR = 0.6;

// === Input validation ===
// Angle is measured from vertical, positive = right. Anything beyond
// ±60° isn't a shot toward the hoop — it's sideways, reject.
export const MIN_ANGLE_RAD = -Math.PI / 3;
export const MAX_ANGLE_RAD = Math.PI / 3;
// Below 5% power the ball can't physically reach the hoop, so we treat
// anything weaker as a rejected input rather than letting it count as
// an attempt.
export const MIN_POWER = 0.05;
export const MAX_POWER = 1.0;

// === Scoring ===
export const POINTS_SWISH = 2;
export const POINTS_RIM_IN = 1;
export const POINTS_BACKBOARD_BANK = 1;
export const POINTS_HEAT_CHECK_SWISH = 3;

// === Heat check (speed-based bonus) ===
// 3 swishes within 10s activates. Rim-in / bank-in break the streak.
// While active, swishes are worth +1 bonus.
export const HEAT_CHECK_TRIGGER_SWISHES = 3;
export const HEAT_CHECK_TRIGGER_WINDOW_MS = 10_000;
// Once active, heat check stays active until a non-swish basket OR a
// 10s gap since the last swish.
export const HEAT_CHECK_TIMEOUT_MS = 10_000;
