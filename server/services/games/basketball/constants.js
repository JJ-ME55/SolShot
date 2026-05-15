/**
 * Basketball Hoops — physics + scoring constants (v0.4, 3D model)
 *
 * Server-authoritative. The matching client constants in
 * client/src/games/basketball/data/constants.js MUST mirror these.
 *
 * All physics values are in SI units (metres, seconds) and use
 * real-world basketball measurements:
 *   - rim height 3.05 m (10 ft)
 *   - free-throw distance ~4.27 m to rim centre
 *   - rim inner radius 0.23 m (18" diameter)
 *   - ball radius 0.12 m (~9.5" diameter)
 *
 * The ball is simulated in 3D space (x=lateral, y=height, z=depth).
 * The 2D screen projection happens client-side at render time.
 */

// === Player + ball release pose ===
export const PLAYER_EYE_HEIGHT_M = 1.70;
// 1.80 m approximates a player's arm-extended release point — real
// free throws release from ~2.0–2.1 m (shoulder + arm + ball above
// head). The previous 1.50 m was an arbitrary "chest-height" value
// that left only ~0.04 m of vertical clearance between the ball's
// apex trajectory and the front of the rim. With air drag, that
// margin was eaten away and almost every direct shot bounced off
// the rim's front edge. 1.80 m gives ~0.34 m of clearance and
// matches the academic free-throw model (Tran & Silverberg 2008).
export const BALL_RELEASE_HEIGHT_M = 1.80;
export const BALL_RELEASE_FORWARD_M = 0.50;
export const BALL_RELEASE_LATERAL_M = 0.00;

// === Hoop geometry ===
// Rim is a horizontal ring centred at (rim_x, rim_y, rim_z). The
// `rim_x` baseline is zero; the per-shot offset (see backboard.js)
// translates the rim and backboard together along the x axis.
export const RIM_X_BASE_M = 0.00;
export const RIM_HEIGHT_M = 3.05;
export const RIM_FORWARD_M = 4.27;
// 0.276 = 0.23 × 1.20. Real NBA rim is 0.23 m (18″ diameter) but
// arcade hoop games traditionally widen the rim for feel — Pop-A-Shot
// machines use ~0.235 m (18.5″), NBA Jam / NBA Street widen further.
// At 0.276 m the gap between ball edge and rim edge becomes 0.156 m
// (vs 0.110 m at regulation) — ~40 % more "fit-through" room.
// Affects: rim collision torus, scoring cleanZone/outerZone, visual
// rim ellipse — all scale automatically off this constant.
export const RIM_INNER_RADIUS_M = 0.276;
// Tube radius — the metal thickness of the rim, also serves as
// the collision capsule radius around the ring.
// Fatter than realistic metal so the rim has a wider collision
// profile — off-axis shots glance the rim and rattle instead of
// flying past. Combined with the narrower MAX_ANGLE_RAD, almost
// every shot ends up interacting with the rim or backboard.
// 0.03 m — slightly thicker than real NBA rim metal (~0.016 m) for
// a touch of collision generosity, but much thinner than the
// pre-widening 0.06 m. With the widened RIM_INNER_RADIUS_M (0.276),
// the front of the collision torus had been intercepting descending
// shots BEFORE they cleared the rim plane. Tightening the tube
// shrinks the collision sphere from 0.18 m radius to 0.15 m, which
// lets centred shots clear the front edge while still triggering
// off-axis grazes on shots that aim near the rim ring.
export const RIM_TUBE_RADIUS_M = 0.03;

// === Backboard ===
// Backboard sits a small distance behind the rim centre (the rim
// brackets onto the front of the backboard with ~15 cm of overhang).
// Treated as a vertical rect perpendicular to the z axis.
export const BACKBOARD_X_BASE_M = 0.00;
export const BACKBOARD_Z_M = 4.50;          // ~23 cm behind rim centre
export const BACKBOARD_HALF_WIDTH_M = 0.90; // 1.8 m wide
export const BACKBOARD_TOP_Y_M = 3.95;      // 0.9 m above rim
export const BACKBOARD_BOTTOM_Y_M = 2.90;   // 0.15 m below rim

// Shooter's square — the painted red rectangle on the board front.
// Real NBA regulation: 24" wide × 18" tall, bottom edge 4" above the
// rim, centred on the rim. A ball that contacts the board INSIDE this
// rectangle has its post-bounce velocity overridden in physics.js to
// free-fall into the rim — the iconic "bank off the square" almost-
// always-goes-in shot. Skill remains in HITTING the square.
export const SHOOTER_SQUARE_HALF_WIDTH_M = 0.305;  // 24"/2 = 0.6096/2
export const SHOOTER_SQUARE_BOTTOM_Y_M = 3.15;     // RIM_HEIGHT_M + 4"
export const SHOOTER_SQUARE_TOP_Y_M = 3.61;        // bottom + 18"

// === Ball ===
export const BALL_RADIUS_M = 0.12;

// === Physics ===
export const GRAVITY_M_S2 = 9.81;
export const PHYSICS_DT = 1 / 60;
// 10 seconds of simulation max — real shots resolve in well under 2 s.
export const MAX_TRAJECTORY_STEPS = 600;

// Power maps to velocity via a baseline+linear curve:
//   v = VELOCITY_BASELINE_M_S +
//       (power − MIN_POWER) / (MAX_POWER − MIN_POWER) ·
//       (VELOCITY_SCALE_M_S − VELOCITY_BASELINE_M_S)
//
// Tuned so each fifth of the pullback range lands in a distinct
// physics band (Fish's 5-band feel spec):
//   v 4.0–5.4  (Q1, too weak — short)
//   v 5.4–6.8  (Q2, rim-and-in)
//   v 6.8–8.2  (Q3, swish — academic optimum 7.44 sits mid-band)
//   v 8.2–9.6  (Q4, backboard)
//   v 9.6–11.0 (Q5, over the backboard)
//
// The previous `v = power · 8` linear-through-zero mapping wasted
// the bottom 60 % of the player's pullback on velocities too low
// to reach the rim. Baseline+linear preserves the same useful
// "perfect shot" velocity (~7.4 m/s) while spreading the gradient
// across the player's full drag range.
// VELOCITY_BASELINE raised 4.8 → 5.6: a shot needs ~6.0 m/s just to
// reach rim height, so at 4.8 baseline roughly the bottom QUARTER of
// the power meter was a dead "falls short" zone. 5.6 shrinks that to
// ~10% — much less of the meter is wasted on shots that can't reach
// the hoop. The useful band gradient now spans 5.6–9.5 m/s.
export const VELOCITY_SCALE_M_S = 9.5;
export const VELOCITY_BASELINE_M_S = 5.6;

// Free-throw elevation angle from horizontal. Real-world studies put
// the optimal release angle around 52-55°. We use 55° for a slightly
// arched shot that gives realistic over/short windows.
export const SHOT_ELEVATION_RAD = 55 * Math.PI / 180;

// === Input bounds ===
// Lateral aim AND elevation are both derived client-side from the
// player's pull-back / flick direction (mouseArrow.js, touchFlick.js).
// The bounds here are server-side validation only — wide enough to
// admit any reasonable client input, rejecting nonsense.
//
// Under the variable-elevation input model, a near-horizontal pull
// can produce a lateral angle approaching SHOT_ELEVATION_RAD itself
// (~55°). ±π/2 is the strict physical upper bound; beyond that the
// ball would fly backwards. Players who pull far off-axis intentionally
// miss — that's where the skill lives.
export const MIN_ANGLE_RAD = -Math.PI / 2;
export const MAX_ANGLE_RAD = Math.PI / 2;
export const MIN_POWER = 0.10;
// MAX_POWER 1.20 (was 1.00) extends the player's drag range so the
// 5th band — "ball flies over the backboard, too hard" — becomes
// reachable. At 1.20·VELOCITY_SCALE_M_S = 9.6 m/s with default 55°
// elevation, the apex clears the backboard top and the ball sails
// past. The cursor needs to drag MOUSE_DRAG_FULL_POWER_PX · 1.20
// (= 120 px at current setting) to hit MAX, still well within the
// usable canvas space below the ball.
export const MAX_POWER = 1.20;

// Launch elevation bounds (radians). The shot payload's `elevation`
// field is optional — when omitted, simulateShot defaults to
// SHOT_ELEVATION_RAD (55°) for backward compatibility. When provided,
// it must be in [0, π/2]: 0 = horizontal launch (ball never reaches
// rim), π/2 = straight up.
export const MIN_ELEVATION_RAD = 0;
export const MAX_ELEVATION_RAD = Math.PI / 2;

// === Collision response ===
// Rim and backboard use normal-restitution + Coulomb friction (see
// physics.js). Values grounded in Docs/games/basketball/PHYSICS_RESEARCH.md
// — FIBA ball COR ≈0.76, Okubo & Hubbard (2006) measured ball↔rim
// friction μ=0.5, ball↔backboard friction μ≈0.6.
//
// Normal restitution at the rim. 0.70 matches R2 cannon-es and sits
// just below the FIBA-implied ball COR upper bound. Lower values
// (tried 0.55) made the ball continue forward through the rim and
// bank off the board instead of rattling — opposite of what was
// expected, so reverted.
export const RIM_BOUNCE_FACTOR = 0.70;
// Tangential friction at the rim (Coulomb μ). Okubo & Hubbard (2006)
// measured 0.5 for leather basketball on steel rim; composite balls
// + modern rims are likely similar. Controls how much the ball slides
// along the rim during a glancing contact — the "rim ride" feel.
export const RIM_TANGENT_FRICTION_MU = 0.5;
// Normal restitution at the backboard front face. Tempered glass is
// stiffer than rim metal; engine-backed references use 0.6–0.7. 0.65
// sits between R1 (0.6) and R2 (0.7) — bumped from 0.55 after playtest
// reported banks felt lifeless. The Coulomb friction term below
// regulates how much lateral slide a hard bank produces.
export const BACKBOARD_BOUNCE_FACTOR = 0.65;
// Tangential friction at the backboard (Coulomb μ). Higher than the
// rim because tempered glass on leather is grippier than steel on
// leather. Okubo-Hubbard cite ≈0.6 for ball↔backboard. Replaces the
// flat `vx *= 0.8` multiplier that made every bank-shot slide look
// identical regardless of impact strength.
export const BACKBOARD_TANGENT_FRICTION_MU = 0.6;
// Air drag halved (0.9988 → 0.9995, ~3%/s loss). The previous value
// was eating most of the clearance between the ball's apex
// trajectory and the rim's front edge, forcing the swish band into a
// single power value. With less drag the trajectory preserves more
// height at the rim front, opening the swish window across multiple
// power values. Still within the modest-linearDamping range engine-
// backed sports games use.
export const AIR_DRAG_PER_STEP = 0.9995;

// === Ball spin ===
// Initial backspin imparted on every shot. 3 Hz is the academic
// optimum for a free throw (Tran & Silverberg 2008 — the rate that
// maximises the rim-friendly grip and gives "shooter's roll"). The
// horizontal axis of spin is automatically chosen perpendicular to
// the ball's flight direction (top of ball rotates against motion).
//
// Used by the rim collision: contact-point velocity = v + ω×r, so
// a spinning ball produces different friction behaviour than a
// non-spinning one. This is the SolShot equivalent of the "slip /
// no-slip" rim dynamics in Okubo & Hubbard 2006 — same effect,
// simpler maths (no 4-D phase-space state machine).
// 0 Hz at release — first-contact friction matches the pre-backspin
// behaviour (which Fish confirmed was working). Spin still *develops*
// from rim-contact friction torque, so the "shooter's roll" mechanic
// shows up on multi-contact rattles where it actually matters, but
// single-contact shots aren't suffocated by spin-augmented friction.
// (Academic optimum is 3 Hz — Tran & Silverberg 2008 — but at that
// magnitude the spin contribution to contact-point velocity becomes
// ≈2.3 m/s and dominates the Coulomb friction direction, bleeding
// linear energy too aggressively. Can dial back up if needed.)
export const INITIAL_BACKSPIN_HZ = 0;
// Moment-of-inertia factor for a hollow sphere: I = factor · m · r².
// Used in the angular-impulse update at rim contact:
//   Δω = (r_contact × J_friction) / I
export const BALL_MOI_FACTOR = 2 / 3;

// === Ground level ===
// Floor for ball-end detection. Ball is considered "dropped out of
// play" when its bottom touches the floor.
export const FLOOR_Y_M = 0.00;

// === Scoring ===
export const POINTS_SWISH = 2;
export const POINTS_RIM_IN = 1;
export const POINTS_BACKBOARD_BANK = 1;
export const POINTS_HEAT_CHECK_SWISH = 3;

// === Heat check (speed-based bonus) ===
// 3 swishes within 10s activates; rim_in / bank_in break the streak.
export const HEAT_CHECK_TRIGGER_SWISHES = 3;
export const HEAT_CHECK_TRIGGER_WINDOW_MS = 10_000;
export const HEAT_CHECK_TIMEOUT_MS = 10_000;
