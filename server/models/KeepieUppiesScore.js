/**
 * KeepieUppiesScore — global all-time leaderboard for the standalone
 * Keepie Uppies game (sol-shot-keepie-uppies.vercel.app).
 *
 * Mirrors `BasketballScore` exactly — same TG-keyed schema, same indexes.
 * Kept as a separate collection so each game's leaderboard is independent
 * and we never have to filter on `game: 'basketball'` in queries.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts
 *   - `bestScore: -1, bestAchievedAt: 1` → top-N + ties-by-first
 */

import mongoose from 'mongoose';

const keepieUppiesScoreSchema = new mongoose.Schema({
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

keepieUppiesScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });

const KeepieUppiesScore = mongoose.model('KeepieUppiesScore', keepieUppiesScoreSchema);
export default KeepieUppiesScore;
