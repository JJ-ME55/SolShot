# Field-Manual Redesign Rollout — Session Summary

**Date:** 2026-04-23
**Branch:** `launch`
**Handoff source:** `design_handoff_solshot_redesign/` (HTML/JSX prototypes)

## Goal
Pick up the redesign where the prior session left off (only MenuScreen + design primitives were ported) and carry the remaining 7 screens through to the same "declassified military dossier / field manual" aesthetic: stenciled display type, Share Tech Mono body, olive/bone/orange palette on near-black, angled clip-path buttons, scanlines/grain/vignette.

## Starting state
Prior commit `0c2408b feat(redesign): new design system + MenuScreen with CRT terminal aesthetic` had:
- `client/src/styles/tokens.css` — full token port (field/crt/poster themes)
- `client/src/components/design/` — `Overlays.js`, `ScanBtn.js`, `Terrain.js`, `TopBar.js`
- `client/src/screens/MenuScreen.js` — rewritten with PLAY/ARMORY/BARRACKS + tank hero + online counter
- Asset copies in `client/public/assets/images/` (tanks, backgrounds, badges, weapon icons, logo)

## Screens rewritten this session

| # | Screen | File | Notes |
|---|---|---|---|
| 1 | Barracks | `screens/BarracksScreen.js` | New `DossierCard` with corner brackets, scanline overlay, W/L/DMG/STREAK grid, leaderboard table. Keeps socket `getStats` / `getLeaderboard` wiring + StatCard export. |
| 2 | Armory | `screens/ArmoryScreen.js` | SOL / COSMETICS tabs, left rail w/ tier-colored letter badge icons, sticky right detail panel. Keeps full buy / equip / SHOT-balance wiring. |
| 3 | Deploy (Lobby) | `screens/LobbyScreen.js` | 340px config column (mode/format/players/wager/color/callsign challenge) + open lobbies list w/ reticle empty state. **All logic preserved**: escrow deposit flow, partial-deposit decisions, queue matchmaking, Telegram invites, 4 modals, waiting overlay, match-found flash. |
| 4 | Loadout | `screens/LoadoutScreen.js` | Consumable rows with STD/TAC/RARE tier color, letter-badge icons, ACTIVE/n-LEFT chips for owned. |
| 5 | Weapon Shop | `screens/ShopScreen.js` | Desktop two-column (catalog / timer+detail+loadout+ready), mobile bottom-sheet preserved. Auto-ready on timer-zero, opponent-bought-weapon activity line, prestige-weapon indicator, error modal. |
| 6 | Prestige | `screens/PrestigeScreen.js` | Big current-rank badge on left (P0/unranked → Bronze→Diamond PNGs), tier ladder on right, selected tier detail card. Burn button is **live** — calls `signAndBurnShot` → `prestigeBurn` socket event. |
| 7 | Win / Lose (AAR) | `components/design/AAR.js` + thin wrappers | Shared component for both outcomes; flips stamp/banner/copy on `isWin`. Declassified doc header + W/L stamp + big AFTER ACTION REPORT title + victor strip + SOL/GOLD reward cards + combatant comparison with stat bars + N-player final standings + copy/share/export/play-again/exit actions. |

## Other touch-ups
- Added `components/design/ScreenHeader.js` — shared back-button + title/subtitle + right-extras header used by all redesigned non-menu screens.
- `BattleScreen.js` — deploy overlay / disconnect banner / wrapper colors migrated to new tokens (`--bg-deep`, `--accent`, `--f-display`, `var(--clip-6)`). HUD components inside `screens/battle/*.js` were **intentionally not rewritten** (see Deferred below).

## Deferred
- **Battle HUD components** (`screens/battle/BattleHUD.js` + 13 siblings, ~2,000 lines). Handoff README explicitly calls the in-game HUD out as game-engine territory rather than hifi-locked React. Live gameplay risk is not justified by the visual delta right now. Future pass should token-swap these files in isolation and spot-test vs. Phaser canvas.
- **`components/Modal.js`, `components/Button.js`** — still used by Lobby / AAR. They work fine with the new tokens thanks to compatible CSS vars, but should eventually be restyled to match clip-path / stencil aesthetic for consistency.
- **Untracked prototype drop** at repo root (`SolShot Redesign.html`, `SolShot Mobile.html`, `design-canvas.jsx`, `src/`, `styles/`, `mobile/`, `screenshots/`, `uploads/`). Left untracked; safe to delete once redesign is considered locked.

## Verification
- ESLint clean across all 10 new/modified files (only pre-existing warnings in `BattleScreen.js` unrelated to this work).
- `npm run build` succeeds end-to-end (`react-app-rewired build` via `config-overrides.js`). Build artifacts emitted to `client/build/`.
- No UI smoke test was run — user should verify golden paths (menu → lobby → shop → battle → AAR) and all modal/overlay states before merging to `main`.

## Files changed

```
client/src/components/design/AAR.js            (new)
client/src/components/design/ScreenHeader.js   (new)
client/src/screens/ArmoryScreen.js             (rewritten)
client/src/screens/BarracksScreen.js           (rewritten)
client/src/screens/BattleScreen.js             (overlay styles only)
client/src/screens/LoadoutScreen.js            (rewritten)
client/src/screens/LobbyScreen.js              (rewritten)
client/src/screens/LoseScreen.js               (thin wrapper)
client/src/screens/PrestigeScreen.js           (rewritten)
client/src/screens/ShopScreen.js               (rewritten)
client/src/screens/WinScreen.js                (thin wrapper)
```

## Follow-ups for next session
1. **Visual QA pass** on every redesigned screen in the actual app (desktop + mobile landscape, Telegram WebApp frame).
2. **Token-swap pass on Battle HUD** — low-risk find-and-replace of `--am` / `--kh` / `--bn` / `--sg` / `--gd` / `--rd` / `--od` / `--ol` → new palette, keeping all structure intact.
3. **Restyle `components/Modal.js` + `Button.js`** to clip-path / stencil aesthetic — will pick up for free everywhere.
4. **Delete / archive the untracked handoff drop** once design is locked (`.html` prototypes, root-level `src/styles/mobile` directories).
5. Commit the session: suggested message `feat(redesign): port remaining 7 screens + AAR to field-manual aesthetic`.
