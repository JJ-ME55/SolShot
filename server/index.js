import express from "express";
import http from "http";
import * as socket from "socket.io";
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import mainsocket from './socket-io/main.js'
import { healthCheck, getStats } from './services/monitoring.js'

dotenv.config()
const PORT = process.env.PORT || 5001
const app = express();
const server = http.createServer(app)

const io = new socket.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
})

app.use(cors())
app.use(express.json({limit: "30mb", extended: true}))
app.use(express.urlencoded({limit: "30mb", extended: true}))

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
        .then(() => {
            console.log('MongoDB connected');
            server.listen(PORT, function () {
                console.log(`SolShot server listening on port ${PORT}`);
            });
        })
        .catch((err) => {
            console.error('MongoDB connection error:', err.message);
            // Start server anyway so socket.io still works during development
            server.listen(PORT, function () {
                console.log(`SolShot server listening on port ${PORT} (no DB)`);
            });
        });
} else {
    console.warn('MONGODB_URI not set — running without database');
    server.listen(PORT, function () {
        console.log(`SolShot server listening on port ${PORT} (no DB)`);
    });
}
