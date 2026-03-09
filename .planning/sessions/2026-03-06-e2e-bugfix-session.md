# E2E Bugfix Session — 2026-03-06

## Context
5 pre-existing gameplay bugs identified during practice mode E2E testing. None related to recent Wave 1-5 changes — all longstanding physics/display issues.

---

## Fixes Attempted

### Fix 1: Tank Snapback After Every Shot — IN PROGRESS
**Bug:** Tanks visibly "jump" then snap back to original position after each turn resolves.

**Root cause (confirmed via console logging):**
- `applyTurnResult()` places tanks at `heightmap[x] - 15` (sprite center offset above terrain surface)
- `physicsStep()` in Tank.js runs every physics frame and checks `terrain.getPixel(body.x, body.y)`
- At heightmap-15, the pixel is transparent (15px above terrain surface)
- `physicsStep` nudges `body.y += 1` each frame until the tank reaches the terrain bitmap surface (~15 frames of drift)
- Next `applyTurnResult` snaps the tank back up to heightmap-15 — visible "snapback"
- This cycle repeats EVERY turn

**Key discovery:** Practice mode uses `gameType=3` (not 4 as assumed). The multiplayer `applyTurnResult` path handles both modes.

**Approaches tried:**
1. `body.stop()` + `body.setGravity(0)` after setPosition — didn't help, physicsStep still overrides
2. `body.reset(px, snappedY)` to sync physics body — physicsStep still nudges down after reset
3. `_positionLock` counter (skip N physics frames) — 5 frames too few, drift resumes after expiry
4. Persistent lock (`_positionLock = 99999`) + heightmap-15 snap — tanks went missing (lock prevented re-settling after terrain destruction)
5. Persistent lock + raw server Y (no -15 offset) — tanks fell through terrain (server Y is raw terrain height, -15 IS needed)
6. **Current approach:** X-only sync from server (knockback), let `physicsStep` handle Y settling naturally. No snapback because Y is never re-snapped to heightmap-15. Needs testing.

**Files modified:**
- `client/src/scenes/main/index.js` — `applyTurnResult()` position sync, `checkSwitchTurn()` practice mode block
- `client/src/classes/Tank.js` — `physicsStep()` (debug logs added/removed, lock mechanism added/removed)

**Status:** Latest approach (X-only sync) deployed but not yet verified by user. The fundamental tension is between the `-15` sprite offset and `physicsStep`'s pixel-based terrain detection. A clean fix likely requires either:
- Adjusting physicsStep to recognize the -15 offset as valid settled position, OR
- Storing the physicsStep-settled Y and never overriding it in applyTurnResult

---

### Fix 2: Tank Greys Out Before Projectile Impact — FIXED
**Bug:** `playerEliminated` socket event fires simultaneously with `turnResult`. Tank husk appears before the trajectory animation visually completes.

**Fix:** Queue eliminations instead of executing immediately:
1. Added `this._pendingEliminations = []` in MainScene constructor
2. `playerEliminated` handler pushes to queue instead of calling `_playEliminationEffect` directly (still updates bridge for HP bar "OUT" display)
3. Queue flushed in `applyTurnResult()` after position sync
4. Also flushed in `_activateCurrentTank()` (covers timeout elimination path where `applyTurnResult` never runs)
5. Added `if (!this.sys?.isActive()) return` guard to `_playEliminationEffect` (prevents errors during scene shutdown)

**User confirmed:** "yes this works"

---

### Fix 3: Self-Damage Gold Attribution — NO BUG
**Finding:** Server gold code is correct. Self-damage produces negative values in `result.damage`, and the gold loop correctly skips `playerId === this.id` and `dmg <= 0`. What looked like self-damage gold was actually splash damage hitting both shooter AND opponent — gold was earned for the opponent portion only.

---

### Fix 4: Gold Not Visibly Changing During Match — FIXED
**Bug:** Gold IS updated server-side and sent via `turnResult.goldBalance`, but the GoldDisplay component didn't flash or animate on change. Users missed the subtle number update.

**Fix:** Rewrote `GoldDisplay.js` with:
- `useRef` to track previous gold value
- `useState` for flash state (1.5s amber pulse) and delta text
- Floating "+XG" / "-XG" text that animates upward and fades out
- `@keyframes goldDelta` animation

**User confirmed:** "yes this is a fix also"

---

### Fix 5: HP Bar Shows "100" Briefly at Match Start — FIXED
**Bug:** Race condition where `rawHp` could exceed MAX_HP from stale player object.

**Fix:** Added defensive clamp in `PlayerHPBar.js`:
```js
const rawHp = Math.min(MAX_HP, player?.hp ?? MAX_HP);
```

**User confirmed:** "yes this is a fix also"

---

## Additional Discovery: Practice Mode Position Sync
During Fix 1 investigation, discovered that practice mode (gameType 3) was NOT applying `pendingTurnResult` positions. Added a position sync block in the practice mode path of `checkSwitchTurn()` that syncs heightmap, HP, positions, and gold from the server result. This block mirrors what `applyTurnResult` does for multiplayer.

---

## Files Modified This Session

| File | Changes |
|------|---------|
| `client/src/scenes/main/index.js` | Fix 1 (position sync, practice mode block), Fix 2 (elimination queue + flush) |
| `client/src/classes/Tank.js` | Fix 1 (physicsStep modifications — currently reverted to clean state) |
| `client/src/screens/battle/GoldDisplay.js` | Fix 4 (flash effect rewrite) |
| `client/src/screens/battle/PlayerHPBar.js` | Fix 5 (rawHp clamp) |

---

## Pre-Existing Errors (Not From Our Changes)
- `HTTP status code: 403` — Wallet adapter fetchWalletButtons (Torus/web3auth), harmless
- `Cannot close a closed AudioContext` — Phaser audio cleanup on scene transition, harmless

---

## TODO.md Status Update
Based on user input during session:

| Item | Status | Notes |
|------|--------|-------|
| 3B: Server Deploy | DONE | Render deployed |
| 3C: Client Deploy | DONE | Vercel deployed |
| 3E: Domain + SSL | NOT DONE | Still needs DNS pointing |
| 4C: Sound Effects | SKIPPED | User may skip entirely |
| 5A: Social | DONE | Twitter created, using Telegram instead of Discord |
| 5B: Content | NOT DONE | No content yet |
| 5C: Legal | DONE | ToS, Privacy, age verification, responsible gaming all done |

**Remaining critical path to launch:** 3E (DNS) → 5B (content) → launch

---

## Next Session Priorities
1. **Fix 1 resolution** — Verify X-only sync approach, or implement physicsStep-aware settling
2. **Update TODO.md** — Mark 3B, 3C, 5A, 5C as done
3. **3E: DNS setup** — Point solshot.gg to Vercel, update CORS
