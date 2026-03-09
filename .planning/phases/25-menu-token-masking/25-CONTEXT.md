# Phase 25: Menu and Token Masking - Context

**Gathered:** 2026-02-28
**Status:** Executing

## Scope

Strip all token/wager references from the UI. Make the app present as a clean practice-mode product.

## Success Criteria
1. Menu subtagline reads "SKILL-BASED ARTILLERY COMBAT" (wager range gone)
2. Armory, Prestige, Barracks buttons disabled with COMING SOON badge
3. PLAY FREE is the only interactive menu button
4. SHOT price ticker gone from TopBar
5. WinScreen: no SHOT reward card, no Jupiter CTA, no CONVERT WINNINGS, ShotExplainer never opens

## Files to Modify
- `client/src/screens/MenuScreen.js` — subtagline + nav button badges
- `client/src/components/TopBar.js` — remove ShotPriceTicker
- `client/src/screens/WinScreen.js` — remove SHOT card, Jupiter CTA, ShotExplainer
- `client/src/screens/LoseScreen.js` — same as WinScreen
