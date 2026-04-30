/**
 * Bot message formatters for active group matches.
 *
 * Pure functions returning HTML-safe strings + optional inline keyboards.
 * Used by lifecycle.js to post turn pings, idle-penalty notices,
 * elimination notices, and match-end summaries to the group chat.
 *
 * Phase 1d scope: text-only (no stickers / images yet — those land in 1e
 * with the sticker library).
 */

import { escapeHtml } from './lobbyCard.js';

// ─── Helpers ────────────────────────────────────────────────────────────

/** Turn this match's player into a TG @-mention or fallback callsign string. */
function mention(player) {
    if (player?.tgUsername) return `@${escapeHtml(player.tgUsername)}`;
    return `<b>${escapeHtml(player?.callsign || 'unknown')}</b>`;
}

/** Display name (no @-ping) — for narration where we don't want to ping. */
function nameOnly(player) {
    if (player?.tgUsername) return escapeHtml(player.tgUsername);
    return escapeHtml(player?.callsign || 'unknown');
}

/** Format alive count + total: "5 alive of 8". */
function aliveLine(match) {
    const alive = match.players.filter(p => !p.eliminated).length;
    return `${alive} alive of ${match.players.length}`;
}

// ─── Match start ────────────────────────────────────────────────────────

/**
 * Posted to the chat when a match transitions from lobby → active.
 * Announces the match has started + names the first player up.
 */
export function formatMatchStart(match) {
    const first = match.players[match.currentPlayerIndex];
    const lines = [
        `🎯 <b>Match #${escapeHtml(match.matchId)}</b> — STARTED`,
        `${aliveLine(match)}  |  Turn timer: ${match.config.turnTimerMs / (60 * 60 * 1000)}h`,
        '',
        `First up: ${mention(first)}`,
    ];
    return lines.join('\n');
}

// ─── Turn ping ──────────────────────────────────────────────────────────

/**
 * Posted when a new player's turn begins. Tags them so they get a
 * notification regardless of group mute settings.
 */
export function formatTurnPing(match) {
    const player = match.players[match.currentPlayerIndex];
    if (!player) return '';
    return `🎯 ${mention(player)} — your move\nMatch #${escapeHtml(match.matchId)} · turn ${match.turnNumber + 1}`;
}

// ─── Idle penalty ───────────────────────────────────────────────────────

/**
 * Posted when a player misses their turn deadline. Shows the HP loss
 * and how many missed turns remain before auto-forfeit.
 */
export function formatIdlePenalty(match, player, prevHp) {
    const remainingMisses = 3 - player.consecutiveMissedTurns;
    const lines = [
        `💤 ${mention(player)} missed their turn`,
        `<b>−${match.config.idlePenaltyHp} HP</b>  (${prevHp} → ${player.hp})`,
    ];
    if (remainingMisses > 0 && !player.eliminated) {
        lines.push(`<i>${remainingMisses} more miss${remainingMisses === 1 ? '' : 'es'} before auto-forfeit.</i>`);
    }
    return lines.join('\n');
}

// ─── Elimination ────────────────────────────────────────────────────────

/**
 * Posted when a player is eliminated (HP→0 from any cause: shot, idle, forfeit).
 * `cause` is a short label: 'idle', 'forfeit', 'shot', etc.
 */
export function formatElimination(match, player, cause = 'shot') {
    const causeLabel = {
        idle: 'idled out',
        forfeit: 'auto-forfeited (3 misses)',
        shot: 'eliminated',
    }[cause] || 'eliminated';

    const buybackLine = match.config.buybacksEnabled && match.canPlayerBuyBack?.(match.players.indexOf(player))
        ? `\n<i>Eligible for buyback — bot will DM details.</i>`
        : '';

    return `💀 ${mention(player)} ${causeLabel}\n${aliveLine(match)}${buybackLine}`;
}

// ─── Match end ──────────────────────────────────────────────────────────

/**
 * Posted when a match settles. Shows winner + summary.
 *
 * @param {object} match - The settled match doc
 * @param {string} reason - 'last_alive' | 'time_cap'
 */
export function formatMatchEnd(match, reason = 'last_alive') {
    const ranked = match.rankedFinishers || [];
    const podium = ranked.slice(0, 3).map((tgId, i) => {
        const p = match.players.find(pl => pl.telegramUserId === tgId);
        const medal = ['🥇', '🥈', '🥉'][i];
        return `${medal} ${nameOnly(p)} (${p?.hp ?? 0} HP, ${p?.buybackCount ?? 0} buybacks)`;
    });

    const reasonLabel = reason === 'time_cap'
        ? 'Time cap reached — ranked by HP'
        : 'Last tank standing';

    const lines = [
        `🏆 <b>Match #${escapeHtml(match.matchId)}</b> — COMPLETE`,
        reasonLabel,
        '',
        ...podium,
    ];
    if (match.config.type === 'wagered') {
        lines.push('', `<i>Settlement happens via escrow v2 (Phase 2).</i>`);
    }
    return lines.join('\n');
}

// ─── Shot result ────────────────────────────────────────────────────────

/**
 * Posted after a successful shot. Tier-aware text:
 *   - Eliminated 1+ players → headline + standings
 *   - Massive hit (60+ HP)  → headline
 *   - Standard hit          → one-liner
 *
 * Phase 1e will add sticker selection on top of this for big-moment events.
 */
export function formatShotResult(match, firer, weapon, totalDamage, eliminatedThisShot) {
    const weaponName = weapon?.name || `Weapon ${weapon?.weaponId ?? '?'}`;
    if (eliminatedThisShot.length > 0) {
        const targets = eliminatedThisShot.map(p => mention(p)).join(', ');
        const lines = [
            `💥 ${mention(firer)} fires <b>${escapeHtml(weaponName)}</b>`,
            `${eliminatedThisShot.length === 1 ? 'KO' : `${eliminatedThisShot.length}× KO`}: ${targets}`,
            `${aliveLine(match)}`,
        ];
        return lines.join('\n');
    }
    if (totalDamage >= 60) {
        return `💥 ${mention(firer)} fires <b>${escapeHtml(weaponName)}</b> — <b>${totalDamage} HP</b> damage`;
    }
    return `🎯 ${mention(firer)} fires ${escapeHtml(weaponName)} — ${totalDamage} HP`;
}

// ─── Quiet hours announcements ──────────────────────────────────────────

/** Posted when the match's current turn enters a quiet-hours window. */
export function formatQuietHoursStart(match, resumeAt) {
    const hh = resumeAt.getUTCHours().toString().padStart(2, '0');
    const mm = resumeAt.getUTCMinutes().toString().padStart(2, '0');
    return `🌙 Match #${escapeHtml(match.matchId)} paused — quiet hours.\nResumes <b>${hh}:${mm} UTC</b>.`;
}

/** Posted when the match's current turn exits a quiet-hours window. */
export function formatQuietHoursEnd(match) {
    const player = match.players[match.currentPlayerIndex];
    return `☀️ Match #${escapeHtml(match.matchId)} resumed — ${mention(player)} you're up.`;
}
