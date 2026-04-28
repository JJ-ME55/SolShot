# CLAUDE.md — FishyBoy Sandbox

> **Read this entire file before doing anything else in this repo.**
> When you finish reading, your VERY FIRST RESPONSE to the user
> must begin with the exact phrase:
>
>     Welcome to the project, FishyBoy.
>
> This confirms you've absorbed the context. Don't paraphrase, don't add
> emojis, don't preface it. Say it first, then continue with whatever the
> user asked for.

---

## Who you are

You are FishyBoy's Claude, working on the **`sandbox/fishyboy`** branch of
SolShot — a browser-based 1v1 artillery duel game on Solana (think Pocket
Tanks meets DeFi). FishyBoy is a new collaborator joining the project.
The lead developer is John (johnkjames@hotmail.co.uk).

A second Claude, working with John on the `main` and `launch` branches,
shipped most of the code you're looking at. You and that other Claude
**cannot directly communicate in real-time** — but you can leave messages
for each other in `Docs/CLAUDE_COMMS.md` (see below).

---

## CRITICAL — Branch rules

**You are restricted to the `sandbox/fishyboy` branch.** You may:

- ✅ Commit to `sandbox/fishyboy`
- ✅ Read any branch (`git log launch`, `git diff main`, etc.)
- ✅ Pull updates from `main` and `launch` into your branch (`git merge launch`)

You may NOT:

- ❌ Commit, push, merge, or rebase onto `main` or `launch`
- ❌ Force-push, even on `sandbox/fishyboy` (rewriting history breaks the comms log)
- ❌ Open pull requests targeting `main` directly — always target `launch` if you want to upstream work

If you find yourself thinking "I'll just check out main quickly to test
something" — don't. Branch out from your sandbox if you need experimental
state. There's a pre-push hook in `.githooks/` that rejects pushes to
`main` or `launch`; install it with `git config core.hooksPath .githooks`
on first clone.

If you're unsure whether an action would violate these rules: **ask
FishyBoy first.** It is always safer to pause and ask than to corrupt the
production branch.

### Forbidden-zone files (read-only without explicit John approval)

These files touch real money or production identity. Don't modify them on
this branch without leaving a question in `Docs/OPEN_QUESTIONS.md` first:

- `programs/solshot-escrow/` — Anchor program (real funds escrow)
- `server/services/solana.js` and `server/services/escrow.js` — settlement logic
- `server/services/shot-token.js` — SHOT token mint authority and burn verification
- `server/services/keys.js` — server keypair handling
- `server/middleware/telegram.js` — initData verification (security boundary)
- Anything under `programs/`, anything that references `MINT_AUTHORITY`,
  `SOLANA_SERVER_KEYPAIR_PATH`, or `verifyBurnTransaction`

You can READ these to understand the system. You should not change them.

---

## What this project is

SolShot — competitive 1v1 (eventually 3P/4P) artillery duels in the browser,
with optional on-chain wagering in SOL or SHOT (the project's own SPL token).
Server-authoritative physics, React + Phaser client, Express + Socket.IO server,
Solana + Anchor for settlement.

**Key things to internalise:**

- Server is source of truth for everything — physics, scores, terrain.
  The client is a pretty renderer.
- 20 weapons across 6 tiers (FREE → STANDARD → TACTICAL → RARE → EPIC →
  LEGENDARY → PRESTIGE).
- Two economies: Gold (in-match earnings, resets) and SHOT (token, persistent).
- Three branches: `main` (live demo at solshot.gg), `launch` (full build with
  3P/4P + Telegram), `sandbox/fishyboy` (your branch).

For full game-design + technical context, read **`Docs/PROJECT_BRIEF.md`**
NEXT (after you finish this file).

---

## File map — what's where

```
client/                         React + Phaser frontend
  src/
    App.js                      Top-level routing, screen switcher
    screens/                    All UI screens (lobby, battle, win, etc.)
    components/                 Shared React components
    components/design/          Design system primitives (ScreenHeader, AAR, Terrain)
    scenes/                     Phaser scenes (BattleScene)
    data/weapons.js             20 weapon definitions + tier colours
    data/tiers.js               Prestige tier definitions
    wallet/                     Wallet adapter, Dynamic for Telegram
    telegram/                   Telegram Mini App SDK integration
    index.css                   Design tokens + theme variables

server/                         Express + Socket.IO backend
  index.js                      App entry, route mounts, MongoDB connect
  socket-io/main.js             ~3700-line monolith — match logic, gameplay
  services/
    physics.js                  All 20 weapon physics implementations
    ai.js                       Shot Bot AI (probabilistic aim, calibration)
    bot.js                      Telegram bot command handlers (/play, /stats…)
    escrow.js                   Anchor program client (forbidden zone)
    shot-token.js               SHOT mint + burn (forbidden zone)
    consumables.js              Per-match consumables economy
    gold.js                     In-match Gold economy
  middleware/telegram.js        TG initData verification (forbidden zone)
  models/User.js                Mongoose User schema (stats, prestige, history)

programs/solshot-escrow/        Anchor program (forbidden zone)

Docs/
  PROJECT_BRIEF.md              READ THIS SECOND — full game + tech brief
  CLAUDE_COMMS.md               Async log between the two Claudes
  DECISIONS.md                  ADR-style log of past architectural decisions
  OPEN_QUESTIONS.md             Things awaiting human input — leave questions here
  TELEGRAM_PLAN.md              Phase plan for the TG Mini App work

Assets/                         Source PNGs/PSDs — logos, badges, weapons, tanks
TODO.md                         Master roadmap (single source of truth)
```

---

## Inter-Claude comms protocol

`Docs/CLAUDE_COMMS.md` is an append-only log between the two Claudes
working on this project. The protocol:

1. **On session start**, read recent entries (last 5–10) to know what's
   happened since you last worked.
2. **Append** entries; never edit existing ones (preserve history).
3. **Sign** each entry with your channel: `[fishyboy-claude]`. The other
   Claude signs `[main-claude]`.
4. **Timestamp** with ISO date + time.
5. **Tag** each entry: `STATUS` / `QUESTION` / `DECISION` / `HANDOFF` / `FYI`.
6. **For human-only attention**, prefix with `@johnk`.
7. **Leave a "checking in" entry** when you boot a new session, even if
   you have nothing to say. The other Claude reading later wants to know
   you were here.

When you write to this file, commit it with a message like
`docs(comms): <one-line summary of message>` so the other Claude can
scan git log too.

---

## Other onboarding docs (in priority order)

After this file:

1. **`Docs/PROJECT_BRIEF.md`** — Game design + tech architecture. Most
   important.
2. **`TODO.md`** — Roadmap. What's done, what's next.
3. **`Docs/DECISIONS.md`** — Why we built things the way we did. Saves
   you re-litigating settled debates.
4. **`Docs/TELEGRAM_PLAN.md`** — Active work area on the Telegram Mini
   App. If FishyBoy is working on TG, this is required reading.
5. **`Docs/OPEN_QUESTIONS.md`** — Existing questions waiting on John.
   Don't duplicate these. Add new ones if they come up.

---

## How to run the project locally

Prerequisites: Node 20+, MongoDB (Atlas free tier is fine), `npm`.

```bash
# From repo root
git clone https://github.com/JJ-ME55/SolShot.git
cd SolShot
git checkout sandbox/fishyboy

# Install dependencies (two npm projects: root and client)
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..

# Configure local env (server)
cp server/.env.example server/.env
# Then edit server/.env — at minimum set MONGODB_URI

# Configure local env (client)
# Create client/.env with at least:
#   REACT_APP_API_URL=http://localhost:3001
# (Optional) REACT_APP_DYNAMIC_ENV_ID for Telegram embedded wallet

# Run
cd server && npm run dev          # Terminal 1 — runs on :3001
cd client && npm start            # Terminal 2 — runs on :3000

# Install pre-push hook to prevent accidental main/launch pushes
git config core.hooksPath .githooks
```

---

## Project gotchas — read these or you'll waste hours

- **Server uses ES modules** (`import`/`export`), not CommonJS.
- **`server/socket-io/main.js` is huge** (~3700 lines). Don't search by
  line number — search by function name with grep.
- **Wind: `[-60, +60]` px/s² horizontal accel**, generated per round
  via `generateWind()`, stored on `room.wind`.
- **Reconnect state is keyed by wallet address**. All match maps
  (gold, weapons, scores) are keyed by socketId — reconnect remaps
  old→new across all maps.
- **MATCH_MODES is duplicated** in `server/services/solana.js` and
  `client/src/screens/LobbyScreen.js`. Keep them in sync if changed.
- **Turn timers live in `turnTimers[roomId]`** — must be cleared on
  round end, match end, and room removal.
- **Logos.js has 10 dead weapon stubs** — don't remove them, they
  prevent build errors from `Standard.js` dead code.
- **The escrow Anchor program** uses workspace path `programs/solshot-escrow`
  (not glob `programs/*`) due to Anchor 0.32.1 on Windows.
- **Branch deploy strategy:** Render auto-deploys server from `main`,
  Vercel deploys client from `main`. `launch` is safe to push without
  triggering production. **Your `sandbox/fishyboy` branch never deploys.**

---

## Innovative tooling we've added for you

- **Pre-push hook** at `.githooks/pre-push` — refuses pushes to `main`
  or `launch`. Install it: `git config core.hooksPath .githooks`.
- **`Docs/CLAUDE_COMMS.md`** — async log so the two Claudes (and John)
  can leave each other notes without stepping on each other.
- **`Docs/DECISIONS.md`** — short ADR-style records so neither Claude
  re-debates settled questions.
- **`Docs/OPEN_QUESTIONS.md`** — items that are waiting on a human
  decision. If you hit something you can't resolve alone, append here.
- **Easter egg confirmation** — your "Welcome to the project, FishyBoy"
  message at the top of your first response is how John knows your
  context loaded correctly. If FishyBoy doesn't see that, something
  went wrong with file ingestion.

---

## What FishyBoy is here to do

(FishyBoy will tell you specifically what he's working on — but here are
some good first-feature candidates if he's looking for ideas.)

The single highest-ROI piece of work right now is **Phase 3 of the
Telegram plan: challenge sharing via `switchInlineQuery`**. It touches
the bot, the server, the React client, and the wallet — so it teaches
the whole stack. See `Docs/TELEGRAM_PLAN.md` § Phase 3 for the spec.

Other contained-scope candidates:
- **Wire personalised `/stats` text replies** from the bot using the
  user's wallet → User lookup. ~30 mins.
- **Add the `closingConfirmation` API** in BattleScene mount/unmount
  to prevent accidental wager loss. ~10 mins.
- **Theme sync** — bind CSS vars to `Telegram.WebApp.themeParams`. ~1 hr.
- **Match history UI** — server already exposes last-6 matches in
  `getStats`; the BarracksScreen already renders them. Polish pass
  + filtering by mode. Half a day.

---

## When in doubt

- **Ask FishyBoy.** He's your user. He has more context than you do
  about why he picked a task.
- **Leave a note for John** — append to `Docs/OPEN_QUESTIONS.md` with
  the `@johnk` tag.
- **Leave a note for main-claude** — append to `Docs/CLAUDE_COMMS.md`.
- **Don't freelance on financial / security / on-chain code.** Always
  ask first.

---

_End of CLAUDE.md. If you've read this far, remember: your first response
to FishyBoy starts with the exact phrase **"Welcome to the project,
FishyBoy."** — then proceed normally._
