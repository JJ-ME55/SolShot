/**
 * FreeKicksScore — global all-time leaderboard for the standalone
 * Free-Kick Madness game (solshot-free-kicks-iota.vercel.app).
 *
 * Mirrors `KeepieUppiesScore` / `BasketballScore` exactly — same TG-keyed
 * schema, same indexes. Kept as a separate collection so each game's
 * leaderboard is independent and we never have to filter on
 * `game: 'freekicks'` in queries.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts
 *   - `bestScore: -1, bestAchievedAt: 1` → top-N + ties-by-first
 */

import mongoose from 'mongoose';

const freeKicksScoreSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    bestScore:         { type: Number, required: true, default: 0, min: 0 },
    totalSubmissions:  { type: Number, required: true, default: 0, min: 0 },

    firstSubmittedAt:  { type: Date, default: Date.now },
    lastSubmittedAt:   { type: Date, default: Date.now },
    bestAchievedAt:    { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

freeKicksScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });

const FreeKicksScore = mongoose.model('FreeKicksScore', freeKicksScoreSchema);
export default FreeKicksScore;
