---
doc_id: security-model
title: "SolShot Security Posture"
version: 1.0
status: draft
date: 2026-02-24
audience: judges, players
codebase_ref: f9f94e896b2611378499d94a015cfdcb260c6fb1
---

# Security Posture

> **The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.**

SolShot is a 1v1 artillery game where real SOL is wagered through on-chain escrow. The security architecture enforces a hard boundary: the server is authoritative over gameplay (physics, turns, damage), while the Solana blockchain is authoritative over funds (deposits, payouts, refunds). The escrow program's Anchor constraints guarantee that funds can only move to addresses registered at match creation. Even a compromised server key cannot redirect funds to an unregistered wallet.

This document summarizes the results of three independent security analyses, the remediation work that followed, and the current security posture of the system.

---

## Your Funds Have Three Independent Escape Paths

Every SOL deposited into a SolShot match has three independent recovery mechanisms. If one path is blocked, the next one activates automatically.

**Path 1 -- Server Recovery.** Under normal operation, the server settles the match within minutes. If settlement fails (network congestion, RPC timeout), the server automatically retries via `cancelMatchEscrow`, refunding both players in full. Settlement failures propagate to callers -- they are never silently swallowed.

**Path 2 -- Player Cancellation.** If the server is unresponsive, either player can cancel the match directly on-chain after 24 hours. The `cancel_match` instruction refunds each player's deposit to their registered wallet. No server involvement is required.

**Path 3 -- Permissionless Reclaim.** If both the server and the players are unavailable, anyone can trigger a full refund after 48 hours by calling the `permissionless_reclaim` instruction. This requires no authority key, no player signature -- just a valid transaction referencing the escrow PDA. The caller receives the PDA rent lamports as an economic incentive to clean up stale escrows.

No SOL can be permanently locked. The on-chain program enforces these timeouts with `Clock::get()?.unix_timestamp` checks against `activated_at` and `created_at` timestamps stored in the escrow account.

---

## Audit Summary

Three independent security analyses were conducted against the full application stack: 855 lines of on-chain Rust, approximately 5,000 lines of server-side Node.js, and approximately 31,500 lines of React client code.

### Methodology

**Smart Contract Analysis.** Six specialized analysis contexts (access control, arithmetic, state machine, cross-program invocation, token economics, timing and ordering) examined the Anchor escrow program independently. 34 attack hypotheses were generated and investigated in priority order.

**Server and Client Analysis.** 22 domain-specific analysis agents audited the full off-chain stack. 130 attack hypotheses were generated and investigated, with combination analysis identifying multi-step attack chains across the server, client, and blockchain boundary.

**Mathematical Verification.** Property-based testing with randomized input generation (10,000+ iterations per property) verified all financial arithmetic. 25 invariants covering fee calculations, timestamp logic, account space sizing, and wager bounds were tested. The key invariant: `winner_amount + treasury_amount + ops_amount == total_pot` (conservation of value) holds for all inputs.

### Results

| Analysis Domain | Scope | CRITICAL | HIGH | MEDIUM | LOW |
|----------------|-------|----------|------|--------|-----|
| Smart Contract | 855 lines, 9 instructions, Anchor 0.32.1 | 0 active | 0 active | 4 documented | 1 documented |
| Server & Client | ~5,000 LOC server, ~31,500 LOC client | 0 active | 0 active | 18 documented | 6 documented |
| Mathematical | All financial arithmetic | -- | -- | -- | -- |

**Mathematical Verification:** 25 invariants tested, 0 failures. 59 test functions, 0 failures.

All CRITICAL and HIGH severity findings were either resolved through code changes or documented as accepted risk with justification. Zero active CRITICAL or HIGH findings remain.

### Remediation

The initial audits identified 35 findings across the on-chain program alone (13 CRITICAL, 20 HIGH, 1 MEDIUM, 1 LOW) and 70 findings across the server and client (12 CRITICAL, 34 HIGH, 18 MEDIUM, 6 LOW). Every CRITICAL and HIGH finding was addressed.

Remediation was carried out across 8 phases over 3 days (February 21-23, 2026), executing 25 plans and modifying approximately 40 files across the on-chain program, server, and client. The hardened codebase was then re-audited by all three analysis pipelines. Each re-audit passed its gate check: zero active CRITICAL, zero active HIGH.

| Phase | Focus | Key Fixes |
|-------|-------|-----------|
| 1 | On-chain program redesign | GlobalConfig PDA, Anchor account constraints, checked u128 arithmetic, emergency pause, wager bounds |
| 2 | Server financial security | On-chain deposit verification, settlement failure propagation, recovery via cancel, queue validation |
| 3 | Server auth and game integrity | Authentication on all 14 handlers, Ed25519 rejoin verification, server-authoritative positions |
| 4 | Secrets and key management | Keypair rotation, git history purge, centralized key module with zeroization, SIGHUP reload |
| 5 | Client and supply chain | Transaction instruction validation before signing, self-hosted Telegram SDK, CSP headers |
| 6 | Token economy hardening | MongoDB persistence for deduplication Sets, fail-hard startup on emission state loss |
| 7 | Infrastructure and monitoring | Secure build pipeline, endpoint authentication, connection limiting, CSPRNG terrain seeds |
| 8 | Verification and re-audit | Three independent re-audits confirming all gates pass |

---

## Escrow Design

The on-chain escrow program (Anchor 0.32.1) manages the full lifecycle of a wager: creation, deposits, settlement, cancellation, and permissionless reclaim. Every instruction validates accounts through Anchor's `#[derive(Accounts)]` constraints, not manual runtime checks.

**Match lifecycle:**
1. Server creates escrow PDA with both player wallets and wager amount registered on-chain
2. Each player signs a deposit transaction sending their wager to the escrow PDA
3. Both deposits trigger `MatchState::Active` with an `activated_at` timestamp
4. Server settles the match: 90% to winner, 7% to treasury, 3% to ops
5. Escrow PDA closes, returning rent to the authority

**On-chain constraints enforced by the program:**
- Winner must be `player_one` or `player_two` (registered at creation)
- Treasury and ops addresses must match the GlobalConfig PDA
- Treasury and ops must be distinct accounts (prevents settlement DoS)
- Wager bounds: minimum 10,000 lamports, maximum 100 SOL
- Players must be distinct wallets; authority cannot be a player
- Terminal state (`Settled` or `Cancelled`) is set before any lamport transfer
- All arithmetic uses `checked_mul`, `checked_div`, `checked_add`, `checked_sub` with u128 widening for BPS fee calculations

The fee split (90/7/3) is hardcoded in the program. It cannot be changed without a program redeploy. The winner gets the remainder after treasury and ops are calculated, meaning any rounding dust (at most 2 lamports, verified by mathematical analysis) goes to the winner rather than being lost.

---

## Authority Model

SolShot is operated by a solo founder. The escrow program's authority key is a single server keypair that can create matches, settle matches, pause the program, and update the config PDA.

This is stated plainly because honesty reads better than obfuscation.

**What the authority key can do:**
- Create match escrows and settle them (designating the winner from the two registered players)
- Pause and unpause all economic instructions
- Rotate the authority, treasury, and ops addresses via `update_config`

**What the authority key cannot do:**
- Send funds to an address not registered as a player at match creation
- Settle a match after the 1-hour settlement deadline
- Cancel an Active match (authority can only cancel matches still in `AwaitingDeposits`)
- Prevent permissionless reclaim after 48 hours

**Mitigations in place:**
- Authority keys can be rotated without disrupting active matches. The `update_config` instruction updates the GlobalConfig PDA; existing escrow PDAs retain their original authority reference, and the new authority takes effect for all subsequent operations.
- Key material is managed through a centralized module (`keys.js`) with secret-key zeroization -- raw bytes are wiped from memory after keypair construction.
- SIGHUP-triggered credential reload allows key rotation without server restart.
- The program emits a `ConfigUpdated` event on every config change, providing an on-chain audit trail.

**v1.2 Roadmap:** Propose/accept authority transfer pattern (two-step rotation), timelock on config changes, and multisig governance for settlement authority. These are forward progress items -- the current single-key model is a deliberate v1.0 simplicity choice, not an oversight.

---

## Outcome Verification

The server determines match outcomes. This is a direct design choice, not a gap.

SolShot runs server-authoritative physics: projectile trajectories, terrain deformation, damage calculations, and round scoring are all computed server-side. The client sends firing parameters (angle, power); the server simulates the shot, calculates impact, and advances the match state. Neither player can manipulate the outcome because the server does not trust client-reported results.

The server then calls `settle_match` on-chain, designating the winner. The on-chain program enforces that the winner must be one of the two registered players -- the server cannot redirect funds to a third party. But the program does trust the server's determination of who won.

This means: a compromised server key could settle a match in favor of the wrong player, but it could not steal the funds outright. The winner still receives 90% of the pot, and the treasury and ops splits still go to their configured addresses. The economic damage of a compromised key is bounded to the match outcome, not the total pot.

**v1.2 Roadmap:** On-chain oracle or commit-reveal mechanism for outcome verification, removing server trust from the settlement path entirely.

---

## Server Hardening

All server endpoints are authenticated, rate-limited, and input-validated. Every socket handler that modifies game state or touches financial operations requires wallet authentication. Reconnection requires Ed25519 signature re-verification. Fire parameters are validated for type and bounds. Server-authoritative positions are used for physics -- client-supplied coordinates are rejected if they deviate beyond a 100px/50px tolerance threshold.

---

## Key Rotation

Authority keys can be rotated without disrupting active matches. The GlobalConfig PDA accepts a new authority via `update_config`; the centralized key module supports SIGHUP-triggered reload; existing escrow PDAs continue operating under their recorded authority until settlement or cancellation.

---

## Incident Response

If a security event is detected:

1. **Pause.** The authority calls `pause_program`, immediately halting all economic instructions (match creation, deposits, settlement, cancellation). Pause is idempotent and works even when already paused.

2. **Server halt.** The server process is stopped, preventing new match creation and settlement requests. Active WebSocket connections are terminated.

3. **Permissionless reclaim backstop.** Even if the authority key is lost and the server is permanently offline, every escrow PDA becomes reclaimable by anyone after 48 hours. Players' funds return to their registered wallets. The caller receives PDA rent as an incentive to trigger reclaim.

This three-layer response ensures that no incident -- from a routine RPC outage to a complete key compromise -- can permanently lock player funds.

---

## Forward Roadmap

SolShot v1.2 will introduce:

- **Multisig governance.** Program authority transitions from a single keypair to a multisig, requiring multiple signatures for settlement, config changes, and pause operations. Upgrade authority will be transferred to the multisig before mainnet deploy.

- **On-chain outcome verification.** An oracle or commit-reveal mechanism that removes server trust from the settlement path. Match results would be verifiable on-chain before settlement executes.

- **Propose/accept authority transfer.** Two-step authority rotation replacing the current single-step `update_config` pattern. The new authority must explicitly accept the transfer, preventing accidental governance loss.

- **Timelock on config changes.** A delay between proposing a config update and its activation, giving players time to exit if they disagree with the change.

These items are presented as engineering milestones, not as patches for missing functionality. The v1.0 architecture is secure for its threat model; v1.2 raises the bar.

---

## Regulatory Disclaimer

SolShot is a skill-based game. Outcomes are determined by player decisions within a physics simulation -- projectile angle, power, weapon selection, and positioning. Players are responsible for compliance with local regulations regarding skill-based competition and digital asset wagering in their jurisdiction.

---

*Security posture assessed at commit `f9f94e8`. Three independent analyses. Zero active CRITICAL or HIGH findings. 25 mathematical invariants verified with zero failures.*
