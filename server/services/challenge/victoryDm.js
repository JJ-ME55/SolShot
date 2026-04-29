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

const MINI_APP_URL = process.env.MINI_APP_URL || 'https://t.me/SolShotGG_bot/play';

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
        terrain: (room?.matchMode || 'BATTLEFIELD').toUpperCase().slice(0, 10),
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
