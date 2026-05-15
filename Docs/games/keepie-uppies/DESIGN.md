# Keepie-Uppies — Game Design v0.1

The third game on the SolShot arcade. Side-on 2D ball-juggling survival. Tap the ball, don't let it touch the floor, how long can you keep it up. Best score in a 1–7 day window wins the pot.

Deliberately picked as the **lowest-contract counterweight to Basketball Hoops** — one ball, one input, one number. Skill-ceiling design: physics never escalate, the only difficulty is the permanent challenge of the mechanic plus the player's own attention degrading.

---

## Concept

A football is in mid-air. Gravity pulls it down. The player taps the ball to bounce it back up. Tap position relative to the ball's centre determines the outgoing direction. Ball touches the floor → game over. Score = number of successful taps.

The player can hit **Play Again** as many times as they want during the active wager window. The server tracks every attempt and keeps each player's **best score** as their leaderboard entry. At the window deadline (1 / 2 / 4 / 7 days, set by the lobby host), the player with the highest best-score wins the pot.

There is no clock, no rounds, no turns, no levels. Each attempt runs until the ball drops.

---

## Strategic context

This is the second arcade title shipping after Basketball Hoops. Picked by Fish 2026-05-15 specifically because it has the smallest possible contract:

- ~5–10× less code surface than basketball (no rim collision, no swept backboard, no shooter's-square auto-guide, no 4-ball rack state machine, no three watchdog layers, no miss-type taxonomy)
- Two assets total (ball + pitch backdrop) vs basketball's six
- One physics constant family (gravity + Magnus + impulse) vs basketball's research-cited rim/board/spin physics
- One game state (playing | over) vs basketball's idle → running → settling → over

What this game contributes to the arcade catalogue that basketball doesn't:

- **Pure-skill leaderboard.** Basketball has per-shot variance from backboard sway; keepie-uppies is fully deterministic given player input. Top scores are pure skill, not luck-of-the-rattle.
- **Deeper practice surface.** Basketball's timed-mode mastery curve plateaus quickly (4-ball rack, 20s clock). Keepie-uppies has no upper bound — a player who practices for hours genuinely scores higher. Better fit for the dedicated friend who wants to dominate a 7-day window.
- **Maximum visual contrast.** No court, no hoop, no first-person camera. Pure 2D side-view. Different sport, different vocabulary.

---

## Perspective + camera

**Side-on 2D.** No depth axis, no projection math (basketball's K(z) doesn't apply). Camera is a fixed window onto a 2D world. Coordinates: `x` lateral right, `y` vertical up, SI units (metres, seconds).

No player character / silhouette / body. The whole frame is: backdrop, ground line, ball, HUD overlay. The "player" is implicit — the tap is from off-screen.

---

## Input

One scheme, works on both touch and mouse. Server receives the same payload from both: `{ tapX, tapY, timestamp }`.

### The tap mechanic

- Tap (touch or click) anywhere on the canvas registers as an input event.
- Server (and client mirror) tests if `(tapX, tapY)` is inside the ball's hitbox: distance from tap point to ball-centre ≤ `BALL_RADIUS_M`.
- If outside the hitbox: **silently ignored.** No whiff penalty, no help. The miss never registers anywhere.
- If inside the hitbox: **the tap fires.** Ball gets new velocity + new spin determined by the tap offset (see Mechanics).

### Why hit-the-ball-only

If tap-anywhere counted, the rational strategy is to spam-tap and never miss. Forcing the tap to land on the ball makes the player track the ball with their eyes, makes the direction-control mechanic load-bearing, and makes timing matter.

---

## Mechanics

The whole game lives in one function: `applyTap(ball, tapPoint)`.

```
offset = tapPoint − ball.center        // vector inside the ball
offsetX_norm = offset.x / BALL_RADIUS_M    // ∈ [-1, 1]
offsetY_norm = offset.y / BALL_RADIUS_M    // ∈ [-1, 1]

ball.velocity.x = -offsetX_norm * LATERAL_GAIN
ball.velocity.y =  BASE_UP_M_S - offsetY_norm * VERTICAL_GAIN
ball.spin       =  offsetX_norm * SPIN_GAIN
```

Three things to notice:

1. **Velocity is fully replaced, not added to.** A tap is a fresh launch — whatever the ball was doing before is overwritten. This gives the player one clean recovery from chaos: nail a perfect-centre tap and the ball is reset to a vertical bounce with zero spin. A spinning, flying-sideways ball can be tamed by one good tap.
2. **Direction is opposite the offset.** Tap left of centre → ball goes up-and-right (you "kicked" it from the left). Tap below centre → adds extra height (you struck under the ball). This matches the real-world feel of striking a ball.
3. **Spin is set, not accumulated.** Same logic: each tap is a fresh start. No multi-tap spin buildup.

### Magnus curve

After each tap, while the ball is in flight, the spin curves the trajectory. In 2D side view:

```
F_magnus.x = -MAGNUS_COEFFICIENT * spin * velocity.y
F_magnus.y =  MAGNUS_COEFFICIENT * spin * velocity.x
```

This is the perpendicular force from spin × velocity — the standard Magnus model in 2D. Direction is always 90° to current velocity, magnitude scales with both spin and speed.

`MAGNUS_COEFFICIENT` is the single most-tuned constant in the game. It sets how dramatically off-centre taps bend the trajectory, which in turn sets the entire feel. Tuning notes will land in `PHYSICS_RESEARCH.md` and iterate via playtest.

### Wall + floor + ceiling

| Surface | Behaviour |
|---|---|
| Left wall (`x = 0`) | Elastic bounce. `vx → -vx`. Spin unchanged. |
| Right wall (`x = WORLD_WIDTH_M`) | Elastic bounce. `vx → -vx`. Spin unchanged. |
| Floor (`y = 0`) | **Game over.** Swept-detection on `y - BALL_RADIUS_M` crossing per playbook ch.4.2. |
| Ceiling | Open. Ball can fly arbitrarily high. Gravity returns it. |

Walls are perfectly elastic so the ball doesn't decay during long wall-to-wall sequences. Gravity provides the only energy sink, which is correct — every tap re-energises the ball, every gravity step takes some away, and the player's skill is keeping that balance positive.

### Failure mode

The single failure is **floor contact**. There is no time-out fail, no off-screen-sides fail (walls bounce), no off-screen-top fail (ceiling open), no health bar, no missed-tap penalty. The only way the run ends is the ball touching the ground.

---

## Scoring

```
score per tap = 1
total score = number of successful taps before floor contact
```

That's the entire scoring model. No multipliers, no combo bonuses, no streak rewards, no per-trick scoring, no centre-precision bonus. Pure count.

### Why no scoring complexity

Anything more — even a "perfect tap = 2 points" bonus — pulls the design toward score-maximization (Tony Hawk DNA) and away from survival (Flappy Bird DNA). The fantasy locked is survival; the leaderboard should be one number that's instantly comparable. "Player A scored 247, Player B scored 198" is the whole conversation.

### Score milestones (visual feedback only)

Every 10 taps: brief score-number pulse + soft chime. No mechanical effect. Players just like seeing round numbers tick over.

New personal best mid-run: "NEW BEST!" banner above score. Pure dopamine hit.

---

## Difficulty model

**There is no difficulty curve.** This is the design's most distinctive choice.

- Gravity is constant.
- Ball size is constant.
- Magnus coefficient is constant.
- No new obstacles spawn. No wind events. No multi-ball.
- The game is mechanically identical at touch 5 and touch 500.

The difficulty is the permanent challenge of the mechanic itself, plus the player's attention degrading over a long session. A perfectly-focused, perfectly-precise player could (in theory) play forever. In practice, hands tire, eyes drift, and a single off-centre tap creates a curving Magnus trajectory that requires harder-to-land subsequent taps, which produces more spin, which compounds.

This is **self-balancing emergent difficulty**: good players stay in control, sloppy players spiral. No constants need tuning to dial difficulty up or down — it's set by the Magnus coefficient and the human limits of focus.

### Anti-goals captured

| Cut | Why we cut it |
|---|---|
| Tricks / combo system | Pure count is the whole identity. |
| Multiple body parts (foot / head / knee zones) | One ball, one hitbox, one tap action. |
| Multi-ball at score thresholds | Massive code complexity. Breaks the cost thesis. |
| Difficulty escalation | Skill-ceiling design is the deliberate identity choice. |
| Player avatar / character | Mechanic doesn't reference a player. |
| Timed mode / clock | Survival only. There's no buzzer to beat. |
| Power-ups / slow-mo / freeze tokens | Each adds state, UI, balance work. None earn cost. |
| Tap-anywhere-counts | Removes "spam tap" as a strategy. |
| Tutorial / countdown | Game is self-explanatory in ~1 second. |
| Multiple game modes | One mode. Mode-pickers dilute the leaderboard. |
| Miss-type popups | Only one miss type (didn't hit ball); surfacing it would clutter. |
| Cosmetic skins in v0 | Skins land in the SHOT economy post-launch. |

---

## Wager structure

Maps cleanly to Fish's multi-game time-windowed wager mechanic (memory: 2026-05-10 vision):

- **Player's leaderboard entry** = best score from any single attempt during the window.
- **Unlimited attempts** during the window. Only the max counts.
- **Tie-break:** earlier-submitted best-score wins. No sudden-death OT.
- **Server-authoritative scoring.** Server runs `simulateRound(seed, tapEvents[])` and computes the canonical score. Client renders, server scores. No path for a client to spoof being the winner.
- **Match ID convention:** `keepie:<roomId>` per `Docs/ARCADE_NEW_GAME_PLAYBOOK.md`.
- **Lobby config:** 2–10 players, wager amount user-set, window length 1d / 2d / 4d / 7d (mirrors basketball's options). Adds entries to the `/customgame` flow in the bot.

---

## Visual design

**Setting:** football pitch. Grass + chalk lines + sky horizon, optional goal posts in the distance for atmosphere. Classic black-and-white-panels football for the ball.

The aesthetic deliberately departs from basketball's streetball/urban look — visual variety in the arcade catalogue is a feature. The ball alone tells the player which game they're in.

**Asset surface:**

| Asset | Notes |
|---|---|
| `ball.png` | ~256×256 PNG with alpha. Black-and-white panels (Telstar-style). |
| `pitch.png` | Single canvas-sized backdrop. Grass + chalk lines + sky horizon + (optional) distant goal posts. |
| Floor | Drawn procedurally — single coloured rectangle at `FLOOR_Y`. No asset. |
| HUD | React overlay (score, best, game-over screen). No Phaser sprites. |

**Total: 2 sprite assets.** Less than half basketball's surface. No frame-slicing (no overlapping elements), no asset-vs-physics-proportions risk (per basketball playbook ch.5.1), no cage-clamped sway (no swaying target).

**Depth ordering:**

```
backdrop  (-10)
floor     (-5)
ball      ( 0)
tap-fx    ( 5)   ← brief expanding ring at tap point on successful tap
hud       (10)   ← React overlay
```

No `ball-behind-net`, no `ball-behind-board`. Single ball depth — there's nothing for the ball to occlude or be occluded by. No depth-emphasis ball scaling (basketball ch.5.4) — pure 2D, ball size constant.

**Visual feedback per event:**

| Event | Feedback |
|---|---|
| Successful tap | 0.15 s expanding white ring at the tap point on the ball. Fades. |
| Missed tap (outside hitbox) | Silent. No popup, no sound. |
| Score milestone (every 10) | Score-number pulse + soft chime. |
| New personal best mid-run | "NEW BEST!" banner above score for ~1 s. |
| Floor contact | Ball freezes at floor. Fail-buzzer sound. Dim overlay: `GAME OVER · Score N · Best M · [Play Again]`. |

---

## Sound

Per playbook ch.8 — Web Audio synthesis, `safeAudio` wrapper around every `play*` export from day one (basketball lesson: unwrapped audio throws contributed to the rack-empty stuck bug).

| Sound | Synthesis |
|---|---|
| Tap on ball | Short triangle wave 600→400 Hz pitch drop, ~0.08 s. "Football thwock." |
| Score milestone (every 10) | Soft sine chime at 880 Hz, ~0.15 s. |
| New personal best | Ascending C-E-G triad, ~0.4 s. |
| Wall bounce | Triangle wave 400→300 Hz, ~0.05 s. Quiet. |
| Game over | Square wave 180→140 Hz with tremolo, ~0.7 s. Fail buzzer (basketball reuse). |

No real audio file dependencies for v0. If a richer ball-strike sound emerges as a polish item later, drop a WAV in `public/assets/audio/` and swap.

---

## Round lifecycle

```
[idle]
  ball at rest centre-ish, "TAP TO START" prompt
        │
        │ first tap registers (must be inside ball hitbox)
        ▼
[playing]
  ball in flight
  every tap inside hitbox: score++, velocity reset, spin reset
  every tap outside hitbox: silently ignored
  walls bounce, gravity pulls down, Magnus curves trajectory
        │
        │ floor contact (swept detection)
        ▼
[over]
  ball frozen at floor
  "GAME OVER · Score N · Best M · [Play Again]"
        │
        │ Play Again clicked
        ▼
[idle]
```

Three states, two transitions. No "settling" phase like basketball needed for buzzer-beaters — there's no clock.

---

## Server-authoritative model

Per `Docs/ARCADE_NEW_GAME_PLAYBOOK.md` §"Server-as-authority caveat" — the v2 escrow trusts the server to pick the legitimate winner, so the server must compute the canonical score.

```js
// server/services/games/keepie-uppies/physics.js
export function simulateRound(seed, tapEvents) {
    // Pure function: deterministic given inputs.
    // Returns { score, ballPath, terminationReason }
}
```

Inputs: `seed` (for any future randomness — currently unused but reserved for cosmetic ball drift if added later) + array of `{ tapX, tapY, timestamp }` events from the client.

Server replays the entire round step-by-step at fixed PHYSICS_DT. Increments score on each tap that lands inside the ball's hitbox at the simulated ball position. Detects floor contact. Returns canonical score.

Client renders with a mirror copy of the same physics for instant feedback. Server confirms with the canonical run. Any divergence (network jitter, lag) is resolved server-side.

This is **simpler than basketball's per-shot simulation** because keepie-uppies is one continuous trajectory rather than a sequence of discrete shots. Server processes one event log per attempt, not one simulation per shot.

---

## Open questions

Logged for resolution during build / playtest:

- **`MAGNUS_COEFFICIENT`** starting value. Need physics-research-cited starting value, then playtest tune. Range likely 0.0001 – 0.001 in our units. Lands in `PHYSICS_RESEARCH.md`.
- **`BASE_UP_M_S`** starting value. The "tap dead-centre" upward velocity. Probably ~6–8 m/s for a one-second hang time at standard gravity.
- **`LATERAL_GAIN` / `VERTICAL_GAIN` / `SPIN_GAIN`.** All set by playtest, no research source. Document each tuning step in comments per playbook ch.3.4.
- **Ball idle resting position.** Centre canvas? Bottom-third? Bottom with a small initial drop? Affects first-tap feel.
- **Score milestone interval.** Every 10? Every 25? Likely 10 for the first ~100, then less frequent (50, 100, 250, 500) to avoid clutter at high scores.
- **Best-score persistence scope.** Per-window only, or all-time across windows? Basketball's pattern is per-window for the wager + all-time for prestige.
- **Mobile haptic feedback on tap.** Cheap polish via Vibration API. Worth doing v1.
