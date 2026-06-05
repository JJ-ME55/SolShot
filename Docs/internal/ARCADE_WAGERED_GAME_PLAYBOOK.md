# THE ARCADE — Full Wagered Game Playbook

**From Fish's handover to live multiplayer wagering on thearcade.gg.**

> Audience: a Claude instance arriving cold in either the SolShot or The-Arcade repo, asked to take a new game from "Fish gave me a solo prototype" to "two real users in Telegram are wagering SOL on a match."
>
> Status as of 2026-06-05. Authoritative reference: this file, then `memory/MEMORY.md`, then the docs linked in §17. If those three disagree, **`MEMORY.md` wins** (it's updated session-to-session; this file is updated less often).
>
> Length warning: this is exhaustive on purpose. Skim §0–§3, then jump to the phase you're working on (§B/§C/§D).

---

## §0. Read this first (5-minute orient)

You're working on **The Arcade** — a multi-game arcade on Solana. Player flow:

1. User opens Telegram → finds `@TheArcadeGG_Bot` → types `/games`
2. Bot replies with one button per game (Basketball, Keepie Uppies, Free-Kicks, Pool, Critter Kart, …) plus `/solshot` for the flagship artillery game
3. Tapping a game opens `thearcade.gg/play/<slug>/launch?session=<JWT>` in TG's WebView (or "Open in Safari" if WebView misbehaves)
4. Game loads → user plays → score POSTs back to SolShot server → leaderboard updates
5. For wagered games: user authorises a deposit via Privy wallet → server creates an on-chain escrow → game finishes → server settles → 90 % to winner, 7 % treasury, 3 % ops

**Two repos, one backend:**

| Repo | What | URL | Hosting |
|---|---|---|---|
| `JJ-ME55/SolShot` | Express + Socket.io server, MongoDB, escrow glue, both bots, SolShot game client | https://github.com/JJ-ME55/SolShot | Render (`solshot.onrender.com`) |
| `JJ-ME55/The-Arcade` | Hub frontend + every non-SolShot game (Vite/CRA monorepo with branch isolation) | https://github.com/JJ-ME55/The-Arcade | Vercel (`thearcade.gg`) |

The SolShot game itself is hosted at `www.solshot.gg` (separate Vercel project on JJ's account, deployed from `JJ-ME55/SolShot`'s `client/` directory). The two `gg` domains are intentional: SolShot is the flagship and keeps its own brand; everything else lives under `thearcade.gg`.

**Two Telegram bots, one Node process:**

| Bot | Handle | Purpose | Token env |
|---|---|---|---|
| SolShot bot | `@SolShotGG_bot` | Group-chat artillery matches, escrow flows | `TELEGRAM_BOT_TOKEN` |
| Arcade bot | `@TheArcadeGG_Bot` | Multi-game launcher, leaderboards, per-game session minters | `ARCADE_BOT_TOKEN` |

Both run as separate `Telegraf` instances inside the SolShot Express process. Different webhook paths (`/api/telegram-webhook` vs `/api/arcade-webhook`), different command sets, no shared state.

**Three tiers of game** (the "V3 Arcade Economy" model — see §17):

1. **Tier 1 — Solo skill / leaderboard** (Basketball, Keepie Uppies, Free-Kicks). Single-player. Score → JWT'd POST → Mongo leaderboard. No multiplayer infra, no escrow.
2. **Tier 2 — Server-authoritative multiplayer** (Critter Kart, future 8-Ball Pool). Lobby + race rooms, 60 Hz physics on server, 20 Hz snapshots to clients.
3. **Tier 3 — Multiplayer + wagered** (SolShot, future Pool, future Critter Kart). Tier 2 plus on-chain escrow deposit + settle.

**The path you're walking:** Phase A (handover) → Phase B (Tier 1 leaderboard) → Phase C (Tier 2 multiplayer) → Phase D (Tier 3 wagering). Each phase is described in §A–§D below.

**Hard rules JJ has stated explicitly** (do not negotiate these):

1. **"Front-end gameplay, feel, loading, effects, speed, all of that IDENTICAL"** — when porting Fish's solo client to multiplayer, you do NOT touch the gameplay layer. Server-side wiring only. Local kart physics, local input handling, local audio: untouched.
2. **No SHOT on-chain in V1.** SHOT is a closed in-game currency. Pump.fun is abandoned, not deferred. See `MEMORY.md` → "SHOT pivot (2026-05-26)".
3. **Mainnet wagered is SOL only** (V1 scope). Tickets/SHOT wagering is a V3 conversation, blocked on `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md` resolution.
4. **JJ leads now.** No more handing the whole architecture to Fish to refactor.

---

## §1. The big picture (architecture)

```
┌───────────────────────────────────────────────────────────────────┐
│                          USER FLOW                                │
│                                                                   │
│  Telegram ──> Bot button ──> thearcade.gg/play/<slug>/launch?…    │
│                                              │                    │
│                                              ▼                    │
│                                  Game client (per-game Vercel)    │
│                                  │                                │
│        ┌─────────────────────────┤                                │
│        │                         │                                │
│        ▼                         ▼                                │
│  Socket.io (multiplayer)    HTTPS POST (score)                    │
│        │                         │                                │
│        └────────────┬────────────┘                                │
│                     ▼                                             │
│         solshot.onrender.com (SolShot Express)                    │
│                     │                                             │
│        ┌────────────┼────────────┐                                │
│        ▼            ▼            ▼                                │
│      Mongo       Solana RPC    Telegram                           │
│   (Atlas)        (Helius)      (webhook in)                       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Frontend hosts** (each is a separate Vercel project on JJ's account):

| Game | Vercel project | Domain | Source |
|---|---|---|---|
| SolShot (artillery) | `sol-shot` | `www.solshot.gg` | `JJ-ME55/SolShot` (client/ subdirectory) |
| Basketball Hoops | `sol-shot-basketball` | `sol-shot-basketball.vercel.app` (legacy fallback) + `thearcade.gg/play/basketball/launch` (canonical) | `JJ-ME55/The-Arcade` main branch |
| Keepie Uppies | `sol-shot-keepie-uppies` | same pattern | `JJ-ME55/The-Arcade` main branch |
| Free-Kick Madness | `solshot-free-kicks` | `solshot-free-kicks-iota.vercel.app` (legacy fallback) + `thearcade.gg/play/free-kicks/launch` | `JJ-ME55/solshot-free-kicks` (fork of `BillionaireBonkClub/solshot-free-kicks`) |
| Critter Kart | `the-arcade-critter-kart` (preview) + main hub | `the-arcade-critter-kart.vercel.app/play/critter-kart/launch` (preview while testing) | `JJ-ME55/The-Arcade` `arcade/critter-kart` branch |
| 8-Ball Pool | `the-arcade-pool` | TBD `thearcade.gg/play/pool/launch` | separate dir `C:\Users\johnk\The-Arcade-git\pool\` per `MEMORY.md`; not yet wired to hub |

**Backend** is `solshot.onrender.com` (single Render web service). Two of everything (two bots, two webhook paths, two slash-command registries) but one Node process, one Mongo connection, one Solana connection.

**Storage** is MongoDB Atlas (connection string in `MONGODB_URI` Render env var). One database, per-game collections (`basketballscores`, `keepieuppiesscores`, `freekicksscores`, `poolscores`, `critterkartraces`, `critterkartlobbies`, `critterkartqueues`, `critterkartcareers`, …).

**On-chain** is Solana mainnet for SolShot escrow v2 (program ID + multisigs in §D). Devnet was decommissioned for SolShot but is still where Critter-Kart/Pool wagering will land first before mainnet.

---

## §2. Repository layout

### SolShot (`JJ-ME55/SolShot`)

```
SolShot/
├── client/                     # SolShot game client (CRA + Phaser)
│   └── src/
├── server/                     # Express + Socket.io + Mongo + bots
│   ├── index.js                # entrypoint, route mounting, rate-limit setup
│   ├── socket-io/
│   │   ├── main.js             # SolShot artillery sockets + GLOBAL rate limiter
│   │   ├── critter-kart.js     # Critter-Kart lobby + race sockets
│   │   └── pool.js             # Pool sockets (in progress)
│   ├── services/
│   │   ├── bot.js              # SolShot bot (@SolShotGG_bot)
│   │   ├── arcadeBot.js        # Arcade bot (@TheArcadeGG_Bot) — GAMES registry lives here
│   │   ├── escrow.js           # v1 escrow (devnet-only, mostly stub)
│   │   ├── escrow-v2.js        # v2 escrow (mainnet live)
│   │   ├── solana.js           # delegates to escrow services + Privy bridge
│   │   ├── shot-token.js       # SHOT token glue (off-chain in V1)
│   │   ├── poolEscrow.js
│   │   ├── poolRewards.js
│   │   └── games/              # per-game services (one dir per game)
│   │       ├── basketball-standalone/
│   │       ├── keepie-uppies-standalone/
│   │       ├── free-kicks-standalone/
│   │       ├── pool/
│   │       └── critter-kart/   # has the latest server-authoritative pattern
│   │           ├── lobbyService.js
│   │           ├── lifecycle.js
│   │           ├── matchmaking.js
│   │           └── sim/
│   │               ├── runner.js   # 60 Hz tick + 20 Hz snapshot emitter
│   │               ├── tuning.js
│   │               ├── physics.js
│   │               ├── trackPath.js
│   │               └── sunnyMeadow.js
│   ├── models/                 # Mongoose schemas
│   │   ├── CritterKartRace.js
│   │   ├── CritterKartLobby.js
│   │   ├── CritterKartQueue.js
│   │   ├── CritterKartCareer.js
│   │   ├── BasketballScore.js
│   │   └── …
│   ├── idl/
│   │   ├── solshot_escrow.json     # v1 IDL
│   │   └── solshot_escrow_v2.json  # v2 IDL (mainnet)
│   └── scripts/
│       └── init-config.mjs     # one-shot escrow-config bootstrap
├── Docs/                       # public docs + this file under internal/
└── memory/MEMORY.md            # project memory — read first when arriving cold
```

### The-Arcade (`JJ-ME55/The-Arcade`)

```
The-Arcade/
├── src/
│   ├── App.tsx                 # hub router (/play/<slug>/* → game mount)
│   ├── games/
│   │   ├── basketball/         # game implementation per slug
│   │   ├── keepie-uppies/
│   │   ├── free-kicks/         # Vite + Three.js, lifted from fork
│   │   ├── pool/
│   │   └── critter-kart/       # Three.js, Fish's solo build + new multiplayer wiring
│   │       ├── App.tsx         # screen router (title / mp-menu / mp-lobby / race / …)
│   │       ├── GameCanvas.tsx  # the rAF loop + Three.js scene
│   │       ├── net/
│   │       │   ├── client.ts   # socket.io NetClient + race-input/snapshot API
│   │       │   ├── identity.ts # JWT decode from sessionStorage
│   │       │   └── protocol.ts # wire types
│   │       └── game/
│   │           └── multiplayer/context.tsx  # MultiplayerProvider + useMultiplayerSync
│   └── ui/                     # hub-level chrome (NOT per-game)
├── public/
│   └── critter-kart/           # game assets served verbatim
└── package.json
```

Each game lives on its own branch (`arcade/<slug>`) while in development. Promoted to `main` once stable. `main` deploys to `thearcade.gg`; branches deploy to per-branch Vercel preview URLs.

### Per-game external repos (when used)

Two of the live games came in as forks rather than branches in the monorepo:

- `JJ-ME55/solshot-free-kicks` — fork of `BillionaireBonkClub/solshot-free-kicks`. Vite + Three.js. Lifted *into* The-Arcade's `src/games/free-kicks/` at some point; the fork still exists as the legacy fallback URL.
- `JJ-ME55/critter-kart` (was `BillionaireBonkClub/critter-kart`, lifted by Fish into The-Arcade's `arcade/critter-kart` branch).

**Decision (still open)**: monorepo vs per-game repos. Currently monorepo with branch isolation works fine; free-kicks broke the assumption without issue. Don't fight it either way — adapt to what's already in flight for the game you're working on.

---

## §3. The 4-phase model

The diagram in §1 collapses into this build sequence for *any* new game:

```
PHASE A — Handover
  ↓
PHASE B — Leaderboard (Tier 1)
  ↓
PHASE C — Multiplayer (Tier 2)
  ↓
PHASE D — Wagering   (Tier 3)
```

Most games stop at Tier 1 forever (Basketball, Keepie Uppies, Free-Kicks). A few graduate to Tier 2 (Critter Kart) and eventually Tier 3 (Pool, future Critter Kart).

**You do not skip phases.** Phase B has to be solid before Phase C; Phase C has to be solid before Phase D. The escrow flow assumes the multiplayer flow can identify winners reliably; if Phase C produces flaky finish events, Phase D will settle wrong on-chain.

---

## §A. Phase A — receive Fish's handover

### What "handover" looks like

Fish typically hands over:
- A repo (his fork, or a branch you should pull into The-Arcade)
- A README or message describing what's playable solo
- A build command (`npm run dev`, `vite`, `npm start`, varies by stack)
- An asset graph (sometimes 50–100 MB of GLB/PNG/MP3)

He does **not** typically hand over: multiplayer netcode, server hooks, escrow wiring, JWT plumbing. That's all you.

### Verification gate before you touch anything

Before you change a single line:

1. Clone the handover repo. Build locally. Confirm it runs solo and is playable.
2. Note the **stack** (CRA / Vite / Phaser / Three.js / Pixi). Free-Kick Madness broke the "Phaser-only" assumption — multi-stack is now accepted but means template-copy doesn't always apply.
3. Note the **asset weight**. Anything above ~30 MB will be slow on TG WebView and needs a plan (lazy-load? CDN? compression? worth the effort?).
4. Note any **third-party deps** that need server-side keys (Three.js: none. Privy: yes. Phaser: none. Web Audio: none.).

### JJ's non-negotiable

> "FRONT END_ gameplay, feel, loading, effects, speed, all of that IDENTICAL (non negotiable)"

When porting Fish's solo build to multiplayer (Phase C), you may need to add a network sync layer next to his physics. **Add — do not modify.** The local single-player code path must remain byte-equivalent. The Critter-Kart approach was: keep Fish's `stepKart` loop running for every kart locally; on each rAF tick, *overwrite* the position+heading of the remote karts from the latest server snapshot.

Pattern in code (`The-Arcade/src/games/critter-kart/GameCanvas.tsx` ~ line 624):

```tsx
const mp = multiRef.current;
if (mp) {
  try {
    mp.sendInput({ steer, throttle, brake, drift });
    const snap = mp.latestSnapshot;
    if (snap) {
      for (let i = 0; i < NUM; i++) {
        if (i === mp.selfSlot) continue; // local kart stays locally driven
        const k = mp.applyToSlot(i);
        if (!k) continue;
        states[i] = { ...states[i], x: k.x, z: k.z, heading: k.heading, /* … */ };
      }
    }
  } catch (e) { /* degrade to solo render, don't kill rAF */ }
}
```

The `try/catch` is mandatory: if the network layer throws (schema drift, missing method), the rAF loop must continue with solo rendering, not freeze. We hit a freeze-at-4 %-loading bug 2026-06-05 because a missing method on the network client threw inside the rAF tick and killed the entire render loop. Commit `4155efeca` in The-Arcade.

### Hand-off checklist

- [ ] Build runs locally
- [ ] Single-player game is playable end-to-end
- [ ] Asset weight noted; mobile-acceptable
- [ ] Stack noted; matches existing pattern OR a justified exception
- [ ] No new server-side dependencies (or they're identified and you have a plan)
- [ ] You can find the entry component, the render loop, and the score-emit point

---

## §B. Phase B — leaderboard (Tier 1)

This is the smallest possible "live game" — single-player, scoreable, ranked. Everything else builds on this.

### The full Tier-1 flow

```
TG /games tap
  ↓
arcadeBot.js handler builds button with login_url (DM) or url (group)
  ↓
button payload: thearcade.gg/play/<slug>/launch?session=<JWT>
  ↓
JWT is minted by per-game sessionMinter() in arcadeBot.js
  ↓
JWT is signed against <GAMESLUG>_LEADERBOARD_SECRET (Render env var)
  ↓
Client loads, decodes JWT from window.location.search, stashes in sessionStorage as 'arcade_session'
  ↓
Player plays, game ends
  ↓
Client POSTs { score, jwt } to /api/games/<slug>/score
  ↓
Server route verifies JWT, calls game's submitScore() → Mongo upsert
  ↓
Bot /leaderboard reads top-N from same Mongo collection
```

### Step-by-step

**B.1. Vercel project setup**

If using The-Arcade monorepo:
1. Create new branch `arcade/<slug>` from `main`.
2. In Vercel dashboard, create new project, point at the branch. **DO NOT** add the new game's domain to an existing project (the 2026-05-15 near-miss flipped `www.solshot.gg` to Basketball for ~10 minutes because two domains shared one Vercel project).
3. Environment variables required on Vercel project:
   - `CI=false` — CRA treats warnings as errors otherwise; existing unused-import lints kill the build
   - `NODE_OPTIONS=--max-old-space-size=4096` — if the game has heavy build (Three.js tree-shake)
4. Set production branch = `arcade/<slug>` (NOT `main`) while in development.

If using a fork:
1. Fork the source repo into `JJ-ME55/<repo-name>`.
2. New Vercel project pointed at the fork.
3. Same env vars as above.

**B.2. Server-side leaderboard service**

Best template to copy: `server/services/games/keepie-uppies-standalone/`. It has:
- `routes.js` — Express router with `/score`, `/leaderboard`, `/standing/:tgId`
- `sessionMinter.js` — JWT mint + verify helpers
- `scoreModel.js` — Mongoose model (or imports from `server/models/`)
- `README.md` — what's in each file and why

Copy that whole directory into `server/services/games/<slug>-standalone/`. Rename internals. The contract is:

```js
// sessionMinter.js
export function mintXSession({ telegramUserId, telegramUsername, firstName }) {
  return jwt.sign(
    { tg: telegramUserId, un: telegramUsername, fn: firstName, iss: 'arcade-bot:<slug>' },
    process.env.<GAMESLUG>_LEADERBOARD_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyXSession(token) {
  return jwt.verify(token, process.env.<GAMESLUG>_LEADERBOARD_SECRET);
}
```

```js
// routes.js
router.post('/score', async (req, res) => {
  try {
    const { jwt: token, score } = req.body;
    const claims = verifyXSession(token);
    await submitScore({ telegramUserId: claims.tg, displayName: claims.un || claims.fn || 'Player', score });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'invalid_session' });
  }
});

router.get('/leaderboard', async (req, res) => {
  const top = await getLeaderboard({ limit: Number(req.query.limit) || 10 });
  res.json({ entries: top });
});

router.get('/standing/:tgId', async (req, res) => {
  const standing = await getStanding({ telegramUserId: Number(req.params.tgId) });
  res.json({ standing });
});
```

Mount the router in `server/index.js` under `/api/games/<slug>`.

**B.3. JWT secret**

Generate a 48-byte base64url secret. On Linux:

```bash
openssl rand -base64 48 | tr '+/' '-_' | tr -d '='
```

Add to Render web service environment as `<GAMESLUG>_LEADERBOARD_SECRET`. Trigger redeploy. **DO NOT** commit this anywhere.

**B.4. CORS**

The `CORS_ORIGINS` env var on Render is a comma-separated list of allowed origins. Append your new Vercel URL(s) AND the canonical `https://thearcade.gg`. Example:

```
CORS_ORIGINS=https://www.solshot.gg,https://thearcade.gg,https://sol-shot-basketball.vercel.app,https://sol-shot-keepie-uppies.vercel.app,https://solshot-free-kicks-iota.vercel.app,https://the-arcade-critter-kart.vercel.app
```

Append yours. Redeploy.

**B.5. Bot registry**

Edit `server/services/arcadeBot.js`. Add an entry to `GAMES`:

```js
{
  slug: '<slug>',                 // no hyphens — TG strips them from slash commands
  name: '<Game Name>',
  emoji: '🎲',
  tagline: '<one-line description>',
  url: 'https://thearcade.gg/play/<slug>/launch',
  supportsLoginUrl: false,        // see §13 — keep this false unless you understand
  sessionMinter: (ctx) => mintXSession({
    telegramUserId: ctx.from?.id,
    telegramUsername: ctx.from?.username,
    firstName: ctx.from?.first_name,
  }),
},
```

And an entry in `LEADERBOARDS`:

```js
<slug>: {
  emoji: '🎲',
  title: '<GAME NAME>',
  getLeaderboard: getXLeaderboard,
  getMyStanding: getXStanding,
  launchCmd: '/<slug>',
},
```

Slash-command registration is handled automatically by `arcadeBot.js` based on the registry — see the `[arcade-bot] slash commands registered:` log line on boot.

**B.6. Client integration**

The client needs to:
1. Decode the JWT from URL on boot, stash in `sessionStorage` as `arcade_session`.
2. POST score on game-over with the JWT.
3. Retry-on-boot if the POST failed (network drop on TG WebView is common — score lives in `localStorage` until next boot).

Boot code (every game has some version of this — copy from keepie-uppies):

```js
// boot.js
const params = new URLSearchParams(window.location.search);
const session = params.get('session');
if (session) sessionStorage.setItem('arcade_session', session);

// retry stash from last session
const stash = localStorage.getItem('<slug>_unsent_score');
if (stash) {
  fetch(API + '/score', { method: 'POST', headers: {'Content-Type':'application/json'}, body: stash })
    .then(r => r.ok && localStorage.removeItem('<slug>_unsent_score'))
    .catch(() => { /* try next boot */ });
}
```

Submit code (on game-over):

```js
const jwt = sessionStorage.getItem('arcade_session');
const body = JSON.stringify({ jwt, score });
try {
  const r = await fetch(API + '/score', { method:'POST', headers:{'Content-Type':'application/json'}, body });
  if (!r.ok) localStorage.setItem('<slug>_unsent_score', body);
} catch (e) {
  localStorage.setItem('<slug>_unsent_score', body);
}
```

**B.7. Hub routes (The-Arcade)**

Add to `The-Arcade/src/App.tsx` (or whatever the hub router is):

```tsx
<Route path="/play/<slug>" element={<GameDetailPage slug="<slug>" />} />
<Route path="/play/<slug>/launch" element={<GameLaunch slug="<slug>" />} />
```

`/play/<slug>` is the editorial / wager-slip / how-to-play page (Phase 2 IA flip, 2026-05-28). `/play/<slug>/launch` mounts the actual game canvas. Bot users skip the detail page and land directly on launch.

**B.8. Anti-patterns that will bite you**

Compiled from the 4 live Tier-1 games' history. **Read these once, internalise them.**

- **NO service worker.** CRA's default SW caches HTML/JS too aggressively; hotfixes get blocked for hours per device. Delete `serviceWorker.register()` from your entrypoint.
- **safeAudio wrapper around EVERY `play*` export.** Web Audio is fragile on mobile; an unhandled throw inside an audio function terminates the entire render loop. Wrap each in `try/catch`.
- **Touch input MUST have stale-pointer tracking.** The basketball "stuck-bug" Fish chased for days was a multi-pointer trap where pointerup fired for a different finger than pointerdown.
- **TG slash commands strip hyphens.** Your Vercel URL can be `sol-shot-keepie-uppies.vercel.app` and that's fine, but the bot slug is `keepieuppies` (no hyphens), and the URL path component on `thearcade.gg/play/<...>/launch` should use the hyphenated form (`/play/keepie-uppies/launch`) to keep human-readable URLs. The bot maps slug → URL, so the user never sees the slug.
- **Append the new Vercel URL to `CORS_ORIGINS`** on Render or all cross-origin POSTs (score, leaderboard read) fail silently.

### Tier-1 done. Push to main when stable, flip `arcade/<slug>` → `main` in Vercel.

---

## §C. Phase C — multiplayer (Tier 2)

This is where most games will stop. Server-authoritative because we're building toward Tier 3 (wagered): you can't pay out on-chain based on client-reported "I won." The server has to know.

### Architecture decision (already made)

**Server-authoritative. Period.** Fish's first instinct was usually relay (clients send positions, server forwards). That works for Discord-grade casual multiplayer; it does not work for wagered. Anyone with a debugger can edit their `position.x` before the relay broadcast and "win."

The pattern, from Critter Kart:
- Client emits **inputs** at 30 Hz (steer, throttle, brake, drift)
- Server runs **authoritative physics** at 60 Hz (using a port of Fish's solo physics code)
- Server emits **snapshots** at 20 Hz (kart positions, headings, item state, lap progress)
- Client renders **own kart from local prediction** (Fish's existing physics, instant feedback)
- Client renders **other karts from server snapshots** (smooth but trailing by ~50 ms)
- V1 has no reconciliation. V2 adds input rewind-and-replay if the server-vs-local divergence becomes noticeable.

### Mongo schemas you'll need

Two new models per game:

**`<Game>Lobby`** — private rooms before matchmaking dispatches. Template: `server/models/CritterKartLobby.js`. Key fields:
- `lobbyId` (string, unique)
- `host` (Number, telegramUserId)
- `members` (subdoc array: telegramUserId, displayName, ready, joinedAt, socketId)
- `pending` (array of join requests awaiting host approval)
- `cap` (Number, e.g. 6 for Critter Kart, 2 for 1v1 games)
- `status` (`'open' | 'starting' | 'closed'`)
- `lastActiveAt` (Date, with TTL index for auto-cleanup of dead lobbies)

**`<Game>Race` / `<Game>Match`** — the active match. Template: `server/models/CritterKartRace.js`. Key fields:
- `raceId` / `matchId` (string, unique)
- `state` (state machine: `'matched' | 'loading' | 'countdown' | 'racing' | 'finished' | 'settled' | 'cancelled'`)
- `format` (laps / time-limit / scoring constants)
- `players` (subdoc array — see Critter Kart for the standard shape: telegramUserId, displayName, kartId, racerId, isBot, socketId, joinedAt, readyAt, finishPosition, finishTimeMs, status, pointsAwarded)
- `wager` (subdoc with `lamports` + `escrowMatchId` — null in Tier 2, populated in Tier 3)
- `inputLog` (Mixed; null in V1, populated when replay storage lands)
- Lifecycle timestamps: `createdAt`, `matchedAt`, `loadingStartedAt`, `countdownStartedAt`, `racingStartedAt`, `endedAt`, `settledAt`

**Optional `<Game>Queue`** (for quick-match): single doc per pending player, TTL'd.

**Optional `<Game>Career`** (for cross-match aggregates like Mario Kart Grand Prix points). Template: `server/models/CritterKartCareer.js`.

### Server services

Mirror the structure in `server/services/games/critter-kart/`:

```
server/services/games/<game>/
├── lobbyService.js   # createLobby, requestJoin, decideRequest, setReady, markStarting, leaveLobby, toLobbyStateWire, toLobbySummaryWire
├── lifecycle.js      # createMatchFromLobby, registerReady, beginCountdown, beginPlaying, finishMatch, settleMatch, cancelMatch
├── matchmaking.js    # enqueue, dequeue, ticker that pairs players from queue → createMatch
└── sim/
    ├── runner.js     # the actual physics tick orchestrator
    ├── tuning.js     # physics constants — copy Fish's solo file BYTE-FOR-BYTE
    ├── physics.js    # the per-tick physics function — copy Fish's
    ├── collision.js  # ditto
    └── trackData.js  # whatever level/map data Fish has
```

The `runner.js` is the part you'll write. The rest is Fish's code, lifted out of the client into Node.

### Socket events (canonical names)

Use these exact names — the client templates and rate-limiter exemptions assume them:

**Client → server:**

| Event | Payload | Frequency | Notes |
|---|---|---|---|
| `lobby:list` | `{}` | on demand | browse |
| `lobby:create` | `{ name, cap }` | on demand | |
| `lobby:join` | `{ lobbyId }` | on demand | |
| `lobby:decision` | `{ requestId, accept }` | on demand | host approves/declines |
| `lobby:ready` | `{ lobbyId, ready }` | on demand | |
| `lobby:start` | `{ lobbyId }` | on demand | host triggers |
| `lobby:leave` | `{ lobbyId }` | on demand | |
| `match:enqueue` | `{ telegramUserId, telegramUsername, firstName }` | on demand | quick-match |
| `match:cancel` | `{ telegramUserId }` | on demand | |
| `<game>:joinRace` | `{ raceId, telegramUserId }` | once per race | **CRITICAL — see Gotcha §C.5** |
| `<game>:ready` | `{ raceId, telegramUserId }` | once per race | client signals scene loaded |
| `<game>:leave` | `{ raceId, telegramUserId }` | once per race | clean exit |
| `race:input` (or `<game>:input`) | `{ raceId, kartId, seq, steer, throttle, brake, drift }` | 30 Hz | **MUST be in `RL_EXEMPT_EVENTS` — see Gotcha §C.6** |

**Server → client:**

| Event | Payload | Frequency | Notes |
|---|---|---|---|
| `lobby:listing` | `{ lobbies: [LobbySummary] }` | on lobby browse | |
| `lobby:created` | `{ lobby: LobbyState }` | on create | |
| `lobby:state` | `{ lobby: LobbyState }` | on any change | broadcast to lobby room |
| `lobby:joinRequest` | `{ lobbyId, requestId, username }` | per join | DM to host |
| `lobby:joined` | `{ lobby: LobbyState }` | per join | DM to joiner |
| `lobby:declined` | `{ lobbyId, reason }` | per reject | DM to joiner |
| `lobby:closed` | `{ lobbyId, reason }` | on close | ⚠️ **never emit alongside `race:start` in same batch** — see Gotcha §C.7 |
| `match:queued` | `{ ticketId, waitMs, positionInQueue, totalInQueue }` | every queue tick | |
| `match:found` | `{ raceId, launchUrl, players, format }` | per match | |
| `race:start` | `{ roomId, startAtMs, members }` | once per race | sent to lobby room |
| `race:state` | `{ raceId, state, players, format, reconnected, disconnected, graceMs }` | on transition | |
| `race:countdown` / `<game>:countdown` | `{ seconds: 3 \| 2 \| 1 \| 0 }` | 4 emits | |
| `race:snapshot` | `{ raceId, tick, tMs, karts: [KartSnapshot] }` | 20 Hz | broadcast to race room |
| `race:final` / `<game>:final` | `{ raceId, reason, positions, careerUpdates }` | once per race | |
| `race:error` / `<game>:error` | `{ event, reason, detail }` | per error | |

### Server-side broadcasting pattern

```js
// in server/socket-io/<game>.js
const raceRoomName = (raceId) => `<game>:race:${raceId}`;

function broadcastToRace(io, raceId, event, payload) {
  io.to(raceRoomName(raceId)).emit(event, payload);
}

// in the client's joinRace handler:
client.on('<game>:joinRace', async ({ raceId, telegramUserId }, ack) => {
  // … validate membership …
  client.join(raceRoomName(raceId));
  // … push current state to joiner …
});
```

### Client-side network client (lift the Critter-Kart pattern)

`The-Arcade/src/games/critter-kart/net/client.ts` is the canonical implementation. Key points:

1. **Single socket per session**, shared between lobby UI and race-input/snapshot stream.
2. **Auth via JWT** in `socket.io` handshake `auth` object: `{ telegramUserId, telegramUsername, firstName, sessionJwt, game: '<slug>' }`.
3. **The NetClient interface exposes both lobby + race APIs**: `emit/on` for lobby, `sendInput/getLatestSnapshot` for race. Earlier (pre-2026-06-05) these lived on a separate `CritterKartNet` class and the lobby flow accidentally passed the lobby `NetClient` where the race `CritterKartNet` was expected; the rAF tick called `ctx.net.sendInput(...)` → `TypeError` → entire render loop dies → loading bar freezes at 4%. **Unify them.** One client class, both APIs.
4. **race:snapshot is cached in the proxy listener**, exposed via `getLatestSnapshot()`. GameCanvas's rAF reads this directly without subscribing through the dispatch map.

### Identity

`net/identity.ts` decodes the JWT from `sessionStorage['arcade_session']` and returns `{ telegramUserId, telegramUsername, firstName, sessionJwt, username }`. Cached after first call. Falls back to URL `?u=<username>` then to `localStorage` then to a dev `prompt()` for local development.

### The lobby → race transition

Concretely, what happens between "host taps Start" and "rAF loop is reading snapshots":

1. Host emits `lobby:start { lobbyId }`
2. Server validates host owns the lobby, calls `lifecycle.createMatchFromLobby({ lobbyId })` which:
   - Marks lobby `status: 'starting'`
   - Creates `<Game>Race` doc with players from lobby + bot fill if cap not met
   - Returns the new `raceId`
3. Server emits `race:start { roomId: raceId, startAtMs, members }` to the **lobby room** (`io.to(lobbyRoomName).emit(...)`)
4. Every client receives `race:start`. App.tsx's `startMpRace(roomId, startAtMs, members)`:
   - Picks up `selfMember` from members (match by username — **see Gotcha §C.8 if same TG user opens on two devices**)
   - Sets the local racer ID from server assignment
   - Builds `kartIdToSlot` map
   - **Emits `<game>:joinRace` to bind the socket to the race broadcast room** (this is the bug we hit; see §C.5)
   - Sets `MultiplayerRace` context state with `selfSlot, selfKartId, members, net, kartIdToSlot`
   - Transitions screen to 'race'
5. Race screen mounts. GameCanvas effect runs. Three.js scene setup. Asset loader queues GLBs. rAF loop starts.
6. Server's `runCountdownAndRace` starts:
   - 3-2-1 countdown emits to race room
   - `RaceRunner` spawns, ticks at 60 Hz, emits snapshots at 20 Hz
   - rAF loop reads `mp.latestSnapshot`, applies remote-kart positions to local `states[]` array
7. Race plays out. Local kart driven by Fish's physics + local input. Remote karts driven by snapshots.
8. Finish line crossed → `RaceRunner.onFinish` → `lifecycle.finishMatch` → `lifecycle.settleMatch`
9. Server emits `race:final` with positions, career updates
10. Client transitions to results screen

### §C.5 Gotcha — joinRace MUST be emitted

The server's `broadcastToRace(io, raceId, 'race:snapshot', snap)` fans out to `io.to('<game>:race:'+raceId).emit(...)`. The socket is added to that room **only when the client emits `<game>:joinRace`** and the server-side handler calls `client.join(raceRoomName(raceId))`. The old matchmaking flow (`MultiplayerLayer.tsx`) emitted joinRace; the new lobby-based flow added in this session bypassed it. Result: snapshots fired into rooms with zero subscribers; each client fell back to running Fish's local 6-kart sim independently.

**The fix:** in App.tsx after receiving `race:start`, before `go('race')`:

```ts
const ident = await getArcadeIdentity();
if (ident?.telegramUserId) {
  net.emit('<game>:joinRace', { raceId: roomId, telegramUserId: ident.telegramUserId });
}
```

The-Arcade commit `287ba8a4d` (2026-06-05).

### §C.6 Gotcha — `race:input` MUST be exempt from rate limiter

`server/socket-io/main.js` has a global per-socket rate limiter:

```js
const RL_MAX_EVENTS = 30          // events / sec
const RL_DISCONNECT_MULT = 3      // disconnect at 3× limit for 5 seconds
```

30 Hz input + any other event = over the cap → drop → 90 drops in 3 seconds → server severs the socket. Critter Kart hit this 2026-06-05 with the symptom "both sockets DISCONNECTED 5 seconds after race created → reconnect grace → DNF."

**The fix:** `race:input` (and any other 30+ Hz event) goes in the `RL_EXEMPT_EVENTS` set inside `client.onevent`. Hot-path bypass: skip the cap entirely AND skip writing to the ring buffer (so the exempt event doesn't push others out either). SolShot commit `2cc4142` (2026-06-05).

If you add a new high-frequency event for a different game, **add it to the exempt set in main.js**. Don't try to raise `RL_MAX_EVENTS` globally — that weakens the abuse protection for SolShot's fire/createRoom paths.

### §C.7 Gotcha — never emit `lobby:closed` alongside `race:start`

When the host taps Start, your instinct is to:
1. Emit `race:start` to the lobby room
2. Emit `lobby:closed` to the lobby room (lobby is now defunct)

In React state, both events arrive in the same event-loop tick. `setState({ raceStartPayload })` triggers race screen mount; `setState({ lobbyClosed: true })` triggers menu redirect. The latter wins because React batches; user gets dumped back to the menu, race never renders.

**Fix:** don't emit `lobby:closed` in the lobby→race transition. The lobby document is internally marked closed; clients are now in the race room and don't need a "lobby went away" signal. Emit `lobby:closed` only when the lobby is *abandoned* (host left before start).

### §C.8 Gotcha — username matching breaks with same TG account on two devices

In `App.tsx::startMpRace`:

```ts
const me = net.username();
const selfMember = members.find((m) => m.username === me);
```

If two devices open the link with the same Telegram account (e.g. the developer testing solo), both clients have identical `username`. `Array.find` returns the first match → both clients think they're slot 0 → both clients skip slot 0 in the snapshot-apply loop → neither sees a synced other player.

**For a clean 2-human test you need:**
- Two different TG accounts, OR
- A bots-only race (you + 5 bots) to validate snapshots flow without the identity collision

**Long-term fix (not yet shipped):** server should emit `selfSlot` per-socket on `race:start` since the server knows which socket belongs to which slot. Client trusts the server's assignment instead of guessing via username.

### §C.9 Reconnect grace + AI takeover

Wagered-grade requirement: if a player disconnects mid-match, they get a grace window to reconnect. If they don't, an AI takes over their kart so the other players can finish the race and settle on-chain. SolShot does this with disconnect timers in `server/socket-io/main.js`; Critter Kart does it in `server/socket-io/critter-kart.js` with `reconnect grace started → reconnect grace expired → DNF → convertKartToBot`.

Pattern:
- On disconnect, start a 30 s grace timer keyed by `telegramUserId`
- If a new socket connects with the same `telegramUserId` within the window, remap state; cancel the timer
- If the timer expires, mark player DNF, call `runner.convertKartToBot(kartId)` so the kart keeps moving on AI
- Broadcast `race:state` with `{ disconnected: tgId, graceMs }` so other clients can show a HUD indicator

### §C.10 Verbose logging during testing

When debugging a multiplayer flow, sprinkle pino logs liberally:

```js
logger.info('[VERBOSE lobby:create] received', { /* … */ });
logger.info('[VERBOSE lobby:create] OK', { lobbyId });
```

Render's log stream is the fastest feedback loop you have. Use `[VERBOSE <event>]` as the prefix so JJ can grep them out post-launch.

### Tier-2 done. Validate with:
- [ ] Two real users in a custom lobby see each other
- [ ] Quick-match queue pairs them
- [ ] A bot fills if cap not met
- [ ] Disconnect mid-match → AI takeover, other players can still finish + settle
- [ ] Race-final broadcasts positions, career aggregates update
- [ ] No `[RateLimit] ... DISCONNECTED` lines in Render logs during a race
- [ ] No `Uncaught TypeError` in browser console during race screen mount

---

## §D. Phase D — wagering (Tier 3)

This is the big one. Mainnet money on the line. **Test on devnet first** — Critter Kart and Pool will both do this before any mainnet promotion.

### What's already on mainnet

From `memory/MEMORY.md` (2026-06-04):

| Thing | Value | Notes |
|---|---|---|
| Escrow v2 program ID | `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` | mainnet |
| Config PDA | `R4u6CSnzdVbPgzcC9ukvo8bTzEH2ZF549PVGPDTGYKN` | seeds = `[b"config"]` |
| Authority multisig (= program upgrade authority + config authority) | `9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb` | 2-of-3 Squads V4 |
| Treasury multisig | `5zLEYTj8JdMPJyFWdHwRH69fMdxvrE96H16q7a2SxQiE` | 2-of-3 |
| Ops multisig | `6vism6PVY5mg34tpzwueiJhko49soncAfkPrrRW2yYvy` | 2-of-3 |
| Server authority keypair | `CgcAZJf6...` (full: `CgcAZJf6U5LFkUzPRhcx217prT76uUV3vUdae7QU3wmC`) | signs create/settle on-chain |
| Deploy TX | `4T2BvTYJ…` | |
| Init-config TX | `2mEdRsxd…` | |
| Mainnet deployer (retired post-deploy) | `3sQt…` | `~/.config/solana/solshot-mainnet-deployer.json` |
| Helius RPC key | `.HeliusRPC.txt` (gitignored) | **Rotate post-launch** — leaked in a script log this session |

**3 separate Squads V4 multisigs**, not one multi-vault Squads — Squads V4 paywalls multi-vault at $49/mo.

**Each multisig signer config:** 2-of-3 = JJ's hot wallet + Fish (`311au…`) + a cold Ledger (`4XoQ…`).

### Escrow v2 program — what it does

The program (`programs/solshot-escrow-v2/src/lib.rs` in SolShot repo, deployed binary on mainnet):

- `initialize_config` — one-shot bootstrap, sets authority/treasury/ops/isPaused in the GlobalConfig PDA
- `update_config` — rotate any of those
- `pause_program` / `unpause_program` — kill switch (authority-only)
- `create_match` — server creates an escrow PDA seeded by `[b"match", match_id.as_bytes()]` with `players: Vec<Pubkey>` (2–4 in V1 UI; on-chain supports up to 8)
- `deposit_wager` — each listed player can deposit `wager` lamports into the escrow vault. Tracked via `deposits_mask: u8` bitmap.
- `settle_match` — server (with authority key) calls this on game finish. Computes 90 % / 7 % / 3 % from `wager * count_ones(deposits_mask)`, sends to winner / treasury / ops.
- `cancel_match` — authority cancels before deposits complete; refunds anyone who deposited.
- `permissionless_reclaim` — after 1200s from match creation, anyone can call this to refund all depositors (covers server-down failure modes).
- `start_with_depositors` — alternative to waiting for all to deposit; can start with only those who did (server makes the call after deposit deadline = 600s).

**Timeouts (on-chain constants):**
- `DEPOSIT_DEADLINE_SECS = 600` — 10 minutes from create_match to deposit, then start_with_depositors becomes callable
- `RECLAIM_DEADLINE_SECS = 1200` — 20 minutes from create_match, anyone can reclaim

**Settlement math (BPS):**
- Winner: 9000 BPS = 90 %
- Treasury: 700 BPS = 7 %
- Ops: 300 BPS = 3 %
- Total: 10000 BPS = 100 %, integer lamport math, no fractional dust

### Server service — `escrow-v2.js`

`server/services/escrow-v2.js` wraps every Anchor program call. **Anchor 0.30+ critical gotcha:** in `.accounts({...})`, pass ONLY signers + non-PDA accounts. Anchor auto-resolves anything with a `pda` (constant seeds) or `address` declaration in the IDL. Explicitly passing them causes account-slot misalignment — we hit `InvalidProgramId on system_program` because the resolver placed the config PDA in the system_program slot. For account-derived PDAs (e.g. `escrow.match_id` seed), keep `escrow` explicit — the resolver can't fetch the account first.

```js
// Correct pattern:
await program.methods.createMatch(matchId, wager, players)
  .accounts({
    escrow: escrowPda,           // PDA derived from variable seed — pass explicitly
    authority: authorityKeypair.publicKey,
    // config, systemProgram: AUTO-RESOLVED by Anchor — do NOT pass
  })
  .signers([authorityKeypair])
  .rpc();
```

Other gotchas living in `MEMORY.md`:
- `BN` imports from `bn.js` directly (not from `@coral-xyz/anchor` — breaking change in Anchor 0.32.1)
- `declare_id!` in `lib.rs` must match the actual deployed program ID. Anchor checks at runtime and rejects with `DeclaredProgramIdMismatch`. After redeploy, rebuild `.so` with corrected `declare_id!` and re-upgrade.
- IDL: `server/idl/solshot_escrow_v2.json` is copied from `target/idl/` after build. Keep in sync.

### Server-side match flow

```
LOBBY START
  ↓
lifecycle.createMatchFromLobby → <Game>Match doc created
  ↓
if wager > 0:
    escrowV2.createMatch(matchId, wager, [pubkey of each player])
    → broadcast escrowDeposit event to each player's socket
       with serialized deposit TX
  ↓
each client signs + sends deposit TX via Privy wallet (or wallet-adapter)
  → server's escrowDepositConfirm handler awaits confirmations
  → updates Mongo: player.depositConfirmed = true
  ↓
when all confirmed OR deposit deadline hits:
    if some-but-not-all → escrowV2.startWithDepositors(matchId)
    if all → proceed to runCountdownAndRace
  ↓
race plays (Tier 2 logic, unchanged)
  ↓
race finishes → lifecycle.finishMatch sets winnerPubkey
  ↓
lifecycle.settleMatch → escrowV2.settleMatch(matchId, winnerPubkey)
  → on-chain settlement: 90/7/3 lamport split
  → server keypair signs (held in SOLANA_KEYPAIR_JSON env var)
  → broadcast race:final with settlement TX signature
  ↓
client UI shows winnings + TX link to Solscan
```

### Client-side deposit flow

Pattern lifted from SolShot's `client/src/context/WalletContext.js`:

```js
async function signAndSendEscrowDeposit({ matchId, serializedTx }) {
  // serializedTx is base64; deserialize, sign via wallet adapter / Privy
  const tx = Transaction.from(Buffer.from(serializedTx, 'base64'));
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, 'confirmed');
  socket.emit('escrowDepositConfirm', { matchId, txSig: sig });
}
```

For Privy (which is the current wallet stack per `MEMORY.md` "Wallet stack 2026-05-04"), the same pattern applies — `usePrivy().signTransaction(...)` instead of `wallet.signTransaction(...)`.

**Exposure pattern:** in SolShot we exposed the deposit helper on both the React context value AND `window.solWallet` so Phaser code (which runs outside React) can call it. Match that pattern in any new wagered game.

### Render env vars for escrow

```
SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=<HELIUS_KEY>
SOLANA_KEYPAIR_JSON=[base64-encoded JSON of the server authority keypair]
ESCROW_PROGRAM_ID_V2=BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS
```

The Helius key from `.HeliusRPC.txt` was leaked in a script log. **Rotate it before going live with new wagered games.**

`SOLANA_KEYPAIR_PATH` is the dev-mode alternative (path to a `.json` keypair file). In production, JSON-encode the keypair and set `SOLANA_KEYPAIR_JSON` so it can live in env without a filesystem dependency.

### Deposit funding source — Privy custodial wallets

Per `MEMORY.md` (Wallet stack 2026-05-04, after the Dynamic → Dynamic+Para+Privy → wallet-adapter dance), the current stack is **Privy**. The model:

- User logs in via Privy on first interaction (TG-flow or email-flow)
- Privy provisions a custodial Solana wallet keyed to the TG user / email
- Funding: user transfers SOL from an external wallet OR deposits via Helio / a fiat ramp (V3 conversation, not yet wired)
- For wagered match deposits: client requests deposit TX from server; server constructs unsigned TX referencing user's Privy wallet as fee payer + depositor; client signs via Privy SDK; client sends or returns to server for sending

**If anything is ambiguous here, ask before assuming the wallet stack.** History from `project_dynamic_decision.md` shows we've flipped stacks 3 times.

### Anti-cheat / dispute requirements

Because we settle on-chain:

1. **All physics on server.** No client-reported positions accepted.
2. **Input log replayability.** `<Game>Match.inputLog` field stores raw 30 Hz inputs per kart. If a player disputes settlement, the same inputs replay on a clean RaceRunner and must reach the same finish positions.
3. **Reconnect grace + AI takeover** (Tier 2 §C.9): a disconnected wagered player is not refunded, they DNF (their wager goes to the winner per pot math). Document this clearly in UI before they deposit.
4. **Server keypair compromise = the whole thing breaks.** Keep `SOLANA_KEYPAIR_JSON` in Render env, never commit, rotate on any suspected leak. The keypair is at `~/.config/solana/solshot-server-authority.json` on JJ's local machine for reference.

### Tier-3 done. Validate on devnet first with:
- [ ] Two devnet wallets deposit, race plays, settlement TX lands with correct split
- [ ] Disconnect mid-match → AI takeover → winner still settles
- [ ] Permissionless reclaim works after 1200s (test by withholding settlement)
- [ ] Mainnet deploy: same flow with real wallets, real SOL, small test amount (0.01 SOL each)
- [ ] First end-to-end mainnet wagered match: log the settlement TX in `MEMORY.md`

The devnet milestone reference is in `MEMORY.md`: "First end-to-end wagered match on devnet succeeded. Match `2f5b6180`, settlement TX `4WSsDsKVz…`. Winner +0.18 SOL, Treasury +0.014, Ops +0.006. ALL ON-CHAIN."

---

## §4. The Telegram bot wiring

### Two bots, one process

Both bots live in the SolShot Express process:

| | SolShot bot | Arcade bot |
|---|---|---|
| File | `server/services/bot.js` | `server/services/arcadeBot.js` |
| Telegraf instance | `bot` (singleton) | `bot` (singleton, separate) |
| Handle | `@SolShotGG_bot` | `@TheArcadeGG_Bot` |
| Token env | `TELEGRAM_BOT_TOKEN` | `ARCADE_BOT_TOKEN` |
| Webhook path | `/api/telegram-webhook` | `/api/arcade-webhook` |
| Slash commands | SolShot-specific (`/start`, `/play`, `/wallet`, `/balance`, `/leaderboard`) | Multi-game (`/games`, `/<gameslug>`, `/leaderboard*`) |

### login_url vs url

Inline-keyboard buttons can use either:

- `url: '...'` — opens the URL. Works in DMs and groups. No automatic TG identity handshake.
- `login_url: { url, request_write_access }` — opens the URL with TG-issued query params (`tg_user_id`, etc) appended, AND prompts user to authorise. **Only works in DMs**, and only if the URL's host matches the bot's `/setdomain` setting exactly.

**The 2026-06-04 lesson:** the arcade bot's `/setdomain` is now `thearcade.gg`. SolShot lives at `www.solshot.gg` — a different host. Setting `supportsLoginUrl: true` on the SolShot entry sent `login_url: https://www.solshot.gg/...` to TG, which TG rejected (host doesn't match registered domain), which broke ALL bot replies that iterated the games list (including `/games` and the direct `/solshot` command).

**Fix:** `supportsLoginUrl: false` is the default. The bot uses plain `url:` for every game. Users do not get auto-handshake; they re-auth via Privy inside the game.

If you ever need login_url for a specific game, that game's URL must be on `thearcade.gg` (or whatever domain `/setdomain` is currently pointing at). Don't change `/setdomain` without searching the repo for `supportsLoginUrl: true` first.

### Slash command registration

`arcadeBot.js` auto-registers all commands from the `GAMES` and `LEADERBOARDS` registries at boot. You'll see this in Render logs:

```
[arcade-bot] slash commands registered: /games /solshot /basketball /keepieuppies /freekicks /pool /critterkart /leaderboard /leaderboardbasketball ...
```

If you add a game and don't see it in this log, you forgot to add it to the registry (or you forgot to redeploy).

### DM flow vs group-chat flow

In a 1:1 DM, the bot can send rich UI (login_url buttons, multi-line replies with parse_mode HTML). In a group chat, TG rejects login_url buttons. The bot detects group context and:

- Sends a deep-link button: `https://t.me/<botUsername>?start=<slug>` — tapping this opens the bot in DM with the `<slug>` as a `/start` arg, which immediately triggers the game launch in DM context
- This is why each user in a group needs to tap; each session is minted per-user in their DM

The deep-link pattern is at `server/services/arcadeBot.js`'s `buildGameButton` function.

### Group-chat watchdog

There's a `[group-chat:watchdog] started — sweeps every 15 min` task that cleans up stale group-chat game offers (the user might never have tapped). See `server/services/groupChatWatchdog.js`.

---

## §5. MongoDB schemas — canonical patterns

### Tier-1 leaderboard model

```js
// server/models/<Game>Score.js
const schema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true, unique: true, index: true },
  displayName:    { type: String, required: true },
  bestScore:      { type: Number, required: true, min: 0 },
  bestAchievedAt: { type: Date, default: Date.now },
  totalSubmissions: { type: Number, default: 0 },
  lastSubmittedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schema.index({ bestScore: -1 });  // for leaderboard reads
```

`submitScore({ telegramUserId, displayName, score })` is upsert + max:

```js
await Model.findOneAndUpdate(
  { telegramUserId },
  {
    $set: { displayName, lastSubmittedAt: new Date() },
    $inc: { totalSubmissions: 1 },
    $max: { bestScore: score },
    // bestAchievedAt updated separately if score is new high
  },
  { upsert: true, new: true }
);
```

### Tier-2 lobby model

See `server/models/CritterKartLobby.js`. Key: TTL index on `lastActiveAt` for auto-cleanup of orphaned lobbies.

### Tier-2 match model

See `server/models/CritterKartRace.js`. Key fields:
- State enum: `['matched', 'loading', 'countdown', 'racing', 'finished', 'settled', 'cancelled']`
- Player subdoc with kartId / racerId / socketId / readyAt / finishPosition / status / pointsAwarded
- Wager subdoc (null in Tier 2, populated in Tier 3)
- Compound indices for queue ticker (`{ state, matchedAt }`) and player lookup (`'players.telegramUserId'`)

### Tier-3 career aggregate model

For "Grand Prix" style (Critter Kart) where points accumulate across matches:

```js
const schema = new mongoose.Schema({
  telegramUserId: { type: Number, required: true, unique: true },
  displayName:    String,
  totalPoints:    { type: Number, default: 0 },
  races:          { type: Number, default: 0 },
  wins:           { type: Number, default: 0 },
  podiums:        { type: Number, default: 0 },
  bestLapTimeMs:  Number,
  // … etc
});
```

`getLeaderboard({ limit })` sorts by `totalPoints` desc.

### ELO model (Pool only)

ELO is a different shape: `{ rating, matchCount, ratingHistory[] }`. Adapter functions in `arcadeBot.js::LEADERBOARDS.pool` map ELO onto the per-game contract (`{ rank, displayName, bestScore }` where `bestScore` is rating).

---

## §6. Environment variables — full surface

### Render (SolShot server)

| Var | Required? | What |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string |
| `NODE_ENV` | yes | `production` |
| `CORS_ORIGINS` | yes | comma-sep list of allowed origins |
| `TELEGRAM_BOT_TOKEN` | yes | SolShot bot |
| `ARCADE_BOT_TOKEN` | yes | Arcade bot |
| `TELEGRAM_WEBHOOK_URL` | yes | `https://solshot.onrender.com` |
| `TELEGRAM_WEBHOOK_SECRET` | recommended | webhook auth |
| `SOLANA_RPC` | yes (prod) | Helius mainnet URL with key |
| `SOLANA_KEYPAIR_JSON` | yes (prod) | server authority, base64 JSON |
| `SOLANA_KEYPAIR_PATH` | dev fallback | filesystem path |
| `ESCROW_PROGRAM_ID_V2` | yes (prod) | `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS` |
| `SHOT_TOKEN_MINT` | no (V1) | leave unset; SHOT is off-chain in V1 |
| `BASKETBALL_LEADERBOARD_SECRET` | yes | per-game JWT secret (48 byte base64url) |
| `KEEPIE_UPPIES_LEADERBOARD_SECRET` | yes | ditto |
| `FREE_KICKS_LEADERBOARD_SECRET` | yes | ditto |
| `POOL_LEADERBOARD_SECRET` | ⚠️ MISSING in prod as of 2026-06-05 | spams Render logs every few seconds; 30-second fix |
| `CRITTER_KART_LEADERBOARD_SECRET` | yes | ditto |
| `KEEP_ALIVE_PING` | yes | self-ping URL for Render's free-tier hibernation guard |

Add `<NEW_GAME>_LEADERBOARD_SECRET` per new game.

### Vercel (per game)

| Var | Required? | What |
|---|---|---|
| `CI` | yes | `false` — CRA treats warnings as errors otherwise |
| `NODE_OPTIONS` | for heavy builds | `--max-old-space-size=4096` |

Vercel projects are on **JJ's account**, not Fish's. Fish has a separate account holding stale `solshot-basketball.vercel.app`; we have no creds there. All new projects go on JJ's account.

---

## §7. Domain + canonical URL policy

Per the 2026-05-15 near-miss and the 2026-06-04 lesson:

**One Vercel project per game.** Never share. Each project serves one domain (its own `*.vercel.app` plus optionally a custom subdomain on `thearcade.gg`).

**`thearcade.gg` is the canonical domain.** All non-SolShot games launch via `thearcade.gg/play/<slug>/launch?session=<JWT>`. The bot's `/setdomain` (via @BotFather) is set to `thearcade.gg`.

**`www.solshot.gg` stays SolShot's domain.** Separate Vercel project (`sol-shot`). The bot links to it via plain `url:`, not `login_url:` (because the host doesn't match `/setdomain`).

**Legacy fallback URLs stay live for ~30 days post-promotion.** Don't tear down the old `sol-shot-basketball.vercel.app` etc until you're sure the canonical hub URL has propagated.

---

## §8. Branch strategy + deploys

### SolShot

- `main` → Render auto-deploys (`autoDeploy: true` in `render.yaml`)
- `launch` → development branch, no auto-deploy. Safe to push without triggering production.
- `claude/*` worktree branches → never auto-deploy

When you commit something on `main`, expect a Render deploy within 60–120 seconds. Watch the Render dashboard's "Events" tab for the new build.

### The-Arcade

- `main` → Vercel auto-deploys to `thearcade.gg`
- `arcade/<slug>` → Vercel auto-deploys to per-branch preview URL (`the-arcade-critter-kart.vercel.app` for the critter-kart branch)
- Promote `arcade/<slug>` → `main` when stable. Test on preview first. The 2026-06-05 critter-kart work was all on the preview URL because main doesn't have the multiplayer code yet.

When promoting, the bot's `GAMES` entry needs to flip its `url` from preview to canonical (`https://the-arcade-critter-kart.vercel.app/play/critter-kart/launch` → `https://thearcade.gg/play/critter-kart/launch`).

### Per-game forks (free-kicks pattern)

Push to fork's `main`, Vercel auto-deploys. Hub's `GAMES` entry stays the same (`thearcade.gg/play/free-kicks/launch` was lifted into The-Arcade hub; the fork stays as legacy fallback at `solshot-free-kicks-iota.vercel.app`).

---

## §9. Files to read first when you arrive cold

In order:

1. **This file** — `Docs/internal/ARCADE_WAGERED_GAME_PLAYBOOK.md`
2. **`memory/MEMORY.md`** — project memory, current state, always wins on conflicts
3. **`Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md`** — three-tier economy + 5 non-negotiables
4. **`Docs/KEY_MANAGEMENT.md`** §4 + §8 — mainnet keys + multisigs in detail
5. **`Docs/internal/MAINNET_DEPLOY_DAY.md`** — escrow deploy runbook (when you need to redeploy or upgrade)
6. **`Docs/build-notes/ARCADE_BOT.md`** — bot architecture (the two-bot model)
7. **`Docs/ARCADE_MIGRATION_PLAYBOOK.md`** — old playbook that this file supersedes; still has some Phase 0/1 context
8. **`Docs/internal/Next_Steps_Games.docx`** — strategic game selection + 5 deferred decisions
9. **`Docs/internal/CLAUDE_COMMS.md`** — cross-Claude protocol when multiple Claude instances work on the same project

Code, when you need to see the pattern:

10. **`server/services/arcadeBot.js`** — `GAMES` and `LEADERBOARDS` registries (the active state)
11. **`server/services/games/keepie-uppies-standalone/standaloneLeaderboard.js`** — cleanest Tier-1 template
12. **`server/services/games/critter-kart/`** — Tier-2 (server-authoritative multiplayer) template, latest pattern
13. **`server/services/games/pool/`** — wagered + ELO pattern (Tier 3 work-in-progress)
14. **`server/socket-io/main.js`** — global rate limiter (~line 1468); `RL_EXEMPT_EVENTS` set
15. **`server/socket-io/critter-kart.js`** — race-room broadcast + joinRace handler pattern
16. **`server/services/escrow-v2.js`** — Anchor wrapper with the 0.30+ resolver pattern
17. **`server/idl/solshot_escrow_v2.json`** — IDL (regenerate when program rebuilds)

---

## §10. Known-good commit references

Commit hashes you can fall back to if something breaks:

| Commit | Where | What |
|---|---|---|
| `4T2BvTYJ…` (TX) | mainnet | escrow v2 deploy (2026-06-04) |
| `2mEdRsxd…` (TX) | mainnet | init-config (2026-06-04) |
| `4WSsDsKVz…` (TX) | devnet | first end-to-end wagered settlement |
| `2f5b6180` (match id) | devnet | first wagered match |
| `v1.0.0-frontier` / `db2c67e` | SolShot | hackathon submission tag, frozen |
| `2cc4142` | SolShot main | `race:input` rate-limit exemption (2026-06-05) |
| `fbb455d` | SolShot main | random character assignment for critter-kart (2026-06-05) |
| `287ba8a4d` | The-Arcade `arcade/critter-kart` | emit `critterkart:joinRace` so snapshots route (2026-06-05) |
| `4155efeca` | The-Arcade `arcade/critter-kart` | 4% loading freeze fix (NetClient.sendInput) (2026-06-05) |
| `e5208d4b3` | The-Arcade `arcade/critter-kart` | client picks up server-assigned racerId (2026-06-05) |
| `0c8ac388` | The-Arcade `arcade/critter-kart` | Fish's initial critter-kart lift (2026-06-04) |
| `bc6d4cb` | SolShot main | free-kicks server-side wiring (2026-05-19) |
| `a880f64` | SolShot main | `/setdomain` swap to `thearcade.gg` (2026-06-04) |

---

## §11. Anti-patterns / gotchas (collected)

Each of these has cost real time. Read them before you write code.

**Frontend / hub:**
1. Don't touch gameplay/feel/speed/effects. JJ's hard line. (§A)
2. Don't include a service worker. CRA's default SW blocks hotfixes for hours. (§B.8)
3. Don't omit `CI=false` on the Vercel project. (§B.1)
4. Don't share a Vercel project across domains. (§7)
5. Don't include the JWT in `localStorage` — `sessionStorage` only. Tab-life only.
6. Don't trust `window.location.search` after first boot — stash JWT in sessionStorage and read from there.
7. Don't add hyphens to bot slugs (TG strips them). URL paths can have hyphens.

**Multiplayer:**
8. Don't emit `lobby:closed` alongside `race:start` (race condition in client React state). (§C.7)
9. Don't trust username matching for self-identification (breaks with same TG account on 2 devices; long-term: server emits `selfSlot`). (§C.8)
10. Don't forget to emit `<game>:joinRace` after `race:start` — without it the socket is in the lobby room only, not the race room, so snapshots never arrive. (§C.5)
11. Don't add a new high-frequency socket event without adding it to `RL_EXEMPT_EVENTS` in `main.js`. (§C.6)
12. Don't kill the rAF loop from inside the multiplayer sync block — wrap it in try/catch so any failure degrades to solo-render. (§A)
13. Don't filter `race:start` by `roomId === lobbyId` — they're different IDs. Trust socket-room scope.

**On-chain / wagered:**
14. Don't pass auto-resolved accounts explicitly in Anchor 0.30+. Only signers + variable-PDA accounts. (§D)
15. Don't run `solana program deploy --upgrade-authority <vault>` — the signer arg doesn't accept a PDA. Use two-step CLI (`deploy` → `set-upgrade-authority --new-upgrade-authority <vault> --skip-new-upgrade-authority-signer-check`). (`MEMORY.md`)
16. Don't trust the local `target/deploy/<program>-keypair.json` matches the deployed program ID after long gaps. Always check `solana address -k target/deploy/<program>-keypair.json` against the on-chain ID before redeploying.
17. Don't forget to update `declare_id!` in `lib.rs` when the program ID changes. Anchor rejects at runtime with `DeclaredProgramIdMismatch`.
18. Don't import `BN` from `@coral-xyz/anchor` — use `bn.js` directly.
19. Don't sync IDL by hand — `cp target/idl/<program>.json server/idl/<program>.json` after every build.
20. Don't commit `SOLANA_KEYPAIR_JSON`. Rotate immediately if leaked.

**Server / config:**
21. Don't change `/setdomain` without checking `supportsLoginUrl: true` entries in `GAMES` first. (§4)
22. Don't deploy without adding new Vercel URL to `CORS_ORIGINS`. (§B.4)
23. Don't keep `POOL_LEADERBOARD_SECRET` unset — server log spam is fixable in 30 seconds. (current state, 2026-06-05)
24. Don't skip `--no-verify` to bypass git hooks. Investigate hook failures.

---

## §12. Open decisions (Next_Steps_Games.docx §9 + V3 north star)

These are unresolved and will block one phase or another eventually:

1. **Tickets currency vs SHOT-only.** Tickets recommended as separate on-chain SPL token; not yet decided. Affects Tier 3 reward model.
2. **Monorepo vs per-game repos.** Currently monorepo + branch isolation works; free-kicks broke the assumption without issue. No formal decision.
3. **Phaser-only stack policy.** Recommended in original spec; broken by free-kicks (Vite + Three.js) which shipped 2026-05-19 without issue. Choice: accept multi-stack permanently, or impose retroactive lock and port free-kicks?
4. **Brand name.** Bot is `@TheArcadeGG_Bot` for now. Final name decision deferred.
5. **SDK licensing for third-party studios.** Phase 5 conversation. Don't action.

The V3 north star (`Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md`) has 5 non-negotiable rules for any future economy work. **Read them before touching Tier 3 reward logic.**

---

## §13. The two flagship dev workflows

When in doubt about how to approach a session, one of these usually applies:

### Workflow 1 — "Fish handed me a solo game, make it leaderboarded"

1. Verify solo build works locally (§A)
2. Set up Vercel project on JJ's account (§B.1)
3. Add server-side leaderboard service (§B.2–§B.5)
4. Wire client JWT + score POST + retry-on-boot (§B.6)
5. Add hub routes if monorepo (§B.7)
6. Smoke-test: open `thearcade.gg/play/<slug>/launch?session=<JWT>` in a browser, play a round, check leaderboard shows the score
7. Bot test: `/games` shows the new game; tap launches it

Expected time: 1–2 sessions if patterns hold.

### Workflow 2 — "Take this Tier-1 game to Tier-2 multiplayer"

1. Read `MEMORY.md` for the current state of THIS game specifically
2. Read `server/services/games/critter-kart/` end-to-end (it's the reference)
3. Design doc first (`Docs/internal/CRITTER_KART_MULTIPLAYER_DESIGN.md` is the template)
4. Mongo models (§C "Mongo schemas")
5. Server services in this order: lobbyService → lifecycle → matchmaking → sim/runner
6. Socket handlers: `server/socket-io/<game>.js` (copy critter-kart.js structure)
7. Wire into `server/index.js`'s Socket.io setup
8. Client: net/identity.ts, net/client.ts, net/protocol.ts, multiplayer/context.tsx (lift from critter-kart)
9. App.tsx: add multiplayer screens (lobby browse, lobby create, lobby room, in-race)
10. GameCanvas: add multi block with try/catch and snapshot apply
11. Verify joinRace emit (§C.5), rate-limit exempt (§C.6), no lobby:closed race (§C.7)
12. Bot test with two TG accounts

Expected time: 4–6 sessions. **This is hard. Don't promise faster.**

### Workflow 3 — "Take Tier-2 to Tier-3 wagering"

1. Devnet first. Never mainnet for the first 50 successful matches.
2. Server: extend lifecycle with `createEscrowFromMatch` → `escrowV2.createMatch`
3. Server: deposit confirmation tracking, timeout handling
4. Server: settlement on `finishMatch` → `escrowV2.settleMatch`
5. Client: deposit prompt UI before lobby start
6. Client: deposit signing via Privy
7. Server keypair in Render env (`SOLANA_KEYPAIR_JSON`)
8. Devnet smoke test: full flow, log settlement TX
9. Multisig sign-off for any mainnet redeploy (3 signers, 2-of-3)
10. Mainnet env-var flip on Render
11. First mainnet match: small amount (0.01 SOL each), log everything

Expected time: 6+ sessions. **You're handling real money. Move slowly.**

---

## §14. Mainnet runbook excerpts (for the day you push escrow updates)

Full runbook: `Docs/internal/MAINNET_DEPLOY_DAY.md`. Excerpts here so you don't have to context-switch:

**Build:**
```bash
cd programs/solshot-escrow-v2
anchor build --no-idl  # NB: --no-idl because McAfee locks host .exe → LNK1104 on full build
cp target/idl/solshot_escrow_v2.json ../../server/idl/solshot_escrow_v2.json
# Server overwrites IDL.address from env, so committed IDL is fine
```

**Deploy (two-step):**
```bash
solana program deploy target/deploy/solshot_escrow_v2.so \
  --program-id target/deploy/solshot_escrow_v2-keypair.json \
  --keypair ~/.config/solana/solshot-mainnet-deployer.json \
  --url mainnet

solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority 9f1M7tXb3zqRS7JGuSFjzDjPf4UPhKs1W9uu5wrfqLZb \
  --skip-new-upgrade-authority-signer-check \
  --keypair ~/.config/solana/solshot-mainnet-deployer.json \
  --url mainnet
```

**One-step `--upgrade-authority <PDA>` does NOT work** — Solana's CLI tries to use the arg as a signer.

**Pause/unpause in emergency:**
```bash
# Authority multisig only
anchor run pause-program --provider.cluster mainnet
```

**Server env var flip:**
- Set `ESCROW_PROGRAM_ID_V2=<new-program-id>` on Render
- Trigger redeploy
- Watch logs for `[EscrowV2] Program ID: <new-id>` + `[Server] Escrow v2: ENABLED`

---

## §15. Where MEMORY.md lives + when to update it

Path: `C:\Users\johnk\.claude\projects\C--Users-johnk-SolShot\memory\MEMORY.md`

You will edit this file at the end of every meaningful session. It's the single source of truth for "what's the current state of the project." This playbook is the *pattern* document; MEMORY.md is the *state* document.

Updates go in the form of:
- New "Completed Work" bullets dated by session
- New "Known Gotchas" entries for every bug found
- Status changes on MAINNET LIVE / pending milestones at the top

When this playbook and MEMORY.md disagree, MEMORY.md wins.

---

## §16. Closing — what good "done" looks like

A new wagered game is shipped when:

- [ ] User can find it via `/games` in `@TheArcadeGG_Bot`
- [ ] Tapping launches `thearcade.gg/play/<slug>/launch?session=<JWT>` cleanly
- [ ] Single-player works and writes scores to leaderboard
- [ ] Multiplayer custom lobby works (host → join → ready → start)
- [ ] Quick-match queue pairs strangers
- [ ] Bot fill ensures match starts even if humans are short
- [ ] In-match disconnect → AI takeover → match still finishes
- [ ] Wagered match: deposit prompt → on-chain confirm → settle → 90/7/3 split lands on Solscan
- [ ] No `[RateLimit] ... DISCONNECTED` in Render logs during normal play
- [ ] No silent `Uncaught TypeError` in browser console
- [ ] Game's entry in `MEMORY.md` says "LIVE" with date + first-match settlement TX
- [ ] CORS, env vars, JWT secret, Vercel project, Mongo indices, bot registry — all configured

That's the end-state. Get there by walking the phases.

---

*Last updated 2026-06-05. If this is more than 2 months old when you read it, treat it as a starting point and verify everything in `MEMORY.md` first.*
