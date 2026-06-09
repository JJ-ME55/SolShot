/**
 * Shootout lobby service — host-controlled 1v1 / 2v2 lobbies.
 *
 * Stateless wrappers around ShootoutLobby Mongo operations. Called
 * from socket handlers in server/socket-io/shootout.js (Phase D).
 *
 * Lobby state machine (mirrors ShootoutLobby model):
 *   OPEN      — created, accepting joins; not yet at cap
 *   FULL      — at cap; members ready up
 *   READY     — all members marked ready; host can start
 *   STARTING  — host tapped Start; matchId stamped; lifecycle takes over
 *   IN_MATCH  — match in progress (set by lifecycle layer)
 *   CLOSED    — host left empty, last member left, or TTL expired
 *
 * Auth model: every mutation requires telegramUserId from the socket
 * handshake JWT. Host-only operations (start) check
 * hostTelegramUserId matches.
 *
 * Reference: server/services/games/critter-kart/lobbyService.js. The
 * shootout state machine is richer than CK's (OPEN/FULL/READY/STARTING
 * vs CK's flat open/starting/closed) because Shootout needs an explicit
 * ready-gate before the host can pull the trigger.
 */

import crypto from 'crypto';
import ShootoutLobby, {
    LOBBY_MODES,
} from '../../../models/ShootoutLobby.js';
import logger from '../../logger.js';

// No 0/O/1/I/L (visually ambiguous in mono fonts on shared codes).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Mode → cap. Single source of truth, mirrors the model enum.
// Exported so the Quick Play matchmaker (matchmaking.js) can reference
// the same per-mode caps without duplicating the table.
export const MODE_CAP = { '1v1': 2, '2v2': 4 };
const CREATE_CODE_RETRIES = 5;

export function generateLobbyCode() {
    const bytes = crypto.randomBytes(6);
    let s = '';
    for (let i = 0; i < 6; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return s;
}

function newId(prefix) {
    return `${prefix}-${crypto.randomBytes(6).toString('base64url')}`;
}

function formatDisplayName({ telegramUsername, firstName, telegramUserId }) {
    if (telegramUsername) return `@${telegramUsername}`;
    if (firstName) return firstName;
    return `Player ${String(telegramUserId).slice(-4)}`;
}

function isDuplicateCodeError(err) {
    return err && err.code === 11000 && err.keyPattern && err.keyPattern.code;
}

// ── Read ─────────────────────────────────────────────────────────────

export async function listOpenLobbies() {
    return ShootoutLobby.openLobbies();
}

// ── Create ───────────────────────────────────────────────────────────

export async function createLobby({
    mode, telegramUserId, telegramUsername, firstName, socketId,
    // Phase MP-expansion (2026-06-08):
    //   visibility — 'open' | 'private' (default private; matches
    //     current behavior where create-then-share-code is the
    //     standard flow). 'open' lobbies surface in the Open Lobbies
    //     browser via ShootoutLobby.openLobbies().
    //   gameType   — 'friendly' | 'wager' (default friendly). 'wager'
    //     is a v2 marker; the bot + client currently surface 'coming
    //     soon' on the user's selection and downgrade to friendly.
    visibility = 'private',
    gameType   = 'friendly',
}) {
    if (!LOBBY_MODES.includes(mode)) return { error: 'invalid_mode' };
    if (!['open', 'private'].includes(visibility)) return { error: 'invalid_visibility' };
    if (!['friendly', 'wager'].includes(gameType))  return { error: 'invalid_game_type' };
    const cap = MODE_CAP[mode];
    const hostDisplay = formatDisplayName({ telegramUsername, firstName, telegramUserId });

    let lastErr = null;
    for (let attempt = 0; attempt < CREATE_CODE_RETRIES; attempt += 1) {
        const lobbyId = newId('lobby');
        const code = generateLobbyCode();
        try {
            // eslint-disable-next-line no-await-in-loop
            const lobby = await ShootoutLobby.create({
                lobbyId,
                code,
                mode,
                cap,
                visibility,
                gameType,
                state: 'OPEN',
                hostTelegramUserId: telegramUserId,
                members: [{
                    telegramUserId,
                    telegramUsername: telegramUsername || null,
                    firstName: firstName || null,
                    displayName: hostDisplay,
                    socketId: socketId || null,
                    isHost: true,
                    isReady: false,
                    // Phase C: team is user-picked during Ready Up.
                    // Members join unassigned; startMatch requires
                    // a balanced split.
                    team: null,
                    slot: -1,
                }],
                matchId: null,
                lastActiveAt: new Date(),
            });
            logger.info('[shootout/lobby] created', {
                lobbyId, code, mode, host: telegramUserId,
            });
            return { ok: true, lobby: lobby.toObject() };
        } catch (err) {
            lastErr = err;
            if (isDuplicateCodeError(err)) {
                logger.warn('[shootout/lobby] code collision, regenerating', { code, attempt });
                continue;
            }
            throw err;
        }
    }
    logger.error('[shootout/lobby] create exhausted retries', { err: lastErr?.message });
    throw lastErr || new Error('create_failed');
}

// ── Quick Play (Phase MP-expansion, 2026-06-08) ──────────────────────

/**
 * Create a Quick Play lobby pre-populated with N matched players,
 * teams alternating (slots 0/2 red, 1/3 blue), and all members
 * flagged isReady=true. State stamps READY immediately so the
 * existing auto-countdown trigger (socket-io syncCountdown) fires
 * on the next emitted state broadcast → 5s → match starts.
 *
 * Matchmaking flow (matchmaking.js → socket-io/shootout.js):
 *   1. quickplay:join fills the queue
 *   2. queue hits cap → matched group of N
 *   3. socket handler calls createQuickPlayLobby({mode, members})
 *   4. socket handler broadcasts lobby:state + arms countdown
 *   5. 5s later → match:start per-socket
 *
 * Quick Play lobbies are always visibility='private' (they're never
 * surfaced in the Open Lobbies browser — they exist for ~5s and then
 * become a match) and gameType='friendly' (wager is opted-in via
 * Custom Game only).
 *
 * @param {object} args
 * @param {'1v1'|'2v2'} args.mode
 * @param {Array} args.members - matched players from the queue, each
 *   {telegramUserId, telegramUsername, firstName, socketId}
 */
export async function createQuickPlayLobby({ mode, members }) {
    if (!LOBBY_MODES.includes(mode)) return { error: 'invalid_mode' };
    const cap = MODE_CAP[mode];
    if (!Array.isArray(members) || members.length !== cap) {
        return { error: 'bad_member_count' };
    }
    const host = members[0]; // arbitrary — first in the queue
    let lastErr = null;
    for (let attempt = 0; attempt < CREATE_CODE_RETRIES; attempt += 1) {
        const lobbyId = newId('lobby');
        const code = generateLobbyCode();
        try {
            const memberDocs = members.map((m, i) => ({
                telegramUserId:   m.telegramUserId,
                telegramUsername: m.telegramUsername || null,
                firstName:        m.firstName || null,
                displayName:      formatDisplayName({
                    telegramUsername: m.telegramUsername,
                    firstName:        m.firstName,
                    telegramUserId:   m.telegramUserId,
                }),
                socketId:         m.socketId || null,
                isHost:           i === 0,
                isReady:          true,                          // pre-ready
                team:             i % 2 === 0 ? 'red' : 'blue',  // alternating
                slot:             -1,                             // set on startMatch
            }));
            // eslint-disable-next-line no-await-in-loop
            const lobby = await ShootoutLobby.create({
                lobbyId, code, mode, cap,
                visibility: 'private',  // never browseable
                gameType:   'friendly',
                state:      'READY',     // triggers countdown immediately
                hostTelegramUserId: host.telegramUserId,
                members:    memberDocs,
                matchId:    null,
                lastActiveAt: new Date(),
            });
            logger.info('[shootout/lobby] quickplay created', {
                lobbyId, code, mode, members: members.length,
            });
            return { ok: true, lobby: lobby.toObject() };
        } catch (err) {
            lastErr = err;
            if (isDuplicateCodeError(err)) {
                logger.warn('[shootout/lobby] quickplay code collision, regenerating', { code, attempt });
                continue;
            }
            logger.error({ err, lobbyId, code }, 'shootout lobby quickplay create failed');
            return { error: 'create_failed' };
        }
    }
    logger.error({ err: lastErr }, 'shootout lobby quickplay create exhausted retries');
    return { error: 'create_failed' };
}

// ── Join ─────────────────────────────────────────────────────────────

export async function joinLobbyByCode({
    code, telegramUserId, telegramUsername, firstName, socketId,
}) {
    const lobby = await ShootoutLobby.findOne({ code });
    if (!lobby) return { error: 'lobby_not_found' };

    // Idempotent re-join: same telegramUserId already a member → update
    // socketId and return the existing lobby (no dup, no state change).
    const existing = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (existing) {
        if (socketId !== undefined) existing.socketId = socketId || null;
        lobby.lastActiveAt = new Date();
        await lobby.save();
        return { ok: true, lobby: lobby.toObject(), alreadyMember: true };
    }

    // Capacity: respect either an already-FULL state or a stale-state
    // doc whose members array is already at cap (defensive against
    // race between findOne and prior save).
    if (lobby.state === 'FULL' || lobby.members.length >= lobby.cap) {
        return { error: 'lobby_full' };
    }

    const displayName = formatDisplayName({ telegramUsername, firstName, telegramUserId });
    lobby.members.push({
        telegramUserId,
        telegramUsername: telegramUsername || null,
        firstName: firstName || null,
        displayName,
        socketId: socketId || null,
        isHost: false,
        isReady: false,
        // Phase C: team is user-picked during Ready Up. Members join
        // unassigned; startMatch requires a balanced split.
        team: null,
        slot: -1,
    });

    if (lobby.members.length >= lobby.cap) lobby.state = 'FULL';
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] joined', {
        lobbyId: lobby.lobbyId, code, joiner: telegramUserId, state: lobby.state,
    });
    return { ok: true, lobby: lobby.toObject() };
}

// ── Leave ────────────────────────────────────────────────────────────

export async function leaveLobby({ lobbyId, telegramUserId }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };

    const idx = lobby.members.findIndex(m => m.telegramUserId === telegramUserId);
    if (idx < 0) {
        // Non-member — defensively no-op. Don't bump activity.
        return { ok: true, lobby: lobby.toObject() };
    }

    const wasHost = lobby.members[idx].isHost
        || lobby.hostTelegramUserId === telegramUserId;
    lobby.members.splice(idx, 1);

    if (lobby.members.length === 0) {
        // Last out closes the lobby.
        lobby.state = 'CLOSED';
        lobby.closedAt = new Date();
        await lobby.save();
        logger.info('[shootout/lobby] closed (last member left)', { lobbyId });
        return { ok: true, closed: true, lobby: lobby.toObject() };
    }

    if (wasHost) {
        // Transfer host token to next-joined (now first) member.
        lobby.members[0].isHost = true;
        lobby.hostTelegramUserId = lobby.members[0].telegramUserId;
    }
    if (lobby.state === 'FULL' && lobby.members.length < lobby.cap) {
        lobby.state = 'OPEN';
    }
    // Leaving while READY drops the ready-state — caller's invariant is
    // "READY = all-ready AND at-cap"; with fewer members we're no longer
    // at cap.
    if (lobby.state === 'READY' && lobby.members.length < lobby.cap) {
        lobby.state = 'OPEN';
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] left', {
        lobbyId, leaver: telegramUserId, wasHost, state: lobby.state,
    });
    return { ok: true, lobby: lobby.toObject() };
}

// ── Team balance ─────────────────────────────────────────────────────

/**
 * Required team headcount for the given mode. 1v1 → 1 per side, 2v2 → 2.
 * Centralised so pickTeam / setReady / startMatch agree.
 */
function _teamCapPerSide(mode) {
    if (mode === '2v2') return 2;
    // Default to 1v1 cap for any unknown mode — safe.
    return 1;
}

function _countOnTeam(lobby, team) {
    return lobby.members.reduce((n, m) => n + (m.team === team ? 1 : 0), 0);
}

/**
 * True iff teams are balanced for the lobby's mode and every member
 * has picked a side. Used by setReady's READY transition and by
 * startMatch's pre-flight check.
 */
function _isLobbyBalanced(lobby) {
    const cap = _teamCapPerSide(lobby.mode);
    return _countOnTeam(lobby, 'red')  === cap &&
           _countOnTeam(lobby, 'blue') === cap;
}

// ── Pick team (Phase C, 2026-06-08) ──────────────────────────────────

/**
 * Member chooses Red or Blue during Ready Up. Swapping between teams
 * is allowed iff the target team has capacity for the lobby's mode.
 * No-op if the member is already on the requested team.
 *
 * Validation:
 *   - team must be 'red' or 'blue' (null is set via the absence path,
 *     not via this API)
 *   - target team must have capacity (< cap-per-side for the mode)
 *
 * Side effects:
 *   - Picking / swapping un-readies the picker so they have to re-ready
 *     after seeing the new lineup. Prevents a teammate-swap from
 *     silently stealing the host's go-ahead.
 *   - State machine: a picker who was previously ready may have
 *     flipped the lobby out of READY → FULL via the auto-unready
 *     above. Recompute the READY gate.
 */
export async function pickTeam({ lobbyId, telegramUserId, team }) {
    if (team !== 'red' && team !== 'blue') {
        return { error: 'bad_team' };
    }
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    const member = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (!member) return { error: 'not_member' };
    if (member.team === team) {
        return { ok: true, lobby: lobby.toObject() }; // no-op
    }
    // Capacity check on the target team. The picker's current slot on
    // the OTHER team is freed by the swap, so the count we compare
    // against is what's already there before this pick.
    const cap = _teamCapPerSide(lobby.mode);
    if (_countOnTeam(lobby, team) >= cap) {
        return { error: 'team_full' };
    }
    member.team = team;
    member.isReady = false;
    if (lobby.state === 'READY') {
        lobby.state = 'FULL';
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    return { ok: true, lobby: lobby.toObject() };
}

// ── Map vote (Phase MP-maps, 2026-06-09) ─────────────────────────
//
// Members vote on which map the match will be played on. Live —
// they can switch their vote at any time, or clear it (pass mapId
// null). At match-start, the map with the most votes wins (ties
// resolved by VALID_MAPS order — fun-house before arena before
// shipping-yard, arbitrary but deterministic).

const VALID_MAPS = ['arena', 'shipping-yard', 'fun-house'];

export async function voteMap({ lobbyId, telegramUserId, mapId }) {
    if (mapId != null && !VALID_MAPS.includes(mapId)) {
        return { error: 'invalid_map' };
    }
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    if (lobby.state !== 'OPEN' && lobby.state !== 'FULL' && lobby.state !== 'READY') {
        return { error: 'lobby_not_voting' };
    }
    const member = lobby.members.find((m) => m.telegramUserId === telegramUserId);
    if (!member) return { error: 'not_in_lobby' };

    const key = String(telegramUserId);
    if (!lobby.mapVotes) lobby.mapVotes = new Map();
    if (mapId == null) {
        lobby.mapVotes.delete(key);
    } else {
        lobby.mapVotes.set(key, mapId);
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    return { ok: true, lobby: lobby.toObject() };
}

/**
 * Tally votes + return the winning mapId. Ties broken by VALID_MAPS
 * order. If no votes cast, returns 'arena' (legacy default).
 */
export function resolveMapVote(lobby, rng = Math.random) {
    const votes = lobby?.mapVotes;
    if (!votes || (votes instanceof Map ? votes.size : Object.keys(votes).length) === 0) {
        return 'arena';
    }
    // Mongoose 'Map' field deserialises to either a Map or a plain
    // object depending on lean() vs not — handle both.
    const counts = {};
    if (votes instanceof Map) {
        for (const v of votes.values()) counts[v] = (counts[v] || 0) + 1;
    } else {
        for (const v of Object.values(votes)) counts[v] = (counts[v] || 0) + 1;
    }
    // Find the highest vote count then collect every map tied at
    // that count. Single-winner case → that map. Multi-way tie →
    // random pick from the tied set (Fish: 'if votes are even and
    // people ready up, randomly choose between the two with most
    // votes'). rng param is injectable so tests can be deterministic.
    let topCount = 0;
    for (const m of VALID_MAPS) topCount = Math.max(topCount, counts[m] || 0);
    if (topCount === 0) return 'arena';
    const tied = VALID_MAPS.filter((m) => (counts[m] || 0) === topCount);
    if (tied.length === 1) return tied[0];
    return tied[Math.floor(rng() * tied.length)];
}

// ── Ready ────────────────────────────────────────────────────────────

export async function setReady({ lobbyId, telegramUserId, ready }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    const member = lobby.members.find(m => m.telegramUserId === telegramUserId);
    if (!member) return { error: 'not_member' };
    // Can't ready-up until you've picked a team. Surfaces a clear
    // error in the UI; without this you could un-team-pick + ready
    // + start, slipping past the balance gate.
    if (ready && !member.team) {
        return { error: 'pick_team_first' };
    }

    member.isReady = !!ready;

    // FULL → READY requires EVERYONE ready AND teams balanced (Phase
    // C: pick-team is part of the gate now). READY → FULL the moment
    // any of those break. Pre-FULL states (OPEN) don't transition.
    const allReady = lobby.members.every(m => m.isReady);
    const balanced = _isLobbyBalanced(lobby);
    if (lobby.state === 'FULL' && allReady && balanced) {
        lobby.state = 'READY';
    } else if (lobby.state === 'READY' && (!allReady || !balanced)) {
        lobby.state = 'FULL';
    }

    lobby.lastActiveAt = new Date();
    await lobby.save();
    return { ok: true, lobby: lobby.toObject() };
}

// ── Start match ──────────────────────────────────────────────────────

/**
 * Host pulls the trigger. Stamps matchId on the lobby, assigns slots
 * 0..n-1 in join order, and transitions to 'STARTING'. The lifecycle
 * layer reads back members + slots + teams from the returned doc to
 * create the ShootoutMatch and seed the sim. We don't import lifecycle
 * here to avoid a circular dep.
 *
 * Options:
 *   allowSolo (default false) — when true, the normal "state === READY"
 *   gate is relaxed: any OPEN/FULL/READY lobby can start, and the
 *   ready-flag on the host is implicitly forced on. The runner's
 *   bot-fill step then fills the empty slots with SimBots. Used by the
 *   "play vs bots through the MP server" entry point on the client so
 *   the same socket path is exercised in solo and full lobbies.
 */
export async function startMatch({ lobbyId, telegramUserId, allowSolo = false }) {
    const lobby = await ShootoutLobby.findOne({ lobbyId });
    if (!lobby) return { error: 'lobby_not_found' };
    if (lobby.hostTelegramUserId !== telegramUserId) return { error: 'not_host' };
    if (!allowSolo) {
        if (lobby.state !== 'READY') return { error: 'not_ready' };
        // Belt + braces: setReady is supposed to gate READY on balance
        // but defend against any race where the doc could be READY with
        // unbalanced teams. Mode-aware: 1v1 = 1-1, 2v2 = 2-2.
        if (!_isLobbyBalanced(lobby)) return { error: 'unbalanced' };
    } else {
        // Solo path: must at least be a startable lobby state (not
        // already STARTING / IN_MATCH / CLOSED). Stamp readiness on the
        // host so down-stream consumers see a coherent record. For solo
        // we DO auto-assign the host to red (the team-pick UI isn't
        // exposed in the solo entry point) — bots fill the rest.
        if (!['OPEN', 'FULL', 'READY'].includes(lobby.state)) {
            return { error: 'not_startable' };
        }
        const host = lobby.members.find(m => m.telegramUserId === telegramUserId);
        if (host) {
            host.isReady = true;
            if (!host.team) host.team = 'red';
        }
    }

    const matchId = newId('match');
    lobby.matchId = matchId;
    lobby.state = 'STARTING';
    // Slot assignment: red team gets even slots (0, 2), blue gets odd
    // (1, 3) — matches SPAWN_POSITIONS_BY_SLOT in sim/physics.js
    // (red north, blue south). For solo lobbies with empty seats, the
    // runner's _addBotsForEmptySlots backfills bots into the unused
    // slots (also alternating by team).
    let redIdx = 0, blueIdx = 0;
    for (const m of lobby.members) {
        if (m.team === 'blue') {
            m.slot = 1 + blueIdx * 2; // 1, 3
            blueIdx += 1;
        } else {
            // red OR unassigned (solo: host forced to red above)
            m.slot = 0 + redIdx * 2; // 0, 2
            redIdx += 1;
        }
    }
    lobby.lastActiveAt = new Date();
    await lobby.save();
    logger.info('[shootout/lobby] starting', {
        lobbyId, matchId, host: telegramUserId, count: lobby.members.length,
        solo: !!allowSolo,
    });
    return { ok: true, matchId, lobby: lobby.toObject() };
}
