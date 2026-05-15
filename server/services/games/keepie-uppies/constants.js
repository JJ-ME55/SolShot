/**
 * Keepie-Uppies — physics constants (server canonical, v0.1)
 *
 * Source of truth: Docs/games/keepie-uppies/PHYSICS_RESEARCH.md
 * Every constant carries a citation tag pointing at the section there.
 *
 * Per Ball Games Playbook ch.1 — no values invented from intuition.
 * Tuning constants flagged with [PLAYTEST] are the bracket-and-iterate
 * ones; document each tuning step in the comment.
 */

// --- ball geometry + mass ---
// v0.3 (2026-05-15 playtest): 0.11m → 0.33m (3x) — FIFA-spec read too
// small on phone, Fish wanted bigger.
// v0.4 (2026-05-15 playtest): 0.33m → 0.28m (-15%) — 0.33m felt slightly
// too big in playtest. 0.28m gives ~225px canvas / ~110px phone.
// v0.5 (2026-05-15 playtest): 0.28m → 0.25m (-10%). 0.28 still slightly
// too big. 0.25m gives ~200px canvas / ~98px phone.
export const BALL_RADIUS_M = 0.25;
export const BALL_MASS_KG = 0.43;           // mass unchanged; arcade abstraction

// hitbox inflated 20% over visual for mobile fat-finger forgiveness
// (basketball used inverse — strict bounds for miss readability;
// different game, different tradeoff)
export const HITBOX_RADIUS_M = BALL_RADIUS_M * 1.2;

// --- environment ---
// v0.6 (2026-05-15 playtest): 9.81 → 12.0 (+22%). Fish wanted more pace.
// Cleaner than scaling launch velocities (which would also change arc
// height + risk off-screen). Deliberate arcade deviation from CIPM
// standard gravity. Tap cadence drops from ~0.92s round-trip to ~0.75s.
export const GRAVITY_M_S2 = 12.0;

// --- Magnus effect ---
// Derivation in PHYSICS_RESEARCH.md §Magnus:
//   physics-faithful coefficient ≈ 0.011 from C_L=0.2 [GOFF-2010] + ρ=1.225
//   [ICAO-ATM] + A=π·R² + 1/(2·m). 1.8× boost for arcade visibility.
// Bracket for playtest: 0.012-0.030. [PLAYTEST]
export const MAGNUS_COEFFICIENT = 0.020;

// --- tap-impulse model (arcade abstraction, not physics-derived) ---
// v0.3 (2026-05-15 playtest): centre tap was sending the ball off the
// top of the canvas. Brought BASE_UP down (6.0 → 4.5: centre tap apex
// ~1m above launch, well within the 3m world) and VERTICAL_GAIN down
// (3.0 → 1.5: bottom-edge tap is now the only way to send it off-screen,
// per Fish's preferred feel).
export const BASE_UP_M_S = 4.5;             // [PLAYTEST] dead-centre tap, ~0.92s round-trip; bracket 3.0-6.5
// v0.5 (2026-05-15 playtest): LATERAL_GAIN 2.5 → 4.0 (+60%). Game felt
// too forgiving — small offsets in tap position should mean bigger
// directional consequences. Off-centre taps now send the ball ~80% of
// world width during a typical flight, harder to chase.
export const LATERAL_GAIN = 4.0;            // [PLAYTEST] edge tap sideways; bracket 1.5-5.0
export const VERTICAL_GAIN = 1.5;           // [PLAYTEST] bottom-edge bonus up; bracket 1.0-3.5
export const SPIN_GAIN = 12.0;              // [PLAYTEST] edge tap spin (S≈0.22 [GOFF-2010]); bracket 6-20

// --- wall + floor ---
export const WALL_RESTITUTION = 1.0;        // perfectly elastic; gravity is the only energy sink

// --- world bounds ---
// World is set up so x ∈ [0, WORLD_WIDTH_M], y ≥ 0 (floor), no ceiling.
// WORLD_WIDTH_M is derived from canvas dimensions in the client; on the
// server we accept it as a per-attempt config so the simulation matches
// what the client renders.
//
// Default revised v0.2: 8.0m → 2.0m. Original 8m × 12m world rendered the
// FIFA-spec ball at 22 px on canvas / ~11 px on phone — too small to read
// or tap. 2m × 3m matches a realistic keepie-up juggling space and gives
// the ball a touch-comfortable ~88 px on canvas / ~43 px on phone. No
// physics constants change — just the playfield extent.
export const DEFAULT_WORLD_WIDTH_M = 2.0;   // ~scene width; client overrides per-attempt
export const FLOOR_Y_M = 0.0;               // floor at y=0 by convention

// --- integration ---
export const PHYSICS_DT_S = 1 / 120;        // 120Hz fixed timestep for determinism + tunneling margin
export const MAX_FLIGHT_STEPS = 36000;      // 5min hard cap (5 * 60 * 120) — defensive against pathological input

// --- ball start state ---
// Idle ball sits centre-x, slightly above floor, at rest.
export const BALL_START_X_FRAC = 0.5;       // fraction of WORLD_WIDTH_M
export const BALL_START_Y_M = 1.0;          // 1m above floor when idle
