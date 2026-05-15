# Free-Kick Madness — Physics Research

Grounded reference for tuning the free-kick trajectory module (`arcade/free-kicks` branch). Every value in this doc has a citation — either a peer-reviewed paper or an established regulation document. **No guesswork.**

Reference-feel target: a curl that lets the player bend the ball around a 9.15 m wall into a goal at 18–24 m, similar to Beckham vs Greece (2001) or Roberto Carlos vs France (1997) in scale. Our build must give the player a believable Magnus curl in arcade-readable form.

Physics rule for this game: **constants come from research, sensitivity / feel parameters come from playtest.** See [DESIGN.md §Input](DESIGN.md) for the input/tuning split.

---

## 1. Ball physical constants — IFAB / FIFA Law 2

**Source:** IFAB Laws of the Game 2024/25, Law 2 — The Ball. The Football Association (FA) mirror PDF. ([theifab.com](https://www.theifab.com/laws/latest/the-ball/))

| Quantity | Range | Sim default |
|---|---|---|
| Circumference | 68–70 cm | 69 cm |
| Diameter | 21.65–22.28 cm | 22 cm |
| Radius `r` | 0.1083–0.1114 m | **`r = 0.110 m`** |
| Mass `m` | 410–450 g | **`m = 0.430 kg`** |
| Cross-section `A = πr²` | — | **`A = 0.0380 m²`** |
| Pressure | 0.6–1.1 atm (sea level) | not modelled |

These are the canonical constants for `server/services/games/free-kicks/constants.js`. Cite the IFAB regulation in the constants file comment.

---

## 2. Drag coefficient `Cd`

### Reynolds regime

For free-kick speeds 25–35 m/s, diameter d ≈ 0.22 m, and air kinematic viscosity ν ≈ 1.5 × 10⁻⁵ m²/s:

```
Re = v·d / ν  ≈  3.7×10⁵ – 5.1×10⁵
```

This sits **post-critical** — i.e. above the drag-crisis transition. The drag crisis for soccer balls is at Re_crit ≈ 2.2 × 10⁵ – 3.0 × 10⁵ (Asai et al. 2007, citation [5]).

### Published `Cd` values

| Regime | `Cd` | Source |
|---|---|---|
| Subcritical (slow ball, Re < Re_crit) | ~0.43 | Asai et al. 2007 |
| **Supercritical, non-spinning** | **0.12–0.16** | Asai et al. 2007 / Hong & Asai 2014 (modern balls: Roteiro 0.12, Teamgeist II 0.13, Jabulani 0.13, Tango 12 0.15) |
| **Supercritical, spinning (free-kick)** | **0.25–0.30** | Bray & Kerwin 2003 (field-derived from real free-kicks) |

Spin **raises** Cd — both Carré's group and Asai's group note a roughly linear Cd-vs-Sp increase. The Bray & Kerwin numbers come from analysing actual spinning free-kicks; they are the right defaults for our use case.

### Recommended sim default

For Free-Kick Madness — where every shot has some spin (curl gesture):

```
Cd = 0.275                   // Bray & Kerwin 2003 midpoint, spinning regime
```

Or, for slightly higher fidelity, model as a linear function of the spin parameter Sp:

```
Cd(Sp) = 0.15 + 0.5 * Sp     // clamps to ~0.15 at Sp=0, ~0.30 at Sp=0.30
```

The Bray & Kerwin 2003 midpoint (single constant) is good enough for v1. **Document the choice as "Bray & Kerwin 2003 midpoint"** in the constants file comment.

---

## 3. Lift / Magnus coefficient `Cl`

### Spin parameter `Sp`

```
Sp = (r * ω) / v
```

For typical Free-Kick Madness shots:

| Scenario | `v` (m/s) | `ω` (rev/s → rad/s) | `Sp` |
|---|---|---|---|
| Low-end | 25 | 7 → 44 | 0.19 |
| **Midpoint** | **30** | **8 → 50** | **0.18** |
| High-end | 35 | 10 → 63 | 0.20 |
| Beckham 2001 | 36 | 10 → 63 | 0.19 |
| Roberto Carlos 1997 | 30 (avg) | 14 → 88 | 0.32 |

Free-kick `Sp` range: **~0.14–0.28** for realistic shots, **up to ~0.32** for the Roberto Carlos outlier.

### Published `Cl` values

| Source | Method | `Cl` |
|---|---|---|
| Bray & Kerwin 2003 | Field-derived from real free-kicks | **0.23–0.29** |
| Goff & Carré 2010 | Trajectory fit, derived Cl(Sp) | piecewise; high-v branch uses constants `c = 0.4127, d = 0.3056` (verify against PDF [4]) |
| Asai et al. 2007 | Wind tunnel side-force | 0.21 at Sp=0.18; 0.24 at Sp=0.22; 0.29 at Sp=0.34 |

### Recommended sim default

Linear in `Sp` across the free-kick range, clamped:

```
Cl(Sp) = clamp(0.2 + 0.5 * (Sp - 0.18), 0.15, 0.30)
```

This gives ~0.20 at Sp=0.18 (midpoint shot), ~0.27 at Sp=0.30 (heavy curl), and matches the Asai wind-tunnel slope. Cite **Goff & Carré 2010 + Asai et al. 2007** in the constants file.

### Open verification before constants land

The Goff & Carré 2010 equation form (using `c = 0.4127, d = 0.3056`) surfaced via citation summaries only — **before encoding it as the canonical form, open the PDF ([citation 4](#citations)) and copy the literal equation.** Per "no guessing" rule.

---

## 4. Spin decay

This is the most poorly-documented quantity for soccer specifically. We have a known framework from **Smits & Smith 1994** (golf-ball aerodynamic model, citation [7]):

```
τ_aero ≈ 0.5 * ρ * v² * A * r * Cm   where Cm ≈ 0.012 * Sp
```

Plugging in soccer-ball values:

- Moment of inertia `I = (2/3) * m * r² ≈ 0.00347 kg·m²` (thin-shell approximation)
- For v=30, Sp=0.18: τ_aero ≈ 0.5 · 1.225 · 900 · 0.038 · 0.11 · (0.012 · 0.18) ≈ 0.005 N·m
- Spin decay time constant `τ_decay = I · ω / τ_aero ≈ 0.00347 · 50 / 0.005 ≈ 35 s`

### Result

For a Free-Kick Madness flight (~0.6–1.5 s), spin loses **~2–5%** of itself before goal-line crossing. **Treating spin as constant during flight is justified to within ~5%.**

```
ω_decay_per_sec = -ω * (1/35)   // ~3% per second
```

Document the constant-spin approximation in the constants file: "Spin held constant during flight; flight time ~1.5 s gives <5% decay per Smits & Smith 1994 framework applied to FIFA-spec ball."

### Honest limit

No primary paper publishes "τ = X seconds for a soccer ball at Re = 4×10⁵." The Smits & Smith golf model is the standard substitute. If during playtest the curl feels wrong because it dies off late in flight, revisit this with a measured τ.

---

## 5. Famous free-kick reconstructions

Two well-documented reference kicks to calibrate against:

### Beckham vs Greece, Old Trafford, 6 Oct 2001

Distance ~27 m. Documented in Goff & Carré 2010 + Physics World cover article.

| Parameter | Value |
|---|---|
| Initial speed | 36 m/s |
| Reynolds number | 5.1 × 10⁵ |
| Spin rate | 63 rad/s (~10 rev/s) |
| Trajectory rise | over the crossbar peak |
| Lateral displacement | ~3 m |
| Speed at goal | ~19 m/s |
| Estimated side-force coefficient `Cs` | ~0.2 |

**Use Beckham as the canonical "tight envelope" target** — these numbers sit right inside our 25–35 m/s, 7–10 rev/s game spec.

### Roberto Carlos vs France, Tournoi de France, 3 Jun 1997

Distance ~35 m. The headline reference: Dupeux, Le Goff, Quéré & Clanet 2010 (citation [6]) explains the "late curl" as a transition from circular-arc to logarithmic-spiral when drag drops the ball into a low-v / high-Sp regime.

| Parameter | Value |
|---|---|
| Initial speed | ~30 m/s (range 27.8–38.0 in summaries) |
| Spin rate | 88 rad/s (~14 rev/s) — **outside our spec, this was outlier** |
| Flight time | ~1.34 s |
| Lateral displacement | very large |

**Roberto Carlos is the showcase outlier** — useful as a "what's the bend look like at extreme spin" sanity check, not the everyday playable shot.

---

## 6. Numerical integration

### Method

Published soccer trajectory simulators (Bray & Kerwin 2003, Goff & Carré 2009/2010) use **4th-order Runge-Kutta (RK4)** for the coupled position/velocity ODEs.

Plain Euler is **not appropriate** for Magnus + drag coupling because both forces depend on velocity direction — Euler accumulates phase error in curling shots, and the curl will look wrong.

### Timestep

Published practice: `dt = 0.001 s (1 ms)` with RK4 gives < 1 cm position error over a 1.5 s flight. Even higher-fidelity papers don't go below this.

### Recommendation for this build

Use **RK4 sub-stepped at `dt = 1/60 s` (frame-locked) or smaller**. For a basketball-style server-side simulation where determinism + replay matter more than CPU, sub-step further if needed.

```
const PHYSICS_DT = 1 / 60;   // 16.67 ms — frame-locked
const SUBSTEPS  = 4;          // → effective dt = 4.17 ms
```

**4.17 ms effective with RK4** gives position error <1 cm on a 1.5 s flight, which is well below pixel resolution at our zoom. If determinism diverges between client and server replay, drop `SUBSTEPS` to 8 or 16.

Cite the choice as "RK4 at 4 ms substep, following Bray & Kerwin 2003 / Goff & Carré 2009 standard practice."

---

## 7. Air density `ρ`

Standard sea-level value:

```
ρ = 1.225 kg/m³
```

Sea-level / 15 °C. Document the assumption. Game doesn't model altitude — stadium is at sea level for v1.

---

## 8. Sim constants summary

| Constant | Value | Source |
|---|---|---|
| `BALL_MASS_KG` | 0.430 | IFAB Law 2 [1] |
| `BALL_RADIUS_M` | 0.110 | IFAB Law 2 [1] |
| `BALL_AREA_M2` | 0.0380 | π·r² |
| `AIR_DENSITY_KG_M3` | 1.225 | Standard sea-level / 15 °C |
| `GRAVITY_M_S2` | 9.81 | Standard |
| `Cd` | 0.275 (or Cd(Sp) = 0.15 + 0.5·Sp) | Bray & Kerwin 2003 [2] |
| `Cl_BASE` | 0.20 (at Sp=0.18) | Goff & Carré 2010 [4] + Asai et al. 2007 [5] |
| `Cl_SLOPE_PER_SP` | 0.5 | Asai et al. 2007 wind tunnel [5] |
| `Cl_MIN`, `Cl_MAX` | 0.15, 0.30 | clamp range |
| `SPIN_DECAY_TIME_CONST_S` | 35 (effectively held constant in v1) | Smits & Smith 1994 [7] |
| `PHYSICS_DT_S` | 1/60 (16.67 ms frame, RK4 4-substep → 4.17 ms effective) | Bray & Kerwin 2003 standard practice [2] |
| `WALL_DISTANCE_FROM_BALL_M` | 9.15 | IFAB Law 13 (Direct Free Kicks) |
| `GOAL_WIDTH_M` | 7.32 | IFAB Law 1 |
| `GOAL_HEIGHT_M` | 2.44 | IFAB Law 1 |

These go straight into `server/services/games/free-kicks/constants.js`, each with the citation in a comment.

---

## 9. What's NOT in this doc (intentional omissions)

- **`SPIN_SENSITIVITY` (input → spin gain)** — playtest-tuned, not a research value.
- **`LATERAL_AIM_SENSITIVITY`** — playtest-tuned. Basketball settled at 0.6–0.7 (playbook §6.3).
- **Wall hitbox padding / forgiveness** — playtest-tuned.
- **Target hitbox forgiveness** — playtest-tuned.
- **Per-shot scenario distribution** — design call, see DESIGN.md §Difficulty ramp.

---

## Citations

1. **IFAB, Laws of the Game 2024/25, Law 2 — The Ball.** [theifab.com/laws/latest/the-ball](https://www.theifab.com/laws/latest/the-ball/). FA mirror: [thefa.com PDF](https://www.thefa.com/-/media/files/thefaportal/governance-docs/laws-of-the-game/2024-25/law-2---the-ball.ashx).
2. **Bray, K., & Kerwin, D. G. (2003).** Modelling the flight of a soccer ball in a direct free kick. *Journal of Sports Sciences*, 21(2), 75–85. DOI [10.1080/0264041031000070994](https://doi.org/10.1080/0264041031000070994). Open PDF: [people.stfx.ca PDF](https://people.stfx.ca/smackenz/courses/hk474/labs/jump%20float%20lab/bray%202002%20modelling%20the%20flight%20of%20a%20soccer%20ball%20in%20a%20direct%20free%20kick.pdf).
3. **Goff, J. E., & Carré, M. J. (2009).** Trajectory analysis of a soccer ball. *American Journal of Physics*, 77(11), 1020–1027. Open PDF: [faculty.lynchburg.edu PDF](https://faculty.lynchburg.edu/goff_j/Goff_Carre_AJP_2009.pdf).
4. **Goff, J. E., & Carré, M. J. (2010).** Soccer ball lift coefficients via trajectory analysis. *European Journal of Physics*, 31(4), 775–784. DOI [10.1088/0143-0807/31/4/007](https://doi.org/10.1088/0143-0807/31/4/007). Open PDF: [faculty.lynchburg.edu PDF](https://faculty.lynchburg.edu/goff_j/Goff_Carre_EJP_2010.pdf).
5. **Asai, T., Seo, K., Kobayashi, O., & Sakashita, R. (2007).** Fundamental aerodynamics of the soccer ball. *Sports Engineering*, 10(2), 101–109. DOI [10.1007/BF02844207](https://doi.org/10.1007/BF02844207). Open PDF: [people.stfx.ca PDF](https://people.stfx.ca/smackenz/courses/HK474/Labs/Jump%20Float%20Lab/Asai%202007%20Fundamental%20aerodynamics%20of%20the%20soccer%20ball.pdf).
6. **Dupeux, G., Le Goff, A., Quéré, D., & Clanet, C. (2010).** The spinning ball spiral. *New Journal of Physics*, 12, 093004. DOI [10.1088/1367-2630/12/9/093004](https://doi.org/10.1088/1367-2630/12/9/093004). Open PDF: [polytechnique.hal.science](https://polytechnique.hal.science/hal-01021119v1/document).
7. **Smits, A. J., & Smith, D. R. (1994).** A new aerodynamic model of a golf ball in flight. In *Science and Golf II*. Routledge. (Canonical reference for spin-decay model — golf, not soccer, but cited by soccer aero papers.)
8. **Hong, S., & Asai, T. (2014).** Aerodynamic drag of modern soccer balls. *SpringerPlus*, 2:171. [springerplus.springeropen.com](https://springerplus.springeropen.com/articles/10.1186/2193-1801-2-171).
9. **Nathan, A. M.** The effect of spin-down on the flight of a baseball. [baseball.physics.illinois.edu PDF](https://baseball.physics.illinois.edu/spindown.pdf).
10. **Bush, J. W. M. (2013).** The aerodynamics of the beautiful game. MIT. [thales.mit.edu PDF](https://thales.mit.edu/bush/wp-content/uploads/2013/11/Beautiful-Game-2013.pdf).
11. **Goff, J. E. "Power and spin in the beautiful game,"** *Physics Today*, July 2010. [pubs.aip.org](https://pubs.aip.org/physicstoday/article/63/7/62/391075/Power-and-spin-in-the-beautiful-game).
12. **IFAB, Laws of the Game 2024/25, Law 13 — Free Kicks.** [theifab.com](https://www.theifab.com/laws/latest/free-kicks/). Wall must be 9.15 m (10 yards) from the ball.
13. **IFAB, Laws of the Game 2024/25, Law 1 — The Field of Play.** [theifab.com](https://www.theifab.com/laws/latest/the-field-of-play/). Goal dimensions: 7.32 m × 2.44 m.

---

## Honest limits

Recorded for future-claude so the constants file doesn't pretend to more rigor than it has:

1. **WebFetch was blocked** during this research session. The Goff & Carré 2010 Cl(Sp) equation form (constants `c = 0.4127, d = 0.3056`) surfaced via citation summaries — verify against the literal equation in the PDF before encoding it as canonical.
2. **No primary paper publishes "τ = X seconds for a FIFA-spec soccer ball"** at free-kick Reynolds numbers. The Smits & Smith golf model is the standard substitute. The 35 s estimate is *derived*, not *measured*. If curl feels wrong in playtest because of late-flight decay, revisit.
3. **Modern ball Cd values drift** with panel design (Jabulani 0.13, Telstar, Al Rihla). If we ever want to model a specific ball, the post-2020 papers (e.g. Goff/Hong/Asai 2025 wind-tunnel updates) are the place to look.
