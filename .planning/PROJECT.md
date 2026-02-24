# SolShot — Project Document

## What This Is

Browser-based 1v1 artillery combat game on Solana where players wager real SOL. Matches are settled trustlessly via on-chain escrow. The SHOT token drives a deflationary prestige economy — earn through combat, burn to unlock exclusive weapons.

## Core Value

Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## Tech Stack
- **Client:** React 18 + Phaser 3 (CRA with react-app-rewired), @solana/wallet-adapter
- **Server:** Express + Socket.IO (ES modules), Mongoose/MongoDB
- **Blockchain:** Solana (Anchor 0.32.1), SPL Token
- **Deploy:** Vercel (client) + Render (server) + MongoDB Atlas
- **Domain:** solshot.gg

## Requirements

### Validated

- Server-authoritative physics for all 20 weapons (15 base + 5 prestige)
- HP system (250 HP per round)
- Gold economy (1000G start, +15G/HP damage, +200G kill, +300G round win)
- Match modes: Practice/Quick Match/Duel/High Roller with server-enforced constraints
- BO1/BO3/BO5 with gold+weapon carryover between rounds
- Wind physics ([-60,+60] per round)
- Destructible terrain (1D heightmap, server-authoritative deformation)
- Disconnect/reconnect (30s window, wallet-keyed rejoin, 60s turn timer)
- Escrow program (Anchor, PDA-based, 90/7/3 BPS split, 24h timeout)
- SHOT token (10M supply, 9 decimals, mint authority burned, devnet)
- Prestige burns (SPL burn → tier unlock, on-chain verification)
- Persistent stats (MongoDB User model, wallet-linked)
- Combat Card (standalone HTML — needs React integration)
- Win/Lose hero screens
- PWA icons, favicon, branding assets (54 images)
- Security: helmet, rate-limit, CSPRNG, turn validation, async mutex, CSP, TX validation
- Three security audits completed: SOS (contract), DB (server+client), BOK (math) — all PASS

### Active

- [ ] Jupiter Mobile wallet adapter (top of wallet list)
- [ ] Jupiter Price API V3 — live SHOT/SOL price across all screens
- [ ] Jupiter Terminal SDK — SOL→SHOT swaps in prestige shop, weapon shop, post-match
- [ ] SHOT price ticker in global header
- [ ] Landing screen polish (CTAs, ecosystem logos, copy)
- [ ] Post-match improvements (SHOT milestones, prestige progress, share buttons, swap CTA)
- [ ] Live stats pipeline (server persist → socket serve → BarracksScreen display)
- [ ] Combat Card React component with export
- [ ] Onboarding flows ("What is a wallet?", escrow explainer, SHOT explainer, FAQ)
- [ ] Client security polish (source maps, CSP report-uri)
- [ ] Mobile polish (haptic feedback, Telegram share)
- [ ] Checklist alignment (design decision updates) + targeted re-audit

### Out of Scope

- **Mainnet deployment** — separate process after code milestone, requires SOL for deploy fees
- **Meteora DAMM v2 pool** — external, requires mainnet deploy first
- **SquadsX multisig setup** — external operational task
- **Telegram bot activation** — human task (BotFather registration)
- **Social media posting/community** — human tasks (X, Reddit, Discord)
- **Demo video recording** — human task
- **Hackathon submission form** — human task at matrix.playsolana.com
- **Match replay system** — complex new feature, deferred to v1.3
- **lib.rs modifications** — preserves SOS/DB/BOK audit certifications
- **Secrets manager migration** — deferred to mainnet operational readiness
- **Error monitoring (Sentry)** — external service setup
- **Horizontal scaling** — H060 deferred, single server acceptable at launch

## Context

### Previous Milestones

- **v1.0 (pre-GSD):** Core game, escrow, SHOT token, prestige burns, art assets, deployment config
- **v1.1 Security Hardening:** 8 phases, 25 plans. Three security audits (SOS, DB, BOK) all PASS.

### Master Checklist Audit (24 Feb 2026)

Full audit of 280-item Master Quality & Launch Checklist revealed ~153 PASS / ~110 FAIL / ~95 PARTIAL.
Many "failures" are design decisions (4 states, 24h timeout, PDA seeds), not bugs.

### Hackathon

Jupiter & Jupiter Mobile track. Deadline: February 25, 2026.

## Constraints

- **Security preservation:** Do NOT modify lib.rs, guards.js, or core auth handlers
- **Hackathon deadline:** Jupiter integration is time-critical (Feb 25)
- **Devnet only:** All blockchain features on devnet until mainnet deploy
- **Build tooling:** react-app-rewired + config-overrides.js for polyfills
- **Codebase location:** `C:\Users\johnk\SolShot-clean`

## Current Milestone: v1.2 — Launch Readiness

**Goal:** Close all code-addressable gaps from the Master Checklist, Jupiter integration first for hackathon, followed by UI polish, stats, onboarding, security, and re-audit.

**Target features:**
1. Jupiter integration (wallet adapter, Price API V3, Terminal SDK, platform fee)
2. UI polish (price ticker, ecosystem logos, landing CTAs, post-match, share buttons)
3. Stats pipeline & Combat Card (server persist, socket serve, live display, export)
4. Onboarding flows (wallet explainer, escrow explainer, SHOT explainer, FAQ)
5. Client security polish (source maps, CSP report-uri)
6. Mobile polish (haptic feedback, Telegram share)
7. Checklist alignment + targeted security re-audit

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Server-authoritative physics | Prevent cheating | ✓ Good |
| 4-state escrow (not 8) | Simpler, covers all cases | ✓ Good — update checklist |
| 24h timeout (not 30-60min) | Generous for network issues | ✓ Good — update checklist |
| PDA from match_id (not pubkeys) | Simpler derivation | ✓ Good — update checklist |
| 2min deposit (not 3min) | Faster match start | ✓ Good — update checklist |
| Self-hosted Telegram SDK | CDN updates in-place, breaks SRI | ✓ Good — update checklist |
| Do NOT touch lib.rs in v1.2 | Preserves 3 audit certifications | — Pending |
| Jupiter Terminal for in-game swaps | Hackathon requirement + revenue | — Pending |

---
*Last updated: 24 Feb 2026 after v1.2 milestone start*
