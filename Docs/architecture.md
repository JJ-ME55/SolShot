# System Architecture

> The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.

**Last updated:** 2026-05-07  
**Status:** Post-audit (SOS #2 + BOK #2 + DB #2), devnet-stable. Mainnet pending hardening bundles A–D.

---

## System Overview

SolShot is a multiplayer artillery game with on-chain SOL escrow for wagered matches. Players fire
shots through a browser PWA or inside Telegram group chats, wagering SOL on the outcome. The server
is the authoritative physics and game-state engine; it cannot redirect funds. Two Anchor programs on
Solana enforce correct settlement math and recipients - the winner gets 90%, treasury 7%, ops 3%,
split atomically on-chain with no off-chain accounting.

```
TG group chat (host runs /customgame)
       │
       ▼
┌───────────────────────────────────────────────┐
│  Telegram bot (Telegraf, Node)                │
│   creates GroupMatch lobby, posts card        │
└───────┬───────────────────────────────────────┘
        │ players join, tap "Take Your Shot"
        ▼
┌───────────────────────────────────────────────┐
│  PWA at solshot.gg (React + Phaser)           │
│   • Privy embedded wallet (email or TG OAuth) │
│   • Phaser scene drives input; server renders │
└───────┬───────────────────────────────────────┘
        │ socket.io
        ▼
┌───────────────────────────────────────────────┐
│  Server (Express + Socket.IO)                 │
│   • server-authoritative physics              │
│   • match state, turn order, idle timeout     │
│   • escrow service (signs settle/cancel)      │
└───┬───────────────────────────┬───────────────┘
    │                           │
    ▼                           ▼
┌─────────────────┐    ┌────────────────────┐
│  Solana         │    │  MongoDB           │
│  Anchor         │    │  match state +     │
│  programs       │    │  user profiles     │
│  (v1 + v2)      │    └────────────────────┘
└─────────────────┘
```

Server keeps live match state in MongoDB and reconciles to chain at settle time. The chain is
authoritative for funds; MongoDB is authoritative for game state. Discrepancies are recoverable
via the permissionless reclaim path - any player can self-refund 24 hours after match end if the
server never settled.

### Why server-authoritative, not ephemeral rollups

Server-authoritative physics with on-chain settlement is a deliberate choice over ephemeral
rollups. Artillery is async turn-based: matches run over hours or days at chat pace, not
milliseconds. Ephemeral rollups solve sub-second latency for real-time games. Settlement-only
on-chain is the right fit for asynchronous skill PvP, and keeps the trust model simple: the
server cannot redirect funds, the chain cannot be made to settle to a wallet not in
`escrow.players[]`, and the permissionless reclaim path closes the loop if the server ever
goes dark.

---

## Components

### 1. Server - Express + Socket.IO + Telegraf

**Purpose:** Single source of truth for game physics, match state, and escrow authority.

**Location:** `server/`

**Key files:**

| File | Role |
|------|------|
| `server/socket-io/main.js` | Match state machine, fire handler, queue (~1800 LOC) |
| `server/socket-io/groupchat.js` | Group-chat socket events (8 handlers) |
| `server/services/physics.js` | Server-authoritative trajectory + damage (all 20 weapon types) |
| `server/services/escrow.js` | Anchor wrapper for v1 program |
| `server/services/escrow-v2.js` | Anchor wrapper for v2 program |
| `server/services/solana.js` | Delegates to escrow/escrow-v2; falls back to logging in dev |
| `server/services/gold.js` | Gold economy (1000G start, +15G/HP, +200 kill, +300 win) |
| `server/services/privyAuth.js` | Privy JWT middleware (`requirePrivyAuth`) |
| `server/services/walletLinkTokens.js` | Magic-link token generation + redemption |
| `server/services/shot-token.js` | On-chain SHOT burn verification |
| `server/services/groupchat/` | Group-match lifecycle: 8 files listed below |
| `server/models/` | Mongoose schemas: User, Match, GroupMatch, Challenge |
| `server/scripts/init-config.mjs` | One-shot GlobalConfig PDA bootstrap script |
| `server/idl/solshot_escrow.json` | Anchor IDL for v1 (must be kept in sync with `target/idl/`) |
| `server/idl/solshot_escrow_v2.json` | Anchor IDL for v2 |

**Group-chat service files (`server/services/groupchat/`):**

- `lifecycle.js` - match state transitions (lobby → awaiting_deposits → active → settled/cancelled)
- `scheduler.js` - turn timer enforcement (12-hour default), idle timeout
- `configFlow.js` - in-chat config wizard for wager / player count
- `lobbyCard.js` - self-updating Telegram lobby message
- `botMessages.js` - outbound TG message templates
- `quietHours.js` - per-group quiet hours config
- `lobbyWatchdog.js` - boot-recovery sweep for stuck lobbies
- `index.js` - barrel export

**Tech:** Node.js 20, Express 4, Socket.IO 4, Telegraf 4, Mongoose 9.x, Anchor SDK 0.32.1, `bn.js`
(imported directly - Anchor 0.32.1 breaking change).

---

### 2. Client - React + Phaser PWA

**Purpose:** Input collection, physics rendering, wallet transaction signing. Clients render
results; they do not compute physics or verify game state.

**Location:** `client/`

**Key files:**

| File | Role |
|------|------|
| `client/src/scenes/main/` | Phaser scene: terrain, tanks, weapons, trajectory render |
| `client/src/screens/` | React routes: Menu, Lobby, Battle, Prestige, Armory, etc. |
| `client/src/wallet/WalletContext.js` | Privy wallet adapter; `signAndSendEscrowDeposit()`, `signAndBurnShot()` |
| `client/src/data/weapons.js` | 15 base weapons |
| `client/src/data/tiers.js` | Prestige tiers (Bronze→Diamond), 5 prestige weapons |
| `client/src/App.js` | Top-level router; disconnect/reconnect overlay; 10-minute reconnect window |
| `client/config-overrides.js` | CRA webpack overrides (Solana polyfills) |

**Tech:** React 18, Phaser 3.55 (canvas mode, 16:9 native / 1422×800), Privy embedded wallets,
`@solana/spl-token` for burn IX, Create React App.

**Hosting:** Vercel (autoDeploy from `main`).

---

### 3. Bot - Telegram via Telegraf

**Purpose:** Group-chat match creation and async turn coordination. Renders lobby cards and turn
prompts directly in Telegram group chats. Sends magic-link DMs for wallet binding.

**Location:** `server/services/bot.js` + `server/services/groupchat/`

**Key flows:**
- `/customgame` in a group → `configFlow.js` interactive wager/player-count wizard → lobby card
- Players tap "Join" in the lobby → bot resolves TG identity → server creates match
- Each turn: bot DMs the active player with a "Take Your Shot" button (deeplink to PWA)
- On settle: bot posts settlement TX link (Solscan) back to the group

**Identity:** The bot is the entry point for Privy magic-link wallet binding. DM `/play` → server
generates a `walletLinkTokens` magic-link → user opens in browser → Privy authenticates → server
binds Privy wallet to TG identity in MongoDB.

**Tech:** Telegraf 4, webhook via Render.

---

### 4. On-chain v1 - `solshot-escrow` (1v1, real-time)

**Purpose:** SOL escrow for real-time wagered duels (2–4 players). Handles Quick Match, Duel,
High Roller, and Custom Challenge match modes.

**Location:** `programs/solshot-escrow/src/lib.rs` (962 LOC)

**Program ID (devnet):** `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1`

**State machine:** `AwaitingDeposits → Active → Settled / Cancelled`

**Key properties:**
- Wager bounds: 10,000 lamports min, 100 SOL max
- Players: 2–4 (stored as `[Pubkey; 4]` array, `max_players: u8`)
- Deposit dedup: `deposits_mask: u8` bitmap
- Settlement split: 700/300 BPS treasury/ops hardcoded as `const u64` - immutable without Layer-1
  upgrade
- Fee destinations: read from **live** `GlobalConfig` at settle time (v1 is not immune to
  mid-match config rotation - this is H002, deferred to mainnet Bundle 1)
- PDA seeds: `["match", match_id.as_bytes()]`
- Permissionless reclaim: `created_at + 7200s` (2 hours after SOS H035 fix)
- `cancel_match` / `settle_match`: NOT blocked by pause (H016 fix applied, mirrors v2 posture)
- `start_with_depositors`: requires 600s deposit window before authority activation (H017 fix)

**IDL:** `server/idl/solshot_escrow.json` (copied from `target/idl/` after build)

**First wagered settlement:** 2026-05-04, match `2f5b6180`, TX
`4WSsDsKVzCugdjsfD6Zg2kHKc7VBcByUKsN5P9CQEMj2ExXuuw9jQJch6eK4Qqu1MY8Ma16Tw1QawJKig5V3b9sf`
(winner +0.18 SOL, treasury +0.014, ops +0.006).

---

### 5. On-chain v2 - `solshot-escrow-v2` (N-player, async) - NEW

**Purpose:** SOL escrow for async Telegram group-chat matches. Designed for chat-paced cadence
(12-hour turn timers, multi-day matches) with 2–10 players.

**Location:** `programs/solshot-escrow-v2/src/lib.rs` (1020 LOC)

**Program ID (devnet):** `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N`

**State machine:** `AwaitingDeposits → Active → Settled / Cancelled`

**Key differences from v1:**

| Dimension | v1 | v2 |
|-----------|----|----|
| Max players | 4 | 10 |
| Player slot | `[Pubkey; 4]` | `[Pubkey; 10]` |
| Deposit bitmap | `u8` | `u16` |
| Escrow SPACE | 232 bytes | larger (proportional) |
| Fee BPS | hardcoded 700/300 | configurable in `GlobalConfig`; capped at combined 1000 BPS (10%) |
| Fee destinations at settle | live `GlobalConfig` | **per-match snapshot** frozen at `create_match` |
| Match duration | n/a (real-time) | `duration_secs` up to 24h (H039 fix; was 7 days) |
| Deposit window | n/a | `deposit_window_secs` up to 24h |
| Permissionless reclaim | `2 × TIMEOUT_SECONDS` | `match_end_ts + 24h` |
| Pause blocks cancel/settle | YES (v1 pre-fix) | NO - in-flight exits always allowed |
| Deposit deadline edge | inclusive | exclusive (H018 fix) |

**Per-match snapshot semantics (critical for trust model):**  
At `create_match`, the program atomically copies `GlobalConfig.{treasury, ops, fee_bps_treasury,
fee_bps_ops}` into `MatchEscrow.{treasury_snapshot, ops_snapshot, fee_bps_treasury_snapshot,
fee_bps_ops_snapshot}`. `settle_match` reads exclusively from the snapshot; account constraints
validate supplied fee destinations against snapshot values (not live config). This means in-flight
v2 matches are immune to mid-match config rotation. New matches created after a compromise would
use the poisoned config - this is the remaining exposure (H028-class, deferred).

**Key files for v2 server integration:**
- `server/services/escrow-v2.js` - Anchor program wrapper
- `server/services/groupchat/lifecycle.js` - creates PDA, confirms deposits, settles

**First N-player organic settlement:** 2026-05-06, 3-player match, TX
`4ja8VKpZJnQek8xakFWqByyRJ6qG9U7iWeFwqiiZVKGhemVfnWLDLiJYuMdjoN9tKptCxE1Dkzx5d9ZE6D3NqtL1`

**IDL:** `server/idl/solshot_escrow_v2.json`

---

### 6. Database - MongoDB

**Purpose:** Authoritative store for game state, user profiles, group match lifecycle, challenges,
and referrals.

**Location:** `server/models/`

**Schemas:**

| Schema | Key fields |
|--------|-----------|
| `User` | `tgId`, `walletAddress` (stale after Privy rotation - DB H009, deferred), `gold`, `prestige`, `stats` |
| `Match` (1v1) | `matchId`, `players[]`, `state`, `wager`, `escrowPda`, `winner` |
| `GroupMatch` | `matchId`, `state`, `players[]`, `wager`, `escrowPda`, `currentTurn`, `depositMask` |
| `Challenge` | `code`, `challengerWallet`, `challengerTgUserId`, `wager` |

**Notes:**
- `mongoose.set('runValidators', true)` set globally (DB H032 fix) - schema enums enforced on all
  update paths
- `GroupMatch.matchId` uses `Math.random()` currently (entropy gap - DB H089, Bundle C)
- No at-rest encryption on MongoDB Atlas free tier (documented limitation)

**Hosting:** MongoDB Atlas, connected via `MONGODB_URI` env var.

---

### 7. Wallet - Privy Embedded

**Purpose:** Wallet custody and transaction signing for players. Replaced Dynamic (prior stack) as
of the Privy migration (May 2026).

**Location:** `client/src/wallet/WalletContext.js`, `server/services/privyAuth.js`,
`server/services/walletLinkTokens.js`

**Auth flows:**

1. **Web PWA flow:** User opens solshot.gg → Privy modal (email or TG OAuth) → embedded wallet
   provisioned automatically → `WalletContext` exposes `signAndSendEscrowDeposit()` and
   `signAndBurnShot()`.

2. **TG bot magic-link flow (group-chat):** User DMs `/play` → server generates a short-TTL token
   via `walletLinkTokens.js` → bot sends magic-link DM → user taps → browser opens solshot.gg
   with token → Privy authenticates → `link-from-privy-telegram` endpoint verifies the Privy
   session's actual linked TG account (DB H001 fix at `server/index.js:521–548`) → wallet bound
   to TG identity in MongoDB.

**Transaction signing:**
- `signAndSendEscrowDeposit(base64Tx)` - deserializes server-built TX, signs via Privy, confirms,
  notifies server via `escrowDepositConfirm` socket event
- `signAndBurnShot(burnAmount)` - builds SPL burn IX client-side, signs via Privy

**Known gap:** Wallet rotation is not tracked. If Privy re-provisions a wallet (SDK upgrade or
user action), `users.walletAddress` in MongoDB is never updated. Settlement at
`lifecycle.js:~851` reads the stale address - funds would land at a wallet the user no longer
controls. This is DB H009, deferred to mainnet Bundle 2.

---

## Data Flows

### Flow 1 - Wagered 1v1 Deposit → Settle

```
1. Player opens solshot.gg, authenticates via Privy
2. Client connects socket.io → server maps socket ↔ wallet address
3. Player queues for Quick Match / selects Duel / accepts Challenge
4. Server creates MatchEscrow PDA on-chain (signs with authority keypair)
   escrow.js:createMatch(matchId, players[], wager, escrowPda)
5. Server emits 'escrowDeposit' to both clients (serialized TX, base64)
6. Each client: WalletContext.signAndSendEscrowDeposit(base64Tx)
   → signs via Privy, submits, awaits confirmation
   → emits 'escrowDepositConfirm' { txSignature }
7. Server tracks confirmations in escrowDepositConfirm handler
   → when both confirmed: emits 'escrowActive', match proceeds
8. Match runs (turn-based physics, server-authoritative)
   → 10-minute turn timer (1v1 lobby); auto-advance on timeout
   → disconnect/reconnect 10-minute grace window
   → group-chat matches use config.turnTimerMs (default 12h, host-set)
9. Last tank alive → server calls settle_match(winner, matchId)
   → 90/7/3 split distributed atomically on-chain
   → 'matchEnd' emitted to clients with TX link
```

### Flow 2 - Wagered Group-Chat Deposit → Settle (NEW)

```
1. Host runs /customgame in TG group chat
   → configFlow.js: bot asks for wager amount, player count
   → server creates GroupMatch doc in MongoDB (state: 'lobby')
   → lobbyCard.js: bot posts self-updating lobby message in group
2. Players tap "Join" in lobby card
   → server verifies TG identity via HMAC
   → adds player to GroupMatch.players[]
3. On lobby fill:
   → server calls escrow-v2.js:createMatch() → MatchEscrow PDA created on-chain
   → server DMs each player a magic-link (walletLinkTokens.js)
   → GroupMatch state → 'awaiting_deposits'
4. Each player taps link → Privy auth → WalletContext.signAndSendEscrowDeposit()
   → confirmGroupDeposit socket event → server confirms on-chain
   → GroupMatch.depositMask bit set
5. All deposits confirmed → GroupMatch state → 'active'
   → scheduler.js starts 12h turn timer
   → bot posts first turn prompt in group chat with "Take Your Shot" button
6. Per turn:
   → active player taps button → deeplink opens solshot.gg
   → client loads match state via getGroupMatch socket event
   → player aims/fires → fireGroupShot socket event
   → server runs physics (same physics.js as 1v1), emits 'shotResult'
   → server advances turn, posts recap to TG group
   → 12h timer resets
7. Idle timeout: after 3 consecutive missed turns → auto-forfeit
   → idleTimeout.js + lifecycle.js:handleIdleTimeout()
8. Last tank alive:
   → lifecycle.js:checkAndSettle()
   → server calls escrow-v2.js:settleMatch(winner, matchId)
   → v2 reads snapshot (treasury/ops/BPS) from MatchEscrow, NOT live config
   → settlement TX posted to TG group chat
```

### Flow 3 - Magic-Link Wallet Bind via TG Bot (NEW)

```
1. User DMs /play to @SolShotGG_bot
2. server/services/bot.js: generates magic-link token
   → walletLinkTokens.js:generateLinkToken(tgId)
   → stored server-side with 15-min TTL
3. Bot DMs link: https://solshot.gg?linkToken=<token>
4. User opens → Privy modal displays
5. User authenticates via Privy (email or TG OAuth)
6. Client POSTs to /api/wallet/link-from-privy-telegram
   Body: { privyToken, telegramUserId }
7. server/services/privyAuth.js verifies Privy JWT
   → getUser() lookup confirms telegramUserId matches Privy session's actual
     linked TG account (DB H001 fix - returns 403 on mismatch)
8. walletLinkTokens.js:redeemLinkToken(token, tgId) validates token
9. User.walletAddress = privy.wallet.address → saved to MongoDB
10. Bot DMs confirmation; user can now join wagered matches
```

### Flow 4 - Cancel / Refund (H023 length-check requirement)

```
Cancel triggered by: player timeout, server forfeits, lobby-fill failure

1. Server calls cancel_match or permissionless_reclaim
2. CRITICAL (H023 fix): on-chain requires
   remaining_accounts.len() == deposits_mask.count_ones()
   - passing fewer accounts reverts with IncompleteRefund
3. Server builds remaining_accounts from:
   v1: wagerStates[roomId].deposits map (in-memory)
   v2: GroupMatch.players[].initialDepositTx in MongoDB
4. [GAP - DB H014]: server reads its own state, NOT on-chain deposits_mask.
   If Mongo desyncs from chain (crash + reconnect), refund reverts on-chain;
   server reports success: true; SOL stranded until 24h permissionless reclaim.
5. On-chain refund loop iterates deposited slots, credits each player
6. close=caller sweeps rent to server (intentional incentive)
```

---

## State Management

### On-chain (per-match PDA + global config)

**GlobalConfig PDA** - seeds: `[b"config"]`  
One per program. Holds `authority`, `treasury`, `ops`, `is_paused`, and (v2 only)
`fee_bps_treasury`, `fee_bps_ops`. Mutated only by `update_config` (one-step, no timelock - H001,
deferred).

**MatchEscrow PDA** - seeds: `["match", match_id.as_bytes()]`  
One per match. Created by authority (`create_match`). Key state fields:

| Field | v1 | v2 |
|-------|----|----|
| `state` | `AwaitingDeposits / Active / Settled / Cancelled` | same |
| `players` | `[Pubkey; 4]` | `[Pubkey; 10]` |
| `max_players` | `u8` (2–4) | `u8` (2–10) |
| `deposits_mask` | `u8` | `u16` |
| `wager_lamports` | `u64` | `u64` |
| `created_at` | `i64` | `i64` |
| `activated_at` | `i64` (set on full mask or start_with_depositors) | same |
| `match_end_ts` | - | `i64` = `activated_at + duration_secs` |
| `treasury_snapshot` | - | `Pubkey` (frozen at create) |
| `ops_snapshot` | - | `Pubkey` (frozen at create) |
| `fee_bps_treasury_snapshot` | - | `u16` (frozen at create) |
| `fee_bps_ops_snapshot` | - | `u16` (frozen at create) |

**Pot calculation:** `total_pot = wager_lamports × count_ones(deposits_mask)`  
(u128 widened to prevent overflow; `overflow-checks = true` in Cargo workspace)

**Settlement distribution:**
```
treasury_amount = total_pot × fee_bps / 10_000
ops_amount      = total_pot × ops_bps / 10_000
winner_amount   = total_pot − treasury_amount − ops_amount  (absorbs ≤ 2 lamport dust)
```
State written `Settled` before lamport math (CEI / OC-10 compliant).

### Off-chain (Mongo + in-memory match state)

**In-memory (server/socket-io/main.js):**
- `rooms[roomId]` - live 1v1 match state (players, physics, gold, turn order)
- `pendingReconnects[walletAddress]` - 10-minute reconnect window state
- `turnTimers[roomId]` - active turn timer references
- `wagerStates[roomId].deposits` - which sockets have confirmed escrow deposit

**MongoDB (persistent):**
- `User` - identity binding (tgId ↔ walletAddress), gold, prestige
- `Match` - 1v1 match lifecycle + escrow reference
- `GroupMatch` - async group match, current turn, deposit state, player list
- `Challenge` - open challenges with wager / expiry

**Consistency model:** MongoDB is the source of truth for historical match state. In-memory state
is rebuilt on reconnect / server restart via MongoDB reconciliation. The on-chain mask is not
currently re-read before constructing cancel `remaining_accounts` (DB H014 gap - deferred to
Bundle 3).

### Snapshot semantics (v2 only)

v2 captures `GlobalConfig.{treasury, ops, fee_bps_*}` at `create_match` time atomically. The
capture is immutable post-creation - no instruction modifies the snapshot fields after init.
`settle_match` validates supplied fee destination accounts against snapshot values via Anchor
constraints, preventing config rotation from affecting settled amounts for in-flight matches.

This does NOT protect newly created matches post-compromise, and does NOT prevent winner-pick fraud
(server is trusted to select the legitimate winner - H003, deferred to Bundle 4).

---

## Trust Model

### Actors

| Actor | Trust Level | Capabilities |
|-------|-------------|--------------|
| Anonymous | UNTRUSTED | Trigger `permissionless_reclaim` after 24h grace |
| Listed Player | PARTIAL | Deposit own wager; cancel own match after timeout |
| Server (authority hot wallet) | TRUSTED (intentional, pre-mainnet) | Create matches; settle (pick winner); cancel; rotate config; pause |
| Solana Upgrade Authority | FULLY TRUSTED | Replace bytecode; close program |

**Single-key design (intentional pre-mainnet):** The same hot wallet
(`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) holds both Solana-level upgrade authority and
application-level `config.authority` for both programs. JJ has acknowledged this as an explicit
pre-mainnet decision. A compromise of either role is sufficient for total protocol drainage (SOS
H044, DB H012). Mainnet plan: Squads multisig for upgrade authority (Layer 1), separate hot wallet
for application authority (Layer 2).

### Trust Zones (off-chain)

From `.bulwark/ARCHITECTURE.md` Section 2:

```
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 0: PUBLIC INTERNET (UNTRUSTED)                              │
│ → CORS + helmet + rate-limit + Privy JWT                         │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 1: AUTHENTICATED CLIENT                                     │
│ → Has TG webhook HMAC OR Privy session JWT OR magic-link token   │
│ [GAP] client.isAuthenticated (in-memory flag) is the real gate   │
│ [GAP] auth signature replay 5-min window (DB H004, deferred)     │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 2: VERIFIED IDENTITY (TG ID + Wallet)                       │
│ → Server knows caller's TG ID and wallet pubkey                  │
│ [GAP] wallet rotation never updates DB (DB H009, deferred)       │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 3: MATCH PARTICIPANT (per-match scope)                      │
│ → Can fire, deposit, forfeit, purchase weapon for that match     │
│ [GAP] shoot legacy relay no auth - FIXED DB H018                 │
│ [GAP] acceptChallenge/declineChallenge no auth - FIXED DB H019   │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 4: SERVER AUTHORITY (Escrow signer)                         │
│ → Signs settle/cancel/create on-chain                            │
│ → Same key as Solana upgrade authority (pre-mainnet posture)     │
└──────────────────────────────────────────────────────────────────┘
```

### Trust Zones (on-chain)

From `.audit/ARCHITECTURE.md` Section 3:

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 - SOLANA UPGRADE AUTHORITY                           │
│    HPyV...nokv (hot wallet - same as Layer 2)                 │
│    Power: replace any bytecode, close program                 │
│    Safeguards: NONE (no timelock, no multisig)                │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 - APPLICATION AUTHORITY (config.authority)          │
│    HPyV...nokv (hot wallet - same as Layer 1)                 │
│    Power: rotate config / pause / settle / create / cancel    │
│           v2 also: rotate fee BPS up to 10% combined         │
│    Safeguards: distinctness guards, zero-address guard,       │
│                v2 per-match snapshot for in-flight matches.   │
│                NO timelock. NO propose/accept (H001 open).    │
├──────────────────────────────────────────────────────────────┤
│  ON-CHAIN VALIDATION                                          │
│    has_one = authority on every privileged path               │
│    PDA seed re-derivation, Anchor init/close guarantees       │
│    Bit-mask deposit dedup, state-monotonicity invariant       │
│    H023 fix: remaining_accounts.len() == count_ones(mask)     │
│    H025 fix: !executable on all fee destination accounts      │
├──────────────────────────────────────────────────────────────┤
│  PLAYER ZONE (allowlisted via escrow.players[])              │
│    Sign own deposit; cancel own match after timeout           │
├──────────────────────────────────────────────────────────────┤
│  PERMISSIONLESS ZONE                                          │
│    permissionless_reclaim after grace deadline                │
│    NO config account in struct - immune to pause              │
└──────────────────────────────────────────────────────────────┘
```

### Server-as-Authority Design Limitation

The protocol trusts the server to select the legitimate winner of each match. There is no on-chain
proof of game outcome. The server freely calls `settle_match(winner)` with any registered player
address. This is an inherent property of the server-authoritative game architecture.

Off-chain mitigation (planned): binding player wallets to verified TG identities via Privy at
match creation time, plus server-side win-rate anomaly monitoring. On-chain mitigation (long-term):
commit-reveal or VRF-based winner selection (SOS H003/H005, deferred to Bundle 4).

---

## Tech Stack

| Layer | Choice | Version / Notes |
|-------|--------|-----------------|
| Client framework | React | 18 |
| Client game engine | Phaser | 3.55, canvas mode, 1422×800 |
| Client wallet | Privy embedded wallets | email + TG OAuth |
| Client hosting | Vercel | autoDeploy from `main` |
| Server runtime | Node.js | 20 |
| Server framework | Express | 4 |
| Server realtime | Socket.IO | 4 |
| Server bot | Telegraf | 4 |
| Server ORM | Mongoose | 9.x |
| Server hosting | Render | autoDeploy from `main`, server + bot |
| On-chain language | Rust / Anchor | 0.32.1 |
| On-chain network | Solana | Devnet today; mainnet pending |
| Database | MongoDB Atlas | Free tier (no at-rest encryption) |
| Token | SPL Token (SHOT) | 10M supply, mint authority burned, 9 decimals |
| Math library | `bn.js` | Imported directly (Anchor 0.32.1 breaking change) |

---

## Audit Posture

Three formal audits ran in May 2026. Reports and remediation decisions are cross-referenced below.

### SOS Audit #2 (Stronghold of Security - on-chain)

**Report:** `.audit/FINAL_REPORT.md`  
**Decisions:** the SOS remediation log

9 findings fixed in source (SOS fix bundle):

| ID | Fix |
|----|-----|
| H023 | Partial-refund theft via `close=caller` - `remaining_accounts.len()` check added to all 4 refund loops |
| H016 + H009 | Pause removed from v1 `cancel_match` / `settle_match` / `start_with_depositors` |
| H017 | v1 `start_with_depositors` silent-kick - 600s deposit-window gate added |
| H035 | Settle-vs-cancel race - v1 `TIMEOUT_SECONDS` bumped 600 → 3600 |
| H039 | v2 unbounded `duration_secs` - `MAX_DURATION_SECS` reduced from 7 days to 24h |
| H018 | v2 deposit-window edge collision - deadline check changed from `<=` to `<` |
| H025 | UncheckedAccount fee destinations - `!executable` constraints added to all 6 |
| H040 | Stale 48h comment - corrected to 2h |
| H043 | Pause emits no event - `Paused`/`Unpaused` events added with authority pubkey |

Deferred (16 findings): primarily the H001 authority-key family (one-step transfer, no timelock,
single hot wallet) and server-as-authority design limitations. See the SOS remediation log
Section 2 for full rationale.

### DB Audit #2 (Dinh's Bulwark - off-chain)

**Report:** `.bulwark/FINAL_REPORT.md`  
**Decisions:** the DB remediation log

16 findings fixed in source (DB fix bundle):

| ID | Fix |
|----|-----|
| H001 | Privy/TG identity bridge - `getUser()` lookup verifies `telegramUserId` against Privy session |
| H002 | `requirePrivyAuth({required:true})` fails-open - 503 when secret missing |
| H013 | `refundWager()` fails-open - errors now propagate |
| H018 | `shoot` legacy relay no auth - `requireAuth` + turn-ownership check added |
| H019 | `acceptChallenge`/`declineChallenge` no auth - `requireAuth` added |
| H020 | `clientDebugLog` unauthenticated log injection - auth gate added |
| H022 | `getGroupMatch` no auth - auth gate added |
| H023 | `/api/challenge/:code/cancel` unauthenticated - caller identity required |
| H026 | Turn-sequence nonce optional - `data.seq` now required |
| H031 | DebugAuthOverlay in production - `NODE_ENV !== 'production'` guard added |
| H032 | `runValidators: true` missing - set globally via `mongoose.set()` |
| H035 | Dead Dynamic origins in server CSP - replaced with Privy origins |
| H041 | express-rate-limit IPv6 bypass - bumped to 8.5.1 |
| H055 | `/teststats` no admin guard in production - `NODE_ENV` + `ADMIN_TELEGRAM_IDS` check |
| H072 | `matchId` operator injection - strict type check added |
| H083 | Admin key timing-unsafe compare - replaced with `crypto.timingSafeEqual` |

Deferred (~30 findings across Bundles A–D): wallet rotation gap, confirmDeposit race, JWT audit,
double-settle race, Vercel security headers. See the DB remediation log Section 2.

### BOK Audit #2 (Book of Knowledge - math invariants)

**Report:** `.bok/reports/2026-05-07-report.md`

159 tests passing (BOK verification suite). Math invariants verified on v1 + v2 escrow programs:
- Pot conservation (90/7/3 sums to pot for all valid deposit masks)
- Refund conservation (cancel sum == deposit sum for contiguous masks)
- Dust bound (≤ 2 lamports per settle from BPS floor divisions)
- State monotonicity (no Settled → Active, no Cancelled → Settled transitions)
- Wager bounds (min/max lamport constraints)

Audit ran in HIGH-CONFIDENCE PROBABILISTIC mode (Kani unavailable on Windows). PROVEN tier
requires WSL2 setup.

---

## What's Planned (Next 30 Days)

The following hardening bundles are required before mainnet. Each is a separate PR + audit-verify
cycle.

**Bundle 1 - Authority hardening** (closes SOS H001, H002, H030, H032, H042; DB H003, H004, H012)
- `pending_authority` field + `propose_authority` / `accept_authority` instructions (both programs)
- 24h timelock on `update_config` for treasury / ops / fee_bps changes
- Migrate Layer 1 (upgrade authority) to Squads M-of-N multisig
- Separate server keypair from upgrade authority

**Bundle 2 - Wallet & Identity** (closes DB H009, H010, H014, H015, H016)
- `updateWalletForTgUser()` with versioned audit trail (wallet rotation tracking)
- On-chain `deposits_mask` read before building `remaining_accounts` in cancel paths
- Atomic `confirmDeposit` via `$elemMatch` + `findOneAndUpdate`
- Double-settle race: convert `checkAndSettle()` to atomic `findOneAndUpdate({state:'active'},{state:'settled'})`

**Bundle 3 - Off-chain hardening** (closes DB H049, H060, H089; SOS H049)
- `match_id` entropy: `crypto.randomBytes(8)` = 16 hex chars + Mongo unique index
- Vercel security headers (`frame-ancestors`, HSTS, Permissions-Policy via `client/vercel.json`)
- RPC fallback endpoint + exponential backoff on 429
- Bundle C npm CVEs: socket.io-parser, path-to-regexp, handlebars transitive

**Bundle 4 - Long-term protocol research** (addresses SOS H003, H005)
- Commit-reveal or VRF-based winner selection (removes server-as-authority trust assumption)
- On-chain dispute mechanism for game-outcome challenges

For the full mainnet roadmap including timelines, see `Docs/mainnet-roadmap.md`.

---

## Cross-References

- `.audit/ARCHITECTURE.md` - on-chain trust model (SOS #2 synthesis)
- `.bulwark/ARCHITECTURE.md` - off-chain trust model (DB #2 synthesis)
- the SOS remediation log - SOS finding decisions and mainnet bundle plan
- the DB remediation log - DB finding decisions and mainnet bundle plan
- `.bok/reports/2026-05-07-report.md` - math invariant verification results
- the prior-audit delta record - what changed Feb → May 2026
- `Docs/SolShot_Litepaper_v2.2.md` - product and token economy spec
- `Docs/` - companion architecture decision records (ADRs)
