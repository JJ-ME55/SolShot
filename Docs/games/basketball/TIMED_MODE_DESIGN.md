# Basketball Hoops — Timed Rapid-Fire Mode (design)

Replaces the original endless-retry mode. Locked in via brainstorming
session 2026-05-14 with Fish.

## Player-facing flow

1. Game opens with **4 balls in the rack** (the cabinet's ball trough).
2. **20-second countdown** — digital scoreboard timer at the very top
   of the in-canvas scoreboard, above SCORE and BEST. Starts on the
   player's **first flick** (not on load — gives a beat to orient).
3. Player flicks the **ready ball** (front of rack). The next racked
   ball slides forward to the ready position immediately.
4. **Strict 4-ball pool** — a flicked ball is gone from the rack until
   it lands and physically rolls back (the return chute). Flick all 4
   fast and you wait for returns. Real-arcade pacing.
5. Multiple balls airborne at once (up to 4).
6. **Scoring** (unchanged): swish = 2, rim-in = 1, bank-in = 1. Misses
   cost nothing — they just don't score. **No round-ends-on-miss.**
7. **Two streaks, each adds +3 s to the clock:**
   - **Makes streak** — 5 made baskets in a row → +3 s, counter resets.
   - **Swish streak** — 3 swishes in a row → +3 s, counter resets.
   - A swish feeds both. A rim-in/bank-in advances makes, resets swish.
     A miss resets both. Both can pop on one shot (a swish that's also
     the 5th make → +6 s).
   - Evaluated in **resolution order** — the counter ticks the instant
     a ball resolves, not in release order.
8. **Backboard** still ramps sway speed every 5 shots flicked.
9. **Clock hits 0** → buzzer. **Buzzer-beater rule:** balls released
   before 0:00 still count. The game enters a brief *settling* phase,
   waits for airborne balls to resolve, then shows the final score +
   best + Play Again.

## Architecture (client-only standalone build)

### Ball lifecycle — 4 ball objects, three states

Each of the 4 balls is an object with its own Phaser image sprite and
a `state` of `racked | flying | returning`.

- **`this.rack`** — queue of racked balls. `rack[0]` is the *ready*
  ball (rendered at the projected release point); `rack[1..3]` sit in
  trough slots at the bottom of the canvas. Flick = `rack.shift()`.
- **flying** — ball has a pre-computed trajectory (one `simulateShot`
  call, same as before) and plays it back. Net-catch freeze is now
  per-ball.
- **returning** — ball eases from its landing screen position back to
  the rear of the rack over `BALL_ROLL_BACK_MS`, then `rack.push()`.

Because each ball still gets an **independent pre-computed
trajectory**, the physics core (`simulateShot`) is untouched — the
timed mode just calls it N times instead of once. Ball-to-ball
collision is explicitly deferred (it would require a continuous shared
sim — see follow-up).

### Scene state

`gameState: idle | running | settling | over`, `timerEndMs`,
`timeRemainingMs`, `makesStreak`, `swishStreak`, `shotsFlicked` (drives
the backboard tier).

### Bridge state (HUD channel)

Add `gameState`, `timeRemainingMs`, `makesStreak`, `swishStreak`,
`ballsInRack`. Remove `heatCheckActive`, `awaitingShot`, `roundOver`.
Keep `score`, `bestScore`, `lastResult`, `lastPoints`.

### HUD

- **Timer** lives in the in-canvas scoreboard (scene), above SCORE/BEST,
  digital style. Streak bonuses flash a "+3 s" near it.
- React HUD keeps the result toast; the round-over modal becomes the
  timed game-over screen (final score, best, Play Again).

## Constants (client `data/constants.js`)

`GAME_DURATION_MS = 20000`, `STREAK_BONUS_MS = 3000`,
`MAKES_STREAK_THRESHOLD = 5`, `SWISH_STREAK_THRESHOLD = 3`,
`BALL_COUNT = 4`, `BALL_ROLL_BACK_MS ≈ 900`.

## Phase 4 note (JJ integration)

The server's `rules.js` / `lifecycle.js` still encode the OLD
round/heat-check model. They need a matching timed-mode rewrite when
this is integrated into the SolShot monorepo — the server becomes the
authority on timer, streaks, and per-ball scoring. The continuous
multi-ball sim needed for ball-collision would also land here.
