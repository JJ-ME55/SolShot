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

dotenv.config()

// KM-03: Initialize key module at startup (before any escrow operations)
const keysLoaded = initKeys();
console.log(`[Server] Keys: ${keysLoaded ? 'LOADED' : 'NOT CONFIGURED (dev mode)'}`);

const PORT = process.env.PORT || 5001
const app = express();
const server = http.createServer(app)

// H008: Restrict CORS to known origins instead of wildcard
const CORS_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:3000'];

const io = new socket.Server(server, {
    cors: {
        origin: CORS_ORIGINS,
        methods: ["GET", "POST"]
    }
})

// Security headers
app.use(helmet({
    contentSecurityPolicy: false,  // CSP handled by client/CDN
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
app.get('/stats', getStats)

// KM-05: Protected key reload endpoint
app.post('/api/admin/reload-keys', (req, res) => {
    const apiKey = req.headers['x-admin-key'];
    if (!process.env.ADMIN_API_KEY || apiKey !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
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

// Connect to MongoDB then start server
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            console.log('MongoDB connected');
            // Fix 6: Load persisted SHOT emission counter before accepting connections
            await initShotState();
            server.listen(PORT, '0.0.0.0', function () {
                console.log(`SolShot server listening on 0.0.0.0:${PORT}`);
            });
        })
        .catch((err) => {
            console.error('MongoDB connection error:', err.message);
            // Start server anyway so socket.io still works during development
            server.listen(PORT, '0.0.0.0', function () {
                console.log(`SolShot server listening on 0.0.0.0:${PORT} (no DB)`);
            });
        });
} else {
    console.warn('MONGODB_URI not set — running without database');
    server.listen(PORT, '0.0.0.0', function () {
        console.log(`SolShot server listening on 0.0.0.0:${PORT} (no DB)`);
    });
}

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
