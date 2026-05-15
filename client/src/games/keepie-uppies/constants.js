/**
 * Physics constants — mirror of
 * server/services/games/keepie-uppies/constants.js in the SolShot
 * monorepo. Three-file-sync at handoff per Ball Games Playbook ch.9.1.
 *
 * Source-of-truth for derivations: Docs/games/keepie-uppies/PHYSICS_RESEARCH.md
 * (in the monorepo).
 */

// --- ball geometry + mass ---
// v0.3 (2026-05-15 playtest): 0.11m → 0.33m (3x) — FIFA-spec read too
// small on phone, Fish wanted bigger.
// v0.4 (2026-05-15 playtest): 0.33m → 0.28m (-15%) — 0.33m felt slightly
// too big in playtest. 0.28m gives ~225px canvas / ~110px phone.
// v0.5 (2026-05-15 playtest): 0.28m → 0.25m (-10%). 0.28 still slightly
// too big. 0.25m gives ~200px canvas / ~98px phone.
export const BALL_RADIUS_M = 0.25;
export const BALL_MASS_KG = 0.43;          // mass unchanged; arcade abstraction
export const HITBOX_RADIUS_M = BALL_RADIUS_M * 1.2;

// --- environment ---
// v0.6 (2026-05-15 playtest): 9.81 → 12.0 (+22%). Fish wanted more pace.
// Cleaner than scaling launch velocities (which would also change arc
// height + risk off-screen). Deliberate arcade deviation from CIPM
// standard gravity. Tap cadence drops from ~0.92s round-trip to ~0.75s.
export const GRAVITY_M_S2 = 12.0;

// --- Magnus effect ---
export const MAGNUS_COEFFICIENT = 0.020;

// --- tap-impulse model ---
// v0.3 (2026-05-15 playtest): centre tap was sending the ball off the
// top of the canvas. Brought BASE_UP down (6.0 → 4.5: centre tap apex
// ~1m above launch, well within the 3m world) and VERTICAL_GAIN down
// (3.0 → 1.5: bottom-edge tap is now the only way to send it off-screen,
// per Fish's preferred feel).
export const BASE_UP_M_S = 4.5;
// v0.5 (2026-05-15 playtest): LATERAL_GAIN 2.5 → 4.0 (+60%). Game felt
// too forgiving — small offsets in tap position should mean bigger
// directional consequences. Off-centre taps now send the ball ~80% of
// world width during a typical flight, harder to chase.
export const LATERAL_GAIN = 4.0;
export const VERTICAL_GAIN = 1.5;
export const SPIN_GAIN = 12.0;             // unchanged; Magnus feel pending playtest

// --- wall + floor ---
export const WALL_RESTITUTION = 1.0;

// --- world bounds (revised v0.2 — see PHYSICS_RESEARCH §"World dimensions") ---
export const WORLD_WIDTH_M = 2.0;
export const WORLD_HEIGHT_M = 3.0;
export const FLOOR_Y_M = 0.0;

// --- integration ---
export const PHYSICS_DT_S = 1 / 120;
export const MAX_FLIGHT_STEPS = 36000;

// --- ball start state ---
export const BALL_START_X_FRAC = 0.5;
export const BALL_START_Y_M = 1.0;
