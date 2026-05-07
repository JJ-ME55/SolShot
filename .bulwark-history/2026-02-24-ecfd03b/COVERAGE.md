# Bulwark Off-Chain Audit — Coverage Report

**Generated:** 2026-02-23
**Verifier:** Claude Sonnet 4.6 (coverage verification pass)
**Scope:** 130 investigation findings (H001–H120 + S001–S010)
**Architecture source:** `.bulwark/ARCHITECTURE.md`

---

## 1. Coverage Matrix

### Server Components

| Component | Covered | Primary Findings | Notes |
|-----------|---------|-----------------|-------|
| `main.js` — auth/authenticate | YES | H016, H029, H030, H033 | JWT dead code, sig replay, unauthenticated events |
| `main.js` — room handlers (createRoom, joinRoom) | YES | H001, H027, H028, H046, H060 | Fail-open balance, escrow creation ignored |
| `main.js` — match handlers (ready, shoot, fire) | YES | H004, H016, H047, H077, H086 | No deposit check, no auth on shoot, weapon bypass |
| `main.js` — settlement handler | YES | H002, H004, H007, H012, H024 | TOCTOU, wrong-params refund, phantom wager |
| `main.js` — shop handlers | YES | H056, H057, H085, H086 | Race non-vuln confirmed; weapon cost bypass confirmed |
| `main.js` — prestige handler | YES | H003, H005, S002 | Double-unlock race, burnAmount=0 bypass |
| `main.js` — reconnect handlers | YES | H021, H065, H081, S009 | State migration, wallet leak, timer abuse |
| `solana.js` — balance check | YES | H001, H028, H046 | Fail-open, 30s cache TOCTOU |
| `solana.js` — settlement dispatch | YES | H007, H011, H012, H024 | Wrong params, retry exhaustion, phantom wager |
| `solana.js` — refund path | YES | H007, H118, S008 | Wrong params in disconnect, orphaned escrow on restart |
| `solana.js` — SHOT emission | YES | H008, H009, H021, H115 | Milestone double-claim (not vuln), supply race |
| `escrow.js` — create_match | YES | H027, H082, H119 | Failure ignored, PDA reuse, match ID collision |
| `escrow.js` — deposit_wager | YES | H004, H010, H044, H109, H116 | Partial deposit, race, 2s retry, dust griefing |
| `escrow.js` — settle_match | YES | H002, H004, H024, H025 | TOCTOU, no deposit check, authority control |
| `escrow.js` — cancel_match | YES | H007, H012, S008 | Wrong-params refund, phantom wager, fund lock |
| `shot-token.js` — burn verify | YES | H003, H005, H117 | Double-unlock race, burnAmount=0, concurrent confusion |
| `shot-token.js` — milestone | YES | H008, H021 | Double-claim (confirmed not vuln in H008) |
| `shot-token.js` — supply tracking | YES | H009, H099, H117 | Supply race (confirmed not vuln in H009); economic amplification |
| `keys.js` — key loading | YES | H013, H014, H015, H024, S006 | Hot wallet single point, incomplete zeroing, inspector leak |
| `keys.js` — key zeroing | YES | H014 | Buffer.fill() called but heap dump can capture pre-zero |
| `auth.js` — signature verify | YES | H030, H041, H063 | Replay within 5-min window, timing-unsafe HMAC, error info leak |
| `auth.js` — JWT generation/verify | YES | H029, H064 | verifyToken() dead code, 24h expiry on unused token |
| `auth.js` — timestamp check | YES | H030, H104 | 5-min window no nonce; server clock skew |
| `guards.js` — withLock | YES | H002, H006, H011 | Settlement lock present; TOCTOU around it examined |
| `guards.js` — validatePayload | YES | H052 | Imported but never called (dead code confirmed) |
| `guards.js` — validateFire | YES | H016, H047 | No bounds check on angle/power; position drift |
| `guards.js` — requireAuth | YES | H016, H017, H029 | 6 events bypass; JWT completely dead |
| `gold.js` — economy | YES | H057, H085, H086 | TOCTOU non-vuln confirmed; cost=0 bypass potential |
| `physics.js` — damage calc | YES | H047, H077, H114 | Position input trusted; server-authoritative confirmed |
| `physics.js` — trajectory | YES | H047, H075, H114 | Position spoofing path; wind predictability |
| `match.js` — state machine | YES | H056, H087, H107 | Double-trigger non-vuln; event ordering; invalid transitions |

### Client Components

| Component | Covered | Primary Findings | Notes |
|-----------|---------|-----------------|-------|
| `WalletContext.js` — signing | YES | H031, H033, H042, H043 | Account-change handler missing; autoConnect gap; deprecated confirmTransaction |
| `WalletContext.js` — burn | YES | H003, H005, H080, S002 | Double-unlock; burnAmount=0; spl-token pinning |
| `WalletContext.js` — deposit | YES | H042, H044, H120 | Deprecated confirm; 2s retry; atob misuse (non-vuln) |
| `App.js` — reconnect logic | YES | H021, H081, S009 | State migration race; 30s window abuse; timer extension |
| `App.js` — socket lifecycle | YES | H032, H033, H065, H096 | window.socket global; autoConnect; wallet leak; cross-tab |
| Vercel deployment — CSP | YES | H048 | No CSP on Vercel deployment confirmed |
| Vercel deployment — headers | YES | H048, H049, H050, H089 | No CSP; unsafe-inline; trust proxy; helmet gaps |
| npm dependencies (client) | YES | H023, H072, H080 | Critical CVEs in client deps; polyfill security; spl-token |
| npm dependencies (server) | YES | H053, H054 | nodemon in prod; ws/express/socket.io known CVEs |

### Trust Boundaries

| Boundary | Covered | Primary Findings | Notes |
|----------|---------|-----------------|-------|
| Client → Server (socket events, auth) | YES | H016, H017, H018, H019, H020, H022, H030, H052 | Unauthenticated events; no validation; unbounded payloads; sig replay |
| Server → Solana RPC (balance, confirm, send) | YES | H001, H028, H042, H044, H045, H046 | Fail-open; 30s cache; deprecated confirm; fragmented connections |
| Server → Anchor program (escrow CPI) | YES | H004, H010, H013, H025, H026, H027, H082 | No deposit check; hardcoded program ID; creation failure ignored; PDA reuse |
| Server → MongoDB (stats, users) | YES | H036, H037, H051, H091, H092 | Winner never written; dual-write inconsistency; txSig no validation; connection string; no burn index |

### Attack Patterns

| Pattern | Covered | Primary Findings | Notes |
|---------|---------|-----------------|-------|
| Race conditions (TOCTOU, async gaps) | YES | H002, H003, H009, H010, H019, H020, H021, H055, H056, S003, S004 | Double-settle TOCTOU; prestige race; join race; terrain race non-vuln |
| Financial logic (settlement, deposits, refunds) | YES | H001, H004, H005, H007, H012, H028, H060, H109, H116, S001, S008 | Full wager bypass chain; dust griefing; phantom wager; wrong-params refund |
| Authentication / Authorization | YES | H016, H017, H018, H024, H029, H030, H033, H064, H081, H086 | 6 unauth events; JWT dead; sig replay; weapon array non-host |
| Input validation | YES | H005, H016, H022, H047, H051, H052, H077, H086, H115 | burnAmount=0; unbounded payload; txSig no check; position drift; event storm |
| Error handling (fail-open vs fail-closed) | YES | H001, H007, H011, H027, H046, H059, H074, H083, H095, H098 | Fail-open balance; wrong-params refund; timer clear; orphaned state |
| Key management | YES | H013, H014, H015, H026, H041, S006 | Hot wallet; incomplete zeroing; env var leak; hardcoded ID; timing-unsafe |
| DoS / resource exhaustion | YES | H022, H035, H038, H061, H094, H115, S003, S007 | Unbounded buffer; broadcastRooms amplification; memory growth; queue flood; event storm |
| Information disclosure | YES | H039, H040, H063, H069, H070, H111 | Settlement in console; 45+ console.* bypass; error msg leak; room state leak; broadcastRooms |

---

## 2. Gaps Found

**No zero-coverage gaps were identified.** All components and attack patterns from the checklist have at least one finding. The following are relative coverage gaps where depth is thinner than warranted by risk level:

### Thin Coverage (1–2 findings; elevated risk warrants more)

| Area | Finding Count | Gap Description |
|------|--------------|-----------------|
| `keys.js` — zeroing completeness | 1 (H014) | H014 confirms incomplete zeroing but does not examine whether all secret material (BN objects, intermediate buffers from Anchor TX construction) is also zeroed. The keypair raw bytes are zeroed; derived objects are not examined. |
| `auth.js` — HTTP endpoint `/api/auth/verify` | 2 (H029, H030) | The HTTP auth endpoint is covered for replay and JWT issues, but HTTP-specific concerns (CORS on this endpoint, rate limit separately from socket, response body leaking wallet address) are not explicitly investigated. |
| `match.js` — invalid state transitions | 1 (H107) | H107 marks this POTENTIAL but does not exhaustively map all transition guards. Given the financial dependency on correct state progression, this warrants a dedicated state-machine walkthrough. |
| `shot-token.js` — supply tracking persistence | 1 (H009) | H009 confirmed supply race is not vulnerable in the current implementation (single-process JS), but the in-memory `shotSupply` object lost on restart is not explored as a standalone risk vector beyond H095. |
| MongoDB — walletAddress injection | 1 (H051) | Only txSignature no-validation is confirmed. Wallet address format injection into MongoDB (NoSQL injection via malformed address) is marked in architecture but H051 focuses on txSignature specifically. H091 covers connection string only. |

### Noted Absence (not in checklist, but worth flagging)

| Area | Notes |
|------|-------|
| Telegram webhook (`telegram.js`) | H041 covers the timing-unsafe HMAC. No finding examines the webhook for command injection, bot token exposure impact, or whether admin notifications can be spoofed to suppress alerts during an attack. |
| `server/models/User.js` schema | H037 and H051 touch on persistence; no finding directly examines the Mongoose schema for unsafe `$where`, operator injection via nested objects, or `walletAddress` uniqueness enforcement. |
| Phaser.js client-side game engine | No finding investigates whether Phaser's rendering pipeline or event bus can be manipulated from injected JS after XSS (H032 covers window.socket escalation but not Phaser-specific attack surfaces). |

---

## 3. Coverage Percentage

| Domain | Items in Checklist | Items Covered | Coverage |
|--------|--------------------|---------------|----------|
| Server Components (10 files × function groups) | 31 | 31 | 100% |
| Client Components (4 items) | 9 | 9 | 100% |
| Trust Boundaries (4) | 4 | 4 | 100% |
| Attack Patterns (8) | 8 | 8 | 100% |
| **Total checklist items** | **52** | **52** | **100%** |

Checklist coverage: **100% (52/52)**

The thin-coverage gaps noted in Section 2 are depth issues, not zero-coverage gaps. No area from the architecture's component map, trust boundary diagram, or API surface table is completely unexamined.

Out of 130 findings:
- 120 H-series: cover components, races, financial logic, auth, error handling, dependencies, and novel attack chains
- 10 S-series: multi-step attack chains that cross component boundaries (S001–S010 all confirmed or potential)
- NOT_VULNERABLE verdicts (H006, H008, H009, H055, H056, H057, H058, H066, H068, H085, H093, H097, H101–H108, H110, H114, H120): productive negatives — confirm mitigations are in place or hypotheses were incorrect

---

## 4. Recommendation

**Additional investigation is NOT required to achieve full checklist coverage.**

However, three targeted follow-up investigations are recommended before a final report is issued:

1. **State machine transition exhaustive walkthrough** (H107 is POTENTIAL). Enumerate all `room.state` transitions in `main.js` against the 9 valid states. Confirm whether a crafted event sequence can force an illegal transition (e.g., `SETTLING` -> `PLAYING`) that re-enables the shoot handler after settlement has begun. This is a 1–2 hour targeted review, not a full investigation.

2. **MongoDB walletAddress NoSQL injection** (thin coverage flagged above). A 30-minute targeted grep for all `User.findOne({ walletAddress: <client-supplied> })` call sites to confirm whether operator injection (`{ $gt: "" }`) is possible. Given that walletAddress comes from socket payload and is used in DB queries, this is worth a quick confirmation pass.

3. **Telegram admin alert suppression** (absence flagged above). If the Telegram alerts are used as the primary notification mechanism for settlement failures or key compromise indicators, an attacker who can suppress them (e.g., by exhausting the bot token rate limit or exploiting the timing-unsafe HMAC to forge a webhook call) gains an operational advantage. A 1-hour review of `telegram.js` for this scenario is warranted given the administrative security posture.

These three items do not represent coverage gaps in the existing checklist — they are depth extensions warranted by the risk profile of the project (real SOL wagers, hot-wallet authority, no audit trail in the database).

---

*Coverage verified against `.bulwark/ARCHITECTURE.md` sections: Component Map, Trust Boundaries, API Surface Map, Risk Heat Map, and Critical Invariants.*
