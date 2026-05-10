# SolShot — Persistent Group-Chat Match Mode

> **Owner: FishyBoy** (sandbox/fishyboy branch)
>
> Strategic feature concept: turn SolShot into a persistent multi-day
> game that lives inside Telegram group chats. The differentiator on TG.
> Generated from John ↔ Fish brief, 2026-04-28.
>
> Status: **Spec — not yet built.** Architecture decisions captured here
> for Fish's Claude to read on session start.

---

## The pitch in one paragraph

A SolShot match that doesn't end in 5 minutes. One person in a Telegram
group chat sends `/start` to the bot — a **persistent group match** is
created. Anyone in the group can join. Players take their shots whenever
they have time. The bot posts every move back to the group as a message
("`JJ — direct hit, –75 HP. Just1Fish's turn`"). Match runs over hours
or days. Stakes can be high because there's no real-time pressure to
play poorly. Group chat audience watches the drama. Bragging rights
compound. **Trench-chat ego-wagering as a service.**

No one has done this on Telegram. Tap-to-earns are dead. Competitor
games are real-time. This is async, social, and naturally retentive
because the chat itself becomes the spectator stand.

---

## Why this is the right shape for SolShot specifically

1. **The chat IS the audience.** Every shot becomes a chat event. The
   game advertises itself with every move. Other group members see
   it, get curious, click to join. Compounding distribution.
2. **No time pressure unlocks bigger wagers.** Players will stake higher
   when they don't feel rushed. Real-time match wagering tops out at
   "an amount I'm willing to lose in 5 minutes". Async tops out at
   "an amount I'm willing to be on the hook for over a week".
3. **Async fits TG's UX.** Notifications are cheap, the user is
   already in the chat anyway. Compare to a real-time game which
   needs both players present at the same moment.
4. **Targets a known crowd.** Trench chats and whale groups are SolShot's
   highest-LTV audience. Cryo, Evo, Paulie, Kairo regulars — the people
   already comfortable burning SOL on bullshit. Build for them first.
5. **Defensible.** Once a group has an ongoing match, the chat has
   investment in the outcome. Hard to switch chats. Network-effect
   moat.

---

## Game design

### Match lifecycle

```
group: /start solshot
  ↓
bot posts: "Group match created. /join to play. /start_match when ready."
  ↓
players: /join (reply with their wager + tank color)
  ↓
3-8 players in 'lobby' (lobby is the chat itself + a Mini App link)
  ↓
host: /start_match
  ↓
bot posts: "Match BEGINS. JJ's turn. Tap to play."
  ↓
JJ: opens Mini App via deep link → fires shot → server calculates
  ↓
bot posts: "JJ fires SNIPER · direct hit on Fish · 75 HP"
  ↓
Fish gets a private TG notification: "Your turn"
  ↓
... repeat until match ends
  ↓
bot posts: "MATCH WON. Pot of 2.4 SOL → JJ. GG."
```

### Match state

- **Format**: open (3 players minimum, 8 max — could expand to 16 later)
- **Wager**: per-player stake, locked at join. Pot = sum of stakes.
- **Turn timer**: configurable per match. Default **24h per turn**, can
  be set 1h–168h (1 week). Idle timeout = forfeit.
- **Order**: by join order. Eliminated players spectate.
- **Persistence**: server-side. Survives server restart (this is the
  big technical change from current 1v1 in-memory state).

### Stakes / economy

For v1: SOL only, mirroring existing wagered modes.
For v2: SHOT-only "free roll" version (use SHOT for entry instead).
For v3: Mixed pots (SOL prize + SHOT consolation for top 3).

90/7/3 split (winner / treasury / ops) — same as 1v1.

---

## Technical architecture

### What's different from current matches

| Aspect | Current 1v1 | Group-chat mode |
|---|---|---|
| Match state | In-memory `matchStates[roomId]` | **MongoDB persistent + cached** |
| Players | Fixed at start (2) | Variable (3-8), join window |
| Turn timer | 60s | 1h–168h, configurable |
| Reconnect window | 30s | Effectively unlimited (per-turn) |
| Spectators | None | The whole TG group |
| Match end | Both eliminated or quit | Last one standing or all forfeit |
| Server restart | Match dies | Match resumes from DB |

### New persistence layer

Need a `Match` Mongoose model that stores everything currently in
`matchStates[]`:

```js
{
  matchId: String,           // unique
  type: 'group_chat',        // discriminator
  groupChatId: Number,       // TG chat to post updates to
  status: String,            // pending | active | completed | abandoned
  hostUserId: Number,        // TG user id of the player who started it

  players: [{
    userId: Number,          // TG user id
    handle: String,
    wallet: String,          // optional
    color: Number,
    hp: Number,
    isAlive: Boolean,
    pos: { x, y },
    weapons: [Number],
    consumables: { ... },
    stake: { amount, token },
  }],

  currentPlayerIndex: Number,
  turnDeadline: Date,
  turnTimerHours: Number,    // configurable

  terrain: [Number],         // heightmap snapshot
  wind: Number,
  walls: [...],              // active wall placements

  pot: {
    amount: Number,
    token: 'SOL' | 'SHOT',
  },

  history: [{                // for "tell me about move N"
    turnNumber: Number,
    playerId: Number,
    weaponId: Number,
    angle: Number,
    power: Number,
    result: { hit, damage, eliminated, ... },
    timestamp: Date,
  }],

  createdAt, startedAt, lastMoveAt, endedAt,
}
```

Indexes: `groupChatId`, `status`, `players.userId`, `turnDeadline`.

### Bot architecture changes

**Group privacy mode must be off** for the bot to see group messages.
This means:
- BotFather: `/setjoingroups` → Enable
- BotFather: `/setprivacy` → Disable (so bot sees `/join` etc.)
- All commands in groups must be invokable by `@SolShotGG_bot` mention
  to avoid command collision (Telegram convention)

New commands:
- `/start solshot` — create a group match in the current chat
- `/join` — join the active group match (with optional wager arg)
- `/start_match` — host kicks off the match (must have ≥3 players)
- `/status` — show current match state in chat
- `/abandon` — host can cancel before start

### The post-move broadcast loop

When a player fires a shot via Mini App:

1. Server processes shot (existing physics)
2. Server updates Match record in MongoDB
3. Server formats a chat-friendly summary of the move
4. Server calls `bot.telegram.sendMessage(groupChatId, summary, {...})`
5. Server schedules turn-deadline reminder (future)
6. Server sends a private message to next player: "Your turn"

Move messages need to be readable, hype-y, and short:

```
🎯 JJ fires SNIPER · direct hit
💥 -75 HP to FISH (now 25/250)
⏱ FISH's turn — 24h
```

### Turn deadline + idle handling

Use a job queue (BullMQ on Redis, or Mongoose scheduled queries via
`node-cron`) to wake up at each `turnDeadline` and:
- If player took their shot: clear timer, schedule next one
- If player idle: post "FISH timed out — forfeits turn", advance, post
  the new active player message

**Don't try to do this in-process with `setTimeout`** — server restarts
would eat all timers. Use a persistent scheduler.

### Scheduled idle reminders (v2)

Optional pleasantries:
- 6h before deadline: "Hey FISH, 6h to play"
- 1h before: "FISH, 1h. Don't lose by default."
- Configurable via `/settings`

---

## UX / mini app changes

### Match-list screen

The Mini App needs a new "ACTIVE MATCHES" screen showing all the
group matches the user is currently in. Probably reachable via:
- New menu item: `MY MATCHES`
- Or surface in Barracks (existing stats screen)

Each entry shows:
- Group chat name
- # of remaining players
- "YOUR TURN" badge if it's your move
- Pot size
- Time remaining until deadline

### "Take your turn" entry

Tapping a match entry opens directly to the battle screen for that
match. No lobby flow — you're already committed. Server loads match
state from MongoDB, renders the in-progress terrain, lets player aim
+ fire.

After firing, app returns to match list (don't auto-close — they may
have another active match to play).

### Group-chat invite flow

Sender types `/start solshot 0.05` in the group → bot replies in
the group with:

> 🎯 **GROUP MATCH**
> Stakes: 0.05 SOL each · 24h turns · Open to 8 players
>
> [JOIN MATCH] (web_app button → opens Mini App with `?startapp=gm_<matchId>`)
>
> Or reply `/join` to claim a slot.

Mini App's `gm_<matchId>` deep link → match-detail screen → "Confirm
Wager" button → escrow deposit → join. Server posts confirmation back
to chat.

---

## Wagering / escrow integration

Existing escrow program (`programs/solshot-escrow/`) is built for 1v1
with two depositors. **N-player escrow is already on launch branch
(Phase 9A core).** Group-chat mode reuses that path:

- Match creator's wager is their entry stake
- Each /join also escrows their stake
- Match starts only when all stakes are deposited
- Settle to winner at end

Edge case: a player joins, their TX fails or they walk away. Need a
deposit window (existing 5-min logic) + auto-eject if not deposited.

---

## What's in v1 vs deferred

### v1 — minimum shippable group-chat mode

- [ ] `Match` Mongoose model + persistence
- [ ] `/start solshot`, `/join`, `/start_match`, `/abandon` bot commands
- [ ] BotFather config for group permissions
- [ ] Server-side turn scheduler (node-cron acceptable; Redis later)
- [ ] Mini App entry: `?startapp=gm_<matchId>` → match-detail screen
- [ ] Match-list screen ("MY MATCHES")
- [ ] In-Match shot flow (reuse battle scene with persistent state)
- [ ] Bot posts move summary to source group on every shot
- [ ] Turn timeout = forfeit + auto-advance
- [ ] Match end → winner determined → escrow settles → bot posts result

### v2 — polish

- [ ] Per-user `/settings` mute / alert preferences
- [ ] Scheduled "your turn" reminders (1h / 6h before deadline)
- [ ] Funny elimination images (buybot-style PNGs)
- [ ] Spectator chat reactions ("👀" reaction triggers a leaderboard mention)
- [ ] Discord variant
- [ ] Per-match landing page (`solshot.gg/m/<matchId>` for non-TG share)

### v3 — bigger swings

- [ ] Tournament mode (multiple linked group matches)
- [ ] SHOT-only free-roll version
- [ ] Configurable maps (volcanic / desert / arctic) per match
- [ ] Replay-share — exportable PNG of the full match arc

---

## Risks / open questions

1. **TG group permission UX**: groups using a privacy-restricted bot
   require admin approval. Need a clear "add the bot to a group" flow
   with one-click setup link (`t.me/SolShotGG_bot?startgroup=<token>`).
2. **Notification fatigue**: if a 6-player match generates 6 chat
   messages per turn, that's 50+ messages a day. `/settings` mute
   options are essential. Could batch ("3 moves just played, click for
   summary").
3. **Cheating via account collusion**: 4 friends in a group could
   collude to send the pot to one of them. Same risk as poker bots.
   Mitigation: detect + flag identical wallet patterns; rely on social
   reputation (it's a public chat).
4. **Settlement when groupChat is deleted**: if the chat is deleted
   mid-match, what happens? Auto-refund all stakes after a 24h
   no-activity window.
5. **Server-side cost**: persistent matches mean MongoDB writes per
   shot, scheduled wake-ups for every active match. Currently
   negligible (small player base) but plan for this when scaling.
6. **Cold-start a match**: how does player 3 join without seeing the
   match? They need to be in the chat already. So this is *only*
   for groups, not 1:1 DMs. Document clearly.

---

## What Fish should do first (suggested ordering)

1. **Read this doc + `Docs/internal/PROJECT_BRIEF.md` + recent comms log entries**
2. **Write a 1-paragraph "decisions and tradeoffs" entry** in
   `Docs/internal/CLAUDE_COMMS.md` so John knows what's been internalised
3. **Build the Match Mongoose model** — pure server-side, no UI yet
4. **Build a `/start solshot` bot command** that just creates a Match
   record and posts back the join link, no game logic yet. End-to-end
   smoke test: bot creates record, deep link opens Mini App, Mini App
   reads the match by ID.
5. **Iterate from there** — `/join`, lobby, match start, etc.

The first 3-4 commits should be small and testable. Don't try to
ship the whole feature in one PR — that's how big features die.

---

## Reference: existing code that's relevant

| File | Why it matters |
|---|---|
| `server/socket-io/main.js` | Current match handling; the persistent-match equivalent will live here too (or split into a new file as it grows) |
| `server/services/physics.js` | Same physics applies. No changes needed. |
| `server/models/Challenge.js` | Reference for how I structured the Phase 3 challenge model. Group-chat Match will be similar but heavier. |
| `server/services/bot.js` | Where new bot commands live. Telegraf doc patterns are already established. |
| `server/services/challenge/challenge.js` | Reference for service layer pattern (model + helpers + render endpoints). |
| `client/src/screens/LobbyScreen.js` | Reference for waiting-room UI |
| `Docs/internal/TELEGRAM_PLAN.md` | The phased Telegram roadmap. This feature slots in as Phase 5. |

---

_Last updated: 2026-04-29. Author: main-claude (transcribing John ↔ Fish brief).
Future updates: append "## v0.2 — <date>" sections, don't edit history._

---

## v0.2 — 2026-04-29 — FishyBoy ↔ fishyboy-claude refinement

> Brainstorming session locked specific design decisions on top of v0.1.
> v0.1 above stands as the strategic framing + initial architecture.
> v0.2 below tightens scope, names the numbers, and corrects one
> material claim about the existing escrow program.
>
> Authored by `[fishyboy-claude]` with FishyBoy. Where v0.2 differs
> from v0.1, v0.2 takes precedence.

### What v0.2 changes vs v0.1

- **Player count narrowed:** 4–10 (8 default), capped at 10 for v1. v0.1 said 3–8. JJ's mobile-rendering concerns drove the revision; 16+ creates HUD problems we don't want to solve in v1.
- **Match duration model added:** host-set, max 7 days. Three presets (Sprint 12h / Weekend 3d / Marathon 7d). v0.1 had only a per-turn timer; v0.2 has both per-turn timer *and* match-level cap.
- **Match end conditions formalised:** 1-alive triggers an instant win at any time; 100%-time triggers HP-ranked finish.
- **Payout restructured:** v0.1 was winner-take-all (90/7/3). v0.2 splits the 90% player share as top-3 (60/20/10 of 80%) + survival pool (20%, split among never-eliminated players past 50% mark). Reasoning: 16-player winner-take-all is a lottery feel; top-3 keeps engagement up. Treasury 7% / ops 3% unchanged.
- **Buybacks added:** host-toggleable, escalating cost (2/3/5/8/13× original wager), 50% HP on re-entry, random respawn position, inventory preserved. Ranking penalty: buybacks rank below first-buy-in survivors. Survival bonus: forfeited permanently on first elimination.
- **Endgame trigger added:** buyback window closes at first of `75% match time` OR `≤3 players alive`. Once endgame fires, no new buybacks; remaining players fight to last-alive or 100% time cap.
- **/customgame host knobs:** 8 conversational settings — match type, wager, max players, duration, turn timer, idle penalty HP, buybacks on/off, buyback cap.
- **Free mode added:** wagered is the default but hosts can create free matches. Critical for adoption in non-crypto-native group chats. Sidesteps the escrow dependency for free matches.
- **Cross-chat rule:** one match per `(wallet, chatId)` — a player in three different TG groups can be in three matches simultaneously, one per chat.
- **Idle handling refined:** lose `idle_penalty` HP + skip turn (configurable, default 20 HP). 3 consecutive misses = auto-forfeit (always-on, fixed at 3, not a host knob). HP→0 from idle damage = full elimination.
- **Chat-event tiers:** v0.1 broadcasts every shot. v0.2 introduces a 4-tier filter — silent / text / flair / big-moment-with-sticker — to prevent the notification fatigue v0.1 flagged as a v2 risk. Per-shot text recap deferred to a `verbose: true` host toggle in Phase 2.
- **Mini App UX:** turn-start camera sequence (full-map zoomed-out → smooth zoom-in to active player), always-visible mini-map, eliminated-player spectator mode. Multi-match home screen (player can have N concurrent matches across chats).
- **MAJOR CORRECTION — escrow:** v0.1 stated "N-player escrow is already on launch branch (Phase 9A core). Group-chat mode reuses that path." This is **incorrect** based on a read of `programs/solshot-escrow/src/lib.rs`. The current program has six hard blockers for group mode (see "Escrow v2 required" section below). Escrow v2 is required and JJ has verbally agreed to undertake it.

### Locked decisions table

| Dimension | v0.2 lock |
|---|---|
| Player count | 4–10 (8 default), v1 cap at 10, one match per chat × wallet |
| Match duration | Host-picked: Sprint (12h) / Weekend (3d) / Marathon (7d), max 7 days |
| Format | Single-life elimination, no rounds |
| Match end | 1-alive instant **OR** 100%-time HP rank |
| Endgame trigger | First of: 75% match time **OR** ≤3 alive — closes buyback window |
| Payout (player 90%) | Top-3 split: 60/20/10 of 80% (43.2% / 14.4% / 7.2% of total pot) + Survival pool: 20% of player share split equally among never-eliminated players past 50% mark |
| Treasury / Ops | 7% / 3% (unchanged from existing modes) |
| Buyback cost | Escalating: 2× / 3× / 5× / 8× / 13× of original wager |
| Buyback HP / spawn / inventory | 50% HP, random open position, weapons + Gold preserved |
| Buyback window | Open until first of: 75% time, ≤3 alive |
| Buyback cap | Host-set: 1 / 3 / Unlimited |
| Buyback survival impact | Forfeits survival pool eligibility permanently |
| Idle penalty | Configurable HP loss + turn skip (default 20 HP) |
| Idle auto-forfeit | 3 consecutive misses = elimination (always-on, fixed at 3) |
| Free mode | Supported in v1 |
| Late join | Not allowed in v1 |
| Lobby start triggers | Full / host `/startmatch` (with min ≥4) / 24h auto-expire |
| Chat experience | 4-tier event filter + sticker library (v1) |
| Server-rendered cards | Deferred to Phase 4 polish |
| Per-shot text recap | Deferred — `verbose: true` host toggle in Phase 2 |

### Tiebreaker rules (for 100%-time end + 2nd/3rd determination)

In order:
1. Alive players above eliminated players (always)
2. HP descending (alive players)
3. Buyback count ascending (fewer = better — first-buy-in survivors rank above buybacks)
4. Elimination order (later = better — alive treated as "not yet eliminated" = top)
5. Damage dealt descending (final tiebreaker)

### `/customgame` rules surface

8 conversational knobs prompted in sequence by the bot. Defaults shown.

| # | Knob | Options | Default |
|---|---|---|---|
| 1 | Match type | Free / Wagered | Wagered |
| 2 | Wager amount (if wagered) | 0.01 / 0.05 / 0.1 / 0.5 / custom | 0.05 SOL |
| 3 | Max players | 4 / 6 / 8 / 10 | 8 |
| 4 | Duration | Sprint / Weekend / Marathon | Weekend |
| 5 | Turn timer | 4h / 12h / 24h | 12h |
| 6 | Idle penalty HP | 10 / 20 / 30 | 20 |
| 7 | Buybacks | Enabled / Disabled | Enabled |
| 8 | Buyback cap (if enabled) | 1 / 3 / Unlimited | 3 |

Fixed (not host-exposed in v1): `min_players_to_start = 4`, lobby auto-expire at 24h, buyback cost schedule, 3-miss forfeit threshold, endgame triggers, map biome (random), public lobby.

### Bot UX additions to v0.1

**Lobby card** — single self-updating message in the group chat:

```
🎮 Match #5G7K — open
Wager: 0.05 SOL  |  Max: 8 players  |  Weekend (3d)
Turn timer: 12h  |  Idle penalty: 20 HP  |  Buybacks: enabled (max 3)

Players (1/8): @alice
                                        ⏱ Lobby closes in 23h 47m

[ Join ]    [ Cancel — host only ]
```

- **Free match join** → 1-tap, uses TG username as callsign. No Mini App detour.
- **Wagered match join** → opens Mini App at `?startapp=lobby_<matchId>` for the deposit signing flow.
- **Self-leave** button per-player (refund + opens slot).
- **24h auto-expire** — starts if min_players reached, otherwise auto-cancels and refunds all.

**Buyback DM** to eliminated player (private, not in group):

```
💀 You've been eliminated in Match #5G7K (Bonk Squad)
Want back in?

Cost: 0.10 SOL (2× wager) | HP on respawn: 50/100
Window closes: 75% match progress OR ≤3 alive (currently 6 alive, day 1 of 3)

[ Buy back — 0.10 SOL ]   [ No thanks ]
```

**Chat event tiers:**

| Tier | Trigger | Posts to chat |
|---|---|---|
| Silent | Miss / glancing hit (<10 HP), wall placement, utility weapon | Nothing |
| Text | Solid hit (10–35 HP), turn ping, daily heartbeat | One-liner |
| Flair | Big hit (35–60 HP), comeback shot (firer <30 HP), opponent KO'd | One-liner + emoji |
| Big moment | Massive hit (60+ HP), multi-kill, final blow, buyback re-entry, leader eliminated, match-end | Sticker / GIF + caption |

Sticker library — pre-made set of ~15–20 reaction stickers/GIFs commissioned as part of group mode rollout. Bot picks based on event type. **This retroactively gives Q-005 (sticker pack) a real product reason; Q-009 formalises the commission ask.**

### Mini App additions to v0.1

- **Multi-match home screen** — list of all active group matches (across chats) for the current wallet. Per-row: chat name, match ID, status (your turn / waiting / eliminated), pot, time left.
- **Turn-start camera sequence** — Mini App opens to full-map zoomed-out view, smooth zoom-in to active player's tank over ~1.5s, then turn UI fades in. Pinch / scroll to pan freely. Mini-map widget always visible (top-right corner).
- **Spectator mode** — eliminated players can open the match, view the live battlefield, mini-map, standings panel, last-shot replay. No fire button, no input.

### Server architecture refinements

**Match state schema** (Mongoose model, extends v0.1's schema):

```js
{
  matchId, chatId, hostWallet,
  state: "lobby" | "active" | "settled" | "cancelled",
  config: {
    type: "wagered" | "free",
    wagerLamports, maxPlayers, minPlayers,
    durationMs, turnTimerMs, idlePenaltyHp,
    buybacksEnabled, buybackCap,
  },
  createdAt, startedAt, lobbyExpiresAt, endsAt,
  players: [
    {
      wallet, tgUsername, callsign, tankColor,
      hp, eliminated, eliminatedAt,
      buybackCount, missedTurns, damageDealt,
      depositTx, buybackTxs, survivalEligible,
    },
    ...
  ],
  currentPlayerIndex, turnNumber, turnStartedAt,
  terrainSnapshot, walls, wind,
  lobbyMessageId,                  // for in-place lobby card editing
}
```

**Persistence pattern:** checkpoint to MongoDB after every state-mutating event (deposit, fire, elimination, buyback, idle penalty, turn pass). On server boot, load all matches in `lobby` or `active` state, re-instantiate turn timers from `turnStartedAt + turnTimerMs`. Handle "server was down longer than a turn timer" by retroactively applying missed-turn penalties on boot.

**Scheduler:** v0.1 suggested BullMQ on Redis. v0.2 endorses this if Redis is already in stack — otherwise `node-cron` polling MongoDB for `turnDeadline < now` is acceptable for v1 scale. Decision depends on existing infra (`@johnk` to confirm).

**Cross-mode rules:** match state keyed by `(wallet, chatId)`. A wallet can be in N concurrent group matches (one per chatId) plus N concurrent standard 1v1/3P/4P matches (in-memory, independent).

### Escrow v2 — required new program

The current escrow program (`programs/solshot-escrow/src/lib.rs`) cannot support group mode. Six hard blockers:

| # | Current constraint | Group mode needs |
|---|---|---|
| 1 | `players: [Pubkey; 4]`, `max_players` capped at 2–4 | Variable up to 10 |
| 2 | `deposits_mask: u8` bitmap, `AlreadyDeposited` error blocks re-deposits | Multiple deposits per player (buybacks) |
| 3 | Single `wager_lamports` field | Variable amounts (escalating buybacks) |
| 4 | `settle_match(winner: Pubkey)` is single-recipient | Top-3 + survival pool = multi-recipient |
| 5 | `SETTLEMENT_TIMEOUT_SECONDS = 3600` (1h after activation) | Up to 7d + buffer |
| 6 | `PERMISSIONLESS_RECLAIM_TIMEOUT = 1200` (20min) | At least 7d + 48h |

**v2 required capabilities (proposed for JJ):**

- Variable player count via `Vec<Pubkey>` or per-player PDAs
- Deposit history per player (`Vec<Deposit { amount, type: Initial | Buyback(n), timestamp }>`)
- Total pot tracked on-chain (summed)
- Configurable settlement deadline at match-creation time (`activation + duration + buffer`)

**Required instructions:**

| Instruction | Purpose |
|---|---|
| `create_match` | Server creates escrow PDA. Accepts `match_id`, `wager_lamports`, `players`, `duration_seconds`, `buyback_enabled`, `buyback_cap`. |
| `deposit_initial` | Player deposits initial wager. Match activates when full or host-triggered with min met. |
| `deposit_buyback` | Player deposits escalating-cost buyback. Validates schedule (2/3/5/8/13× × wager) against `buyback_count`. Validates window not closed. |
| `settle_match` | Authority distributes pot: 1st (43.2%), 2nd (14.4%), 3rd (7.2%), survival pool (18% / N_eligible each), 7% treasury, 3% ops. Server provides ranking; program validates math against pot. |
| `cancel_match` | Authority cancels in `Lobby` state. Refunds initial deposits. |
| `permissionless_reclaim` | Anyone can trigger refund after `endsAt + 48h`. Caller earns rent. |
| `start_with_depositors` | Authority starts match with partial roster after lobby expires. |

**v1 program fate:** Existing 1v1/3P/4P matches continue on v1. v2 is group-mode-only initially. Future migration is a separate effort.

**Settlement edge cases needing `@johnk` rulings (Q-008):**
- Survival pool with 0 eligible (everyone eliminated past 50% mark) — roll to 1st place or to treasury?
- Tiny match with no clear 2nd/3rd (4 players, only 1 alive at end) — roll unallocated shares to 1st or to treasury?

### Phased rollout

**Phase 1 — gameplay foundation (free mode only, no escrow dependency)**
- Server: persist match state in MongoDB, restart resilience
- Server: extend N-player engine to 10 players (terrain, HP bars, turn rotation already scaffolded for 4P)
- Client: camera-pan + mini-map widget on BattleScreen, turn-start zoom sequence
- Client: multi-match home screen
- Bot: `/customgame` flow, lobby card, turn pings, chat tiers (sticker library or text-only fallback)
- Test in real TG groups with **free mode only**

Definition of done: 8-player free Weekend match runs to completion in a real TG group with idle penalties, eliminations, no buybacks, determined winner.

**Phase 2 — escrow v2 + wagered mode**
- JJ designs and ships escrow v2 (separate Anchor program, new program ID)
- Server: wire wagered match creation → v2 program
- Client: deposit flow in lobby join
- Server: settlement on match end (multi-recipient payout)
- Devnet testing with real wagers

**Phase 3 — buybacks**
- Server: buyback eligibility tracking, window enforcement, cost escalation
- Bot: buyback DM flow with inline button
- Client: buyback deposit signing in Mini App, re-spawn handling

**Phase 4 — polish & growth**
- Server-rendered cards (match-start lineup, match-end summary, daily heartbeat)
- `verbose: true` host toggle for per-shot text recap
- Match-summary share card for winners
- Cross-chat referral hooks

### Circle-back items (deferred from v1)

- Server-rendered cards for match-bookend events
- `verbose: true` per-shot text recap host toggle
- 12+ player support (HUD redesign required)
- Late-join feature
- Tournament integration (Phase 11 territory)
- AI player fill for under-min lobbies (reuse `server/services/ai.js`)

### Open questions added (Q-006 through Q-009)

See `Docs/internal/OPEN_QUESTIONS.md`:
- **Q-006** — bot config flip (`/setjoingroups Disable → Enable`) and `/setprivacy` posture decision
- **Q-007** — formal commitment to escrow v2 design + ship
- **Q-008** — settlement edge cases (0 survival-eligible, no 2nd/3rd in tiny matches)
- **Q-009** — sticker library commission (now load-bearing for group mode v1)

Q-006 and Q-007 are blocking for Phase 1 implementation begin.

---

_v0.2 last updated: 2026-04-29. Author: fishyboy-claude (transcribing FishyBoy ↔ fishyboy-claude design lock)._
