# DB Phase 1 — Bundle 3: DATA / SOCKETS / LOGIC / ERR

**Audit:** db-solshot-2026-05-28 (#3)
**Git ref:** `da04b5e`
**Files in scope:** `server/socket-io/main.js` (5,198 LOC), `server/models/User.js`, `server/models/FunnelEvent.js`, `server/services/funnel.js`, `server/services/users.js`, `server/index.js` (admin + wallet routes), `server/scripts/wipe-user.mjs`, `server/scripts/dedupe-funnel-oneshots.mjs`, `server/scripts/reconcile-wallets.mjs`, `server/scripts/find-user.mjs`.

This bundle covers the bulk of off-chain attack surface: identity/wallet rotation logic, the 51 socket handlers in main.js, mongo write paths, error swallowing patterns, and operational scripts.

---

## PART 1 — Prior-finding re-status

### H013/H014/H015/H016 — Server-side handling of refund / settle CPI outcomes

**Verdict: SUBSTANTIALLY CLOSED. Server now propagates failure correctly.**

Three independent call sites in `main.js` invoke `settleMatch()`:
- `main.js:1062` — 3-consecutive-timeout forfeit at line ~1050. Wraps in try/catch + checks `result.success`; on failure calls `handleSettlementFailure(roomId, roomSnapshot, wsSnapshot, …)`. Transitions match state to `CANCELLED` (NOT `COMPLETE`) on failure. Captures `roomSnapshot` + `wsSnapshot` BEFORE the call so retry logic can fire after `removeRoom()` destroys live state. Funnel events only emitted on success. **PROPERLY HANDLED.**
- `main.js:2007` — disconnect forfeit-settle (1v1 branch, N>2 short-circuits per Bug 6 at line 1909). Wraps in try/catch, checks `result.success`, calls `handleSettlementFailure` on failure path, transitions to `CANCELLED`. **PROPERLY HANDLED.**
- `main.js:4529` — natural match-end settlement (winner-take-all). Same pattern: try/catch, success check, snapshot capture, `handleSettlementFailure` on failure.

`refundWager()` call site at `main.js:2048` (lobby-state cancel) is the WEAKEST: it ignores the result entirely. No `.success` check, no funnel suppression, no user notification. If the v1 cancel CPI throws or returns failure, the room is removed and the lobby is torn down silently — depositors of partial-deposit lobbies could be told "match cancelled" while their lamports remain locked on-chain (until 1200s permissionless_reclaim). **OPEN — LOW severity for V1 (LOBBY state means no deposits yet for the standard path, but the `refundWager()` call only fires when `ws.amount > 0`, implying the caller anticipated a deposit could have landed).**

`cancelEscrowSafely()` wrapper at `main.js:731` (used everywhere except line 2048) does dispatch v1/v2, logs failures, and returns `{success:false, error}` for caller propagation. The 60-second retry queue at `main.js:562` retries up to 5x then drops; H037 retained: after 5 attempts the entry is silently `delete`d. NEW: a `data.contiguous === false` early-skip at line 571 — non-contiguous masks are dropped immediately from retry (avoids spamming the on-chain InvalidPlayer error). The admin-notification path `adminNotifications.js` was added per the handover but is NOT wired into the silent-drop after-5-retries branch.

**Net:** four of five settle/refund paths now correctly propagate failure into `MATCH_STATES.CANCELLED`. The one weak path (line 2048 `refundWager()` in cleanupRoom's LOBBY branch) is low-risk because LOBBY state should only have wager but no deposit confirmations — but the function is being invoked nonetheless. Recommend: replace with `await cancelEscrowSafely(...)` for consistency.

### H018 / H019 / H020 / H022 — Legacy unauthenticated socket events

**Verdict: H018, H019, H020 RESOLVED. H022 lives in groupchat.js (out of bundle scope — flag for Bundle 2 or carry-forward).**

Verification matrix:

| ID | Event | File:line | Auth gate present? |
|----|-------|-----------|---------------------|
| H018 | `shoot` | `main.js:3841-3868` | YES. `requireAuth` at 3842; also rejects when `currentTurn !== this.id` at 3850 (spectator-spoof protection). |
| H019 | `acceptChallenge` | `main.js:3719-3736` | YES. `requireAuth` at 3723 ("H019 fix") + comment naming the prior finding. |
| H019 | `declineChallenge` | `main.js:3738-3749` | YES. `requireAuth` at 3740 ("H019 fix"). |
| H020 | `clientDebugLog` | `main.js:1656-1674` | YES. `if (!client.isAuthenticated) return` at 1661 ("H020 fix" comment). |
| H022 | `getGroupMatch` | `server/socket-io/groupchat.js:97` | NOT IN THIS BUNDLE — carry forward to groupchat audit. |

Three of four CRITICAL legacy-relay findings explicitly closed with named-fix code comments and stable gate patterns. The `requireAuthIfWagered` helper at `main.js:786` cleanly distinguishes practice (no gate) from wagered (gate enforced) — this is the right model for SolShot's hybrid free-play + paid surface.

**Counting all event handlers gated for wagered state mutation:** 28 of 51 socket events apply some auth gate; the others are read-only / lobby-listing (`getRooms`, `getInviteLink`, `getStats`, `getLeaderboard`, `getCosmetics`, `getShotInfo`, `getShotPrice`, `getWeaponArray`) or pre-auth identity flows (`authenticate`, `registerIdentity`). The unsealed gaps are intentional. **AUTH gating density is now adequate for V1.**

### H023-related — depositMask atomicity vs server in-memory state

**Verdict: ALIGNED with S2-T7. Server uses on-chain `depositsMask` for the depositor count.**

In `escrowDepositConfirm` (`main.js:3873-3995`):
1. Fetch on-chain state via `getEscrowStateFor(rid, room.players.length)` with one retry (2-sec delay for devnet confirmation lag) — line 3908-3913.
2. Find the socket's player index against `room.players` — line 3921.
3. Check the bit via `(escrowState.depositsMask & (1 << playerIndex)) !== 0` — line 3926.
4. Confirm wagerLamports matches on-chain — line 3935. Guards against amount spoofing.
5. Idempotent guard at line 3898 — duplicate `escrowDepositConfirm` for the same socket is dropped.
6. After verification, server records `ws.deposits[client.id] = txSignature` (line 3950) and broadcasts `escrowDepositStatus`.

The S2-T7 invariant ("server reads on-chain mask first") IS upheld for the deposit-confirm path. The `cancelEscrowSafely()` wrapper at `main.js:744-759` also defers to `cancelMatchEscrowV2` which itself self-derives from on-chain mask. **CLOSED.**

**Remaining server-side staleness risk:** `ws.deposits` is the in-memory tracker; the `getEscrowDepositors()` helper at line 680 reads ONLY from `ws.deposits` (not on-chain) when building the v1 cancel-list at line 765. For v1 (1v1) this matters less — only 2 possible masks (0b01, 0b11) are recoverable. For v2 the safe path at 744-759 fetches on-chain; v1 path at 762-781 trusts server state. **Acceptable for V1 since v1 path is 1v1 only and S2-T6 closed the wallet-rotation gap.**

### H047 — cleanupRoom race (Bug 6 N>2 branch verification)

**Verdict: NO RACE INTRODUCED. Single-threaded JS, no async gap, write-only mutations.**

The Bug 6 branch at `main.js:1909-1935`:
```js
const isMultiplayer = (room.players?.length || 0) > 2;
if (isMultiplayer) {
    if (ms.hp) ms.hp[client.id] = 0;
    if (ms.alive) ms.alive[client.id] = false;
    if (ms.currentTurn === client.id) {
        ms.currentTurn = getNextTurn(ms);
    }
    io.sockets.in(roomId).emit('playerLeft', {...});
    client.leave(roomId);
    client.roomId = null;
    client.isHost = false;
    return;
}
```

Analysis:
- All mutations are synchronous (assign to plain object props). No `await` between read and write.
- `getNextTurn(ms)` is sync (module-level helper).
- Node's single-threaded model means no concurrent fire handler can interleave with this block.
- BUT: there IS an async boundary BEFORE this block. The outer `cleanupRoom` is async, called from `disconnect` (line 2094) and `leaveRoom` (line 2102). Between `await removeFromAllQueues(...)` (in disconnect) and reaching this code, no other handler can run on the SAME socket — but a different player's `fire` handler could land in between.

A concurrent fire from a different socket can run before `cleanupRoom` zeros out `ms.hp[leaverId]`. Worst-case: the leaver's tank is targeted, damage applied to ms.hp[leaverId] (still 250 because cleanup hasn't run yet), then cleanup zeros it. No fund-loss, no state corruption — the leaver is dead either way. **NO MEANINGFUL RACE.**

**Edge concern (not a race):** the `playerLeft` emit at line 1923 includes `remainingPlayerCount: (room.players?.length || 1) - 1`. But `room.players` was NOT pruned in the N>2 branch — it's still the full array. So the count is off-by-one stale. Cosmetic only (HUD label), but worth fixing for consistency with the 1v1 disconnect path which DOES filter the array at line 2056.

**Bigger concern (separate):** in the N>2 path, the LEAVER is marked dead but kept in `room.players[]` AND kept in `ms.players[]`. The match continues until natural end. At settle time, `settleMatch()` looks up the winner's wallet from `ws.wallets[winnerSocketId]` — the leaver's wallet is preserved correctly. BUT: the rebroadcasted `playerLeft` carries `socketId: client.id` which lets the remaining clients render the leaver greyed out. **OK.**

### Funnel dedupe correctness

**Verdict: SOUND. Atomic upsert + sparse-unique partial-filter indexes + E11000 swallow.**

Index definitions in `models/FunnelEvent.js`:
- `oneshot_dedupe_wallet` — `{stage:1, walletAddress:1}` unique + `partialFilterExpression: {stage: {$in:['first_deposit','first_settle']}, walletAddress: {$type:'string'}}`
- `oneshot_dedupe_tg` — `{stage:1, telegramUserId:1}` unique + same partial filter on tg
- `oneshot_dedupe_uid` — `{stage:1, uid:1}` unique + same on uid

These are CORRECT — each one-shot stage gets a unique constraint per identity field. Concurrent emissions for the same identity hit the second one with E11000.

`funnel.js:60-78` `oneShotInsert()`:
```js
return FunnelEvent.findOneAndUpdate(
    dedupeQuery,
    { $setOnInsert: doc },
    { upsert: true, new: false, runValidators: true }
);
```
`findOneAndUpdate` + `upsert: true` + `$setOnInsert` is atomic — Mongo's `findAndModify` is single-document atomic. The race window between findOne and create is eliminated.

`funnel.js:55` swallows E11000 ONLY for one-shot stages:
```js
if (err?.code === 11000 && ONE_SHOT_STAGES.has(stage)) return;
```
This is correct — duplicate-key on one-shot is the EXPECTED outcome of a concurrent write. Other failures still log via `logger.warn`.

`runValidators: true` is set, which addresses H032 for funnel writes specifically (the broader H032 sweep across all `findOneAndUpdate` is still partial — see new findings below).

**Minor:** the dedupe-query priority at line 63-66 picks the strongest identity (wallet > tg > uid). If a client emits a stage with BOTH wallet AND tg, only the wallet path indexes. A subsequent emission with only tg (no wallet) would not deduplicate against the prior one. In practice the funnel events from `escrowDepositConfirm` and `settleMatch` always include wallet first, so the cross-identity dedupe gap doesn't trigger today.

---

## PART 2 — NEW findings and confirmations

### NF1 — `/api/admin/funnel` aggregate endpoint exposes no per-user PII (but uses identity counts)

**File:line:** `server/index.js:333-343` → `server/services/funnel.js:92-147`.
**Status:** REVIEWED — leak risk is LOW.
**Severity:** INFORMATIONAL.

The endpoint returns aggregates only (`{stage, count, uniqueIdentities, retentionFromPrev}`), gated by `requireAdminKey`. The aggregation pipeline uses `$addToSet` to count unique identities — but only the COUNT (`$size`) is projected, not the identity values. No wallets, no TG IDs leak via the response shape.

Admin-key compare uses `crypto.timingSafeEqual` per Bundle 1 (H083 fixed). Verify by reading `middleware/guards.js:requireAdminKey`.

**Recommendation:** None. Acceptable as-is.

### NF2 — `wipe-user.mjs` regex-based filter has no upper bound — typo wipes many docs

**File:line:** `server/scripts/wipe-user.mjs:35-37`.
**Status:** CONFIRMED.
**Severity:** MEDIUM (operational footgun — admin-only, requires WIPE_CONFIRM=YES).

The match filter is built from a single CLI arg:
```js
$or: [
    { username: new RegExp(needle, 'i') },
    { handle: new RegExp(needle, 'i') },
],
```

A short or empty-ish argument like `a` would match any user with an "a" in their handle (likely most). The dry-run guard at line 56 prints affected docs and refuses delete without `WIPE_CONFIRM=YES`, which materially reduces blast radius. But on a typed-by-mistake confirm, mass deletion is silent and irreversible (no soft-delete, no audit log).

**Recommendations:**
- Require `needle.length >= 3` minimum (most usernames are at least 3 chars).
- Add a hard cap: refuse if matches > 50, force `--force` flag.
- Write a deletion-audit row to a separate collection before deleteMany.

### NF3 — `find-user.mjs` accepts unbounded regex from CLI — ReDoS possible

**File:line:** `server/scripts/find-user.mjs:21`.
**Status:** CONFIRMED.
**Severity:** LOW (admin-only, blast radius = single script invocation).

`new RegExp(needle, 'i')` constructed from `process.argv[2]` with no validation. A malicious input like `(a+)+$` would cause catastrophic backtracking against any matching username — Mongo's `$regex` driver translates this to a Mongo regex, which has its own engine but is still susceptible to ReDoS-style queries against indexed fields if `i` flag is set (case-insensitive can skip index).

Since this is operator-only, the attack model is "operator's terminal is compromised OR operator typo." Blast radius: the script hangs, Mongo CPU spikes during the query. No fund-loss.

**Recommendations:**
- Reject `needle` if it contains regex-meta beyond plain chars + `-_.@`.
- Add `.limit(100)` to the find query.

### NF4 — `reconcile-wallets.mjs` `--fix` mode calls Privy for every TG-linked user without rate limit

**File:line:** `server/scripts/reconcile-wallets.mjs:135-177`.
**Status:** CONFIRMED.
**Severity:** LOW (operational, no fund-loss).

The script loads every User doc with `{telegramUserId: {$ne: null}, walletAddress: {$ne: null}}`, then for each one calls `lookupPrivyWallet(client, u.telegramUserId)` sequentially. No batching, no rate-limit. For 10K users this would exhaust the Privy API quota in a single run.

The `lookupPrivyWallet` helper itself only catches per-call errors — there's no aggregate failure threshold or circuit breaker. If Privy 429s after 1000 calls, the next 9000 silently emit `unfetchable++` and the script reports a misleadingly clean result.

**Recommendations:**
- Add `--limit N` flag to bound the batch size for incremental runs.
- Add `--rate-ms N` between calls (default 100ms = 10 calls/sec).
- On the 5th consecutive `unfetchable`, abort with non-zero exit and a warning.

### NF5 — `dedupe-funnel-oneshots.mjs` has NO confirmation guard

**File:line:** `server/scripts/dedupe-funnel-oneshots.mjs`.
**Status:** CONFIRMED.
**Severity:** MEDIUM (destructive, no confirmation, but idempotent + comment says "safe to re-run").

Unlike `wipe-user.mjs`, this script has NO `CONFIRM=YES` guard. Running it deletes duplicate rows immediately. The author's comment claims "idempotent. Safe to re-run." — true for the SPECIFIC operation (collapse duplicates to earliest), but a wrong MONGODB_URI (e.g. production instead of dev) would silently mutate production funnel data with no log of the prior state.

**Recommendations:**
- Add `FUNNEL_DEDUPE_CONFIRM=YES` env guard mirroring wipe-user.mjs.
- Print the connection target's database name at startup so the operator can confirm.
- Write removed-rows to a `funnel_events_archive` collection before delete (audit trail).

### NF6 — `escrowDepositStatus` STILL broadcasts wallet addresses of all room players cross-player

**File:line:** `server/socket-io/main.js:3966-3975`.
**Status:** OPEN (H030 from #2 carried forward — fix did not land).
**Severity:** HIGH.

```js
io.sockets.in(rid).emit('escrowDepositStatus', {
    roomId: rid,
    deposits: room.players.map(p => ({
        socketId: p.socketId,
        wallet: ws.wallets?.[p.socketId] || null,    // ← every player's wallet visible to every other player
        confirmed: !!(ws.deposits?.[p.socketId]),
    })),
    numDeposited: Object.keys(ws.deposits || {}).length,
    totalPlayers: room.players.length,
})
```

Every wallet in the room is broadcast to every player. Wallet addresses are public on-chain so this isn't a "secret" leak — but it allows real-time cross-correlation between SolShot socketIds and Solana addresses. Combined with TG-validated initData mapping, this creates a TG-user → wallet linkage exposed to ANY opponent in the same room. The escrowDepositStatus event fires before the match starts, so any joiner — including stealth/bot queue-fillers — captures the host's wallet.

Compounds with H068 (TG-ID + wallet co-logging): an attacker can join a room, harvest the host's wallet via `escrowDepositStatus`, then correlate via the in-game leaderboard (`getLeaderboard` returns handle + stats) and the eventual challenge card (which shows handle plus Privy callsign).

**Recommendation:** for each socket, send only their own wallet plus other players' `confirmed` flag without the wallet field. Or, broadcast a shortened/hashed identifier.

### NF7 — `walletHistory[]` is unbounded — attacker-driven rotation churn DoS-able

**File:line:** `server/models/User.js:16-23`, `server/services/users.js:81-84`.
**Status:** CONFIRMED.
**Severity:** LOW (requires Privy session control + intentional churn).

The schema is `walletHistory: [WalletHistoryEntry]` with no max-length validator. Each rotation `$push`es. An attacker who controls a Privy session and can repeatedly rotate the underlying wallet (Privy account recovery, key rotation) could grow the array to thousands of entries — single User doc bloating Mongo storage and slowing every read of that doc.

Each linkTelegramIdentity flow only rotates when `existingByTg.walletAddress !== walletAddress`, so the attacker needs ALTERNATING wallets (A→B→A→B). That's not free — each rotation requires Privy to provision a new wallet. Bounded in practice by Privy's rate limits.

The `walletHistory` is also read during settlement / reconcile — unbounded growth doesn't affect settlement (we use `walletAddress`, not the history) but does affect `reconcile-wallets.mjs` which lists top-5 rotators (line 109-115 sort by `walletHistory` desc).

**Recommendations:**
- Cap walletHistory at 50 via mongoose validator OR explicit `$slice` in the `$push`.
- Add an index on `walletAddress` within walletHistory subdocs to enable "is this old wallet ours" lookup without scanning.

### NF8 — `linkTelegramIdentity` Step 2/3 paths DO NOT use `updateWalletForTgUser` — S2-T6 fix incomplete

**File:line:** `server/services/users.js:251-282`.
**Status:** CONFIRMED.
**Severity:** HIGH (silent partial regression of H009).

The S2-T6 rotation helper is correctly wired at line 216 (Step 1 — when an existing TG-keyed doc has a DIFFERENT wallet). BUT:

- **Step 2 (line 251-261)**: when no TG-keyed doc exists but a `walletAddress`-keyed doc does, the handler `$set: baseSet` updates the wallet doc with the new TG ID. **`baseSet` does NOT include `walletAddress`** — so this is just adding the TG ID to an existing wallet doc. No rotation happens because the wallet didn't change. **OK.**

- **Step 3 (line 264-282)**: when neither TG nor wallet doc exists, but a `uid`-keyed doc does, the handler conditionally adds `walletAddress` if the doc has none. **`updateWalletForTgUser` is NOT called for the rotation case** — line 270: `if (walletAddress && !existingByUid.walletAddress)`. If `existingByUid` ALREADY has a wallet AND a new wallet is provided AND it's different, the new one is silently dropped. The user later re-emits `registerIdentity` with the new wallet via socket, gets stuck on the old wallet, and matches settle to a stale destination.

This is the EXACT prior H009 pattern, reintroduced via the uid-keyed Step 3 path. The fix at Step 1 (TG-keyed) only covers users who ALREADY have TG linked. Users who arrive uid-first (browser-only, no Mini App yet) and then later authenticate a Privy-rotated wallet are NOT protected.

**Recommendation:** in Step 3, when `existingByUid.walletAddress !== walletAddress && walletAddress`, call `updateWalletForTgUser(telegramUserId, walletAddress, 'linkTelegramIdentity-uid-path')` to handle the rotation.

### NF9 — `updateWalletForTgUser` TOCTOU between `findOne` conflict check and `findOneAndUpdate`

**File:line:** `server/services/users.js:64-90`.
**Status:** CONFIRMED.
**Severity:** MEDIUM (mitigated by `walletAddress: unique:true, sparse:true` index in User.js:6).

The sequence:
1. Line 53: `await User.findOne({ telegramUserId })` — get current doc.
2. Line 64: `await User.findOne({ walletAddress: newWalletAddress, _id: { $ne: user._id } })` — check conflict.
3. Line 86: `await User.findOneAndUpdate({ telegramUserId }, update, {...})` — apply rotation.

Between (2) and (3), a concurrent `updateWalletForTgUser` for a DIFFERENT TG user can write the same `newWalletAddress` to a different doc. The `walletAddress` index has `unique: true, sparse: true` — Mongo will reject the duplicate-key write with E11000 on whichever findOneAndUpdate hits second.

The try/catch at line 99 returns `{ ok: false, reason: 'db_error', error: err.message }` on E11000 — but the loser's caller doesn't distinguish "conflict" from "transient db error." A retry from the calling handler (e.g. `escrowDepositConfirm`'s `linkTelegramIdentity` call) could keep firing. No fund-loss because the winner of the race owns the wallet.

**Recommendation:** detect E11000 (`err.code === 11000`) and return `{ ok: false, reason: 'wallet_belongs_to_other_user' }` so caller knows not to retry.

### NF10 — `H017` self-damage `Math.abs(dmg)` STILL PRESENT in fire handler

**File:line:** `server/socket-io/main.js:4308`.
**Status:** CONFIRMED — STILL OPEN.
**Severity:** CRITICAL (1v1 wagered exploit) — but assumes physics returns negative damage; verify via Bundle 4.

```js
ms.hp[playerId] = Math.max(0, ms.hp[playerId] - Math.abs(dmg))
```

The `Math.abs(dmg)` was identified in #2 as H017 — the shooter receives positive damage from physics in some weapon cases (e.g. self-detonation by mistake), and `Math.abs` ERASES the sign of any negative-damage case where physics SHOULD heal or no-op.

In #3 this code path is UNCHANGED. The behavior depends on whether `result.damage` ever contains:
- a negative value (self-damage that physics intends to "skip" — Math.abs flips it positive)
- a value for `playerId === this.id` with non-zero (self-hit, intentional)

The for-loop already gates on `playerId !== this.id` ONLY for kill-tracking (line 4310) — but NOT for the HP deduction at 4308. So self-damage `dmg > 0` is applied. Combined with `Math.abs`, ANY value in `result.damage[shooter.id]` becomes a positive deduction.

If a 1v1 wagered match player can fire a weapon that returns `{[shooter.id]: 250}`, they self-eliminate. In single-round BO1, this lets the OPPONENT win the wager — useful for opponent collusion or accidental self-griefing. The loop runs every fire; if `result.damage` has the shooter's key, HP is decremented.

**Recommendation:** at line 4305 guard: `if (Number.isFinite(dmg) && dmg > 0) ms.hp[playerId] = Math.max(0, ms.hp[playerId] - dmg)`. Remove `Math.abs`. Verify `processShot()` in `server/services/physics.js` whether self-damage is ever emitted intentionally; if so, gate that path explicitly.

### NF11 — `escrowDepositConfirm` logs `txSignature` cleartext

**File:line:** `server/socket-io/main.js:3979`.
**Status:** CONFIRMED — minor PII / forensic trail.
**Severity:** LOW (signatures are public on-chain).

```js
console.log(`[Escrow] Deposit confirmed: ${client.id} for room ${rid} (TX: ${txSignature})`)
```

The TX signature is public on-chain — not a secret. But Render's log retention indexes these alongside socket IDs and room IDs, creating a searchable forensic record correlating user → TX → room. For users with privacy concerns this is incremental linkage data.

Compounded with `clientDebugLog` at line 1672 which logs `tg=${tg} w=${wallet.slice(0,6)}` — searches across both log streams allow tg→wallet→tx joining.

**Recommendation:** truncate TX signature to first 16 chars in logs (sufficient for grep correlation against on-chain explorer, not the full signature for offline mining).

### NF12 — `clientDebugLog` accepts payload of 2KB cap even from authenticated socket — log-spam DoS

**File:line:** `server/socket-io/main.js:1656-1674`.
**Status:** CONFIRMED — minor DoS / log-volume amplification.
**Severity:** LOW.

After auth gate, any authenticated socket can call this every TX with `label` up to 200 chars + `data` up to 2KB. Render charges per log-byte; an authenticated attacker (who paid to register) can hit `clientDebugLog` repeatedly at the WS message-rate cap (per-socket rate limiter exists at `main.js:1433` per HOT_SPOTS) to burn ops budget.

The per-socket rate limiter does cap message rate but not bytes/sec — `clientDebugLog` at 2KB × max-rate = significant log traffic over an hour. No technical exploit; cost-amplification only.

**Recommendation:** drop `clientDebugLog` in production (gate on `process.env.NODE_ENV !== 'production'` at handler-attach time, not just inside).

### NF13 — `failedSettlements` 5-retry-then-drop pattern (H037) still drops silently

**File:line:** `server/socket-io/main.js:562-591`.
**Status:** OPEN (H037 carry-forward).
**Severity:** HIGH for mainnet (funds stranded with no operator alert).

```js
if (data.attempts >= 5) {
    console.error(`[Recovery] Giving up on settlement recovery for ${matchId} after ${data.attempts} attempts`);
    failedSettlements.delete(matchId);
    continue;
}
```

After 5 retries (5 minutes each = ~5 mins total), the match's settlement attempt is dropped from memory. The `adminNotifications.js` service exists (per handover) but is NOT wired into this drop path — no Telegram alert, no PagerDuty, no `Feedback` doc, no MongoDB persistence to a `stranded_settlements` collection. Render restart loses the in-memory `failedSettlements` Map entirely.

If a v2 settle fails 5 times (e.g. mainnet RPC outage during a 5-minute window), the depositors' funds are stranded on-chain. The on-chain v2 program's `permissionless_reclaim` after 1200s WILL eventually let depositors recover their deposits — but the SERVER never tells the user this happened, and the ops team has no actionable alert.

**Recommendations (in priority order):**
- Wire `adminNotifications.notify({severity:'high', kind:'settlement_drop', matchId, depositorWallets, lastError})` BEFORE the `failedSettlements.delete()`.
- Persist failed-settlement to a `StrandedSettlement` Mongo collection so process restart doesn't lose state.
- Emit a server-side `matchSettlementStranded` event so the client can show "Match settled offline. Funds will be reclaimable in 24h via /api/reclaim/:matchId" or equivalent.
- Add `/api/admin/stranded` endpoint to list pending recoveries.

### NF14 — `playAgainRequest` uses `requireAuthIfWagered` — preserves match state but no fresh authz

**File:line:** `server/socket-io/main.js:5165-5187`.
**Status:** ACCEPTABLE — no fund-touching surface.
**Severity:** INFORMATIONAL.

Calling `playAgainRequest` resets the room for another round (`resetForPlayAgain`). For wagered matches, the auth gate is enforced. For practice matches no gate. The new round preserves the existing room.wager — a player who joined a wagered room and consumed their deposit wins/loses the match, then both players hit "Play Again," and the room is RESET — but `wagerStates[roomId]` and the on-chain PDA were already settled (or cancelled). The reset zeros the deposit state via `ws.deposits = {}` (line 4106 in `escrowCancelAll`, not playAgain).

Actually `resetForPlayAgain` is unread in this bundle. Worth verifying that the next round's escrow flow correctly creates a NEW PDA, not reuses the settled one. **NEEDS verification (carry to Bundle 2 chain audit).**

### NF15 — `joinChallenge` has NO auth gate — but does no state mutation

**File:line:** `server/socket-io/main.js:2673-2721`.
**Status:** ACCEPTABLE.
**Severity:** LOW.

The handler reads challenge + room state, calls `markAccepted` and `markMatched`. The on-chain wager isn't touched here — the actual `joinRoom` event that follows IS gated. So `joinChallenge` is best-effort identity attribution for analytics + group state. An attacker spamming `joinChallenge` for known shortCodes can cause the challenger to see a spurious "accepted" notification — minor griefing only.

**Recommendation:** rate-limit per socket at 1/sec.

### NF16 — Bug 6 N>2 leaver edge case: forfeit-settle gate is bypassable for reconnect within window

**File:line:** `server/socket-io/main.js:1909-1935`.
**Status:** CONFIRMED — depends on `RECONNECT_WINDOW_MS = 10 * 60 * 1000` (line 632) being EFFECTIVE.
**Severity:** MEDIUM.

For N>2, the leaver is zeroed out and broadcast `playerLeft`. Then `client.leave(roomId)` detaches them.

BUT: reconnect is DISABLED for P1 launch (`rejoinRoom` early-returns at line 2108 — `client.emit('rejoinError', { reason: 'Reconnect is disabled' })`). So the eliminated player CANNOT rejoin to claim a stale slot.

If reconnect is ever re-enabled, the Bug 6 N>2 path will need to check `ms.alive[reconnectingId] === false` and refuse the rejoin (or honor elimination). Currently the dead-code below in `rejoinRoom` does NOT check `ms.alive[]` — it just restores the player into the slot. This is a TIME BOMB for the V2-everywhere bundle.

**Recommendation:** in dead-code rejoin logic at `main.js:2107+`, add `if (ms.alive && ms.alive[oldSocketId] === false) return client.emit('rejoinError', { reason: 'You were eliminated' })`. So when reconnect is re-enabled, the Bug 6 invariant survives.

### NF17 — In-memory `wagerStates` lost on Render restart — N>2 mid-match restart strands escrow

**File:line:** `server/socket-io/main.js:179-180` (module-level state).
**Status:** CONFIRMED — V1-acceptance flagged.
**Severity:** MEDIUM (mainnet risk).

`wagerStates`, `matchStates`, `rooms`, `authenticatedWallets`, `failedSettlements`, `depositTimers`, `turnTimers` are all in-memory only. A Render restart (deploys auto-trigger from main; ~1/week per deploy cadence) loses every in-flight match.

For v2 N>2 matches the on-chain state survives. The `permissionless_reclaim` after 1200s lets depositors recover. BUT the server forgets it created the escrow, has no record of who deposited, can't fire `escrowActive` again to re-enter battle. Users see the match disappear and a stranded deposit.

The previously-completed S2-T2 added `restoreActiveTimers` for groupchat lifecycle (line 24 imports it) — but the `rooms` map is NOT rehydrated from the `Match` Mongo model on boot. `restoreRoom(match)` helper exists (line 119-ish per INDEX) but no boot-time scanner runs it.

**Recommendation:** at server boot, scan Mongo `Match` collection for `status: 'active'` rows and call `restoreRoom()` for each. Persist `wagerStates`, `matchStates`, `depositTimers` end-time to Mongo on every mutation so restart can recreate timers.

### NF18 — `User.findOneAndUpdate` with `upsert:true` in `setWalletHandle` at main.js:1720 — does NOT pass `runValidators`

**File:line:** `server/socket-io/main.js:1720-1724`.
**Status:** CONFIRMED — H032 carry-forward incomplete.
**Severity:** LOW (handle is already string-validated by guards).

```js
await User.findOneAndUpdate(
    { walletAddress: wallet },
    { $set: { handle: clean, lastActive: new Date() } },
    { upsert: true }
);
```

No `runValidators: true`. The `clean` value is already sanitized inline (16 char slice, isProfane filter), but the schema's validators (if any) won't fire on this update. For handle this is harmless because the field type is string. But this pattern is replicated across the file — every `$set` should specify `runValidators: true` for defense-in-depth.

**Recommendation:** sweep all `findOneAndUpdate` / `updateOne` / `bulkWrite` calls in main.js for `runValidators: true`. Mongoose global `mongoose.set('runValidators', true)` does NOT actually apply to all queries — it must be specified per-call.

### NF19 — `prestigeBurn` socket handler doesn't gate on `requireAuth` — relies on authenticatedWallets lookup

**File:line:** `server/socket-io/main.js:3760-3782`.
**Status:** CONFIRMED — acceptable post-pivot.
**Severity:** INFORMATIONAL.

After the V3 pivot (off-chain SHOT), `prestigeBurn` is a pure server-side balance deduction. The handler reads `authenticatedWallets[client.id]` — if absent, emits "Not authenticated" error and returns. No `requireAuth(client, 'prestigeBurn')` call.

Functionally equivalent. But the `requireAuth` helper at `guards.js:50` does additional consistency checks (sets `client._lastReject`, emits standard error format). Recommend wrapping for parity.

### NF20 — `getOpenRooms` broadcasts wager amount publicly — high-roller queues observable to all

**File:line:** `server/socket-io/main.js:794-817`.
**Status:** CONFIRMED — design choice.
**Severity:** INFORMATIONAL.

`getRooms` returns `{...wager: room.wager || 0, ...}` for every open room. Combined with `io.emit('setRooms')` broadcast at line 655, every connected client sees the wager amount of every open lobby. Useful UX (players can pick a wager range to join), but lets attackers identify high-roller queues for targeted exploitation (joining specifically to grief a known-high pot).

Practice mode rooms also appear in the list with wager=0. **OK.**

**Recommendation:** consider redacting wager amount above a threshold (e.g. > 1 SOL) to only show "high-roller" tag, requiring the player to explicitly enter to see exact amount.

### NF21 — `escrowDepositConfirm` does NOT re-verify wallet ownership against on-chain `players` array

**File:line:** `server/socket-io/main.js:3873-3995`.
**Status:** CONFIRMED — relies on prior ws.wallets assignment.
**Severity:** MEDIUM (depends on socketId stability).

When deposit confirms, server fetches on-chain state, checks `(escrowState.depositsMask & (1 << playerIndex)) !== 0` where `playerIndex` comes from `room.players.findIndex(p => p.socketId === client.id)`. The assumption: `room.players[playerIndex].wallet === escrowState.players[playerIndex]`.

If `room.players` was reordered between escrow creation (line 2403 `allWallets`) and deposit confirm, the playerIndex resolves to a different wallet on-chain. The room.players array IS mutated by Bug 6 N>2 branch (`.filter`) at `escrowPartialStart` line 4050 (compacting to depositors). But escrowPartialStart fires AFTER the deposit timer expires, by which time all deposits are already recorded — so this can't bite within a single match.

The off-chain `ws.wallets[client.id]` snapshot taken at joinRoom (line 2377) preserves the wallet across socket lifecycle. The on-chain `players[]` array is set once at create_match and immutable.

**Verification needed:** confirm that escrowPartialStart's `.filter` does NOT mutate `room.players` until after on-chain `start_with_depositors` succeeds — otherwise a fail mid-flight leaves room.players out of sync with on-chain state. From the code at line 4050, `room.players = room.players.filter(...)` happens AFTER the `startWithDepositorsEscrow` succeeds. **OK.**

### NF22 — `escrowCancelAll` allows host to cancel BEFORE deposits — refunds nothing useful

**File:line:** `server/socket-io/main.js:4078-4118`.
**Status:** ACCEPTABLE.
**Severity:** INFORMATIONAL.

The handler requires `partialDecisionMaker === client.id` (line 4085). This gate is only set in the partial-deposit timeout branch (line 2470). So `escrowCancelAll` is unreachable BEFORE the deposit timeout fires — by design. Refund flow is safe.

---

## PART 3 — Critical aggregate observations

### Logging hygiene summary

The audit found these PII-adjacent logs in main.js:
- Line 767, 773: escrow cancel logs — only `matchId` + `mask` (no wallet). OK.
- Line 1408: multi-socket warning — tgId + socketIds. Acceptable.
- Line 1672: `clientDebugLog` outputs `tg=${tg} w=${wallet.slice(0,6)}` — wallet truncated to 6 chars, tgId full. LOW PII risk.
- Line 3979: `escrowDepositConfirm` — full `txSignature`. See NF11.
- Line 4261: fire handler logs `tanks.map(...).slice(0,8)` — socketIds truncated. OK.
- `users.js:93,95,187,193,254`: wallet rotation logs — `.slice(0, 8)` truncation. OK.

**Net:** mostly hygienic. The two flags are `escrowDepositConfirm` TX-cleartext (NF11) and the `clientDebugLog` rate-amplification (NF12).

### Empty-catch summary in main.js

Two intentional swallow patterns:
- Line 1399: `} catch (_) { /* ignore — snapshot is best-effort */ }` — broadcastRooms guard. Acceptable.
- Line 1673: `} catch (_) { /* never let a debug log crash the connection */ }` — clientDebugLog wrapper. Acceptable.

No other empty catches in main.js. Errors elsewhere are propagated via `safeHandler` or explicit `try { ... } catch (err) { console.error(...); ... return }` patterns. **CLEAN.**

### Auth gating density verdict

- Wagered state-mutation events: **100% covered.** Every event that touches money has either `requireAuth` or `requireAuthIfWagered`.
- Identity-bridging events (`authenticate`, `registerIdentity`): correctly UNGATED by design — these are the auth-establishing events.
- Read-only events (`getRooms`, `getStats`, `getLeaderboard`, etc.): UNGATED — public info.
- Practice-mode events: UNGATED when wager=0, AUTOMATICALLY gated when wager>0. Correct.

H018/H019/H020 audit-#2 CRITICAL legacy-relay gaps are CLOSED with named-fix comments. H022 lives in `groupchat.js` (out of scope for this bundle — confirm in Bundle 2).

### Mainnet-readiness verdict for main.js

**main.js is NOT yet mainnet-ready, but is CLOSER than #2.** The required changes are:

1. **NF6 (HIGH)**: redact wallet addresses from `escrowDepositStatus` cross-broadcast. Wallets are public on-chain but the server-side cross-correlation enables identity-bridging attacks (compounds with H001/H006).

2. **NF8 (HIGH)**: complete S2-T6 fix at Step 3 of `linkTelegramIdentity` — the uid-keyed path still silently drops rotated wallets.

3. **NF10 (CRITICAL if confirmed by Bundle 4)**: remove `Math.abs(dmg)` self-damage path. Verify physics doesn't return negative damage for self.

4. **NF13 (HIGH)**: wire `adminNotifications` into the 5-retry-then-drop `failedSettlements` path. Persist stranded settlements to Mongo.

5. **NF17 (MEDIUM)**: persist `rooms` + `wagerStates` + `matchStates` to Mongo on every mutation. Restore on Render restart. Without this, a single Render deploy mid-match strands escrow funds for ALL in-flight wagered matches.

6. **NF9 (MEDIUM)**: detect E11000 in `updateWalletForTgUser` and return cleaner `wallet_belongs_to_other_user` reason instead of generic `db_error`.

7. **NF7 (LOW)**: cap `walletHistory[]` at 50 entries with `$slice`.

8. **NF5 (MEDIUM)**: add confirmation guard to `dedupe-funnel-oneshots.mjs`.

Most other findings are LOW / INFORMATIONAL and acceptable for V1 mainnet posture. The strongest positive finding is the comprehensive auth-gate sweep — every wagered-state-mutation event is now guarded.

---

## Coverage map (verifying scope)

| Audit area | Files read | Status |
|------------|------------|--------|
| socket events (auth gating density) | main.js (grepped + spot-read) | DONE |
| cleanupRoom Bug 6 N>2 branch | main.js:1863-1935 | DONE |
| joinRoom escrow gating (Bug 1-3 fix area) | main.js:2308-2530 | DONE |
| refundWager / settleMatch call sites | main.js (5 sites) | DONE |
| escrowDepositConfirm + S2-T7 verification | main.js:3873-3995 | DONE |
| User.js walletHistory schema | full read | DONE |
| FunnelEvent indexes + sparse-unique partial | full read | DONE |
| funnel.js recordFunnelEvent + oneShotInsert | full read | DONE |
| users.js updateWalletForTgUser + linkTelegramIdentity | full read | DONE |
| /admin/funnel endpoint | index.js:333-343 | DONE |
| /api/wallet/* routes | index.js:582-718 | DONE |
| wipe-user.mjs | full read | DONE |
| dedupe-funnel-oneshots.mjs | full read | DONE |
| reconcile-wallets.mjs | full read | DONE |
| find-user.mjs (ReDoS check) | full read | DONE |
| logging hygiene grep | main.js | DONE |
| empty-catch grep | main.js | DONE |
| privyAuth Bug 4 diagnostic logging | full read | DONE |
