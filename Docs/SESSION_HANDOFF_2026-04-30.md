# Session Handoff — 2026-04-30 — Group-Chat Mode Phase 1

> **Author:** [fishyboy-claude] with FishyBoy
> **Status:** Phase 1 of group-chat mode is feature-complete and pushed to `sandbox/fishyboy`. End-to-end test in a real TG group did not complete — blocked by infrastructure (shared prod bot token + long-polling instability). Code is sound; dev infrastructure needs hardening before next test session.
> **Branch:** `sandbox/fishyboy` at `d6b90c8`
> **Companion docs:** [`GROUP_CHAT_MODE.md`](./GROUP_CHAT_MODE.md) v0.2 (canonical spec), [`MASTER_LAUNCH_PLAN.md`](./MASTER_LAUNCH_PLAN.md) (where this slots in), [`CLAUDE_COMMS.md`](./CLAUDE_COMMS.md) (full conversation log)

---

## TL;DR for JJ

We built the entire core game loop for group-chat mode today. Match creation, lobby joining, turn rotation, idle penalties, firing with real physics, win conditions, server-restart resilience — all of it. Pushed in 9 commits across server + client.

The code works. We smoke-tested the lobby flow (you joined and left a test match earlier) and confirmed it runs cleanly. We did **not** finish the end-to-end test that includes actual firing — we got blocked by repeated long-polling instability that comes from running our local dev server against your production bot token. Each time we hit ECONNRESET / 409 conflict / "query is too old" errors, we hard-restarted, fixed something, and a few minutes later hit another. The pattern is structural to the dev setup, not a code bug.

**What unblocks the E2E test next session:** a dedicated dev bot (separate token from prod), so my local server doesn't fight the production webhook every time the network blips or nodemon restarts.

---

## §1 · What landed today

9 commits to `sandbox/fishyboy`, ~3000 lines of code across server + client + comms:

| Commit | Slice | Files |
|---|---|---|
| `d6d423b` | **Phase 1a** — `GroupMatch` Mongoose model | `server/models/GroupMatch.js` |
| `b8645a6` | **Phase 1b** — `/customgame` wizard + lobby card + Join/Leave/Start/Cancel | `server/services/groupchat/{index,configFlow,lobbyCard}.js`, `server/services/bot.js` |
| `6c6d99b` | Quiet hours feature (host knob + math + display) | `server/services/groupchat/quietHours.js` + edits |
| `3faf5c2` | Bug fix — skip buybacks/wager steps for free matches | `server/services/groupchat/configFlow.js` |
| `0562230` | **Phase 1d-core** — lifecycle + scheduler + idle penalty + boot recovery | `server/services/groupchat/{botMessages,scheduler,lifecycle}.js`, edits to `bot.js` + `server/index.js` |
| `a0c867b` | **Phase 1c** — Mini App match-detail screen + getGroupMatch socket | `client/src/screens/GroupMatchScreen.js`, `server/socket-io/groupchat.js`, edits to `socket-io/main.js` + client `App.js` |
| `312ef62` | **Phase 1d-real** — terrain gen + Mini App fire UI + handleShot + bot post-shot recap | edits across `lifecycle.js`, `botMessages.js`, `groupchat.js` (socket), `GroupMatchScreen.js` |
| `03459ce` | Comms log entry: Phase 1 status + open asks | `Docs/CLAUDE_COMMS.md` |
| `d6b90c8` | Bug fix — `/cancelmatch` can now abandon active matches (was lobby-only) | `server/services/groupchat/index.js` |

All on `sandbox/fishyboy`. Vercel preview builds are green and reachable at `https://sol-shot-git-sandbox-fishyboy-jj-me55s-projects.vercel.app`.

---

## §2 · Feature surface — what the code does

### Bot commands (group chats only)

- **`/customgame`** — opens a 9-step conversational wizard (6 steps for free, 8 for wagered-no-buybacks). Host configures: match type, wager, max players (4–10), duration (Sprint 12h / Weekend 3d / Marathon 7d), turn timer (4h/12h/24h), quiet hours (Civilised 11pm–7am UTC / Light 1am–6am / 24/7), idle penalty HP, buybacks on/off, buyback cap (1/3/unlimited).
- **`/startmatch`** — host triggers active state. Validates min ≥ 4 players. Generates terrain, picks first player at random, schedules turn timer, posts match-start + first turn ping.
- **`/cancelmatch`** — host abandons match. Works for both lobby and active states. Clears any running scheduler timer.

### Lobby card

Self-updating message in the group. Shows match config, roster (Telegram @-mentions), expiry countdown, and four inline buttons:

- **🎮 Join** — adds the tapping user to the roster, edits the card in place
- **🚪 Leave** — removes self (host can't leave their own match — must `/cancelmatch`)
- **▶ Start match** — host-only; same effect as `/startmatch`
- **✖ Cancel** — host-only; same as `/cancelmatch`

Free matches: 1-tap join with TG username as callsign. Wagered matches (Phase 2): tap routes to Mini App for deposit signing — not yet wired since wagered ships in Phase 2.

### Active match — turn loop

When a match goes active:

1. Server picks first player at random. Posts `🎯 <b>Match #5G7K</b> — STARTED` + a turn-ping with a `🎯 Take your shot` inline button. The button URL is `t.me/SolShotGG_bot/<short-name>?startapp=match_<matchId>`.
2. Player taps it → Mini App opens at `GroupMatchScreen` (deep-link parsed in `client/src/App.js`).
3. Mini App fetches the match via `getGroupMatch` socket emit, renders roster + HP bars + (if their turn) angle/power sliders + FIRE button.
4. Player adjusts sliders, taps FIRE → emit `fireGroupShot`.
5. Server validates (`active`, current player, alive, valid weapon), runs `processShot()` from existing `physics.js`, applies damage map to player HP, marks eliminations + assigns `eliminationOrder`, deducts survival-pool eligibility if past halfway mark, awards kill credit, persists updated terrain.
6. Server posts shot summary to chat (silent < 10 HP, one-line ≥ 10, headline ≥ 60 HP, KO callout for any eliminations).
7. Server checks win condition (1 alive instant or 100% time HP rank). If not over, regenerates wind, advances to next alive player, schedules next turn timer, posts new turn ping.
8. Repeat until last alive (instant win) or 100% match duration reached (HP-rank tiebreaker chain).

### Idle penalty

If the active player doesn't fire within `turnTimerMs` (computed quiet-hours-aware via `quietHours.js` so sleepers aren't punished):

- Lose `idlePenaltyHp` HP (host-set, default 20)
- `consecutiveMissedTurns += 1`
- If `consecutiveMissedTurns === 3` → auto-forfeit (HP→0, eliminated, wager forfeited)
- If `hp ≤ 0` from idle damage → eliminated normally
- Bot posts the idle-penalty notice + (if eliminated) elimination notice
- Advance to next alive player

### Persistence + restart resilience

Match state lives in MongoDB (new `groupmatches` collection). Every state mutation (deposit, fire, elimination, turn pass, idle penalty, settlement) saves the doc. On server boot, `restoreActiveTimers()` runs after Mongo connect, before `server.listen` — scans all `state: 'active'` matches, computes each one's quiet-hours-aware turn deadline, schedules a `setTimeout`. If the deadline is already in the past (server was down longer than the timer), fires the idle-penalty handler immediately on next tick.

Tested in passing during today's restarts: log line `[group-chat] restored 1 active match timer` confirms the boot-recovery code runs.

### Settlement

- **Last alive instant win** — match ends immediately when `aliveCount ≤ 1`
- **100% time cap** — match ends when `Date.now() ≥ endsAt`, ranked by HP-then-buybacks-then-elimination-order-then-damage tiebreaker chain
- `match.rankedFinishers` is populated as an array of telegramUserIds in finishing order
- Bot posts `🏆 Match #X — COMPLETE` summary with podium (1st/2nd/3rd) and a `<i>Settlement happens via escrow v2 (Phase 2).</i>` note for wagered matches

Phase 2 will wire the actual escrow `settle_match` call. Phase 4 will push to `User.matchHistory[]` so the existing career-card pipeline picks up group-match results.

---

## §3 · File map

### New server files

```
server/models/GroupMatch.js                  - Mongoose model (252 lines)
server/services/groupchat/index.js           - Bot command + callback registration (412 lines)
server/services/groupchat/configFlow.js      - /customgame wizard state machine (430 lines)
server/services/groupchat/lobbyCard.js       - lobby card formatters (208 lines)
server/services/groupchat/quietHours.js      - pause math (UTC, wraparound-safe) (121 lines)
server/services/groupchat/scheduler.js       - turn-timer setTimeout management + boot recovery (146 lines)
server/services/groupchat/lifecycle.js       - state transitions: startMatch, handleShot,
                                                 handleIdleTimeout, advanceTurn, settleMatch (450+ lines)
server/services/groupchat/botMessages.js     - active-match chat formatters (173 lines)
server/socket-io/groupchat.js                - per-socket handlers: getGroupMatch,
                                                 getMyGroupMatches, fireGroupShot (123 lines)
```

### New client files

```
client/src/screens/GroupMatchScreen.js       - Mini App match-detail + fire UI (612 lines)
```

### Edited files (non-trivial only)

```
server/services/bot.js                       - +getBot() export, +registerGroupChatCommands wiring
server/socket-io/main.js                     - +import + per-connection registerGroupChatSocketHandlers
server/index.js                              - +restoreActiveTimers() in boot sequence
client/src/App.js                            - +lazy import GroupMatchScreen, +deep-link routing
                                                 for lobby_<id> / match_<id>, +'group-match' case
```

---

## §4 · Architecture overview

```
TG group chat
   │
   │  /customgame
   ↓
┌─────────────────────────────┐
│  bot.js (Telegraf)          │
│    └─ groupchat/index.js    │
│        ├─ handleCustomGame  │
│        ├─ handleStartMatch  │ ◄── /startmatch & ▶ button
│        ├─ handleCancelMatch │ ◄── /cancelmatch & ✖ button
│        ├─ gc_cfg_* callbacks│      (wizard step flow)
│        └─ gc_join/leave/    │
│            start/cancel     │      (lobby button taps)
└──────┬──────────────────────┘
       │ creates / mutates
       ↓
┌─────────────────────────────┐
│  GroupMatch (MongoDB)       │  ◄──── boot recovery scans for state='active'
└──────┬──────────────────────┘
       │ scheduler reads turnStartedAt + turnTimerMs
       ↓
┌─────────────────────────────┐
│  scheduler.js               │  ─ in-memory setTimeout map
│    └─ fires onTimeout       │  ─ quiet-hours-aware deadline math
└──────┬──────────────────────┘
       │ callback registered by lifecycle on import
       ↓
┌─────────────────────────────┐
│  lifecycle.js               │
│    ├─ startMatch            │  ─ generates terrain + tank positions + wind
│    ├─ handleIdleTimeout     │  ─ HP penalty + 3-miss forfeit + advanceTurn
│    ├─ handleShot            │  ─ runs physics.processShot, applies damage
│    ├─ advanceTurn           │  ─ next alive player + reschedule + post ping
│    └─ settleMatch           │  ─ ranking + match-end post
└──────┬──────────────────────┘
       │ posts to chat via getBot().telegram.sendMessage
       │ (includes 🎯 Take your shot inline keyboard with deep link)
       ↓
TG group chat ────► player taps button ────► Mini App opens ◄── short name dispatches
                                                                  to Vercel preview URL
                                                                  (or solshot.gg in prod)
       ↓
┌─────────────────────────────┐
│  Mini App (Vercel)          │
│    └─ GroupMatchScreen      │
│        ├─ emits getGroupMatch    ◄──┐ socket-io to server
│        ├─ renders roster + HP    │
│        └─ FireControls           │
│            └─ emits fireGroupShot┘
└──────┬──────────────────────┘
       │
       ↓
┌─────────────────────────────┐
│  socket-io/groupchat.js     │  ─ per-socket handlers
│    ├─ getGroupMatch         │
│    ├─ fireGroupShot         │  ─── calls lifecycle.handleShot()
│    └─ getMyGroupMatches     │
└─────────────────────────────┘
```

---

## §5 · Schema — `GroupMatch`

Located at `server/models/GroupMatch.js`. Fields you'll care about:

```js
{
  matchId,              // 4-char human-readable, e.g. "5G7K"
  chatId,               // TG group chat id (long int)
  chatTitle,            // cached at create-time for display
  hostTelegramId,       // who ran /customgame
  hostWallet,           // null on free; populated on wagered when wallet links
  lobbyMessageId,       // for in-place editing of the lobby card

  state,                // 'lobby' | 'active' | 'settled' | 'cancelled'

  config: {
    type,               // 'free' | 'wagered'
    wagerLamports,
    maxPlayers, minPlayers,
    durationMs,
    turnTimerMs,
    idlePenaltyHp,
    buybacksEnabled,
    buybackCap,         // 1, 3, or -1 for unlimited
    quietHoursEnabled,
    quietHoursStart,    // 0-23 UTC
    quietHoursEnd,      // 0-23 UTC (wraparound supported)
  },

  players: [{
    telegramUserId,     // CANONICAL identity for free mode
    walletAddress,      // populated when wagered
    tgUsername, callsign, tankColor,
    hp, eliminated, eliminatedAt, eliminationOrder,
    buybackCount, buybackHistory: [{ n, costLamports, depositTx, at }],
    survivalEligible,
    missedTurns, consecutiveMissedTurns,
    damageDealt, kills,
    initialDepositTx,
    spawnX, spawnY, currentX, currentY,
  }],

  currentPlayerIndex,
  turnNumber,
  turnStartedAt,        // for idle deadline computation

  terrainSnapshot,      // heightmap from physics.generateTerrain
  walls: [{ x, width, height, placedAtTurn }],
  wind,                 // px/s² horizontal accel

  settledAt, cancelledAt, cancelReason,
  rankedFinishers: [tgId, tgId, tgId, ...],   // populated at settlement
  settlementTx,         // Phase 2

  createdAt, startedAt, lobbyExpiresAt, endsAt, updatedAt,
}
```

Helper methods on the doc: `isEndgameTriggered()`, `isMatchOver()`, `canPlayerBuyBack(idx)`, `nextBuybackCost(idx)`. Indexes: `chatId+state`, `players.telegramUserId+state`.

---

## §6 · What was tested + passing

- ✅ Server boots cleanly with all new modules loaded
- ✅ MongoDB connection + GroupMatch collection persists
- ✅ Bot connects and replies to `/play` (existing) — confirms basic infra alive
- ✅ `/customgame` wizard renders end-to-end (you saw this in our test group)
- ✅ Wizard step counter adjusts dynamically (free=6, wagered+buybacks-off=8, full=9)
- ✅ Quiet hours wizard step + lobby-card display
- ✅ Lobby card creates, Join/Leave self-edit in place
- ✅ Host auto-joins on Confirm
- ✅ `/cancelmatch` works for both lobby and active states (after the `d6b90c8` fix)
- ✅ Boot recovery for active matches — `[group-chat] restored 1 active match timer` log confirms the code runs on restart
- ✅ Vercel preview builds green for sandbox/fishyboy
- ✅ Code is syntax-clean across all modified/new files

## §7 · What was NOT tested — blocked

Everything past the lobby flow into the actual game loop:

- ⚠ `/startmatch` + first turn ping with deep-link button (button URL produced, not user-tested)
- ⚠ Mini App open via deep link → GroupMatchScreen rendering (screen built, not user-tested)
- ⚠ FIRE button → server handleShot → physics → damage application → next turn (built, not user-tested)
- ⚠ Idle penalty firing on real timer expiry (would need to wait 4+ hours, not tested in session)
- ⚠ Win condition + match settlement (not tested)
- ⚠ Boot recovery actually re-firing a missed turn (logic exists, not exercised)

The blocker isn't code, it's **dev infrastructure** — see §9.

---

## §8 · Deferred / circle-back items

These are explicit v1 deferrals, captured here so they don't get lost:

- **Multi-match home screen** in Mini App (so a player can see all their concurrent group matches across chats — server side `getMyGroupMatches` is built, just no UI yet)
- **Quiet-hours announcements wired to scheduler** — bot posts "🌙 paused, resumes 7am UTC" when entering a quiet window (formatters in `botMessages.js`, scheduler integration not yet)
- **Lobby auto-expiry** — 24h watchdog that cancels-or-starts stale lobbies (we set `lobbyExpiresAt`, nothing acts on it yet)
- **Phase 1e — chat event tier filter + sticker library** — current chat events are text-only with damage-tier filtering; sticker library hooks are not wired (waiting on commission per Q-009)
- **Real-time push to other players' open Mini Apps** when state changes — currently they re-fetch on the next chat-ping deep-link tap. socket-io rooms could push live updates with `io.to('groupmatch:'+matchId).emit(...)` — not yet
- **Single-weapon UI v1** — only Single Shot (weaponId=0) for v1 firing. Shop / weapon picker is Phase 2.
- **No Phaser scene yet** — Mini App fire UI is angle slider + power slider + FIRE button. The full Phaser battlefield render is Phase 2 polish.
- **Setlement → matchHistory push** — main-claude flagged this for the career-card pipeline, not yet wired
- **`processReferralReward` hook** in match-end for wagered matches (Phase 2)

---

## §9 · `@johnk` — what unblocks the next session

Three asks. Two are tonight-or-tomorrow priority; one is informational.

### 1. **Dedicated dev bot** (high priority, ~3 minutes for you)

Long-polling on shared prod token = the source of every "command stopped working" cycle we hit today. We need to stop using your prod bot from local dev.

- BotFather → `/newbot`
- Suggested name: `SolShot Dev`
- Suggested username: `SolShotDevBot` (or whatever's available)
- Send the new token to FishyBoy via **1Password share / encrypted note** — **NOT regular chat**. We've burned two prod tokens today by accidentally exposing them in our conversation transcript. Treat the new dev token like a password.

After that, in BotFather for the new dev bot:
- `/setjoingroups` → Enable
- `/setprivacy` → Enable (matches prod posture)
- (Optional) `/setdescription`, `/setuserpic` — anything

FishyBoy then puts the dev token in `server/.env` instead of the prod one. Prod bot stays untouched on Render.

### 2. **Confirm prod is back online**

Earlier today you rotated the prod token + updated Render. Right now FishyBoy's local server has been polling on prod's token, which kills the prod webhook. Once he stops his local server (we are stopping for the night), Render's existing process needs the webhook re-registered. Either:
- Restart the Render service manually (Render dashboard → Restart), which calls `setupBotWebhook()` again on boot
- Or don't worry about it tonight if no one's using the prod bot

### 3. **Mini App URL state — informational**

The dev Mini App you registered (`solshotdev` short name pointing at the Vercel preview URL) is fine and stays as-is. Permanent. We use it for testing.

The production `solshot` short name should still point at `https://solshot.gg`. Verify in BotFather → `/myapps` → solshot. We did NOT change this.

---

## §10 · Why today wasn't smoother — root-cause read

For posterity, the failure modes we hit and what caused them:

| Symptom | Actual cause |
|---|---|
| ECONNRESET on `sendMessage` / `editMessageText` / `getUpdates` | Local long-polling connection killed by transient network blip; Telegraf doesn't always recover |
| `409 Conflict: can't use getUpdates while webhook is active` | After you rotated the prod token + restarted Render, Render registered the prod webhook. Our local polling can't run alongside it. |
| `409 Conflict: terminated by setWebhook request` | Same race in the other direction — a `setWebhook` call (probably from a prod redeploy) killed our active polling mid-flight |
| `Bad Request: query is too old` on `answerCallbackQuery` | Cascading consequence of the above — when our editMessageText hangs on ECONNRESET for 30+ seconds, the callback query passes Telegram's 15s freshness window |
| `/customgame` silently ignored after working earlier | Telegraf polling state stuck after one of the above; only fix was hard-restart of the node process |

Every one of these traces back to "we're long-polling against the prod bot's token." A dedicated dev bot eliminates the entire class of issue.

---

## §11 · How to resume next session

1. JJ creates the dev bot per §9, sends FishyBoy the token securely
2. FishyBoy edits `server/.env`:
   - `TELEGRAM_BOT_TOKEN=<new dev bot token>`
   - `MINI_APP_URL=https://t.me/SolShotDevBot/<short-name>` (or whatever short name the dev bot's Mini App ends up with — may need a fresh BotFather `/newapp` for the dev bot pointing at the same Vercel preview URL)
3. FishyBoy adds the dev bot to a fresh test group with 3+ friends
4. Smoke test the full E2E flow per §6 (the not-tested rows)
5. If anything breaks, iterate on `sandbox/fishyboy` directly — should be cleanly debuggable now without prod conflicts

---

## §12 · Files to start a code review with

If you want to read code, suggested order (fastest understanding):

1. `Docs/GROUP_CHAT_MODE.md` v0.2 (the canonical spec — design rationale)
2. `server/models/GroupMatch.js` (schema — sets the vocabulary)
3. `server/services/groupchat/configFlow.js` (the wizard — most user-facing piece)
4. `server/services/groupchat/lifecycle.js` (the actual game loop — `startMatch`, `handleShot`, `handleIdleTimeout`, `settleMatch`)
5. `server/services/groupchat/scheduler.js` (timer mgmt + boot recovery)
6. `client/src/screens/GroupMatchScreen.js` (Mini App side)
7. `server/socket-io/groupchat.js` (server-side socket plumbing)

Each file has a header comment summarising its scope.

---

_Pausing for the night. All code pushed. Ready to resume after the dev-bot setup._

— fishyboy-claude, 2026-04-30
