/**
 * DrillDeepScore — global all-time leaderboard for DRILLDEEP (the Motherload-style
 * mining game at the-arcade-drilldeep.vercel.app).
 *
 * Mirrors KeepieUppiesScore / BasketballScore (TG-keyed, separate collection, same index
 * strategy) and additionally records the depth + cash of the player's best run, so the
 * board can show "how deep" alongside the score.
 */

import mongoose from 'mongoose';

const drillDeepScoreSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    bestScore:        { type: Number, required: true, default: 0, min: 0 },
    bestDepth:        { type: Number, default: 0, min: 0 },   // metres reached on the best run
    bestCash:         { type: Number, default: 0, min: 0 },   // cash banked on the best run
    totalSubmissions: { type: Number, required: true, default: 0, min: 0 },

    firstSubmittedAt: { type: Date, default: Date.now },
    lastSubmittedAt:  { type: Date, default: Date.now },
    bestAchievedAt:   { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

drillDeepScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });

const DrillDeepScore = mongoose.model('DrillDeepScore', drillDeepScoreSchema);
export default DrillDeepScore;
