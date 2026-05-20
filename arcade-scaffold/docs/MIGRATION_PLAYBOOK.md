# The Arcade — Migration Playbook

> **Status:** Operational playbook. Companion to [`THE_ARCADE_v1_DESIGN.md`](THE_ARCADE_v1_DESIGN.md) (on `arcade/website-design` branch). The design doc says *what* gets built; this doc says *how* the rollout happens.
> **Owner:** JJ (architecture + coordination), Fish (build).
> **Last updated:** 2026-05-19

## TL;DR

1. The Arcade lives in its **own GitHub repo**, not as a directory in the SolShot monorepo.
2. SolShot repo stays **exactly** as it is — name, structure, hackathon submission untouched.
3. The SolShot **server** stays where it is. It hosts arcade.xyz API endpoints, `@TheArcadeGG_Bot`, and `@SolShotGG_bot` — same Render service, same Mongo, same Privy app.
4. The Arcade repo is **client only** (Vite + React + TS + Phaser). Talks to SolShot's server via HTTPS.
5. Game code lifts from the per-game branches (`arcade/basketball`, `arcade/keepie-uppies`) into the new repo's `src/games/` — one-time copy.
6. Per-game Vercel projects retire after the new arcade.xyz is verified.

Brand hierarchy externally: The Arcade is the parent, SolShot is one product underneath. Internal naming smell (the SolShot repo holds the platform backend) is acknowledged and accepted — fixing it would require renaming the repo, which alters the hackathon submission identity.

## Architecture overview

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  arcade.xyz              │        │  solshot.gg              │
│  (new repo, Vite+TS)     │        │  (SolShot repo, CRA+JS)  │
│  ────────────────────────│        │  ────────────────────────│
│  - cabinet landing       │        │  - artillery game        │
│  - dashboard             │        │  - challenge cards       │
│  - /play/keepie-uppies   │        │  - on-chain escrow       │
│  - /play/basketball      │        │  - prestige burns        │
│  - /play/free-kicks      │        │                          │
│  - /play/solshot →───────┼────────┼─→ redirect with handoff  │
│    (interstitial)        │        │                          │
│  - /leaderboards         │        │                          │
│  - /wager (waitlist)     │        │                          │
└────────────┬─────────────┘        └────────────┬─────────────┘
             │                                   │
             └─────────────┬─────────────────────┘
                           ▼
              ┌────────────────────────────┐
              │  SolShot server (Render)   │
              │  ─────────────────────────│
              │  - Express + Socket.IO     │
              │  - @SolShotGG_bot          │
              │  - @TheArcadeGG_Bot        │
              │  - Mongo (User, Match,     │
              │    BasketballScore,        │
              │    KeepieUppiesScore, …)   │
              │  - Anchor escrow client    │
              │  - Privy server-auth       │
              │  - /api/arcade/* endpoints │
              └────────────────────────────┘
                          ▲
                          │ Privy app (shared appId)
                          ▼
              ┌────────────────────────────┐
              │  Privy (dashboard.privy.io)│
              │  appId = cmorbf…           │
              │  origins:                  │
              │   - solshot.gg             │
              │   - arcade.xyz (NEW)       │
              │   - localhost:5173 (NEW)   │
              └────────────────────────────┘
```

## Pre-flight (one-time, ~30 min)

| # | Task | Owner | Done when |
|---|---|---|---|
| 1 | Create empty GitHub repo (e.g. `arcade`, `the-arcade`) | JJ | Repo URL exists |
| 2 | Push scaffold from `arcade-scaffold/` in the SolShot worktree | JJ | First commit lands on `main` |
| 3 | Vercel "Import from GitHub" → new project on JJ's Vercel account (not Fish's — per the 2026-05-15 post-mortem) | JJ | `<projectname>.vercel.app` returns the cabinet landing |
| 4 | Privy dashboard → Allowed origins: add `<projectname>.vercel.app` + `http://localhost:5173` | JJ | Origins list updated |
| 5 | SolShot server CORS allowlist: add `<projectname>.vercel.app` | JJ | One-line PR to `server/index.js` `ALWAYS_ALLOWED_ORIGINS` |
| 6 | Render env: `ARCADE_SESSION_SECRET` (already wired in `render.yaml` with `generateValue: true` — verify on Render dashboard) | JJ | Env var present and non-empty |
| 7 | Vercel env vars on new project: `VITE_PRIVY_APP_ID`, `VITE_SOLSHOT_API_BASE`, `VITE_SOLANA_NETWORK`, `VITE_SOLANA_RPC`, `VITE_SOLSHOT_WEB_URL` | JJ | Redeploy succeeds; `Insert Coin` opens Privy modal |
| 8 | Add Fish as collaborator on the new repo | JJ | Fish has push access |
| 9 | Hand off: repo URL + Privy `appId` + Render API base URL to Fish | JJ | Done |

## Server-side endpoints (already shipped in this PR)

- **`POST /api/arcade/session-handoff`** — Privy-auth gated. Returns short-lived JWT for redirect to solshot.gg. 10-min TTL, HS256 + `ARCADE_SESSION_SECRET`.
- **`POST /api/arcade/session-validate`** — Public (JWT-self-authed). SolShot client posts the token, gets back the claims.
- **`useArcadeTokenReceiver` hook** in SolShot client — reads `?arcade_token=...`, validates, stashes hint in `localStorage`, strips param. Pure side-effect, no destructive UX change.

Server file: [`server/services/arcadeSession.js`](../server/services/arcadeSession.js).
Routes: [`server/index.js`](../server/index.js) — search "Arcade ↔ SolShot session handoff".
Client hook: [`client/src/hooks/useArcadeTokenReceiver.js`](../client/src/hooks/useArcadeTokenReceiver.js).

## The lift moment

Game code currently lives on per-game branches with hacked `client/src/index.js` files (boot straight into the game, skip App.js/wallet/socket). That divergence is what forces each game into its own Vercel project — it can't merge back to main.

The new arcade repo solves that by having a proper React Router. Time to lift.

### Steps

1. **JJ pings Fish** in TG: "freeze KU at commit X, freeze BB at commit Y, last chance for tweaks."
2. Fish acks, finishes any last polish on the per-game branches, confirms freeze.
3. **JJ lifts the code** (or Fish does, with the new repo cloned):
   ```bash
   cd <solshot-repo>
   git checkout arcade/keepie-uppies -- client/src/games/keepie-uppies
   cp -r client/src/games/keepie-uppies <arcade-repo>/src/games/
   git checkout main
   # Repeat for basketball
   git checkout arcade/basketball -- client/src/games/basketball
   cp -r client/src/games/basketball <arcade-repo>/src/games/
   git checkout main
   ```
4. **In the arcade repo:** rename lifted `.js` files to `.ts`/`.tsx`. Quick option: add `// @ts-nocheck` at the top of each — strict mode stays happy, TS conversion deferred. Proper option: type as you go.
5. Wire each game's scene into its route component. Template in `src/games/README.md`.
6. Commit, push, verify Vercel preview deploys cleanly.
7. **Tag-and-archive the per-game branches** (don't delete yet — keep as rollback):
   ```bash
   cd <solshot-repo>
   git tag arcade-keepie-uppies-final-2026-xx-xx arcade/keepie-uppies
   git tag arcade-basketball-final-2026-xx-xx arcade/basketball
   git push origin arcade-keepie-uppies-final-2026-xx-xx
   git push origin arcade-basketball-final-2026-xx-xx
   ```

From this point forward, **Fish iterates only in the arcade repo**. No more per-game-branch double-maintenance.

## Cutover

When the arcade.xyz hub is verified working with the lifted games:

1. **Smoke-test checklist** (JJ + Fish, real iPhone, real TG client):
   - [ ] Cabinet landing renders cleanly
   - [ ] `Insert Coin` opens Privy modal
   - [ ] Sign in via email → land on dashboard
   - [ ] Sign in via Telegram OAuth → land on dashboard, callsign matches expected
   - [ ] Tap each game tile → game scene loads, controls work
   - [ ] Submit a score → leaderboard query reflects it
   - [ ] SolShot tile → redirect succeeds, SolShot loads with welcome banner (if implemented) or normal flow
   - [ ] `/leaderboards` page populated
   - [ ] `/wager` page renders
   - [ ] Sign out works, returns to cabinet
2. **Update bot `GAMES` array** in [`server/services/arcadeBot.js`](../server/services/arcadeBot.js):
   - `keepie-uppies` URL → `https://arcade.xyz/play/keepie-uppies` (or whatever the real domain is)
   - `basketball` URL → `https://arcade.xyz/play/basketball`
   - `free-kicks` URL → `https://arcade.xyz/play/free-kicks` (when Fish ships it)
3. **(Optional) BotFather `setdomain`** → change from `solshot.gg` to `arcade.xyz` if you want silent Privy auth via `login_url` to keep working across all games. v1 can stay on the existing `solshot.gg` setdomain and the bot launches without silent-auth on the new URLs.
4. Push the commit. Render redeploys server. Bot now sends users to arcade.xyz.

### Downtime

**Zero.** The cutover is one commit. Old standalone Vercel projects stay live as fallbacks (cost nothing without traffic). Anyone with a bookmarked URL gets a working game (no leaderboard if you've also retired the standalone leaderboard endpoints — see Cleanup §).

If anything goes wrong post-cutover, **rollback is one revert** of the `GAMES` array commit. Bot points back to the standalone URLs. Players see no difference.

## Cleanup (post-cutover, on a comfortable timeline)

| Item | When | How |
|---|---|---|
| Retire `sol-shot-basketball` Vercel project | After 1 week of stable arcade.xyz traffic | Vercel dashboard → Project → Settings → Delete (or pause). Project URL stops resolving. |
| Retire `sol-shot-keepie-uppies` Vercel project | Same | Same |
| Delete `arcade/basketball` branch | After tag-and-archive (above) | `git push origin --delete arcade/basketball` |
| Delete `arcade/keepie-uppies` branch | Same | Same |
| Remove standalone leaderboard endpoints from server | When arcade.xyz proven and no bookmarked-URL traffic for 30+ days | Delete `server/services/games/basketball-standalone/`, `server/services/games/keepie-uppies-standalone/`, and the `/api/games/basketball/*` + `/api/games/keepieuppies/*` routes from `server/index.js`. Drop unused Mongo indexes. |

## Rollback plan

If something breaks badly post-cutover and a forward-fix isn't fast:

1. **Cutover commit revert** (server side): `git revert <commit>` of the `GAMES` array change. Render redeploys. Bot back to standalone URLs.
2. **Privy origins**: no rollback needed — having extra allowed origins is harmless.
3. **CORS allowlist**: no rollback needed — same.
4. **arcade.xyz domain**: can sit at the Vercel `.vercel.app` URL with the real domain unpointed; users see no impact.

Standalone Vercel projects + per-game branches stay in tag-and-archive form for at least 30 days post-cutover so the rollback path is always available.

## Open architectural calls (deferred, do not block this rollout)

These are flagged in [`THE_ARCADE_v1_DESIGN.md`](THE_ARCADE_v1_DESIGN.md) and require a separate JJ + Fish session before they land:

1. **Arcade Champion cross-game leaderboard formula** — reverses the 2026-05-15 deferral. Percentile-rank-sum proposed; cold-start noise + the "100 for not playing" penalty need a min-N threshold and a Today-view decision before shipping.
2. **$TOKENS vs $SHOT economy split** — copy-only in v1 per the design doc, full launch in v2. Direction-of-travel discussion in flight (in-game $SHOT vs tradeable $TOKENS).
3. **Domain** — `arcade.xyz` vs `thearcade.gg` vs alternatives, WHOIS pending. Doesn't block scaffold or first Vercel deploy (which uses the `.vercel.app` URL).
4. **Framework migration of existing SolShot client** — not in scope. The new arcade repo is Vite+TS; the SolShot client stays CRA+JS. Migrating SolShot is a separate initiative, not part of this rollout.

## Coordination etiquette (JJ + Fish)

- **All changes to SolShot's `client/src/wallet/` go through their own PR first.** Per `ARCADE_NEW_GAME_PLAYBOOK.md` — auth code is touchy.
- **Fish builds in the new repo only.** No PRs against SolShot main from the arcade work (except the one-line CORS allowlist add, which is JJ's to make).
- **JJ neatens up after each Fish push.** Code review, naming pass, dead-code removal, doc updates.
- **The lift moment is announced explicitly.** No "freeze went quiet" surprises.
