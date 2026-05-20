# Fish Kickoff — first session in this repo

> **For `@fishyboy-claude` on first boot in The Arcade repo.** This is the soft-landing doc — read top to bottom before doing anything else.

## Where you are

You're in **The Arcade** repo — the new client-only web hub for arcade.xyz. This is **not** the SolShot repo (`JJ-ME55/SolShot`). The SolShot repo holds:

- `client/` — the SolShot artillery game (solshot.gg)
- `server/` — the shared backend (Express + Socket.IO + both bots + Mongo + escrow + Privy)
- `programs/` — Anchor escrow programs

The Arcade repo holds **only the web client** for arcade.xyz. The server stays in SolShot. Cross-repo HTTPS for client→server calls (CORS allowlist on the server already includes this Vercel project).

## What's already decided (don't re-litigate)

Settled in a 2026-05-19 session between `@johnk`, `@fishyboy-claude` (Fish's prior session that drafted `THE_ARCADE_v1_DESIGN.md`), and `@main-claude`:

- **Separate repo from SolShot** (not a `client-arcade/` subdir in the SolShot monorepo). Brand hierarchy + iteration speed.
- **Vite + React + TS** for this client. Scaffold already present.
- **Server stays in SolShot repo.** No server-split.
- **Identity merges** via existing TG↔wallet binding in the `users` collection. Callsign canonical. Web users get callsign via Privy; TG bot arrivals carry `telegramUserId` which resolves to callsign at read-time.
- **Session handoff** to solshot.gg uses a 10-min JWT in URL fragment. Server endpoints already shipped (`POST /api/arcade/session-handoff` + `POST /api/arcade/session-validate`).
- **Per-game branches retire after the lift.** No double-maintenance. After this repo serves the games, `arcade/keepie-uppies` and `arcade/basketball` on the SolShot repo get tagged and the branches deleted.

Full proposal in [`THE_ARCADE_v1_DESIGN.md`](THE_ARCADE_v1_DESIGN.md). Operational rollout in [`MIGRATION_PLAYBOOK.md`](MIGRATION_PLAYBOOK.md).

## Open architectural calls (deferred, do not act on these without JJ)

1. **Arcade Champion cross-game leaderboard formula** — JJ flagged the 2026-05-15 deferral was deliberate. Percentile-rank-sum proposal has cold-start noise. Decision parked.
2. **$TOKENS vs $SHOT economy** — direction-of-travel: $SHOT becomes purely in-game (no trading), $TOKENS is the sole tradeable token. Implications for the on-chain $SHOT mint (already deployed). Deferred.
3. **Domain** — `arcade.xyz` vs `thearcade.gg` vs alternatives, WHOIS pending. Doesn't block any UI work — the deploy URL is currently `the-arcade.vercel.app`.

If you find yourself wanting to make a call on any of these, **stop and ask JJ**. These are intentionally not resolved.

## What's in the scaffold

```
the-arcade/
├── docs/
│   ├── FISH_KICKOFF.md         (this file)
│   ├── THE_ARCADE_v1_DESIGN.md (canonical design)
│   ├── MIGRATION_PLAYBOOK.md   (operational rollout)
│   └── CLAUDE_COMMS.md         (arcade-local cross-Claude journal)
├── src/
│   ├── main.tsx              React + BrowserRouter + Privy boot
│   ├── App.tsx               Route definitions
│   ├── routes/               Cabinet, Dashboard, /play/*, /leaderboards, /wager, /profile, /me, /about
│   ├── wallet/               Privy provider + useArcadeAuth hook
│   ├── api/client.ts         Typed fetch wrapper for SolShot server endpoints
│   ├── games/                EMPTY — game scenes lift here after the freeze moment
│   ├── assets/brand/         EMPTY — drop your cabinet mocks + logos here
│   └── styles/               tokens.css with full brand palette, global.css
├── package.json              Vite + React 18 + TS + Phaser + Privy
└── README.md                 Setup commands + per-game lift procedure
```

## What to do first (after JJ adds you as collaborator)

1. **Clone, install, run dev**:
   ```bash
   git clone <repo>
   cd <repo>
   npm install
   cp .env.example .env
   # Fill in VITE_PRIVY_APP_ID + VITE_SOLSHOT_API_BASE — JJ has the values
   npm run dev
   ```
   Confirm the cabinet landing renders at `http://localhost:5173`. Tap "Insert Coin" to test Privy.

2. **Drop your brand mocks** at `src/assets/brand/`:
   - Cabinet illustration (full-bleed pre-auth landing)
   - Logo / wordmark variants
   - Game tile artwork (KU, BB, FK, SolShot)
   - Joystick + button silhouettes
   - Scanline overlay (1px, 4% opacity per design doc)
   - Source files (PSD/AI/Figma) go to `src/assets/brand/source/` if you want them tracked; otherwise gitignore them.
   Commit these as a discrete PR — easy to review, easy to revert if needed.

3. **Don't touch the per-game branches in the SolShot repo yet.** The lift moment is coordinated with JJ. Anything you push to `arcade/keepie-uppies` or `arcade/basketball` after the freeze announcement becomes orphaned.

4. **Wait for JJ's lift-moment ping**, then:
   - JJ messages: "freeze KU at commit X, freeze BB at commit Y."
   - You finish any last polish on those branches in the SolShot repo.
   - JJ (or you) copies the game folders into this repo's `src/games/`.
   - Convert `.js` → `.tsx` / `.ts` (use `// @ts-nocheck` if you want to defer typing — strict mode stays happy).
   - Wire each game scene into its route component at `src/routes/games/<Game>.tsx` (template in `src/games/README.md`).
   - JJ tag-and-archives the old branches.

## What NOT to do

- **Don't touch SolShot's `client/src/wallet/`** without a separate coordination PR. Per `ARCADE_NEW_GAME_PLAYBOOK.md` in the SolShot repo — auth code is touchy.
- **Don't add server-side code.** Server stays in SolShot. If you need a new endpoint, flag it in CLAUDE_COMMS and `@main-claude` will land it.
- **Don't decide on the open architectural calls** (Arcade Champion formula, $TOKENS/$SHOT, domain). Surface and wait.
- **Don't push to `main`** unless your change is a working build. CI is set to deploy to `the-arcade.vercel.app` on every `main` push. PR + preview for anything beyond trivial.
- **Don't use the Privy auth flow as a wrapper around game leaderboards yet.** The server endpoints for `/api/arcade/leaderboard/*` aren't built yet — main-claude is working on those in parallel. Until they exist, placeholder routes are fine.

## Where to ask questions

- **For JJ:** TG as normal.
- **For `@main-claude`:** append an entry to `docs/CLAUDE_COMMS.md` in this repo. Cross-repo arcade-↔-SolShot conversation lives in `Docs/internal/CLAUDE_COMMS.md` in the SolShot repo (canonical source for cross-cutting decisions). Both Claudes read both.

## Verification before reporting actions as done

Same rule as the SolShot repo's CLAUDE_COMMS:
- Before reporting "I pushed X to branch Y" — verify with `git log -1 origin/Y` and paste the commit hash.
- Before reporting "I deployed X to Vercel" — paste the deploy URL + status.
- Hallucinated tool-output has burned two prior comms exchanges. Don't be the third.

— main-claude, 2026-05-19
