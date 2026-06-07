/**
 * ShootoutStats — lifetime per-user Shootout aggregate.
 *
 * Phase C Checkpoint 1 (Task B.3). Feeds the Phase B leaderboard
 * (deferred — see Phase B of the design doc) and a "career stats" surface.
 *
 * Why TWO scores (rawKD + rankScore):
 *   - `rawKD` is the honest, unadjusted K/D shown next to a player's name.
 *     Compact, easy to reason about, what users expect.
 *   - `rankScore` is the leaderboard sort key. It can incorporate volume,
 *     time-decay, win-rate, and DC penalties (Phase D §6) so that two
 *     players with the same K/D rank differently based on activity and
 *     reliability. Keeping it separate lets the display value remain
 *     simple while the ranking can evolve without changing on-doc shape.
 *
 * Both score fields are indexed so the leaderboard sort + the per-user
 * display lookup both stay cheap. `telegramUserId` is the natural key
 * (one stats doc per user — upserted on match end).
 */

import mongoose from 'mongoose';

const shootoutStatsSchema = new mongoose.Schema({
    telegramUserId: { type: Number, required: true, unique: true, index: true },
    displayName:    { type: String, required: true },
    totalKills:     { type: Number, default: 0 },
    totalDeaths:    { type: Number, default: 0 },
    totalMatches:   { type: Number, default: 0 },
    wins:           { type: Number, default: 0 },
    losses:         { type: Number, default: 0 },
    rawKD:          { type: Number, default: 0, index: true },  // for display
    rankScore:      { type: Number, default: 0, index: true },  // for leaderboard sort
    lastPlayedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const ShootoutStats = mongoose.model('ShootoutStats', shootoutStatsSchema);
export default ShootoutStats;
