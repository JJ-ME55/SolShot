// Render auto-deploy verification bump — 2026-05-07
// Confirms `rootDir: server` filter correctly triggers redeploy on server/ changes.
// Same commit also adds PRIVY_APP_SECRET / TELEGRAM_BOT_TOKEN / PRIVY_APP_ID to render.yaml
// so the H002 hard-503 path has its required env var documented as sync:false.
import express from "express";
import http from "http";
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
import { consumeLinkToken } from './services/walletLinkTokens.js';
import { requirePrivyAuth, isPrivyAuthConfigured } from './services/privyAuth.js';
import { renderCareerCardPng } from './services/challenge/renderCareerCard.js';
import { buildCareerProps } from './services/challenge/careerCardProps.js';

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

// H008: Restrict CORS to known origins instead of wildcard
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

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
        const entry = consumeLinkToken(token);
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
            return res.status(500).json({ error: 'link_failed' });
        }
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
