/**
 * ShootoutMatch — completed Shootout match record (1v1 / 2v2).
 *
 * Phase C Checkpoint 1 (Task B.2). Captures per-player K/D, the winning
 * team, and which players disconnected mid-match (referenced by Phase D
 * §6 of the design doc for the DC penalty / reconnect logic).
 *
 * The match doc persists (unlike the short-lived lobby) so it can feed:
 *   - per-user history queries
 *   - aggregations into ShootoutStats (Task B.3 / Phase B leaderboard)
 *   - dispute / replay tooling
 */

import mongoose from 'mongoose';

const playerStatSchema = new mongoose.Schema({
    telegramUserId: { type: Number, required: true },
    displayName:    { type: String, required: true },
    slot:           { type: Number, required: true },
    team:           { type: String, enum: ['red', 'blue'], required: true },
    kills:          { type: Number, default: 0 },
    deaths:         { type: Number, default: 0 },
    won:            { type: Boolean, default: false },
}, { _id: false });

const shootoutMatchSchema = new mongoose.Schema({
    matchId:       { type: String, required: true, unique: true, index: true },
    lobbyId:       { type: String, required: true, index: true },
    mode:          { type: String, enum: ['1v1', '2v2'], required: true },
    startedAt:     { type: Date, default: Date.now },
    endedAt:       { type: Date, default: null },
    winnerTeam:    { type: String, enum: ['red', 'blue', null], default: null },
    players:       { type: [playerStatSchema], default: [] },
    dcDuringMatch: { type: [Number], default: [] }, // tgUserIds — for Phase D
}, { timestamps: true });

const ShootoutMatch = mongoose.model('ShootoutMatch', shootoutMatchSchema);
export default ShootoutMatch;
