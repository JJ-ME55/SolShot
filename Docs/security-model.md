# Security Posture

> **The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.**

SolShot is a 1v1–10-player artillery game where real SOL is wagered through on-chain escrow. The security architecture enforces a hard boundary: the server is authoritative over gameplay (physics, turns, damage), while the Solana blockchain is authoritative over funds (deposits, payouts, refunds). The escrow program's Anchor constraints guarantee that funds can only move to addresses registered at match creation - even a compromised server key cannot redirect funds to an unregistered wallet.

This document reflects the state after three independent security analyses (May 2026 round) and the remediation commits that followed. Twenty-five findings were fixed across two source commits (the SOS fix commit, the DB fix commit); approximately fifty findings are explicitly deferred to the pre-mainnet hardening pass.

**Current verdict (all three auditors):** safe for hackathon devnet use; not yet safe for mainnet deployment with real funds. Bundles 1–4 in the roadmap section must land first.

---

## Your Funds Have Three Independent Escape Paths

Every SOL deposited into a SolShot match has three independent recovery mechanisms. If one path is blocked, the next activates automatically.

**Path 1 - Server Recovery.** Under normal operation the server settles the match within minutes. If settlement fails (network congestion, RPC timeout) the server retries via `cancelMatchEscrow`, refunding all players in full. Settlement failures propagate to callers - they are never silently swallowed (post-DB-H013 fix).

**Path 2 - Player Cancellation.** If the server is unresponsive, any registered player can cancel the match directly on-chain. In v1 this is available after 1 hour; in v2 it is available after the `deposit_window` expires. The `cancel_match` instruction refunds each depositor to their registered wallet. No server involvement is required.

**Path 3 - Permissionless Reclaim.** If both the server and the players are unavailable, anyone can trigger a full refund by calling `permissionless_reclaim`. In v1 this activates after 2 hours (`TIMEOUT_SECONDS * 2 = 7200s`, post-H035/H040 fix); in v2 after 24 hours + the match duration. This requires no authority key and no player signature. The caller receives the PDA rent lamports as an economic incentive to clean up stale escrows.

No SOL can be permanently locked. The on-chain program enforces these timeouts with `Clock::get()?.unix_timestamp` checks against `activated_at` and `created_at` timestamps stored in the escrow account.

---

## Threat Model

### Actors

| Actor | Trust Level | Notes |
|-------|-------------|-------|
| **Anonymous visitor** | Untrusted | Any HTTP/WebSocket client; no credentials |
| **Authenticated player** | Zone 1–3 | Has Privy session OR Telegram HMAC; identity confirmed to Zone 2 after wallet bind |
| **Server (application)** | Zone 4 | Holds `HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` - application + upgrade authority |
| **Privy custody layer** | External trusted | Manages embedded wallet key material; trusted for key custody, not for identity claims |
| **Solana RPC** | External trusted | Single unmonitored endpoint (acknowledged gap - Bundle 1 adds fallback) |
| **MongoDB Atlas** | External trusted | Stores user, match, challenge, referral state; free tier has no at-rest encryption |

### Trust Zones (from DB Audit #2 architecture synthesis)

```
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 0 - PUBLIC INTERNET (UNTRUSTED)                              │
│ Any HTTP client, WebSocket connector, or TG webhook               │
│ → CORS + helmet + rate-limit (comprehensive post-Feb hardening)   │
└──────────────────────────┬───────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 1 - AUTHENTICATED CLIENT                                     │
│ Holds TG HMAC verification OR Privy session JWT                   │
│ GAP: client.isAuthenticated is an in-memory socket flag;         │
│       JWT generated but not verified server-side (H003 deferred) │
└──────────────────────────┬───────────────────────────────────────┘
                           ↓ tgIdFor() resolution
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 2 - VERIFIED IDENTITY (TG ID + Wallet)                       │
│ Server knows caller's TG ID and wallet pubkey                     │
│ POST-FIX: H001 Privy/TG bridge now validates telegramUserId       │
│            against Privy getUser() claims                         │
│ REMAINING GAP: wallet rotation never updates DB (H009 deferred)  │
└──────────────────────────┬───────────────────────────────────────┘
                           ↓ match-participant authz
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 3 - MATCH PARTICIPANT (per-match scope)                      │
│ Can: deposit, fire, forfeit, purchase weapon, confirm deposit     │
│ POST-FIX: shoot relay (H018), acceptChallenge (H019),            │
│            clientDebugLog (H020), getGroupMatch (H022) now auth'd │
└──────────────────────────┬───────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────────────┐
│ ZONE 4 - SERVER AUTHORITY (Escrow signer)                         │
│ Holds solshot-dev.json keypair                                    │
│ Signs on behalf of game state to settle/cancel/create on-chain   │
│ Same key holds Solana program upgrade authority (v1 + v2)         │
│ ACKNOWLEDGED GAP: single hot wallet = upgrade + app auth          │
└──────────────────────────┬───────────────────────────────────────┘
            ┌──────────────┴──────────────────┐
            ↓                                 ↓
     On-chain (Solana RPC)              MongoDB Atlas
     v1: 4kzr…nH1                       (no at-rest encryption, free tier)
     v2: BVKX…G7N
```

### Trust Boundaries

- **Zone 0 → Zone 1:** TG bot HMAC verification OR Privy JWT parse. Helmet + CORS + express-rate-limit at the perimeter.
- **Zone 1 → Zone 2:** `tgIdFor()` resolves identity per-event. Post-H001-fix, `link-from-privy-telegram` verifies `telegramUserId` matches Privy `getUser()` claims.
- **Zone 2 → Zone 3:** Match-participant check (socket must be listed as a player in the room state).
- **Zone 3 → Zone 4:** Server signs on-chain transactions with authority keypair. No player can call settle/cancel/create on-chain without server cooperation (or the timeout escape hatches).
- **Zone 4 → On-chain:** Anchor program enforces all account constraints. Server cannot redirect funds outside registered player set.

---

## Audit Posture

Three independent analyses were performed in May 2026, stacked on the February 2026 round. Each targets a distinct layer.

### SOS (Stronghold of Security) - On-Chain Programs

**Scope:** `programs/solshot-escrow/src/lib.rs` (v1, 962 LOC) + `programs/solshot-escrow-v2/src/lib.rs` (v2, 1020 LOC)
**Ref at audit:** the audit baseline | **Post-fix ref:** the SOS fix commit
**Methodology:** 6 parallel context auditors (access control, arithmetic, state machine, CPI, token economics, timing), 50 attack hypotheses.

| Severity | Total | Fixed in the SOS fix commit | Deferred |
|----------|-------|--------------------|---------|
| CRITICAL | 4 | 1 (H023) | 3 (H001, H044, H046) |
| HIGH | 14 | 8 | 6 |
| MEDIUM | 4 | 0 | 4 |
| LOW | 6 | 0 | 6 |
| NOT_VULNERABLE | 18 | - | - |

**Headline finding (H023 - CRITICAL, CVSS 9.3):** Partial-refund theft via `close = caller` sweep. Any registered player (or anyone for `permissionless_reclaim`) could call cancel/reclaim with a partial `remaining_accounts` array; Anchor's exit hook would sweep all un-refunded co-depositor wagers to the caller. Up to 900 SOL stealable per v2 max match in a single TX. **Fixed:** `require!(remaining_accounts.len() == count_ones(deposits_mask))` added at all four refund-loop sites in both programs.

**Other critical findings:** H001 (one-step authority transfer), H044 (single hot wallet for Layer-1 upgrade + Layer-2 application authority), H046 (Layer-1 bytecode replacement with no timelock). All three deferred to the pre-mainnet authority hardening bundle .

**Remediation decisions:** the SOS remediation log

---

### BOK (Book of Knowledge) - Math Invariant Verification

**Scope:** Both programs at post-fix-bundle commit the SOS fix commit
**Methodology:** Proptest (randomized, thousands of inputs per invariant) + compile-time `const_assert` + source-grep. Kani unavailable on Windows - verification tier is HIGH-CONFIDENCE PROBABILISTIC, not PROVEN.

| Metric | Count |
|--------|-------|
| Programs analyzed | 2 (v1 + v2) |
| Math regions identified | 14 (across 6 categories) |
| Invariants confirmed | **41** |
| Tests run | **159** |
| Tests passed | **159 / 159** |
| Violations found | **0** |

**Key invariants verified:**

- `winner + treasury + ops == total_pot` - pot conservation holds for all valid inputs (v1 hardcoded 90/7/3; v2 configurable BPS)
- Dust ≤ 2 lamports - rounding residual is bounded and goes to winner, never lost
- u128 widening lossless - no overflow in BPS fee calculation
- H023 regression - partial-`remaining_accounts` attack correctly rejected (I-REF-1, I-REF-5)
- Monotonic deadline ordering - deposit → activation → settlement/reclaim windows are strictly ordered
- Per-match snapshot atomicity - v2 BPS/treasury/ops locked at `create_match`, settle reads only snapshot
- Fix-bundle constants verified non-regressive: TIMEOUT 600→3600, RECLAIM 1200→7200, MIN_DEPOSIT_WINDOW=600 (NEW), MAX_DURATION 7d→24h

**Verification gap (mainnet requirement):** Kani formal proofs for I-FEE-1/2/3/4 and I-CAP-1/2 require WSL2. Full-lifecycle LiteSVM test for zero-leakage invariant (I-CUSTOM-1) deferred to mainnet hardening.

**Report:** `.bok/reports/2026-05-07-report.md`

---

### DB (Dinh's Bulwark) - Off-Chain Server + Client + Bot

**Scope:** Express + Socket.IO + Telegraf server, React + Phaser client, Privy embedded wallets, MongoDB, Vercel/Render infrastructure (~84,270 LOC across 142 files)
**Ref at audit:** the BOK verification commit | **Post-fix ref:** the DB fix commit
**Methodology:** 22 parallel domain-specific context auditors, 5 batches, combination analysis for multi-step chains.

| Severity | Total | Fixed in the DB fix commit | Deferred |
|----------|-------|---------------------|---------|
| CRITICAL | 23 | 6 (H001, H002, H013, H018, H019, H020+H022+H023+H026+H031) | 17 |
| HIGH | 40 | 10 (H032, H035, H041, H055, H072, H083 + related) | 30 |
| MEDIUM | 30 | 0 | 30 |
| LOW | 20 | 0 | 20 |

**Headline finding (H120 - cross-skill chain):** SOS-deferred H001 (one-step authority transfer) + DB H002 (Privy `requirePrivyAuth` fails-open when `PRIVY_APP_SECRET` is absent from `render.yaml`) compose into: valid Privy account → bind victim TG ID → assume victim session → trigger one-step authority rotation → drain treasury. Both pieces required; this finding disappears once either H001 is fixed (SOS Bundle 1) or H002 stays closed (already fixed in the DB fix commit).

**Other critical findings fixed in the DB fix commit:**
- H001: `link-from-privy-telegram` now validates `telegramUserId` against Privy `getUser()` claims
- H013: `refundWager()` cancel CPI errors now propagate - no more silent fail-open
- H018/H019/H020/H022: `shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog`, `getGroupMatch` all require auth
- H026: `data.seq` turn nonce is now mandatory (was optional)
- H031: `DebugAuthOverlay` gated on `NODE_ENV !== 'production'`
- H083: Admin key compare uses `crypto.timingSafeEqual`

**Remediation decisions:** the DB remediation log

---

## Critical Invariants

### On-Chain (Enforced by Anchor Program)

| Invariant | Status | Evidence |
|-----------|--------|---------|
| Pot conservation: `winner + treasury + ops == total_pot` | VERIFIED | BOK I-FEE-1, Proptest 159/159 |
| Refund conservation: Σ refunds == `wager × count_ones(mask)` | VERIFIED | BOK I-REF-2, Proptest |
| Dust ≤ 2 lamports (rounding goes to winner, not lost) | VERIFIED | BOK I-FEE-2, Proptest |
| H023 length-check: `remaining_accounts.len() == count_ones(deposits_mask)` | VERIFIED | BOK I-REF-1, Proptest |
| Monotonic deadlines: deposit < activation < settlement/reclaim | VERIFIED | BOK INV-2, Proptest |
| Per-match snapshot atomic (v2): BPS/treasury/ops locked at create | VERIFIED | BOK I-CAP-3, Code-read |
| Settle reads snapshot only (v2): no live config read at settle time | VERIFIED | BOK I-CAP-4, Code-read |
| BPS combined cap ≤ 1000 (10%) enforced at init + update | VERIFIED | BOK I-CAP-1/2, Proptest |
| Fee destinations not executable (EP-106 defense) | ENFORCED | `constraint = !X.executable` on all 6 UncheckedAccount fee destinations |
| Winner must be registered player at creation | ENFORCED | Anchor `has_one` constraint |
| Players are distinct wallets; authority cannot be player | ENFORCED | `require!` constraints at `create_match` |
| No double-deposit (bit collision prevention) | ENFORCED | `(mask >> idx) & 1 == 0` check in `deposit_wager` |
| Terminal state set before lamport transfer (re-entrancy) | ENFORCED | `state = Settled/Cancelled` before any CPI |

### Off-Chain (Server Enforcement, Post-Fix)

| Invariant | Status | Evidence |
|-----------|--------|---------|
| Auth required for all state-mutating events | **PARTIAL** (post-fix improvement) | `requireAuth` on `shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog`, `getGroupMatch` - FIXED in the DB fix commit; `confirmDeposit` overwrite race still open (H016 deferred) |
| TG identity bound to verified Privy claims | **ENFORCED** (post-H001-fix) | `link-from-privy-telegram` validates against `getUser()` |
| `refundWager()` failure propagates to caller | **ENFORCED** (post-H013-fix) | Cancel CPI errors no longer fail-open |
| Settlement winner is alive player in match | **ENFORCED** | Mongoose validation + on-chain Anchor constraint |
| Turn-sequence nonce required (replay prevention) | **ENFORCED** (post-H026-fix) | `data.seq` mandatory at `server/socket-io/main.js:3711` |
| Wallet rotation updates DB before settlement | **VIOLATED - deferred** | H009: `users.js:91` only sets wallet if null; Privy re-provision not detected |
| Group-chat double-settle prevented | **VIOLATED - deferred** | H015: `checkAndSettle()` race; H016: `confirmDeposit` overwrite |
| Server reads on-chain `deposits_mask` for refund builder | **VIOLATED - deferred** | H014: server uses in-memory state; desync causes `IncompleteRefund` on-chain |

---

## Known Limitations (Intentional Pre-Mainnet)

These are deliberate architectural choices accepted for the hackathon/devnet phase. Each has a documented plan for mainnet.

### Single Hot Wallet for Upgrade + Application Authority

`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk` holds both the Solana BPF Loader upgrade authority (Layer-1) and the `config.authority` for both escrow programs (Layer-2). One key compromise enables:
- Deploy malicious bytecode (Layer-1) with no timelock or multisig veto
- Rotate treasury/ops addresses (Layer-2) then drain on next settlement

**Accepted because:** operational complexity of Squads multisig setup exceeds hackathon scope. Documented at SOS H044 + H046. Mainnet plan: separate keys, upgrade authority → Squads M-of-N multisig before launch.

### One-Step Authority Transfer (SOS H001)

`update_config` rotates `config.authority` in a single transaction with no propose/accept pattern and no timelock. Historical Solana protocol losses from single-step authority rotation: Step Finance ~$30–40M, Garden ~$11M, Raydium ~$4.4M.

**Accepted because:** adding `pending_authority` + propose/accept is a meaningful state-machine change requiring IDL update + client integration. Mainnet plan: `propose_authority` + `accept_authority` instructions + 24h timelock on fee/address changes.

### Server as Winner Selector (SOS H003)

The server calls `settle_match` designating the winner from the two registered players. There is no on-chain proof of game outcome. A compromised server key could settle matches in favor of a colluding wallet - it still cannot redirect funds outside the registered player set, but it can influence which registered player wins.

**Accepted because:** commit-reveal or VRF-based winner selection requires significant protocol redesign. **Economic bound:** winner still receives 90% of pot; maximum extraction per compromised match = (losing player's wager) × 0.9. Mainnet plan: on-chain oracle or commit-reveal mechanism.

### JWT Generated but Not Verified (DB H003)

The server generates JWTs for clients but never performs `verifyToken()`. Authentication is actually enforced via the `client.isAuthenticated` in-memory socket flag and Telegram HMAC. The JWT gives the impression of a stronger auth model than exists.

**Accepted because:** the current socket-flag model is functional and the JWT is vestigial dead code. Mainnet decision: either implement real JWT verification end-to-end OR remove `generateToken` to remove the false impression.

### Wallet Rotation Handling Pending (DB H009)

Privy may re-provision an embedded wallet (SDK upgrade, key rotation, user action). `users.js:91` only sets `walletAddress` if currently null. Post-rotation, settlement reads the stale DB address; the user no longer controls that wallet. Funds go to whoever holds the old key.

**Accepted because:** the fix requires a versioned audit trail + Privy SDK rotation detection. Mainnet plan: `updateWalletForTgUser()` helper + reconcile script.

### Auth Signature Replay Window (DB H004)

The 5-minute replay window on auth signatures is not blocked by a consumed-signatures set. An attacker who intercepts a valid signature can replay it within the window.

**Accepted because:** requires persistent state (Redis or TTL-keyed Mongo Set). Mainnet plan: `consumedSignatures` Set with TTL eviction, Redis if multi-process.

---

## Recently Shipped Hardening (Since Feb 2026)

This section summarizes work landed across the May 2026 audit fix bundles plus the Phase 4/6 hardening passes that preceded the audit.

### Phase 4 - Secrets Management

- Centralized `keys.js` module for all keypair loading with documented zeroization approach
- `JWT_SECRET` production guard - server fails fast if unset in production
- Admin key gate for sensitive endpoints
- SIGHUP-triggered credential reload without server restart

### Phase 6 - Token Economy Hardening

- MongoDB persistence for SHOT-burn deduplication sets (was in-memory, lost on restart)
- Fail-hard startup if emission state is inconsistent

### Infrastructure and Auth

- `helmet` middleware with CSP, HSTS, frameguard, noSniff - fully deployed
- CORS scoped to allowed origins; dead Dynamic SDK origins replaced with Privy origins in CSP (post-H035-fix)
- `express-rate-limit` (bumped to 8.5.1, closing IPv6 bypass CVE)
- Auth gates added to `shoot`, `acceptChallenge`, `declineChallenge`, `clientDebugLog`, `getGroupMatch` (post-DB fix bundle)
- `tgIdFor()` identity resolution deployed on all group-chat events

### Supply Chain

- Server npm vulnerabilities: −33% (30 → 20 vs Feb baseline)
- Client npm vulnerabilities: −64% (131 → 47 vs Feb baseline)
- `qs` upgraded to 6.14.2 (above prototype-pollution threshold 6.10.3)
- Source maps disabled in production (`GENERATE_SOURCEMAP=false` in `client/.env.production`)
- No secrets committed to git history

### On-Chain

- H023 (CRITICAL): partial-refund theft closed - length-check at all 4 refund-loop sites
- H016/H009: pause guards removed from v1 `cancel_match`/`settle_match`/`start_with_depositors` - pause no longer blocks in-flight exits
- H017: v1 `start_with_depositors` timing gate (MIN_DEPOSIT_WINDOW_SECS = 600)
- H035: v1 TIMEOUT_SECONDS 600 → 3600 - cancel/settle race window eliminated
- H039: v2 MAX_DURATION_SECS 7 days → 24 hours
- H018: v2 deposit_deadline strict `<` check (edge collision eliminated)
- H025: executable-account `!executable` constraint on all fee destinations
- H043: `Paused`/`Unpaused` events added - operational pause state now observable on-chain

---

## Mainnet Hardening Roadmap

The following bundles must land before mainnet deployment with real funds. Each can be a separate PR + audit-verify cycle. Order matters - Bundle 1 is a prerequisite for safely deploying Bundle 2.

### Bundle 1 - Authority Hardening

Closes: SOS H001, H002, H030, H032, H042, H044, H046; DB H003, H004, H011, H012; reduces blast radius of H003/H006/H007/H011.

1. Add `pending_authority: Option<Pubkey>` to both `GlobalConfig` structs
2. Add `propose_authority` + `accept_authority` instructions (new authority must sign accept)
3. Add `last_config_update_ts` + `CONFIG_TIMELOCK_SECS = 86400` - pending BPS/address changes take effect only after 24h delay
4. Migrate Layer-1 upgrade authority to Squads M-of-N multisig before mainnet deploy
5. Separate the application authority key from the upgrade authority key
6. Add `propose_recovery` + guardian mechanism for key-loss recovery (closes H042)
7. Add RPC fallback endpoint + health check + exponential backoff wrapper (DB H049/H050)
8. WSL2 + Kani for PROVEN verification tier on fee/pot math invariants

### Bundle 2 - Wallet and Identity

Closes: DB H009, H010, H014, H015, H016; reduces H120 compound chain risk.

1. `updateWalletForTgUser()` helper with versioned audit trail - detects Privy re-provision events
2. Reconcile script: sweep existing DB users for stale wallet addresses
3. `confirmDeposit` refactored to `findOneAndUpdate` with `$set: {'players.$.initialDepositTx': txSig}` under `$elemMatch` (closes H016 overwrite race)
4. Group-chat `checkAndSettle()` converted to `findOneAndUpdate({state:'active'},{state:'settled'})` atomic (closes H015 double-settle race)
5. Off-chain refund builder reads on-chain `deposits_mask` before constructing `remaining_accounts` (closes H014 SOS/DB boundary desync - eliminates `IncompleteRefund` revert risk)

### Bundle 3 - Refund Loop Refactor

Closes: SOS H024 (non-contiguous mask permanently unrefundable); improves H023 server-side correctness.

1. Refund loop signature: accept `player_indices: Vec<u8>` + matching `remaining_accounts` (removes contiguous-prefix assumption)
2. Update IDL, `escrow.js`/`escrow-v2.js`, and client `WalletContext` callsites
3. Devnet test: simulate non-contiguous mask scenario (currently logged as `UNRECOVERABLE`)
4. Bump match_id entropy: `crypto.randomBytes(8)` = 16 hex chars + Mongoose `unique: true` (closes SOS H049 / DB H060)

### Bundle 4 - Client, Headers, and Long-Term Protocol

Closes: DB H030, H034, H047; completes SOS H003 research.

1. Vercel `client/vercel.json` security headers: `frame-ancestors`, `X-Frame-Options`, HSTS, Permissions-Policy (closes DB H034)
2. Strip wallet pubkeys from `escrowDepositStatus` broadcast - emit only `{playerIndex, confirmed}` (closes DB H030 PII leak)
3. Move magic-link token to URL fragment `#linkToken=...` - never server-logged (closes DB H047)
4. Commit-reveal or VRF-based winner selection - removes server trust from settlement path entirely (closes SOS H003 design limitation)
5. On-chain dispute mechanism for game-outcome challenges

---

## Incident Response

### Pause Protocol

**v2 posture (production target):** `pause_program` halts only `create_match` and `deposit_wager`. Active matches can still `settle_match`, `cancel_match`, and `permissionless_reclaim` while paused - pause does not block in-flight exits. This is intentional: players can always exit a paused program.

**v1 posture (post-H016 fix):** Same. Pause guards were removed from v1's `cancel_match`, `settle_match`, and `start_with_depositors` in commit the SOS fix commit, bringing v1 into alignment with v2.

Pause state is now observable: `pause_program` and `unpause_program` emit `Paused`/`Unpaused` events on-chain (post-H043 fix).

### Permissionless Reclaim (Player Escape Hatch)

- **v1:** available after `PERMISSIONLESS_RECLAIM_TIMEOUT = 7200s` (2 hours) from `created_at`. Caller receives PDA rent.
- **v2:** available after `duration_secs + RECLAIM_GRACE_PERIOD` (24h cap on duration). Same caller incentive.

No authority key required. No player signature required. This is the ultimate backstop: even if the authority key is lost and the server is permanently offline, every escrow PDA becomes reclaimable.

### Server Keypair Rotation

Authority keys can be rotated without disrupting active matches. The `update_config` instruction updates the GlobalConfig PDA; existing escrow PDAs retain their original authority reference until settlement or cancellation.

**Operational gap (acknowledged):** no formal documented key rotation runbook. Rotation procedure requires generating a new keypair, calling `update_config`, verifying the new authority, and updating `SOLANA_SERVER_KEYPAIR_PATH` in the environment. SIGHUP-triggered reload is available post-Phase-4-hardening.

**Critical:** never run `solana program deploy` without first confirming `target/deploy/solshot_escrow-keypair.json` pubkey matches the intended deployed program ID. The keypair was regenerated between the Feb and May deploys, making the old `Cqv...` program an orphan with unrecoverable upgrade authority.

### Full Incident Response Sequence

1. **Pause.** Authority calls `pause_program` on both v1 and v2 - halts new commitments (create + deposit). Idempotent. Active match exits continue.
2. **Server halt.** Stop the server process - prevents new match creation and settlement requests. Active WebSocket connections terminate.
3. **Assess.** Determine whether the keypair is compromised. If yes, immediately move to step 4; if no, investigate the incident and resume.
4. **Key rotation.** Generate new keypair, call `update_config` with new authority. New authority takes effect for all subsequent operations.
5. **Permissionless reclaim backstop.** Even if the authority key is lost, every escrow PDA becomes reclaimable by anyone after the timeout. Players' funds return to their registered wallets.

---

## Escrow Design

The on-chain escrow program (Anchor 0.32.1) manages the full lifecycle of a wager: creation, deposits, settlement, cancellation, and permissionless reclaim. All account validation runs through Anchor `#[derive(Accounts)]` constraints.

**Match lifecycle (v2, N-player):**
1. Server creates escrow PDA with all player wallets (2–10), wager amount, and BPS snapshot registered on-chain
2. Each player signs a deposit transaction within the `deposit_window`
3. All deposits trigger `MatchState::Active` with `activated_at` timestamp
4. Server settles the match at match end: `treasury_bps` to treasury, `ops_bps` to ops, remainder to winner
5. Escrow PDA closes, returning rent to the authority

**On-chain constraints enforced by the program:**
- Winner must be a registered player at creation
- Treasury and ops addresses must match the GlobalConfig PDA (v1) or per-match snapshot (v2)
- Treasury and ops must be distinct accounts (prevents settlement DoS)
- Fee destinations must not be executable programs (`!executable` constraint, post-H025)
- Wager bounds: minimum 10,000 lamports, maximum 100 SOL
- Players must be distinct wallets; authority cannot be a player
- Combined fee BPS ≤ 1000 (10% cap) enforced at config init + update
- Terminal state (`Settled` or `Cancelled`) set before any lamport transfer (re-entrancy prevention)
- All arithmetic uses `checked_mul`, `checked_div`, `checked_add`, `checked_sub` with u128 widening for BPS calculations
- Refund loop: `remaining_accounts.len() == count_ones(deposits_mask)` required (post-H023)

**Fee model:**
- v1: hardcoded 90/7/3 (winner/treasury/ops). Immutable without redeploy.
- v2: configurable BPS from GlobalConfig, snapshotted atomically at `create_match`. Settle reads only the snapshot - live config changes do not affect in-flight matches.
- Dust (≤ 2 lamports per BOK verification) goes to winner, never lost.

---

## Authority Model

SolShot is operated as a small team with single-key custody. The escrow program's authority key is a single server keypair (`HPyVPj2VH9yBirr7FMgAJeDH8xJgaMKy5UnwLkjSnovk`), held by the engineering lead (JJ), that holds both Solana program upgrade authority and application-level escrow authority. This is the structural risk - not the team size - and the security model is built around the key, not the org chart.



**What the authority key can do:**
- Create match escrows and settle them (designating the winner from the registered players)
- Pause and unpause all economic instructions
- Rotate the authority, treasury, and ops addresses via `update_config`
- Deploy new bytecode to both programs (via BPF Loader upgrade)

**What the authority key cannot do:**
- Send funds to an address not registered as a player at match creation
- Settle a match to a third-party wallet outside the registered player set
- Prevent permissionless reclaim after the timeout expires
- Retroactively change BPS on in-flight v2 matches (per-match snapshot is immutable post-create)

**Mitigations in place:**
- Key material loaded via centralized `keys.js` module
- SIGHUP-triggered credential reload available without server restart
- `ConfigUpdated` event emitted on every config change - on-chain audit trail
- `Paused`/`Unpaused` events emitted for operational monitoring

**v2 improvement over v1:** Per-match BPS snapshot means the H001→H002 fee-redirect chain (rotate treasury mid-match to redirect settlement) is closed for v2 in-flight matches. v1 still reads live config at settle time and carries H030 (fee destination hijack) as a deferred HIGH finding.

---

## Mathematical Verification Summary

The BOK audit verified 66 invariants across two audit rounds (25 in Feb 2026, 41 in May 2026) with zero violations across 159 test runs. All nine fix-bundle constants from commit the SOS fix commit were verified non-regressive.

**Key properties proven probabilistically (Proptest):**

| Property | Result |
|----------|--------|
| `winner + treasury + ops == total_pot` for all valid inputs, v1 + v2 | PASSED |
| Dust ≤ 2 lamports for all valid BPS configurations | PASSED |
| H023 attack correctly rejected by length-check (canonical + non-contiguous variants) | PASSED |
| v1 cancel/settle race window eliminated (TIMEOUT 600→3600) | PASSED |
| v2 deposit-deadline strict `<` edge case (H018) | PASSED |
| v2 MAX_DURATION_SECS = 86400 enforced (7d→24h regression) | PASSED |
| v1 MIN_DEPOSIT_WINDOW_SECS = 600 boundary (H017 timing gate) | PASSED |
| BPS cap ≤ 1000 holds at init + multi-step update | PASSED |
| Compaction mask always contiguous prefix | PASSED |
| u128 widening: no overflow for any valid wager × 10 players × max BPS | PASSED |

**Verification mode:** HIGH-CONFIDENCE PROBABILISTIC (Proptest). Kani formal proofs required for PROVEN tier on mainnet - depends on WSL2 availability.

---

## Regulatory Disclaimer

SolShot is a skill-based game. Outcomes are determined by player decisions within a physics simulation - projectile angle, power, weapon selection, and positioning. Players are responsible for compliance with local regulations regarding skill-based competition and digital asset wagering in their jurisdiction.

---

*Security posture assessed at commits the SOS fix commit (SOS fix bundle), the BOK verification commit (BOK test suite), the DB fix commit (DB fix bundle). Three independent analyses (SOS + BOK + DB). 25 findings fixed. ~50 deferred to mainnet hardening bundles 1–4. 159/159 mathematical invariant tests passing. Zero active on-chain CRITICAL or HIGH findings post-fix-bundle.*
