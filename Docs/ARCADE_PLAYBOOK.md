# The Arcade — New Game Playbook

> Procedure for adding a new game to `@TheArcadeGG_Bot`. Codifies the
> branch-and-Vercel pattern, standalone client structure, leaderboard
> wiring, shared visual identity, and phone-readiness checklist that
> the basketball and keepie-uppies builds taught us.
>
> Read this **before** picking the next game (per `Docs/internal/Next_Steps_Games.docx`
> — 8 Ball Pool, top-down PvP shooter, Multiplayer Snake).
>
> **Companion docs:**
> - `Docs/BALL_GAMES_PLAYBOOK.md` — ball-specific physics, input, watchdogs (Fish, 2026-05-15)
> - `Docs/build-notes/ARCADE_BOT.md` — bot architecture, env vars, deploy steps
> - `Docs/internal/Next_Steps_Games.docx` — strategic game selection
> - `Docs/ROADMAP.md` — Phase 3 = multi-game on TG

---

## 1. The cardinal rule — branch isolation

**Every game gets its own branch and its own Vercel project. No exceptions.**

The reason is the 2026-05-15 near-miss: promoting `arcade/basketball` to production on the shared `sol-shot` Vercel project briefly flipped `www.solshot.gg` (the hackathon entry URL) to render basketball instead of SolShot. ~10 minutes of cross-contamination, caught by JJ's manual test, no real users hit it. The fix was a dedicated Vercel project per game.

```
SolShot artillery        → sol-shot           → www.solshot.gg
Basketball Hoops         → sol-shot-basketball → sol-shot-basketball.vercel.app
Keepie Uppies            → sol-shot-keepie-uppies → sol-shot-keepie-uppies.vercel.app
Next game (e.g. 8-ball)  → sol-shot-eight-ball → sol-shot-eight-ball.vercel.app
```

Each game branch tracks `arcade/<slug>` and its Vercel project's Production environment points ONLY at that branch. Pushing a branch can never touch another game's URL.

---

## 2. The 4-decision tree before you start

Answer all four before writing code. Each one shapes the next.

### 2.1 Solo-skill leaderboard, or multiplayer PvP?

- **Solo-skill** (basketball, keepie-uppies pattern) — single-player session, score-chase, JWT leaderboard, no real-time socket needed. Simplest pattern. Daily-pot wagering layer later.
- **Multiplayer PvP** (SolShot pattern) — 2+ players in a match, socket.io for turn/state sync, escrow for wager, settlement on win. Heavier infrastructure.

The next 3 games per `Next_Steps_Games.docx` are PvP. The current 2 shipped are solo-skill. **Pattern jump is non-trivial** — multiplayer needs the escrow router + match coordinator that Phase 0 of the next-steps doc builds.

### 2.2 Phaser, vanilla canvas, or Unity?

- **Phaser** (basketball, keepie-uppies, SolShot) — same stack as everything we ship. Defaults here unless there's a specific reason not to.
- **Vanilla canvas** (would be needed for henshmi 8 Ball Pool fork) — works, but creates a small impedance mismatch. Wrap in a Phaser scene loader for hub-compat.
- **Unity** — discouraged. Second build pipeline, different dev flow, fragments the team. Only if one game has Unity-specific value that can't be replicated.

### 2.3 Standalone-only, or also mounted in the main app?

- **Standalone-only** (basketball, keepie-uppies) — the branch's `client/src/index.js` mounts the game directly. No App.js, no router, no wallet provider. Faster iteration, simpler bundle.
- **Mounted in main app** (SolShot) — game lives at a route in the main React app, shares wallet + auth context.

For non-SolShot arcade games, default to **standalone-only**. The hub navigation lives in the arcade bot, not in a shared SPA.

### 2.4 Leaderboard now, or later?

Adding the JWT leaderboard from day one costs ~30 minutes per game using the basketball-standalone template. Always do it — score persistence is the cheapest replayability hook we have, and the daily-pot wagering layer later requires it.

---

## 3. Branch + Vercel setup (the recipe)

Run-once-per-game, ~15 minutes.

### 3.1 Branch off main

```bash
git checkout main && git pull
git checkout -b arcade/<game-slug>
```

Slug rules: lowercase, hyphens between words, must work as a Vercel project name and a Telegram command (TG strips hyphens — `keepie-uppies` URL but `/keepieuppies` command).

### 3.2 Game folder layout

```
client/src/games/<game-slug>/
├── README.md            — game README, links to research docs
├── constants.js         — physics + tuning values, mirror of server copy
├── physics.js           — pure simulation (mirror of server)
├── scene.js             — Phaser scene class (rendering + input)
├── sfx.js               — Web Audio synth, wrapped in safeAudio
├── input/               — touchFlick.js, mouseArrow.js if separate
└── <Game>Screen.js      — top-level React mount, JWT session capture
```

`server/services/games/<game-slug>/` mirrors the constants + physics for server-side replay/validation.

`server/services/games/<game-slug>-standalone/standaloneLeaderboard.js` is the JWT-gated leaderboard service (mint, verify, submit, fetch).

`server/models/<GameSlug>Score.js` is the Mongoose schema.

### 3.3 Standalone entry point (`client/src/index.js`)

**Overwrite** the main-app entry with a direct game mount. This is the "TEMPORARY hack" referenced in the keepie-uppies entry — it stays on the branch forever; main is untouched.

```jsx
// Standalone <Game> build entry point.
// This file is intentionally divergent from `main` — on the
// `arcade/<slug>` branch (Vercel project: sol-shot-<slug>), the entire
// app is just the standalone game. No App.js, no wallet, no socket.
// Service worker registration is OMITTED — CRA's SW caches the HTML/JS
// bundle aggressively, making hotfixes painful. Without an SW, hard-
// refresh always picks up the latest bundle.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { GameScreen } from './games/<game-slug>/GameScreen';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <GameScreen />
  </React.StrictMode>
);
```

### 3.4 Vercel project

1. Vercel dashboard → "Add New" → "Project" → import `JJ-ME55/SolShot`
2. Project name: `sol-shot-<game-slug>`
3. Root directory: `client`
4. **Settings → Environment Variables**: add `CI=false` for all envs (CRA treats warnings as errors in CI, kills the build on existing unused-var lints)
5. **Settings → Environments → Production → Branch Tracking**: `arcade/<game-slug>` (NOT main)
6. First push to the branch auto-builds at `sol-shot-<game-slug>.vercel.app`

**Confirm before pushing**: the project is linked to **JJ's Vercel account**, NOT Fish's. Fish's account hosted the original `solshot-basketball.vercel.app` and JJ has no credentials there — when leaderboard patches landed, that URL stayed stuck on stale builds for hours. All new projects go on JJ's account.

### 3.5 Arcade bot registry

`server/services/arcadeBot.js`, find the `GAMES` array, append:

```js
{
  slug: '<gameslug>',                   // bot command — TG strips hyphens, so no dashes here
  name: '<Display Name>',
  emoji: '🎯',                          // shown on the launch button
  tagline: '<one-line pitch>',
  url: 'https://sol-shot-<game-slug>.vercel.app/',  // Vercel URL with dashes
  supportsLoginUrl: false,              // true only if URL host = bot's /setdomain
  sessionMinter: (ctx) => mintSession({
      telegramUserId: ctx.from?.id,
      telegramUsername: ctx.from?.username,
      firstName: ctx.from?.first_name,
  }),
},
```

Add the LEADERBOARDS entry too:

```js
const LEADERBOARDS = {
  // ... existing entries
  <gameslug>: {
    emoji: '🎯',
    title: '<DISPLAY NAME UPPERCASE>',
    getLeaderboard: getLeaderboard,
    getMyStanding: getMyStanding,
    launchCmd: '/<gameslug>',
  },
};
```

Push to `main` after the standalone is live → Render redeploys server with the new bot command.

### 3.6 Render env vars

For each game's leaderboard, generate a 48-byte base64url secret and set:

```
<GAMESLUG>_LEADERBOARD_SECRET=<random-secret>
```

Append the Vercel URL to `CORS_ORIGINS` so the cross-origin POST from the standalone client passes preflight.

---

## 4. Standalone leaderboard wiring (the JWT pattern)

Use the keepie-uppies template — it's the cleanest reference.

### 4.1 Server side

Copy `server/services/games/keepie-uppies-standalone/standaloneLeaderboard.js` → `<game-slug>-standalone/standaloneLeaderboard.js`. Find-replace:

- `KeepieUppiesScore` → `<GameSlug>Score`
- `keepieuppies` (issuer) → `<gameslug>`
- `KEEPIE_UPPIES_LEADERBOARD_SECRET` → `<GAMESLUG>_LEADERBOARD_SECRET`

Copy `server/models/KeepieUppiesScore.js` → `<GameSlug>Score.js`. Schema is generic.

Add route handlers in `server/index.js`:

```js
app.post('/api/games/<game-slug>/score', async (req, res) => {
    try {
        const result = await submit<GameSlug>Score({ ...req.body });
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
});
app.get('/api/games/<game-slug>/leaderboard', async (_req, res) => {
    const lb = await get<GameSlug>Leaderboard({ limit: 25 });
    res.json({ ok: true, leaderboard: lb });
});
```

### 4.2 Client side

In `<Game>Screen.js`, capture session on mount:

```jsx
useEffect(() => {
    try {
        const session = new URLSearchParams(window.location.search).get('session');
        if (session) sessionStorage.setItem('arcade_session', session);
    } catch (_) { /* silent — no leaderboard for this play, game still works */ }
}, []);
```

In scene.js at game-over, POST score with session:

```js
const session = sessionStorage.getItem('arcade_session');
if (!session) return; // user opened the URL directly, no leaderboard binding
fetch(`${SERVER_URL}/api/games/<game-slug>/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ score: finalScore, session }),
}).then(r => r.json()).then(data => {
    if (data.ok) showRankToast(`Rank #${data.rank} of ${data.totalPlayers}`);
});
```

---

## 5. Shared visual identity — what to share, what to diverge

This is JJ's "common themes" question. We don't have a fully-codified design system across games yet — here's what the audit shows and the principle to settle on.

### 5.1 Hub-level UI tokens (SHOULD be shared across every game)

These come from `client/src/styles/tokens.css` and are the SolShot brand. Reuse them for **any HUD overlay, menu, score panel, or button** that lives outside the gameplay canvas:

| Token | Value | Use |
|---|---|---|
| `--f-display` | Black Ops One | Headlines, scores, big text |
| `--f-mono` | Share Tech Mono | Labels, timers, technical readouts |
| `--bg-deep` | `#0e1209` | Page background |
| `--bone` | `#c8b87a` | Default text |
| `--olive` | `#7a9060` | Secondary labels, dim text |
| `--orange` | `#c8781a` | Primary accent / CTA |
| `--clip-6` / `--clip-10` | angled polygon | Buttons + cards have cut corners |

The "lines and things" JJ mentioned = the clip-path angled-corner buttons, the Share Tech Mono mono-spaced labels, the olive borders. These read as "SolShot family" instantly.

**Concrete rule:** every game's loading screen, score popup, leaderboard overlay, "Open in Safari" link, and play-again button uses these tokens. No exceptions.

### 5.2 Gameplay-canvas art (SHOULD diverge per game)

The Phaser scene itself — the basketball court, the football pitch, the canyon walls — should look like a real game world for that specific sport. Forcing every game to use the olive/bone palette inside the canvas would make basketball look weird (wood courts are warm brown, not olive).

**Concrete rule:** inside the gameplay canvas, use a per-game palette tuned to the sport's real-world look (hardwood, grass, hardcourt, snow, etc.). Keep the HUD overlay on top in SolShot tokens.

### 5.3 Stat cards (SHOULD be shared template, per-game data)

The post-match shareable card is the strongest brand surface — players paste it into chats. Build one shared stat-card service (per `Next_Steps_Games.docx` §6) that:

- Takes a game slug + match data
- Renders with SolShot tokens (Black Ops One header, olive border, clip-path corners)
- Embeds per-game data (final score, opponent, key plays)

Not built yet — it's a Phase 0 deliverable in the next-steps doc. Until then, each game's "share result" is ad-hoc.

### 5.4 Should we keep this direction?

JJ's open question. The honest read:

- **The SolShot CRT aesthetic is strong.** It's not generic AI-game-template, it has a coherent identity. Players who like it will recognise it across the arcade.
- **Risk:** the olive/orange/stencil palette skews "military / Worms / artillery." For pool, snake, basketball it reads as "branding consistency"; for cozier or whimsical games it might fight the game's mood.
- **The fallback if it fights:** keep the FONTS and the CLIP-PATH (those are the structural identity) and let the palette flex per game. So every game has the same typography and angled buttons but its own colour story.

**Recommendation:** Lock fonts + clip-paths as universal. Treat palette as per-game with a SolShot-family fallback. Codify after game 4 ships and we have a real read.

---

## 6. Phone-readiness checklist

Every arcade game has hit the same mobile issues. Codify the fixes once.

### 6.1 Viewport + scaling

Mobile is portrait-by-default for the standalone games (basketball is 800×1200, keepie-uppies same). Phaser's `Scale.FIT` with `autoCenter: CENTER_BOTH` handles aspect-ratio scaling — letterbox on mismatched aspects, no horizontal squash.

In `index.html`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
```

`100dvh` (dynamic viewport height) instead of `100vh` for full-screen containers — iOS Safari's URL bar collapse otherwise leaves a strip of white at the bottom.

### 6.2 Touch input — stale-tracking guard mandatory

From `BALL_GAMES_PLAYBOOK.md` §6.1 — the multi-pointer trap. Any `touchFlick.js`-style input state machine MUST have this:

```js
function onDown(pointer) {
    // Stale-tracking guard. A missed pointerup leaves `tracking` set
    // forever and blocks every future onDown.
    if (tracking !== null
        && performance.now() - tracking.startT > FLICK_MAX_DURATION_SEC * 1000 + 700) {
        tracking = null;
        trail.clear();
    }
    if (tracking !== null) return;
    // ...
}
```

Without this, a single missed `pointerup` (palm graze, edge-swipe browser gesture, focus loss) locks the game into "tracked forever" — subsequent flicks register nothing. This was Fish's "stuck-bug" — three wrong diagnoses before he found it.

### 6.3 AudioContext + safeAudio wrapper

Every `play*` export wrapped in `safeAudio`. Audio is non-critical; a throw must never propagate into the game loop. From `BALL_GAMES_PLAYBOOK.md` §8.2.

### 6.4 Telegram in-app browser escape hatch

TG WebView is flaky for `sessionStorage` + `fetch` (drops POSTs on dismissal). Every standalone needs an "Open in Safari ↗" link that opens the same URL with the JWT in a real browser:

```jsx
<a
    href={typeof window !== 'undefined' ? window.location.href : '#'}
    target="_blank"
    rel="noopener noreferrer"
    style={styles.safariLink}
>
    Open in Safari ↗
</a>
```

Always visible (we can't reliably detect TG WebView from the inside).

### 6.5 Service worker — DON'T register one

CRA's default service worker caches HTML and JS bundles aggressively. For standalones we want hard-refresh to always pick up the latest deploy. Comment out the `serviceWorker.register()` call in `client/src/index.js` if it exists; the keepie-uppies entry already does this.

### 6.6 No tap-zoom

Add to the standalone's `index.css`:

```css
* { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
```

Prevents iOS double-tap-to-zoom on game buttons.

### 6.7 Real-device test before merge

Compile clean ≠ ships clean. Every game has had at least one bug that ONLY appeared on a real iPhone (keepie-uppies stuck-bug, SolShot Bug A slider snap-back). Real-device pass is gate 1 of the test checklist (§7.1).

---

## 7. Test + deploy gates

Don't push a new game URL to the arcade bot's `GAMES` registry until all gates pass.

### 7.1 Pre-merge test gates

- [ ] Server tests pass (`cd server && npm test` covers the game's physics module)
- [ ] `CI=true npm run build` clean (catches the unused-import lint warnings that Vercel treats as errors)
- [ ] Real-device test on iPhone landscape: full session start-to-finish, score submit, leaderboard appears
- [ ] Real-device test on Android: same flow
- [ ] Telegram in-app browser test: open from `@TheArcadeGG_Bot` DM, verify score submits (or escape link works)
- [ ] Stale-tracking guard tested: multi-touch palm graze doesn't lock input

### 7.2 Deploy gates

- [ ] Vercel project created on JJ's account (not Fish's)
- [ ] Production branch tracking points to `arcade/<slug>` (not main)
- [ ] `CI=false` env var set on Vercel project
- [ ] Render env var `<GAMESLUG>_LEADERBOARD_SECRET` set
- [ ] Render `CORS_ORIGINS` updated to include the new Vercel URL
- [ ] Bot `GAMES` registry updated in `server/services/arcadeBot.js`
- [ ] Bot `LEADERBOARDS` registry updated
- [ ] Push to `main` → Render redeploys → `/games` in the bot shows the new entry

### 7.3 Post-deploy verification

- [ ] `https://sol-shot-<slug>.vercel.app/` returns the game (not 404)
- [ ] `@TheArcadeGG_Bot` `/games` lists the new game
- [ ] `/<slug>` command launches it
- [ ] `/leaderboard` chooser shows the new game
- [ ] Play a match end-to-end, score appears on leaderboard

---

## 8. Common patterns from the 2 shipped games — steal these

### 8.1 Physics constants — research-cited

From BALL_GAMES_PLAYBOOK §1 ("no guessing rule"). Every physics constant in `constants.js` has a comment citing its source — research doc, regulation spec, or playtest iteration with the date. Examples from keepie-uppies:

```js
// v0.6 (2026-05-15 playtest): 9.81 → 12.0 (+22%). Fish wanted more pace.
// Cleaner than scaling launch velocities (which would also change arc
// height + risk off-screen). Deliberate arcade deviation from CIPM
// standard gravity.
export const GRAVITY_M_S2 = 12.0;
```

When the user says "more pace" → translate to a magnitude (+22%), restate it in the response, document the date and reason.

### 8.2 Three-file sync discipline

Physics constants and code exist in THREE places: server reference, client copy, standalone copy. Drift is the main risk. Mitigation:

- Server tests as canonical reference (75 tests in basketball)
- Explicit `diff` check after each sync
- Single comprehensive commit at handoff time so the history isn't littered

### 8.3 Bridge pattern for Phaser ↔ React

```js
class GameBridge {
    constructor() { this.state = {}; this.dirty = false; }
    updateState(partial) { Object.assign(this.state, partial); this.dirty = true; }
    consume() { if (!this.dirty) return null; this.dirty = false; return { ...this.state }; }
}
```

React polls via `requestAnimationFrame`, only re-renders when the bridge is dirty. Cheap, predictable.

### 8.4 Watchdogs from day one

Per-ball state watchdog (2.5s no-trajectory timeout), per-ball flight-time watchdog (4s max), render isolation try/catch around per-iteration draws. From BALL_GAMES_PLAYBOOK §10.

### 8.5 Asset generation lessons

DALL-E transparency is unreliable — use the green-screen fallback. Reference-image style transfer keeps multi-asset sets coherent. Match asset proportions to physics constants (rim size, ball size). BALL_GAMES_PLAYBOOK §11.

---

## 9. Quick-reference — adding game #4 from a cold start

If you're starting cold and want to ship the next arcade game, this is the path. Estimate: 1 week for solo-skill, 3+ weeks for multiplayer-PvP.

1. **Decision tree (§2)**: which game? solo-skill or multiplayer? Phaser? Read `Docs/internal/Next_Steps_Games.docx` for strategic guidance.
2. **Open the candidate repo**, verify license (MIT/Apache/BSD/CC0 only — no GPL/AGPL/MPL). Get it running locally.
3. **Branch + Vercel** (§3): `arcade/<slug>`, fresh Vercel project on JJ's account, branch-locked production.
4. **Game folder** (§3.2): scaffold from keepie-uppies as the cleanest template.
5. **Standalone entry** (§3.3): replace `client/src/index.js` with direct mount.
6. **Leaderboard service** (§4): copy keepie-uppies-standalone, find-replace slug.
7. **Physics + scene**: research-cited constants (§8.1), three-file sync, BALL_GAMES_PLAYBOOK for ball games.
8. **Visual identity** (§5): hub UI in SolShot tokens, game-world canvas in per-game palette.
9. **Phone readiness** (§6): all 7 boxes ticked before merge.
10. **Test gates** (§7.1): all green.
11. **Deploy gates** (§7.2): all set.
12. **Post-deploy verification** (§7.3): all working.
13. **Update this playbook** (§10) with what game #4 taught us.

---

## 10. Update this doc as the procedure evolves

Each game teaches us one more thing the previous one didn't. Add findings here when they generalise across games. Trim sections that turn out to be game-specific (move those to the per-game README).

**Maintainer:** main-claude (currently) — but it's a team document. Fish writes here too.

— main-claude, 2026-05-17
