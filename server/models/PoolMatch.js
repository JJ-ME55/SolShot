/**
 * PoolMatch — record of a single 8-ball pool match.
 *
 * One document per match instance. Covers every mode (quick, wagered,
 * vs computer, tournament round, marathon round, practice). Lives long
 * enough to support 72h match wall-clock cap (POOL_DESIGN_TARGET.md §7.3)
 * and to populate post-match Pool Cards + replay data.
 *
 * Identity:
 *   - players[].telegramUserId for arcade-bot users (always present)
 *   - players[].walletAddress for Privy / wallet-keyed users (present
 *     for wagered matches; otherwise opportunistic)
 *   - players[].callsign is the human-readable handle shown on the Pool Card
 *
 * Shot history:
 *   - Every shot persisted as { shooter, params, result }. Replay can
 *     be reconstructed deterministically from rackSeed + shot params on
 *     the same physics engine version.
 *   - Server adjudicates result; client never decides outcomes (per the
 *     server-authoritative non-negotiable in POOL_DESIGN_TARGET.md §7.3).
 *
 * Async cadence:
 *   - currentTurn.syncTimerExpiresAt = 45s after "READY TO SHOOT" tap.
 *   - currentTurn.asyncWindowExpiresAt = 12h after "your turn" event.
 *   - expiresAt = startedAt + 72h (hard match cap).
 *   - Background cron processes timeouts → forfeit / pure-skip.
 *
 * Index strategy:
 *   - matchId unique → fast lookup
 *   - players.telegramUserId → "my matches" queries
 *   - status + expiresAt → cron sweeping
 *   - tournamentId / marathonRunId → bracket / run reconstruction
 */

import mongoose from 'mongoose';

const shotSchema = new mongoose.Schema({
    shooterIdx:    { type: Number, required: true, min: 0, max: 1 },
    aimAngle:      { type: Number, required: true },              // radians
    power:         { type: Number, required: true, min: 0, max: 1 },
    spinX:         { type: Number, default: 0, min: -1, max: 1 }, // -1=left, +1=right
    spinY:         { type: Number, default: 0, min: -1, max: 1 }, // -1=backspin, +1=topspin
    cueBallPlacedAt: { x: Number, y: Number },                    // populated on break + ball-in-hand
    pocketedBalls: [{ type: Number }],                            // ball IDs (1-15, 0=cue)
    firstTouchedBallColor: { type: String, enum: ['red','yellow','black','white',null], default: null },
    foul:          { type: Boolean, default: false },
    foulReason:    { type: String, default: null },               // 'scratch'|'no_rail'|'wrong_color'|'jumped_ball'|'timeout'|null
    scratch:       { type: Boolean, default: false },             // cue ball pocketed
    ballInHandToOpponent: { type: Boolean, default: false },
    isBreak:       { type: Boolean, default: false },
    turnContinues: { type: Boolean, default: false },             // shooter pocketed legally → keeps turn
    rackEnded:     { type: Boolean, default: false },             // 8-ball pocketed legally OR illegally
    rackWonByShooter: { type: Boolean, default: false },
    durationMs:    { type: Number, default: 0 },                  // wall-clock spent on this shot (READY tap → release)
    takenAt:       { type: Date, default: Date.now }
}, { _id: false });

const rackSchema = new mongoose.Schema({
    rackNumber:    { type: Number, required: true },              // 1, 2, 3 for BO3 / BO5
    rackSeed:      { type: String, required: true },              // CSPRNG-derived, replayable
    breakerIdx:    { type: Number, required: true, min: 0, max: 1 },
    shots:         [shotSchema],
    winnerIdx:     { type: Number, default: null },
    endedAt:       { type: Date, default: null }
}, { _id: false });

const playerSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, default: null, index: true },
    walletAddress:    { type: String, default: null },
    callsign:         { type: String, default: null },
    prestigeTier:     { type: Number, default: 0, min: 0, max: 5 }, // 0=unranked → 5=diamond
    isAiBot:          { type: Boolean, default: false },
    aiDifficulty:     { type: String, enum: ['easy','medium','hard','insane',null], default: null },

    // ELO snapshot — for transparency and post-match reveal
    eloAtStart:       { type: Number, default: null },
    eloAtEnd:         { type: Number, default: null },
    eloDelta:         { type: Number, default: null },

    // Ball group + progress (snapshot at match end)
    color:            { type: String, enum: ['red','yellow','open',null], default: 'open' },
    ballsRemaining:   { type: Number, default: 7, min: 0, max: 7 },

    // Stake + winnings (wagered mode only)
    depositTx:        { type: String, default: null },             // escrow deposit TX signature

    // Outcome
    isWinner:         { type: Boolean, default: false }
}, { _id: false });

const turnStateSchema = new mongoose.Schema({
    activePlayerIdx:        { type: Number, required: true, min: 0, max: 1 },
    asyncWindowExpiresAt:   { type: Date, required: true },        // 12h from "your turn"
    syncTimerStartedAt:     { type: Date, default: null },         // populated when "READY TO SHOOT" tapped
    syncTimerExpiresAt:     { type: Date, default: null },         // syncTimerStartedAt + 45s
    isBallInHand:           { type: Boolean, default: false },
    isBreakingShot:         { type: Boolean, default: false }
}, { _id: false });

/**
 * Single ball snapshot — schema mirrors sim's SerializableBall.
 * One of these per ball is stored in PoolMatch.currentBallState so that
 * a player resuming a 12h-async match sees the table EXACTLY as it was
 * after the previous shot (no client-side replay needed).
 */
const ballStateSchema = new mongoose.Schema({
    id:        { type: Number, required: true, min: 0, max: 15 },
    color:     { type: String, required: true, enum: ['white','red','yellow','black'] },
    position:  { x: { type: Number, required: true }, y: { type: Number, required: true } },
    velocity:  { x: { type: Number, default: 0 }, y: { type: Number, default: 0 } },
    spinX:     { type: Number, default: 0, min: -1, max: 1 },
    spinY:     { type: Number, default: 0, min: -1, max: 1 },
    visible:   { type: Boolean, default: true }
}, { _id: false });

const poolMatchSchema = new mongoose.Schema({
    matchId: { type: String, required: true, unique: true, index: true },

    // Mode + format
    mode:    { type: String, required: true, enum: ['quick','wagered','vs_computer','tournament','marathon','practice'] },
    format:  { type: String, required: true, enum: ['BO1','BO3','BO5'], default: 'BO1' },

    // Two players (idx 0 + 1). For vs_computer + marathon, idx 1 is an AI bot.
    players: { type: [playerSchema], validate: v => v.length === 2 },

    // Rack history (always at least 1; BO3/BO5 add more)
    racks:        [rackSchema],
    currentRackIdx: { type: Number, default: 0 },

    // Turn state (mutable as match progresses)
    currentTurn: turnStateSchema,

    // Current ball state — populated at rack start, updated after every
    // simulated shot (server replaces it with sim's finalBalls). Async
    // resume reads this to render the table EXACTLY as it was after the
    // last shot. 16 balls total (cue + 1-7 solids + 8 + 9-15 stripes);
    // visible:false entries represent pocketed balls (kept for ID stability).
    currentBallState: [ballStateSchema],

    // Stake (wagered mode only)
    stake: {
        amount:   { type: Number, default: 0 },
        currency: { type: String, enum: ['SOL','gold','tickets',null], default: null },
        escrowPDA: { type: String, default: null },                // Anchor escrow account
        settlementTx: { type: String, default: null },             // SOL distribution TX
        settledAt: { type: Date, default: null }
    },

    // Cross-mode linkage
    tournamentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    tournamentRound: { type: Number, default: null },               // round number within bracket
    marathonRunId:  { type: mongoose.Schema.Types.ObjectId, ref: 'MarathonRun', default: null, index: true },

    // Status machine
    status: {
        type: String,
        required: true,
        enum: ['pending','in_progress','completed','expired','forfeited','cancelled'],
        default: 'pending',
        index: true
    },

    // Outcome (populated at status='completed' or 'forfeited')
    winnerIdx:    { type: Number, default: null, min: 0, max: 1 },
    winReason:    { type: String, enum: ['normal','forfeit','async_timeout','opponent_disconnect','wall_clock_expired',null], default: null },

    // Rewards (denormalised for fast post-match Pool Card render)
    rewards: {
        winnerGold:     { type: Number, default: 0 },
        winnerTickets:  { type: Number, default: 0 },
        winnerSolLamports: { type: Number, default: 0 },           // lamports = SOL × 10^9
        loserGold:      { type: Number, default: 0 },              // 0 for losses; floor TKT goes to loser too
        loserTickets:   { type: Number, default: 0 },
        treasurySolLamports: { type: Number, default: 0 },         // 7% rake
        opsSolLamports: { type: Number, default: 0 }               // 3% rake
    },

    // Timestamps
    startedAt:    { type: Date, default: Date.now },
    lastShotAt:   { type: Date, default: null },
    endedAt:      { type: Date, default: null },
    expiresAt:    { type: Date, required: true, index: true }      // startedAt + 72h
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' }
});

// Compound: cron sweeper for expired matches
poolMatchSchema.index({ status: 1, expiresAt: 1 });

// "My recent matches" query
poolMatchSchema.index({ 'players.telegramUserId': 1, endedAt: -1 });
poolMatchSchema.index({ 'players.walletAddress': 1, endedAt: -1 });

const PoolMatch = mongoose.model('PoolMatch', poolMatchSchema);
export default PoolMatch;
