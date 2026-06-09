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
    // User-chosen during Ready Up (Phase C, 2026-06-08). null = not yet
    // picked. startMatch requires every member to have picked + the
    // teams to be balanced (1-1 in 1v1, 2-2 in 2v2).
    team:             { type: String, enum: ['red', 'blue', null], default: null },
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

    // Phase MP-expansion (2026-06-08):
    //   visibility - 'open' lobbies show in the Open Lobbies browser
    //                via shootoutLobby.openLobbies(); 'private' join is
    //                code-only.
    //   gameType   - 'friendly' is no-stakes; 'wager' is a marker for
    //                future v2 escrow integration. Today the client +
    //                bot surface 'Wager coming soon' on selection and
    //                falls back to friendly.
    visibility:         { type: String, enum: ['open', 'private'], default: 'private', index: true },
    gameType:           { type: String, enum: ['friendly', 'wager'],   default: 'friendly' },

    // Phase MP-maps (2026-06-09): live map voting in the lobby.
    // Members vote during the team-pick + ready phase; the map with
    // the most votes is chosen at match-start (tie → first map in
    // the enum). Stored as a Map<telegramUserId(string)→mapId> so
    // toggling votes is O(1) and JSON-serialises cleanly.
    mapVotes:           { type: Map, of: String, default: () => new Map() },

    members:            { type: [memberSchema], default: [] },

    matchId:            { type: String, default: null }, // set when lobby starts a match
    closedAt:           { type: Date, default: null },
    lastActiveAt:       { type: Date, default: Date.now, index: true },
}, { timestamps: true });

// TTL: auto-delete 30 min after last activity (matches CK lobby behaviour)
shootoutLobbySchema.index({ lastActiveAt: 1 }, { expireAfterSeconds: 30 * 60 });

// Helper: discoverable lobbies (visibility=open + state=OPEN/FULL/READY
// + has room). FULL/READY are included because the Open Lobbies browser
// should show ALL public lobbies that are still pre-match — a 2/2 1v1
// lobby waiting on ready isn't joinable but is informative
// ("MATCH STARTING" badge). Filter happens client-side on each row.
shootoutLobbySchema.statics.openLobbies = function () {
    return this.find({
        visibility: 'open',
        state: { $in: ['OPEN', 'FULL', 'READY'] },
        $expr: { $lt: [{ $size: '$members' }, '$cap'] },
    })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
};

const ShootoutLobby = mongoose.model('ShootoutLobby', shootoutLobbySchema);
export default ShootoutLobby;
