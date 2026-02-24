# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 24 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.2 Launch Readiness — Phase 10 UI Polish (next phase after Jupiter complete)

## Current Position

Milestone: v1.2 — Launch Readiness
Phase: 10 of 14 (UI Global Landing Lobby) — In progress
Plan: 01 complete (10-01-PLAN.md done)
Status: In progress
Last activity: 24 Feb 2026 — Completed 10-01-PLAN.md

Progress: [███░░░░░░░] ~9%


## Performance Metrics

**Velocity:**
- v1.0 plans completed: 15 (across 4 phases)
- v1.1 plans completed: 25 (across 9 phases including 4.1)

**By Phase (v1.1):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-on-chain-program-redesign | 3/3 | ~10min | ~3min |
| 02-server-financial-security | 2/2 | ~21min | ~10.5min |
| 03-server-auth-game-integrity | 3/3 | ~5min | ~1.7min |
| 04-secrets-key-management | 3/3 | ~15min | ~5min |
| 04.1-doc-code-alignment | 2/2 | ~8min | ~4min |
| 05-client-supply-chain-security | 2/2 | ~22min | ~11min |
| 06-token-economy-hardening | 2/2 | ~5min | ~2.5min |
| 07-infrastructure-monitoring | 2/2 | ~8min | ~4min |
| 08-verification-re-audit | 4/4 | ~30min | ~7.5min |

## Accumulated Context

### Key Decisions
- Server-authoritative everything (physics, economy, match state)
- Devnet deploy done (escrow + SHOT token) — mainnet is final step
- 90/7/3 BPS split hardcoded in escrow program
- SHOT mint authority burned (no changes possible)
- MongoDB Atlas M0 free tier for stats persistence
- **[v1.1] Three audits complete: SOS, DB, BOK — all PASS**
- **[v1.1] H029 (outcome verification) deferred — requires protocol-level design**
- **[v1.2] Do NOT modify lib.rs — preserves audit certifications**
- **[v1.2] Jupiter integration is hackathon-critical — Feb 25 deadline**
- **[v1.2] Many checklist "failures" are design decisions — update checklist text, not code**
- **[v1.2] Security re-check only needed for CSP changes and new socket endpoints**
- **[09-01] Use api.jup.ag/price/v3 (not deprecated lite-api.jup.ag); requires free API key from portal.jup.ag**
- **[09-01] CSP frame-src changed from none→plugin.jup.ag; Plugin may use iframes internally**
- **[09-01] Price service returns null gracefully when API key missing (dev-mode safe)**
- **[09-02] useWrappedReownAdapter returns {reownAdapter, jupiterAdapter} — not a direct adapter**
- **[09-02] React hooks must be called unconditionally — gate wallets list not hook call**
- **[09-02] DISABLE_ESLINT_PLUGIN=true in client/.env (gitignored) — pre-existing ESLint webpack worker bug**
- **[09-02] REACT_APP_REOWN_PROJECT_ID required for Jupiter Mobile to appear — without it adapter hidden gracefully**
- **[09-03] JupiterSwap uses module-level singleton (jupiterInitialized) — Plugin init() called once regardless of screens visited**
- **[09-03] referralFee = 50 bps (0.5%) — platform fee env-driven, gracefully absent without REACT_APP_JUPITER_REFERRAL_ACCOUNT**
- **[09-03] shotPrice socket pattern: emit getShotPrice on mount, on('shotPrice') with cleanup — reusable across screens**
- **[10-03] formatWagerWithPayout: pot = amount*2, winner payout = pot*0.90 — mirrors escrow 90/7/3 BPS split**
- **[10-03] PRESTIGE_WEAPON_META: module-level map (weapon ID -> tierName/burnCost/color) built from PRESTIGE_TIERS — authoritative prestige lookup**
- **[10-03] String concatenation (not template literals) in JSX — avoids Collider.js ESLint webpack worker bug**
- **[10-02] PARTNERS module-level constant array for ecosystem badges — CSS text badges only, no external images, no CSP changes**
- **[10-02] LEARN MORE href="#" placeholder — update to litepaper URL when published**
- **[10-02] partnerBadge(color) function style factory — dynamic inline style object keyed on brand color hex**
- **[10-01] ShotPriceTicker ready-gate: render null until first shotPrice socket event — prevents N/A flash on initial load**
- **[10-01] TopBar three-column flex (not absolute title): flexShrink left/right, flex:1 center — ticker + title centered without overlap**
- **[10-01] WalletDisplay help link gated on !compact — visible only on MenuScreen, hidden in TopBar**

### Pending Todos

- Run 25-test suite when McAfee exclusion is configured
- Fresh devnet deploy with new program ID + initializeConfig() call
- On-chain authority transfer to new keypair (needs devnet SOL)
- Rename SolShot-clean to SolShot (swap directories)

### Blockers/Concerns
- McAfee blocks solana-test-validator on Windows
- Devnet wallet at 0.97 SOL — need ~2.12 SOL for program deploy
- Working directory is SolShot-clean (not SolShot) — needs directory swap

## Session Continuity

Last session: 2026-02-24T13:52:00Z
Stopped at: Completed 10-01-PLAN.md (ShotPriceTicker + TopBar flex layout + WalletDisplay help link)
Resume file: None
