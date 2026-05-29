/**
 * PoolElo — per-user Elo rating for pool matchmaking.
 *
 * One document per player. Updated on every PvP match (Quick, Wagered,
 * Tournament round). Vs-Computer + Marathon do NOT touch this — those
 * are skill-isolated solo modes (POOL_DESIGN_TARGET.md §7.3, design spec §3.3/3.5).
 *
 * Matchmaking sources this collection: query players whose rating is
 * within ±100 of the searcher's, expand by +50 every 10s (max ±400).
 * Anti-smurf:
 *   - new accounts marked `provisional: true` until matchCount >= 10
 *   - provisional players get wider matchmaking spread
 *   - rating cannot drop below the floor (200) — prevents intentional tanking
 *
 * Decay:
 *   - -5 rating per week of inactivity, capped at the floor
 *   - `lastDecayAt` tracks when decay last applied; weekly cron processes this
 *
 * Identity:
 *   - keyed by EITHER telegramUserId OR walletAddress (whichever the
 *     user uses to play). Bot-only players never link a wallet; web/Privy
 *     users may not link Telegram. The arcade-bot↔wallet binding in `users`
 *     resolves cross-identity if both are present.
 *
 * Index strategy:
 *   - telegramUserId unique sparse + walletAddress unique sparse
 *   - rating + provisional → matchmaking sweep (active players in a band)
 *   - lastActiveAt → decay sweeper
 */

import mongoose from 'mongoose';

const poolEloSchema = new mongoose.Schema({
    // Identity (at least one is set; usually both for bot users who connect a wallet)
    telegramUserId: { type: Number, default: null, sparse: true, unique: true },
    walletAddress:  { type: String, default: null, sparse: true, unique: true },
    callsign:       { type: String, default: null },                // display only; canonical lives in `users`

    // Rating state
    rating:         { type: Number, required: true, default: 1000, min: 200 },
    kFactor:        { type: Number, required: true, default: 32, min: 8, max: 64 },
    provisional:    { type: Boolean, default: true },               // false after 10 PvP matches
    matchCount:     { type: Number, default: 0, min: 0 },           // PvP matches only

    // Win/loss tracking
    wins:           { type: Number, default: 0 },
    losses:         { type: Number, default: 0 },
    draws:          { type: Number, default: 0 },                   // rare in 8-ball; reserved

    // Records
    highestRating:        { type: Number, default: 1000 },
    highestRatingAt:      { type: Date, default: Date.now },
    longestWinStreak:     { type: Number, default: 0 },
    currentWinStreak:     { type: Number, default: 0 },

    // Decay book-keeping
    lastActiveAt:   { type: Date, default: Date.now, index: true },
    lastDecayAt:    { type: Date, default: Date.now },

    // Anti-smurf gates (mirrors design spec §4)
    canWagerAboveLowStake: { type: Boolean, default: false },       // unlocks at matchCount >= 25
    canEnterPaidTourney:   { type: Boolean, default: false }        // unlocks at matchCount >= 10
}, {
    timestamps: true
});

// Matchmaking sweep: find players within a rating band, not currently in a match
poolEloSchema.index({ rating: 1, provisional: 1, lastActiveAt: -1 });

const PoolElo = mongoose.model('PoolElo', poolEloSchema);
export default PoolElo;
