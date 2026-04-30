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
 * context. Falls back to an explicit field on the payload for clients
 * outside the Mini App (rare — but useful for local browser testing).
 */
function tgIdFor(socket, payload) {
    return socket?.telegramUser?.id
        || payload?.telegramUserId
        || null;
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
     * Validates it's the firer's turn, runs physics, applies damage,
     * advances the turn. Emits the updated match snapshot back so the
     * Mini App can re-render.
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
            // Send the result + a fresh snapshot so the firer's UI updates immediately.
            const match = await GroupMatch.findOne({ matchId: payload.matchId }).lean();
            client.emit('shotResult', { ...result, match: sanitizeMatch(match) });
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
