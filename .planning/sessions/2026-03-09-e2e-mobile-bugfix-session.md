# Session: E2E Bug Sweep — Mobile, Profanity, One-Shot-Freeze, Lobby, CSP, ToS

**Date:** 2026-03-09
**Commit:** `440d094` — `fix(P1): E2E bug sweep — mobile responsive, profanity filter, one-shot-freeze, lobby skip, CSP, ToS/Privacy`
**Branch:** main
**Deployed:** Not yet (needs `git push` to trigger Vercel)

---

## Context

Live E2E testing on solshot.gg uncovered 8 bugs across mobile UX, game stability, content policy, and security. All 8 fixed in this session.

---

## Issues Found & Fixed

### 1. Mobile Menu — Buttons Too Big, BARRACKS Cut Off
**Files:** `MenuScreen.js`, `client/src/hooks/useIsMobile.js` (new)
- Created shared `useIsMobile()` hook: `height < 500 || width < 600`
- Logo scales 340 → 180px on mobile
- Button padding 14 → 8px, nav width 300 → 220px, gaps reduced
- Tagline and link font sizes shrink on mobile

### 2. Mobile Battle HUD — Dead Space, Oversized Controls
**Files:** `BattleHUD.js`, `AngleControl.js`, `PowerControl.js`, `FireButton.js`, `WeaponSelector.js`
- All HUD sub-components accept a `compact` prop (derived from `useIsMobile`)
- Slider widths 120 → 70px, font sizes reduced, padding/gaps tightened
- Weapon icon 32 → 24px, min-width 120 → 80px

### 3. Mobile Forfeit Button
**Files:** `BattleHUD.js`, `BattleScreen.js`
- Red FORFEIT button rendered bottom-right on mobile (no ESC key on phones)
- Calls `onForfeit` prop → triggers same exit confirm dialog as ESC

### 4. Lobby Skip — Match Auto-Starting Without Waiting Room
**Files:** `server/socket-io/main.js`
- **Before:** `startPick` emitted immediately when room full — second player never saw lobby
- **After:** Always emit `roomUpdate` first, delay `startPick` by 2 seconds so both players see the waiting room

### 5. One-Shot-Then-Fail on PC (THE BIG ONE)
**Files:** `Terrain.js`, `Blast.js`, `scenes/main/index.js`

**Root cause:** A crash in `updateTerrain()` gravity simulation (called every physics frame via worldstep) could leave `terrain.animate = true` permanently. Since `checkSwitchTurn()` returns early when `terrain.animate === true`, the game freezes — no turn switching, no controls.

**Specific crash:** `getImageData(x, top, 1, base - top)` throws when `base - top <= 0` (zero-height column edge case). Error propagates out of worldstep listener, matrix never empties, `animate` never clears.

**Fixes applied:**
- **Terrain.js — updateTerrain():** Wrapped gravity sim in try-catch; on error, clears matrix + sets `animate = false` so game recovers. Added bounds guard (skip zero/negative height columns).
- **Terrain.js — constructor:** `willReadFrequently: true` on canvas init before Phaser wraps it (prevents Chrome de-optimizing frequent getImageData)
- **Terrain.js — save()/restore():** Added `this.context` fallback to `this.canvas.getContext('2d')`
- **Blast.js:** `willReadFrequently: true` on blast canvas init
- **MainScene checkSwitchTurn():** 10-second safety valve — if `terrain.animate` stuck for 10s, force-clears it
- **MainScene shutdown():** Cleans up `_trajectoryTimer`, resets `pendingTurnResult`, `_turnResultCooldown`, `_firePending`
- **MainScene animateTrajectory():** Scene-alive guard (`this.sys.isActive()`) at top of moveProjectile closure — bails cleanly if scene destroyed mid-animation

### 6. Profanity Filter for Handles/Callsigns
**Files:** `client/src/utils/profanity.js` (new), `client/src/utils/handleValidation.js`, `server/socket-io/main.js`, `server/middleware/guards.js`

**3-layer defense:**
1. **Client HandleModal:** `validateHandle()` calls `containsProfanity()` before submission
2. **Server registerIdentity:** `isProfane()` check on handle, replaces with `'Player' + uid.slice(0,4)` if profane
3. **Server sanitizeName:** `_PROF_RE` check on display names, falls back to `'Player'`

**Normalization:** Leet-speak mapping (0→o, 1→i, 3→e, etc.), zero-width unicode stripping, repeat character collapse (3+ → 1). ~180 banned words covering racial/ethnic slurs, sexuality, disability, violence, hate symbols, impersonation, drugs.

### 7. Terms of Service & Privacy Policy — Real In-App Pages
**Files:** `TermsScreen.js` (new), `PrivacyScreen.js` (new), `App.js`, `ResponsibleGaming.js`
- Full in-app pages with game military aesthetic (TopBar, scrollable content)
- App.js: added `'terms'` and `'privacy'` screen routes
- ResponsibleGaming: changed from external `<a>` links to internal `navigate()` calls

### 8. CSP & Reown/WalletConnect Console Errors
**Files:** `server/index.js`
- Added to `connectSrc`: `solshot.onrender.com`, `api.web3modal.org`, `pulse.walletconnect.org`, `explorer-api.walletconnect.com`, `localhost:5001`
- Added to `imgSrc`: `api.web3modal.org`
- Added to `fontSrc`: `fonts.googleapis.com`

---

## Files Changed (20 total)

### New Files (4)
- `client/src/hooks/useIsMobile.js` — shared mobile detection hook
- `client/src/utils/profanity.js` — profanity filter with normalisation
- `client/src/screens/TermsScreen.js` — in-app Terms of Service
- `client/src/screens/PrivacyScreen.js` — in-app Privacy Policy

### Modified Files (16)
- `client/src/App.js` — ToS/Privacy routes, hide FAQ during battle
- `client/src/classes/Blast.js` — willReadFrequently
- `client/src/classes/Terrain.js` — gravity sim crash fix, willReadFrequently, context fallback
- `client/src/components/ResponsibleGaming.js` — internal navigation
- `client/src/scenes/main/index.js` — safety valve, timer cleanup, trajectory guard
- `client/src/screens/BattleScreen.js` — onForfeit prop
- `client/src/screens/MenuScreen.js` — mobile responsive
- `client/src/screens/battle/AngleControl.js` — compact prop
- `client/src/screens/battle/BattleHUD.js` — compact + forfeit
- `client/src/screens/battle/FireButton.js` — compact prop
- `client/src/screens/battle/PowerControl.js` — compact prop
- `client/src/screens/battle/WeaponSelector.js` — compact prop
- `client/src/utils/handleValidation.js` — profanity check
- `server/index.js` — CSP fixes
- `server/middleware/guards.js` — profanity in sanitizeName
- `server/socket-io/main.js` — profanity filter, lobby delay

---

## What Still Needs Testing

- [ ] Mobile menu layout on real phone (not just devtools)
- [ ] Mobile battle HUD — do compact controls work on small screens?
- [ ] Forfeit button triggers exit correctly on mobile
- [ ] Both players see lobby for ~2s before shop transition
- [ ] Multiple consecutive shots work without freeze (the big fix)
- [ ] Profanity filter catches leet speak variants (f4gg0t, n1gg3r, etc.)
- [ ] ToS and Privacy pages render, back button works
- [ ] Wallet connect works without CSP errors in console
- [ ] Audio doesn't break on game restart (AudioContext lifecycle)

---

## Known Remaining Issues

- **3 weapon PNGs missing:** Skipper.png, Ground_Hog.png, Pineapple.png (John — Gemini)
- **Standard.js dead weapon classes:** 10 dead classes still exist (low priority cleanup)
- **AudioContext warning:** Chrome may still warn about AudioContext not being closed — mitigated in PhaserBootstrap but worth monitoring
- **Profanity list is not exhaustive:** Determined adversaries can still find gaps — consider a dictionary API for v2
