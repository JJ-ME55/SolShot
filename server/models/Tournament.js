/**
 * Tournament — bracket-based tournament across one game.
 *
 * One document per tournament instance. Designed game-agnostic from
 * the start (`gameSlug` field) so the same engine drives pool, basketball,
 * or future games — but pool is the first consumer (POOL_DESIGN_TARGET.md
 * §3.4 / designer spec §5).
 *
 * Formats supported: 8 / 16 / 32-player single-elimination.
 *
 * Cadences:
 *   - daily_free    — 100 G entry, 8-player, 1/day at 00:00 UTC
 *   - daily_paid    — 5 TKT entry, 16-player, 1/day at 18:00 UTC
 *   - weekly        — 25 TKT entry, 32-player, Sundays
 *   - monthly       — 100 TKT entry, 32-player, 1st of month + treasury sponsor pool
 *
 * Prize distribution (per format) is locked at tournament creation time
 * — admin sponsorships can override defaults.
 *
 * Bracket model:
 *   - Stored as flat `matches[]` with each match carrying its round number
 *     and the two slot indexes that feed it. Reading top-to-bottom gives
 *     the bracket tree.
 *   - When a PoolMatch is created for a bracket position, its _id is
 *     stored in `matches[i].matchId`. PoolMatch.tournamentId points back.
 *
 * Lifecycle:
 *   registering → live → finished
 *   (cancelled state for admin-killed tournaments before start)
 *
 * Index strategy:
 *   - tournamentId unique → fast lookup
 *   - status + startsAt → "what's active / what's upcoming" queries
 *   - entrants.playerId → "tournaments I'm in"
 */

import mongoose from 'mongoose';

const prizeSchema = new mongoose.Schema({
    rank:        { type: Number, required: true, min: 1 },          // 1st place, 2nd, etc
    share:       { type: Number, required: true, min: 0, max: 1 },  // share of pool, 0–1
    minAmount:   { type: Number, default: 0 },                       // floor (cap to ensure non-zero prize)
    currency:    { type: String, required: true, enum: ['gold','tickets'] }
}, { _id: false });

const entrantSchema = new mongoose.Schema({
    seedIdx:        { type: Number, required: true, min: 0 },        // 0..N-1, position in bracket
    telegramUserId: { type: Number, default: null },
    walletAddress:  { type: String, default: null },
    callsign:       { type: String, default: null },
    prestigeTier:   { type: Number, default: 0, min: 0, max: 5 },
    eloAtEntry:     { type: Number, default: null },

    registeredAt:   { type: Date, default: Date.now },

    // Progress through bracket
    eliminated:     { type: Boolean, default: false },
    eliminatedAtRound: { type: Number, default: null },
    finalPlacement: { type: Number, default: null },                 // 1=champion, 2=runner-up, etc

    // Prize claimed
    prizeWonAmount: { type: Number, default: 0 },
    prizeWonCurrency: { type: String, enum: ['gold','tickets',null], default: null },
    prizeClaimedAt: { type: Date, default: null }
}, { _id: false });

const bracketMatchSchema = new mongoose.Schema({
    round:           { type: Number, required: true, min: 1 },       // 1=first round, max=log2(bracketSize)
    matchIdxInRound: { type: Number, required: true, min: 0 },
    seedA:           { type: Number, required: true, min: 0 },       // entrant seedIdx
    seedB:           { type: Number, default: null },                // null if bye
    matchId:         { type: mongoose.Schema.Types.ObjectId, ref: 'PoolMatch', default: null },
    winnerSeedIdx:   { type: Number, default: null },
    advancesTo:      {                                                // index into bracket of next-round match
        round: Number,
        matchIdxInRound: Number,
        slot: { type: String, enum: ['A','B'] }
    },
    startedAt:       { type: Date, default: null },
    completedAt:     { type: Date, default: null }
}, { _id: false });

const tournamentSchema = new mongoose.Schema({
    tournamentId: { type: String, required: true, unique: true, index: true },

    // What game + what cadence
    gameSlug:     { type: String, required: true, default: 'pool', index: true },
    type:         { type: String, required: true, enum: ['daily_free','daily_paid','weekly','monthly','sponsor'] },
    bracketSize:  { type: Number, required: true, enum: [8, 16, 32] },

    // Display
    name:         { type: String, required: true },                  // "Daily Free", "Weekly Showcase", "Founders' Cup"
    bannerArt:    { type: String, default: null },                   // CDN URL
    sponsorLogo:  { type: String, default: null },                   // optional sponsor branding
    sponsorTheme: { type: String, default: null },

    // Entry
    entry: {
        cost:     { type: Number, required: true, min: 0 },
        currency: { type: String, required: true, enum: ['gold','tickets'] }
    },

    // Prize pool
    prizePoolBase: { type: Number, default: 0 },                     // treasury seed (e.g. monthly +10000 TKT)
    rakeShare:     { type: Number, default: 0.1, min: 0, max: 0.5 }, // 10% rake by default
    prizeDistribution: [prizeSchema],

    // Bracket
    entrants:     [entrantSchema],
    matches:      [bracketMatchSchema],
    matchFormat:  { type: String, enum: ['BO1','BO3','BO5'], default: 'BO1' },
    finalsFormat: { type: String, enum: ['BO1','BO3','BO5'], default: 'BO3' },

    // Schedule
    registrationOpensAt: { type: Date, required: true },
    startsAt:            { type: Date, required: true, index: true },
    endsBy:              { type: Date, required: true },             // hard wall-clock; if overrun, finish what you can
    roundWindowMs:       { type: Number, default: 3600000 },         // 1h per round default

    // Status
    status: {
        type: String,
        required: true,
        enum: ['registering','live','finished','cancelled'],
        default: 'registering',
        index: true
    },

    finishedAt:  { type: Date, default: null },
    championSeedIdx: { type: Number, default: null }
}, {
    timestamps: true
});

// "What's running / next" query
tournamentSchema.index({ status: 1, startsAt: 1 });

// "Tournaments I'm in" — match on either identity
tournamentSchema.index({ 'entrants.telegramUserId': 1, startsAt: -1 });
tournamentSchema.index({ 'entrants.walletAddress': 1, startsAt: -1 });

const Tournament = mongoose.model('Tournament', tournamentSchema);
export default Tournament;
