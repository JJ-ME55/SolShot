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

// --- ball geometry + mass [FIFA-LAW2] ---
export const BALL_RADIUS_M = 0.11;          // FIFA Law 2 circumference 68-70cm midpoint
export const BALL_MASS_KG = 0.43;           // FIFA Law 2 mass 410-450g midpoint

// hitbox inflated 20% over visual for mobile fat-finger forgiveness
// (basketball used inverse — strict bounds for miss readability;
// different game, different tradeoff)
export const HITBOX_RADIUS_M = BALL_RADIUS_M * 1.2;

// --- environment ---
export const GRAVITY_M_S2 = 9.81;           // [CIPM-G] standard gravity, rounded

// --- Magnus effect ---
// Derivation in PHYSICS_RESEARCH.md §Magnus:
//   physics-faithful coefficient ≈ 0.011 from C_L=0.2 [GOFF-2010] + ρ=1.225
//   [ICAO-ATM] + A=π·R² + 1/(2·m). 1.8× boost for arcade visibility.
// Bracket for playtest: 0.012-0.030. [PLAYTEST]
export const MAGNUS_COEFFICIENT = 0.020;

// --- tap-impulse model (arcade abstraction, not physics-derived) ---
export const BASE_UP_M_S = 6.0;             // [PLAYTEST] dead-centre tap, ~1.22s round-trip; bracket 4.5-8.0
export const LATERAL_GAIN = 2.5;            // [PLAYTEST] edge tap sideways; bracket 1.5-4.0
export const VERTICAL_GAIN = 3.0;           // [PLAYTEST] bottom-edge bonus up; bracket 2.0-5.0
export const SPIN_GAIN = 12.0;              // [PLAYTEST] edge tap spin (S≈0.22 [GOFF-2010]); bracket 6-20

// --- wall + floor ---
export const WALL_RESTITUTION = 1.0;        // perfectly elastic; gravity is the only energy sink

// --- world bounds ---
// World is set up so x ∈ [0, WORLD_WIDTH_M], y ≥ 0 (floor), no ceiling.
// WORLD_WIDTH_M is derived from canvas dimensions in the client; on the
// server we accept it as a per-attempt config so the simulation matches
// what the client renders.
export const DEFAULT_WORLD_WIDTH_M = 8.0;   // ~scene width; client overrides per-attempt
export const FLOOR_Y_M = 0.0;               // floor at y=0 by convention

// --- integration ---
export const PHYSICS_DT_S = 1 / 120;        // 120Hz fixed timestep for determinism + tunneling margin
export const MAX_FLIGHT_STEPS = 36000;      // 5min hard cap (5 * 60 * 120) — defensive against pathological input

// --- ball start state ---
// Idle ball sits centre-x, slightly above floor, at rest.
export const BALL_START_X_FRAC = 0.5;       // fraction of WORLD_WIDTH_M
export const BALL_START_Y_M = 1.0;          // 1m above floor when idle
