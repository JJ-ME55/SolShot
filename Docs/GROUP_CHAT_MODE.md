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

1. **Read this doc + `Docs/PROJECT_BRIEF.md` + recent comms log entries**
2. **Write a 1-paragraph "decisions and tradeoffs" entry** in
   `Docs/CLAUDE_COMMS.md` so John knows what's been internalised
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
| `Docs/TELEGRAM_PLAN.md` | The phased Telegram roadmap. This feature slots in as Phase 5. |

---

_Last updated: 2026-04-29. Author: main-claude (transcribing John ↔ Fish brief).
Future updates: append "## v0.2 — <date>" sections, don't edit history._
