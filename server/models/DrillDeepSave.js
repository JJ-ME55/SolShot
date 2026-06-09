/**
 * DrillDeepSave — per-user cloud save for DRILLDEEP. One document per Telegram user,
 * holding the game's MetaState blob (cores, unlocks, collection, settings, best stats).
 * Keyed by telegramUserId so the same save follows a player across web + mobile.
 *
 * The blob is opaque to the server (Mixed). A size guard in the service keeps it sane.
 */

import mongoose from 'mongoose';

const drillDeepSaveSchema = new mongoose.Schema({
    telegramUserId: { type: Number, required: true, unique: true, index: true },
    data:           { type: mongoose.Schema.Types.Mixed, required: true },
    clientUpdatedAt:{ type: Number, default: 0 }, // ms timestamp from the client blob
}, {
    timestamps: true, // createdAt + updatedAt (server-side)
    minimize: false,
});

const DrillDeepSave = mongoose.model('DrillDeepSave', drillDeepSaveSchema);
export default DrillDeepSave;
