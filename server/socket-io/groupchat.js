/**
 * Socket.IO handlers for group-chat mode.
 *
 * Registered per-connection from server/socket-io/main.js inside the
 * `io.on("connection", ...)` callback. Mirrors the per-socket handler
 * pattern used elsewhere (e.g. registerIdentity).
 *
 * Phase 1c scope:
 *   - getGroupMatch — read-only fetch, returns sanitized match snapshot
 *   - getMyGroupMatches — list active matches the requesting player is in
 *
 * Phase 1d-real scope (TODO):
 *   - fireGroupShot — accept a shot from the Mini App, validate, run physics,
 *     update match state, trigger lifecycle.handleShot()
 *
 * Identity: handlers use the socket's `telegramUser.id` (set by
 * telegramSocketMiddleware on connect) when available. For non-TG
 * sockets (local dev / browser without Mini App), accept an explicit
 * `telegramUserId` field on the request payload.
 */

import GroupMatch from '../models/GroupMatch.js';
import * as lifecycle from '../services/groupchat/lifecycle.js';

/**
 * Strip internal-only fields from a match doc before sending to the client.
 * Removes lobby message IDs, internal timestamps, etc.
 */
function sanitizeMatch(match) {
    if (!match) return null;
    const obj = typeof match.toObject === 'function' ? match.toObject() : { ...match };
    delete obj.lobbyMessageId;
    delete obj.__v;
    return obj;
}

/**
 * Resolve the requesting player's telegramUserId from the socket
 * context.
 *
 * SECURITY: only trusts socket.telegramUser.id, which is set by
 * telegramSocketMiddleware AFTER HMAC-SHA256 validation of the TG
 * initData on connection. Never trusts a client-supplied identity
 * over the wire — that would let any client impersonate any user
 * by sending { telegramUserId: <victim-id>, ... } in the payload
 * and fire shots / list matches as them.
 *
 * The dev fallback to payload.telegramUserId is gated behind
 * NODE_ENV !== 'production' so local testing without a TG-validated
 * connection still works.
 */
function tgIdFor(socket, payload) {
    if (socket?.telegramUser?.id) return socket.telegramUser.id;
    if (process.env.NODE_ENV !== 'production' && payload?.telegramUserId) {
        return payload.telegramUserId;
    }
    return null;
}

export function registerGroupChatSocketHandlers(client) {
    /**
     * Fetch a single group match by matchId. Returns the full sanitized
     * snapshot if found, or { error: 'not_found' }.
     */
    client.on('getGroupMatch', async ({ matchId } = {}) => {
        if (!matchId) {
            client.emit('groupMatchData', { error: 'missing_matchId' });
            return;
        }
        try {
            const match = await GroupMatch.findOne({ matchId }).lean();
            if (!match) {
                client.emit('groupMatchData', { error: 'not_found', matchId });
                return;
            }
            client.emit('groupMatchData', { match: sanitizeMatch(match) });
        } catch (err) {
            console.error('[group-chat] getGroupMatch error:', err);
            client.emit('groupMatchData', { error: 'server_error', matchId });
        }
    });

    /**
     * Fire a shot in an active group-chat match.
     *
     * Server runs the same `processShot()` physics as 1v1, applies damage,
     * advances the turn. Emits a `shotResult` payload that's a SUPERSET of
     * 1v1's `turnResult` shape — the existing Phaser MainScene's animation
     * code can consume it directly when wrapped in a thin client adapter
     * (see GroupMatchScreen / GroupBattleWrapper). This preserves 100%
     * of the painstakingly-tuned 1v1 trajectory + blast + gravity quality
     * for group-chat — same scene, same physics, same animations.
     *
     * v1 emits to the firer only. Spectators (other group-chat players
     * with the Mini App open) refetch on their next chat ping. v2 could
     * use socket.io rooms keyed on matchId to broadcast in real time.
     */
    client.on('fireGroupShot', async (payload = {}) => {
        const tgId = tgIdFor(client, payload);
        if (!tgId) {
            client.emit('shotResult', { ok: false, error: 'no_identity' });
            return;
        }
        if (!payload.matchId) {
            client.emit('shotResult', { ok: false, error: 'missing_matchId' });
            return;
        }
        try {
            const result = await lifecycle.handleShot(payload.matchId, tgId, payload);
            const match = await GroupMatch.findOne({ matchId: payload.matchId }).lean();
            // Build the turnResult-shaped payload from result.shotData (when present
            // — only on ok=true). Errors are passed through unchanged.
            if (!result.ok) {
                client.emit('shotResult', { ok: false, error: result.error, match: sanitizeMatch(match) });
                return;
            }
            client.emit('shotResult', {
                ok: true,
                ...result.shotData,
                match: sanitizeMatch(match),
            });
        } catch (err) {
            console.error('[group-chat] fireGroupShot error:', err);
            client.emit('shotResult', { ok: false, error: 'server_error' });
        }
    });

    /**
     * List all non-terminal matches the requesting player is in.
     * Used by the multi-match home screen.
     */
    client.on('getMyGroupMatches', async (payload = {}) => {
        const tgId = tgIdFor(client, payload);
        if (!tgId) {
            client.emit('myGroupMatches', { error: 'no_identity', matches: [] });
            return;
        }
        try {
            const matches = await GroupMatch.find({
                'players.telegramUserId': tgId,
                state: { $in: ['lobby', 'active'] },
            })
                .sort({ updatedAt: -1 })
                .lean();
            client.emit('myGroupMatches', {
                matches: matches.map(sanitizeMatch),
            });
        } catch (err) {
            console.error('[group-chat] getMyGroupMatches error:', err);
            client.emit('myGroupMatches', { error: 'server_error', matches: [] });
        }
    });
}
