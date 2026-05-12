# Basketball Hoops — Technical Scoping v0.1

File-by-file plan for building Basketball Hoops on the SolShot arcade infrastructure. Based on design v0.2.

---

## Architecture overview

```
        ┌──────────────────────────────────────────────┐
        │ Phaser scene (client/src/games/basketball/)  │
        │  - first-person camera                       │
        │  - ball anchor + input handlers              │
        │  - renders server's authoritative trajectory │
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
        │ basketball/)                                 │
        │  - lifecycle.js   match state machine        │
        │  - physics.js     trajectory + collision     │
        │  - rules.js       scoring + heat check       │
        │  - backboard.js   deterministic movement     │
        │  - leaderboard.js best-score tracking + TG   │
        │  - resolver.js    window-deadline cron job   │
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

The bridge / socket / wallet / bot / escrow layers all already exist. We're adding the basketball-specific game services and wiring them into the existing infrastructure.

---

## New files — client

| File | Purpose | Effort |
|---|---|---|
| `client/src/games/basketball/scene.js` | Phaser scene: first-person camera, ball anchor, hoop, backboard, trajectory rendering | 2-3 days |
| `client/src/games/basketball/input/touchFlick.js` | Touch flick gesture detection — direction + speed → `(angle, power)` | 1 day |
| `client/src/games/basketball/input/mouseArrow.js` | Mouse aim — cursor position → directional arrow → `(angle, power)`, click to shoot | 1 day |
| `client/src/games/basketball/hud.js` | Score display, current streak, heat-check indicator, shot counter, "Play Again" button on miss | 1 day |
| `client/src/games/basketball/bridge.js` | Phaser↔React state bridge (mirrors `client/src/scenes/main/index.js` pattern) | 0.5 day |
| `client/src/games/basketball/data/constants.js` | Hoop position, ball start, gravity, scoring values, heat-check thresholds | 0.5 day |
| `client/src/games/basketball/data/courtAssets.js` | Streetball court image refs, hoop sprite, ball sprite, backboard sprite | 0.5 day |
| `client/src/games/basketball/README.md` | Per-playbook requirement — what's specific to this game | 0.25 day |
| `client/src/screens/BasketballScreen.js` | Top-level React screen mounting the Phaser scene (mirror of `BattleScreen.js`) | 0.5 day |

**Client subtotal: ~7-8 days**

---

## New files — server

| File | Purpose | Effort |
|---|---|---|
| `server/services/games/basketball/lifecycle.js` | Match state machine (lobby → window-active → settled, OT handling) | 2 days |
| `server/services/games/basketball/physics.js` | Trajectory simulation (gravity-only), collision against hoop rim + backboard, swish vs rim-in vs bank vs miss detection | 1-2 days |
| `server/services/games/basketball/rules.js` | Scoring logic, heat-check state machine (timing windows, swish-only triggers) | 1 day |
| `server/services/games/basketball/backboard.js` | Deterministic backboard movement — given `(attemptSeed, shotIndex, t)`, returns backboard position; same seed → same pattern across players | 0.5 day |
| `server/services/games/basketball/leaderboard.js` | Per-match best-score tracking, lead-change detection, TG broadcast trigger | 1 day |
| `server/services/games/basketball/resolver.js` | Scheduled job triggered at window deadline: compute winner, handle OT rounds, call `settleMatch` | 1.5 days |
| `server/services/games/basketball/index.js` | Public API surface exposed to socket handlers | 0.25 day |

**Server subtotal: ~7-8 days**

---

## Existing files to extend

These are not new — we'll add basketball hooks into existing infrastructure. Per playbook: minimal touches, no refactors.

| File | Change | Effort |
|---|---|---|
| `server/services/groupchat/customgame-config.js` (or equivalent) | Add `BASKETBALL` to game enum. Conditional window selector (1/2/4/7 days) shown only when game=basketball. Hide turn-timer + damage settings when game=basketball | 1 day |
| `server/services/groupchat/lobby-card.js` (or equivalent) | Adapt the existing lobby card to show window deadline + game name when basketball | 0.5 day |
| `server/socket-io/main.js` (or equivalent socket handler) | Route basketball shot events to `services/games/basketball/`; route leaderboard updates back to clients | 1 day |
| `server/services/groupchat/winner-card.js` | Adapt the win-screen share card for basketball context (top scorer + score + TX link) | 0.5 day |
| `client/src/screens/MenuScreen.js` (or equivalent) | Surface basketball matches in MY GAMES list | 0.25 day |
| `client/src/bridge/PhaserBootstrap.js` | Register basketball scene alongside artillery scene; route based on match game type | 0.5 day |

**Existing-files subtotal: ~3-4 days**

---

## Database schema additions

Reuse the existing MongoDB. Two new collections (or shared with existing if schema flexes):

**`basketball_matches`**
```js
{
  matchId: "basketball:abc123",
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

**`basketball_attempts`**
```js
{
  attemptId: "...",
  matchId: "basketball:abc123",
  playerWallet: "...",
  attemptSeed: 42, // deterministic backboard seed
  shots: [
    { shotIndex: 0, angle, power, result: "swish" | "rim_in" | "bank" | "rim_out" | "miss", points, heatCheckActive, timestamp },
    ...
  ],
  finalScore: 14,
  startedAt: ISODate(...),
  endedAt: ISODate(...),
  attemptType: "regular" | "ot",
}
```

**Effort: 0.5 day** for schema design + indices (`matchId`, `playerWallet`, `endedAt` likely the useful ones).

---

## Bot / Telegram leaderboard broadcast

The real-time leaderboard chat-post feature is genuinely new — SolShot doesn't have an analog.

| File | Purpose | Effort |
|---|---|---|
| `server/services/groupchat/basketball-leaderboard-broadcast.js` | Triggered by `leaderboard.js` on lead-changes; posts a TG message to the group chat. Throttled to avoid spam. | 1 day |

Broadcast cadence: every time the lead changes, plus optional "X hours left" reminder at 50% / 80% / 95% window elapsed.

---

## Tests

| File | Coverage | Effort |
|---|---|---|
| `server/services/games/basketball/__tests__/physics.test.js` | Trajectory math, collision edge cases (rim graze, backboard bank angles, airball detection) | 1 day |
| `server/services/games/basketball/__tests__/rules.test.js` | Scoring logic, heat check activation / deactivation timings, OT round handling | 0.5 day |
| `server/services/games/basketball/__tests__/lifecycle.test.js` | State transitions, deposit flow, window-deadline resolution, tiebreaker → OT | 1 day |
| `server/services/games/basketball/__tests__/leaderboard.test.js` | Lead-change detection, best-score updates, broadcast throttling | 0.5 day |
| Devnet E2E manual test | 2 players, real wallet deposits, full window, settle on chain | 1 day |

**Tests subtotal: ~4 days**

---

## Art / assets

Biggest swing variable. Approach options:

| Option | Effort | Quality | Cost |
|---|---|---|---|
| Generate via Midjourney + clean up in Photoshop | 2-3 days | High | Subscription you already have |
| Hire on Fiverr / artists guild | 1-2 days of coordination, 3-7 days delivery | Variable | $200-1500 |
| Buy stock 2D asset packs from itch.io / OpenGameArt | 1 day | Medium (less custom) | $0-50 |
| Fish builds in Figma / Procreate | 3-5 days | Custom | Time only |

Assets needed for v1:
- Streetball court background (single hero image, slight parallax layers)
- Hoop + chain net sprite
- Basketball sprite (3-4 rotation frames or one with shader-applied rotation)
- Backboard sprite (graffiti pattern)
- Power/aim arrow graphic (desktop)
- Touch-flick visual trail (mobile)
- UI / HUD elements (score, heat check indicator, "Play Again" button)

**Recommended path: Midjourney for hero court art, OpenGameArt or asset-pack for the ball/hoop/arrow. ~3 days total if Fish drives it in parallel with JJ doing engineering.**

---

## Effort summary

| Area | Days |
|---|---|
| Client (new files) | 7-8 |
| Server (new files) | 7-8 |
| Existing files extended | 3-4 |
| Database schema | 0.5 |
| Leaderboard broadcast | 1 |
| Tests | 4 |
| Art / assets | 3 (in parallel) |
| **Total engineering** | **~22-25 days** |
| Buffer for unknowns (15%) | ~3 days |
| **Realistic ship target** | **~25-28 days from kickoff** |

For a hackathon-resolution timeline (end of May / early June, ~3-4 weeks from now), this is **tight but achievable** if:
- Fish runs art in parallel with JJ doing engineering
- The base-game hunt (next doc) finds a Phaser starter that saves the projected 2-3 days
- No major design pivot during build

---

## What's reused for free (per playbook)

To make the "30% game-specific" claim concrete — these we DON'T build:

- v2 escrow contract (`solshot-escrow-v2`, devnet `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`)
- Escrow wrapper (`server/services/escrow-v2.js` — `createMatch`, `settleMatch`, `cancelMatch`)
- Privy wallet stack (`client/src/wallet/`)
- TG bot framework (`server/services/groupchat/`)
- Lobby card rendering, lobby state machine framework
- Share / win-card rendering (Satori-server-side)
- SHOT token + prestige + cosmetics framework
- Identity / callsign / referrals / leaderboard infrastructure
- All audit work (SOS / BOK / DB) on the shared infrastructure

---

## Risks + dependencies

1. **Art pipeline is the single biggest risk to timeline.** Engineering can ship in 3 weeks; if streetball art slips to week 4, the v1 ships ugly. Mitigation: lock the art approach in week 1, run in parallel.
2. **Window-deadline cron reliability.** If the resolver job fails to fire (Render restart, scheduled-job bug), matches never settle. Mitigation: make the resolver idempotent + add a retry path (a separate watchdog that checks for `status: active` matches past `windowEnd` and re-runs the resolver).
3. **Real-time leaderboard chat-posting can spam.** If 5 players each take 50 attempts in a 1-day window, that's 250 leaderboard updates. Mitigation: only post on lead-changes, plus throttled "X hours left" reminders.
4. **Bridge pattern divergence.** The playbook says use `client/src/scenes/main/index.js` as reference. If basketball's bridge needs differ materially (e.g. attempts-per-window state vs. SolShot's per-turn state), we may end up with parallel bridges that drift over time. Mitigation: keep basketball's bridge under `games/basketball/bridge.js` rather than touching the shared one.
5. **OT logic complexity.** Tiebreaker → sudden-death OT means the resolver job may not settle on first fire; it has to kick off new attempts for tied players, wait, re-evaluate. Mitigation: model OT explicitly in `basketball_matches.status` and `otRounds` so the resolver can be re-entered cleanly.

---

## What I'd ship for v1 vs. defer to v1.1

**Ship in v1:**
- Full game loop (shoot, score, miss, retry, leaderboard)
- Streetball court (single skin)
- Heat check + swish bonus + scoring
- Real-time TG leaderboard updates
- Time-windowed wager (1/2/4/7 day options)
- OT tiebreaker

**Defer to v1.1:**
- Court skin rotation (sunset, gym, abstract, seasonal)
- Spectator mode
- Practice / no-wager mode
- Ball cosmetics
- More backboard movement patterns (erratic, tilt, etc.)
- Stat tracking beyond best-score (e.g. swish %, heat-check count, deepest run)

---

## Next doc

`BASE_HUNT.md` — open-source Phaser basketball games to evaluate as a starting point. Should save 2-3 days on the scene + input layer if a good candidate exists.
