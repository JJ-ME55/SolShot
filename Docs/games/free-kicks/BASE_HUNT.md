# Free-Kick Madness — Open-Source Base Hunt v0.1

The playbook recommends finding a Phaser-compatible open-source game to fork as a starter base, projecting 2-3 days saved. **Result of the hunt: no clean fork target exists.** Same outcome as the basketball hunt. We build fresh, but the research piece (Magnus + drag + gravity) has solid reference material we can lift from.

This doc captures what was evaluated, why each candidate failed, and what we use as references instead.

---

## Hard requirements

A fork target needs all of:

- **Phaser 3** (we run Phaser 3.55+ — Phaser 2 is a different framework, code doesn't port)
- **Permissive license** — MIT, Apache-2.0, BSD (we're commercial — no GPL, no unlicensed code)
- **Free-kick / penalty mechanic** — the gameplay shape, not just "a soccer game"
- **Recent activity** (5+ years of bitrot = more work than building fresh)

---

## Bottom line up front

- **Fork target: none.** Zero candidates match all four hard requirements.
- **Closest near-miss:** `S3-333/cabezones-arcade-soccer` — MIT, Phaser 3.90, recently active, has a `Ball.js` with arcade "Magnus" — but it's 2D side-view Football-Heads gameplay, not first-person, and its "Magnus" is a one-line `velocity.y += spin * 0.15` hack, not a real F = S(ω × v) implementation. **Worth 30 min of source-reading for arcade feel patterns; useless as a fork.**
- **Strongest physics reference:** `JaviPardox/freekick-trajectory-analysis` (MIT, Python, includes Roberto Carlos + Messi test cases). Port the equations.
- **Strongest feel reference for input:** commercial games — *Flick Kick Football Legends* and *3D Free Kick* (HTML5Games.com). Play for calibration.

Same call as basketball: **build fresh.**

---

## Critical pattern — missing licenses kill every direct candidate

Of ~20 Phaser/JS soccer repos surveyed, exactly **two** Phaser-based ones have a license file. Every other "phaser soccer" / "penalty shootout" repo on GitHub has `license: null` — meaning default copyright, all rights reserved, legally unforkable for a commercial product.

This is the same pattern as the basketball hunt (BonbonLemon was unlicensed). **License-checking is the first filter; it kills most candidates immediately.**

---

## Candidates evaluated

### Tier 2 — Study source (read, learn, don't fork)

#### S3-333/cabezones-arcade-soccer

| Criterion | Result |
|---|---|
| License | ✅ **MIT** |
| Phaser version | ✅ **Phaser 3.90** + Vite — modern stack |
| Last push | ✅ 2026-03 — actively maintained |
| Stars / engagement | ⚠️ 1 star |
| Gameplay | ❌ **2D side-view 1v1 Football Heads** — wrong shape entirely |
| Magnus | ⚠️ `velocity.y += spin * 0.15` — decorative, not simulation-grade |
| Verdict | **Tier 2 — study only.** The `Ball.js` has reusable patterns (bounce preservation via `setBounce`, squash-and-stretch on impact, friction differentiation on grounded vs airborne). Worth 30 minutes of source-reading. Cannot fork because shape is wrong; can lift patterns. |

URL: [github.com/S3-333/cabezones-arcade-soccer](https://github.com/S3-333/cabezones-arcade-soccer)

#### JaviPardox/freekick-trajectory-analysis

| Criterion | Result |
|---|---|
| License | ✅ **MIT** |
| Language | ❌ Python (numpy / matplotlib) — not directly portable |
| Gameplay | ❌ Not a game — pure simulation + plotting |
| Stars / engagement | ⚠️ 2 stars |
| Last push | ⚠️ 2020-01 |
| Physics | ✅ **Direct free-kick trajectory with full ωx/ωy/ωz spin support, wall at 9.1m, includes Messi + Roberto Carlos as test cases.** This is the actual math we need. |
| Verdict | **Tier 2 — strongest single physics reference.** MIT-licensed Python that literally simulates free-kicks with Magnus + drag + gravity. Lift the equations directly into our JavaScript physics module, cite. |

URL: [github.com/JaviPardox/freekick-trajectory-analysis](https://github.com/JaviPardox/freekick-trajectory-analysis)

### Tier 3 — Skim only

#### rqphy/Motherssoccer

| Criterion | Result |
|---|---|
| License | ❌ None |
| Stack | three.js + cannon.js |
| Gameplay | Dunk Shot clone — drag the ball, hit a moving target, has wind |
| Last push | 2025-02 |
| Verdict | **Tier 3 — feel reference for input.** Recent drag-to-aim + cannon.js implementation is useful for thinking about gesture → trajectory. Unforkable; play and study. |

#### vardhan2000/multiplayer-football-game

| Criterion | Result |
|---|---|
| License | ✅ MIT |
| Stack | three.js |
| Gameplay | Top-down keyboard 2-player full-pitch CG class project | 
| Stars | 0 |
| Verdict | **Tier 3 — skim only.** MIT license is nice, but the shape is wrong (no free-kick mechanic). |

#### johanforslund/football-physics

| Criterion | Result |
|---|---|
| License | ❌ None |
| Language | C++ / OpenGL |
| Physics | ✅ 3D football trajectory with Drag + Magnus |
| Verdict | **Tier 3 — skim only.** `Ball.cpp` may have cleaner Magnus implementation than the Python repo. Unlicensed; reference only. |

#### carlaraya/magnus-sim

| Criterion | Result |
|---|---|
| License | ❌ None |
| Stack | three.js (CS 130 project) |
| Demo | ✅ Live at [carlaraya.github.io/magnus-sim](https://carlaraya.github.io/magnus-sim/) |
| Verdict | **Tier 3 — skim for visuals.** Useful to *see* what a Magnus trajectory looks like rendered. Unforkable. |

#### GallagherAiden/footballSimulationEngine

| Criterion | Result |
|---|---|
| License | ✅ MIT |
| Stack | Node.js |
| Gameplay | Server-side full-match simulator — match outcomes, not free kicks |
| Stars | 166 |
| Last push | 2026-03 — actively maintained |
| Verdict | **Tier 3 — architecture reference.** Wrong gameplay, but it's the closest **server-authoritative** soccer simulation pattern in JS. Skim the iteration model for our server-side physics work. |

### Tier 4 — Skip

| Repo | Phaser | License | Last push | Reason to skip |
|---|---|---|---|---|
| [sebsowter/phaser-simple-soccer](https://github.com/sebsowter/phaser-simple-soccer) | 3 (TS) | None | 2021-10 | AI demo (Buckland's Simple Soccer), unforkable |
| [eric-therond/simplesoccer](https://github.com/eric-therond/simplesoccer) | 3 (JS) | None | 2018-11 | Same Buckland chapter, unforkable |
| [wkallhof/football](https://github.com/wkallhof/football) | ? (TS) | None | 2019-04 | No traction, unforkable |
| [FreakDev/HTML5-Star-Soccer](https://github.com/FreakDev/HTML5-Star-Soccer) | Likely 2 | None | 2016-07 | Phaser 2, dead 9 yrs |
| [arvanitidis/field-goal-kick](https://github.com/arvanitidis/field-goal-kick) | Phaser 1/2 | None | 2015-01 | Wrong sport (American football), ancient |
| [blenderous/penalty-shootout-game](https://github.com/blenderous/penalty-shootout-game) | Vanilla canvas | None | 2017-07 | Ball follows pre-baked SVG curve, not physics |
| [erodrig1010/pk-shootout](https://github.com/erodrig1010/pk-shootout) | Vanilla + jQuery | None | 2018-04 | 4-button keyboard PK |
| [AlyyMagdy/Simple-Football-Penalty-Game-using-Jquery](https://github.com/AlyyMagdy/Simple-Football-Penalty-Game-using-Jquery) | jQuery | None | 2017-05 | Too simple, unforkable |
| [eunnovax/react-soccer-game](https://github.com/eunnovax/react-soccer-game) | React | None | 2019-04 | React PK demo |
| [Dougarasu/puck-soccer](https://github.com/Dougarasu/puck-soccer) | jQuery | None | 2016-10 | Drag-puck button football |

---

## Engine-backed Magnus implementations (the actual goldmine)

The single most valuable references for the **server-authoritative physics module**:

1. **`JaviPardox/freekick-trajectory-analysis`** — MIT Python, the equations we need.
2. **["Bend It like Magnus"](https://physics.wooster.edu/wp-content/uploads/2021/08/Junior-IS-Thesis-Web_2011_Ahmad.pdf)** — Ahmad, Wooster 2011 — full physics derivation w/ drag + Magnus, includes a worked Roberto Carlos analysis. Read alongside Bray & Kerwin 2003 from `PHYSICS_RESEARCH.md`.
3. **["Aerodynamics of the Beautiful Game"](https://thales.mit.edu/bush/wp-content/uploads/2013/11/Beautiful-Game-2013.pdf)** — Bush MIT paper — published Cd / Cl values for real balls at different Reynolds numbers.
4. **[Berkeley CS184 SoccerSim](https://cal-cs184-student.github.io/sp22-project-webpages-yersultan-17/soccersim/)** — spring-mass + air pressure + spin + wind. Probably overkill but the writeup is clear.

These plus the citations in [PHYSICS_RESEARCH.md](PHYSICS_RESEARCH.md) are the citable foundation for our constants file.

---

## Commercial feel-references (don't fork, play for calibration)

Closed-source / commercial titles that capture the "free-kick game" feel. Useful for benchmarking what "good" looks like before our v1 ships.

- **3D Free Kick** ([HTML5Games.com](https://www.html5games.com/Game/3D-Free-Kick/)) — closest existing browser game to our shape. Swipe to shoot, curl over wall + keeper.
- **Flick Kick Football Legends** (PikPok mobile) — the genre-defining title. Swipe-to-curve in 3D. The benchmark.
- **Football FRVR** ([frvr.com/football](https://football.frvr.com/)) — browser, polished, swipe-curve.
- **Crazy Freekick** (CodeCanyon HTML5) — commercial template, 6 levels.

---

## Phaser plugins / ecosystem

- **No Phaser 3 plugin implements Magnus or 3D ball spin.** None on `phaserplugins.com`.
- For pseudo-3D Phaser approaches:
  - **enable3d** (Phaser + ammo.js full 3D) — viable if we ever want real 3D physics rather than the K(z) projection.
  - **TwoPointFive** (Wolfenstein-style 2.5D) — wrong fit for our POV.
  - **Phaser 3D library / three.js bridge** — community pattern of "Phaser for UI/input, three.js for the scene." [Feronato's article](https://emanueleferonato.com/2019/11/27/build-fake-3d-html5-games-with-phaser-arcade-physics-three-js-and-phaser-3d-library/) is the canonical writeup.
- **Matter.js** ships with Phaser 3 but gives 2D rigid-body collisions — not Magnus out of the box. We apply Magnus as a manual per-frame force computed in code.

For Free-Kick Madness v1: stick with the basketball pattern (Phaser scene + server-authoritative physics module + K(z) projection). No new engines.

---

## What we lift, what we build

| Need | Source | Status |
|---|---|---|
| Ball physics (Magnus + drag + gravity) | `JaviPardox/freekick-trajectory-analysis` + Bray & Kerwin 2003 + Goff & Carré 2010 | **Lift equations** — port Python → JS, cite in constants file |
| Cd / Cl values | Bray & Kerwin 2003 + Asai et al. 2007 | **Lift values** — see PHYSICS_RESEARCH.md |
| Cl(Sp) functional form | Goff & Carré 2010 + Asai wind-tunnel | **Lift fit** — verify PDF before encoding |
| Server iteration architecture | `GallagherAiden/footballSimulationEngine` (pattern) + basketball's `physics.js` (precedent) | **Pattern reference** — adopt basketball's structure |
| Arcade feel (bounce, squash/stretch) | `cabezones-arcade-soccer` `Ball.js` | **Pattern reference** — apply selectively |
| Input model (curl-from-swipe) | None — no precedent exists | **Greenfield** — we invent this |
| First-person POV projection | Basketball `scene.js` K(z) | **Inherit** — already in repo |
| Wall + post + crossbar collision | None directly — adapt basketball's torus/rim swept collision approach | **Adapt** from basketball |

---

## Risks called out by the hunt

1. **Greenfield input model.** No prior art for "curl-from-swipe-shape" exists. We're inventing it. Means we must playtest the gesture-to-spin mapping aggressively before locking it.
2. **Magnus implementation correctness.** Easy to get wrong — sign errors, force direction confusion, wrong reference frame. The MIT Python reference + the Wooster thesis + Bush paper give 3 independent checks. Cross-validate.
3. **Performance.** A real Magnus + drag + RK4 simulation is way more compute than basketball's gravity-only trajectory. Server-side it's fine. On-device for client-side replay rendering it's borderline — measure during build.

---

## Verdict

**Build fresh.** Same call as basketball. The hunt is still valuable: we identified the references to lift the math from (`JaviPardox`, Bray & Kerwin, Goff & Carré, Wooster thesis), the feel-benchmark commercial games to play, and the arcade patterns from `cabezones` to selectively borrow. No 2-3 days saved on a fork, but no dead-ends chased either.
