# BATCH-04: TOKEN/ECONOMIC and EXTERNAL CALL Findings

**Auditor:** Claude Opus 4.6 automated hypothesis investigator
**Date:** 2026-02-14
**Scope:** H027, H033-H039 -- Economic exploits, external call failures, token supply issues
**Source branch:** dev

---

## H027: Fail-open balance check

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

The balance check logic in `main.js:305-317` (joinRoom handler) and `solana.js:80-102` (verifyBalance) contains a fail-open vulnerability with two distinct attack paths.

**Path 1: Zero-balance wallet bypass**

`solana.js:80-102` -- When the RPC call succeeds and the wallet has exactly 0 SOL, `verifyBalance()` returns:
```js
{ sufficient: false, balance: 0, required: wagerSOL + 0.01 }
```

The check in `main.js:308` is:
```js
if (balanceCheck.balance > 0 && !balanceCheck.sufficient) {
    // Only reject if we got a real balance back and it's insufficient
    client.emit('joinRoomError', { ... })
    return
}
```

When `balance === 0`, the condition `balanceCheck.balance > 0` is **false**, so the rejection branch is skipped entirely. A wallet with exactly 0 SOL passes the balance check for any wager tier.

**Path 2: RPC error bypass**

`solana.js:95-101` -- When the RPC call fails (timeout, network error, invalid wallet address), the catch block returns:
```js
{ sufficient: false, balance: 0, required: wagerSOL + 0.01 }
```

Back in `main.js:315-317`, the outer catch block around `verifyBalance()`:
```js
} catch (err) {
    console.warn('[Solana] Balance check skipped:', err.message)
}
```

This catches any exception thrown during the balance check and silently continues, allowing the player to join the wager room without any verification.

Both paths result in a player entering a wagered match with 0 SOL.

**Exploit scenario:**
1. Player A creates a 0.5 SOL wager room (no balance check on creator -- see H038).
2. Player B connects a wallet with 0 SOL and emits `joinRoom` with `walletAddress` set to that wallet.
3. The balance check returns `{ sufficient: false, balance: 0, required: 0.51 }`.
4. The guard `balanceCheck.balance > 0 && !balanceCheck.sufficient` evaluates to `false && true = false`.
5. Player B joins the wager match without any SOL.
6. When real settlement is implemented, Player B risks nothing but can win 0.9 SOL.

**Recommendation:**
Replace the balance check condition with:
```js
if (!balanceCheck.sufficient) {
    client.emit('joinRoomError', { ... })
    return
}
```
The RPC error catch block should also reject the join rather than silently allowing it:
```js
} catch (err) {
    console.warn('[Solana] Balance check failed:', err.message)
    client.emit('joinRoomError', { reason: 'Unable to verify wallet balance. Please try again.' })
    return
}
```

---

## H033: SHOT token unlimited farming

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

`shot-token.js:95-129` -- The `recordMatchPlayed()` function increments `state.matchesPlayed` and awards milestones. There are two confirmed farming vectors.

**No deduplication on match completion:**

`main.js:843-850` calls `recordMatchPlayed()` for both players upon match end:
```js
if (hostWallet) {
    shotResults[hostId] = recordMatchPlayed(hostWallet)
}
if (playerWallet) {
    shotResults[playerId] = recordMatchPlayed(playerWallet)
}
```

There is no match ID or deduplication token passed to `recordMatchPlayed()`. The function simply increments `state.matchesPlayed++` on every call. If the same match completion path is triggered twice (possible via the disconnect/fire race condition documented elsewhere), the same match credits twice.

**Recurring milestone farming:**

`shot-token.js:113-121`:
```js
if (state.matchesPlayed > 100 && state.matchesPlayed % RECURRING_MILESTONE_INTERVAL === 0) {
    if (!state.milestonesEarned.includes(state.matchesPlayed)) {
        state.milestonesEarned.push(state.matchesPlayed);
        state.balance += RECURRING_MILESTONE_REWARD;  // 500 SHOT every 50 matches
    }
}
```

After 100 matches, every 50th match awards 500 SHOT indefinitely. Two colluding players can:
- Create a room, both ready up, enter battle.
- One player fires a shot that ends the match immediately (e.g., via the arbitrary startX/startY exploit from H036 to deal maximum damage, or simply by one player having very low HP settings).
- Both players hit "play again" (which resets all state via `playAgainRequest`).
- Repeat.

There is no minimum match duration, no minimum number of turns, and no minimum damage threshold. A match that lasts 1 turn and deals 1 damage still counts.

**Rate calculation:** With colluding bots automating the socket events, matches can complete in under 5 seconds (ready -> shop done -> terrain -> fire -> matchEnd -> playAgain). That is ~720 matches/hour = 7,200 SHOT/hour from recurring milestones alone, plus one-time milestone bonuses totaling 3,850 SHOT.

**Exploit scenario:**
1. Two colluding accounts connect with authenticated wallets.
2. Account A creates a free (0 SOL) room. Account B joins.
3. Both emit `ready`. Both emit `shopDone` instantly.
4. Account A emits `fire` with parameters guaranteed to end the match in one shot.
5. Both accounts receive `recordMatchPlayed()` credit.
6. Both emit `playAgainRequest` and repeat from step 3.
7. After 100 matches (~8 minutes), recurring 500 SHOT every 50 matches begins.
8. Farm indefinitely with no supply cap (see H034).

**Recommendation:**
- Add a minimum match duration (e.g., 60 seconds) or minimum turn count (e.g., 4 turns) before a match counts toward milestones.
- Pass a unique match ID to `recordMatchPlayed()` and track credited match IDs to prevent double-counting.
- Implement rate limiting: maximum N matches per wallet per hour.

---

## H034: SHOT reward pool supply cap bypass

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

`shot-token.js:29-39` defines the supply configuration:
```js
export const SHOT_TOKEN_CONFIG = {
    totalSupply: 10_000_000,     // 10M total
    rewardPool: 7_000_000,       // 70% for rewards
    // ...
};
```

However, `SHOT_TOKEN_CONFIG` is a pure data object. It is never read, checked, or enforced anywhere in the codebase.

`shot-token.js:95-129` (`recordMatchPlayed()`) awards SHOT by directly incrementing `state.balance`:
```js
state.balance += ms.reward;
// ...
state.balance += RECURRING_MILESTONE_REWARD;
```

There is no global counter tracking total SHOT emitted across all players. There is no check like:
```js
if (globalEmitted + reward > SHOT_TOKEN_CONFIG.rewardPool) { ... }
```

A search of the entire `shot-token.js` file confirms: the variable `SHOT_TOKEN_CONFIG.rewardPool` (7,000,000) is never referenced in any emission logic. The only place `SHOT_TOKEN_CONFIG` is exported is at line 29, and it is not imported by any other file.

**Exploit scenario:**
1. Using the farming method from H033, colluding players grind matches indefinitely.
2. After 100 matches, 500 SHOT is earned every 50 matches per player.
3. With two colluding players, that is 1,000 SHOT per 50 matches.
4. 7,000 sets of 50 matches = 350,000 matches = 7,000,000 SHOT emitted, exhausting the intended reward pool.
5. But emissions continue past 7M because there is no cap enforcement.
6. When the SHOT token is deployed on-chain (as planned per the code comments), the in-memory balances would need to be reconciled with actual token supply, creating an impossible mismatch.

**Recommendation:**
- Add a global emission counter: `let totalShotEmitted = 0;`
- Before every emission, check: `if (totalShotEmitted + reward > SHOT_TOKEN_CONFIG.rewardPool) return;`
- Persist the global counter to the database.

---

## H036: Gold farming via arbitrary fire position

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

`main.js:671` -- The fire handler accepts client-supplied `startX` and `startY`:
```js
client.on('fire', async ({angle, power, weaponId, startX, startY}) => {
```

`main.js:725-734` -- These values are passed directly to `processShot()`:
```js
const result = processShot({
    angle,
    power,
    weaponId,
    startX,      // <-- client-supplied, untrusted
    startY,      // <-- client-supplied, untrusted
    shooterId: client.id,
    terrain,
    tanks
})
```

`physics.js:59-64` -- `calculateTrajectory()` uses `startX`/`startY` as the launch origin:
```js
export function calculateTrajectory(angle, power, gravity = DEFAULT_GRAVITY, startX, startY) {
    // ...
    let x = startX;
    let y = startY;
```

The server DOES compute tank positions from the terrain (`main.js:700-717`), storing them in `room.host.pos` and `room.player.pos`. However, the fire handler **never uses** these stored positions. It uses the client-supplied `startX`/`startY` instead.

This means a player can set `startX` and `startY` to be directly on top of the opponent's tank position, guaranteeing a direct hit with maximum damage regardless of actual game state.

`main.js:748-756` -- Gold is earned from damage dealt to the opponent:
```js
for (const [playerId, dmg] of Object.entries(result.damage)) {
    if (playerId !== client.id && dmg > 0) {
        goldEarned += earnGold(gold, client.id, dmg)
    }
}
```

With guaranteed maximum damage every turn, a player earns maximum Gold every shot.

**Exploit scenario:**
1. Player joins a match and waits for terrain generation (which reveals opponent's tank position via the `terrainGenerated` event at `main.js:907-913`).
2. On their turn, player emits `fire` with `startX` set to opponent's tank X and `startY` set to opponent's tank Y minus 1.
3. The trajectory starts inside/immediately adjacent to the opponent tank.
4. Direct hit damage is applied: `Math.ceil(blastRadius * damageFactor)` = maximum possible.
5. Gold earned = `Math.floor(damage * 15)` at maximum value every turn.
6. Player accumulates Gold far faster than intended, buying all weapons.

**Recommendation:**
Replace client-supplied `startX`/`startY` with server-stored tank positions:
```js
const shooterPos = client.isHost ? room.host.pos : room.player.pos;
if (!shooterPos) { client.emit('fireRejected', { reason: 'No position' }); return; }
// Use shooterPos.x, shooterPos.y instead of startX, startY
```

---

## H038: Unfunded wager room creation

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

`main.js:354-410` -- The `createRoom` handler:
```js
client.on('createRoom', async ({player}) => {
    // ...
    const wagerAmount = player.wager || 0
    const walletAddress = player.walletAddress || authenticatedWallets[client.id] || null
    if (wagerAmount > 0 && !isValidWager(wagerAmount)) {
        client.emit('createRoomError', { reason: 'Invalid wager tier' })
        return
    }
    wagerStates[roomId] = {
        amount: wagerAmount,
        wallets: { [client.id]: walletAddress }
    }
    // ...
})
```

The only validation on room creation is `isValidWager(wagerAmount)`, which checks that the wager amount is one of the valid tiers `[0, 0.01, 0.05, 0.1, 0.25, 0.5]`. There is **no call to `verifyBalance()`** for the room creator.

Compare with `joinRoom` at `main.js:305-317`, which does call `verifyBalance()` (albeit with the fail-open bug from H027).

The room creator can set a 0.5 SOL wager without having any SOL in their wallet. The creator's wallet address is stored in `wagerStates` but its balance is never checked.

**Exploit scenario:**
1. Attacker with an empty wallet emits `createRoom` with `player.wager: 0.5` and `player.walletAddress: '<empty_wallet>'`.
2. `isValidWager(0.5)` returns true. Room is created with a 0.5 SOL wager.
3. A legitimate player with 0.5+ SOL joins and passes the (broken) balance check.
4. Match plays out. If the attacker loses, they owe 0.5 SOL they don't have.
5. When real settlement is implemented, the settlement transaction would fail because the attacker's wallet has no SOL to transfer.
6. If the attacker wins, they collect 0.9 SOL (90% of 1 SOL pot) without having risked anything.

**Recommendation:**
Add a `verifyBalance()` call in the `createRoom` handler before storing the wager:
```js
if (wagerAmount > 0) {
    if (!walletAddress) {
        client.emit('createRoomError', { reason: 'Wallet required for wagered matches' })
        return
    }
    const balanceCheck = await verifyBalance(walletAddress, wagerAmount)
    if (!balanceCheck.sufficient) {
        client.emit('createRoomError', { reason: 'Insufficient SOL balance' })
        return
    }
}
```

---

## H039: Weapon firing without purchase

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

`main.js:691-695` -- The fire handler validates that the weapon exists in `WEAPON_DATA` but does NOT check the player's inventory:
```js
// Validate weapon exists
if (!WEAPON_DATA[weaponId]) {
    client.emit('fireRejected', { reason: 'Invalid weapon' })
    return
}
```

There is no check equivalent to:
```js
const inventory = weaponInventories[client.roomId]
if (!inventory || !inventory[client.id] || !inventory[client.id].includes(weaponId)) {
    client.emit('fireRejected', { reason: 'Weapon not owned' })
    return
}
```

Compare with the `buyWeapon` handler at `main.js:533-536`, which correctly checks inventory for duplicate purchases:
```js
if (inventory && inventory[client.id] && inventory[client.id].includes(weaponId)) {
    client.emit('buyWeaponResult', { success: false, reason: 'Already owned' })
    return
}
```

The buy handler validates ownership, but the fire handler does not. A player starts with only weapon ID 0 (Single Shot) in their inventory (`main.js:424-427`), but can fire any weapon ID present in `WEAPON_DATA` (13 weapons total) without purchasing it.

**Exploit scenario:**
1. Player enters a match and receives weapon inventory `[0]` (Single Shot only).
2. During battle phase, player emits `fire` with `weaponId: 5` (Heatseeker, blastRadius 80, normally costs Gold).
3. The fire handler checks `WEAPON_DATA[5]` -- it exists, so validation passes.
4. No inventory check is performed.
5. The Heatseeker shot is processed, dealing significantly more damage than the free Single Shot.
6. Player has access to all 13 weapons without spending any Gold.

**Recommendation:**
Add an inventory ownership check in the fire handler after the weapon existence check:
```js
const inventory = weaponInventories[client.roomId]
if (!inventory || !inventory[client.id] || !inventory[client.id].includes(weaponId)) {
    client.emit('fireRejected', { reason: 'Weapon not in inventory' })
    return
}
```

---

## H037: Play-again wager deletion

**Status:** CONFIRMED
**Severity:** CRITICAL

**Evidence:**

`main.js:1004-1053` -- The `playAgainRequest` handler, when both players agree to rematch, executes:
```js
// Reset match state, Gold, inventories, and wager for new game
matchStates[client.roomId] = createMatchState(client.roomId)
delete goldStates[client.roomId]
delete weaponInventories[client.roomId]
delete shopReady[client.roomId]
delete wagerStates[client.roomId]    // <-- wager state deleted
```

This appears at both line 1019 and line 1043 (duplicated for host vs. player paths).

After `delete wagerStates[client.roomId]`, the rematch has no wager. Examining the flow:

1. First match: `wagerStates[roomId] = { amount: 0.5, wallets: { ... } }` (set during createRoom).
2. Match completes, settlement (stub) runs.
3. Both players request play-again.
4. `delete wagerStates[client.roomId]` runs.
5. New match begins. `wagerStates[roomId]` is now `undefined`.
6. When the rematch completes, `main.js:807`: `const ws = wagerStates[client.roomId]` is `undefined`.
7. The settlement block `if (ws && ws.amount > 0)` evaluates to `false`.
8. No settlement occurs for the rematch.

The wager state is never re-created for the rematch. The `playAgain` event (`main.js:1025`) is emitted to clients, who re-enter the pick/shop/battle flow, but no wager state exists.

Furthermore, during the active match, if one player emits `playAgainRequest` while settlement is still in-flight (the fire handler is async), the `delete wagerStates[client.roomId]` could execute while `settleMatch()` is still running, corrupting the settlement.

**Exploit scenario:**
1. Player A creates a 0.5 SOL wager room. Player B joins.
2. Match 1 plays out. Player A wins and receives (stub) settlement of 0.9 SOL.
3. Both players hit play-again.
4. `wagerStates[roomId]` is deleted.
5. Match 2 plays out. Player B wins.
6. At match end, `ws = wagerStates[roomId]` is `undefined`, so settlement is skipped.
7. Player A won Match 1 with real settlement, but Player B won Match 2 with no settlement.
8. Net result: Player A profited from a wager that was supposed to be symmetric.

**Recommendation:**
Either preserve `wagerStates` across rematches (re-verify balances before starting the new match), or require both players to re-enter a fresh room with a new wager for each match. At minimum, do not delete wager state until both players have left the room.

---

## H035: Prestige burn reversal

**Status:** CONFIRMED
**Severity:** HIGH

**Evidence:**

`shot-token.js:64-65`:
```js
// In-memory player SHOT state (keyed by walletAddress)
const playerShotState = {};
```

This is a plain JavaScript object stored in module scope. It is not persisted to MongoDB, Redis, a file, or any other durable storage.

Searching the entire codebase for any persistence of `playerShotState`:
- No `fs.writeFile` or equivalent writes `playerShotState`.
- No MongoDB model exists for SHOT token state. The `Match.js` model stores room metadata only.
- No serialization/deserialization logic exists for this state.

`shot-token.js:137-173` (`prestigeBurn()`) performs the burn:
```js
state.balance -= nextTier.burnCost;
state.totalBurned += nextTier.burnCost;
state.prestigeTier = nextTier.tier;
```

All three mutations are in-memory only. On server restart (process crash, deployment, `nodemon` restart during development), `playerShotState` resets to `{}`.

**What is lost on restart:**
- `balance` -- All earned SHOT tokens reset to 0.
- `matchesPlayed` -- Resets to 0, allowing all one-time milestones (3,850 SHOT total) to be re-earned.
- `milestonesEarned` -- Resets to `[]`, so milestones can be claimed again.
- `prestigeTier` -- Resets to 0, undoing all prestige progress.
- `totalBurned` -- Resets to 0, meaning SHOT that was burned is effectively un-burned.

This means a player who burned 4,000 SHOT to reach Diamond tier would revert to Unranked on restart, but the burned SHOT is also gone (never existed on-chain). Additionally, the milestone reset means they can re-earn the one-time bonuses (50 + 100 + 200 + 500 + 1000 + 2000 = 3,850 SHOT) by playing 100 more matches.

**Exploit scenario (intentional abuse):**
1. Player grinds to 100 matches, earning 3,850 SHOT from one-time milestones.
2. Server restarts (or attacker causes a crash via other vulnerabilities like NaN injection in the fire handler, which has no try/catch).
3. Player's state resets. They grind another 100 matches, earning another 3,850 SHOT.
4. Repeat indefinitely, multiplying SHOT supply with each server restart.
5. Prestige burns are similarly reversed, allowing a player to reach Diamond, restart, and reach Diamond again on freshly re-earned tokens.

**Recommendation:**
- Persist `playerShotState` to MongoDB (create a `ShotTokenState` model with wallet address as key).
- Load state from DB on server startup.
- Write state to DB on every mutation (recordMatchPlayed, prestigeBurn).
- Alternatively, if the plan is to move to on-chain SPL tokens, implement that before allowing real economic activity.

---

## Summary Table

| ID | Title | Status | Severity |
|----|-------|--------|----------|
| H027 | Fail-open balance check | CONFIRMED | CRITICAL |
| H033 | SHOT token unlimited farming | CONFIRMED | HIGH |
| H034 | SHOT reward pool supply cap bypass | CONFIRMED | HIGH |
| H036 | Gold farming via arbitrary fire position | CONFIRMED | HIGH |
| H038 | Unfunded wager room creation | CONFIRMED | CRITICAL |
| H039 | Weapon firing without purchase | CONFIRMED | HIGH |
| H037 | Play-again wager deletion | CONFIRMED | CRITICAL |
| H035 | Prestige burn reversal | CONFIRMED | HIGH |

**All 8 hypotheses CONFIRMED.** The economic subsystem has no enforced invariants. Every token emission, balance check, ownership verification, and persistence mechanism is either absent or trivially bypassable.
