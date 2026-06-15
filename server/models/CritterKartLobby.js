/**
 * CritterKartLobby — host-controlled custom-game lobby.
 *
 * Distinct from CritterKartQueue (quick-match FIFO). A lobby is:
 *   - Created by a host who picks a name + cap (2-6 players)
 *   - Joinable by others via lobby:join (sends a pending request)
 *   - Host decides accept/decline per pending request
 *   - All members tap Ready; host taps Start Race
 *   - Lobby transitions to a race (uses Session 1 lifecycle.createRace);
 *     bot-fills to MAX_PLAYERS if fewer humans than max
 *
 * The lobby doc is short-lived — auto-expires 30 min after lastActiveAt
 * if no race has been started.
 */

import mongoose from 'mongoose';

const lobbyMemberSchema = new mongoose.Schema({
    telegramUserId:   { type: Number, required: true },
    telegramUsername: { type: String, default: null },
    firstName:        { type: String, default: null },
    displayName:      { type: String, required: true },
    socketId:         { type: String, default: null },
    isHost:           { type: Boolean, default: false },
    isReady:          { type: Boolean, default: false },
    joinedAt:         { type: Date, default: Date.now },
}, { _id: false });

const lobbyPendingRequestSchema = new mongoose.Schema({
    requestId:        { type: String, required: true },
    telegramUserId:   { type: Number, required: true },
    telegramUsername: { type: String, default: null },
    displayName:      { type: String, required: true },
    socketId:         { type: String, default: null },
    requestedAt:      { type: Date, default: Date.now },
}, { _id: false });

const LOBBY_STATES = ['open', 'starting', 'closed'];
const LOBBY_MIN_CAP = 2;
const LOBBY_MAX_CAP = 6;

const critterKartLobbySchema = new mongoose.Schema({
    lobbyId:          { type: String, required: true, unique: true, index: true },
    name:             { type: String, required: true, maxlength: 60 },
    hostTelegramUserId:{ type: Number, required: true, index: true },
    hostUsername:     { type: String, required: true },
    cap:              { type: Number, required: true, min: LOBBY_MIN_CAP, max: LOBBY_MAX_CAP },
    state:            { type: String, enum: LOBBY_STATES, default: 'open' },
    track:            { type: String, default: 'meadow' }, // host's track choice → race.track
    visibility:       { type: String, enum: ['open', 'private'], default: 'open' }, // open=listed+instant-join; private=hidden+code+request
    code:             { type: String, default: null, index: true }, // short shareable join code for private lobbies

    members:          { type: [lobbyMemberSchema], default: [] },
    pendingRequests:  { type: [lobbyPendingRequestSchema], default: [] },

    raceId:           { type: String, default: null },   // set on lobby:start

    createdAt:        { type: Date, default: Date.now },
    lastActiveAt:     { type: Date, default: Date.now, index: true },
    closedAt:         { type: Date, default: null },
}, {
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
});

// TTL: auto-delete 30 min after last activity unless a race started
critterKartLobbySchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 30 * 60 });

// Helper: filter for "discoverable" lobbies — OPEN visibility only (private
// lobbies are hidden; you reach them by code), open state, and not full.
critterKartLobbySchema.statics.openLobbies = function () {
    return this.find({ state: 'open', visibility: 'open', $expr: { $lt: [{ $size: '$members' }, '$cap'] } })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
};

const CritterKartLobby = mongoose.model('CritterKartLobby', critterKartLobbySchema);
export default CritterKartLobby;
export { LOBBY_STATES, LOBBY_MIN_CAP, LOBBY_MAX_CAP };
