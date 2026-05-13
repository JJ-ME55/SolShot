---
task_id: db-phase1-logic-01
provides: [logic-01-findings, logic-01-invariants]
focus_area: logic-01
files_analyzed:
  - server/socket-io/main.js
  - server/services/match.js
  - server/services/physics.js
  - server/services/groupchat/lifecycle.js
  - server/socket-io/groupchat.js
  - server/services/gold.js
  - server/services/referrals.js
  - server/models/GroupMatch.js (schema only, via INDEX)
  - server/models/Match.js (schema only, via INDEX)
finding_count: 12
severity_breakdown: {critical: 1, high: 4, medium: 5, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# LOGIC-01: Business Logic & Workflow Security — Condensed Summary

## Key Findings (Top 10)

- **Self-damage sign erasure**: `Math.abs(dmg)` in 1v1 fire handler converts physics' negative self-damage signal into positive HP deduction — self-hits deal real damage in 1v1 but are filtered correctly in group-chat — `server/socket-io/main.js:3811`
- **Weapon inventory bypass when inventory map entry absent**: `if (inventory && inventory[this.id])` — if the player slot is missing entirely (e.g., reconnect edge case), the ownership check is skipped and any weapon fires — `server/socket-io/main.js:3714-3720`
- **Group-chat `settleMatch` — no double-settle guard**: `settleMatch` checks `match.state !== 'active'` but state mutation + `await match.save()` are non-atomic; two concurrent calls (e.g., `checkAndSettle` from both `handleShot` and `handleIdleTimeout` firing close together) can both pass the guard before either save lands — `server/services/groupchat/lifecycle.js:804-805`
- **`confirmDeposit` no idempotency on activation**: `confirmDeposit` calls `activateMatch(match)` immediately on last deposit; if the same final deposit is confirmed twice in quick succession (duplicate socket events), `activateMatch` may run twice — `server/services/groupchat/lifecycle.js:271-274`
- **Turn ownership: `stepLeft`/`stepRight` guard is `ms.currentTurn && ...` — null-pass during ROUND_END_DELAY**: if `currentTurn` has been set to null (end of round) but match status hasn't transitioned yet, the null-short-circuit allows any player to move — `server/socket-io/main.js:4561, 4595`
- **Gold earned on self-damage in 1v1**: `earnGold` loop checks `dmg > 0` so self-damage (negative) does NOT earn gold — consistent. But HP is still deducted due to the `Math.abs` issue above — double inconsistency: HP decrements but no gold earned — `server/socket-io/main.js:3834-3838`
- **Group-chat: no atomic lock around `handleShot → checkAndSettle`**: entire `handleShot` is one async function without a mutex; concurrent fires (rapid double-tap) can both pass the `match.state !== 'active'` guard before either saves — `server/services/groupchat/lifecycle.js:536-780`
- **`joinChallenge` wager verification deferred to `joinRoom`**: challenge acceptance itself has no wager/wallet check; only `joinRoom` later enforces it — a player can accept a wagered challenge with no wallet/balance and only fail when they call `joinRoom` — `server/socket-io/main.js:2277-2325`
- **Auto-forfeit (3 consecutive timeouts) — timer clears on match state but not across reconnect**: on disconnect+reconnect within 30s, `consecutiveTimeouts` is never remapped — the counter resets to 0, allowing endless reconnect-to-reset-timeout abuse — `server/socket-io/main.js:676-681`
- **Group-chat: consecutive-miss counter NOT reset on forfeit, only on shot**: `firer.consecutiveMissedTurns = 0` is set in `handleShot` but not in `handleForfeit`; a forfeiting player retains their miss count (cosmetic issue, but could cause confusing double-miss notification) — `server/services/groupchat/lifecycle.js:360-391`
- **`isMatchOver` tiebreaker is damage total — damage tracking stops if physics engine error**: if `processShot` throws and the catch path is hit, that round's damage is never written to `ms.scores` — tiebreaker could be wrong — `server/services/match.js:304-331`
- **Referral reward inviter update not atomic with referee stamp**: `processReferralReward` atomically stamps `referralRewardedAt` on the referee but then does a separate, non-guarded update for the inviter — if the server crashes between the two writes, referee is marked rewarded but inviter never gets the SHOT — `server/services/referrals.js:131-155`

## Critical Mechanisms

- **Match state machine (`server/services/match.js`)**: `TRANSITIONS` map enforces valid state changes; `transitionState()` is a CAS-like check-and-set, but operates on in-memory object — no DB persistence, no distributed lock. State is lost on restart.
- **Turn sequencing (1v1)**: `turnSequence` nonce increments on fire; client must echo back matching `seq`. Guards against Socket.IO automatic retries delivering a fire twice. But `seq` is only checked `if (clientSeq !== undefined)` — clients that omit `seq` bypass the replay guard entirely — `server/socket-io/main.js:3690-3696`.
- **Group-chat turn model**: `match.currentPlayerIndex` (MongoDB) advances via `advanceTurn`; no nonce — concurrent fires both read the same `currentPlayerIndex` before either saves.
- **Gold economy**: `spendGold` checks balance then deducts synchronously in-memory (1v1). Group-chat uses atomic `findOneAndUpdate` for purchase. Consistent within each path; cross-path (1v1 shop vs group-chat) do not share state.
- **`validateAction`**: maps state → allowed action names. `buyWeapon` is NOT in `BATTLE` allowed list — but the `buyWeapon` handler in main.js applies its own `validateAction` check which is correct. Mid-battle weapon purchase is blocked server-side.
- **Self-damage in physics**: `calculateDamage` returns negative values for self-hits. Consumers must check sign. 1v1 fire handler loses the sign via `Math.abs()`. Group-chat lifecycle filters `dmg <= 0` correctly.

## Invariants & Assumptions

- INVARIANT: Only the current-turn player may fire — enforced at `server/socket-io/main.js:3682` (1v1) and `server/services/groupchat/lifecycle.js:555` (group-chat). HOLDS for normal flow but BYPASSED if `currentTurn` is null (post-kill ROUND_END_DELAY window) due to the fixed null-aware check.
- INVARIANT: Weapon must be owned before use — enforced at `server/socket-io/main.js:3714-3720` (1v1) and `server/services/groupchat/lifecycle.js:574-579` (group-chat). WEAKLY enforced in 1v1: if `inventory[this.id]` entry doesn't exist, check is skipped.
- INVARIANT: Match settles exactly once — PARTIALLY enforced via `match.state !== 'active'` guard in `settleMatch` (`lifecycle.js:804`) and `transitionState` CAS in `match.js:50-62`. In 1v1 (in-memory JS), single-threaded event loop makes double-settle very unlikely. In group-chat (async + MongoDB), concurrent async paths can race before the save.
- INVARIANT: Gold balance never goes negative — enforced at `server/services/gold.js:124-126` (`balance < cost → fail`). HOLDS. Zero-cost free weapons explicitly allowed.
- INVARIANT: Turn timer reset on match end / room removal — enforced at `server/socket-io/main.js:579-582` (clearTurnTimer on removeRoom). HOLDS for normal paths; stale timer re-entrant call is guarded by `ms.status` check.
- ASSUMPTION: Physics self-damage is negative — ASSUMED by the sign convention in `calculateDamage` (physics.js:251, 260). NOT consistently consumed: 1v1 fire handler strips sign via `Math.abs`, group-chat lifecycle filters it out.
- ASSUMPTION: `consecutiveTimeouts` accurately reflects missed turns across reconnect — UNVALIDATED: the counter is on the in-memory `ms` object but is NOT remapped during the 30s reconnect window at `server/socket-io/main.js:1820-1830`.
- ASSUMPTION: Each referral reward fires exactly once — VALIDATED via `referralRewardedAt: null` atomic guard, but the two-step write means inviter reward can be lost on crash.

## Risk Observations (Prioritized)

1. **Self-damage sign erasure** (`main.js:3811`): Physics returns negative for self-hits; `Math.abs()` converts these to positive HP deductions. A player who shoots themselves loses HP. While this may be intentional gameplay, it is inconsistent with group-chat (which silently ignores self-damage). More critically, the HP deduction increments `turnCount` and advances turn normally — no separate tracking that it was self-damage. Worth confirming if intentional.
2. **Group-chat double-settle race** (`lifecycle.js:804-873`): `settleMatch` checks `if (match.state !== 'active') return` then asynchronously saves and triggers escrow. Two concurrent paths (parallel idle-timeout and shot) could both pass the guard with the same stale `match` object. Escrow settle is idempotent on-chain (Anchor prevents double-spend), but the MongoDB state and chat messages would be duplicated.
3. **`confirmDeposit` double-activation** (`lifecycle.js:254-276`): No mutex around the last-depositor path. If two identical `confirmGroupDeposit` events arrive before either is fully processed (Socket.IO deliver-once not guaranteed under disconnect/reconnect), `activateMatch` could run twice, generating two terrain seeds, two first-turn timers, and two Telegram match-start messages.
4. **Weapon inventory bypass on absent player slot** (`main.js:3714`): If `inventory[this.id]` is undefined (fresh reconnect before `weaponInventories` is rehydrated), the ownership check is skipped. An attacker who reconnects at the right moment could fire prestige weapons they haven't purchased.
5. **Turn sequence nonce optional** (`main.js:3690-3696`): `if (clientSeq !== undefined)` — a client that simply omits `seq` from its fire payload completely bypasses the idempotency guard. Socket.IO auto-retry of a fire event without `seq` would double-fire.
6. **`stepLeft`/`stepRight` null-currentTurn bypass** (`main.js:4561, 4595`): Guard is `ms.currentTurn && ms.currentTurn !== client.id`. When `currentTurn` is null (round just ended), the condition is falsy — any player can step freely before the next round starts.
7. **Auto-forfeit counter reset via reconnect** (`main.js:676-681, 1820`): `consecutiveTimeouts` lives in `ms` (in-memory matchState), not remapped on reconnect. Reconnecting within the 30s window resets the socket ID but retains the `ms` object unchanged — however the `consecutiveTimeouts[oldSocketId]` key is now orphaned. The player's new socketId has no counter and starts fresh. Three timeouts → reconnect → fresh three more timeouts possible indefinitely.
8. **`joinChallenge` no wager pre-check** (`main.js:2277-2325`): Wagered challenge acceptance deferred to `joinRoom`. Between accept and join, a user can share the challenge deep link — multiple acceptors could `joinRoom` before the challenger's intended opponent, which the `room.players.length >= room.maxPlayers` guard handles, but there is no per-challenge acceptor-lock.
9. **`isMatchOver` tiebreaker correctness** (`match.js:304-331`): `damageDealtTotal` is accumulated in `getRoundPlacement` from `ms.scores`. If scores are not updated (e.g., weapons that deal 0 damage like Dirt Ball, Magic Wall), all players have equal damage — tiebreaker falls to array order of `tied.sort()` which sorts by damage descending with no secondary determinism. Last in `tied` array is picked if all damage equal — deterministic but arbitrary.
10. **Referral inviter write not atomic** (`referrals.js:145-155`): Referee update is guarded; inviter update is a plain `findOneAndUpdate` with no conditional guard. Server crash between the two writes permanently loses the inviter's reward with no recovery path.

## Novel Attack Surface

- **Reconnect timing + weapon inventory gap**: During the 30-second reconnect window, `weaponInventories[roomId]` retains the old socket ID as key (migrated at line 1827). But if a player connects with a fresh socket (not within the window), inventory is never initialized for that socket — the `if (inventory && inventory[this.id])` guard in the fire handler evaluates false and skips ownership check entirely. An attacker who deliberately causes their socket to arrive outside the reconnect window (by waiting 31+ seconds) but then exploits a stale match state where their roomId is still valid could fire prestige weapons for free.
- **`seq` nonce is undefined-optional**: The nonce system was added to prevent Socket.IO retry duplicates, but a crafted client that omits `seq` entirely bypasses it. A websocket proxy that replays a fire packet without a `seq` field would double-fire.
- **Self-damage as HP-drain strategy in group-chat bypass**: Group-chat ignores self-damage (`dmg <= 0` filter). In a group-chat wagered match, a player who intentionally fires at themselves deals 0 HP loss but resets their `consecutiveMissedTurns` counter — they can stall indefinitely by self-targeting without ever being auto-forfeited.

## Cross-Focus Handoffs

- → **ERR-02 (Race Conditions)**: `confirmDeposit` → `activateMatch` double-activation is a concurrency issue. The group-chat `handleShot` + `handleIdleTimeout` concurrent settle is also a race. Both need mutex analysis.
- → **LOGIC-02 (Financial Logic)**: The self-damage `Math.abs()` pattern could interact with gold economy — verify gold is not erroneously awarded when self-damage is applied (it isn't currently, but the HP deduction + kill tracking paths diverge).
- → **AUTH-03 (Authorization)**: Weapon inventory bypass on missing socket entry overlaps with the reconnect auth gap. The fire handler's ownership check silence-passes when `inventory[this.id]` is absent — this is both a logic and auth issue.
- → **ERR-01 (Error Handling)**: `settleMatch` in group-chat runs escrow settlement inside a `setImmediate` with individual try/catch — if escrow settle fails, MongoDB state is already `settled` but on-chain is not. The eventual-consistency comment says permissionless reclaim fires after 24h, but that applies only to v2 escrow. Needs cross-check with CHAIN-01.

## Trust Boundaries

The 1v1 match lifecycle trusts the server's in-memory match state as authoritative. Clients supply fire parameters (angle, power, weaponId, seq, position) — all validated server-side. The only weak spots are (a) the nonce being optional, (b) position tolerance of ±100px which is generous, and (c) the weapon inventory check that silently passes on missing entries. Group-chat lifecycle trusts MongoDB as state of record. The async, multi-caller nature of group-chat introduces race windows not present in the single-threaded 1v1 socket flow. Referral attribution trusts a URL deep-link parameter (`rf_<code>`) but validates it before writing. The two-step reward write is the boundary gap. Gold and weapon inventory are entirely server-controlled — no client can inject a balance or add to inventory except through validated socket events.
<!-- CONDENSED_SUMMARY_END -->

---

# LOGIC-01: Business Logic & Workflow Security — Full Analysis

## Executive Summary

SolShot's business logic layer covers two distinct match architectures: a real-time 1v1 Socket.IO loop (`server/socket-io/main.js`) and an async Telegram group-chat match lifecycle (`server/services/groupchat/lifecycle.js` + `server/socket-io/groupchat.js`). Both share core physics (`server/services/physics.js`) and gold economy (`server/services/gold.js`), but implement damage application, turn validation, and settlement in independent code paths with subtle behavioral differences.

The state machine in `server/services/match.js` provides a well-structured `TRANSITIONS` map and `validateAction` guard used by 1v1. Group-chat uses its own state model persisted in MongoDB (`lobby → awaiting_deposits → active → settled/cancelled`). Neither path has distributed locking; 1v1 relies on JavaScript's single-threaded event loop; group-chat relies on MongoDB document saves with no optimistic concurrency control.

**12 concerns identified. 1 critical (self-damage sign erasure with `Math.abs`), 4 high (double-settle race, double-activation on deposit confirm, weapon inventory bypass, seq nonce optional), 5 medium, 2 low.**

## Scope

**In scope:** Match state transitions, player join/leave, turn order, weapon inventory purchase and use, gold balance, group-chat lifecycle states, self-targeting physics, forfeit logic, auto-forfeit after 3 missed turns, idle timeout HP penalty, trophy/prestige, referral attribution.

**Out of scope:** Anchor on-chain programs (SOS scope), escrow math details (LOGIC-02 scope), JWT/auth (AUTH-01/AUTH-03 scope).

## Key Mechanisms

### 1v1 Match State Machine (`server/services/match.js`)

States: `LOBBY → WEAPON_SHOP → BATTLE → ROUND_END → SETTLING → COMPLETE` (or `CANCELLED` from any).

`transitionState(matchState, newState)` checks the `TRANSITIONS` map and updates `matchState.status` in-place. This is purely in-memory — no MongoDB persistence. If the server restarts during a match, state is lost.

`validateAction(currentState, action)` maps states to allowed action names. Notably, `shoot` and `fire` are both in the `BATTLE` allowed set (legacy relay + authoritative event). `buyWeapon` is in `WEAPON_SHOP` only. `giveTurn`/`requestTurn` are in `BATTLE`.

The transition `LOBBY → BATTLE` (skipping WEAPON_SHOP) is permitted per the `TRANSITIONS` map — used in Practice mode.

### Turn Sequencing (1v1)

`getNextTurn(matchState)` in `match.js` uses `crypto.randomInt` for the first turn of each round, then cycles through `players[]` skipping `alive[id] === false`. It mutates `matchState.currentPlayerIndex` and `matchState.currentTurn`.

`turnSequence` nonce increments each time the fire handler processes a valid shot. Client must echo it in `data.seq`. The guard: `if (clientSeq !== undefined) { if (clientSeq !== ms.turnSequence) reject }`. A client omitting `seq` entirely bypasses this guard (`clientSeq` would be `undefined`, skipping the block). This is the only replay protection — without it, Socket.IO's automatic retry on disconnect could deliver a fire event twice.

### Weapon Inventory (1v1)

`weaponInventories[roomId][socketId]` is an array of owned weapon IDs, initialised to `[0]` (Single Shot). Purchases add IDs. The fire handler's ownership check:

```js
const inventory = weaponInventories[this.roomId]
if (inventory && inventory[this.id]) {
    if (!inventory[this.id].includes(weaponId)) { reject }
}
```

If `inventory` exists but `inventory[this.id]` is falsy/absent, the check is silently skipped. This can occur if:
- The player reconnects and `weaponInventories` is migrated (line 1827) but there is a timing window where `inventory[newSocketId]` hasn't been set yet.
- Practice mode initialises inventory but the slot is missing for one player.

### Self-Damage Inconsistency (`physics.js` vs `main.js`)

`calculateDamage` (physics.js:216) returns **negative** values for the shooter (`damage[tank.id] = ... - ...`). This is the intended sign convention to indicate self-damage vs opponent damage.

**1v1 fire handler** (main.js:3811):
```js
ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))
```
`Math.abs()` erases the negative sign — self-damage (negative `dmg`) is treated identically to opponent damage and reduces HP. Gold is NOT awarded for self-damage (the gold loop checks `playerId !== this.id && dmg > 0`), but HP still decrements.

**Group-chat lifecycle** (lifecycle.js:620):
```js
for (const [targetId, dmg] of Object.entries(result.damage || {})) {
    if (!dmg || dmg <= 0) continue;
```
Negative self-damage is filtered out entirely — no HP loss for self-hits in group-chat.

**Behavioral inconsistency**: self-hits deal real HP damage in 1v1 but have no effect in group-chat. In 1v1, a player can reduce their own HP to 0, triggering elimination and round-end logic (including settlement), with no kill credit awarded to the opponent.

**In the AI practice path** (main.js:955), the same `Math.abs(dmg)` is used — self-damage during AI matches also reduces HP.

### Group-Chat State Lifecycle (`lifecycle.js`)

States: `lobby → awaiting_deposits → active → settled | cancelled`.

`startMatch` checks `match.state !== 'lobby'` and `players.length < minPlayers`. Then either `beginWageredDepositPhase` (wagered) or `activateMatch` (free).

`confirmDeposit` checks `match.state !== 'awaiting_deposits'` and whether the player already has `initialDepositTx`. On last depositor, calls `activateMatch(match)` immediately. There is no mutex — two concurrent `confirmGroupDeposit` socket events for the last depositor could both pass the `!match.players[playerIdx].initialDepositTx` check before either saves.

`settleMatch` checks `if (match.state !== 'active') return` — but this is checked on the in-memory `match` object. Two concurrent async paths (e.g., idle timeout fires while a shot is being processed) could both have `match.state === 'active'` when they read it, before either save. Node.js single-threaded event loop makes this rare for same-event-loop tick, but `await`-yielding code paths break the atomicity.

`handleShot` → `checkAndSettle` → `settleMatch` are awaited in sequence. `handleIdleTimeout` also calls `checkAndSettle`. These can run concurrently if both are triggered close together (one idle timeout fires while a shot is being processed in the queue). The `setImmediate` inside `settleMatch` for post-settlement work (chat post, escrow settle) means the on-chain settle could also double-fire.

### Gold Economy (`gold.js`)

All gold operations are synchronous in-memory (1v1) or via atomic MongoDB update (group-chat purchase). `spendGold` checks `balance < cost` before deducting. `earnGold` adds to balance. No negative balance possible.

Placement gold (`awardPlacementGold`) uses `PLACEMENT_GOLD = [300, 150, 75, 0]` for ranks 1-4. Awarded once per round end from `getRoundPlacement` → `awardPlacementGold`. Correctly uses placement index, not raw score.

Gold from self-damage: `earnGold` is called with `dmg > 0 && playerId !== this.id` condition — so self-damage earns no gold. This is consistent across 1v1 and group-chat.

### Forfeit and Auto-Forfeit

**1v1 auto-forfeit** (main.js:676-800): `consecutiveTimeouts[currentTurnId]` incremented on each turn timer expiry. At `>= 3`, player is eliminated and opponent wins. The counter is on `ms` (in-memory matchState keyed by `roomId`). On reconnect, `ms` is preserved but the `consecutiveTimeouts` map is keyed by socket ID. The reconnect handler at line 1820-1830 migrates gold, inventory, and wager states by old→new socket ID, but does NOT remap `consecutiveTimeouts[oldSocketId]`. Post-reconnect, `consecutiveTimeouts[newSocketId]` is undefined/0 — the counter resets. A player can exploit this: time out, reconnect within 30s, repeat — evading the 3-strike forfeit indefinitely.

**Group-chat forfeit** (`handleForfeit`, lifecycle.js:360-392): validates match active, player exists, not already eliminated. Sets `player.hp = 0; player.eliminated = true`. Checks `checkAndSettle` first (correct ordering), then calls `advanceTurn`. Does NOT reset `consecutiveMissedTurns` — the field is only reset via `handleShot`. After a voluntary forfeit, if the forfeiter's counter was e.g. 2, it stays at 2. On the next match (if they rejoin after forfeit), the counter would persist in the MongoDB document — but since `eliminated=true`, `advanceTurn` skips them, so this is cosmetic only.

**Group-chat idle HP penalty** (`handleIdleTimeout`, lifecycle.js:399-459): fetches match fresh from DB. Applies `penalty = match.config.idlePenaltyHp`. At `consecutiveMissedTurns >= 3`, eliminates. HP penalty is applied BEFORE the 3-strike check — so if a player's HP is already low from idle penalties, they may die from penalty damage before the 3rd strike. The elimination `cause` in that case would be `'idle'` not `'forfeit'` even if they've missed 3 turns — cosmetic issue. The `if (player.consecutiveMissedTurns >= 3)` check follows the HP decrement but explicitly overwrites `player.hp = 0` on strike 3, so HP=0 from penalty is treated consistently.

### Self-Targeting

Self-targeting is mechanically possible and produces negative damage values from the physics engine. As analyzed above:
- 1v1: self-damage reduces HP (Math.abs bug)
- Group-chat: self-damage filtered, no HP change
- Neither path prevents a player from aiming at themselves

A player aiming at themselves in a 1v1 wagered match could intentionally reduce their own HP to 0, losing the match — effectively a voluntary surrender path outside the forfeit flow. No gold is lost for self-kills (kill bonus only applies to opponent kills), but the match settles against them.

### Referral Attribution (`referrals.js`)

`attributeReferrer`: idempotent, first-attribution-wins, self-referral rejected. Correct.

`processReferralReward`: 
1. Atomic `findOneAndUpdate` stamps `referralRewardedAt: null` as a condition — if another call races, the second write returns null and no-ops. Race-safe for referee.
2. Inviter update is a separate `findOneAndUpdate` with no condition guard. If server crashes between writes, referee has `referralRewardedAt` set but inviter was never paid. No recovery path.

### Trophy/Prestige Logic

`recordMatchPlayed` in `shot-token.js` is called after settlement. Prestige unlock is guarded in main.js by `verifyBurnTransaction`. The HANDOVER notes that `C-10 (Prestige Burn Double-Unlock Race)` is a RECHECK item — two concurrent `prestigeBurn` events with same `txSignature` could both pass the in-memory replay Set before either adds it. This overlaps LOGIC-01 but is primarily LOGIC-02/SEC-01 territory.

Trophy DM dispatch in group-chat (`dispatchGroupVictoryDm`) runs inside `setImmediate` after `settleMatch`. If `settleMatch` is called twice (double-settle race), the DM would fire twice. Cosmetic but visible.

### `joinChallenge` (Challenge Workflow)

`joinChallenge` (main.js:2277) does NOT verify auth or wallet balance for wagered challenges — it just checks that the challenge exists, the room exists, and the room isn't full. The wagered-challenge constraint (`wager > 0 && !requireAuth`) is only applied at `createChallengeRoom` for the host. The acceptor's auth is deferred to `joinRoom` which is a separate event. 

Between `challengeAccepted` emitted and `joinRoom` called, there is no reservation — multiple sockets could accept the same challenge and try to join. The `room.players.length >= room.maxPlayers` guard stops them at join time, but the DB `markAccepted` + `markMatched` calls happen on first joiner only (best-effort with `.catch`).

## Trust Model

**1v1**: Server enforces turn ownership (socket ID match), weapon ownership (inventory check, with gap when entry absent), state transitions (validateAction), physics (server-authoritative processShot), and gold. Client supplies fire parameters only. The weak spot is the optional nonce and the inventory-absent bypass.

**Group-chat**: Server enforces turn ownership via `firerIdx !== match.currentPlayerIndex`, weapon ownership via `ownedWeapons.includes()`, state via `match.state === 'active'` guard. All backed by MongoDB reads + saves. The weak spot is the lack of an atomic lock — concurrent async operations can both pass guards before either persists.

**Referral**: Attribution and reward are largely atomic-guarded. The non-atomic two-step inviter reward is a gap.

## State Analysis

### In-Memory (1v1)

- `matchStates[roomId]` — LOBBY/WEAPON_SHOP/BATTLE/ROUND_END/SETTLING/COMPLETE/CANCELLED
- `goldStates[roomId]` — `{[socketId]: balance}`
- `weaponInventories[roomId]` — `{[socketId]: weaponId[]}`
- `wagerStates[roomId]` — wager amount + wallet addresses
- `turnTimers[roomId]` — `setTimeout` reference
- `consecutiveTimeouts` — nested inside matchState, keyed by socketId (NOT remapped on reconnect)

### MongoDB (Group-chat)

- `GroupMatch.state` — `lobby|awaiting_deposits|active|settled|cancelled`
- `GroupMatch.players[].gold`, `.weapons`, `.hp`, `.eliminated`, `.consecutiveMissedTurns`
- `GroupMatch.currentPlayerIndex` — turn pointer

## Focus-Specific Analysis

### State Transition Guard Completeness

| State | Guard Location | Strength |
|-------|---------------|----------|
| `transitionState` (1v1) | `match.js:50-62` | Strong (enum map, in-memory) |
| `settleMatch` (group-chat) | `lifecycle.js:804` | Weak (non-atomic, stale object) |
| `confirmDeposit → activateMatch` | `lifecycle.js:262-274` | Weak (no mutex on last-depositor path) |
| `forfeitGroupMatch` | `groupchat.js:242, lifecycle.js:363-368` | Strong (state + membership + eliminated checks) |
| `fireGroupShot` turn check | `lifecycle.js:555-558` | Strong (index check + eliminated check) |
| `buyWeapon` (1v1) | `main.js:2905-2907` | Strong (validateAction in WEAPON_SHOP) |
| `purchaseGroupWeapon` | `groupchat.js:295-322` | Strong (atomic findOneAndUpdate) |

### Player Join/Leave

1v1: `joinRoom` handler verifies the room exists, max players not reached, not already in room. No late-join after match starts (BATTLE state join would be possible if someone calls joinRoom with a valid roomId while in BATTLE — need to verify the guard).

Group-chat: `joinGroupBattle` (from `groupchat/index.js`, not audited directly) is assumed to check state. HANDOVER has no specific note on this.

### Gold Spend Before Earn

Gold is credited after damage in 1v1 (fire → earnGold), not before. Weapons are purchased in WEAPON_SHOP phase before BATTLE starts. No path where gold is debited before it's available — `spendGold` returns `{success: false}` on insufficient balance. Ordering is correct.

## Cross-Focus Intersections

- **ERR-02**: `confirmDeposit` race and `settleMatch` concurrent call are race conditions → ERR-02 should cover the mutex gap.
- **AUTH-03**: Weapon inventory bypass when `inventory[this.id]` absent → AUTH-03's authorization analysis should catch the missing ownership enforcement.
- **LOGIC-02**: Self-damage HP deduction interacts with gold economy (gold correctly skips self-damage, HP incorrectly applies it) — the two are now divergent.
- **ERR-01**: `settleMatch` in `setImmediate` — if escrow settle throws, the catch only logs; MongoDB is already `settled`. ERR-01 should flag the fire-and-forget settlement chain.

## Cross-Reference Handoffs

- **→ ERR-02**: Investigate mutex gap in `lifecycle.js:confirmDeposit` and `handleShot → checkAndSettle`. Specifically: can two concurrent `confirmGroupDeposit` events both pass the `!initialDepositTx` guard before either save?
- **→ AUTH-03**: Verify weapon inventory check gap at `main.js:3714-3720`. The `if (inventory && inventory[this.id])` pattern allows prestige weapons to fire if the per-player inventory slot is absent.
- **→ LOGIC-02**: Confirm whether self-damage HP reduction in 1v1 is intentional game design or a bug. If intentional, document; if bug, flag for LOGIC-02 since it could affect wagered match outcomes.
- **→ ERR-01**: `settleMatch` (lifecycle.js:848-870) runs escrow settlement inside `setImmediate` with try/catch that only logs on failure. If the match is already marked `settled` in MongoDB but escrow settle fails, no retry mechanism exists beyond the 24h permissionless reclaim. Does this interact with the group-chat's `cancelWageredEscrow` recovery path?

## Risk Observations

(See Condensed Summary for prioritized list — reproduced here with additional detail.)

### CRIT-L01: Self-Damage Sign Erasure in 1v1 Fire Handler

**File:** `server/socket-io/main.js:3811`  
**Code:** `ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))`  
**Physics returns:** negative `dmg` for self-hits (physics.js:251, 260)  
**Effect:** `Math.abs` erases the negative sign → self-damage deducts HP identically to opponent damage.  
**Inconsistency:** Group-chat filters `dmg <= 0`, so self-damage has zero effect there.  
**Wagered impact:** In a 1v1 wagered match, self-damage can eliminate the shooter, awarding the opponent the pot without any opponent action. This is ambiguously intentional (deliberate suicide forfeits the pot) or a bug. No `forfeitReason` is emitted for self-kills — the round ends normally.

### HIGH-L01: Group-Chat `settleMatch` Double-Call Race

**File:** `server/services/groupchat/lifecycle.js:804`  
**Guard:** `if (match.state !== 'active') return` — checked on in-memory object.  
**Race path:** `handleShot` and `handleIdleTimeout` both run async. If the idle timer fires while a shot is being processed, two concurrent `checkAndSettle` calls can both read `match.state === 'active'` before either saves `settled`. The `setImmediate` for escrow settle means two CPI calls to `settleMatchEscrowV2` could fire.  
**Mitigation:** Anchor's settle instruction checks that the match hasn't been settled already, preventing double on-chain payout. But MongoDB gets two `match.state = 'settled'` saves, two trophy DMs, two chat messages.

### HIGH-L02: `confirmDeposit` Double-Activation

**File:** `server/services/groupchat/lifecycle.js:262-274`  
**Guard:** `if (match.players[playerIdx].initialDepositTx)` — idempotency check. But the read-check-write is not atomic. Two concurrent last-deposit events can both read `!initialDepositTx`, both pass, both call `activateMatch`.  
**Effect:** Two terrain seeds generated, two turn timers scheduled, two Telegram match-start messages sent, `match.state = 'active'` saved twice.

### HIGH-L03: Weapon Inventory Bypass on Absent Socket Entry

**File:** `server/socket-io/main.js:3714-3720`  
**Code:** `if (inventory && inventory[this.id]) { ... }` — silently skips if entry missing.  
**Trigger:** Reconnect within 30s migrates the inventory entry (line 1827), but there is a brief window between the socket being assigned a new ID and the migration running. Also, any code path that creates a match without initialising the inventory entry for a player (e.g., Practice mode edge cases) leaves the slot absent.

### HIGH-L04: Turn Sequence Nonce Optional

**File:** `server/socket-io/main.js:3690-3696`  
**Code:** `if (clientSeq !== undefined) { ... }` — nonce check skipped if `seq` absent.  
**Effect:** Socket.IO automatic retry of a fire event that omits `seq` would process the same shot twice, awarding HP damage and gold twice.

## Novel Attack Surface Observations

1. **Reconnect-to-reset auto-forfeit counter**: The 30-second reconnect window was designed for network reliability, but `consecutiveTimeouts[socketId]` is keyed by socket ID, not player identity. Reconnect migrates wallet/gold/inventory but not timeout counter. An idle player can reconnect every 29 seconds to evade auto-forfeit indefinitely. This is a deliberate DoS against the match — the idle player never takes a turn, the opponent's turn timer repeatedly counts down, and the match is held hostage.

2. **Self-damage suicide strategy in wagered 1v1**: With `Math.abs(dmg)` applying self-damage, a player who knows they are losing can fire at themselves, reduce HP to 0, and trigger the end-of-round/match flow. In a BO3/BO5 match where they're down in placement points, deliberately dying to "bank" the opponent's 3 placement points for a round they'd have lost anyway could be strategic. But if both players are close to 0 HP and one self-destructs, the round ends "by the current player's action" rather than after the opponent fires — the opponent wins the round without expending a turn.

3. **Group-chat self-firing stall via misses counter reset**: In group-chat, self-damage is ignored (`dmg <= 0` filter). This means a player can fire at themselves (which returns negative damage), the shot is processed, `consecutiveMissedTurns` is reset to 0, but no HP is changed. This allows indefinite stalling — the player never dies from idle, never makes progress, but keeps their turn counter clean. This was already noted above but deserves emphasis as a wagered-match griefing vector.

## Questions for Other Focus Areas

1. **ERR-02**: Is there a `withLock()` (from guards.js) applied to `handleShot` or `handleIdleTimeout` in group-chat? The HANDOVER mentions `withLock` exists but is applied only to settlement in 1v1. Group-chat appears unprotected.
2. **AUTH-03**: Is `tgIdFor` in `groupchat.js` the sole identity gate for `fireGroupShot`? The dev fallback (`NODE_ENV !== 'production'`) is noted in HANDOVER. If NODE_ENV is not set on Render (defaults to undefined or 'development'), does the fallback activate in production?
3. **LOGIC-02**: Does the on-chain Anchor escrow program have its own settle-idempotency check that would prevent double-settlement from the `settleMatch` race? HANDOVER notes this, but explicit confirmation from CHAIN-01/LOGIC-02 analysis would close the loop.

## Raw Notes

- `TRANSITIONS` map in match.js intentionally allows `LOBBY → BATTLE` (skips shop). Used in Practice mode. Documented via comment.
- `buyWeapon` handler in main.js checks `validateAction(ms.status, 'buyWeapon')` — but `buyWeapon` is NOT in `validateAction`'s allowed map (only `buy` equivalent is absent). Need to verify: `getAllLaunchWeapons()` is what populates the shop, and `getWeapon(weaponId)` validates the weapon exists. The `validateAction` check would reject buyWeapon during BATTLE (correct) — but the allowed action name `'buyWeapon'` isn't in any state's list either. This means `validateAction(ms.status, 'buyWeapon')` always returns false. The check at line 2905 would always block weapon purchases. Need to re-read — likely the actual check is on a different action name or the handler checks WEAPON_SHOP state differently.
  - Re-check: `validateAction` at `match.js:71-85` — `WEAPON_SHOP` allows `['buyWeapon', 'shopDone']`. So `buyWeapon` IS valid in WEAPON_SHOP state. The check at main.js:2905 correctly blocks buys outside WEAPON_SHOP. Resolved — no issue.
- `LOBBY → WEAPON_SHOP → BATTLE` or `LOBBY → BATTLE`: the former starts the shop timer (25s); the latter skips directly to battle. Practice mode uses the skip path.
- Gold placement award (`awardPlacementGold`) is called from the fire handler after `getRoundPlacement`. The 4th place player gets 0 gold (PLACEMENT_GOLD[3] = 0). This is intentional per the spec.
- `damageDealtTotal` tiebreaker in `isMatchOver` uses cumulative damage across all rounds. No exploit apparent — attacker can't manipulate their own score without actually dealing damage to opponents.
- `computeRanking` in lifecycle.js has a `buybackCount` field in the sort logic — this implies a buyback mechanic exists or was planned. Not wired in the current codebase (no `buyback` handler visible). The field defaults to 0. Low risk, but dead code in the sort is worth noting.
