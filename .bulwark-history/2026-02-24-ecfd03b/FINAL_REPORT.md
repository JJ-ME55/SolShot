# SolShot Off-Chain Security Audit Report

**Audit Framework:** Dinh's Bulwark v1.0.0
**Audit Tier:** Deep
**Date:** 2026-02-23
**Audit Number:** 1 (First Audit)
**Audited Project:** SolShot (Express/Socket.IO server, React/Phaser.js client, wallet integration)
**Out of Scope:** On-chain Anchor escrow program (audited separately by Stronghold of Security)

---

## Executive Summary

SolShot is a browser-based multiplayer artillery game on Solana where players wager real SOL through an on-chain escrow program. This audit examined all off-chain components: the Node.js server (~1,800 LOC socket handler), React client, Solana wallet integration, and the server's authority over the on-chain escrow.

**The project is not safe for production deployment with real funds in its current state.**

The audit identified **70 confirmed vulnerabilities** and **29 potential issues** across 130 investigated attack hypotheses, with 31 additional hypotheses confirmed as not vulnerable. The most critical finding is a systemic pattern: the server's financial safeguards are structurally incomplete, with multiple independent failure paths that all favor fund loss. An attacker can enter wagered matches without funds, play without depositing, settle without verification, and replay rematches against closed escrows — each exploitable independently and devastating when chained.

### Key Metrics

| Metric | Value |
|--------|-------|
| Files scanned | 93 |
| Lines of code | ~36,512 |
| Strategies investigated | 130 |
| Confirmed vulnerabilities | 70 |
| Potential vulnerabilities | 29 |
| Not vulnerable (productive negatives) | 31 |
| Coverage verification | 100% (52/52 checklist items) |
| Auditor agents deployed | 22 |
| npm vulnerabilities (server) | 30 (4 low, 8 moderate, 18 high) |
| npm vulnerabilities (client) | 131 (20 low, 35 moderate, 73 high, 3 critical) |

### Confirmed Vulnerability Distribution

| Severity | Count | Primary Risk |
|----------|-------|-------------|
| CRITICAL | 12 | Direct fund loss, authority compromise, systemic bypass |
| HIGH | 34 | Financial integrity, authentication gaps, DoS |
| MEDIUM | 18 | Defense-in-depth, information disclosure, state integrity |
| LOW | 6 | Minor DoS, cosmetic security, dead code |
| **Total** | **70** | |

### Top 5 Systemic Issues

1. **Financial gates are absent or fail-open.** Balance checks, deposit verification, and escrow creation all have error paths that silently proceed without the safety check. These compose into S001: a complete wager bypass chain.

2. **Authentication is structurally broken.** JWT is generated but never consumed (zero call sites for `verifyToken()`). Six gameplay events execute without any authentication. Signature replay is possible within a 5-minute window.

3. **Settlement error handling favors fund loss.** Settlement failure triggers refund (winner loses winnings). Failed settlements are stored in-memory only (lost on restart). Match results are never written to the database.

4. **Single authority key controls all funds.** One hot-wallet keypair controls create, settle, cancel, pause, update_config on the escrow program. No multisig, no timelock, no rotation mechanism.

5. **All protective state is ephemeral.** Burn replay protection, rate limiting state, failed settlement queues, wager tracking, and deposit confirmations are all in-memory. A server restart erases all safeguards.

---

## Methodology

### Audit Pipeline

| Phase | Description | Model | Output |
|-------|-------------|-------|--------|
| 0. Scan | Static analysis, npm audit, file indexing | — | INDEX.md, static scan results |
| 1. Analyze | 22 parallel domain-specific auditor agents | Sonnet | 22 context reports |
| 1.5. Quality Gate | Automated quality validation | Haiku | Pass/fail |
| 2. Synthesize | Cross-auditor architecture document | Opus | ARCHITECTURE.md (903 lines) |
| 3. Strategize | Attack hypothesis generation | Opus | STRATEGIES.md (120 + 10 supplemental) |
| 4. Investigate | Priority-ordered hypothesis testing | Sonnet/Haiku | 130 finding reports |
| 4.5. Coverage | Verification of component/pattern coverage | Sonnet | COVERAGE.md |
| 5. Report | Final report with combination analysis | Opus | This document |

### Investigation Prioritization

- **Tier 1 (CRITICAL):** 28 strategies, investigated individually by Sonnet agents
- **Tier 2 (HIGH):** 35 strategies, investigated individually by Sonnet agents
- **Tier 3 (MEDIUM-LOW):** 57 strategies, batch-investigated by Haiku agents
- **Supplemental (Novel chains):** 10 strategies derived from confirmed Tier 1 findings

### Verdict Definitions

| Verdict | Meaning |
|---------|---------|
| CONFIRMED | Vulnerability exists and is exploitable in the current codebase |
| POTENTIAL | Vulnerability exists but requires specific conditions or future code changes to exploit |
| NOT VULNERABLE | Hypothesis disproven; mitigations are effective |

### Cross-Skill References

The on-chain Anchor escrow program was separately audited by the Stronghold of Security (SOS) skill. Key SOS finding: the on-chain program is correctly implemented but unconditionally trusts the server authority key for all fund-distribution decisions. This off-chain audit validates whether that trust is warranted. **Conclusion: it is not.**

---

## Scope

### In Scope

| Component | File | LOC | Role |
|-----------|------|-----|------|
| Socket Handler | `server/socket-io/main.js` | ~1,800 | Central authority for all gameplay and financial decisions |
| Auth Middleware | `server/middleware/auth.js` | ~80 | Wallet signature verification, JWT (dead) |
| Guard Middleware | `server/middleware/guards.js` | ~130 | withLock, requireAuth, validatePayload (dead) |
| Escrow Service | `server/services/escrow.js` | ~200 | Anchor program RPC wrapper |
| Solana Service | `server/services/solana.js` | ~300 | Balance checks, settlement, SHOT emission |
| SHOT Token Service | `server/services/shot-token.js` | ~150 | Burn verification, supply tracking |
| Gold Service | `server/services/gold.js` | ~50 | In-match economy |
| Physics Engine | `server/services/physics.js` | ~400 | Server-authoritative projectile simulation |
| Key Management | `server/services/keys.js` | ~60 | Authority keypair loading |
| Telegram Bot | `server/services/telegram.js` | ~100 | Admin notifications |
| User Model | `server/models/User.js` | ~60 | MongoDB schema |
| WalletContext | `client/src/context/WalletContext.js` | ~250 | Wallet adapter, transaction signing |
| Client Screens | `client/src/screens/*.js` | ~1,200 | Lobby, Battle, Prestige UI |
| App Root | `client/src/App.js` | ~300 | Reconnect logic, socket lifecycle |
| Deployment | `render.yaml` | ~40 | Server deployment configuration |
| Dependencies | `package.json` (server + client) | — | npm dependency trees |

### Out of Scope

- On-chain Anchor escrow program (`programs/solshot-escrow/`) — covered by SOS audit
- Infrastructure security (Render, Vercel platform hardening)
- Social engineering vectors
- Physical security

---

## Findings

### F-01: Critical — Chained Wager Bypass (S001)

**Chain:** H001 (balance fail-open) + H004 (no deposit check) + H012 (wagerless rematch)
**Files:** `main.js:980-993`, `main.js:1399-1481`, `main.js:2498-2561`

Three independently confirmed vulnerabilities compose into a complete wager bypass: (1) balance check fails open on RPC error, allowing zero-SOL wallets to enter wagered matches; (2) the `ready` event starts matches without checking deposit status; (3) `playAgainRequest` preserves wager state but creates no new escrow or deposits for the rematch. An attacker can play unlimited wagered matches at zero cost. In dev mode (escrow disabled), the chain is trivially exploitable with no RPC manipulation needed.

**Remediation:** Enforce `ws.deposits[hostId] && ws.deposits[playerId]` check in the `ready` handler before starting any wagered match. Add `verifyBalance()` result as a hard gate (not try/catch fall-through). Create new escrow in `playAgainRequest`.

---

### F-02: Critical — Single Authority Hot-Wallet Fund Drain (H013)

**Files:** `server/services/keys.js`, `programs/solshot-escrow/src/lib.rs`

A single server-side hot-wallet keypair holds unilateral authority over `create_match`, `settle_match`, `cancel_match`, `pause_program`, `unpause_program`, and `update_config`. Compromise enables a two-step drain: (1) call `update_config` to redirect treasury/ops destinations to attacker wallets; (2) settle all active escrows, routing 10% of every pot to attacker. The `update_config` instruction accepts a `new_authority` field with no propose/accept handshake and no timelock, enabling permanent authority transfer in a single transaction.

**Remediation:** Implement multisig authority (2-of-3 minimum). Add timelock on `update_config`. Separate keys for escrow operations vs. program administration. Implement key rotation mechanism.

---

### F-03: Critical — Fabricated Settlement (H024)

**Files:** `server/services/keys.js`, `server/services/escrow.js`

The on-chain `settle_match` instruction unconditionally trusts the server authority for winner selection. The program validates only that authority signed and winner is one of the two registered players — no game outcome, HP total, or proof-of-completion is verified on-chain. A compromised server authority (via H013) can settle any match with an arbitrary winner.

**Remediation:** Implement on-chain game outcome commitment (hash of final game state signed by both clients). Require proof verification before settlement execution.

---

### F-04: Critical — Prestige Tier Infinity (S002)

**Chain:** H005 (burnAmount=0 bypass) + H003 (double-unlock race)
**Files:** `main.js:~1618`, `shot-token.js:~509`

Two vulnerabilities chain into unlimited free prestige advancement: (1) `burnAmount` is client-supplied and `0` passes the `>= expectedRaw` check when `expectedRaw` is `0n`; (2) concurrent `prestigeBurn` events exploit a TOCTOU in the `verifiedBurnTxs` Set — both events pass the `.has()` check before either adds the signature. Result: advance two tiers per single burn, or advance for free with burnAmount=0.

**Remediation:** Extract `burnAmount` from the on-chain parsed transaction (not client payload). Add per-wallet mutex on `prestigeBurn` handler. Validate `burnAmount > 0` before processing.

---

### F-05: Critical — Unauthenticated Socket Events (H016, H017)

**Files:** `main.js` — 6+ event handlers

Six gameplay events (`shoot`, `giveTurn`, `weaponPick`, `weaponChange`, `angleChange`, `powerChange`) execute without any authentication check. The `giveTurn` handler relays arbitrary unsanitized payloads. An unauthenticated socket can manipulate active wagered match outcomes by injecting shoot events, changing weapon selections, or relaying fabricated turn data.

**Remediation:** Add `if (!requireAuth(client, eventName)) return` to all six handlers. Sanitize `giveTurn` payload (whitelist expected fields). Add input validation on angle/power ranges.

---

### F-06: Critical — Signature Replay (H030)

**Files:** `server/middleware/auth.js:39-64`

Authentication signatures are valid within a 5-minute window with no nonce or one-time-use enforcement. An attacker who captures a wallet's authentication signature (via network sniffing, XSS, or shared infrastructure) can replay it within the window to authenticate as that wallet. The `verifiedBurnTxs` Set provides replay protection for burns but not for authentication.

**Remediation:** Implement server-issued nonce (challenge-response). Store used nonces in a Set with TTL. Require nonce in the signed message.

---

### F-07: Critical — Position Teleport Exploit (H047)

**Files:** `main.js` — `positionUpdate` handler

The `positionUpdate` handler accepts 400px deltas at ~30 events/sec, enabling 12,000 px/sec movement (intended: ~320 px/sec). The server physics engine uses the last accepted position as projectile origin. In wagered matches, this directly translates to guaranteed optimal firing positions and maximum damage output.

**Remediation:** Reduce per-event tolerance to match legitimate movement speed (<50px). Implement server-side position tracking based on movement commands only. Remove client position writeback.

---

### F-08: Critical — Self-Pair Wager Farming (S004)

**Chain:** H020 (self-pairing) + H047 (position exploit) + H060 (no queue balance check)
**Files:** `main.js:1213-1389` (joinQueue), `main.js` (positionUpdate)

`joinQueue` performs no balance verification. An attacker with two sockets can self-pair (no self-pairing prevention), exploit position teleportation to guarantee wins, and farm SHOT milestone rewards from fabricated wagered matches. In dev mode, this is costless. In production with escrow, the attacker controls both sides and can manipulate the outcome.

**Remediation:** Add self-pairing prevention (wallet address deduplication in queue). Add balance verification to `joinQueue`. Implement anti-collusion detection for repeated same-wallet-pair matches.

---

### F-09: Critical — Permanent Fund Lock (S008)

**Chain:** H007 (refundWager wrong params) + H012 (phantom wager rematch)
**Files:** `main.js:686-691`, `main.js:2498-2561`

When a player disconnects during LOBBY phase, `refundWager` is called with incorrect parameters and silently fails. The escrow PDA remains active and funded, but the server destroys match state during cleanup. The PDA is now orphaned — the server has lost its roomId-to-PDA association. The only recovery path is Anchor's 48-hour permissionless reclaim window. Combined with H012's phantom rematch, a second fund-lock path exists later in the lifecycle.

**Remediation:** Fix `refundWager` parameter passing. Persist PDA associations to MongoDB for crash recovery. Implement admin tooling for manual escrow recovery.

---

### F-10: Critical — Client NPM Critical Vulnerabilities (H023)

**Files:** `client/package.json`, `client/package-lock.json`

The client dependency tree contains 131 npm vulnerabilities including 3 critical-severity CVEs. The client loads in users' browsers alongside their Solana wallet adapter, making any dependency-chain compromise a direct path to wallet interaction.

**Remediation:** Run `npm audit fix`. Pin critical dependencies. Evaluate and remove unused transitive dependencies.

---

### F-11: Critical — Rate Limiter Never Functional (H021/H054)

**Files:** `main.js:358-445`

The ring-buffer rate limiter uses `Int32Array` to store `Date.now()` timestamps. `Date.now()` has exceeded `2^31` milliseconds since 2001, causing all stored values to overflow via `ToInt32` truncation. Age comparisons always fail, meaning the rate limiter has **never functioned** since the project's creation. All per-event rate limiting is completely disabled.

**Remediation:** Replace `Int32Array` with `Float64Array` or standard JavaScript `Number[]` array. Verify rate limiter functions correctly with current timestamps.

---

### F-12: Critical — Matchmaking Self-Pairing (H020)

**Files:** `main.js:1213-1389`

The `joinQueue` handler has no self-pairing prevention. A single attacker with two sockets (authenticated as different wallets) can match against themselves, controlling both sides of a wagered match. Combined with the queue having no balance verification (H060), this enables zero-cost self-matched farming.

**Remediation:** Track wallet addresses in the queue. Reject queue entries where the wallet already has an active queue entry or active match.

---

### Confirmed HIGH Findings (34 total)

| ID | Title | Category | Key Impact |
|----|-------|----------|-----------|
| H001 | Balance-Check-Fail-Open Wager Bypass | Financial | Zero-SOL wallets enter wagered matches when RPC fails |
| H003 | Prestige Burn Double-Unlock Race | Race/Financial | Two tiers for one burn via concurrent events |
| H004 | Settlement Without Deposit Verification | Financial | Match settles with partial/no escrow funding |
| H005 | burnAmount=0 Prestige Bypass | Input/Financial | Free tier advance with zero-amount burn |
| H007 | refundWager Wrong Parameters | Error/Financial | Silent refund failure, orphaned escrow funds |
| H010 | Deposit-Confirmation Race | Race/Financial | Double `escrowActive` emission from concurrent confirms |
| H012 | Wagerless Rematch | Financial | playAgainRequest creates phantom wager, settlement fails on closed PDA |
| H018 | createWeaponArray Non-Host Manipulation | Auth/Gameplay | Any player overwrites weapon pool |
| H025 | Treasury/Ops UncheckedAccount | Config/Financial | Fee redirection risk via env var tampering |
| H026 | Hardcoded Program ID | Config/Ops | No emergency migration path |
| H027 | Escrow Creation Failure Ignored | Error/Financial | Match proceeds without on-chain escrow |
| H028 | 30s Balance Cache TOCTOU | Financial | Stale balance admits drained wallets |
| H029 | JWT Dead Code | Auth | `verifyToken()` has zero call sites; auth is decorative |
| H031 | No Account-Change Handler | Wallet | Wallet switch during session not detected |
| H032 | window.socket Global XSS | Client/Auth | XSS escalation to wallet signing |
| H036 | Match Result Never Written to DB | Data | No audit trail for settlements |
| H041 | Timing-Unsafe HMAC Comparison | Crypto | Telegram webhook HMAC vulnerable to timing attack |
| H042 | Deprecated confirmTransaction | Chain | No blockhash expiry on deposit confirmation |
| H044 | 2s Retry Insufficient | Chain | Single retry inadequate for Solana slot propagation |
| H046 | RPC Fails-Open Default | Financial | All RPC error paths silently continue |
| H050 | trust proxy Not Configured | Infra | Rate limiter sees internal IPs on Render, bypassed |
| H053 | nodemon in Production | Deps | Dev dependency in production; file-watching overhead |
| H054 | Known CVEs in ws/express/socket.io | Deps | 18 high-severity known vulnerabilities in server deps |
| H060 | joinQueue No Balance Check | Financial | Queue entry without balance verification |
| H067 | giveTurn Unsanitized Relay | Auth/API | Arbitrary payload relayed to opponent |
| H086 | Weapon Purchase Validation | Gameplay | Cost validation gaps in buyWeapon |
| H094 | Coordinated Queue Flooding | DoS | Matchmaking system overwhelmed by automated queue spam |
| H095 | Memory State Divergence After Restart | Data | All protective state (burn replay, rate limits) lost |
| H109 | Escrow Dust Deposit Griefing | Financial | Sub-wager deposits accepted by escrow |
| H116 | Escrow Dust Deposit (duplicate) | Financial | Confirmed from alternative attack angle |
| H118 | Orphaned Escrows on Restart | Financial | Server restart strands active escrow PDAs |
| S003 | Ghost Player DoS | DoS/Financial | Join race creates ghost player, match proceeds broken |
| S007 | Socket Storm Memory Exhaustion | DoS | Unauthenticated event flood exhausts server memory |
| S010 | Join Race + Deposit Confusion | Race/Financial | Ghost player receives deposit request for non-existent match |

---

### Confirmed MEDIUM Findings (18 total)

| ID | Title | Category |
|----|-------|----------|
| H014 | Incomplete Key Zeroing | Key Mgmt |
| H033 | autoConnect Without Auth Gate | Client |
| H034 | Settlement Timeout Too Short | Chain |
| H037 | Dual-Write Inconsistency (MongoDB vs Memory) | Data |
| H038 | Unbounded In-Memory Growth | DoS |
| H040 | 45+ console.* Bypass Pino Logging | Observability |
| H043 | Blockhash Expiry Transaction Stalling | Chain |
| H045 | Fragmented RPC Connection Objects | Config |
| H048 | No CSP on Vercel Deployment | Web |
| H050 | trust proxy Bypass on Render | Infra |
| H051 | txSignature No Format Validation | Input |
| H052 | validatePayload Dead Code | Dead Code |
| H065 | authenticatedWallets Memory Leak | Memory |
| H074 | Unhandled Promise Rejection Patterns | Error |
| H076 | Match Mode Dual Definition Drift | Config |
| H090 | Express Rate Limit Config Issues | Rate Limit |
| H119 | Match ID Collision (32-bit space) | Randomness |
| S009 | Disconnect Timer Infinite Extension | Abuse |

---

### Confirmed LOW Findings (6 total)

| ID | Title | Category |
|----|-------|----------|
| H019 | Room Join Capacity Overflow | Race |
| H022 | maxHttpBufferSize Unbounded | DoS |
| H035 | broadcastRooms Amplification | DoS |
| H039 | Settlement Data in Cleartext Logs | Info Disclosure |
| H049 | styleSrc unsafe-inline | CSP |
| H078 | Dead Code in Standard.js/extraWeapons.js | Dead Code |

---

### Potential Findings (29 total)

| Severity | Count | Key Examples |
|----------|-------|-------------|
| CRITICAL | 1 | H082 (Escrow PDA reuse after match) |
| HIGH | 6 | H002 (double settlement TOCTOU), H077 (weapon array integrity), H083 (turn timer clear), H087 (event ordering), H115 (event storm) |
| MEDIUM | 16 | H061 (no room cap), H075 (wind predictability), H081 (reconnect abuse), H096 (cross-tab confusion), H107 (state machine transitions) |
| LOW | 6 | H062 (room ID collision), H063 (error info leak), H064 (JWT expiry window), H071 (BN import fragility), H104 (clock skew) |

---

### Productive Negatives (31 NOT VULNERABLE)

The following hypotheses were investigated and confirmed as not exploitable, validating that specific mitigations are effective:

| ID | Hypothesis | Why Not Vulnerable |
|----|-----------|-------------------|
| H006 | Turn-timer forfeit bypasses settlement lock | `transitionState()` is synchronous CAS gate |
| H008 | SHOT milestone double-claim | Atomic check-then-award in single event loop tick |
| H009 | SHOT supply cap race | Single-threaded JS prevents concurrent mutation |
| H011 | failedSettlements recovery race | Sequential retry with state checks |
| H055 | Terrain generation race | Synchronous seed generation, no yield point |
| H056 | Shop phase double-trigger | State machine guard prevents double execution |
| H057 | Gold economy TOCTOU | `spendGold` is fully synchronous |
| H058 | Cross-origin WebSocket hijack | Socket.IO requires same-origin by default |
| H085 | Gold overflow/underflow | JavaScript numbers safe for game-scale integers |
| H108 | Terrain seed prediction | 128-bit CSPRNG seed, not 20-bit |
| H114 | Client-predicted physics desync | Server is authoritative for damage |

---

## Attack Trees

### Attack Tree 1: Zero-Cost Wagered Match (Fund Theft)

```
ROOT: Play wagered match at zero cost, steal opponent's wager
│
├── PATH A: RPC Failure Exploitation
│   ├── [H001] Wait for/trigger RPC instability
│   ├── [H001] joinRoom balance check fails open
│   ├── [H004] ready event starts match without deposit check
│   ├── [H047] Use position teleport for guaranteed win
│   └── Settlement attempts on unfunded escrow → opponent loses deposit
│
├── PATH B: Queue Bypass
│   ├── [H060] joinQueue has NO balance check at all
│   ├── [H004] Match starts without deposit verification
│   ├── [H047] Position exploit guarantees win
│   └── Settlement extracts opponent's deposit to attacker
│
└── PATH C: Rematch Exploitation
    ├── Win legitimate first match (or exploit PATH A/B)
    ├── [H012] Trigger playAgainRequest (no new escrow created)
    ├── Rematch plays with phantom wager
    ├── Settlement hits closed PDA → fails
    ├── [H007] refundWager called with wrong params → silent failure
    └── [S008] Funds permanently locked in orphaned escrow
```

### Attack Tree 2: Prestige System Collapse

```
ROOT: Advance to Diamond tier with minimal/zero SHOT burns
│
├── PATH A: Zero-Cost Burn
│   ├── [H005] Send prestigeBurn with burnAmount=0
│   ├── BigInt(0) >= 0n evaluates true
│   └── Tier advances without any burn
│
├── PATH B: Double-Unlock per Burn
│   ├── Burn SHOT tokens once on-chain
│   ├── [H003] Send two concurrent prestigeBurn events
│   ├── Both pass verifiedBurnTxs.has() check (TOCTOU)
│   ├── Both verify on-chain (same valid TX)
│   └── Two tier advances for one burn
│
├── PATH C: Server Restart Replay
│   ├── [H025/H095] Wait for/trigger server restart
│   ├── verifiedBurnTxs Set cleared (in-memory only)
│   └── Re-submit same txSignature for another tier advance
│
└── COMBINED: [S002] burnAmount=0 + double-unlock = 4+ free tiers
```

### Attack Tree 3: Match Outcome Manipulation

```
ROOT: Guarantee win in wagered match
│
├── PATH A: Position Exploitation
│   ├── [H016] No auth required for shoot/weaponPick/angleChange/powerChange
│   ├── [H047] positionUpdate teleports tank at 12K px/sec
│   ├── Move to optimal firing position each turn
│   └── Server physics computes trajectory from spoofed position
│
├── PATH B: Weapon Selection Control
│   ├── [H018] createWeaponArray callable by non-host
│   ├── Attacker selects favorable weapon pool
│   └── Combined with position exploit for guaranteed damage
│
├── PATH C: Unauthenticated Injection
│   ├── [H016] Connect unauthenticated socket
│   ├── Send shoot/giveTurn events to active match
│   └── Influence match outcome without being a participant
│
└── PATH D: Authority Key Compromise
    ├── [H013] Extract server keypair
    ├── [H024] Call settle_match with arbitrary winner
    └── On-chain program trusts authority unconditionally
```

### Attack Tree 4: Denial-of-Service

```
ROOT: Degrade or disable server for all players
│
├── PATH A: Memory Exhaustion
│   ├── [H054/H021] Rate limiter is non-functional (Int32 overflow)
│   ├── [S007] Flood unauthenticated socket events
│   ├── Each connection allocates in-memory buffers
│   └── Server OOM crash → [H095] all protective state lost
│
├── PATH B: Queue Poisoning
│   ├── [H060] joinQueue requires no balance
│   ├── [H094] Automated queue flooding with zero-SOL wallets
│   ├── Legitimate players matched with ghost opponents
│   └── Escrow creation wastes server authority gas fees
│
└── PATH C: Settlement Starvation
    ├── [H022] Event flood saturates withLock mutex
    ├── Settlement operations delayed/starved
    ├── Turn timers expire → forfeit paths triggered
    └── Match outcomes corrupted
```

---

## Remediation Roadmap

### Phase 0: Emergency Fixes (Before Any Real SOL)

These must be resolved before accepting real wagers:

| Priority | Finding(s) | Fix | Effort |
|----------|-----------|-----|--------|
| P0-1 | H013 | Implement multisig authority, rotate compromised key | 2-3 days |
| P0-2 | S001 (H001+H004+H012) | Add deposit verification gate in `ready` handler; hard-fail on balance check error; create new escrow in `playAgainRequest` | 1-2 days |
| P0-3 | H016, H017 | Add `requireAuth` to all 6 unauthenticated event handlers | 2 hours |
| P0-4 | H005, S002 | Extract burnAmount from on-chain TX; add per-wallet mutex on prestige | 4 hours |
| P0-5 | H030 | Implement nonce-based authentication (challenge-response) | 4-6 hours |
| P0-6 | H060 | Add balance verification to `joinQueue` | 1 hour |
| P0-7 | H007, S008 | Fix `refundWager` parameter passing; persist PDA associations | 4 hours |
| P0-8 | H024 | Implement on-chain game outcome commitment | 2-3 days |

### Phase 1: Financial Integrity (Week 1-2)

| Priority | Finding(s) | Fix | Effort |
|----------|-----------|-----|--------|
| P1-1 | H047 | Reduce position tolerance to <50px; server-side position tracking | 1 day |
| P1-2 | H020, S004 | Self-pairing prevention in queue; wallet deduplication | 4 hours |
| P1-3 | H027 | Fail match creation if escrow creation fails | 1 hour |
| P1-4 | H036 | Write match result (winner, tx, settlement) to MongoDB | 4 hours |
| P1-5 | H028 | Remove balance cache for wagered operations; fresh RPC check | 2 hours |
| P1-6 | H042, H044 | Upgrade to `confirmTransaction` with blockhash expiry; increase retry count | 4 hours |
| P1-7 | H118, H095 | Persist critical state (burn replays, failed settlements) to MongoDB | 1 day |
| P1-8 | H025 | Validate treasury/ops accounts on-chain against program config | 4 hours |

### Phase 2: Authentication & Authorization (Week 2-3)

| Priority | Finding(s) | Fix | Effort |
|----------|-----------|-----|--------|
| P2-1 | H029 | Remove dead JWT code or wire it to HTTP routes | 2 hours |
| P2-2 | H018 | Add host-only guard on `createWeaponArray` | 1 hour |
| P2-3 | H031 | Add wallet `accountChanged` listener; invalidate session on switch | 2 hours |
| P2-4 | H032 | Remove signing functions from `window.solWallet`; use message-passing | 4 hours |
| P2-5 | H041 | Replace `===` with `crypto.timingSafeEqual` for HMAC comparison | 1 hour |
| P2-6 | H050 | Configure `trust proxy` for Render deployment | 30 min |

### Phase 3: Infrastructure & Dependencies (Week 3-4)

| Priority | Finding(s) | Fix | Effort |
|----------|-----------|-----|--------|
| P3-1 | H021, H054 | Replace Int32Array with Float64Array in rate limiter | 1 hour |
| P3-2 | H023, H054 | Run `npm audit fix` on both server and client | 2-4 hours |
| P3-3 | H053 | Move nodemon to devDependencies | 10 min |
| P3-4 | H048 | Add Content Security Policy headers on Vercel | 2 hours |
| P3-5 | H022 | Configure `maxHttpBufferSize` on Socket.IO | 30 min |
| P3-6 | H045 | Consolidate RPC connections into single shared instance | 2 hours |
| P3-7 | H052 | Wire `validatePayload` to event handlers or remove dead code | 2-4 hours |
| P3-8 | H038 | Implement connection limits and idle timeouts | 2 hours |

### Phase 4: Defense-in-Depth (Ongoing)

| Priority | Finding(s) | Fix | Effort |
|----------|-----------|-----|--------|
| P4-1 | H040 | Replace 45+ console.* calls with structured Pino logging | 1 day |
| P4-2 | H039 | Redact sensitive data (wallet addresses, amounts) in logs | 4 hours |
| P4-3 | H037 | Resolve dual-write inconsistency for User.stats | 2 hours |
| P4-4 | H051 | Add txSignature format/length validation | 1 hour |
| P4-5 | H076 | Unify MATCH_MODES definition to single source of truth | 2 hours |
| P4-6 | H034 | Increase settlement timeout to accommodate long matches | 1 hour |
| P4-7 | H065 | Clean up authenticatedWallets on disconnect | 1 hour |
| P4-8 | H119 | Increase room ID to 8 bytes; add collision check | 1 hour |

---

## Appendix A: Coverage Report Summary

Coverage verification confirmed **100% checklist coverage** (52/52 items) across:
- 31 server component function groups
- 9 client components
- 4 trust boundaries
- 8 attack pattern categories

Three depth-extension recommendations were noted (state machine exhaustive walkthrough, MongoDB walletAddress injection, Telegram alert suppression) — these are depth issues, not zero-coverage gaps.

## Appendix B: SOS Cross-Reference

The on-chain audit identified that the escrow program unconditionally trusts the server authority. This off-chain audit confirms that trust is not warranted due to:

| On-Chain Trust Assumption | Off-Chain Reality |
|--------------------------|------------------|
| Server authority key is secure | Single hot-wallet, no multisig, no rotation (H013) |
| Server selects correct winner | 6 unauthenticated events manipulate outcome (H016); position spoofing (H047) |
| Deposits confirmed before settlement | `ready` event doesn't check deposits (H004); client-reported confirmation (H010) |
| Match IDs are globally unique | 32-bit space, no collision check (H119) |
| Treasury/ops addresses are legitimate | Passed as UncheckedAccount, sourced from env vars (H025) |

## Appendix C: Finding Index

All 130 findings are documented in individual reports at `.bulwark/findings/H001.md` through `.bulwark/findings/H120.md` and `.bulwark/findings/S001.md` through `.bulwark/findings/S010.md`.

| Verdict | Count |
|---------|-------|
| CONFIRMED | 70 |
| POTENTIAL | 29 |
| NOT VULNERABLE | 31 |

## Appendix D: Static Analysis

| Check | Server | Client |
|-------|--------|--------|
| npm audit vulnerabilities | 30 (4L, 8M, 18H) | 131 (20L, 35M, 73H, 3C) |
| .env files in git | 0 | 0 |
| Secrets in source | 0 | 0 |
| Keypair files in tree | 0 (archived key in _archive/) | 0 |

---

*This report was generated by Dinh's Bulwark v1.0.0 — an adversarial security audit framework for off-chain Solana infrastructure.*
*Audit completed: 2026-02-23*
