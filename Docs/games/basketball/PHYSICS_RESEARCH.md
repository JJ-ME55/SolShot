# Basketball Physics Research

Grounded reference for tuning the first-person free-throw module
(`arcade/basketball` branch). Every value in this doc has a citation —
either a specific file:line in an open-source project, or a measured /
published value from physics research. **No guesswork.**

Reference-feel target: *Basketball Flick 3D* / *Arcade Hoops Basketball
Free* (both closed-source). Our current build feels "billiard-ball-ish"
because the rim uses a uniform 0.40 reflection coefficient and the
release velocity is hand-tuned. This doc gives us defensible targets.

---

## 1. Repos surveyed

| # | Repo | Lang / Engine | Stars | Approach | Quality signal |
|---|------|---------------|-------|----------|----------------|
| R1 | [benjaminmiles/react-three-basketball](https://github.com/benjaminmiles/react-three-basketball) | React-three-fiber + cannon-es | 11 | Engine-backed; explicit ContactMaterial values | Tier 2 — small but tuned |
| R2 | [ggelu/Simple-JS-BasketBall-Game](https://github.com/ggelu/Simple-JS-BasketBall-Game) | Three.js + cannon-es | 0 | Engine-backed; FPS-style first-person | Tier 3 — student project, but our exact problem shape |
| R3 | [tutsplus/BasketballFreeThrowUnity](https://github.com/tutsplus/BasketballFreeThrowUnity) | Unity (PhysX) | 19 | PhysicMaterial + Rigidbody | Tier 2 — published tutorial, deliberate setup |
| R4 | [jmloeffler/BasketballPhysics](https://github.com/jmloeffler/BasketballPhysics) | Unity (PhysX) | small | Bounciness-1 PhysicMaterial | Tier 3 — minimal |
| R5 | [Sebastvin/basketball-game-fp](https://github.com/Sebastvin/basketball-game-fp) | Unity (PhysX) | small | First-person, predicted trajectory | Tier 3 — student, but again first-person |
| R6 | [nesanders/basketballsim](https://github.com/nesanders/basketballsim) | Python (NumPy) | small | Trajectory-only optimizer, no collision | Tier 2 — research-style sweep over release angle/velocity |
| R7 | [BonbonLemon/basketball](https://github.com/BonbonLemon/basketball) | Phaser 2 (2D) | 37 | 2D Arcade Physics, single-axis bounce | Tier 4 — 2D, not directly comparable |

### Honesty note up front

The open-source basketball ecosystem is mostly student projects
delegating physics to an engine (PhysX or cannon) with one global
`bounciness` / `restitution` value. **None of the surveyed repos
implement a research-grade rim collision model** (separated normal /
tangential restitution + Coulomb friction + spin transfer). The only
academic-grade reference for ball-rim dynamics is Okubo & Hubbard
(2006), which is not open-source. So the high-impact recommendations
below come from a mix of: (a) the *consistent* engine restitution
choices the engine-backed games settle on, and (b) measured / published
physics constants. This is enough to fix the "billiard ball" feel
without inventing numbers.

---

## 2. Per-repo physics extracts

### R1. react-three-basketball (cannon-es)

Source: `src/App.jsx`
([raw link](https://raw.githubusercontent.com/benjaminmiles/react-three-basketball/main/src/App.jsx))

- **Gravity:** `[0, -20, 0]` (≈ 2× real g). Line ~169.
- **Default ContactMaterial:** `friction: 0.3`, `restitution: 0.6`
  (line ~169). Applied to ball↔everything.
- **Ball:** `mass: 1`, `linearDamping: 0.01`, `radius: 0.3` (lines ~44–45).
- **Shoot impulse on tap:** `[0, 15, -10]` → magnitude 18, elevation
  `atan(15/10) ≈ 56°` from horizontal. Line ~50.
- **Backboard:** kinematic box `[2.2, 1.8, 0.2]` at `[0, 5, -8]`.
  No separate material — inherits default `restitution: 0.6`.
- **Rim collision:** compound body of **50 small spheres** arranged in
  a ring with `gap: 0.5`, each sphere `radius: 0.25` — i.e. they
  approximate the torus with discrete spheres so the cannon-es broadphase
  handles glancing bounces correctly. Lines ~97–108.
- **Score detection:** trigger zone box `[0.8, 0.2, 0.8]` below the rim,
  fires when ball enters with `vy < 0` and exits with `vy < 1`. Lines
  ~112–122.
- **Air drag:** `linearDamping = 0.01` per step (cannon default-ish).

**Takeaway:** rim restitution = backboard restitution = 0.6, uniform
(engine handles tangent component automatically via the contact
manifold; the friction 0.3 *is* the tangential coupling).

---

### R2. ggelu Simple-JS-BasketBall-Game (three.js + cannon-es)

Source: `proiect/js/main.js`
([raw link](https://raw.githubusercontent.com/ggelu/Simple-JS-BasketBall-Game/main/proiect/js/main.js))

- **Gravity:** `world.gravity.set(0, -20, 0)` (matches R1 — 2× g; common
  cannon-es convention for "snappier" games).
- **ContactMaterial — physics↔physics (player vs walls):**
  `friction: 0.9, restitution: 0.1`.
- **ContactMaterial — ball↔physics (ball vs everything):**
  `friction: 0.4, restitution: 0.7`.
- **Ball:** `mass: 1`. Player mass: 5.
- **Shoot velocity:** `13.5 m/s` along view direction.
- **Hoop:** `CANNON.Trimesh.createTorus(0.7, 0.2, 25, 25)` — an actual
  torus mesh, radius 0.7, tube 0.2, 25 segments. Position `(0, 3.5, -4)`.
  Mass 0 (static).
- **Backboard:** static box, same ball ContactMaterial → restitution 0.7.

**Takeaway:** when an indie author actually *tunes* the ball-vs-rim
contact (not just leaves defaults), they pick **restitution ≈ 0.7** and
**friction ≈ 0.4**. The closeness of those numbers to the measured
FIBA ball-COR (0.76) and Okubo-Hubbard friction (0.5) is conspicuous.

---

### R3. tutsplus/BasketballFreeThrowUnity (Unity PhysX)

Sources:
- `Assets/BounceMaterial.physicMaterial`
- `Assets/Ball.prefab`
- `Assets/Shoot.cs`
- `Assets/Basket.cs`

PhysicMaterial values (the bouncy material applied to ball and/or hoop):
- `dynamicFriction: 0.4`
- `staticFriction: 0.4`
- `bounciness: 1.0`
- `frictionCombine: 0` (Average)
- `bounceCombine: 0` (Average)

Ball Rigidbody (from `Ball.prefab`):
- `mass: 1.0`, `drag: 0.0`, `angularDrag: 0.05`, `useGravity: true`.
- SphereCollider `radius: 0.5`.

Shot code (`Shoot.cs`):
- `Physics.gravity = new Vector3(0, -20, 0)` — overrides Unity default
  −9.81 with **−20**. This is the third independent repo to land on
  ~2× real gravity for arcade feel.
- Throw vector: `new Vector3(0, 26 + arrow.x, 40 + arrow.x)`, applied
  as `ForceMode.Impulse`. So nominal `vy = 26, vz = 40`, magnitude
  ≈ 47.7 m/s, elevation `atan(26/40) ≈ 33°` — but remember gravity is
  doubled, so the *trajectory shape* corresponds to about
  `47.7/√2 ≈ 33.7 m/s` under real gravity, which is way too fast for
  real units. The tutorial is clearly working in non-SI units. Just the
  **ratios** matter for us:
  - elevation ≈ 33° (low arch — they want a flatter shot)
  - bounciness 1.0 *with `bounceCombine: Average`* means actual
    coefficient depends on the *other* surface's bounciness. If the
    backboard collider has no PhysicMaterial assigned, Unity defaults
    to bounciness = 0 → average = **0.5**.

**Takeaway:** Unity-tutorial-level approach sets one material to `1.0`
bouncy and lets averaging with default surfaces give an effective
**0.5 restitution**. Friction 0.4. Gravity 2× real.

---

### R4. jmloeffler/BasketballPhysics (Unity)

Sources: `Assets/Bouncy.physicMaterial`, `Assets/Main.cs`

- `dynamicFriction: 0.5, staticFriction: 0.5, bounciness: 1.0`.
  Same averaging trick as R3 → effective ~0.5 with default surfaces.
- `Main.cs`: shot force slider 0..80, applied as Impulse. No gravity
  override, so Unity default −9.81. Default Rigidbody drag.

**Takeaway:** identical pattern to R3 — friction 0.5, bounciness 1.0
relying on Average combine.

---

### R5. Sebastvin/basketball-game-fp (Unity, first-person)

Sources: `Assets/Materials/Ball.physicMaterial`, `Assets/Scripts/Shooter.cs`

- Ball PhysicMaterial: `dynamicFriction: 100`, `staticFriction: 100`,
  `bounciness: 0.75`. The friction = 100 is almost certainly a
  beginner mistake (Unity friction is 0..1), but it interacts with
  `frictionCombine` to produce effectively "max friction." The
  meaningful number here is **bounciness 0.75** — this is the only
  surveyed repo whose author explicitly typed a value matching the
  FIBA-implied ball COR (≈0.76, see §3).
- `Shooter.cs`: `transform.forward * power`, where `power` is set in
  the Inspector (not in source — value unknown). Aim limited to:
  - X-axis pitch: −0.45 to +0.30 radians (−25.8° to +17.2°)
  - Y-axis yaw: ±0.4 radians (±22.9°)
- Default Unity gravity (no override visible).

**Takeaway:** an author serious enough to look up the regulation ball
COR picked **0.75** for ball bounciness — matches the academic value
better than any other surveyed repo.

---

### R6. nesanders/basketballsim (Python research-style)

Sources: `basketball_angles_optimize.py`, `basketball_angles_graphic_setup.py`

- **Gravity:** `9.81 m/s²` (real). Hardcoded in trajectory integration.
- **Release height:** `y_0 = 7 ft = 2.135 m`.
- **Rim height:** `y_f = 10 ft = 3.05 m`.
- **Horizontal distance to rim:** `x_f = 20 ft = 6.1 m` (NB: this is a
  three-point line distance, not free-throw — the sim is about 3-point
  shots).
- **Angle sweep:** `arange(30, 71, 4) * π/180` → 30° to 70° in 4° steps.
- **Initial velocity solver:** `fsolve(in_basket, 9, ...)` — seeds at
  9 m/s, root-finds the velocity that makes the trajectory pass through
  the basket centre for each angle.
- **Velocity noise model:** `vi * np.random.normal(1, 0.02)` — 2% σ on
  velocity (used to study how robust each angle is to player error).
- **No collision model.** Treats the basket as a point. No rim, no
  backboard, no air drag.

**Takeaway:** confirms the standard physical setup (real g, real
geometry) and quantifies player error as ~2% velocity sigma. Useful for
calibrating our own "perfect-shot velocity" target but tells us nothing
about bounces.

---

### R7. BonbonLemon/basketball (Phaser 2, 2D)

37 stars but it's 2D Arcade Physics, single-axis bounce — not
comparable to our 3D model. Skipping in favour of the higher-quality
3D references. Mentioning only for completeness.

---

## 3. Real-world reference values

### 3.1 Ball coefficient of restitution (vs hard floor)

- **FIBA regulation:** ball dropped from 1800 mm must rebound to
  1035–1085 mm. COR = √(h_bounce / h_drop) →
  **COR ∈ [0.758, 0.776]**.
  Source: [Wikipedia — Coefficient of restitution](https://en.wikipedia.org/wiki/Coefficient_of_restitution),
  [Topend Sports](https://www.topendsports.com/biomechanics/coefficient-of-restitution.htm).
- **Academic simulation models** assume COR ≈ **0.75** for a regulation
  ball (e.g. *Identification of basketball parameters for a simulation
  model*).

### 3.2 Ball-rim friction

- **Okubo & Hubbard (2006), "Dynamics of basketball-rim interactions":**
  measured coefficient of friction between a *leather* basketball and a
  steel rim = **0.5** (slip test).
  Source: [Springer Sports Engineering, BF02843970](https://link.springer.com/article/10.1007/BF02843970),
  and Okubo/Hubbard's later paper *Dynamics of the basketball shot with
  application to the free throw*
  ([PubMed 17101533](https://pubmed.ncbi.nlm.nih.gov/17101533/)).
- **Ball-backboard friction (tempered glass):** estimated **≈ 0.6** by
  the same line of research (cited in *A multi-factorial computational
  analysis of basketball rebound dynamics*).

### 3.3 Normal and tangential restitution on rim

Okubo & Hubbard model the ball as a *radially compliant* shell with
internal damping rather than using a single normal COR — they switch
between three sub-models (slipping, non-slipping, gravitational
flight). The effective normal COR is *not* a single published constant
in their paper.

However, the regulation **ball-on-rigid-surface COR ≈ 0.75** is a
defensible upper bound for the rim's normal restitution (rim is
basically rigid steel; the ball is the compliant element). Game
engines collapse "ball restitution × surface restitution" via
Average/Multiply combine into one number; either way the result lands
around **0.6–0.75** for ball↔rim.

For the *tangential* direction, the right primitive is a Coulomb
friction coefficient (μ = 0.5 ball↔rim, μ ≈ 0.6 ball↔backboard), not a
second restitution. This is the key insight our current code misses —
we damp tangential velocity by the same 0.40 factor as normal, which
is what makes the ball look like a billiard ball.

### 3.4 Optimal release angle (free throw)

- **Tran & Silverberg (2008), *Optimal release conditions for the free
  throw in men's basketball*** (Journal of Sports Sciences, 26(11)):
  optimal release angle **52–53°**, with **≈3 Hz backspin**, aiming
  ≈7 cm behind rim centre, with the trajectory peak ≈4 cm below the top
  of the backboard.
  Sources: [PubMed 18645735](https://pubmed.ncbi.nlm.nih.gov/18645735/),
  Scientific American — [The Math behind the Perfect Free Throw](https://www.scientificamerican.com/article/the-math-behind-the-perfect-free-throw/).
- **2017 arXiv** *The physics of an optimal basketball free throw*
  (1702.07234): for a 2.02 m release height, the minimum-velocity /
  maximum-error window sits at **47–57.5°** with the optimum near 56°,
  shot speed **~7.59 m/s**.
  Source: [ar5iv 1702.07234](https://ar5iv.labs.arxiv.org/html/1702.07234).
- **Consensus:** 52–56° depending on release height. Our fixed **55°**
  is within consensus.

### 3.5 Release velocity (real values)

- Real FT release height ≈ 2.0–2.4 m (eye height + arm extension).
  Tran/Silverberg use ~2.13 m; arXiv 2017 uses 2.02 m.
- Required initial speed at 52–56°, release height 2.1 m, rim 3.05 m
  at 4.225 m forward (= NBA FT line + rim overhang): **~7.3 m/s** for a
  clean swish.
  - nesanders/basketballsim solver seeds at 9 m/s for a *3-point* shot
    (6.1 m), so 7–7.5 m/s for a free throw is consistent.

Our current `VELOCITY_SCALE_M_S = 8.0` with "perfect at power 0.93"
gives ~7.44 m/s — **right in the consensus window**. This is not where
we're wrong.

### 3.6 Air drag

- Tran/Silverberg and most academic models include air drag with
  ρ_air = 1.21 kg/m³, C_d ≈ 0.47 (sphere), A = π(0.12)² ≈ 0.045 m².
  Drag force magnitude at 7 m/s: `½·ρ·v²·C_d·A ≈ 0.63 N`. Over 1 s,
  that's a velocity loss of `0.63/0.62 kg ≈ 1 m/s` — material but not
  dominant.
- We currently have **zero air drag**. Closest engine analogue:
  cannon-es `linearDamping ≈ 0.05` per second (R1 uses 0.01, which is
  almost negligible).

---

## 4. Side-by-side comparison

Values where a repo uses an engine, the listed number is the
ContactMaterial value (cannon) or PhysicMaterial value (Unity) most
relevant to the ball↔rim/backboard contact.

| Parameter | Ours | R1 cannon | R2 cannon | R3 Unity | R4 Unity | R5 Unity | Real-world | Verdict |
|-----------|------|-----------|-----------|----------|----------|----------|------------|---------|
| Gravity (m/s²) | **9.81** | 20.0 | 20.0 | 20.0 | 9.81 | 9.81 | 9.81 | Ours = real. R1/R2/R3 use 2× for arcade snap. **Defensible to stay at 9.81.** |
| Release elevation | **55°** | ~56° | (n/a) | ~33° | (slider) | (variable) | 52–56° | **In consensus.** Don't change. |
| Release speed (m/s) | **7.44 at p=0.93** | (impulse-based) | 13.5 | (non-SI) | (slider) | (Inspector) | 7.3–7.6 | **In consensus.** Don't change. |
| Ball↔rim normal restitution | **0.40** | 0.6 | 0.7 | ~0.5 (avg combine) | ~0.5 (avg combine) | 0.75 | 0.6–0.75 | **WE ARE THE OUTLIER (too low).** |
| Ball↔rim tangential damping | **0.40** (same as normal) | engine: μ=0.3 friction | engine: μ=0.4 friction | μ=0.4 | μ=0.5 | μ=1.0 (clamped) | μ=0.5 (Okubo-Hubbard measured) | **Wrong primitive entirely.** We damp tangent by 0.4; engine-backed games use a Coulomb friction term that *only* opposes tangential motion proportional to the normal impulse. |
| Ball↔backboard normal restitution | **0.45** | 0.6 | 0.7 | ~0.5 | ~0.5 | 0.75 | ~0.6 | **Low but less wrong than rim.** |
| Ball↔backboard tangent (x) damping | **×0.8 per hit** | engine friction | engine friction | engine friction | engine friction | engine friction | μ≈0.6 friction | **Wrong primitive again.** |
| Ball↔backboard vy preservation | **vy unchanged** | engine: vy preserved* | preserved | preserved | preserved | preserved | preserved (gravity does the dropping) | Ours matches consensus — vy unchanged after bank is *correct*. |
| Air drag | **0** | linDamp 0.01 | (default) | drag 0 | drag 0 | drag 0 | C_d≈0.47 sphere → ~1 m/s loss per s | Ours = consensus (engine-backed games also skip explicit drag). Optional. |
| Ball radius (m) | **0.12** | 0.30 | (un-scaled) | 0.5 (non-SI) | (default) | (real-ish) | 0.12 (size-7) | Ours = real. |
| Rim inner radius (m) | **0.23** | ~0.5 (non-SI) | 0.7 (non-SI) | ? | ? | ? | 0.2286 (NBA 18″) | Ours = real. |

*Engine-default: a wall collision under cannon-es / PhysX with no
manual y-damping leaves vy almost untouched and just reflects the
normal component.

### The big finding (visual summary)

- **Geometry and trajectory:** we are dead-on with reality and within
  consensus of engine-backed games.
- **Energy retention on rim:** we are **the outlier** — 0.40 vs a
  consensus of 0.5–0.75. This is why the ball "clangs out" too dead.
- **Tangential behaviour:** every engine-backed reference replaces
  uniform tangent damping with a *friction* term that scales with
  normal impulse. We use a single multiplier on both components. This
  is the *primary* cause of the "billiard ball" feel — billiards is
  exactly the case where normal and tangential restitution are
  uncoupled and uniform.

---

## 5. Recommendations

Ordered by expected impact on feel. All recommendations are bounded by
either a cited repo value or a measured physics constant. No invented
numbers.

### Rec 1. Raise `RIM_BOUNCE_FACTOR` from 0.40 → 0.60

- **Current:** `RIM_BOUNCE_FACTOR = 0.40` (`constants.js:92`).
- **Recommended:** `0.60` (range 0.55–0.70).
- **Evidence:**
  - R1 (cannon-es, tuned): `restitution: 0.6` for default contact.
  - R2 (cannon-es, tuned for basketball specifically): `restitution: 0.7`.
  - R3 (Unity tutorial with averaging): effective ≈0.5.
  - FIBA-implied ball COR: 0.758–0.776.
  - Academic basketball-sim assumption: 0.75.
- **Expected effect:** ball retains more energy on rim contact, so
  glancing rim hits visibly *rattle* (multi-bounce against rim → drop
  through or kick out) instead of dying instantly on first touch. This
  is the dominant "real basketball" cue we're missing.

### Rec 2. Split rim collision into separate normal restitution + Coulomb friction (algorithm change, not just a number)

This is the highest-impact change — it directly fixes the billiard-ball
feel. Pseudocode adapted from how cannon-es / PhysX handle a sphere↔
torus contact internally:

```text
Given collision at ringPoint with outward normal n (unit vector from
ringPoint toward ball centre), pre-collision velocity v:

  v_n = (v · n) * n        // normal component, scalar (v·n) is < 0 when approaching
  v_t = v - v_n            // tangential component

  // Apply restitution to normal only (reverse + damp)
  v_n_new = -RESTITUTION_N * v_n            // RESTITUTION_N ≈ 0.60

  // Apply Coulomb friction to tangent: cap the tangent-velocity
  // reduction by μ * |normal-impulse|. For arcade purposes the
  // simplest form is: reduce v_t by a fraction proportional to μ,
  // never to less than 0.
  Δv_t = min(|v_t|, MU * (|v_n| + |v_n_new|))
  v_t_new = v_t * (1 - Δv_t / |v_t|)        // for |v_t| > 0
  // MU ≈ 0.5 (Okubo-Hubbard measured ball↔rim friction)

  v_out = v_n_new + v_t_new
```

The crucial difference vs our current code: when the ball strikes the
rim moving *along* the ring (e.g. a side-spin shot), the tangential
component is barely damped, so the ball *slides along the rim* before
falling — that's the real "rim ride" we want. With the current uniform
0.40 multiplier, a slide-along-rim shot dies instantly.

- **Evidence for algorithm shape:** every engine-backed reference (R1,
  R2, R3, R4, R5) uses normal-restitution + tangential-friction as the
  contact primitive — that's how PhysX and cannon-es resolve sphere
  contacts. Our uniform damping is the outlier.
- **Evidence for μ = 0.5:** Okubo & Hubbard (2006) slip-test
  measurement.
- **Evidence for restitution = 0.6:** see Rec 1.
- **Expected effect:** ball can ride and roll on the rim, glancing
  shots produce visible *side-of-rim* bounces instead of straight-up
  pop, rattle-in shots feel earned. This is the change that makes the
  feel match Basketball Flick 3D.

### Rec 3. Raise `BACKBOARD_BOUNCE_FACTOR` from 0.45 → 0.55 and add backboard friction on `vx` (not blanket 0.8 multiplier)

- **Current:** `BACKBOARD_BOUNCE_FACTOR = 0.45`; `vx *= 0.8` on every
  backboard hit (`physics.js:175–176`).
- **Recommended:**
  - Normal: `vz = -|vz| * 0.55` (range 0.50–0.65)
  - Tangential: replace `vx *= 0.8` with Coulomb friction on the
    `(vx, vy)` plane using μ ≈ 0.6:
    ```text
    v_t_mag = sqrt(vx² + vy²)
    Δv_t   = min(v_t_mag, 0.6 * |vz| * (1 + 0.55))
    if v_t_mag > 0:
      scale = (v_t_mag - Δv_t) / v_t_mag
      vx *= scale
      vy *= scale     // NOTE: only because we're in the impulse-applied
                       //       frame; vy continues to be governed by gravity
                       //       between steps. See caveat below.
    ```
  - **Caveat:** Fish has correctly tuned the current code so that
    `vy` is **unchanged** by backboard contact, on the reasoning that
    a wooden/glass backboard barely affects vertical descent. The
    physics is more subtle: friction *does* couple to vy during the
    contact instant, but the energy loss is small and gravity dominates
    in the subsequent flight. For arcade feel, **keep vy unchanged** —
    our current behaviour is consistent with every surveyed repo and
    with what bank shots look like in practice.
- **Evidence:**
  - Tempered glass ball-backboard friction ≈ 0.6 (Okubo-Hubbard).
  - R1/R2 use restitution 0.6–0.7 for backboard (same material as rim).
  - The "vy unchanged" choice is consensus.
- **Expected effect:** bank shots come off the glass with a *little*
  more zip (so they reach the rim from a deeper bank angle), and the
  lateral slide is governed by the strength of the normal impact —
  hard banks slide more, soft banks barely slide. The flat 0.8 multiplier
  on vx is what makes every bank look identical right now.

### Rec 4. Optional — add air drag at academic value, or cap with `linearDamping ≈ 0.02 per step`

- **Current:** zero.
- **Recommended:** modest exponential decay applied each step,
  equivalent to `linearDamping ≈ 0.02` over `dt = 1/60` (so
  multiplicative `0.9988^step`, i.e. ~7% velocity loss per second).
  - Real physics value: C_d=0.47 sphere → ~14% velocity loss/second at
    7 m/s. 0.02 damping is a tame version.
- **Evidence:** Tran/Silverberg academic models include drag. Engine
  defaults include linear damping. Our zero-drag is the outlier but
  the visual effect is small at our shot durations (<1.2 s flight).
- **Expected effect:** very subtle — the apex of the shot drops a
  centimetre or two compared to drag-free. Probably not perceptible.
  **Lowest priority of the four.**

### Rec 5. (Discuss before implementing) — keep gravity at 9.81 OR move to 2× g arcade convention

- Three of the five surveyed engine-backed repos (R1, R2, R3) use
  `g = 20 m/s²`. Tran/Silverberg and nesanders/basketballsim use
  `g = 9.81`.
- The arcade choice exists because at 2× g, the shot resolves twice as
  fast and the player gets snappier feedback. The physics-fidelity
  choice keeps the trajectory shape matching real free throws.
- Our entire constants block is annotated SI units. Switching to 2× g
  would require rescaling release velocity too, and risks breaking the
  "feels like real basketball" angle.
- **Recommendation:** keep g = 9.81. Don't touch unless we explicitly
  decide we want a faster-paced arcade feel and are willing to retune.

---

## 6. Open questions for Fish before tuning

1. **Algorithm scope.** Rec 2 (split normal + tangential at the rim) is
   an algorithmic change, not just a number swap. Want a code patch in
   the same shape as the existing code, or is the spirit of "no
   guessing" satisfied by just bumping `RIM_BOUNCE_FACTOR` to 0.60 (Rec
   1) and shipping?
2. **Friction μ.** Okubo-Hubbard measured 0.5 with *leather* balls on
   steel rims. Modern game balls are composite, modern rims are still
   steel — the value is likely close but not identical. Are we
   comfortable adopting 0.5 outright, or should we sweep 0.4–0.55 in
   playtesting?
3. **Backboard tangent friction.** If we adopt Rec 3 (split backboard
   tangent into a friction term), do we want `vy` to actually receive
   a small downward kick from friction (more physically correct but
   more "alive" feel), or keep `vy` untouched (consensus + current
   behaviour)? The recommendation above says keep vy untouched — flag
   if you want to revisit.
4. **Air drag.** Worth implementing at all given <1.2 s flight time,
   or skip until someone reports trajectory feels too "floaty"?
5. **Spin.** None of our surveyed open-source repos implement backspin
   at the rim — Okubo-Hubbard is the only place spin matters, and that
   paper is closed-source academic work. Tran/Silverberg say 3 Hz
   backspin is optimal. Are we eventually going to model spin (and
   spin-rim coupling that turns rolling-on-rim into rolling-in vs
   rolling-out), or is that out of scope for arcade feel?
6. **Reference feel verification.** "Basketball Flick 3D" / "Arcade
   Hoops Basketball" — neither is open-source. Without their numbers,
   our best proxy is the cluster of values around restitution 0.6–0.7
   and friction 0.4–0.5. If after Rec 1+2 the feel still isn't right,
   the next step would be to *film* one of the reference games, frame-
   step a rim hit, and back-out the COR from the bounce angle. Want to
   plan for that?

---

## Citations index

Code references (file:line in cited repos):
- `react-three-basketball/src/App.jsx` lines ~44–169 (gravity, materials, hoop construction)
- `Simple-JS-BasketBall-Game/proiect/js/main.js` (gravity, contact materials, torus)
- `tutsplus/BasketballFreeThrowUnity/Assets/BounceMaterial.physicMaterial` (bounciness 1.0, friction 0.4)
- `tutsplus/BasketballFreeThrowUnity/Assets/Shoot.cs` (gravity override, throw vector)
- `tutsplus/BasketballFreeThrowUnity/Assets/Ball.prefab` (mass 1, drag 0, angularDrag 0.05)
- `jmloeffler/BasketballPhysics/Assets/Bouncy.physicMaterial` (friction 0.5, bounciness 1.0)
- `Sebastvin/basketball-game-fp/Assets/Materials/Ball.physicMaterial` (bounciness 0.75)
- `Sebastvin/basketball-game-fp/Assets/Scripts/Shooter.cs` (pitch/yaw bounds)
- `nesanders/basketballsim/basketball_angles_graphic_setup.py` (g=9.81, release 7ft, rim 10ft, 20ft)
- `nesanders/basketballsim/basketball_angles_optimize.py` (angle sweep 30–70°, 2% velocity sigma)

Academic / measured references:
- Tran & Silverberg (2008) — optimal release 52–53°, 3 Hz backspin.
  [PubMed 18645735](https://pubmed.ncbi.nlm.nih.gov/18645735/)
- Okubo & Hubbard (2006) — ball↔rim μ=0.5, ball↔backboard μ≈0.6.
  [Sports Engineering BF02843970](https://link.springer.com/article/10.1007/BF02843970),
  [J Sports Sci 17101533](https://pubmed.ncbi.nlm.nih.gov/17101533/)
- *The physics of an optimal basketball free throw* (arXiv 1702.07234) —
  optimum 47–57.5°, 7.59 m/s at 2.02 m release.
  [ar5iv](https://ar5iv.labs.arxiv.org/html/1702.07234)
- FIBA ball-COR: 0.758–0.776 (drop test 1800→1035–1085 mm).
  [Wikipedia CoR](https://en.wikipedia.org/wiki/Coefficient_of_restitution),
  [Topend Sports](https://www.topendsports.com/biomechanics/coefficient-of-restitution.htm)
- *Basketball Surfaces and Coefficient of Restitution*, ISJOS v9 p5.
  [ISJOS PDF](https://www.isjos.org/pdfs/ISJOS_v9_p5.pdf)
- *Identification of basketball parameters for a simulation model*,
  ScienceDirect.
  [DOI](https://www.sciencedirect.com/science/article/pii/S1877705810003991)
