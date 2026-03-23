# Session: Friends Test #2 — Fish + iPhone Retest
**Date:** 2026-03-13
**Phase:** 6 — Friends Test

---

## Summary

Second round of friends testing. Two test sessions: (1) iPhone-to-iPhone retest with mlbob confirming prior fixes, (2) Fish on laptop vs John on iPhone — surfaced major projectile animation speed issue and gathered UX suggestions. Four bugs fixed, one major performance improvement, mobile weapon shop redesigned.

---

## Testers

### mlbob (iPhone Max vs iPhone regular)
- Tank drift still visible (pre-deploy, old code)
- Weapon shop unusable on regular iPhone — BUY button hidden
- StatCard close button broken — modal stuck, required refresh
- Export card works, gameplay smooth

### Fish (laptop vs iPhone)
- Game 1: "completely smooth, no issues at all" on laptop
- Game 2: Severe asymmetric lag — "bullet has been moving for 20 seconds"
- Root cause: projectile animation stepping 1 point/frame through 1500-point trajectories = 25s per shot
- Fish's side was the laggy one (watching opponent's shots), John's iPhone was smooth
- Tank positions looked stable from both sides
- Weapon shop showed old desktop layout on iPhone (commit not deployed yet)

---

## Bugs Fixed

### 1. Tank Sprite Drifting (`d15a85d`)
- **Root cause:** World gravity (y: 300) constantly pulled tank bodies down. `physicsStep` corrected position each frame but never zeroed velocity or disabled `allowGravity`, so velocity accumulated frame-over-frame until tank plunged deep into terrain.
- **Fix:** `body.allowGravity = false` on create. `body.stop()` + `body.allowGravity = false` in all settling paths. Blast.js still re-enables for knockback arcs.
- **Files:** `client/src/classes/Tank.js`

### 2. StatCard Close Button Broken (`d15a85d`)
- **Root cause:** Overlay `flex + justifyContent: center` with no `overflowY`. On regular iPhone landscape (~375px height), close button pushed off-screen.
- **Fix:** Added `overflowY: auto` + `WebkitOverflowScrolling: touch` to overlay. Reduced max height deduction 180→140px.
- **Files:** `client/src/components/StatCard.js`

### 3. Weapon Shop Unusable on Mobile (`d15a85d`)
- **Root cause:** Two-panel layout cramped on phone. Right panel 34% width, BUY button hidden with no scroll indicator.
- **Fix:** Full mobile redesign using `useIsMobile()`:
  - Full-width weapon list (no right panel)
  - Persistent bottom bar: timer | loadout chips | READY
  - Bottom sheet overlay on weapon tap: name, tier, stats, full-width BUY button
  - Auto-close after successful purchase
  - Desktop layout unchanged
- **Files:** `client/src/screens/ShopScreen.js`

### 4. Projectile Animation Too Slow (`37bac7d`)
- **Root cause:** Animation stepped 1 point per frame through server trajectory. Long shots with wind = 1500+ points = 25s at 60fps, 50s at 30fps. This was the "lag" Fish experienced.
- **Fix:** Dynamic speed: `speed = Math.max(1, Math.ceil(trajectory.length / 180))`. Caps all animations at ~3 seconds max. Trail particles now spawn every frame to stay dense at higher speeds.
- **Before/After:** Long shots went from 25s → 2.8s. Short shots unchanged (~1.5s).
- **Files:** `client/src/scenes/main/index.js`

---

## Other Changes

- **Practice shop timer:** 20s → 25s (`server/socket-io/main.js`)
- **TODO.md updates:**
  - Phase 7A: Mouse-aim + click-to-fire (desktop), touch-drag aim (mobile), terrain walls persist X rounds
  - Phase 9B: Hull upgrades / tank customization
  - Phase numbering fixed (7B→7D escrow hardening, 9B→9C Seeker)

---

## Commits
| Hash | Description |
|------|-------------|
| `d15a85d` | fix(P1): tank drift + StatCard close + mobile weapon shop — friends test #2 |
| `37bac7d` | perf(P1): snappy projectile animation + TODO updates — friends test #2 |

---

## Fish's Feature Suggestions (saved to TODO)

| Suggestion | Phase | Notes |
|---|---|---|
| Mouse-aim + click-to-fire (desktop) | 7A | Hover to aim turret, click to shoot |
| Touch-drag aim (mobile) | 7A | Angry Birds style cannon rotation |
| Type-in angle/power | N/A | Already built — ANG/PWR are tappable inputs |
| Terrain walls persist X rounds | 7A | Balance tweak, not permanent |
| Hull upgrades / tank customization | 9B | Persistent progression system |
| Multi-player (3-4P) | 9A | Already planned |
| Speed up bullets | DONE | Fixed this session |

---

## Fish's Positive Feedback
- "This is sick"
- "I really like it... It's tricky to get the angles"
- "it's a really good game and I can see the fun behind it"
- "the finished product, it's already brilliant"
- "I'd play this"
- "having multiple people in the same game would be sick, much more like worms"

---

## Open Items
- [ ] Push + deploy both commits to Vercel/Render
- [ ] Retest with Fish after deploy — verify projectile speed fix
- [ ] Consider Render paid tier ($7/mo) for consistent WebSocket performance
- [ ] Weapon power rebalancing needed — shots may feel different at 3x-9x animation speed
- [ ] mlbob retest after deploy to confirm tank drift + shop + StatCard fixes

---

## Key Files Modified
- `client/src/classes/Tank.js` — allowGravity fix for tank settling
- `client/src/components/StatCard.js` — overlay scroll + scale fix
- `client/src/screens/ShopScreen.js` — full mobile bottom-sheet redesign
- `client/src/scenes/main/index.js` — dynamic projectile animation speed
- `server/socket-io/main.js` — practice shop timer 25s
- `TODO.md` — Phase 7A, 9B additions from Fish
