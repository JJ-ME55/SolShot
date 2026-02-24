# SolShot Security-Focused Codebase Index

**Generated:** 2026-02-23  
**Project Root:** `/SolShot/`  
**Scope:** All off-chain source files (JS, JSX, TS, TSX)  
**Total Files:** 110

## Executive Summary

### Statistics
- **Total Active Files:** 75 (excluding archive, docs, tools)
- **Server Files:** 19 | **Client Files:** 65 | **Tests:** 2  
- **Estimated LOC:** 10,500 (active source)  
- **Risk Markers:** 20 critical auditor IDs applied  
- **High-Risk Files:** 18 files with 5+ security markers  

### Severity Breakdown
| Tier | Files | Key Concerns |
|------|-------|--------------|
| CRITICAL | 8 | Keypair loading, escrow, settlement, signatures |
| HIGH | 10 | Wallet adapter, auth, RPC, wager validation |
| MEDIUM | 20 | Financial logic, state machine, physics |
| LOW | 37 | UI components, utilities, data definitions |

---

## TIER 1: CRITICAL SECURITY FILES

### 1. server/socket-io/main.js
**Language:** JS | **Lines:** ~1800  
**Purpose:** Central Socket.IO event dispatcher  
**Risk Markers:** API-03, LOGIC-02, AUTH-01, CHAIN-01, ERR-02  
**Key Ops:** Authenticate, createRoom, fire, rejoinRoom, escrowDepositConfirm, settlement  
**NOTES:** Massive file, settlement race protection via withLock(), reconnect keyed by wallet

### 2. server/services/solana.js
**Language:** JS | **Lines:** ~400  
**Purpose:** Solana RPC integration, wager validation, settlement distribution  
**Risk Markers:** CHAIN-02, CHAIN-01, LOGIC-02  
**Key Ops:** verifyBalance(), validateMatchMode(), settleMatch()  
**NOTES:** MATCH_MODES sync required, 90/7/3 split hardcoded

### 3. server/services/escrow.js
**Language:** JS | **Lines:** ~600+  
**Purpose:** Anchor program wrapper for escrow  
**Risk Markers:** CHAIN-06, CHAIN-01, SEC-02  
**Key Ops:** createMatchEscrow(), buildDepositTransaction(), settleMatchEscrow()  
**NOTES:** Program ID: CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD

### 4. server/services/keys.js
**Language:** JS | **Lines:** ~85  
**Purpose:** Keypair loading, single ingestion point  
**Risk Markers:** SEC-01, SEC-02  
**Key Ops:** initKeys(), getEscrowKeypair(), byte zeroing (KM-04)  
**NOTES:** Only module reading keypair env vars

### 5. server/middleware/auth.js
**Language:** JS | **Lines:** ~150  
**Purpose:** Wallet signature verification and JWT generation  
**Risk Markers:** AUTH-01, SEC-02  
**Key Ops:** verifyWalletSignature(), verifyAuthMessage(), generateToken()  
**NOTES:** NaCl Ed25519 verify, JWT 24h expiry

### 6. server/middleware/guards.js
**Language:** JS | **Lines:** ~150  
**Purpose:** Security middleware  
**Risk Markers:** AUTH-03, ERR-02  
**Key Ops:** requireAuth(), validatePayload(), withLock() (race prevention)  
**NOTES:** Fixes H006, H015, H009, H017, H020, H062

### 7. client/src/wallet/WalletContext.js
**Language:** JS (React) | **Lines:** ~300+  
**Purpose:** Wallet adapter, auth flow, SHOT burns  
**Risk Markers:** SEC-01, CHAIN-03, AUTH-01  
**Key Ops:** authenticate(), signAndSendEscrowDeposit(), signAndBurnShot()  
**NOTES:** Exposes to window.solWallet for Phaser engine

### 8. server/services/shot-token.js
**Language:** JS | **Lines:** ~400+  
**Purpose:** SHOT emissions, prestige burns  
**Risk Markers:** LOGIC-02, CHAIN-02  
**Key Ops:** initShotState(), verifyBurnTransaction(), prestigeBurn()  
**NOTES:** Prestige weapons [24, 29, 26, 21, 22]

### 9. server/index.js
**Language:** JS | **Lines:** ~135  
**Purpose:** Express setup, security headers, rate limiting  
**Risk Markers:** SEC-02, WEB-02, ERR-03  
**Key Ops:** initKeys(), CORS restriction, rate limiter  
**NOTES:** H008 - CORS restricted, body limit 1mb

### 10. client/src/screens/LobbyScreen.js
**Language:** JS (React) | **Lines:** ~500+  
**Purpose:** Match lobby, wager selection, matchmaking  
**Risk Markers:** LOGIC-02, AUTH-01  
**Key Ops:** createRoom, wager validation  
**NOTES:** MATCH_MODES must sync with server

---

## TIER 2: HIGH-PRIORITY FILES (11-18)

- server/services/match.js - State machine, transitions (LOGIC-01)
- server/services/physics.js - Physics engine, wind RNG (CRYPTO-01)
- server/services/gold.js - Gold economy (LOGIC-02)
- client/src/App.js - Root component, rejoin logic (AUTH-01)
- server/models/User.js - User schema (DATA-01)
- server/models/Match.js - Match schema (DATA-01)
- client/src/screens/PrestigeScreen.js - Prestige UI (LOGIC-02)
- server/middleware/telegram.js - Telegram validation (AUTH-01)

---

## CRITICAL DEPLOYMENT CHECKLIST

**Keys:** SOLANA_KEYPAIR_JSON/PATH, JWT_SECRET, SHOT_TOKEN_MINT, MATCH_ESCROW_PROGRAM_ID, ADMIN_API_KEY  
**Environment:** SOLANA_RPC, MONGODB_URI, CORS_ORIGINS, TREASURY/OPS_WALLET, NODE_ENV=production  
**Program:** Verify deployed program ID matches escrow.js, IDL in sync  
**Consistency:** MATCH_MODES sync, prestige weapons [24,29,26,21,22], 90/7/3 split  

---

**Generated:** 2026-02-23  
**Total Analyzed:** 110 files | **Active:** 75 | **Risk Tiers:** 4  
**Focus Areas:** SEC-01/02, AUTH-01/03, CHAIN-01/02/03/06, LOGIC-01/02, API-03, CRYPTO-01, ERR-02
