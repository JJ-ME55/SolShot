/**
 * Critter Kart race lifecycle — orchestrator.
 *
 * Session 1 scope: race state machine, player ready-tracking, fake
 * race resolution. Physics + real sim land in Session 2 (this module
 * gains tickRace + race-loop hooks then).
 *
 * State transitions (one race object's life):
 *
 *   createRace()          matched ──┐
 *   registerReady()       loading   │ (per player)
 *                                   │
 *   beginCountdown()      countdown │ (all ready OR timeout)
 *                                   │
 *   beginRacing()         racing    │ (after 3s countdown)
 *                                   │
 *   finishRace()          finished  │ (Session 1: fake resolution
 *                                   │  with random positions; Session
 *                                   │  2: real physics drives this)
 *                                   │
 *   settleRace()          settled   │ (career updated, terminal)
 *
 * Anti-corruption rule: only this module writes to CritterKartRace.
 * Callers (socket handlers, matchmaker) invoke these functions; they
 * do not mutate the doc directly.
 */

import crypto from 'crypto';
import logger from '../../logger.js';
import CritterKartRace, {
    MAX_PLAYERS,
    MIN_PLAYERS,
} from '../../../models/CritterKartRace.js';
import { submitRace } from '../critter-kart-standalone/standaloneLeaderboard.js';

// ── Scoring ────────────────────────────────────────────────────────────
// Mario-Kart-Grand-Prix style position points for a 6-kart race.
// Adjusts per actual race size — last place always gets 1 point so a
// completed run is always rewarded.
//
// Reference: original Mario Kart GP awards 15/12/10/7/6/4 for 6 racers.
// We use the same curve, scaled down for smaller races.
function pointsForPosition(pos, totalPlayers) {
    if (!Number.isInteger(pos) || pos < 1) return 0;
    if (pos > totalPlayers) return 0;
    // 6-player canonical table:
    const TABLE_6 = [15, 12, 10, 7, 6, 4];
    if (totalPlayers === 6) return TABLE_6[pos - 1];
    // For smaller races (2-5 humans + bot fill), scale the 6-player
    // curve so 1st always gets 15 and Nth always gets a positive value.
    // Linear interp on the curve so the gap is preserved roughly.
    const stretched = TABLE_6.slice(0, totalPlayers).map((v, i) => {
        // Re-scale so the last position gets ~4 (matches 6th-place value).
        const t = totalPlayers === 1 ? 0 : i / (totalPlayers - 1);
        return Math.max(1, Math.round(15 - t * 11));  // 15..4
    });
    return stretched[pos - 1];
}

// ── Race ID generation ─────────────────────────────────────────────────
// 16-char base32-ish id, short enough to fit in URL params and Mongo
// indexes comfortably. Collision risk is negligible for our scale.
function newRaceId() {
    return crypto.randomBytes(8).toString('base64url');
}

// ── createRace ─────────────────────────────────────────────────────────
// Called by matchmaker once a queue tick matches N humans (2..6).
// Players list is the matched humans (already de-queued).
// If players.length < format.maxPlayers, the matchmaker decides whether
// to bot-fill BEFORE calling this — see fillWithBots() below.
//
// On success:
//   - Creates a Mongo doc in 'matched' state
//   - Returns { race, raceId } so the matchmaker can emit launch URLs
//
// On failure (db error etc):
//   - Throws — matchmaker catches and notifies players
export async function createRace({ players, format = {} }) {
    if (!Array.isArray(players) || players.length < MIN_PLAYERS) {
        throw new Error(`createRace: need ≥${MIN_PLAYERS} players, got ${players?.length}`);
    }
    if (players.length > MAX_PLAYERS) {
        throw new Error(`createRace: max ${MAX_PLAYERS} players, got ${players.length}`);
    }

    // Cycle through Fish's regular roster for kart-character assignment.
    // Founders ('jj', 'fish') are playerOnly per Fish's Racer spec —
    // not used for auto-assignment. 6 players = 4 regulars + 2 dupes,
    // which is fine for race feel (weight 1.0/1.3/0.8/1.3 covers it).
    const ROSTER_RACER_IDS = ['rusty', 'shelly', 'pip', 'bruno'];
    const racerIdForSlot = (i) => ROSTER_RACER_IDS[i % ROSTER_RACER_IDS.length];

    const raceId = newRaceId();
    const race = await CritterKartRace.create({
        raceId,
        state: 'matched',
        format: {
            laps: format.laps ?? 3,
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
        },
        track: format.track ?? 'default',
        players: players.map((p, i) => ({
            telegramUserId: p.telegramUserId ?? null,
            displayName: p.displayName,
            kartId: `kart-${i}`,
            racerId: p.racerId || racerIdForSlot(i),    // Fish-roster character
            isBot: !!p.isBot,
            socketId: p.socketId ?? null,
            joinedAt: new Date(),
            readyAt: p.isBot ? new Date() : null,   // bots are instantly ready
            status: 'racing',
        })),
        matchedAt: new Date(),
    });

    logger.info('[critter-kart] race created', {
        raceId,
        players: race.players.length,
        humans: race.players.filter(p => !p.isBot).length,
        bots: race.players.filter(p => p.isBot).length,
    });
    return { race, raceId };
}

// ── fillWithBots ───────────────────────────────────────────────────────
// Helper: pad a human-only player list with bots up to targetCount.
// Bot display names are randomised from a pool for variety.
const BOT_NAMES = [
    'Critter B', 'Critter C', 'Critter D', 'Critter E', 'Critter F',
    'Critter G', 'Critter H', 'Critter I', 'Critter J', 'Critter K',
];
export function fillWithBots(humanPlayers, targetCount) {
    if (humanPlayers.length >= targetCount) return humanPlayers.slice();
    const used = new Set(humanPlayers.map(p => p.displayName));
    const pool = BOT_NAMES.filter(n => !used.has(n));
    const players = humanPlayers.slice();
    while (players.length < targetCount) {
        const idx = (players.length - humanPlayers.length) % pool.length;
        players.push({
            telegramUserId: null,
            displayName: pool[idx] ?? `Bot ${players.length}`,
            isBot: true,
        });
    }
    return players;
}

// ── registerReady ──────────────────────────────────────────────────────
// Called when a client sends `critterkart:ready`. Sets readyAt for
// that player. Returns the updated race + a flag indicating whether
// all human players are now ready (caller transitions state if so).
export async function registerReady({ raceId, telegramUserId }) {
    if (!raceId || !telegramUserId) {
        throw new Error('registerReady: raceId + telegramUserId required');
    }
    const race = await CritterKartRace.findOneAndUpdate(
        { raceId, 'players.telegramUserId': telegramUserId, 'players.readyAt': null },
        { $set: { 'players.$.readyAt': new Date() } },
        { new: true },
    );
    if (!race) {
        // Either race doesn't exist, player not in it, or already ready.
        const existing = await CritterKartRace.findOne({ raceId }).lean();
        if (!existing) throw new Error(`registerReady: race ${raceId} not found`);
        return { race: existing, allReady: existing.players.every(p => p.readyAt) };
    }
    const allReady = race.players.every(p => p.readyAt);
    return { race, allReady };
}

// ── beginCountdown ─────────────────────────────────────────────────────
// State: loading → countdown. Caller (orchestrator timer / socket
// handler) should call this when all humans ready OR after loading
// timeout (any not-ready player is auto-bot'd).
export async function beginCountdown({ raceId }) {
    const race = await CritterKartRace.findOneAndUpdate(
        { raceId, state: { $in: ['matched', 'loading'] } },
        {
            $set: {
                state: 'countdown',
                loadingStartedAt: new Date(),   // record if first time
                countdownStartedAt: new Date(),
            },
        },
        { new: true },
    );
    if (!race) {
        const existing = await CritterKartRace.findOne({ raceId }).lean();
        throw new Error(`beginCountdown: race ${raceId} not in countdown-eligible state (was: ${existing?.state})`);
    }
    return race;
}

// ── beginRacing ────────────────────────────────────────────────────────
// State: countdown → racing. Called after the 3s countdown elapses.
export async function beginRacing({ raceId }) {
    const race = await CritterKartRace.findOneAndUpdate(
        { raceId, state: 'countdown' },
        { $set: { state: 'racing', racingStartedAt: new Date() } },
        { new: true },
    );
    if (!race) {
        const existing = await CritterKartRace.findOne({ raceId }).lean();
        throw new Error(`beginRacing: race ${raceId} not in countdown (was: ${existing?.state})`);
    }
    return race;
}

// ── finishRace ─────────────────────────────────────────────────────────
// State: racing → finished. Resolves final positions.
//
// Session 1: stub — accepts an optional `resolveStub` flag that picks
// fake positions (random order, fake times). This lets the socket
// flow run end-to-end without physics yet.
//
// Session 2: physics module calls this with real resolution from the
// race-end (positions array derived from finish line crossings).
//
// `positions` is an array of:
//   { kartId, finishPosition, finishTimeMs, bestLapMs, lapTimes }
// Length must equal race.players.length.
export async function finishRace({ raceId, positions, resolveStub = false }) {
    const race = await CritterKartRace.findOne({ raceId });
    if (!race) throw new Error(`finishRace: race ${raceId} not found`);
    if (race.state !== 'racing') {
        throw new Error(`finishRace: race ${raceId} not in racing state (was: ${race.state})`);
    }

    // Session 1 stub — generate random positions if real ones not supplied
    if (resolveStub || !positions) {
        const kartIds = race.players.map(p => p.kartId);
        const shuffled = [...kartIds].sort(() => Math.random() - 0.5);
        positions = shuffled.map((kartId, idx) => ({
            kartId,
            finishPosition: idx + 1,
            // Fake times: 60-120s total, scaled to position
            finishTimeMs: 60_000 + idx * 8_000 + Math.floor(Math.random() * 3_000),
            bestLapMs: 18_000 + Math.floor(Math.random() * 4_000),
            lapTimes: [
                20_000 + Math.floor(Math.random() * 4_000),
                19_000 + Math.floor(Math.random() * 4_000),
                21_000 + Math.floor(Math.random() * 4_000),
            ],
        }));
    }

    // Apply positions to player subdocs
    for (const result of positions) {
        const player = race.players.find(p => p.kartId === result.kartId);
        if (!player) {
            logger.warn('[critter-kart] finishRace: unknown kartId in positions', {
                raceId, kartId: result.kartId,
            });
            continue;
        }
        player.finishPosition = result.finishPosition;
        player.finishTimeMs = result.finishTimeMs;
        player.bestLapMs = result.bestLapMs;
        player.lapTimes = result.lapTimes || [];
        player.status = 'finished';
        player.pointsAwarded = pointsForPosition(result.finishPosition, race.players.length);
    }

    race.state = 'finished';
    race.endedAt = new Date();
    await race.save();

    logger.info('[critter-kart] race finished', {
        raceId,
        positions: race.players
            .slice()
            .sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99))
            .map(p => `${p.finishPosition}.${p.displayName}(${p.pointsAwarded}pt)`)
            .join(' '),
    });
    return race;
}

// ── settleRace ─────────────────────────────────────────────────────────
// State: finished → settled. Writes each human's result to the career
// aggregate via the existing submitRace API. Bots are skipped.
//
// This is the integration point with CritterKartCareer — single source
// of truth for career stats. The career writer doesn't know about
// races, just per-finish summaries.
export async function settleRace({ raceId }) {
    const race = await CritterKartRace.findOne({ raceId });
    if (!race) throw new Error(`settleRace: race ${raceId} not found`);
    if (race.state !== 'finished') {
        throw new Error(`settleRace: race ${raceId} not in finished state (was: ${race.state})`);
    }

    const results = [];
    for (const player of race.players) {
        if (player.isBot) continue;
        if (!player.telegramUserId || !player.finishPosition) continue;
        try {
            const careerUpdate = await submitRace({
                telegramUserId: player.telegramUserId,
                telegramUsername: player.displayName?.startsWith('@')
                    ? player.displayName.slice(1)
                    : null,
                firstName: null,
                points: player.pointsAwarded,
                pos: player.finishPosition,
                bestLapMs: player.bestLapMs,
                raceTimeMs: player.finishTimeMs,
            });
            results.push({
                telegramUserId: player.telegramUserId,
                displayName: player.displayName,
                careerUpdate,
            });
        } catch (err) {
            logger.error('[critter-kart] settleRace: submitRace failed for player', {
                raceId,
                telegramUserId: player.telegramUserId,
                error: err.message,
            });
            // Continue settling other players — partial success better than total fail
        }
    }

    race.state = 'settled';
    race.settledAt = new Date();
    await race.save();

    logger.info('[critter-kart] race settled', {
        raceId,
        humansSettled: results.length,
    });
    return { race, results };
}

// ── cancelRace ─────────────────────────────────────────────────────────
// Terminal: cancelled. Used when not enough players ready in time and
// matchmaker decides to drop the race rather than bot-fill.
export async function cancelRace({ raceId, reason }) {
    const race = await CritterKartRace.findOneAndUpdate(
        { raceId, state: { $nin: ['finished', 'settled', 'cancelled'] } },
        { $set: { state: 'cancelled', endedAt: new Date() } },
        { new: true },
    );
    if (!race) return null;   // already terminal, no-op
    logger.info('[critter-kart] race cancelled', { raceId, reason });
    return race;
}

// ── markDnf ────────────────────────────────────────────────────────────
// Called on disconnect mid-race AFTER the grace window expires (see
// disconnect handler in server/socket-io/critter-kart.js). Player's
// kart becomes bot-controlled in Session 2 (AI takeover); for now,
// just mark status.
export async function markDnf({ raceId, telegramUserId }) {
    const race = await CritterKartRace.findOneAndUpdate(
        { raceId, 'players.telegramUserId': telegramUserId },
        { $set: { 'players.$.status': 'dnf' } },
        { new: true },
    );
    if (!race) return null;
    logger.info('[critter-kart] player DNF', { raceId, telegramUserId });
    return race;
}

// ── findActiveRaceForPlayer ────────────────────────────────────────────
// Returns the race doc if the given Telegram user is currently in a
// race that hasn't terminated. Used by the disconnect handler to decide
// whether to apply a reconnect-grace window.
//
// "Active" = race state is one of {matched, loading, countdown, racing,
// finished} — finished is included because settlement may still be in
// flight and a reconnecting player could legitimately want their final
// result pushed. Excludes {settled, cancelled}.
//
// Also excludes players who are already DNF — once you've timed out,
// you can't restore.
const ACTIVE_RACE_STATES = ['matched', 'loading', 'countdown', 'racing', 'finished'];
export async function findActiveRaceForPlayer({ telegramUserId }) {
    if (!telegramUserId) return null;
    const race = await CritterKartRace.findOne({
        state: { $in: ACTIVE_RACE_STATES },
        players: {
            $elemMatch: {
                telegramUserId,
                status: { $ne: 'dnf' },
            },
        },
    }).lean();
    return race || null;
}

// ── Helpers ────────────────────────────────────────────────────────────
export { pointsForPosition };
