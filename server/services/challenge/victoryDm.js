/**
 * Post-match victory DM — render the TrophyShareCard and send it to the
 * winner's Telegram account (if linked).
 *
 * Called from the match-settle hook in socket-io/main.js. Best-effort,
 * fire-and-forget — failures are logged but never propagate.
 *
 * Inputs (all server-side state, no client trust):
 *   - ms: match state (scores, weaponDamage, weaponShots, weaponHits, roundWins)
 *   - room: room object (players, matchMode, etc.)
 *   - winnerId: socket id of the winner
 *   - roomId: room id (used as fallback matchId)
 */

import { renderTrophyCardPng } from './renderTrophyCard.js';
import User from '../../models/User.js';
import { getBot } from '../bot.js';
import { WEAPON_DATA } from '../physics.js';

// 2026-05-04: solshot.gg PWA replaces Mini App. See bot.js header comment.
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://solshot.gg/';

/**
 * Sum a weapon-keyed map of numbers (matches client/AAR helper shape).
 */
function sumWeaponMap(map) {
    if (!map || typeof map !== 'object') return 0;
    return Object.values(map).reduce((a, b) => a + (Number(b) || 0), 0);
}

/**
 * Find the MVP weapon for a player from their per-match weaponDamage map.
 * Returns the weapon name (uppercase) or 'STANDARD' if no data.
 */
function computeMvpWeapon(weaponDamage) {
    if (!weaponDamage || typeof weaponDamage !== 'object') return 'STANDARD';
    let bestId = null;
    let bestDmg = 0;
    for (const [id, dmg] of Object.entries(weaponDamage)) {
        if (dmg > bestDmg) { bestDmg = dmg; bestId = id; }
    }
    if (!bestId) return 'STANDARD';
    const wep = WEAPON_DATA[Number(bestId)];
    const name = (wep?.name || 'STANDARD').toUpperCase();
    // Trophy card budget: ≤14 chars on the MVP weapon tile
    return name.slice(0, 14);
}

/**
 * Look up the winner's User document and check for a linked Telegram id.
 * Returns null if no TG link (we only DM TG-linked winners).
 */
async function findWinnerTelegramId(winnerSocketId, getAuthenticatedWallet) {
    const wallet = getAuthenticatedWallet?.(winnerSocketId);
    if (wallet) {
        const u = await User.findOne({ walletAddress: wallet }, { telegramUserId: 1, handle: 1 }).lean();
        if (u?.telegramUserId) return { tgId: u.telegramUserId, handle: u.handle };
    }
    // Could also try uid-based lookup, but if they're TG-linked we'd have hit it via the TG socket auth path
    return null;
}

/**
 * Build TrophyShareCardProps from in-memory match state.
 * @param {object} args - { ms, room, winnerId, opponentId, winnerHandle, opponentHandle }
 */
/**
 * Format ms.matchStartedAt → "MM:SS" using wall-clock delta.
 * Falls back to "—:—" if start time is missing or implausible.
 */
function formatMatchDuration(matchStartedAt) {
    if (!matchStartedAt || typeof matchStartedAt !== 'number') return '—:—';
    const elapsedMs = Date.now() - matchStartedAt;
    if (elapsedMs <= 0 || elapsedMs > 24 * 60 * 60 * 1000) return '—:—';
    const totalSec = Math.floor(elapsedMs / 1000);
    const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const ss = (totalSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
}

// Background-index → biome label. Mirrors client/src/scenes/main/index.js
// `_bgThemes` order — keep in sync if themes are reordered.
const BIOME_NAMES = ['JUNGLE', 'ARCTIC', 'DESERT', 'MOON', 'VOLCANIC', 'JUNGLE'];

/**
 * Resolve the biome label for the trophy card. Falls back to a generic
 * label if the index is out of range or the room never picked one (e.g.
 * very-old rooms before the persist landed).
 */
function resolveBiomeLabel(room) {
    const idx = room?.backgroundIndex;
    if (typeof idx !== 'number' || idx < 0 || idx >= BIOME_NAMES.length) {
        return (room?.matchMode || 'BATTLEFIELD').toUpperCase().slice(0, 10);
    }
    return BIOME_NAMES[idx];
}

function buildTrophyProps({ ms, room, winnerId, opponentId, winnerHandle, opponentHandle, matchId }) {
    const scores = ms.scores || {};
    const wDamage = ms.weaponDamage?.[winnerId] || {};
    const wShots  = ms.weaponShotsFired?.[winnerId] || {};
    const wHits   = ms.weaponHits?.[winnerId] || {};
    const totalShots = sumWeaponMap(wShots);
    const totalHits  = sumWeaponMap(wHits);
    const accuracy   = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;
    const damage     = scores[winnerId] || 0;
    const winnerRounds   = (ms.roundWins?.[winnerId]) ?? 0;
    const opponentRounds = (opponentId && ms.roundWins?.[opponentId]) ?? 0;

    // Trophy card budgets enforced upstream — clip just in case
    const callsign = (winnerHandle || 'OPERATIVE').toUpperCase().slice(0, 12);
    const oppCall  = (opponentHandle || 'UNKNOWN').toUpperCase().slice(0, 12);

    return {
        winner: {
            callsign,
            damage,
            accuracy,
            shots: totalShots,
            best: computeMvpWeapon(wDamage),
        },
        loser: { callsign: oppCall },
        score: `${winnerRounds} – ${opponentRounds}`,
        matchId: `M-#${(matchId || 'UNKNOWN').toString().slice(0, 8).toUpperCase()}`,
        terrain: resolveBiomeLabel(room),
        duration: formatMatchDuration(ms?.matchStartedAt),
    };
}

/**
 * Main entry point. Renders + DMs the winner.
 *
 * @param {object} args
 * @param {object} args.ms - match state from matchStates[roomId]
 * @param {object} args.room - room object from rooms.get(roomId)
 * @param {string} args.winnerId - socket id of the winner
 * @param {string} args.roomId - room id (used as matchId fallback)
 * @param {function} [args.getAuthenticatedWallet] - (socketId) => wallet | null
 */
export async function dispatchVictoryDm({ ms, room, winnerId, roomId, getAuthenticatedWallet }) {
    const bot = getBot();
    if (!bot) return; // bot not configured (no TELEGRAM_BOT_TOKEN)
    if (!winnerId) return;

    // Look up winner's TG id
    const tgInfo = await findWinnerTelegramId(winnerId, getAuthenticatedWallet);
    if (!tgInfo?.tgId) return; // not a TG-linked user, skip silently

    // Identify opponent (any non-winner player from the room)
    const opponent = room?.players?.find((p) => p.socketId !== winnerId);
    const opponentId = opponent?.socketId;
    const opponentHandle = opponent?.name || 'UNKNOWN';
    const winnerSlot = room?.players?.find((p) => p.socketId === winnerId);
    const winnerHandle = winnerSlot?.name || tgInfo.handle || 'OPERATIVE';

    const props = buildTrophyProps({
        ms,
        room,
        winnerId,
        opponentId,
        winnerHandle,
        opponentHandle,
        matchId: roomId,
    });

    // Render PNG + send
    let png;
    try {
        png = await renderTrophyCardPng(props);
    } catch (err) {
        console.warn('[Trophy] render failed:', err.message);
        return;
    }

    try {
        await bot.telegram.sendPhoto(tgInfo.tgId, { source: png }, {
            caption: `🏆 ${props.winner.callsign} — Victory locked in.\n${props.winner.callsign} defeated ${props.loser.callsign} ${props.score}`,
            reply_markup: {
                inline_keyboard: [[
                    { text: '🔄 Find Another Match', url: `${MINI_APP_URL}?startapp=play` },
                    { text: 'Open Barracks', url: `${MINI_APP_URL}?startapp=stats` },
                ]],
            },
        });
    } catch (err) {
        // Common reason: user blocked the bot or never started a chat with it.
        // Not actionable; just log and move on.
        console.warn('[Trophy] sendPhoto failed:', err.message);
    }
}

// ─── Group-chat winner DM ───────────────────────────────────────────────

/**
 * Build trophy card props from a GroupMatch document.
 *
 * Mappings:
 *   - winner.callsign  → match winner's callsign
 *   - winner.damage    → match winner's damageDealt
 *   - winner.accuracy  → shotsHit / shotsFired (rounded %)
 *   - winner.shots     → shotsFired count (was kills proxy in v1)
 *   - winner.best      → "ARSENAL" (full weapon shop is in play)
 *   - loser.callsign   → 2nd-place finisher's callsign (or "FIELD" if N>2)
 *   - score            → "1ST OF N" placement string
 *   - terrain          → biome name from match.backgroundIndex
 *   - duration         → match.settledAt - match.startedAt (real wall-clock)
 */
function buildGroupTrophyProps(match) {
    const ranked = match.rankedFinishers || [];
    const winnerTgId = ranked[0];
    const winner = match.players?.find(p => p.telegramUserId === winnerTgId);
    const runnerUpTgId = ranked[1] || null;
    const runnerUp = runnerUpTgId ? match.players?.find(p => p.telegramUserId === runnerUpTgId) : null;

    const winnerCallsign = (winner?.callsign || winner?.tgUsername || 'OPERATIVE').toUpperCase().slice(0, 12);
    const loserCallsign = match.players?.length > 2
        ? `${match.players.length - 1} OTHERS`.slice(0, 12)
        : (runnerUp?.callsign || runnerUp?.tgUsername || 'UNKNOWN').toUpperCase().slice(0, 12);

    // Use the existing biome map. Group-chat stores the index on the match
    // doc directly (added in a5ba266), no `room` indirection.
    const biomeIdx = match.backgroundIndex ?? 0;
    const BIOME_NAMES = ['JUNGLE', 'ARCTIC', 'DESERT', 'MOON', 'VOLCANIC', 'JUNGLE'];
    const terrain = BIOME_NAMES[biomeIdx] || 'BATTLEFIELD';

    // Duration: from started→settled
    let duration = '—:—';
    if (match.startedAt && match.settledAt) {
        const elapsedMs = new Date(match.settledAt).getTime() - new Date(match.startedAt).getTime();
        if (elapsedMs > 0) {
            const totalMin = Math.floor(elapsedMs / 60000);
            const days = Math.floor(totalMin / (24 * 60));
            const hours = Math.floor((totalMin % (24 * 60)) / 60);
            const mins = totalMin % 60;
            if (days > 0) duration = `${days}D ${hours}H`;
            else if (hours > 0) duration = `${hours}H ${mins}M`;
            else duration = `${mins}M`;
        }
    }

    // Accuracy = (shots that dealt damage) / (shots fired). Defaults to
    // 0% when no shots fired (winner survived without firing — possible
    // if everyone else timed out on idle penalty).
    const shotsFired = winner?.shotsFired || 0;
    const shotsHit = winner?.shotsHit || 0;
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;

    return {
        winner: {
            callsign: winnerCallsign,
            damage: winner?.damageDealt || 0,
            accuracy,
            shots: shotsFired,
            best: 'ARSENAL', // Full weapon shop is in play
        },
        loser: { callsign: loserCallsign },
        score: `1ST OF ${match.players?.length || 0}`,
        matchId: `M-#${(match.matchId || 'UNKNOWN').toString().slice(0, 8).toUpperCase()}`,
        terrain,
        duration,
    };
}

/**
 * Render + DM the trophy card to the group-chat match's winner.
 *
 * Same trophy card pipeline as 1v1 (same Satori render, same caption
 * shape, same buttons) — the principle is "same game, different pacing,"
 * so the win celebration is identical regardless of mode.
 *
 * Best-effort, fire-and-forget. Skipped silently if:
 *   - bot not configured (no TELEGRAM_BOT_TOKEN)
 *   - match has no ranked finishers (shouldn't happen post-settle)
 *   - winner blocked the bot or never started a DM with it
 *
 * @param {object} match - The settled GroupMatch document
 */
export async function dispatchGroupVictoryDm(match) {
    const bot = getBot();
    if (!bot) return;
    if (!match || match.state !== 'settled') return;

    const winnerTgId = match.rankedFinishers?.[0];
    if (!winnerTgId) return;

    const props = buildGroupTrophyProps(match);

    let png;
    try {
        png = await renderTrophyCardPng(props);
    } catch (err) {
        console.warn('[Trophy:group] render failed:', err.message);
        return;
    }

    const playerCount = match.players?.length || 0;
    const caption = playerCount > 2
        ? `🏆 ${props.winner.callsign} — Victory locked in.\n1st of ${playerCount} in match ${props.matchId}.`
        : `🏆 ${props.winner.callsign} — Victory locked in.\n${props.winner.callsign} defeated ${props.loser.callsign} in match ${props.matchId}.`;

    try {
        await bot.telegram.sendPhoto(winnerTgId, { source: png }, {
            caption,
            reply_markup: {
                inline_keyboard: [[
                    { text: '🎯 Play Again',     url: `${MINI_APP_URL}?startapp=play` },
                    { text: 'My Games',          url: `${MINI_APP_URL}?startapp=mygames` },
                ]],
            },
        });
    } catch (err) {
        console.warn('[Trophy:group] sendPhoto failed:', err.message);
    }
}
