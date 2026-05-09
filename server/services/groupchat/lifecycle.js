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
import {
    initEscrowV2,
    isEscrowV2Enabled,
    createMatchEscrowV2,
    settleMatchEscrowV2,
    cancelMatchEscrowV2,
    getEscrowPDAV2,
    PROGRAM_ID as ESCROW_V2_PROGRAM_ID,
} from '../escrow-v2.js';

// Wagered deposit window — players have this long to deposit after the
// escrow PDA is created. Tighter than the program max (24h) because the
// chat lobby's social pressure means players are usually online at lobby-fill.
// Server-side cron polls escrow state to detect "all deposited" and flip
// the match to active before this expires; if some don't deposit, the host
// can call /startmatch to use start_with_depositors (≥2 needed).
const WAGERED_DEPOSIT_WINDOW_SECS = 60 * 60; // 1h

// 2026-05-04: switched off Mini App architecture (see bot.js comment).
// URL now points at solshot.gg PWA. The "Take your shot" inline button
// becomes a `url:` button to solshot.gg, opening in the in-app browser
// instead of a Mini App iframe.
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://solshot.gg/';

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
scheduler.setOnChaser(handleChaserPing);

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
 * Transition a lobby match towards play.
 *   - Free matches: lobby → active immediately (legacy behaviour).
 *   - Wagered matches: lobby → awaiting_deposits (creates escrow PDA;
 *     activation runs from confirmDeposit() once all players have paid,
 *     or from /startmatch via start_with_depositors after deposit window).
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

    if (match.config.type === 'wagered') {
        return await beginWageredDepositPhase(match);
    }

    return await activateMatch(match);
}

/**
 * Wagered handoff — create the escrow PDA on-chain with the locked-in
 * player roster, transition Mongo to awaiting_deposits, post deposit
 * prompts to the group chat. Players sign deposits in the PWA; once all
 * confirm, confirmDeposit() fires activateMatch().
 *
 * If escrow create fails, the lobby state is preserved so the host can
 * retry via /startmatch (or cancel cleanly).
 */
async function beginWageredDepositPhase(match) {
    // Defensive lazy init — escrow v2 is supposed to be initialized at boot
    // by index.js, but if the RPC was unreachable then or a SIGHUP hasn't
    // landed since a key change, retry once before giving up. Cheap and
    // idempotent (initEscrowV2 just resets + rebuilds module-level vars).
    if (!isEscrowV2Enabled()) {
        console.warn(`[group-chat] startMatch ${match.matchId}: escrow v2 not ready, retrying init`);
        initEscrowV2();
    }
    if (!isEscrowV2Enabled()) {
        console.warn(`[group-chat] startMatch ${match.matchId}: wagered match but escrow v2 not initialized`);
        await postToChat(match.chatId, `⚠️ Match #${match.matchId} — wagered matches need escrow service running. Use /cancelmatch and try again later.`);
        return match;
    }

    // Sanity: every player must have a linked wallet for wagered. Join handler
    // is supposed to enforce this, but defence-in-depth — surface a clear error
    // before we hit chain rejection (which would leave a paid PDA with no players).
    const missingWallets = match.players.filter(p => !p.walletAddress);
    if (missingWallets.length > 0) {
        const handles = missingWallets.map(p => `@${p.tgUsername || p.callsign}`).join(', ');
        await postToChat(match.chatId, `⚠️ Match #${match.matchId} cannot start — these players have no linked wallet: ${handles}. They must DM @SolShotGG_bot and tap /play to set up first.`);
        return match;
    }

    const wallets = match.players.map(p => p.walletAddress);
    const wagerSOL = match.config.wagerLamports / 1_000_000_000;
    // Match duration = lifecycle config; deposit window = WAGERED_DEPOSIT_WINDOW_SECS.
    // Escrow's match_end_ts is set by program at activation (full deposits) using
    // durationSecs we pass at create.
    const durationSecs = Math.floor(match.config.durationMs / 1000);

    const result = await createMatchEscrowV2(
        match.matchId,
        wagerSOL,
        wallets,
        durationSecs,
        WAGERED_DEPOSIT_WINDOW_SECS,
    );

    if (!result.success) {
        console.error(`[group-chat] escrow create failed for ${match.matchId}: ${result.error}`);
        await postToChat(match.chatId, `⚠️ Match #${match.matchId} — couldn't create on-chain escrow (${result.error}). Use /cancelmatch and try again.`);
        return match;
    }

    match.state = 'awaiting_deposits';
    match.escrowPda = result.escrowPDA;
    match.escrowProgramId = ESCROW_V2_PROGRAM_ID.toBase58();
    match.depositTimeoutAt = new Date(Date.now() + WAGERED_DEPOSIT_WINDOW_SECS * 1000);
    console.log(`[GC state] match=${match.matchId} lobby → awaiting_deposits players=${match.players.length} wager=${match.config.wagerLamports} pda=${result.escrowPDA?.slice(0,8)}…`);
    await match.save();

    await postToChat(match.chatId,
        `💰 <b>Match #${match.matchId}</b> — deposit phase open\n` +
        `Each player deposits <b>${wagerSOL.toFixed(3)} SOL</b> within ${Math.round(WAGERED_DEPOSIT_WINDOW_SECS / 60)}m. ` +
        `Tap below to deposit (opens solshot.gg). Match auto-starts once everyone has paid.`,
        {
            reply_markup: {
                inline_keyboard: [[{
                    text: '💸 Deposit your wager',
                    url: `${MINI_APP_URL}?startapp=deposit_${match.matchId}`,
                }]],
            },
        }
    );

    return match;
}

/**
 * Player has confirmed their deposit on-chain. Update tracking and, if
 * all players have deposited, activate the match.
 *
 * @param {string} matchId
 * @param {string} walletAddress - depositor's wallet (base58)
 * @param {string} txSignature   - deposit transaction signature
 * @returns {Promise<{ ok: boolean, allDeposited?: boolean, match?: object, error?: string }>}
 */
export async function confirmDeposit(matchId, walletAddress, txSignature) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match) return { ok: false, error: 'match_not_found' };
    if (match.state !== 'awaiting_deposits') {
        return { ok: false, error: `wrong_state_${match.state}` };
    }

    const playerIdx = match.players.findIndex(p => p.walletAddress === walletAddress);
    if (playerIdx === -1) return { ok: false, error: 'not_a_player' };

    if (match.players[playerIdx].initialDepositTx) {
        return { ok: true, allDeposited: false, alreadyConfirmed: true };
    }

    match.players[playerIdx].initialDepositTx = txSignature;
    await match.save();

    const allDeposited = match.players.every(p => p.initialDepositTx);
    if (allDeposited) {
        await activateMatch(match);
        return { ok: true, allDeposited: true, match };
    }

    return { ok: true, allDeposited: false, match };
}

/**
 * Run the actual game-start logic: terrain, tank positions, wind, gold,
 * weapons, schedule first turn deadline, post chat ping. Called from:
 *   - startMatch directly (free matches)
 *   - confirmDeposit when last deposit confirms (wagered)
 *   - (future) /startmatch resume path after partial-deposit start_with_depositors
 */
async function activateMatch(match) {
    const now = new Date();

    // Random first player — fairness over join-order privilege.
    const firstIdx = Math.floor(Math.random() * match.players.length);

    const priorState = match.state;
    match.state = 'active';
    match.startedAt = now;
    match.endsAt = new Date(now.getTime() + match.config.durationMs);
    match.currentPlayerIndex = firstIdx;
    match.turnNumber = 0;
    match.turnStartedAt = now;
    const firstPlayerTg = match.players[firstIdx]?.telegramUserId;
    console.log(`[GC state] match=${match.matchId} ${priorState} → active players=${match.players.length} firstTurn=tg=${firstPlayerTg} type=${match.config.type}`);

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
    // Pick a random background theme (0-4) — five distinct biomes.
    // Client mirrors this order in scenes/main/index.js _bgThemes
    // (jungle / arctic / desert / moon / volcanic). bg-default (idx 5)
    // was removed because its palette was identical to jungle, biasing
    // the random pick toward "feels green" — JJ flagged this in the
    // GF9B + 57BU sweep on May 7.
    match.backgroundIndex = Math.floor(Math.random() * 5);

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
/**
 * Player-initiated forfeit — same outcome as a 3-strike idle auto-forfeit
 * but synchronous from a Mini App / PWA "FORFEIT" button click. Marks the
 * caller's tank HP=0, eliminated=true, advances turn (or settles if they
 * were the second-to-last alive). For wagered matches, the surviving
 * winner takes the pot per the standard 90/7/3 settlement once last
 * alive remains — there's no per-player refund path mid-match.
 *
 * Validation: caller must be in the match, state must be 'active', caller
 * must not already be eliminated. Each branch returns a structured result
 * so the socket handler can ack the client cleanly.
 *
 * @param {string} matchId
 * @param {number} firerTgId — verified TG id of the forfeiting player
 * @returns {Promise<{ ok: boolean, error?: string, settled?: boolean }>}
 */
export async function handleForfeit(matchId, firerTgId) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match) return { ok: false, error: 'not_found' };
    if (match.state !== 'active') return { ok: false, error: 'not_active' };

    const idx = match.players.findIndex(p => p.telegramUserId === firerTgId);
    if (idx === -1) return { ok: false, error: 'not_a_player' };
    const player = match.players[idx];
    if (player.eliminated) return { ok: false, error: 'already_eliminated' };

    // Apply forfeit — same shape as the 3-miss auto-forfeit branch in
    // handleIdleTimeout: HP=0, eliminated, eliminationOrder stamped.
    player.hp = 0;
    player.eliminated = true;
    player.eliminatedAt = new Date();
    player.eliminationOrder = nextEliminationOrder(match);
    if (isPastHalfwayMark(match)) {
        player.survivalEligible = false;
    }
    await match.save();

    // Post a chat notice so the group sees what happened.
    await postToChat(match.chatId, botMessages.formatElimination(match, player, 'forfeit'));

    // Win-condition check first — if forfeit drops alive count to 1, settle.
    if (await checkAndSettle(match)) {
        return { ok: true, settled: true };
    }

    // Otherwise advance turn to next alive player.
    await advanceTurn(match);
    return { ok: true, settled: false };
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
 * Called by the scheduler when a 25/50/75% chaser timer fires. Posts a
 * gentle nudge to the chat tagging the active player. No HP penalty,
 * no DB mutation — pure reminder.
 *
 * Defensive: re-fetches the match and validates that the same turn is
 * still active (matchId + turnNumber + currentPlayerIndex match what
 * we expected). If the player already moved or the match settled, we
 * silently skip — the chaser was racing the action.
 *
 * Quiet hours are already baked into the chaser's fire time by the
 * scheduler (computeTurnDeadline walks waking-time), but we belt-and-
 * brace: if the post would land inside a quiet window for ANY reason
 * (e.g. clock drift, config changed mid-turn), we skip.
 */
export async function handleChaserPing(matchId, fraction) {
    const match = await GroupMatch.findOne({ matchId });
    if (!match || match.state !== 'active') return;
    if (!match.turnStartedAt) return;

    // Belt-and-brace quiet-hours guard. computeTurnDeadline already
    // pushes the chaser past quiet windows, but if config flipped
    // since scheduling we don't want to ping at 3am.
    const now = new Date();
    if (nextResumeTime(now, match.config)) return;

    const player = match.players[match.currentPlayerIndex];
    if (!player || player.eliminated) return;

    // The actual final deadline — used by the formatter to render the
    // remaining-time line. computeTurnDeadline accounts for any quiet
    // hours between now and the deadline.
    const deadline = scheduler.deadlineFor(match);
    if (!deadline) return;

    const text = botMessages.formatTurnChaser(match, fraction, deadline);
    if (!text) return;

    await postToChat(match.chatId, text, {
        reply_markup: takeShotKeyboard(match.matchId),
    });
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
    // Always-on observability — every reject path logs a one-liner so we can
    // see WHY a fire was rejected. Greppable as `[GC handleShot]`. Pairs
    // with the `[GC fire]` socket-handler logs to give a complete trace.
    const match = await GroupMatch.findOne({ matchId });
    if (!match) {
        console.log(`[GC handleShot] REJECT match_not_found match=${matchId} tg=${firerTgId}`);
        return { ok: false, error: 'match_not_active' };
    }
    if (match.state !== 'active') {
        console.log(`[GC handleShot] REJECT match_not_active match=${matchId} state=${match.state} tg=${firerTgId}`);
        return { ok: false, error: 'match_not_active' };
    }
    const firerIdx = match.players.findIndex(p => p.telegramUserId === firerTgId);
    if (firerIdx === -1) {
        const playerTgs = match.players.map(p => p.telegramUserId).join(',');
        console.log(`[GC handleShot] REJECT not_a_player match=${matchId} tg=${firerTgId} (roster=${playerTgs})`);
        return { ok: false, error: 'not_a_player' };
    }
    if (firerIdx !== match.currentPlayerIndex) {
        const currentTg = match.players[match.currentPlayerIndex]?.telegramUserId;
        console.log(`[GC handleShot] REJECT not_your_turn match=${matchId} firer=${firerTgId} (idx=${firerIdx}) currentTurn=${currentTg} (idx=${match.currentPlayerIndex})`);
        return { ok: false, error: 'not_your_turn' };
    }
    const firer = match.players[firerIdx];
    if (firer.eliminated) {
        console.log(`[GC handleShot] REJECT eliminated match=${matchId} tg=${firerTgId}`);
        return { ok: false, error: 'eliminated' };
    }

    const weapon = WEAPON_DATA[shot.weaponId];
    if (!weapon) {
        console.log(`[GC handleShot] REJECT unknown_weapon match=${matchId} tg=${firerTgId} weapon=${shot.weaponId}`);
        return { ok: false, error: 'unknown_weapon' };
    }
    // SECURITY: enforce inventory ownership. Without this a client could
    // skip the shop and fire any weapon by sending its id. The shop
    // (purchaseGroupWeapon handler) is the only path that mutates
    // player.weapons — bought weapons + the default [0] = Single Shot.
    const ownedWeapons = Array.isArray(firer.weapons) ? firer.weapons : [0];
    if (!ownedWeapons.includes(Number(shot.weaponId))) {
        console.log(`[GC handleShot] REJECT weapon_not_owned match=${matchId} tg=${firerTgId} weapon=${shot.weaponId} owned=${ownedWeapons.join(',')}`);
        return { ok: false, error: 'weapon_not_owned' };
    }
    const angle = Number(shot.angle);
    const power = Math.max(1, Math.min(100, Number(shot.power) || 0));
    if (!Number.isFinite(angle)) {
        console.log(`[GC handleShot] REJECT bad_angle match=${matchId} tg=${firerTgId} angle=${shot.angle}`);
        return { ok: false, error: 'bad_angle' };
    }

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

    // Always-on observability — physics output trace. Captures whether the
    // physics engine produced a real trajectory + impact, and what damage
    // it computed before any state mutation. Pairs with the success log
    // at the end of this function to show the full transform.
    const dmgEntries = Object.entries(result.damage || {});
    const dmgSummary = dmgEntries.length ? dmgEntries.map(([id, d]) => `${id}:${d}`).join(',') : 'none';
    console.log(`[GC handleShot] PHYSICS match=${matchId} firer=${firerTgId} weapon=${shot.weaponId} trajLen=${(result.trajectory || []).length} impact=${result.impact?.type || 'none'}@(${result.impact?.x?.toFixed(0) ?? '?'},${result.impact?.y?.toFixed(0) ?? '?'}) dmg=${dmgSummary} terrainChanged=${!!result.newTerrain}`);

    // Apply damage map
    let totalDamage = 0;
    const eliminatedThisShot = [];
    // damagedThisShot collects every non-self target that took damage on
    // this shot, paired with the applied amount. Drives the chat one-liner
    // (e.g. "🎯 @jj_me fires Heatseeker: -50 HP PerryPeralta") so the
    // group can see who got hit, not just the headline damage number.
    // Self-damage is excluded — narrating "X hit themselves for Y" is
    // already covered by the standard line which shows the firer.
    const damagedThisShot = [];
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

        if (applied > 0 && targetIdx !== firerIdx) {
            damagedThisShot.push({ player: target, damage: applied });
        }

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
    // Shot accounting drives accuracy% on the trophy + AAR cards.
    // Every server-validated fire is a "shot fired"; a "hit" is any shot
    // that landed > 0 damage on an opponent (excludes self-damage and
    // pure terrain misses).
    firer.shotsFired = (firer.shotsFired || 0) + 1;
    if (totalDamage > 0) firer.shotsHit = (firer.shotsHit || 0) + 1;
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
        postShotSummary(match, firer, weapon, totalDamage, eliminatedThisShot, damagedThisShot)
            .catch(err => console.error('[group-chat] delayed postShotSummary error:', err));
    }, 3000);

    // Build the partial shotData payload — common to settled + active outcomes.
    // Damage map keys are already String(tgId) per physics.processShot input.
    // Single pass over match.players collects hp + alive + gold maps in one
    // iteration; previously three separate .map calls walked the same array.
    const hpMap = {};
    const aliveMap = {};
    const goldMap = {};
    for (const p of match.players) {
        const id = String(p.telegramUserId);
        hpMap[id] = p.hp;
        aliveMap[id] = !p.eliminated;
        goldMap[id] = p.gold || 0;
    }

    // Thin trajectory helper — same as 1v1's emit path. Halves the wire
    // size of the trajectory point list, which can be 100+ frames for
    // long shots. Client interpolates between thinned points smoothly.
    const thinTrajectory = (pts) => {
        if (!pts || pts.length <= 2) return pts;
        const out = [];
        for (let i = 0; i < pts.length; i += 2) out.push(pts[i]);
        if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
        return out;
    };

    const shotDataBase = {
        playerId: String(firerTgId),
        weaponId: shot.weaponId,
        trajectory: thinTrajectory(result.trajectory || []),
        impact: result.impact || null,
        damage: result.damage || {},
        // Echo the new terrain only if it changed — saves bandwidth on misses
        terrainUpdate: terrainChanged ? match.terrainSnapshot : null,
        totalDamage,
        eliminations: eliminatedThisShot.map(p => String(p.telegramUserId)),
        hp: hpMap,
        alive: aliveMap,
        // Gold awarded for THIS shot (matches 1v1 turnResult.goldEarned shape)
        goldEarned: goldEarnedThisShot,
        // Full gold balances after this shot — keyed by tgId string, matches
        // turnResult.goldBalance shape so the existing 1v1 HUD path works.
        goldBalance: goldMap,
        // Special-weapon visual effect data — mirrors the fields 1v1's
        // turnResult emit ships. Without these the client only animates
        // the primary trajectory, so 3 Shot showed 1 projectile, Crazy
        // Ivan never scattered, Spider had no legs, Ground Hog never
        // tunneled. Thinning subTrajectories matches the 1v1 thinning
        // pass to keep payload small.
        subTrajectories: result.subTrajectories
            ? result.subTrajectories.map(thinTrajectory)
            : null,
        scatterPoints: result.scatterPoints || null,
        spiderLegs: result.spiderLegs || null,
        tunnelEntry: result.tunnelEntry || null,
        tunnelExit: result.tunnelExit || null,
    };

    // Check win condition before advancing
    if (await checkAndSettle(match)) {
        return {
            ok: true,
            // Return the in-memory match doc so the socket handler can
            // sanitize + broadcast without a redundant DB re-fetch (saves
            // ~50-200ms per shot on Atlas). checkAndSettle already saved.
            match,
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
        match,
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
async function postShotSummary(match, firer, weapon, totalDamage, eliminatedThisShot, damagedThisShot = []) {
    if (totalDamage < 10 && eliminatedThisShot.length === 0) {
        // Silent tier — no chat post
        return;
    }
    const text = botMessages.formatShotResult(match, firer, weapon, totalDamage, eliminatedThisShot, damagedThisShot);
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
    const winnerTg = match.rankedFinishers?.[0];
    const podium = match.rankedFinishers?.slice(0, 3).join(',') || '?';
    console.log(`[GC state] match=${match.matchId} active → settled reason=${reason} winner=tg=${winnerTg} podium=${podium} type=${match.config.type}`);

    await match.save();

    // PERF + ORDERING: chat post + history push + winner DM are best-effort
    // follow-ups that historically blocked settleMatch's return.
    //
    // The 3500ms delay ordering matters: handleShot's postShotSummary uses
    // setTimeout(3000) so the killing-shot chat line lands AFTER the
    // viewers' Phaser animation. If we post the match-end card via
    // setImmediate, it overtakes the shot summary and the chat reads:
    //   1. (penultimate) shot KO message
    //   2. match-end card with rankings
    //   3. (final) shot KO message ← out of order, looks like the match
    //      ended before the killing shot
    // GF9B post-mortem (May 7): both Just1Fishing and JJ noticed this in
    // the live chat. Delay match-end by 3500ms so it always lands after
    // the killing-shot summary that triggered it. For non-shot-triggered
    // settles (forfeit, idle, time-cap), the 3.5s delay is harmless —
    // there's no urgent UX dependency on the exact match-end timing.
    setTimeout(async () => {
        try {
            await postToChat(match.chatId, botMessages.formatMatchEnd(match, reason));
        } catch (err) {
            console.warn('[group-chat] settle postToChat failed:', err.message);
        }
        // Career-card pipeline — push to each player's matchHistory + lifetime
        // stats so /stats and the trophy/career cards reflect group-match results.
        try {
            await pushMatchHistory(match);
        } catch (err) {
            console.warn('[group-chat] pushMatchHistory failed:', err.message);
        }
        // Trophy DM to winner — same celebration as 1v1. The "same game,
        // different pacing" principle.
        try {
            await dispatchGroupVictoryDm(match);
        } catch (err) {
            console.warn('[group-chat] dispatchGroupVictoryDm failed:', err.message);
        }
        // Wagered: settle on-chain. Winner = rankedFinishers[0]'s wallet.
        // Treasury/ops + fee BPS are the snapshots taken at create_match time
        // (escrow-v2 reads them from the escrow account itself).
        if (match.config?.type === 'wagered' && match.escrowPda) {
            try {
                const winnerTgId = match.rankedFinishers?.[0];
                const winnerPlayer = match.players.find(p => p.telegramUserId === winnerTgId);
                if (!winnerPlayer?.walletAddress) {
                    console.error(`[group-chat] settle ${match.matchId}: winner ${winnerTgId} has no wallet — leaving escrow unsettled, public reclaim will fire after match_end + 24h`);
                } else {
                    const result = await settleMatchEscrowV2(match.matchId, winnerPlayer.walletAddress);
                    if (result.success) {
                        match.settlementTx = result.txSignature;
                        await match.save();
                        console.log(`[group-chat] settled ${match.matchId} on-chain — TX: ${result.txSignature}`);
                        // Follow-up TG post — "Just1Fishing wants a victor message
                        // showing total winnings". The match-end card already shows
                        // the estimated payout; this announces the on-chain TX so
                        // anyone in the group can verify via Solana Explorer.
                        try {
                            await postToChat(match.chatId, botMessages.formatSettlementSuccess(match, result.txSignature));
                        } catch (err) {
                            console.warn('[group-chat] settlement-success postToChat failed:', err.message);
                        }
                    } else {
                        console.error(`[group-chat] settleMatchEscrowV2 failed for ${match.matchId}: ${result.error}`);
                        // Eventual consistency: if settle fails (RPC/etc), the
                        // permissionless_reclaim path lets ANYONE refund the
                        // pot 24h after match_end_ts. So worst case is a delay,
                        // not lost funds.
                    }
                }
            } catch (err) {
                console.error(`[group-chat] settle on-chain crash for ${match.matchId}:`, err.message);
            }
        }
    }, 3500);
}

/**
 * Cancel a wagered match's on-chain escrow + refund any deposited players.
 * No-op for free matches or wagered matches whose escrow was never created
 * (state still 'lobby' at cancel time).
 *
 * @param {object} match - GroupMatch doc (already mutated to state=cancelled)
 * @returns {Promise<{ success: boolean, txSignature?: string, error?: string, skipped?: string }>}
 */
export async function cancelWageredEscrow(match) {
    if (match.config?.type !== 'wagered') {
        return { success: true, skipped: 'free_match' };
    }
    if (!match.escrowPda) {
        // Lobby-stage cancel before beginWageredDepositPhase ran — no chain action needed.
        return { success: true, skipped: 'no_escrow_created' };
    }

    // Pass deposited player wallets in player-index order. Undeposited slots
    // are skipped (cancel_match expects only deposited). escrow.cancelMatchEscrowV2
    // walks remaining_accounts in player-index order, so we must filter while
    // preserving slot positions.
    const depositedWallets = match.players
        .map((p, i) => p.initialDepositTx ? { wallet: p.walletAddress, slot: i } : null)
        .filter(x => x !== null);

    if (depositedWallets.length === 0) {
        // Escrow exists but no one deposited — escrow account holds only rent,
        // which v2 escrow's cancel/permissionless_reclaim closes back to host.
        // For now, no-op; permissionless_reclaim will sweep after grace.
        return { success: true, skipped: 'no_deposits' };
    }

    try {
        const result = await cancelMatchEscrowV2(
            match.matchId,
            depositedWallets.map(d => d.wallet)
        );
        if (result.success) {
            console.log(`[group-chat] cancelled ${match.matchId} on-chain — TX: ${result.txSignature}, refunded ${depositedWallets.length} player(s)`);
        } else {
            console.error(`[group-chat] cancelMatchEscrowV2 failed for ${match.matchId}: ${result.error}`);
        }
        return result;
    } catch (err) {
        console.error(`[group-chat] cancel on-chain crash for ${match.matchId}:`, err.message);
        return { success: false, error: err.message };
    }
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
    const settledAt = match.settledAt || new Date();

    // PERF: previous implementation did `await User.findOneAndUpdate` per
    // player + a redundant `findOne + save` for the winner's bestWinStreak.
    // For an 8-player match that's ~9 sequential round trips × 50-100ms.
    // Replaced with a single User.bulkWrite that pushes ALL stat updates
    // in one server hop, then a follow-up bulkWrite for any winners whose
    // post-update consecutiveWins exceeds bestWinStreak.
    const validPlayers = match.players.filter(p => p.telegramUserId);
    const winners = validPlayers.filter(p => p.telegramUserId === winnerTgId);

    const ops = validPlayers.map(p => {
        const isWinner = p.telegramUserId === winnerTgId;
        const eliminated = !!p.eliminated;
        const historyEntry = {
            opponent,
            result: isWinner ? 'win' : 'loss',
            mode,
            damageDealt: p.damageDealt || 0,
            kills: p.kills || 0,
            deaths: eliminated ? 1 : 0,
            goldEarned: 0,
            playedAt: settledAt,
        };
        return {
            updateOne: {
                filter: { telegramUserId: p.telegramUserId },
                update: {
                    $inc: {
                        'stats.matchesPlayed': 1,
                        'stats.totalDamage': p.damageDealt || 0,
                        'stats.kills': p.kills || 0,
                        'stats.deaths': eliminated ? 1 : 0,
                        ...(isWinner
                            ? { 'stats.wins': 1, 'stats.consecutiveWins': 1 }
                            : { 'stats.losses': 1 }),
                    },
                    $set: {
                        lastActive: settledAt,
                        ...(!isWinner ? { 'stats.consecutiveWins': 0 } : {}),
                    },
                    $push: { matchHistory: { $each: [historyEntry], $slice: -50 } },
                },
                // Don't upsert — settlement only updates existing User docs
            },
        };
    });

    if (ops.length === 0) return;

    try {
        await User.bulkWrite(ops, { ordered: false });
    } catch (err) {
        console.warn('[group-chat] matchHistory bulkWrite failed:', err.message);
        return;
    }

    // Best-win-streak update for winners. Atomic update with $expr lets us
    // compare two fields on the same doc inside a single round trip — the
    // previous code re-fetched the User doc just to read consecutiveWins.
    if (winners.length > 0) {
        try {
            const streakOps = winners.map(p => ({
                updateOne: {
                    filter: {
                        telegramUserId: p.telegramUserId,
                        $expr: { $gt: ['$stats.consecutiveWins', '$stats.bestWinStreak'] },
                    },
                    update: [
                        { $set: { 'stats.bestWinStreak': '$stats.consecutiveWins' } },
                    ],
                },
            }));
            await User.bulkWrite(streakOps, { ordered: false });
        } catch (err) {
            console.warn('[group-chat] bestWinStreak bulkWrite failed:', err.message);
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
