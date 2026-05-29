/**
 * MarathonRun — solo high-score session vs progressively harder AI bots.
 *
 * One document per run attempt. Per POOL_DESIGN_TARGET.md design spec §3.5
 * + §6, a run is a chain of matches vs bots where each win raises the
 * bot's difficulty. Run ends when player loses OR voluntarily banks the
 * streak.
 *
 * Two parallel score axes:
 *   - streak          = consecutive wins (1 → 2 → ...)
 *   - perfectTables   = bots beaten without missing a single shot
 *
 * Per-run leaderboards:
 *   - daily / weekly / all-time
 *   - per starting-difficulty board (Easy marathon ≠ Insane marathon)
 *
 * Currency:
 *   - earnedGold rises per round won; milestone TKT bonuses at 5, 10, 20 streak
 *   - solo mode → ELO untouched
 *
 * Index strategy:
 *   - runId unique → fast lookup
 *   - playerId + endedAt → "my marathon history"
 *   - status + endedAt → leaderboard sweep (top streak in a time window)
 *   - startingDifficulty + status + streak → per-difficulty board ranking
 */

import mongoose from 'mongoose';

const botRoundSchema = new mongoose.Schema({
    roundNumber:    { type: Number, required: true, min: 1 },
    botDifficulty:  { type: String, required: true, enum: ['easy','medium','hard','insane'] },
    botEloEstimate: { type: Number, default: 1000 },
    matchId:        { type: mongoose.Schema.Types.ObjectId, ref: 'PoolMatch', default: null },
    won:            { type: Boolean, required: true },
    perfectTable:   { type: Boolean, default: false },              // zero missed shots
    shotCount:      { type: Number, default: 0 },
    longestRun:     { type: Number, default: 0 },                   // longest consecutive pots in this rack
    durationMs:     { type: Number, default: 0 },
    goldEarned:     { type: Number, default: 0 },                   // contribution to run total
    completedAt:    { type: Date, default: Date.now }
}, { _id: false });

const marathonRunSchema = new mongoose.Schema({
    runId: { type: String, required: true, unique: true, index: true },

    // Player identity
    telegramUserId: { type: Number, default: null, index: true },
    walletAddress:  { type: String, default: null, index: true },
    callsign:       { type: String, default: null },

    // Configuration
    startingDifficulty: { type: String, required: true, enum: ['easy','medium','hard','insane'] },

    // Progress (denormalised for board queries)
    streak:           { type: Number, default: 0, min: 0 },           // consecutive wins
    perfectTables:    { type: Number, default: 0, min: 0 },           // zero-miss tables
    highestDifficulty: { type: String, enum: ['easy','medium','hard','insane'], default: 'easy' },
    longestRunInSingleTurn: { type: Number, default: 0 },              // best single-turn pot streak

    // Per-bot history
    rounds: [botRoundSchema],

    // Rewards (totals across the run)
    earnedGold:    { type: Number, default: 0 },
    earnedTickets: { type: Number, default: 0 },
    milestoneTicketsClaimed: [{                                       // which milestone bonuses fired
        atStreak: Number,
        amount: Number,
        claimedAt: Date
    }],

    // Status
    status: {
        type: String,
        required: true,
        enum: ['active','ended_loss','ended_cashout','ended_disconnect'],
        default: 'active',
        index: true
    },

    startedAt: { type: Date, default: Date.now },
    endedAt:   { type: Date, default: null },
    durationMs: { type: Number, default: 0 }
}, {
    timestamps: true
});

// Leaderboard sweep — top streaks in a time window per starting difficulty
marathonRunSchema.index({ startingDifficulty: 1, status: 1, streak: -1, endedAt: -1 });
marathonRunSchema.index({ startingDifficulty: 1, status: 1, perfectTables: -1, endedAt: -1 });

// "My marathon history"
marathonRunSchema.index({ telegramUserId: 1, endedAt: -1 });
marathonRunSchema.index({ walletAddress: 1, endedAt: -1 });

const MarathonRun = mongoose.model('MarathonRun', marathonRunSchema);
export default MarathonRun;
