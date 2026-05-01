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
import { getWeapon, getWeaponCost } from '../models/Weapon.js';

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

/** Socket.IO room key for a given match — used to broadcast shotResult
 *  to every connected player so HP / terrain / turn state stay in sync
 *  without each client having to poll. */
function roomForMatch(matchId) {
    return `groupmatch:${matchId}`;
}

export function registerGroupChatSocketHandlers(client, io) {
    /**
     * Fetch a single group match by matchId. Returns the full sanitized
     * snapshot if found, or { error: 'not_found' }.
     *
     * Side effect: if the requesting socket belongs to a player in the
     * match, it joins the `groupmatch:<matchId>` room so the server can
     * push shotResult / state updates to every active viewer in real time.
     * (Opening the Mini App is the canonical "I'm watching this match" cue.)
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
            // Auto-join the match room so this client receives broadcast
            // shotResult events for every fire (including others'). Cheap —
            // leaves on disconnect automatically.
            const tgId = tgIdFor(client, {});
            const isMember = tgId != null
                && match.players?.some(p => p.telegramUserId === tgId);
            if (isMember) {
                client.join(roomForMatch(matchId));
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
            // Errors stay private to the firer (e.g. weapon_not_owned, not_your_turn).
            // We don't bother fetching the match doc on the error path — the
            // firer already has a match snapshot client-side and only needs
            // to know the error.
            if (!result.ok) {
                client.emit('shotResult', { ok: false, error: result.error });
                return;
            }
            // Successful shot: broadcast to EVERY player in the match room
            // so observers' MainScene runs the same trajectory + blast +
            // HP-sync animation as the firer's. Without this, observers'
            // local hp stays at 250 until they reopen the Mini App, which
            // explains the "HP not the same across screens" report.
            //
            // PERF: handleShot now returns the in-memory match doc, so we
            // skip the redundant DB re-fetch + .lean() that previously
            // added ~50-200ms of round-trip latency on every shot.
            const broadcast = {
                ok: true,
                ...result.shotData,
                match: sanitizeMatch(result.match),
            };
            if (io) {
                io.to(roomForMatch(payload.matchId)).emit('shotResult', broadcast);
            } else {
                // Fallback if io wasn't wired through (shouldn't happen in prod)
                client.emit('shotResult', broadcast);
            }
        } catch (err) {
            console.error('[group-chat] fireGroupShot error:', err);
            client.emit('shotResult', { ok: false, error: 'server_error' });
        }
    });

    /**
     * Purchase a weapon for the requesting player in an active match.
     * Mirrors 1v1's `buyWeapon` handler but operates on GroupMatch fields.
     * Validates: match active, requester is a player, weapon known, not
     * already owned, gold sufficient. Persists to player.gold + player.weapons.
     */
    client.on('purchaseGroupWeapon', async (payload = {}) => {
        const tgId = tgIdFor(client, payload);
        if (!tgId) {
            client.emit('purchaseGroupWeaponResult', { success: false, reason: 'no_identity' });
            return;
        }
        const { matchId, weaponId } = payload;
        if (!matchId || weaponId === undefined) {
            client.emit('purchaseGroupWeaponResult', { success: false, reason: 'missing_args' });
            return;
        }
        try {
            const match = await GroupMatch.findOne({ matchId });
            if (!match || match.state !== 'active') {
                client.emit('purchaseGroupWeaponResult', { success: false, reason: 'match_not_active' });
                return;
            }
            const playerIdx = match.players.findIndex(p => p.telegramUserId === tgId);
            if (playerIdx < 0) {
                client.emit('purchaseGroupWeaponResult', { success: false, reason: 'not_a_player' });
                return;
            }
            const player = match.players[playerIdx];
            const weapon = getWeapon(weaponId);
            if (!weapon) {
                client.emit('purchaseGroupWeaponResult', { success: false, reason: 'unknown_weapon' });
                return;
            }
            if (player.weapons?.includes(weaponId)) {
                client.emit('purchaseGroupWeaponResult', { success: false, reason: 'already_owned', balance: player.gold });
                return;
            }
            const cost = getWeaponCost(weaponId);
            if ((player.gold || 0) < cost) {
                client.emit('purchaseGroupWeaponResult', { success: false, reason: 'insufficient_gold', balance: player.gold });
                return;
            }

            // Deduct + add. Mongoose tracks modification on the subdocument.
            player.gold = (player.gold || 0) - cost;
            player.weapons = [...(player.weapons || [0]), weaponId];
            await match.save();

            client.emit('purchaseGroupWeaponResult', {
                success: true,
                weaponId,
                cost,
                balance: player.gold,
                inventory: player.weapons,
            });
        } catch (err) {
            console.error('[group-chat] purchaseGroupWeapon error:', err);
            client.emit('purchaseGroupWeaponResult', { success: false, reason: 'server_error' });
        }
    });

    /**
     * Mark the player's pre-battle shop visit as complete. Idempotent.
     * Once flipped true, the Mini App routes them directly to the battle
     * UI instead of the shop on subsequent opens. Players can still buy
     * weapons mid-match if they have gold (matches 1v1 behaviour where
     * the shop is per-round but inventory persists).
     */
    client.on('groupShopComplete', async (payload = {}) => {
        const tgId = tgIdFor(client, payload);
        if (!tgId) return;
        const { matchId } = payload;
        if (!matchId) return;
        try {
            const match = await GroupMatch.findOne({ matchId });
            if (!match) return;
            const playerIdx = match.players.findIndex(p => p.telegramUserId === tgId);
            if (playerIdx < 0) return;
            if (!match.players[playerIdx].shopComplete) {
                match.players[playerIdx].shopComplete = true;
                await match.save();
            }
            client.emit('groupShopCompleteAck', { ok: true });
        } catch (err) {
            console.error('[group-chat] groupShopComplete error:', err);
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
