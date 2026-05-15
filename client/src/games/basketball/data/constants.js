/**
 * Basketball Hoops — client constants (v0.4, 3D model).
 *
 * Physics + geometry values are in SI units (metres, seconds) and
 * MUST stay in sync with server/services/games/basketball/constants.js.
 *
 * The rendering section is client-only — describes how the 3D world
 * gets projected onto the 2D canvas for the first-person POV view.
 */

// === Canvas ===
export const VIRTUAL_WIDTH = 800;
export const VIRTUAL_HEIGHT = 1200;

// ──────────────────────────────────────────────────────────────────
// MIRROR OF SERVER CONSTANTS (SI units)
// ──────────────────────────────────────────────────────────────────

export const PLAYER_EYE_HEIGHT_M = 1.70;
// Mirrors server. Bumped from 1.50 to model real arm-extended release.
// Visually the ball will sit ~105 px higher on the canvas.
export const BALL_RELEASE_HEIGHT_M = 1.80;
export const BALL_RELEASE_FORWARD_M = 0.50;
export const BALL_RELEASE_LATERAL_M = 0.00;

export const RIM_X_BASE_M = 0.00;
export const RIM_HEIGHT_M = 3.05;
export const RIM_FORWARD_M = 4.27;
// Mirrors server. Widened 20% from real NBA regulation for arcade feel.
export const RIM_INNER_RADIUS_M = 0.276;
// Mirrors server. Thinned from 0.06 to let centred shots clear
// the front of the widened rim's collision cylinder.
export const RIM_TUBE_RADIUS_M = 0.03;

export const BACKBOARD_X_BASE_M = 0.00;
export const BACKBOARD_Z_M = 4.50;
export const BACKBOARD_HALF_WIDTH_M = 0.90;
export const BACKBOARD_TOP_Y_M = 3.95;
export const BACKBOARD_BOTTOM_Y_M = 2.90;

// Shooter's square — the painted red rectangle on the board front.
// Real NBA regulation: 24" wide × 18" tall, bottom edge 4" above
// the rim, centred on the rim. A ball that contacts the board INSIDE
// this rectangle has its post-bounce velocity overridden in physics.js
// to free-fall into the rim — the iconic "bank off the square"
// almost-always-goes-in shot. Skill remains in HITTING the square.
// Mirrors server.
export const SHOOTER_SQUARE_HALF_WIDTH_M = 0.305;  // 24"/2 = 0.6096/2
export const SHOOTER_SQUARE_BOTTOM_Y_M = 3.15;     // RIM_HEIGHT_M + 4"
export const SHOOTER_SQUARE_TOP_Y_M = 3.61;        // bottom + 18"

export const BALL_RADIUS_M = 0.12;

export const GRAVITY_M_S2 = 9.81;
export const PHYSICS_DT = 1 / 60;
// Power → velocity: v = BASELINE + (power − MIN)/(MAX − MIN) · (SCALE − BASELINE)
// Tuned so each fifth of the pullback lands in a distinct physics band.
// Mirrors server.
// Baseline raised 4.8 → 5.6 to shrink the dead "falls short" zone at
// the bottom of the power meter (~25% → ~10%). Mirrors server.
export const VELOCITY_SCALE_M_S = 9.5;
export const VELOCITY_BASELINE_M_S = 5.6;
export const SHOT_ELEVATION_RAD = 55 * Math.PI / 180;

// Lateral aim and elevation are both derived client-side from the
// player's pull-back / flick direction (mouseArrow.js, touchFlick.js).
// Bounds here are validation-side only — pull-back at the asymptotic
// horizontal limit can produce lateral angles approaching
// SHOT_ELEVATION_RAD (~55°), so ±π/2 is the physical upper bound.
export const MIN_ANGLE_RAD = -Math.PI / 2;
export const MAX_ANGLE_RAD = Math.PI / 2;
export const MIN_POWER = 0.10;
// MAX 1.20 — extends drag range so "over the backboard" band is
// reachable. Mirrors server.
export const MAX_POWER = 1.20;

// Launch elevation bounds (radians). The shot payload's `elevation`
// field is optional — falls back to SHOT_ELEVATION_RAD when omitted.
export const MIN_ELEVATION_RAD = 0;
export const MAX_ELEVATION_RAD = Math.PI / 2;

// Mirrors server. Rim/backboard collisions use normal restitution +
// Coulomb friction; see physics.js + Docs/games/basketball/PHYSICS_RESEARCH.md.
// Restitution values cluster around FIBA ball-COR ≈0.76; friction
// values come from Okubo & Hubbard (2006) ball-on-steel measurements.
export const RIM_BOUNCE_FACTOR = 0.70;
export const RIM_TANGENT_FRICTION_MU = 0.5;
export const BACKBOARD_BOUNCE_FACTOR = 0.65;
export const BACKBOARD_TANGENT_FRICTION_MU = 0.6;
// Per-step air drag multiplier on all velocity components.
// 0.9988 @ 60 Hz ≈ 7% velocity loss per second.
export const AIR_DRAG_PER_STEP = 0.9995;

// Initial backspin (Hz) applied to every shot — Tran & Silverberg
// 2008 academic optimum. The spin axis is set perpendicular to the
// horizontal flight direction so the top of the ball rotates against
// motion. Used by the rim collision to compute contact-point velocity.
// Mirrors server. See server constants for the dial-back rationale.
export const INITIAL_BACKSPIN_HZ = 0;
// Moment-of-inertia factor for a hollow sphere (basketball is ≈ hollow).
// I = factor · m · r². Used in the angular-impulse update at rim contact.
export const BALL_MOI_FACTOR = 2 / 3;

export const FLOOR_Y_M = 0.00;

// ──────────────────────────────────────────────────────────────────
// CLIENT-ONLY RENDERING CONSTANTS
// ──────────────────────────────────────────────────────────────────

// === Perspective projection ===
// Single depth-dependent scale factor K(z) applied to BOTH horizontal
// and vertical axes, so shapes preserve their real aspect ratio at
// every depth. K(z) lerps linearly between near and far values:
//
//   K(z) = K_NEAR + (K_FAR - K_NEAR) * (z - BALL_RELEASE_FORWARD_M)
//                                     / (RIM_FORWARD_M - BALL_RELEASE_FORWARD_M)
//
//   screenX = canvasMidX     + world.x * K(z)
//   screenY = HORIZON_Y_PX   - (world.y - CAMERA_Y_M) * K(z)
//   pixelSize_of_anything = world_size * K(z)
//
// This is structurally equivalent to a standard pinhole camera, just
// with a linear depth ramp instead of 1/z — easier to hand-tune for
// visual layout while keeping x/y consistent.
// Camera is parked ABOVE the player (not at literal eye height) — this
// is a stylised POV, like an over-the-shoulder shot, which gives the
// vertical separation we want: ball low on screen, rim/backboard near
// the top. Realistic eye height (1.7m) only gives ~270px of ball-to-rim
// screen distance — not enough for an FB-Messenger-style layout.
export const CAMERA_Y_M = 4.0;
// HORIZON_Y_PX = 175 leaves ~185 px of clean sky/scoreboard space at
// the top of the canvas (backboard top projects to HORIZON_Y_PX + ~10
// px). Previously 75 — that put the rim near the very top of the
// canvas with no room for the in-canvas scoreboard.
export const HORIZON_Y_PX = 175;
// Scale at z = BALL_RELEASE_FORWARD_M (close to player)
export const K_NEAR_PX_PER_M = 350;
// Scale at z = RIM_FORWARD_M (at the hoop)
export const K_FAR_PX_PER_M = 200;

// === Visual palette (v0.7 — clean arcade gym, Basketball Flick 3D feel) ===
export const COLORS = Object.freeze({
    // Sky / backdrop — warm gradient like a gym wall
    skyTop: 0x1a1d28,
    skyBottom: 0x2d2f3a,
    // Wood court — light hardwood like an indoor gym
    concreteFar: 0x6b4423,
    concreteNear: 0xa6753b,
    courtLine: 0xfaf3d8,
    courtLineFade: 0xc0b88f,
    // Fence (kept around for any leftover refs but not drawn)
    fenceWire: 0x8a8d92,
    fencePost: 0x3a3d42,
    // Pole + backboard
    pole: 0x3a3a3a,
    poleShadow: 0x1a1a1a,
    backboardFill: 0xfafaf0,
    backboardLine: 0x0a0a0a,
    backboardSquare: 0xd0312d,
    // Rim — bright FIBA orange
    rim: 0xff4a1a,
    rimDark: 0x6b0a08,
    rimHighlight: 0xffd6c2,
    netStrand: 0xffffff,
    netStrandDark: 0xaaaaaa,
    // Ball — vivid basketball orange
    ball: 0xe85a18,
    ballHighlight: 0xffe1b3,
    ballLine: 0x3a1808,
    // UI
    flickTrail: 0xffffff,
    text: 0xffffff,
});

// === Mobile flick mapping ===
// Speed of flick (distance / time) normalised against this reference
// gives power = 1.0. referenceSpeed = FLICK_DISTANCE_FOR_FULL_POWER /
// FLICK_REFERENCE_TIME_SEC. Tuning history: 260 → 780 (3× harder,
// too much) → 650 (+20% power) → 730 (−12%, "reduce all the power a
// little") → 800 (−9%, "still a bit too high for phone flicking").
// Casual flicks land low-to-mid; a committed fast flick reaches the
// upper bands.
export const FLICK_DISTANCE_FOR_FULL_POWER = 800;
export const FLICK_REFERENCE_TIME_SEC = 0.18;
export const FLICK_MIN_DURATION_SEC = 0.03;
export const FLICK_MAX_DURATION_SEC = 0.8;
// Horizontal flick offset maps to lateral aim. Max horizontal drag
// of FLICK_HORIZONTAL_FULL_PX gives the max lateral angle.
export const FLICK_HORIZONTAL_FULL_PX = 220;

// === Desktop mouse-arrow mapping ===
// Cursor distance below the ball → power. Cursor horizontal offset
// from ball → lateral aim (inverted, since the cursor is the
// pull-back direction).
// Pull-back distance for full power. Tuning history: 200 → 210 → 175
// (+20% power) → 195 (−12%, "reduce all the power a little"). At 195
// full power needs a 195 px drag, MAX_POWER (1.20) ~234 px — inside
// the ~255 px of drag room below the ball.
export const MOUSE_DRAG_FULL_POWER_PX = 195;
export const MOUSE_DEAD_ZONE_PX = 16;
// Horizontal cursor offset that maps to MAX_ANGLE_RAD. Sized so the
// cursor sideways displacement and the ball's resulting screen-space
// deflection at the rim plane match 1:1 — i.e. drag X px left, ball
// lands X px right of where it started on screen.
//
// Derivation (small-angle approximation, accurate at ±5.7°):
//   ball_world_x_at_rim ≈ (RIM_FORWARD_M − BALL_RELEASE_FORWARD_M) · angle
//   ball_screen_dx      = ball_world_x_at_rim · K_FAR_PX_PER_M
// Solving ball_screen_dx == cursor_dx for full-deflection:
//   MOUSE_HORIZONTAL_FULL_PX
//     = (RIM_FORWARD_M − BALL_RELEASE_FORWARD_M) · K_FAR_PX_PER_M · MAX_ANGLE_RAD
//     = (4.27 − 0.50) · 200 · 0.10 ≈ 75 px.
// Lower → more sensitive. Higher → less sensitive.
export const MOUSE_HORIZONTAL_FULL_PX = 75;

// === Timed rapid-fire mode ===
// See Docs/games/basketball/TIMED_MODE_DESIGN.md. Client-only mode
// constants — the standalone build runs the whole game loop in the
// scene (no server). Phase 4 moves the authoritative versions of
// these into the server.
//
// Base clock for a game. Starts on the player's first flick.
export const GAME_DURATION_MS = 20000;
// Each completed streak adds this much to the clock.
export const STREAK_BONUS_MS = 5000;
// HOT STREAK — this many made baskets in a row → +STREAK_BONUS_MS,
// with the big "HOT STREAK +5 SEC" celebration text on screen.
export const MAKES_STREAK_THRESHOLD = 3;
// Swish-only streak retired (was 3 → +3 s). Counter still tracked in
// state for stats/HUD, but no separate award fires — the makes streak
// covers swishes too. Kept as an export so existing imports don't
// break; treat as informational only.
export const SWISH_STREAK_THRESHOLD = 3;
// Strict ball pool — 4 balls in the rack, recycled via roll-back.
export const BALL_COUNT = 4;
// How long a ball takes to roll back from its landing spot to the
// rear of the rack. Combined with ~1–1.5 s flight time this gives the
// ~2 s round-trip that makes the strict 4-ball pool a real pacing
// constraint (Fish chose the strict-pool option for arcade realism).
export const BALL_ROLL_BACK_MS = 900;
