# Phase 15: Server Core Services — Research

**Researched:** 2026-02-26
**Domain:** Node.js/ES-module server game logic — match state machine, turn rotation, placement scoring
**Confidence:** HIGH (all findings from direct source-code inspection — no library docs needed)

---

## Summary

Phase 15 rewrites `server/services/match.js` and `server/services/gold.js` to support 2–4 players. Both files are pure logic modules with no external dependencies (match.js imports only `crypto`). The rewrite is surgical: four functions in match.js carry binary signatures (`getNextTurn`, `isRoundOver`, `isMatchOver`, `getRoundWinner`) and must change together because `main.js` calls all four inside a single post-fire block. A fifth function (`createMatchState`) must gain a `maxPlayers` param and seed `players[]`, `alive{}`, `currentPlayerIndex`, and `placementPoints{}`. `initGold` in gold.js must change from `(hostId, playerId)` to accept an `N`-player player array.

The standard approach for N-player turn rotation in game servers is a circular index over an array of alive player IDs, advancing by incrementing the index mod array-length while skipping dead players. This pattern (used in Guntanks and similar artillery games) is safer than splicing the array on death because reconnect logic in `main.js` remaps socketIds across all keyed maps — splicing would lose position information.

**Primary recommendation:** Use `currentPlayerIndex` (integer, position in `players[]`) rather than the old `currentTurn` (socketId string), but keep `ms.currentTurn` as a **derived convenience alias** set after every index change so all downstream `ms.currentTurn` reads in `main.js` continue to work without modification.

---

## Standard Stack

No external libraries needed. All logic is plain JavaScript in ES-module files.

| File | Lines | Role |
|------|-------|------|
| `server/services/match.js` | 218 | Match state machine — all 4 binary functions + createMatchState |
| `server/services/gold.js` | 115 | Gold economy — initGold signature + placement scoring constants |
| `server/socket-io/main.js` | 2728 | Only consumer — all call sites identified below |

---

## Architecture Patterns

### Recommended `matchState` Shape (N-player)

```javascript
{
  roomId,
  status,                        // unchanged
  roundType,                     // unchanged
  maxRounds,                     // unchanged
  maxPlayers,                    // NEW: 2 | 3 | 4
  players: [],                   // NEW: ordered array of socketIds, set once at createMatchState call
  alive: {},                     // NEW: { [socketId]: boolean }
  currentPlayerIndex: 0,         // NEW: index into players[]
  currentTurn: null,             // KEPT as alias: players[currentPlayerIndex]
  currentRound: 0,
  scores: {},                    // unchanged: { [socketId]: totalDamageDealt }
  kills: {},                     // unchanged
  roundWins: {},                 // REPURPOSED: now stores placementPoints (not win counts)
  placementPoints: {},           // NEW: { [socketId]: cumulative points } — used by isMatchOver
  damageDealtTotal: {},          // NEW: { [socketId]: total damage across all rounds } — tiebreaker
  eliminationOrder: [],          // NEW: socketIds in order eliminated this round (first dead = index 0)
  hp: {},                        // unchanged
  turnCount: 0,
  turnSequence: 0,
  turnsPerRound: 20,             // CHANGES: set to maxPlayers * 10 in createMatchState
  terrain: null,
  tankPositions: null,
  stateChangedAt: Date.now(),
  weaponShotsFired: {},
  weaponHits: {},
  weaponDamage: {},
  totalDeaths: {},
}
```

**Key design note:** `roundWins` is already read in `main.js` at lines 646–647 (disconnect decision chain) and in the `reconnected` emit at line 951. For backward compat, either keep `roundWins` for 2-player and add `placementPoints` for N>2, or emit both. The cleanest approach: keep `roundWins` for BO1 2-player "wins" tracking, and add `placementPoints` as the canonical source for BO3/BO5.

### Recommended Room Shape Addition

```javascript
roomData.maxPlayers = maxPlayers  // 2 | 3 | 4 — set at createRoom/joinQueue
```

`createMatchState(roomId, roundType, playerIds)` must receive player IDs at creation time so `players[]` and `alive{}` are pre-populated.

---

## Exact Function Signatures: Old vs New

### `createMatchState`

**Old:**
```javascript
export function createMatchState(roomId, roundType = '1')
```

**New:**
```javascript
export function createMatchState(roomId, roundType = '1', playerIds = [])
```

`playerIds` is an array of socketIds (or empty array for deferred initialization). When non-empty, sets `players`, `alive`, `hp`, `currentPlayerIndex`, and `turnsPerRound = playerIds.length * 10`.

**Call sites in main.js:**
- Line 85: `createMatchState(roomId, paRoundType)` — playAgain path, no playerIds yet (they haven't re-readied)
- Line 1229: `createMatchState(roomId, roundType)` — createRoom, no playerIds yet (player hasn't joined)
- Line 1357: `createMatchState(roomId, roundType)` — joinQueue auto-match — HAS both players!

For the queue path (line 1357), playerIds can be passed immediately. For createRoom (line 1229) and playAgain (line 85), `players[]` must be populated later at `requestTerrain` time (when HP is initialized, lines 2500–2501). This is already done:

```javascript
// main.js line 2500-2501 (requestTerrain handler)
if (room.host) ms.hp[room.host.socketId] = 250
if (room.player) ms.hp[room.player.socketId] = 250
```

The N-player version of this block must also set `ms.players` and `ms.alive` if not already set.

### `getNextTurn`

**Old:**
```javascript
export function getNextTurn(matchState, hostId, playerId)
// Returns: socketId string
```

**New:**
```javascript
export function getNextTurn(matchState)
// Returns: socketId string (the next alive player)
// Mutates: matchState.currentPlayerIndex, matchState.currentTurn
```

**Call sites in main.js:**

| Line | Context | Old call | New call |
|------|---------|----------|----------|
| 443 | turnTimeout handler | `getNextTurn(ms, hostId, playerId)` | `getNextTurn(ms)` |
| 2117 | post-fire (normal) | `getNextTurn(ms, hostId, playerId)` | `getNextTurn(ms)` |
| 2495 | requestTerrain (first turn) | `getNextTurn(ms, room.host.socketId, room.player?.socketId)` | `getNextTurn(ms)` |

**All three assign the result to `ms.currentTurn`.** With the new signature, `getNextTurn` sets `ms.currentTurn` internally AND returns it. The call-site assignment `ms.currentTurn = getNextTurn(ms)` still works identically — it assigns the return value, which matches what was already set internally. No call-site changes required.

**Algorithm:**
```javascript
export function getNextTurn(matchState) {
    const { players, alive, currentPlayerIndex } = matchState;
    if (!players || players.length === 0) return null;

    // First turn: random start among alive players
    if (matchState.currentTurn === null) {
        const alivePlayers = players.filter(id => alive[id]);
        if (alivePlayers.length === 0) return null;
        const startIdx = crypto.randomInt(alivePlayers.length);
        matchState.currentPlayerIndex = players.indexOf(alivePlayers[startIdx]);
        matchState.currentTurn = players[matchState.currentPlayerIndex];
        return matchState.currentTurn;
    }

    // Advance index, skip dead
    let next = currentPlayerIndex;
    for (let i = 0; i < players.length; i++) {
        next = (next + 1) % players.length;
        if (alive[players[next]]) {
            matchState.currentPlayerIndex = next;
            matchState.currentTurn = players[next];
            return matchState.currentTurn;
        }
    }
    return null; // all dead (should not happen in practice)
}
```

**2-player backward compat:** With players = [hostId, playerId] and both alive, the function alternates correctly. Identical behavior to the old binary alternation.

### `isRoundOver`

**Old:**
```javascript
export function isRoundOver(matchState)
// Returns: boolean — true if any hp <= 0 OR turns exhausted
```

**New:**
```javascript
export function isRoundOver(matchState)
// Returns: boolean — true if 1 or fewer alive players OR turns exhausted
// Side effect: none (alive map is updated by the fire handler in main.js, not here)
```

**Algorithm change:** The old check `if any hp <= 0 → round over` was correct for 2 players but wrong for N: in 3-player, eliminating P2 should NOT end the round — P1 and P3 still fight.

```javascript
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    const alivePlayers = Object.values(matchState.alive || {}).filter(Boolean);
    return alivePlayers.length <= 1;
}
```

**CRITICAL:** `main.js` must mark `ms.alive[playerId] = false` when HP drops to 0, and push the socketId to `ms.eliminationOrder`. This is done in the fire handler (Phase 16 territory), but `isRoundOver` depends on the `alive` map being correct. This is the key coupling point: Phase 15 provides the data structure and the check; Phase 16 (fire handler rewrite) populates it.

**Call sites:** Lines 2158 and 2163 in main.js — both call `isRoundOver(ms)` with no other args. **No signature change needed.**

### `isMatchOver`

**Old:**
```javascript
export function isMatchOver(matchState, hostId, playerId)
// Returns: { isOver: boolean, winner?: socketId }
```

**New:**
```javascript
export function isMatchOver(matchState)
// Returns: { isOver: boolean, winner?: socketId }
```

**Algorithm:** Placement-points model replaces win-count model.

```javascript
// Placement points awarded per round:
const PLACEMENT_POINTS = { 1: 3, 2: 2, 3: 1, 4: 0 }; // rank → points

export function isMatchOver(matchState) {
    if (matchState.currentRound < matchState.maxRounds) {
        return { isOver: false };
    }
    // All rounds played — determine winner by cumulative placementPoints
    const pts = matchState.placementPoints || {};
    const players = matchState.players || [];
    if (players.length === 0) return { isOver: false };

    let winner = null;
    let maxPts = -1;
    let tied = [];

    for (const pid of players) {
        const p = pts[pid] || 0;
        if (p > maxPts) { maxPts = p; winner = pid; tied = [pid]; }
        else if (p === maxPts) { tied.push(pid); }
    }

    if (tied.length === 1) return { isOver: true, winner };

    // Tiebreaker: total damage dealt
    const dmg = matchState.damageDealtTotal || {};
    tied.sort((a, b) => (dmg[b] || 0) - (dmg[a] || 0));
    return { isOver: true, winner: tied[0] };
}
```

**BO1 special case:** For `maxRounds === 1`, `isMatchOver` is called after round 1 completes (`currentRound === 1 >= maxRounds === 1`). The winner is whoever has the most placement points, which for BO1 = the survivor (1st place = 3 pts, everyone else = 0 or less). This works identically.

**Call sites in main.js:**
- Line 2172: `const matchResult = isMatchOver(ms, hostId, playerId)` — **signature change required here**
- Line 646–647 (disconnect decision chain): Uses `roundWins` directly, NOT `isMatchOver` — **no change needed**

### `getRoundWinner`

**Old:**
```javascript
export function getRoundWinner(matchState, hostId, playerId)
// Returns: socketId of round winner
```

**New:**
```javascript
export function getRoundPlacement(matchState)
// Returns: string[] — player IDs in placement order [1st, 2nd, 3rd, 4th]
// Side effect: updates matchState.placementPoints and matchState.damageDealtTotal
```

Rename to `getRoundPlacement` because for N players there is no single "winner" — the function must return the full ranking so points can be assigned. It also awards the placement points by mutating `matchState.placementPoints`.

**Algorithm:**
```javascript
export const PLACEMENT_POINTS = [3, 2, 1, 0]; // index = placement (0-based), value = points

export function getRoundPlacement(matchState) {
    const players = matchState.players || [];
    const alive = matchState.alive || {};
    const hp = matchState.hp || {};
    const scores = matchState.scores || {};

    // Survivors (still alive at round end) ranked by HP descending, then damage dealt
    const survivors = players.filter(id => alive[id]);
    survivors.sort((a, b) => {
        if (hp[b] !== hp[a]) return hp[b] - hp[a];
        return (scores[b] || 0) - (scores[a] || 0);
    });

    // Eliminated players already in eliminationOrder (first eliminated = last place)
    const eliminated = [...(matchState.eliminationOrder || [])].reverse(); // last eliminated first
    // eliminationOrder: [firstKilled, secondKilled, ...] → reverse for ranking (later-killed = better)

    const ranked = [...survivors, ...eliminated];

    // Award placement points
    if (!matchState.placementPoints) matchState.placementPoints = {};
    if (!matchState.damageDealtTotal) matchState.damageDealtTotal = {};

    ranked.forEach((pid, i) => {
        const pts = PLACEMENT_POINTS[i] ?? 0;
        matchState.placementPoints[pid] = (matchState.placementPoints[pid] || 0) + pts;
        // Accumulate damage dealt for tiebreaker
        matchState.damageDealtTotal[pid] = (matchState.damageDealtTotal[pid] || 0) + (scores[pid] || 0);
    });

    return ranked; // [1st, 2nd, 3rd, 4th]
}
```

**Call site in main.js:**
- Line 2167: `const roundWinner = getRoundWinner(ms, hostId, playerId)` — must change to `const ranked = getRoundPlacement(ms)` and `const roundWinner = ranked[0]`
- Line 2169: `ms.roundWins[roundWinner] = ...` — with placement scoring, `roundWins` becomes irrelevant for BO3/BO5; `placementPoints` is already set inside `getRoundPlacement`. This line can be removed or kept as a convenience for the disconnect decision chain (lines 646–647).
- Line 2177: `awardRoundWinBonus(gold, roundWinner)` — still valid for 1st-place player.

### `initGold`

**Old:**
```javascript
export function initGold(hostId, playerId)
// Returns: { [hostId]: 1000, [playerId]: 1000 }
```

**New:**
```javascript
export function initGold(playerIds)
// playerIds: string[] — array of socketIds
// Returns: { [id]: 1000, ... } for all players
```

**Call site in main.js:**
- Line 1510: `goldStates[client.roomId] = initGold(hostId, playerId)` — must change to `initGold([hostId, playerId])` (or however playerIds are assembled at that point). For 2 players this is `[hostId, playerId]` which produces the same output.

**Placement scoring constants in gold.js:**

```javascript
// Award Gold for placement (replaces ROUND_WIN_BONUS for 1st only — others get lower amounts)
export const PLACEMENT_GOLD = [300, 150, 75, 0]; // [1st, 2nd, 3rd, 4th]
```

Or keep `ROUND_WIN_BONUS = 300` for 1st place only and add `PLACEMENT_GOLD` for the new awards. The simpler approach that preserves backward compat: add `awardPlacementGold(goldState, ranked)` that awards `PLACEMENT_GOLD[i]` to each player by index.

### `resetForNextRound`

**Current code:**
```javascript
export function resetForNextRound(matchState) {
    matchState.turnCount = 0;
    matchState.turnSequence = 0;
    matchState.currentTurn = null;
    for (const playerId of Object.keys(matchState.hp)) {
        matchState.hp[playerId] = 250;
    }
}
```

**Needed additions:**
```javascript
export function resetForNextRound(matchState) {
    matchState.turnCount = 0;
    matchState.turnSequence = 0;
    matchState.currentTurn = null;
    matchState.currentPlayerIndex = 0;      // NEW
    matchState.eliminationOrder = [];        // NEW — clear for next round
    // Reset HP and alive status for all players
    for (const playerId of (matchState.players || Object.keys(matchState.hp))) {
        matchState.hp[playerId] = 250;
        if (matchState.alive) matchState.alive[playerId] = true;  // NEW
    }
}
```

**Call site:** Line 2434 in main.js — `resetForNextRound(ms)` — no signature change needed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Circular turn order | Custom linked list | Array + index mod length | Simple, debuggable, reconnect-remap-friendly |
| Dead-player skipping | Splice array on death | `alive{}` map + skip-in-loop | Reconnect logic remaps by ID across all maps; splicing loses positional info |
| Tiebreaker logic | Complex custom sort | Sort by `damageDealtTotal` (already tracked in `ms.scores`) | `ms.scores` already accumulates damage dealt — just sum across rounds |

---

## Common Pitfalls

### Pitfall 1: Simultaneous death (two players die on same shot — e.g. mutual splash)

**What goes wrong:** Physics `result.damage` can contain multiple entries in one `turnResult`. If P2 and P3 both hit 0 HP on P1's shot, `isRoundOver` would fire with 2 players simultaneously "eliminated." The `eliminationOrder` must capture both in a deterministic order.

**How to avoid:** When processing `result.damage` in the fire handler, iterate damage in `players[]` array order (not object key order) and push to `eliminationOrder` in that order. The later-indexed player is treated as "surviving longer" for ranking purposes — this is a defined convention, not an ambiguity.

**Warning sign:** `eliminationOrder.length + alivePlayers.length !== players.length` after a fire.

### Pitfall 2: `getRoundWinner` rename breaks the `awardRoundWinBonus` call

**What goes wrong:** Line 2177 calls `awardRoundWinBonus(gold, roundWinner)` after `getRoundWinner`. If `getRoundWinner` is renamed to `getRoundPlacement` and returns an array, the variable `roundWinner` must be updated to `ranked[0]`.

**How to avoid:** The rename is a 3-line change in main.js: line 2167, 2169, 2177. Document all three changes in the plan.

### Pitfall 3: `isMatchOver` signature change — the one required main.js edit

**What goes wrong:** `isMatchOver(ms, hostId, playerId)` at line 2172 must become `isMatchOver(ms)`. If the old args are passed to the new function, it silently ignores them — no crash, but also no regression test catches it.

**How to avoid:** The new `isMatchOver` must NOT use the extra args even if passed. Verify with a 2-player BO3 match that still works after the change.

### Pitfall 4: `roundWins` used by disconnect decision chain (lines 646–647)

**What goes wrong:** The disconnect settlement logic at lines 645–668 reads `currentMs.roundWins[disconnectorId]` and `currentMs.roundWins[opponentSid]`. If `roundWins` is replaced entirely by `placementPoints`, this comparison breaks.

**How to avoid:** Keep `roundWins` tracking for the disconnect path. Simplest approach: after `getRoundPlacement` awards placement points, also update `roundWins[firstPlaceId]++` so the disconnect chain still works for 2-player. For N-player disconnect, the chain needs Phase 16 work anyway — for now, the 2-player path is the critical one to preserve.

### Pitfall 5: `reconnect` handler remaps socketIds in all maps (lines 903, 926)

**What goes wrong:** Lines 903 and 926 remap `ms.roundWins[oldSocketId]` → `ms.roundWins[newSocketId]`. After the rewrite, `ms.players[]` also contains the old socketId and must be updated.

**How to avoid:** Add `ms.players` remap in the reconnect handler. This is Phase 16 work (the reconnect handler is in main.js), but the data structure choice here (array of socketIds) makes this necessary. Document it explicitly.

**The remap pattern:**
```javascript
// Add to reconnect handler:
if (ms.players) {
    const idx = ms.players.indexOf(oldSocketId);
    if (idx !== -1) ms.players[idx] = newSocketId;
}
if (ms.alive && ms.alive[oldSocketId] !== undefined) {
    ms.alive[newSocketId] = ms.alive[oldSocketId];
    delete ms.alive[oldSocketId];
}
```

### Pitfall 6: `turnsPerRound` hardcoded to 20 in match.js; not referenced in main.js

**What goes wrong:** `turnsPerRound = 20` (10 per player) is set in `createMatchState` and only consumed by `isRoundOver`. If `maxPlayers` is added and `turnsPerRound = maxPlayers * 10` is not updated in `createMatchState`, a 3-player match still ends after 20 turns (6-7 turns per player instead of 10).

**How to avoid:** `turnsPerRound` must be set in `createMatchState` when `playerIds` is known. If `playerIds` is empty at creation time (createRoom case), set `turnsPerRound = 20` as default and update it when players are initialized (requestTerrain block).

### Pitfall 7: `awardRoundWinBonus` in gold.js awards only one winner

**What goes wrong:** The current `awardRoundWinBonus(gold, winnerId)` awards 300G to one player. For N-player with placement gold, this needs to award different amounts to each player.

**How to avoid:** Add `awardPlacementGold(goldState, rankedPlayerIds)` to gold.js. The existing `awardRoundWinBonus` can call `awardPlacementGold` with just the first-place player as a backward-compat shim, or it can be left for 2-player and `awardPlacementGold` used for 3-4 player.

---

## Code Examples

### getNextTurn — Full Implementation

```javascript
// Source: direct design from requirements + Guntanks reference pattern
export function getNextTurn(matchState) {
    const { players, alive } = matchState;
    if (!players || players.length === 0) return null;

    // First turn of a round — random start among alive players
    if (matchState.currentTurn === null) {
        const alivePlayers = players.filter(id => alive[id]);
        if (alivePlayers.length === 0) return null;
        const startIdx = crypto.randomInt(alivePlayers.length);
        matchState.currentPlayerIndex = players.indexOf(alivePlayers[startIdx]);
        matchState.currentTurn = players[matchState.currentPlayerIndex];
        return matchState.currentTurn;
    }

    // Advance from current position, skip dead players
    let idx = matchState.currentPlayerIndex;
    for (let i = 0; i < players.length; i++) {
        idx = (idx + 1) % players.length;
        if (alive[players[idx]]) {
            matchState.currentPlayerIndex = idx;
            matchState.currentTurn = players[idx];
            return matchState.currentTurn;
        }
    }
    // All players dead — should not reach here in valid game flow
    return null;
}
```

### isRoundOver — N-player Version

```javascript
// Source: requirements CORE-04
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    const aliveCount = Object.values(matchState.alive || {}).filter(Boolean).length;
    return aliveCount <= 1;
}
```

### getRoundPlacement — Full Implementation

```javascript
// Source: requirements SCORE-01 through SCORE-03
export const PLACEMENT_POINTS = [3, 2, 1, 0]; // index 0 = 1st place

export function getRoundPlacement(matchState) {
    const players = matchState.players || [];
    const alive = matchState.alive || {};
    const hp = matchState.hp || {};
    const scores = matchState.scores || {};

    // Rank survivors by HP desc, then damage dealt desc
    const survivors = players.filter(id => alive[id]);
    survivors.sort((a, b) => {
        const hpDiff = (hp[b] || 0) - (hp[a] || 0);
        if (hpDiff !== 0) return hpDiff;
        return (scores[b] || 0) - (scores[a] || 0);
    });

    // Eliminated players: later-eliminated ranks higher
    // eliminationOrder = [firstKilled, secondKilled, ...]
    // Reverse it so later-killed = lower index in eliminated array (better rank)
    const eliminated = [...(matchState.eliminationOrder || [])].reverse();

    // Final ranking: survivors (best first), then eliminated (last killed first)
    const ranked = [...survivors, ...eliminated];

    // Award placement points and accumulate damage totals
    if (!matchState.placementPoints) matchState.placementPoints = {};
    if (!matchState.damageDealtTotal) matchState.damageDealtTotal = {};

    ranked.forEach((pid, i) => {
        const pts = PLACEMENT_POINTS[i] ?? 0;
        matchState.placementPoints[pid] = (matchState.placementPoints[pid] || 0) + pts;
        matchState.damageDealtTotal[pid] = (matchState.damageDealtTotal[pid] || 0) + (scores[pid] || 0);
    });

    // Convenience: update roundWins for the winner (preserves disconnect logic at line 645-668)
    if (ranked[0]) {
        if (!matchState.roundWins) matchState.roundWins = {};
        matchState.roundWins[ranked[0]] = (matchState.roundWins[ranked[0]] || 0) + 1;
    }

    return ranked;
}
```

### isMatchOver — N-player Version

```javascript
// Source: requirements SCORE-03, SCORE-04
export function isMatchOver(matchState) {
    if (matchState.currentRound < matchState.maxRounds) {
        return { isOver: false };
    }

    const players = matchState.players || [];
    const pts = matchState.placementPoints || {};

    if (players.length === 0) return { isOver: false };

    // Find max points
    let maxPts = -1;
    for (const pid of players) {
        const p = pts[pid] || 0;
        if (p > maxPts) maxPts = p;
    }

    const tied = players.filter(pid => (pts[pid] || 0) === maxPts);

    if (tied.length === 1) {
        return { isOver: true, winner: tied[0] };
    }

    // Tiebreaker: total damage dealt across all rounds
    const dmg = matchState.damageDealtTotal || {};
    tied.sort((a, b) => (dmg[b] || 0) - (dmg[a] || 0));

    // If still tied after damage (extremely rare), first in players[] array wins
    return { isOver: true, winner: tied[0] };
}
```

### initGold — N-player Version

```javascript
// Source: requirements CORE-06, gold.js backward compat
export function initGold(playerIds) {
    // playerIds: string[] — array of socketIds
    const state = {};
    for (const id of playerIds) {
        state[id] = STARTING_GOLD;
    }
    return state;
}
```

**Call site fix in main.js line 1510:**
```javascript
// OLD:
goldStates[client.roomId] = initGold(hostId, playerId)
// NEW:
goldStates[client.roomId] = initGold([hostId, playerId])
```

---

## Change Impact Analysis: Functions vs Independence

### Functions that MUST change together (atomic pair)

`isRoundOver` + **the fire handler's `alive` map update** (Phase 16) must be developed together because `isRoundOver` now depends on `alive[]` being accurate. However, **for Phase 15 isolation**, `isRoundOver` can be written to fall back to the old HP check if `alive` is not populated:

```javascript
export function isRoundOver(matchState) {
    if (matchState.turnCount >= matchState.turnsPerRound) return true;
    // N-player path: use alive map
    if (matchState.alive && Object.keys(matchState.alive).length > 0) {
        return Object.values(matchState.alive).filter(Boolean).length <= 1;
    }
    // 2-player fallback: legacy HP check
    for (const hp of Object.values(matchState.hp || {})) {
        if (hp <= 0) return true;
    }
    return false;
}
```

This lets Phase 15 ship without requiring Phase 16 to set `alive`.

### Functions that can change INDEPENDENTLY

| Function | Can change alone? | Dependency |
|----------|-------------------|------------|
| `createMatchState` | YES | No callers depend on specific new fields |
| `resetForNextRound` | YES | Adding alive/eliminationOrder reset doesn't break existing calls |
| `initGold` | YES | Line 1510 in main.js needs the `[hostId, playerId]` array wrap — 1 line |
| `getNextTurn` | YES | Signature changes but ALL call sites already assign result to `ms.currentTurn`. New impl sets `ms.currentTurn` internally too. The assignment is redundant but harmless. |
| `isRoundOver` | YES (with fallback above) | Only depends on `alive` being set |
| `getRoundPlacement` (rename) | NO — requires 3 line edits in main.js | Lines 2167, 2169, 2177 in main.js |
| `isMatchOver` | NO — requires 1 line edit in main.js | Line 2172 signature change |

### Required main.js edits for Phase 15

These are **unavoidable** because function signatures change:

1. **Line 2167:** `const roundWinner = getRoundWinner(ms, hostId, playerId)` → `const ranked = getRoundPlacement(ms)` + `const roundWinner = ranked[0]`
2. **Line 2172:** `isMatchOver(ms, hostId, playerId)` → `isMatchOver(ms)`
3. **Line 1510:** `initGold(hostId, playerId)` → `initGold([hostId, playerId])`
4. **Import line 8:** Add `getRoundPlacement, PLACEMENT_POINTS` to match.js imports; remove `getRoundWinner`

All other call sites (getNextTurn, isRoundOver, resetForNextRound, createMatchState) need **no main.js changes**.

---

## 2-Player Backward Compatibility Verification

For 2-player mode (`maxPlayers: 2`, `players: [hostId, playerId]`):

| Function | 2-player behavior | Expected |
|----------|-------------------|----------|
| `getNextTurn` | Alternates between two alive players; random start | Same as before |
| `isRoundOver` | Returns true when 1 player alive (other dead) or turns exhausted | Same as before |
| `getRoundPlacement` | Returns `[winner, loser]`; awards 3pts to winner, 0 to loser | Winner gets `roundWins++` via compatibility line |
| `isMatchOver` | After all rounds: player with more placementPoints wins. BO1: winner has 3pts, loser has 0pts. BO3: first to 6+ points (2 wins × 3pts) can't be caught. | Functionally identical |
| `initGold` | `initGold([hostId, playerId])` → `{[hostId]: 1000, [playerId]: 1000}` | Same output |

**BO1 2-player match-over check:** After round 1, `currentRound === 1 >= maxRounds === 1`. Winner has 3 placementPoints, loser has 0. `isMatchOver` returns `{ isOver: true, winner: roundWinner }`. Correct.

**BO3 2-player early-exit:** The old code exited early when one player reached `ceil(3/2) = 2` wins. The new code does NOT have early exit — it plays all rounds. **This is a behavior change.** The requirements specify "placement scoring per round" with "match winner is player with most cumulative points after all rounds" (SCORE-03), which implies all rounds are played. However, if a BO3 early-exit is desired (once a player has unreachable lead), add:

```javascript
// Optional early-exit optimization (not required by spec):
// If one player has clinched: maxPossibleForTrailer < leader's current points
```

Recommendation: Do NOT add early-exit for Phase 15. The spec says "after all rounds." Verify this interpretation is intentional before planning early-exit logic.

---

## Edge Cases

### Simultaneous elimination (two players die same shot)

`result.damage` from physics can kill multiple players. The fire handler iterates `result.damage` and pushes dead players to `eliminationOrder`. If two players die simultaneously, they both get pushed in `players[]` array order (deterministic). The later-indexed player gets the "better" rank (they are treated as surviving marginally longer). This is a defined convention — document it in comments.

### All rounds tied (BO3, 3 rounds, scores could theoretically all be identical)

With placement scoring, a true 3-way tie in points requires each player to finish in each placement exactly once across 3 rounds. Even then, `damageDealtTotal` breaks the tie. A further tie (zero damage across all rounds) is resolved by `players[0]` position. This edge case is acceptable for launch.

### Match ends when 1 player alive (BO1 N-player)

With SCORE-01 ("last man standing wins for BO1"), this is handled by `isRoundOver` returning true when 1 player alive, then `getRoundPlacement` ranking survivors and `isMatchOver` returning the winner (currentRound >= maxRounds after the single round completes).

### `currentPlayerIndex` after reconnect

Reconnect handler must update `ms.players[idx]` from old to new socketId. The `currentPlayerIndex` integer itself does NOT need to change — it's an array index, not a socketId. The array element at that index changes. This is the correct behavior: the reconnected player resumes at their same position in rotation.

---

## State Machine: No Changes Needed

`MATCH_STATES`, `TRANSITIONS`, `transitionState`, and `validateAction` are unchanged. They're already N-player-agnostic (status-based, no player-count assumptions).

---

## Open Questions

1. **BO3/BO5 early exit desired?**
   - Current spec (SCORE-03): "match winner is player with most cumulative points after all rounds" implies no early exit.
   - Old code had early exit when `roundWins >= ceil(maxRounds/2)`.
   - Recommendation: no early exit for Phase 15; revisit if John requests it.

2. **`roundWins` field — keep or remove?**
   - Lines 646–647 (disconnect path) and line 951 (reconnect emit) use `roundWins`.
   - `getRoundPlacement` can continue updating `roundWins[ranked[0]]++` as a side effect to preserve these call sites unchanged.
   - Recommended: keep `roundWins` as the 1st-place counter; do not remove.

3. **`turnsPerRound` when `createMatchState` called without `playerIds`**
   - createRoom (line 1229) calls `createMatchState` before the second player joins.
   - Default `turnsPerRound = 20` is fine; it must be updated when `players[]` is populated at `requestTerrain` time.
   - Or: accept a `maxPlayers` param to `createMatchState` and set `turnsPerRound = maxPlayers * 10`.
   - Recommended: add `maxPlayers` param to `createMatchState` since `roomData.maxPlayers` is known at createRoom time.

---

## Sources

### Primary (HIGH confidence)
- `server/services/match.js` — full source, all 218 lines inspected
- `server/services/gold.js` — full source, all 115 lines inspected
- `server/socket-io/main.js` — all call sites inspected at lines 85, 443, 1229, 1357, 1510, 2089, 2117, 2158, 2163, 2167, 2172, 2177, 2434, 2495; disconnect path at 618–668; reconnect remap at 903, 926

### Secondary (MEDIUM confidence)
- Guntanks reference pattern (from phase requirements brief): shift/push queue for turn rotation; `alive=false` instead of splice — consistent with findings from main.js reconnect patterns

---

## Metadata

**Confidence breakdown:**
- Function signatures: HIGH — extracted directly from source code
- Call site analysis: HIGH — grep + manual read of each call context
- Placement scoring algorithm: HIGH — derived from SCORE-01 through SCORE-06 requirements
- Edge cases: MEDIUM — logically derived; simultaneous-death handling is untested speculation until Phase 16 fires against the new model
- Backward compat: HIGH — traced 2-player path through all functions explicitly

**Research date:** 2026-02-26
**Valid until:** Stable for 60 days (pure logic, no external library dependencies)
