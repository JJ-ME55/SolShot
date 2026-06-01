/**
 * MarathonRun — solo trick-shot lives mode.
 *
 * Per Side Pocket DECISIONS_2026-06-01 §5: marathon is a trick-shot
 * lives mode (replaces the bot-ladder shape). Player has 3 lives,
 * attempts curated trick-shot setups from a server-held catalogue,
 * miss = -1 life, 0 lives = run ends. Voluntary Bank Streak at any
 * point.
 *
 * Key design points (per DECISIONS doc):
 *   - NO difficulty floor / NO Easy-Hard picker — one entry mode
 *   - ONE leaderboard (daily / weekly / all-time scopes), not per-difficulty
 *   - Internal tier ladder rises automatically as run progresses
 *   - Milestone TKT bonuses at streaks of 5 / 10 / 20 completed setups
 *   - Perfect-run bonus (zero misses) at run-end
 *
 * Setup catalogue lives in services/pool/marathon-catalogue.js, sourced
 * from Docs/arcade/pool/design/TRICK_SHOT_LIBRARY_v0.md.
 *
 * Index strategy:
 *   - runId unique → fast lookup
 *   - playerId + endedAt → "my marathon history"
 *   - status + endedAt + totalScore desc → main leaderboard sweep
 *   - status + endedAt + longestStreak desc → streak-board variant
 */

import mongoose from 'mongoose';

/**
 * One entry per setup attempted during a run.
 * `outcome: completed` advances streak; `lives_exhausted` or `skipped`
 * end the streak (skipped also advances run but adds no score).
 */
const setupRoundSchema = new mongoose.Schema({
    roundNumber:    { type: Number, required: true, min: 1 },
    setupId:        { type: String, required: true },                  // catalogue id, e.g. 'T1-01'
    setupTier:      { type: Number, required: true, min: 1, max: 4 },
    setupName:      { type: String, required: true },
    winCondition:   { type: String, default: null },                   // 'pot_target_ball:8' etc

    matchId:        { type: mongoose.Schema.Types.ObjectId, ref: 'PoolMatch', default: null },

    outcome:        { type: String, required: true, enum: ['completed','lives_exhausted','skipped'] },
    attemptsThisSetup: { type: Number, default: 1, min: 1 },           // 1-3 attempts (limited by remaining lives)
    livesUsedThisRound: { type: Number, default: 0, min: 0 },

    shotCount:      { type: Number, default: 0 },
    durationMs:     { type: Number, default: 0 },
    goldEarned:     { type: Number, default: 0 },                      // base + tier multiplier (no streak bonus here)
    completedAt:    { type: Date, default: Date.now }
}, { _id: false });

const marathonRunSchema = new mongoose.Schema({
    runId: { type: String, required: true, unique: true, index: true },

    // Player identity
    telegramUserId: { type: Number, default: null, index: true },
    walletAddress:  { type: String, default: null, index: true },
    callsign:       { type: String, default: null },

    // Lives state
    livesAtStart:    { type: Number, default: 3, min: 1, max: 5 },
    livesRemaining:  { type: Number, default: 3, min: 0 },

    // Score state (denormalised for leaderboard queries)
    setupsCompleted:    { type: Number, default: 0, min: 0 },          // count of outcome='completed' rounds
    setupsAttempted:    { type: Number, default: 0, min: 0 },          // total rounds (completed + skipped + ended)
    currentStreak:      { type: Number, default: 0, min: 0 },          // consecutive completions (resets on skip/fail)
    longestStreak:      { type: Number, default: 0, min: 0 },          // best streak in this run
    perfectRun:         { type: Boolean, default: true },              // flips false on first miss/skip; stays for entire run
    totalScore:         { type: Number, default: 0, min: 0 },          // sum of tier-weighted scores
    highestTierReached: { type: Number, default: 1, min: 1, max: 4 },

    // Per-setup history (one entry per attempted setup)
    rounds: [setupRoundSchema],

    // Rewards (totals across the run)
    earnedGold:    { type: Number, default: 0 },
    earnedTickets: { type: Number, default: 0 },
    milestoneTicketsClaimed: [{
        atStreak: Number,
        amount: Number,
        claimedAt: Date
    }],

    // Status
    status: {
        type: String,
        required: true,
        enum: ['active','ended_lives_exhausted','ended_cashout','ended_disconnect'],
        default: 'active',
        index: true
    },

    startedAt:  { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
    durationMs: { type: Number, default: 0 }
}, {
    timestamps: true
});

// ────────────────────────────────────────────────────────────────────
// Single leaderboard — score-board + streak-board variants
// ────────────────────────────────────────────────────────────────────

marathonRunSchema.index({ status: 1, endedAt: -1, totalScore: -1 });
marathonRunSchema.index({ status: 1, endedAt: -1, longestStreak: -1 });

// "My marathon history"
marathonRunSchema.index({ telegramUserId: 1, endedAt: -1 });
marathonRunSchema.index({ walletAddress: 1, endedAt: -1 });

const MarathonRun = mongoose.model('MarathonRun', marathonRunSchema);
export default MarathonRun;
