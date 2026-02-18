# 02 - Arithmetic Safety Audit

**Auditor:** Claude Opus 4.6 (automated)
**Date:** 2026-02-14
**Scope:** All server source files - numeric/arithmetic vulnerabilities
**Branch:** dev (commit b8d2a24)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4     |
| HIGH     | 7     |
| MEDIUM   | 8     |
| LOW      | 5     |
| INFO     | 3     |
| **Total**| **27**|

---

## CRITICAL Findings

### ARITH-01: Fire event accepts NaN/Infinity/negative angle and power — server physics produces garbage trajectory

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:671`, `server/services/physics.js:59-84`
**CWE:** CWE-20 (Improper Input Validation), CWE-682 (Incorrect Calculation)

**Description:**
The `fire` event handler destructures `{angle, power, weaponId, startX, startY}` from the client payload with zero numeric validation. These values flow directly into `processShot()` which calls `calculateTrajectory(angle, power, ...)`. There are no guards against:
- `NaN` (produces NaN coordinates throughout trajectory, NaN damage)
- `Infinity` / `-Infinity` (produces Infinity coordinates, trajectory loop may never terminate or terminate instantly)
- Negative power (projectile flies backward)
- Extremely large power (e.g., `1e308` - projectile exits bounds in one step but velocity causes overflow in intermediate calculations)
- Non-numeric types (string `"abc"` coerced to NaN)

**Exploit Scenario:**
1. Attacker sends `fire` event with `{ angle: NaN, power: NaN, weaponId: 0, startX: 0, startY: 0 }`
2. `calculateTrajectory` computes `velocity = NaN * 8 = NaN`, all trajectory points become `{x: NaN, y: NaN}`
3. `calculateImpact` comparisons against NaN all return false, loop runs all 3000 steps
4. Final impact point is `{x: NaN, y: NaN, type: 'outOfBounds'}` - no damage dealt but CPU burned
5. `result.newTerrain` is unchanged but `NaN` coordinates are broadcast to both clients via `turnResult`
6. Client rendering may crash or desync
7. With `power: 1e20`, the first trajectory step produces `x` far beyond terrain bounds, but the intermediate `vx * PHYSICS_DT` multiplication is `~1.33e18` per step which is fine for float64, but the coordinates overflow meaningful game space instantly. The trajectory contains exactly 2 points, impact is `outOfBounds`, no damage. Attacker gets a free "miss" turn with no downside.

**Recommendation:**
```javascript
// At top of fire handler, BEFORE processShot:
if (typeof angle !== 'number' || typeof power !== 'number' ||
    typeof startX !== 'number' || typeof startY !== 'number') {
    client.emit('fireRejected', { reason: 'Invalid numeric input' });
    return;
}
if (!Number.isFinite(angle) || !Number.isFinite(power) ||
    !Number.isFinite(startX) || !Number.isFinite(startY)) {
    client.emit('fireRejected', { reason: 'Invalid numeric input' });
    return;
}
// Clamp to game-valid ranges
if (power < 0 || power > 100) {
    client.emit('fireRejected', { reason: 'Power out of range (0-100)' });
    return;
}
if (angle < -Math.PI * 2 || angle > Math.PI * 2) {
    client.emit('fireRejected', { reason: 'Angle out of range' });
    return;
}
if (startX < 0 || startX > 1200 || startY < -100 || startY > 600) {
    client.emit('fireRejected', { reason: 'Start position out of bounds' });
    return;
}
```

---

### ARITH-02: Floating-point arithmetic on SOL wager amounts — settlement split does not sum to total pot

**Severity:** CRITICAL
**Location:** `server/services/solana.js:27-29`, `server/services/solana.js:121-127`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
Settlement percentages are defined as `WINNER_SHARE = 0.90`, `TREASURY_SHARE = 0.07`, `OPS_SHARE = 0.03`, and calculated via simple multiplication:
```javascript
winner: totalWagerSOL * WINNER_SHARE,
treasury: totalWagerSOL * TREASURY_SHARE,
ops: totalWagerSOL * OPS_SHARE,
```

For the wager tier `0.1 SOL` (each player wagers 0.1, total pot = 0.2):
- `0.2 * 0.90 = 0.18` (exact)
- `0.2 * 0.07 = 0.014000000000000002` (IEEE 754 error)
- `0.2 * 0.03 = 0.006000000000000001` (IEEE 754 error)
- **Sum: 0.20000000000000004** (exceeds pot by ~4e-17 SOL)

For `0.05 SOL` each (pot = 0.1):
- `0.1 * 0.90 = 0.09` (exact)
- `0.1 * 0.07 = 0.007000000000000001` (error)
- `0.1 * 0.03 = 0.003` (exact)
- **Sum: 0.10000000000000002** (exceeds pot)

While the overshoot is sub-lamport today (1 lamport = 1e-9 SOL, error is ~1e-17), this is architecturally wrong for financial code. When the stub is replaced with real on-chain transfers, the overshoot will cause the last transfer to fail due to insufficient balance in the escrow.

**Exploit Scenario:**
When real settlement is implemented: escrow holds exactly `totalPot` lamports. Three sequential transfers are attempted. Due to floating-point overshoot, the third transfer requests more lamports than remain, causing the transaction to fail. The ops wallet never gets paid, or worse, the entire settlement reverts and nobody gets paid.

**Recommendation:**
All SOL math must use integer lamport arithmetic:
```javascript
export function calculateSettlement(totalWagerSOL) {
    const totalLamports = Math.round(totalWagerSOL * LAMPORTS_PER_SOL);
    const treasuryLamports = Math.floor(totalLamports * 7 / 100);
    const opsLamports = Math.floor(totalLamports * 3 / 100);
    // Winner gets the remainder — guarantees no overshoot
    const winnerLamports = totalLamports - treasuryLamports - opsLamports;
    return {
        winner: winnerLamports / LAMPORTS_PER_SOL,
        treasury: treasuryLamports / LAMPORTS_PER_SOL,
        ops: opsLamports / LAMPORTS_PER_SOL,
        winnerLamports,
        treasuryLamports,
        opsLamports,
    };
}
```

---

### ARITH-03: Wager amount from client is not type-checked — NaN/string/object wagers bypass validation

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:369-374`
**CWE:** CWE-20 (Improper Input Validation)

**Description:**
In the `createRoom` handler:
```javascript
const wagerAmount = player.wager || 0
if (wagerAmount > 0 && !isValidWager(wagerAmount)) { ... }
```
And `isValidWager` uses `WAGER_TIERS.includes(wagerSOL)`.

Problems:
1. If `player.wager` is `undefined` or `null`, it defaults to `0` (safe).
2. If `player.wager` is `NaN`, then `NaN || 0` evaluates to `0` (safe by accident).
3. If `player.wager` is a **string** like `"0.1"`, then `"0.1" || 0` = `"0.1"`, and `"0.1" > 0` = `true`, but `WAGER_TIERS.includes("0.1")` = `false` (strict equality, `"0.1" !== 0.1`), so it's rejected. However...
4. If `player.wager` is a **negative number** like `-0.1`, then `-0.1 > 0` = `false`, so the guard is skipped entirely, and `wagerStates[roomId].amount = -0.1`.
5. When settlement occurs: `totalPot = wagerSOL * 2 = -0.2`, and `settlement.winner = -0.2 * 0.90 = -0.18`. The winner is "paid" a **negative** amount — effectively money is deducted from the winner.
6. If `player.wager` is an **object**, `{} > 0` = `false` (NaN comparison), guard skipped, wager stored as object. Subsequent `wagerSOL * 2` = `NaN`, entire settlement breaks.

**Exploit Scenario:**
Attacker creates room with `wager: -0.5`. Guard `(-0.5 > 0)` is false so `isValidWager` is never called. Wager state stores `-0.5`. Opponent joins (balance check: `verifyBalance(wallet, 0)` since `roomWager = -0.5` but the `roomWager > 0` check on join also fails, so join proceeds with no balance check). At settlement, `totalPot = -1.0`, `winner payout = -0.9`. If on-chain transfers were live, this would be a negative transfer (invalid instruction, causing revert or undefined behavior).

**Recommendation:**
```javascript
const wagerAmount = Number(player.wager);
if (!Number.isFinite(wagerAmount) || wagerAmount < 0) {
    client.emit('createRoomError', { reason: 'Invalid wager amount' });
    return;
}
if (wagerAmount > 0 && !isValidWager(wagerAmount)) {
    client.emit('createRoomError', { reason: 'Invalid wager tier' });
    return;
}
```

---

### ARITH-04: Score accumulation uses uncapped addition — damage values can be NaN, contaminating all downstream logic

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:743-745`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
```javascript
for (const [playerId, dmg] of Object.entries(result.damage)) {
    ms.scores[playerId] = (ms.scores[playerId] || 0) + dmg
}
```
If `processShot` produces NaN damage (from NaN angle/power), then `dmg` is NaN, and `0 + NaN = NaN`. Once a score is NaN:
- `isRoundOver` still functions (based on turnCount, not score)
- `getRoundWinner` compares `NaN > playerScore` which is always `false`, so tiebreak to host fires
- `isMatchOver` compares `NaN >= winsNeeded` which is `false`, and `NaN !== NaN` so the draw check `hostScore !== playerScore` is `true`, then `NaN > playerScore` = `false`, so player wins by default

This creates a deterministic exploit: if the host sends NaN damage values, the score comparison always falls through to `playerScore > hostScore` even if `playerScore` is also NaN. The tiebreak logic becomes non-deterministic when both scores are NaN.

**Exploit Scenario:**
Attacker manipulates fire inputs to produce NaN damage. Score becomes NaN. Round winner determination becomes unreliable. In a wagered match, the wrong player could win the pot.

**Recommendation:**
Sanitize damage values before accumulation:
```javascript
for (const [playerId, dmg] of Object.entries(result.damage)) {
    const safeDmg = Number.isFinite(dmg) ? dmg : 0;
    ms.scores[playerId] = (ms.scores[playerId] || 0) + safeDmg;
}
```

---

## HIGH Findings

### ARITH-05: Gold economy has no upper bound — theoretical overflow at Number.MAX_SAFE_INTEGER

**Severity:** HIGH
**Location:** `server/services/gold.js:60-63`
**CWE:** CWE-190 (Integer Overflow)

**Description:**
Gold is accumulated via `goldState[shooterId] = (goldState[shooterId] || 0) + earned` with no upper cap. While JavaScript's `Number.MAX_SAFE_INTEGER` is ~9 quadrillion and gold starts at 1000, there is no theoretical cap preventing accumulation beyond safe integer range if the game runs long enough or damage values are manipulated.

More practically: `goldFromDamage` computes `Math.floor(damageDealt * 15)`. If an attacker sends a crafted shot that somehow produces very large damage (see ARITH-01 — if physics produces Infinity distance that is then used in damage calc with inverted sign), damage could be `Infinity`, and `Infinity * 15 = Infinity`. `Math.floor(Infinity) = Infinity`. Gold balance becomes `Infinity`.

With `Infinity` gold, the player can buy every weapon (all cost comparisons `Infinity >= cost` pass). The `spendGold` function would compute `Infinity - 700 = Infinity`, so balance never decreases.

**Exploit Scenario:**
1. Craft a fire event that makes `calculateDamage` produce a very large or infinite damage value
2. `earnGold` adds `Infinity` to gold balance
3. Player buys all weapons for free (balance remains Infinity after subtraction)
4. Unfair advantage in the match

**Recommendation:**
```javascript
const MAX_GOLD = 999999;
export function earnGold(goldState, shooterId, damageDealt) {
    const earned = goldFromDamage(damageDealt);
    goldState[shooterId] = Math.min(
        (goldState[shooterId] || 0) + earned,
        MAX_GOLD
    );
    return earned;
}
```

---

### ARITH-06: SHOT token emissions have no global supply cap enforcement

**Severity:** HIGH
**Location:** `server/services/shot-token.js:95-129`
**CWE:** CWE-190 (Integer Overflow), CWE-799 (Improper Control of Interaction Frequency)

**Description:**
`SHOT_TOKEN_CONFIG.rewardPool` is defined as `7_000_000` but `recordMatchPlayed` never checks against it. The function simply adds to `state.balance` whenever a milestone is reached. Over time (or via exploit), total emissions can exceed the reward pool cap.

The recurring milestone awards 500 SHOT every 50 matches after 100. At 1000 matches: `50 + 100 + 200 + 500 + 1000 + 2000 + (18 * 500) = 12,850 SHOT` per player. With enough players and matches, the 7M reward pool can be exhausted without any enforcement.

Additionally, since state is in-memory and per-process, a server restart resets all milestone tracking. A player can earn the "First Blood" 50 SHOT bonus every time the server restarts, since `playerShotState` is wiped.

**Exploit Scenario:**
1. Wait for server restart (or cause one via DoS)
2. Play one match to earn 50 SHOT "First Blood" again
3. Repeat ad infinitum, accumulating unlimited SHOT
4. When SHOT has real value (Raydium pool), sell accumulated tokens

**Recommendation:**
```javascript
let totalEmitted = 0;
// In recordMatchPlayed:
if (totalEmitted + ms.reward > SHOT_TOKEN_CONFIG.rewardPool) {
    // Cap reached — no more emissions
    break;
}
totalEmitted += ms.reward;
```
Also persist SHOT state to database (not just in-memory).

---

### ARITH-07: Monitoring stats accumulate floating-point SOL values — precision drift over time

**Severity:** HIGH
**Location:** `server/services/monitoring.js:94-101`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
```javascript
export function trackWager(amount) {
    stats.totalWagered += amount;
}
export function trackSettlement({ winnerPayout, treasuryFee, opsFee }) {
    stats.totalSettled += winnerPayout || 0;
    stats.totalTreasuryFees += treasuryFee || 0;
    stats.totalOpsFees += opsFee || 0;
}
```
These accumulate floating-point SOL values via repeated addition. After thousands of matches, the accumulated values will drift from the true sum. For a financial dashboard this is misleading.

Example: Adding `0.1` 10,000 times: `0.1 * 10000 = 1000` but `sum(0.1, 10000 times) = 999.9999999999062`.

**Exploit Scenario:**
No direct exploit, but the `/stats` dashboard (which is unauthenticated — see separate finding) would report incorrect SOL flow numbers, undermining trust and auditing.

**Recommendation:**
Track in lamports (integers) internally, convert to SOL only on display:
```javascript
stats.totalWageredLamports += Math.round(amount * 1e9);
// In getStats:
sol: { totalWagered: (stats.totalWageredLamports / 1e9).toFixed(9), ... }
```

---

### ARITH-08: createWeaponArray count/max parameters are unbounded — memory exhaustion

**Severity:** HIGH
**Location:** `server/socket-io/main.js:645-659`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Description:**
```javascript
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    var x, randomArray = []
    for (let index = 0; index < count; index++) {
        x = Math.floor(Math.random() * max)
        randomArray.push(x)
    }
    room.randomArray = randomArray
    ...
})
```
`count` and `max` come directly from the client with no validation. An attacker can send `count: 1e9` to allocate a ~8GB array, crashing the server with an OOM error.

Even `count: 1e7` would create a 10-million-element array, consuming ~80MB per room and blocking the event loop for several seconds during array creation.

`max` has a lesser concern: `Math.random() * Infinity = NaN`, `Math.floor(NaN) = NaN`, producing an array of NaN values. Not harmful, but incorrect.

**Exploit Scenario:**
1. Create room
2. Send `createWeaponArray` with `{count: 100000000, max: 10}`
3. Server attempts to allocate 100M-element array
4. Node.js process runs out of memory and crashes, affecting all other players

**Recommendation:**
```javascript
const MAX_WEAPON_ARRAY_SIZE = 50;
client.on('createWeaponArray', ({count, max}) => {
    var room = findRoom(client.roomId)
    if (!room) return
    const safeCount = Math.min(Math.max(0, Math.floor(Number(count) || 0)), MAX_WEAPON_ARRAY_SIZE);
    const safeMax = Math.min(Math.max(1, Math.floor(Number(max) || 1)), 100);
    var randomArray = []
    for (let index = 0; index < safeCount; index++) {
        randomArray.push(Math.floor(Math.random() * safeMax))
    }
    room.randomArray = randomArray
    ...
})
```

---

### ARITH-09: Terrain heightmap index out-of-bounds in physics when startX/startY are attacker-controlled

**Severity:** HIGH
**Location:** `server/services/physics.js:100-140`, `server/socket-io/main.js:671`
**CWE:** CWE-125 (Out-of-bounds Read)

**Description:**
`calculateImpact` reads `terrain[ix]` where `ix = Math.floor(x)`. The bounds check `ix >= 0 && ix < terrain.length` exists (line 120), preventing out-of-bounds array access for terrain collision. However, `startX`/`startY` from the client are used directly as the initial trajectory position. If `startX = -500`:
- First trajectory point is at x=-500
- `ix = -500`, the bounds check `ix <= 0` on line 107 returns an outOfBounds immediately
- Trajectory has only 2 points, no damage — it is a wasted turn

More concerning: the `generateTankPositions` function (line 395-403) reads `heightmap[hostX]` and `heightmap[playerX]` where indices are computed as:
```javascript
const hostX = Math.floor(width * 0.2 + Math.random() * width * 0.15)
```
This always produces values in range [240, 420) for width=1200, which is safe. However, the `terrainPath` handler (line 937-965) builds a heightmap from client-supplied path data and stores it as `room.heightmap`. While the interpolation loop clamps indices to [0, 1199], a malicious client can send path points with extreme values that produce heightmap entries outside normal game height (e.g., negative Y or Y > 534), which while not an array bounds issue, causes physics to behave unexpectedly.

**Exploit Scenario:**
1. Client sends `terrainPath` with crafted path points setting `heightmap[600] = -1000` (terrain surface far above screen)
2. Next `fire` event: projectile never reaches ground at x=600 because `iy >= terrain[ix]` means `iy >= -1000` is almost always true
3. Projectile registers as a terrain hit immediately on first frame past that X, landing at y=-1000
4. Damage calculations use this out-of-screen impact point — splash damage to tanks at y~400 is zero since distance > blastRadius
5. Terrain deformation at y=-1000 is harmless but incorrect

**Recommendation:**
- Validate `startX`/`startY` are within game bounds in the fire handler (see ARITH-01)
- Clamp heightmap values in `terrainPath` handler:
```javascript
heightmap[x] = Math.max(0, Math.min(Math.floor(p1.y + t * (p2.y - p1.y)), TERRAIN_HEIGHT));
```

---

### ARITH-10: Damage calculation can produce negative values that are accumulated as scores

**Severity:** HIGH
**Location:** `server/services/physics.js:172-208`, `server/socket-io/main.js:743-745`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
`calculateDamage` returns negative values for self-damage:
```javascript
damage[tank.id] = (damage[tank.id] || 0) - Math.floor(blastRadius * factor);
```
These negative values are accumulated into `ms.scores`:
```javascript
ms.scores[playerId] = (ms.scores[playerId] || 0) + dmg
```
A player can repeatedly shoot themselves (or near themselves for splash self-damage) to drive their own score deeply negative. This affects:
- `getRoundWinner`: compares scores, negative score always loses
- Gold earning: `earnGold` is only called for opponent damage (`playerId !== client.id && dmg > 0`), so self-damage does not affect gold — this is correct
- However, the round winner gets `ROUND_WIN_BONUS` gold, so the opponent benefits from the attacker's self-harm

While self-damage causing score loss is intentional game design, there is no floor on scores. A score of -999999 is possible and could interact unexpectedly with future features.

Also: `isMatchOver` tiebreak gives win to host (`return { isOver: true, winner: hostId }`). If both players have equal negative scores, host always wins. This is a bias, not a bug per se.

**Recommendation:**
Document that negative scores are intentional. Consider clamping minimum score to 0 or adding a minimum health mechanic. The host-favoring tiebreak should use a fair mechanism (e.g., random coin flip using crypto.getRandomValues).

---

### ARITH-11: Division-by-zero protection in terrain interpolation is fragile

**Severity:** HIGH
**Location:** `server/services/physics.js:364`, `server/socket-io/main.js:955`
**CWE:** CWE-369 (Divide By Zero)

**Description:**
Both `pathToHeightmap` (physics.js:364) and the terrain path handler (main.js:955) have:
```javascript
const t = (p2.x - p1.x) !== 0 ? (x - p1.x) / (p2.x - p1.x) : 0
```
This prevents division by zero when two consecutive path points have the same X. However, the `t` value is not clamped to [0, 1]. If `x` is outside the range `[p1.x, p2.x]` (which can happen due to `Math.floor` rounding), `t` can be < 0 or > 1, causing extrapolation rather than interpolation. The resulting heightmap value could be outside the expected range.

Example: `p1 = {x: 100.7, y: 200}`, `p2 = {x: 101.3, y: 400}`.
- `startX = Math.floor(100.7) = 100`
- `t = (100 - 100.7) / (101.3 - 100.7) = -0.7 / 0.6 = -1.167`
- `heightmap[100] = Math.floor(200 + (-1.167) * 200) = Math.floor(-33.3) = -34`

A negative heightmap value means terrain is "above the screen." Any projectile at x=100 with y >= -34 would register as a terrain hit (since `iy >= terrain[ix]` where `terrain[100] = -34`), meaning every projectile passing through x=100 hits "ground" immediately.

**Recommendation:**
Clamp `t` to `[0, 1]`:
```javascript
const t = (p2.x - p1.x) !== 0
    ? Math.max(0, Math.min(1, (x - p1.x) / (p2.x - p1.x)))
    : 0;
```

---

## MEDIUM Findings

### ARITH-12: Settlement split 90/7/3 sums to 100% only in theory — no runtime assertion

**Severity:** MEDIUM
**Location:** `server/services/solana.js:27-29`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
`WINNER_SHARE + TREASURY_SHARE + OPS_SHARE = 0.90 + 0.07 + 0.03 = 1.0` in IEEE 754 (this particular sum IS exact). However, there is no runtime assertion or compile-time check ensuring this invariant. If a developer changes one constant without updating the others, the split could silently exceed or fall short of 100%.

**Recommendation:**
```javascript
const TOTAL_SHARE = WINNER_SHARE + TREASURY_SHARE + OPS_SHARE;
if (Math.abs(TOTAL_SHARE - 1.0) > 1e-10) {
    throw new Error(`Settlement shares sum to ${TOTAL_SHARE}, expected 1.0`);
}
```
Better yet, use the remainder pattern (see ARITH-02 recommendation).

---

### ARITH-13: Gold `spendGold` allows zero-cost purchases to succeed without inventory limit

**Severity:** MEDIUM
**Location:** `server/services/gold.js:101-103`, `server/socket-io/main.js:515-571`
**CWE:** CWE-284 (Improper Access Control)

**Description:**
```javascript
if (cost === 0) {
    return { success: true, balance };
}
```
Free weapons (cost=0) always succeed in `spendGold`. The `buyWeapon` handler checks `inventory[client.id].includes(weaponId)` to prevent duplicate purchases, which is correct. However, there is no limit on total inventory size. A client could potentially try to buy weapons not in the catalog if weaponId validation is bypassed (it is not currently — `getWeapon` returns null for unknown IDs).

The real concern: `weapon.goldCost` comes from `WEAPON_CATALOG` which is static. But the `buyWeapon` handler passes `weapon.goldCost` to `spendGold`. If `weapon.goldCost` were somehow `undefined`, it would be treated as `NaN` in the comparisons, and `NaN < 0` is false, `NaN === 0` is false, `balance < NaN` is false, so the code falls through to the deduction: `goldState[playerId] = balance - NaN = NaN`. Gold balance becomes NaN permanently.

This requires `goldCost` to be missing from the weapon definition, which currently does not happen (all entries have it). But it's a latent bug if new weapons are added without `goldCost`.

**Recommendation:**
```javascript
export function spendGold(goldState, playerId, cost) {
    const numCost = Number(cost);
    if (!Number.isFinite(numCost) || numCost < 0) {
        return { success: false, balance: goldState[playerId] || 0, reason: 'Invalid cost' };
    }
    // ... rest of function
}
```

---

### ARITH-14: Physics MAX_TRAJECTORY_STEPS loop can be CPU-intensive with valid inputs

**Severity:** MEDIUM
**Location:** `server/services/physics.js:70-83`
**CWE:** CWE-400 (Uncontrolled Resource Consumption)

**Description:**
`MAX_TRAJECTORY_STEPS = 3000`. Each step performs 4 floating-point ops plus a push to the array. For a power=0 shot (projectile drops straight down), the loop runs until `y >= TERRAIN_HEIGHT` which happens quickly. But for a high-angle, high-power shot that arcs upward and then comes back down near the terrain edge, all 3000 steps may execute.

3000 iterations is not catastrophic (~0.1ms), but when multiplied by rapid-fire exploit (see concurrent fire issue), many trajectories could be calculated simultaneously. With multi-shot weapons like `Crazy Ivan` (count: 15) or `Hail Storm` (count: 10), each sub-projectile would need its own trajectory calculation, but the current `processShot` only calculates one trajectory. If multi-projectile support is added later, 15 * 3000 = 45,000 steps per shot.

**Recommendation:**
Current implementation is acceptable. Add a comment documenting the CPU budget. When multi-projectile weapons are implemented, cap total steps across all sub-projectiles.

---

### ARITH-15: weaponId from client is not type-validated in fire handler

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:692-695`
**CWE:** CWE-20 (Improper Input Validation)

**Description:**
```javascript
if (!WEAPON_DATA[weaponId]) {
    client.emit('fireRejected', { reason: 'Invalid weapon' })
    return
}
```
`WEAPON_DATA` is keyed by integer IDs (`0, 1, 2, ...`). If `weaponId` is a string like `"0"`, JavaScript object lookup `WEAPON_DATA["0"]` works because object keys are strings. So string weapon IDs pass validation.

If `weaponId` is `"__proto__"` or `"constructor"`, `WEAPON_DATA["__proto__"]` returns `Object.prototype` (an object, truthy) — validation passes! Then `weapon = WEAPON_DATA["__proto__"]` which is `Object.prototype`, and `weapon.blastRadius` is `undefined`, `weapon.damageFactor` is `undefined`. The `calculateDamage` function would use `undefined` for blast radius, causing `Math.sqrt(undefined) = NaN`, and no damage is dealt. The `deformTerrain` call would get `blastRadius = undefined`, and the crater loop `cx - undefined = NaN` so no terrain changes. Essentially a no-op shot, but it is a prototype pollution vector that could be dangerous if WEAPON_DATA is ever mutated.

**Recommendation:**
```javascript
const weaponIdNum = Number(weaponId);
if (!Number.isInteger(weaponIdNum) || !WEAPON_DATA.hasOwnProperty(weaponIdNum)) {
    client.emit('fireRejected', { reason: 'Invalid weapon' });
    return;
}
```

---

### ARITH-16: Terrain generation while-loop has no safety exit

**Severity:** MEDIUM
**Location:** `server/services/physics.js:280-302`
**CWE:** CWE-835 (Loop with Unreachable Exit Condition)

**Description:**
```javascript
while (x !== width + 200) {
    ...
    x = prevX + radius * Math.cos(angle);
    ...
    if (x > width + 200) x = width + 200;
    ...
}
```
The exit condition is `x !== width + 200` (i.e., `x !== 1400`). The loop increments `x` by `radius * Math.cos(angle)`, and if `x` overshoots, it is clamped to exactly 1400 on the next iteration. However:
1. If `Math.cos(angle)` is very close to 0, the X increment is near-zero, and the loop could take thousands of iterations
2. `radius = Math.floor(random() * 30 + 10)` gives values 10-39. `Math.cos(angle)` ranges from -1 to 1. So x can decrease as well as increase.
3. With the seeded PRNG, certain seeds could produce adversarial angle sequences that keep x oscillating near width+200 without hitting it exactly. The `if (x > width + 200) x = width + 200` clamp handles overshooting, but if `x` approaches from below and stays just below, the loop continues.

Starting from `x = -200`, the terrain needs to traverse 1600 units. With minimum step ~10 * cos(angle), worst case ~160 iterations. This is fast. But with negative cos(angle) values, `x` can decrease, and the loop could theoretically run indefinitely if the PRNG produces a pathological sequence of negative-x angles. The `if (x > width + 200)` clamp only fires when x overshoots, not when x goes backward.

**Recommendation:**
Add a maximum iteration count:
```javascript
let maxIter = 10000;
while (x !== width + 200 && --maxIter > 0) { ... }
```

---

### ARITH-17: verifyBalance fee estimate is hardcoded — could be insufficient

**Severity:** MEDIUM
**Location:** `server/services/solana.js:88`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
```javascript
const required = wagerSOL + 0.01;
```
The 0.01 SOL buffer for transaction fees is a rough estimate. Solana transaction fees are typically 5000 lamports (0.000005 SOL) per signature, but priority fees can be much higher during congestion. The 0.01 SOL buffer is generous for normal conditions, but:
1. If the escrow requires multiple transactions (deposit + confirm), fees compound
2. Compute unit pricing for complex transactions can exceed 0.01 SOL during high congestion

More importantly, `0.1 + 0.01 = 0.11000000000000001` due to floating point, which means the `balance >= required` comparison might reject a user with exactly 0.11 SOL (since `0.11 >= 0.11000000000000001` is `false`). This is a rounding edge case.

**Recommendation:**
Use lamport arithmetic for the comparison, or add a small epsilon:
```javascript
const requiredLamports = Math.ceil(wagerSOL * LAMPORTS_PER_SOL) + 10_000_000; // 0.01 SOL in lamports
const sufficient = lamports >= requiredLamports;
```

---

### ARITH-18: Gold earnGold allows negative damageDealt through unchecked physics results

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:750-755`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
In the fire handler:
```javascript
for (const [playerId, dmg] of Object.entries(result.damage)) {
    if (playerId !== client.id && dmg > 0) {
        goldEarned += earnGold(gold, client.id, dmg)
    }
}
```
The `dmg > 0` check correctly filters out self-damage (negative values). However, the damage map from `calculateDamage` uses player tank IDs as keys. The `playerId !== client.id` check ensures we only count damage TO the opponent, not self-damage.

The issue: the damage map could contain entries where the opponent's damage is negative (if the opponent shot themselves). Wait -- no, this is the CURRENT player's shot. The damage map contains entries for ALL tanks hit by THIS shot. If the shooter hits both themselves (negative damage) and the opponent (positive damage), both are in the map. The filter correctly picks only opponent positive damage.

However, there is a subtle issue: if `result.damage` contains a key that is neither `client.id` nor the opponent's ID (theoretically impossible, but if tank positions contained extra entries), gold would be awarded for "phantom" damage.

This is more of a defense-in-depth concern than an active exploit.

**Recommendation:**
Validate that damage keys correspond to actual players in the room before awarding gold.

---

### ARITH-19: Match `turnsPerRound` is fixed at 20 but never enforced in fire handler

**Severity:** MEDIUM
**Location:** `server/services/match.js:95`, `server/socket-io/main.js:758-762`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
`createMatchState` sets `turnsPerRound: 20`, and `isRoundOver` checks `turnCount >= turnsPerRound`. The fire handler increments `ms.turnCount++` on every fire. However, the turn count increment happens BEFORE the `isRoundOver` check. This means on turn 20, the check fires and the round ends. But between `ms.turnCount++` (line 759) and the `isRoundOver` check (line 786), the turn result is broadcast. So both the 20th turn result AND the roundEnd/matchEnd events are emitted. This is correct behavior (last turn produces results then round ends).

However, since the fire handler is `async` and there is no mutex, two rapid fire events could both see `turnCount = 19`, both increment to 20, and both trigger `isRoundOver`. This would cause double roundEnd events, double gold bonuses, and potentially double settlement. See race condition audit for details.

**Recommendation:**
Add a turn-processing lock per room, or validate `turnCount < turnsPerRound` at the start of the fire handler.

---

## LOW Findings

### ARITH-20: seededRandom uses mulberry32 which has known uniformity weaknesses

**Severity:** LOW
**Location:** `server/services/physics.js:376-385`
**CWE:** CWE-330 (Use of Insufficiently Random Values)

**Description:**
The mulberry32 PRNG is adequate for terrain generation (no security requirement). However, the seed is generated via `Math.floor(Math.random() * 1000000)` (line 881 of main.js), which only provides ~20 bits of entropy (1M possible seeds). A determined player could precompute all possible terrains to gain a tactical advantage.

**Recommendation:**
Use `crypto.getRandomValues()` for the seed to provide full 32-bit entropy. For terrain generation this is low priority since both players see the same terrain.

---

### ARITH-21: `Math.floor(Math.random() * 1)` always produces 0

**Severity:** LOW
**Location:** `server/services/physics.js:281`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
```javascript
const factor = Math.floor(random() * 1); // Always 0
```
This is documented with the comment `// Always 0`, suggesting it was copied from the client code where it may have originally used a different multiplier. The `if (factor === 0)` check on line 292 therefore always passes. This is dead code that could confuse future developers.

**Recommendation:**
Remove the dead branch:
```javascript
// factor logic removed — always 0 in original client code
const radius = Math.floor(random() * 30 + 10);
// ... (remove the if (factor === 0) wrapper)
```

---

### ARITH-22: Tank position offset -15 is a magic number with no bounds check

**Severity:** LOW
**Location:** `server/services/physics.js:401-402`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
```javascript
host: { x: hostX, y: heightmap[hostX] - 15 },
player: { x: playerX, y: heightmap[playerX] - 15 }
```
If `heightmap[hostX]` is very small (e.g., 10), then `y = 10 - 15 = -5`. The tank is positioned above the screen. This is unlikely with normal terrain generation (typical heights are 200-500) but possible with adversarial terrain data.

**Recommendation:**
```javascript
host: { x: hostX, y: Math.max(0, heightmap[hostX] - 15) },
```

---

### ARITH-23: Weapon damage factor ratios are inconsistent between physics.js and Weapon.js

**Severity:** LOW
**Location:** `server/services/physics.js:16-30`, `server/models/Weapon.js:24-38`
**CWE:** CWE-682 (Incorrect Calculation)

**Description:**
`physics.js` WEAPON_DATA defines damage factors as fractions like `60/46 = 1.3043...`, while `Weapon.js` WEAPON_CATALOG defines `damageFactor: 1.30`. These are different values:
- Physics: `60/46 = 1.30434782608...`
- Catalog: `1.30`

Similarly for Big Shot:
- Physics: `30/90 = 0.33333...`
- Catalog: `0.33`

The physics engine uses `WEAPON_DATA` for actual calculations, while `WEAPON_CATALOG` is used for shop display. This means the damage displayed to the player in the shop may differ slightly from actual in-game damage. For Single Shot: physics deals `ceil(46 * 1.3043) = ceil(60) = 60` damage on direct hit, while the catalog would suggest `ceil(46 * 1.30) = ceil(59.8) = 60`. Same result due to ceiling. But for Sniper Rifle: physics `40/40 = 1.0`, catalog `3.75`. These are completely different — physics says direct hit = `ceil(40 * 1.0) = 40`, catalog suggests `ceil(40 * 3.75) = 150`. This is a significant gameplay discrepancy (only matters when/if the catalog damageFactor is used for anything besides display).

**Recommendation:**
Unify the weapon data into a single source of truth. Either physics.js imports from Weapon.js or vice versa. Currently both define their own sets.

---

### ARITH-24: Monitoring completionRate division by zero is guarded but format is inconsistent

**Severity:** LOW
**Location:** `server/services/monitoring.js:185-187`
**CWE:** CWE-369 (Divide By Zero)

**Description:**
```javascript
completionRate: stats.matchesCreated > 0
    ? ((stats.matchesCompleted / stats.matchesCreated) * 100).toFixed(1) + '%'
    : '0%',
```
Division by zero is properly guarded. However, `.toFixed(1)` returns a string, and concatenating `+ '%'` produces `"85.3%"`. The rest of the stats object uses numbers for SOL amounts (via `.toFixed(4)`). This inconsistency could confuse dashboard consumers.

**Recommendation:**
Minor — keep as-is or normalize all display values.

---

## INFO Findings

### ARITH-25: JavaScript Number type is IEEE 754 double — inherently unsuitable for financial math

**Severity:** INFO
**Location:** Entire codebase

**Description:**
All numeric values in the codebase use JavaScript's `Number` type (IEEE 754 64-bit double). This provides 53 bits of integer precision (~9 quadrillion) and introduces rounding errors for decimal fractions. For SOL amounts, the smallest unit is 1 lamport (1e-9 SOL), so all SOL math should use integer lamport values to avoid precision issues.

Current impact is minimal because settlement is a stub. When real transfers are implemented, all SOL arithmetic must be in lamports.

**Recommendation:**
Adopt a project convention: all SOL values stored and computed as lamports (integers). Convert to SOL only at API boundaries (display, client communication).

---

### ARITH-26: `isRoundOver` uses `>=` comparison which is correct but relies on turnCount incrementing by exactly 1

**Severity:** INFO
**Location:** `server/services/match.js:125-127`

**Description:**
```javascript
export function isRoundOver(matchState) {
    return matchState.turnCount >= matchState.turnsPerRound;
}
```
The `>=` is correct and safely handles the edge case where turnCount might somehow skip past the exact turnsPerRound value (e.g., due to race condition incrementing twice). This is good defensive coding.

---

### ARITH-27: wagerStates keyed by roomId — playAgainRequest deletes wager state for rematches

**Severity:** INFO
**Location:** `server/socket-io/main.js:1019`

**Description:**
```javascript
delete wagerStates[client.roomId]
```
When both players click "play again," the wager state is deleted. The rematch has no wager. This is presumably intentional (rematches are free), but is not documented. If a player expects their wager to carry over to a rematch, they would be surprised.

---

## Cross-Cutting Recommendations

### R1: Centralized Input Sanitization Layer
Create a `sanitize.js` utility:
```javascript
export function safeNumber(val, min, max, fallback = 0) {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

export function safeInt(val, min, max, fallback = 0) {
    return Math.floor(safeNumber(val, min, max, fallback));
}
```
Apply to all client-provided numeric inputs before any computation.

### R2: Adopt Lamport-Based SOL Arithmetic
Replace all `wagerSOL` floats with `wagerLamports` integers throughout the codebase. Convert at input (client sends SOL, server converts to lamports immediately) and output (server converts lamports to SOL for display).

### R3: Add Defensive Assertions in Physics Engine
At the top of `processShot`, add:
```javascript
if (!Number.isFinite(angle) || !Number.isFinite(power) ||
    !Number.isFinite(startX) || !Number.isFinite(startY)) {
    return { trajectory: [], impact: null, damage: {}, newTerrain: terrain };
}
```

### R4: Cap All Accumulator Values
Gold, SHOT, scores, and monitoring stats should all have explicit maximum values to prevent overflow or Infinity propagation.

### R5: Unify Weapon Data Source
Merge `WEAPON_DATA` (physics.js) and `WEAPON_CATALOG` (Weapon.js) into a single authoritative source to prevent desync.

---

## Appendix: Arithmetic Safety Matrix

| Input Path | Type Check | Finite Check | Range Clamp | Safe? |
|---|---|---|---|---|
| fire.angle | NONE | NONE | NONE | NO |
| fire.power | NONE | NONE | NONE | NO |
| fire.startX | NONE | NONE | NONE | NO |
| fire.startY | NONE | NONE | NONE | NO |
| fire.weaponId | NONE (object lookup) | N/A | N/A | PARTIAL |
| createRoom.wager | `\|\| 0` fallback | NONE | `> 0` only | NO |
| joinRoom.wager | Via wagerStates | NONE | `> 0` only | NO |
| buyWeapon.weaponId | getWeapon null check | N/A | N/A | OK |
| buyWeapon.cost | From WEAPON_CATALOG | N/A | `< 0` check | OK |
| createWeaponArray.count | NONE | NONE | NONE | NO |
| createWeaponArray.max | NONE | NONE | NONE | NO |
| Settlement SOL math | N/A | N/A | N/A | NO (float) |
| Gold accumulation | N/A | NONE | NONE | NO (no cap) |
| SHOT accumulation | N/A | NONE | NONE | NO (no cap) |
| Score accumulation | N/A | NONE | NONE | NO (no cap) |
| Terrain heightmap | Bounds-checked | N/A | Partial | PARTIAL |
