# Requirements: SolShot v1.2 — Launch Readiness

**Defined:** 24 Feb 2026
**Core Value:** Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.
**Source:** Master Quality & Launch Checklist audit (24 Feb 2026) — ~110 FAIL items distilled into implementable requirements.

## v1.2 Requirements

Requirements for launch readiness. Each maps to roadmap phases.

### Jupiter Integration

- [x] **JUP-01**: Jupiter Mobile wallet adapter added to wallet list in top position with highlight
- [x] **JUP-02**: Jupiter Price API V3 service fetches live SHOT/SOL price (api.jup.ag, free tier)
- [x] **JUP-03**: Jupiter Terminal SDK embedded in prestige shop for SOL→SHOT swaps
- [x] **JUP-04**: Jupiter Terminal accessible from weapon shop ("Buy SHOT to unlock prestige weapons")
- [x] **JUP-05**: Jupiter Terminal accessible from post-match result screen with price context
- [x] **JUP-06**: Platform fee parameter set on Jupiter Terminal (% routed to SolShot treasury)
- [x] **JUP-07**: CSP connect-src updated for plugin.jup.ag, api.jup.ag, tokens.jup.ag, cache.jup.ag

### User Interface — Global & Landing

- [x] **UI-01**: SHOT price ticker visible in header/top bar across all screens (subtle: "SHOT $0.0042 | +12%")
- [x] **UI-02**: Price ticker handles pre-launch gracefully (shows "N/A" or "Coming Soon" before first swap)
- [x] **UI-03**: Ecosystem logos row on landing screen (Solana, Jupiter, Meteora, Claude)
- [x] **UI-04**: Landing screen three CTAs: Play Free (primary) | Connect Wallet | Learn More
- [x] **UI-05**: Landing screen copy: skill-not-luck tagline, wager range visible, "no download" message
- [x] **UI-06**: Jupiter Mobile highlighted as wallet option on landing ("New to crypto? Start here.")
- [x] **UI-07**: "What is a wallet?" link visible on wallet connect screen for crypto-naive players

### User Interface — Lobby & Weapon Shop

- [x] **UI-08**: Wager tiers show pot size in lobby (e.g., "0.2 SOL pot — winner takes 0.18 SOL")
- [x] **UI-09**: Practice mode framed as onramp ("Practice free. Earn SHOT. Wager when ready.")
- [x] **UI-10**: Weapon shop prestige weapons show burn cost and tier requirement
- [x] **UI-11**: Weapon shop Jupiter Terminal integration ("Buy SHOT to unlock prestige weapons")

### User Interface — Post-Match

- [x] **UI-12**: Post-match screen shows SHOT milestones earned in match
- [x] **UI-13**: Post-match screen shows progress to next prestige tier
- [x] **UI-14**: Post-match X/Twitter share button with pre-filled text ("Just won X SOL on SolShot")
- [x] **UI-15**: Post-match Jupiter Terminal swap CTA with SHOT price context
- [x] **UI-16**: Escrow explainer shown before first wager ("Your SOL is held by a smart contract...")

### Stats & Combat Card

- [x] **STAT-01**: Server persists match stats (wins, losses, SOL won/lost, SHOT earned) to MongoDB on match end
- [x] **STAT-02**: Server serves player stats via `getStats` socket handler with rate limiting
- [x] **STAT-03**: BarracksScreen displays live stats instead of "--" placeholders (matches, win rate, SOL, SHOT)
- [x] **STAT-04**: CombatCard React component renders player stats card with html2canvas PNG export

### Onboarding & Player Journey

- [x] **ONB-01**: Player can reach first practice match in under 60 seconds from landing
- [x] **ONB-02**: SHOT explained when first earned (tooltip/modal: what it is, what it's for)
- [x] **ONB-03**: Prestige system introduced contextually (not front-loaded)
- [x] **ONB-04**: FAQ page accessible from all screens (one tap to help)

### Client Security

- [x] **SEC-01**: Source maps disabled in production build (GENERATE_SOURCEMAP=false)
- [x] **SEC-02**: CSP report-uri configured for violation reporting
- [x] **SEC-03**: Debug console.log statements removed from production code paths

### Mobile Polish

- [x] **MOB-01**: Haptic feedback on mobile for key moments (shot fired, damage received, win/lose)
- [x] **MOB-02**: Telegram share button on post-match screen with pre-filled text
- [x] **MOB-03**: Landscape mode handled gracefully (support or rotation prompt)

### Checklist Alignment & Re-Audit

- [x] **CHK-01**: Checklist updated for design decisions (4 states not 8, 24h timeout not 30-60min, PDA from match_id not pubkeys, 2min deposit not 3min, self-hosted Telegram SDK)
- [x] **CHK-02**: Targeted security re-check on CSP changes and any new socket endpoints — SKIPPED per phase context (deferred)
- [x] **CHK-03**: Full checklist re-audit with scoring — all CRITICAL items must pass

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Match replay / last shot visible (complex new feature)
- **ADV-02**: Leaderboard visible from lobby ("Top players this week")
- **ADV-03**: Email/Telegram notification opt-in after first match
- **ADV-04**: Tutorial or first-match hints (optional, skippable)
- **ADV-05**: Secondary burn sinks (tournaments, cosmetics)
- **ADV-06**: H029 outcome verification / dispute mechanism

### Infrastructure

- **INF-01**: Error monitoring (Sentry or equivalent)
- **INF-02**: Out-of-band security monitoring endpoint
- **INF-03**: SRI update monitor for pinned SDK URLs
- **INF-04**: Horizontal scaling documentation (H060)
- **INF-05**: Database backups configured

## Out of Scope

| Feature | Reason |
|---------|--------|
| Mainnet deployment | Separate operational process, not code milestone |
| Meteora DAMM v2 pool | External, requires mainnet deploy first |
| SquadsX multisig | External operational task |
| Telegram bot (BotFather) | Human task, not code |
| Social media posting | Human task (X, Reddit, Discord) |
| 8-state MongoDB machine | Design decision: 4 states is correct |
| lib.rs modifications | Preserves SOS/DB/BOK audit certifications |
| Secrets manager migration | Deferred to mainnet |
| Match replay | Complex new feature for v1.3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| JUP-01 | Phase 9 | Complete |
| JUP-02 | Phase 9 | Complete |
| JUP-03 | Phase 9 | Complete |
| JUP-04 | Phase 9 | Complete |
| JUP-05 | Phase 9 | Complete |
| JUP-06 | Phase 9 | Complete |
| JUP-07 | Phase 9 | Complete |
| UI-01 | Phase 10 | Complete |
| UI-02 | Phase 10 | Complete |
| UI-03 | Phase 10 | Complete |
| UI-04 | Phase 10 | Complete |
| UI-05 | Phase 10 | Complete |
| UI-06 | Phase 10 | Complete |
| UI-07 | Phase 10 | Complete |
| UI-08 | Phase 10 | Complete |
| UI-09 | Phase 10 | Complete |
| UI-10 | Phase 10 | Complete |
| UI-11 | Phase 10 | Complete |
| UI-12 | Phase 11 | Complete |
| UI-13 | Phase 11 | Complete |
| UI-14 | Phase 11 | Complete |
| UI-15 | Phase 11 | Complete |
| UI-16 | Phase 11 | Complete |
| STAT-01 | Phase 11 | Complete |
| STAT-02 | Phase 11 | Complete |
| STAT-03 | Phase 11 | Complete |
| STAT-04 | Phase 11 | Complete |
| ONB-01 | Phase 12 | Complete |
| ONB-02 | Phase 12 | Complete |
| ONB-03 | Phase 12 | Complete |
| ONB-04 | Phase 12 | Complete |
| MOB-01 | Phase 12 | Complete |
| MOB-02 | Phase 12 | Complete |
| MOB-03 | Phase 12 | Complete |
| SEC-01 | Phase 13 | Complete |
| SEC-02 | Phase 13 | Complete |
| SEC-03 | Phase 13 | Complete |
| CHK-01 | Phase 14 | Pending |
| CHK-02 | Phase 14 | Pending |
| CHK-03 | Phase 14 | Pending |

**Coverage:**
- v1.2 requirements: 39 total
- Mapped to phases: 39
- Unmapped: 0

---
*Requirements defined: 24 Feb 2026*
*Last updated: 25 Feb 2026 — Phase 13 complete*
