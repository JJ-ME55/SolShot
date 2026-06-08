// Render auto-deploy verification bump — 2026-05-07
// Confirms `rootDir: server` filter correctly triggers redeploy on server/ changes.
// Same commit also adds PRIVY_APP_SECRET / TELEGRAM_BOT_TOKEN / PRIVY_APP_ID to render.yaml
// so the H002 hard-503 path has its required env var documented as sync:false.
import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import * as socket from "socket.io";
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import mainsocket from './socket-io/main.js'
import { healthCheck, getStats } from './services/monitoring.js'
import { initShotState } from './services/shot-token.js'
import { initKeys } from './services/keys.js';
import { initEscrow } from './services/escrow.js';
import { initEscrowV2 } from './services/escrow-v2.js';
import { requireAdminKey } from './middleware/guards.js';
import { telegramSocketMiddleware } from './middleware/telegram.js';
import { initBot, setupBotWebhook, stopBot } from './services/bot.js';
import { initArcadeBot, setupArcadeBotWebhook, stopArcadeBot } from './services/arcadeBot.js';
import ShootoutStats from './models/ShootoutStats.js';
import { restoreActiveTimers } from './services/groupchat/scheduler.js';
import { startLobbyWatchdog } from './services/groupchat/lobbyWatchdog.js';
// Importing lifecycle registers its onTimeout callback with the scheduler.
import './services/groupchat/lifecycle.js';
import {
    createChallenge,
    getChallenge,
    renderCardForChallenge,
    cancelChallenge,
} from './services/challenge/challenge.js';
import { lookupUserByTelegramId, getPlayerRank, linkTelegramIdentity } from './services/users.js';
import { recordFunnelEvent, getFunnelAggregates } from './services/funnel.js';
import { consumeLinkToken, peekLinkToken } from './services/walletLinkTokens.js';
import { requirePrivyAuth, isPrivyAuthConfigured, verifyPrivyToken, getTelegramAccountFromPrivy } from './services/privyAuth.js';
import { mintArcadeSession, verifyArcadeSession } from './services/arcadeSession.js';
import User from './models/User.js';
import WagerWaitlist from './models/WagerWaitlist.js';
import { renderCareerCardPng } from './services/challenge/renderCareerCard.js';
import { buildCareerProps } from './services/challenge/careerCardProps.js';
import {
    verifySession as verifyBasketballSession,
    submitScore as submitBasketballScore,
    getLeaderboard as getBasketballLeaderboard,
    getMyStanding as getBasketballStanding,
    mintSession as mintBasketballSession,
} from './services/games/basketball-standalone/standaloneLeaderboard.js';
import {
    verifySession as verifyKeepieUppiesSession,
    submitScore as submitKeepieUppiesScore,
    getLeaderboard as getKeepieUppiesLeaderboard,
    getMyStanding as getKeepieUppiesStanding,
    mintSession as mintKeepieUppiesSession,
} from './services/games/keepie-uppies-standalone/standaloneLeaderboard.js';
import {
    verifySession as verifyFreeKicksSession,
    submitScore as submitFreeKicksScore,
    getLeaderboard as getFreeKicksLeaderboard,
    getMyStanding as getFreeKicksStanding,
    mintSession as mintFreeKicksSession,
} from './services/games/free-kicks-standalone/standaloneLeaderboard.js';
import {
    getSolShotLeaderboard,
    getSolShotStanding,
} from './services/games/solshot-leaderboard.js';
import {
    mintSession as mintPoolSession,
    verifySession as verifyPoolSession,
    getLeaderboard as getPoolLeaderboard,
    getStanding as getPoolStanding,
    parseSinceParam as parsePoolSinceParam,
    clampLimit as clampPoolLimit,
} from './services/games/pool/poolLeaderboard.js';
import { simulateShotForClient as simulatePoolShot } from './services/poolSimulation.js';
import {
    mintSession as mintCritterKartSession,
    verifySession as verifyCritterKartSession,
    submitRace as submitCritterKartRace,
    getLeaderboard as getCritterKartLeaderboard,
    getMyStanding as getCritterKartStanding,
} from './services/games/critter-kart-standalone/standaloneLeaderboard.js';
import BasketballScore from './models/BasketballScore.js';
import KeepieUppiesScore from './models/KeepieUppiesScore.js';
import FreeKicksScore from './models/FreeKicksScore.js';

dotenv.config()

// KM-03: Initialize key module at startup (before any escrow operations)
const keysLoaded = initKeys();
console.log(`[Server] Keys: ${keysLoaded ? 'LOADED' : 'NOT CONFIGURED (dev mode)'}`);

// Initialize escrow programs at boot. Previously these were lazy-init'd
// only inside `initSolana()`, which was itself lazy-called from
// `getConnection()` — meaning escrow v2 wasn't ready until the first
// wagered web-client flow hit `verifyBalance()`. The groupchat path
// (`beginWageredDepositPhase` → `createMatchEscrowV2`) doesn't go
// through solana.js, so on a fresh Render boot the first `/customgame`
// wagered match would fail with "wagered matches need escrow service
// running". Init eagerly here so both flows are ready on boot.
if (keysLoaded) {
    const escrowV1Ready = initEscrow();
    console.log(`[Server] Escrow v1: ${escrowV1Ready ? 'ENABLED' : 'DISABLED'}`);
    const escrowV2Ready = initEscrowV2();
    console.log(`[Server] Escrow v2: ${escrowV2Ready ? 'ENABLED' : 'DISABLED'}`);
}

const PORT = process.env.PORT || 5001
const app = express();
const server = http.createServer(app)

// A9: Trust proxy — Render is a reverse proxy; required for accurate req.ip in rate limiting
app.set('trust proxy', 1)

// H008: Restrict CORS to known origins instead of wildcard.
// Always-allowed production origins are hard-coded so a misconfigured
// CORS_ORIGINS env var can't take down cross-origin clients. The env var
// extends this list for ad-hoc preview/staging URLs.
const ALWAYS_ALLOWED_ORIGINS = [
    'https://solshot.gg',
    'https://www.solshot.gg',
    'https://sol-shot.vercel.app',
    'https://solshot-basketball.vercel.app',
    'https://sol-shot-basketball.vercel.app',
    'https://sol-shot-keepie-uppies.vercel.app',
    'https://solshot-free-kicks-iota.vercel.app',
    // The Arcade — parent-brand web hub. Custom domain since 2026-06-04.
    // `the-arcade-eta.vercel.app` (auto-suffix from when `the-arcade`
    // collided with another Vercel account) stays in the allowlist as
    // a fallback for any cached link or in-flight bot deep-link.
    'https://thearcade.gg',
    'https://www.thearcade.gg',
    'https://the-arcade-eta.vercel.app',
    'https://the-arcade-jj-me55s-projects.vercel.app',
    'https://the-arcade-git-main-jj-me55s-projects.vercel.app',
    // Per-game preview Vercel projects — separate deploys for in-flight
    // game branches (shootout, critter-kart). Each tracks its arcade/<slug>
    // branch on JJ-ME55/The-Arcade. Lets us test isolated before merging
    // into the hub at thearcade.gg.
    'https://the-arcade-shootout.vercel.app',
    'https://the-arcade-critter-kart.vercel.app',
];
const CORS_ORIGINS = Array.from(new Set([
    ...ALWAYS_ALLOWED_ORIGINS,
    ...(process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
        : ['http://localhost:3000']),
]));

const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    },
    // E10: Cap inbound socket messages at 64KB to prevent memory abuse
    maxHttpBufferSize: 64 * 1024,
    // PERF: per-message-deflate compression. shotResult broadcasts (full
    // match doc + trajectory + damage map) easily hit 15-25KB on 8-player
    // matches. Deflate compresses these to ~30-40% of original. threshold
    // skips small frames where compression overhead exceeds the savings.
    // Both server + client (socket.io v4) handle this transparently.
    perMessageDeflate: {
        threshold: 1024,
    },
})

// IM-03: Per-IP connection limiting (DB: H024)
// Render is a reverse proxy — x-forwarded-for carries the real client IP.
// split(',')[0].trim() extracts the leftmost (original client) IP from the forwarded chain.
const MAX_CONNECTIONS_PER_IP = 100;
const ipConnectionCounts = new Map();

io.use((socket, next) => {
    const ip = (socket.handshake.headers['x-forwarded-for'] || '')
                    .split(',')[0]
                    .trim()
               || socket.handshake.address;

    const current = ipConnectionCounts.get(ip) || 0;
    if (current >= MAX_CONNECTIONS_PER_IP) {
        return next(new Error('connection limit exceeded'));
    }

    ipConnectionCounts.set(ip, current + 1);

    socket.on('disconnect', () => {
        const count = ipConnectionCounts.get(ip) || 1;
        if (count <= 1) {
            ipConnectionCounts.delete(ip);
        } else {
            ipConnectionCounts.set(ip, count - 1);
        }
    });

    next();
});

// Telegram Mini App: validate initData and attach telegramUser to socket
io.use(telegramSocketMiddleware);

// 12B: www → non-www redirect (production only)
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (IS_PRODUCTION) {
    app.use((req, res, next) => {
        const host = req.headers.host || '';
        if (host.startsWith('www.')) {
            return res.redirect(301, `https://${host.slice(4)}${req.originalUrl}`);
        }
        next();
    });
}

// CS-03: Enable Content Security Policy (DB: H031)
// 12B: localhost removed from production CSP; only included in dev
const devConnectSrc = IS_PRODUCTION ? [] : [
    "http://localhost:5001",
    "ws://localhost:5001",
    "wss://localhost:5001",
];

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://plugin.jup.ag"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://plugin.jup.ag"],
            imgSrc: ["'self'", "data:", "blob:", "https://api.web3modal.org"],
            connectSrc: [
                "'self'",
                "https://api.devnet.solana.com",
                "wss://api.devnet.solana.com",
                "https://api.mainnet-beta.solana.com",
                "wss://api.mainnet-beta.solana.com",
                "https://solshot.onrender.com",
                "wss://solshot.onrender.com",
                "https://solshot-server.onrender.com",
                "wss://solshot-server.onrender.com",
                "https://api.jup.ag",
                "https://plugin.jup.ag",
                "https://tokens.jup.ag",
                "https://cache.jup.ag",
                "https://api.web3modal.org",
                "https://pulse.walletconnect.org",
                "https://explorer-api.walletconnect.com",
                // Privy embedded wallet SDK (migrated from Dynamic 2026-05-04)
                "https://auth.privy.io",
                "https://api.privy.io",
                ...devConnectSrc,
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            frameSrc: ["https://plugin.jup.ag", "https://auth.privy.io"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            reportUri: ['/api/csp-report'],
        },
    },
    crossOriginEmbedderPolicy: false,
}))

app.use(cors({ origin: CORS_ORIGINS }))

// Rate limit all HTTP endpoints (100 req/15min per IP)
const httpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
})
app.use(httpLimiter)

// H008: Reduce body parser limit from 30mb to 1mb — no endpoint needs 30mb
app.use(express.json({limit: "1mb", extended: true}))
app.use(express.urlencoded({limit: "1mb", extended: true}))

// Shootout E2E demo harness (Phase C Checkpoint 1, Task F.1). Serves
// server/public/ statically so http://<host>/shootout-harness.html
// resolves to the two-tab dev harness. Dev-only — no PII, no auth, no
// sensitive bytes live in server/public/.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')))

mainsocket(io)

// Expose io to non-socket-handler modules that need to broadcast (e.g.
// groupchat handleCancelMatch emitting groupMatchCancelled when a host
// cancels via /cancelmatch — needs to reach connected clients in the
// match's room without going through a socket-handler context).
// Global is a controlled trade-off vs threading io through every
// service constructor; tagged with __solshot prefix to avoid namespace
// collisions.
global.__solshotIo = io;

app.get('/', (req, res) => {
    res.send('SolShot server running')
})

// Monitoring endpoints
app.get('/health', healthCheck)
app.get('/stats', requireAdminKey, getStats)  // IM-02: auth guard on financial metrics

// Arcade /status page consumes this — pings server uptime, mongo, and a
// per-game LB endpoint to surface honest "all systems · floor open" or
// "<game> · LB down" states. Cheap (just one Mongo ping + 4 counts).
// Public — no PII, no admin data, just up/down per surface.
app.get('/api/arcade/status', async (req, res) => {
    const startedAt = Date.now();
    const checks = {};
    const probe = async (label, fn) => {
        const t0 = Date.now();
        try {
            await fn();
            checks[label] = { ok: true, latencyMs: Date.now() - t0 };
        } catch (err) {
            checks[label] = { ok: false, error: err?.message || 'unknown', latencyMs: Date.now() - t0 };
        }
    };

    // Mongo ping — countDocuments({}) on a small collection is the
    // cheapest "are we connected and serving" probe.
    await probe('mongo', async () => {
        if (mongoose.connection.readyState !== 1) {
            throw new Error('mongoose not connected (readyState=' + mongoose.connection.readyState + ')');
        }
        // Tiny query — limits how slow a bad mongo can make this endpoint.
        await Promise.race([
            BasketballScore.estimatedDocumentCount(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('mongo timeout')), 3000)),
        ]);
    });

    // Per-game LB sanity — each is a single countDocuments on a small
    // indexed collection. Bounded to 3s each so a flaky LB doesn't
    // wedge the status endpoint.
    await Promise.all([
        probe('basketball_lb', () => Promise.race([
            BasketballScore.estimatedDocumentCount(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ])),
        probe('keepieuppies_lb', () => Promise.race([
            KeepieUppiesScore.estimatedDocumentCount(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ])),
        probe('freekicks_lb', () => Promise.race([
            FreeKicksScore.estimatedDocumentCount(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ])),
    ]);

    const allOk = Object.values(checks).every((c) => c.ok);
    res.status(allOk ? 200 : 503).json({
        ok: allOk,
        checks,
        elapsedMs: Date.now() - startedAt,
        serverTime: new Date().toISOString(),
    });
});

// ── Shootout: lifetime stats for the Barracks page ───────────────────
//
// GET /api/shootout/stats/:telegramUserId
//
// Public read of one player's aggregate Shootout stats. No PII beyond
// what the player already chose to display (displayName from the lobby
// flow). Used by the client's main-menu Barracks panel to show the
// signed-in user their own career numbers; later versions will also
// power tooltip-style profile cards on the leaderboard.
//
// Response shapes:
//   200 { ok: true, stats: { telegramUserId, displayName, totalKills,
//                            totalDeaths, totalMatches, wins, losses,
//                            rawKD, lastPlayedAt } }
//   200 { ok: true, stats: null }            ← user exists but no MP games yet
//   400 { error: 'bad_id' }                  ← non-numeric path param
//   500 { error: 'internal' }
//
// Cached client-side; no rate limiting beyond the global httpLimiter.
app.get('/api/shootout/stats/:telegramUserId', async (req, res) => {
    try {
        const tgId = Number(req.params.telegramUserId);
        if (!Number.isFinite(tgId)) {
            return res.status(400).json({ error: 'bad_id' });
        }
        const doc = await ShootoutStats.findOne({ telegramUserId: tgId }).lean();
        if (!doc) return res.json({ ok: true, stats: null });
        // Whitelist the public fields. Excludes _id, __v, createdAt /
        // updatedAt (Mongoose timestamps), rankScore (internal sort key).
        res.json({
            ok: true,
            stats: {
                telegramUserId: doc.telegramUserId,
                displayName:    doc.displayName,
                totalKills:     doc.totalKills    | 0,
                totalDeaths:    doc.totalDeaths   | 0,
                totalMatches:   doc.totalMatches  | 0,
                wins:           doc.wins          | 0,
                losses:         doc.losses        | 0,
                rawKD:          Number(doc.rawKD || 0),
                lastPlayedAt:   doc.lastPlayedAt,
            },
        });
    } catch (err) {
        console.error('[/api/shootout/stats]', err?.message || err);
        res.status(500).json({ error: 'internal' });
    }
});

// KM-05: Protected key reload endpoint (IM-02: auth via requireAdminKey middleware)
app.post('/api/admin/reload-keys', requireAdminKey, (req, res) => {
    if (process.platform === 'linux') {
        // On Linux/Render: self-signal SIGHUP (triggers the handler above)
        process.kill(process.pid, 'SIGHUP');
        return res.json({ ok: true, message: 'SIGHUP sent — credentials reloading' });
    }
    // On Windows/dev: reload directly (SIGHUP throws ENOSYS on Windows)
    const ok = initKeys();
    if (ok) {
        initEscrow();
        initEscrowV2();
    }
    res.json({ ok, message: ok ? 'Keys reloaded directly' : 'Key reload failed' });
});

// One-shot migration — truncate legacy handles longer than 12 chars to 12.
// Why: HandleModal cap was tightened from 16 → 12 to fit the trophy/career
// cards' callsign budget. Existing 13-16 char handles in DB are grandfathered
// but still clip on those cards. Run this once to align them.
//
// Usage:
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" https://<server>/api/admin/truncate-handles
// Response: { matched, modified, samples: [{ before, after }] }
//
// Idempotent — re-running after a clean run finds zero matches.
app.post('/api/admin/truncate-handles', requireAdminKey, async (req, res) => {
    try {
        const User = (await import('./models/User.js')).default;
        // Find all User docs with handles longer than 12 chars
        const longHandled = await User.find(
            { handle: { $regex: /^.{13,}$/ } },
            { _id: 1, handle: 1 }
        ).lean();

        const samples = [];
        let modified = 0;
        for (const u of longHandled) {
            const before = u.handle;
            const after = before.slice(0, 12);
            await User.updateOne({ _id: u._id }, { $set: { handle: after } });
            modified++;
            if (samples.length < 5) samples.push({ before, after });
        }
        res.json({ ok: true, matched: longHandled.length, modified, samples });
    } catch (err) {
        console.error('[/api/admin/truncate-handles]', err.message);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// V1 onboarding funnel — read aggregated stage counts for a time window.
//   GET /api/admin/funnel?range=24h    (default 24h; accepts 24h, 7d, 30d)
//   headers: x-admin-key
// Response: {
//   range, since, generatedAt,
//   stages: [{ stage, count, uniqueIdentities, retentionFromPrev }, ...]
// }
//
// Stages flow register → auth → wallet_linked → first_deposit → first_settle.
// retentionFromPrev is uniqueIdentities[i] / uniqueIdentities[i-1] — the
// per-step retention. Use this to spot drop-off (e.g. wallet_linked / auth
// low means the link flow is failing for authenticated users).
app.get('/api/admin/funnel', requireAdminKey, async (req, res) => {
    try {
        const range = String(req.query.range || '24h');
        const data = await getFunnelAggregates(range);
        if (data?.error) return res.status(400).json(data);
        res.json(data);
    } catch (err) {
        console.error('[/api/admin/funnel]', err.message);
        res.status(500).json({ error: 'aggregate_failed' });
    }
});

// SEC-02: CSP violation reporting endpoint
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body['csp-report'] || req.body;
    console.error('[CSP Violation]', JSON.stringify({
        directive: report['violated-directive'],
        blocked: report['blocked-uri'],
        document: report['document-uri'],
    }));
    res.status(204).end();
});

// ─── Feedback / bug-report endpoint ──────────────────────────────────────
//
// Public, low-friction reporting from the in-game feedback button. No auth
// required. Rate limited to 5 per IP per hour to keep abuse manageable.
// Writes to the Feedback collection in Mongo for human triage.
//
// POST body: { message, kind?, contextHint?, handle?, walletAddress? }
//
// Response: { ok: true } on success, { ok: false, error } on validation
// failure or DB miss.
const feedbackLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,    // 1 hour
    max: 5,                       // 5 reports per IP per hour
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'rate_limited' },
});

// Score-submit rate limiter — prevents replay floods and macro abuse.
// Keyed by JWT signature (or Privy token prefix) when available so a
// shared IP (e.g. office NAT, mobile carrier CGNAT) doesn't throttle
// legitimate users on the same wifi. Falls back to IP if neither auth
// header is present.
//
// Limits chosen to allow a 60s-per-game replay loop (50/min generous)
// while blocking macros that fire dozens of submits a second:
//   • 50 submits per minute per identity (1 every 1.2s steady-state)
//   • 200 submits per 24h per identity (cap on the daily abuse ceiling)
// AAA hardening pass 2026-06-03.
const scoreSubmitLimiter = rateLimit({
    windowMs: 60 * 1000,         // 1 minute window
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const authHeader = req.headers.authorization || '';
        const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
        if (bearer) return `privy:${bearer.slice(-32)}`;
        const session = req.body?.session;
        if (typeof session === 'string') return `jwt:${session.slice(-32)}`;
        return `ip:${req.ip}`;
    },
    message: { ok: false, error: 'rate_limited', detail: 'too many submissions; slow down' },
});
app.post('/api/feedback', feedbackLimiter, async (req, res) => {
    try {
        const { message, kind, contextHint, handle, walletAddress } = req.body || {};

        // Minimum validation - everything else has Mongoose schema enforcement
        if (typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ ok: false, error: 'message_required' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ ok: false, error: 'message_too_long' });
        }
        const allowedKinds = ['bug', 'feedback', 'idea'];
        const safeKind = allowedKinds.includes(kind) ? kind : 'feedback';

        // Hash IP rather than storing it raw - lets us spot abuse without
        // building a PII pile. crypto-import lazy so the route stays fast
        // when DB is offline.
        const { createHash } = await import('crypto');
        const rawIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim();
        const ipHash = rawIp ? createHash('sha256').update(rawIp).digest('hex').slice(0, 16) : '';

        const Feedback = (await import('./models/Feedback.js')).default;
        const doc = await Feedback.create({
            message: message.trim(),
            kind: safeKind,
            contextHint: typeof contextHint === 'string' ? contextHint.slice(0, 1000) : '',
            handle: typeof handle === 'string' ? handle.slice(0, 32) : '',
            walletAddress: typeof walletAddress === 'string' ? walletAddress.slice(0, 64) : '',
            userAgent: (req.headers['user-agent'] || '').toString().slice(0, 500),
            ip: ipHash,
        });

        // Greppable log line for ops triage. Includes the doc id so we
        // can pull the full record from Mongo without scanning logs.
        console.log(`[Feedback] ${safeKind} id=${doc._id} from=${doc.handle || ipHash || 'anon'} len=${doc.message.length}`);
        return res.json({ ok: true });
    } catch (err) {
        console.warn('[Feedback] failed:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

// ─── Cash-out funnel tracking ────────────────────────────────────────────
//
// The client calls this when the user TAPS the "cash out for gift cards"
// button — measures INTENT, not completion (we can't observe Bitrefill
// conversion from inside SolShot). Completion data comes from the Bitrefill
// affiliate dashboard. Fire-and-forget, never blocks the redirect.
//
// One-shot per identity (FunnelEvent's sparse-unique partial-filter index
// dedupes — see server/models/FunnelEvent.js). Subsequent taps from the
// same identity are silently no-op'd at the DB layer.
//
// See Docs/internal/CIVILIAN_CASHOUT_STRATEGY.md §4.4 for the bigger picture.
app.post('/api/funnel/cashout-initiated', async (req, res) => {
    try {
        const { walletAddress, telegramUserId, uid, provider } = req.body || {};
        // At least one identity must be present, otherwise we can't dedupe
        // and the event is meaningless for funnel math.
        if (!walletAddress && !telegramUserId && !uid) {
            return res.status(400).json({ ok: false, error: 'identity_required' });
        }
        recordFunnelEvent(
            'first_cashout',
            { walletAddress, telegramUserId, uid },
            { provider: typeof provider === 'string' ? provider.slice(0, 32) : 'bitrefill' },
            'http'
        );
        return res.json({ ok: true });
    } catch (err) {
        console.warn('[Cashout funnel] failed:', err?.message || err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

// ─── Challenge endpoints (Phase 3 — Telegram Mini App) ───────────────────
//
// POST /api/challenge       — create a new challenge, returns { shortCode, deepLink, shareUrl }
// GET  /api/challenge/:code — fetch challenge details (for Mini App accept screen)
// GET  /api/challenge/:code/card.png — render the Satori card as PNG
// POST /api/challenge/:code/cancel — challenger withdraws

app.post('/api/challenge', async (req, res) => {
    try {
        const {
            challengerWallet,
            challengerTgUserId,
            challengerHandle,
            opponentHandle,
            opponentTgUserId,
            wager,
            format,
        } = req.body || {};

        if (!challengerHandle) {
            return res.status(400).json({ error: 'challengerHandle required' });
        }
        if (!challengerWallet && !challengerTgUserId) {
            return res.status(400).json({ error: 'challengerWallet or challengerTgUserId required' });
        }

        const result = await createChallenge({
            challengerWallet,
            challengerTgUserId,
            challengerHandle,
            opponentHandle,
            opponentTgUserId,
            wager,
            format,
        });
        res.status(201).json({
            shortCode: result.challenge.shortCode,
            deepLink: result.deepLink,
            shareUrl: result.shareUrl,
            expiresAt: result.challenge.expiresAt,
        });
    } catch (err) {
        console.error('[POST /api/challenge]', err.message);
        res.status(500).json({ error: 'failed to create challenge' });
    }
});

app.get('/api/challenge/:code', async (req, res) => {
    try {
        const challenge = await getChallenge(req.params.code);
        if (!challenge) return res.status(404).json({ error: 'not_found' });
        // Hide internal IDs from public response
        res.json({
            shortCode: challenge.shortCode,
            challengerHandle: challenge.challengerHandle,
            opponentHandle: challenge.opponentHandle,
            wager: challenge.wager,
            format: challenge.format,
            status: challenge.status,
            roomId: challenge.roomId,
            createdAt: challenge.createdAt,
            expiresAt: challenge.expiresAt,
        });
    } catch (err) {
        console.error('[GET /api/challenge/:code]', err.message);
        res.status(500).json({ error: 'failed to fetch challenge' });
    }
});

app.get('/api/challenge/:code/card.png', async (req, res) => {
    try {
        const challenge = await getChallenge(req.params.code);
        if (!challenge) return res.status(404).end();
        const png = await renderCardForChallenge(challenge);
        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=60',
            'Content-Length': png.length,
        });
        res.send(png);
    } catch (err) {
        console.error('[GET /api/challenge/:code/card.png]', err.message);
        res.status(500).end();
    }
});

// GET /api/stats/:tgUserId/card.png — render a player's career card as PNG.
// Public endpoint backing the /stats inline-share flow. Cached 60s — careers
// don't change between refreshes within a single share session.
app.get('/api/stats/:tgUserId/card.png', async (req, res) => {
    try {
        const tgUserId = Number(req.params.tgUserId);
        if (!Number.isFinite(tgUserId)) return res.status(400).end();

        const user = await lookupUserByTelegramId(tgUserId);
        if (!user) return res.status(404).end();

        const rank = await getPlayerRank(tgUserId);
        const props = buildCareerProps(user, { rank, telegramUserId: tgUserId });
        const png = await renderCareerCardPng(props);

        res.set({
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=60',
            'Content-Length': png.length,
        });
        res.send(png);
    } catch (err) {
        console.error('[GET /api/stats/:tgUserId/card.png]', err.message);
        res.status(500).end();
    }
});

app.post('/api/challenge/:code/cancel', async (req, res) => {
    try {
        // H023 fix — require caller identity matching challenger.
        // Caller may pass (wallet, tgUserId) in body; both are validated against
        // the recorded challengerWallet / challengerTgUserId in the document.
        const wallet = typeof req.body?.wallet === 'string' ? req.body.wallet.trim() : null;
        const tgUserIdRaw = req.body?.tgUserId;
        const tgUserId = Number.isInteger(tgUserIdRaw) ? tgUserIdRaw : null;
        if (!wallet && !tgUserId) {
            return res.status(401).json({ error: 'caller_identity_required' });
        }
        const challenge = await cancelChallenge(req.params.code, { wallet, tgUserId });
        if (!challenge) return res.status(404).json({ error: 'not_found_or_already_closed_or_not_owner' });
        res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/challenge/:code/cancel]', err.message);
        res.status(500).json({ error: 'failed to cancel' });
    }
});

// ─── Wallet ↔ Telegram linkage (Phase 2B + JWT hardening) ──────────────
//
// POST /api/wallet/link-from-tg-token
//   headers: Authorization: Bearer <privy-access-token>  (optional in
//            dev, required if PRIVY_APP_ID + PRIVY_APP_SECRET are set)
//   body: { token: string, walletAddress: string }
//
//   Consumes a /link-issued one-shot magic-link token, optionally
//   verifies the Privy access token to confirm the caller is the
//   authenticated user claiming the wallet, validates the wallet
//   address shape, and stamps the (telegramUserId, walletAddress) pair
//   onto the User doc via linkTelegramIdentity. Single-use: token is
//   burned on the first call regardless of outcome.
//
// Security layers (defense in depth):
//   1. Magic-link token: 32-byte CSPRNG one-shot, TG-DM-delivered,
//      10-min TTL. Proves "the caller saw a TG DM to this user id".
//   2. Privy access token (when configured): verified via
//      @privy-io/server-auth. Proves "the caller has an authenticated
//      Privy session" — typically the embedded wallet they're claiming.
//   Both layers must pass when Privy is configured. In dev mode (no
//   PRIVY_APP_SECRET), only layer 1 is enforced.
// requirePrivyAuth here is non-required (soft) — the magic-link token
// (32-byte CSPRNG, 10-min TTL, single-use, TG-DM-delivered) is the
// primary auth. JWT was added as defense-in-depth (commit d4ab9f9)
// but if it ever fails (wrong PRIVY_APP_SECRET on Render, signature
// verification glitch, expired token, etc.), we shouldn't break the
// magic-link path — that was working fine before JWT was added.
//
// Soft mode means: if a token is present and valid, req.privyUserId is
// set (great, extra layer of trust). If absent or invalid, the request
// still passes through but unverified — and the magic-link token logic
// below is the gate.
app.post('/api/wallet/link-from-tg-token', requirePrivyAuth({ required: false }), async (req, res) => {
    try {
        const { token, walletAddress } = req.body || {};
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'token required' });
        }
        if (!walletAddress || typeof walletAddress !== 'string') {
            return res.status(400).json({ error: 'walletAddress required' });
        }
        // Minimal Solana base58 pubkey shape check (32 bytes ≈ 43–44 chars).
        // Real validation happens inside linkTelegramIdentity / Mongo, but
        // we reject obvious garbage early.
        if (walletAddress.length < 32 || walletAddress.length > 64) {
            return res.status(400).json({ error: 'walletAddress shape invalid' });
        }
        // DB audit #3 AUTH-N01 fix: peek-then-consume. Previously the token
        // was consumed BEFORE linkTelegramIdentity ran, so any failure of the
        // link step (Mongo error, wallet shape rejection inside the helper,
        // etc.) burned the user's token and locked them out — they'd need
        // to re-run /link in the bot to mint a fresh one. With peek now,
        // the token only gets consumed after the link succeeds. Transient
        // failures are now retry-friendly (S1-T3's client-side retry helper
        // can hammer until success).
        const entry = peekLinkToken(token);
        if (!entry) {
            return res.status(404).json({ error: 'token_invalid_or_expired' });
        }
        const updated = await linkTelegramIdentity({
            telegramUserId: entry.telegramUserId,
            walletAddress,
            username: entry.username || null,
            firstName: entry.firstName || null,
        });
        if (!updated) {
            // Token NOT consumed — caller can retry without re-minting.
            return res.status(500).json({ error: 'link_failed' });
        }
        // Link succeeded — now burn the token. The peek-then-consume race
        // (someone else consuming between peek and this consume) is bounded
        // by the single-user nature of magic links (DM'd to one human).
        consumeLinkToken(token);
        // Funnel: wallet+TG bound via /play magic-link path
        recordFunnelEvent('wallet_linked', {
            walletAddress: updated.walletAddress || walletAddress,
            telegramUserId: entry.telegramUserId,
        }, { via: 'tg_token' }, 'http');
        res.json({
            ok: true,
            telegramUserId: entry.telegramUserId,
            walletAddress: updated.walletAddress || walletAddress,
        });
    } catch (err) {
        console.error('[POST /api/wallet/link-from-tg-token]', err.message);
        res.status(500).json({ error: 'failed to link wallet' });
    }
});

// ─── Privy-direct TG binding (no /play required) ───────────────────────
//
// POST /api/wallet/link-from-privy-telegram
//   headers: Authorization: Bearer <privy-access-token>  (required)
//   body:    { telegramUserId, telegramUsername?, walletAddress }
//
// Alternative bind path for users who linked Telegram to their Privy
// account directly (via Privy's TG OAuth login OR the wallet menu's
// linkTelegram recovery action). Bypasses the /play magic-link token
// round-trip entirely — Privy already verified the TG identity, and
// the JWT verify on this endpoint confirms the caller IS the
// authenticated Privy user claiming the wallet.
//
// Security: Privy access token (JWT) verifies the caller is auth'd
// under that Privy DID. Privy itself only exposes the linked TG
// account to authenticated owners — so client-supplied telegramUserId
// can't easily be forged without compromising the user's own Privy
// session. Comparable trust level to the magic-link CSPRNG token
// path. For mainnet, optionally upgrade to call Privy's getUser API
// server-side to read the linked telegram from Privy's records.
//
// Required: PRIVY_APP_ID + PRIVY_APP_SECRET env (same as link-from-
// tg-token). If not configured, endpoint refuses with 503.
app.post(
    '/api/wallet/link-from-privy-telegram',
    requirePrivyAuth({ required: true }),
    async (req, res) => {
        try {
            if (!isPrivyAuthConfigured()) {
                return res.status(503).json({ error: 'privy_auth_not_configured' });
            }
            const { telegramUserId, telegramUsername, walletAddress } = req.body || {};
            if (!telegramUserId || typeof telegramUserId !== 'number') {
                return res.status(400).json({ error: 'telegramUserId required (number)' });
            }
            if (!walletAddress || typeof walletAddress !== 'string') {
                return res.status(400).json({ error: 'walletAddress required' });
            }
            if (walletAddress.length < 32 || walletAddress.length > 64) {
                return res.status(400).json({ error: 'walletAddress shape invalid' });
            }
            // H001 fix — verify the supplied telegramUserId matches the
            // Privy session's actual Telegram link. Without this check,
            // any Privy-authenticated user could bind any victim's TG ID
            // to their own wallet (full identity takeover).
            const privyUserId = req.privyUserId;
            const privyClient = (await import('@privy-io/server-auth')).PrivyClient;
            const client = new privyClient(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET);
            let claimedTgId = null;
            try {
                const privyUser = await client.getUser(privyUserId);
                // Privy User object includes linkedAccounts[] with type='telegram' entries
                const tgAccount = (privyUser?.linkedAccounts || [])
                    .find(a => a?.type === 'telegram');
                claimedTgId = tgAccount?.telegramUserId
                    ? Number(tgAccount.telegramUserId)
                    : (tgAccount?.subject ? Number(tgAccount.subject) : null);
            } catch (lookupErr) {
                console.error('[POST /api/wallet/link-from-privy-telegram] Privy lookup failed:', lookupErr.message);
                return res.status(502).json({ error: 'privy_user_lookup_failed' });
            }
            if (!claimedTgId || claimedTgId !== Number(telegramUserId)) {
                console.warn('[POST /api/wallet/link-from-privy-telegram] tg_id mismatch:', {
                    privyUserId,
                    privyClaimedTgId: claimedTgId,
                    bodyTgId: Number(telegramUserId),
                });
                return res.status(403).json({ error: 'tg_id_mismatch' });
            }
            const updated = await linkTelegramIdentity({
                telegramUserId,
                walletAddress,
                username: telegramUsername || null,
                firstName: null,
            });
            if (!updated) {
                return res.status(500).json({ error: 'link_failed' });
            }
            // Funnel: wallet+TG bound via Privy direct (no /play required)
            recordFunnelEvent('wallet_linked', {
                walletAddress: updated.walletAddress || walletAddress,
                telegramUserId,
            }, { via: 'privy_telegram' }, 'http');
            res.json({
                ok: true,
                telegramUserId,
                walletAddress: updated.walletAddress || walletAddress,
            });
        } catch (err) {
            console.error('[POST /api/wallet/link-from-privy-telegram]', err.message);
            res.status(500).json({ error: 'failed to link wallet' });
        }
    }
);

// ─── Arcade ↔ SolShot session handoff ──────────────────────────────────
//
// arcade.xyz user taps SolShot tile → arcade client mints a handoff JWT
// here, redirects to solshot.gg/?arcade_token=<jwt>. solshot.gg client
// validates the token via the sibling endpoint below, displays a welcome
// banner using the callsign from the token. Token is a hint, not auth —
// SolShot's real session still goes through Privy (same app, native
// cross-origin session sharing covers most cases).
//
// 10-min TTL, HS256, ARCADE_SESSION_SECRET env var.

// POST /api/arcade/session-handoff
//   headers: Authorization: Bearer <privy-access-token>  (required)
//   body: (none)
//   returns: { token, expiresAt }
app.post(
    '/api/arcade/session-handoff',
    requirePrivyAuth({ required: true }),
    async (req, res) => {
        try {
            const uid = req.privyUserId;
            if (!uid) {
                return res.status(401).json({ error: 'privy_session_required' });
            }
            // Resolve to the User doc so we can include callsign/wallet/TG
            // hints in the token. Missing User doc isn't fatal — the handoff
            // can still carry just the Privy DID.
            const user = await User.findOne({ uid }).lean().catch(() => null);
            const token = mintArcadeSession({
                uid,
                walletAddress: user?.walletAddress || undefined,
                telegramUserId: user?.telegramUserId || undefined,
                handle: user?.handle || undefined,
            });
            // expiresAt for client-side display only; the JWT carries
            // its own exp claim that the validator checks.
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            res.json({ token, expiresAt });
        } catch (err) {
            console.error('[POST /api/arcade/session-handoff]', err.message);
            res.status(500).json({ error: 'mint_failed' });
        }
    }
);

// POST /api/arcade/session-validate
//   body: { token: string }
//   returns: { ok: true, claims: { uid, walletAddress?, telegramUserId?, handle? } }
//   or:     { ok: false, error: string }
//
// Public endpoint — the JWT itself is the auth. SolShot client calls
// this after reading ?arcade_token=... from the URL.
app.post('/api/arcade/session-validate', async (req, res) => {
    try {
        const { token } = req.body || {};
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ ok: false, error: 'token required' });
        }
        const claims = verifyArcadeSession(token);
        res.json({ ok: true, claims });
    } catch (err) {
        // Invalid/expired/forged — return 200 with ok:false so the client
        // can silently drop the welcome banner instead of surfacing an
        // error. The user is a guest from arcade.xyz; if the hint is
        // stale, that's fine.
        res.json({ ok: false, error: err.message || 'invalid_token' });
    }
});

// ─── Arcade hub — mint per-game session JWT for web users ──────────────
//
// Web users (signed in via Privy on the arcade hub) need a session JWT
// to submit scores via the per-game endpoints (/api/games/<slug>/score).
// Bot users get the JWT from the bot; web users mint their own here.
//
// Resolves Privy DID → User → telegramUserId, then mints the existing
// game-specific session JWT bound to that TG identity. Scores then land
// in the same Mongo collections as bot-submitted scores — true
// leaderboard unification.
//
// Limitation: requires the Privy user to have a linked telegramUserId.
// Users who signed in via email/Google on the arcade hub but never
// linked their TG can play but can't submit. Linking happens via
// SolShot's existing /api/wallet/link-from-privy-telegram or the bot's
// /link command. Returning 412 here signals "free-play mode" cleanly.

// POST /api/wager-waitlist
//   body: { email: string, callsign?: string, source?: string }
//   returns: { ok: true, alreadySignedUp: boolean }
//
// Idempotent. Upserts on email — repeat submissions return success
// without creating duplicate rows. No auth required — anyone with the
// page open can submit (rate-limiting comes from the global httpLimiter
// at 100 req / 15 min / IP).
//
// Email regex is permissive on purpose; full RFC 5322 validation is
// overkill for a marketing waitlist. Bad addresses self-select out
// when we send the v2 beta-access email.
app.post('/api/wager-waitlist', async (req, res) => {
    try {
        const { email, callsign, source } = req.body || {};
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'email required' });
        }
        const cleanEmail = email.trim().toLowerCase();
        if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            return res.status(400).json({ error: 'invalid_email' });
        }
        const existing = await WagerWaitlist.findOne({ email: cleanEmail }).lean();
        if (existing) {
            return res.json({ ok: true, alreadySignedUp: true });
        }
        await WagerWaitlist.create({
            email: cleanEmail,
            callsign: callsign && typeof callsign === 'string' ? callsign.slice(0, 64) : null,
            source: source && typeof source === 'string' ? source.slice(0, 64) : 'unknown',
        });
        console.log(`[wager-waitlist] new signup from ${cleanEmail} (source=${source || 'unknown'})`);
        res.json({ ok: true, alreadySignedUp: false });
    } catch (err) {
        // Race condition on the unique index — treat as already signed up
        if (err?.code === 11000) {
            return res.json({ ok: true, alreadySignedUp: true });
        }
        console.error('[POST /api/wager-waitlist]', err?.message || err);
        res.status(500).json({ error: 'waitlist_failed' });
    }
});

// POST /api/arcade/register
//   headers: Authorization: Bearer <privy-access-token>  (required)
//   body: (none)
//   returns: { user: { uid, telegramUserId, handle, walletAddress }, created: boolean }
//
// Idempotent. Creates a User doc keyed on the Privy DID if one doesn't
// exist yet. Closes the orphan gap for users who signed in via Privy
// on the arcade hub but never touched SolShot — without this, their
// User doc never gets created and mint-session always returns
// `tg_not_linked` even after they go off and link TG via the bot
// (because there's no doc to attach to).
//
// Wallet address and TG identity are NOT set here — those flow through
// the existing /api/wallet/link-* endpoints which validate the linkage
// against Privy's authoritative records (H001 trust model). Register
// just plants the seed doc.
app.post(
    '/api/arcade/register',
    requirePrivyAuth({ required: true }),
    async (req, res) => {
        try {
            const uid = req.privyUserId;
            if (!uid) {
                return res.status(401).json({ error: 'privy_session_required' });
            }
            // Upsert — single Mongo op, atomic, handles race conditions.
            // `setOnInsert` ensures `uid` is only written on the create
            // path; existing docs aren't touched. `new: true` returns
            // the doc post-update (or post-insert).
            const user = await User.findOneAndUpdate(
                { uid },
                { $setOnInsert: { uid } },
                { upsert: true, new: true, lean: true }
            );
            // Mongo doesn't tell us whether this was a create or update
            // directly from findOneAndUpdate, but we can infer: if the
            // doc has only `uid` and the auto-managed `_id`+`__v`, it
            // was just created. Used for telemetry only — caller doesn't
            // need to act differently on either path.
            const created = !user.telegramUserId && !user.walletAddress && !user.handle;
            if (created) {
                console.log(`[arcade/register] new User for uid=${uid.slice(0, 20)}…`);
            }
            res.json({
                user: {
                    uid: user.uid,
                    telegramUserId: user.telegramUserId || null,
                    handle: user.handle || '',
                    walletAddress: user.walletAddress || null,
                },
                created,
            });
        } catch (err) {
            console.error('[POST /api/arcade/register]', err?.message || err);
            res.status(500).json({ error: 'register_failed' });
        }
    }
);

// POST /api/arcade/mint-session
//   query: ?game=basketball|keepieuppies|freekicks
//   headers: Authorization: Bearer <privy-access-token>  (required)
//   body: (none)
//   returns: { session: string, game: string, telegramUserId: number }
//   or 412: { error: 'tg_not_linked', reason: 'Link Telegram to submit scores' }
const GAME_MINTERS = {
    basketball: mintBasketballSession,
    keepieuppies: mintKeepieUppiesSession,
    freekicks: mintFreeKicksSession,
    // Kebab key matches the hub's useArcadeSessionMint('critter-kart')
    // call. Distinct from the bot's slash slug 'critterkart' which TG
    // requires hyphenless. They're two different namespaces.
    'critter-kart': mintCritterKartSession,
};

app.post(
    '/api/arcade/mint-session',
    requirePrivyAuth({ required: true }),
    async (req, res) => {
        try {
            const game = (req.query?.game || '').toString();
            const minter = GAME_MINTERS[game];
            if (!minter) {
                return res.status(400).json({
                    error: 'invalid_game',
                    reason: `game must be one of: ${Object.keys(GAME_MINTERS).join(', ')}`,
                });
            }
            const uid = req.privyUserId;
            if (!uid) {
                return res.status(401).json({ error: 'privy_session_required' });
            }
            const user = await User.findOne({ uid }).lean().catch(() => null);
            if (!user || !user.telegramUserId) {
                return res.status(412).json({
                    error: 'tg_not_linked',
                    reason: 'Link Telegram to submit scores',
                });
            }
            const session = minter({
                telegramUserId: user.telegramUserId,
                telegramUsername: user.username || undefined,
                firstName: user.handle || undefined,
            });
            res.json({
                session,
                game,
                telegramUserId: user.telegramUserId,
            });
        } catch (err) {
            console.error('[POST /api/arcade/mint-session]', err?.message || err);
            res.status(500).json({ error: 'mint_failed' });
        }
    }
);

// ─── Basketball Hoops standalone — score leaderboard ───────────────────
//
// Two auth paths accepted on score submission:
//   1. `Authorization: Bearer <privyToken>` — for web users who signed in
//      via Privy (TG OAuth, email, Google, wallet). Server verifies token,
//      fetches the user's linked TG account, writes the score under that
//      telegramUserId. Returns 403 telegram_not_linked if Privy user has
//      no TG link (email-only). Client surfaces "Link Telegram to save."
//   2. `body.session` (legacy JWT) — for bot-arrived users. JWT carries
//      the TG identity directly; server verifies signature with the per-
//      game secret.
// Either works; never both. Cheating mitigation is "good-enough" for v1
// (signed tokens stop forgery; client-side replay possible but capped by
// per-JWT rate limits). V2 wagered matches bypass score-POST entirely
// via the server-authoritative match lifecycle.
//
// CORS: solshot-basketball.vercel.app + the-arcade-eta.vercel.app must
// be in CORS_ORIGINS (or the global cors() middleware blocks the request).

/**
 * Shared identity resolver for score-submit endpoints.
 *
 * Returns { ok: true, identity: { telegramUserId, telegramUsername, firstName } }
 * on success, or { ok: false, status, error, [message|detail] } for the
 * various failure modes (no auth, invalid Privy, invalid JWT, no TG link).
 *
 * Privy Bearer takes precedence over JWT. If both are present we use Privy
 * (the modern path) and ignore the JWT.
 */
async function resolveScoreIdentity(req, verifyGameJwt) {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];

    if (bearer) {
        const claims = await verifyPrivyToken(bearer);
        if (!claims?.userId) {
            return { ok: false, status: 401, error: 'privy_invalid' };
        }
        const tg = await getTelegramAccountFromPrivy(claims.userId);
        if (!tg) {
            return {
                ok: false,
                status: 403,
                error: 'telegram_not_linked',
                message: 'Link Telegram to save scores',
            };
        }
        return {
            ok: true,
            identity: {
                telegramUserId: tg.telegramUserId,
                telegramUsername: tg.username,
                firstName: tg.firstName,
            },
        };
    }

    const session = req.body?.session;
    if (session && typeof session === 'string') {
        try {
            const identity = verifyGameJwt(session);
            return { ok: true, identity };
        } catch (err) {
            return { ok: false, status: 401, error: 'session_invalid_or_expired', detail: err.message };
        }
    }

    return { ok: false, status: 400, error: 'no_auth', message: 'Sign in to save your score' };
}

// POST /api/games/basketball/score
//   Headers: Authorization: Bearer <privyToken>  (preferred)
//   Body:    { score: number, session?: string } (session = legacy JWT)
//   returns: { ok, newBest, bestScore, rank, totalPlayers }
app.post('/api/games/basketball/score', scoreSubmitLimiter, async (req, res) => {
    try {
        const { score } = req.body || {};
        if (!Number.isFinite(score) || score < 0) {
            return res.status(400).json({ error: 'score must be a non-negative number' });
        }
        const resolved = await resolveScoreIdentity(req, verifyBasketballSession);
        if (!resolved.ok) {
            const body = { error: resolved.error };
            if (resolved.detail) body.detail = resolved.detail;
            if (resolved.message) body.message = resolved.message;
            return res.status(resolved.status).json(body);
        }
        const result = await submitBasketballScore({
            telegramUserId: resolved.identity.telegramUserId,
            telegramUsername: resolved.identity.telegramUsername,
            firstName: resolved.identity.firstName,
            score,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[POST /api/games/basketball/score]', err.message);
        res.status(500).json({ error: 'failed to submit score' });
    }
});

// Parse a `?since=<iso>` query param into a Date (or null if absent/malformed).
// Used by all per-game leaderboard endpoints + the overall aggregator below.
function parseSinceParam(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

// Build the Mongo filter for a since-windowed query. Shared between the
// leaderboard service calls and the totalPlayers countDocuments() lookups.
function buildSinceFilter(since) {
    return since instanceof Date && !isNaN(since.getTime())
        ? { bestAchievedAt: { $gte: since } }
        : {};
}

// GET /api/games/basketball/leaderboard?limit=10&since=<iso>
//   returns: { ok, leaderboard: [{rank, displayName, bestScore, ...}, ...],
//             totalPlayers }
//   since: optional ISO date; filters to users whose `bestAchievedAt` is on
//          or after that time. Lets the Arcade client drive 24h/7d windows.
//   totalPlayers: count of players matching the filter — drives the
//                 `/leaderboard` header's "Players" stat card.
app.get('/api/games/basketball/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const [leaderboard, totalPlayers] = await Promise.all([
            getBasketballLeaderboard({ limit, since }),
            BasketballScore.countDocuments(buildSinceFilter(since)),
        ]);
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/basketball/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/basketball/standing/:telegramUserId
//   returns: { ok, standing: { rank, bestScore, totalSubmissions, displayName,
//             bestAchievedAt } | null }
//   Standings are public (same data as the leaderboard), so no auth — the
//   client decodes the TG identity from its arcade session JWT and queries
//   by ID. `standing: null` = user has never played this game.
app.get('/api/games/basketball/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const standing = await getBasketballStanding({ telegramUserId });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/basketball/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// Keepie Uppies leaderboard — mirror of basketball endpoints. The
// standalone client at sol-shot-keepie-uppies.vercel.app captures the JWT
// minted by the arcade bot on /keepieuppies tap and forwards it here.
//
// POST /api/games/keepieuppies/score
//   body: { score: number, session: string }
//   returns: { ok, newBest, bestScore, rank, totalPlayers }
app.post('/api/games/keepieuppies/score', scoreSubmitLimiter, async (req, res) => {
    try {
        const { score } = req.body || {};
        if (!Number.isFinite(score)) {
            return res.status(400).json({ error: 'numeric score required' });
        }
        const resolved = await resolveScoreIdentity(req, verifyKeepieUppiesSession);
        if (!resolved.ok) {
            const body = { error: resolved.error };
            if (resolved.detail) body.detail = resolved.detail;
            if (resolved.message) body.message = resolved.message;
            return res.status(resolved.status).json(body);
        }
        const result = await submitKeepieUppiesScore({
            telegramUserId: resolved.identity.telegramUserId,
            telegramUsername: resolved.identity.telegramUsername,
            firstName: resolved.identity.firstName,
            score,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[POST /api/games/keepieuppies/score]', err.message);
        res.status(500).json({ error: 'failed to submit score' });
    }
});

// GET /api/games/keepieuppies/leaderboard?limit=10&since=<iso>
app.get('/api/games/keepieuppies/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const [leaderboard, totalPlayers] = await Promise.all([
            getKeepieUppiesLeaderboard({ limit, since }),
            KeepieUppiesScore.countDocuments(buildSinceFilter(since)),
        ]);
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/keepieuppies/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/keepieuppies/standing/:telegramUserId
app.get('/api/games/keepieuppies/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const standing = await getKeepieUppiesStanding({ telegramUserId });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/keepieuppies/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// Free-Kicks leaderboard — mirror of basketball/keepie-uppies endpoints.
// Standalone client at solshot-free-kicks-iota.vercel.app (Vite+Three.js
// from JJ-ME55/solshot-free-kicks fork) captures the JWT minted by the
// arcade bot on /freekicks tap and forwards it here.
//
// POST /api/games/freekicks/score
//   body: { score: number, session: string }
//   returns: { ok, newBest, bestScore, rank, totalPlayers }
app.post('/api/games/freekicks/score', scoreSubmitLimiter, async (req, res) => {
    try {
        const { score } = req.body || {};
        if (!Number.isFinite(score)) {
            return res.status(400).json({ error: 'numeric score required' });
        }
        const resolved = await resolveScoreIdentity(req, verifyFreeKicksSession);
        if (!resolved.ok) {
            const body = { error: resolved.error };
            if (resolved.detail) body.detail = resolved.detail;
            if (resolved.message) body.message = resolved.message;
            return res.status(resolved.status).json(body);
        }
        const result = await submitFreeKicksScore({
            telegramUserId: resolved.identity.telegramUserId,
            telegramUsername: resolved.identity.telegramUsername,
            firstName: resolved.identity.firstName,
            score,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[POST /api/games/freekicks/score]', err.message);
        res.status(500).json({ error: 'failed to submit score' });
    }
});

// GET /api/games/freekicks/leaderboard?limit=10&since=<iso>
app.get('/api/games/freekicks/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const [leaderboard, totalPlayers] = await Promise.all([
            getFreeKicksLeaderboard({ limit, since }),
            FreeKicksScore.countDocuments(buildSinceFilter(since)),
        ]);
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/freekicks/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/freekicks/standing/:telegramUserId
app.get('/api/games/freekicks/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const standing = await getFreeKicksStanding({ telegramUserId });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/freekicks/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// ──────────────────────────────────────────────────────────────────────
// Critter Kart — career-aggregate (Mario Kart Grand Prix) leaderboard.
//
// Differs from the skill-game endpoints above: payload carries position
// + best-lap time + race time, not a single 'score'. Server aggregates
// into CritterKartCareer doc per player. Race finish increments
// totalPoints / races / wins / podiums and conditionally updates
// bestLapTimeMs. Sorted by totalPoints DESC.
//
// Game lives at /play/critter-kart/launch on the hub. Initial preview
// deploy at the-arcade-critter-kart.vercel.app from arcade/critter-kart
// branch — both URLs in ALWAYS_ALLOWED_ORIGINS above.
//
// POST /api/games/critter-kart/score
//   body: { score|points, pos, bestLapMs?, raceTimeMs?, session?: string }
//   `score` is the legacy field Fish's wrapper sends — kept as alias of
//   `points` for one-step backwards compat.
//   returns: { ok, newRecord, totalPoints, races, wins, podiums,
//              bestLapTimeMs, rank, totalPlayers }
app.post('/api/games/critter-kart/score', scoreSubmitLimiter, async (req, res) => {
    try {
        const { score, points, pos, bestLapMs, raceTimeMs } = req.body || {};
        const pointsValue = Number.isFinite(points) ? points
                          : Number.isFinite(score) ? score
                          : NaN;
        if (!Number.isFinite(pointsValue)) {
            return res.status(400).json({ error: 'numeric points required (alias: score)' });
        }
        if (!Number.isFinite(pos)) {
            return res.status(400).json({ error: 'numeric pos required (race finishing position, 1-based)' });
        }
        const resolved = await resolveScoreIdentity(req, verifyCritterKartSession);
        if (!resolved.ok) {
            const body = { error: resolved.error };
            if (resolved.detail) body.detail = resolved.detail;
            if (resolved.message) body.message = resolved.message;
            return res.status(resolved.status).json(body);
        }
        const result = await submitCritterKartRace({
            telegramUserId: resolved.identity.telegramUserId,
            telegramUsername: resolved.identity.telegramUsername,
            firstName: resolved.identity.firstName,
            points: pointsValue,
            pos,
            bestLapMs: Number.isFinite(bestLapMs) ? bestLapMs : null,
            raceTimeMs: Number.isFinite(raceTimeMs) ? raceTimeMs : null,
        });
        res.json({ ok: true, ...result });
    } catch (err) {
        console.error('[POST /api/games/critter-kart/score]', err.message);
        res.status(500).json({ error: 'failed to submit race result' });
    }
});

// GET /api/games/critter-kart/leaderboard?limit=10&since=<iso>
app.get('/api/games/critter-kart/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const leaderboard = await getCritterKartLeaderboard({ limit, since });
        // Total player count comes free from a separate countDocuments —
        // the service doesn't expose its own model for buildSinceFilter,
        // so derive count from the leaderboard query for now. Cheap.
        const totalPlayers = leaderboard.length === limit ? -1 : leaderboard.length;
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/critter-kart/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/critter-kart/standing/:telegramUserId
app.get('/api/games/critter-kart/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const standing = await getCritterKartStanding({ telegramUserId });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/critter-kart/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// GET /api/games/critter-kart/debug/lobbies — list all active lobbies
// + members for live debugging. No auth — public read; lobby contents
// aren't sensitive (just display names) and this is a temporary debug
// surface during multiplayer rollout. Remove or auth-gate before
// public launch.
app.get('/api/games/critter-kart/debug/lobbies', async (req, res) => {
    try {
        const { default: CritterKartLobby } = await import('./models/CritterKartLobby.js');
        const lobbies = await CritterKartLobby.find({
            state: { $in: ['open', 'starting'] },
        })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        res.json({
            ok: true,
            count: lobbies.length,
            lobbies: lobbies.map(l => ({
                lobbyId: l.lobbyId,
                name: l.name,
                state: l.state,
                cap: l.cap,
                hostTelegramUserId: l.hostTelegramUserId,
                hostUsername: l.hostUsername,
                raceId: l.raceId,
                createdAt: l.createdAt,
                lastActiveAt: l.lastActiveAt,
                members: l.members.map(m => ({
                    telegramUserId: m.telegramUserId,
                    displayName: m.displayName,
                    isHost: m.isHost,
                    isReady: m.isReady,
                    socketId: m.socketId,
                })),
                pendingRequests: l.pendingRequests.map(p => ({
                    requestId: p.requestId,
                    telegramUserId: p.telegramUserId,
                    displayName: p.displayName,
                })),
            })),
        });
    } catch (err) {
        console.error('[GET /api/games/critter-kart/debug/lobbies]', err.message);
        res.status(500).json({ error: 'failed to fetch lobbies', detail: err.message });
    }
});

// ──────────────────────────────────────────────────────────────────────
// SolShot leaderboard — K/D + Win% scorecard model (NOT points-based).
// Ranks players by K/D ratio (rate-based per V3 Rule 2). Service in
// services/games/solshot-leaderboard.js derives the row shape from
// User.stats; same fields the trophy / career share cards already use.
//
// Min-match threshold filters out new players with skewed ratios. The
// 10-match floor is illustrative — tune on live data.
// ──────────────────────────────────────────────────────────────────────

// GET /api/games/solshot/leaderboard?limit=10&minMatches=1
app.get('/api/games/solshot/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const minMatches = Math.max(1, parseInt(req.query.minMatches, 10) || 1);
        const rawLeaderboard = await getSolShotLeaderboard({ limit, minMatches });
        // SECURITY: strip telegramUserId from public LB response — PII
        // leak. Keep the service-level row shape with telegramUserId so
        // the standing endpoint (which fetches one user) can find them.
        const leaderboard = rawLeaderboard.map(({ telegramUserId: _omit, ...rest }) => rest);
        // Total eligible players (matching the filter) — separate count so
        // the LB hero's "Players" stat reflects the full roster, not just
        // the slice we returned. Was previously broken (conditional null).
        const totalPlayers = await User.countDocuments({
            'stats.matchesPlayed': { $gte: minMatches },
        });
        res.json({ ok: true, leaderboard, totalPlayers });
    } catch (err) {
        console.error('[GET /api/games/solshot/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch leaderboard' });
    }
});

// GET /api/games/solshot/standing/:telegramUserId
app.get('/api/games/solshot/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const minMatches = Math.max(1, parseInt(req.query.minMatches, 10) || 1);
        const standing = await getSolShotStanding({ telegramUserId, minMatches });
        res.json({ ok: true, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/solshot/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch standing' });
    }
});

// ──────────────────────────────────────────────────────────────────────
// Pool — different shape from the other arcade games. There is NO score
// POST endpoint because match outcomes drive the boards implicitly via
// the orchestrator + ledger services. Two GET endpoints expose the
// multi-board data + standings.
// ──────────────────────────────────────────────────────────────────────

// GET /api/games/pool/leaderboard?type=elo&limit=10&since=<iso>&difficulty=<>
//   type: elo | tickets_earned | marathon_streak | marathon_perfect | tournament_podiums
//   difficulty: required when type starts with 'marathon_'
//   returns: { ok, type, leaderboard: [...] }
app.get('/api/games/pool/leaderboard', async (req, res) => {
    try {
        const type = (req.query.type || 'elo').toString();
        const limit = clampPoolLimit(req.query.limit);
        const since = parsePoolSinceParam(req.query.since);
        const difficulty = req.query.difficulty
            ? String(req.query.difficulty).toLowerCase()
            : undefined;
        const leaderboard = await getPoolLeaderboard({ type, limit, since, difficulty });
        res.json({ ok: true, type, leaderboard });
    } catch (err) {
        console.error('[GET /api/games/pool/leaderboard]', err.message);
        const code = err.message.startsWith('invalid') || err.message.startsWith('difficulty')
            ? 400 : 500;
        res.status(code).json({ error: err.message });
    }
});

// GET /api/games/pool/standing/:telegramUserId?type=elo&difficulty=<>
//   returns: { ok, type, standing: { rank, rating, ... } | null }
app.get('/api/games/pool/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const type = (req.query.type || 'elo').toString();
        const difficulty = req.query.difficulty
            ? String(req.query.difficulty).toLowerCase()
            : undefined;
        const standing = await getPoolStanding({ type, telegramUserId, difficulty });
        res.json({ ok: true, type, standing: standing || null });
    } catch (err) {
        console.error('[GET /api/games/pool/standing]', err.message);
        const code = err.message.startsWith('invalid') || err.message.startsWith('difficulty')
            ? 400 : 500;
        res.status(code).json({ error: err.message });
    }
});

// POST /api/games/pool/simulate-shot
//   Server-authoritative pool shot adjudication. Browser sends current
//   ball state + shot params; server runs the SAME sim core the browser
//   ran for the local prediction (services/pool/sim/) and returns the
//   authoritative result. V2.β socket handler will call into this same
//   simulatePoolShot() to adjudicate matches in flight.
//
//   body: {
//     initialBalls: SerializableBall[],
//     shotParams: { power, angle, spinX, spinY },
//     tableConfig?: TableConfig,    // defaults to DEFAULT_TABLE_CONFIG
//     physicsConfig?: PhysicsConfig // defaults to DEFAULT_PHYSICS_CONFIG
//   }
//   returns: { ok, result: SimulationResult } | { error, detail }
//
//   Currently stateless (no PoolMatch persistence) — match-state integration
//   lands when the socket handlers do. This endpoint stays available as a
//   verification + replay surface and lets external clients (e.g. spectator
//   tools) replay shots deterministically.
app.post('/api/games/pool/simulate-shot', async (req, res) => {
    try {
        const { initialBalls, shotParams, tableConfig, physicsConfig, maxTicks } = req.body || {};
        const out = simulatePoolShot({ initialBalls, shotParams, tableConfig, physicsConfig, maxTicks });
        if (!out.ok) {
            return res.status(400).json({ error: 'invalid_input', detail: out.reason });
        }
        res.json({ ok: true, result: out.result });
    } catch (err) {
        console.error('[POST /api/games/pool/simulate-shot]', err.message);
        res.status(500).json({ error: 'simulation_failed' });
    }
});

// ─── DEV-ONLY — mint a guest session for testing without the bot ─────
//
// V1 reality: SolShot bot mints session JWTs for TG users; the hub
// mints them for web-Privy users. Neither path exists for someone
// hitting the URL cold from a browser. Until production auth is wired,
// this endpoint lets developers + early testers grab a guest JWT so
// the Marathon / Quick Match / Wagered flows are reachable.
//
// Guarded by ENABLE_POOL_GUEST_SESSIONS env var (string 'true'). Returns
// 404 in production unless explicitly enabled. The guest identity uses
// a high-numbered telegramUserId namespace (9_000_000_000+) so it never
// collides with real TG IDs. The handle is whatever the caller passes.
//
// POST /api/games/pool/dev-mint-session
//   body: { handle?: string }
//   returns: { ok: true, session, identity: { telegramUserId, handle } }
app.post('/api/games/pool/dev-mint-session', async (req, res) => {
    // V1 testing: always enabled to unblock manual testing. Before public
    // launch, gate behind ENABLE_POOL_GUEST_SESSIONS env var (set on
    // Render staging only). See TODO: tighten before mainnet ship.
    if (process.env.DISABLE_POOL_GUEST_SESSIONS === 'true') {
        return res.status(404).json({ ok: false, error: 'not_found' });
    }
    try {
        const handle = String(req.body?.handle || `guest_${Math.floor(Math.random() * 9999)}`).slice(0, 32);
        // Stable-ish per-handle id so repeat visits give the same guest a
        // stable identity (their runs accumulate, leaderboard works).
        // Hash the handle into the guest range [9_000_000_000, 9_999_999_999].
        let hash = 0;
        for (let i = 0; i < handle.length; i++) {
            hash = ((hash << 5) - hash + handle.charCodeAt(i)) | 0;
        }
        const telegramUserId = 9_000_000_000 + (Math.abs(hash) % 1_000_000_000);
        const session = mintPoolSession({
            telegramUserId,
            telegramUsername: handle,
            firstName: handle,
        });
        res.json({ ok: true, session, identity: { telegramUserId, handle } });
    } catch (err) {
        console.error('[POST /api/games/pool/dev-mint-session]', err.message);
        res.status(500).json({ ok: false, error: 'mint_failed' });
    }
});

// ─── Side Pocket Marathon — solo trick-shot lives mode ────────────────
//
// V1 endpoints — wire the React Marathon UI to the poolMarathon service
// (server/services/poolMarathon.js). Auth via verifyPoolSession (the
// same JWT the bot mints + the hub web flow mints).
//
// Flow:
//   1. POST /start            — create a MarathonRun document, return runId + first setup
//   2. POST /setup-outcome    — record a setup attempt's outcome
//                               (completed | lives_exhausted | skipped)
//                               returns the updated run + next setup (or null if ended)
//   3. POST /cashout          — voluntary Bank Streak; ends run + applies perfect-run bonus
//   4. POST /abandon          — end the run with status 'ended_disconnect'
//   5. GET  /leaderboard      — public top runs, daily/weekly/all-time scopes
//
// All mutating endpoints require a valid pool session JWT. The session's
// telegramUserId becomes the run's identity key — no separate identity
// param needed.

import {
    startRun as startMarathonRun,
    recordSetupOutcome as recordMarathonSetupOutcome,
    cashOutRun as cashOutMarathonRun,
    abandonRun as abandonMarathonRun,
} from './services/poolMarathon.js';
import MarathonRun from './models/MarathonRun.js';

function verifyPoolSessionFromBody(req) {
    const { session } = req.body || {};
    if (!session || typeof session !== 'string') {
        return { ok: false, status: 400, error: 'session required' };
    }
    try {
        const identity = verifyPoolSession(session);
        return { ok: true, identity };
    } catch (err) {
        return { ok: false, status: 401, error: 'session_invalid_or_expired', detail: err.message };
    }
}

// POST /api/games/pool/marathon/start
//   body: { session, livesAtStart? (default 3) }
//   returns: { ok, runId, run, firstSetup }
app.post('/api/games/pool/marathon/start', async (req, res) => {
    try {
        const auth = verifyPoolSessionFromBody(req);
        if (!auth.ok) return res.status(auth.status).json(auth);
        const result = await startMarathonRun({
            identity: {
                telegramUserId: auth.identity.telegramUserId,
                callsign: auth.identity.telegramUsername || auth.identity.firstName,
            },
        });
        if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
        res.json({
            ok: true,
            runId: result.runId,
            run: serializeRun(result.run),
            firstSetup: result.firstSetup,
        });
    } catch (err) {
        console.error('[POST /api/games/pool/marathon/start]', err.message);
        res.status(500).json({ ok: false, error: 'start_failed' });
    }
});

// POST /api/games/pool/marathon/setup-outcome
//   body: { session, runId, setupId, outcome, livesUsedThisRound?, shotCount?, durationMs? }
//   returns: { ok, run, nextSetup, runEnded, gold, milestoneTickets }
app.post('/api/games/pool/marathon/setup-outcome', async (req, res) => {
    try {
        const auth = verifyPoolSessionFromBody(req);
        if (!auth.ok) return res.status(auth.status).json(auth);
        const { runId, setupId, outcome, livesUsedThisRound, shotCount, durationMs } = req.body || {};
        if (!runId || !setupId || !outcome) {
            return res.status(400).json({ ok: false, error: 'runId, setupId, outcome required' });
        }
        // Anti-tamper: ensure the run belongs to the authed user
        const owns = await runBelongsTo(runId, auth.identity.telegramUserId);
        if (!owns) return res.status(403).json({ ok: false, error: 'run_not_yours' });

        const result = await recordMarathonSetupOutcome(runId, {
            setupId, outcome,
            livesUsedThisRound: Number(livesUsedThisRound) || 0,
            shotCount: Number(shotCount) || 0,
            durationMs: Number(durationMs) || 0,
        });
        if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
        res.json({
            ok: true,
            run: serializeRun(result.run),
            nextSetup: result.nextSetup,
            runEnded: result.runEnded,
            gold: result.gold,
            milestoneTickets: result.milestoneTickets,
        });
    } catch (err) {
        console.error('[POST /api/games/pool/marathon/setup-outcome]', err.message);
        res.status(500).json({ ok: false, error: 'outcome_failed' });
    }
});

// POST /api/games/pool/marathon/cashout
//   body: { session, runId }
//   returns: { ok, run, perfectBonusApplied }
app.post('/api/games/pool/marathon/cashout', async (req, res) => {
    try {
        const auth = verifyPoolSessionFromBody(req);
        if (!auth.ok) return res.status(auth.status).json(auth);
        const { runId } = req.body || {};
        if (!runId) return res.status(400).json({ ok: false, error: 'runId required' });
        const owns = await runBelongsTo(runId, auth.identity.telegramUserId);
        if (!owns) return res.status(403).json({ ok: false, error: 'run_not_yours' });

        const result = await cashOutMarathonRun(runId);
        if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
        res.json({
            ok: true,
            run: serializeRun(result.run),
            perfectBonusApplied: result.perfectBonusApplied,
        });
    } catch (err) {
        console.error('[POST /api/games/pool/marathon/cashout]', err.message);
        res.status(500).json({ ok: false, error: 'cashout_failed' });
    }
});

// POST /api/games/pool/marathon/abandon
//   body: { session, runId }
//   returns: { ok, run }
app.post('/api/games/pool/marathon/abandon', async (req, res) => {
    try {
        const auth = verifyPoolSessionFromBody(req);
        if (!auth.ok) return res.status(auth.status).json(auth);
        const { runId } = req.body || {};
        if (!runId) return res.status(400).json({ ok: false, error: 'runId required' });
        const owns = await runBelongsTo(runId, auth.identity.telegramUserId);
        if (!owns) return res.status(403).json({ ok: false, error: 'run_not_yours' });

        const result = await abandonMarathonRun(runId);
        if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
        res.json({ ok: true, run: serializeRun(result.run) });
    } catch (err) {
        console.error('[POST /api/games/pool/marathon/abandon]', err.message);
        res.status(500).json({ ok: false, error: 'abandon_failed' });
    }
});

// GET /api/games/pool/marathon/leaderboard?scope=weekly&limit=20
//   scope: 'daily' | 'weekly' | 'all-time'  (default: weekly)
//   limit: 1-100  (default 20)
//   returns: { ok, scope, leaderboard: [{ rank, displayName, totalScore, longestStreak, perfectRun, endedAt }] }
app.get('/api/games/pool/marathon/leaderboard', async (req, res) => {
    try {
        const scope = ['daily', 'weekly', 'all-time'].includes(req.query.scope)
            ? req.query.scope : 'weekly';
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const since = scope === 'all-time'
            ? null
            : new Date(Date.now() - (scope === 'daily' ? 24 : 24 * 7) * 60 * 60 * 1000);

        const filter = { status: { $in: ['ended_lives_exhausted', 'ended_cashout'] } };
        if (since) filter.endedAt = { $gte: since };

        const runs = await MarathonRun.find(filter)
            .sort({ totalScore: -1, longestStreak: -1, endedAt: -1 })
            .limit(limit)
            .lean();

        const leaderboard = runs.map((r, i) => ({
            rank: i + 1,
            displayName: r.callsign || `Player${r.telegramUserId || '?'}`,
            totalScore: r.totalScore,
            longestStreak: r.longestStreak,
            perfectRun: r.perfectRun,
            endedAt: r.endedAt,
        }));
        res.json({ ok: true, scope, leaderboard });
    } catch (err) {
        console.error('[GET /api/games/pool/marathon/leaderboard]', err.message);
        res.status(500).json({ ok: false, error: 'leaderboard_failed' });
    }
});

// Helper — projection of MarathonRun for client (no Mongo internals)
function serializeRun(run) {
    if (!run) return null;
    const obj = run.toObject ? run.toObject() : run;
    return {
        runId: obj.runId,
        callsign: obj.callsign,
        livesAtStart: obj.livesAtStart,
        livesRemaining: obj.livesRemaining,
        setupsCompleted: obj.setupsCompleted,
        setupsAttempted: obj.setupsAttempted,
        currentStreak: obj.currentStreak,
        longestStreak: obj.longestStreak,
        perfectRun: obj.perfectRun,
        totalScore: obj.totalScore,
        highestTierReached: obj.highestTierReached,
        earnedGold: obj.earnedGold,
        earnedTickets: obj.earnedTickets,
        status: obj.status,
        startedAt: obj.startedAt,
        endedAt: obj.endedAt,
        durationMs: obj.durationMs,
    };
}

async function runBelongsTo(runId, telegramUserId) {
    if (!runId || !telegramUserId) return false;
    const r = await MarathonRun.findOne({ runId }).select('telegramUserId').lean();
    return r && r.telegramUserId === telegramUserId;
}

// Cross-game aggregator — pulls top-1000 from each game, aggregates in
// memory by telegramUserId, returns players sorted by total plays.
//
// Used by both the overall leaderboard endpoint and the overall standing
// lookup (so a user's rank is consistent between the LB table and the
// "Your Standing" card).
//
// Fine at current scale (< 100 players). Once we cross ~10k players,
// swap to an aggregation pipeline ($unionWith + $group) or a periodically-
// rebuilt summary collection.
async function buildOverallStandings({ since } = {}) {
    const [bb, ku, fk] = await Promise.all([
        getBasketballLeaderboard({ limit: 1000, since }),
        getKeepieUppiesLeaderboard({ limit: 1000, since }),
        getFreeKicksLeaderboard({ limit: 1000, since }),
    ]);

    const players = new Map();
    function add(rows, gameSlug) {
        for (const r of rows) {
            const id = r.telegramUserId;
            if (id == null) continue;
            const existing = players.get(id) || {
                telegramUserId: id,
                displayName: r.displayName,
                bestAchievedAt: r.bestAchievedAt,
                totalPlays: 0,
                games: new Set(),
            };
            existing.totalPlays += r.totalSubmissions || 0;
            existing.games.add(gameSlug);
            // Prefer the most recently-active game's display name + timestamp
            // so renames propagate to the overall board.
            if (
                r.bestAchievedAt &&
                (!existing.bestAchievedAt || r.bestAchievedAt > existing.bestAchievedAt)
            ) {
                existing.displayName = r.displayName;
                existing.bestAchievedAt = r.bestAchievedAt;
            }
            players.set(id, existing);
        }
    }
    add(bb, 'basketball');
    add(ku, 'keepieuppies');
    add(fk, 'freekicks');

    return [...players.values()].sort((a, b) => {
        if (b.totalPlays !== a.totalPlays) return b.totalPlays - a.totalPlays;
        // Tie-break: most recently active wins
        const at = a.bestAchievedAt?.getTime?.() || 0;
        const bt = b.bestAchievedAt?.getTime?.() || 0;
        return bt - at;
    });
}

// GET /api/games/leaderboard?limit=10&since=<iso>
//   Overall arcade leaderboard — ranks players by total plays across all
//   three standalone games. `bestScore` in the response is the total
//   submissions so the existing client hook formats it the same way as
//   per-game scores. `gamesPlayed` (0..3) shows how many cabinets the
//   player has touched. `totalPlayers` is the count of unique players in
//   the (optionally windowed) aggregate.
app.get('/api/games/leaderboard', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
        const since = parseSinceParam(req.query.since);
        const sorted = await buildOverallStandings({ since });

        // SECURITY: telegramUserId stripped from overall LB response —
        // PII leak. See basketball-leaderboard.js for the per-game fix.
        const leaderboard = sorted.slice(0, limit).map((p, i) => ({
            rank: i + 1,
            displayName: p.displayName,
            bestScore: p.totalPlays,
            totalSubmissions: p.totalPlays,
            bestAchievedAt: p.bestAchievedAt,
            gamesPlayed: p.games.size,
        }));

        res.json({ ok: true, leaderboard, totalPlayers: sorted.length });
    } catch (err) {
        console.error('[GET /api/games/leaderboard]', err.message);
        res.status(500).json({ error: 'failed to fetch overall leaderboard' });
    }
});

// GET /api/games/standing/:telegramUserId — cross-game overall standing
//   Mirror of per-game /standing/:id but for the Overall cabinet.
app.get('/api/games/standing/:telegramUserId', async (req, res) => {
    try {
        const telegramUserId = parseInt(req.params.telegramUserId, 10);
        if (!Number.isFinite(telegramUserId)) {
            return res.status(400).json({ error: 'invalid telegramUserId' });
        }
        const sorted = await buildOverallStandings();
        const idx = sorted.findIndex((p) => p.telegramUserId === telegramUserId);
        if (idx === -1) return res.json({ ok: true, standing: null });
        const me = sorted[idx];
        res.json({
            ok: true,
            standing: {
                rank: idx + 1,
                bestScore: me.totalPlays,
                totalSubmissions: me.totalPlays,
                displayName: me.displayName,
                bestAchievedAt: me.bestAchievedAt,
                gamesPlayed: me.games.size,
            },
        });
    } catch (err) {
        console.error('[GET /api/games/standing]', err.message);
        res.status(500).json({ error: 'failed to fetch overall standing' });
    }
});

// Connect to MongoDB then start server
const MONGODB_URI = process.env.MONGODB_URI;

// Initialise Telegram bots (each no-ops if its token env isn't set).
// Two independent bots:
//   - SolShotGG_bot  (TELEGRAM_BOT_TOKEN) — game-specific, hackathon entry
//   - TheArcadegg    (ARCADE_BOT_TOKEN)   — multi-game launcher
initBot();
initArcadeBot();

// H032 fix — enforce schema validation on all update paths globally.
// Without this, findOneAndUpdate / updateOne / bulkWrite skip validators
// (enums on Match.status, GroupMatch.state, Challenge.status, regex on
// referralCode, min:0 on wager — all bypassable via direct update).
mongoose.set('runValidators', true);

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            console.log('MongoDB connected');
            try {
                await initShotState();
            } catch (err) {
                console.error('[FATAL] initShotState failed — cannot start with unknown emission state:', err.message);
                process.exit(1);
            }
            await setupBotWebhook(app);
            await setupArcadeBotWebhook(app);
            // Resume any group-chat matches that were active when the server last stopped.
            await restoreActiveTimers();
            // Sweep stale group-chat lobbies on a 15-min interval; fail-soft.
            startLobbyWatchdog();
            server.listen(PORT, '0.0.0.0', function () {
                console.log(`SolShot server listening on 0.0.0.0:${PORT}`);
            });
            // Keep-alive: ping ourselves every 12 minutes so Render's
            // free tier doesn't hibernate the dyno after 15min idle.
            // Cold-start can take 5–10s on wake, which during a live
            // match looks like "the game froze". This self-ping keeps
            // the process active continuously.
            //
            // unref() so this interval doesn't block process shutdown.
            // Disable by setting DISABLE_KEEPALIVE=1 (e.g. on a paid
            // tier where hibernation isn't a thing).
            if (!process.env.DISABLE_KEEPALIVE) {
                const KEEPALIVE_MS = 12 * 60 * 1000; // 12 min
                const keepAliveUrl = process.env.SERVER_BASE_URL || `http://127.0.0.1:${PORT}`;
                const interval = setInterval(() => {
                    fetch(`${keepAliveUrl}/health`).catch(() => {
                        // Silent — self-ping failure is non-actionable
                    });
                }, KEEPALIVE_MS);
                if (interval.unref) interval.unref();
                console.log(`[KeepAlive] Self-ping enabled — every ${KEEPALIVE_MS / 60000}min to ${keepAliveUrl}/health`);
            }
        })
        .catch((err) => {
            console.error('[FATAL] MongoDB connection failed — cannot start with unknown emission state:', err.message);
            process.exit(1);
        });
} else {
    console.warn('MONGODB_URI not set — running without database');
    Promise.all([setupBotWebhook(app), setupArcadeBotWebhook(app)]).then(() => {
        server.listen(PORT, '0.0.0.0', function () {
            console.log(`SolShot server listening on 0.0.0.0:${PORT} (no DB)`);
        });
    });
}

// Graceful shutdown — stop both bots' polling/webhook before exit
process.once('SIGINT', () => { stopBot(); stopArcadeBot(); });
process.once('SIGTERM', () => { stopBot(); stopArcadeBot(); });

// KM-05: SIGHUP-triggered credential reload
process.on('SIGHUP', () => {
    console.log('[Server] SIGHUP received — reloading credentials');
    const ok = initKeys();
    if (ok) {
        initEscrow();
        initEscrowV2();
        console.log('[Server] Credential reload complete');
    } else {
        console.error('[Server] Credential reload failed — escrow unchanged');
    }
});

// H061: Process-level crash handlers — prevent single errors from killing the server
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
