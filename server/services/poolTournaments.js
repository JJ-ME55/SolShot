/**
 * Pool Tournament Engine
 *
 * Bracket math + state transitions for single-elimination tournaments.
 * Persistence via Tournament model. Game-agnostic by design — same
 * engine drives pool today, basketball / other games later via the
 * `gameSlug` field.
 *
 * Supports 8 / 16 / 32-player brackets per designer spec §5.
 *
 * Standard seeding (best vs worst pairing in round 1):
 *   8-player:  1v8, 4v5, 3v6, 2v7      → SF: W(1v8) vs W(4v5), etc
 *   16-player: 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
 *   32-player: extends the same pattern
 *
 * Round structure (binary tree, 0-indexed within round):
 *   For bracketSize N (power of 2):
 *     round 1: N/2 matches, indices 0..(N/2-1)
 *     round 2: N/4 matches
 *     ...
 *     final:   1 match
 *
 * Advancement:
 *   round r match at matchIdxInRound i feeds round r+1 match at
 *   matchIdxInRound floor(i/2), slot 'A' if i%2==0 else 'B'.
 *
 * Prize distribution presets (designer spec §5.4):
 *   - 8-player:  60% / 25% / 7.5% / 7.5%  (semifinalists tie)
 *   - 16-player: 40 / 20 / 10 / 10 / 5 / 5 / 5 / 5
 *   - 32-player: 30 / 15 / 7.5 / 7.5 / 3.75×4 / 1.25×8
 *
 * Idempotency:
 *   - generateInitialBracket fails if tournament.matches.length > 0
 *   - recordRoundWinner fails if the match already has winnerSeedIdx set
 *   - finalizeTournament fails if already status='finished'
 */

import Tournament from '../models/Tournament.js';

// ---------------------------------------------------------------------
// Prize distribution presets
// ---------------------------------------------------------------------

const PRIZE_DISTRIBUTIONS = Object.freeze({
    8: [
        { rank: 1, share: 0.60 },
        { rank: 2, share: 0.25 },
        { rank: 3, share: 0.075 },
        { rank: 4, share: 0.075 }
    ],
    16: [
        { rank: 1, share: 0.40 },
        { rank: 2, share: 0.20 },
        { rank: 3, share: 0.10 },
        { rank: 4, share: 0.10 },
        { rank: 5, share: 0.05 },
        { rank: 6, share: 0.05 },
        { rank: 7, share: 0.05 },
        { rank: 8, share: 0.05 }
    ],
    // 32-player — extended from the 16-player pattern (each tier halves).
    // Designer-spec illustrative numbers summed to 0.85; corrected here
    // to sum to 1.0 while preserving the "winner takes most + tier halving"
    // structure.
    32: [
        { rank: 1, share: 0.30 },
        { rank: 2, share: 0.20 },
        { rank: 3, share: 0.10 },
        { rank: 4, share: 0.10 },
        { rank: 5, share: 0.05 },
        { rank: 6, share: 0.05 },
        { rank: 7, share: 0.05 },
        { rank: 8, share: 0.05 },
        { rank: 9, share: 0.0125 },
        { rank: 10, share: 0.0125 },
        { rank: 11, share: 0.0125 },
        { rank: 12, share: 0.0125 },
        { rank: 13, share: 0.0125 },
        { rank: 14, share: 0.0125 },
        { rank: 15, share: 0.0125 },
        { rank: 16, share: 0.0125 }
    ]
});

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

/**
 * Standard single-elimination round-1 pairings for a bracket of N entrants.
 * Returns an array of [seedA, seedB] tuples, length N/2.
 *
 * @param {8|16|32} bracketSize
 * @returns {Array<[number, number]>}
 */
export function getRound1Pairings(bracketSize) {
    if (![8, 16, 32].includes(bracketSize)) {
        throw new Error(`getRound1Pairings: unsupported bracketSize ${bracketSize}`);
    }
    const pairings = [];
    const half = bracketSize / 2;

    // Generate the standard seeding order. For 8: [1, 8, 4, 5, 2, 7, 3, 6] then split into pairs.
    // The pattern: at each level, interleave high and low to keep top seeds apart until late rounds.
    let order = [1, 2];
    let n = 2;
    while (n < bracketSize) {
        const next = [];
        for (const seed of order) {
            next.push(seed);
            next.push(2 * n + 1 - seed);
        }
        order = next;
        n *= 2;
    }
    // order is now bracketSize long, in pair-adjacent order.
    // Convert from 1-indexed seed numbers to 0-indexed bracket positions.
    for (let i = 0; i < bracketSize; i += 2) {
        pairings.push([order[i] - 1, order[i + 1] - 1]);
    }
    return pairings;
}

/**
 * Build the full bracket structure: matches array spanning all rounds.
 *
 * @param {8|16|32} bracketSize
 * @returns {Array<object>} matches with round, matchIdxInRound, seedA, seedB,
 *                          advancesTo (for non-final rounds)
 */
export function buildBracketSkeleton(bracketSize) {
    if (![8, 16, 32].includes(bracketSize)) {
        throw new Error(`buildBracketSkeleton: unsupported bracketSize ${bracketSize}`);
    }
    const matches = [];

    // Round 1 — populated with pairings
    const pairings = getRound1Pairings(bracketSize);
    pairings.forEach((pair, i) => {
        const nextRound = 2;
        const nextIdx = Math.floor(i / 2);
        const nextSlot = i % 2 === 0 ? 'A' : 'B';
        matches.push({
            round: 1,
            matchIdxInRound: i,
            seedA: pair[0],
            seedB: pair[1],
            matchId: null,
            winnerSeedIdx: null,
            advancesTo: { round: nextRound, matchIdxInRound: nextIdx, slot: nextSlot }
        });
    });

    // Rounds 2..totalRounds — seeds unknown until winners advance
    const totalRounds = Math.log2(bracketSize); // 8→3, 16→4, 32→5
    for (let r = 2; r <= totalRounds; r++) {
        const matchesInThisRound = bracketSize / Math.pow(2, r);
        for (let i = 0; i < matchesInThisRound; i++) {
            const isFinalRound = r === totalRounds;
            const advances = isFinalRound ? undefined : {
                round: r + 1,
                matchIdxInRound: Math.floor(i / 2),
                slot: i % 2 === 0 ? 'A' : 'B'
            };
            matches.push({
                round: r,
                matchIdxInRound: i,
                seedA: null,
                seedB: null,
                matchId: null,
                winnerSeedIdx: null,
                ...(advances ? { advancesTo: advances } : {})
            });
        }
    }

    return matches;
}

/**
 * Return the prize distribution preset for a bracket size, optionally
 * mapped onto a given currency.
 *
 * @param {8|16|32} bracketSize
 * @param {'gold'|'tickets'} currency
 * @returns {Array<{ rank: number, share: number, currency: string }>}
 */
export function getPrizeDistribution(bracketSize, currency) {
    const preset = PRIZE_DISTRIBUTIONS[bracketSize];
    if (!preset) throw new Error(`getPrizeDistribution: no preset for size ${bracketSize}`);
    return preset.map(p => ({ ...p, currency }));
}

/**
 * Verify that a distribution's shares sum to <=1 within tolerance.
 * Useful sanity check after admin custom overrides.
 *
 * @param {Array<{ share: number }>} distribution
 * @returns {{ ok: boolean, sum: number }}
 */
export function validatePrizeDistribution(distribution) {
    const sum = distribution.reduce((a, p) => a + p.share, 0);
    return { ok: Math.abs(sum - 1) < 0.0001 || sum <= 1.0001, sum };
}

/**
 * Compute total prize pool from entries + base + rake.
 *
 * @param {object} params
 * @param {number} params.entrantCount       - actual entrants (≤ bracketSize)
 * @param {number} params.entryCost
 * @param {number} params.prizePoolBase      - treasury seed
 * @param {number} params.rakeShare          - 0..1
 * @returns {{ pool: number, rake: number, base: number, fromEntries: number }}
 */
export function computePrizePool({ entrantCount, entryCost, prizePoolBase = 0, rakeShare = 0.1 }) {
    const fromEntries = entrantCount * entryCost;
    const rake = Math.floor(fromEntries * rakeShare);
    return {
        pool: prizePoolBase + (fromEntries - rake),
        rake,
        base: prizePoolBase,
        fromEntries
    };
}

/**
 * Find the round + matchIdxInRound for a bracket match's child (next round).
 * Returns null if it's the final.
 *
 * @param {object} matchEntry  - a bracketMatch with .round + .matchIdxInRound + .advancesTo
 * @returns {{ round: number, matchIdxInRound: number, slot: 'A'|'B' }|null}
 */
export function nextMatchPosition(matchEntry) {
    return matchEntry.advancesTo || null;
}

// ---------------------------------------------------------------------
// Persistence — bracket initialization
// ---------------------------------------------------------------------

/**
 * Generate the initial bracket for a tournament whose entrants have all
 * registered. Seeds entrants into bracket positions in registration order
 * (V1 — no skill-based seeding; can be replaced with ELO seeding later).
 *
 * @param {string} tournamentId
 * @returns {Promise<{ ok: boolean, tournament?: Tournament, reason?: string }>}
 */
export async function generateInitialBracket(tournamentId) {
    const t = await Tournament.findOne({ tournamentId });
    if (!t) return { ok: false, reason: 'tournament_not_found' };
    if (t.matches && t.matches.length > 0) return { ok: false, reason: 'bracket_already_generated' };
    if (t.entrants.length !== t.bracketSize) {
        return { ok: false, reason: `entrant_count_mismatch_${t.entrants.length}_vs_${t.bracketSize}` };
    }

    // Assign seedIdx in registration order (0..N-1) — V1; ELO seeding is future work
    t.entrants.forEach((entrant, i) => { entrant.seedIdx = i; });

    t.matches = buildBracketSkeleton(t.bracketSize);

    // Populate prize distribution if not custom-set
    if (!t.prizeDistribution || t.prizeDistribution.length === 0) {
        t.prizeDistribution = getPrizeDistribution(t.bracketSize, t.entry.currency);
    }

    t.status = 'live';
    await t.save();

    return { ok: true, tournament: t };
}

/**
 * Record the winner of a specific bracket match and advance them to the
 * next round's slot.
 *
 * @param {string} tournamentId
 * @param {object} params
 * @param {number} params.round
 * @param {number} params.matchIdxInRound
 * @param {number} params.winnerSeedIdx
 * @returns {Promise<{ ok: boolean, tournament?: Tournament, reason?: string, finalsComplete?: boolean }>}
 */
export async function recordRoundWinner(tournamentId, { round, matchIdxInRound, winnerSeedIdx }) {
    const t = await Tournament.findOne({ tournamentId });
    if (!t) return { ok: false, reason: 'tournament_not_found' };
    if (t.status !== 'live') return { ok: false, reason: `status_${t.status}_not_live` };

    const match = t.matches.find(m => m.round === round && m.matchIdxInRound === matchIdxInRound);
    if (!match) return { ok: false, reason: 'bracket_match_not_found' };
    if (match.winnerSeedIdx !== null) return { ok: false, reason: 'match_already_decided' };

    if (winnerSeedIdx !== match.seedA && winnerSeedIdx !== match.seedB) {
        return { ok: false, reason: 'winner_not_a_participant_in_match' };
    }

    match.winnerSeedIdx = winnerSeedIdx;
    match.completedAt = new Date();

    // Mark loser as eliminated
    const loserSeedIdx = winnerSeedIdx === match.seedA ? match.seedB : match.seedA;
    const loserEntrant = t.entrants.find(e => e.seedIdx === loserSeedIdx);
    if (loserEntrant && !loserEntrant.eliminated) {
        loserEntrant.eliminated = true;
        loserEntrant.eliminatedAtRound = round;
    }

    // Advance winner to next round's slot
    let finalsComplete = false;
    if (match.advancesTo) {
        const child = t.matches.find(m =>
            m.round === match.advancesTo.round && m.matchIdxInRound === match.advancesTo.matchIdxInRound
        );
        if (child) {
            if (match.advancesTo.slot === 'A') child.seedA = winnerSeedIdx;
            else child.seedB = winnerSeedIdx;
        }
    } else {
        // No advancesTo = this is the finals. Tournament champion determined.
        t.championSeedIdx = winnerSeedIdx;
        finalsComplete = true;
    }

    await t.save();
    return { ok: true, tournament: t, finalsComplete };
}

/**
 * Determine final placements for all entrants based on completed bracket.
 *
 * Placement rules:
 *   - 1st: champion (won finals)
 *   - 2nd: runner-up (lost finals)
 *   - 3rd-4th: semifinalists (lost in semifinals) — tie at 3rd, both receive 3rd prize
 *   - 5th-8th: quarterfinalists (lost in QF) — tie at 5th
 *   - 9th-16th: round-of-16 losers — tie at 9th
 *   - etc
 *
 * @param {Tournament} tournament
 * @returns {Map<number, number>} seedIdx → finalPlacement
 */
export function computeFinalPlacements(tournament) {
    const placements = new Map();
    const totalRounds = Math.log2(tournament.bracketSize);

    // Champion is whoever won the finals match
    if (tournament.championSeedIdx !== null && tournament.championSeedIdx !== undefined) {
        placements.set(tournament.championSeedIdx, 1);
    }

    // Walk losses by round; lowest round eliminated = worst placement.
    // Placement for losing in round r = (bracketSize / 2^(totalRounds - r + 1)) + 1
    // Examples for 8-player (3 rounds):
    //   lost in R1: bracketSize / 2^3 + 1 = 1 + 1 = ... wait this isn't right
    // Actually: place = bracketSize / 2^(round) + 1? No.
    // For 8-player: R1 loser = 5th; R2 (SF) loser = 3rd; R3 (F) loser = 2nd
    //   r=1: lost 1st round, 4 losers tie at 5th place
    //   r=2: lost 2nd round (SF), 2 losers tie at 3rd place
    //   r=3: lost finals = 2nd
    // place(r) = (bracketSize / 2^r) + 1 = 4+1=5, 2+1=3, 1+1=2 ✓
    for (const entrant of tournament.entrants) {
        if (entrant.seedIdx === tournament.championSeedIdx) continue;
        if (!entrant.eliminated) continue;
        const r = entrant.eliminatedAtRound;
        if (r) {
            const place = (tournament.bracketSize / Math.pow(2, r)) + 1;
            placements.set(entrant.seedIdx, place);
        }
    }

    return placements;
}

/**
 * Finalize tournament: set status='finished', populate finalPlacement on
 * each entrant, compute and assign prize amounts.
 *
 * Does NOT credit Ticket/Gold ledgers — that's a separate emission step
 * the caller invokes (similar to poolRewards pattern for matches).
 *
 * @param {string} tournamentId
 * @returns {Promise<{ ok: boolean, tournament?: Tournament, prizeAssignments?: Array, reason?: string }>}
 */
export async function finalizeTournament(tournamentId) {
    const t = await Tournament.findOne({ tournamentId });
    if (!t) return { ok: false, reason: 'tournament_not_found' };
    if (t.status === 'finished') return { ok: false, reason: 'already_finished', tournament: t };
    if (t.championSeedIdx === null || t.championSeedIdx === undefined) {
        return { ok: false, reason: 'finals_not_decided' };
    }

    const placements = computeFinalPlacements(t);
    const pool = computePrizePool({
        entrantCount: t.entrants.length,
        entryCost: t.entry.cost,
        prizePoolBase: t.prizePoolBase,
        rakeShare: t.rakeShare
    });

    const prizeAssignments = [];
    for (const entrant of t.entrants) {
        const placement = placements.get(entrant.seedIdx);
        if (placement) {
            entrant.finalPlacement = placement;
            const prizeRow = t.prizeDistribution.find(p => p.rank === placement);
            if (prizeRow) {
                const prizeAmount = Math.floor(pool.pool * prizeRow.share);
                entrant.prizeWonAmount = prizeAmount;
                entrant.prizeWonCurrency = prizeRow.currency;
                prizeAssignments.push({
                    seedIdx: entrant.seedIdx,
                    placement,
                    amount: prizeAmount,
                    currency: prizeRow.currency,
                    telegramUserId: entrant.telegramUserId,
                    walletAddress: entrant.walletAddress
                });
            }
        }
    }

    t.status = 'finished';
    t.finishedAt = new Date();
    await t.save();

    return { ok: true, tournament: t, prizeAssignments };
}

// ---------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------

export const POOL_TOURNAMENT_CONSTANTS = Object.freeze({
    PRIZE_DISTRIBUTIONS
});

export default {
    getRound1Pairings,
    buildBracketSkeleton,
    getPrizeDistribution,
    validatePrizeDistribution,
    computePrizePool,
    nextMatchPosition,
    generateInitialBracket,
    recordRoundWinner,
    computeFinalPlacements,
    finalizeTournament,
    POOL_TOURNAMENT_CONSTANTS
};
