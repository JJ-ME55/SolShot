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
 * Posted after a successful shot. Tier-aware text:
 *   - Eliminated 1+ players → headline + KO list + alive count
 *   - Massive hit (60+ HP)  → headline + target name
 *   - Standard hit          → one-liner with target(s)
 *
 * Targets are rendered via nameOnly() — visible to the chat but no @-ping.
 * Per JJ's request: "say and not tag who JJ hit" — show the target without
 * pinging them (avoids notification spam every shot, and the firer's
 * @mention is already there for context).
 *
 * Multi-target shots (Crazy Ivan splash, Heatseeker chain, etc.) list each
 * damaged player with their individual amount, joined with " · ".
 *
 * Phase 1e will add sticker selection on top of this for big-moment events.
 */
export function formatShotResult(match, firer, weapon, totalDamage, eliminatedThisShot, damagedThisShot = []) {
    const weaponName = weapon?.name || `Weapon ${weapon?.weaponId ?? '?'}`;

    // KO tier — at least one player eliminated.
    // Use nameOnly for KO'd targets too (consistent with Just1Fishing's
    // request not to ping). The KO line + alive count tells the chat
    // exactly who's gone without spamming notifications.
    if (eliminatedThisShot.length > 0) {
        const targets = eliminatedThisShot.map(p => `<b>${nameOnly(p)}</b>`).join(', ');
        const lines = [
            `💥 ${mention(firer)} fires <b>${escapeHtml(weaponName)}</b>`,
            `${eliminatedThisShot.length === 1 ? 'KO' : `${eliminatedThisShot.length}× KO`}: ${targets}`,
            `${aliveLine(match)}`,
        ];
        return lines.join('\n');
    }

    // Build the per-target damage suffix from damagedThisShot. If absent
    // (defensive), fall back to the legacy "— N HP" headline so older
    // call sites + edge cases (self-damage only, weird physics) still
    // produce a readable line.
    const targetSuffix = damagedThisShot.length
        ? damagedThisShot
            .map(({ player, damage }) => `-${damage} HP ${nameOnly(player)}`)
            .join(' · ')
        : `${totalDamage} HP`;

    // Massive-hit tier — same emoji elevation as before, with named targets.
    if (totalDamage >= 60) {
        return `💥 ${mention(firer)} fires <b>${escapeHtml(weaponName)}</b> — ${targetSuffix}`;
    }

    // Standard tier — the one-liner JJ requested:
    //   🎯 @jj_me fires Heatseeker: -50 HP PerryPeralta
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
