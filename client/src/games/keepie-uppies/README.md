# keepie-uppies — game module

Side-on 2D football juggling. Tap the ball, don't let it touch the floor, score = number of taps survived. Pure-skill leaderboard, time-windowed wager.

**Full design:** [`Docs/games/keepie-uppies/`](../../../../Docs/games/keepie-uppies/) (DESIGN, SCOPING, PHYSICS_RESEARCH, BASE_HUNT, ART_PROMPTS).

**Standalone playtest target:** https://github.com/BillionaireBonkClub/arcadegg-keepie-uppies → https://arcadegg-keepie-uppies.vercel.app

---

## Files in this directory

| File | Purpose |
|---|---|
| `constants.js` | Physics + tuning constants. Mirror of [`server/services/games/keepie-uppies/constants.js`](../../../../server/services/games/keepie-uppies/constants.js). |
| `physics.js` | Client-mirror physics — `applyTap`, `isTapInsideHitbox`, `stepPhysics`, `makeIdleBall`. `applyTap` + `isTapInsideHitbox` are byte-identical to the server. `stepPhysics` is a continuous-step variant for the live update loop (server uses `simulateRound` for canonical replay). |
| `scene.js` | `Phaser.Scene` subclass. Loads `ball.png` + `pitch.png`, manages idle/playing/over state machine, runs the live physics step in `update()` via fixed-timestep accumulator, captures `tapLog` for future server submission. |
| `README.md` | This file. |

---

## What this game inherits free (per `Docs/ARCADE_NEW_GAME_PLAYBOOK.md`)

- v2 escrow contract + `server/services/escrow-v2.js` wrapper
- Privy wallet stack (`client/src/wallet/`)
- Telegram bot + group-chat lobby flow (`server/services/groupchat/`)
- SHOT token + prestige + cosmetics
- Share cards, leaderboards, referrals (Satori-rendered)

**No edits to any of those.** All keepie-uppies code lives in:

- `client/src/games/keepie-uppies/` (this directory)
- `server/services/games/keepie-uppies/`
- `client/public/assets/keepie-uppies/` (ball.png, pitch.png)

---

## What's still to build (Phase 6 per `Docs/games/keepie-uppies/SCOPING.md`)

Currently the game runs 100% client-side with `localStorage` for best score. **Server is canonical-physics-ready but not yet wired into the lobby/escrow/leaderboard infrastructure.** What's needed:

| File | Purpose |
|---|---|
| `server/services/games/keepie-uppies/lifecycle.js` | Match state machine (lobby → active → settled). Calls `escrow-v2.js`. `matchId: keepie:<roomId>` per playbook convention. |
| `server/services/games/keepie-uppies/rules.js` | Scoring (~5 lines: `score = successful_taps`). Tiebreak logic (earlier-submitted best wins). |
| `server/services/games/keepie-uppies/leaderboard.js` | Best-score tracking per wallet per match, TG broadcast on new leader. |
| `server/services/games/keepie-uppies/resolver.js` | Cron at window deadline → pick winner → `settleMatch`. |
| Client `KeepieUppiesScreen.js` | Top-level CRA screen mounting the Phaser scene with wallet + socket.io. Modelled on `BasketballScreen.js` / `BattleScreen.js`. |
| `arcadeBot.js` catalogue entry | Add keepie-uppies to `@TheArcadeGG_Bot` game list with lobby config (2–10 players, wager amount, window 1d/2d/4d/7d). |
| Client `bridge.js` | Phaser↔React state bridge (mirror of `client/src/scenes/main/index.js` pattern). |
| Socket endpoint | Receive `tapLog` from client on game-over, run `simulateRound`, persist canonical score, update leaderboard. |

Estimate per scoping: ~3.75 days server + ~1.25 days lobby/bot + integration test = **~5 days** total to ship.

---

## Tap-log format (for server submission, Phase 6)

Client captures every successful tap during a run as:

```js
{ tapX: number, tapY: number, timestamp: number }   // metres, metres, seconds-from-attempt-start
```

On game-over, client ships:

```js
{
  matchId: 'keepie:<roomId>',
  attemptId: '<uuid>',
  seed: <number>,                  // currently 0; reserved for future use
  worldWidth: 2.0,                 // mirror of server DEFAULT_WORLD_WIDTH_M
  tapEvents: [{tapX, tapY, timestamp}, ...],
  clientScore: <number>,           // for cross-check; server replay is authoritative
}
```

Server runs `simulateRound({seed, tapEvents, worldWidth})` from `server/services/games/keepie-uppies/physics.js` → canonical `{score, terminationReason, ...}`. If `clientScore !== serverScore`, surface a "score corrected by server" toast (rare; only happens with network jitter in the tap log timing).

---

## Constants version trail

| Version | Date | Change | Why |
|---|---|---|---|
| v0.1 | 2026-05-15 | Initial physics: BALL_RADIUS=0.11 (FIFA), BASE_UP=6.0, LATERAL_GAIN=2.5, world 8m×12m | Research-cited starting values |
| v0.2 | 2026-05-15 | World 8m×12m → 2m×3m | Original world made the FIFA-spec ball 22 px on canvas / 11 px on phone — too small to read or tap |
| v0.3 | 2026-05-15 | BALL_RADIUS 0.11 → 0.33 (3x); BASE_UP 6.0 → 4.5; VERTICAL_GAIN 3.0 → 1.5 | Phone-readable ball, centre tap shouldn't fly off-screen |
| v0.4 | 2026-05-15 | BALL_RADIUS 0.33 → 0.28 (-15%) | 0.33 felt slightly too big in playtest |
| v0.5 | 2026-05-15 | BALL_RADIUS 0.28 → 0.25 (-10%); LATERAL_GAIN 2.5 → 4.0 (+60%); new no-shadow ball asset | Less forgiving — small offsets in tap position should mean bigger directional consequences |
| v0.6 | 2026-05-15 | GRAVITY 9.81 → 12.0 (+22%) | Fish wanted more pace. Cleanest single-knob: faster fall = faster cadence = snappier feel |

**Fish has signed off on the v0.6 feel.** Magnus coefficient (0.020), SPIN_GAIN (12.0), and HITBOX_RADIUS forgiveness (1.2x) haven't been explicitly playtested but Fish hasn't flagged them as issues. Revisit during Phase 6 integration testing if anything feels off.

---

## Phase 0 → 5 lessons (for the Ball Games Playbook)

1. **Phaser config-object scenes silently drop custom methods.** When you pass `{key, preload, create, update, ...customMethods}` directly to Phaser, only `init/preload/create/update/render` get bound — `startIdle`, `handleTap`, etc. are dropped unless wrapped in `extend: { ... }`. Use `Phaser.Scene` subclass to avoid the gotcha entirely.
2. **Asset proportion measurement matters even with simple sprites.** The first ball asset had a drop shadow that pulled the visible centre ~7 px below PNG centre; rotating the sprite for spin made the shadow orbit weirdly. Solution: pngjs measure → `setOrigin` to the visible centre, not PNG centre. Or: prompt the artist to omit the shadow entirely (we did both — clean asset is much better).
3. **World dimensions matter as much as asset size for screen readability.** A FIFA-spec ball at 100 px/metre renders 22 px diameter on canvas / 11 px on phone after `Scale.FIT`. Either inflate the ball OR shrink the world. Shrinking the world is cleaner because it keeps physics ratios real (Magnus, etc.) — but watch for `LATERAL_GAIN` exceeding world width per flight (causes wall-bounce chaos).
4. **Single-tap input is way simpler than basketball's drag-and-release.** Per playbook ch.6.1 the multi-pointer trap doesn't apply because every tap is a discrete event; just need a 30ms debounce against accidental double-fires.
5. **Skill-ceiling difficulty design works.** No score-driven escalation, no multi-ball, no shrinking — just constant Magnus + the player's own attention. Fish signed off after one playtest round + a few constant tweaks. Total tuning iterations: 4 (v0.3 → v0.6).
