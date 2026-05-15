# Keepie-Uppies — Physics Research v0.1

Per Ball Games Playbook ch.1 — every physics constant cited from a research source, FIFA spec, or measured reference. No values invented from intuition.

This document is the **source of truth for `data/constants.js`**. Each constant in code carries a comment pointing at the section here that justifies it.

---

## Sources

| Ref | Citation |
|---|---|
| **[FIFA-LAW2]** | FIFA Laws of the Game 2024/25, Law 2: The Ball — *"of a circumference of not more than 70 cm (28 ins) and not less than 68 cm (27 ins)…not more than 450 g (16 oz) and not less than 410 g (14 oz)"* |
| **[GOFF-2010]** | Goff, J.E., Carré, M.J. (2010). *Soccer ball lift coefficients via trajectory analysis.* European Journal of Physics 31:775. Wind-tunnel + trajectory data for spinning Adidas Roteiro. Lift coefficient C_L vs spin parameter S = (Rω)/v. |
| **[CARRE-2002]** | Carré, M.J., Asai, T., Akatsuka, T., Haake, S.J. (2002). *The curve kick of a football II: flight through the air.* Sports Engineering 5(4):193–200. Trajectory model for spinning football including drag + Magnus + gravity. |
| **[ASAI-2007]** | Asai, T., Seo, K., Kobayashi, O., Sakashita, R. (2007). *Fundamental aerodynamics of the soccer ball.* Sports Engineering 10(2):101–110. Drag and lift coefficients across panel geometries and spin states. |
| **[ICAO-ATM]** | ICAO Standard Atmosphere — air density at sea level ρ = 1.225 kg/m³ at 15 °C, 101.325 kPa. |
| **[CIPM-G]** | Standard gravitational acceleration g = 9.80665 m/s² (CGPM 1901). Rounded to 9.81 m/s² for game use. |

---

## Ball geometry + mass

### `BALL_RADIUS_M` — radius in metres

**Value: 0.11 m**

FIFA Law 2 specifies circumference 68–70 cm. Midpoint 69 cm → radius = 69 / (2π) ≈ 10.98 cm ≈ 0.11 m.

```js
// constants.js
export const BALL_RADIUS_M = 0.11;  // [FIFA-LAW2] circumference 68-70 cm midpoint
```

**Hitbox vs visual radius:** for mobile fat-finger forgiveness, the *hitbox* used for tap detection inflates by 20%: `HITBOX_RADIUS_M = BALL_RADIUS_M * 1.2 = 0.132 m`. Visual sprite stays at 0.11 m. This is a deliberate forgiveness pattern (basketball used inverse: strict bounds for miss readability — different game, different tradeoff).

### `BALL_MASS_KG` — mass in kg

**Value: 0.43 kg**

FIFA Law 2 specifies 410–450 g. Midpoint 430 g = 0.43 kg.

```js
export const BALL_MASS_KG = 0.43;  // [FIFA-LAW2] mass 410-450 g midpoint
```

**Why mass matters:** affects Magnus acceleration (F_magnus / m). Doesn't appear in the impulse model (we set velocity directly, not force).

---

## Environment

### `GRAVITY_M_S2`

**Value: 9.81 m/s²**

Standard gravity per CGPM 1901, rounded. No game-specific tuning — gravity is constant per the design's no-difficulty-curve commitment.

```js
export const GRAVITY_M_S2 = 9.81;  // [CIPM-G] standard gravitational acceleration
```

### `AIR_DENSITY_KG_M3`

**Value: 1.225 kg/m³**

Standard atmosphere at sea level per ICAO. Used to derive Magnus coefficient — not directly referenced in the runtime physics step.

```js
// (not directly in constants.js — used in the Magnus derivation below)
const AIR_DENSITY = 1.225;  // [ICAO-ATM] air density at sea level
```

---

## Magnus effect

This is the single most-tuned constant in the game. The whole "interesting" lives here.

### Real-world derivation

Magnus force on a spinning sphere in a fluid:

```
F_magnus = (1/2) * C_L * ρ * A * v²
```

where:
- `C_L` is the lift coefficient (dimensionless)
- `ρ` = air density (1.225 kg/m³)
- `A` = ball cross-section = π · R² = π · 0.11² ≈ 0.038 m²
- `v` = ball speed (m/s)

The lift coefficient depends on the **spin parameter** S = (R · ω) / v:

| Spin parameter S | C_L (per [GOFF-2010] Fig. 4) |
|---|---|
| 0.0 (no spin) | 0.0 |
| 0.1 | ~0.10 |
| 0.2 | ~0.18 |
| 0.3 | ~0.22 |
| 0.4 | ~0.25 |
| 0.5+ | plateaus near 0.27 |

For typical keepie-up rates: ω in 5–20 rad/s, v in 4–10 m/s, R = 0.11 m → S in 0.05–0.55. So C_L lives in the 0.05–0.27 range.

### In-game model (2D simplification)

We use the standard 2D Magnus equation:

```
F_magnus.x = -C_M * ω * v.y
F_magnus.y =  C_M * ω * v.x
```

where `C_M` bundles `(1/2) * C_L * ρ * A` divided by mass to give acceleration directly:

```
a_magnus = F_magnus / m
        ≈ (C_L * ρ * A) / (2 * m) * (ω × v)
        ≈ (0.2 * 1.225 * 0.038) / (2 * 0.43) * (ω × v)
        ≈ 0.0108 * (ω × v)   [m/s² with ω in rad/s, v in m/s]
```

So a **physics-faithful** `MAGNUS_COEFFICIENT ≈ 0.011`.

### `MAGNUS_COEFFICIENT` — starting value

**Value: 0.020 (research-faithful 0.011 × 1.8 readability boost)**

```js
export const MAGNUS_COEFFICIENT = 0.020;  // [GOFF-2010, ASAI-2007] derivation; ~1.8x readability boost over real-world for arcade visibility
```

**Reasoning for the boost:** at the physics-faithful 0.011, the trajectory bend over a typical 0.5–1.0 second flight is ~10–20 cm — visible but subtle. For an arcade game where the *whole point* is that off-centre taps create visible chaos, we want the bend to be 20–40 cm — clearly noticeable, definitely affecting where the ball lands. 1.8× scaling brings the visual effect into "obvious" territory without going so high it becomes random-feeling.

**Bracket for playtest tuning:** 0.012–0.030. If feel is "too predictable" → push higher. If feel is "uncontrollable random chaos" → push lower. Document each tuning step in the comment.

---

## Tap-impulse model

The tap impulse is **NOT physics-derived** — it's an arcade abstraction (a real foot strike is a complex contact mechanics problem). These constants set how the game *feels*, tuned by playtest.

### `BASE_UP_M_S` — straight-up velocity from a dead-centre tap

**Value: 6.0 m/s**

A real keepie-up cycle is ~1 second between touches. With `v_initial = 6 m/s` and `g = 9.81 m/s²`, the ball reaches apex at `t = 6/9.81 ≈ 0.61 s` and returns to launch height at ~1.22 s.

That's slightly slower than real-world (~1 s round-trip → `v_initial ≈ 4.9 m/s`) but gives the player more time per tap, which is friendlier on mobile.

```js
export const BASE_UP_M_S = 6.0;  // ~1.22 s round-trip, slightly above real keepie-up cadence for mobile-friendly timing
```

**Bracket:** 4.5–8.0. Above 8 the ball flies too high and feels "lobby." Below 4.5 the cadence is too rapid for taps to land cleanly.

### `LATERAL_GAIN` — sideways velocity at edge tap

**Value: 2.5 m/s**

A tap at the very edge (`|offset.x| = R`) sends the ball sideways at `LATERAL_GAIN`. Tuned so a max-edge tap moves the ball about 30–40% of the canvas width during a typical hang time — visible motion but not ball-immediately-leaves-screen.

```js
export const LATERAL_GAIN = 2.5;  // edge tap sends ball ~3 m laterally during a 1.2 s hang time
```

**Bracket:** 1.5–4.0.

### `VERTICAL_GAIN` — additional upward velocity from below-centre tap

**Value: 3.0 m/s**

A tap at the very bottom of the ball (`offset.y = -R`) adds 3.0 m/s to the upward launch. So `v_y = BASE_UP + 3.0 = 9.0 m/s` → ~1.83 s hang time.

```js
export const VERTICAL_GAIN = 3.0;  // bottom-edge tap adds ~50% more upward velocity
```

**Bracket:** 2.0–5.0.

### `SPIN_GAIN` — angular velocity at edge tap

**Value: 12.0 rad/s**

At edge tap (`|offset.x| = R`), spin maxes out at 12 rad/s ≈ 1.9 rev/s. With `BALL_RADIUS = 0.11 m` and typical post-tap velocity ~6 m/s, this gives spin parameter `S = (0.11 × 12) / 6 ≈ 0.22` — squarely in the visible-Magnus band per [GOFF-2010].

```js
export const SPIN_GAIN = 12.0;  // edge tap at ~6 m/s gives spin parameter ~0.22 (clearly visible Magnus per GOFF-2010 Fig. 4)
```

**Bracket:** 6–20.

---

## Wall + floor physics

### `WALL_RESTITUTION`

**Value: 1.0 (perfectly elastic)**

Walls don't decay the ball's energy. Gravity is the only energy sink in the system. Per design v0.1 — keeps the ball lively over long sessions, prevents wall-to-wall trapping from gradually dropping the ball below the player's tap zone.

```js
export const WALL_RESTITUTION = 1.0;  // walls perfectly elastic; gravity is the only energy sink
```

### Spin behaviour on wall bounce

**Spin unchanged.** No friction model on walls (would require a contact-point velocity computation similar to basketball's rim — not warranted here for v0). Wall bounces flip `vx`, leave `vy` and `ω` untouched.

```js
// in physics.js wall-bounce handler
if (x < BALL_RADIUS_M) {
    x = BALL_RADIUS_M;
    vx = -vx * WALL_RESTITUTION;
    // omega unchanged
}
```

### Floor — game over

No restitution applied; the ball never bounces off the floor in normal play (game ends on first contact). Swept-detection per playbook ch.4.2 — capture `prevY`, detect `prevY > FLOOR_Y + R && y <= FLOOR_Y + R` to catch the crossing even at high velocity.

```js
const floorContactY = FLOOR_Y_M + BALL_RADIUS_M;
if (vy < 0 && prevY > floorContactY && y <= floorContactY) {
    // game over
    return { score, terminationReason: 'floor' };
}
```

---

## Time integration

### `PHYSICS_DT_S`

**Value: 1/120 s ≈ 0.00833 s**

Fixed-timestep Euler. 120 Hz is overkill for this game but cheap, and it reduces tunneling risk on the floor crossing. Server and client both run at this dt for determinism.

```js
export const PHYSICS_DT_S = 1 / 120;
```

### `MAX_FLIGHT_STEPS`

**Value: 36000 (= 5 minutes at 120 Hz)**

Hard cap on simulation length per attempt. Five minutes of continuous play before the server forces termination — defensive against pathological inputs (player who somehow taps perfectly forever). Realistically a top human player might reach ~60 seconds; 5 minutes is generous insurance.

```js
export const MAX_FLIGHT_STEPS = 36000;
```

---

## Constants summary

| Constant | Value | Source |
|---|---|---|
| `BALL_RADIUS_M` | 0.11 | [FIFA-LAW2] |
| `BALL_MASS_KG` | 0.43 | [FIFA-LAW2] |
| `HITBOX_RADIUS_M` | 0.132 (= BALL_RADIUS × 1.2) | mobile forgiveness |
| `GRAVITY_M_S2` | 9.81 | [CIPM-G] |
| `MAGNUS_COEFFICIENT` | 0.020 | [GOFF-2010, ASAI-2007] +1.8× boost |
| `BASE_UP_M_S` | 6.0 | playtest start, ~1.22 s hang |
| `LATERAL_GAIN` | 2.5 | playtest start |
| `VERTICAL_GAIN` | 3.0 | playtest start |
| `SPIN_GAIN` | 12.0 | playtest start, S ≈ 0.22 [GOFF-2010] |
| `WALL_RESTITUTION` | 1.0 | design — perfectly elastic |
| `PHYSICS_DT_S` | 1/120 | determinism + tunneling margin |
| `MAX_FLIGHT_STEPS` | 36000 | 5-minute hard cap |
| `DEFAULT_WORLD_WIDTH_M` | 2.0 | revised v0.2 — see World dimensions §below |
| `FLOOR_Y_M` | 0 (by convention) | scene.js |

---

## World dimensions (revised v0.2)

Original v0.1 sized the playfield at 8m × 12m world / 800×1200 px canvas (100 px/m). Once we mounted the FIFA-spec ball.png in Phase 2, this rendered at **22 px diameter on canvas / ~11 px on phone after Scale.FIT downscale** — too small to read or tap.

**Revised v0.2:** 2m × 3m world / 800×1200 px canvas (400 px/m).

| Property | v0.1 | v0.2 |
|---|---|---|
| WORLD_WIDTH_M | 8.0 | **2.0** |
| WORLD_HEIGHT_M | 12.0 | **3.0** |
| PIXELS_PER_METRE | 100 | **400** |
| Ball diameter on canvas | 22 px | **88 px** |
| Ball diameter on phone (Scale.FIT @ 390 wide) | 11 px | **43 px** |

**Why this is fine for physics:** the simulation is parameterised by `worldWidth` per-attempt, so existing tests pass unchanged. No physics constant moved. The decision is purely "what's a realistic playable juggling area" — and 2m wide matches an actual real-life keepie-up juggling space (about 6.5 feet, the size of a small bedroom). The original 8m was an oversized arena that just happened to be the round number I picked first.

**Possible side-effect to watch in playtest:** with `LATERAL_GAIN = 2.5 m/s`, an edge tap sends the ball ~3m laterally during a 1.2s flight — exceeds the 2m world. Wall bounces are now part of normal play, not a corner case. If this feels too chaotic at playtest, drop `LATERAL_GAIN` to ~1.5 (edge tap travels 1.8m, mostly stays within world).

All four playtest-tuned constants (`MAGNUS_COEFFICIENT`, `BASE_UP_M_S`, `LATERAL_GAIN`, `VERTICAL_GAIN`, `SPIN_GAIN`) carry comment trails per playbook ch.3.4 — every value change documents the playtest feedback that drove it.

---

## Open questions

- Should `MAGNUS_COEFFICIENT` scale with absolute spin magnitude (real-world has C_L plateau above S ≈ 0.5)? For v0 we use linear scaling — simpler, and players unlikely to reach S > 0.4 with our `SPIN_GAIN` ceiling. Revisit if late-game runs show "spinning ball escapes player control entirely."
- Should the ball have **drag** (air resistance proportional to v²)? Real footballs do, with `C_D ≈ 0.20–0.25` per [ASAI-2007]. Omitted from v0 because gravity-only flight is more predictable for the player. Add if "ball flies too far" emerges as playtest feedback.
- Should wall bounce apply **friction** to spin? Real ball-on-wall would impart angular impulse via Coulomb friction at the contact point (basketball's rim model). Omitted from v0 — adds spin-coupled-collision complexity we don't need.
