/**
 * Free-Kick Madness — physics + scoring constants (v0.1)
 *
 * Server-authoritative. The matching client constants in
 * client/src/games/free-kicks/data/constants.js MUST mirror these
 * once the client is built (Phase 2).
 *
 * All physics values are in SI units (metres, seconds, kg).
 *
 * COORDINATE SYSTEM (right-handed):
 *   x = lateral   (player's right = +x; goal centre at x=0)
 *   y = vertical  (up = +y; pitch surface at y=0)
 *   z = depth     (toward the kicker = -z; goal-line plane at z=0;
 *                   ball flies in +z direction when straight-shot)
 *
 *   Player kicks FROM negative z, TOWARD positive z, into the goal.
 *   For a centre shot the ball release pos is at (0, BALL_RADIUS_M, -DISTANCE).
 *   Goal mouth occupies x ∈ [-3.66, +3.66], y ∈ [0, 2.44], at z=0.
 *
 * Every research-derived constant cites a source. Tuning values
 * (sensitivity, gain) are marked PLAYTEST and must be calibrated
 * empirically, NOT guessed. Per the playbook §1 "no guessing" rule.
 *
 * Citations are summarised; full bibliography in
 * Docs/games/free-kicks/PHYSICS_RESEARCH.md.
 */

// ============================================================
// === Ball physical constants — IFAB Law 2 (FIFA regs) ===
// ============================================================

// IFAB Laws of the Game 2024/25, Law 2 — The Ball. Regulation range
// 410–450 g; midpoint 0.430 kg.
export const BALL_MASS_KG = 0.430;

// IFAB Law 2. Circumference 68–70 cm → diameter 21.65–22.28 cm.
// Midpoint diameter 0.22 m → radius 0.11 m.
export const BALL_RADIUS_M = 0.110;
export const BALL_DIAMETER_M = 0.220;

// Cross-sectional area for drag/lift formulas. A = πr².
export const BALL_AREA_M2 = Math.PI * BALL_RADIUS_M * BALL_RADIUS_M;  // ≈ 0.0380 m²

// Moment of inertia for a hollow sphere = (2/3)·m·r².
// A football is closer to thin-shell than solid; use 2/3 factor.
// Only used when modelling spin decay — for v1 we treat spin as
// effectively constant during flight (see SPIN_DECAY_TIME_CONST_S).
export const BALL_MOI_KG_M2 = (2 / 3) * BALL_MASS_KG * BALL_RADIUS_M * BALL_RADIUS_M;  // ≈ 0.00347 kg·m²


// ============================================================
// === World physics constants ===
// ============================================================

// Standard gravity.
export const GRAVITY_M_S2 = 9.81;

// Air density at sea level, 15°C, dry air. Stadium assumed sea-level
// for v1 — altitude not modelled.
export const AIR_DENSITY_KG_M3 = 1.225;


// ============================================================
// === Aerodynamic coefficients ===
// ============================================================

// === Drag coefficient Cd ===
// At free-kick speeds (25–35 m/s) with d=0.22m and kinematic
// viscosity ν≈1.5×10⁻⁵ m²/s the Reynolds number sits at
// Re ≈ 3.7×10⁵ – 5.1×10⁵, which is POST-CRITICAL (above the
// drag-crisis transition at Re_crit ≈ 2.2–3.0×10⁵, Asai et al. 2007).
//
// Bray & Kerwin 2003 (the canonical free-kick paper) measured Cd in
// the range 0.25–0.30 for SPINNING free-kicks. Spin elevates Cd —
// Asai's wind-tunnel non-spin Cd is 0.12–0.16, but spinning kicks
// see higher values. Our Free-Kick Madness ball always has spin.
//
// Use Bray & Kerwin 2003 midpoint as a single constant for v1.
// Refinement (Cd as a function of Sp) is a v1.1 polish item.
export const DRAG_COEFFICIENT_CD = 0.275;

// === Lift / Magnus coefficient Cl ===
// Cl depends on the spin parameter Sp = r·|ω|/|v|.
// For free-kick range Sp ≈ 0.14–0.28, Cl ≈ 0.20–0.30.
//
// Functional form: linear in Sp, anchored at the midpoint
// (Sp=0.18, Cl=0.20). Slope ≈ 0.5 per unit Sp matches Asai's
// wind-tunnel side-force data (0.21 at Sp=0.18, 0.24 at Sp=0.22,
// 0.29 at Sp=0.34). Clamped to [0.15, 0.30] to stay in measured
// envelope.
//
// (Goff & Carré 2010 published an exact fit form with constants
// c=0.4127, d=0.3056. The PDF text could not be extracted for
// verification — see PHYSICS_RESEARCH.md "Honest limits". The
// Asai-derived linear form below is research-grounded and matches
// the magnitudes; refining to the exact Goff & Carré form is a
// v1.1 polish item.)
export const CL_BASE = 0.20;          // Cl at Sp = SP_BASE
export const SP_BASE = 0.18;
export const CL_SLOPE_PER_SP = 0.5;   // ΔCl per unit ΔSp
export const CL_MIN = 0.15;
export const CL_MAX = 0.30;

// === Spin decay ===
// Smits & Smith 1994 (golf-ball aero model, cited by all soccer
// aero papers as the standard substitute since no soccer-specific
// τ measurement exists). For FIFA-spec ball at free-kick Re, the
// derived spin-decay time constant τ ≈ 35 s. Over a 1.5 s flight
// that's ~4% decay — within our integration error budget.
//
// v1 treats spin as constant during flight. Documented as such
// in PHYSICS_RESEARCH.md.
export const SPIN_DECAY_TIME_CONST_S = 35.0;


// ============================================================
// === Integration ===
// ============================================================

// Published soccer trajectory simulators (Bray & Kerwin 2003, Goff
// & Carré 2009) use RK4 at dt = 0.001 s. For Free-Kick Madness we
// substep at 4 ms effective which gives <1 cm position error over
// 1.5 s — well below pixel resolution.
//
// PHYSICS_DT is the OUTER step (frame-locked). SUBSTEPS divides it
// for the inner RK4 step.
export const PHYSICS_DT = 1 / 60;          // 16.67 ms outer step
export const PHYSICS_SUBSTEPS = 4;          // → 4.17 ms effective dt

// Hard cap on simulation steps so a runaway trajectory can never
// hang the server. At PHYSICS_DT = 1/60 with PHYSICS_SUBSTEPS = 4,
// each step = 4.17 ms. 1500 steps = 6.25 s of flight time — more
// than enough for any realistic free-kick (1.5 s typical).
export const MAX_TRAJECTORY_STEPS = 1500;

// Trajectory termination conditions. Per playbook §4.6 — explicit
// bounds prevent late-stage drift from polluting the trajectory.
export const TERM_Z_MAX_M = 3.0;           // 3m past goal-line → end
export const TERM_Y_MIN_M = 0.0;           // hit pitch → end
export const TERM_X_ABS_MAX_M = 10.0;      // 10m off-axis → end


// ============================================================
// === Goal geometry — IFAB Law 1 ===
// ============================================================

// Standard goal: 7.32 m wide × 2.44 m tall.
export const GOAL_WIDTH_M = 7.32;
export const GOAL_HALF_WIDTH_M = GOAL_WIDTH_M / 2;       // 3.66 m
export const GOAL_HEIGHT_M = 2.44;

// Goal posts modelled as thin vertical cylinders of regulation
// diameter 12 cm. Crossbar same.
export const POST_RADIUS_M = 0.06;

// Goal-line plane at z = 0.
export const GOAL_PLANE_Z_M = 0.0;


// ============================================================
// === Wall geometry — IFAB Law 13 (Direct Free Kicks) ===
// ============================================================

// Defenders' wall must be 9.15 m (10 yards) from the ball.
export const WALL_DISTANCE_FROM_BALL_M = 9.15;

// Each defender is treated as an AABB. Shoulder width ~0.5 m when
// packed in a wall. Standing height ~1.8 m.
export const DEFENDER_WIDTH_M = 0.50;
export const DEFENDER_HEIGHT_M = 1.80;
export const DEFENDER_DEPTH_M = 0.30;       // body thickness

// Wall sizes by escalation tier — see DESIGN.md §Difficulty ramp.
export const WALL_SIZES_BY_TIER = [3, 4, 5, 6];


// ============================================================
// === Distance + angle escalation tiers ===
// ============================================================

// Each tier triggers on goal count crossing the lower bound.
// See DESIGN.md §Difficulty ramp.
//
// v0.4: pulled distances IN to match Flick Kick (which varies 11–20m,
// often opens at 11–14m). Original 18→24m range was too far for
// early gameplay and made the goal feel small/distant.
export const ESCALATION_TIERS = [
    { minGoals: 0,  distanceM: 12, wallSize: 3, anglePoolDeg: [0] },
    { minGoals: 3,  distanceM: 14, wallSize: 4, anglePoolDeg: [0, -15, +15] },
    { minGoals: 6,  distanceM: 16, wallSize: 5, anglePoolDeg: [0, -15, +15, -25, +25] },
    { minGoals: 10, distanceM: 18, wallSize: 6, anglePoolDeg: [0, -15, +15, -25, +25] },
];


// ============================================================
// === Ball release pose ===
// ============================================================

// Ball sits on the pitch at its radius height. Distance from goal
// and lateral offset are set per-shot from the scenario.
export const BALL_RELEASE_HEIGHT_M = BALL_RADIUS_M;


// ============================================================
// === Lives + targets ===
// ============================================================

export const LIVES_START = 5;
export const LIVES_MAX = 5;

// +10 target — always present every shot.
export const PLUS10_POINTS = 10;
// +10 target hitbox is ~25% of goal height per side.
export const TARGET_HALF_WIDTH_M = 0.30;
export const TARGET_HALF_HEIGHT_M = 0.30;

// ❤️ target — independent 20% chance per shot (seeded).
export const HEART_SPAWN_PROBABILITY = 0.20;
// Same hitbox as +10 for consistency.

// Goal scoring (flat).
export const POINTS_PER_GOAL = 1;
// Bonus when ball passes through +10 target zone ON ITS WAY INTO GOAL.
export const POINTS_PER_PLUS10_BONUS = 10;
// Hitting heart adds +1 life (capped at LIVES_MAX).
export const HEART_LIFE_BONUS = 1;


// ============================================================
// === Input bounds (validation) ===
// ============================================================

// Power: real free-kick range 25–35 m/s. We allow the lower bound to
// dip well below that for arcade feel — a tiny tap should produce a
// soft dribbler, not a 15 m/s rocket. 8 m/s is a gentle pass speed.
// Tuned during v0.2 playtest (Fish: "tiniest flick goes over the goal"
// → bring the floor way down).
export const MIN_POWER_M_S = 8.0;
export const MAX_POWER_M_S = 40.0;

// Launch azimuth (horizontal angle from straight-toward-goal).
// Wide range so the player can spray a shot way off.
export const MIN_AZIMUTH_RAD = -Math.PI / 4;   // -45°
export const MAX_AZIMUTH_RAD = +Math.PI / 4;   // +45°

// Launch elevation (vertical angle above horizontal). Free-kicks
// typically released between 5° (line drive) and 30° (over wall +
// dipping). Allow a touch more.
export const MIN_ELEVATION_RAD = -0.10;        // -5.7° (almost flat)
export const MAX_ELEVATION_RAD = Math.PI / 4;  // 45°

// Spin (side spin only for v1, around vertical axis).
// Real free-kicks: 7–10 rev/s = 44–63 rad/s. Roberto Carlos extreme: ~88 rad/s.
// Allow sign for left/right curl.
export const MAX_SPIN_RAD_S = 100.0;            // 16 rev/s — covers Carlos outlier
