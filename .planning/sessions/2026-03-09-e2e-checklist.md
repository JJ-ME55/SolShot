# E2E Testing Checklist — SolShot P1

**Date:** 2026-03-09
**Build:** `440d094` (push to main to deploy)
**URL:** https://solshot.gg

---

## How to Test

- **PC:** Chrome + one incognito window (two players)
- **Mobile:** Real phone on same URL, or Chrome DevTools device toolbar
- **Console:** F12 open on both windows — watch for red errors

---

## 1. Menu & Navigation

- [ ] Logo loads (no broken image)
- [ ] All 4 buttons visible without scrolling (QUICK MATCH, PRACTICE, BARRACKS, LEADERBOARD)
- [ ] "How To Play" link works → opens How To Play screen
- [ ] Back button from How To Play returns to menu
- [ ] BARRACKS opens armory screen
- [ ] LEADERBOARD opens leaderboard screen
- [ ] ? button opens FAQ modal
- [ ] ? button is NOT visible during battle/shop

### Mobile Menu
- [ ] Buttons are smaller, nothing cut off or overflowing
- [ ] Logo shrinks on small screens
- [ ] Tagline text readable but smaller

---

## 2. Handle / Callsign

- [ ] Set Handle modal appears on first visit (or after clear)
- [ ] Accepts valid names: `Ace`, `Tank_99`, `xX_Pro_Xx`
- [ ] Rejects too short: `AB` → error "Min 3 characters"
- [ ] Rejects too long: 17+ chars → error "Max 16 characters"
- [ ] Rejects special chars: `H@ck3r!` → error "Letters, numbers, and underscores only"
- [ ] Rejects profanity: `Nigger` → "That name is not allowed"
- [ ] Rejects leet speak profanity: `N1gg3r`, `F4gg0t`, `J3wbag` → blocked
- [ ] Rejects impersonation: `Admin`, `SolShot`, `Moderator` → blocked
- [ ] Handle persists across page refresh

---

## 3. Lobby & Matchmaking

- [ ] QUICK MATCH creates/joins a room
- [ ] Both players see the waiting room (lobby) with player names/colors
- [ ] Lobby displays for ~2 seconds before transitioning to shop
- [ ] Second player joining does NOT skip straight to shop (lobby is visible)
- [ ] If alone in lobby, shows "Waiting for players..."

---

## 4. Shop / Weapon Pick

- [ ] Both players enter shop after lobby
- [ ] Can select weapons from the grid
- [ ] Gold counter shows starting gold (1000G)
- [ ] Purchasing weapons deducts gold
- [ ] READY button works → match starts when both ready
- [ ] Timer counts down if player doesn't pick

---

## 5. Battle — Core Gameplay

- [ ] Terrain renders (not black/blank)
- [ ] Both tanks visible and positioned on terrain
- [ ] Turn pointer arrow shows whose turn it is
- [ ] "YOUR TURN" flash appears when turn switches to you
- [ ] Angle slider works (turret rotates visually)
- [ ] Power slider works
- [ ] Weapon selector works (can switch weapons)
- [ ] FIRE button fires a shot
- [ ] Projectile animates along trajectory with trail
- [ ] Explosion animates on impact (camera shake, blast ring)
- [ ] Terrain deforms (crater visible)
- [ ] HP bars update after hit
- [ ] Turn switches to other player after shot resolves

### The Big One — Multi-Shot Stability
- [ ] **First shot works** (both players)
- [ ] **Second shot works** (game does NOT freeze)
- [ ] **Third+ shots work** (play a full match to completion)
- [ ] No console errors like "getImageData" or "terrain" during shots
- [ ] Game does not freeze with terrain gravity animation stuck

### Movement
- [ ] Left/Right move buttons work (tank moves along terrain)
- [ ] Move counter depletes (4 steps per turn)

---

## 6. Battle — Mobile

- [ ] HUD controls are compact (not overlapping or oversized)
- [ ] Angle/Power sliders are usable with touch
- [ ] FIRE button is tappable
- [ ] Weapon name/icon visible but smaller
- [ ] **FORFEIT button** visible bottom-right on mobile
- [ ] FORFEIT button triggers exit confirmation dialog
- [ ] Confirming forfeit leaves the match correctly

---

## 7. Match End

- [ ] Winner/loser screen appears when one player reaches 0 HP
- [ ] Stat card shows match stats (damage, kills, shots, etc.)
- [ ] "Export" / share stat card works
- [ ] Return to menu button works
- [ ] No errors in console after match ends

---

## 8. Practice Mode

- [ ] PRACTICE button → enters single-player practice match
- [ ] Both tanks controllable (alternating turns)
- [ ] Shots, terrain, explosions all work
- [ ] Match ends when one tank dies
- [ ] Stats tracked (shown on leaderboard)

---

## 9. Terms of Service & Privacy Policy

- [ ] ResponsibleGaming footer links say "Terms of Service" and "Privacy Policy"
- [ ] Clicking Terms → opens TermsScreen (in-app, not external link)
- [ ] Clicking Privacy → opens PrivacyScreen (in-app, not external link)
- [ ] Both pages have content (not blank)
- [ ] Back/TopBar returns to menu
- [ ] Pages scroll correctly if content overflows

---

## 10. Console & Network (F12)

- [ ] No CSP violation errors (red text mentioning "Content Security Policy")
- [ ] No 403 errors from Reown/WalletConnect
- [ ] No AudioContext errors on game start/restart
- [ ] Socket connects successfully (no repeated reconnects)
- [ ] No unhandled promise rejections

---

## 11. Wallet Connect (if testing crypto features)

- [ ] Wallet connect button appears
- [ ] Phantom/Solflare modal opens without CSP block
- [ ] Wallet connects successfully
- [ ] Wallet address displays in UI
- [ ] Disconnect works

---

## Quick Smoke Test (5 min)

If short on time, hit these in order:

1. Load solshot.gg → menu renders, logo visible
2. Set handle → `TestPlayer` accepted
3. Open two windows → QUICK MATCH on both
4. Both see lobby → transitions to shop
5. Pick weapons, ready up → battle starts
6. Fire 3 shots each → no freeze, turns alternate
7. Finish match → stat card appears
8. Check console → no red errors

---

## Results

| # | Area | Pass/Fail | Notes |
|---|------|-----------|-------|
| 1 | Menu & Nav | | |
| 2 | Handle | | |
| 3 | Lobby | | |
| 4 | Shop | | |
| 5 | Battle Core | | |
| 6 | Battle Mobile | | |
| 7 | Match End | | |
| 8 | Practice | | |
| 9 | ToS/Privacy | | |
| 10 | Console | | |
| 11 | Wallet | | |
