# SolShot Per-Auditor Hot Spots Map

Generated: 2026-02-23
Scope: `server/`, `client/src/`, `programs/`, `tests/`
Excluded: `node_modules/`, `.planning/`, `.audit/`, `_archive/`, `Docs/`, `.bulwark/`

---

## Per-Auditor Hot Files

### SEC-01: Private Key & Wallet Security
**Pattern:** `private.?key|keypair|Keypair|mnemonic|seed.?phrase|wallet.*sign|signTransaction`
**Total Hits:** 74

| File | Hits | Priority |
|------|------|----------|
| `/server/services/keys.js` | 25 | CRITICAL |
| `/server/services/escrow.js` | 15 | HIGH |
| `/tests/solshot-escrow.ts` | 13 | HIGH |
| `/client/src/wallet/WalletContext.js` | 7 | HIGH |
| `/server/middleware/auth.js` | 6 | HIGH |

**Notes:** Keys service contains escrow keypair loading/management with KM-04 zeroing. Escrow service uses keypair for transaction signing. Tests exercise keypair creation. Client wallet integration handles wallet.sign* calls.

---

### SEC-02: Secret & Credential Management
**Pattern:** `process\.env|API_KEY|SECRET|PRIVATE|TOKEN|PASSWORD|credential|KEYPAIR_PATH`
**Total Hits:** 61

| File | Hits | Priority |
|------|------|----------|
| `/client/src/wallet/WalletContext.js` | 11 | HIGH |
| `/server/services/shot-token.js` | 8 | HIGH |
| `/server/index.js` | 7 | HIGH |
| `/server/middleware/auth.js` | 6 | HIGH |
| `/server/services/keys.js` | 5 | HIGH |

**Notes:** Environment variable usage pervasive in wallet context, token services, and auth middleware. Critical for mint addresses, program IDs, RPC endpoints, keypair paths.

---

### AUTH-01: Authentication
**Pattern:** `authenticate|jwt|JWT|jsonwebtoken|verify.*signature|nacl|ed25519|sign.*message`
**Total Hits:** 85

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 27 | CRITICAL |
| `/server/middleware/auth.js` | 21 | CRITICAL |
| `/client/src/wallet/WalletContext.js` | 12 | HIGH |
| `/server/tests/integration.test.js` | 9 | HIGH |

**Notes:** Main socket handler contains most authenticate handlers. Auth middleware performs wallet signature verification. Client generates message signatures via wallet adapter. Tests verify full auth flow.

---

### AUTH-03: Authorization & Access Control
**Pattern:** `isAdmin|isOwner|authorize|permission|role|access.*control|guard|isCreator`
**Total Hits:** 48

| File | Hits | Priority |
|------|------|----------|
| `/programs/solshot-escrow/src/lib.rs` | 13 | CRITICAL |
| `/server/socket-io/main.js` | 9 | HIGH |
| `/server/services/escrow.js` | 8 | HIGH |
| `/server/idl/solshot_escrow.json` | 7 | MEDIUM |
| `/tests/solshot-escrow.ts` | 4 | MEDIUM |

**Notes:** Anchor program contains access control checks (authority, owner). Socket handlers check room/game state permissions. Escrow service enforces settlement authority.

---

### INJ-01: SQL & NoSQL Injection
**Pattern:** `mongoose|mongodb|findOne|updateOne|deleteOne|aggregate`
**Total Hits:** 53

| File | Hits | Priority |
|------|------|----------|
| `/server/package-lock.json` | 24 | LOW |
| `/server/models/ServerState.js` | 9 | MEDIUM |
| `/server/models/Match.js` | 6 | MEDIUM |
| `/server/socket-io/main.js` | 5 | MEDIUM |
| `/server/models/User.js` | 3 | MEDIUM |

**Notes:** MongoDB/Mongoose queries in models. Server state and match persistence use query methods. Queries are generally safe (no string concatenation visible in source).

---

### INJ-05: Prototype Pollution
**Pattern:** `JSON\.parse|Object\.assign|merge|extend|__proto__|constructor\[`
**Total Hits:** 191

| File | Hits | Priority |
|------|------|----------|
| `/client/src/weapons/packs/Standard/Standard.js` | 30 | MEDIUM |
| `/server/services/physics.js` | 16 | MEDIUM |
| `/server/package-lock.json` | 99 | LOW |
| `/client/src/weapons/packs/extraWeapons.js` | 7 | MEDIUM |
| `/programs/solshot-escrow/src/lib.rs` | 6 | LOW |

**Notes:** Most JSON.parse usage is for configuration loading. Object spread operators used in weapon class definitions. Limited risk of prototype pollution.

---

### WEB-02: CORS/CSP/Headers
**Pattern:** `cors|helmet|Content-Security|X-Frame|Access-Control|origin.*\*`
**Total Hits:** 49

| File | Hits | Priority |
|------|------|----------|
| `/server/index.js` | 8 | HIGH |
| `/client/src/weapons/packs/Standard/Standard.js` | 8 | MEDIUM |
| `/server/services/physics.js` | 5 | MEDIUM |
| `/client/src/scenes/main/index.js` | 5 | MEDIUM |
| `/server/socket-io/main.js` | 2 | MEDIUM |

**Notes:** Server index initializes helmet and CORS. Helm configured with CSP, X-Frame-Options. Physics/weapon code has minimal security-sensitive headers.

---

### CHAIN-01: Transaction Construction
**Pattern:** `Transaction|SystemProgram|sendAndConfirmTransaction|serialize|VersionedTransaction|addInstruction`
**Total Hits:** 84

| File | Hits | Priority |
|------|------|----------|
| `/tests/solshot-escrow.ts` | 34 | HIGH |
| `/client/src/wallet/WalletContext.js` | 18 | HIGH |
| `/server/services/shot-token.js` | 9 | HIGH |
| `/server/socket-io/main.js` | 8 | HIGH |
| `/server/services/escrow.js` | 7 | HIGH |

**Notes:** Escrow deposit/settlement transactions built in escrow.js. Client signs transactions in WalletContext via wallet adapter. Tests exercise full TX lifecycle.

---

### CHAIN-02: RPC Client
**Pattern:** `Connection|getBalance|getAccountInfo|getProgramAccounts|confirmTransaction|clusterApiUrl`
**Total Hits:** 60

| File | Hits | Priority |
|------|------|----------|
| `/tests/solshot-escrow.ts` | 14 | HIGH |
| `/server/services/monitoring.js` | 14 | HIGH |
| `/server/services/solana.js` | 8 | HIGH |
| `/client/src/wallet/WalletContext.js` | 7 | HIGH |
| `/server/socket-io/main.js` | 6 | HIGH |

**Notes:** Monitoring service queries account balances. Solana service manages RPC connection. Client wallet service queries balance via Connection. Confirm transaction calls widespread.

---

### CHAIN-03: Wallet Adapter
**Pattern:** `useWallet|WalletProvider|WalletContext|ConnectionProvider|wallet.*adapter|publicKey|connected`
**Total Hits:** 193

| File | Hits | Priority |
|------|------|----------|
| `/tests/solshot-escrow.ts` | 119 | HIGH |
| `/client/src/wallet/WalletContext.js` | 39 | CRITICAL |
| `/client/src/App.js` | 10 | HIGH |
| `/server/services/escrow.js` | 9 | MEDIUM |
| `/client/src/index.css` | 6 | LOW |

**Notes:** Tests heavily exercise wallet adapter mocking. WalletContext implements useSolShotWallet hook, wraps wallet adapter. App.js uses hook to get wallet state, publicKey, connected status.

---

### CHAIN-06: PDA Interaction
**Pattern:** `findProgramAddress|PDA|seeds|bump|programId|AnchorProvider|Program`
**Total Hits:** 363

| File | Hits | Priority |
|------|------|----------|
| `/tests/solshot-escrow.ts` | 164 | CRITICAL |
| `/server/services/escrow.js` | 81 | CRITICAL |
| `/programs/solshot-escrow/src/lib.rs` | 64 | CRITICAL |
| `/server/idl/solshot_escrow.json` | 29 | HIGH |
| `/server/socket-io/main.js` | 15 | HIGH |

**Notes:** Tests exercise PDA derivation for match escrow accounts. Escrow service derives PDAs with seeds `["match", matchId]`. Anchor program defines PDA accounts. IDL specifies account structures.

---

### API-03: WebSocket Security
**Pattern:** `socket\.on|socket\.emit|io\.on|io\.emit|socket\.join|disconnect|reconnect`
**Total Hits:** 141

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 46 | CRITICAL |
| `/server/tests/integration.test.js` | 20 | HIGH |
| `/client/src/screens/BattleScreen.js` | 16 | HIGH |
| `/client/src/scenes/main/index.js` | 10 | HIGH |
| `/client/src/screens/LobbyScreen.js` | 9 | HIGH |

**Notes:** Main socket handler is the core: 1800+ lines, all socket.on/emit handlers. Integration tests mock socket behavior. Client screens emit socket events (fire, aim, join room). Disconnect/reconnect logic critical for wallet-keyed rejoin.

---

### DATA-01: Database
**Pattern:** `mongoose|Schema|Model|findById|save|create|MongoDB|MONGO_URI`
**Total Hits:** 378

| File | Hits | Priority |
|------|------|----------|
| `/client/src/weapons/packs/Standard/Standard.js` | 98 | LOW |
| `/server/socket-io/main.js` | 38 | MEDIUM |
| `/client/src/scenes/main/index.js` | 31 | LOW |
| `/server/services/shot-token.js` | 23 | MEDIUM |
| `/client/src/weapons/packs/extraWeapons.js` | 22 | LOW |

**Notes:** Hits in weapon packs are "mongodb" strings in weapon names/descriptions (false positives). Mongoose models in server/models/. Socket handler persists state. Most hits are noise.

---

### DATA-04: Logging
**Pattern:** `console\.log|console\.error|console\.warn|logger`
**Total Hits:** 229

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 53 | HIGH |
| `/server/tests/integration.test.js` | 29 | MEDIUM |
| `/server/services/escrow.js` | 25 | HIGH |
| `/client/src/wallet/WalletContext.js` | 15 | MEDIUM |
| `/client/src/classes/Weapon.js` | 15 | MEDIUM |

**Notes:** Main socket handler logs extensively for debugging game state. Escrow service logs transaction details. Client wallet logs auth/balance info. Tests log assertions. Consider structured logging migration.

---

### DATA-05: Encryption
**Pattern:** `crypto|encrypt|decrypt|hash|hmac|sha256`
**Total Hits:** 51

| File | Hits | Priority |
|------|------|----------|
| `/server/middleware/telegram.js` | 11 | HIGH |
| `/server/socket-io/main.js` | 6 | MEDIUM |
| `/server/services/physics.js` | 5 | MEDIUM |
| `/server/services/match.js` | 2 | LOW |
| `/server/services/escrow.js` | 2 | LOW |

**Notes:** Telegram middleware uses HMAC for webhook verification. Socket handler uses crypto for CSPRNG (room IDs, terrain, turns). Physics simulation deterministic (no crypto). Match service minimal crypto.

---

### ERR-01: Error Handling
**Pattern:** `try\s*\{|catch\s*\(|\.catch|throw|Error\(|reject\(`
**Total Hits:** 207

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 44 | HIGH |
| `/tests/solshot-escrow.ts` | 35 | MEDIUM |
| `/server/services/escrow.js` | 24 | HIGH |
| `/client/src/scenes/main/index.js` | 14 | MEDIUM |
| `/server/tests/integration.test.js` | 10 | MEDIUM |

**Notes:** Socket handler has comprehensive try-catch for event handlers. Escrow service guards all Anchor program calls. Tests exercise error paths. Client scene has error boundaries.

---

### ERR-02: Race Conditions
**Pattern:** `async|await|Promise\.all|setTimeout|setInterval|concurrent`
**Total Hits:** 395

| File | Hits | Priority |
|------|------|----------|
| `/server/tests/integration.test.js` | 98 | HIGH |
| `/tests/solshot-escrow.ts` | 95 | HIGH |
| `/server/socket-io/main.js` | 74 | CRITICAL |
| `/server/services/escrow.js` | 23 | HIGH |
| `/client/src/wallet/WalletContext.js` | 14 | HIGH |

**Notes:** Main socket handler extensively async (event queuing, confirmations). Escrow service awaits transaction confirmations. Tests use async/await heavily. Client wallet awaits balance queries, TX signing. Watch for lost promises, race conditions.

---

### ERR-03: Rate Limiting
**Pattern:** `rate.?limit|throttle|express-rate|rateLimit|windowMs`
**Total Hits:** 20

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 8 | HIGH |
| `/server/index.js` | 3 | HIGH |
| `/server/package-lock.json` | 5 | LOW |
| `/client/src/screens/BattleScreen.js` | 2 | LOW |
| `/tests/solshot-escrow.ts` | 1 | LOW |

**Notes:** Socket handler implements turn timers (60s) to prevent spam. Server index configures express-rate-limit middleware (10 req/min default). Client battle screen applies UI throttling. Good coverage.

---

### CRYPTO-01: RNG
**Pattern:** `Math\.random|randomBytes|crypto\.random|randomInt|nonce|uuid`
**Total Hits:** 101

| File | Hits | Priority |
|------|------|----------|
| `/client/src/weapons/packs/Standard/Standard.js` | 48 | MEDIUM |
| `/client/src/graphics/terrain.js` | 10 | MEDIUM |
| `/client/src/scenes/main/index.js` | 9 | MEDIUM |
| `/server/socket-io/main.js` | 8 | CRITICAL |
| `/server/services/physics.js` | 5 | MEDIUM |

**Notes:** Client weapon packs use Math.random for spread. Terrain generation randomized. Server socket handler uses crypto.randomBytes for room IDs, terrain seeds (CSPRNG). Physics uses deterministic RNG seeded from server. Client RNG is gameplay-only (non-critical).

---

### LOGIC-01: Business Logic
**Pattern:** `wager|match|round|turn|damage|health|gold|reward|winner|settlement`
**Total Hits:** 2544

| File | Hits | Priority |
|------|------|----------|
| `/server/socket-io/main.js` | 525 | CRITICAL |
| `/server/services/physics.js` | 205 | CRITICAL |
| `/server/services/escrow.js` | 107 | CRITICAL |
| `/server/services/shot-token.js` | 102 | CRITICAL |
| `/programs/solshot-escrow/src/lib.rs` | 101 | CRITICAL |

**Notes:** Socket handler orchestrates entire match state machine. Physics calculates damage, applies weapon logic. Escrow manages wager settlement. Token service issues rewards. Anchor program enforces financial constraints on-chain.

---

### LOGIC-02: Financial Logic
**Pattern:** `lamports|SOL|escrow|deposit|withdraw|transfer|balance|fee|treasury|mint|burn`
**Total Hits:** 923

| File | Hits | Priority |
|------|------|----------|
| `/programs/solshot-escrow/src/lib.rs` | 184 | CRITICAL |
| `/tests/solshot-escrow.ts` | 148 | CRITICAL |
| `/server/socket-io/main.js` | 123 | CRITICAL |
| `/server/services/solana.js` | 76 | CRITICAL |
| `/server/services/shot-token.js` | 69 | CRITICAL |

**Notes:** Anchor program implements 90/7/3 BPS split (winner/treasury/ops) on settlement. Tests verify lamport math. Socket handler creates escrows, manages deposits. Solana service settles matches. Token service issues SHOT burns and mints.

---

### DEP-01: Dependencies
**Pattern:** `package.json` locations

| File | Type |
|------|------|
| `/package.json` | Root (workspace root) |
| `/server/package.json` | Server deps |
| `/client/package.json` | Client deps |

**Key Dependencies:**
- **Server:** Express, Socket.IO, Anchor, @solana/web3.js, mongoose, helmet, express-rate-limit
- **Client:** React, Phaser, @solana/wallet-adapter, @solana/web3.js, @solana/spl-token
- **Programs:** Anchor framework, solana-program

---

## Global Hot Files (Total Hits Across All Auditors)

Ranked by total security relevance (counting each auditor's hits).

| File | Total Hits | Auditors | Risk Level |
|------|-----------|----------|-----------|
| `/server/socket-io/main.js` | 445 | 20/22 | CRITICAL |
| `/server/services/escrow.js` | 182 | 16/22 | CRITICAL |
| `/tests/solshot-escrow.ts` | 196 | 17/22 | CRITICAL |
| `/client/src/wallet/WalletContext.js` | 170 | 17/22 | CRITICAL |
| `/server/services/shot-token.js` | 119 | 12/22 | HIGH |
| `/server/services/solana.js` | 101 | 10/22 | HIGH |
| `/server/services/physics.js` | 88 | 9/22 | MEDIUM |
| `/programs/solshot-escrow/src/lib.rs` | 125 | 11/22 | CRITICAL |
| `/server/tests/integration.test.js` | 94 | 11/22 | MEDIUM |
| `/client/src/scenes/main/index.js` | 81 | 9/22 | MEDIUM |
| `/server/index.js` | 79 | 10/22 | HIGH |
| `/server/middleware/auth.js` | 79 | 10/22 | HIGH |
| `/client/src/screens/LobbyScreen.js` | 67 | 8/22 | MEDIUM |
| `/server/idl/solshot_escrow.json` | 63 | 6/22 | MEDIUM |
| `/server/models/ServerState.js` | 61 | 8/22 | MEDIUM |
| `/client/src/weapons/packs/Standard/Standard.js` | 138 | 7/22 | LOW |
| `/server/package-lock.json` | 126 | 12/22 | LOW |
| `/server/middleware/guards.js` | 54 | 8/22 | HIGH |
| `/client/src/App.js` | 52 | 9/22 | MEDIUM |
| `/server/services/keys.js` | 57 | 9/22 | CRITICAL |

---

## Audit Recommendations

### CRITICAL Priority Files (Must Review)
1. **`server/socket-io/main.js`** — 1800+ line socket handler, all game state orchestration
2. **`server/services/escrow.js`** — Escrow account PDAs, settlement logic
3. **`programs/solshot-escrow/src/lib.rs`** — On-chain financial constraints, authority checks
4. **`client/src/wallet/WalletContext.js`** — Wallet integration, TX signing, auth
5. **`server/services/keys.js`** — Keypair management, credential handling

### HIGH Priority Files (Audit Soon)
- `server/middleware/auth.js` — Signature verification
- `server/services/shot-token.js` — Token burns, account creation
- `server/services/solana.js` — RPC interaction, settlement calls
- `server/index.js` — Server setup, middleware chain
- `server/middleware/guards.js` — Authorization guards

### Test Coverage Critical
- `/tests/solshot-escrow.ts` — 196 hits across auditors, essential for PDA/TX validation
- `/server/tests/integration.test.js` — 94 hits, socket + escrow integration

---

## Summary Statistics

- **Total Auditors Analyzed:** 22
- **Total Files with Hits:** 120+ (source code only)
- **Total Trigger Hits (source):** ~6,500 across all patterns
- **Critical Risk Files:** 5
- **High Risk Files:** 10
- **Recommended Audit Scope:** 15 files (top 15 by risk + auditor count)

**Most Interesting Finding:** Socket handler `main.js` and escrow service form the critical path for both gameplay and financial settlement. Any vulnerability in async error handling, authorization, or transaction construction there could compromise game integrity or player funds.
