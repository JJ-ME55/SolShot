# SolShot — Project Document

## Core Value
Browser-based 1v1 artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## Tech Stack
- **Client:** React 18 + Phaser 3 (CRA with react-app-rewired), @solana/wallet-adapter
- **Server:** Express + Socket.IO (ES modules), Mongoose/MongoDB
- **Blockchain:** Solana (Anchor 0.32.1), SPL Token
- **Deploy:** Vercel (client) + Render (server) + MongoDB Atlas
- **Domain:** solshot.gg

## Validated Requirements (shipped)
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
- Combat Card (exportable stats card via html2canvas)
- Win/Lose hero screens
- PWA icons, favicon, branding assets
- Security: helmet, rate-limit, CSPRNG, turn validation, async mutex

## Current Milestone: v1.0 — Mainnet Launch Readiness

**Goal:** Audit weapon visuals against original repo, complete remaining TODO items, verify litepaper compliance, conduct security review, E2E testing, and deploy to mainnet.

**Target features:**
1. Weapon visual audit (client code vs converted-repo.txt reference)
2. TODO completion (remaining unchecked items from master TODO)
3. Litepaper compliance check (code vs documented specs)
4. Security audit (SOS check + pre-launch documentation)
5. End-to-end testing (comprehensive manual + automated)
6. Mainnet deployment (escrow + SHOT token + production infrastructure)

## Active Requirements
See REQUIREMENTS.md

---
*Last updated: 19 Feb 2026*
