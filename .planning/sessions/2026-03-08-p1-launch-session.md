# Session: P1 Practice Mode Launch
**Date:** 2026-03-08
**Branch:** main (merged dev → main, single branch going forward)
**Commit:** c8a66b7

---

## What Was Done

### P1 Checklist (all 6 items complete)

1. **Lobby Player Selection Flow** — Already working. Renamed JOIN → CHALLENGE per spec.

2. **Mongo Stats Persistence** — Added `totalDamage` and `bestWinStreak` to User.js schema. Updated `persistStats` in main.js to increment totalDamage, track consecutiveWins (reset on loss), update bestWinStreak via MongoDB `$max` pipeline. `getStats` handler now returns handle, totalDamage, bestWinStreak, and computed signatureWeapon (most-fired weapon excluding Single Shot).

3. **Stat Card Component** — Created `client/src/components/StatCard.js`. 16:9 locked, military aesthetic (#0d0f09 bg, #EDE9D5 text, #E8572A accent), Black Ops One + Share Tech Mono fonts, QR code via qrcode.react, scanlines/vignette overlays, corner brackets. Export via html2canvas (clipboard copy → download fallback). Share to X via twitter intent URL. `qrcode.react` added as dependency.

4. **Post-Match Stat Card Export** — Both WinScreen.js and LoseScreen.js updated:
   - Removed ShareCard, TelegramShare, rematch flow (P2)
   - Added EXPORT YOUR CARD button → opens StatCard overlay
   - Added PLAY AGAIN → lobby, EXIT → menu
   - Stats fetched via `getStats` socket event on mount

5. **Callsign Challenge Flow** — Server: 3 new handlers in main.js (`challengeCallsign`, `acceptChallenge`, `declineChallenge`). Looks up connected player by handle in `playerUids`. Client: callsign input + SEND button in LobbyScreen left panel, socket listeners for challenge events, INCOMING CHALLENGE modal with Accept/Decline.

6. **Copyable Match Result Text** — COPY RESULT button on both Win and Lose screens. Win text: "Just beat [OPPONENT] on SolShot". Lose text: "Lost to [OPPONENT] on SolShot". Includes damage dealt, signature weapon, solshot.gg link.

### Additional Work

- **Leaderboard** — Server `getLeaderboard` handler queries top 20 players by wins (min 1 match played). BarracksScreen now has tabbed layout: YOUR STATS | LEADERBOARD. Ranked table with gold/silver/bronze colors for top 3, own row highlighted.

- **Barracks Unlocked** — Removed `comingSoon: true` from MenuScreen so players can access Barracks from main menu.

- **Crash Fix** — Removed undefined `myPrestige`/`myMilestones` references from both WinScreen and LoseScreen. Removed dead PROGRESS tab and ~100 lines of dead prestige/milestone styles from each file.

- **Branch Cleanup** — Merged dev into main (fast-forward), pushed. Working on main only going forward.

- **Vercel Deploy** — Deployed client via Vercel CLI (GitHub account flagged, can't use OAuth). Live at: `https://client-wheat-eta.vercel.app` (points to localhost:5001 — needs REACT_APP_SERVER_URL updated for production).

---

## Files Changed (27 files)

### New
- `client/src/components/StatCard.js` — Shareable stat card component

### Modified (key files)
- `server/socket-io/main.js` — getStats expanded, leaderboard handler, callsign challenge handlers, persistStats totalDamage/bestWinStreak
- `server/models/User.js` — Added totalDamage, bestWinStreak fields
- `client/src/screens/BarracksScreen.js` — Rewired with stats tabs + leaderboard
- `client/src/screens/LobbyScreen.js` — Callsign challenge input + modal + socket listeners
- `client/src/screens/WinScreen.js` — StatCard export, copy result, removed prestige/rematch
- `client/src/screens/LoseScreen.js` — StatCard export, copy result, removed prestige/rematch
- `client/src/screens/MenuScreen.js` — Unlocked Barracks
- `client/package.json` — Added qrcode.react dependency

---

## Known Issues / TODO

- **GitHub account flagged** — Can't authorize Vercel/Render via OAuth. Ticket submitted, awaiting response from GitHub support (Sophia). Deploy via CLI in the meantime.
- **Vercel env var** — `REACT_APP_SERVER_URL` needs to be set to Render URL in Vercel dashboard once Render is deployed.
- **Leaderboard** — Needs MongoDB connected to show data. No-DB mode returns empty list.
- **Stats persistence** — Not verified against live MongoDB yet. Logic is correct but needs end-to-end test with DB.
- **Missing sound effects** — 7 .wav files still needed (Phase 4C from TODO.md).

---

## Testing Checklist

- [ ] Two-tab localhost test: create room → join → play match → verify post-match screens
- [ ] StatCard: click EXPORT YOUR CARD → verify PNG downloads with correct stats
- [ ] Barracks: navigate from menu → verify stats display → switch to LEADERBOARD tab
- [ ] Callsign challenge: enter opponent callsign → verify Accept/Decline modal appears
- [ ] Copy result: click COPY RESULT → paste → verify text format
- [ ] Stats persistence: play match → refresh → verify stats survived reload (requires MongoDB)
