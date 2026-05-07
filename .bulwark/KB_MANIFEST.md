# DB KB-MANIFEST — Audit #2

Generated 2026-05-07 by `/DB:scan`.

## Detected Configuration

- **Languages:** Node.js (ES modules), JavaScript (CRA), JSX
- **Frameworks:** Express, Socket.IO 4, Telegraf, React 18, Phaser 3.55, Mongoose
- **Databases:** MongoDB
- **Wallet stack:** Privy embedded wallets (migrated from Dynamic per project memory; `2026-05-04` decision)
- **Tier:** **deep** (150 files / 51,241 LOC, multi-service architecture, Telegram bot + group-chat lifecycle + on-chain interactions)
- **Components:**
  - Backend API (Express + Socket.IO at `server/`)
  - Frontend dApp (React PWA at `client/`)
  - Telegram bot (Telegraf in `server/services/bot.js` + `server/services/groupchat/`)
  - On-chain integration (Anchor 0.32.1 wrappers in `server/services/escrow.js`, `escrow-v2.js`)
  - Async match scheduler (`server/services/groupchat/scheduler.js`, `lobbyWatchdog.js`)
  - SHOT token integration (`server/services/shot-token.js`)
  - Trophy/challenge image rendering (`server/services/challenge/` ~14 files NEW since Feb)

## Selected Auditors (22 total — same as Feb 2026)

The Feb run's selection mapped well to all current components. Group-chat infra is covered by existing API-03 (WebSocket/Real-Time Security) + LOGIC-01 (Business Logic) + ERR-02 (Race Conditions). Privy migration is covered by AUTH-01 + CHAIN-03.

| # | ID | Auditor | Always | Feb hits | New since Feb |
|---|------|---------|--------|----------|---------------|
| 1 | SEC-01 | Private Key & Wallet Security | — | 11 files | escrow-v2.js, walletLinkTokens.js |
| 2 | SEC-02 | Secret & Credential Management | ✓ | 20 files | privyAuth.js |
| 3 | AUTH-01 | Authentication Mechanisms | — | 8 files | privyAuth.js, today's auth-reset commit |
| 4 | AUTH-03 | Authorization & Access Control | — | 7 files | groupchat handlers |
| 5 | INJ-01 | SQL & NoSQL Injection | — | 11 files | challenge/* card rendering |
| 6 | INJ-05 | Prototype Pollution & Deserialization | — | 12 files | (mostly stable) |
| 7 | WEB-02 | CORS, CSP & Security Headers | — | 12 files | server/index.js (helmet config) |
| 8 | CHAIN-01 | Transaction Construction & Signing | — | 8 files | escrow-v2.js, init scripts |
| 9 | CHAIN-02 | RPC Client & Node Trust | — | 9 files | escrow-v2.js |
| 10 | CHAIN-03 | Wallet Integration & Adapter Security | — | 19 files | WalletContext.js (Privy migration) |
| 11 | CHAIN-06 | Program Account & PDA Interaction | — | 6 files | escrow-v2.js (snapshot pattern) |
| 12 | API-03 | WebSocket & Real-Time Security | — | 21 files | groupchat.js socket handlers |
| 13 | DATA-01 | Database & Query Security | — | 13 files | GroupMatch model, Challenge model |
| 14 | DATA-04 | Logging & Information Disclosure | ✓ | 20 files | new debugLog.js, [GC ...] logs |
| 15 | DATA-05 | Encryption & Data Protection | — | 9 files | walletLinkTokens.js (magic-link tokens) |
| 16 | DEP-01 | Package & Dependency Security | ✓ | 4 files | npm audit (server 20, client 47) |
| 17 | ERR-01 | Error Handling & Fail Modes | ✓ | 20 files | many new socket handlers |
| 18 | ERR-02 | Race Conditions & Concurrency | — | 20 files | groupchat lifecycle, scheduler |
| 19 | ERR-03 | Rate Limiting & Resource Exhaustion | — | 9 files | groupchat (broadcast amplification) |
| 20 | CRYPTO-01 | Random Number Generation & Nonces | — | 13 files | match_id generation |
| 21 | LOGIC-01 | Business Logic & Workflow Security | — | 30 files | groupchat, challenge, AI practice |
| 22 | LOGIC-02 | Financial & Economic Logic | ✓ | 30 files | gold.js, shot-token.js, escrow-v2 wrappers |

**Net:** 22 auditors carried forward from Feb. No new auditor categories added — the new components (groupchat, Privy, challenge cards) fall within existing focus areas.

## Phase 1 Agents (Context Building)

Each auditor agent loads:
- `knowledge-base/focus-manifests/{id-slug}.md` (auditor-specific)
- `knowledge-base/core/common-false-positives.md`
- `knowledge-base/core/secure-patterns.md`
- `knowledge-base/core/severity-calibration.md`
- `knowledge-base/ai-pitfalls/{category-slug}.md` (per agent's category)

### Cross-skill loads (always)
- `.audit/FINAL_REPORT.md` (SOS Audit #2 — for off-chain implications of on-chain findings)
- `.bok/results/summary.md` (BOK Audit #2 — verified math invariants)
- `.docs/` (GL spec oracle — intended behavior)

### Stacked-audit loads
- `.bulwark/HANDOVER.md` — RECHECK + VERIFY tags per finding
- `.bulwark-history/2026-02-24-ecfd03b/findings/{id}.md` — only when an auditor explicitly RECHECKs a Feb finding (lazy load via routing)

## Phase 3 (Strategy Generation)

Reads:
- All Phase 1 agent outputs (condensed summaries from `.bulwark/context/`)
- `knowledge-base/PATTERNS_INDEX.md` — exploit pattern catalog
- `knowledge-base/reference/audit-firm-findings.md` (off-chain reference exploits)
- `.bulwark/HANDOVER.md` — RECHECK findings auto-become Tier 1

## Phase 4 (Investigation)

- Per-strategy KB pattern files (lazy load via routing table built from auditor `provides`)
- Previous finding files for RECHECK strategies
- `knowledge-base/core/common-false-positives.md`

## Stacking Behavior

**Verification agents:** RUN. The 67% churn rate is just under the 70% massive-rewrite threshold. Verification agents will check that Feb findings on the ~50 unchanged files still hold.

**False positive carry-over:** Feb dismissals on unchanged files are retained; on modified/deleted files they're dropped. See `.bulwark/HANDOVER.md` for the surviving false-positive log.
