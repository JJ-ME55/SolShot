# Free-Kick Madness — Technical Scoping v0.1

File-by-file plan for building Free-Kick Madness on the SolShot arcade infrastructure. Based on design v0.1 + resolutions.

---

## Architecture overview

```
        ┌──────────────────────────────────────────────┐
        │ Phaser scene (client/src/games/free-kicks/)  │
        │  - first-person camera                       │
        │  - ball anchor + gesture sampler             │
        │  - renders server's authoritative trajectory │
        │  - target overlays in goal mouth             │
        └─────────────────┬────────────────────────────┘
                          │ bridge events
                          ▼
        ┌──────────────────────────────────────────────┐
        │ React state + WalletContext (existing)       │
        └─────────────────┬────────────────────────────┘
                          │ socket.io
                          ▼
        ┌──────────────────────────────────────────────┐
        │ Server services (server/services/games/      │
        │ free-kicks/)                                 │
        │  - lifecycle.js   match state machine        │
        │  - physics.js     Magnus + drag + gravity    │
        │  - rules.js       scoring + lives + targets  │
        │  - shotgen.js     seeded per-shot scenario   │
        │                    (distance, angle, wall,   │
        │                    target positions)         │
        │  - leaderboard.js best-score tracking + TG   │
        │  - resolver.js    window-deadline cron       │
        └────┬─────────────┬───────────────────┬───────┘
             │             │                   │
             ▼             ▼                   ▼
        ┌──────────┐ ┌──────────┐  ┌─────────────────────┐
        │ MongoDB  │ │ TG bot   │  │ v2 escrow           │
        │ (matches,│ │ (lobby + │  │ (createMatch /      │
        │ attempts)│ │ leader-  │  │  settleMatch /      │
        │          │ │ board)   │  │  cancelMatch)       │
        └──────────┘ └──────────┘  └─────────────────────┘
```

The bridge / socket / wallet / bot / escrow layers all already exist (and basketball + keepie-uppies already adapted them for arcade match types). We're adding the free-kick-specific game services and wiring them through.

---

## New files — client

| File | Purpose | Effort |
|---|---|---|
| `client/src/games/free-kicks/scene.js` | Phaser scene: first-person camera, ball anchor, wall + goal + post sprites, target overlays, trajectory rendering | 3-4 days |
| `client/src/games/free-kicks/input/curlSwipe.js` | Curved-swipe gesture sampler — captures `{x,y,t}` path, extracts power + launchDir + signed-curl-deviation | 2-3 days |
| `client/src/games/free-kicks/input/curlDrag.js` | Mouse equivalent — same payload from cursor path | 1 day |
| `client/src/games/free-kicks/hud.js` | Lives display (5 hearts), score, shot scenario chip (distance / angle / wall size), miss-type popups | 1 day |
| `client/src/games/free-kicks/bridge.js` | Phaser↔React state bridge — mirrors basketball pattern | 0.5 day |
| `client/src/games/free-kicks/data/constants.js` | World dims, goal dims, post/crossbar positions, ball start, gravity, air density, ball mass/radius. **Cited values only — see PHYSICS_RESEARCH.md** | 0.5 day |
| `client/src/games/free-kicks/data/sceneAssets.js` | Stadium hero image refs, wall sprites, ball sprite, target overlay sprites | 0.5 day |
| `client/src/games/free-kicks/README.md` | Per-playbook requirement — game-specific notes, gesture-log format spec for server submission | 0.25 day |
| `client/src/screens/FreeKicksScreen.js` | Top-level React screen mounting the Phaser scene | 0.5 day |

**Client subtotal: ~9-11 days** (curl-swipe sampler is the new cost — basketball's flick was straight-line, free-kicks need full path capture + curvature extraction.)

---

## New files — server

| File | Purpose | Effort |
|---|---|---|
| `server/services/games/free-kicks/lifecycle.js` | Match state machine (lobby → window-active → settled, OT handling) | 2 days |
| `server/services/games/free-kicks/physics.js` | Trajectory simulation: Euler-step with prev-state capture, F_drag + F_magnus + F_gravity, spin decay, swept collision against wall AABBs + post cylinders + crossbar cylinder + goal-plane | 3-4 days |
| `server/services/games/free-kicks/rules.js` | Scoring (1pt per goal, +10 zone bonus, ❤️ life bonus), lives accounting, run-end detection | 0.5 day |
| `server/services/games/free-kicks/shotgen.js` | Deterministic per-shot scenario generator: given `(attemptSeed, shotIndex, goalCount)`, returns `{distance, angle, wallSize, plus10Target, heartTarget?}`. Pure function. Seeded so two players with the same seed get the same scenario sequence | 1 day |
| `server/services/games/free-kicks/leaderboard.js` | Per-match best-score tracking, lead-change detection, TG broadcast trigger | 1 day |
| `server/services/games/free-kicks/resolver.js` | Scheduled job at window deadline: compute winner, handle OT rounds, call `settleMatch` | 1.5 days |
| `server/services/games/free-kicks/index.js` | Public API surface exposed to socket handlers | 0.25 day |

**Server subtotal: ~9-11 days** (physics is the headline cost — Magnus + swept-collision against multiple obstacle types is the most complex sim we've shipped.)

---

## Existing files to extend

Minimal touches — basketball + keepie-uppies already paved the way for arcade match types.

| File | Change | Effort |
|---|---|---|
| `server/services/groupchat/customgame-config.js` (or equivalent) | Add `FREE_KICKS` to game enum. Window selector (1/2/4/7 days) — same surface basketball/keepie-uppies use | 0.5 day |
| `server/services/groupchat/lobby-card.js` | Free-kicks variant of the lobby card | 0.5 day |
| `server/socket-io/main.js` (or equivalent socket handler) | Route free-kicks shot events to `services/games/free-kicks/`; route leaderboard updates back to clients | 0.5 day |
| `server/services/groupchat/winner-card.js` | Win-screen share card for free-kicks context | 0.5 day |
| `client/src/screens/MenuScreen.js` | Surface free-kicks matches in MY GAMES list | 0.25 day |
| `client/src/bridge/PhaserBootstrap.js` | Register free-kicks scene alongside basketball / keepie-uppies / artillery | 0.25 day |
| `server/services/arcade-bot/catalogue.js` (or equivalent) | Add free-kicks entry to `@TheArcadeGG_Bot` catalogue | 0.5 day |

**Existing-files subtotal: ~3 days**

---

## Database schema additions

Two new collections (mirroring basketball pattern):

**`freekicks_matches`**
```js
{
  matchId: "freekicks:abc123",
  roomId: "abc123",
  players: [{ wallet, telegramUserId, depositTxSig }, ...],
  wagerLamports: 50_000_000,
  windowStart: ISODate(...),
  windowEnd: ISODate(...),
  status: "active" | "settled" | "ot" | "cancelled",
  bestScores: { "<wallet>": { score: 14, attemptId: "...", reachedAt: ISODate(...) }, ... },
  otRounds: [ { round: 1, players: [...], scores: {...}, resolved: bool } ],
  winner: "<wallet>" | null,
  settleTxSig: "..." | null,
}
```

**`freekicks_attempts`**
```js
{
  attemptId: "...",
  matchId: "freekicks:abc123",
  playerWallet: "...",
  attemptSeed: 42, // deterministic shot scenario seed
  shots: [
    {
      shotIndex: 0,
      scenario: { distance: 18, angle: 0, wallSize: 3, plus10: {x,y,w,h}, heart: null },
      gestureSamples: [{x,y,t}, ...],   // for replay + dispute resolution
      derivedInputs: { power: 32.1, launchAzimuth: 0.04, launchElevation: 0.31, spin: 8.2 },
      result: "goal" | "goal_plus10" | "goal_heart" | "blocked" | "over" | "wide" | "post",
      points: 1,
      livesAfter: 4,
      timestamp,
    },
    ...
  ],
  finalScore: 14,
  startedAt: ISODate(...),
  endedAt: ISODate(...),
  attemptType: "regular" | "ot",
}
```

**Effort: 0.5 day** for schema + indices (`matchId`, `playerWallet`, `endedAt`).

---

## Bot / Telegram leaderboard broadcast

Inherits the basketball broadcast pattern — only the message body differs.

| File | Purpose | Effort |
|---|---|---|
| `server/services/groupchat/freekicks-leaderboard-broadcast.js` | Lead-change broadcasts; throttled; "X hours left" reminders at 50% / 80% / 95% window elapsed | 0.5 day |

---

## Tests

| File | Coverage | Effort |
|---|---|---|
| `server/services/games/free-kicks/__tests__/physics.test.js` | Trajectory math: Magnus convergence, drag at typical speeds, gravity, spin decay. Collision edge cases: wall AABB swept hits, post cylinder grazes, crossbar swept, goal-plane crossing with target-zone overlap | 1.5 days |
| `server/services/games/free-kicks/__tests__/shotgen.test.js` | Deterministic per-seed scenarios, wall-size step function, angle/distance tier transitions, target placement constraints (no overlap with wall projection) | 0.5 day |
| `server/services/games/free-kicks/__tests__/rules.test.js` | Scoring, life accounting, life cap at 5, run-end on lives=0 | 0.5 day |
| `server/services/games/free-kicks/__tests__/lifecycle.test.js` | State transitions, deposits, window resolution, tiebreaker → OT | 1 day |
| `server/services/games/free-kicks/__tests__/leaderboard.test.js` | Lead-change detection, broadcast throttling | 0.5 day |
| Devnet E2E manual test | 2 players, real wallet deposits, full window, settle on chain | 1 day |

**Tests subtotal: ~5 days**

---

## Art / assets

The biggest swing variable in the timeline. **Stadium art is more ambitious than basketball's streetball court.**

Assets needed for v1:

- **Stadium hero background** — floodlit night sky, packed crowd silhouettes in stands behind goal, light flares, atmospheric haze.
- **Pitch surface** — green with white markings (penalty area arc visible from this POV).
- **Goal frame + netting** — proper netting, slight transparency.
- **Wall defender sprites** — at minimum two kit colours; full body; static pose with arms folded. ~4 sprite variants so a 6-defender wall isn't visually repetitive.
- **Football sprite** — modern panel pattern, white with black accents. Depth-emphasis scaling.
- **Target sprites** — `+10` gold disc, ❤️ red heart with pulse animation.
- **HUD elements** — lives (5 hearts), score, scenario chip (distance / angle / wall-size badge).
- **Live swipe trail** — visual feedback during gesture (curved line that fades).

| Option | Effort | Quality | Cost |
|---|---|---|---|
| DALL-E (per playbook §11) + Photoshop cleanup | 3-4 days | High | Subscription |
| Midjourney + cleanup | 2-3 days | High | Subscription |
| Fiverr / artists guild | 1-2 days coordination, 3-7 days delivery | Variable | $200-1500 |
| Stock packs from itch.io / OpenGameArt | 1 day | Medium | $0-100 |

**Recommended path:** DALL-E with the playbook §11 lessons (transparent backgrounds, explicit proportions, reference style transfer, no element overlap). Fish drives in parallel with engineering. **~4 days total** — stadium is harder than streetball because crowd + lighting are involved.

See `ART_PROMPTS.md` for DALL-E prompt drafts.

---

## Effort summary

| Area | Days |
|---|---|
| Client (new files) | 9-11 |
| Server (new files) | 9-11 |
| Existing files extended | 3 |
| Database schema | 0.5 |
| Leaderboard broadcast | 0.5 |
| Tests | 5 |
| Art / assets | 4 (in parallel) |
| **Total engineering** | **~27-31 days** |
| Buffer for unknowns (15%) | ~4 days |
| **Realistic ship target** | **~31-35 days from kickoff** |

Free-kicks is **modestly more work than basketball** because:
1. **Magnus physics is genuinely new** — not just "tune basketball's collision".
2. **Curl-from-gesture-shape** is more sampling + math than basketball's straight-line flick.
3. **Stadium art** has more pieces than streetball court (crowd, floodlights, kit'd defenders × 4 variants).

Mitigated by **higher inheritance** — basketball + keepie-uppies left a clean game-folder pattern for the bridge / leaderboard / lobby / bot wiring. We don't re-derive that.

---

## What's reused for free (per playbook)

- v2 escrow contract (`solshot-escrow-v2`, devnet `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`)
- Escrow wrapper (`server/services/escrow-v2.js`)
- Privy wallet stack
- TG bot framework + `@TheArcadeGG_Bot` multi-game catalogue (already supports basketball + keepie-uppies)
- Lobby card rendering + lobby state machine framework
- Share / win-card rendering (Satori server-side)
- SHOT token + prestige + cosmetics scaffolding
- Identity / callsign / referrals / leaderboard infrastructure
- All audit work (SOS / BOK / DB) on shared infrastructure
- **Empirical K(z) projection** from basketball's `scene.js` — same first-person POV
- **safeAudio + AudioContext lazy-init** from playbook §8
- **Bridge pattern** from playbook §9
- **Watchdog layers** from playbook §10

---

## What's NEW vs basketball (the real cost)

These are the parts that DON'T inherit and need original work:

1. **Magnus force integration** — new term in velocity update, plus spin decay.
2. **Curl-from-gesture extraction** — signed perpendicular deviation of swipe path from straight-line baseline.
3. **Wall collision** — N defender AABBs, swept.
4. **Post / crossbar collision** — cylinders, swept (basketball used a torus for rim, different geometry).
5. **Goal-line plane crossing** — with target-zone overlap check for bonus + life resolution.
6. **Lives economy** — basketball's "miss = end" is simpler than 5-lives + heart-refill.
7. **Stadium art pipeline** — crowd + floodlight rendering.

---

## Risks + dependencies

1. **Magnus tuning rabbit hole** — published Cd/Cl values give a starting point, but "feels right when bending around the wall" is playtest territory. Mitigation: lock the math from research first, then tune only `SPIN_SENSITIVITY` (the input→spin gain), not the physics constants. Per "no guessing" rule.
2. **Gesture-shape extraction edge cases** — palm grazes, multi-touch, super-short swipes. The playbook §6.1 stuck-bug burned 3 deploy cycles on basketball — apply the stale-tracking guard from day one.
3. **Stadium art is the timeline pivot point** — engineering can ship in 4 weeks; if stadium art slips to week 5, v1 ships flat. Mitigation: lock the DALL-E approach in week 1, run in parallel.
4. **Window-deadline cron reliability** — same risk as basketball. Mitigation: idempotent resolver + watchdog.
5. **Real-time leaderboard chat-posting spam** — same risk as basketball. Mitigation: lead-changes only + throttle.
6. **Curl visibility** — first-person POV doesn't show the curl as cleanly as a side-view would. Mitigation: live trajectory preview during the swipe + ball shadow / trail rendering during flight so the bend is unmistakable.

---

## What I'd ship for v1 vs. defer to v1.1

**Ship in v1:**
- Full game loop (setup → swipe → fly → resolve → life accounting)
- Wall + goal + targets system
- 5-life budget, heart refill, +10 bonus
- Difficulty escalation across all 3 axes
- Stadium art (single skin)
- Real-time TG leaderboard updates
- Time-windowed wager (1/2/4/7 day options)
- OT tiebreaker (sudden-death single-shot rounds)
- Devnet E2E + audit

**Defer to v1.1:**
- Stadium skin rotation (rainy night, day match, classic stadium, abstract)
- Practice / no-wager mode
- Spectator mode
- Ball cosmetics (rotation, panel patterns)
- Wall variety (different kit teams)
- Timed rapid-fire mode (only if playtest demands)
- Streak bonuses (only if playtest demands)

---

## Next docs

- `PHYSICS_RESEARCH.md` — cited Cd, Cl, Sp, ball constants. Hard prerequisite before `constants.js`.
- `BASE_HUNT.md` — open-source fork target survey. Likely outcome: build fresh, learn from refs (same as basketball).
- `ART_PROMPTS.md` — DALL-E prompt drafts for each asset, applying playbook §11 lessons.
