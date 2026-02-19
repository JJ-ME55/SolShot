# Phase 3: Litepaper v2.1 Compliance - Research

**Researched:** 2026-02-19
**Domain:** Game mechanics, match modes, SHOT token economics, matchmaking, treasury governance
**Confidence:** HIGH (all findings from direct codebase inspection against Litepaper v2.1)

---

## Summary

Phase 3 brings the running game into full compliance with the Litepaper v2.1 specification. The research confirms that the codebase is partially aligned — several v2.1 features are partially implemented but need correction, and a handful require net-new implementation. This is primarily a **correction and completion** phase, not a ground-up build.

The biggest divergence between the current code and v2.1 is in the **wager tier values** and **SHOT milestone table** — both are completely wrong. Wager tiers in both server and client still use the old v2.0 values (0.01, 0.05, 0.1, 0.25, 0.5 SOL), and the current SHOT emission system uses a match-count ladder (1→50 SHOT, 5→100 SHOT, etc.) rather than the 8 specific one-time milestones defined in v2.1. Every other requirement (turn limit, tank movement, forfeit rule) exists in some form but needs either enforcement changes or new tracking state.

**Primary recommendation:** Treat LP-01 through LP-08 as surgical edits to two files (server/services/solana.js and server/services/shot-token.js) plus one new server service (matchmaking queue). LP-09 (treasury multisig) is a governance/Solana task with no code to write yet — document it and defer to mainnet prep.

---

## Standard Stack

This phase adds no new libraries. All work uses the existing stack.

### Core (already installed)
| Library | Purpose | Notes |
|---------|---------|-------|
| Socket.IO | Real-time pairing logic | Used for all match events |
| MongoDB / Mongoose | Persistent player stats | User model exists, schema needs new fields |
| `@solana/web3.js` | On-chain treasury multisig | Already imported |
| `@solana/spl-token` | SHOT token transfers | Already installed for burns |

### No New Libraries Needed
The matchmaking queue, SHOT milestones, turn limit, movement limiter, and forfeit counter are all pure in-memory state changes inside existing modules. No npm installs required.

---

## Architecture Patterns

### Where Each Requirement Lives

```
server/
├── services/
│   ├── solana.js          ← LP-01: WAGER_TIERS + MATCH_MODES constants (WRONG VALUES)
│   │                         LP-02: Custom Challenge mode (MISSING from MATCH_MODES)
│   │                         LP-09: Treasury wallet constant (exists, governance doc only)
│   ├── shot-token.js      ← LP-04: SHOT_MILESTONES (COMPLETELY WRONG — wrong schema)
│   │                         LP-05: Practice mode 25% rate (MISSING)
│   └── match.js           ← LP-06: turnsPerRound=20 (ALREADY CORRECT)
│                             LP-08: consecutiveTimeouts tracking (MISSING)
├── socket-io/
│   └── main.js            ← LP-03: matchmaking queue logic (MISSING — manual rooms only)
│                             LP-06: 20-turn limit check (EXISTS via isRoundOver)
│                             LP-07: stepLeft/stepRight enforcement (PARTIALLY DONE)
│                             LP-08: 3-forfeit rule application (MISSING)
client/src/
├── screens/
│   └── LobbyScreen.js     ← LP-01: MATCH_MODES + ALL_WAGER_TIERS (WRONG VALUES)
│                             LP-02: Custom Challenge UI (MISSING)
│                             LP-03: Queue UI (MISSING — manual room list only)
└── scenes/main/index.js   ← LP-07: movesRemaining=4 (ALREADY CORRECT per turn)
```

---

## Requirement-by-Requirement Findings

### LP-01: Wager Tiers (0.1 / 0.25 / 0.5 / 1.0 SOL)

**Current state:** Both server and client have WRONG values.

Server (`server/services/solana.js` line 37):
```javascript
export const WAGER_TIERS = [0, 0.01, 0.05, 0.1, 0.25, 0.5];
```

Server MATCH_MODES (lines 40-45):
```javascript
export const MATCH_MODES = {
    practice:    { label: 'Practice',    wagerRange: [0, 0],      formats: [1] },
    quick_match: { label: 'Quick Match', wagerRange: [0.01, 0.1], formats: [1, 3] },
    duel:        { label: 'Duel',        wagerRange: [0.05, 0.25],formats: [3, 5] },
    high_roller: { label: 'High Roller', wagerRange: [0.25, 0.5], formats: [3, 5] },
};
```

Client (`client/src/screens/LobbyScreen.js` lines 9-18):
```javascript
const MATCH_MODES = {
  practice:    { label: 'PRACTICE',     wagerRange: [0, 0],      formats: [1],    color: 'var(--kh)' },
  quick_match: { label: 'QUICK MATCH',  wagerRange: [0.01, 0.1], formats: [1, 3], color: 'var(--sg)' },
  duel:        { label: 'DUEL',         wagerRange: [0.05, 0.25],formats: [3, 5], color: '#00ccff' },
  high_roller: { label: 'HIGH ROLLER',  wagerRange: [0.25, 0.5], formats: [3, 5], color: '#ffcc00' },
};
const ALL_WAGER_TIERS = [0, 0.01, 0.05, 0.1, 0.25, 0.5];
```

**v2.1 target:**
```
WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0]
MATCH_MODES:
  practice:    wagerRange: [0, 0],      formats: [1]
  quick_match: wagerRange: [0.1, 0.1],  formats: [1, 3]
  duel:        wagerRange: [0.25, 0.5], formats: [3, 5]
  high_roller: wagerRange: [1.0, 1.0],  formats: [3, 5]
```

**Change:** Both files need updated constant tables. The validateMatchMode function uses the range array so no logic changes needed — just the constants. Both files must stay in sync (known gotcha from MEMORY.md).

---

### LP-02: Custom Challenge Mode

**Current state:** MISSING from MATCH_MODES in both server and client. The litepaper defines it as: 0.1 SOL minimum, no cap, BO1/BO3/BO5.

**v2.1 spec:**
```
custom_challenge: { wagerRange: [0.1, Infinity], formats: [1, 3, 5] }
```

**Implementation approach:**

Server: Add `custom_challenge` key to MATCH_MODES. The validateMatchMode function currently rejects any wager not in WAGER_TIERS (line 56):
```javascript
if (wagerSOL > 0 && !WAGER_TIERS.includes(wagerSOL)) {
    return { valid: false, reason: 'Invalid wager tier' };
}
```
This check must be bypassed for custom_challenge mode — custom wagers are free-form (any value >= 0.1 SOL). The validator needs a special path for custom mode.

Client: Add a "CUSTOM" mode tab to LobbyScreen with:
- A numeric input (not tier buttons) for arbitrary wager >= 0.1 SOL
- BO1/BO3/BO5 format selection (all available)
- Clear label that this generates a room code the challenger shares with opponent

Server validation of custom challenge: Allow any wager >= 0.1 SOL when mode is `custom_challenge`. The WAGER_TIERS whitelist check must be skipped for this mode.

---

### LP-03: Matchmaking Queue

**Current state:** MISSING. Players create rooms manually and others join via room list. The `quickMatch()` function in LobbyScreen is a thin wrapper that finds the first matching room in the open room list — not a real queue.

**v2.1 spec:** Queue-based pairing for standard modes (Practice, Quick Match, Duel, High Roller). Custom Challenge stays manual (challenger sends link/code).

**Implementation approach:**

Server (`main.js`): Add an in-memory queue map:
```javascript
const matchmakingQueues = new Map(); // modeKey → [{ socketId, wallet, name, color, wager, format }]
```

New socket events needed:
- `joinQueue` — player queues for a mode
- `leaveQueue` — player cancels queue
- `queueMatched` — server emits to both players when matched, triggers room creation

Server flow:
1. Player emits `joinQueue` with `{ matchMode, matchLength, wager }`
2. Server validates mode + wager, pushes to queue[matchMode]
3. If another player is already queued for same mode+format, pop both, auto-create room, auto-join second player — emit `queueMatched` to both with roomId
4. If no match, keep in queue, emit `queueWaiting` confirmation

The existing `createRoom` + `joinRoom` flow can be reused internally when a queue match is found. The server creates the room as if the first player called `createRoom`, then joins the second player as if they called `joinRoom`.

Client: Replace the current "QUICK MATCH" button behavior (find-room-or-create) with `joinQueue` emission. Show a "SEARCHING..." waiting state with a cancel button that emits `leaveQueue`.

Custom Challenge rooms bypass the queue entirely — still use the existing `createRoom`/`joinRoom` path with the room code displayed to the challenger.

**Pitfall:** Queue state is lost on server restart. This is acceptable for now (devnet). For mainnet, queue state is ephemeral by design — players re-queue on reconnect.

---

### LP-04: SHOT Milestone Emission Table

**Current state:** COMPLETELY WRONG. The current `SHOT_MILESTONES` in `server/services/shot-token.js` uses a match-count ladder:
```javascript
export const SHOT_MILESTONES = [
    { matches: 1,   reward: 50,   label: 'First Blood' },
    { matches: 5,   reward: 100,  label: 'Getting Started' },
    { matches: 10,  reward: 200,  label: 'Regular' },
    { matches: 25,  reward: 500,  label: 'Veteran' },
    { matches: 50,  reward: 1000, label: 'Expert' },
    { matches: 100, reward: 2000, label: 'Legend' },
];
```

**v2.1 spec (8 one-time milestones, completely different schema):**
```
1.  First wagered match completed:           10 SHOT
2.  10 wagered wins:                         25 SHOT
3.  50 wagered wins:                         75 SHOT
4.  100 wagered matches played:              50 SHOT
5.  Deal 500+ damage in a single round:      15 SHOT
6.  Win a match without prestige weapons:    20 SHOT
7.  Win 5 matches in a row:                  40 SHOT
8.  Reach 100 total matches:                100 SHOT
```

**Schema change:** Current milestones are triggered by match count. v2.1 milestones require tracking additional per-player stats that don't currently exist in `playerShotState`:

Currently tracked per wallet:
```javascript
{
    balance, matchesPlayed, milestonesEarned, prestigeTier, totalBurned,
    lastRewardAt, claimedMatchIds
}
```

New fields needed:
```javascript
{
    wageRedMatchesPlayed,   // for milestones 1, 4 (only wagered matches count)
    wageredWins,            // for milestones 2, 3
    consecutiveWins,        // for milestone 7
    milestonesEarned: Set,  // already exists but needs new milestone IDs
}
```

Milestone 5 (deal 500+ damage in a single round) requires passing per-round damage dealt to the emission checker — currently only match-level data is passed to `recordMatchPlayed`.

Milestone 6 (win without prestige weapons) requires knowing which weapons the winner used in the match — this data is in `weaponInventories[roomId]` on the server at match end.

**Implementation:** Replace `SHOT_MILESTONES` array and `recordMatchPlayed` function entirely. The new function signature needs to accept richer match context:
```javascript
recordMatchPlayed(walletAddress, {
    isWagered,         // boolean — for milestones 1, 4
    isWinner,          // boolean — for milestones 2, 3, 7
    matchId,
    turnCount,
    roundDamageDealt,  // max damage dealt in any single round
    weaponsUsed,       // array of weaponIds used by this player
    prestigeWeaponIds, // which IDs count as prestige
})
```

The call site in `main.js` (around line 1534) must be updated to pass this enriched context from match state at settlement time.

---

### LP-05: Practice Mode 25% SHOT Emission Rate

**Current state:** MISSING. `recordMatchPlayed` does not take match mode into account. All matches earn the same rate.

**Implementation:** Add an `isWagered` boolean to the emission context. If `isWagered === false` (Practice mode), multiply all SHOT earned by 0.25 before crediting. The `wagerStates[roomId].amount` at settlement already tells us if it was a wagered match — `amount === 0` means Practice.

---

### LP-06: 20-Turn Limit Per Round

**Current state:** ALREADY IMPLEMENTED CORRECTLY.

`server/services/match.js` line 101:
```javascript
turnsPerRound: 20,   // 10 per player per round
```

`isRoundOver` (line 146-155):
```javascript
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    if (matchState.hp) {
        for (const hp of Object.values(matchState.hp)) {
            if (hp <= 0) return true;
        }
    }
    return false;
}
```

`getRoundWinner` (line 198-212) already handles the HP-based winner when turns run out — it compares remaining HP.

**No changes needed for LP-06.** The 20-turn limit is fully operational.

---

### LP-07: Tank Movement (4 Steps Per Round)

**Current state:** CLIENT-SIDE is correctly implemented. Server-side enforcement has a gap.

Client (`client/src/classes/Tank.js` line 40): `this.movesRemaining = 4`

Client (`client/src/scenes/main/index.js` line 608): `this.tank1.movesRemaining = 4; // Reset moves for new turn`

The move buttons in BattleHUD are disabled when `moveSteps <= 0`. The `movesRemaining` counter decrements on each stepLeft/stepRight call.

**Gap:** Server tracks `stepLeft`/`stepRight` socket events to update position for physics (lines 1802-1846 in main.js), but does NOT enforce the 4-step-per-round limit server-side. A client could emit `stepLeft` more than 4 times per turn.

**Fix needed:** Track per-player, per-turn move count on the server. The simplest approach: add `moveCount: { [socketId]: 0 }` to match state, reset to 0 on turn start (when `ms.currentTurn` changes), and reject `stepLeft`/`stepRight` events if `moveCount[client.id] >= 4`.

---

### LP-08: 3-Forfeit Timeout Rule

**Current state:** MISSING. The turn timer (`startTurnTimer`) in main.js currently just advances the turn when a player times out — it does NOT count consecutive timeouts or end the match after 3.

Current timeout behavior (lines 199-228 in main.js):
```javascript
// turnTimers[roomId] fires after TURN_TIMEOUT_MS (60s)
ms.turnCount++
ms.currentTurn = getNextTurn(ms, hostId, playerId)
io.sockets.in(roomId).emit('turnTimeout', { timedOutPlayer, nextTurn, turnCount })
startTurnTimer(io, roomId)  // just restarts for next player
```

**Implementation needed:** Track consecutive timeouts per player:
```javascript
// Add to matchState (or room state):
consecutiveTimeouts: { [socketId]: 0 }
```

When a timeout fires:
1. Increment `consecutiveTimeouts[timedOutPlayerId]`
2. Reset `consecutiveTimeouts[otherPlayerId]` to 0 (they just moved by waiting for opponent)
3. If `consecutiveTimeouts[timedOutPlayerId] >= 3` → end match, opponent wins (or refund on no-wager)
4. Otherwise → advance turn as normal

The "consecutive" tracking requires reset when a player fires (i.e., emits `fire` successfully). Add a reset in the `fire` handler.

**Note:** The Litepaper says "3 forfeits" but does not specify whether this is per-player or combined. Based on context ("3 consecutive timeouts = match end"), treating it as per-player consecutive is the correct interpretation. A player who times out 3 turns in a row loses.

---

### LP-09: Treasury Multisig Governance

**Current state:** The 7% treasury fee split is hardcoded in the Anchor escrow program (`programs/solshot-escrow/src/lib.rs`). The treasury wallet address is set via `TREASURY_WALLET` env var. No multisig is configured.

**v2.1 spec:** "7% treasury fee → multisig wallet governance." Treasury spending decisions published on-chain as governance matures.

**Scope for Phase 3:** There is NO CODE to write for LP-09. Multisig wallet setup (e.g., Squads Protocol) is an operations task, not a development task. The correct action is:
1. Document the multisig requirement in the treasury governance plan
2. Set `TREASURY_WALLET` env var to the multisig address when one is created
3. No changes to escrow program (it already routes 7% to the configured treasury address)

**This task is blocked on the operations decision** of which multisig solution to use (Squads Protocol is the standard for Solana). It cannot be completed by a code change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Matchmaking queue persistence | Custom Redis/DB queue | In-memory Map | Queue is ephemeral by design; server restart = re-queue; acceptable for current scale |
| SHOT milestone tracking | On-chain program | In-memory + MongoDB | Mint authority is burned; no new on-chain programs can be created; DB persistence is the right layer |
| Treasury multisig | Custom multi-sig logic | Squads Protocol | Don't build multisig from scratch; Squads is the ecosystem standard |

---

## Common Pitfalls

### Pitfall 1: Wager Tier Sync Between Server and Client
**What goes wrong:** Server and client define MATCH_MODES independently. If you update only one, the lobby UI will show incorrect tiers while the server rejects valid wagers (or vice versa).
**Why it happens:** Duplicate constants without a shared source of truth (noted in MEMORY.md).
**How to avoid:** Update both `server/services/solana.js` AND `client/src/screens/LobbyScreen.js` in the same task. Add a comment in each file pointing to the other.
**Warning signs:** Client shows wager tier X, server sends `createRoomError: Invalid wager tier`.

### Pitfall 2: Custom Challenge Wager Bypassing WAGER_TIERS Whitelist
**What goes wrong:** The `validateMatchMode` function (server/services/solana.js line 56) rejects wagers not in WAGER_TIERS. Custom Challenge allows arbitrary amounts, so it will always fail this check.
**How to avoid:** Add a mode-specific bypass: `if (mode !== 'custom_challenge' && wagerSOL > 0 && !WAGER_TIERS.includes(wagerSOL)) return invalid`.
**Warning signs:** `createRoom` always returns `Invalid wager tier` for custom_challenge mode.

### Pitfall 3: SHOT Milestone State Persistence
**What goes wrong:** `playerShotState` in shot-token.js is in-memory only. The new v2.1 milestone fields (`wageredWins`, `consecutiveWins`, etc.) will be lost on server restart, resetting milestone progress.
**Why it happens:** Known from MEMORY.md: "In-memory player SHOT state... Balances are lost on server restart."
**How to avoid:** For Phase 3, persist milestone state to MongoDB User model — add the new fields to the User schema. Load from DB on `authenticate` event, save after each milestone grant.
**Warning signs:** Player earns "First wagered match" milestone repeatedly after each server restart.

### Pitfall 4: Queue State on Disconnect
**What goes wrong:** If a player in the matchmaking queue disconnects, they remain in the queue map, blocking the slot or matching with a ghost.
**How to avoid:** In the `disconnect` handler (main.js ~line 430), check all queues and remove any entry for the disconnecting socket.
**Warning signs:** Players who disconnect while queuing get matched with "ghost" opponents who never respond.

### Pitfall 5: 3-Forfeit Rule vs. Disconnect Rule Conflict
**What goes wrong:** Disconnect already triggers forfeit settlement (cleanupRoom). The 3-forfeit timeout rule is for players who stay connected but don't take their turn. If you conflate them, a player who disconnects once will not be handled correctly.
**How to avoid:** Keep disconnect-forfeit logic separate from timeout-forfeit logic. The timeout counter tracks **connected** players who timeout. Disconnect triggers immediate cleanupRoom (existing behavior).
**Warning signs:** Disconnected players are counted toward timeout forfeit counter and don't trigger immediate cleanup.

### Pitfall 6: Practice Mode Damage Milestone (LP-04 Milestone 5)
**What goes wrong:** Milestone 5 ("Deal 500+ damage in a single round") requires tracking damage per round, not per match. If you only pass total match damage to the emission checker, this milestone can never be correctly awarded.
**How to avoid:** At `roundEnd` (not just `matchEnd`), record the round's max damage dealt for each player. At match end, pass the highest single-round damage to the milestone checker.
**Warning signs:** Milestone 5 never triggers even when a player deals 500+ damage in a round.

---

## Code Examples

### Updated WAGER_TIERS and MATCH_MODES (server/services/solana.js)
```javascript
// Source: Litepaper v2.1 Section 05 — SOL Wagering
export const WAGER_TIERS = [0, 0.1, 0.25, 0.5, 1.0];

export const MATCH_MODES = {
    practice:         { label: 'Practice',         wagerRange: [0, 0],         formats: [1] },
    quick_match:      { label: 'Quick Match',      wagerRange: [0.1, 0.1],     formats: [1, 3] },
    duel:             { label: 'Duel',             wagerRange: [0.25, 0.5],    formats: [3, 5] },
    high_roller:      { label: 'High Roller',      wagerRange: [1.0, 1.0],     formats: [3, 5] },
    custom_challenge: { label: 'Custom Challenge', wagerRange: [0.1, Infinity],formats: [1, 3, 5] },
};

export function validateMatchMode(mode, wagerSOL, matchLength) {
    const config = MATCH_MODES[mode];
    if (!config) return { valid: false, reason: 'Unknown match mode' };
    if (wagerSOL < config.wagerRange[0] || wagerSOL > config.wagerRange[1]) {
        return { valid: false, reason: `Wager must be ${config.wagerRange[0]}+ SOL for ${config.label}` };
    }
    // Skip tier whitelist for custom_challenge (any amount >= 0.1 SOL)
    if (mode !== 'custom_challenge' && wagerSOL > 0 && !WAGER_TIERS.includes(wagerSOL)) {
        return { valid: false, reason: 'Invalid wager tier' };
    }
    if (!config.formats.includes(matchLength)) {
        return { valid: false, reason: `${config.label} only supports BO${config.formats.join('/BO')}` };
    }
    return { valid: true };
}
```

### Updated SHOT_MILESTONES (server/services/shot-token.js)
```javascript
// Source: Litepaper v2.1 Section 06 — SHOT Token, Emission Mechanics
// 8 one-time milestones per account. Each has a unique ID for dedup.
export const SHOT_MILESTONES = [
    { id: 'first_wagered_match', label: 'First Wagered Match',              reward: 10,  check: (s) => s.wageredMatchesPlayed >= 1 },
    { id: 'ten_wagered_wins',    label: '10 Wagered Wins',                  reward: 25,  check: (s) => s.wageredWins >= 10 },
    { id: 'fifty_wagered_wins',  label: '50 Wagered Wins',                  reward: 75,  check: (s) => s.wageredWins >= 50 },
    { id: '100_wagered_matches', label: '100 Wagered Matches Played',       reward: 50,  check: (s) => s.wageredMatchesPlayed >= 100 },
    { id: '500_damage_round',    label: '500+ Damage In A Single Round',    reward: 15,  check: (s, ctx) => ctx.maxRoundDamage >= 500 },
    { id: 'no_prestige_win',     label: 'Win Without Prestige Weapons',     reward: 20,  check: (s, ctx) => ctx.isWinner && ctx.usedNoPrestige },
    { id: 'five_win_streak',     label: 'Win 5 Matches In A Row',           reward: 40,  check: (s) => s.consecutiveWins >= 5 },
    { id: '100_total_matches',   label: 'Reach 100 Total Matches',          reward: 100, check: (s) => s.totalMatchesPlayed >= 100 },
];
```

### Matchmaking Queue (main.js addition)
```javascript
// In-memory matchmaking queues keyed by "modeKey:format"
// e.g., "quick_match:1" for Quick Match BO1
const matchmakingQueues = new Map();

function getQueueKey(matchMode, matchLength) {
    return `${matchMode}:${matchLength}`;
}

function removeFromAllQueues(socketId) {
    for (const [key, queue] of matchmakingQueues.entries()) {
        const idx = queue.findIndex(e => e.socketId === socketId);
        if (idx !== -1) {
            queue.splice(idx, 1);
            if (queue.length === 0) matchmakingQueues.delete(key);
        }
    }
}
```

### 3-Forfeit Rule (main.js, startTurnTimer modification)
```javascript
function startTurnTimer(io, roomId) {
    clearTurnTimer(roomId)
    turnTimers[roomId] = setTimeout(async () => {
        const ms = matchStates[roomId]
        if (!ms || ms.status !== MATCH_STATES.BATTLE) return
        const room = findRoom(roomId)
        if (!room) return
        const currentTurnId = ms.currentTurn
        if (!currentTurnId) return

        // Track consecutive timeouts per player
        if (!ms.consecutiveTimeouts) ms.consecutiveTimeouts = {}
        ms.consecutiveTimeouts[currentTurnId] = (ms.consecutiveTimeouts[currentTurnId] || 0) + 1

        // Reset opponent's consecutive counter — they "acted" by waiting
        const hostId = room.host ? room.host.socketId : null
        const playerId = room.player ? room.player.socketId : null
        const opponentId = currentTurnId === hostId ? playerId : hostId
        if (opponentId) ms.consecutiveTimeouts[opponentId] = 0

        // 3-forfeit rule: end match if timed out player hit 3 consecutive
        if (ms.consecutiveTimeouts[currentTurnId] >= 3) {
            clearTurnTimer(roomId)
            // Opponent wins by timeout forfeit
            // ... trigger settlement with opponent as winner ...
            return
        }

        ms.turnCount++
        ms.currentTurn = getNextTurn(ms, hostId, playerId)
        io.sockets.in(roomId).emit('turnTimeout', { timedOutPlayer: currentTurnId, nextTurn: ms.currentTurn, turnCount: ms.turnCount })
        startTurnTimer(io, roomId)
    }, TURN_TIMEOUT_MS)
}
```

### Server-Side Move Enforcement (main.js, stepLeft/stepRight handlers)
```javascript
// Add to match state initialization or reset-per-turn:
// ms.moveCounts = { [hostId]: 0, [playerId]: 0 }
// Reset when currentTurn changes (in applyTurnResult / getNextTurn logic)

client.on('stepLeft', () => {
    if (!client.roomId) return
    const ms = matchStates[client.roomId]
    if (ms && !validateAction(ms.status, 'stepLeft')) return

    // Server-side 4-step enforcement
    if (!ms.moveCounts) ms.moveCounts = {}
    const used = ms.moveCounts[client.id] || 0
    if (used >= 4) return  // Silent drop — client already prevents this but server enforces
    ms.moveCounts[client.id] = used + 1

    // ... existing position update logic ...
    client.to(client.roomId).emit('opponentStepLeft', {})
})
```

---

## State of the Art

| Old Approach (v2.0) | v2.1 Approach | Impact |
|---------------------|---------------|--------|
| Wager tiers: 0.01/0.05/0.1/0.25/0.5 SOL | 0.1/0.25/0.5/1.0 SOL | Higher floor, cleaner tiers |
| No Custom Challenge | Custom Challenge: 0.1+ SOL, any format | Opens high-stakes private matches |
| Manual room creation + room list | Queue-based pairing for standard modes | Better UX; custom still manual |
| SHOT via match-count ladder (50→2000 SHOT) | 8 one-time milestones (10→100 SHOT) | Much lower emission; more deflationary |
| No Practice mode SHOT penalty | 25% rate in Practice | Incentivizes wagered play |
| Timeout: advance turn, no limit | 3 consecutive timeouts = match end | Prevents AFK stall tactics |
| 4-step limit client-only | 4-step limit also server-enforced | Closes movement exploit vector |

---

## Open Questions

1. **Consecutive timeouts: per-player or combined?**
   - Litepaper says "After 3 forfeits, match ends." The word "consecutive" appears in the requirements but not the litepaper text itself.
   - What we know: the edge-case table says "Timeout (no action 60s) → Turn auto-forfeits. After 3 forfeits, match ends."
   - What's unclear: if Player A forfeits 2 turns and Player B forfeits 1, does the count reset? Or does A have 2 and B have 1?
   - Recommendation: Track per-player consecutive timeouts. Reset a player's count when they successfully fire. This is the most player-friendly interpretation and avoids punishing a player for their opponent's timeouts.

2. **SHOT milestone state persistence across server restarts**
   - What we know: current in-memory SHOT state is lost on restart; this is documented in MEMORY.md.
   - What's unclear: Does Phase 3 require adding MongoDB persistence for milestone state, or is that deferred?
   - Recommendation: Phase 3 should add MongoDB persistence for the new milestone fields to the User schema. The Player SHOT state needs `wageredMatchesPlayed`, `wageredWins`, `totalMatchesPlayed`, `consecutiveWins` stored in DB and loaded on authenticate. Without this, milestones 1-4 and 7-8 will reset on every server restart.

3. **Quick Match wager: fixed at 0.1 SOL or range?**
   - Litepaper v2.1 table shows Quick Match as `0.1 SOL` (single value, not a range).
   - Current code has wagerRange `[0.01, 0.1]` (a range). v2.1 implies it's fixed at 0.1 SOL.
   - Recommendation: Set `wagerRange: [0.1, 0.1]` (min = max = 0.1). This is how the litepaper reads — the lobby just shows "0.1 SOL" with no selector.

4. **Matchmaking queue: skill-based rating (Elo)?**
   - Litepaper mentions "optional skill-based rating (Elo) weighting in ranked modes."
   - This is explicitly marked optional. No Elo system exists.
   - Recommendation: Skip Elo for Phase 3. Queue by order only. Mark as a Phase 6 expansion item.

5. **Treasury multisig: Squads Protocol or Realms?**
   - Both are valid Solana multisig solutions. Squads is newer and more focused.
   - This is an operations decision, not a development decision.
   - Recommendation: Document the requirement. Out of scope for Phase 3 code. Set `TREASURY_WALLET` env var when a multisig is chosen.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `server/services/solana.js` — WAGER_TIERS and MATCH_MODES constants
- Direct codebase inspection: `server/services/shot-token.js` — SHOT_MILESTONES and recordMatchPlayed
- Direct codebase inspection: `server/services/match.js` — createMatchState, isRoundOver, turnsPerRound
- Direct codebase inspection: `server/socket-io/main.js` — startTurnTimer, stepLeft/stepRight handlers
- Direct codebase inspection: `client/src/screens/LobbyScreen.js` — client MATCH_MODES and ALL_WAGER_TIERS
- Direct codebase inspection: `client/src/scenes/main/index.js` — movesRemaining, applyTurnResult
- Direct codebase inspection: `client/src/classes/Tank.js` — movesRemaining = 4
- `SolShot_Litepaper_v2.1.md` — authoritative spec for all requirements

### Secondary (MEDIUM confidence)
- MEMORY.md — project-level gotchas and known issues

---

## Metadata

**Confidence breakdown:**
- LP-01 (wager tiers): HIGH — direct constant inspection, diff is clear
- LP-02 (custom challenge): HIGH — missing from MATCH_MODES in both files, approach is clear
- LP-03 (matchmaking queue): HIGH — current code is a thin wrapper, new queue is standard pattern
- LP-04 (SHOT milestones): HIGH — current schema is completely different from v2.1; replacement is fully specced
- LP-05 (practice 25%): HIGH — single flag addition to emission call site
- LP-06 (20-turn limit): HIGH — already correct, confirmed from match.js source
- LP-07 (tank movement): HIGH — client correct, server needs enforcement; gap is clear
- LP-08 (3-forfeit rule): HIGH — missing counter, addition is straightforward
- LP-09 (treasury multisig): HIGH — no code required, operations task

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable codebase, constants unlikely to change without this phase)
