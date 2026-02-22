# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 21 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.1 Security Hardening — Phase 5 in progress (Client & Supply Chain Security)

## Current Position

Milestone: v1.1 — Security Hardening
Phase: 5 of 8 — Client & Supply Chain Security (In progress)
Plans: 2/TBD complete
Status: In progress — 05-01 (CS-01 + CS-04) and 05-02 (CS-02 + CS-03) complete
Last activity: 22 Feb 2026 — Completed 05-02-PLAN.md (self-hosted Telegram SDK + CSP meta/Helmet)

Progress: [█████████░] ~65% (Phases 1-5.2 complete; 05-03 + Phases 6-8 remaining)


## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 15

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 3/3 | ~10min | ~3min |
| 02-server-financial-security | 2/2 | ~21min | ~10.5min |
| 03-server-auth-game-integrity | 3/3 | ~5min | ~1.7min |
| 04-secrets-key-management | 3/3 | ~15min | ~5min |
| 04.1-doc-code-alignment | 2/2 | ~8min | ~4min |
| 05-client-supply-chain-security | 2/TBD | ~22min | ~11min |
| 06-token-economy-hardening | 0/TBD | — | — |
| 07-infrastructure-monitoring | 0/TBD | — | — |
| 08-verification-re-audit | 0/TBD | — | — |

## Accumulated Context

### Key Decisions
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- **[v1.0] All v1.0 decisions preserved — see previous STATE.md in git history**
- **[v1.1] Three audits complete: SOS 7C/6H/6M/4L, DB 8C/17H/15M/1L, BOK 24/24 pass 8 gaps**
- **[v1.1] H029 (unverifiable winner oracle / outcome verification) deferred to v1.2 — requires protocol-level design decisions**
- **[v1.1] H060 (horizontal scaling) deferred — not exploitable on single instance**
- **[v1.1] On-chain redesign is Phase 1 because ALL off-chain code depends on the new IDL**
- **[v1.1 Phase 1] GlobalConfig PDA singleton (seeds=[b"config"]) with authority/treasury/ops/is_paused — all instructions validate against config**
- **[v1.1 Phase 1] MatchEscrow SPACE = 168 (added activated_at i64); settlement deadline 1hr; timeout uses activated_at**
- **[v1.1 Phase 1] PROGRAM_ID unchanged at CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD — fresh deploy requires new ID + initializeConfig()**
- **[v1.1 Phase 1] anchor build works on Windows; IDL at server/idl/ matches program; escrow.js passes config PDA to all instructions**
- **[v1.1 Phase 1] Test execution deferred — McAfee LiveSafe blocks solana-test-validator genesis archive extraction (os error 5)**
- **[v1.1 Phase 2 / 02-01] Float64Array for ring buffers — Date.now() ~1.77T overflows Int32Array max 2.1B in 2026**
- **[v1.1 Phase 2 / 02-01] getEscrowState() PDA booleans over getParsedTransaction() — PDA is ground truth after on-chain deposit settles**
- **[v1.1 Phase 2 / 02-01] isEscrowEnabled() guard pattern: wrap all escrow RPC in conditional — dev mode skips verification gracefully**
- **[v1.1 Phase 2 / 02-01] Peek-then-consume queue pattern: queue[0] to validate wager, queue.shift() only after equality confirmed**
- **[v1.1 Phase 2 / 02-02] settleMatch() returns { success: false } on escrow failure — no silent fallthrough to dev-mode (SF-02/H015)**
- **[v1.1 Phase 2 / 02-02] cancelMatchEscrow imported directly from escrow.js in main.js — not re-exported via solana.js**
- **[v1.1 Phase 2 / 02-02] handleSettlementFailure() pattern: immediate cancel attempt + failedSettlements Map retry (60s, max 5 attempts)**
- **[v1.1 Phase 2 / 02-02] Capture room/ws snapshots BEFORE settlement call — removeRoom() destroys live state**
- **[v1.1 Phase 3 / 03-01] joinQueue auth is conditional (wagerAmount > 0) — practice matches stay accessible unauthenticated**
- **[v1.1 Phase 3 / 03-01] fire handler uses inline this.isAuthenticated (not requireAuth) — fireRejected != fireError naming convention**
- **[v1.1 Phase 3 / 03-01] SA-06 scope is escrowDepositConfirm only — only handler with client-supplied roomId targeting own room**
- **[v1.1 Phase 3 / 03-01] SA-05 guard ordering: validateAction then turn ownership — mirrors fire handler pattern**
- **[v1.1 Phase 3 / 03-02] SA-03: deleted terrainPath + getTerrainPath handlers — React client never emits these, only old Phaser codebase did**
- **[v1.1 Phase 3 / 03-02] SA-04: fire handler reads client position within tolerance for trajectory but NEVER writes back to serverPos**
- **[v1.1 Phase 3 / 03-02] SA-04: positionUpdate distance thresholds (400px H, 200px V) are BATTLE-state-only — setup positions may jump legitimately**
- **[v1.1 Phase 3 / 03-03] SA-02: rejoinRoom verifies Ed25519 signature before any state restore — walletAddress alone never trusted on reconnect**
- **[v1.1 Phase 3 / 03-03] SA-02: disconnect timer NOT cleared on failed rejoin verification — legitimate player retains full 30s window**
- **[v1.1 Phase 3 / 03-03] SA-02: signature-first guard in rejoinRoom — no pendingReconnects lookup until signature passes (avoids membership leakage)**
- **[v1.1 Phase 3 / 03-03] SA-02: client retry-once pattern (_retried flag on attemptRejoin) — handles async wallet adapter init on cold page load**
- **[v1.1 Phase 4 / 04-01] KM-03: keys.js is the ONLY module that reads SOLANA_KEYPAIR_PATH/JSON — escrow.js and solana.js import from keys.js**
- **[v1.1 Phase 4 / 04-01] KM-04: bytes.fill(0) zeroes input Uint8Array after Keypair.fromSecretKey() — secret lives only inside Keypair object**
- **[v1.1 Phase 4 / 04-01] initEscrow() always reconstructs provider/program (no short-circuit) — supports SIGHUP key reload in plan 04-02**
- **[v1.1 Phase 4 / 04-01] isEscrowEnabled() uses isKeysReady() from keys.js — single source of truth for key availability**
- **[v1.1 Phase 4 / 04-02] KM-05: SIGHUP on Linux, direct reload on Windows — avoids ENOSYS errors in dev**
- **[v1.1 Phase 4 / 04-02] KM-05: ADMIN_API_KEY safe default — missing env var always returns 401 (never open)**
- **[v1.1 Phase 4 / 04-02] KM-02: render.yaml sync:false for SOLANA_KEYPAIR_JSON, ADMIN_API_KEY, MONGODB_URI**
- **[v1.1 Phase 4 / 04-03] KM-01: BFG Repo-Cleaner purged solshot-dev.json from all 172 commits — zero trace in git log**
- **[v1.1 Phase 4 / 04-03] KM-01: New keypair at ~/.config/solana/solshot-server.json (pubkey: 3bpnmDhG3mv9HCfd9Jt1utAweVvhnJQUzZ74xiJ7oLYj)**
- **[v1.1 Phase 4 / 04-03] KM-01: On-chain authority transfer deferred until devnet SOL available for program redeploy**
- **[v1.1 Phase 4 / 04-03] Repo recloned to SolShot-clean after BFG force push — all SHAs rewritten, old clone invalid**
- **[v1.1 Phase 4.1 / 04.1-01] DCA-01: depositTimers map + DEPOSIT_TIMEOUT_MS=120s; both joinRoom and joinQueue emit paths start timer; escrowDepositConfirm clears it**
- **[v1.1 Phase 4.1 / 04.1-01] DCA-01: depositDeadlineMs field added to escrowDeposit event payload for client countdown rendering**
- **[v1.1 Phase 4.1 / 04.1-01] DCA-03: reconnect_timeout uses roundWins→HP→scores decision chain; 'leave' reason always forfeits unconditionally**
- **[v1.1 Phase 4.1 / 04.1-01] DCA-04: server/services/raydium.js deleted — config-only dead code, zero imports found**
- **[v1.1 Phase 4.1 / 04.1-02] DCA-02: permissionless_reclaim instruction — any wallet, 48h timeout (2x TIMEOUT_SECONDS), caller gets rent**
- **[v1.1 Phase 4.1 / 04.1-02] DCA-02: PermissionlessReclaim has NO config account — intentionally bypasses pause guard (safety net must always work)**
- **[v1.1 Phase 4.1 / 04.1-02] DCA-02: Anchor 0.32.x IDL uses snake_case instruction names; JS SDK converts to camelCase at runtime**
- **[v1.1 Phase 4.1 / 04.1-02] Fresh devnet deploy required after lib.rs changes — program ID will change**
- **[v1.1 Phase 5 / 05-01] CS-01: TX validation scope is program ID + deposit_wager discriminator — wager amount not in instruction data (args: [] in IDL)**
- **[v1.1 Phase 5 / 05-01] CS-01: COMPUTE_BUDGET_PROGRAM_ID whitelisted — server may prepend priority fee instructions**
- **[v1.1 Phase 5 / 05-01] CS-01: suspiciousTx socket event emitted silently on TX validation failure — server-side monitoring without revealing detection**
- **[v1.1 Phase 5 / 05-01] CS-04: window.solWallet assignment deleted — undefined at runtime; signing functions only accessible via React context**
- **[v1.1 Phase 5 / 05-01] CS-04: App.js rejoin uses useWallet() adapter hook directly — only needs publicKey + signMessage, not full SolShot context**
- **[v1.1 Phase 5 / 05-01] CS-04: connected added to SolShotWalletContext value — required after polling removal in WalletDisplay and BarracksScreen**
- **[v1.1 Phase 5 / 05-01] CS-04: WalletDisplay 1s polling interval eliminated — context provides reactive updates**
- **[v1.1 Phase 5 / 05-02] CS-02: Self-hosting Telegram SDK at same origin — SRI on telegram.org CDN rejected (updates in-place, breaks hashes unpredictably)**
- **[v1.1 Phase 5 / 05-02] CS-03: Defense-in-depth CSP: meta tag in index.html (SPA) + Helmet header (API) — both needed; Render may not forward headers**
- **[v1.1 Phase 5 / 05-02] CS-03: INLINE_RUNTIME_CHUNK=false in .env — gitignored file, must be set manually in each dev environment (documented in .env.example)**
- **[v1.1 Phase 5 / 05-02] Build uses react-app-rewired (not react-scripts) — config-overrides.js required for crypto/stream/buffer webpack polyfills**

### Pending Todos

- Run 25-test suite when McAfee exclusion is configured (`anchor test --provider.cluster localnet`)
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Rename SolShot-clean → SolShot (swap directories)
- Update server/.env with SOLANA_KEYPAIR_PATH=~/.config/solana/solshot-server.json

### Blockers/Concerns
- McAfee LiveSafe blocks solana-test-validator on Windows — need folder exclusion or temp disable to run tests
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy (airdrop rate-limited)
- SOS finding H029 (outcome verification / dispute mechanism) is deferred — requires game theory analysis beyond code remediation
- Working directory is now SolShot-clean (not SolShot) — needs directory swap
- Pre-existing build error resolved by using `npm run build` (react-app-rewired) not `npx react-scripts build`

## Session Continuity

Last session: 2026-02-22T23:29:21Z
Stopped at: Phase 5, plan 05-02 complete — CS-02 self-hosted SDK + CS-03 CSP meta/Helmet
Resume file: None (next: Phase 5, plan 05-03 if it exists, else Phase 6)

### Roadmap Evolution
- Phase 4.1 inserted after Phase 4: Doc-Code Alignment (URGENT) — litepaper QA revealed deposit countdown, permissionless reclaim, HP-based forfeit, and dead code gaps between docs and codebase
