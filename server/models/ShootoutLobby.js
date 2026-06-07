/**
 * ShootoutLobby — Shootout host-controlled lobby (1v1 / 2v2).
 *
 * Phase C Checkpoint 1 (Task B.1). Mirrors CritterKartLobby's shape but
 * adapted for the Shootout team-based deathmatch contract:
 *   - mode determines cap (1v1 → 2, 2v2 → 4)
 *   - members carry team (red/blue) + slot (assigned at match start)
 *   - state machine: OPEN → FULL → READY → STARTING → IN_MATCH → CLOSED
 *   - code is a short shareable join code (separate from lobbyId)
 *
 * Like CK lobbies, the doc is short-lived — auto-expires 30 min after
 * lastActiveAt if no match has begun (TTL on lastActiveAt). The state
 * field is indexed so the lobby-browser query (state: 'OPEN') stays fast.
 */

import mongoose from 'mongoose';

// 1v1 has cap 2, 2v2 has cap 4.
export const LOBBY_MIN_CAP = 2;
export const LOBBY_MAX_CAP = 4;
export const LOBBY_MODES = ['1v1', '2v2'];
export const LOBBY_STATES = ['OPEN', 'FULL', 'READY', 'STARTING', 'IN_MATCH', 'CLOSED'];

const memberSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },
    displayName:      { type: String, required: true },
    socketId:         { type: String, default: null },
    isHost:           { type: Boolean, default: false },
    isReady:          { type: Boolean, default: false },
    team:             { type: String, enum: ['red', 'blue'], default: 'red' },
    slot:             { type: Number, default: -1 }, // assigned at match start
    joinedAt:         { type: Date, default: Date.now },
}, { _id: false });

const shootoutLobbySchema = new mongoose.Schema({
    lobbyId:            { type: String, required: true, unique: true, index: true },
    code:               { type: String, required: true, unique: true, index: true },
    mode:               { type: String, enum: LOBBY_MODES, required: true },
    cap:                { type: Number, required: true, min: LOBBY_MIN_CAP, max: LOBBY_MAX_CAP },
    state:              { type: String, enum: LOBBY_STATES, default: 'OPEN', index: true },
    hostTelegramUserId: { type: Number, required: true, index: true },

    members:            { type: [memberSchema], default: [] },

    matchId:            { type: String, default: null }, // set when lobby starts a match
    closedAt:           { type: Date, default: null },
    lastActiveAt:       { type: Date, default: Date.now, index: true },
}, { timestamps: true });

// TTL: auto-delete 30 min after last activity (matches CK lobby behaviour)
shootoutLobbySchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 30 * 60 });

// Helper: discoverable lobbies (OPEN + has room)
shootoutLobbySchema.statics.openLobbies = function () {
    return this.find({ state: 'OPEN', $expr: { $lt: [{ $size: '$members' }, '$cap'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
};

const ShootoutLobby = mongoose.model('ShootoutLobby', shootoutLobbySchema);
export default ShootoutLobby;
