/**
 * CritterKartRace — per-race state document.
 *
 * Tracks a single race's full lifecycle from creation to settlement.
 * Career aggregates live in CritterKartCareer; this is the transient
 * per-race record. Doc lifetime ~7d post-settlement for analytics +
 * dispute review, then archived.
 *
 * State machine (matches docs/CRITTER_KART_MULTIPLAYER_DESIGN.md):
 *   matched → loading → countdown → racing → finished → settled
 *
 * Settlement responsibilities (in lifecycle.js):
 *   - Compute final positions (1..N, ties broken by total race time)
 *   - Award position points per player
 *   - Call submitRace() per player → updates CritterKartCareer
 *   - Move state to 'settled' and flush
 *
 * Wager block is null in v1 (free races only). When wagered ships,
 * it'll carry escrow-v2 match id + lamports so the same doc tracks
 * both the gameplay state and the on-chain settlement target.
 */

import mongoose from 'mongoose';

const RACE_STATES = ['matched', 'loading', 'countdown', 'racing', 'finished', 'settled', 'cancelled'];
const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

const racePlayerSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, default: null },  // null for bots
    displayName:      { type: String, required: true },
    kartId:           { type: String, required: true },  // unique within race
    racerId:          { type: String, default: 'rusty' },  // Fish-roster character id
    isBot:            { type: Boolean, required: true, default: false },

    socketId:         { type: String, default: null },   // current socket; null if disconnected
    joinedAt:         { type: Date, default: Date.now },
    readyAt:          { type: Date, default: null },     // null until critterkart:ready received

    // Filled on race finish:
    finishPosition:   { type: Number, default: null, min: 1, max: MAX_PLAYERS },
    finishTimeMs:     { type: Number, default: null, min: 0 },
    bestLapMs:        { type: Number, default: null, min: 0 },
    lapTimes:         { type: [Number], default: [] },   // ms per completed lap

    // Status — set to 'dnf' on disconnect mid-race.
    status:           { type: String, enum: ['racing', 'finished', 'dnf'], default: 'racing' },

    // Career-points awarded at settlement (denormalised — same value
    // can be re-derived from finishPosition + format, but storing makes
    // post-hoc analytics cheaper).
    pointsAwarded:    { type: Number, default: 0, min: 0 },
}, { _id: false });

const critterKartRaceSchema = new mongoose.Schema({
    raceId:           { type: String, required: true, unique: true, index: true },
    state:            { type: String, required: true, enum: RACE_STATES, default: 'matched' },

    format: {
        laps:         { type: Number, required: true, default: 3, min: 1, max: 10 },
        minPlayers:   { type: Number, required: true, default: MIN_PLAYERS },
        maxPlayers:   { type: Number, required: true, default: MAX_PLAYERS },
    },

    track:            { type: String, required: true, default: 'default' },  // future: multi-track

    players:          { type: [racePlayerSchema], default: [] },

    // Wager block — v1 always null. When wagered ships, this carries
    // the escrow-v2 match id + lamport stake per player.
    wager: {
        lamports:     { type: Number, default: null, min: 0 },
        escrowMatchId:{ type: String, default: null },
    },

    // Input stream replay storage — v1 null (server-auth physics not
    // wired yet). Session 2 will start writing here when wagered hooks
    // need replay logs for dispute review.
    inputLog:         { type: mongoose.Schema.Types.Mixed, default: null },

    // Timestamps drive the state machine + cleanup jobs.
    createdAt:        { type: Date, default: Date.now },
    matchedAt:        { type: Date, default: Date.now },
    loadingStartedAt: { type: Date, default: null },
    countdownStartedAt:{ type: Date, default: null },
    racingStartedAt:  { type: Date, default: null },
    endedAt:          { type: Date, default: null },
    settledAt:        { type: Date, default: null },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// Indexes:
//   raceId: unique (queries by id)
//   state + matchedAt: queue-ticker / cleanup jobs ("find stale races to time out")
//   players.telegramUserId: "my recent races" + reconnect-by-user
critterKartRaceSchema.index({ state: 1, matchedAt: -1 });
critterKartRaceSchema.index({ 'players.telegramUserId': 1 });

const CritterKartRace = mongoose.model('CritterKartRace', critterKartRaceSchema);

export default CritterKartRace;
export { RACE_STATES, MAX_PLAYERS, MIN_PLAYERS };
