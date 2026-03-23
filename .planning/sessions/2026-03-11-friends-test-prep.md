# Session: Friends Test Prep & Bug Sweep #4
**Date:** 2026-03-11 → 2026-03-12
**Phase:** 6 — Friends Test (pre-public launch)

---

## Summary

Final polish session before handing solshot.gg to close friends for testing. Fixed StatCard issues, optimized turn-to-turn network performance, and overhauled the TODO roadmap.

---

## Completed

### StatCard Fixes (`6449250`)
- **Readability:** Brightened dark labels — `#363929` → `#7a8060`, `#2a2d1c` → `#6b7050`, CLASSIFIED weapon text fixed
- **Zoomed phone export:** Replaced all `vw`/`clamp()` CSS with fixed 720x405px card + CSS `transform: scale()`. Export now captures full card at native resolution regardless of device zoom level
- Card scales responsively via JS `window.innerWidth` calculation

### Turn Lag Optimization (`5ae696d`)
- **Root cause:** Every `turnResult` WebSocket payload sent ~50-60KB — full 3000-point trajectory + 1200-number heightmap even on misses
- **Fix 1:** Server downsamples trajectory to every 2nd point (client already stepped by 2)
- **Fix 2:** Skip `terrainUpdate` on out-of-bounds misses (no crater = no data needed)
- **Fix 3:** `subTrajectories` (multi-shot weapons) also thinned
- **Client:** Animation speed adjusted from 2→1 to match pre-thinned data
- **Result:** ~50% reduction in per-turn payload size

### TODO Roadmap Overhaul
- Collapsed all completed phases (1-5) into `<details>` blocks
- New staged roadmap reflecting actual launch plan:
  - **Phase 6:** Friends test (current) — smoke test, bug fixes, teaser content
  - **Phase 7:** Public practice launch — go public, leaderboard, community, escrow hardening
  - **Phase 8:** Token launch + wagering 1v1 — mainnet SHOT, Meteora single-sided LP
  - **Phase 9:** Multi-player expansion — 3P/4P modes, Seeker optimization, dApp store
  - **Phase 10:** Tournament mode — entry fees, brackets, prize pools
  - **Phase 11:** Platform — Telegram Mini App, Playwright E2E, Cloudflare

### Marked as Done (previously completed but not tracked)
- 5A: Social accounts (Twitter/X @SolShotGG + Discord)
- 5C: Legal (TermsScreen, PrivacyScreen, ResponsibleGaming)
- 3B: Server deploy (Render live)
- 3C: Client deploy (Vercel live)
- 3E: DNS/SSL/CORS (solshot.gg playable)
- 4C: Sound effects (all 7 weapons mapped to existing files in sounds.js)

---

## Commits
| Hash | Description |
|------|-------------|
| `6449250` | fix(P1): StatCard readability + zoomed phone export |
| `5ae696d` | perf(P1): halve turnResult payload — downsample trajectory, skip terrain on miss |
| `cc7b047` | fix(P1): turn switch lag + mobile rotation — friends test feedback |

---

## Tester Feedback (mlbob — first friend)

### Round 1 (pre-fixes)
- **Lag between turns** — felt slow, didn't update well on John's desktop side
- **Mobile side smooth** — payload optimization worked for the tester
- **Mobile rotation bug** — portrait→landscape transition didn't re-layout properly
- **Tank positioning wrong on John's screen** — tanks in wrong positions/sunken after shots

### Round 2 Fixes Applied
1. **Turn switch lag root cause found** — visual-only blast ring animation (cosmetic expanding circle) was blocking `checkSwitchTurn` for 80+ frames (~1.3s per shot). Fix: only terrain-digging blasts block turn switching, visual-only blasts are non-blocking.
2. **Mobile rotation** — added `orientationchange` listener with 150ms delay to `useIsMobile` hook (Safari doesn't update dimensions immediately on rotation).
3. **Payload optimization** (previous session) — trajectory downsampled 2x, terrainUpdate skipped on misses.

### Feature Requests
- **Trajectory preview line** — "dotted lines coming out the end of the tank to help me aim"
  - Decision: implement as a SHOT token consumable ("Tactical Scope"), 2-3 dots, 5-match duration
  - Counter-item: "Smoke Screen" blocks opponent's Scope

---

## SHOT Consumables Design (added to TODO Phase 8C)

5 consumables, all purchased with SHOT tokens (burned), each lasting 5 matches:

1. **Tactical Scope** — 2-3 dot trajectory preview from barrel
2. **Reinforced Armor** — +25 HP (275 total)
3. **Overcharge** — power max 100→115
4. **Extra Rations** — start with 1200G instead of 1000G
5. **Smoke Screen** — blocks opponent's Tactical Scope

Token sink math: ~25-100 SHOT per item, active players burn meaningful supply daily.

---

## TODO Roadmap Overhaul (Mar 11)
- Collapsed completed phases 1-5 into `<details>` blocks
- New staged roadmap: Phase 6 (friends test) → 7 (public practice) → 8 (token + wagering 1v1 + consumables) → 9 (3P/4P + Seeker) → 10 (tournaments) → 11 (Telegram, E2E, Cloudflare)
- Marked done: 5A socials, 5C legal, 3B/3C deploy, 3E DNS/SSL, 4C sounds

---

## Open Items
- [ ] Tester re-tests after turn lag fix (`cc7b047`) deploys
- [ ] Tank positioning on John's desktop — may be related to terrain sync timing, monitor next test
- [ ] iPad shows desktop layout (useIsMobile checks viewport size, not UA) — expected behavior
- [ ] If lag persists: consider Render paid tier ($7/mo) for consistent performance
- [ ] Collect more tester feedback

---

## Key Files Modified
- `client/src/components/StatCard.js` — fixed 720x405 card, all px-based styles, transform scale
- `server/socket-io/main.js` — trajectory thinning, conditional terrainUpdate
- `client/src/scenes/main/index.js` — animation speed 2→1, visual-only blasts non-blocking
- `client/src/hooks/useIsMobile.js` — orientationchange listener for mobile Safari
- `TODO.md` — full roadmap overhaul + Phase 8C consumables spec
