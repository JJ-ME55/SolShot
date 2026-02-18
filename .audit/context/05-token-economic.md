# 05 - Token & Economic Security Audit

**Auditor focus:** Gold economy, SHOT token emissions, SOL wager settlement, prestige system, economic griefing vectors.

**Files analyzed:**
- `server/services/gold.js` (115 LOC)
- `server/services/shot-token.js` (217 LOC)
- `server/services/solana.js` (209 LOC)
- `server/services/match.js` (178 LOC)
- `server/services/physics.js` (459 LOC)
- `server/services/monitoring.js` (212 LOC)
- `server/services/raydium.js` (73 LOC)
- `server/socket-io/main.js` (1059 LOC)
- `server/middleware/auth.js` (139 LOC)
- `server/models/Weapon.js` (113 LOC)
- `server/models/Match.js` (61 LOC)
- `server/index.js` (60 LOC)

---

## Finding E-01: Gold Earned From Self-Damage Calculation Loophole

**Severity:** HIGH
**Location:** `server/socket-io/main.js:750-755`, `server/services/physics.js:189-201`

**Description:**
The Gold-earning logic in the `fire` handler awards Gold for any damage entry where `playerId !== client.id && dmg > 0`. However, the physics engine (`calculateDamage`) uses negative values for self-damage and positive values for opponent damage. The vulnerability is that the damage map keys are the *recipient* of damage (the tank hit), not the dealer. When player A fires and hits player B, `result.damage[B_id] = +60`. The Gold loop then checks `if (playerId !== client.id && dmg > 0)`, which correctly identifies B as the target. This part is actually **correct**.

However, there is a subtler issue: when a projectile deals splash damage, the `calculateDamage` function accumulates damage per tank with `(damage[tank.id] || 0) + ...`. If a weapon hits the ground between both tanks and splashes both, the shooter gets negative self-damage AND the opponent gets positive damage, which correctly awards Gold only for opponent damage. The logic is sound for standard weapons.

**BUT** -- the `fire` handler at line 671 does **not validate `angle` or `power` bounds**. A client can send `power: 0` with a carefully chosen angle that causes the projectile to land directly on themselves, dealing self-damage only. Since self-damage is negative, no Gold is awarded. This is not directly exploitable for Gold inflation. Reclassifying:

**Revised severity:** LOW (no Gold exploit, but unbounded inputs remain a concern -- see E-10).

---

## Finding E-02: Gold State Not Reset Between Rounds (Accumulation by Design, but Carry-Over Risk)

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:420-507` (ready handler), `server/socket-io/main.js:786-870` (round end vs match end)

**Description:**
Gold is initialized once at match start (when both players ready up) via `initGold()` at lines 423 and 469. Each player starts with 1,000 Gold. During gameplay, Gold accumulates from damage dealt. When a round ends (but the match is not over), the `roundEnd` event is emitted at line 863, and the match transitions to `ROUND_END`. However, **Gold state is never reset between rounds**. The match state's `turnCount` is incremented but never reset to 0 for the next round, meaning `isRoundOver()` will return true forever after the first round ends.

**Exploit scenario:**
In a BO3 or BO5 match, after round 1 ends, `turnCount` stays >= `turnsPerRound` (20). Every subsequent fire will immediately trigger `isRoundOver()` again. The match state machine transitions `ROUND_END -> WEAPON_SHOP -> BATTLE`, but as soon as any fire happens, the round immediately ends again because `turnCount` was never reset. This means:
1. Gold accumulated in round 1 carries into round 2's shop phase (intended? likely yes).
2. But `turnCount` never resets, so round 2 ends after 0 actual turns of play.
3. A player who dominated round 1 (earned lots of Gold) immediately wins subsequent rounds with no gameplay.

**Root cause:** `createMatchState` initializes `turnCount: 0` but there is no round-reset function. The `currentRound` is incremented at line 793 but `turnCount` is not reset.

**Recommendation:**
After `roundEnd` emission, reset `ms.turnCount = 0` and `ms.scores = {}` (or per-round scores). Add a `resetRound(ms)` function to `match.js`.

---

## Finding E-03: SHOT Token Milestones -- No Match Completion Validation

**Severity:** CRITICAL
**Location:** `server/services/shot-token.js:95-129`, `server/socket-io/main.js:838-850`

**Description:**
`recordMatchPlayed(walletAddress)` increments `state.matchesPlayed++` unconditionally and checks milestones. It is called at main.js:844-849 inside the `matchEnd` block. The function itself has **no deduplication** -- it trusts that the caller invokes it exactly once per completed match. However, there is no match ID or nonce passed to prevent double-counting.

**Exploit scenario (SHOT inflation via play-again loop):**
1. Two colluding players create a room with 0 wager.
2. They play a trivially fast match (20 turns of deliberate misses -- fire out of bounds with angle 0, power 0).
3. Match completes, both earn SHOT milestone credit.
4. Both click "playAgain" -- `playAgainRequest` at line 1004 resets match state, Gold, and wager, then emits `playAgain`.
5. Repeat rapidly. Each match takes ~20 socket events (fire with instant miss).
6. Since the match state machine is fully in-memory and there is no rate limit, players can grind matches extremely fast.
7. Each completion calls `recordMatchPlayed()`, incrementing `matchesPlayed`.

While milestone deduplication (`milestonesEarned.includes(ms.matches)`) prevents claiming the same milestone twice, the recurring milestone at line 114 awards 500 SHOT every 50 matches after 100. Two colluding players can grind unlimited 500-SHOT payouts by farming completions.

**Economic impact:** The 7M SHOT reward pool has no enforcement. There is no global counter tracking total emissions against the 7M cap. `trackShotEmission()` in monitoring.js is purely informational. A grinder can drain the entire conceptual reward pool.

**Recommendation:**
1. Add a global `totalEmitted` counter in `shot-token.js` that caps at `SHOT_TOKEN_CONFIG.rewardPool` (7M).
2. Add minimum match duration or minimum damage threshold to qualify for SHOT rewards.
3. Rate-limit `recordMatchPlayed()` per wallet (e.g., max 1 per 60 seconds).
4. Pass a match ID to `recordMatchPlayed()` and track claimed match IDs to prevent double-counting.

---

## Finding E-04: SHOT Reward Pool Has No Supply Cap Enforcement

**Severity:** CRITICAL
**Location:** `server/services/shot-token.js:95-129`, `server/services/shot-token.js:29-39`

**Description:**
`SHOT_TOKEN_CONFIG.rewardPool` is defined as 7,000,000 but is purely a documentation constant. The `recordMatchPlayed()` function adds rewards to `state.balance` without ever checking if total emissions across all players have exceeded 7M. The `totalShotEmitted` counter in monitoring.js is informational only and is not consulted before awarding tokens.

**Exploit scenario:**
Even without collusion, organic gameplay over time will eventually exceed the 7M pool because there is no enforcement. Once the reward pool is conceptually "drained," the system continues to emit tokens, inflating supply beyond the advertised 10M total.

**Recommendation:**
```js
let globalEmitted = 0;
const REWARD_CAP = SHOT_TOKEN_CONFIG.rewardPool; // 7M

function recordMatchPlayed(walletAddress) {
    // ... existing logic ...
    if (globalEmitted + totalEarned > REWARD_CAP) {
        totalEarned = Math.max(0, REWARD_CAP - globalEmitted);
    }
    globalEmitted += totalEarned;
    state.balance += totalEarned;
}
```

---

## Finding E-05: Prestige Burn Is Reversible via Server Restart

**Severity:** HIGH
**Location:** `server/services/shot-token.js:64-65`, `server/services/shot-token.js:137-173`

**Description:**
All SHOT token state is stored in `const playerShotState = {}` -- a plain in-memory object. When the server restarts, all state is lost:
- Balances reset to 0
- `matchesPlayed` resets to 0
- `milestonesEarned` resets to `[]`
- `prestigeTier` resets to 0
- `totalBurned` resets to 0

**Exploit scenario:**
1. Player earns 4,000 SHOT through milestones, reaches Diamond prestige (tier 4), burning 200+500+1200+4000 = 5,900 SHOT total.
2. Server restarts (crash, deploy, maintenance).
3. Player's state resets to tier 0 with 0 balance.
4. Player re-grinds milestones and earns another 3,850 SHOT from milestones (50+100+200+500+1000+2000).
5. The previously burned 5,900 SHOT is effectively "unburned" -- the deflationary mechanism is reversed.
6. The player can prestige again, burning SHOT that was already supposed to be permanently removed from circulation.

**Impact:** The prestige burn mechanism, designed to be deflationary, becomes inflationary over server restarts. The total burned amount is fictional.

**Recommendation:**
1. Persist `playerShotState` to MongoDB (or Redis) on every mutation.
2. On server start, load state from DB.
3. Track burns on-chain when the SPL token is deployed.

---

## Finding E-06: SOL Settlement Is a Stub -- No Actual Transfers

**Severity:** CRITICAL
**Location:** `server/services/solana.js:139-163`

**Description:**
`settleMatch()` performs zero on-chain transactions. It calculates the settlement split and returns `{ success: true, txSignature: null }`. The function is a complete stub. This means:
1. No SOL is actually transferred to winners.
2. No SOL is deposited into escrow at match start.
3. The entire wager system is purely cosmetic.

While this is acknowledged as "future: escrow program," the client receives `matchSettled` events with `settlement` data, presenting the illusion that SOL has moved. If players believe wagers are real, this constitutes a deceptive UX.

**Exploit scenario:**
1. Player A creates a 0.5 SOL wager room. No deposit is taken.
2. Player B joins. No deposit is taken.
3. Player A wins. Server emits `matchSettled` with `winnerPayout: 0.9 SOL`. No transfer occurs.
4. Both players' wallets are unchanged. The "wager" was meaningless.
5. Alternatively: a malicious operator could claim wagers are real, collect SOL off-chain through social engineering, and never settle.

**Recommendation:**
1. Either implement escrow (even a server-side custodial transfer) or disable wager creation entirely.
2. If wagers are not yet functional, reject `wager > 0` in `createRoom` with a clear message.
3. Never show settlement amounts to users without a real `txSignature`.

---

## Finding E-07: Winner Can Never Claim More Than Pot (Split Math Is Correct)

**Severity:** INFORMATIONAL
**Location:** `server/services/solana.js:27-29`, `server/services/solana.js:121-127`

**Description:**
The settlement split constants are `0.90 + 0.07 + 0.03 = 1.00` exactly. JavaScript floating-point confirms:
```js
0.90 + 0.07 + 0.03 === 1.0  // true (this specific combination is exact in IEEE 754)
```
The `calculateSettlement` function computes each share as `totalWagerSOL * share`. For typical wager values (0.01, 0.05, 0.1, 0.25, 0.5 SOL), the results are:

| Total Pot | Winner (90%) | Treasury (7%) | Ops (3%) | Sum |
|-----------|-------------|---------------|----------|-----|
| 0.02 | 0.018 | 0.0014 | 0.0006 | 0.02 |
| 0.10 | 0.09 | 0.007 | 0.003 | 0.10 |
| 0.20 | 0.18 | 0.014 | 0.006 | 0.20 |
| 0.50 | 0.45 | 0.035 | 0.015 | 0.50 |
| 1.00 | 0.90 | 0.07 | 0.03 | 1.00 |

All sums are exact for the defined tiers. However, when converting to lamports (integers), truncation could cause a 1-lamport discrepancy. This is not exploitable given the stub settlement, but should be addressed when real transfers are implemented.

**Recommendation:**
When implementing real transfers, compute `opsLamports = totalLamports - winnerLamports - treasuryLamports` (remainder-based) instead of multiplying each share independently.

---

## Finding E-08: Wager Validation Allows Type Confusion

**Severity:** HIGH
**Location:** `server/socket-io/main.js:369-374`, `server/services/solana.js:111-113`

**Description:**
The `createRoom` handler extracts `wagerAmount = player.wager || 0`. This uses JavaScript's falsy coercion: `null`, `undefined`, `""`, `0`, `false`, and `NaN` all become `0`. The validation `isValidWager(wagerAmount)` uses `WAGER_TIERS.includes(wagerSOL)`.

`WAGER_TIERS = [0, 0.01, 0.05, 0.1, 0.25, 0.5]`

**Exploit scenarios:**

1. **String injection:** Client sends `wager: "0.1"`. `"0.1" || 0` = `"0.1"`. `WAGER_TIERS.includes("0.1")` = `false` (strict equality, string !== number). The check `wagerAmount > 0` evaluates `"0.1" > 0` = `true`, so validation runs. `isValidWager("0.1")` returns `false`, so it rejects. This path is safe.

2. **NaN injection:** Client sends `wager: NaN`. `NaN || 0` = `0`. This creates a free room. No harm.

3. **Negative wager:** Client sends `wager: -0.1`. `-0.1 || 0` = `-0.1`. `-0.1 > 0` = `false`, so validation is skipped. `wagerStates[roomId] = { amount: -0.1, ... }`. A negative wager is stored. During settlement: `totalPot = -0.1 * 2 = -0.2`. `settlement.winner = -0.2 * 0.9 = -0.18`. This would mean the "winner" owes SOL. With the stub, no harm, but with real transfers this would reverse the payment direction.

4. **Infinity wager:** Client sends `wager: Infinity`. `Infinity > 0` = `true`. `WAGER_TIERS.includes(Infinity)` = `false`. Rejected. Safe.

5. **Wager of exactly 0:** Bypasses the `> 0` check, stored as 0. No issue.

**The real bug:** Negative wagers bypass all validation because the `if (wagerAmount > 0)` guard is only checked before calling `isValidWager`. Negative values skip this entire block and are stored directly.

**Recommendation:**
```js
const wagerAmount = Number(player.wager) || 0;
if (wagerAmount !== 0 && !isValidWager(wagerAmount)) {
    client.emit('createRoomError', { reason: 'Invalid wager tier' });
    return;
}
```
Also add to `isValidWager`: `if (typeof wagerSOL !== 'number' || !isFinite(wagerSOL)) return false;`

---

## Finding E-09: Free-Play Room Cannot Be Converted to Wager Mid-Match

**Severity:** INFORMATIONAL
**Location:** `server/socket-io/main.js:368-378`

**Description:**
The wager amount is set at room creation time (line 375) and stored in `wagerStates[roomId]`. There is no socket event that allows modifying `wagerStates[roomId].amount` after creation. The `joinRoom` handler reads the existing wager state (line 294-295) but never writes to `ws.amount`. The `playAgainRequest` handler (line 1019) deletes `wagerStates[client.roomId]` entirely, and the new match starts with no wager state.

**Assessment:** A free-play room cannot be converted to a wager room mid-match through normal socket events. However, since there is no input validation on the raw socket data, a modified client could attempt to inject additional properties, but none of the handlers would read them as wager modifications.

**Recommendation:** No action required for this specific vector. The `playAgainRequest` wager deletion is actually a separate concern (see E-12).

---

## Finding E-10: Fire Handler Lacks Bounds Validation on angle/power

**Severity:** HIGH
**Location:** `server/socket-io/main.js:671`

**Description:**
The `fire` event handler accepts `{angle, power, weaponId, startX, startY}` with no numeric bounds validation:
- `angle`: No check. Should be `[0, 2*PI]`. Value of `NaN` or `Infinity` will produce `NaN` trajectory coordinates.
- `power`: No check. Should be `[0, 100]`. Negative power reverses trajectory. `power: 1000000` sends projectile at 8,000,000 velocity, instantly out of bounds (no damage, no Gold -- just wasted turn). But `power: -100` or extremely small negative values could aim the projectile backward onto the shooter's own position for self-damage manipulation.
- `startX`, `startY`: No check. A player can claim their turret is at position (600, 100) -- directly above the opponent -- regardless of actual tank position. The server stores tank positions in `room.host.pos` / `room.player.pos` (line 700-717) and passes them to physics, but `startX/startY` from the client overrides the launch point. The physics engine uses the client-provided `startX/startY` as the projectile origin, NOT the server's stored tank position.

**Exploit scenario (Gold farming via arbitrary startX/startY):**
1. Player fires with `startX` directly above opponent tank, `power: 1`, `angle: PI/2` (straight down).
2. Projectile spawns above opponent and immediately hits them for full damage.
3. Player earns Gold from damage dealt: `Math.floor(damage * 15)`.
4. With weapon 0 (Single Shot), max damage = `ceil(46 * 60/46) = 60 HP`. Gold = `floor(60 * 15) = 900 Gold`.
5. Repeat every turn. In 10 turns, earn 9,000 Gold -- enough to buy any weapon.

**Impact:** Complete Gold economy bypass. Any player can earn maximum Gold every turn regardless of skill.

**Recommendation:**
Replace client-provided `startX/startY` with server-authoritative tank positions:
```js
const shooterPos = client.isHost ? room.host.pos : room.player.pos;
const startX = shooterPos.x;  // Ignore client value
const startY = shooterPos.y;  // Ignore client value
```
Add bounds validation:
```js
if (typeof angle !== 'number' || !isFinite(angle)) return;
if (typeof power !== 'number' || !isFinite(power) || power < 0 || power > 100) return;
```

---

## Finding E-11: Weapon Purchase Has No Prestige Tier Check

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js:515-571`, `server/models/Weapon.js:56-58`

**Description:**
The `buyWeapon` handler calls `getWeapon(weaponId)` which only searches `WEAPON_CATALOG` (the 13 launch weapons). Prestige weapons are in a separate `PRESTIGE_WEAPONS` object. The `getWeapon` function at Weapon.js:57 returns `WEAPON_CATALOG[weaponId] || null`, so prestige weapon IDs (21, 24, 26, 27, 29) return `null` and the purchase is rejected with "Unknown weapon."

**However**, this means there is currently NO way to purchase prestige weapons at all, even for players who have unlocked the tier. The prestige system unlocks weapon IDs (e.g., tier 1 unlocks weapon 26/Tommy Gun) but the buy flow cannot resolve those IDs.

**Assessment:** The prestige unlock system is non-functional. This is not an exploit (players cannot buy things they shouldn't), but it is a broken feature. When prestige weapons are enabled, the `getWeapon` function must be updated to include `PRESTIGE_WEAPONS` and the buy handler must verify the player's prestige tier.

**Recommendation:**
When enabling prestige weapons, update `getWeapon()`:
```js
export function getWeapon(weaponId) {
    return WEAPON_CATALOG[weaponId] || PRESTIGE_WEAPONS[weaponId] || null;
}
```
And add prestige tier check in `buyWeapon`:
```js
if (isPrestigeWeapon(weaponId)) {
    const wallet = authenticatedWallets[client.id];
    const info = getPrestigeInfo(wallet);
    if (!info.unlockedWeapons.includes(weaponId)) {
        client.emit('buyWeaponResult', { success: false, reason: 'Prestige tier too low' });
        return;
    }
}
```

---

## Finding E-12: Play-Again Deletes Wager State -- Second Match Is Always Free

**Severity:** HIGH
**Location:** `server/socket-io/main.js:1019`, `server/socket-io/main.js:1043`

**Description:**
When both players agree to play again, `playAgainRequest` executes `delete wagerStates[client.roomId]` at line 1019/1043. The new match starts with no wager state. Any subsequent match in the same room is effectively a free-play match, regardless of the original wager amount.

**Exploit scenario:**
1. Player A creates a 0.5 SOL wager room. Player B joins.
2. They play match 1. Settlement is calculated (though not executed -- see E-06).
3. Both click play again. Wager state is deleted.
4. Match 2 has no wager. Settlement checks `if (ws && ws.amount > 0)` at line 808 -- `ws` is now `undefined`, so no settlement occurs.
5. The loser of match 2 loses nothing. The winner of match 2 gains nothing.

**Impact:** This undermines any "best of" or rematch wager expectations. If real wagers existed, a losing player could propose a rematch knowing it would be free.

**Recommendation:**
Preserve the wager state across play-again, or explicitly re-negotiate wagers with both players' consent:
```js
// Option A: Preserve wager
// Don't delete wagerStates[roomId] in playAgainRequest

// Option B: Reset wallets but keep amount
const prevWager = wagerStates[client.roomId];
// ... reset other state ...
if (prevWager) {
    wagerStates[client.roomId] = { amount: prevWager.amount, wallets: prevWager.wallets };
}
```

---

## Finding E-13: SHOT Tokens Awarded Without Real Match Validation

**Severity:** HIGH
**Location:** `server/socket-io/main.js:838-850`, `server/services/shot-token.js:95-129`

**Description:**
SHOT tokens are awarded when a match reaches the `COMPLETE` state (line 831) and `recordMatchPlayed()` is called for each player with a wallet. There is no validation that:
1. The match had any meaningful gameplay (zero damage dealt is fine).
2. The match lasted a minimum duration.
3. Both players are distinct (different wallets).
4. The same wallet isn't used by both players (colluding with two browser tabs).

**Exploit scenario (single-person SHOT farming):**
1. Attacker opens two browser tabs, each with a different socket connection.
2. Tab 1 creates a room. Tab 2 joins.
3. Both authenticate with the same wallet (or two wallets the attacker controls).
4. They rapid-fire 20 turns of intentional misses (fire out of bounds: `power: 100, angle: 0`).
5. Match completes. Both wallets get `recordMatchPlayed()` called.
6. Click play-again. Repeat.
7. Each match takes seconds. The 50-SHOT welcome bonus is immediate. After 100 matches (~minutes), the attacker earns 50+100+200+500+1000+2000 = 3,850 SHOT.
8. Recurring milestones award 500 SHOT every 50 matches after 100.

**Recommendation:**
1. Require minimum total damage (e.g., > 100 combined) for a match to count.
2. Require minimum match duration (e.g., > 60 seconds).
3. Block same-wallet from being both host and player.
4. Implement server-side rate limiting per wallet address.

---

## Finding E-14: Disconnect/Leave Race Condition in Settlement

**Severity:** HIGH
**Location:** `server/socket-io/main.js:180-229` (disconnect), `server/socket-io/main.js:233-270` (leaveRoom)

**Description:**
The disconnect and leaveRoom handlers both execute settlement logic asynchronously (`await settleMatch()`). If both players disconnect simultaneously (e.g., network partition), both handlers fire concurrently:
1. Player A disconnects -> handler reads `wagerStates[roomId]`, starts settlement for B as winner.
2. Player B disconnects -> handler reads `wagerStates[roomId]` (still exists), starts settlement for A as winner.
3. Both `settleMatch()` calls succeed (it's a stub returning `success: true`).
4. Two contradictory settlements are logged.

With real transfers, this would mean both players receive the winner's share, doubling the pot payout.

Additionally, after settlement, both handlers call `removeRoom(client.roomId)` which deletes `wagerStates[roomId]`. The second handler's `removeRoom` is a no-op (room already removed), but the settlement has already been calculated before removal.

**Recommendation:**
Add a settlement lock per room:
```js
const settlingRooms = new Set();

// In disconnect/leaveRoom:
if (settlingRooms.has(client.roomId)) return; // Already settling
settlingRooms.add(client.roomId);
try {
    const result = await settleMatch(...);
    // ...
} finally {
    settlingRooms.delete(client.roomId);
}
```

---

## Finding E-15: deleteRoom Has No Host-Only Check and Skips Settlement

**Severity:** HIGH
**Location:** `server/socket-io/main.js:274-284`

**Description:**
The `deleteRoom` handler allows any player in the room to delete it. There is no check that `client.isHost === true`. More critically, `deleteRoom` calls `removeRoom()` directly without any wager settlement or refund logic. If a wager match is in progress:
1. The non-host player emits `deleteRoom`.
2. `removeRoom()` is called, which deletes `wagerStates[roomId]` (line 96).
3. No settlement occurs. No refund occurs.
4. Both players' wagers are lost (if real transfers existed).

**Exploit scenario:**
A losing player in a wager match can emit `deleteRoom` to cancel the match and avoid losing their wager. Neither player gets paid, but the losing player avoids a loss.

**Recommendation:**
1. Add host-only check: `if (!client.isHost) return;`
2. Add settlement/refund logic matching `leaveRoom` handler.
3. Consider only allowing `deleteRoom` in LOBBY state.

---

## Finding E-16: Balance Check Fail-Open Allows Unfunded Wagers

**Severity:** HIGH
**Location:** `server/socket-io/main.js:306-317`, `server/services/solana.js:80-102`

**Description:**
When a player joins a wager room, the balance check (main.js:307) wraps `verifyBalance` in a try-catch. If the RPC call fails (network error, rate limit, node down), the catch block at line 315 logs a warning and **continues execution** -- the player is allowed to join.

Even worse, the balance check at line 308 has a flawed condition:
```js
if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
```
This means:
- If `balance === 0` (broke wallet), the condition is `false` (0 > 0 is false), and the player is **allowed to join**.
- If `balance > 0` but insufficient, the player is rejected.
- If the RPC errors out, `verifyBalance` returns `{ sufficient: false, balance: 0, required: ... }`. The condition `0 > 0` is false, so the player joins.

**A player with 0 SOL can join any wager room.**

**Recommendation:**
Fix the condition:
```js
if (!balanceCheck.sufficient) {
    client.emit('joinRoomError', { reason: `Insufficient SOL balance.` });
    return;
}
```
Also add balance verification for room creators, not just joiners.

---

## Finding E-17: Room Creator's Balance Is Never Verified

**Severity:** HIGH
**Location:** `server/socket-io/main.js:354-410`

**Description:**
The `createRoom` handler validates the wager tier (`isValidWager`) but never calls `verifyBalance()` for the room creator. Only the joining player gets a (broken) balance check. The creator can set any valid wager tier (up to 0.5 SOL) without having any SOL.

**Exploit scenario:**
1. Player with 0 SOL creates a 0.5 SOL wager room.
2. Legitimate player with 0.5+ SOL joins (passes balance check).
3. Match plays out. If the creator wins, they "receive" 0.9 SOL they never wagered.
4. (Currently no real transfer, but with escrow this is critical.)

**Recommendation:**
Add balance verification in `createRoom`:
```js
if (wagerAmount > 0 && walletAddress) {
    const check = await verifyBalance(walletAddress, wagerAmount);
    if (!check.sufficient) {
        client.emit('createRoomError', { reason: 'Insufficient SOL' });
        return;
    }
}
```

---

## Finding E-18: Economic Griefing -- Time-Wasting and Stalling

**Severity:** MEDIUM
**Location:** `server/socket-io/main.js` (general), `server/services/match.js:95`

**Description:**
There is no turn timer. The match state tracks turns (`turnCount`, `turnsPerRound: 20`) but has no mechanism to force a player to fire within a time limit. A malicious player can:
1. Join a wager room.
2. Never fire, holding the opponent hostage indefinitely.
3. The opponent must either disconnect (forfeit, losing the wager) or wait forever.

The only timeout is the shop phase timer (`SHOP_DURATION = 30` seconds). There is no battle-phase turn timer.

**Recommendation:**
Add a per-turn timer (e.g., 60 seconds). If a player does not fire within the timer, auto-forfeit the turn (skip it, or deal self-damage).

---

## Finding E-19: All Economic State Is Ephemeral (Server Restart = Total Wipe)

**Severity:** CRITICAL
**Location:** `server/socket-io/main.js:19-41`, `server/services/shot-token.js:65`

**Description:**
Seven in-memory stores hold all economic state:
- `rooms` (line 19): active match data
- `matchStates` (line 22): match state machines
- `goldStates` (line 25): per-match Gold balances
- `weaponInventories` (line 28): per-match weapon purchases
- `shopTimers` (line 31): active timers
- `wagerStates` (line 37): wager amounts and wallet mappings
- `playerShotState` (shot-token.js:65): SHOT balances, milestones, prestige

None of these are persisted to MongoDB or any durable store. A server restart, crash, or deployment wipes everything:
- Active wager matches lose their settlement (SOL stuck in limbo if escrow existed).
- SHOT balances, milestones, and prestige tiers reset to zero.
- In-progress Gold and weapon purchases vanish.

The MongoDB persistence in `persistRoom()` (line 56) only saves room metadata (active status, terrain, player info) -- not Gold, weapons, match state, or wager data.

**Recommendation:**
1. Critical: Persist `wagerStates` and active match settlements to DB.
2. High: Persist `playerShotState` to DB (or replace with on-chain SPL token).
3. Medium: Persist `matchStates` and `goldStates` for crash recovery.

---

## Finding E-20: Stats Endpoint Leaks Financial Data Without Authentication

**Severity:** MEDIUM
**Location:** `server/index.js:34`, `server/services/monitoring.js:166-211`

**Description:**
The `/stats` endpoint exposes total SOL wagered, settled, treasury fees, ops fees, SHOT emissions, and burn counts to any unauthenticated HTTP request. This provides competitive intelligence and could be used to:
1. Gauge platform revenue for extortion purposes.
2. Identify peak activity periods for timing attacks.
3. Verify whether settlement is actually occurring (all values stay at 0, revealing the stub).

**Recommendation:**
Add authentication (API key or admin JWT) to the `/stats` endpoint. The `/health` endpoint can remain public.

---

## Finding E-21: Monitoring Tracks SOL Amounts With Floating-Point Accumulation

**Severity:** LOW
**Location:** `server/services/monitoring.js:94-102`

**Description:**
`trackSettlement()` accumulates SOL amounts using `+=` on floating-point numbers:
```js
stats.totalSettled += winnerPayout || 0;
stats.totalTreasuryFees += treasuryFee || 0;
```
Over many matches, floating-point drift will cause the reported totals to diverge from the true sum. For example, after 10,000 matches at 0.1 SOL each, the accumulated total could be off by several lamports.

**Recommendation:**
Track in lamports (integers) and convert only for display:
```js
stats.totalSettledLamports += Math.round(winnerPayout * LAMPORTS_PER_SOL);
```

---

## Finding E-22: Host Always Wins Tiebreaks -- Systematic Advantage

**Severity:** MEDIUM
**Location:** `server/services/match.js:155-156`, `server/services/match.js:176`

**Description:**
Two tiebreak scenarios always favor the host:
1. `isMatchOver()` line 156: When all rounds are played and scores are tied, `winner: hostId` is returned.
2. `getRoundWinner()` line 176: When round scores are tied, `return hostId`.

In a wager match, this gives the host a systematic advantage. In the edge case where both players deal identical total damage, the host always wins and collects the pot.

**Exploit scenario:**
A player who always creates rooms (never joins) has a permanent tiebreak advantage. In close matches, this could decide the outcome.

**Recommendation:**
Use a fair tiebreak mechanism:
- Sudden death round
- Coin flip (`Math.random() < 0.5`)
- Player who dealt damage first wins
- Or declare a draw and refund wagers

---

## Findings Summary Table

| ID | Severity | Category | One-Line Description |
|----|----------|----------|---------------------|
| E-01 | LOW | Gold | Self-damage check is correct; no Gold from self-hits |
| E-02 | MEDIUM | Match State | turnCount never resets between rounds in BO3/BO5 |
| E-03 | CRITICAL | SHOT Token | No match deduplication; collusion grinds unlimited SHOT |
| E-04 | CRITICAL | SHOT Token | Reward pool (7M) has no supply cap enforcement |
| E-05 | HIGH | SHOT Token | Server restart reverses all prestige burns and balances |
| E-06 | CRITICAL | SOL Wager | Settlement is a stub; no real SOL transfers occur |
| E-07 | INFO | SOL Wager | 90/7/3 split sums correctly for defined tiers |
| E-08 | HIGH | SOL Wager | Negative wager values bypass validation |
| E-09 | INFO | SOL Wager | Free rooms cannot become wager rooms mid-match |
| E-10 | HIGH | Gold / Input | Unvalidated startX/startY allows arbitrary damage for Gold |
| E-11 | MEDIUM | Prestige | Prestige weapons are unlocked but cannot be purchased |
| E-12 | HIGH | SOL Wager | Play-again deletes wager state; rematch is always free |
| E-13 | HIGH | SHOT Token | No minimum gameplay required for SHOT milestone credit |
| E-14 | HIGH | SOL Wager | Concurrent disconnect causes double settlement |
| E-15 | HIGH | SOL Wager | deleteRoom skips settlement; any player can call it |
| E-16 | HIGH | SOL Wager | Balance check fail-open allows 0-SOL players into wager rooms |
| E-17 | HIGH | SOL Wager | Room creator balance is never verified |
| E-18 | MEDIUM | Griefing | No turn timer; player can stall indefinitely |
| E-19 | CRITICAL | All State | All economic state is ephemeral; server restart = total wipe |
| E-20 | MEDIUM | Info Leak | /stats endpoint exposes financial data without auth |
| E-21 | LOW | Monitoring | Floating-point accumulation drift in SOL tracking |
| E-22 | MEDIUM | Fairness | Host always wins tiebreaks; systematic wager advantage |

---

## Risk Heat Map

```
                    Gold     SHOT Token   SOL Wager   State Mgmt   Griefing
                   ------   ----------   ---------   ----------   --------
Inflation/Drain:    E-10      E-03,04       --          --          --
Loss of Funds:       --         --        E-06,14      E-19         --
Bypass Controls:     --        E-13      E-08,16,17    --          E-15
Fairness:            --         --        E-12,22       --          E-18
Persistence:         --        E-05         --         E-19         --
```

---

## Priority Remediation Order

### P0 -- Fix Before Any Real-Money Launch
1. **E-06:** Implement real escrow/settlement or disable wagers entirely.
2. **E-10:** Use server-authoritative tank positions for fire origin.
3. **E-14:** Add settlement lock to prevent double-settlement race condition.
4. **E-16 + E-17:** Fix balance check logic and add creator verification.
5. **E-19:** Persist wager state and SHOT state to durable storage.

### P1 -- Fix Before SHOT Token Launch
6. **E-04:** Enforce 7M reward pool cap globally.
7. **E-03 + E-13:** Add match deduplication and minimum gameplay thresholds.
8. **E-05:** Persist SHOT state to DB.
9. **E-08:** Validate wager type and reject negatives.
10. **E-15:** Add host-only check and settlement to deleteRoom.

### P2 -- Fix Before Competitive Play
11. **E-02:** Reset turnCount between rounds.
12. **E-12:** Preserve or re-negotiate wager on play-again.
13. **E-18:** Add turn timer.
14. **E-22:** Implement fair tiebreak mechanism.

### P3 -- Housekeeping
15. **E-11:** Enable prestige weapon purchases with tier validation.
16. **E-20:** Add auth to /stats endpoint.
17. **E-21:** Track SOL in lamports.
