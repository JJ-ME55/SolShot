# SolShot Mainnet Hardening Roadmap

**Document type:** Consolidated pre-mainnet engineering roadmap  
**Created:** 2026-05-07  
**Status:** ACTIVE - devnet stable as of 2026-05-07  
**Audience:** Hackathon judges, future engineers, JJ

This document is the single source of truth for what needs to happen between the current devnet build and a mainnet launch with real funds. It draws from three audits completed on 2026-05-07:

- **SOS (Stronghold of Security) Audit #2** - on-chain programs v1 + v2 (`programs/solshot-escrow/`, `programs/solshot-escrow-v2/`). Full report: `.audit/FINAL_REPORT.md`. Remediation decisions: the SOS remediation log.
- **DB (Dinh's Bulwark) Audit #2** - off-chain stack (Express + Socket.IO + Telegraf + React + Mongo + Privy). Full report: `.bulwark/FINAL_REPORT.md`. Remediation decisions: the DB remediation log.
- **BOK (Book of Knowledge) Audit #2** - math invariant verification of both programs (41 invariants, 159 tests). Full report: `.bok/reports/2026-05-07-report.md`.

Operational deployment steps (the sequenced commands for the actual mainnet flip) live in the deployment runbook (internal).

---

## Section 1 - Current Posture

SolShot reached a milestone on 2026-05-04: the first end-to-end wagered match settled on Solana devnet. Match `2f5b6180`, settlement TX `4WSsDsKVz...`. Winner received +0.18 SOL, treasury +0.014, ops +0.006. All on-chain, 90/7/3 BPS split confirmed correct. That is the baseline this roadmap builds from.

**What is solid today:**

- ✅ Three independent audits complete (SOS + BOK + DB), all dated 2026-05-07
- ✅ ~25 findings fixed across two source commits (one SOS fix bundle, one DB fix bundle)
- ✅ All 159 BOK math tests passing - zero conservation breaks, zero overflow/underflow violations, zero deadline-ordering inversions across 41 invariants on both programs
- ✅ SOS CRITICAL H023 (partial-refund theft, worst-case 900 SOL per match) - fixed in source; length check enforced at all four refund-loop sites; regression suite in place
- ✅ npm vulnerabilities down 33% server-side and 64% client-side vs. Feb baseline
- ✅ First wagered match settled on devnet (May 4, 2026)
- ✅ Helmet middleware, CORS scoping, rate limiting, CSPRNG for room IDs all in place
- ✅ Source maps disabled in production; `qs` prototype-pollution CVE patched
- ✅ Auth fixes: Privy/TG identity bridge verification, `requirePrivyAuth` fail-closed in prod, legacy relay auth gaps closed for `shoot` / `acceptChallenge` / `declineChallenge` / `clientDebugLog` / `getGroupMatch`
- ✅ `DebugAuthOverlay` stripped from production builds
- ✅ `runValidators: true` set globally on Mongoose

**What is explicitly incomplete:**

- 🟡 ~50 findings deferred to this hardening roadmap (16 SOS + ~30 DB)
- 🟡 Single hot wallet `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` currently holds BOTH upgrade authority AND application authority for BOTH programs - one key compromise = total protocol drainage
- 🟡 Source-level fixes for SOS + DB audits are in source but devnet redeploy of compiled `.so` files is pending verification; the live devnet programs at `4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` (v1) and `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` (v2) are running pre-fix-bundle bytecode
- 🟡 BOK verification is HIGH-CONFIDENCE PROBABILISTIC, not PROVEN (Kani unavailable on Windows - requires WSL2)
- 🟡 H024 (non-contiguous `deposits_mask`) still requires authority cooperation to rescue; refund loop redesign deferred

**Verdict:** Safe for hackathon submission and continued devnet testing. NOT safe for mainnet with real user funds until all four bundles below are complete, verified, and deployed.

---

## Section 2 - Pre-Mainnet Bundles Overview

There are four sequenced work bundles. Bundle 1 (authority hardening) is a prerequisite for the others because it closes the single-key blast radius before anything else goes to mainnet. Bundles 2 and 3 can run in parallel after Bundle 1 is tested. Bundle 4 is largely independent and can be parallelized throughout.

| Bundle | Theme | Risk level | Estimated effort |
|--------|-------|-----------|-----------------|
| 1 | Authority hardening (on-chain + ops) | HIGH | 1–2 weeks |
| 2 | Wallet & Identity hardening (off-chain) | MEDIUM | 1 week |
| 3 | Refund & Settle correctness (cross-layer) | MEDIUM-HIGH | 1–2 weeks |
| 4 | Client headers + defensive hygiene | LOW | 2–3 days |
| Pre-mainnet smoke test | Devnet validation | - | 2 days |
| Mainnet deploy + soak | Production flip | - | 1 day + watch |
| **TOTAL** | | | **3–5 weeks** |

Each bundle should be a separate PR, re-audited on devnet before the next bundle begins. The exception is Bundle 4 items - those can land as small PRs throughout without blocking other bundles.

---

## Section 3 - Bundle 1: Authority Hardening

**Priority: BLOCK MAINNET. Must land first.**

### 3.1 Problem statement

Both deployed programs share a single hot wallet (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`) that simultaneously serves as:

1. **Layer 1 (BPF Loader upgrade authority)** - can deploy new bytecode to either program in a single TX with no timelock, no second signer, no on-chain delay
2. **Layer 2 (application authority)** - can rotate treasury address, ops address, fee BPS, and program-level pause state with one instruction
3. **Active application auth** - the server keypair (`SOLANA_SERVER_KEYPAIR_PATH`) used for create_match / settle_match / cancel_match calls on every wagered game

Compromise of this one key enables, in a single transaction: redeploy malicious bytecode, drain all escrow accounts by redirecting fee destinations, or settle all active matches to an attacker-controlled wallet. There is no on-chain recovery path.

Cross-reference: SOS H001 (one-step authority rotation, CVSS 8.7), H044 (single hot wallet L1+L2, CVSS 8.2), H046 (bytecode replacement risk, CVSS 8.0). DB H011 (keypair in process memory, unzeroized), H012 (same root as SOS H044), H082 (zeroization regression), H120 (cross-skill compound chain).

Historical analogues: Step Finance $30-40M, Mango Markets $11M, Raydium $4.4M - all involved compromised upgrade or governance keys.

### 3.2 Sequence

**Step 1a - Generate fresh keypairs (separate upgrade auth + app auth)**

Generate three keypairs:
- `solshot-upgrade-authority.json` - Layer 1 upgrade authority only; will move to Squads multisig
- `solshot-app-authority.json` - Layer 2 application authority for config (held cold; used only for fee config changes)
- `solshot-server-authority.json` - Hot key for create_match / settle_match / cancel_match (operational use; lowest privilege, separated from governance)

Store all three outside the repository. Add to `.gitignore`. Document derivation method in `Docs/KEY_MANAGEMENT.md`.

**Step 1b - Set up Squads multisig for upgrade authority (M-of-N)**

Create a Squads v3 multisig on devnet for the upgrade authority role. Minimum 2-of-3 signers for devnet; recommend 3-of-5 for mainnet. Members should be: JJ cold wallet + at least one co-signer with independent key material.

Program: `SMPLecH534NA9acpos4G6x7uf3LWbCAwZQE9e8ZekMu` (Squads v3, mainnet + devnet).

Reference: Squads docs at https://docs.squads.so/main/squads-protocol/overview.

**Step 1c - Add `propose_authority` / `accept_authority` instructions to both programs**

Anchor change for both `programs/solshot-escrow/src/lib.rs` and `programs/solshot-escrow-v2/src/lib.rs`:

- Add `pending_authority: Option<Pubkey>` field to both `GlobalConfig` structs. Account `SPACE` must increase by 33 bytes (1 discriminant + 32 pubkey). Current v1 SPACE fits at 117 bytes; v2 at 188 bytes - recalculate both.
- Add `propose_authority` instruction: authority-signed; writes `pending_authority = Some(new_key)`. Does NOT transfer yet.
- Add `accept_authority` instruction: new-authority-signed (NOT old); atomically sets `authority = pending_authority.unwrap(); pending_authority = None`. Two-step ensures the new key is live before the old one loses access.
- IDL update required after Anchor build. Copy from `target/idl/` to `server/idl/`.
- Update `server/services/escrow.js` and `server/services/escrow-v2.js` with new instruction wrappers.
- Test on devnet: propose from old key → accept from new key → confirm old key can no longer call `update_config`.

This closes SOS H001.

**Step 1d - Add `last_config_update_ts` + 24h timelock to `update_config`**

For both programs:
- Add `last_config_update_ts: i64` field to `GlobalConfig`.
- Add `CONFIG_TIMELOCK_SECS: i64 = 86400` constant.
- Refactor `update_config`: write proposed changes to "pending" fields (`pending_treasury_pubkey`, `pending_ops_pubkey`, `pending_fee_bps_*`) along with `pending_config_ts = now`.
- Add `apply_config_update` instruction: requires `now >= pending_config_ts + CONFIG_TIMELOCK_SECS`; atomically applies pending fields to live fields; clears pending state.
- The timelock ensures any fee-destination rotation or BPS change is visible on-chain for 24 hours before taking effect. This gives operators and monitoring systems a window to detect and respond to a governance compromise.

This closes SOS H002, H032, and reduces blast radius of H011 (BPS poisoning chain).

For v1 specifically: v1 reads live config at settle time (no per-match snapshot). Until v1 is deprecated or retires, the timelock is the primary protection against H030 (fee destination hijack). After mainnet stabilization, plan to sunset v1 and route all new matches through v2.

**Step 1e - Migrate Layer 1 (upgrade authority) to Squads multisig**

```bash
# Devnet
solana program set-upgrade-authority \
  4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1 \
  --new-upgrade-authority <squads-multisig-pubkey>

solana program set-upgrade-authority \
  BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N \
  --new-upgrade-authority <squads-multisig-pubkey>
```

Verify with `solana program show <program-id>` - "Upgrade authority" should show the Squads multisig PDA.

Any future redeploy now requires M-of-N signature through the Squads proposal flow. Document the redeploy procedure in `Docs/KEY_MANAGEMENT.md`.

**Step 1f - Migrate Layer 2 (config.authority) to the separate app-authority keypair**

Use the new `propose_authority` / `accept_authority` instructions (from Step 1c) to rotate the on-chain `config.authority` from the old hot wallet to `solshot-app-authority.json`. The server's `SOLANA_SERVER_KEYPAIR_PATH` should then point to `solshot-server-authority.json` (operational key), which has no governance privilege - it can only call create_match / settle_match / cancel_match / deposit as authorized by the on-chain program constraints.

This achieves the separation: Squads (upgrade auth) → cold app-authority (config governance) → hot server key (operational).

This closes SOS H044 and substantially reduces H046 blast radius.

**Step 1g - Zeroization and keypair handling**

DB H011 and H082 document that the server's escrow keypair (`Keypair.fromSecretKey(...)`) is loaded into process memory and then NOT zeroed after use - the web3.js `Keypair` object aliases the same `Uint8Array`, so zeroing the source buffer would corrupt the live object. The current `server/services/keys.js:54-64` documents this limitation.

Options, in order of preference:
- Use a KMS (Hashicorp Vault, AWS KMS, GCP Secret Manager) to sign transactions server-side without ever loading the raw bytes into Node.js process memory. Web3.js `sendTransaction` supports pre-signed TXs; build the TX, export it, sign via KMS, submit.
- If KMS is out of scope for launch, add a `SIGTERM` / `SIGINT` handler that zeroes the raw buffer backing the Keypair (accepts the aliasing limitation - the Keypair becomes unusable, which is the desired behavior on shutdown).
- Migrate to `@solana/web3.js` v2 (experimental) which provides explicit zeroization patterns.

Minimum acceptable for mainnet: a shutdown signal handler that attempts zeroization with a comment explaining the aliasing caveat, plus documentation that the server process must not be forked or core-dumped.

This closes DB H011 and H082.

**Step 1h - Document key rotation procedure**

Create `Docs/KEY_MANAGEMENT.md`:
- List all keys by role, derivation, storage location, and replacement procedure
- Document the Squads upgrade-authority proposal flow (how to sign, how to execute, how to verify)
- Document the app-authority rotation procedure (propose_authority → accept_authority → verify)
- Document the server operational key rotation procedure (update env var, restart, smoke test)
- Include estimated time: each rotation should be completable in under 30 minutes by a single operator

**Step 1i - Add `propose_recovery` guardian mechanism (post-Step 1c)**

H042: `GlobalConfig` has no close path. If the `config.authority` key is lost before the two-step rotation (Step 1c) is in place, the config is permanently locked - new matches cannot be created, and the program can only be recovered by redeploying a new binary (via the Squads upgrade authority).

After Step 1c is live, add a `guardian_authority: Option<Pubkey>` field and a `propose_recovery` instruction with a 7-day timelock. The guardian is a cold-stored key controlled by the team, distinct from all operational keys. If `config.authority` is lost, the guardian can trigger recovery after 7 days of on-chain visibility.

This is lower urgency than 1a–1h but should land before mainnet if feasible.

### 3.3 Testing requirements for Bundle 1

Before moving to mainnet:
- Devnet: confirm both programs show Squads multisig as upgrade authority via `solana program show`
- Devnet: perform a full propose_authority → accept_authority rotation and confirm the old key can no longer call `update_config`
- Devnet: propose a config update, attempt to apply before 24h timelock, confirm rejection; advance devnet clock past 24h, confirm `apply_config_update` succeeds
- Devnet: simulate a full match lifecycle (create → deposit → settle) under the new key separation to confirm the server operational key still functions
- Devnet: run the full BOK test suite on the post-Bundle-1 programs

### 3.4 Effort and risk

Estimated effort: 1–2 weeks. The Anchor changes (Steps 1c + 1d) are the critical path - they require Anchor build, IDL copy, server service update, and devnet deployment. The ops steps (1b, 1e, 1f) are mechanical but irreversible - work carefully.

Risk: HIGH. This changes the core trust model of the protocol. A mistake in the `accept_authority` instruction (e.g., accepting before verifying the new key) could permanently lock governance. Test the rotation procedure on devnet at least three times before applying to mainnet.

---

## Section 4 - Bundle 2: Wallet & Identity Hardening

**Priority: Required before mainnet. Can begin in parallel with Bundle 1 devnet testing.**

### 4.1 Problem statement

The off-chain identity model has three overlapping issues that compose into account-takeover paths:

1. **Wallet rotation gap (DB H009):** `server/services/users.js:91` only sets `walletAddress` if it is currently `null`. When Privy re-provisions a user's embedded wallet (which it may do automatically after key rotation or account recovery), the DB retains the stale wallet address. Settlement funds then go to a wallet the user may no longer control - or one an attacker who triggered the rotation does control.

2. **Reconnect migrates stale wallet (DB H010):** The `ws.wallets` reconnect remap copies the OLD wallet address from the existing DB entry. Same root cause as H009; the stale address propagates into the in-memory session on reconnect.

3. **JWT generated but never verified (DB H003):** `generateToken()` runs on auth and emits a JWT to clients, but no server route or socket handler calls `verifyToken()` - that function was correctly removed as dead code. This means the JWT implies an auth guarantee that does not exist. Any code that observes the presence of a JWT in local storage and infers "this client is authenticated" would be wrong. The risk is that a future engineer re-adds a JWT-verification gate without understanding the architecture.

4. **TG identity bridge backfill (DB H006):** The `tgIdFor()` helper can return a Telegram ID derived from a DB lookup (not the HMAC-signed session). This bridges a different auth tier into game state. The two sources are not distinguished - `socket.telegramAuthSource` does not exist.

Cross-reference: DB H001 (already fixed - Privy TG bridge now verifies), H003, H006, H009, H010, H120 (cross-skill chain: H002 + SOS H001).

### 4.2 Sequence

**Step 2a - Decide JWT model**

Before writing any code, make this call:

Option A: **Remove `generateToken`** - go fully socket-flag-based (`socket.isAuthenticated`, `socket.walletAddress`). No JWT issued, no JWT stored on client. Simpler, honest about the actual auth model. Closes H003 and prevents future confusion.

Option B: **Implement real JWT verification** - `verifyToken()` called on every socket event that currently relies on `socket.isAuthenticated`. More future-proof but higher lift (token expiry, rotation, storage, CSP `script-src` implications).

Recommendation: Option A for launch. Socket-flag-based auth is already the working model; removing the dead JWT path costs 10 lines and removes confusion. If a signed-token auth model is desired post-launch, implement it as a ground-up addition rather than reviving the dead `generateToken` plumbing.

File: `server/services/auth.js` (generateToken), `server/index.js` (call site).

**Step 2b - Add `updateWalletForTgUser()` helper with audit trail**

In `server/services/users.js`, add `updateWalletForTgUser(tgUserId, newWalletAddress)`:
- Fetch existing user document.
- If `walletAddress` differs from `newWalletAddress`, append to a `walletHistory: [{address, timestamp, source}]` array field and set `walletAddress = newWalletAddress`.
- If `walletAddress === newWalletAddress`, no-op (idempotent).
- The `source` field should be `'privy-rotation'`, `'manual'`, or `'reconnect'` depending on call site.

Replace the `if (!user.walletAddress)` guard at `users.js:91` with a call to this helper.

This closes DB H009 and provides an audit trail for settlement disputes.

**Step 2c - Fix reconnect wallet remap (DB H010)**

In the reconnect handler in `server/socket-io/main.js`, after fetching the existing session from `pendingReconnects`, call `getUser(tgUserId)` to get the current DB wallet address rather than copying from the stale in-memory session. Apply the result to the new socket's session before remapping.

This prevents the stale-address propagation described in H010.

**Step 2d - Add Privy SDK rotation detection**

Privy's server SDK (`@privy-io/server-auth` or its replacement `@privy-io/node` - see Step 2f) can return `embeddedWallets` on `getUser()`. Add a comparison: if the wallet returned by Privy differs from the DB-stored wallet, call `updateWalletForTgUser()` immediately. This catches rotations that happen outside the SolShot auth flow.

Wire this into the `/api/wallet/link-from-privy-telegram` handler (which already calls `getUser()` after the H001 fix) and into any other Privy-authenticated endpoint.

**Step 2e - Add reconcile script for stale wallet bindings**

Add `server/scripts/reconcile-wallets.mjs`:
- Fetch all DB users with a `telegramId` and `walletAddress`.
- For each, call Privy `getUser(privyDid)` if the DID is stored, or query by linked TG account.
- If Privy returns a different embedded wallet, log the discrepancy and (in `--fix` mode) call `updateWalletForTgUser()`.

Run before mainnet launch as a one-shot cleanup. Schedule monthly thereafter.

**Step 2f - Migrate Privy SDK**

DB H084: `@privy-io/server-auth` is deprecated. The replacement is `@privy-io/node`. Migrate before mainnet - the deprecated package may lose security patches.

Migration steps:
1. `npm uninstall @privy-io/server-auth && npm install @privy-io/node` in `server/`
2. Update imports: `import { PrivyClient } from '@privy-io/node'`
3. Verify `getUser()`, `verifyAuthToken()`, and `createWallet()` have the same method signatures (check Privy changelog)
4. Re-test the `/api/wallet/link-from-privy-telegram` endpoint on devnet

**Step 2g - Add `socket.telegramAuthSource` field**

In the auth handler, set `socket.telegramAuthSource = 'hmac'` when authentication comes from a valid HMAC-signed Telegram payload, and `socket.telegramAuthSource = 'privy-session'` when it comes from a Privy token. In `tgIdFor()`, annotate the returned ID with its source so downstream handlers can distinguish.

This closes DB H006 and makes the two auth tiers explicit and visible in session state.

**Step 2h - Add auth signature replay protection (DB H004)**

The current 5-minute signature window uses no replay store - a captured auth signature can be reused on a new socket within 5 minutes. Add a `consumedSignatures` Map keyed by `${wallet}:${signature}`, with TTL eviction after 6 minutes. On auth, if the key is already in the map, reject. On success, add it.

For a single-process Render deployment this is in-memory. If Render ever runs multiple dynos, move to a Redis TTL key. Add a comment to that effect in the code.

This closes DB H004.

### 4.3 Effort and risk

Estimated effort: 1 week. The wallet rotation helpers are the critical path. JWT removal is the easiest item. Privy SDK migration requires careful testing.

Risk: MEDIUM. Changes the auth model in ways that affect every authenticated user. Test thoroughly with both HMAC-authenticated TG users and Privy-authenticated users. Verify settlement still routes correctly after wallet rotation via `updateWalletForTgUser()`.

---

## Section 5 - Bundle 3: Refund & Settle Correctness

**Priority: Required before mainnet. Can run in parallel with Bundle 2 after Bundle 1 is complete.**

### 5.1 Problem statement

The H023 on-chain fix (requiring `remaining_accounts.len() == count_ones(on-chain deposits_mask)`) landed in the SOS fix bundle and is confirmed correct by the BOK suite. But it introduced a NEW failure mode in the server (DB H014): the server builds `remaining_accounts` from its own off-chain state (`wagerStates[roomId].deposits` for v1; Mongo `player.initialDepositTx` for v2), not from the on-chain `deposits_mask`. If these diverge - due to a crash, a missed confirmation, or any network jitter - the server will construct an array whose length does not match the on-chain mask, causing `IncompleteRefund` reverts. The SOL is then stuck until the 2-hour (v1) or 24-hour (v2) permissionless reclaim window expires.

Two async code paths that mutate settled/deposit state have race conditions (DB H015, H016). The self-damage sign-erasure in 1v1 (DB H017) is a game-design issue with a trivial fix.

Cross-reference: DB H013 (already fixed - refundWager no longer fails-open), H014, H015, H016, H017, H037, H040.

### 5.2 Sequence

**Step 3a - Add `getEscrowState(matchId)` before all refund builders**

In `server/services/escrow.js` and `server/services/escrow-v2.js`, add:

```js
async function getEscrowState(matchId) {
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('match'), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const account = await program.account.matchEscrow.fetch(escrowPda);
  return account; // includes deposits_mask, max_players, players, state
}
```

Before every `cancelMatch` or `permissionlessReclaim` call, fetch `getEscrowState(matchId)`. Use the returned `deposits_mask` to build `remaining_accounts` - iterate `0..max_players`, include only positions where `(deposits_mask >> i) & 1 == 1`. This ensures the server-side array length always matches the on-chain truth.

**Step 3b - Test the non-contiguous mask scenario on devnet**

BOK I-REF-5 confirms that a non-contiguous `deposits_mask` (e.g., `0b0010`) is correctly rejected by the on-chain refund loop after the H023 fix. On the server side, after Step 3a is in place, the `getEscrowState` call will return the actual mask; the server will then pass the correct subset of accounts.

Simulate on devnet:
1. Create a 3-player match.
2. Have players 0 and 2 deposit; player 1 never deposits.
3. Attempt to cancel. With the pre-3a code, the server would likely fail. With 3a in place, the server should correctly include only players 0 and 2 in `remaining_accounts`.

Note: if the mask is non-contiguous AND the server has never tracked player 2's deposit address, the refund will still fail. The Step 3a fix resolves the length mismatch; the address resolution must also be correct. Verify that all depositor addresses are stored in Mongo at deposit-confirmation time, not just the sequential first N.

**Step 3c - Refactor `confirmDeposit` to use `findOneAndUpdate` with atomic guard**

Current code at `server/socket-io/lifecycle.js` (approximately): `findOne` → mutate in memory → `save()`. Two concurrent deposit confirmations for the same match both do `findOne`, both find the unconfirmed state, both mutate different player entries, and one save overwrites the other's `initialDepositTx`. The second depositor's TX is lost; the match stalls indefinitely.

Refactor to:
```js
await Match.findOneAndUpdate(
  { matchId, 'players.walletAddress': depositorWallet, 'players.initialDepositTx': null },
  { $set: { 'players.$.initialDepositTx': txSig } },
  { new: true, runValidators: true }
);
```

The `$elemMatch`-style `'players.walletAddress': X` guard in the query condition ensures this is idempotent - a second call with the same wallet finds no matching document (because `initialDepositTx` is no longer null) and safely no-ops.

This closes DB H016.

**Step 3d - Refactor `checkAndSettle` to atomic `findOneAndUpdate`**

Three async code paths (`handleShot`, `handleForfeit`, `handleIdleTimeout`) all call `checkAndSettle()`. Current implementation: fetch match, check `match.state === 'active'`, settle, save. With concurrent async calls (Socket.IO does not guarantee serialization), two paths both see `state = 'active'` and both attempt on-chain settlement. The second on-chain call will fail (already settled), but the server-side state may become inconsistent.

Refactor to:
```js
const updated = await Match.findOneAndUpdate(
  { matchId, state: 'active' },
  { $set: { state: 'settling' } },
  { new: false }
);
if (!updated) return; // Another path already claimed it
// Proceed with on-chain settle
```

The `state: 'active'` predicate in the query is the atomic gate. Only one caller can successfully transition `active → settling`; the others get `null` back and return immediately.

This closes DB H015.

**Step 3e - Resolve self-damage `Math.abs` sign erasure in 1v1 (DB H017)**

In `server/services/physics.js`, the damage calculation uses `Math.abs(rawDamage)` unconditionally. In a 1v1 match, if a player fires at themselves, the damage is applied in the correct direction but `Math.abs` may erase a negative sign that represents self-damage being deducted from the opponent's HP rather than the shooter's - this depends on how `rawDamage` is signed and how `applyDamage` is called.

Decision required before fixing (make it in code comments or in the project decisions log):

- Option A: **Disallow self-fire** - if `tank.id === shooter.id`, return early with no damage. Clean; avoids the sign question entirely.
- Option B: **Allow self-fire, fix sign** - ensure `Math.abs` is not applied when the target is the shooter; self-damage reduces the shooter's own HP by the weapon's damage value.

Pick one and implement. The fix is 3–5 lines once the decision is made.

**Step 3f - Add v2 `failedSettlements` retry queue (DB H037, H040)**

v1 has a `failedSettlements` map and retry logic. v2 does not. For mainnet, any settlement failure (network jitter, RPC timeout, blockhash expiry) on a v2 match should be retried with exponential backoff, capped at 5 attempts, and then escalated to an operator alert.

Implement `server/services/escrow-v2.js: failedSettlements` map mirroring the v1 pattern:
- On settlement failure: add to map with `{matchId, retries: 0, lastAttempt: Date.now()}`
- Retry loop: `setInterval(retryFailedSettlements, 60_000)` - for each entry, check `retries < 5` and `Date.now() - lastAttempt > backoff(retries)`, then retry
- On max retries: persist to DB (`FailedSettlement` collection) and emit operator alert (Telegram bot DM to ADMIN_TELEGRAM_IDS)

This closes DB H037 and ensures v2 financial paths are as resilient as v1.

**Step 3g - Add operator alert + DB persistence for `failedSettlements` (both versions)**

v1's current `failedSettlements` is in-memory only - lost on process restart. For mainnet:
- Persist each failed settlement entry to a `FailedSettlement` MongoDB collection with `{matchId, wager, winner, error, attempts, createdAt, resolvedAt}`
- On server startup, load unresolved entries from the collection and re-populate the in-memory retry map
- On resolution (successful retry or manual override), mark `resolvedAt`

Add a `/api/admin/failed-settlements` endpoint (protected by `ADMIN_TELEGRAM_IDS` guard) to list and manually resolve entries.

**Step 3h - Strip wallet PII from `escrowDepositStatus` broadcast (DB H030)**

The server currently emits full wallet pubkeys to all room members on every deposit event. Change to emit only `{playerIndex, confirmed}` boolean - no wallet address. Wallet addresses are not needed by clients for the deposit-status UI; the player index is sufficient.

File: `server/socket-io/main.js` - search for `escrowDepositStatus`.

### 5.3 Effort and risk

Estimated effort: 1–2 weeks. The `findOneAndUpdate` refactors (3c, 3d) are the most critical and require careful testing of concurrent deposit scenarios. The `getEscrowState` addition (3a) requires a devnet RPC call per refund - add a timeout/retry wrapper.

Risk: MEDIUM-HIGH. Steps 3c and 3d change core financial state transitions. A bug here could cause lost deposits or double-settles. Test with concurrent socket connections on devnet before merging.

---

## Section 6 - Bundle 4: Client Headers + Defensive Hygiene

**Priority: Should-fix before mainnet. Items are largely independent and can be parallelized.**

These items are individually small. None require Anchor changes or server architecture changes. Batch them into one PR per category.

### 6.1 Client security headers (DB H034, H036)

**H034 - Vercel zero security headers:**  
Add `client/vercel.json` with headers for all routes:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "frame-ancestors 'none'; ..." }
      ]
    }
  ]
}
```

The `frame-ancestors 'none'` CSP directive and `X-Frame-Options: DENY` together prevent clickjacking of the Privy wallet modal - the current Vercel deployment has neither.

**H036 - `unsafe-inline` in client `script-src`:**  
Remove the Eruda inline script loader that forces `unsafe-inline` in the client CSP. Either load Eruda as an external script with a nonce, or remove Eruda from production builds entirely (it is a dev debugging tool and should not ship to production users). Removing it is the simpler fix.

### 6.2 Magic-link hardening (DB H047, H048)

**H047 - Magic-link token in URL query param:**  
Move the Privy magic-link token from `?linkToken=...` to `#linkToken=...` (URL fragment). Fragment values are never sent to the server in HTTP requests and are not logged by Vercel or Render access logs. This prevents the token from leaking in server logs, CDN logs, or `Referer` headers.

File: wherever the magic-link URL is constructed server-side and wherever it is parsed client-side.

**H048 - Magic-link store is process-local:**  
The current magic-link token store is an in-memory Map - lost on process restart, and not shared across multiple Render dynos if the server ever scales. Move the store to a Redis key (TTL = 10 minutes) or a short-TTL MongoDB collection. Use a `linkTokens` collection: `{ token: String, userId: String, expiresAt: Date (indexed with TTL) }`.

### 6.3 RPC hardening (DB H049, H050, H051)

**H049 - Single unmonitored RPC endpoint:**  
Add a fallback RPC provider. Recommended: primary Helius, fallback QuickNode or Triton. Configure via `SOLANA_RPC_URL` (primary) and `SOLANA_RPC_URL_FALLBACK` env vars. All RPC calls should try primary first; on `429` or network error, retry on fallback.

**H050 - RPC 429 has no retry:**  
Add an exponential backoff wrapper around all `connection.sendTransaction()`, `connection.confirmTransaction()`, and `connection.getTransaction()` calls in `server/services/escrow.js` and `server/services/escrow-v2.js`. Base delay 200ms, max 3 retries, cap 2s. If all retries fail, propagate the error to the caller (do not fail-open).

**H051 - `confirmTransaction('confirmed')` deprecated form:**  
Replace the deprecated `connection.confirmTransaction(txSig, 'confirmed')` calls with the `lastValidBlockHeight` form:

```js
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
// ... build and send TX ...
await connection.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, 'confirmed');
```

This ensures confirmation waits for the correct block height rather than polling indefinitely. File: all sites in `server/services/escrow.js`, `server/services/escrow-v2.js`, `server/services/solana.js`.

### 6.4 Settle TOCTOU hardening (DB H058, H059)

**H058 - v2 settle TOCTOU:**  
The current v2 settle path fetches escrow state and submits the settle TX in two separate RPC calls. Between the fetch and the submit, a concurrent `cancel_match` could have already settled or cancelled the account. The on-chain program protects against double-settle (state check in `settle_match` instruction), but the server-side error handling assumes the TX will succeed.

Add a pre-submit `getEscrowState` check (from Step 3a above) and verify `state == Active` before submitting. If state is not Active, log a warning and skip - do not treat this as an error (it means another path beat us to it, which is the correct result).

**H059 - No state pre-check before settle:**  
Add `require!(escrow.state == MatchState::Active)` check at the top of the `settle_match` instruction handler in both programs. This is a defensive backstop that ensures the on-chain state machine can never be advanced from a terminal state. v2 already has this; verify v1 does too. If not, add it.

### 6.5 Entropy and uniqueness hardening (DB H060, H089, H090)

**H060 - `match_id` uniqueness not guaranteed:**  
Per SOS H049: 4-char hex IDs = 65,536 possibilities; birthday collision at ~256 concurrent matches. Two fixes needed:
1. Server: bump `crypto.randomBytes(8)` to produce 16-char hex match IDs (from `randomBytes(4)` currently). Update any 4-char ID assumptions in client and server.
2. DB: add `{ unique: true }` to the `matchId` field index in the Match schema. On collision (now astronomically unlikely), the DB insert will error and the server should retry with a new ID.

**H089 - Group match IDs use `Math.random()`:**  
Group chat match IDs are generated with `Math.random()` instead of `crypto.randomBytes`. Switch to `crypto.randomBytes(4).toString('hex')` for group match IDs. This is a 1-line change.

**H090 - Challenge shortcode 20 effective bits:**  
Challenge shortcodes are generated with `randomBytes(3)` = 6 hex chars. 20 effective bits at 2^20 = ~1M possibilities; with 100 concurrent challenges, birthday collision probability is ~5%. Bump to `randomBytes(4)` = 8 hex chars (32 bits). Update any length assumptions in the challenge URL / validation logic.

### 6.6 Logging and observability hardening (DB H067, H068, H070)

**H067 - `debugLog.js` always logs:**  
Wrap `console.log` calls in `debugLog.js` with `if (process.env.DEBUG_LOG === 'true')`. In production, `DEBUG_LOG` should not be set. This prevents verbose debug output in production logs.

**H068 - TG ID + wallet co-logged:**  
Search for log lines that include both `tgUserId` and `walletAddress` in the same log entry. Replace with redacted forms: `tgId=***` or `wallet=<first6>...<last4>`. Use the Pino `redact` option (already in the server logging config) to auto-redact these patterns from all log output.

**H070 - `/health` exposes `activeConnections`:**  
The `/health` endpoint currently returns `{ status: 'ok', activeConnections: N }`. Strip `activeConnections` from the public endpoint. Keep it in an internal admin endpoint protected by `ADMIN_TELEGRAM_IDS` if monitoring needs it.

### 6.7 Scheduler and rate-limiting hardening (DB H056, H057, H078, H088)

**H056 - Bot lacks queue/backoff for `sendMessage`:**  
Telegram's API has a 30 msg/sec rate limit. The bot's `sendMessage` calls are unbounded. Add a queue with a 40ms inter-message delay and exponential backoff on `429` responses.

**H057 - `lobbyWatchdog` bulk sends on boot:**  
On server startup, the lobby watchdog sweeps all active matches and sends Telegram notifications. If there are many stale matches (e.g., after a long deployment gap), this sends a burst of messages and likely triggers a `429`. Add a throttle: max N messages per second during the boot sweep, configurable via env var.

**H078 - Scheduler reentrance:**  
The match scheduler (or lobby watchdog) can re-enter if a tick takes longer than the interval. Add an `if (running) return` guard at the top of each scheduled callback.

**H088 - Per-socket throttle resets on reconnect:**  
Socket-keyed rate limiters reset when a client reconnects with a new socket ID, allowing a client to bypass throttling by rapidly disconnecting and reconnecting. Move throttle state to wallet pubkey. If the wallet has no rate-limit state, create it; if it does, use the existing counters regardless of socket ID.

### 6.8 Dependency upgrades (DB H041-H045, H084, H085)

These can be landed as a single PR:

- `socket.io-parser` DOS (H042): `npm update socket.io` in `server/`
- `path-to-regexp` ReDoS (H043): bump Express to latest minor in `server/`
- `handlebars` injection (H044): audit `phaser3-rex-plugins` for a version without handlebars; if not available, evaluate alternatives
- `bigint-buffer` overflow (H045): update `@solana/spl-token` to latest
- `@privy-io/server-auth` deprecated (H084): migrate to `@privy-io/node` (already in Step 2f above - coordinate)
- `nodemon` in production deps (H085): move to `devDependencies` in `server/package.json`

After each `npm update`, run `npm audit` and confirm the targeted CVEs are cleared.

### 6.9 Architectural cleanup - v2 protocol everywhere (async-first)

**Status:** Tracked, scheduled for execution after the Colosseum submission. Tagged 2026-05-10 as the immediate post-hackathon priority. Lower security risk than Bundles 1–3, higher product impact: it consolidates SolShot onto a single async-state architecture and retires the legacy real-time-only flow.

**Background.** SolShot ships with two on-chain programs and two parallel match-flows:

- **v1 program (`solshot-escrow`, 4kzrDpV9...)** - wired to the 1v1 lobby flow (Quick Match / Duel / High Roller / Custom Challenge). Real-time socket-room cadence, 10-min turn timer, 10-minute reconnect window. Both players must remain connected.
- **v2 program (`solshot-escrow-v2`, BVKXLU...)** - wired to the group-chat flow. Server-persistent state (Mongo + on-chain), 12h default turn timer, no live-connection requirement. Players can close the tab and come back.

The two programs have identical 10-instruction surfaces with the same logic, same settlement BPS, same PDA derivation, same authority model. The only structural difference: v1 caps at 4 players (`[Pubkey; 4]`), v2 supports up to 10 (`[Pubkey; 10]`). Functionally, v2 is a superset of v1 and handles the 1v1 case identically.

**Why we shipped two.** v1 was the original 1v1 escrow (Feb 2026). When group-chat needed bigger player rosters in May 2026, the safer move was a fresh v2 program rather than mutating v1's compiled bytecode mid-flight. Result: two programs, two match-flows, partially overlapping surface area.

**Why this is the right consolidation.** SolShot has **materially evolved into an async product.** Most of the recent traffic - group-chat matches, mobile users who minimise tabs, players whose phones lock between turns - needs the v2 server-persistent state model. The v1 real-time-session model fights modern browser/PWA reality: minimise = tab background = socket close = forfeit. That's not a winning UX in 2026.

The fix is one program, one match-flow, async-first.

#### 6.9.1 Code migration

1. **Server: route 1v1 lobby through v2.** `server/services/solana.js` currently imports `escrow.js` (v1 bindings) for `createMatchEscrow / settleMatchEscrow / cancelMatchEscrow / depositWager / startWithDepositors`. Switch the imports to `escrow-v2.js`. Same function signatures, same return shape (verified during DB audit).
2. **Server: collapse the lobby match-flow onto group-chat-style state.** New `GroupMatch.config.type = 'live-1v1'` variant with `turnTimerMs: 600000` (10 min, matching the band-aid below) and `quietHoursEnabled: false`. Lobby creation goes through `lifecycle.startMatch` instead of the bespoke `socket-io/main.js` lobby code path.
3. **Client: 1v1 uses `GroupMatchScreen`** (or a slimmer 1v1 fork of it) - turn-based "Take your shot" UX with a fast cadence so the live-feel is preserved through quick turns, not through brittle socket persistence. Live opponent-aim broadcasts remain available *if both players are connected*, but match state isn't dependent on it.
4. **`MATCH_ESCROW_PROGRAM_ID` env var → v2 address.** Update `.env` references on Render and `client/.env` references on Vercel.
5. **IDL path consolidation.** Drop `server/idl/solshot_escrow.json`; use `solshot_escrow_v2.json` everywhere.
6. **Remove `server/services/escrow.js` once no caller imports it.** Keep the file in `_archive/old-services/` for reference.

#### 6.9.2 v1 program retirement

7. **Devnet:** after grace period (~24h to let any in-flight v1 matches finish), run `solana program close 4kzrDpV9JxjE27AMg4PQXzGuge9MEYQEFznSPvkBtnH1` to recover ~1.77 SOL of program rent.
8. **Mainnet:** v1 is **never** deployed to mainnet. Only v2 ships. The litepaper Section 7 and `Docs/SolShot_Litepaper_v2.2.md` are updated to reflect "one Anchor program (escrow-v2)" as the canonical state.
9. **Audit cross-references** in `.audit/`, `.bok/`, `.bulwark/`, `Docs/` are updated where they cite v1 as a present-tense artifact. Historical citations (e.g. "the Feb audit covered the v1 program") stay as-is - they're factual about a moment in time.

#### 6.9.3 Pre-band-aid (shipped 2026-05-10)

Ahead of this full migration, two constants were bumped on `main` to make the v1 1v1 flow survivable in the meantime:

- `TURN_TIMEOUT_MS`: 60s → **10 min** (server/socket-io/main.js)
- `RECONNECT_WINDOW_MS`: 30s → **10 min** (server/socket-io/main.js)
- `BattleScreen` initial turn-timer: 60 → 600s (client UI matches the new server cadence)

This is a **band-aid, not a fix.** The right fix is the full migration above. Band-aid stays in place until 6.9.1 ships.

#### 6.9.4 Effort and risk

- **Engineering effort:** ~6–10 hours of focused work, mostly on server/services/solana.js + the lobby flow refactor in socket-io/main.js + the BattleScreen → GroupMatchScreen unification.
- **Test surface:** existing BOK math-invariant tests (159 passing) target v1's PDA layout. v2's matching tests need to cover the same surface - most invariants are mechanically the same, but the test harness needs re-pointing. Estimate ~4 hours.
- **Risk:** medium. Touches the wagered match flow which IS the demo-critical path. Best executed on a feature branch with full smoke-test coverage before merging to main. A live concurrent migration with in-flight matches is unsafe; recommend a maintenance window where new matches are blocked, in-flight matches drain, then deploy.
- **Sequencing:** runs *after* Bundles 1–3 ship (authority hardening, wallet/identity, refund/settle correctness). Those harden the v2 program's security surface before we shift ALL traffic onto it.

#### 6.9.5 Why this matters strategically

The v2-everywhere migration moves SolShot's identity from "TG Mini App with a real-time arcade vibe" to "async-first social-game system that lives wherever your group chat lives." That repositioning lines up with the roadmap thesis (`Docs/ROADMAP.md`) - same wallet, same SHOT economy, same Anchor program across multiple game types and multiple chat surfaces. Async-first is the architectural prerequisite for that vision; real-time-session-tied is not.

---

## Section 7 - Pre-Mainnet Smoke Test Checklist

This checklist must pass on devnet before mainnet deployment begins. Each item must be signed off by the engineering lead.

- [ ] **All four bundles deployed to devnet** - programs redeployed (v1 + v2), server redeployed to Render, client redeployed to Vercel. Verify deployed bytecode matches post-bundle-1 source via `solana program dump + sha256sum`.
- [ ] **Upgrade authority verified** - `solana program show 4kzrDpV9...` and `BVKXLUnukU9cyTAWojsQPfLWHq4CyJY7CLG59bBVSG7N` both show Squads multisig as upgrade authority. Old hot wallet shows no authority.
- [ ] **Full match lifecycle test (1v1 wagered)** - create match → both players deposit → settle → verify 90/7/3 split on-chain. Run 3 consecutive matches without error.
- [ ] **Concurrent deposit test** - simulate two players depositing simultaneously using two test clients. Verify `confirmDeposit` `findOneAndUpdate` fix (Step 3c) prevents DB desync. Confirm both `initialDepositTx` fields are populated correctly.
- [ ] **Concurrent settle test** - trigger `handleShot`, `handleForfeit`, and `handleIdleTimeout` concurrently using a test harness. Confirm only one settles; others return cleanly.
- [ ] **Wallet rotation test** - rotate a test user's embedded wallet via Privy. Verify `updateWalletForTgUser()` updates the DB. Simulate a settlement - confirm SOL routes to the new wallet, not the old one.
- [ ] **Non-contiguous mask rescue test** - simulate player 0 depositing and player 1 not depositing in a 2-player match. Trigger cancel. Verify `getEscrowState` call correctly identifies one depositor and builds `remaining_accounts` with length 1. Confirm on-chain cancel succeeds.
- [ ] **Devnet load test** - run 10 concurrent matches over 30 minutes. Monitor server logs for unhandled exceptions, DB errors, and RPC failures. Acceptable threshold: zero failed settlements that are not retried successfully within 5 minutes.
- [ ] **24-hour soak test** - leave 3 active matches on devnet for 24 hours without intervention. Verify no funds are locked and all auto-timeouts work correctly.
- [ ] **Re-run all three audit pipelines on post-bundles devnet**:
  - SOS scan: `cargo check` clean on both programs; no new findings from the authority/timelock additions
  - BOK: all 159 tests still passing on post-bundle code; no invariant regressions
  - DB: `node --check` on all server modules; no new findings from the DB/auth changes
- [ ] **Manual security review of authority migration** - JJ + one other set of eyes reviews the key rotation procedure, confirms old key has no residual access, and confirms Squads proposal flow works end-to-end.
- [ ] **Final BOK Kani pass (PROVEN tier)** - if WSL2 is available before launch, run Kani on I-FEE-1, I-FEE-2, I-FEE-3, I-FEE-4, I-CAP-1, I-CAP-2. Required for PROVEN tier; strongly recommended before mainnet but not a hard blocker if the Proptest suite is passing and no arithmetic changes were made in bundles.

---

## Section 8 - Mainnet Deployment Sequence

The operational commands and rollback procedures for the mainnet flip are in the deployment runbook (internal). This section provides the high-level order of operations.

**Pre-flight (day before):**
1. Freeze devnet - no code changes after smoke test passes
2. Back up all environment variables and keypairs to cold storage
3. Notify team: deployment window opens at the agreed launch time
4. Confirm Squads multisig members are available to co-sign the upgrade authority transfers

**Deployment order:**
1. Deploy v1 program (if updated) to mainnet via Squads proposal flow
2. Deploy v2 program (if updated) to mainnet via Squads proposal flow
3. Run `server/scripts/init-config.mjs` for mainnet GlobalConfig PDAs if new programs
4. Migrate upgrade authority to Squads multisig on mainnet (same as devnet Step 1e)
5. Rotate config.authority to app-authority keypair on mainnet (same as devnet Step 1f)
6. Deploy server to Render (mainnet env vars: `SOLANA_NETWORK=mainnet-beta`, `SOLANA_RPC_URL=<mainnet-helius>`, new keypair paths)
7. Deploy client to Vercel (mainnet env vars: `REACT_APP_ESCROW_PROGRAM_ID`, `REACT_APP_SHOT_TOKEN_MINT`)
8. Smoke test: one manual 0.01 SOL wagered match from the team wallet → verify settlement on-chain
9. Open to users

**Rollback procedure:**
- Server: Render rollback to previous deploy (instant via dashboard)
- Client: Vercel rollback to previous deploy (instant via dashboard)
- Program: cannot rollback on-chain state, but can pause via `pause_program` to prevent new matches; in-flight matches can still settle/cancel
- If a critical bug is discovered post-launch: pause both programs immediately via `pause_program` instruction; communicate to users; coordinate refund via `cancel_match` for all active matches; plan hotfix and redeploy via Squads proposal

See the deployment runbook (internal) for exact commands.

---

## Section 9 - Post-Mainnet Monitoring

### 9.1 On-chain monitoring

Configure a monitoring service (Helius webhooks or a custom cron) to alert on:

- Any `update_config` transaction on either program - alert immediately; review before `apply_config_update` timelock expires
- Any `pause_program` or `unpause_program` transaction - alert immediately (events emitted per SOS H043 fix)
- Any `cancel_match` or `permissionless_reclaim` transaction - alert for triage; could indicate deposit failures or disputed matches
- Settlement patterns: if any single wallet wins > 70% of wagered matches in a 24-hour window, flag for manual review (SOS H003/H006/H007 - authority self-play)
- Failed settlement retry exhaustion - alert to operator Telegram DM with matchId and wager amount

### 9.2 Off-chain monitoring

Monitor via server logs and DB:

- `failedSettlements` collection - alert if any entry has `retries >= 3` and `resolvedAt` is null after 30 minutes
- Auth anomalies - alert if any wallet attempts `signAndSendEscrowDeposit` for more than 5 matches per hour (outlier detection)
- RPC error rate - alert if `429` or network errors exceed 1% of RPC calls in a 5-minute window; trigger failover to backup RPC

Consult the operational runbook (to be created at `Docs/RUNBOOK.md`) for response procedures.

### 9.3 Key management monitoring

- Schedule a quarterly key rotation review: confirm no key material has been exposed in logs, repos, or environment variable leaks
- Monitor the Squads multisig for any proposals - any proposal to change upgrade authority or program bytecode should be reviewed before signing
- If the server operational key (`solshot-server-authority.json`) is suspected compromised, immediately pause both programs and rotate to a new key via the app-authority keypair

---

## Section 10 - Open Questions / Undecided Items

These items require explicit decisions before or shortly after mainnet launch. They are not blocking on their own but affect the design of the items above.

**10.1 JWT model: real verify or remove generation**

Decision: Option A (remove `generateToken`) or Option B (implement real JWT verify)?

Recommendation: Option A for launch. Document the decision in the project decisions log. If a JWT-based auth model is desired post-launch for mobile clients or third-party API access, implement it as a new feature rather than reviving the dead plumbing.

**10.2 Match-cancel atomicity on multi-dyno Render deployments**

`findOneAndUpdate` (Steps 3c + 3d) is atomic within a single MongoDB connection. If Render ever scales to multiple dynos, the `ws.withLock(roomId)` in-memory lock no longer provides cross-process mutual exclusion. Two dynos could both acquire their local lock and both proceed with settlement concurrently, both successfully updating the DB (because the `findOneAndUpdate` is atomic, only one wins), but both then attempting the on-chain settle TX - the second on-chain call fails with a program error.

For launch (single Render dyno), this is not a problem. For scale:
- Option A: Redis distributed lock (Redlock algorithm)
- Option B: Rely purely on DB atomicity (Step 3d) and handle the on-chain error gracefully - if the second settlement attempt gets `InvalidAccountState` back from the program (match already settled), treat it as success

Document the chosen approach in the project decisions log before scaling past one dyno.

**10.3 SHOT token economics finalization**

The SHOT mint authority is burned (10M supply, fixed). The 1M team allocation vests linearly over 6 weeks from launch as a public commitment (see `SHOT_TOKEN_MODEL.md` for full detail). The remaining liquidity strategy items are TBD:
- When does the first liquidity pool open? On which DEX?
- What is the initial LP seed amount?
- What is the burn schedule for prestige tiers, and does it interact with the fixed supply in ways that affect long-term token price?

None of these affect the on-chain security model, but they affect user trust and must be documented before mainnet.

**10.4 v1 deprecation timeline**

v1 (`solshot-escrow`) and v2 (`solshot-escrow-v2`) both exist on mainnet. v1 is the real-time 1v1–4 player program; v2 is the async N-player program. Several SOS findings (H030, H002 backport) are partially mitigated on v2 but not v1. The cleanest long-term path is to sunset v1 after mainnet stabilization.

Decision needed: by what date (or metric - e.g., "after N months with zero v1 matches") does v1 stop accepting new matches? How are any remaining in-flight v1 matches handled?

**10.5 Kani / formal verification tier**

BOK Audit #2 verified 41 invariants at HIGH-CONFIDENCE PROBABILISTIC (Proptest). Upgrading to PROVEN tier requires WSL2 + Kani (or a Linux CI runner). The BOK report recommends this before mainnet.

Decision: is PROVEN tier a hard prerequisite for mainnet, or is the current Proptest + code-read coverage sufficient given the clean 159/159 pass and the SOS CRITICAL findings having independent test coverage?

---

## Section 11 - Effort Summary Table

| Bundle | Items | Estimated effort | Risk |
|--------|-------|-----------------|------|
| 1: Authority hardening | 9 sequence steps (1a–1i) | 1–2 weeks | HIGH |
| 2: Wallet & Identity | 8 sequence steps (2a–2h) | 1 week | MEDIUM |
| 3: Refund & Settle | 8 sequence steps (3a–3h) | 1–2 weeks | MEDIUM-HIGH |
| 4: Defensive hygiene | ~25 small items (6.1–6.8) | 2–3 days | LOW |
| Pre-mainnet smoke test | 12 checklist items | 2 days | - |
| Mainnet deploy + 24h soak | - | 1 day + watch | - |
| **TOTAL** | | **3–5 weeks** | |

The critical path is: Bundle 1 (Anchor changes + devnet deployment) → Bundle 3 (concurrent settlement fixes, needs devnet with live Bundle 1 programs) → Smoke test → Mainnet. Bundles 2 and 4 can run in parallel with Bundle 3.

---

## Section 12 - Cross-Reference Index

| Finding | Source | Bundle | Status |
|---------|--------|--------|--------|
| SOS H001 (one-step authority rotation) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1c | Deferred |
| SOS H002 (treasury self-redirect) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1d | Deferred |
| SOS H003 (authority winner fraud) | `.audit/FINAL_REPORT.md` | Post-mainnet (VRF) | Long-term |
| SOS H006/H007 (authority collusion / self-play) | `.audit/FINAL_REPORT.md` | Bundle 2 (identity binding) | Deferred |
| SOS H008 (race-init) | `.audit/FINAL_REPORT.md` | Deploy script (atomic init) | Addressed by procedure |
| SOS H011 (BPS poisoning via L2 compromise) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1d (timelock) | Deferred |
| SOS H024 (non-contiguous mask) | `.audit/FINAL_REPORT.md` | Bundle 3, Step 3b | Deferred |
| SOS H030 (fee dest hijack v1 live read) | `.audit/FINAL_REPORT.md` | Bundle 1 + v1 deprecation | Deferred |
| SOS H032 (BPS ratcheting) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1d | Deferred |
| SOS H033 (start_with_depositors griefing) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1d (max activation delay) | Deferred |
| SOS H042 (GlobalConfig no close path) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1i | Deferred |
| SOS H044 (single hot wallet L1+L2) | `.audit/FINAL_REPORT.md` | Bundle 1, Steps 1e+1f | Deferred |
| SOS H046 (Layer-1 bytecode replacement) | `.audit/FINAL_REPORT.md` | Bundle 1, Step 1e | Deferred |
| SOS H049 (match_id entropy) | `.audit/FINAL_REPORT.md` | Bundle 4, Step 6.5 | Deferred |
| SOS G001 (v2 10-player CU ceiling) | `.audit/FINAL_REPORT.md` | Smoke test | Deferred |
| DB H003 (JWT never verified) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2a | Deferred |
| DB H004 (auth replay window) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2h | Deferred |
| DB H006 (TG identity backfill) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2g | Deferred |
| DB H009 (wallet rotation gap) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2b | Deferred |
| DB H010 (reconnect stale wallet) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2c | Deferred |
| DB H011 (keypair zeroization) | `.bulwark/FINAL_REPORT.md` | Bundle 1, Step 1g | Deferred |
| DB H012 (single keypair upgrade+app auth) | `.bulwark/FINAL_REPORT.md` | Bundle 1, Steps 1e+1f | Deferred |
| DB H014 (H023 fix desync - server vs on-chain mask) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3a | Deferred |
| DB H015 (double-settle race) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3d | Deferred |
| DB H016 (confirmDeposit overwrite) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3c | Deferred |
| DB H017 (self-damage Math.abs) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3e | Deferred |
| DB H030 (escrowDepositStatus PII) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3h | Deferred |
| DB H034 (Vercel zero headers) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.1 | Deferred |
| DB H036 (unsafe-inline CSP) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.1 | Deferred |
| DB H037 (failedSettlements drop) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3f | Deferred |
| DB H040 (v2 retry queue missing) | `.bulwark/FINAL_REPORT.md` | Bundle 3, Step 3f | Deferred |
| DB H042-H045 (npm CVEs) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.8 | Deferred |
| DB H047 (magic-link URL param) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.2 | Deferred |
| DB H048 (magic-link process-local) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.2 | Deferred |
| DB H049-H050 (RPC fallback + retry) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.3 | Deferred |
| DB H051 (deprecated confirmTransaction) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.3 | Deferred |
| DB H056-H057 (bot rate limiting) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.7 | Deferred |
| DB H058-H059 (settle TOCTOU) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.4 | Deferred |
| DB H060 (match_id uniqueness) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.5 | Deferred |
| DB H067-H068 (logging PII) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.6 | Deferred |
| DB H070 (/health activeConnections) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.6 | Deferred |
| DB H078 (scheduler reentrance) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.7 | Deferred |
| DB H082 (zeroization regression) | `.bulwark/FINAL_REPORT.md` | Bundle 1, Step 1g | Deferred |
| DB H084 (deprecated Privy SDK) | `.bulwark/FINAL_REPORT.md` | Bundle 2, Step 2f | Deferred |
| DB H085 (nodemon in prod deps) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.8 | Deferred |
| DB H088 (throttle resets on reconnect) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.7 | Deferred |
| DB H089 (Math.random group IDs) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.5 | Deferred |
| DB H090 (challenge code entropy) | `.bulwark/FINAL_REPORT.md` | Bundle 4, Step 6.5 | Deferred |
| DB H120 (cross-skill chain) | `.bulwark/FINAL_REPORT.md` | Bundle 1 + Bundle 2 (compound) | Deferred |
| BOK I-CAP-3/4 (LiteSVM-deferred) | `.bok/reports/2026-05-07-report.md` | Smoke test (Kani/LiteSVM) | Deferred |
| BOK I-CUSTOM-1 (full lifecycle LiteSVM) | `.bok/reports/2026-05-07-report.md` | Smoke test | Deferred |

---

*Generated from: the SOS remediation log (Section 5), the DB remediation log (Section 4), `.audit/FINAL_REPORT.md`, `.bulwark/FINAL_REPORT.md`, `.bok/reports/2026-05-07-report.md`.*  
*Last updated: 2026-05-07.*
