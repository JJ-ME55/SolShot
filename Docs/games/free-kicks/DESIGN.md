# Free-Kick Madness — Game Design v0.1

The third game on the SolShot arcade. First-person endless free-kick shooter. Curved-swipe input bends the ball around a defensive wall into an open goal. Targets in the goal mouth reward placement and risk-taking. Personal-best leaderboard model, time-windowed wagers, floodlit-stadium aesthetic.

---

## Concept

Player stands behind a dead ball, looking down the pitch at a floodlit stadium goal. A wall of defenders blocks the most direct route. **There is no goalkeeper** — the rest of the goal is open. The challenge is lifting and bending the ball over or around the wall, on target, ideally through a bonus zone inside the goal.

Each shot, the goal mouth shows targets overlaid on it: a `+10` target every shot, plus a ❤️ target on roughly 1-in-5 shots. The player chooses where to aim based on the layout. Score the goal anywhere = 1 point. Score through the `+10` zone = 11 points (1 for the goal + 10 bonus). Score through the ❤️ zone = 1 point and one life back (capped at 5).

The player has **5 lives**. Misses (wall block, off-target, post-rattle) cost a life. Run ends at 0 lives. Highest single-run score during the window is the leaderboard entry. Pot pays the leader at the window deadline (1 / 2 / 4 / 7 days, set by lobby host).

No fixed match length. No turns. Players grind their best run at their own pace within the wager window.

---

## Perspective + camera

First-person fixed camera. Same POV model as Basketball Hoops — empirical linear `K(z)` projection inherited from `scene.js`. Player looks down the pitch from behind the ball. The ball sits in the foreground. The wall + goal sit in the mid-to-far distance. Camera does not move during a shot. Camera does not rotate between shots even when the angle changes — instead, the scene re-renders with the ball offset laterally to simulate the oblique kick position.

---

## Input — the curved swipe

This is the headline mechanic. A single gesture encodes three values: **power**, **launch direction**, and **spin (curl)**. The shape of the swipe — not just the start and end — determines curl.

### Mobile — curved touch flick

- Finger down anywhere in the lower kick zone.
- Drag in any path (straight, banana, hook, S-curve — the path itself matters).
- Finger up = ball fires immediately.
- **Power** = total path length of the swipe. Mapped: baseline + linear (no zero-power dead zone), same model as basketball.
- **Launch direction (horizontal + vertical)** = vector from swipe start to swipe end.
- **Spin / curl** = signed deviation of the swipe path from the straight-line start→end vector. A swipe that bows rightward = right curl (banana shot bending right). Left bow = left curl. Straight swipe = no spin.

### Desktop — curved mouse drag

- Click-drag from the ball. The cursor path is sampled the same way as the touch path; release = fire. Same three values extracted from the same gesture.

### On-screen affordance

- Faint "shooter's square" guide in the swipe zone (basketball playbook §4.5).
- Live trail rendered during the swipe so the player can SEE the curl they are inputting.
- Optional dotted trajectory preview that updates as the gesture evolves (TBD — playtest call).

### Tunables

- `LATERAL_AIM_SENSITIVITY` = 0.6–0.7 (carried from basketball playbook §6.3).
- `SPIN_SENSITIVITY` — new, research-target, NOT a guess. Calibrated against the real Magnus coefficient + playtest feel.

---

## Physics

Free-kick physics introduces **Magnus force** as the new frontier. Basketball did not need it. Without Magnus, this game does not work.

### Classical model

```
F_drag    = -0.5 * ρ * A * Cd * |v| * v
F_magnus  =  0.5 * ρ * A * Cl * |v|² * (ω̂ × v̂)
F_gravity =  (0, -m*g, 0)
```

where:
- ρ = air density (1.225 kg/m³ at sea level)
- A = ball cross-section (πr², regulation r = 0.11 m → A ≈ 0.038 m²)
- Cd = drag coefficient (~0.25 at free-kick speeds — needs cited source)
- Cl = lift coefficient, function of spin parameter Sp = (r·ω)/v
- m = ball mass (regulation 0.43 kg)
- g = 9.81 m/s²

### Reference values (from research, NOT guessed)

| Quantity | Value | Source |
|---|---|---|
| Ball mass | 0.43 kg | FIFA regs (410–450 g) — midpoint |
| Ball radius | 0.11 m | FIFA regs (21.5–22.5 cm dia) — midpoint |
| Ball Cd | ~0.25 | Citation TBD in `PHYSICS_RESEARCH.md` |
| Ball Cl | function of Sp ≈ 0.15–0.30 | Citation TBD |
| Real free-kick speed | 25–35 m/s | Bray & Kerwin, Beckham/Carlos studies |
| Real spin rate | 7–10 rev/s | Same |
| Wall distance | 9.15 m (10 yards) | IFAB Laws of the Game |
| Goal dims | 7.32 m × 2.44 m | IFAB |

These all go into `PHYSICS_RESEARCH.md` with citations before any constants file is written.

### Integration

Euler step with prev-state capture (playbook §10.2). Each step:

1. `prev_pos = pos; prev_vel = vel`
2. Compute `F_drag + F_magnus + F_gravity`
3. `vel += (F/m) * dt`
4. `pos += vel * dt`
5. Decay spin: `ω *= (1 - SPIN_DECAY * dt)`
6. Swept collision check against wall AABBs, post cylinders, crossbar cylinder, goal-line plane

### Determinism

`simulateShot(shotInputs, attemptSeed, shotIndex)` is a pure function. Server validates client trajectory. Client renders the server's authoritative trajectory.

---

## Game loop

### Single-shot sequence

1. **Setup phase** displays the shot scenario:
   - Distance: 18 / 20 / 22 / 24 m (set by current escalation tier).
   - Angle: centre / oblique L / oblique R (picked from current tier's pool, seeded).
   - Wall size: 3 / 4 / 5 / 6 defenders (set by escalation tier).
   - Targets in goal mouth:
     - `+10` target — always present, placed in scoring area (never overlapping wall hitbox).
     - ❤️ target — present on ~20% of shots, seeded per shot index.
     - If both present, spawned non-overlapping in distinct quadrants of the goal mouth → forced choice.
2. **Aim phase** — player swipes / drags. Live trail visualises the gesture.
3. **Release** — ball fires. Server simulates trajectory.
4. **Resolution** — outcome resolves:
   - **GOAL** — ball crosses goal-line plane within frame, no wall hit. +1 point.
   - **GOAL + `+10`** — same as GOAL, plus ball crosses through `+10` target hitbox during plane crossing. +11 points total.
   - **GOAL + ❤️** — same as GOAL, plus ball crosses through ❤️ target hitbox. +1 point AND +1 life (capped at 5).
   - **BLOCKED** — ball hit a defender in the wall. -1 life. Miss-type popup: "BLOCKED!"
   - **OVER** — ball cleared crossbar. -1 life. Popup: "OVER!"
   - **WIDE** — ball outside left/right post. -1 life. Popup: "WIDE!"
   - **POST** — ball struck woodwork. -1 life. Popup: "POST!" with a satisfying clank SFX.
5. **Play Again** appears when lives > 0, else **Run Over** screen with score + leaderboard rank.

### Lives

- Start: 5
- Max: 5
- Hearts in-goal restore one life, capped at the max.

---

## Scoring

Per-shot points:

| Outcome | Points | Life change |
|---|---|---|
| GOAL (plain) | 1 | 0 |
| GOAL through `+10` | 11 | 0 |
| GOAL through ❤️ | 1 | +1 (cap 5) |
| GOAL through both `+10` AND ❤️ | 11 | +1 (cap 5) |
| BLOCKED / OVER / WIDE / POST | 0 | -1 |

(The "GOAL through both" case is possible if the ball crosses through both target zones on its way in. Rare but legal.)

Run-level scoring:

- Run score = sum of per-shot points.
- Leaderboard entry = best run score within the wager window.

---

## Difficulty ramp

Difficulty escalates based on **goals scored** (not attempts — playbook §7.2 lesson — escalation triggers on successful play, not on lives spent).

| Goals scored | Wall size | Distance (m) | Angle pool |
|---|---|---|---|
| 0 – 2 | 3 | 18 | centre only |
| 3 – 5 | 4 | 20 | centre, ±15° |
| 6 – 9 | 5 | 22 | centre, ±15°, ±25° |
| 10+ | 6 | 24 | centre, ±15°, ±25° |

Per-shot angle and distance within a tier are picked from a seeded per-shot RNG so the run is reproducible (server can verify).

Wall size is a step function of goal count — when the player's goal count crosses a tier boundary, the next shot uses the new wall size.

---

## Target placement

`+10` target (every shot):
- Spawned at a position picked from the available scoring area inside the goal mouth.
- Bias: ~70% of spawns in corner regions (top-L, top-R, bot-L, bot-R), ~30% in central / mid regions.
- Size: ~0.6 m × 0.6 m (roughly 25% of goal height).
- Never overlaps the wall's silhouette projected onto the goal plane — placement must guarantee at least one feasible trajectory exists.

❤️ target (~20% of shots, seeded):
- Same size, same placement rules.
- When co-present with `+10`, spawned in a distinct quadrant — forced choice between the two.
- Spawn rate: independent 20% roll per shot, seeded by `attemptSeed + shotIndex` so leaderboard runs are reproducible.

---

## Art direction — pro stadium / floodlit

This game departs from the basketball streetball aesthetic. Each SolShot arcade title has its own visual identity. Free-kicks is the **pro / glamour moment**: Beckham, Roberto Carlos, Ronaldinho energy.

**Setting:**
- Night match in a packed stadium.
- Floodlights with lens flare; light haze in the air.
- Real-pitch green, white markings (penalty area arc visible from this side of the pitch).
- Goal with real netting (white).

**Defenders (the wall):**
- Full kit, numbered shirts. Two kit colours alternate across shots so the wall doesn't look like one blob.
- Realistic body proportions — they fully cover the lower part of the goal mouth from the ball's POV.
- Static pose: arms folded over groin, eyes on the ball, slight crouch. No animation in v1.

**Crowd:**
- Silhouetted in the stands behind the goal.
- Subtle animation: a slow ripple of pixel motion to suggest a living crowd. No individual faces in v1.

**Ball:**
- Modern football pattern (icosahedral panels), white with black accents.
- Depth-emphasis scaling (playbook §5.4) — 2× scale at ball-launch, ramping down to 1× as it travels away.

**Targets:**
- `+10` — gold disc with the "+10" embossed.
- ❤️ — red heart, slight pulse animation to draw the eye.
- Both float in the plane of the goal mouth, visible through the netting.

Detailed asset prompts go in `ART_PROMPTS.md` (TBD).

---

## Server / client architecture

Same pattern as basketball:

- **Client** owns input capture, gesture path sampling, scene rendering, audio.
- **Client** sends `{ attemptId, shotIndex, gestureSamples: [{x,y,t}], distance, angle, wallSize }` to server.
- **Server** computes `{ power, launchDir, spin }` from `gestureSamples` deterministically.
- **Server** runs `simulateShot()` — Euler integration with Magnus + drag + gravity, swept collision against wall / posts / crossbar / goal plane.
- **Server** returns `{ result, points, livesAfter, trajectoryPath, targetHit: { plus10: bool, heart: bool }, runEnded }`.
- **Client** plays back the trajectory and resolves the visual outcome to match the server.

Server is the source of truth. Determinism guaranteed by `attemptSeed + shotIndex`.

---

## SFX

Per playbook §8, all wrapped in `safeAudio` with lazy AudioContext init.

- `whoosh` — ball release.
- `wallBlock` — ball hit defender (muffled thud).
- `post` — ball hit woodwork (satisfying metallic clank).
- `net` — ball hit net (clean ripple).
- `crowdRoar` — goal scored (real WAV, swelling).
- `plus10` — +10 target hit (chime + extra crowd surge).
- `heartCollect` — ❤️ target hit (a heartbeat blip).
- `lifeLost` — life lost (descending tone).
- `runEnd` — game over (final whistle).

---

## Inherited from playbook (don't re-derive)

From `Docs/BALL_GAMES_PLAYBOOK.md` (commit `1038cf1`):

- §2 — coordinate system (m/s SI units, K(z) linear projection).
- §3 — power-to-velocity baseline+linear model.
- §4.2 — swept collision detection.
- §4.6 — trajectory termination conditions + hard step-count cap.
- §5 — visual rendering, asset alignment, depth ordering, pngjs measurement.
- §6.1 — touch-input multi-pointer trap, stale-tracking guard.
- §7 — game-design patterns (miss-type popups, etc.).
- §8 — safeAudio + AudioContext lazy-init.
- §9 — bridge pattern, standalone playtest repo + monorepo integration.
- §10 — watchdog layers, Euler-step with prev-state, per-shot determinism.

---

## What's NEW vs basketball (the real cost)

1. **Magnus force integration** — new term in the velocity update, decaying spin.
2. **Curl-from-gesture extraction** — signed perpendicular deviation of the swipe path.
3. **Wall collision** — N defender AABBs, swept.
4. **Post / crossbar collision** — cylinders, swept.
5. **Goal-line crossing detection** — plane intersection within frame bounds.
6. **Target-zone overlap** during goal-line crossing — rectangular hitbox intersection check.
7. **Targets system + life economy** — +10 / ❤️ spawn logic, seeded placement, life cap.
8. **Stadium art pipeline** — biggest visual departure; crowd + floodlight rendering.

---

## Open questions (for Fish before constants file)

1. **Wall placement angle** — when angle is oblique (±15°, ±25°), does the wall sit on the **ball→near-post line** (real-football convention) or **ball→goal-centre line** (arcade simplicity)? Real-football is more authentic but oblique shots become very different from straight shots. Recommend ball→near-post.

2. **Post hit resolution** — does "POST" cost a life or is it a freebie ("close call, try again")? Per playbook §7.4 it's clearer to keep it as a miss with a great sound.

3. **Wager window default** — same 1 / 2 / 4 / 7 day options as basketball/keepie-uppies? Assume yes.

4. **Streak bonus** — basketball had HOT STREAK at 3-in-a-row. Free-kicks could mirror with a "PERFECT WALL" bonus for 3 `+10` hits in a row. Defer to playtest.

5. **Time pressure** — basketball had an optional timed rapid-fire mode. Free-kicks are usually set pieces — does Fish want a "rapid-fire" mode for free-kicks at all, or is the dead-ball pacing the right feel? Recommend NO timed mode in v1.

---

## Effort estimate

~3–4 weeks gameplay-complete, in line with basketball's build. Magnus physics + curl-input extraction are the new costs; everything else is "apply the playbook." Stadium art could compress or stretch depending on art pipeline.

---

— fishyboy-claude, 2026-05-15
