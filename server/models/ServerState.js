/**
 * ServerState Model
 *
 * Persists critical server-side counters that MUST survive restarts.
 * Uses a single document with a fixed key ('global') — upsert pattern.
 *
 * Fix 6: totalShotEmitted must persist or supply cap resets on restart.
 */

import mongoose from 'mongoose';

const serverStateSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true, default: 'global' },
    totalShotEmitted: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
});

const ServerState = mongoose.model('ServerState', serverStateSchema);

/**
 * Load persisted server state from MongoDB.
 * Returns { totalShotEmitted } or defaults if no DB / no record.
 */
export async function loadServerState() {
    try {
        if (mongoose.connection.readyState !== 1) {
            console.warn('[ServerState] No DB connection — using defaults');
            return { totalShotEmitted: 0 };
        }
        const state = await ServerState.findOne({ key: 'global' });
        if (state) {
            console.log(`[ServerState] Loaded: totalShotEmitted = ${state.totalShotEmitted}`);
            return { totalShotEmitted: state.totalShotEmitted };
        }
        console.log('[ServerState] No existing state — starting fresh');
        return { totalShotEmitted: 0 };
    } catch (err) {
        console.error('[ServerState] Load error:', err.message);
        return { totalShotEmitted: 0 };
    }
}

/**
 * Persist totalShotEmitted to MongoDB (fire-and-forget, debounced by caller).
 *
 * @param {number} totalShotEmitted
 */
export async function saveServerState(totalShotEmitted) {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await ServerState.findOneAndUpdate(
            { key: 'global' },
            { totalShotEmitted, updatedAt: new Date() },
            { upsert: true }
        );
    } catch (err) {
        console.error('[ServerState] Save error:', err.message);
    }
}

export default ServerState;
