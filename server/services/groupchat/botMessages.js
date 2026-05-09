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

// ─── Turn chaser ────────────────────────────────────────────────────────

/**
 * Posted at 25% / 50% / 75% of the WAKING-time turn deadline when a
 * player still hasn't moved. Three escalating tones — "gentle nudge"
 * at 25%, "halfway reminder" at 50%, "last call" at 75%. The hours
 * remaining figure is best-effort: it counts wall-clock from now to
 * the configured deadline (already quiet-hours-aware via the deadline
 * Date the scheduler computes), rounded to a whole hour for short
 * matches and a useful display for longer ones.
 *
 * @param {object} match
 * @param {number} fraction - 0.25 | 0.50 | 0.75
 * @param {Date}   deadline - The actual final deadline Date for this turn
 */
export function formatTurnChaser(match, fraction, deadline) {
    const player = match.players[match.currentPlayerIndex];
    if (!player) return '';

    const remainingMs = Math.max(0, deadline.getTime() - Date.now());
    const remainingLabel = formatRemaining(remainingMs);

    if (fraction <= 0.25) {
        // 25% — gentlest tone. Friendly nudge.
        return [
            `⏳ ${mention(player)} — your shot's still pending`,
            `<i>~${remainingLabel} left to fire before the idle penalty kicks in.</i>`,
        ].join('\n');
    }

    if (fraction <= 0.50) {
        // 50% — halfway reminder. Slightly more pointed.
        return [
            `⏰ ${mention(player)} — halfway through your turn`,
            `<i>~${remainingLabel} left. Take your shot when you can.</i>`,
        ].join('\n');
    }

    // 75% — last call. Clear that the deadline is close.
    return [
        `🚨 ${mention(player)} — last call`,
        `<i>~${remainingLabel} left before idle penalty + missed-turn strike.</i>`,
    ].join('\n');
}

/**
 * Format a duration in ms as a chat-friendly remaining time:
 *   ≥ 1h:    "3h" / "1h 20m" — round half-hours up to nearest 5min
 *   < 1h:    "45m" / "12m"
 *   < 1m:    "<1m"
 */
function formatRemaining(ms) {
    if (ms < 60 * 1000) return '<1m';
    const totalMinutes = Math.floor(ms / (60 * 1000));
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) return `${hours}h`;
    // Round minutes to nearest 5 for nicer display ("1h 20m" not "1h 23m")
    const roundedMinutes = Math.round(minutes / 5) * 5;
    if (roundedMinutes === 0) return `${hours}h`;
    if (roundedMinutes === 60) return `${hours + 1}h`;
    return `${hours}h ${roundedMinutes}m`;
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

const SOL_PER_LAMPORT = 1_000_000_000;

/**
 * Default v2 escrow fee snapshot in BPS — matches GlobalConfig defaults
 * at the time settle_match was called. Used as a fallback when the match
 * doc doesn't carry an explicit per-match fee snapshot. This is for the
 * preview-style winnings line; the actual on-chain math is authoritative.
 */
const DEFAULT_TREASURY_BPS = 700;
const DEFAULT_OPS_BPS = 300;

/**
 * Estimate the winner payout for a wagered match — pot minus treasury+ops
 * fees. Reads per-match BPS from match.config.fees if present (escrow-v2
 * snapshots them at create_match time, so this lines up with the on-chain
 * settlement). Falls back to the GlobalConfig defaults otherwise.
 *
 * Returns lamports as a number. Off by ≤2 lamports vs on-chain due to
 * BPS-floor rounding (acceptable for display).
 */
function estimateWinnerPayoutLamports(match) {
    const wager = match?.config?.wagerLamports || 0;
    if (!wager) return 0;
    // Count actual depositors. For a 3-player wagered match where all
    // deposited, that's 3 — same number used by the on-chain CPI.
    const depositors = (match?.players || []).filter(p => p.initialDepositTx).length
        || (match?.players || []).length; // fall back to player count if deposit field absent
    const pot = wager * depositors;
    const treasuryBps = match?.config?.fees?.treasuryBps ?? DEFAULT_TREASURY_BPS;
    const opsBps = match?.config?.fees?.opsBps ?? DEFAULT_OPS_BPS;
    const treasury = Math.floor((pot * treasuryBps) / 10_000);
    const ops = Math.floor((pot * opsBps) / 10_000);
    return pot - treasury - ops;
}

function formatSOL(lamports) {
    if (!lamports) return '0';
    const sol = lamports / SOL_PER_LAMPORT;
    // Trim trailing zeros for nicer display: 0.0270 → 0.027
    return sol.toFixed(4).replace(/\.?0+$/, '') || '0';
}

/**
 * Posted when a match settles. Shows winner + summary.
 *
 * For wagered matches, includes an estimated winnings line so spectators
 * see the upside ("JJ wins ~0.027 SOL — 0.03 SOL pot") immediately when
 * the match-end card lands. The actual settlement TX is announced via
 * formatSettlementSuccess once the on-chain CPI confirms — replaces the
 * old "Settlement happens via escrow v2 (Phase 2)." placeholder.
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
    if (match.config?.type === 'wagered') {
        const winnerTgId = ranked[0];
        const winnerPlayer = winnerTgId
            ? match.players.find(p => p.telegramUserId === winnerTgId)
            : null;
        const winnerPayout = estimateWinnerPayoutLamports(match);
        const wager = match.config.wagerLamports || 0;
        const depositors = (match.players || []).filter(p => p.initialDepositTx).length
            || (match.players || []).length;
        const pot = wager * depositors;
        if (winnerPlayer && winnerPayout > 0) {
            lines.push('');
            lines.push(`💰 <b>${nameOnly(winnerPlayer)}</b> wins <b>~${formatSOL(winnerPayout)} SOL</b>`);
            lines.push(`<i>Pot ${formatSOL(pot)} SOL · settling on-chain…</i>`);
        }
    }
    return lines.join('\n');
}

/**
 * Posted as a follow-up after the on-chain settlement TX confirms.
 * Closes the loop on the "settling on-chain…" line from formatMatchEnd
 * with the actual TX signature so the chat can verify the payout.
 */
export function formatSettlementSuccess(match, txSignature) {
    const winnerTgId = (match.rankedFinishers || [])[0];
    const winnerPlayer = winnerTgId
        ? match.players.find(p => p.telegramUserId === winnerTgId)
        : null;
    const winnerPayout = estimateWinnerPayoutLamports(match);
    const winnerLabel = winnerPlayer ? nameOnly(winnerPlayer) : 'Winner';
    const explorer = txSignature
        ? `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`
        : null;
    const lines = [
        `✅ <b>${escapeHtml(winnerLabel)}</b> paid <b>${formatSOL(winnerPayout)} SOL</b> on-chain`,
    ];
    if (explorer) {
        lines.push(`<a href="${explorer}">View settlement TX</a>`);
    }
    return lines.join('\n');
}

// ─── Shot result ────────────────────────────────────────────────────────

/**
 * Posted after a successful shot. Two formats only:
 *
 * HIT (no eliminations this shot):
 *   🎯 @jj_me fires Heatseeker: -50 HP PerryPeralta
 *
 * KO (one or more eliminations this shot):
 *   💥 @jj_me fires Heatseeker — KO PerryPeralta · 2 alive of 3
 *
 * Per JJ's feedback: one type of hit notification, one type of KO
 * notification. No massive-hit / multi-tier branches — the damage
 * number speaks for itself.
 *
 * Multi-target HIT lists each on the same line:
 *   🎯 @jj_me fires Crazy Ivan: -30 HP PerryPeralta · -20 HP Just1Fishing
 *
 * Multi-KO uses the count prefix:
 *   💥 @jj_me fires Crazy Ivan — 2× KO PerryPeralta, Just1Fishing · 1 alive of 3
 *
 * Targets render via nameOnly() — visible to the chat but no @-ping.
 * Only the firer gets mentioned (deserves credit, won't spam the room
 * with notifications every shot).
 */
export function formatShotResult(match, firer, weapon, totalDamage, eliminatedThisShot, damagedThisShot = []) {
    const weaponName = weapon?.name || `Weapon ${weapon?.weaponId ?? '?'}`;

    // KO tier — at least one player eliminated. Single-line format with
    // weapon + KO target(s) + alive count, separator-joined.
    if (eliminatedThisShot.length > 0) {
        const targets = eliminatedThisShot.map(p => `<b>${nameOnly(p)}</b>`).join(', ');
        const koLabel = eliminatedThisShot.length === 1 ? 'KO' : `${eliminatedThisShot.length}× KO`;
        return `💥 ${mention(firer)} fires <b>${escapeHtml(weaponName)}</b> — ${koLabel} ${targets} · ${aliveLine(match)}`;
    }

    // HIT tier — damage with no elimination. Per-target suffix joined
    // with " · " for multi-target weapons (Crazy Ivan splash, Heatseeker
    // chain). Falls back to "N HP" if damagedThisShot is absent
    // (defensive — self-damage only, weird physics edge cases).
    const targetSuffix = damagedThisShot.length
        ? damagedThisShot
            .map(({ player, damage }) => `-${damage} HP ${nameOnly(player)}`)
            .join(' · ')
        : `${totalDamage} HP`;
    return `🎯 ${mention(firer)} fires ${escapeHtml(weaponName)}: ${targetSuffix}`;
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
