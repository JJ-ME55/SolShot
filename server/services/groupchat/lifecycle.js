/**
 * Group-chat match lifecycle.
 *
 * State transitions:
 *   lobby → active → (settled | cancelled)
 *
 * Phase 1d scope (this file):
 *   - startMatch(matchId)            — transition lobby → active
 *   - handleIdleTimeout(matchId)     — apply HP penalty, advance or eliminate
 *   - advanceTurn(match)             — pick next alive player, schedule timer
 *   - settleMatch(match, reason)     — transition active → settled, post summary
 *
 * NOT in this file (Phase 1c+1d-real):
 *   - Shot firing — players need the Mini App to aim/fire. Lifecycle here
 *     handles only the lobby/turn-rotation/idle/settlement loop. A separate
 *     handleShot(...) entry will land when the Mini App can drive it.
 *
 * All public functions are async and persist mutations to MongoDB.
 */

import GroupMatch from '../../models/GroupMatch.js';
import * as scheduler from './scheduler.js';
import * as botMessages from './botMessages.js';
import { getBot } from '../bot.js';

// ─── Module wiring ──────────────────────────────────────────────────────

scheduler.setOnTimeout(handleIdleTimeout);

// ─── Lifecycle entry points ─────────────────────────────────────────────

/**
 * Transition a lobby match to active. Picks a random first player,
 * generates terrain (placeholder for now), schedules the first turn
 * timer, posts a turn ping to the group chat.
 */
export async function startMatch(matchId) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match) {
        console.warn(`[group-chat] startMatch: match ${matchId} not found`);
        return null;
    }
    if (match.state !== 'lobby') {
        console.warn(`[group-chat] startMatch: match ${matchId} is in state ${match.state}, not lobby`);
        return match;
    }
    if (match.players.length < match.config.minPlayers) {
        console.warn(`[group-chat] startMatch: match ${matchId} has ${match.players.length} players, needs ${match.config.minPlayers}`);
        return match;
    }

    const now = new Date();

    // Random first player — fairness over join-order privilege.
    const firstIdx = Math.floor(Math.random() * match.players.length);

    match.state = 'active';
    match.startedAt = now;
    match.endsAt = new Date(now.getTime() + match.config.durationMs);
    match.currentPlayerIndex = firstIdx;
    match.turnNumber = 0;
    match.turnStartedAt = now;

    // Phase 1d-core: terrain stays empty. Real gen + tank spawn comes when
    // we wire shot firing in 1c. For now, the match runs purely on
    // turn rotation and idle penalties.
    match.terrainSnapshot = [];
    match.walls = [];
    match.wind = 0;

    await match.save();

    // Schedule the first turn deadline
    scheduler.scheduleTurnDeadline(match);

    // Post match-start announcement
    await postToChat(match.chatId, botMessages.formatMatchStart(match));
    // Post the first turn ping
    await postToChat(match.chatId, botMessages.formatTurnPing(match));

    return match;
}

/**
 * Called by the scheduler when a turn deadline expires without the
 * player having taken their turn. Applies idle penalty, advances or
 * eliminates, posts to the chat.
 */
export async function handleIdleTimeout(matchId) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match || match.state !== 'active') return;

    const player = match.players[match.currentPlayerIndex];
    if (!player) {
        // Defensive: bad index. Try to recover by advancing.
        await advanceTurn(match);
        return;
    }

    // Apply HP penalty
    const prevHp = player.hp;
    const penalty = match.config.idlePenaltyHp;
    player.hp = Math.max(0, player.hp - penalty);
    player.consecutiveMissedTurns = (player.consecutiveMissedTurns || 0) + 1;
    player.missedTurns = (player.missedTurns || 0) + 1;

    // Survival eligibility — if we've crossed 50% match progress AND this
    // miss takes them below 50% HP or eliminates them, lose eligibility.
    // For simplicity, we lose eligibility on FIRST elimination (any cause).
    // (Per Q-008 resolution, buybacks forfeit it permanently.)

    let eliminated = false;
    let cause = 'idle';

    if (player.consecutiveMissedTurns >= 3) {
        // Auto-forfeit
        eliminated = true;
        cause = 'forfeit';
        player.hp = 0;
    } else if (player.hp <= 0) {
        // HP-from-idle elimination
        eliminated = true;
        cause = 'idle';
    }

    if (eliminated) {
        player.eliminated = true;
        player.eliminatedAt = new Date();
        player.eliminationOrder = nextEliminationOrder(match);
        // Survival pool eligibility: forfeit if past 50% match-duration mark.
        if (isPastHalfwayMark(match)) {
            player.survivalEligible = false;
        }
    }

    await match.save();

    // Post penalty notice
    await postToChat(match.chatId, botMessages.formatIdlePenalty(match, player, prevHp));
    if (eliminated) {
        await postToChat(match.chatId, botMessages.formatElimination(match, player, cause));
    }

    // Check win condition before advancing
    if (await checkAndSettle(match)) return;

    // Advance to next player
    await advanceTurn(match);
}

/**
 * Pick the next alive player, schedule their turn timer, post turn ping.
 * Skips eliminated players. If only one player is alive, settles instead.
 */
export async function advanceTurn(match) {
    if (match.state !== 'active') return;

    const aliveIndices = match.players
        .map((p, i) => p.eliminated ? -1 : i)
        .filter(i => i >= 0);

    if (aliveIndices.length <= 1) {
        await settleMatch(match, 'last_alive');
        return;
    }

    // Find next alive player after current
    const cur = match.currentPlayerIndex;
    let next = (cur + 1) % match.players.length;
    let safety = match.players.length;
    while (match.players[next].eliminated && safety-- > 0) {
        next = (next + 1) % match.players.length;
    }

    match.currentPlayerIndex = next;
    match.turnNumber += 1;
    match.turnStartedAt = new Date();

    // Reset consecutive misses for the player whose turn STARTS — their
    // counter only resets on a successful action (taking a real shot),
    // not just by becoming the current player again. So we don't reset
    // here. The miss counter resets via handleShot (Phase 1c) when they
    // successfully fire.

    await match.save();

    scheduler.scheduleTurnDeadline(match);

    await postToChat(match.chatId, botMessages.formatTurnPing(match));
}

/**
 * Settle a match — set state, compute ranked finishers, post summary.
 *
 * @param {object} match - The active match doc
 * @param {string} reason - 'last_alive' | 'time_cap'
 */
export async function settleMatch(match, reason) {
    if (match.state !== 'active') return;

    scheduler.clearMatchTimer(match.matchId);

    match.state = 'settled';
    match.settledAt = new Date();
    match.rankedFinishers = computeRanking(match);

    await match.save();

    await postToChat(match.chatId, botMessages.formatMatchEnd(match, reason));

    // Phase 2 hook: settlement tx for wagered matches goes here (escrow v2).
    // Phase 4 hook: career-card pipeline (push matchHistory entries).
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Check the win conditions on a match. If satisfied, settle and return true.
 * Win conditions:
 *   - 1 alive instant
 *   - 100% time cap reached
 */
async function checkAndSettle(match) {
    if (match.state !== 'active') return true;
    const alive = match.players.filter(p => !p.eliminated);

    if (alive.length <= 1) {
        await settleMatch(match, 'last_alive');
        return true;
    }
    if (match.endsAt && Date.now() >= match.endsAt.getTime()) {
        await settleMatch(match, 'time_cap');
        return true;
    }
    return false;
}

/**
 * Returns the next eliminationOrder value (1-indexed). Earliest = 1.
 */
function nextEliminationOrder(match) {
    const max = match.players
        .map(p => p.eliminationOrder || 0)
        .reduce((a, b) => Math.max(a, b), 0);
    return max + 1;
}

/** Has the match reached or passed the 50% match-duration mark? */
function isPastHalfwayMark(match) {
    if (!match.startedAt || !match.endsAt) return false;
    const elapsed = Date.now() - match.startedAt.getTime();
    const total = match.endsAt.getTime() - match.startedAt.getTime();
    return elapsed >= total * 0.5;
}

/**
 * Compute the final ranking at match settlement.
 * Order:
 *   1. Alive players above eliminated
 *   2. Among alive: HP descending
 *   3. Among players with same HP / among eliminated: buyback count ascending (fewer = better)
 *   4. Elimination order (later = better; alive treated as last)
 *   5. Damage dealt descending
 *
 * Returns an array of telegramUserIds in finishing order (1st, 2nd, ...).
 */
function computeRanking(match) {
    const sorted = [...match.players].sort((a, b) => {
        // 1. Alive above eliminated
        if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
        // 2. HP descending
        if (a.hp !== b.hp) return b.hp - a.hp;
        // 3. Buyback count ascending
        const ab = a.buybackCount || 0;
        const bb = b.buybackCount || 0;
        if (ab !== bb) return ab - bb;
        // 4. Elimination order (later = better; alive = Infinity)
        const ae = a.eliminated ? a.eliminationOrder : Infinity;
        const be = b.eliminated ? b.eliminationOrder : Infinity;
        if (ae !== be) return be - ae;
        // 5. Damage dealt descending
        return (b.damageDealt || 0) - (a.damageDealt || 0);
    });
    return sorted.map(p => p.telegramUserId);
}

/**
 * Send an HTML-formatted message to a chat. Wraps `bot.telegram.sendMessage`
 * with try/catch so a single bot-API failure doesn't break the lifecycle.
 */
async function postToChat(chatId, text, extra = {}) {
    const bot = getBot();
    if (!bot) {
        console.warn('[group-chat] postToChat: bot not initialised');
        return null;
    }
    try {
        return await bot.telegram.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            ...extra,
        });
    } catch (err) {
        console.error(`[group-chat] postToChat to ${chatId} failed:`, err.description || err.message);
        return null;
    }
}
