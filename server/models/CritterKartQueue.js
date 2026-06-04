/**
 * CritterKartQueue — matchmaking queue entry.
 *
 * One doc per queued player. Matchmaker ticker pulls oldest N (FIFO),
 * up to maxPlayers per race, and atomically deletes them when a race
 * is created.
 *
 * Why Mongo-backed (vs in-memory): survives server restarts, supports
 * multiple server instances if we ever scale horizontally, and gives
 * us free per-player lookup ("am I in the queue?").
 *
 * Unique constraint on telegramUserId prevents double-queue from a
 * player who hits Quick Race twice in different tabs.
 */

import mongoose from 'mongoose';

const critterKartQueueSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    socketId:         { type: String, required: true },  // current socket; updated on reconnect

    joinedAt:         { type: Date, default: Date.now, index: true },
    notifiedAt:       { type: Date, default: null },     // when bot DM'd "race ready"
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// FIFO matchmaking — oldest entries get matched first.
critterKartQueueSchema.index({ joinedAt: 1 });

const CritterKartQueue = mongoose.model('CritterKartQueue', critterKartQueueSchema);
export default CritterKartQueue;
