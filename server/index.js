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
import { requireAdminKey } from './middleware/guards.js';
import { telegramSocketMiddleware } from './middleware/telegram.js';
import { initBot, setupBotWebhook, stopBot } from './services/bot.js';

dotenv.config()

// KM-03: Initialize key module at startup (before any escrow operations)
const keysLoaded = initKeys();
console.log(`[Server] Keys: ${keysLoaded ? 'LOADED' : 'NOT CONFIGURED (dev mode)'}`);

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
                // Dynamic embedded wallet SDK
                "https://app.dynamic.xyz",
                "https://api.dynamic.xyz",
                ...devConnectSrc,
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
            frameSrc: ["https://plugin.jup.ag", "https://app.dynamic.xyz"],
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
    if (ok) initEscrow();
    res.json({ ok, message: ok ? 'Keys reloaded directly' : 'Key reload failed' });
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

// Connect to MongoDB then start server
const MONGODB_URI = process.env.MONGODB_URI;

// Initialise Telegram bot (no-op if TELEGRAM_BOT_TOKEN not set)
initBot();

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
            server.listen(PORT, '0.0.0.0', function () {
                console.log(`SolShot server listening on 0.0.0.0:${PORT}`);
            });
        })
        .catch((err) => {
            console.error('[FATAL] MongoDB connection failed — cannot start with unknown emission state:', err.message);
            process.exit(1);
        });
} else {
    console.warn('MONGODB_URI not set — running without database');
    setupBotWebhook(app).then(() => {
        server.listen(PORT, '0.0.0.0', function () {
            console.log(`SolShot server listening on 0.0.0.0:${PORT} (no DB)`);
        });
    });
}

// Graceful shutdown — stop bot polling/webhook before exit
process.once('SIGINT', () => stopBot());
process.once('SIGTERM', () => stopBot());

// KM-05: SIGHUP-triggered credential reload
process.on('SIGHUP', () => {
    console.log('[Server] SIGHUP received — reloading credentials');
    const ok = initKeys();
    if (ok) {
        initEscrow();
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
