/**
 * ServerState Model
 *
 * Persists critical server-side counters that MUST survive restarts.
 * Uses a single document with a fixed key ('global') — upsert pattern.
 *
 * Fix 6: totalShotEmitted must persist or supply cap resets on restart.
 * TE-03: verifiedBurnTxs must persist or replay protection resets on restart.
 */

import mongoose from 'mongoose';

const serverStateSchema = new mongoose.Schema({
    key: { type: String, unique: true, required: true, default: 'global' },
    totalShotEmitted: { type: Number, default: 0 },
    verifiedBurnTxs: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now }
});

const ServerState = mongoose.model('ServerState', serverStateSchema);

/**
 * Load persisted server state from MongoDB.
 * Returns { totalShotEmitted, verifiedBurnTxs } or throws on failure.
 *
 * THROWS if MongoDB is not connected or if the query fails.
 * Callers must wrap in try-catch and treat failure as fatal.
 */
export async function loadServerState() {
    if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected — cannot load server state');
    }
    const state = await ServerState.findOne({ key: 'global' });
    if (state) {
        console.log(`[ServerState] Loaded: totalShotEmitted = ${state.totalShotEmitted}, verifiedBurnTxs = ${state.verifiedBurnTxs.length}`);
        return { totalShotEmitted: state.totalShotEmitted, verifiedBurnTxs: state.verifiedBurnTxs || [] };
    }
    console.log('[ServerState] No existing state — starting fresh');
    return { totalShotEmitted: 0, verifiedBurnTxs: [] };
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

/**
 * Atomically add a burn tx signature to the verifiedBurnTxs array.
 * Uses $addToSet to prevent duplicates. Fire-and-forget (errors logged, not thrown).
 *
 * @param {string} txSignature
 */
export async function persistBurnTx(txSignature) {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await ServerState.findOneAndUpdate(
            { key: 'global' },
            { $addToSet: { verifiedBurnTxs: txSignature }, updatedAt: new Date() },
            { upsert: true }
        );
    } catch (err) {
        console.error('[ServerState] persistBurnTx error:', err.message);
    }
}

export default ServerState;
