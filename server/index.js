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

dotenv.config()
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

// H061: Process-level crash handlers — prevent single errors from killing the server
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
