# DB KB-MANIFEST — Audit #3

Generated 2026-05-28. Knowledge base loading plan.

## Detected Configuration
- **Languages:** JavaScript (server + client), ESM .mjs (scripts), JSX (React)
- **Frameworks:** Express, Socket.IO, Telegraf, Privy, Mongoose/MongoDB, React, Phaser
- **Tier:** standard (delta-focused stacked audit on top of #2 DEEP coverage)
- **LOC scanned:** ~60,000
- **Files:** 192 source files in scope

## Phase 1 Focus Areas (collapsed to 3 high-priority bundles for efficiency)

| # | Bundle | Component | Covers prior audit IDs |
|---|---|---|---|
| 1 | **AUTH / Identity Composition** | Privy JWT verify, magic-link tokens, TG identity bind, socket auth, admin auth, arcade JWT | H001 + H002 + H003 + H004 + H006 (identity-bridge takeover chain) + Bug 7 follow-up |
| 2 | **CHAIN / TX / Mainnet Operational** | escrow-v2.js wrappers, init-config-mainnet, propose/accept/apply config scripts, signAndSendEscrowDeposit, RPC | New mainnet scripts (first audit) + remaining H120 leg + chain-side delta from c9b3601 (S2-T7) |
| 3 | **DATA / SOCKETS / LOGIC / ERR** | server/socket-io/main.js (5198 LOC), Mongo schemas (User, FunnelEvent), funnel dedupe, refund derive-from-mask, race conditions | H013/H014/H015/H016 (fail-open financial) — verify resolution; H018/H019/H020/H022 (unauth socket events) — recheck; new admin endpoints |

## Carry-Forward Context

- `.bulwark-history/2026-05-07-5f2acec/ARCHITECTURE.md` — prior architecture snapshot
- `.bulwark-history/2026-05-07-5f2acec/FINAL_REPORT.md` — prior findings detail
- `.audit/FINAL_REPORT.md` — SOS audit #3 results (cross-skill — on-chain side just landed N001/N002/N003 fixes)

## Skipped vs Prior Audit #2

- DEEP-tier 22-agent parallel breakdown collapsed to 3 focused bundles — relies on HANDOVER's tagging of which prior findings need RECHECK vs VERIFY
- Verification agents will be inline in primary auditors (each bundle re-checks its prior findings as part of its context analysis)
- Quality gate skipped (delta-focused work is self-verifying via line refs)
