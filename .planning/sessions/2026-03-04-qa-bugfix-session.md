# QA Bugfix Session — 2026-03-04

## Context
Full QA pass against the dev branch. User ran through a 10-item test checklist and reported results. 8 bugs were identified and fixed in this session.

## Test Results (Pre-Fix)

| # | Test | Result |
|---|------|--------|
| 1 | WeaponCard CSS (Shop Screen) | BUG — `borderBottom` shorthand warning from LoseScreen |
| 2 | Keyboard Controls (Battle) | PASS |
| 3 | Fire Rejection Fix | PASS (but reappeared in test #5) |
| 4 | Audio Errors | BUG — `Cannot resume a context that has been closed` |
| 5 | Tank Knockback | BUG — no slide, snap-back; A/D movement jumps too far |
| 6 | Sniper Terrain Crater | BUG — no visible crater on terrain hit |
| 7 | Turn Timer | BUG — ticks to 0 but turn doesn't auto-advance |
| 8 | Reconnect (Practice) | BUG — wallet sig error, game ends for opponent |
| 9 | "You Placed First" Fix | PASS |
| 10 | How To Play | PASS |

## Fixes Applied

### 1. LoseScreen CSS border shorthand warning
- **File**: `client/src/screens/LoseScreen.js`
- **Change**: Removed `borderBottom` shorthand (line 48) that conflicted with `borderBottomWidth`/`borderBottomStyle`/`borderBottomColor` (lines 52-54). Kept only non-shorthand properties.

### 2. Practice mode reconnect
- **File**: `client/src/App.js`
- **Root cause**: `attemptRejoin()` tried wallet signature FIRST, which failed with `WalletSignMessageError` in practice mode. Also: no `rejoinError` handler, no retry logic, and race condition where new socket emits `rejoinRoom` before server detects old socket disconnect.
- **Fix**:
  - Try uid-based rejoin FIRST (practice mode) before wallet signature
  - Add 500ms delay before first attempt (lets server process old disconnect)
  - Add `rejoinError` handler with retry (up to 3x, 1s apart)

### 3. Audio context closed error
- **File**: `client/src/bridge/PhaserBootstrap.js`
- **Root cause**: `gameInstance.destroy(true)` closes Web Audio context, but Phaser may try to resume it on next game boot (React StrictMode double-mount or match restart).
- **Fix**: Explicitly close `gameInstance.sound.context` before `destroy()`.

### 4. Tank knockback — tween instead of instant snap
- **File**: `client/src/scenes/main/index.js` (~line 968-1010 in `applyTurnResult`)
- **Root cause**: `tank.setPosition(useX, snappedY)` was instant — no visual slide. Server sends absolute position with knockback baked in; client teleported to it in 1 frame.
- **Fix**: When position delta > 2px, use a 400ms Phaser tween with `Power2` easing. During tween, Y snaps to terrain surface at each X (tank slides along ground). On complete, final `setPosition` + body sync.

### 5. A/D movement — sync position to server
- **File**: `client/src/classes/Tank.js` (~line 244)
- **Root cause**: After A/D movement animation (80 ground-trace steps), no `positionUpdate` was sent to server. Server still had pre-movement position. Next `turnResult` would snap tank back to server's stale position.
- **Fix**: When `leftSteps`/`rightSteps` reach 0 and `moving` was true, emit `positionUpdate` with final `body.x/y` to server.

### 6. Sniper terrain crater not visible
- **File**: `client/src/weapons/packs/Standard/Standard.js` (~line 1994-1997, sniperrifle.blast)
- **Root cause**: Local sniper blast used `radius: 1` and `thickness: 0` — invisible. Server uses 8px crater via `deformTerrain`. In practice mode (local fire, no server turnResult), the local blast is all that matters.
- **Fix**: Changed blast radius from 1→8 and thickness from 0→8. Also passed `blowTank` param through (was hardcoded `false`).

### 7. Turn timer auto-advance not triggering
- **File**: `client/src/scenes/main/index.js` (~line 861, new socket handler)
- **Root cause**: Server emits `turnTimeout` when 60s expires, and BattleScreen.js (React) handled it to update bridge state. But the **Phaser scene had no handler** — so tanks never switched, controls stayed active on the timed-out player.
- **Fix**: Added `turnTimeout` socket handler in Phaser scene that resolves `nextTurn` socketId → player index, updates `currentPlayerIndex`, resets `_firePending`, calls `_activateCurrentTank()` + `showTurnPointer()` + `_pushStateToBridge()`.

### 8. Fire rejected console spam
- **File**: `client/src/scenes/main/index.js` (~line 851)
- **Root cause**: "Not your turn" rejections were logged as `console.warn`. These are normal during turn transitions (timer expires → server switches turn → client's in-flight fire arrives late).
- **Fix**: Only log non-"Not your turn" rejections. The root cause (missing turnTimeout handler) was also fixed in #7.

## Files Modified
```
client/src/screens/LoseScreen.js          — CSS fix
client/src/App.js                         — reconnect rewrite
client/src/bridge/PhaserBootstrap.js      — audio context cleanup
client/src/scenes/main/index.js           — knockback tween, turnTimeout handler, fire spam
client/src/classes/Tank.js                — movement position sync
client/src/weapons/packs/Standard/Standard.js — sniper crater radius
```

## QA Pass 2 — Results (2026-03-05)

| Test | Result |
|------|--------|
| Tank positions stable (no phantom movement) | PASS |
| Both screens agree after shots | PASS |
| Arrow stays with tank | PASS |
| Turn timer auto-advances | PASS |
| Sniper crater visible | PASS |
| A/D movement | PASS (slight opponent-side Y mismatch) |
| F5 reconnect | FAIL — shelved (see notes) |

## Reverted Changes
- **Knockback tween** — removed entirely. Caused tank/turret dissociation and phantom movement.
- **Server-side knockback** — removed. Was pushing tank positions on every hit, causing both-screen disagreement.
- **Position format flatten** — reverted to nested `{socketId, pos: {x,y}}`. The flat format made turnResult reposition tanks every turn, causing visible jumping. With nested format, turnResult positions are effectively ignored (committed behavior) — tanks stay where physics puts them.
- **Tank.js physics changes** — `_serverPositioned`, `allowGravity` toggling all removed. Committed physicsStep restored.
- **Reconnect terrain cache rebuild** — reverted to simple cache re-send. Async terrain image loading + Phaser re-instantiation makes mid-game reconnect unreliable.

## Root Cause Analysis
The committed server sent positions as `{socketId, pos: {x,y}}` but the client accessed `pos.x` (forEach variable). This meant `pos.x === undefined` and **turnResult NEVER repositioned tanks** — they were positioned only by local physics. Pre-session changes flattened the format to `{socketId, x, y}`, which made turnResult positions actually apply, revealing every small server/client disagreement as visible tank jumping.

## Shelved: Reconnect (F5 mid-match)
Reconnect requires reconstructing full Phaser game state from a server snapshot:
- Canvas terrain with deformation history (craters)
- Physics state (tank positions, gravity settling)
- Multiple async image loads (6 terrain texture images)
- React re-mount creates multiple Phaser instances
- Image cache causes sync/async timing differences

This needs a purpose-built reconnect system (e.g., terrain state serialization, deterministic replay) rather than patching the current init flow. Shelved for a future phase.

## Notes
- MongoDB Atlas timed out during this session. Server was run with `MONGODB_URI=` (no DB).
- Jupiter price API returning 401 — likely needs API key refresh.
- The A/D movement distance is ~80 terrain-surface pixels per press. Could reduce `leftSteps`/`rightSteps` from 80 to ~40 if desired.
- Server knockback was formula: `8 + 17 * min(1, damage/100)` px. Removed for now — can re-add as a client-only visual effect later.
