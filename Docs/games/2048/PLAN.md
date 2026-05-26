# 2048 — Game Plan

> Tier 2 solo-skill game for The Arcade. Score-chase, daily-pot
> wagering layer later. ~1 week from cold start to shipped per
> `Docs/ARCADE_PLAYBOOK.md` (the procedure is well-trodden after
> basketball + keepie-uppies).

---

## Why 2048

- **Universally known.** Brand recognition lift comes for free.
- **Mobile-perfect already.** Swipe inputs map 1:1 to phone gestures.
- **Score-chase shape** matches our shipped pattern — same JWT leaderboard wiring as keepie-uppies / basketball.
- **Single-file game logic.** ~600 lines of vanilla JS in the canonical implementation. Easy to reskin without touching mechanics.
- **No physics simulation.** Big chunk of work that ball games needed is just absent here.

## Fork target

**`gabrielecirulli/2048`** — the canonical MIT-licensed implementation. Original author, clean code, no asset weight.

GitHub: https://github.com/gabrielecirulli/2048

License: MIT. Verified before commit.

What we keep: tile movement logic, merge logic, score logic, animation timing, swipe input.

What we replace: art, fonts, colours, audio, the HUD around the grid.

## Design twist (the "not just a reskin" rule per Next_Steps doc §10)

A pure reskin feels like an asset flip. Each arcade game needs at least one meaningful gameplay or economy twist.

**Twist for SolShot 2048:** the tile values are SHOT-denominated. Tiles are `1 SHOT`, `2 SHOT`, `4 SHOT`, ... `2048 SHOT`. The animation that fires when you merge two tiles is the SolShot prestige-burn animation. Mechanically identical to 2048; cosmetically it's "you're combining SHOT into bigger SHOT denominations." Reads as "this game belongs in this arcade" rather than "this is 2048 with the SolShot logo on it."

Optional second twist for the daily-pot layer: the daily high score earns the player a real, small SHOT airdrop on top of the pot prize. Reinforces the "tiles ARE SHOT" theme.

## Scope of work

| Component | Effort | Notes |
|---|---|---|
| Fork + run locally | 30 min | Verify MIT, get the original running |
| Branch + Vercel project | 30 min | Follow ARCADE_PLAYBOOK §3 — branch off `main` → `arcade/2048`, Vercel project `sol-shot-2048` on JJ's account, `CI=false` env var, production branch = `arcade/2048` |
| Replace art with SolShot tokens | 2-3 hours | Black Ops One for tile numbers, olive/bone/orange-rust palette per tile value (1=bone, 2=olive, 4=orange, 8=rust, ...), clip-path angled tile corners |
| Replace audio with Web Audio synth | 1 hour | Tile slide (filtered noise), tile merge (rising sine + cheer), game over (descending square wave). All wrapped in `safeAudio`. |
| Standalone entry + JWT leaderboard | 1 hour | Copy `keepie-uppies-standalone` → `2048-standalone`. Same template, find-replace slug. |
| Mongo model + Render env var | 15 min | `G2048Score` schema, `G2048_LEADERBOARD_SECRET` on Render |
| Arcade bot registry | 15 min | `GAMES` + `LEADERBOARDS` entries. Bot command `/twentyfortyeight` (no digits in TG slash commands — verify and adjust slug if needed) |
| Phone-readiness checklist | 30 min | All 7 boxes from ARCADE_PLAYBOOK §6 |
| Real-device test pass | 1 hour | iPhone landscape + portrait, Android, TG in-app browser |
| Deploy gates + post-deploy verify | 30 min | All boxes from ARCADE_PLAYBOOK §7 |

**Total: 1-1.5 days of focused work.**

## Slug + bot command nuance

**Telegram doesn't allow digits in slash commands** unless they're after letters. `/2048` is invalid — would fail BotFather validation.

Options:
- `/twentyfortyeight` — long but explicit
- `/two048` — gimmicky but valid
- `/play2048` — works (digits after letters allowed)

Recommend `/play2048` — short, unambiguous.

Vercel URL stays `sol-shot-2048.vercel.app` (URL hostnames CAN start with digits).

Game folder: `client/src/games/2048/` (no hyphen since it's all digits).

## Daily-pot wagering hook (Phase 2 of arcade rollout)

When the wagering infrastructure lands (per Next_Steps_Games.docx Phase 4), 2048 becomes the cleanest daily-pot game:
- Entry fee: 0.05 SOL
- 24h window
- At UTC midnight: top 10 scores split the pot 50/25/10/5/3/3/2/1/0.5/0.5
- Real-time leaderboard during the window (already built — the JWT leaderboard service exists)

No new game-side code needed for the wagering layer to attach. The leaderboard already records timestamped per-user best scores; daily-pot is a server-side query over a time window.

## Day-1 checklist for Fish (or whoever picks this up)

Pre-build:
- [ ] Read `Docs/ARCADE_PLAYBOOK.md` end-to-end (the procedure)
- [ ] Read `Docs/BALL_GAMES_PLAYBOOK.md` §6 (touch input) + §8 (sfx) — those carry across
- [ ] Fork the canonical repo locally. Verify MIT. Confirm it runs in browser.

Branch + project setup:
- [ ] `git checkout -b arcade/2048` from current `main`
- [ ] Vercel project created on JJ's account (`sol-shot-2048`)
- [ ] Production branch tracking = `arcade/2048`
- [ ] `CI=false` env var on Vercel

Code:
- [ ] `client/src/games/2048/` folder created with constants/scene/Screen
- [ ] `client/src/index.js` replaced with standalone mount (per ARCADE_PLAYBOOK §3.3)
- [ ] Tile art replaced with SolShot palette + Black Ops One
- [ ] Web Audio synth replaces any imported audio assets
- [ ] `client/src/index.css` has the no-tap-zoom + 100dvh root

Leaderboard:
- [ ] `server/services/games/2048-standalone/standaloneLeaderboard.js` (copy from keepie-uppies, find-replace)
- [ ] `server/models/G2048Score.js` (copy from keepie-uppies)
- [ ] `POST /api/games/2048/score` + `GET /api/games/2048/leaderboard` routes added
- [ ] `G2048_LEADERBOARD_SECRET` set on Render (48-byte base64url)
- [ ] `https://sol-shot-2048.vercel.app/` appended to `CORS_ORIGINS` on Render

Bot:
- [ ] `GAMES` entry added in `server/services/arcadeBot.js`
- [ ] `LEADERBOARDS` entry added
- [ ] Slug command works (`/play2048` recommended, NOT `/2048`)

Test gates:
- [ ] All 7 phone-readiness boxes (ARCADE_PLAYBOOK §6)
- [ ] iPhone landscape + portrait real-device pass
- [ ] TG in-app browser test
- [ ] `CI=true npm run build` clean

Deploy:
- [ ] Push `arcade/2048` → auto-build on Vercel
- [ ] Push `main` after merging the bot changes → Render redeploys
- [ ] `/games` in `@TheArcadeGG_Bot` lists 2048
- [ ] `/play2048` launches the game
- [ ] Score persists, leaderboard updates

## Notes from main-claude (planning session, 2026-05-17)

- 2048's open-source community has produced dozens of reskins. The SHOT-denominated tile twist is genuinely novel; no other 2048-clone does this.
- The visual reskin is where most of the polish hours go. Tile colour-per-value mapping should mirror SolShot's prestige tiers (1=Bronze, 2=Silver, ..., 2048=Mythical) so the game implicitly teaches the prestige ladder. A small UX win.
- Game-over animation: instead of "Game Over" text, animate "FINAL: 1024 SHOT" using Black Ops One. Reinforces the SHOT theme.

— main-claude, 2026-05-17
