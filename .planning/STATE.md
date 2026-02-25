# SolShot — GSD State

## Project Reference

See: .planning/PROJECT.md (updated 24 Feb 2026)
**Core value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Current focus:** v1.2 Launch Readiness — Phase 14 Checklist Alignment & Re-Audit (next after Client Security)

## Current Position

Milestone: v1.2 — Launch Readiness
Phase: 13 of 14 (Client Security) — Complete (1/1 plans done, verified 5/5 must-haves)
Plan: 1 of 1 in current phase
Status: Phase 13 complete — verified by gsd-verifier
Last activity: 25 Feb 2026 — Phase 13 executed and verified

Progress: [█████████░] ~85%


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
- **[11-01] Mongoose Map type for weaponStats — enables dot-notation $inc without per-weapon schema migration**
- **[11-01] Milestone snapshot diff: take Set of milestonesEarned before recordMatchPlayed, diff after — captures ALL milestones earned in match**
- **[11-01] buildWeaponIncs helper: iterates weaponShotsFired to build $inc dot-notation keys for nested Map update**
- **[11-01] client._lastStatsFetch: per-socket rate limit state attached to socket object — 1 req/sec for getStats**
- **[11-02] Post-match tab structure: Result (immediate rewards/stats) / Progress (milestones/prestige bar) / Action (rematch+swap)**
- **[11-02] earnedMilestones[myId] pattern: double-guard on screenData AND myId before array access**
- **[11-02] localStorage 'solshot_escrow_seen': one-time escrow explainer on first wager > 0 click in LobbyScreen**
- **[11-02] opponentLeft Modal outside tab conditionals — critical UX shown regardless of active tab**
- **[11-03] ShareCard forwardRef pattern: exportToClipboard() on ref, offscreen position:absolute left:-9999 (NOT display:none — html2canvas cannot capture hidden elements)**
- **[11-03] X/Twitter share flow: await clipboard copy first, then window.open tweet URL — sequence ensures card is in clipboard before tweet compose opens**
- **[11-03] BarracksScreen three-state render: null=loading / matches===0=CTA / matches>0=stats — empty-state CTA replaces stats grid entirely for new players**
- **[11-03] CombatCard 4-column combat record: Losses changes from statLast to stat (adds right border), K/D added as statLast 4th column**
- **[12-01] window.haptic global — assigned at module load; Phaser scenes use window.haptic (not ES import) since no module system in Phaser scenes**
- **[12-01] iOS Taptic workaround: hidden checkbox with 'switch' attribute — best-effort, silent no-op if DOM unavailable**
- **[12-01] dApp browser detection: isMobile AND (phantom.solana OR solflare) AND NOT regular Safari — targets locked dApp browser UX**
- **[12-01] sessionStorage for portrait/dApp dismissals (not localStorage) — resets each browser session intentionally**
- **[12-03] ShotExplainer is fixed overlay (outside tabs), PrestigeIntro is inline card (inside Progress tab) — separation intentional**
- **[12-03] 500ms delay on ShotExplainer show — lets tab render settle before modal appears**
- **[12-03] opponentId derived from roundWins keys (not scores) — roundWins always has both player IDs in finished match**
- **[12-03] localStorage 'solshot_matches_played' counter incremented on WinScreen/LoseScreen mount — tracks total matches for PrestigeIntro gate**
- **[12-03] localStorage 'solshot_shot_explained' one-time gate — ShotExplainer shown at most once per browser**
- **[12-02] LobbyScreen default mode is 'practice' — new players land on Practice tab, not Quick Match**
- **[12-02] FAQ.js global overlay z-9500, "?" button z-9000 fixed bottom-right — accessible from every screen**
- **[12-02] FAQ accordion: single openSection state (null = all closed), Escape key + backdrop click close**
- **[13-01] GENERATE_SOURCEMAP=false in .env.production — CRA reads at build time, disables all JS/CSS source maps**
- **[13-01] express.json({ type: 'application/csp-report' }) mandatory on /api/csp-report — browsers send non-standard Content-Type**
- **[13-01] CSP report handler uses console.error (server-side monitoring) — SEC-03 targets browser console only**

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

Last session: 2026-02-25T08:00:00Z
Stopped at: Phase 13 complete — 5/5 must-haves verified. Next: Phase 14 Checklist Alignment & Re-Audit
Resume file: None
