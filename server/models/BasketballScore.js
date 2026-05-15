/**
 * BasketballScore — global all-time leaderboard for the standalone
 * Basketball Hoops game (solshot-basketball.vercel.app).
 *
 * One document per Telegram user. `bestScore` is the user's highest
 * single-game score; new submissions only update the doc if they beat
 * the existing best. `totalSubmissions` counts every submission for
 * basic "how engaged is this player" telemetry.
 *
 * Why TG-keyed instead of wallet-keyed:
 *   - Basketball standalone v1 doesn't require a wallet (free play).
 *   - The arcade bot mints a JWT carrying TG identity when the user
 *     taps /basketball; the client forwards that JWT with each score
 *     submission. So every submission has a verified TG id.
 *   - Wallet is captured opportunistically (joined from `users`
 *     collection at query time) for cross-game identity continuity,
 *     but it's not required to appear on the leaderboard.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts
 *   - `bestScore: -1` for the top-N leaderboard sort
 */

import mongoose from 'mongoose';

const basketballScoreSchema = new mongoose.Schema({
    // Identity (from the arcade bot's signed JWT)
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    // Score state
    bestScore:         { type: Number, required: true, default: 0, min: 0 },
    totalSubmissions:  { type: Number, required: true, default: 0, min: 0 },

    // Timestamps
    firstSubmittedAt:  { type: Date, default: Date.now },
    lastSubmittedAt:   { type: Date, default: Date.now },
    bestAchievedAt:    { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// Compound index — top-N leaderboard query: sort by bestScore desc,
// tiebreak by bestAchievedAt asc (first to reach a score wins ties).
basketballScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });

const BasketballScore = mongoose.model('BasketballScore', basketballScoreSchema);
export default BasketballScore;
