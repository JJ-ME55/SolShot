# Basketball Hoops — Game Design v0.2

The second game on the SolShot arcade. First-person endless free-throw shooter, inspired by the classic iOS / Facebook Messenger basketball game. Personal-best leaderboard model, time-windowed wagers, streetball aesthetic.

---

## Concept

Player stands at the free-throw line. A basketball sits in front of them. They aim, throw, the ball arcs toward the hoop. Make it = score a point, get to shoot again. Miss = the round is over, score gets logged.

The player can hit **Play Again** as many times as they want during the active window. The server tracks every attempt and keeps each player's **best score** as their leaderboard entry. At the window deadline (1 / 2 / 4 / 7 days, set by the lobby host), the player with the highest best-score wins the pot.

There is no fixed match length. There are no turns. Players grind their best run at their own pace within the window. The pressure comes from watching the leaderboard move in the group chat.

## Perspective + camera

First-person fixed camera. Player POV looking down a free-throw lane at the hoop. Ball in the foreground (the thing the player is throwing). Hoop + backboard in the mid-distance. Camera does not move during a run.

## Input

Two schemes for two devices. Server receives the same payload from both: an `{angle, power}` tuple.

### Mobile — touch flick

- Ball anchored at the bottom-center of the screen
- Player puts their thumb on the ball, slides upward in a smooth motion
- Direction of slide = trajectory angle
- Speed + distance of slide = power
- Release = ball launches
- Faint dotted trajectory preview while dragging; clears on release

### Desktop — mouse aim + click

- Ball anchored at bottom-center
- Mouse cursor sits below the ball
- Cursor lateral position relative to ball center = horizontal aim
- Cursor vertical distance from the ball = power (further down = stronger throw)
- Directional arrow extends from the ball toward the cursor, length scaled with distance
- Click = shoot

## Shot mechanics

- Client sends server: `{ shotId, attemptId, angle, power, timestamp }`
- Server simulates trajectory using arc physics (gravity-only projectile)
- Server checks collision against hoop rim + backboard. Outcomes:
  - **Swish** — ball passes through hoop without touching rim. Worth 2 points (or 3 in heat check).
  - **Rim-in** — ball touches rim but goes in. Worth 1 point.
  - **Backboard bank** — ball hits backboard, deflects, goes in. Worth 1 point.
  - **Rim-out / miss / airball** — round ends. Score logged. Player sees "Play Again" button.
- Server returns: `{ result, points, heatCheckActive, trajectoryPath, attemptStatus: 'continue' | 'ended' }`
- Client renders the server's `trajectoryPath`. Server is the source of truth on whether the ball went in.

## Scoring

Per-shot points:

| Result | Points (normal) | Points (heat check) |
|---|---|---|
| Swish | 2 | 3 |
| Rim-in | 1 | 1 |
| Backboard bank | 1 | 1 |
| Miss | 0 (round ends) | 0 (round ends) |

### Heat check (speed-based)

Heat check rewards tempo + accuracy. The rule:

- Three swishes within 10 seconds of each other = **heat check activates**
- While heat check is active, every swish is worth +1 bonus (3 points instead of 2)
- Heat check stays active as long as the player keeps making swishes within 10 seconds of the last one
- Any non-swish basket (rim-in / bank) or a 10-second gap = heat check deactivates
- A miss ends the round entirely

Heat check rewards aim *and* speed. Rim-in baskets don't count toward heat check — only swishes — so it's the highest skill expression in the game.

(Exact tunings — 10 seconds, 3 swishes to trigger — are starting points. We'll calibrate during playtest.)

## Difficulty ramp

The round is endless. Difficulty escalates indefinitely.

- **Shots 1–5:** stationary hoop
- **Shots 6–10:** backboard starts moving side-to-side, slow sine wave
- **Shots 11–15:** sine wave faster
- **Shots 16–20:** faster again
- **Shots 21+:** keeps speeding up incrementally every 5 shots

Movement is deterministic from a per-attempt seed — every shot at index N in a given attempt sees the same backboard position pattern, so two players who reach shot 25 face the same backboard speed at that moment. Fair for wagered matches.

## Multiplayer flow — time-windowed wager

This is where Basketball Hoops debuts the multi-game time-windowed wager mechanic.

1. Lobby host runs `/customgame` in the TG group chat
2. Picks **Basketball** from the game list
3. Sets wager (existing presets: 0.05 / 0.1 / 0.25 / 0.5 SOL)
4. Sets window (NEW: 1 / 2 / 4 / 7 days)
5. Players tap Join in the TG lobby card, each deposits via Privy wallet
6. Window opens. Each player can take **unlimited attempts** during the window, at their own pace
7. Server records every attempt and keeps each player's **best score** as their leaderboard entry
8. Leaderboard posts to the TG group chat in real time as scores change ("@fish just took the lead with 14 — beating @jj's 12")
9. At window deadline, server picks the player with the highest best-score and calls `settleMatch(matchId, winner.wallet)`
10. Contract pays 90% to winner, 7% treasury, 3% ops — same split as SolShot

Different rhythm from SolShot. Same backend. Same wallet. Same SHOT economy.

## Win condition + tiebreaker

**Window deadline:** highest best-score wins the pot.

**Tiebreaker — sudden-death overtime:**
- If two or more players have the exact same best-score at deadline, they each play one more full attempt (an "overtime round")
- Whoever scores highest in their OT round wins
- If they tie again on OT score, repeat with another OT round
- Process keeps cycling until someone wins outright

OT rounds run as a separate `attemptType=ot` so the server can track them distinctly from the main window. Window is technically extended while OT is in progress, but only for the tied players, not for anyone who already lost.

This avoids needing a contract change to support split pots. Works with the existing v2 escrow as-is.

## Match ID format

`basketball:<roomId>` per playbook convention.

## Lobby + bot integration

Reuse the existing `/customgame` flow. New entries to add:

- Game selector: `BASKETBALL` option (alongside artillery)
- Window selector: `1d / 2d / 4d / 7d` (new — only shown when game = Basketball)
- No turn-timer / damage settings (basketball is async, not turn-based — those settings hide when game = Basketball)
- Wager + player-count selectors carry over unchanged

## Visual / vibe — streetball

Locked to **streetball** for v1. Higher art investment than SolShot — Fish wants this to look good.

Specific direction:
- Chain-net hoop on a city playground
- Concrete court with worn paint markings
- Graffiti backboard (subtle, not loud)
- Urban skyline in the background, late-afternoon golden hour lighting
- Worn leather ball with visible grain
- Slight haze / depth-of-field on the background to keep focus on the hoop

### Court skins as cosmetics (v1.1+)

The streetball court is the v1 default. Future courts ship as **cosmetic skins** in the SHOT economy, rotating in alongside other arcade features:

- Outdoor sunset court
- Indoor gym (polished wood, fluorescents)
- Arcade-abstract (geometric, neon)
- Seasonal / event courts (snow court, beach court, holiday-themed)

Court skins are visual-only. They don't affect physics, scoring, or difficulty. Same gameplay, different vibe.

## Server-authoritative caveat

The v2 escrow trusts whichever server-side process calls `settleMatch`. For Basketball:

- All physics + collision detection runs server-side
- Client renders the trajectory the server returns; never claims to have made a shot the server didn't validate
- The window-deadline scheduled job is the only thing allowed to call `settleMatch` for basketball matches
- Inputs outside reasonable bounds (negative power, angles outside `[0, 180]`, etc.) get rejected, not silently clamped

## What we won't ship in v1

- Spectator mode (watching another player's attempt live)
- Ball / hoop cosmetics beyond court skins
- Multi-distance shots (free-throw line only)
- Trick shots, behind-the-back, special moves
- Ball spin / English (gravity-only physics)
- Wind / environmental effects (deterministic difficulty only)
- Practice mode / no-wager matches (defer — could add later as a separate flow)

## v1 ship checklist

- [ ] Phaser scene at `client/src/games/basketball/scene.js` — first-person hoop view, ball anchor, flick / arrow input
- [ ] Touch flick input handler
- [ ] Mouse aim + click input handler with directional arrow rendering
- [ ] Server-side trajectory + collision at `server/services/games/basketball/physics.js`
- [ ] Heat check state machine + scoring logic
- [ ] Deterministic backboard-movement seed per attempt
- [ ] Match lifecycle at `server/services/games/basketball/lifecycle.js` (lobby → window-active → settled, plus OT round handling)
- [ ] Time-windowed wager flow added to `/customgame` bot config
- [ ] Real-time leaderboard updates to TG group chat as best-scores change
- [ ] Window-deadline scheduled job that calls `settleMatch` (with OT-resolution logic)
- [ ] Streetball court art (concept → asset pipeline → in-scene)
- [ ] At least one end-to-end test on devnet with 2 players

## Locked design decisions (from Fish, v0.2)

- ✅ **Endless per-attempt** — no shot limit. Miss = round over, log score, Play Again
- ✅ **Time-only window** — match length determined entirely by window setting (1/2/4/7 days)
- ✅ **Best-score leaderboard** — each player's best attempt is what counts
- ✅ **Unlimited attempts** per player during the window
- ✅ **Difficulty ramp** — backboard starts moving on shot 6, speeds up every 5 shots after
- ✅ **Swish bonus + heat check** — both in v1. Heat check is speed-based (3 swishes in 10s → heat check, swishes worth +1 while active)
- ✅ **Tiebreaker** — sudden-death OT attempt for tied players, repeat until decisive
- ✅ **Visual vibe** — streetball v1, court rotation later as cosmetics

## Still open (lower-stakes)

These don't block scoping. Refining in playtest is fine.

1. **Heat check tunings** — 3 swishes in 10 seconds the right trigger? Or longer / shorter / different swish count?
2. **Backboard speed curve** — linear increase every 5 shots, or accelerating curve (faster ramps as you go deeper)?
3. **Game-over reward** — does the player get any feedback on how their attempt ranked (e.g. "best run yet" / "still trails @fish's 14")?
4. **Leaderboard cadence in TG** — every score update, or only when someone takes the lead?

---

## Next docs in this folder

- `SCOPING.md` — file-by-file list of what we'll add to client/ and server/, with rough effort estimate
- `BASE_HUNT.md` — evaluation of open-source Phaser basketball games we could fork as a starting point

Maintainers: Fish (game design), JJ (engineering integration).
