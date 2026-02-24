# Roadmap: SolShot v1.2 — Launch Readiness

## Milestones

- v1.0 MVP (pre-GSD) — Phases 1-4 (shipped)
- v1.1 Security Hardening — Phases 1-8 (shipped 2026-02-23)
- **v1.2 Launch Readiness** — Phases 9-14 (in progress)

## Overview

SolShot v1.2 closes all code-addressable gaps from the 280-item Master Quality & Launch Checklist. Jupiter integration ships first (hackathon deadline Feb 25), followed by UI polish across all screens, stats persistence and Combat Card, onboarding and mobile polish, client security hardening, and a final checklist re-audit to confirm launch readiness. 39 requirements across 6 phases.

<details>
<summary>v1.1 Security Hardening (Phases 1-8) — SHIPPED 2026-02-23</summary>

See `.planning/phases/` for completed v1.1 phase details. 25/25 plans complete.
Three security audits (SOS, DB, BOK) all PASS. SECURITY_SUMMARY.md at `.planning/SECURITY_SUMMARY.md`.

</details>

## Phases

- [ ] **Phase 9: Jupiter Integration** — Wallet adapter, Price API, Plugin SDK, platform fee, CSP updates
- [ ] **Phase 10: UI — Global, Landing & Lobby** — Price ticker, ecosystem logos, landing CTAs, lobby polish, weapon shop
- [ ] **Phase 11: Post-Match & Stats Pipeline** — Post-match UX, stats persistence, BarracksScreen, Combat Card
- [ ] **Phase 12: Onboarding & Mobile Polish** — First-match flow, contextual education, FAQ, haptics, sharing
- [ ] **Phase 13: Client Security** — Source maps, CSP report-uri, console.log cleanup
- [ ] **Phase 14: Checklist Alignment & Re-Audit** — Design decision updates, targeted security check, full re-audit

---

## Phase Details

### Phase 9: Jupiter Integration
**Goal:** Players can connect via Jupiter Mobile wallet, see live SHOT price, and swap SOL-to-SHOT directly inside the game via Jupiter Plugin — with platform fees routing to the SolShot treasury.
**Depends on:** Nothing (first v1.2 phase; hackathon deadline Feb 25)
**Requirements:** JUP-01, JUP-02, JUP-03, JUP-04, JUP-05, JUP-06, JUP-07
**Success Criteria** (what must be TRUE):
  1. Jupiter Mobile appears at the top of the wallet adapter list with a visual highlight, and connecting through it works end-to-end
  2. A service fetches SHOT/SOL price from api.jup.ag and returns a formatted price string (handles errors and pre-launch gracefully)
  3. Jupiter Plugin widget opens in the prestige shop, weapon shop, and post-match screen — a SOL-to-SHOT swap completes successfully on devnet
  4. Every Plugin swap routes a platform fee percentage to the SolShot treasury wallet
  5. No CSP violations appear in the browser console when loading Jupiter Plugin or calling the Price API
**Plans:** 3 plans
Plans:
- [ ] 09-01-PLAN.md — CSP updates, Plugin CDN, server-side Price API service
- [ ] 09-02-PLAN.md — Jupiter Mobile wallet adapter with Reown integration
- [ ] 09-03-PLAN.md — Jupiter Plugin component and screen integrations (prestige, shop, post-match)

---

### Phase 10: UI — Global, Landing & Lobby
**Goal:** Every screen communicates what SolShot is, what SHOT is worth, and how to start playing — the landing page converts visitors, the lobby makes wager stakes clear, and the weapon shop drives prestige engagement.
**Depends on:** Phase 9 (JUP-02 price service needed for UI-01/UI-02; JUP-04 Terminal needed for UI-11)
**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05, UI-06, UI-07, UI-08, UI-09, UI-10, UI-11
**Success Criteria** (what must be TRUE):
  1. A SHOT price ticker is visible in the header on every screen, showing live price from Phase 9's price service — and displays "N/A" gracefully before the token has any swaps
  2. The landing screen shows ecosystem partner logos (Solana, Jupiter, Meteora, Claude), three distinct CTAs (Play Free / Connect Wallet / Learn More), skill-based tagline, wager range, "no download" messaging, and highlights Jupiter Mobile as the recommended wallet
  3. The wallet connect screen includes a "What is a wallet?" help link for crypto-naive players
  4. Lobby wager tiers display pot size and winner payout (e.g., "0.2 SOL pot — winner takes 0.18 SOL"), and Practice mode is framed as an onramp ("Practice free. Earn SHOT. Wager when ready.")
  5. Weapon shop prestige weapons show burn cost and tier requirement, with a Jupiter Terminal integration for buying SHOT
**Plans:** TBD

---

### Phase 11: Post-Match & Stats Pipeline
**Goal:** After a match, players see what they earned, how close they are to the next prestige tier, can share results socially, can swap tokens — and the Barracks screen shows real lifetime stats backed by MongoDB persistence.
**Depends on:** Phase 9 (JUP-05 Terminal for UI-15), Phase 10 (UI foundation)
**Requirements:** UI-12, UI-13, UI-14, UI-15, UI-16, STAT-01, STAT-02, STAT-03, STAT-04
**Success Criteria** (what must be TRUE):
  1. The post-match screen shows SHOT milestones earned in the match, progress toward the next prestige tier, and an escrow explainer before a player's first wager
  2. An X/Twitter share button generates a pre-filled tweet with match results, and a Jupiter Terminal swap CTA shows current SHOT price context
  3. Match stats (wins, losses, SOL won/lost, SHOT earned) are persisted to MongoDB on every match end — verified by checking the database after a match
  4. The BarracksScreen displays live stats (matches played, win rate, SOL net, SHOT earned) instead of "--" placeholders, served via a rate-limited `getStats` socket handler
  5. A CombatCard React component renders the player's stats as a shareable card, exportable as a PNG via html2canvas
**Plans:** TBD

---

### Phase 12: Onboarding & Mobile Polish
**Goal:** A new player can go from landing to first practice match in under 60 seconds, learns about SHOT and prestige naturally through play, can find help anytime — and mobile players get tactile feedback and can share to Telegram.
**Depends on:** Phase 10 (landing page), Phase 11 (post-match screens)
**Requirements:** ONB-01, ONB-02, ONB-03, ONB-04, MOB-01, MOB-02, MOB-03
**Success Criteria** (what must be TRUE):
  1. A new player can reach their first practice match in under 60 seconds from the landing page (timed manually)
  2. When a player first earns SHOT, a tooltip or modal explains what it is and what it can be used for — prestige is introduced contextually (not front-loaded at landing)
  3. An FAQ page is accessible from every screen via a single tap/click
  4. Mobile devices receive haptic feedback on key moments (shot fired, damage received, win/lose) and handle landscape mode gracefully (support it or show a rotation prompt)
  5. A Telegram share button appears on the post-match screen with pre-filled text
**Plans:** TBD

---

### Phase 13: Client Security
**Goal:** The production build exposes no debugging information — no source maps, no console.log output, and CSP violations are reported to a monitoring endpoint.
**Depends on:** Phases 9-12 (all feature work complete, so CSP covers everything)
**Requirements:** SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. Production build has GENERATE_SOURCEMAP=false and no .map files are served
  2. CSP header includes a report-uri directive pointing to a violation reporting endpoint
  3. No console.log statements execute in production code paths (verified by searching source and checking browser console)
**Plans:** TBD

---

### Phase 14: Checklist Alignment & Re-Audit
**Goal:** The Master Quality & Launch Checklist reflects all design decisions made during development, a targeted security re-check confirms CSP changes and new endpoints are safe, and a full re-audit scores the checklist with all CRITICAL items passing.
**Depends on:** Phases 9-13 (everything must be complete for final audit)
**Requirements:** CHK-01, CHK-02, CHK-03
**Success Criteria** (what must be TRUE):
  1. The checklist is updated to reflect design decisions (4 states not 8, 24h timeout not 30-60min, PDA from match_id not pubkeys, 2min deposit not 3min, self-hosted Telegram SDK) — items previously marked FAIL for these reasons now show PASS or DESIGN DECISION
  2. A targeted security re-check covers all CSP changes from Phases 9-13 and any new socket endpoints — no new vulnerabilities introduced
  3. A full checklist re-audit is run with scoring — all items tagged CRITICAL pass, and the overall score is documented
**Plans:** TBD

---

## Progress

**Execution Order:** 9 -> 10 -> 11 -> 12 -> 13 -> 14

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 9. Jupiter Integration | 0/3 | Planned | - |
| 10. UI — Global, Landing & Lobby | 0/TBD | Not started | - |
| 11. Post-Match & Stats Pipeline | 0/TBD | Not started | - |
| 12. Onboarding & Mobile Polish | 0/TBD | Not started | - |
| 13. Client Security | 0/TBD | Not started | - |
| 14. Checklist Alignment & Re-Audit | 0/TBD | Not started | - |

**Total:** 0/3+ plans complete

---
*Roadmap created: 24 Feb 2026*
*Last updated: 24 Feb 2026*
