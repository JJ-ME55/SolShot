# Bubble Shooter — Game Plan

> Tier 2 solo-skill game for The Arcade. Score-chase, daily-pot
> wagering layer later. ~1 week from cold start per
> `Docs/ARCADE_PLAYBOOK.md`. Slightly heavier than 2048 because of
> the aiming/trajectory mechanic, but still well within the proven
> pattern.

---

## Why Bubble Shooter

- **Broadest casual appeal of any genre ever made.** Hundreds of millions of plays across mobile arcades. Universal familiarity = zero onboarding friction.
- **Aim-and-shoot mechanic.** Fish has the most relevant muscle memory from basketball + keepie-uppies (trajectory + flick input). His domain.
- **Mobile-perfect.** Touch-to-aim, tap-to-shoot. No keyboard required, no complex UI.
- **Score-chase shape.** Clears the level, score per clear, leaderboard-friendly.
- **Geometric / graphic visual identity.** Hex-grid bubble cluster + clean lines — fits the SolShot CRT aesthetic better than Tetris's blocky brand confusion.
- **MIT-licensed reference implementation** with HTML5 Canvas, ~800 LOC.

## Fork target

**`rembound/Bubble-Shooter-HTML5`** — clean HTML5 Canvas implementation, MIT-licensed.

GitHub: https://github.com/rembound/Bubble-Shooter-HTML5

License: MIT. Verified before commit.

What we keep: bubble grid logic, collision detection, cluster-pop detection, scoring, aim-line rendering.

What we replace: art, colours, audio, the HUD around the shooter, the game-over flow.

## Design twist (the "not just a reskin" rule)

A pure reskin feels like an asset flip. Each arcade game needs at least one meaningful gameplay or economy twist.

**Twist for SolShot Bubble Shooter:** the bubbles are SHOT currency icons in 5 tiers (`1 SHOT` = bone, `5 SHOT` = olive, `10 SHOT` = orange, `25 SHOT` = rust, `100 SHOT` = red — matching the SolShot prestige palette). When you pop a cluster, the score-increase animation shows the SHOT total floating up + a tiny prestige-burn-style particle effect. Pop a cluster of 100-SHOT bubbles for a Mythic combo bonus.

Mechanically identical to Bubble Shooter; cosmetically and economically it reads as "this game belongs in the SolShot arcade."

Optional secondary twist: special "GOLD BUBBLE" shows up once per level. Pop it → small real SHOT airdrop credited to the player's TG identity. Reinforces the wagering layer.

## Scope of work

| Component | Effort | Notes |
|---|---|---|
| Fork + run locally | 30 min | Verify MIT, get the original running |
| Branch + Vercel project | 30 min | `arcade/bubble-shooter`, Vercel project `sol-shot-bubble-shooter` on JJ's account, per ARCADE_PLAYBOOK §3 |
| Reskin bubble art to SHOT icons | 3-4 hours | 5 tier colours per SolShot tokens, clip-path angled bubble outlines (subtle), Black Ops One for the numeric labels inside bubbles |
| Reskin shooter + UI | 2 hours | Shooter cannon styled like SolShot's tank turret, aim-line in orange-hot, score panel in Share Tech Mono |
| Web Audio synth for SFX | 2 hours | Bubble pop (filtered noise burst, pitched by cluster size), bubble launch (low whoosh), cluster combo (ascending arpeggio), game over (descending). All `safeAudio` wrapped. |
| Standalone entry + JWT leaderboard | 1 hour | Copy `keepie-uppies-standalone` → `bubble-shooter-standalone`, find-replace slug |
| Mongo model + Render env var | 15 min | `BubbleShooterScore` schema, `BUBBLE_SHOOTER_LEADERBOARD_SECRET` on Render |
| Arcade bot registry | 15 min | `GAMES` + `LEADERBOARDS` entries. Slug `bubble` (short, valid TG command) |
| Touch aim sensitivity tuning | 1 hour | Borrow `LATERAL_AIM_SENSITIVITY = 0.65` damping from BALL_GAMES_PLAYBOOK §6.3 |
| Phone-readiness checklist | 30 min | All 7 boxes from ARCADE_PLAYBOOK §6 |
| Real-device test pass | 1-2 hours | iPhone landscape + portrait, Android, TG in-app browser. Bubble Shooter is more input-sensitive than 2048 so allocate extra. |
| Deploy gates + verify | 30 min | All boxes from ARCADE_PLAYBOOK §7 |

**Total: 1.5-2 days of focused work.** Slightly more than 2048 because of the aim mechanic + bubble art.

## Visual identity opportunity

Bubble Shooter is the BEST candidate for showcasing the shared SolShot HUD tokens (per ARCADE_PLAYBOOK §5). The bubble grid is the gameplay canvas (per-game palette); the score panel + level indicator + cannon UI all live OUTSIDE the canvas and should use:

- Black Ops One for level / score numbers
- Share Tech Mono for "LEVEL 3 · SCORE 4,250 · NEXT 250 TO COMBO"
- Clip-path angled buttons for play-again, settings
- Olive/bone/orange-rust palette on the chrome

This is the first arcade game where the SHARED HUD tokens get a serious workout. If it lands well, ARCADE_PLAYBOOK §5.4 can be upgraded from "recommendation" to "locked rule."

## Day-1 checklist for Fish

Pre-build:
- [ ] Read `Docs/ARCADE_PLAYBOOK.md` end-to-end
- [ ] Read `Docs/BALL_GAMES_PLAYBOOK.md` §6.1 (touch input stale-tracking guard) + §6.3 (LATERAL_AIM_SENSITIVITY)
- [ ] Fork rembound/Bubble-Shooter-HTML5 locally. Verify MIT. Confirm it runs in browser.

Branch + project setup:
- [ ] `git checkout -b arcade/bubble-shooter` from current `main`
- [ ] Vercel project created on JJ's account (`sol-shot-bubble-shooter`)
- [ ] Production branch tracking = `arcade/bubble-shooter`
- [ ] `CI=false` env var on Vercel

Code:
- [ ] `client/src/games/bubble-shooter/` folder created
- [ ] `client/src/index.js` replaced with standalone mount
- [ ] Bubble art replaced — 5 SHOT-tier colours + Black Ops One numeric labels
- [ ] Shooter cannon reskinned to SolShot tank-turret style
- [ ] Aim-line in `--orange-hot`
- [ ] Touch input has stale-tracking guard from day one
- [ ] LATERAL_AIM_SENSITIVITY damping applied (start at 0.65, tune by playtest)

Audio:
- [ ] `sfx.js` with `safeAudio` wrapper
- [ ] Bubble pop synth (cluster-size-pitched)
- [ ] Cluster combo arpeggio
- [ ] Launch whoosh
- [ ] Game-over chord

Leaderboard:
- [ ] `server/services/games/bubble-shooter-standalone/standaloneLeaderboard.js`
- [ ] `server/models/BubbleShooterScore.js`
- [ ] `POST /api/games/bubble-shooter/score` + `GET /api/games/bubble-shooter/leaderboard` routes
- [ ] `BUBBLE_SHOOTER_LEADERBOARD_SECRET` set on Render
- [ ] `https://sol-shot-bubble-shooter.vercel.app/` appended to `CORS_ORIGINS`

Bot:
- [ ] `GAMES` entry in `server/services/arcadeBot.js`
- [ ] `LEADERBOARDS` entry
- [ ] Slug `bubble` for the `/bubble` command (concise, valid TG slash command)

Test gates:
- [ ] All 7 phone-readiness boxes
- [ ] iPhone landscape + portrait (aim sensitivity feels right)
- [ ] TG in-app browser test
- [ ] `CI=true npm run build` clean
- [ ] Multi-touch test (palm graze doesn't break aim)

Deploy:
- [ ] Push `arcade/bubble-shooter` → auto-build
- [ ] Merge bot changes to `main` → Render redeploys
- [ ] `/games` lists Bubble Shooter
- [ ] `/bubble` launches it
- [ ] Score persists, leaderboard updates

## Notes from main-claude (planning session, 2026-05-17)

- Bubble Shooter is the **first arcade game with a meaningful aim mechanic since SolShot**. Fish's touch-input expertise transfers directly.
- The hex-grid + clean colour-tier aesthetic IS the SolShot visual identity. This game does more to lock in "arcade family resemblance" than any prior game.
- If the visual identity question (ARCADE_PLAYBOOK §5.4) is going to be settled by one game, this is it. Treat the HUD chrome as a real design exercise, not an afterthought.
- The aim-line is a powerful visual moment. Make it a single clean orange-hot line with a small SolShot-style cross-hair at the tip. Don't dot-trail it (that visual is reserved for SolShot trajectory previews — keep distinct).

— main-claude, 2026-05-17
