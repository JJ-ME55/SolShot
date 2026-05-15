# Sports Physics Research Brief — SolShot

A deep-dive into the real-world physics of the sports SolShot intends to ship, the way AAA studios have implemented those physics in shipping games, and — most importantly — the tricks studios use to "knuckle down" random bounces so outcomes feel skill-driven rather than chaotic. Written for an audience already comfortable with Newtonian mechanics and game-engine basics. Every numeric claim and every "studio X does Y" assertion is cited.

---

## 1. Real-world ball physics, sport by sport

### Cross-sport reference table

| Sport | Ball mass | Diameter | COR vs primary surface | Drag coeff (Cd) | Spin relevance | Authoritative source |
|---|---|---|---|---|---|---|
| Basketball | 567–650 g | 23.8–24.8 cm | ~0.74–0.81 (FIBA rebound spec, court) | low; release speeds ~7–10 m/s | Backspin ~3 Hz on FT optimal | [FIBA 2024 Rules][fiba2024], [Tran & Silverberg 2008][tran] |
| Football (soccer) | 410–450 g | ~21.6–22.3 cm | ~0.80 on turf (typical lab) | 0.11–0.45 across drag crisis | Magnus dominant; knuckleball below ~Re crit | [IFAB Law 2][ifab], [Asai et al. 2014][asai] |
| American football | ~410–430 g (NFL "Wilson") | 28 cm long axis, 56 cm circumference (long) | n/a (rare ball-surface concern) | 0.14 nose-on, 0.85 broadside | Gyroscopic stability; precession wobble | [Rae & Streit 2002][rae], [Brownell USNA][brownell] |
| Tennis | 56.0–59.4 g | 6.54–6.86 cm | grass 0.60–0.90 (avg 0.73); clay 0.73–0.90 (avg 0.83); hard 0.73–0.95 (avg 0.80) | ~0.5–0.6 | Topspin / slice dominate | [ITF 2025 Technical Booklet][itf2025], [Cross USyd][crosstennis] |
| Golf | ≤ 45.93 g | ≥ 42.67 mm | ~0.6 against driver face (regulated) | ~0.21–0.27 with dimples (vs ~0.5 smooth) | Backspin generates lift via Magnus | [USGA TPX3008][usga], [Bearman & Harvey 1976][bearman] |
| Baseball | 142–149 g | 7.27–7.48 cm | 0.514–0.578 at 60 mph (vs ash) | ~0.30–0.40 | Magnus + seam-shifted wake | [Adair 2002][adair], [Smith USU SSW 2019][ssw] |
| Ice hockey puck | 156–170 g | 7.62 cm diameter, 2.54 cm thick | n/a (slides) | n/a | Negligible; lift on slap pucks | [NHL/IIHF rules][nhlpuck], [Westminster friction paper][icefric] |
| Billiards / pool | ~170 g (cue) | 57.15 mm (pool) / 52.5 mm (snooker) | ball-ball ~0.92–0.98; ball-cushion ~0.82 typical | n/a | Topspin/draw/english define stroke | [Mathavan et al. 2010][mathavan], [Cross Billiards][crossbil] |

### Basketball

The FIBA bounce test (1.8 m drop → rebound 1.2–1.4 m) maps to a court COR of roughly 0.74–0.81, with the commonly cited "regulation" value of ~0.758 sitting inside that band ([FIBA 2024 Official Basketball Rules][fiba2024]). Ball-rim friction has been measured at μ ≈ 0.5 for a leather ball ([Okubo & Hubbard 2006][okubo]). Okubo and Hubbard's six-DOF model — purely gravitational flight plus slip/no-slip ball–rim, ball–bridge, ball–backboard, and combined contact sub-models, with radial ball compliance and damping coefficients of 24, 19, and 11 Ns/m — remains the canonical reference for rim physics in academic literature ([Okubo & Hubbard 2006][okubo]). Tran & Silverberg's optimal-free-throw study (3D simulation across hundreds of thousands of trajectories) settled on 52–53° release angle, 3 Hz backspin, peak 4 cm below the backboard, aiming 7 cm beyond the rim center ([Tran & Silverberg 2008][tran]).

### Football (soccer)

A FIFA Quality Programme ball is 68–70 cm circumference, 410–450 g, inflated 0.6–1.1 atm ([IFAB Law 2 — The Ball][ifab]). The interesting physics is aerodynamic. Drag coefficient varies enormously across the "drag crisis": for the Jabulani, Cd drops from ~0.45 to a minimum of 0.11–0.12 near 22 m/s; the Brazuca's drag crisis happens at a lower speed and its supercritical Cd is higher (~0.15–0.17) — making it more predictable in the speed range of typical kicks ([Asai et al. 2014][asai], [Hong & Asai 2014][brazucapaper]). The panel-seam total length matters more than dimple textures; Jabulani's eight panels (1,980 mm total seam) gave it the smoothest surface of any modern World Cup ball, which is precisely why players hated it ([Hong & Asai 2014][brazucapaper]).

Magnus force on a spinning soccer ball is well-quantified in J.W.M. Bush's "The Aerodynamics of the Beautiful Game" ([Bush 2013][bush]). The knuckleball happens when spin is essentially zero and the ball flies near the critical Reynolds number — vortex shedding produces unsteady side forces. Hong et al. measured peak vortex lift ~2.0 N oscillating at ~3.5 Hz in wind-tunnel knuckleball tests ([Hong et al. 2010][hongknuckle]).

### American football

The prolate spheroid is highly anisotropic: nose-on Cd ≈ 0.14, broadside Cd ≈ 0.85 — a ~6× ratio that makes spiral stability dominant for distance/accuracy ([Rae & Streit 2002][rae]). Gyroscopic precession explains why a spiraling ball's nose follows its arc on the way up but appears to "wobble" as the trajectory descends, because angular momentum is fixed while the velocity vector rotates ([Brownell, USNA "The Magnus effect and the American football"][brownell]). Magnus is small but non-zero on a spiraling ball: the asymmetric pressure of crossing airflow produces minor lateral drift, demonstrated experimentally in [Horzepa & Pinheiro 2020][asmefootball].

### Tennis

ITF ball spec: 56.0–59.4 g, 6.54–6.86 cm, drop from 254 cm onto concrete must rebound 135–147 cm (COR ~ 0.728–0.760 on rigid concrete) ([ITF Ball Approval Tests 2019][itfballs], [ITF 2025 Technical Booklet][itf2025]). Court COR varies dramatically: grass ~0.60–0.90 (avg 0.73), clay ~0.73–0.90 (avg 0.83), hard 0.73–0.95 (avg 0.80). Crucially, lower-COR surfaces (grass) produce *faster* perceived court speed because the ball stays lower and arrives sooner; higher-COR surfaces (clay) produce slower play because the ball bounces high and gives the receiver more time ([Cross — "Measurement of the speed and bounce of tennis courts"][crosstennis]). Tangential friction coefficients ITF measures explain spin retention on bounce; topspin on clay "kicks up" because COR is high and surface friction is low enough to preserve forward velocity ([Brody, "Physics of Grass, Clay, and Cement," Grantland][grantland]).

### Golf

USGA/R&A: mass ≤ 45.93 g, diameter ≥ 42.67 mm, regulated COR ~0.83 against a steel plate per modern test (TPX3008) ([USGA TPX3008][usga]). Bearman & Harvey's wind-tunnel work showed dimples force boundary-layer transition at much lower Re than a smooth sphere, dropping Cd by roughly half (~0.5 → ~0.25) at typical drive speeds, and producing a lift coefficient that grows with backspin RPM ([Bearman & Harvey 1976][bearman]). Hexagonal dimples give marginally higher lift than round at equal Cd; modern dimple patterns have produced up to 40% variation in measured Cd ([Bearman & Harvey 1976][bearman], [Aoki et al. 2010][aokigolf]). Spin around 2,500–3,000 RPM on a driver, up to 10,000 RPM on a wedge.

### Baseball

MLB ball: 142–149 g, 7.27–7.48 cm; COR 0.514–0.578 at 60 mph against ash ([Adair 2002][adair]). Until 2019 the standard story for pitch movement was Magnus only. Andrew Smith at Utah State coined "seam-shifted wake" (SSW) in 2019: seam orientation can trip the boundary layer asymmetrically and produce a force comparable in magnitude to Magnus, in directions Magnus cannot ([Garrett & Smith, USU thesis 2022][ssw], [Baseball Prospectus — "Not Just About Magnus Anymore"][bp1]). For SolShot's purposes, the takeaway is that *spin axis is not enough* — orientation of the stitching relative to flow matters for realistic baseball trajectories.

### Ice hockey

NHL/IIHF puck: 156–170 g, 76.2 mm diameter, 25.4 mm thick, vulcanized rubber, frozen before games to reduce friction ([NHL puck guide — Net World Sports][nhlpuck]). Coefficient of friction puck-on-ice is dependent on temperature and varies in the literature from ~0.01 (a thin water film generated by pressure and frictional heat) to 0.10–0.15 for a sliding puck on standard rink ice ([Westminster College friction analysis][icefric], [Physics World — "Physics on ice"][physicsworld]). Warmer (-5 °C, "slushy") ice raises μ by ~10–15% versus cold (-10 °C) ice. Slap shots impart spin (~10–25 RPS) that can produce small Magnus lift; this is why pucks "knuckle" or "rise" off the ice in long shots.

### Billiards / pool

Pool ball: 57.15 mm, 170 g phenolic resin; snooker 52.5 mm. Ball-ball COR is very high (~0.92–0.98); ball-cushion COR is more typically 0.82 ([Mathavan, Jackson & Parkin 2010][mathavan]). Sliding friction ball-to-cloth is ~0.2 (15–20× higher than rolling friction); ball-ball friction is ~0.06 ([Cross — "Billiards"][crossbil], [Dr. Dave Pool Info — Physical Properties][drdaveconst]). Tangential restitution at cushions is ~0.2–0.3 ([Cross — "Billiards"][crossbil]). The independent friction/restitution framework of Mathavan et al. is the modern reference for ball-cushion dynamics — and it is *complex*: angle of incidence, ball spin, cushion height, cushion compressibility all matter ([Mathavan, Jackson & Parkin 2010][mathavan]).

Evan Kiefl's open-source `pooltool` is the best public reference implementation that gets ball-ball, ball-cloth, ball-cushion, and ball-air interactions all right in code ([Kiefl — Physics of Pool/Billiards][kiefl]).

---

## 2. AAA game implementations — what is public, what is proprietary

### NBA 2K (Visual Concepts)

Visual Concepts has never publicly described their rim collision algorithm in detail. What is known:

- **ProPLAY** (introduced NBA 2K24): a motion-capture pipeline that converts real NBA broadcast footage directly into in-game animation, including dribble, shot, and reaction motions ([Microsoft Game Stack — Closer Look at NBA 2K25's ProPLAY][proplay25], [2K Newsroom — NBA 2K26 ProPLAY][proplay26]).
- **Shot meter mechanics** are well-documented at user-facing level: timing window, "green" perfect window, attribute-driven base success probability. NBA 2K25 introduced "Rhythm Shooting" rewarding timing-matched stick pulls to player signature animations ([NBA 2K25 ProPLAY page][2k25play]).
- **RNG controversy** (NBA 2K25): community testing by NBA 2K Labs showed perfect-timing greens still missed 1–3 times per 10 attempts even at 99 3PT with optimal shot quality, with consecutive-shot windows varying ([NBA 2K25 Shooting Mechanics article — Sabaylok][2kdebate], [Catch and Shoot — "Why NBA 2K's Shooting Meter Is the Most Debated Mechanism in Sports Gaming"][catchshoot]). Mike Wang publicly committed NBA 2K26 to removing the post-timing hidden RNG ([NBA 2K26 Eliminates RNG — 1v1Me][nba2k26rng]).

The ball-rim interaction itself is mostly **canned animation triggered by a probability roll**, not a continuous physics simulation. Players have noted on the 2K subreddits that two identical "greens" can land in visually different ways, suggesting a small set of finished-shot animations chosen by an outcome RNG. Visual Concepts has not published this.

### FIFA / EA Sports FC (EA Vancouver, EA Romania)

- **HyperMotion / HyperMotion 2** (FIFA 22+): full 11v11 motion capture via Xsens suits, ML-driven blending ([Xsens — FIFA 22 Motion Capture][xsens], [Game Informer — FIFA 22 HyperMotion Preview][gameinformerfifa]).
- **True Ball Physics** (FIFA 22): EA marketing-listed new tunables for speed, swerve, air drag, air resistance, ground friction, rolling friction — first time the ball had its own physics state separate from animation ([Sportskeeda — FIFA 22 features][sportskeedafifa], [SportsGamersOnline — FIFA 22 HyperMotion Breakdown][sgofifa]).
- **Engine**: EA has not publicly named the physics solver inside Frostbite; it is custom. Frostbite uses Havok for some destruction-style physics on other titles, but EA Sports has used a custom in-engine solver for ball flight since FIFA 14.

Player perception controversies are the most useful public information:

- **"Momentum" / "scripting"** — data-mined attribute swings in FIFA 17 led to the #ExplainFIFAMomentum hashtag campaign; EA denied a permanent handicap but did not deny dynamic-difficulty mechanisms ([TechRaptor — FIFA 17 Rubber Banding][techraptor], [GameRant — FIFA 17 Rubber Banding][gamerantfifa]).
- **Ball-glue** — EA FC 25/26 forum complaints highlight ball-stuck-to-foot through-balls and possession that "doesn't feel free" ([EA Forums — FC 26 ball possession][eaforumsfc26]). Steam discussions claim scripting has worsened with each release.
- A class-action lawsuit was filed against EA over alleged scripting in FIFA 21 ([ResetEra discussion thread][resetera]); no public technical disclosure resulted.

### PGA Tour 2K (HB Studios) and EA Sports PGA Tour

HB Studios runs **the most publicly transparent ball-physics development pipeline in AAA sports**:

- The "Proving Grounds" — HB's proprietary internal simulator runs tens of thousands of bounce/roll iterations across impact angle, velocity, spin, grass density combinations to generate ball-terrain response curves ([PGA TOUR 2K23 Physics page][2k23physics]).
- They wrote a custom collision/response solver to handle deformable terrain rather than rely on Unity/Unreal physics ([PGA TOUR 2K23 Physics page][2k23physics]).
- EvoSwing (PGA TOUR 2K25) breaks the swing into contact, rhythm, transition, swing path; each is scored and feeds into launch conditions ([PGA TOUR 2K25 — Master Your Swing][2k25swing]).
- EA Sports PGA Tour's "Pure Strike" is built on TrackMan launch-monitor data and ShotLink shot data ([EA Sports PGA Tour Pure Strike Deep Dive][easportspga]). Launch monitor input — club head speed, face angle, attack angle, dynamic loft, spin loft, path — feeds the initial-state vector for a forward physics simulation.

### Top Spin / AO Tennis / Tiebreak

Public information on tennis-game physics is sparse compared to other AAA sports. TopSpin 2K25 (2K, dev: Hangar 13) markets a "Timing Meter" and new serve mechanic with court-surface differentiation but does not publicly document its physics constants ([TopSpin 2K25 Steam page][topspin]). The original Top Spin (2003, Indie Built) used a power meter for serves and discrete button-mapped shot types (flat/topspin/slice/lob), with realistic-looking but not academically-modeled physics ([Wikipedia — Top Spin (video game)][topspinwiki]).

For SolShot tennis: assume **no public reference implementation exists**; you'd build on the ITF court data directly.

### MLB The Show (Sony San Diego)

Proprietary engine. Public materials describe:

- Bat-ball physics taking bat speed, ball spin, contact point into account ([ChatsLine — MLB The Show 25 engine][mlbshow25]).
- Wind and weather impacting trajectories.
- MLB The Show 26 reworking hit physics with "advanced logic and new data metrics" and adding Automatic Ball-Strike ([Yardbarker — MLB The Show 26][mlbshow26]).
- Sony has not publicly stated whether seam-shifted wake is modeled. The 2019 SSW paper postdates MLB The Show 19's pitch-physics architecture; subsequent versions may have added it implicitly via pitch-design tuning.

### Madden NFL (EA Tiburon)

- **Infinity Engine** (Madden NFL 13): real-time physics-driven collisions, replacing canned tackle animations for body-on-body contact ([EA Community Blog — Infinity Engine][infinity]).
- **The ball stayed on legacy physics until Madden NFL 17** — the ball's own dynamics were retrofitted into the Ignite engine in 2016, eight years after player collisions went physics-driven ([Madden School — Madden NFL 17 passing][maddenschool]).
- Fumble recoveries are still part-scripted: outcome is biased by "position of ball-carrier's center of mass relative to feet and torso" plus modifiers ([Kotaku — Madden physics interview][kotakumadden]). Community consensus: fumble recovery feels pre-determined despite engine improvements ([MegaBearsFan — How EA Sports Fails to Simulate Football][megabearsfan]).

### Rocket League (Psyonix)

**The gold standard of public physics disclosure for SolShot's purposes.**

- **Bullet Physics** integrated into Unreal Engine 3 (now UE5 transition underway). Psyonix replaced UE's default PhysX with Bullet specifically for determinism and tunability ([Bullet Physics — Rocket League blog][bulletrl], [Jared Cone GDC 2018 slides — "It IS Rocket Science"][conegdc]).
- **Gravity is 650 uu/s² by default**, mutable via mutators; 1 uu ≈ 1.92 cm so gravity is ~12.5 m/s² (slightly heavier than Earth) ([RLBot wiki — Physics of Jumping][rlbotwiki], [Rocket League fandom — Mutator settings][rlmutator]).
- **Ball radius ≈ 91.25 uu (~1.75 m diameter)** per community reverse-engineering; ball mass and inertia are tuned, not real.
- **Custom collision impulse**: Psyonix adds an additional impulse to the ball's center on car-ball contact that violates Newton's third law (the equal-and-opposite impulse is not applied to the car), enabling the responsive "feel" of car-ball hits without the messy off-axis spin a pure rigid-body solver would produce ([smish.dev — Rocket League ball_simulation_3][smishrl]).
- **Networking** (Cone GDC 2018): server-authoritative with client-side prediction; clients buffer inputs, run the same Bullet simulation, server reconciles. Determinism is engineered explicitly because the same input MUST produce the same output for prediction to work ([Jared Cone GDC 2018][conegdc]).
- Community has fully reverse-engineered the ball solver into [smish.dev's ball_simulation_3][smishrl] and the RLBot wiki ([RLBot physics of jumping][rlbotwiki]), used by RL bots in tournaments with stake on the line.

### Wii Sports / Nintendo Switch Sports

Arcade-feel benchmark. Wii Sports Bowling uses real rigid-body collisions for pins, with the Wii Remote's orientation/yaw mapped to ball release angle and spin ([Wii Sports Wiki — Bowling][wiisportsbowl]). Wii Sports Tennis uses **swing timing**, not motion mapping, to determine direction and pace — the swing-up angle controls bounce height ([Wii Sports Wiki — Tennis][wiisportstennis]). Nintendo's published goal: "realism in gameplay mechanics, not graphics" — i.e. *feel* over fidelity ([Medium — Nintendo Revolution / Wii Sports][nintendowii]).

### Pool/Snooker games

- **Snooker 19** (Lab42): custom physics engine, started before greenlight; built specifically to model cushion inertia and cloth speed ([Lab42 / GamingBolt Snooker 19 interview][snooker19int], [The Sixth Axis — Snooker 19 preview][sixthaxis]).
- **Pure Pool** (VooFoo Studios): custom physics on Unity, no detailed public disclosure.
- **8 Ball Pool** (Miniclip): server-authoritative outcome — the shooter's client computes physics locally and submits the result; cheating (cue extension hacks, infinite aim) has been an ongoing problem because the client computes the trajectory ([MPGH — Miniclip 8 Ball Pool aim hack thread][mpgh], [Miniclip support — Cheaters and hacks][miniclipreport]). This is directly relevant to SolShot: **if the client computes the physics, the client can cheat.**
- **pooltool** (open-source, Evan Kiefl): not a game but the most accessible reference for correct pool physics in production code, modeling slip/roll transitions, English-induced curve, masse strokes, and ball-cushion tangential losses ([Kiefl — Physics of pool/billiards][kiefl]).

---

## 3. "Knuckling down" the random bounce — the most important section

The fundamental tension SolShot inherits: **realistic physics is chaotic, but wagered competitive players need outcomes to feel skillful.** Below, every lever AAA studios have publicly used.

### Lever 1 — Hidden RNG layered on top of physics

The NBA 2K shooting meter is the canonical example. There is a base success probability driven by attributes × shot quality × contest, the timing meter gates whether the roll is allowed at all, and a final post-roll RNG can still miss perfect-timing greens ([Catch and Shoot article][catchshoot]). The community calls this "RNG variance" and overwhelmingly hates it ([NBA 2K25 RNG controversy — Sabaylok][2kdebate]). NBA 2K26 reduced this drastically in response ([1v1Me — NBA 2K26 Eliminates RNG][nba2k26rng]).

**SolShot implication**: do not stack RNG on top of physics. With money on the line, players accept losing to physics (a rim bounce-out from a perfectly-released shot is visually parseable). They do not accept losing to invisible math.

### Lever 2 — Canned animation libraries instead of continuous physics

NBA 2K's ball-rim animations are largely scripted — the ball follows one of N pre-baked "rim out left", "shooter's bounce", "in-and-out", "swish" animations once an outcome is decided. This is the dominant pattern in basketball/golf games where rim/cup contact would be visually ugly under a naive PhysX simulation. Madden's fumble recoveries are similarly part-scripted ([MegaBearsFan][megabearsfan]).

**Trade-off**: canned animations look better and are deterministic per-outcome, but break under unusual contact geometries. SolShot should consider a hybrid (described in Lever 5).

### Lever 3 — Magnetism, expanded hitboxes, ball assists

Mario Golf: Super Rush states explicitly that "approach shots aiming at the cup position are now less likely to go wide" — i.e. a magnetic cup ([Nintendo Life — Mario Golf: Super Rush guide][mariogolf]). This is widespread in arcade golf and sports games:

- Mario Tennis Aces — extended sweet-spot hitboxes
- Wii Sports Bowling — gutter rails effectively widened the lane forgiveness curve
- NBA Jam — the "shooting hot streak" feature increased shot-success radius

**SolShot implication**: implement these as **disclosed difficulty settings**, not hidden assists. Wagered players need to know whether assistance is on.

### Lever 4 — Determinism via fixed-point math or controlled FP

Most physics engines (Unity PhysX, Unreal default) are not deterministic across machines because floating-point operations are not commutative/associative under different compilers, CPUs, or instruction sets ([Gaffer On Games — Deterministic Lockstep][gaffer], [MonoGame community — determinism+FP experience][monogame]). Solutions used in AAA:

- **Fixed-point math** — StarCraft II's simulation, many RTS engines, fighting-game rollback (GGPO).
- **Controlled FP** — Bullet Physics with `-ffloat-store` and disabled FMA, plus single-threaded simulation. Rocket League's deterministic ball physics uses this approach ([Cone GDC 2018][conegdc]).
- **Server replay** — outcome computed once on server, all clients receive the replayed result rather than recomputing physics locally.

**SolShot implication**: for wagered outcomes, the server should be the only machine that computes the *outcome-determining* physics. Client physics can be predictive/cosmetic.

### Lever 5 — Hybrid physics + animation

The standard AAA pattern:
- **Trajectory** computed by physics (ball flight under drag, Magnus, gravity).
- **Contact resolution** picked from an animation library given the impact parameters.

NBA 2K rim collisions, FIFA shot-on-target finishes, MLB The Show fielding catches all use this pattern. The ball trajectory leading to the rim is physics; the rim interaction itself is animation-keyed to outcome.

This is the **safest** pattern for SolShot's basketball, soccer-keepie-uppies, hockey, free-kicks. It would NOT work well for pool, where every collision must be physically continuous to support multi-cushion break shots.

### Lever 6 — Tuned coefficients sub-realistic

Many sports games tune restitution, friction, and damping AWAY from real-world values to soften chaos. Examples:

- **Rocket League**'s gravity (650 uu/s² ≈ 12.5 m/s²) and ball-car impulses are heavier and stickier than real-world car-ball physics ([smish.dev][smishrl]).
- Wii Sports Bowling pin friction is dialled up so that a strike line is reproducible.
- Snooker 19's Lab42 dev team specifically discussed tuning cushion inertia transfer to avoid the "ball flies off the table" failure mode that pure rigid body physics is prone to ([Snooker 19 GamingBolt interview][snooker19int]).

**SolShot implication**: do not blindly use FIBA/FIFA/MLB real-world numbers. Tune them by playtesting against fairness criteria.

### Lever 7 — Server-authoritative replays + provable RNG

For wagered outcomes, **the chain of custody on randomness matters**. Best practices public sports games approach:

- Seed the simulation with a server-generated random number that the server commits to *before* the input arrives (commit-reveal).
- Log inputs, seed, and engine version to disk for replay.
- Provide replay viewer to players so they can audit.

XCOM stores its seed at battle start so the same shot sequence resolves identically on reload; Out of the Park Baseball exposes its RNG to the player as part of its simulation philosophy ([Sinepost — Is XCOM Truly Random?][sinepost], [Schwanenlied — XCOM PRNG][xcomprng]).

**No major physics-driven competitive sports game has publicly committed to verifiable replays of physics outcomes.** This is a differentiator SolShot can claim and is consistent with the on-chain wager mechanic.

### Lever 8 — Difficulty bands segregate the variance question

Casual modes can have more assist/magnetism; ranked/wagered modes can have less. EA FC has done this implicitly (assists slider for free-kick aim). PGA Tour 2K23 separates "Pro Vision" (full assist) from "True Sim" (no assist) ([PGA TOUR 2K23 Physics page][2k23physics]).

**SolShot implication**: keep wager-eligible matches on a single, fixed, well-tuned ruleset; allow practice modes to have more assist.

---

## 4. Engines, algorithms, and architecture choices

### Physics engine landscape

| Engine | License | Determinism story | Use in shipped AAA sports games |
|---|---|---|---|
| Havok | Commercial | Not deterministic across platforms by default | Skyrim, Halo, many EA games (varies by team) |
| PhysX | NV / open | Not deterministic across GPUs/CPUs | Unity / Unreal default; many AAA non-sports |
| Bullet | Open | Deterministic with care (single-thread, controlled FP) | **Rocket League** |
| Box2D | Open | Deterministic 2D | 2D arcade sports prototypes |
| Rapier | Open / Rust | Deterministic mode supported | Indie sports, browser games via WASM |
| cannon-es | Open / JS | Not deterministic | Browser-based small games |
| Custom | n/a | Whatever you build | NBA 2K (rim), MLB The Show, **Snooker 19**, HB Studios PGA |

References for the comparison: [Wayline — Game Physics Engine Comparison][wayline], [Geeks3D — PhysX vs Bullet vs Havok][geeks3d], [Cone GDC 2018][conegdc], [Lab42 Snooker 19 interview][snooker19int].

### When do studios roll their own?

The pattern across NBA 2K, MLB The Show, Snooker 19, and HB Studios PGA Tour: **when the ball-surface contact is the entire game**. None of these studios use PhysX/Havok for the actual rim/bat/cushion solver. Why?

1. Off-the-shelf solvers are tuned for general rigid-body dynamics with stable stacking and decent contact. They are NOT tuned for the specific energy/spin dissipation behavior of a single high-stakes ball-on-surface event happening hundreds of times a match.
2. Tuning a physics engine's friction/restitution to make a basketball look right against a rim destroys its behavior for other objects.
3. Custom solvers can hard-code the slip/no-slip transition that Okubo & Hubbard's basketball model relies on, and the tangential restitution model that Mathavan et al. need for pool cushions.

### Hybrid: physics for trajectory, animation for contact

Dominant AAA pattern (NBA 2K, FIFA shot-on-goal animations, Madden tackles, MLB The Show fielding catches). Trade-off: visual quality high, behavioral edge cases require lots of animation states.

### Multiplayer determinism, ball games specifically

Three viable architectures:

1. **Lockstep deterministic** — all clients run identical simulation; useful for turn-based or low-input-rate games (snooker, golf, free throws). Requires deterministic physics. ([Gaffer On Games][gaffer])
2. **Server-authoritative with client prediction** — server is the source of truth; clients predict locally and reconcile. Used by Rocket League. ([Cone GDC 2018][conegdc], [Gabriel Gambetta — Client-Side Prediction][gambetta])
3. **Server-computed, clients render result** — for turn-based shots (pool, golf, free throws), the server computes the whole shot trajectory upon input submission and broadcasts a replayable result. Suits SolShot's wager model best because there's literally one "shot" per turn.

### Replay systems

Three deterministic-replay strategies:
1. **Input recording** — only inputs and seed stored; replay re-runs simulation. Requires bit-exact determinism (Rocket League replays do this).
2. **State recording** — keyframed positions/orientations stored per tick. Larger files, works across builds. (NBA 2K, FIFA-style highlights.)
3. **Hybrid** — store inputs for the shooter, state for the ball. Smallest size for shot-based games.

For SolShot's wager model, **option 3 stored alongside the on-chain match commit** is the strongest combo: small storage, fully audit-able, replay survives engine upgrades.

---

## 5. Practical takeaways for SolShot

These are the highest-impact physics-design decisions across SolShot's planned title pipeline, ranked by importance for the wager use case.

### 1. Compute outcome-determining physics server-side, every time.

The Miniclip 8 Ball Pool cheating problem ([MPGH thread][mpgh], [Miniclip cheating support page][miniclipreport]) is precisely what happens when wagered ball-physics is client-computed. SolShot's wager mechanic makes this non-negotiable. Client physics is allowed for cosmetic/predictive purposes; the outcome must be server-replayable.

*Informed by: Rocket League server-authoritative networking ([Cone GDC 2018][conegdc]); Miniclip 8 Ball Pool cheating record.*

### 2. Use deterministic physics with seed-commit-reveal.

Commit the seed on-chain *before* the shot input, reveal after. Replay must be bit-exact given (engine version, seed, inputs). Use Bullet or Rapier in deterministic mode; lock single-threaded simulation; fix the timestep.

*Informed by: Rocket League's deterministic Bullet integration ([Cone GDC 2018][conegdc]); XCOM seed determinism ([Sinepost — XCOM][sinepost]); Gaffer on Games determinism guide ([Gaffer][gaffer]).*

### 3. No hidden post-timing RNG. Ever. On any game.

NBA 2K25's RNG controversy is a cautionary tale ([Catch and Shoot][catchshoot], [Sabaylok][2kdebate]). With real money at stake, an opaque last-step roll is indistinguishable from rigging. If a free-throw release is perfect, it should hit the same point in physics space every time. Variance must come from observable inputs (release angle, power, etc.), not invisible math.

*Informed by: NBA 2K26's commitment to remove RNG ([1v1Me][nba2k26rng]).*

### 4. Hybrid physics for the "easy" sports, custom solver for the "hard" ones.

- **Basketball free throws**: physics for flight, animation library keyed to (incoming angle, position, spin) for the rim resolution. The Okubo & Hubbard slip/no-slip model is the academic reference if you go full physics ([Okubo & Hubbard 2006][okubo]).
- **Football keepie-uppies**: full physics, Magnus included. Use Asai et al.'s drag-crisis curve for proper feel ([Asai et al. 2014][asai]).
- **Free-kicks**: full physics, Magnus + drag-crisis. This is the sport where physics realism matters most for player satisfaction.
- **8-ball pool**: 100% custom physics solver (Mathavan-style cushion model, Kiefl's pooltool as reference [Kiefl][kiefl], [Mathavan et al. 2010][mathavan]). Animation is not viable — multi-cushion shots must work physically.
- **Hockey**: full physics, low friction puck-on-ice (μ ≈ 0.05–0.1), restitution tuned. Boards bounces use Mathavan-style tangential restitution.
- **Tennis**: surface-COR table (ITF data) drives bounce; spin governs flight Magnus. Hybrid is fine.

*Informed by: Tran & Silverberg free-throw model ([Tran & Silverberg 2008][tran]); Asai et al. soccer drag ([Asai et al. 2014][asai]); Mathavan billiards cushion model ([Mathavan et al. 2010][mathavan]).*

### 5. Tune coefficients sub-real for "feels fair."

Real-world numbers (FIBA 0.758 rim COR, ITF court COR, FIFA Magnus) are the *starting point*, not the final value. Rocket League, Snooker 19, and Wii Sports all tune their constants sub-real for predictable, satisfying feel. SolShot's basketball release should hit the rim with a slightly lower-energy bounce than the spec sheet suggests — this reduces "weird rim luck" without losing realism.

*Informed by: Snooker 19's cushion tuning ([Snooker 19 GamingBolt interview][snooker19int]); Rocket League's tuned gravity/restitution ([smish.dev][smishrl]).*

### 6. Verifiable replays as a product differentiator.

No major physics sports game today publishes auditable replays of physics outcomes. SolShot's on-chain wager model gives natural rails for this: hash the (engine version, seed, inputs), commit on-chain, replay viewer on the web. This is a marketing edge as much as a fairness mechanism.

*Informed by: gap in industry — no AAA sports title has shipped this; Rocket League's replay system is closest.*

### 7. Highest-risk sports in the pipeline are pool and free-kicks.

- **Pool**: cushion physics is unforgiving. A 5% miscalibration in tangential restitution destroys break shots and multi-rail safety plays. Budget more engineering than basketball.
- **Free-kicks**: Magnus + drag-crisis means small input changes can produce dramatic flight differences (a knuckleball below critical Re, vs a banana above). Tuning the input → spin axis mapping is the hard part.
- **Lower-risk**: basketball (rim physics is solved-ish), keepie-uppies (small velocity range, low drag-crisis exposure), hockey (puck physics is comparatively simple).

*Informed by: Mathavan billiards complexity ([Mathavan et al. 2010][mathavan]); Bush / Asai soccer aerodynamics ([Bush 2013][bush], [Asai et al. 2014][asai]).*

### 8. Surface model drives gameplay feel even when ball physics is "right."

Tennis is the clearest example: same ball, same swing, different surface → different game ([Cross — Tennis court speed][crosstennis]). Make surface coefficients a first-class data element with per-court tuning, not a hardcoded constant. Same applies to grass length / lie in golf, ice temperature in hockey, and felt nap in pool.

*Informed by: ITF court classification ([ITF 2025 booklet][itf2025]); HB Studios "Proving Grounds" terrain simulator ([PGA Tour 2K23 Physics][2k23physics]).*

### 9. The wager mechanic shifts the "feels fair" / "feels real" balance toward fair.

In an unwagered sports game, players tolerate some real-world chaos as "authenticity." With money on the line, the same chaos reads as "robbery." When in doubt, err toward predictability. The Mario Golf magnetic-cup pattern ([Nintendo Life — Mario Golf][mariogolf]) is a precedent for openly biasing physics for fairness; SolShot can do this transparently as a documented design choice.

### 10. Document the physics publicly.

Rocket League's competitive scene has thrived in part because the ball physics is documented well enough by the community that high-level play is built on shared understanding of the simulation ([smish.dev ball_simulation_3][smishrl], [RLBot wiki][rlbotwiki]). Publishing SolShot's physics constants and solver behavior — at least at the level Psyonix has tolerated — turns transparency into a feature for wagered competitive play.

---

## References

[fiba2024]: https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf "FIBA 2024 Official Basketball Rules"
[tran]: https://pubmed.ncbi.nlm.nih.gov/18645735/ "Tran & Silverberg, Optimal Release Conditions for the Free Throw, J. Sports Sci. 2008"
[okubo]: https://link.springer.com/article/10.1007/BF02843970 "Okubo & Hubbard, Dynamics of Basketball-Rim Interactions, Sports Engineering 2006"
[ifab]: https://www.theifab.com/laws/latest/the-ball/ "IFAB Law 2 — The Ball"
[asai]: https://springerplus.springeropen.com/articles/10.1186/2193-1801-2-171 "Asai et al., Aerodynamic Drag of Modern Soccer Balls, SpringerPlus 2013"
[brazucapaper]: https://www.researchgate.net/publication/266388204_A_comparison_of_Jabulani_and_Brazuca_non-spin_aerodynamics "Hong & Asai 2014, A Comparison of Jabulani and Brazuca Non-Spin Aerodynamics"
[bush]: https://thales.mit.edu/bush/wp-content/uploads/2013/11/Beautiful-Game-2013.pdf "Bush, The Aerodynamics of the Beautiful Game, MIT 2013"
[hongknuckle]: https://www.sciencedirect.com/science/article/pii/S1877705810002699/pdf "Hong et al., Unsteady Aerodynamic Force on a Knuckleball in Soccer, Procedia Engineering 2010"
[rae]: https://www.researchgate.net/publication/228669074_The_drag_force_on_an_American_football "Rae & Streit, The Drag Force on an American Football, 2002"
[brownell]: https://www.usna.edu/MechEngDept/_files/documents/brownell_files/JSE%2016.pdf "Brownell, The Magnus Effect and the American Football, USNA J. Sports Engineering"
[asmefootball]: https://asmedigitalcollection.asme.org/openengineering/article/doi/10.1115/1.4054692/1141841/Modeling-the-Dynamics-of-an-American-Football-and "Modeling the Dynamics of an American Football and the Stability Due to Spin, ASME 2022"
[itf2025]: https://www.itftennis.com/media/14104/2025-technical-booklet.pdf "ITF 2025 Technical Booklet — Approved Tennis Balls, Classified Surfaces, Recognised Courts"
[itfballs]: https://www.itftennis.com/media/2100/balls-ball-approval-tests.pdf "ITF Ball Approval Tests 2019"
[crosstennis]: https://www.physics.usyd.edu.au/~cross/PUBLICATIONS/52.%20SpeedAndBounce.pdf "Cross, Measurement of the Speed and Bounce of Tennis Courts"
[grantland]: https://grantland.com/features/the-physics-grass-clay-cement/ "The Physics of Grass, Clay, and Cement — Grantland"
[usga]: https://www.usga.org/content/dam/usga/pdf/Equipment/TPX3008-GolfBallWeightSizeTestProtocol.pdf "USGA / R&A TPX3008 Golf Ball Weight & Size Test Protocol"
[bearman]: https://www.semanticscholar.org/paper/Golf-Ball-Aerodynamics-Bearman-Harvey/78ec3d62d21e75102c12e4fdeb1bda36eafb05cd "Bearman & Harvey, Golf Ball Aerodynamics, Aeronautical Quarterly 1976"
[aokigolf]: https://www.sciencedirect.com/science/article/pii/S187770581100991X/pdf "Aoki et al., A Study of Golf Ball Aerodynamic Drag, Procedia Engineering 2011"
[adair]: https://www.amazon.com/Physics-Baseball-Robert-K-Adair/dp/0060084367 "Robert K. Adair, The Physics of Baseball (3rd ed.) 2002"
[ssw]: https://digitalcommons.usu.edu/etd/8452/ "Garrett, Seam Shifted Wake in the Magnus and Non-Magnus Directions, USU thesis"
[bp1]: https://www.baseballprospectus.com/news/article/62912/not-just-about-magnus-anymore/ "Baseball Prospectus, Not Just About Magnus Anymore"
[nhlpuck]: https://www.networldsports.com/buyers-guides/hockey-puck-guide "Net World Sports, Hockey Puck Weight, Size & Materials Guide"
[icefric]: http://cs.westminstercollege.edu/~ccline/courses/resources/wp/proj/211-W-frictiondrag.pdf "Westminster College, Friction is a Drag (hockey puck friction analysis)"
[physicsworld]: https://physicsworld.com/a/physics-on-ice/ "Physics World, Physics on Ice"
[mathavan]: https://journals.sagepub.com/doi/10.1243/09544062JMES1964 "Mathavan, Jackson & Parkin, A Theoretical Analysis of Billiard Ball Dynamics Under Cushion Impacts, IMechE 2010"
[crossbil]: https://www.physics.usyd.edu.au/~cross/Billiards.htm "Cross, Billiards — University of Sydney Physics"
[drdaveconst]: https://drdavepoolinfo.com/faq/physics/physical-properties/ "Dr. Dave Pool Info — Pool Physics Property Constants"
[kiefl]: https://ekiefl.github.io/2020/04/24/pooltool-theory/ "Evan Kiefl, The Physics of Pool/Billiards"
[proplay25]: https://developer.microsoft.com/en-us/games/articles/2024/09/closer-look-at-nba-2k25-proplay-system/ "Microsoft Game Stack — A Closer Look at NBA 2K25's ProPLAY System"
[proplay26]: https://newsroom.2k.com/news/nbar-2k26-debuts-new-gen-9-gameplay-improvements-including-an-all-new-dynamic-motion-engine-powered-by-proplay "2K Newsroom — NBA 2K26 ProPLAY Dynamic Motion Engine"
[2k25play]: https://nba.2k.com/2k25/the-game/gameplay/ "NBA 2K25 — ProPLAY & Gameplay"
[2kdebate]: https://sabaylok.com/blogs/11670/NBA-2K25-Shooting-Mechanics-The-Controversy-Surrounding-RNG "Sabaylok — NBA 2K25 Shooting Mechanics: The Controversy Surrounding RNG"
[catchshoot]: https://catch-and-shoot.com/why-nba-2ks-shooting-meter-is-the-most-debated-mechanism-in-sports-gaming/ "Catch and Shoot — Why NBA 2K's Shooting Meter Is the Most Debated Mechanism in Sports Gaming"
[nba2k26rng]: https://www.1v1me.com/blog/nba-2k26-skill-based-shooting-no-rng "1v1Me — NBA 2K26 Eliminates RNG: Skill-Based Shooting Returns"
[xsens]: https://www.xsens.com/resources/blog/fifa-22-motion-capture "Xsens — FIFA 22 HyperMotion Motion Capture"
[gameinformerfifa]: https://gameinformer.com/hands-on-preview/2021/07/20/fifa-22-next-gen-hypermotion-technology-is-an-impressive-evolutionary "Game Informer — FIFA 22 Next-Gen HyperMotion"
[sportskeedafifa]: https://www.sportskeeda.com/esports/fifa-22-gameplay-features-revealed-hypermotion-new-ball-control-true-ball-physics "Sportskeeda — FIFA 22 Gameplay Features: HyperMotion, True Ball Physics"
[sgofifa]: https://www.sportsgamersonline.com/games/soccer/fifa-22-hypermotion-technology-breakdown/ "SportsGamersOnline — FIFA 22 HyperMotion Technology Breakdown"
[techraptor]: https://techraptor.net/gaming/news/fifa-17-community-enraged-after-data-mine-finds-rubber-banding "TechRaptor — FIFA 17 Community Enraged After Data Mine Finds Rubber Banding"
[gamerantfifa]: https://gamerant.com/fifa-17-momentum-rubber-banding/ "GameRant — FIFA 17 Players Uncover Evidence of Rubber Banding"
[eaforumsfc26]: https://forums.ea.com/idea/fc-26-bug-reports-en/ball-possession-feels-broken-%E2%80%93-players-never-truly-control-the/12774308 "EA Forums — FC 26 Ball Possession Feels Broken"
[resetera]: https://www.resetera.com/threads/ea-hit-with-lawsuit-over-scripting-in-fifa-21.336996/page-2 "ResetEra — EA Hit with Lawsuit Over 'Scripting' in FIFA 21"
[2k23physics]: https://pgatour.2k.com/2k23/up-your-game/physics/ "PGA TOUR 2K23 — Physics"
[2k25swing]: https://pgatour.2k.com/2k25/up-your-game/how-to-swing/ "PGA TOUR 2K25 — Master Your Swing: EvoSwing and 3-Click"
[easportspga]: https://www.ea.com/games/ea-sports-pga-tour/news/ea-sports-pga-tour-gameplay-deep-dive "EA Sports PGA Tour Pure Strike Gameplay Deep Dive"
[topspin]: https://store.steampowered.com/app/1785650/TopSpin_2K25/ "TopSpin 2K25 — Steam"
[topspinwiki]: https://en.wikipedia.org/wiki/Top_Spin_(video_game) "Top Spin (video game) — Wikipedia"
[mlbshow25]: https://www.chatsline.com/blogs/view/4451/how-the-mlb-the-show-25-engine-elevates-realism-in-baseball-simulation "ChatsLine — How the MLB The Show 25 Engine Elevates Realism"
[mlbshow26]: https://www.yardbarker.com/mlb/articles/sony_announces_first_details_for_mlb_the_show_26/s1_17653_43025934 "Yardbarker — Sony Announces First Details for MLB The Show 26"
[infinity]: https://www.ea.com/news/community-blog-infinity-engine "EA Community Blog — Gameplay Pt. II: Infinity Engine"
[maddenschool]: https://www.madden-school.com/details-passing-game-madden-nfl-17/ "Madden School — More Details on the Passing Game in Madden NFL 17"
[kotakumadden]: https://kotaku.com/the-real-time-for-physics-is-now-says-madden-5915444 "Kotaku — The Real Time for Physics is Now, Says Madden"
[megabearsfan]: http://www.megabearsfan.net/post/2025/01/26/How-EA-Sports-Fails-To-Simulate-Football-Gameplanning.aspx "MegaBearsFan — How EA Sports Fails to Simulate Football"
[bulletrl]: https://pybullet.org/wordpress/index.php/2018/03/15/rocket-league-using-bullet-physics-in-unreal-engine-4/ "Bullet Physics — Rocket League Using Bullet Physics"
[conegdc]: https://ubm-twvideo01.s3.amazonaws.com/o1/vault/gdc2018/presentations/Cone_Jared_It_Is_Rocket.pdf "Jared Cone, GDC 2018 — It IS Rocket Science: The Physics and Networking of Rocket League"
[rlbotwiki]: https://wiki.rlbot.org/v4/botmaking/jumping-physics/ "RLBot Wiki — The Physics of Jumping"
[rlmutator]: https://rocketleague.fandom.com/wiki/Mutator_Settings "Rocket League Fandom — Mutator Settings"
[smishrl]: https://www.smish.dev/rocket_league/ball_simulation_3/ "smish.dev — Rocket League Ball Simulation 3"
[wiisportsbowl]: https://wiisports.fandom.com/wiki/Bowling_(sport) "Wii Sports Wiki — Bowling"
[wiisportstennis]: https://wiisports.fandom.com/wiki/Tennis_(sport) "Wii Sports Wiki — Tennis"
[nintendowii]: https://medium.com/@jsm36/the-nintendo-revolution-how-wii-sports-shaped-the-future-of-gaming-8bf004f5f459 "Medium — The Nintendo Revolution: How Wii Sports Shaped the Future of Gaming"
[snooker19int]: https://gamingbolt.com/snooker-19-interview-career-multiplayer-future-support-and-more "GamingBolt — Snooker 19 Interview: Career, Multiplayer, Future Support"
[sixthaxis]: https://www.thesixthaxis.com/2019/03/15/how-snooker-19-is-lining-up-for-a-big-break/ "TheSixthAxis — How Snooker 19 is Lining Up for a Big Break"
[mpgh]: https://www.mpgh.net/forum/showthread.php?t=756514 "MPGH — Miniclip 8 Ball Pool with Cheat Engine Infinite Aim"
[miniclipreport]: https://support.miniclip.com/hc/en-us/articles/360047793213-Cheaters-Hacks-and-Mods-How-do-I-report-suspicious-activity "Miniclip Support — Cheaters, Hacks and Mods"
[mariogolf]: https://www.nintendolife.com/guides/mario-golf-super-rush-guide-tips-and-hints-for-mastering-mario-golf-on-switch "Nintendo Life — Mario Golf: Super Rush Guide"
[wayline]: https://www.wayline.io/blog/game-physics-engine-comparison-simulation-tools "Wayline — Game Physics Engine Comparison"
[geeks3d]: https://www.geeks3d.com/20100330/physx-vs-bullet-vs-havok/ "Geeks3D — PhysX vs Bullet vs Havok"
[gaffer]: https://gafferongames.com/post/deterministic_lockstep/ "Gaffer On Games — Deterministic Lockstep"
[monogame]: https://community.monogame.net/t/experience-with-determinism-floating-points-multiplayer/18363 "MonoGame Community — Experience with Determinism + Floating Points + Multiplayer"
[gambetta]: https://www.gabrielgambetta.com/client-side-prediction-server-reconciliation.html "Gabriel Gambetta — Client-Side Prediction and Server Reconciliation"
[sinepost]: https://sinepost.wordpress.com/2012/11/11/is-xcom-truly-random/ "The Sinepost — Is XCOM Truly Random?"
[xcomprng]: https://www.schwanenlied.me/yawning/XCOM/XCOMPRNG.html "Schwanenlied — Demystifying the XCOM: Enemy Unknown PRNG"

---

*End of brief.*
