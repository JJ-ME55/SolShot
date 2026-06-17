/**
 * DeeperScore — global all-time leaderboard for the standalone DEEPER game
 * (deeper-red.vercel.app — Phaser 3 Motherload-style mining descent,
 * deployed from JJ-ME55/deeper `main`).
 *
 * Mirrors `FreeKicksScore` / `KeepieUppiesScore` — same TG-keyed schema and
 * indexes, separate collection so DEEPER's board is independent. The ranked
 * metric (`bestScore`) is NET WORTH (total cash earned) — the canonical
 * Motherload high-score. `bestDepthFt` / `bestTreasures` ride along as
 * secondary columns from the run that set the best net worth.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts
 *   - `bestScore: -1, bestAchievedAt: 1` → top-N + ties-by-first
 */

import mongoose from 'mongoose';

const deeperScoreSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    bestScore:         { type: Number, required: true, default: 0, min: 0 }, // net worth
    bestDepthFt:       { type: Number, required: true, default: 0, min: 0 },
    bestTreasures:     { type: Number, required: true, default: 0, min: 0 },
    totalSubmissions:  { type: Number, required: true, default: 0, min: 0 },

    firstSubmittedAt:  { type: Date, default: Date.now },
    lastSubmittedAt:   { type: Date, default: Date.now },
    bestAchievedAt:    { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

deeperScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });

const DeeperScore = mongoose.model('DeeperScore', deeperScoreSchema);
export default DeeperScore;
