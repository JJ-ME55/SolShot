/**
 * CritterKartCareer — career-aggregate leaderboard for Critter Kart
 * (lifted from BillionaireBonkClub/critter-kart, deployed at
 *  the-arcade-critter-kart.vercel.app / thearcade.gg/play/critter-kart).
 *
 * Mario-Kart-Grand-Prix scoring model (per JJ's call, "Option A"):
 *   - One doc per Telegram user.
 *   - On every race finish, totalPoints accrues by the position-points
 *     submitted (e.g. 1st = 15, 2nd = 12, 3rd = 10, 4th = 7, 5th = 6, 6th = 4).
 *   - Wins (1st place) and podiums (top 3) tracked separately for headline stats.
 *   - bestLapTime is the all-time fastest single lap, ms; lower is better.
 *
 * Distinct from the skill-leaderboard pattern (FreeKicksScore etc) which
 * stores a `bestScore` — racers are aggregate-career-shaped, like SolShot.
 *
 * Index strategy:
 *   - `telegramUserId` unique → idempotent upserts on race finish
 *   - `totalPoints: -1, lastRaceAt: 1` → top-N + ties broken by who-got-there-first
 */

import mongoose from 'mongoose';

const critterKartCareerSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true, unique: true, index: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },

    // ── Headline aggregate (sort by totalPoints DESC) ──────────────────
    totalPoints:      { type: Number, required: true, default: 0, min: 0 },

    // ── Per-race counters ──────────────────────────────────────────────
    races:            { type: Number, required: true, default: 0, min: 0 },
    wins:             { type: Number, required: true, default: 0, min: 0 },  // 1st place finishes
    podiums:          { type: Number, required: true, default: 0, min: 0 },  // top-3 finishes

    // ── Best-lap (independent stat, lower is better; ms) ───────────────
    bestLapTimeMs:    { type: Number, default: null, min: 0 },
    bestLapAchievedAt:{ type: Date, default: null },

    // ── Timestamps ─────────────────────────────────────────────────────
    firstRaceAt:      { type: Date, default: Date.now },
    lastRaceAt:       { type: Date, default: Date.now },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// Headline-stat sort index — totalPoints DESC then lastRaceAt ASC so
// ties are broken in favour of whoever hit the score first.
critterKartCareerSchema.index({ totalPoints: -1, lastRaceAt: 1 });

const CritterKartCareer = mongoose.model('CritterKartCareer', critterKartCareerSchema);
export default CritterKartCareer;
