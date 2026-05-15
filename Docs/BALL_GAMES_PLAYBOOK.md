# Ball Games Playbook — everything we learned building Basketball Hoops

> A field manual for the next ball-based game in the SolShot arcade
> (football keepie-uppies, free-kick madness, 8-ball pool, hockey,
> golf, darts — anything with a ball, a target, and a player flick).
>
> Distilled from the Basketball Hoops build (2026-04 → 2026-05), with
> all the wrong turns, the things we'd do differently next time, and
> the patterns that actually worked. Read this before starting the
> next one — it'll save you days.
>
> Companion documents:
>
> - [`Docs/SPORTS_PHYSICS_RESEARCH.md`](SPORTS_PHYSICS_RESEARCH.md) — broad sports-physics reference, AAA-engine surveys
> - [`Docs/games/basketball/PHYSICS_RESEARCH.md`](games/basketball/PHYSICS_RESEARCH.md) — basketball-specific research with citations
> - [`Docs/games/basketball/TIMED_MODE_DESIGN.md`](games/basketball/TIMED_MODE_DESIGN.md) — the rapid-fire mode design doc

---

## Table of contents

1. [The "no guessing" rule (start here)](#1-the-no-guessing-rule-start-here)
2. [Coordinate system & projection](#2-coordinate-system--projection)
3. [Power, launch direction, and feel](#3-power-launch-direction-and-feel)
4. [Collision algorithms](#4-collision-algorithms)
5. [Visual rendering and asset alignment](#5-visual-rendering-and-asset-alignment)
6. [Input handling](#6-input-handling)
7. [Game-design patterns that worked](#7-game-design-patterns-that-worked)
8. [SFX](#8-sfx)
9. [Architecture & workflow](#9-architecture--workflow)
10. [Watchdogs & defensive code](#10-watchdogs--defensive-code)
11. [Asset generation lessons (DALL-E)](#11-asset-generation-lessons-dall-e)
12. [The mistakes hall of fame](#12-the-mistakes-hall-of-fame)
13. [Checklist for the next ball game](#13-checklist-for-the-next-ball-game)

---

## 1. The "no guessing" rule (start here)

**Origin:** a 4-hour time-burn early in the basketball build where
fishyboy-claude tuned restitution/friction values by intuition. The
ball "felt" wrong, numbers got nudged, it felt wrong differently,
nudge again, four hours gone. Fish memorialised the rule in
`memory/feedback_no_guessing.md`:

> Never invent values or configs from intuition. Ask the user or
> research references first.

**What this means in practice:**

- Physics constants come from research papers, regulation specs, or
  cited engine-backed reference repos. Every constant in
  `server/services/games/basketball/constants.js` has a comment
  citing its source.
- Tuning values (sensitivity, sizes, durations) come from playtest
  feedback iterated through a deploy loop — not from "what feels
  right at the keyboard."
- When research is ambiguous (e.g. "vy untouched vs vy receives
  friction"), use AskUserQuestion to surface the trade-off explicitly
  and let the human decide.
- When the user says "a little more / less," translate that to a
  specific magnitude (e.g. ±10%), state the new value in the message,
  and let the deploy + playtest loop confirm.

**The cost of breaking this rule** (real examples from basketball):

- vy-friction-on-backboard override: I "improved" the rim collision
  to be spin-coupled, then applied the same model to the backboard
  for "consistency." The research had a clear caveat (§5 Rec 3) that
  vy should be untouched on glass backboards. My override broke bank
  shots — they overshot the rim because vy got zeroed and gravity
  had to do all the dropping work alone. Cost: one wasted deploy
  cycle, Fish's playtest time, the embarrassment.
- The stuck-bug investigation (see [§12](#12-the-mistakes-hall-of-fame)).
  Three wrong theories burned three deploy cycles before I diagnosed
  the actual cause.

**Process for the next game:**

1. Open `Docs/SPORTS_PHYSICS_RESEARCH.md` and the relevant per-game
   research doc before writing any physics code.
2. Write the constants file FIRST, with citations in comments.
3. When the user gives directional feedback, restate the magnitude
   you're applying in the response.
4. If you find yourself thinking "let me try 0.6 instead of 0.7 and
   see," stop. Either there's research that says one or the other,
   or there's a measurement you can take, or it's a user decision.

---

## 2. Coordinate system & projection

### 2.1 World coordinates — 3D in SI units

```
x  = lateral (right is positive)
y  = vertical (up is positive)
z  = depth, away from camera (away is positive)

Units: metres, seconds.
```

This decision held up through the entire build. SI units mean every
physics constant has an obvious real-world value (rim height
3.05 m = 10 ft, ball radius 0.12 m = ~9.5" diameter, gravity
9.81 m/s²). Sanity-checking against reality is one Google search away.

### 2.2 Empirical linear K(z) projection

We **did not** use a real pinhole-camera projection (1/z scaling).
We used an empirical **linear** scale factor that lerps between two
authored values:

```js
K(z) = K_NEAR + (K_FAR - K_NEAR) * (z - Z_NEAR) / (Z_FAR - Z_NEAR)

screenX = canvasMidX     + worldX * K(z)
screenY = HORIZON_Y_PX   - (worldY - CAMERA_Y_M) * K(z)
pixelSize_of_anything = world_size * K(z)
```

**Why linear instead of 1/z?** Hand-tuning the scale at the two
endpoints (release plane and target plane) gives total control over
visual layout. The "physically correct" 1/z falls off too quickly at
near depth and looks cramped at our small canvas (800×1200).

**Why same K for both x and y?** So projected shapes preserve their
real aspect ratio at every depth. A circle stays a circle (modulo
its vertical foreshortening from ellipse perspective).

For the next game, keep this projection unless you have a specific
reason to swap. It's in `scene.js` at the top, ~10 lines.

### 2.3 Camera-above-eye trick

The "first-person POV" camera is parked at `CAMERA_Y_M = 4.0 m`,
above the player's actual eye height (1.7 m). This is a stylised
choice that gives **vertical separation on screen** between the ball
(low) and the rim (high). At literal eye height, ball-to-rim screen
distance was ~270 px — not enough for FB-Messenger-style layout.

For the next game: if your scene has a target above the player's
shooting position, camera-above-eye is a free visual win. Park the
camera so the ball-to-target screen separation is at least
~400 px out of your canvas height.

### 2.4 HORIZON_Y_PX leaves room for the in-canvas scoreboard

Initial value 75 put the rim at the very top with no scoreboard
space. Bumped to 175 = ~185 px of clean sky above the rim for the
in-canvas TIMER / SCORE / BEST / STREAK panel. **Plan your scoreboard
height before you set HORIZON_Y_PX.**

---

## 3. Power, launch direction, and feel

### 3.1 Power-to-velocity model

**Baseline + linear**, not pure linear:

```js
powerNorm = (power - MIN_POWER) / (MAX_POWER - MIN_POWER)
v         = VELOCITY_BASELINE_M_S + powerNorm * (VELOCITY_SCALE_M_S - VELOCITY_BASELINE_M_S)
```

Why baseline + linear and not pure linear? Pure linear had a huge
"dead band" at the bottom of the power meter where shots fell laughably
short. Adding a baseline gives the player something playable across
the whole input range. We bumped baseline from 4.8 → 5.6 to shrink
the dead zone from ~25% to ~10% of the power input.

For the next game: tune baseline so the **minimum-power shot** still
gives a result that's *in the ballpark* of the target, even if it
misses. "Crap shots that fall ridiculously short" feel broken.

### 3.2 Variable elevation from the flick direction

A purely-horizontal flick gives a flat shot; a purely-vertical flick
gives a steep arc. The flick **vector** decomposes into
(angle, elevation, power) via:

```js
// From the touch flick (dx, dy normalised to a unit vector in screen
// space) and a fixed forward baseline:
horizScale = sin(SHOT_ELEVATION_RAD)   // = sin(55°)
fwdScale   = cos(SHOT_ELEVATION_RAD)   // = cos(55°)

vxNorm = (dx / dist) * horizScale * LATERAL_AIM_SENSITIVITY
vyNorm = (-dy / dist) * horizScale     // dy<0 for upward flick
vzNorm = fwdScale                       // fixed forward component
```

`horizScale² + fwdScale² = 1` ensures `(vx, vy, vz)` is a unit vector
— total speed remains `power × VELOCITY_SCALE`.

**Why a fixed forward component?** Without it, a purely-vertical
flick has no z-velocity and the ball never reaches the target. The
fixed forward baseline ensures every shot moves toward the target;
the player only controls vertical/lateral steering.

### 3.3 LATERAL_AIM_SENSITIVITY damping

Raw 1:1 mapping of flick-x to shot-x is **too twitchy** — a small
unintended off-axis flick throws the ball way wide. Multiplying the
lateral component by 0.65 makes aim more forgiving without
eliminating it. Playtest-tuned, applied in both `mouseArrow.js` and
`touchFlick.js`.

### 3.4 Flick power mapping (touch)

```js
speed          = distance / dt
referenceSpeed = FLICK_DISTANCE_FOR_FULL_POWER / FLICK_REFERENCE_TIME_SEC
power          = clamp(speed / referenceSpeed, MIN_POWER, MAX_POWER)
```

`FLICK_DISTANCE_FOR_FULL_POWER` ended at 800 px through 3 playtest
iterations. Always tune this value based on direct user feedback —
phone screens vary, finger flicks vary, what feels right requires
playtest. Document each tuning step in the comment so future you can
follow the trail.

### 3.5 Mouse drag pull-back model

Cursor below the ball = power (drag length) and inverted direction
= launch direction. Click to fire. **No drag-and-release state to
get stuck on** (mouse handler is `click-to-fire`, not
`hold-and-release`). This is one reason the mobile stuck-bug never
manifested on desktop.

---

## 4. Collision algorithms

### 4.1 Spin-coupled rim/torus contact — the iconic move

This is the algorithm that gave the rim its real-basketball feel —
the rattle-in, the shooter's-roll, the kick-out variety. It's the
biggest single contributor to "this looks like real basketball."

**The model:**

1. Detect contact: ball is inside the torus's collision sphere
   (`distance from ball-centre to ring-centreline-point <
   BALL_RADIUS + TUBE_RADIUS`).
2. Normal `n` points from the ring-centreline point toward the ball
   centre.
3. **Contact-point velocity** `v_c = v + ω × r_c` where
   `r_c = -BALL_RADIUS · n` (vector from ball centre to the contact
   point on the ball surface). This is the key insight — friction
   doesn't act on the linear velocity, it acts on the velocity AT
   the contact point.
4. Decompose `v_c` into normal and tangential components.
5. Normal impulse: reflect & damp by restitution
   (`v_n_new = -BOUNCE * v_n`).
6. Tangential (friction) impulse: Coulomb-limited
   (`|J_f| ≤ μ * |v_n| * (1 + BOUNCE)`), opposed to `v_t`.
7. Angular impulse from the friction:
   `Δω = (r_c × J_f) / I` where `I = MOI_FACTOR * m * R²`.
8. Apply the friction impulse to BOTH linear velocity AND angular
   velocity. Spin builds up from the contact.

```js
// Pseudocode — see server/services/games/basketball/physics.js
// for the actual implementation (lines ~150-250 of the rim block).
const rc = scale(n, -BALL_RADIUS_M);
const vSpin = cross(omega, rc);
const vc = add(v, vSpin);

const dot = dotProduct(v, n);           // v · n (not v_c · n; r_c ∥ n so they coincide)
const vt = sub(vc, scale(n, dot));      // tangential
const vtMag = magnitude(vt);

const newVn = scale(n, -RIM_BOUNCE_FACTOR * dot);

const frictionImpulseMag = Math.min(
    vtMag,
    RIM_TANGENT_FRICTION_MU * Math.abs(dot) * (1 + RIM_BOUNCE_FACTOR),
);
const Jf = vtMag > 1e-9
    ? scale(vt, -frictionImpulseMag / vtMag)
    : zero;

v = add(sub(v, scale(n, dot)), add(newVn, Jf));

const Iinv = 1 / (BALL_MOI_FACTOR * BALL_RADIUS_M ** 2);
omega = add(omega, scale(cross(rc, Jf), Iinv));
```

**Hollow-sphere MOI factor = 2/3**, applied as `I = factor · m · R²`.
A basketball is approximately a hollow sphere; the moment of inertia
for a hollow sphere is `(2/3) · m · R²`. The factor matters because
friction impulse converts directly into angular velocity via this
relationship — get it wrong and spin builds up too fast or too slow.

**For the next game:** if your projectile has any rotational
character (which is most ball games), use this model. It's
~30 lines of code, comprehensible, and the visual payoff is huge
relative to the complexity. Don't use uniform-multiplier damping —
that's the "billiard-ball feel" outlier that engine-backed games
correctly avoid.

### 4.2 Swept collision detection — the anti-tunneling fix

Naive collision check (is the ball currently overlapping the
surface?) **fails for fast-moving balls**: at 60 Hz with a 0.12 m
ball travelling at 10 m/s, a single step covers 0.17 m — more than
the ball's diameter. The ball can jump cleanly from in-front-of to
behind in one frame.

**Fix: detect the ball-centre's plane crossing between `prevZ` and
`z`** (or whatever axis the surface is normal to):

```js
const surfaceContactZ = SURFACE_Z - BALL_RADIUS_M;
if (vz > 0 && prevZ < surfaceContactZ && z >= surfaceContactZ) {
    // Crossing happened. Interpolate the crossing point for the
    // bounds test and the contact position.
    const span = z - prevZ;
    const tCross = span > 1e-9 ? (surfaceContactZ - prevZ) / span : 0;
    const hitX = prevX + (x - prevX) * tCross;
    const hitY = prevY + (y - prevY) * tCross;

    if (inBounds(hitX, hitY)) {
        // ... apply collision response, snap position to contact point
        x = hitX; y = hitY; z = surfaceContactZ - 0.001;
    }
}
```

The Euler step capture (`prevX, prevY, prevZ`) before integration is
what makes this work. Always capture pre-integration position when
you do swept collision.

### 4.3 Strict bounds — no ball-radius forgiveness on edges

For a long time the backboard collision had `+BALL_RADIUS_M`
forgiveness on its in-bounds check ("ball edge grazes the board edge
→ corner contact"). It was physically motivated. **It was a
gameplay-feel bug.** Misses that looked like they cleared the top
edge still bounced back, indistinguishable from on-board hits.

**Strict bounds (ball CENTRE must be inside the surface rectangle)**
trade edge-graze realism for **miss readability**. Readability wins
in arcade games where players need clear cause-and-effect feedback.

### 4.4 The vy-untouched-on-glass call

Once we had spin-coupled contact working on the rim, the obvious
move was to apply the same algorithm to the backboard. **Don't.**

The research (`PHYSICS_RESEARCH.md` §5 Rec 3) had a clear caveat:
on a glass backboard, friction is small and most surveyed
engine-backed games leave `vy` untouched by board contact. Letting
friction zero-out vy on impact **kills the descent that gravity
needs to drop bank shots into the rim**. Centred banks overshoot
because they come off the board with vy=0 instead of continuing
their descent.

I shipped the over-extended version. Banks didn't drop. Fish
playtested. I reverted to the research recommendation. Don't repeat
this — when research has a specific recommendation, follow it unless
you have specific evidence the recommendation is wrong.

```js
// In the backboard collision response:
Jfy = 0;  // PHYSICS_RESEARCH.md §5 Rec 3 — leave vy untouched on glass
```

### 4.5 The shooter's-square auto-guide

Real basketball: a bank off the painted red rectangle ("shooter's
square") above the rim almost always goes in. The square is
positioned and angled to redirect the ball into the rim. Our flat
backboard can't reproduce that geometry, but we can fake it.

**Pattern:** detect a hit inside the rectangle. Override the
post-bounce velocity to a **free-fall** from the hit point into the
rim centre:

```js
const dropDist = hitY - RIM_HEIGHT_M;
const T = Math.sqrt(2 * dropDist / GRAVITY_M_S2);  // gravity-only drop time
if (T > 1e-3) {
    vx = (rimX - hitX) / T;
    vy = 0;                          // free-fall from hit point
    vz = (RIM_FORWARD_M - z) / T;    // arc toward rim
    ox = 0; oy = 0; oz = 0;
}
```

Skill stays in HITTING the rectangle (a small target on the board);
reward is reliability (the make is guaranteed). The real NBA
shooter's square is 24"×18", bottom 4" above the rim, centred —
those are real-world measurements, not invented. Use the real
measurements for the painted region on the board asset too, so the
visual and physical regions coincide.

### 4.6 Trajectory termination — the lesson from the stuck bug

For "off-target" shots (over the top, way wide), simulate until ONE
of:

```
y <= FLOOR + BALL_RADIUS              // floor touch (always)
z >  TARGET_Z + 2.5                   // way past target depth
|x| > REASONABLE_LATERAL              // way wide
MAX_TRAJECTORY_STEPS reached          // ultimate cap (~10s)
```

**Lesson:** too LOOSE termination (only floor-touch) means
genuinely-off shots simulate for 3+ s, which **emptied the
strict-pool rack** for long windows and felt like the game was
broken ("next ball won't flick"). Too TIGHT termination (cut at
`z > target + 1.0`) made over-the-top shots look like they hit an
invisible wall and bounced back.

The sweet spot: termination far enough out that the visual "fly
past the cage" survives (basketball: `z > BACKBOARD_Z_M + 2.5`),
but tight enough that flights don't exceed ~2 s. Tune to your
game's round-trip-time budget (flight + return) divided by your
ball-pool size.

---

## 5. Visual rendering and asset alignment

### 5.1 The killer pitfall — asset proportions don't match physics

The artist drew the basketball hoop with the rim ~0.44 × the
backboard's half-width. **Physics has them at 0.31.** A single
uniformly-scaled sprite **cannot** put both at their physics-correct
positions and sizes. Pick one and the other drifts.

**Three options when you hit this:**

1. **Split the sprite into independent pieces**, each positioned and
   scaled to its own physics anchor. Works only if the pieces don't
   overlap in the source image.
2. **Regenerate the art to match physics proportions.** Clean but
   requires another asset round-trip (DALL-E or artist).
3. **Accept "approximately right"** and align one element exactly,
   let the other drift. Quick but visible.

We hit this pitfall hard. The first attempt (option 1, frame-slicing
the combined hoop image) **mangled the backboard** because the rim
overlapped the board's lower third in the source — cropping at the
rim's top edge cut off the bottom 35% of the board.

The fix (option 2) was to regenerate as **two separate PNGs**
(`backboard.png` + `rim.png`) and frame-slice `rim.png` into rim-only
and net-only frames (rim and net DO stack cleanly with no overlap).

**For the next game: brief the artist (or the DALL-E prompt) on the
physics proportions from day one.** Specifically: target object
size relative to surrounding elements should match the physics
constants. A 5-second prompt check at generation time saves a
multi-hour visual rebuild.

### 5.2 Frame-slicing — when it works, when it doesn't

Phaser lets you define sub-frames on a texture:

```js
const tex = this.textures.get('basketball-rim');
tex.add('rim-only', 0, RIM_FRAME.x, RIM_FRAME.y, RIM_FRAME.w, RIM_FRAME.h);
tex.add('net-only', 0, NET_FRAME.x, NET_FRAME.y, NET_FRAME.w, NET_FRAME.h);

this.rimSprite = this.add.image(0, 0, 'basketball-rim', 'rim-only');
this.netSprite = this.add.image(0, 0, 'basketball-rim', 'net-only');
```

Frame-slicing works when the elements **don't overlap in the source
image**. Rim above, net below, clean horizontal cut between them.
✓ Works.

Frame-slicing **fails** when elements overlap (rim in front of
board's lower portion). Cropping cuts both. ✗ Don't.

**To pin two frames at a contiguous screen position despite their
different scales:** both frames anchor on the SAME source point (e.g.
the rim ellipse centre at `(523.5, 639)` in the source). Compute each
frame's origin in frame-fractional coordinates:

```js
const rimOriginX = (RIM_SOURCE_CENTRE.x - RIM_FRAME.x) / RIM_FRAME.w;
const rimOriginY = (RIM_SOURCE_CENTRE.y - RIM_FRAME.y) / RIM_FRAME.h;
const netOriginX = (RIM_SOURCE_CENTRE.x - NET_FRAME.x) / NET_FRAME.w;
const netOriginY = (RIM_SOURCE_CENTRE.y - NET_FRAME.y) / NET_FRAME.h;
// netOriginY will be negative — the rim centre is ABOVE the net
// frame's top edge. Phaser is fine with origins outside [0,1].
```

### 5.3 Z-depth ordering — the "ball in net" caught visual

Iconic basketball: ball drops through rim, gets briefly visible
"inside" the net mesh, then drops out the bottom. Reproduce with
explicit depth ordering:

```
DEPTH_BACKDROP          = -10
DEPTH_BALL_BEHIND_BOARD = -1   ← long misses occluded by board
DEPTH_BACKBOARD         =  0
DEPTH_RIM               =  1
DEPTH_BALL_BEHIND_NET   =  2   ← on score (caught look)
DEPTH_NET               =  3
DEPTH_BALL              =  4   ← default, in front
DEPTH_POPUP             = 10
```

Per-frame ball-depth flip based on state:

```js
if (pt.z > BACKBOARD_Z_M) {
    ball.sprite.setDepth(DEPTH_BALL_BEHIND_BOARD);
} else if (ball.counted) {  // ball scored
    ball.sprite.setDepth(DEPTH_BALL_BEHIND_NET);
} else {
    ball.sprite.setDepth(DEPTH_BALL);
}
```

The "ball goes behind the net" cue is the moment the player
**feels** the make, more than the score increment. Worth the
~10 lines of code.

**Backdrop must be pushed to negative depth** if you want any object
to render behind anything else. Both the backdrop image AND the
procedural sky/floor graphics need explicit `setDepth(DEPTH_BACKDROP)`
— see the regression in [§12](#12-the-mistakes-hall-of-fame).

### 5.4 Depth-emphasis ball scaling

The linear K(z) projection IS geometrically correct, but **reads
visually flat** at a small canvas. The "ball coming at me / going
away" parallax cue is weak. Add a multiplier:

```js
function _ballScaleAtK(k) {
    const base = (2 * BALL_RADIUS_M * k) / (BALL_IMG_WIDTH_PX);
    const range = K_NEAR_PX_PER_M - K_FAR_PX_PER_M;
    const t = range > 1e-6 ? (k - K_FAR_PX_PER_M) / range : 0;
    const tClamped = Math.max(0, Math.min(1, t));
    return base * (1 + tClamped);   // 2× at K_NEAR, 1× at K_FAR
}
```

Pure cosmetic, applied **only to the ball** (not the target). 2× at
release plane → 1× at target plane → 1× beyond (clamped). Reads as
a strong "the ball is coming toward me" cue without breaking
physics-correctness anywhere it matters.

### 5.5 Measure assets with pngjs — never eyeball

When you need to align a sprite to a physics constant, you need a
real pixel measurement of where the relevant feature is in the
source image. Use `pngjs`:

```js
import { PNG } from 'pngjs';
import fs from 'fs';
const png = PNG.sync.read(fs.readFileSync('path/to/asset.png'));
const { width: W, height: H } = png;
const at = (x, y) => {
    const i = (W * y + x) << 2;
    return { r: png.data[i], g: png.data[i+1], b: png.data[i+2], a: png.data[i+3] };
};
// Then scan for: bounding box, centroid, specific colour regions,
// edges of a feature, etc.
```

We used it for: rim ellipse centre + radius, backboard rectangle,
backdrop cage inner edges (to clamp sway amplitude), net region. All
documented in `scene.js` constants with the measured values and the
script that produced them. Future-you can re-measure any time the
asset changes.

### 5.6 Cage-clamped sway

Backboard sway amplitude was originally 1.5 m, picked by feel. After
measuring the cabinet backdrop image (cage inner edges at canvas
x ≈ 121 / 677 at the rim's screen-y), we computed the **exact**
amplitude that makes the rim's outer edge just touch the cage's
inner edge at peak sway: **1.05 m**. The rim now visibly bounces
off the cage walls at max sway.

Same principle for any game: **measure the visual bounding region
in the backdrop and clamp the target's motion to it.** Don't pick
amplitude by feel.

---

## 6. Input handling

### 6.1 Touch flick — the multi-pointer trap (THE big input bug)

Original `onDown`/`onUp` had a state machine:

```js
let tracking = null;

function onDown(pointer) {
    if (tracking !== null) return;      // ← bail if already tracking
    if (!isNearBall(pointer.x, pointer.y)) return;
    tracking = { id: pointer.id, ... };
}

function onUp(pointer) {
    if (!tracking || pointer.id !== tracking.id) return;  // ← bail on wrong pointer
    // ... process flick
    tracking = null;
}
```

**The trap:** a SECOND pointer's `pointerup` (palm graze, accidental
finger ghost, edge-swipe browser gesture) fires `onUp` with a
mismatched `id`. The handler bails **without clearing `tracking`**.
If Phaser then misses the original tracked pointer's up event for
any reason (focus loss mid-drag, swipe-from-edge browser nav, page
backgrounded), `tracking` is set forever. Every subsequent `onDown`
returns early. **No flicks register, but everything else continues.**

This was the actual cause of the "random, mobile only, next ball
won't flick" stuck-bug Fish chased for days. I went through three
wrong theories before instrumenting and reading the input code
properly.

**The fix — stale-tracking guard:**

```js
function onDown(pointer) {
    // Stale-tracking guard. A missed pointerup leaves `tracking`
    // set forever and blocks every future onDown.
    if (tracking !== null
        && performance.now() - tracking.startT > FLICK_MAX_DURATION_SEC * 1000 + 700) {
        tracking = null;
        trail.clear();
    }
    if (tracking !== null) return;
    if (!isNearBall(pointer.x, pointer.y)) return;
    tracking = { id: pointer.id, startX: pointer.x, startY: pointer.y, startT: pointer.downTime || performance.now() };
    trail.clear();
}
```

**For the next game:** ANY input state machine that's keyed to
pointer.id must have a stale-tracking guard. Treat the lifecycle as:
*tracking is dead state if it hasn't completed within an upper bound
of how long the gesture can take.*

### 6.2 Mouse arrow — click-to-fire, not drag-to-release

`mouseArrow.js` is **click-to-fire**: the cursor's position relative
to the ball IS the pull-back; `pointerdown` fires the shot
immediately. No drag-and-release state machine, **no trap**.

This is why desktop never showed the stuck-bug. Different input
schemes have different failure modes — choose the simpler one when
you can.

### 6.3 Lateral aim sensitivity — playtest-tuned damping

A purely 1:1 mapping of flick-x → shot-x was punishingly twitchy in
playtest. `LATERAL_AIM_SENSITIVITY = 0.65` was Fish's chosen
damping. Applied identically in `mouseArrow.js` and `touchFlick.js`
so the desktop and mobile experience aim the same way.

---

## 7. Game-design patterns that worked

### 7.1 Timed rapid-fire mode (the headline mode)

`Docs/games/basketball/TIMED_MODE_DESIGN.md` has the full design.
Highlights worth carrying to the next game:

- **Single short clock (20 s)** is way more replayable than
  multi-round modes. Players hit "play again" immediately on a bad
  score. Designed for the wagered-window context.
- **Strict ball pool (4)** creates natural pacing. A flicked ball is
  gone from the rack until it physically rolls back. Real-arcade
  feel.
- **State machine: idle → running → settling → over.** "Settling"
  lets buzzer-beater shots resolve before ending the game.

### 7.2 Streak bonuses trigger on SCORES, not attempts

Original design had backboard motion ramping every 5 **flicks**.
Wrong. Punishing missing reps with escalating difficulty feels
unfair. Fish corrected it: motion triggers on the player's 5th
SCORE, ramps every 5 more.

**Principle for any escalating-difficulty mechanic:** key it to
successful play, not to attempts. Earn the challenge.

### 7.3 HOT STREAK at 3-in-a-row, big celebration

- Threshold 3 (not 5) — frequent enough to actually hit in a 20 s
  game, infrequent enough to feel earned.
- Bonus +5 s (not +3 s) — meaningful clock impact.
- Big centred celebration text (64 px, Back.Out scale-up + float-fade)
  + cheer sound — sells the moment.
- **Buzzer-beater HOT STREAK revives the clock**: if the streak
  completes during the 'settling' phase, transition back to 'running'
  with `timerEndMs = now + STREAK_BONUS_MS`. Comeback moment.

### 7.4 Miss-type popups — tell the player WHY

Player feedback Fish quoted directly: *"It makes it hard for me to
judge what I need to tweak to get it in."* Solution: brief miss-type
text appears at the rim on every miss:

```
short  → "SHORT"
wide   → "WIDE"
long   → "LONG"
rim_out → "RIM"
bank_out → "OFF BOARD"
```

Differentiated from the score popup (smaller font, red instead of
yellow/white, slightly different position) so the two are never
confused at a glance.

**For any game where a miss has a discrete category, surface it.**
Players need to know WHY they missed to improve.

### 7.5 Net animation only — keep the rest static

The dip + stretch reaction to a score is applied **only to the net
sprite**, not the rim or backboard. In real life, the net does the
visible jiggle; rim/board are static. Matching reality reads correctly.

### 7.6 Final-seconds urgency

- Countdown beeps once per second during the last 5 s.
- Timer text turns red in the last 5 s.
- The beep gate **resets** if a HOT STREAK pushes the clock back
  above 5 s — the next descent re-beeps correctly.

---

## 8. SFX

### 8.1 Web Audio synthesis — cheap, fast, no asset files

For arcade-game SFX (impacts, beeps, swishes), Web Audio synthesis
is faster than loading audio files. Patterns we ended up with:

| Sound | Synthesis |
|---|---|
| Net swish | White noise burst, high-pass + low-pass filtered, ~0.4 s decay |
| Rim clang | Triangle wave 900→500 Hz pitch drop, ~0.15 s decay |
| Board bank | Sine wave 140→70 Hz pitch drop, ~0.2 s decay |
| Air whoosh | Bandpass-filtered noise sweep 600→1800 Hz, ~0.22 s |
| Floor bounce | Sine wave 180→90 Hz pitch drop, ~0.14 s |
| Countdown beep | Square wave 880 Hz, sharp 0.08 s |
| Final buzzer | Square wave 180→140 Hz + tremolo, 0.7 s |
| Crowd cheer (synth approximation) | Pink-noise bed + ascending C-E-G triangle wave triad |

Cheering does **not** synthesize convincingly. For "happy whoosh +
ascending chime" it's fine; for real crowd texture, use a real
audio asset. Flagged this to JJ for follow-up.

### 8.2 Defensive wrapping is mandatory — `safeAudio`

**Web Audio is fragile**, especially on mobile when the
AudioContext suspends or closes (page backgrounded, tab switched,
focus lost). An exception inside a `play*` function used to
propagate up through `_fireBallEvents` → `_renderFlyingBall` →
`_renderBall` and **terminate the per-ball render loop**. This
contributed (alongside the multi-pointer trap) to the stuck-bug
symptoms.

The wrapper:

```js
function safeAudio(fn) {
    return function (...args) {
        try { return fn.apply(this, args); } catch { /* silent — audio is non-critical */ }
    };
}

export const playSwish = safeAudio(function playSwish() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    // ... synth code that might throw
});
```

**Every play\* export is wrapped.** Audio failures become silent no-ops.
Audio is **never essential to gameplay**; a throw can't reach the caller.

For the next game: wrap from day one. Add `safeAudio` as the first
thing in your sfx.js. Don't wait for the bug.

### 8.3 AudioContext lazy-init

Browsers require an AudioContext to be created or resumed in
response to a user gesture. Pattern:

```js
let _ctx = null;
export function ensureAudioContext() {
    if (_ctx) {
        if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
        return _ctx;
    }
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        _ctx = new Ctx();
        return _ctx;
    } catch {
        return null;
    }
}
```

Call `ensureAudioContext()` from the first user interaction (first
flick handler) and once per `play*` call thereafter.

---

## 9. Architecture & workflow

### 9.1 Standalone playtest repo + monorepo integration

**The pattern:**

- A standalone repo (`solshot-basketball` on a personal/team GitHub
  org) gets deployed to Vercel for **fast playtest iteration**.
- All code lives in the SolShot monorepo (`solshot/client`,
  `solshot/server`).
- We sync files between the two during iteration. At handoff time,
  the monorepo branch is committed and pushed to the team repo.

**Why:** standalone is Fish-only fast iteration without polluting
the team repo with mid-iteration commits. Monorepo is JJ-led
integration into the live SolShot product.

**Cost:** three-file sync drift risk (standalone, client, server
copies of physics constants and code). Mitigated by:

- Server tests as the canonical reference (75 tests cover the
  physics).
- Explicit `diff` checks after each sync.
- Single comprehensive commit at handoff time so the team repo
  history isn't littered with intermediate states.

**For the next game:** use the same pattern. Set up the standalone
repo + Vercel project before the first physics commit.

### 9.2 Bridge pattern (Phaser ↔ React)

Phaser owns the game loop and the canvas; React owns the HUD
overlays. Communication via a singleton bridge:

```js
class GameBridge {
    constructor() {
        this.state = { ... };
        this.dirty = false;
    }
    updateState(partial) {
        Object.assign(this.state, partial);
        this.dirty = true;
    }
    consume() {
        if (!this.dirty) return null;
        this.dirty = false;
        return { ...this.state };
    }
}
```

React polls via rAF, only re-renders when the bridge is dirty. Cheap,
predictable.

### 9.3 CI catches warnings as errors

`react-app-rewired build` with `CI=true` treats ESLint warnings
(notably `no-unused-vars`) as **errors**. This bit us multiple times
when refactoring imports — removed a const but left the import,
build failed.

**Always run `CI=true npm run build` locally before committing** if
you've touched imports. Saves a Vercel build cycle.

### 9.4 Three watchdog layers — defensive depth

For any game with a "ball pool" or async input, build redundant
watchdogs:

1. **Per-ball state watchdog**: ball in `flying` state without
   trajectory for >2.5 s → force-recover.
2. **Per-ball flight-time watchdog**: ball in `flying` with a
   trajectory for >4 s → force-resolve.
3. **Pool-level watchdog** (potential — not implemented, but design
   for it): rack empty for >X s → force-recover all non-racked balls.

**For the next game:** start with layers 1 + 2 from day one. Layer
3 is the nuclear option if 1 + 2 ever miss a case.

---

## 10. Watchdogs & defensive code

### 10.1 Per-ball render isolation

If your update loop renders multiple objects in a `for` loop, an
exception in one object's render terminates the loop. Wrap each
iteration:

```js
for (const ball of this.balls) {
    try {
        this._renderBall(ball, now);
    } catch (err) {
        console.warn('[basketball] render ball error', err);
    }
}
```

This was a contributor to the rack-empty stuck-bug — a throw in
ballA's render meant balls B/C/D never advanced state. Even if you
fix the throw, this isolation is cheap insurance.

### 10.2 The Euler-step pattern with `prev*` capture

For any swept collision or score-detection at a plane crossing,
capture pre-integration position:

```js
for (let step = 1; step <= MAX_TRAJECTORY_STEPS; step++) {
    const prevX = x;
    const prevY = y;
    const prevZ = z;
    vy -= GRAVITY_M_S2 * PHYSICS_DT;
    x += vx * PHYSICS_DT;
    y += vy * PHYSICS_DT;
    z += vz * PHYSICS_DT;

    // Score detection — did y cross RIM_HEIGHT_M this step?
    if (!scored && prevY > RIM_HEIGHT_M && y <= RIM_HEIGHT_M && vy < 0) {
        const t01 = (prevY - RIM_HEIGHT_M) / (prevY - y || 1e-9);
        const crossX = prevX + (x - prevX) * t01;
        // ... check horizontal distance from rim centre
    }

    // Swept collisions check prev* vs current
    // ...
}
```

### 10.3 Score-detection zones with forgiveness

```js
const cleanZone = RIM_INNER_RADIUS_M + BALL_RADIUS_M * 0.5;   // swish
const outerZone = RIM_INNER_RADIUS_M + BALL_RADIUS_M * 1.3;   // any score
```

`cleanZone` catches centred-enough crosses as swishes (2 pts).
`outerZone` catches "close enough + had a rim/board contact" as
non-swish scores (1 pt). Arcade-forgiving — without it, the
percentage of "rattles out" is too high.

### 10.4 Per-shot determinism with `attemptSeed + shotIndex`

`simulateShot()` takes an `attemptSeed` and a `shotIndex` to keep
trajectories deterministic per shot. The backboard's per-shot sway
phase derives from these too. This is essential for **server-side
authoritativeness** (Phase 4): the server runs the same `simulateShot`
with the same seed and gets the identical trajectory.

For the next game: design `simulateShot(...)` as a pure function
from `(angle, power, elevation, attemptSeed, shotIndex)` →
trajectory. Don't read external state.

---

## 11. Asset generation lessons (DALL-E)

### 11.1 Transparent background — DALL-E's struggle

DALL-E 3 often **renders a checker pattern** when asked for
"transparent background." It interprets transparent as a *visual*
checker (PhotoShop-style) instead of actual PNG alpha. The art
arrives with a checker overlay that has to be re-prompted out.

**Prompt patterns that worked better:**

- "isolated as a **product cutout** on a PURE TRANSPARENT background
  (alpha channel only)"
- Explicit list of forbidden artifacts: *"ABSOLUTELY NO checker
  pattern, NO halftone dots, NO polka dots, NO pop-art texture,
  NO splatter, NO grunge, NO decorative border."*
- "like a **sticker cutout** ready for compositing into a game"

Backup tactic if transparency still fails: "*If a fully transparent
background is not possible, use a PURE SOLID `#00FF00` GREEN
background with NO pattern of any kind*" — then chroma-key it out in
pngjs.

### 11.2 Reference-image style transfer

Upload an existing successful asset to ChatGPT/DALL-E as a **style
reference**: "Match the visual style of the reference image (line
weight, glow, palette)." Keeps multi-asset projects visually
coherent.

### 11.3 Specify proportions explicitly

When the generated element will need to align with a physics
constant (rim radius, target size), specify the proportion in the
prompt: *"shooter's square width is ONE-THIRD of the backboard's
total width (NBA reg: 24" on a 72" board)."* DALL-E often
under-sizes painted regions by default.

### 11.4 Element overlap kills frame-slicing

If you plan to frame-slice the asset, prompt the artist/DALL-E to
keep elements separated with **clean transitions**: *"the rim ring
sits clearly above the net with a clean horizontal transition
between them — no overlap, no net strands crossing in front of the
rim ring."* See [§5.2](#52-frame-slicing--when-it-works-when-it-doesnt).

---

## 12. The mistakes hall of fame

The instructive failures. Read these before the next game so you
don't repeat them.

### 12.1 Four-hour time-burn on guessed physics

Establishment of the [no-guessing rule](#1-the-no-guessing-rule-start-here).
Tuned restitution/friction values by feel. Each tweak made it "feel
different but still wrong." Four hours, no progress. Now everything
is research-cited.

### 12.2 The vy-friction-on-backboard override

Implemented spin-coupled rim collision, then applied the same
algorithm to the backboard "for consistency." The research had a
specific caveat (§5 Rec 3) that vy should be untouched on glass.
My override zeroed vy on impact, killing the descent gravity needed
to drop bank shots into the rim. Reverted to the research
recommendation. **Lesson: when research has a specific
recommendation, follow it.**

### 12.3 The frame-slice that mangled the board

First attempt at fixing the asset proportion mismatch: cut the
combined hoop.png into a backboard frame and a rim+net frame.
Cropped the backboard frame above the rim's top edge — **cut off
the bottom 35% of the backboard rectangle**. Looked broken. Replaced
with two independently-generated assets ([§5.1](#51-the-killer-pitfall--asset-proportions-dont-match-physics)).
**Lesson: only frame-slice if the source elements don't overlap.**

### 12.4 Demoting the backdrop broke the background

Set `backdrop.setDepth(-10)` to enable the "ball behind board" trick.
**Forgot that the procedural `bg` + `floor` graphics underneath were
still at default depth 0** — they now drew over the backdrop image,
hiding it. Fix: setDepth(-10) on those too.
**Lesson: when changing depth ordering, audit every object that
might overlap the new layer in screen space.**

### 12.5 The stuck-bug triple-wrong-diagnosis

Fish's most painful playtest issue. Symptom: random, mobile only,
"next ball won't flick, everything else continues." I diagnosed it
**wrong three times** before finding the actual cause:

| Theory | Why I thought so | Why wrong |
|---|---|---|
| Audio throws killing the render loop | Web Audio is fragile, unwrapped sfx in `_fireBallEvents` | I wrapped audio, bug persisted |
| Trajectories too long → rack empty | Long misses simulating 3+ s after I'd dropped the z/x terminations | I added looser terminations + max-flight watchdog, bug persisted |
| Render-loop exceptions cascading | Defensive wrapping per-ball | Bug persisted |
| **Touch input multi-pointer trap** (actual cause) | A second pointer's up event leaves `tracking` set; missed first pointer's up locks out new flicks forever | Found by reading `touchFlick.js` carefully |

**Lessons:**
1. **Instrument before fixing.** If I had `console.log`-ed ball
   states each frame during a stuck game, I'd have seen all 4 balls
   in `racked` state — pointing me at input, not ball state.
2. **Don't guess fixes in series.** Each wrong theory burned a
   deploy cycle and Fish's playtest time.
3. **The "no guessing" rule applies to debugging too.**

### 12.6 Hallucinated comms entry (from a prior session)

A prior `fishyboy-claude` session reported appending an entry to
`Docs/internal/CLAUDE_COMMS.md` — the entry **didn't exist** in any
commit. `main-claude` wrote a calibration note warning future
fishyboy-claude sessions:

> Before reporting an action as "done", verify with `git log -1`
> and `git status`. If the action is "I appended X to Y", paste the
> actual file delta back into the conversation as proof.

**Lesson:** for file writes that matter (especially cross-Claude
comms), verify with `git show` or `Read` after the write. Don't
trust your own summary.

### 12.7 Misread Fish's "5 shots / 5 baskets" comms

Fish wrote: *"the backboard starts moving after 5 shots, not 5
successful baskets."* I parsed this as **"keep it at 5 shots"** and
verified that's what the code did. Fish actually meant **"it's at
5 shots [currently], change it to 5 baskets."** Ambiguous phrasing
+ confident wrong interpretation = wasted half a deploy cycle.

**Lesson:** when a user says "A, not B," and the code is in state A,
ASK whether they want it kept-A or changed-to-B. Don't infer from
context confidence alone.

---

## 13. Checklist for the next ball game

Pre-build:

- [ ] Read this doc top to bottom.
- [ ] Read the relevant `PHYSICS_RESEARCH.md` for the sport.
- [ ] Standalone playtest repo created + Vercel project wired up.
- [ ] Constants file drafted with research citations.

Physics:

- [ ] World in SI units (m, s, kg if mass matters).
- [ ] Empirical linear K(z) projection from `scene.js` carried over.
- [ ] Power model: baseline + linear, not pure linear.
- [ ] Spin-coupled contact for the primary target surface.
- [ ] Swept collision for any plane that fast-moving balls hit.
- [ ] Score-detection zones with forgiveness (clean vs outer).
- [ ] Trajectory termination: floor + bounded z + bounded |x|, plus a
      hard step-count cap.
- [ ] `simulateShot()` is a pure function of inputs (deterministic).

Visuals:

- [ ] Asset proportions match physics constants (brief artist/DALL-E
      on day one).
- [ ] Depth ordering planned: backdrop, target, ball-default,
      ball-on-make, popups.
- [ ] Backdrop's `setDepth` set explicitly, and any sibling
      graphics objects too.
- [ ] Depth-emphasis ball scale (2× → 1×) applied.
- [ ] All assets measured with pngjs; measurements documented in
      `scene.js` constants.
- [ ] Target motion clamped to backdrop's visible region (sway,
      whatever the equivalent is).

Input:

- [ ] Touch input has a stale-tracking guard from line one.
- [ ] All multi-pointer state cleared aggressively.
- [ ] Lateral aim sensitivity set to 0.6-0.7 for forgiveness.
- [ ] Test with multi-touch (palm grazing) on real device.

SFX:

- [ ] `safeAudio` wrapper around every play\* export.
- [ ] AudioContext lazy-init pattern from `sfx.js`.
- [ ] Final-seconds countdown beeps + buzzer + score-celebration
      sound.
- [ ] Real cheering WAV if texture matters; synth if you just need
      "happy noise."

Architecture:

- [ ] Bridge pattern for Phaser ↔ React communication.
- [ ] Server tests as canonical physics check; tests pass before
      every commit.
- [ ] `CI=true npm run build` clean before every push.
- [ ] Three-file sync discipline (server / client / standalone).

Defensive:

- [ ] Per-ball render isolation try/catch.
- [ ] Watchdog 1: no-trajectory timeout (~2.5 s).
- [ ] Watchdog 2: max-flight timeout (~4 s).
- [ ] Verify all file writes with `git show` / `Read` after the fact.

Game design:

- [ ] Escalating difficulty triggers on **successful** play, not
      attempts.
- [ ] Miss-type popups so players can adjust.
- [ ] Score-celebration moment is unmistakable (z-order trick + big
      text + sound).
- [ ] Streak bonus is meaningful (≥3 s on a 20 s clock).

---

> When you build the next one, **update this doc** as you go. Each
> game teaches us something the previous one didn't. The playbook
> compounds.

— fishyboy-claude, 2026-05-15
