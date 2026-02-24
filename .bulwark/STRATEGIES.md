# Attack Strategies — SolShot Off-Chain Audit

**Generated:** 2026-02-23
**Audit Tier:** Deep
**Source:** Dinh's Bulwark Phase 3 — Strategy Generation
**Architecture Source:** `.bulwark/ARCHITECTURE.md` (22 auditor synthesis)
**Cross-Skill:** SOS on-chain audit (`.audit/ARCHITECTURE.md`)
**Stacked Audit:** No (FIRST_AUDIT)
**Target Strategy Count:** 100–150 (Deep tier)

---

## Strategy Summary

| Priority | Count |
|----------|-------|
| Tier 1 (CRITICAL) | 28 |
| Tier 2 (HIGH) | 45 |
| Tier 3 (MEDIUM-LOW) | 47 |
| **Total** | **120** |

### Origin Breakdown

| Origin | Count | % |
|--------|-------|---|
| KB (pattern-based) | 93 | 77.5% |
| Novel (creative) | 27 | 22.5% |
| RECHECK (stacked) | 0 | 0% |

---

## Tier 1 — CRITICAL

---

### H001 — Balance-Check-Fail-Open Wager Bypass

- **Category:** LOGIC-02 (Financial Logic), ERR-01 (Error Handling)
- **Origin:** KB — Fail-open on external service error
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker can enter wagered matches without sufficient SOL balance because `getBalance()` returns 0 on RPC error and `joinRoom` proceeds without verifying the balance actually covers the wager.
- **Attack Vector:** Attacker connects, authenticates with wallet holding 0 SOL. RPC call to `getBalance()` either returns 0 (empty wallet) or fails (returns 0 default). The `joinRoom` handler does not gate on balance ≥ wager. Attacker enters wagered match, loses, and the settlement attempts to collect from an unfunded escrow — winner may not receive payout.
- **Target Code:** `server/services/solana.js` (getBalance), `server/socket-io/main.js` (joinRoom handler, createRoom handler)
- **Potential Impact:** Direct fund loss for legitimate players; wagered matches become exploitable free entries.
- **Requires:** LOGIC-02, ERR-01, CHAIN-02 findings
- **Investigation Approach:** Trace `joinRoom` handler end-to-end. Verify whether balance is checked before room join confirmation. Verify `getBalance()` error handling — does it return 0 or throw? Check if escrow `deposit_wager` is the actual balance gate or if server pre-validates.

---

### H002 — Double Settlement via Disconnect+Fire TOCTOU Race

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** KB — TOCTOU in async financial operations
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker can trigger double settlement by exploiting the TOCTOU window between `transitionState(SETTLING)` (outside lock) and `withLock('settle:...')` (inside lock). A concurrent disconnect event can bypass the state guard and attempt a second settlement path.
- **Attack Vector:** Player 1 fires the killing shot. `transitionState(ms, MATCH_STATES.SETTLING)` runs at line ~2081 OUTSIDE the lock. Before `withLock` acquires, Player 2 disconnects — the `cleanupRoom` handler sees state is SETTLING but the lock hasn't been acquired yet. Both paths enter `withLock` — the first settles, the second may also attempt settlement on the same escrow.
- **Target Code:** `server/socket-io/main.js` (fire handler ~line 2081-2090, cleanupRoom ~line 579), `server/middleware/guards.js` (withLock)
- **Potential Impact:** Double payout from escrow, or escrow account state corruption. Direct fund loss.
- **Requires:** ERR-02, CHAIN-01 findings
- **Investigation Approach:** Map exact lock acquisition sequence in fire vs disconnect paths. Verify whether on-chain `settle_match` has its own idempotency guard (account state check). Test timing window between transitionState and withLock.

---

### H003 — Prestige Burn Double-Unlock via Concurrent Socket Events

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** KB — Missing per-resource lock on financial operation
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker can advance their prestige tier twice with a single burn by sending two concurrent `prestigeBurn` socket events with the same transaction signature.
- **Attack Vector:** Attacker burns SHOT tokens on-chain once. Immediately sends two `prestigeBurn` events with the same `txSignature`. Both handlers call `verifyBurnTransaction()` concurrently — neither has added the signature to `verifiedBurnTxs` yet (the add happens after verification). Both pass the `has()` check, both return `valid: true`, both call `prestigeBurn(wallet)`. Result: two tier advances for one burn.
- **Target Code:** `server/services/shot-token.js` (verifyBurnTransaction ~line 509, verifiedBurnTxs Set), `server/socket-io/main.js` (prestigeBurn handler ~line 1618)
- **Potential Impact:** Free prestige progression. If prestige tiers unlock gameplay advantages, direct competitive advantage. Undermines SHOT token burn economics.
- **Requires:** ERR-02, LOGIC-02 findings
- **Investigation Approach:** Verify exact timing of `verifiedBurnTxs.add(txSignature)` relative to the verification await. Confirm no per-wallet lock exists. Test with concurrent socket emissions.

---

### H004 — Settlement Without Deposit Verification

- **Category:** LOGIC-02 (Financial Logic), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Missing precondition check on financial settlement
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The server can settle a match and distribute funds even if one or both players never actually deposited their wager into escrow, because `settleMatch()` does not verify deposit status before calling the on-chain `settle_match` instruction.
- **Attack Vector:** Attacker joins a wagered match. The escrow is created, deposit TX is sent to the client. Attacker never signs/sends the deposit. If the deposit timeout fails to fire (race condition) or is canceled incorrectly, the match proceeds. On match end, `settleMatch()` is called — it attempts to settle the escrow. If the escrow account has insufficient funds, the on-chain instruction may fail, but the server may swallow the error and proceed as if settlement succeeded.
- **Target Code:** `server/services/escrow.js` (settleMatch), `server/socket-io/main.js` (settlement logic), `server/services/solana.js`
- **Potential Impact:** Winners don't receive payout. Fund lock in escrow accounts.
- **Requires:** LOGIC-02, CHAIN-01, ERR-01 findings
- **Investigation Approach:** Trace settlement path — does it check `ws.deposits` or on-chain escrow balance before calling `settle_match`? What happens on-chain if escrow has 0 lamports?

---

### H005 — burnAmount=0 Dust Burn Prestige Bypass

- **Category:** SEC-01 (Wallet Security), LOGIC-02 (Financial Logic)
- **Origin:** KB — Input validation bypass on financial parameter
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker can satisfy prestige burn verification with a 0-amount or dust-amount burn because `burnAmount` is not validated before reaching `BigInt()` comparison. A value of 0 passes `>= expectedRaw` when `expectedRaw` is `0n`.
- **Attack Vector:** Attacker sends `prestigeBurn` event with `burnAmount: 0`. The server calls `verifyBurnTransaction(txSignature, wallet, BigInt(0))`. The check `parsedAmount >= expectedRaw` evaluates `0n >= 0n` = true. Any on-chain burn (even dust) satisfies the amount check.
- **Target Code:** `server/socket-io/main.js` (~line 1618), `server/services/shot-token.js` (~line 509)
- **Potential Impact:** Free prestige tier advancement without burning the required SHOT amount. Economic model bypass.
- **Requires:** SEC-01, LOGIC-02 findings
- **Investigation Approach:** Verify the exact value of `expectedRaw` at point of comparison. Does the server derive the expected burn amount from the tier table, or from the client-supplied `burnAmount`? Trace the full data flow.

---

### H006 — Turn-Timer Forfeit Bypasses Settlement Lock

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Timer callback exists outside normal event flow
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The `startTurnTimer` callback that forfeits a player after 60s timeout can trigger settlement without acquiring the `settle:roomId` lock, creating a race with the normal fire-handler settlement path.
- **Attack Vector:** Attacker's turn. They delay until the turn timer is about to expire (~59s). Simultaneously fire a shot that kills the opponent. The fire handler begins settlement (acquires lock). The turn timer fires at 60s — it calls a settlement/forfeit path that does NOT use `withLock`. Both paths attempt to settle the match concurrently.
- **Target Code:** `server/socket-io/main.js` (startTurnTimer ~line 341, fire handler ~line 2085)
- **Potential Impact:** Double settlement or corrupted match outcome. Fund distribution error.
- **Requires:** ERR-02, LOGIC-02, CHAIN-01 findings
- **Investigation Approach:** Trace `startTurnTimer` callback. Does it call `settleMatch` or `cleanupRoom`? Does it use `withLock`? Map exact concurrency with fire handler.

---

### H007 — refundWager Wrong Parameters Silent Failure

- **Category:** ERR-01 (Error Handling), LOGIC-02 (Financial Logic)
- **Origin:** KB — Parameter mismatch on critical financial function
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** `refundWager()` receives `roomId` where it expects `matchId`, causing the on-chain `cancel_match` instruction to fail silently. Players' deposited funds are locked in escrow with no recovery path.
- **Attack Vector:** Not an attacker-initiated exploit but a latent bug. When any refund path is triggered (deposit timeout, match cancel, dispute), `refundWager(roomId)` passes the Socket.IO room ID to the Anchor instruction which expects the match ID used for PDA derivation. The PDA lookup fails, the instruction reverts, and the catch block logs the error but does not retry or alert.
- **Target Code:** `server/services/solana.js` (refundWager), `server/services/escrow.js` (cancelMatch)
- **Potential Impact:** Permanent fund lock in escrow accounts. No automatic recovery. Players lose deposited wagers.
- **Requires:** ERR-01, LOGIC-02, CHAIN-06 findings
- **Investigation Approach:** Verify the exact parameter name at the call site. Does `roomId === matchId`? Trace PDA derivation to confirm whether they produce the same account.

---

### H008 — SHOT Milestone Double-Claim via Concurrent Matches

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** KB — Set-based replay protection race
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Two concurrent `recordMatchPlayed` calls for the same wallet can both pass the `claimedMatchIds.has(matchId)` check before either adds the ID, resulting in double SHOT token emission for a single match.
- **Attack Vector:** Player completes a match. Two settlement callbacks or retries fire concurrently. Both call `recordMatchPlayed(wallet, matchId)`. Both check `claimedMatchIds.has(matchId)` — neither has added it yet. Both proceed to emit SHOT tokens.
- **Target Code:** `server/services/shot-token.js` (recordMatchPlayed ~line 272, claimedMatchIds)
- **Potential Impact:** SHOT token inflation. Double rewards per match. Economic model undermined.
- **Requires:** ERR-02, LOGIC-02, CRYPTO-01 findings
- **Investigation Approach:** Verify the exact timing of `claimedMatchIds.add()` relative to the `has()` check. Is there an `await` between check and add? Confirm whether multiple settlement paths can trigger this.

---

### H009 — SHOT Supply Cap Race Condition Bypass

- **Category:** ERR-02 (Race Conditions), CRYPTO-01 (RNG)
- **Origin:** Novel — Emergent from concurrent emission tracking
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The SHOT token emission cap is tracked in-memory (`shotSupply` object). Concurrent match settlements can both read the supply below the cap, both emit tokens, and exceed the intended maximum supply.
- **Attack Vector:** Multiple matches end simultaneously. Each settlement reads `shotSupply.emitted < shotSupply.cap`. Multiple concurrent reads all see under-cap. All proceed to emit. Total emission exceeds cap.
- **Target Code:** `server/services/shot-token.js` (emission logic), `server/services/solana.js` (settlement callback)
- **Potential Impact:** SHOT token over-emission. Economic model collapse. Irreversible — mint authority is burned.
- **Requires:** ERR-02, LOGIC-02, CHAIN-01 findings
- **Investigation Approach:** Verify supply tracking mechanism. Is `shotSupply` checked atomically with the emission? Are concurrent settlements possible? Since mint authority is burned, over-emission is permanent.

---

### H010 — Deposit-Confirmation Race Double-EscrowActive

- **Category:** ERR-02 (Race Conditions), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Shared mutable state without lock
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Two concurrent `escrowDepositConfirm` events can both read `ws.deposits` as incomplete, both write their deposit flag, and both find both deposits complete — emitting `escrowActive` twice and potentially corrupting deposit timer cleanup.
- **Attack Vector:** Both players confirm deposits near-simultaneously. Two `escrowDepositConfirm` handlers interleave at async boundaries. Both read `ws.deposits[host]` and `ws.deposits[player]`, both set their flag, both evaluate `hostDeposited && playerDeposited` as true. Two `escrowActive` emissions — clients may start the match twice or enter inconsistent state.
- **Target Code:** `server/socket-io/main.js` (escrowDepositConfirm handler ~line 1782, depositTimers)
- **Potential Impact:** Match starts in corrupted state. Deposit timer may not be properly cancelled, leading to false timeout refund during active match.
- **Requires:** ERR-02, CHAIN-01 findings
- **Investigation Approach:** Map exact interleaving scenario. What happens when `escrowActive` emits twice? Does the client handle it idempotently? What happens to the deposit timer?

---

### H011 — failedSettlements Recovery Loop Race with Active Settlement

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Periodic retry loop races with event-driven settlement
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The 60-second `failedSettlements` retry interval can attempt to re-settle a match that is currently being settled by a normal event handler, leading to double settlement.
- **Attack Vector:** First settlement attempt fails (RPC timeout). Match ID added to `failedSettlements`. Before the 60s retry, the disconnect handler also triggers settlement for the same match. Both the retry loop and the disconnect handler attempt `settleMatch()` concurrently — the retry loop does NOT use `withLock`.
- **Target Code:** `server/socket-io/main.js` (failedSettlements interval ~line 82, settleMatch callers)
- **Potential Impact:** Double settlement attempt on-chain. If the first succeeds and the second also succeeds (different transaction), double payout.
- **Requires:** ERR-02, LOGIC-02 findings
- **Investigation Approach:** Verify whether `failedSettlements` entries are removed before retry. Does the retry use `withLock`? Can an active match still be in `failedSettlements`?

---

### H012 — playAgainRequest Creates Wagerless Wagered Match

- **Category:** LOGIC-01 (Business Logic), LOGIC-02 (Financial Logic)
- **Origin:** KB — State transition preserves partial context
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The `playAgainRequest` handler preserves `roundType` from the previous match but may not re-validate the wager or re-create the escrow, allowing players to play a wagered-format match without depositing.
- **Attack Vector:** Players complete a wagered match. One sends `playAgainRequest`. The handler preserves the match format (including wager mode) but skips the escrow creation, balance verification, and deposit flow. The new match runs with wager rules (90/7/3 settlement) but no actual funds in escrow.
- **Target Code:** `server/socket-io/main.js` (playAgainRequest handler), `server/services/escrow.js`
- **Potential Impact:** Players play in wagered format without risk. Settlement attempts fail. Economic model bypass.
- **Requires:** LOGIC-01, LOGIC-02 findings
- **Investigation Approach:** Trace `playAgainRequest` handler. Does it call `createEscrow`? Does it re-check wager state? Does it reset `wagerStates`?

---

### H013 — Single Authority Hot-Wallet Full Fund Drain

- **Category:** SEC-01 (Private Key Security), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Single point of failure for signing authority
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Compromise of the single server keypair grants the attacker authority to settle ALL active escrow accounts to any wallet, since the on-chain program trusts the authority key unconditionally and treasury/ops destinations are UncheckedAccount.
- **Attack Vector:** Attacker obtains server keypair (heap dump, env var leak, backup exposure). Calls `settle_match` for every active escrow account, specifying attacker-controlled wallet as treasury and ops destinations. The on-chain program validates only that the signer matches the authority — it does NOT validate treasury/ops addresses.
- **Target Code:** `server/services/keys.js` (key loading), on-chain `settle_match` (UncheckedAccount for treasury/ops)
- **Potential Impact:** Total fund drain of all active escrows. Catastrophic.
- **Requires:** SEC-01, CHAIN-01, SOS cross-reference findings
- **Investigation Approach:** Verify on-chain program constraints on treasury/ops accounts. Verify server key exposure surface. Confirm no hardware wallet or multi-sig is used.

---

### H014 — Incomplete Key Zeroing Enables Heap Dump Key Extraction

- **Category:** SEC-01 (Private Key Security), DATA-04 (Logging)
- **Origin:** KB — Incomplete key material lifecycle
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The server keypair's `secretKeyArray` (JS Array) is never zeroed after key loading — only the intermediate `Uint8Array` copy is zeroed. The original 64 bytes remain in the JS heap, extractable via heap snapshot, crash dump, or `--inspect` debugging session.
- **Attack Vector:** Attacker gains limited access to the server (cloud console, APM dashboard, crash reporting tool). Takes a V8 heap snapshot. Searches for 64-element arrays containing byte values — finds the unzeroed `secretKeyArray`. Extracts the full private key.
- **Target Code:** `server/services/keys.js` (lines 42-55, `secretKeyArray` vs `bytes`)
- **Potential Impact:** Full keypair extraction. Escalates to H013 (total fund drain).
- **Requires:** SEC-01 findings
- **Investigation Approach:** Verify `secretKeyArray.fill(0)` is NOT called. Confirm `bytes.fill(0)` IS called. Check if `Keypair.fromSecretKey` makes its own copy (it does — zeroing bytes is fine but secretKeyArray still exists).

---

### H015 — SOLANA_KEYPAIR_JSON Env Var Leak via Crash Reporter

- **Category:** SEC-02 (Secret Management), DATA-04 (Logging)
- **Origin:** KB — Secret in environment variable
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The full 64-byte server private key is stored in `process.env.SOLANA_KEYPAIR_JSON` as a JSON string. Any crash reporter, APM agent, or unhandled exception handler that dumps `process.env` exposes the key.
- **Attack Vector:** Server hits unhandled exception. Crash reporter (Sentry, DataDog, etc.) captures process environment as context. The `SOLANA_KEYPAIR_JSON` env var containing the full private key is sent to the third-party service. Attacker compromises the APM dashboard or intercepts the report.
- **Target Code:** `server/services/keys.js` (line 33), server deployment configuration
- **Potential Impact:** Full keypair extraction. Escalates to H013.
- **Requires:** SEC-02, DATA-04 findings
- **Investigation Approach:** Check if `SOLANA_KEYPAIR_JSON` or `SOLANA_KEYPAIR_PATH` is used in production. Check for any crash reporting or APM integrations. Check for unhandled exception logging that captures env.

---

### H016 — Unauthenticated Socket Event Exploitation (6 Events)

- **Category:** AUTH-01 (Authentication), AUTH-03 (Authorization)
- **Origin:** KB — Missing authentication check on sensitive events
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** At least 6 gameplay-affecting socket events do not check `client.isAuthenticated`, allowing unauthenticated connections to manipulate game state, observe room details, or interfere with matches.
- **Attack Vector:** Attacker connects via raw WebSocket (no wallet authentication). Sends gameplay events directly (e.g., `ready`, `requestTerrain`, `positionUpdate`, etc.). Server processes the events because handlers don't check auth status. Attacker can influence match outcomes or gather intelligence.
- **Target Code:** `server/socket-io/main.js` (all `client.on(...)` handlers without `requireAuth` check)
- **Potential Impact:** Match manipulation, information disclosure, denial of service via state corruption.
- **Requires:** AUTH-01, AUTH-03, API-03 findings
- **Investigation Approach:** Enumerate all `client.on()` handlers. Cross-reference with `requireAuth()` calls. Identify which events skip authentication. Assess exploitability of each.

---

### H017 — giveTurn Unauthorized Turn Relay Attack

- **Category:** AUTH-03 (Authorization), API-03 (WebSocket Security)
- **Origin:** KB — Unauthorized state mutation via relay event
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The `giveTurn` event allows any player in the room to relay turn assignment to another player without authorization checks, potentially stealing turns or disrupting turn order.
- **Attack Vector:** Attacker sends `giveTurn` event with a target socketId. The handler relays the turn assignment without verifying the sender is the current turn holder or has authority to assign turns. Attacker can grant themselves extra turns or skip opponent's turns.
- **Target Code:** `server/socket-io/main.js` (giveTurn handler)
- **Potential Impact:** Turn manipulation in wagered matches. Competitive advantage leading to unfair fund collection.
- **Requires:** AUTH-03, API-03 findings
- **Investigation Approach:** Read `giveTurn` handler. Does it check `room.currentTurn === client.id`? Does it validate the target? Is the event payload sanitized?

---

### H018 — createWeaponArray Non-Host Manipulation

- **Category:** AUTH-03 (Authorization), LOGIC-01 (Business Logic)
- **Origin:** KB — Missing role check on privileged operation
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The `createWeaponArray` event can be sent by the non-host player, potentially manipulating the weapon pool available in the match before the host intends.
- **Attack Vector:** Non-host player sends `createWeaponArray` before the host does. The handler generates the weapon array and sets it on the room. When the host sends their own `createWeaponArray`, it may be ignored or overwrite. Attacker can influence which weapons appear in the match.
- **Target Code:** `server/socket-io/main.js` (createWeaponArray handler)
- **Potential Impact:** Weapon pool manipulation in wagered matches. Competitive advantage.
- **Requires:** AUTH-03, LOGIC-01 findings
- **Investigation Approach:** Check if handler verifies `client.id === room.host`. Check if weapon array is generated once or can be overwritten.

---

### H019 — Room Join Capacity Overflow via Concurrent Joins

- **Category:** ERR-02 (Race Conditions), API-03 (WebSocket Security)
- **Origin:** KB — Check-then-act race on shared state
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Two players joining the same room concurrently can both pass the `room.active < 2` check before either increments the counter, resulting in 3+ players in a 2-player room.
- **Attack Vector:** Attacker uses two connections to simultaneously send `joinRoom` for the same room ID. Both handlers read `room.active === 1`, both proceed to add their player. Room ends up with 3 players. Match logic assumes exactly 2 — undefined behavior ensues.
- **Target Code:** `server/socket-io/main.js` (joinRoom handler ~line 962)
- **Potential Impact:** Match logic corruption, potential settlement errors with 3+ participants, denial of service.
- **Requires:** ERR-02, API-03 findings
- **Investigation Approach:** Is `room.active` check and increment atomic (same tick)? Or is there an `await` between? Test with concurrent join requests.

---

### H020 — Matchmaking Self-Pairing via Concurrent Queue Events

- **Category:** ERR-02 (Race Conditions), LOGIC-01 (Business Logic)
- **Origin:** Novel — Emergent from queue race and wallet-based identity
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker with two browser tabs (same wallet) can race two `joinQueue` events to pair with themselves, guaranteeing a win in wagered matchmaking and collecting the wager pot.
- **Attack Vector:** Attacker opens two tabs with the same wallet. Both send `joinQueue` concurrently. The queue checks `queue.length > 0` then `queue.shift()` — but these aren't atomic across the async boundary. Both may pass the length check, both shift the same entry, or one pairs with the other. The attacker controls both sides and can guarantee the winner.
- **Target Code:** `server/socket-io/main.js` (joinQueue handler ~line 1242, matchmakingQueues)
- **Potential Impact:** Guaranteed win in wagered matches. Direct fund extraction from matchmaking pool.
- **Requires:** ERR-02, LOGIC-01, AUTH-01 findings
- **Investigation Approach:** Does the queue check for same-wallet pairing? Is the shift+pair atomic? Can the same wallet be in queue twice?

---

### H021 — Reconnect State Migration Duplication

- **Category:** ERR-02 (Race Conditions), AUTH-01 (Authentication)
- **Origin:** KB — State migration race on identity-keyed lookup
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Two rapid reconnect attempts from the same wallet can both find the `pendingReconnects` entry, both attempt state migration, and result in duplicated or corrupted match state.
- **Attack Vector:** Player disconnects. Within the 30s window, sends two rapid reconnect attempts. Both find `pendingReconnects[wallet]` exists. Both attempt to migrate state from old socketId to new socketId. State is duplicated or one migration overwrites the other.
- **Target Code:** `server/socket-io/main.js` (rejoinRoom handler ~line 839, pendingReconnects)
- **Potential Impact:** Corrupted match state, potential dual presence in the same room, settlement errors.
- **Requires:** ERR-02, AUTH-01 findings
- **Investigation Approach:** Is `pendingReconnects[wallet]` deleted before or after migration? Is the migration atomic? Can two reconnects interleave?

---

### H022 — maxHttpBufferSize Unbounded Payload DoS

- **Category:** API-03 (WebSocket Security), ERR-03 (Rate Limiting)
- **Origin:** KB — Missing transport-level size constraint
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Socket.IO's `maxHttpBufferSize` is not configured, allowing attackers to send arbitrarily large payloads that consume server memory and CPU, leading to denial of service.
- **Attack Vector:** Attacker sends multi-megabyte JSON payloads via socket events. Server parses them, allocating memory for each. With multiple connections sending large payloads, server OOMs or becomes unresponsive. Active wagered matches are disrupted — in-memory state lost.
- **Target Code:** `server/index.js` (Socket.IO initialization), `server/socket-io/main.js` (all event handlers)
- **Potential Impact:** Server crash during active wagered matches. All in-memory state (wagers, game state, settlements) lost. Players lose deposited funds.
- **Requires:** API-03, ERR-03 findings
- **Investigation Approach:** Check Socket.IO server initialization options. Is `maxHttpBufferSize` set? What is the default? Test with large payloads.

---

### H023 — Client NPM Critical Vulnerability Exploitation

- **Category:** DEP-01 (Dependencies)
- **Origin:** KB — Known CVE in production dependencies
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** 3 critical-severity npm vulnerabilities in client dependencies can be exploited to achieve XSS or arbitrary code execution in the player's browser, enabling wallet drain via `window.socket` or `window.solWallet`.
- **Attack Vector:** Attacker identifies specific CVEs in client npm audit (3 critical). Crafts payload that exploits the vulnerable library. Gains JavaScript execution in victim's browser. Accesses `window.socket` (global) to send arbitrary socket events, or `window.solWallet` to sign malicious transactions.
- **Target Code:** Client `package.json`, `node_modules/`, `window.socket`, `window.solWallet`
- **Potential Impact:** Wallet drain, arbitrary transaction signing, match manipulation.
- **Requires:** DEP-01, WEB-02, CHAIN-03 findings
- **Investigation Approach:** Run `npm audit` on client. Identify the 3 critical CVEs. Assess exploitability in the browser context. Check if `window.socket` and `window.solWallet` are accessible.

---

### H024 — Server Authority Settles Fabricated Match Outcomes

- **Category:** CHAIN-01 (Transaction Construction), SOS Cross-Boundary
- **Origin:** Novel — On-chain/off-chain trust boundary exploitation
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The on-chain escrow program trusts the server authority to determine winners without any on-chain verification of game outcomes. A compromised or malicious server can settle any match with a fabricated winner, directing funds to a colluding wallet.
- **Attack Vector:** Attacker compromises the server (or a malicious operator). Calls `settle_match` with the attacker's wallet as the winner. The on-chain program verifies only the authority signature — not the game outcome. Funds are distributed to the attacker.
- **Target Code:** On-chain `settle_match` instruction, `server/services/escrow.js` (settleMatch), `server/socket-io/main.js` (settlement logic)
- **Potential Impact:** Total fund theft from all active escrows.
- **Requires:** CHAIN-01, SOS cross-reference
- **Investigation Approach:** Verify on-chain program has no game state or outcome verification. Confirm server alone determines winner. Assess server compromise surface area.

---

### H025 — Treasury/Ops UncheckedAccount Misdirection

- **Category:** CHAIN-01 (Transaction Construction), SOS Cross-Boundary
- **Origin:** Novel — Unconstrained account parameters on financial instruction
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The on-chain `settle_match` instruction accepts treasury and ops wallet accounts as `UncheckedAccount` — they are not constrained to specific addresses. A compromised server can redirect the 7% treasury and 3% ops fee to attacker-controlled wallets.
- **Attack Vector:** Attacker compromises the server keypair. Calls `settle_match` with correct winner but attacker-controlled addresses for treasury and ops. The 10% platform fee (7% + 3%) is redirected. Over many matches, this accumulates significant funds.
- **Target Code:** On-chain program (settle_match accounts), `server/services/escrow.js`
- **Potential Impact:** Ongoing theft of platform fees. May go undetected if winner receives correct payout.
- **Requires:** CHAIN-01, SOS findings
- **Investigation Approach:** Verify on-chain account constraints for treasury/ops. Are they stored in program state or passed per-call? Can they be changed per settlement?

---

### H026 — Hardcoded Program ID Prevents Emergency Migration

- **Category:** SEC-02 (Secret Management), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Hardcoded infrastructure identifier
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The escrow program ID is hardcoded across multiple files (server and client). If the program needs to be redeployed due to a vulnerability, all code must be updated and redeployed simultaneously — creating a window where old and new program states are inconsistent.
- **Attack Vector:** Not a direct attack but a catastrophic operational risk. Vulnerability discovered in the escrow program. New program deployed with new ID. Server still hardcodes old ID. Clients still connect to old program. Active matches are split across programs. Settlement fails for in-flight matches.
- **Target Code:** `server/services/escrow.js`, `client/src/wallet/WalletContext.js`, `.env` files
- **Potential Impact:** Inability to respond to security incidents. Active match fund lock during migration.
- **Requires:** SEC-02, CHAIN-01 findings
- **Investigation Approach:** Count all locations where program ID is referenced. Is it in env vars? Is it in source code? Can it be updated without redeployment?

---

### H027 — Escrow Creation Failure Silently Ignored

- **Category:** ERR-01 (Error Handling), LOGIC-02 (Financial Logic)
- **Origin:** KB — Silent failure on critical precondition
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** If escrow creation fails during `joinRoom` (RPC error, insufficient rent), the error is caught and logged but the match proceeds without an escrow account. Players are prompted to deposit into a non-existent escrow.
- **Attack Vector:** During high RPC congestion, escrow creation fails. The `joinRoom` handler catches the error but continues room setup. Players enter the match thinking it's wagered. On match end, settlement fails because no escrow exists. Funds deposited by the other player (if any) are locked or lost.
- **Target Code:** `server/socket-io/main.js` (joinRoom escrow creation), `server/services/escrow.js` (createMatch)
- **Potential Impact:** Players play wagered match without escrow. Winner doesn't receive payout.
- **Requires:** ERR-01, LOGIC-02, CHAIN-01 findings
- **Investigation Approach:** Does `joinRoom` check escrow creation result? What happens if `createMatch` throws? Does the match proceed? Is the room flagged as non-wagered?

---

### H028 — 30-Second Balance Cache TOCTOU for Wager Exploitation

- **Category:** CHAIN-02 (RPC Client), LOGIC-02 (Financial Logic)
- **Origin:** KB — Stale cache enables time-of-check-to-time-of-use
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** The 30-second balance cache on RPC calls allows an attacker to pass the balance check and then move funds out of their wallet before the escrow deposit, exploiting the TOCTOU window.
- **Attack Vector:** Attacker has sufficient SOL. Joins wagered match — balance check passes (reads from cache or fresh RPC). Immediately transfers SOL to another wallet. The deposit TX is sent to the client, but the client's wallet now has insufficient funds. The deposit fails, but the match may have already started.
- **Target Code:** `server/services/solana.js` (getBalance with cache), `server/socket-io/main.js` (joinRoom)
- **Potential Impact:** Entering wagered matches without actual funds. Combined with H004, potential fund extraction.
- **Requires:** CHAIN-02, LOGIC-02 findings
- **Investigation Approach:** Verify balance cache TTL. Is balance re-checked at deposit time? What happens if deposit fails after match starts?

---

## Tier 2 — HIGH

---

### H029 — JWT Dead Code Creates Future Auth Bypass Surface

- **Category:** AUTH-01 (Authentication), SEC-01 (Wallet Security)
- **Origin:** KB — Dead code masking security gap
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** JWT generation and verification code exists but `verifyToken()` is never called. If a developer later wires up JWT-based auth for HTTP endpoints without realizing WebSocket auth is flag-based, the two auth systems will be inconsistent, potentially creating bypass paths.
- **Attack Vector:** Future development adds HTTP API routes. Developer sees JWT infrastructure, assumes it's in use, and uses `verifyToken()` for HTTP but not for WebSocket. Attacker obtains a JWT (issued on auth) and replays it against HTTP endpoints. The 24h expiry window is generous.
- **Target Code:** `server/middleware/auth.js` (generateToken, verifyToken)
- **Potential Impact:** Authentication bypass on future HTTP endpoints. Session hijacking.
- **Requires:** AUTH-01 findings
- **Investigation Approach:** Grep for `verifyToken` call sites. Confirm zero usage. Check if any HTTP routes exist that use JWT.

---

### H030 — Signature Replay Within 5-Minute Window

- **Category:** AUTH-01 (Authentication)
- **Origin:** KB — Time-window replay without nonce
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The authentication signature includes a timestamp but no unique nonce. An eavesdropper who captures the auth message within the 5-minute `AUTH_TIMEOUT` window can replay it to authenticate as the victim on a different connection.
- **Attack Vector:** Attacker observes auth packet (e.g., via shared WiFi, compromised proxy, or XSS). Extracts `{ walletAddress, message, signature, timestamp }`. Within 5 minutes, opens new WebSocket and replays the exact same auth payload. Server verifies the signature (still valid within timestamp window), sets `isAuthenticated = true`.
- **Target Code:** `server/middleware/auth.js` (handleAuthenticate, timestamp check)
- **Potential Impact:** Session hijacking. Attacker authenticated as victim's wallet.
- **Requires:** AUTH-01 findings
- **Investigation Approach:** Verify message format includes only wallet + timestamp (no nonce). Check if used signatures are tracked for replay prevention. Assess 5-minute window exploitability.

---

### H031 — No Account-Change Handler Enables Wallet Switch Attack

- **Category:** CHAIN-03 (Wallet Adapter), AUTH-01 (Authentication)
- **Origin:** KB — Missing state synchronization on account change
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The client does not listen for wallet account changes. If a user switches wallets in their wallet extension during a match, the client continues operating with the old authentication but the wallet adapter now signs with the new key. This creates an identity mismatch.
- **Attack Vector:** Player authenticates with Wallet A. Mid-match, switches to Wallet B in Phantom. Client sends `signAndSendEscrowDeposit` — wallet adapter signs with Wallet B, but the server expects Wallet A. The deposit goes to the wrong escrow participant. On settlement, the wrong wallet receives funds.
- **Target Code:** `client/src/wallet/WalletContext.js`, `client/src/App.js`
- **Potential Impact:** Fund misdirection. Wrong wallet credited.
- **Requires:** CHAIN-03, AUTH-01 findings
- **Investigation Approach:** Check for `wallet.on('accountChanged')` or `onAccountChange` handler. Does the client re-authenticate on wallet switch? What happens to the socket auth state?

---

### H032 — window.socket Global XSS Escalation

- **Category:** CHAIN-03 (Wallet Adapter), WEB-02 (Security Headers)
- **Origin:** KB — Global variable exposure combined with missing CSP
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `window.socket` is exposed globally, and the client has no CSP headers (Vercel deployment). Any XSS vulnerability (including via the 3 critical client npm CVEs) grants the attacker direct access to the authenticated socket connection — they can send any event as the authenticated user.
- **Attack Vector:** Attacker finds XSS via vulnerable npm dependency. Injects `window.socket.emit('fire', { angle: X, power: Y })` — controls the victim's game actions. Or `window.socket.emit('prestigeBurn', { txSignature: '...', burnAmount: 0 })` — exploits prestige bypass.
- **Target Code:** Client code exposing `window.socket`, Vercel deployment (no CSP), `window.solWallet`
- **Potential Impact:** Full game control, wallet drain via `window.solWallet.signAndSendTransaction()`, prestige manipulation.
- **Requires:** CHAIN-03, WEB-02, DEP-01 findings
- **Investigation Approach:** Verify `window.socket` is set. Verify no CSP on client deployment. Assess which events can be exploited via XSS.

---

### H033 — autoConnect Without Auth Gate Enables Pre-Auth Actions

- **Category:** CHAIN-03 (Wallet Adapter), AUTH-01 (Authentication)
- **Origin:** KB — Automatic connection without authentication requirement
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The wallet adapter's `autoConnect` feature establishes a wallet connection before the user explicitly authenticates. If the socket connection is also established automatically, an attacker's injected script could perform wallet actions before the user's auth flow completes.
- **Attack Vector:** Page loads, wallet adapter auto-connects, socket connection established. Before user clicks "authenticate," injected script (via XSS) can interact with `window.socket` to send events. Some events may not require authentication (see H016).
- **Target Code:** `client/src/wallet/WalletContext.js` (autoConnect), `client/src/App.js`
- **Potential Impact:** Pre-authentication exploitation. Combined with unauthenticated events (H016), full match manipulation.
- **Requires:** CHAIN-03, AUTH-01 findings
- **Investigation Approach:** Check wallet adapter config for `autoConnect: true`. When is the socket established relative to auth? Can events be sent pre-auth?

---

### H034 — Settlement Timeout Too Short (1h) for Griefing

- **Category:** CHAIN-06 (PDA Interaction), LOGIC-02 (Financial Logic)
- **Origin:** KB — Timeout parameter insufficiency
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The 1-hour settlement timeout on escrow may be too short for legitimate scenarios (server restart, RPC outage, manual intervention) but too long for griefing (attacker intentionally stalls to lock opponent's funds for an hour).
- **Attack Vector:** Attacker deposits wager, then disconnects. Server attempts settlement, fails (RPC down). The 1-hour timeout counts down. During this hour, the opponent's funds are locked. Attacker repeats this pattern to grief multiple opponents.
- **Target Code:** On-chain program (timeout check in `cancel_match`), `server/services/escrow.js`
- **Potential Impact:** Fund locking griefing. Opponent's SOL locked for 1 hour per attack.
- **Requires:** CHAIN-06, LOGIC-02 findings
- **Investigation Approach:** Verify exact timeout duration on-chain. Who can trigger `cancel_match`? Is it the authority only, or either player?

---

### H035 — broadcastRooms Amplification DoS

- **Category:** API-03 (WebSocket Security), ERR-03 (Rate Limiting)
- **Origin:** KB — Broadcast amplification without throttling
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `broadcastRooms` sends the full room list to all connected clients. An attacker can rapidly create and destroy rooms to trigger continuous broadcasts, saturating bandwidth for all connected users.
- **Attack Vector:** Attacker opens multiple connections. Rapidly creates rooms (triggers `broadcastRooms`). Rapidly leaves rooms (triggers `broadcastRooms`). Each broadcast sends to ALL connected clients. With 100 connections creating/leaving rooms, broadcast traffic explodes combinatorially.
- **Target Code:** `server/socket-io/main.js` (broadcastRooms, createRoom, leaveRoom handlers)
- **Potential Impact:** Bandwidth saturation for all clients. Active wagered matches become unplayable due to dropped events. Potential server CPU exhaustion from serialization.
- **Requires:** API-03, ERR-03 findings
- **Investigation Approach:** How frequently is `broadcastRooms` called? Is it throttled? What data does it include? How many rooms can one user create?

---

### H036 — Match Result Never Written to DB

- **Category:** DATA-01 (Database), LOGIC-02 (Financial Logic)
- **Origin:** KB — Missing persistence on critical business event
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Match results (winner, wager amount, settlement TX) are never written to MongoDB. If a dispute arises, there is no server-side record of match outcomes. Only on-chain data (if settlement succeeded) provides evidence.
- **Attack Vector:** Not a direct attack vector but a critical audit gap. Player claims they won but didn't receive payout. No server-side evidence exists. On-chain records may show the settlement, but the match context (who was playing, what happened) is lost.
- **Target Code:** `server/socket-io/main.js` (settlement success path), `server/models/User.js`
- **Potential Impact:** Inability to resolve disputes. No forensic trail for incident response.
- **Requires:** DATA-01, LOGIC-02 findings
- **Investigation Approach:** After `settleMatch` succeeds, is the result written to MongoDB? Is the tx signature recorded? Is the winner/loser recorded?

---

### H037 — Dual-Write Inconsistency MongoDB vs In-Memory

- **Category:** DATA-01 (Database), ERR-01 (Error Handling)
- **Origin:** KB — Inconsistent write targets for related data
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** User stats are written to MongoDB (fire-and-forget) while match state is in-memory only. If the DB write fails, stats diverge from actual match outcomes. If the server restarts, in-memory state is lost but DB stats remain.
- **Attack Vector:** Attacker plays match, loses. Server restarts before DB write. In-memory loss state is gone. DB still shows the previous stats. The loss was never recorded. Over time, stats inflation.
- **Target Code:** `server/models/User.js`, `server/socket-io/main.js` (stats update)
- **Potential Impact:** Stats manipulation, leaderboard corruption, integrity loss.
- **Requires:** DATA-01, ERR-01 findings
- **Investigation Approach:** Trace stat update flow. Is it fire-and-forget? What happens on write failure? Is there a reconciliation mechanism?

---

### H038 — verifiedBurnTxs Unbounded Set Memory Growth

- **Category:** DATA-01 (Database), ERR-03 (Rate Limiting)
- **Origin:** KB — Unbounded in-memory collection
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `verifiedBurnTxs` Set grows indefinitely with every verified burn transaction and is never pruned. Over time, this consumes increasing memory. A targeted attack of rapid burn+verify cycles can accelerate the growth.
- **Attack Vector:** Attacker (or normal operation over time) generates many burn transactions. Each is added to the Set. Set never shrinks. Eventually contributes to memory pressure. Combined with other memory growth (rooms, matchmaking queues), can push server toward OOM.
- **Target Code:** `server/services/shot-token.js` (verifiedBurnTxs Set)
- **Potential Impact:** Gradual memory leak leading to OOM. Server crash during active matches = fund loss.
- **Requires:** DATA-01, ERR-03 findings
- **Investigation Approach:** Is the Set bounded? Is there a TTL or cleanup? How fast does it grow under normal operation?

---

### H039 — Settlement Data Logged Verbatim Information Disclosure

- **Category:** DATA-04 (Logging), SEC-02 (Secret Management)
- **Origin:** KB — Sensitive data in logs
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Settlement data (wallet addresses, amounts, transaction signatures) is logged verbatim via `console.log` (bypassing pino structured logging with redaction). If logs are shipped to a third-party aggregator, sensitive financial data is exposed.
- **Attack Vector:** Logs are shipped to ELK, CloudWatch, or similar. Settlement entries contain: wallet addresses, wager amounts, transaction signatures, escrow PDA addresses. Compromised log aggregator exposes this data. Attacker can correlate wallet addresses with game activity.
- **Target Code:** `server/socket-io/main.js` (settlement logging), `server/services/escrow.js`
- **Potential Impact:** Privacy breach. Wallet address correlation. Transaction history exposure.
- **Requires:** DATA-04, SEC-02 findings
- **Investigation Approach:** Grep for `console.log` in settlement paths. What data is logged? Is pino used instead? Are redaction rules applied?

---

### H040 — 45+ console.* Statements Bypass Pino Structured Logging

- **Category:** DATA-04 (Logging), ERR-01 (Error Handling)
- **Origin:** KB — Inconsistent logging infrastructure
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** 45+ `console.*` statements bypass the pino logger with its structured formatting and redaction rules. Sensitive data (wallet addresses, amounts, errors with stack traces) flows through console directly to stdout without redaction.
- **Attack Vector:** Not a direct attack but reduces security posture. Pino logger has redaction rules configured, but they're bypassed by direct console usage. Any sensitive data passed to console.log is unredacted.
- **Target Code:** Multiple files across server codebase
- **Potential Impact:** Information disclosure through unredacted logs.
- **Requires:** DATA-04 findings
- **Investigation Approach:** Count console.* calls. Identify which contain sensitive data. Compare with pino logger usage.

---

### H041 — Timing-Unsafe HMAC Comparison

- **Category:** DATA-05 (Encryption), CRYPTO-01 (Cryptography)
- **Origin:** KB — Non-constant-time comparison on security-critical value
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** HMAC comparison uses JavaScript string equality (`===`) instead of `crypto.timingSafeEqual()`, enabling timing side-channel attacks to forge HMAC values byte-by-byte.
- **Attack Vector:** Attacker sends requests with varying HMAC values. Measures response times. String `===` comparison short-circuits on first mismatched byte. Timing differences (nanoseconds) reveal which bytes are correct. Over many requests, attacker reconstructs valid HMAC.
- **Target Code:** HMAC verification code (location TBD from DATA-05 findings)
- **Potential Impact:** HMAC forgery. Authentication bypass if HMAC is used for request verification.
- **Requires:** DATA-05, CRYPTO-01 findings
- **Investigation Approach:** Find HMAC comparison code. Is `timingSafeEqual` used? What is the HMAC protecting? Is it exposed to external requests?

---

### H042 — Deprecated confirmTransaction Reliability Failure

- **Category:** CHAIN-01 (Transaction Construction), ERR-01 (Error Handling)
- **Origin:** KB — Deprecated API with known reliability issues
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The server uses the deprecated `connection.confirmTransaction()` method which has known reliability issues (silent timeout, false negatives). Settlement transactions may appear unconfirmed even when they succeeded on-chain, triggering unnecessary refunds or retry attempts.
- **Attack Vector:** Not attacker-initiated, but attacker can exploit the aftermath. Settlement TX succeeds on-chain but `confirmTransaction` times out (returns false). Server treats as failure — adds to `failedSettlements` or attempts refund. The refund may also succeed, resulting in winner getting paid AND refund being issued.
- **Target Code:** `server/services/escrow.js`, `server/services/solana.js`
- **Potential Impact:** Double payout (settlement + refund). Or legitimate settlement marked as failed.
- **Requires:** CHAIN-01, ERR-01 findings
- **Investigation Approach:** Verify which confirmation method is used. Is `confirmTransaction` deprecated version or the new one? What happens on timeout?

---

### H043 — Blockhash Expiry Transaction Stalling

- **Category:** CHAIN-01 (Transaction Construction), ERR-02 (Race Conditions)
- **Origin:** KB — Transaction construction timing vulnerability
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Transactions are constructed with a recent blockhash, but if the RPC is slow or the signing process is delayed, the blockhash may expire before the transaction is submitted. This creates a window where the transaction is valid but expired, requiring reconstruction.
- **Attack Vector:** During RPC congestion, `getLatestBlockhash` returns a hash that's already close to expiry. Transaction is constructed, signed, and submitted. By submission time, blockhash has expired. Transaction rejected. Settlement fails. failedSettlements retry may also fail if it doesn't get a fresh blockhash.
- **Target Code:** `server/services/escrow.js` (transaction construction)
- **Potential Impact:** Settlement failures during congestion. Fund lock.
- **Requires:** CHAIN-01, ERR-01 findings
- **Investigation Approach:** Check blockhash freshness at point of use. Is `lastValidBlockHeight` checked? How long between getBlockhash and sendTransaction?

---

### H044 — 2-Second Retry Insufficient for RPC Congestion

- **Category:** CHAIN-01 (Transaction Construction), ERR-01 (Error Handling)
- **Origin:** KB — Insufficient retry window
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The 2-second retry window for transaction confirmation is insufficient during Solana network congestion, leading to premature failure classification. Transactions that would eventually confirm are treated as failed.
- **Attack Vector:** During network congestion (slot skipping, validator delays), confirmation takes 10-30 seconds. The 2-second retry gives up. Transaction is moved to `failedSettlements`. Meanwhile, the transaction confirms on-chain. Retry attempt sends duplicate transaction.
- **Target Code:** `server/services/solana.js` (retry logic)
- **Potential Impact:** Premature failure detection. Duplicate transactions. Double settlement.
- **Requires:** CHAIN-01, ERR-01 findings
- **Investigation Approach:** Verify retry timeout. Is 2 seconds the confirmation timeout or retry delay? What's the retry strategy?

---

### H045 — 3 Fragmented Connection Objects Inconsistent RPC State

- **Category:** CHAIN-02 (RPC Client), ERR-01 (Error Handling)
- **Origin:** KB — Multiple RPC client instances with different configurations
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Three separate Solana `Connection` objects with potentially different commitment levels and endpoints create inconsistent views of on-chain state across different server modules.
- **Attack Vector:** One Connection uses `confirmed`, another uses `finalized`. A transaction confirmed on one Connection may not be visible on another. Settlement logic reads from one Connection, verification reads from another. State inconsistency leads to incorrect decisions.
- **Target Code:** `server/services/solana.js`, `server/services/escrow.js`, `server/services/shot-token.js` (Connection instances)
- **Potential Impact:** Inconsistent state reads leading to incorrect settlement, duplicate operations, or missed transactions.
- **Requires:** CHAIN-02, ERR-01 findings
- **Investigation Approach:** Count Connection instances. Compare commitment levels. Are they using the same RPC endpoint? Can they see different state?

---

### H046 — RPC Fails Open Default Behavior

- **Category:** CHAIN-02 (RPC Client), ERR-01 (Error Handling)
- **Origin:** KB — Fail-open pattern on external service dependency
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Multiple RPC-dependent operations default to permissive behavior on failure (return 0 balance, return success, continue execution) rather than failing closed. This allows attackers to exploit degraded RPC conditions for bypass.
- **Attack Vector:** Attacker waits for or induces RPC congestion. During degraded RPC, balance checks return 0 (fail open), transaction confirmations time out (treated as success in some paths), and verification calls fail silently. Attacker exploits the permissive defaults.
- **Target Code:** `server/services/solana.js`, `server/services/escrow.js`, error handling across RPC calls
- **Potential Impact:** Balance bypass, unverified settlements, unverified burns.
- **Requires:** CHAIN-02, ERR-01 findings
- **Investigation Approach:** Audit all RPC call error handlers. Do they fail open or closed? What defaults are used?

---

### H047 — positionUpdate 12K px/sec Movement Speed Exploit

- **Category:** LOGIC-01 (Business Logic), API-03 (WebSocket Security)
- **Origin:** KB — Insufficient server-side validation of client state
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The `positionUpdate` event allows clients to report their tank position. A 12K px/sec speed limit is either not enforced or too generous, allowing players to teleport to advantageous positions.
- **Attack Vector:** Attacker sends `positionUpdate` with drastically different coordinates between frames. If server validation is lax (12K px/sec is extremely fast), attacker can reposition their tank to dodge incoming projectiles or gain tactical advantage.
- **Target Code:** `server/socket-io/main.js` (positionUpdate handler)
- **Potential Impact:** Competitive advantage in wagered matches. Unfair fund collection.
- **Requires:** LOGIC-01, API-03 findings
- **Investigation Approach:** Check server-side position validation. What's the max speed? Is it enforced? Can position jumps be detected?

---

### H048 — No CSP on Client Vercel Deployment

- **Category:** WEB-02 (Security Headers)
- **Origin:** KB — Missing Content Security Policy
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The Vercel-deployed client has no Content Security Policy, allowing any injected script to execute, connect to any origin, and access `window.socket` and `window.solWallet`.
- **Attack Vector:** XSS via any vector (vulnerable npm dep, user-generated content, reflected input) executes arbitrary JavaScript. No CSP to restrict script sources or connect-src. Attacker's script accesses global socket and wallet, exfiltrates data, and manipulates game.
- **Target Code:** Client Vercel deployment configuration, `vercel.json` or `public/index.html`
- **Potential Impact:** Full client compromise via XSS. Wallet drain.
- **Requires:** WEB-02 findings
- **Investigation Approach:** Check for CSP header or meta tag. Check Vercel config. Check for any security headers.

---

### H049 — styleSrc unsafe-inline XSS Vector

- **Category:** WEB-02 (Security Headers)
- **Origin:** KB — Permissive CSP directive
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Server helmet configuration uses `unsafe-inline` for `style-src`, which while necessary for many React apps, also allows style-based XSS techniques and CSS injection.
- **Attack Vector:** Attacker finds CSS injection point. Uses `url()` in injected CSS to exfiltrate data. Or uses CSS to overlay fake UI elements (clickjacking variant).
- **Target Code:** Server helmet configuration, `server/index.js`
- **Potential Impact:** Data exfiltration via CSS, UI manipulation.
- **Requires:** WEB-02 findings
- **Investigation Approach:** Review full helmet CSP configuration. Is unsafe-inline only on style-src? What about script-src?

---

### H050 — trust-proxy Not Configured Rate Limit Bypass

- **Category:** WEB-02 (Security Headers), ERR-03 (Rate Limiting)
- **Origin:** KB — Misconfigured reverse proxy trust
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `trust proxy` is not configured on Express, causing `express-rate-limit` to see the proxy's IP instead of the client's real IP. All clients behind the same proxy share one rate limit bucket.
- **Attack Vector:** All Render/Vercel traffic comes through a proxy. Without `trust proxy`, all clients appear as the same IP. Rate limit applies to the proxy IP — either all clients are rate-limited together, or the rate limit is too generous (shared across all).
- **Target Code:** `server/index.js` (Express configuration, rate-limit setup)
- **Potential Impact:** Rate limiting ineffective. DoS attacks not mitigated.
- **Requires:** WEB-02, ERR-03 findings
- **Investigation Approach:** Check for `app.set('trust proxy', ...)`. Check rate-limit configuration. Is `X-Forwarded-For` trusted?

---

### H051 — txSignature No Format Validation

- **Category:** INJ-01 (Injection), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Missing input format validation on security parameter
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Transaction signatures are accepted without format validation. Malformed signatures passed to `getParsedTransaction` may cause unexpected behavior or trigger RPC errors that are handled permissively.
- **Attack Vector:** Attacker sends `prestigeBurn` with `txSignature: "'; DROP TABLE ..."` or extremely long strings. The RPC call with malformed input may return an error that's caught and handled permissively, or may cause unexpected behavior in the verification logic.
- **Target Code:** `server/services/shot-token.js` (verifyBurnTransaction), `server/socket-io/main.js`
- **Potential Impact:** Verification bypass, error-handling exploitation.
- **Requires:** INJ-01, CHAIN-01 findings
- **Investigation Approach:** Is txSignature validated as base58 format? What length? What happens with malformed input?

---

### H052 — validatePayload Dead Code Leaves Gap

- **Category:** INJ-05 (Prototype Pollution), API-03 (WebSocket Security)
- **Origin:** KB — Dead validation code
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `validatePayload` function exists but is never called, leaving all socket event payloads unvalidated. Any event handler that processes client payloads is vulnerable to unexpected types, extra properties, or prototype pollution.
- **Attack Vector:** Attacker sends socket events with `__proto__` properties in the payload. Without validation, these pass directly into object operations. If any handler uses `Object.assign` or spread operator with the payload, prototype pollution occurs.
- **Target Code:** `server/middleware/guards.js` (validatePayload), all socket event handlers
- **Potential Impact:** Prototype pollution leading to auth bypass, logic manipulation, or RCE.
- **Requires:** INJ-05, API-03 findings
- **Investigation Approach:** Confirm `validatePayload` has zero call sites. Check which handlers spread or assign from client payloads. Test prototype pollution vectors.

---

### H053 — nodemon in Production Dependencies

- **Category:** DEP-01 (Dependencies), SEC-02 (Secret Management)
- **Origin:** KB — Dev dependency in production
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `nodemon` in production dependencies adds unnecessary attack surface (file watching, process restart capabilities) and its dependency tree may contain vulnerabilities.
- **Attack Vector:** If an attacker can write a file (via any file upload vulnerability), nodemon's file watcher may restart the server with attacker-controlled code. Additionally, nodemon's dependencies expand the vulnerability surface.
- **Target Code:** `server/package.json`
- **Potential Impact:** Code execution via file write + server restart. Expanded vulnerability surface.
- **Requires:** DEP-01 findings
- **Investigation Approach:** Check if nodemon is in dependencies or devDependencies. Is it used in the production start script? What's the file watch pattern?

---

### H054 — ws/express/socket.io Known CVE Exploitation

- **Category:** DEP-01 (Dependencies)
- **Origin:** KB — Known CVEs in production dependencies
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Server npm audit shows 30 vulnerabilities (18 high). Known CVEs in ws, express, or socket.io may be directly exploitable for DoS, SSRF, or request smuggling.
- **Attack Vector:** Identify specific CVEs from npm audit. Cross-reference with exploit databases. Craft exploit for the most severe applicable CVE. Target the server directly.
- **Target Code:** `server/package.json`, `server/node_modules/`
- **Potential Impact:** Server compromise. DoS during active matches. Potential RCE.
- **Requires:** DEP-01 findings
- **Investigation Approach:** Run `npm audit` on server. Identify exploitable CVEs. Check if affected code paths are reachable.

---

### H055 — Terrain Generation Race Condition

- **Category:** ERR-02 (Race Conditions), LOGIC-01 (Business Logic)
- **Origin:** KB — Cache write race
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Two concurrent `requestTerrain` events before the terrain cache is set both generate independent terrain maps. The second write overwrites the first. Players may receive different terrain — one sees the original, the other sees the overwrite.
- **Attack Vector:** Both players send `requestTerrain` before the server has generated terrain for the room. Both handlers enter the generation path concurrently. Each generates different terrain (CSPRNG-based). One overwrites the other. The player who received the first terrain sees different ground than the player who receives the second.
- **Target Code:** `server/socket-io/main.js` (requestTerrain handler)
- **Potential Impact:** Terrain desynchronization. Players see different game state. Unfair advantage in wagered matches.
- **Requires:** ERR-02, LOGIC-01 findings
- **Investigation Approach:** Is terrain cached after first generation? Is there a check-then-generate race? Do both players receive the same terrain?

---

### H056 — Shop Phase Double-Trigger Race

- **Category:** ERR-02 (Race Conditions), LOGIC-01 (Business Logic)
- **Origin:** KB — Duplicate trigger from concurrent events
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Two concurrent `ready` events from both players can both trigger `endShopPhase`, potentially causing double gold distribution or state corruption.
- **Attack Vector:** Both players click "ready" at the same instant. Both `ready` handlers check `shopReady[host] && shopReady[player]` — both find true. Both call `endShopPhase`. Gold is distributed twice or the phase transition fires twice.
- **Target Code:** `server/socket-io/main.js` (ready handler ~line 1420)
- **Potential Impact:** Double gold distribution. Gold inflation affecting weapon purchases.
- **Requires:** ERR-02, LOGIC-01 findings
- **Investigation Approach:** Is `endShopPhase` called with a guard? Can it be called twice? What happens if it runs twice?

---

### H057 — Gold Economy Manipulation via Concurrent Shop Events

- **Category:** LOGIC-02 (Financial Logic), ERR-02 (Race Conditions)
- **Origin:** Novel — Emergent from concurrent shop phase operations
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** During the shop phase, concurrent `buyWeapon` events from the same player can exploit TOCTOU gaps in gold balance checks, allowing purchase of more weapons than gold permits.
- **Attack Vector:** Player has 500 gold. Sends two `buyWeapon` events for a 500G weapon concurrently. Both handlers read gold=500, both check 500>=500 (pass), both deduct 500. Gold goes to -500 (or wraps). Player has two weapons for the price of one.
- **Target Code:** `server/socket-io/main.js` (buyWeapon handler), `server/services/gold.js`
- **Potential Impact:** In-match economic advantage. Extra weapons in wagered matches.
- **Requires:** LOGIC-02, ERR-02 findings
- **Investigation Approach:** Is there an `await` between gold balance check and deduction in `buyWeapon`? Is gold stored as a simple number that can go negative?

---

### H058 — Cross-Origin WebSocket Connection Hijacking

- **Category:** API-03 (WebSocket Security), WEB-02 (Security Headers)
- **Origin:** Novel — Missing origin verification on WebSocket upgrade
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Socket.IO may not verify the `Origin` header on WebSocket upgrade requests, allowing a malicious page on a different domain to establish a WebSocket connection to the game server using the victim's credentials (if cookies or other ambient auth is present).
- **Attack Vector:** Victim visits attacker's page while authenticated to SolShot. Attacker's JavaScript opens Socket.IO connection to game server. Browser sends cookies/auth headers. Server accepts the cross-origin WebSocket. Attacker controls the socket from their page.
- **Target Code:** `server/index.js` (Socket.IO CORS config), `server/socket-io/main.js`
- **Potential Impact:** Session hijacking via cross-origin WebSocket.
- **Requires:** API-03, WEB-02 findings
- **Investigation Approach:** Check Socket.IO CORS configuration. Is `cors: { origin: '*' }` set? Is the Origin header validated?

---

### H059 — Deposit Timer vs Confirmation Race

- **Category:** ERR-02 (Race Conditions), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Timer callback races with async confirmation
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The deposit timer (timeout for unconfirmed deposits) can fire while the deposit confirmation is being processed, resulting in a refund being triggered for a deposit that was actually confirmed.
- **Attack Vector:** Player deposits at the last second before timeout. Deposit confirmation is in-flight (awaiting RPC). Timer fires — starts refund process. Confirmation arrives — writes deposit flag. Both the refund and the deposit-confirmed paths execute concurrently.
- **Target Code:** `server/socket-io/main.js` (depositTimers, escrowDepositConfirm)
- **Potential Impact:** Refund issued for a confirmed deposit. Fund loss for one player.
- **Requires:** ERR-02, CHAIN-01 findings
- **Investigation Approach:** Is the deposit timer cleared before or after confirmation processing? Can both paths execute?

---

### H060 — joinQueue No Balance Check Enables Free Matchmaking

- **Category:** LOGIC-01 (Business Logic), ERR-03 (Rate Limiting)
- **Origin:** KB — Missing precondition check on entry point
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The `joinQueue` handler for matchmaking does not verify the player's SOL balance before placing them in the queue, allowing players with insufficient funds to enter wagered matchmaking and be paired with legitimate players.
- **Attack Vector:** Attacker joins wagered matchmaking queue with 0 SOL. Gets paired with legitimate player. Match starts. Attacker's deposit fails (no funds). Legitimate player has deposited. Match plays out — settlement fails or refund triggers. Legitimate player's time wasted and funds locked.
- **Target Code:** `server/socket-io/main.js` (joinQueue handler ~line 1242)
- **Potential Impact:** Griefing. Legitimate players locked in unplayable wagered matches.
- **Requires:** LOGIC-01, ERR-03 findings
- **Investigation Approach:** Does `joinQueue` call `getBalance`? For wagered modes only? What happens after pairing if one player can't deposit?

---

### H061 — No Global Room Cap Resource Exhaustion

- **Category:** ERR-03 (Rate Limiting), API-03 (WebSocket Security)
- **Origin:** KB — Missing resource ceiling
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** There is no maximum limit on the number of rooms that can be created. An attacker can create thousands of rooms, consuming server memory for each room's state stores and broadcasting room lists to all clients.
- **Attack Vector:** Attacker opens many connections, creates a room on each. Server allocates memory for each room (rooms Map, matchStates, goldStates, weaponInventories, etc.). After thousands of rooms, server memory is exhausted. Combined with H035 (broadcastRooms amplification), bandwidth is also saturated.
- **Target Code:** `server/socket-io/main.js` (createRoom handler)
- **Potential Impact:** Server OOM. All in-memory state lost. Active match fund loss.
- **Requires:** ERR-03, API-03 findings
- **Investigation Approach:** Is there a room count limit? Is room creation rate-limited per user? How much memory does each room consume?

---

### H062 — 32-bit Room ID Space Collision Probability

- **Category:** CRYPTO-01 (RNG), LOGIC-01 (Business Logic)
- **Origin:** Novel — Birthday paradox on identifier space
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Room IDs use CSPRNG but the 32-bit ID space makes birthday collisions probable at scale (~50% at ~65K concurrent rooms). A collision means a player joining room X accidentally joins room Y.
- **Attack Vector:** At high concurrency (many rooms), the birthday paradox means room ID collisions become non-negligible. A collision means `joinRoom(collisionId)` finds the wrong room. Player joins an unrelated match. Game logic breaks.
- **Target Code:** `server/socket-io/main.js` (room ID generation)
- **Potential Impact:** Players joining wrong matches. Wagered match corruption.
- **Requires:** CRYPTO-01, LOGIC-01 findings
- **Investigation Approach:** What's the room ID format and entropy? Is there a collision check on creation? What's the expected concurrency?

---

### H063 — verifyWalletSignature Error Message Information Leak

- **Category:** SEC-01 (Wallet Security), DATA-04 (Logging)
- **Origin:** KB — Internal error details in client response
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** `verifyWalletSignature` catch block returns `err.message` to the client, potentially disclosing NaCl/Node.js library internals, version information, or internal state.
- **Attack Vector:** Attacker sends malformed auth payloads to trigger different error paths. Error messages reveal library versions, internal function names, or state information. Attacker uses this for fingerprinting and targeted exploitation.
- **Target Code:** `server/middleware/auth.js` (line 63, verifyWalletSignature catch)
- **Potential Impact:** Information disclosure. Attack surface mapping.
- **Requires:** SEC-01, DATA-04 findings
- **Investigation Approach:** What errors can verifyWalletSignature throw? What do the messages contain? Is err.message from nacl, web3, or Node built-in?

---

## Tier 3 — MEDIUM-LOW

---

### H064 — JWT 24h Expiry Window If Later Wired Up

- **Category:** AUTH-01 (Authentication)
- **Origin:** KB — Overly permissive token lifetime
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** The JWT has a 24-hour expiry. If later wired into HTTP endpoints, this long window allows extended replay attacks and reduces the effectiveness of token-based access control.
- **Target Code:** `server/middleware/auth.js`
- **Investigation Approach:** Verify JWT expiry configuration. Is it configurable via env?

---

### H065 — authenticatedWallets Memory Leak on Disconnect

- **Category:** AUTH-01 (Authentication), ERR-03 (Rate Limiting)
- **Origin:** KB — Missing cleanup on connection close
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `authenticatedWallets[client.id]` entries may not be cleaned up when sockets disconnect, leading to gradual memory growth.
- **Target Code:** `server/socket-io/main.js` (disconnect handler, authenticatedWallets)
- **Investigation Approach:** Check disconnect handler. Is `delete authenticatedWallets[client.id]` called? In all disconnect paths?

---

### H066 — Prototype Pollution via Object Spread on Socket Payloads

- **Category:** INJ-05 (Prototype Pollution)
- **Origin:** KB — Unsafe object handling
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** If any event handler uses `Object.assign` or `{...payload}` to merge client payloads into server objects, `__proto__` properties in the payload can pollute the prototype chain.
- **Target Code:** All socket event handlers processing payloads
- **Investigation Approach:** Search for `Object.assign`, spread operators on client payloads. Test with `__proto__` injection.

---

### H067 — giveTurn Relay Unsanitized Payload Injection

- **Category:** INJ-05 (Prototype Pollution), API-03 (WebSocket Security)
- **Origin:** KB — Unsanitized relay
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** The `giveTurn` event relays its payload to other players without sanitization. Malicious payloads could contain XSS vectors or oversized data that crashes the receiving client.
- **Target Code:** `server/socket-io/main.js` (giveTurn handler)
- **Investigation Approach:** Does the handler sanitize the relayed payload? Is there a size limit?

---

### H068 — Socket.IO Event Name Enumeration

- **Category:** API-03 (WebSocket Security), AUTH-03 (Authorization)
- **Origin:** KB — Implicit event discovery
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** An attacker can enumerate all registered socket event handlers by sending events with various names and observing which return errors vs which are silently ignored.
- **Target Code:** `server/socket-io/main.js`
- **Investigation Approach:** Does Socket.IO respond differently to known vs unknown events?

---

### H069 — Room State Leak via broadcastRooms

- **Category:** DATA-04 (Logging), API-03 (WebSocket Security)
- **Origin:** KB — Oversharing in broadcast
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `broadcastRooms` may include sensitive room state (wager amounts, player wallet addresses, match status) in the broadcast payload, visible to all connected clients.
- **Target Code:** `server/socket-io/main.js` (broadcastRooms)
- **Investigation Approach:** What data does broadcastRooms include? Are wallet addresses or wager amounts exposed?

---

### H070 — Public Key Logged Without Structured Redaction

- **Category:** DATA-04 (Logging), SEC-01 (Wallet Security)
- **Origin:** KB — Inconsistent logging
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** Authority public keys are logged via `console.log` at startup, bypassing pino redaction rules.
- **Target Code:** `server/services/keys.js` (line 57), `server/services/escrow.js` (lines 82-86)
- **Investigation Approach:** Are these public keys (not secret)? Is the logging path through pino or console?

---

### H071 — BN Import Path Fragility

- **Category:** DEP-01 (Dependencies), CHAIN-01 (Transaction Construction)
- **Origin:** KB — Fragile import pattern
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `BN` imported from `bn.js` directly (not from `@coral-xyz/anchor`) due to Anchor 0.32.1 breaking change. If `bn.js` version drifts from what Anchor expects, serialization mismatches can corrupt on-chain data.
- **Target Code:** `server/services/escrow.js` (BN import)
- **Investigation Approach:** Check bn.js version vs Anchor's expected version. Test BN serialization compatibility.

---

### H072 — Client config-overrides.js Polyfill Security

- **Category:** DEP-01 (Dependencies), WEB-02 (Security Headers)
- **Origin:** KB — Custom build configuration
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** `config-overrides.js` adds Node.js polyfills (Buffer, crypto, etc.) to the client bundle. If these polyfills have vulnerabilities, they're exposed in the browser context.
- **Target Code:** `client/config-overrides.js`
- **Investigation Approach:** What polyfills are added? Are they latest versions? Any known CVEs?

---

### H073 — Error Handler Returns Stack Trace to Client

- **Category:** ERR-01 (Error Handling), DATA-04 (Logging)
- **Origin:** KB — Verbose error responses
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** Some error handlers return stack traces or internal error details to the client, revealing server file paths, line numbers, and library internals.
- **Target Code:** Various error handlers across server codebase
- **Investigation Approach:** Search for `err.stack` or `err.message` in socket emit calls.

---

### H074 — Unhandled Promise Rejection Crashes

- **Category:** ERR-01 (Error Handling)
- **Origin:** KB — Missing rejection handler
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** Unhandled promise rejections in async handlers can crash the Node.js process. Node 15+ defaults to throwing on unhandled rejections. A server crash during active matches = total state loss.
- **Target Code:** All async handlers without try/catch
- **Investigation Approach:** Is there a global `unhandledRejection` handler? Do all async event handlers have try/catch?

---

### H075 — Wind Generation Predictability

- **Category:** CRYPTO-01 (RNG), LOGIC-01 (Business Logic)
- **Origin:** KB — RNG review
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** `generateWind()` uses CSPRNG which is correct. However, if wind is communicated to clients before the turn starts, an automated client could use the wind value to calculate optimal shots.
- **Target Code:** `server/socket-io/main.js` (generateWind, WindDisplay)
- **Investigation Approach:** When is wind value sent to clients? Before or after the player commits their shot?

---

### H076 — Match Mode Dual Definition Drift

- **Category:** LOGIC-01 (Business Logic)
- **Origin:** KB — Duplicate definitions
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `MATCH_MODES` defined in both server `solana.js` and client `LobbyScreen.js`. If they drift, client may offer modes the server rejects, or server may accept modes the client didn't intend.
- **Target Code:** `server/services/solana.js`, `client/src/screens/LobbyScreen.js`
- **Investigation Approach:** Compare both definitions. Are they identical? Is there a shared module?

---

### H077 — Weapon Array Integrity Server vs Client

- **Category:** LOGIC-01 (Business Logic)
- **Origin:** KB — State synchronization
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** If the client's weapon definitions drift from the server's, weapon selection may reference weapons the server doesn't recognize, or damage values may differ.
- **Target Code:** `client/src/data/weapons.js`, `server/services/physics.js`
- **Investigation Approach:** Are weapon definitions shared? What happens if client sends an unknown weapon ID?

---

### H078 — Dead Code in Standard.js and extraWeapons.js

- **Category:** LOGIC-01 (Business Logic), DEP-01 (Dependencies)
- **Origin:** KB — Dead code maintenance risk
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** `Standard.js` has 10 dead weapon classes, `extraWeapons.js` is entirely dead code. These files add unnecessary build size and confusion. If accidentally imported, they could override active weapon behavior.
- **Target Code:** `client/src/data/Standard.js`, `client/src/data/extraWeapons.js`
- **Investigation Approach:** Verify no imports of dead weapon classes. Check if build tree-shakes them.

---

### H079 — IDL Sync Drift Between Server and Anchor Build

- **Category:** CHAIN-01 (Transaction Construction), DEP-01 (Dependencies)
- **Origin:** KB — Manual file sync requirement
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `server/idl/solshot_escrow.json` is manually copied from `target/idl/`. If the program is updated and the IDL isn't re-copied, the server will construct transactions with wrong accounts or arguments, causing silent failures.
- **Target Code:** `server/idl/solshot_escrow.json`, `target/idl/`
- **Investigation Approach:** Compare file hashes. Are they identical? Is there a CI check?

---

### H080 — Client @solana/spl-token Version Pinning

- **Category:** DEP-01 (Dependencies), CHAIN-03 (Wallet Adapter)
- **Origin:** KB — Version management
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If `@solana/spl-token` is not pinned, a patch update could change burn instruction encoding and break prestige burns silently.
- **Target Code:** `client/package.json`
- **Investigation Approach:** Is the version pinned? What's the installed version? Are there known issues?

---

### H081 — Socket Reconnect 30s Window Abuse

- **Category:** AUTH-01 (Authentication), LOGIC-01 (Business Logic)
- **Origin:** KB — Reconnection window exploitation
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** The 30-second reconnect window preserves full match state for the disconnected player. An attacker can intentionally disconnect during unfavorable situations, delay 29 seconds (opponent's turn timer wasting), then reconnect to resume with a fresh perspective.
- **Target Code:** `server/socket-io/main.js` (reconnect logic, pendingReconnects)
- **Investigation Approach:** Does the opponent's turn timer pause during reconnect? Can the disconnecting player gain information about opponent's actions during the window?

---

### H082 — Escrow PDA Reuse After Match Completion

- **Category:** CHAIN-06 (PDA Interaction), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Account lifecycle gap
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** After a match is settled, the escrow PDA (derived from match ID) is closed. If the same match ID is reused (e.g., via `playAgainRequest`), the PDA would be re-derived to the same address. A partially-closed account could be reinitiated with unexpected state.
- **Target Code:** On-chain program, `server/services/escrow.js`, `server/socket-io/main.js`
- **Investigation Approach:** Is the match ID reused across matches? Is the PDA account fully closed (zero lamports)? What happens if you init a previously-closed PDA?

---

### H083 — Turn Timer Clear on Room Removal

- **Category:** ERR-02 (Race Conditions), LOGIC-01 (Business Logic)
- **Origin:** KB — Timer cleanup gap
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** Turn timers may not be properly cleared when rooms are removed, leading to timer callbacks firing for non-existent rooms and accessing stale/undefined state.
- **Target Code:** `server/socket-io/main.js` (turnTimers, room cleanup)
- **Investigation Approach:** Are turn timers cleared in all room cleanup paths? What happens if a timer fires for a deleted room?

---

### H084 — shopReady Race on Concurrent Ready Events

- **Category:** ERR-02 (Race Conditions)
- **Origin:** KB — Duplicate related to H056
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** `shopReady` flags set concurrently by both players without synchronization.
- **Target Code:** `server/socket-io/main.js` (shopReady)
- **Investigation Approach:** See H056.

---

### H085 — Gold Overflow/Underflow Boundary Check

- **Category:** LOGIC-02 (Financial Logic)
- **Origin:** KB — Numeric boundary
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** In-match gold uses JavaScript numbers. Extreme values (very high HP damage bonus) could cause integer overflow or negative gold that wraps.
- **Target Code:** `server/services/gold.js`
- **Investigation Approach:** Are there bounds checks on gold? Can it go negative? What's the max possible gold?

---

### H086 — Weapon Purchase Validation Integrity

- **Category:** LOGIC-01 (Business Logic), LOGIC-02 (Financial Logic)
- **Origin:** KB — Purchase validation
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `buyWeapon` handler may not validate that the requested weapon ID exists in the current round's weapon pool, allowing purchase of arbitrary weapons.
- **Target Code:** `server/socket-io/main.js` (buyWeapon handler)
- **Investigation Approach:** Is weapon ID validated against the available pool? Can a player buy a weapon not offered this round?

---

### H087 — Socket Event Ordering Assumptions

- **Category:** API-03 (WebSocket Security), ERR-02 (Race Conditions)
- **Origin:** KB — Event ordering
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** Server logic may assume events arrive in a specific order (authenticate before joinRoom, ready before fire). Out-of-order events from a malicious client could reach unexpected code paths.
- **Target Code:** `server/socket-io/main.js` (all handlers)
- **Investigation Approach:** Are there state guards on all handlers? What happens if fire is sent before ready?

---

### H088 — Client-Side Phaser Access via window.solWallet

- **Category:** CHAIN-03 (Wallet Adapter), WEB-02 (Security Headers)
- **Origin:** KB — Global wallet exposure
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `window.solWallet` is exposed globally for Phaser access. Any XSS can call `signAndSendTransaction()` directly, signing arbitrary transactions without user approval.
- **Target Code:** `client/src/wallet/WalletContext.js` (window.solWallet assignment)
- **Investigation Approach:** What methods are exposed on window.solWallet? Can it sign arbitrary transactions? Does the wallet adapter prompt the user?

---

### H089 — Helmet Configuration Gaps

- **Category:** WEB-02 (Security Headers), SEC-02 (Secret Management)
- **Origin:** KB — Partial security header coverage
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** Helmet may not be fully configured — missing HSTS, X-Frame-Options, or Referrer-Policy headers that could enable clickjacking or data leakage.
- **Target Code:** `server/index.js` (helmet configuration)
- **Investigation Approach:** Check all helmet options. Are defaults sufficient? Is HSTS enabled for HTTPS?

---

### H090 — Express Rate Limit Configuration Review

- **Category:** ERR-03 (Rate Limiting), WEB-02 (Security Headers)
- **Origin:** KB — Rate limit effectiveness
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** `express-rate-limit` may be configured with too-generous limits or apply only to HTTP (not WebSocket), leaving the primary attack surface (socket events) unthrottled.
- **Target Code:** `server/index.js` (rate limit setup)
- **Investigation Approach:** What are the rate limit values? Does it apply to WS upgrade? Is it per-IP or per-route?

---

### H091 — MongoDB Connection String Security

- **Category:** DATA-01 (Database), SEC-02 (Secret Management)
- **Origin:** KB — Database credential management
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** MongoDB connection string in environment variable may contain embedded credentials. If logged or exposed, database access is compromised.
- **Target Code:** `server/index.js` or database configuration
- **Investigation Approach:** Is the connection string in env? Does it contain credentials? Is it logged anywhere?

---

### H092 — Database Index Missing for Burn Lookups

- **Category:** DATA-01 (Database), ERR-03 (Rate Limiting)
- **Origin:** KB — Performance bottleneck
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If burn transaction lookups hit the database without proper indexing, high-volume burn verification creates a performance bottleneck that can be exploited for DoS.
- **Target Code:** `server/models/User.js`, `server/services/shot-token.js`
- **Investigation Approach:** Are burn-related queries indexed? Is the DB queried for burn verification? What's the query pattern?

---

### H093 — Ghost Match Replay Attack

- **Category:** CHAIN-06 (PDA Interaction), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Post-settlement state exploitation
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** After a match is settled and the escrow account closed, an attacker could attempt to replay the settlement transaction. If the account is re-created (same PDA) in a new match, the replayed TX might interact with the new escrow.
- **Target Code:** On-chain program, `server/services/escrow.js`
- **Investigation Approach:** Does Solana prevent replaying settled transactions? Is the PDA address reusable? What prevents old TX from affecting new account?

---

### H094 — Coordinated Queue Flooding for Matchmaking Manipulation

- **Category:** ERR-03 (Rate Limiting), LOGIC-01 (Business Logic)
- **Origin:** Novel — Sybil attack on matchmaking
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** An attacker with multiple wallets can flood the matchmaking queue, controlling who legitimate players are paired with. By occupying all queue slots, the attacker can pair with specific targets or deny service.
- **Target Code:** `server/socket-io/main.js` (joinQueue, matchmaking logic)
- **Investigation Approach:** Is the queue bounded? Is there a per-wallet limit? Can one entity control multiple queue entries?

---

### H095 — Memory State Divergence After Server Restart

- **Category:** ERR-01 (Error Handling), LOGIC-02 (Financial Logic)
- **Origin:** Novel — State loss scenario
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** All game and financial state is in-memory. A server restart during active wagered matches results in total state loss. Players who deposited have funds locked in escrow with no server-side record of the match. The `failedSettlements` retry queue is also lost.
- **Target Code:** All in-memory state stores, `server/socket-io/main.js`
- **Investigation Approach:** What happens on server restart? Is there any state persistence? Can escrows be recovered?

---

### H096 — Cross-Tab Wallet Session Confusion

- **Category:** CHAIN-03 (Wallet Adapter), AUTH-01 (Authentication)
- **Origin:** Novel — Multi-tab state desync
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** A user with multiple browser tabs open may have different authentication states across tabs. If one tab reconnects and the other doesn't, socket events from the stale tab may interfere with the active tab's match.
- **Target Code:** `client/src/App.js` (reconnect logic), `server/socket-io/main.js`
- **Investigation Approach:** How does the server handle multiple sockets with the same wallet? Does it enforce single-session?

---

### H097 — WebSocket Binary Frame Injection

- **Category:** API-03 (WebSocket Security)
- **Origin:** Novel — Transport-level attack
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If Socket.IO binary transport is enabled, an attacker can send binary frames that may be parsed differently from JSON, potentially bypassing input validation.
- **Target Code:** `server/index.js` (Socket.IO config)
- **Investigation Approach:** Is binary transport enabled? How does Socket.IO parse binary frames? Can they bypass JSON validation?

---

### H098 — Phantom Room State After Cleanup Failure

- **Category:** ERR-01 (Error Handling), LOGIC-01 (Business Logic)
- **Origin:** Novel — Partial cleanup state
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** If `cleanupRoom` fails partway through (error during settlement or state deletion), the room may exist in a partially-cleaned state — removed from some Maps but not others. Subsequent operations may find inconsistent state.
- **Target Code:** `server/socket-io/main.js` (cleanupRoom)
- **Investigation Approach:** Is cleanupRoom atomic? What happens if it fails midway? Are all state stores cleaned in order?

---

### H099 — Economic Amplification via Rapid Match Cycling

- **Category:** LOGIC-02 (Financial Logic), ERR-03 (Rate Limiting)
- **Origin:** Novel — Economic model attack
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** Two colluding players can rapidly cycle through practice matches to farm SHOT token milestones without wagering. If SHOT emission is tied to match count (not wager amount), the economic model can be gamed.
- **Target Code:** `server/services/shot-token.js` (recordMatchPlayed), SHOT emission logic
- **Investigation Approach:** Are SHOT milestones tied to wagered matches only? Can practice matches trigger milestones? Is there a cooldown?

---

### H100 — Selective Disconnect Timing for Favorable Settlement

- **Category:** LOGIC-01 (Business Logic), ERR-02 (Race Conditions)
- **Origin:** Novel — Strategic disconnection
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** A player losing a wagered match can strategically disconnect at the exact moment before the killing shot lands, exploiting the disconnect → settlement path which may have different outcome determination than the normal fire → settlement path.
- **Target Code:** `server/socket-io/main.js` (disconnect handler vs fire handler)
- **Investigation Approach:** Does the disconnect handler determine winner differently? Can disconnecting avoid a loss? What happens to the wager?

---

### H101 — Anchor CPI Return Data Manipulation

- **Category:** CHAIN-01 (Transaction Construction), SOS Cross-Boundary
- **Origin:** Novel — CPI return data trust
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** If the server reads return data from Anchor CPI calls (e.g., settlement confirmation), a malicious program at the same address could return fabricated data. Less likely on devnet but relevant for mainnet.
- **Target Code:** `server/services/escrow.js` (settlement response parsing)
- **Investigation Approach:** Does the server parse CPI return data? Does it verify the program address? Is the program deployed and immutable?

---

### H102 — Token Account Rent Exemption Griefing

- **Category:** CHAIN-06 (PDA Interaction), SOS Cross-Boundary
- **Origin:** Novel — Account economics attack
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** An attacker can create many small escrow accounts near the rent-exemption threshold, forcing the server to pay rent or have accounts closed, disrupting active matches.
- **Target Code:** On-chain program (account creation), `server/services/escrow.js`
- **Investigation Approach:** Who pays rent for escrow accounts? What's the minimum balance? Can an attacker force account creation at server's expense?

---

### H103 — Concurrent Match + Prestige Burn State Confusion

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Cross-feature state interference
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** A player can burn SHOT for prestige while in an active wagered match. If the burn verification and match settlement interact with overlapping state (e.g., wallet balance, SHOT supply tracking), the concurrent operations may create inconsistencies.
- **Target Code:** `server/services/shot-token.js`, `server/socket-io/main.js`
- **Investigation Approach:** Can a player trigger prestige burn while in a match? Do they share any state stores? Can the burn affect settlement?

---

### H104 — Server Clock Skew Settlement Timing Exploit

- **Category:** CHAIN-01 (Transaction Construction), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Infrastructure timing
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If the server's clock drifts from Solana validators, timestamp-based checks (auth timestamp, escrow timeout) may behave unexpectedly. A significant drift could allow expired tokens to be accepted or premature timeouts.
- **Target Code:** `server/middleware/auth.js` (timestamp check), on-chain timeout
- **Investigation Approach:** Is server time used for any critical decisions? How tolerant are the checks of clock skew?

---

### H105 — Progressive Wager Escalation Attack

- **Category:** LOGIC-02 (Financial Logic), LOGIC-01 (Business Logic)
- **Origin:** Novel — Economic model exploitation
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** An attacker can exploit the wager validation to progressively escalate wagers beyond intended limits, especially if `playAgainRequest` preserves the previous wager without re-validating against current mode limits.
- **Target Code:** `server/socket-io/main.js` (wager validation, playAgainRequest)
- **Investigation Approach:** Is the wager re-validated on play-again? Are wager limits enforced per mode? Can the wager be increased between rounds?

---

### H106 — Socket.IO Namespace Isolation Bypass

- **Category:** API-03 (WebSocket Security)
- **Origin:** Novel — Transport isolation
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If the game server doesn't use Socket.IO namespaces, all events share the default namespace. An attacker can listen to all events from all rooms, potentially observing other players' game state.
- **Target Code:** `server/socket-io/main.js` (Socket.IO configuration)
- **Investigation Approach:** Are namespaces used? Are Socket.IO rooms properly isolating events? Can a player outside a room receive room events?

---

### H107 — Match State Machine Invalid Transition Exploitation

- **Category:** LOGIC-01 (Business Logic)
- **Origin:** KB — State machine bypass
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** The match state machine (`MATCH_STATES`) may allow invalid transitions if `transitionState` doesn't strictly enforce the valid transition graph. An attacker sending events for a different state could bypass intended flow.
- **Target Code:** `server/socket-io/main.js` (transitionState, MATCH_STATES)
- **Investigation Approach:** Is there a strict state transition graph? What happens on invalid transitions? Are all handlers guarded by state checks?

---

### H108 — Terrain Seed Prediction for Spawn Advantage

- **Category:** CRYPTO-01 (RNG), LOGIC-01 (Business Logic)
- **Origin:** Novel — Game fairness
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If terrain is generated using CSPRNG seeded per-room but the seed is derivable (from room ID or timestamp), an attacker could predict terrain and choose optimal spawn positions.
- **Target Code:** `server/socket-io/main.js` (terrain generation), `server/services/physics.js`
- **Investigation Approach:** How is terrain generated? Is the seed deterministic from known values? Are spawn positions random or fixed?

---

### H109 — Escrow Account Lamport Drain via Dust Operations

- **Category:** CHAIN-06 (PDA Interaction), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Account economics
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** Repeated create/cancel cycles on escrow accounts with dust deposits could drain the server authority's SOL through transaction fees, even if the escrow itself is refunded.
- **Target Code:** `server/services/escrow.js`, transaction fee economics
- **Investigation Approach:** Who pays transaction fees for create/cancel? Can an attacker force many cycles? What's the cost per cycle?

---

### H110 — WebSocket Heartbeat Manipulation for Keepalive Abuse

- **Category:** API-03 (WebSocket Security), ERR-03 (Rate Limiting)
- **Origin:** Novel — Transport keepalive exploitation
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** Socket.IO heartbeat mechanism can be exploited to keep connections alive indefinitely without sending gameplay events, occupying server resources.
- **Target Code:** `server/index.js` (Socket.IO pingInterval, pingTimeout)
- **Investigation Approach:** What are the heartbeat settings? Can idle connections be cleaned up? Is there a max connection limit?

---

### H111 — Asymmetric Information Exploit via Room State Peek

- **Category:** LOGIC-01 (Business Logic), API-03 (WebSocket Security)
- **Origin:** Novel — Information asymmetry
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** By connecting a second socket to observe room events, an attacker can gain information about the opponent's actions (weapon selection, aim angle) before they're officially revealed, gaining an unfair advantage in wagered matches.
- **Target Code:** `server/socket-io/main.js` (event broadcasting within rooms)
- **Investigation Approach:** Can a non-participant socket join a room? Are events broadcast to all room members? What game state is revealed before the turn completes?

---

### H112 — Prestige Tier Rollback via Failed Settlement

- **Category:** LOGIC-02 (Financial Logic), ERR-01 (Error Handling)
- **Origin:** Novel — State rollback gap
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If a prestige burn succeeds (SHOT burned on-chain, tier advanced server-side) but a subsequent operation fails, there may be no rollback mechanism — the tier is advanced but the burn is irreversible.
- **Target Code:** `server/socket-io/main.js` (prestigeBurn handler), `server/services/shot-token.js`
- **Investigation Approach:** What happens after burn verification succeeds but tier update fails? Is the burn irreversible? Can the tier be rolled back?

---

### H113 — Multi-Wallet Collusion for Guaranteed Matchmaking Wins

- **Category:** LOGIC-01 (Business Logic), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Sybil attack on PvP economy
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** An attacker with multiple wallets can queue into matchmaking simultaneously, get paired with themselves, and guarantee wins on the controlling wallet to farm SHOT rewards or inflate stats.
- **Target Code:** `server/socket-io/main.js` (matchmaking queue), `server/services/shot-token.js`
- **Investigation Approach:** Does matchmaking prevent same-IP or same-wallet pairing? Can one user control both sides of a match?

---

### H114 — Client-Predicted Physics Desync Attack

- **Category:** LOGIC-01 (Business Logic)
- **Origin:** Novel — Client-server desync
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If the client predicts physics outcomes before server confirmation, a desynchronization between client and server physics could cause the client to show a miss while the server registers a hit (or vice versa), confusing players.
- **Target Code:** Client Phaser physics, `server/services/physics.js`
- **Investigation Approach:** Does the client run its own physics simulation? Does it predict outcomes? What happens on desync?

---

### H115 — Event Storm via Automated Socket Client

- **Category:** ERR-03 (Rate Limiting), API-03 (WebSocket Security)
- **Origin:** Novel — Automated abuse
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** An automated Socket.IO client can send events at rates far exceeding the global 30/s rate limit, especially if the rate limit counts total events across all users rather than per-connection.
- **Target Code:** `server/index.js` (rate limit config), `server/socket-io/main.js`
- **Investigation Approach:** Is rate limiting per-connection or global? What happens when the limit is exceeded? Can one client starve others?

---

### H116 — Escrow Dust Deposit Griefing

- **Category:** CHAIN-06 (PDA Interaction), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Economic griefing
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** An attacker could deposit dust amounts into another player's escrow account (directly on-chain, bypassing the server), potentially interfering with the escrow's state or settlement logic.
- **Target Code:** On-chain `deposit_wager` instruction, escrow account state
- **Investigation Approach:** Can anyone call `deposit_wager` or only authorized players? Does the on-chain program validate depositor identity?

---

### H117 — Concurrent SHOT Burn + Match Settlement Fund Confusion

- **Category:** ERR-02 (Race Conditions), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Cross-operation interference
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If a player burns SHOT tokens (which reduces their SPL token balance) at the exact time the server checks their token balance for milestone rewards, the balance check may see an incorrect value, either denying earned rewards or granting unearned ones.
- **Target Code:** `server/services/shot-token.js` (balance checks, milestone logic)
- **Investigation Approach:** Are balance checks and milestone logic concurrent? Can a burn affect milestone eligibility?

---

### H118 — Server Restart During Settlement Creates Orphaned Escrows

- **Category:** ERR-01 (Error Handling), LOGIC-02 (Financial Logic)
- **Origin:** Novel — Failure mode analysis
- **Estimated Priority:** Tier 3 (MEDIUM)
- **Hypothesis:** A server restart during the settlement process creates orphaned escrow accounts with no recovery mechanism. The `failedSettlements` queue is lost on restart, and there's no persistent record of which matches need settlement.
- **Target Code:** All in-memory state, `server/socket-io/main.js` (failedSettlements)
- **Investigation Approach:** Is there any persistent record of active escrows? Can orphaned escrows be discovered by scanning on-chain? How long until the timeout refund triggers?

---

### H119 — Match ID Collision in Room ID Space

- **Category:** CRYPTO-01 (RNG), CHAIN-06 (PDA Interaction)
- **Origin:** Novel — PDA collision from ID reuse
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** If room IDs are also used as match IDs for PDA derivation, and room IDs are 32-bit, the PDA space is constrained. Two matches with the same ID would derive the same PDA, potentially accessing each other's escrow.
- **Target Code:** `server/socket-io/main.js` (room ID generation), `server/services/escrow.js` (PDA derivation)
- **Investigation Approach:** Are room IDs used as match IDs? Is there a collision check? What's the PDA seed?

---

### H120 — atob() Misuse for Binary Data Handling

- **Category:** DATA-05 (Encryption)
- **Origin:** KB — Incorrect encoding function
- **Estimated Priority:** Tier 3 (LOW)
- **Hypothesis:** `atob()` used for binary data handling may corrupt data with non-ASCII characters, leading to incorrect signatures or keys if applied to cryptographic material.
- **Target Code:** Server code using `atob()` (location from DATA-05 findings)
- **Investigation Approach:** Where is `atob()` used? Is it handling binary/crypto data? Would corruption cause a security issue?

---

## Supplemental

_This section will be populated after Phase 4 Batch 1 investigation, with additional hypotheses generated from confirmed findings._

---

## Appendix: Strategy Statistics

- **Total Strategies:** 120
- **Tier 1 (CRITICAL):** 28
- **Tier 2 (HIGH):** 45
- **Tier 3 (MEDIUM-LOW):** 47
- **KB Origin:** 93 (77.5%)
- **Novel Origin:** 27 (22.5%)
- **RECHECK Origin:** 0 (0%) — First audit, no stacking
- **Cross-Boundary (SOS):** 6 strategies reference on-chain/off-chain boundary
- **Novel % Target:** 20% minimum — **ACHIEVED** (22.5%)
- **Supplemental Strategies:** 10 (S001–S010) — generated after Tier 1 Batch 1 confirmed findings

---

## Supplemental Strategies (Post-Investigation)

Generated from confirmed finding chains after Batch 1 (H001-H005) and subsequent batches.

---

### S001 — Chained Wager Bypass: Balance Fail-Open → No Deposit Check → Free Match

- **Category:** LOGIC-02, ERR-01 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H001 + H004 + H012
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** An attacker chains H001 (balance fail-open), H004 (no deposit verification), and H012 (wagerless rematch) to play unlimited wagered matches at zero cost. Step 1: Join with 0 SOL (H001 allows). Step 2: Never deposit (H004 — settlement doesn't check). Step 3: If match fails, use playAgain for free rematch (H012).
- **Target Code:** `server/socket-io/main.js` (joinRoom, settlement, playAgainRequest)
- **Potential Impact:** Complete economic model collapse — wagered matches become free. Winners never receive payout.
- **Investigation Approach:** Confirm the three findings chain together without any gate between them. Verify no intermediate check blocks the chain.

---

### S002 — Prestige Tier Infinity: Zero-Cost Burn + Double-Unlock Chain

- **Category:** LOGIC-02, ERR-02 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H005 + H003
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Attacker chains H005 (burnAmount=0 bypass) with H003 (double-unlock race) to achieve unlimited prestige tiers at zero cost. Step 1: Create one dust burn TX on-chain. Step 2: Send burnAmount=0 with the TX signature (H005 passes). Step 3: Send two concurrent events with same signature (H003 — double advance). Repeat.
- **Target Code:** `server/services/shot-token.js`, `server/socket-io/main.js` (prestigeBurn handler)
- **Potential Impact:** Instant max prestige. Access to all prestige-locked weapons and cosmetics. Undermines entire SHOT burn economy.
- **Investigation Approach:** Verify the chain — does H005 bypass allow H003 race to fire? Can the same dust TX be reused across tier advances?

---

### S003 — Ghost Player DoS on Wagered Match via Join Race + Unauth Events

- **Category:** ERR-02, AUTH-01 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H019 + H016
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Attacker races a `joinRoom` (H019 — overwrite creates ghost socket), then uses the ghost socket's unauthenticated event access (H016) to spam `giveTurn` with 900KB payloads, disconnecting the legitimate player via bandwidth saturation during a wagered match.
- **Target Code:** `server/socket-io/main.js` (joinRoom, giveTurn, unauthenticated relay events)
- **Potential Impact:** Forced disconnect of legitimate player in wagered match. Potential forfeit manipulation.
- **Investigation Approach:** Confirm ghost socket retains room channel subscription. Verify unauthenticated events work from ghost context.

---

### S004 — Self-Pair Wager Farming via Matchmaking + Position Control

- **Category:** LOGIC-01, LOGIC-02 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H020 + H018
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** Attacker self-pairs via H020 (no wallet dedup in queue). Controls both sides. Uses H018 (createWeaponArray non-host) or position manipulation to guarantee the "winning" socket gets the payout. Repeats to farm treasury fees or manipulate leaderboards.
- **Target Code:** `server/socket-io/main.js` (joinQueue, fire handler, settlement)
- **Potential Impact:** Leaderboard manipulation, SHOT emission farming, if escrow settles to self then no direct theft but inflates stats.
- **Investigation Approach:** Confirm self-pair escrow settles correctly when both wallets are same address. Check if treasury/ops fees are charged on self-settlement.

---

### S005 — positionUpdate Drift Injection via Unauth Relay

- **Category:** AUTH-01, LOGIC-01 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H016
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** The `positionUpdate` or movement-related relay events (stepLeft/stepRight, moveBarrel) are unauthenticated relays. If the server doesn't enforce position server-side, an attacker can spoof arbitrary tank positions, dodging all incoming fire in wagered matches.
- **Target Code:** `server/socket-io/main.js` (position relay events, stepLeft, stepRight, moveBarrel)
- **Potential Impact:** Competitive advantage in wagered matches — untouchable tank.
- **Investigation Approach:** Check if position is server-authoritative or client-relayed. Are movement events validated against physics bounds?

---

### S006 — Key Extraction via Node.js Inspector Protocol

- **Category:** SEC-01, SEC-02 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H014 + H015
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** If the server is started with `--inspect` flag (common in development/staging), the Chrome DevTools protocol exposes heap snapshots remotely. Combined with H014 (secretKeyArray in heap) and H015 (env var in process.env), an attacker with network access to port 9229 can extract the server private key.
- **Target Code:** Server startup configuration, `server/services/keys.js`
- **Potential Impact:** Full key extraction → H013 (total fund drain).
- **Investigation Approach:** Check package.json scripts for `--inspect`. Check if production deployment might enable inspector. Verify port 9229 exposure.

---

### S007 — Unauthenticated Socket Storm Memory Exhaustion

- **Category:** API-03, ERR-03 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H016
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** Unauthenticated connections (H016 allows event processing without auth) can flood the server with events that allocate memory (e.g., `giveTurn` with large terrainData). Combined with no `maxHttpBufferSize` cap, each socket can send multi-MB payloads. 100 sockets × 30 events/sec × 1MB = 3GB/sec memory pressure.
- **Target Code:** `server/index.js` (Socket.IO config), `server/socket-io/main.js` (unauthenticated handlers)
- **Potential Impact:** Server OOM crash during active wagered matches. All in-memory financial state lost.
- **Investigation Approach:** Verify maxHttpBufferSize default. Calculate worst-case memory allocation from 100 concurrent unauth sockets.

---

### S008 — Refund Failure + PlayAgain Permanent Fund Lock Cycle

- **Category:** ERR-01, LOGIC-02 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H007 + H012
- **Estimated Priority:** Tier 1 (CRITICAL)
- **Hypothesis:** H007 (refundWager wrong params) means refunds silently fail. H012 (playAgain wagerless) means rematches have no escrow. If a match needs cancellation, refund fails (H007), then playAgain resets state without recovering funds. The original escrow PDA with deposited funds is orphaned.
- **Target Code:** `server/services/solana.js` (refundWager), `server/socket-io/main.js` (playAgainRequest, removeRoom)
- **Potential Impact:** Permanent fund lock — deposited SOL trapped in orphaned escrow PDAs with no recovery path.
- **Investigation Approach:** Trace the full lifecycle: deposit → match cancel → refund fail → playAgain → state cleared. Is the escrow PDA reference lost?

---

### S009 — Disconnect Timer Abuse: Infinite Reconnect Extension

- **Category:** ERR-02, AUTH-01
- **Origin:** Novel — Emergent from reconnect state machine
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** An attacker can repeatedly disconnect and reconnect within the 30s window to keep the match alive indefinitely, preventing the opponent from leaving and tying up their wagered funds.
- **Target Code:** `server/socket-io/main.js` (disconnect handler, rejoinRoom, pendingReconnects)
- **Potential Impact:** Fund griefing — opponent's wager locked indefinitely. Denial of service on individual matches.
- **Investigation Approach:** Does each reconnect reset the 30s timer? Is there a maximum reconnect count? Can the match be forced to terminate?

---

### S010 — Race Condition Chain: Join Race Ghost + Deposit Confusion

- **Category:** ERR-02, CHAIN-01 (Attack Chain)
- **Origin:** Novel — Chained from CONFIRMED H019 + H010
- **Estimated Priority:** Tier 2 (HIGH)
- **Hypothesis:** H019 (join race ghost) creates a socket subscribed to the room but not registered as `room.player`. When escrow deposit events fire, the ghost socket receives `escrowDeposit` and can attempt to confirm a deposit, interfering with H010's already-vulnerable deposit confirmation flow.
- **Target Code:** `server/socket-io/main.js` (joinRoom, escrowDepositConfirm)
- **Potential Impact:** Deposit state corruption. Match starts without valid deposits. Fund misdirection.
- **Investigation Approach:** Confirm ghost socket receives room broadcasts. Can it send escrowDepositConfirm? How does the handler react to an unknown socketId?
