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
import User from '../../models/User.js';
import * as scheduler from './scheduler.js';
import * as botMessages from './botMessages.js';
import { nextResumeTime } from './quietHours.js';
import { getBot } from '../bot.js';
import { dispatchGroupVictoryDm } from '../challenge/victoryDm.js';
import { earnGold, awardKillBonus } from '../gold.js';
import { generateTerrain, generateTankPositions, generateWind, processShot, WEAPON_DATA } from '../physics.js';

// NB: short_name is `play` on prod BotFather (per commit 910f88b — `solshot`
// short name was never registered). Set MINI_APP_URL env to override.
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://t.me/SolShotGG_bot/play';

/** Inline keyboard with a single "Take your shot" button deep-linking
 *  the player back to the Mini App for this match. */
function takeShotKeyboard(matchId) {
    return {
        inline_keyboard: [[{
            text: '🎯 Take your shot',
            url: `${MINI_APP_URL}?startapp=match_${matchId}`,
        }]],
    };
}

// ─── Module wiring ──────────────────────────────────────────────────────

scheduler.setOnTimeout(handleIdleTimeout);

// In-memory map of one-shot timers that fire when a quiet-hours window
// ENDS, so the bot can post a "resumed" announcement + re-ping the player.
// Keyed by matchId. Cleared on match state change (settle/cancel) and
// overwritten when advanceTurn re-pings.
const resumeTimers = new Map();

/**
 * Clear the quiet-hours resume timer for a match. Exported so cancel
 * handlers (in groupchat/index.js) can clean up alongside the scheduler's
 * deadline timer when a match transitions out of 'active'.
 */
export function clearResumeTimer(matchId) {
    const t = resumeTimers.get(matchId);
    if (t) {
        clearTimeout(t);
        resumeTimers.delete(matchId);
    }
}

/**
 * Post a turn ping. Quiet-hours-aware:
 *   - If the current UTC hour is inside the match's configured quiet
 *     window, post a "match paused, resumes at HH:MM UTC" notice and
 *     schedule a one-shot timer that posts the resume notice + the
 *     usual Take-your-shot button when the window ends.
 *   - Otherwise post the standard turn ping immediately.
 *
 * Idempotent re: resume timer — clears any existing one first.
 */
async function postTurnPing(match) {
    clearResumeTimer(match.matchId);
    const now = new Date();
    const resumeAt = nextResumeTime(now, match.config);

    if (resumeAt) {
        // We're inside a quiet window — pause notice now, resume notice later.
        await postToChat(match.chatId, botMessages.formatQuietHoursStart(match, resumeAt));
        const ms = resumeAt.getTime() - Date.now();
        // Sanity bounds: > 0 and < 30 days. Outside these, skip the timer.
        if (ms > 0 && ms < 30 * 24 * 60 * 60 * 1000) {
            const t = setTimeout(async () => {
                resumeTimers.delete(match.matchId);
                // Re-fetch — match state may have changed (settled/cancelled)
                // while we were sleeping.
                try {
                    const fresh = await GroupMatch.findOne({ matchId: match.matchId });
                    if (!fresh || fresh.state !== 'active') return;
                    await postToChat(fresh.chatId, botMessages.formatQuietHoursEnd(fresh), {
                        reply_markup: takeShotKeyboard(fresh.matchId),
                    });
                } catch (err) {
                    console.warn(`[group-chat] quiet-hours resume post failed for ${match.matchId}:`, err.message);
                }
            }, ms);
            if (typeof t.unref === 'function') t.unref();
            resumeTimers.set(match.matchId, t);
        }
        return;
    }

    // Normal flow — post the turn ping with Take-your-shot button.
    await postToChat(match.chatId, botMessages.formatTurnPing(match), {
        reply_markup: takeShotKeyboard(match.matchId),
    });
}

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

    // Generate terrain + tank spawn positions + initial wind.
    const { heightmap } = generateTerrain();
    const positions = generateTankPositions(heightmap, match.players.length);
    for (let i = 0; i < match.players.length; i++) {
        match.players[i].spawnX = positions[i].x;
        match.players[i].spawnY = positions[i].y;
        match.players[i].currentX = positions[i].x;
        match.players[i].currentY = positions[i].y;
    }
    match.terrainSnapshot = heightmap;
    match.walls = [];
    match.wind = generateWind();
    // Pick a random background theme (0-5) — client mirrors this order
    // in scenes/main/index.js _bgThemes (jungle/arctic/desert/moon/volcanic/default).
    match.backgroundIndex = Math.floor(Math.random() * 6);

    // Initialise gold + weapon inventory for every player. Mirrors 1v1's
    // initGold + weapon shop bootstrap. Each player starts with 1000G,
    // owns Single Shot (id=0) by default. They visit the pre-battle shop
    // (asynchronously, on first Mini App open) before they can fire —
    // shopComplete flag gates the transition to battle UI.
    for (const p of match.players) {
        p.gold = 1000;
        p.weapons = [0]; // Single Shot
        p.shopComplete = false;
    }

    await match.save();

    // Schedule the first turn deadline
    scheduler.scheduleTurnDeadline(match);

    // Post match-start announcement
    await postToChat(match.chatId, botMessages.formatMatchStart(match));
    // Post the first turn ping (quiet-hours-aware — see postTurnPing)
    await postTurnPing(match);

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

    await postTurnPing(match);
}

/**
 * Process a shot from the Mini App.
 *
 * Return shape (when ok):
 *   {
 *     ok: true,
 *     shotData: {
 *       playerId,                    // String(firerTgId)
 *       weaponId,
 *       trajectory,                  // [{x,y,vx,vy}, ...] from physics
 *       impact,                      // { type, x, y, tankId? } from physics
 *       damage,                      // { tgIdString: hpLoss } map
 *       terrainUpdate,               // newTerrain heightmap (or null if unchanged)
 *       totalDamage,                 // sum of damage applied
 *       eliminations,                // [tgIdString, ...] eliminated this shot
 *       nextTurn,                    // String(next current player tgId) or null if settled
 *       hp,                          // { tgIdString: hp } full map after this shot
 *       alive,                       // { tgIdString: bool } full map after this shot
 *       currentPlayerIndex,
 *       windAfter,                   // wind regenerated for the next turn
 *       matchState,                  // 'active' | 'settled' (if settled, no nextTurn)
 *     }
 *   }
 *
 * This shape is a deliberate superset of the 1v1 `turnResult` payload —
 * the same fields the existing Phaser MainScene uses to animate
 * trajectory + apply damage + update terrain. Group-chat's socket
 * adapter (socket-io/groupchat.js fireGroupShot) translates it into
 * a turnResult-compatible shape so MainScene can run unchanged.
 *
 * @param {string} matchId
 * @param {number} firerTgId - Telegram user id of the firer
 * @param {object} shot - { angle, power, weaponId }
 */
export async function handleShot(matchId, firerTgId, shot) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match || match.state !== 'active') {
        return { ok: false, error: 'match_not_active' };
    }
    const firerIdx = match.players.findIndex(p => p.telegramUserId === firerTgId);
    if (firerIdx === -1) return { ok: false, error: 'not_a_player' };
    if (firerIdx !== match.currentPlayerIndex) return { ok: false, error: 'not_your_turn' };
    const firer = match.players[firerIdx];
    if (firer.eliminated) return { ok: false, error: 'eliminated' };

    const weapon = WEAPON_DATA[shot.weaponId];
    if (!weapon) return { ok: false, error: 'unknown_weapon' };
    // SECURITY: enforce inventory ownership. Without this a client could
    // skip the shop and fire any weapon by sending its id. The shop
    // (purchaseGroupWeapon handler) is the only path that mutates
    // player.weapons — bought weapons + the default [0] = Single Shot.
    const ownedWeapons = Array.isArray(firer.weapons) ? firer.weapons : [0];
    if (!ownedWeapons.includes(Number(shot.weaponId))) {
        return { ok: false, error: 'weapon_not_owned' };
    }
    const angle = Number(shot.angle);
    const power = Math.max(1, Math.min(100, Number(shot.power) || 0));
    if (!Number.isFinite(angle)) return { ok: false, error: 'bad_angle' };

    // Build tanks array for physics — exclude eliminated players (no body to hit)
    const tanks = match.players
        .filter(p => !p.eliminated)
        .map(p => ({
            id: String(p.telegramUserId),
            x: p.currentX,
            y: p.currentY,
        }));

    const result = processShot({
        angle,
        power,
        weaponId: shot.weaponId,
        startX: firer.currentX,
        startY: firer.currentY,
        shooterId: String(firerTgId),
        terrain: match.terrainSnapshot,
        tanks,
        wind: match.wind || 0,
    });

    // Apply damage map
    let totalDamage = 0;
    const eliminatedThisShot = [];
    for (const [targetId, dmg] of Object.entries(result.damage || {})) {
        if (!dmg || dmg <= 0) continue;
        const targetIdx = match.players.findIndex(p => String(p.telegramUserId) === targetId);
        if (targetIdx === -1) continue;
        const target = match.players[targetIdx];
        if (target.eliminated) continue;

        const prevHp = target.hp;
        target.hp = Math.max(0, target.hp - dmg);
        const applied = prevHp - target.hp;
        totalDamage += applied;

        if (target.hp <= 0) {
            target.eliminated = true;
            target.eliminatedAt = new Date();
            target.eliminationOrder = nextEliminationOrder(match);
            if (isPastHalfwayMark(match)) target.survivalEligible = false;
            eliminatedThisShot.push(target);
            // Award the kill to the firer (unless self-damage)
            if (targetIdx !== firerIdx) {
                firer.kills = (firer.kills || 0) + 1;
            }
        }
    }
    firer.damageDealt = (firer.damageDealt || 0) + totalDamage;
    // A successful shot resets the consecutive-miss counter
    firer.consecutiveMissedTurns = 0;
    // Persist aim state so the next time this player opens the Mini App
    // their turret + power bar are pre-set to where they last fired.
    firer.lastAngle = angle;
    firer.lastPower = power;

    // Award gold — mirrors 1v1's earnGold + kill-bonus pattern.
    // earnGold/awardKillBonus take a goldState object keyed by playerId, so
    // we adapt by treating firer.gold as a single-key state.
    const goldState = { [String(firer.telegramUserId)]: firer.gold || 0 };
    const goldEarnedFromDamage = earnGold(goldState, String(firer.telegramUserId), totalDamage);
    let killBonusGold = 0;
    for (const _killed of eliminatedThisShot) {
        killBonusGold += awardKillBonus(goldState, String(firer.telegramUserId));
    }
    firer.gold = goldState[String(firer.telegramUserId)];
    const goldEarnedThisShot = goldEarnedFromDamage + killBonusGold;

    // Persist updated terrain
    const terrainChanged = !!result.newTerrain;
    if (terrainChanged) match.terrainSnapshot = result.newTerrain;

    await match.save();

    // Post shot summary to chat — but delay it ~3s so it lands AFTER the
    // viewers' Phaser animation (trajectory + blast + HP flash) has played
    // out. The chat ping was previously arriving as a spoiler — players
    // with the Mini App open would read "JJ_ME hit Elder for 50" in chat
    // before the shell visually impacted on screen. Fire-and-forget; we
    // don't gate the socket return on chat post completion.
    setTimeout(() => {
        postShotSummary(match, firer, weapon, totalDamage, eliminatedThisShot)
            .catch(err => console.error('[group-chat] delayed postShotSummary error:', err));
    }, 3000);

    // Build the partial shotData payload — common to settled + active outcomes.
    // Damage map keys are already String(tgId) per physics.processShot input.
    const buildHpMap = () => Object.fromEntries(match.players.map(p => [String(p.telegramUserId), p.hp]));
    const buildAliveMap = () => Object.fromEntries(match.players.map(p => [String(p.telegramUserId), !p.eliminated]));

    const buildGoldMap = () => Object.fromEntries(match.players.map(p => [String(p.telegramUserId), p.gold || 0]));

    const shotDataBase = {
        playerId: String(firerTgId),
        weaponId: shot.weaponId,
        trajectory: result.trajectory || [],
        impact: result.impact || null,
        damage: result.damage || {},
        // Echo the new terrain only if it changed — saves bandwidth on misses
        terrainUpdate: terrainChanged ? match.terrainSnapshot : null,
        totalDamage,
        eliminations: eliminatedThisShot.map(p => String(p.telegramUserId)),
        hp: buildHpMap(),
        alive: buildAliveMap(),
        // Gold awarded for THIS shot (matches 1v1 turnResult.goldEarned shape)
        goldEarned: goldEarnedThisShot,
        // Full gold balances after this shot — keyed by tgId string, matches
        // turnResult.goldBalance shape so the existing 1v1 HUD path works.
        goldBalance: buildGoldMap(),
    };

    // Check win condition before advancing
    if (await checkAndSettle(match)) {
        return {
            ok: true,
            shotData: {
                ...shotDataBase,
                nextTurn: null,
                currentPlayerIndex: match.currentPlayerIndex,
                windAfter: match.wind,
                matchState: 'settled',
            },
        };
    }

    // Advance to next alive player. Wind is generated ONCE at startMatch
    // and persists for the duration of the group-chat match — players have
    // hours-to-days between turns and changing wind every shot would feel
    // arbitrary and disconnected from how the chat narrative flows. (1v1
    // regenerates wind per round; group-chat is single-life with no rounds.)
    await advanceTurn(match);

    const nextPlayer = match.players[match.currentPlayerIndex];
    return {
        ok: true,
        shotData: {
            ...shotDataBase,
            nextTurn: nextPlayer ? String(nextPlayer.telegramUserId) : null,
            currentPlayerIndex: match.currentPlayerIndex,
            windAfter: match.wind,
            matchState: 'active',
        },
    };
}

/**
 * Post a chat message describing the shot outcome.
 * Tier-aware (text-only for now — sticker library lands in Phase 1e):
 *   - Massive hit (60+) / multi-kill / final blow → bigger message
 *   - Standard hit → one-liner
 *   - Miss / glancing → silent (returns early)
 */
async function postShotSummary(match, firer, weapon, totalDamage, eliminatedThisShot) {
    if (totalDamage < 10 && eliminatedThisShot.length === 0) {
        // Silent tier — no chat post
        return;
    }
    const text = botMessages.formatShotResult(match, firer, weapon, totalDamage, eliminatedThisShot);
    await postToChat(match.chatId, text);
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
    clearResumeTimer(match.matchId);

    match.state = 'settled';
    match.settledAt = new Date();
    match.rankedFinishers = computeRanking(match);

    await match.save();

    await postToChat(match.chatId, botMessages.formatMatchEnd(match, reason));

    // Career-card pipeline hook — push to each player's matchHistory + lifetime
    // stats so /stats and the trophy/career cards reflect group-match results.
    // Best-effort, errors logged but never propagated.
    try {
        await pushMatchHistory(match);
    } catch (err) {
        console.warn('[group-chat] pushMatchHistory failed:', err.message);
    }

    // Trophy DM to winner — same celebration as 1v1. The "same game, different
    // pacing" principle: winning a group-chat match earns the same trophy
    // card a 1v1 win does. Best-effort, fire-and-forget.
    try {
        await dispatchGroupVictoryDm(match);
    } catch (err) {
        console.warn('[group-chat] dispatchGroupVictoryDm failed:', err.message);
    }

    // Phase 2 hook: settlement tx for wagered matches goes here (escrow v2).
}

/**
 * Push group-match results to each linked-User's matchHistory + lifetime
 * stats. Mirrors the 1v1 settlement pattern in socket-io/main.js but
 * keyed on telegramUserId (since group-mode v1 is free, many players
 * have no wallet). Players without a User doc (truly anonymous) are
 * silently skipped.
 *
 * Group-match stat semantics:
 *   - matchesPlayed +1 for every player
 *   - wins +1 only for rank 0 (the survivor / top of HP-rank tiebreaker)
 *   - losses +1 for everyone else
 *   - totalDamage += player.damageDealt
 *   - kills += player.kills
 *   - deaths += 1 if eliminated, else 0
 *   - consecutiveWins streak: incremented for rank 0, reset for others
 *   - matchHistory: pushed with mode='group-chat', opponent=chat title,
 *     capped at last 50
 *
 * v1 only allows Single Shot (weaponId=0); per-weapon stats are not
 * updated to keep this surgical. When weapon shop lands in Phase 2 we
 * extend with weaponStats increments.
 */
async function pushMatchHistory(match) {
    const totalRanked = match.rankedFinishers?.length || 0;
    const winnerTgId = totalRanked > 0 ? match.rankedFinishers[0] : null;
    const opponent = match.chatTitle ? String(match.chatTitle).slice(0, 32) : 'GROUP';
    const mode = match.config?.type === 'wagered' ? 'group-chat-wagered' : 'group-chat';

    for (const p of match.players) {
        if (!p.telegramUserId) continue; // truly anonymous slot — shouldn't happen but defend
        const isWinner = p.telegramUserId === winnerTgId;
        const eliminated = !!p.eliminated;

        const historyEntry = {
            opponent,
            result: isWinner ? 'win' : 'loss',
            mode,
            damageDealt: p.damageDealt || 0,
            kills: p.kills || 0,
            deaths: eliminated ? 1 : 0,
            goldEarned: 0, // group-mode v1 has no gold economy
            playedAt: match.settledAt || new Date(),
        };

        try {
            await User.findOneAndUpdate(
                { telegramUserId: p.telegramUserId },
                {
                    $inc: {
                        'stats.matchesPlayed': 1,
                        'stats.totalDamage': p.damageDealt || 0,
                        'stats.kills': p.kills || 0,
                        'stats.deaths': eliminated ? 1 : 0,
                        ...(isWinner
                            ? { 'stats.wins': 1, 'stats.consecutiveWins': 1 }
                            : { 'stats.losses': 1 }),
                    },
                    ...(!isWinner
                        ? { $set: { 'stats.consecutiveWins': 0, lastActive: new Date() } }
                        : { $set: { lastActive: new Date() } }),
                    $push: { matchHistory: { $each: [historyEntry], $slice: -50 } },
                },
                { upsert: false } // do not create User docs from settlement — only update existing
            );

            // Bump bestWinStreak if current exceeds it (matches 1v1 pattern)
            if (isWinner) {
                const user = await User.findOne({ telegramUserId: p.telegramUserId });
                if (user?.stats && (user.stats.consecutiveWins || 0) > (user.stats.bestWinStreak || 0)) {
                    user.stats.bestWinStreak = user.stats.consecutiveWins;
                    await user.save();
                }
            }
        } catch (err) {
            console.warn(`[group-chat] matchHistory push failed for tgId ${p.telegramUserId}:`, err.message);
        }
    }
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
