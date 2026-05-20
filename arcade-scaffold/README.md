# The Arcade

Parent-brand web hub. Hosts the ball games (Keepie-Uppies, Basketball, Free-Kicks) inline; redirects out to `solshot.gg` for SolShot.

Companion to `@TheArcadeGG_Bot` (the Telegram launcher in the SolShot repo at `server/services/arcadeBot.js`). Two surfaces, one brand.

## Read first (Fish + any Claude landing in this repo)

- **`docs/FISH_KICKOFF.md`** — onboarding doc, first thing to read on a fresh session
- **`docs/THE_ARCADE_v1_DESIGN.md`** — canonical design proposal (v1)
- **`docs/MIGRATION_PLAYBOOK.md`** — operational rollout (pre-flight, lift moment, cutover, rollback)
- **`docs/CLAUDE_COMMS.md`** — cross-session journal for arcade-local decisions
- **Cross-repo:** the SolShot repo's `Docs/internal/CLAUDE_COMMS.md` (2026-05-19 entry) is the canonical record of decisions that span both repos

## Stack

- Vite + React 18 + TypeScript (strict)
- React Router v6
- `@privy-io/react-auth` (shared app with SolShot)
- Phaser 3 (game scenes lifted from per-game branches in the SolShot repo)

## First-time setup

```bash
npm install
cp .env.example .env
# Fill in VITE_PRIVY_APP_ID and VITE_SOLSHOT_API_BASE — JJ supplies these
npm run dev
```

App boots at `http://localhost:5173`.

## Lifting game code from the SolShot repo

The three ball games currently live on per-game branches in the SolShot monorepo:

- Keepie-Uppies → `arcade/keepie-uppies` branch, files in `client/src/games/keepie-uppies/`
- Basketball → `arcade/basketball` branch, files in `client/src/games/basketball/`
- Free-Kicks → (to come; same pattern)

Lift moment is coordinated with JJ. After the freeze:

1. Check out the SolShot per-game branch.
2. Copy the game folder contents into `src/games/<slug>/` in this repo.
3. Convert `.js` → `.tsx`/`.ts` as needed. If you want to defer TS conversion, add `// @ts-nocheck` at the top of each lifted file — strict mode won't yell.
4. Wire the route component in `src/routes/games/<Game>.tsx` to mount the scene.
5. Server-authoritative scoring contract is unchanged — call existing endpoints on `VITE_SOLSHOT_API_BASE`.

After lift, retire the per-game SolShot branches (tag-and-archive for safety, then delete).

## Deployment

Vercel project (JJ's account, not Fish's — separate accounts caused the basketball URL split per the 2026-05-15 post-mortem). Tracks `main`. Initial Vercel URL is `<projectname>.vercel.app`; the real domain points later.

Privy dashboard:
- Add the `.vercel.app` URL to allowed origins (JJ does this once)
- Add `http://localhost:5173` for local dev (JJ does this once)
- Same `appId` as SolShot — callsigns carry across both sites

CORS:
- The SolShot server's allowlist needs the arcade origin added before any API call works. One-line commit on the SolShot repo (`server/index.js` hardcoded production-origins list per commit `d7e65e8`).

## Architecture pointers

Full design doc lives in the SolShot repo at `Docs/THE_ARCADE_v1_DESIGN.md` (branch `arcade/website-design`). Migration playbook + comms entry land on a feature branch off SolShot main.

Key contracts:
- **Identity:** Privy callsign canonical. TG bot arrivals carry a JWT with `telegramUserId`; server resolves to callsign via TG↔wallet binding in `users` collection if linked, else displays TG name.
- **SolShot session handoff:** `GET /api/arcade/session-handoff` on the SolShot server mints a 10-min single-use JWT (same pattern as existing `walletLinkTokens.js`). Append as `?arcade_token=...` when redirecting to `solshot.gg`. The SolShot client validates and provisions a Privy session.
- **Scoring:** server-authoritative per `ARCADE_NEW_GAME_PLAYBOOK.md`. Client sends inputs; server simulates, returns result, writes score. Don't compute results client-side.

## Push-to-repo first-time

```bash
git init
git add .
git commit -m "chore: initial Vite + React + TS scaffold"
git branch -M main
git remote add origin <your new repo URL>
git push -u origin main
```

Vercel "Import from GitHub" picks up the Vite config automatically. No `CI=false` needed (Vite doesn't have CRA's warnings-as-errors-in-CI behaviour).
