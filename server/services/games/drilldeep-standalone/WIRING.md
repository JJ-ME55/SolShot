# DrillDeep (DEEPER) — wiring into SolShot

New Tier-1 game: leaderboard + per-user cloud save. New files on this branch
(`arcade/drilldeep-lb`):

- `server/models/DrillDeepScore.js`
- `server/models/DrillDeepSave.js`
- `server/services/games/drilldeep-standalone/standaloneLeaderboard.js`
- `server/services/games/drilldeep-standalone/cloudSave.js`

Client side already shipped in `JJ-ME55/The-Arcade` branch `arcade/DrillDeep`
(`src/net/arcade.ts`): submits to `/api/games/drilldeep/score`, reads
`/api/games/drilldeep/leaderboard`, syncs `/api/games/drilldeep/save`. It sends the bot JWT
as `body.session` (and supports `Authorization: Bearer <privyToken>` for web Privy login —
already handled by the existing `resolveScoreIdentity`).

## 1) `server/index.js`

**Imports** (next to the keepie-uppies import block, ~line 58):
```js
import {
    verifySession as verifyDrillDeepSession,
    submitScore as submitDrillDeepScore,
    getLeaderboard as getDrillDeepLeaderboard,
    getMyStanding as getDrillDeepStanding,
    mintSession as mintDrillDeepSession,
} from './services/games/drilldeep-standalone/standaloneLeaderboard.js';
import { loadSave as loadDrillDeepSave, saveState as saveDrillDeepState } from './services/games/drilldeep-standalone/cloudSave.js';
import DrillDeepScore from './models/DrillDeepScore.js';
```

**CORS allowlist** (the hardcoded array ~line 131) — add:
```js
    'https://the-arcade-drilldeep.vercel.app',
```

**Web-hub minter map** (the `{ basketball: …, keepieuppies: mintKeepieUppiesSession, … }` map, ~line 1185) — add:
```js
    drilldeep: mintDrillDeepSession,
```

**Endpoints** (paste after the keepie-uppies `/standing` route, ~line 1458):
```js
// POST /api/games/drilldeep/score   body: { score, depth?, cash?, session }  (or Bearer Privy)
app.post('/api/games/drilldeep/score', scoreSubmitLimiter, async (req, res) => {
    try {
        const { score, depth, cash } = req.body || {};
        if (!Number.isFinite(score)) return res.status(400).json({ error: 'numeric score required' });
        const resolved = await resolveScoreIdentity(req, verifyDrillDeepSession);
        if (!resolved.ok) {
            const body = { error: resolved.error };
            if (resolved.detail) body.detail = resolved.detail;
            if (resolved.message) body.message = resolved.message;
            return res.status(resolved.status).json(body);
        }
        const result = await submitDrillDeepScore({
            telegramUserId: resolved.identity.telegramUserId,
            telegramUsername: resolved.identity.telegramUsername,
            firstName: resolved.identity.firstName,
            score, depth, cash,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[POST /api/games/drilldeep/score]', err.message);
        res.status(500).json({ error: 'failed to submit score' });
    }
});

// GET /api/games/drilldeep/leaderboard?limit=10&since=<iso>
app.get('/api/games/drilldeep/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const [leaderboard, totalPlayers] = await Promise.all([
            getDrillDeepLeaderboard({ limit, since }),
            DrillDeepScore.countDocuments(buildSinceFilter(since)),
        ]);
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/drilldeep/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/drilldeep/standing/:telegramUserId
app.get('/api/games/drilldeep/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) return res.status(400).json({ error: 'invalid telegramUserId' });
        const standing = await getDrillDeepStanding({ telegramUserId });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/drilldeep/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// ── DrillDeep per-user cloud save ──
// GET /api/games/drilldeep/save?session=<jwt>   (or Authorization: Bearer <privyToken>)
app.get('/api/games/drilldeep/save', async (req, res) => {
    try {
        const reqLike = { headers: req.headers, body: { session: req.query.session } };
        const resolved = await resolveScoreIdentity(reqLike, verifyDrillDeepSession);
        if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
        const save = await loadDrillDeepSave({ telegramUserId: resolved.identity.telegramUserId });
        res.json({ ok: true, data: save?.data ?? null, updatedAt: save?.updatedAt ?? 0 });
    } catch (err) {
        console.error('[GET /api/games/drilldeep/save]', err.message);
        res.status(500).json({ error: 'failed to load save' });
    }
});

// POST /api/games/drilldeep/save   body: { session, data }   (or Bearer)
app.post('/api/games/drilldeep/save', scoreSubmitLimiter, async (req, res) => {
    try {
        const resolved = await resolveScoreIdentity(req, verifyDrillDeepSession);
        if (!resolved.ok) return res.status(resolved.status).json({ error: resolved.error });
        const result = await saveDrillDeepState({ telegramUserId: resolved.identity.telegramUserId, data: req.body?.data });
        res.json(result);
    } catch (err) {
        console.error('[POST /api/games/drilldeep/save]', err.message);
        res.status(400).json({ error: err.message || 'failed to save' });
    }
});
```

Optional: add a `drilldeep` health probe next to the `keepieuppies_lb` probe (~line 347).

## 2) `server/services/arcadeBot.js`

**Import** the service near the other game imports:
```js
import {
    mintSession as mintDrillDeepSession,
    getLeaderboard as getDrillDeepLeaderboard,
    getMyStanding as getDrillDeepStanding,
} from './games/drilldeep-standalone/standaloneLeaderboard.js';
```

**`GAMES`** entry:
```js
{
    slug: 'drilldeep',
    name: 'DrillDeep',
    emoji: '⛏️',
    tagline: 'Dig deep, get rich, don’t get stranded.',
    url: 'https://the-arcade-drilldeep.vercel.app',   // → thearcade.gg/play/drilldeep/launch once on the hub
    supportsLoginUrl: false,
    sessionMinter: (ctx) => mintDrillDeepSession({
        telegramUserId: ctx.from?.id,
        telegramUsername: ctx.from?.username,
        firstName: ctx.from?.first_name,
    }),
},
```

**`LEADERBOARDS`** entry:
```js
drilldeep: {
    emoji: '⛏️',
    title: 'DRILLDEEP',
    getLeaderboard: getDrillDeepLeaderboard,
    getMyStanding: getDrillDeepStanding,
    launchCmd: '/drilldeep',
},
```

## 3) Render env (JJ — dashboard)
- **`DRILLDEEP_LEADERBOARD_SECRET`** — generate & set directly on Render (never commit/share):
  `openssl rand -base64 48 | tr '+/' '-_' | tr -d '='`
- Append to **`CORS_ORIGINS`**: `https://the-arcade-drilldeep.vercel.app` (and `https://thearcade.gg` if not already there).

## 4) Vercel env (the-arcade-drilldeep project)
- `VITE_SOLSHOT_API_BASE=https://solshot.onrender.com`
- `VITE_PRIVY_APP_ID=<the shared Arcade Privy app id>`  (enables web/non-Telegram login)

## 5) Go live
Merge `arcade/drilldeep-lb` → `main` (Render auto-deploys). Watch logs for the new routes +
`[arcade-bot] slash commands registered: … drilldeep`. Smoke-test: `/games` → DrillDeep,
play a run, score appears on `/leaderboard`, reopen on another device → same save.
