/**
 * RugRunScore — global all-time leaderboard for the standalone
 * RUG RUN game (served from the arcade hub at /play/rug-run).
 *
 * One document per Telegram user. Two ranked metrics:
 *   - `bestScore`     — highest single-run banked amount (int = round(banked×100)).
 *                       Drives the DAILY board (metric='score').
 *   - `bestStreakPnl` — highest accumulated streak multiplier / PnL across a
 *                       run. RUG RUN's weekly/all-time board ranks on this
 *                       (metric='streak') because riding the pump and banking
 *                       before the rug is the real skill expression, not a
 *                       single banked number.
 *
 * New submissions only raise `bestScore` / `bestStreakPnl` if they beat the
 * existing best (each tracked independently). `totalSubmissions` counts every
 * submission for basic "how engaged is this player" telemetry.
 *
 * Why TG-keyed instead of wallet-keyed:
 *   - RUG RUN standalone v1 doesn't require a wallet (free play).
 *   - The arcade bot mints a JWT carrying TG identity when the user
 *     taps /rugrun; the client forwards that JWT with each score
 *     submission. So every submission has a verified TG id.
 *   - Wallet is captured opportunistically (joined from `users`
 *     collection at query time) for cross-game identity continuity,
 *     but it's not required to appear on the leaderboard.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts
 *   - `bestScore: -1` for the daily (score) top-N sort
 *   - `bestStreakPnl: -1` for the weekly/all-time (streak) top-N sort
 */

import mongoose from 'mongoose';

const rugRunScoreSchema = new mongoose.Schema({
    // Identity (from the arcade bot's signed JWT)
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    // Score state — banked amount (int = round(banked×100))
    bestScore:         { type: Number, required: true, default: 0, min: 0 },
    totalSubmissions:  { type: Number, required: true, default: 0, min: 0 },

    // Streak PnL state — accumulated streak multiplier (the weekly/all-time metric)
    bestStreakPnl:     { type: Number, required: true, default: 0 },

    // Timestamps
    firstSubmittedAt:  { type: Date, default: Date.now },
    lastSubmittedAt:   { type: Date, default: Date.now },
    bestAchievedAt:    { type: Date, default: Date.now },
    bestStreakPnlAt:   { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// Compound index — daily (score) top-N: sort by bestScore desc, tiebreak by
// bestAchievedAt asc (first to reach a score wins ties).
rugRunScoreSchema.index({ bestScore: -1, bestAchievedAt: 1 });
// Compound index — weekly/all-time (streak) top-N: sort by bestStreakPnl desc,
// tiebreak by bestStreakPnlAt asc.
rugRunScoreSchema.index({ bestStreakPnl: -1, bestStreakPnlAt: 1 });

const RugRunScore = mongoose.model('RugRunScore', rugRunScoreSchema);
export default RugRunScore;
