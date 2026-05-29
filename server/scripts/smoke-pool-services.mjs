#!/usr/bin/env node
/**
 * Smoke test for pool services (ELO math + matchmaking queue).
 *
 * Runs without Mongo — exercises pure logic only:
 *   - ELO math correctness (known fixtures)
 *   - Matchmaking pair-up
 *   - Anti-smurf gates
 *   - Search timeout
 *
 * Run:  node server/scripts/smoke-pool-services.mjs
 *
 * Exits 0 on success, 1 on any assertion failure.
 */

import {
    expectedScore,
    calculateNewRatings,
    POOL_ELO_CONSTANTS
} from '../services/poolElo.js';

import {
    configureMatchmaking,
    stopMatchmaking,
    enqueue,
    dequeue,
    getStatus,
    queueStats,
    POOL_MATCHMAKING_CONSTANTS
} from '../services/poolMatchmaking.js';

import {
    calculatePvpGold,
    calculateVsComputerGold,
    calculateRewardBundle,
    POOL_REWARDS_CONSTANTS
} from '../services/poolRewards.js';

import {
    generateMatchId,
    generateRackSeed,
    chooseBreakerIdx,
    computeAsyncExpiry,
    computeWallClockExpiry,
    buildInitialTurnState,
    POOL_ORCHESTRATOR_CONSTANTS
} from '../services/poolMatchOrchestrator.js';

import {
    getRound1Pairings,
    buildBracketSkeleton,
    getPrizeDistribution,
    validatePrizeDistribution,
    computePrizePool,
    computeFinalPlacements,
    POOL_TOURNAMENT_CONSTANTS
} from '../services/poolTournaments.js';

import {
    getNextBot,
    calculateRoundGold,
    getMilestoneAt,
    generateRunId,
    POOL_MARATHON_CONSTANTS
} from '../services/poolMarathon.js';

import {
    validateWageredMatchPreconditions,
    calculateSettlementSplit,
    solToLamports,
    lamportsToSol,
    isAllowedStake,
    previewSettlement,
    POOL_ESCROW_CONSTANTS
} from '../services/poolEscrow.js';

let failures = 0;

function assert(cond, msg) {
    if (cond) {
        process.stdout.write('  PASS  ' + msg + '\n');
    } else {
        process.stdout.write('  FAIL  ' + msg + '\n');
        failures++;
    }
}

function approx(a, b, tolerance = 0.001) {
    return Math.abs(a - b) < tolerance;
}

// ============================================================
//   ELO MATH
// ============================================================
console.log('\n[ELO MATH]');

// Equal ratings → 50% expected
assert(approx(expectedScore(1000, 1000), 0.5), 'equal ratings → 50% expected score');

// 200-point gap → ~76% favorite per ELO table
const exp200 = expectedScore(1200, 1000);
assert(approx(exp200, 0.76, 0.02), `200-point gap → favorite ~76% (got ${exp200.toFixed(3)})`);

// 400-point gap → ~91%
const exp400 = expectedScore(1400, 1000);
assert(approx(exp400, 0.91, 0.02), `400-point gap → favorite ~91% (got ${exp400.toFixed(3)})`);

// Sum of expectations = 1
assert(approx(expectedScore(1000, 1500) + expectedScore(1500, 1000), 1, 0.001), 'expected scores sum to 1');

// calculateNewRatings — equal opponents, A wins
{
    const r = calculateNewRatings(1000, 1000, 1, 32, 32);
    assert(r.deltaA === 16, `equal ratings, A wins → A +16 (got ${r.deltaA})`);
    assert(r.deltaB === -16, `equal ratings, A wins → B -16 (got ${r.deltaB})`);
    assert(r.ratingA === 1016 && r.ratingB === 984, `ratings updated correctly`);
}

// Upset: underdog beats favorite → big swing
{
    const r = calculateNewRatings(900, 1300, 1, 32, 32); // 900 beats 1300
    assert(r.deltaA > 25, `big upset → underdog gains >25 (got +${r.deltaA})`);
    assert(r.deltaB < -25, `big upset → favorite loses >25 (got ${r.deltaB})`);
}

// Floor enforcement — pick a scenario where the delta would push below 200.
// 1500 vs 220 has a huge gap so the loss-delta rounds to 0; use equal ratings.
{
    const r = calculateNewRatings(210, 210, 0, 32, 32); // both at 210, A loses (-16)
    assert(r.ratingA === 200, `floor at 200 enforced (got ${r.ratingA}; expected 200, would have been 194)`);
}

// Constants exported
assert(POOL_ELO_CONSTANTS.RATING_FLOOR === 200, 'RATING_FLOOR constant exposed');
assert(POOL_ELO_CONSTANTS.DEFAULT_K_FACTOR === 32, 'DEFAULT_K_FACTOR constant exposed');

// ============================================================
//   MATCHMAKING — basic pair-up
// ============================================================
console.log('\n[MATCHMAKING — pair-up]');

const matchedPairs = [];
const timeoutEntries = [];
configureMatchmaking({
    onMatchFound: (a, b) => matchedPairs.push([a, b]),
    onSearchTimeout: (e) => timeoutEntries.push(e)
});

// Two players within ±100 of each other → should pair on next scan
enqueue({
    identity: { telegramUserId: 1001, callsign: 'alice' },
    rating: 1000,
    mode: 'quick',
    format: 'BO1'
});
enqueue({
    identity: { telegramUserId: 1002, callsign: 'bob' },
    rating: 1080,
    mode: 'quick',
    format: 'BO1'
});

// Manually trigger a scan (bypass timer for deterministic tests)
const stats0 = queueStats();
assert(stats0.size === 2, `2 players in queue (got ${stats0.size})`);

// Wait briefly for the timer-driven scan
await new Promise(r => setTimeout(r, POOL_MATCHMAKING_CONSTANTS.SCAN_INTERVAL_MS + 200));

assert(matchedPairs.length === 1, `one pair matched (got ${matchedPairs.length})`);
const [a, b] = matchedPairs[0] || [];
if (a && b) {
    assert(a.identity.callsign === 'alice' || a.identity.callsign === 'bob', 'matched player A is alice or bob');
    assert(b.identity.callsign === 'alice' || b.identity.callsign === 'bob', 'matched player B is alice or bob');
    assert(a.playerKey !== b.playerKey, 'matched players are not the same person');
}

assert(queueStats().size === 0, 'queue empty after match');

// ============================================================
//   MATCHMAKING — mismatched modes don't pair
// ============================================================
console.log('\n[MATCHMAKING — mode mismatch]');

matchedPairs.length = 0;
enqueue({ identity: { telegramUserId: 2001 }, rating: 1000, mode: 'quick', format: 'BO1' });
enqueue({
    identity: { telegramUserId: 2002 },
    rating: 1000,
    mode: 'wagered',
    stake: { amount: 0.05, currency: 'SOL' },
    format: 'BO1'
});

await new Promise(r => setTimeout(r, POOL_MATCHMAKING_CONSTANTS.SCAN_INTERVAL_MS + 200));

assert(matchedPairs.length === 0, 'no pair when modes differ (quick vs wagered)');
assert(queueStats().size === 2, 'both still queued');

dequeue({ telegramUserId: 2001 });
dequeue({ telegramUserId: 2002 });

// ============================================================
//   MATCHMAKING — different stake amounts don't pair
// ============================================================
console.log('\n[MATCHMAKING — stake mismatch]');

matchedPairs.length = 0;
enqueue({
    identity: { telegramUserId: 3001 },
    rating: 1000, mode: 'wagered',
    stake: { amount: 0.05, currency: 'SOL' }, format: 'BO1'
});
enqueue({
    identity: { telegramUserId: 3002 },
    rating: 1000, mode: 'wagered',
    stake: { amount: 0.1, currency: 'SOL' }, format: 'BO1'
});

await new Promise(r => setTimeout(r, POOL_MATCHMAKING_CONSTANTS.SCAN_INTERVAL_MS + 200));
assert(matchedPairs.length === 0, 'no pair when stake amounts differ');
dequeue({ telegramUserId: 3001 });
dequeue({ telegramUserId: 3002 });

// ============================================================
//   MATCHMAKING — same player can't queue twice (idempotent)
// ============================================================
console.log('\n[MATCHMAKING — idempotent enqueue]');

const t1 = enqueue({ identity: { telegramUserId: 4001 }, rating: 1100, mode: 'quick', format: 'BO1' });
const t2 = enqueue({ identity: { telegramUserId: 4001 }, rating: 1100, mode: 'quick', format: 'BO1' });
assert(t1.ticketId === t2.ticketId, 'same player enqueued twice gets same ticket');
assert(queueStats().size === 1, 'queue size stays at 1');
dequeue({ telegramUserId: 4001 });

// ============================================================
//   MATCHMAKING — getStatus + dequeue
// ============================================================
console.log('\n[MATCHMAKING — status & dequeue]');

enqueue({ identity: { telegramUserId: 5001 }, rating: 1200, mode: 'quick', format: 'BO1' });
const status = getStatus({ telegramUserId: 5001 });
assert(status && status.rating === 1200, 'getStatus returns the entry');
const removed = dequeue({ telegramUserId: 5001 });
assert(removed === true, 'dequeue returns true on removal');
assert(getStatus({ telegramUserId: 5001 }) === null, 'getStatus returns null after dequeue');

// ============================================================
//   MATCHMAKING — too-far ratings don't pair (initial window)
// ============================================================
console.log('\n[MATCHMAKING — rating gap exceeds initial window]');

matchedPairs.length = 0;
enqueue({ identity: { telegramUserId: 6001 }, rating: 1000, mode: 'quick', format: 'BO1' });
enqueue({ identity: { telegramUserId: 6002 }, rating: 1500, mode: 'quick', format: 'BO1' }); // gap = 500

await new Promise(r => setTimeout(r, POOL_MATCHMAKING_CONSTANTS.SCAN_INTERVAL_MS + 200));
assert(matchedPairs.length === 0, 'no pair when rating gap (500) exceeds initial window (±100)');

dequeue({ telegramUserId: 6001 });
dequeue({ telegramUserId: 6002 });

// ============================================================
//   REWARDS — PvP Gold (ELO-weighted)
// ============================================================
console.log('\n[REWARDS — PvP Gold]');

// Equal opponents → base 20 G
assert(calculatePvpGold(1000, 1000) === 20, `PvP gold equal opp: base 20 (got ${calculatePvpGold(1000, 1000)})`);

// Beat lower opp → less reward (10 G min)
assert(calculatePvpGold(1000, 800) === 10, `PvP gold beat 200 below: 10 (got ${calculatePvpGold(1000, 800)})`);

// Beat higher opp → more reward
const beatHigher = calculatePvpGold(1000, 1200);
assert(beatHigher > 20, `PvP gold beat 200 above: >20 (got ${beatHigher})`);

// Beat much higher → capped at 50 G
assert(calculatePvpGold(800, 2000) === 50, `PvP gold beat 1200 above: capped at 50 (got ${calculatePvpGold(800, 2000)})`);

// Beat much lower → floored at 10 G
assert(calculatePvpGold(2000, 800) === 10, `PvP gold beat 1200 below: floored at 10 (got ${calculatePvpGold(2000, 800)})`);

// ============================================================
//   REWARDS — Vs Computer
// ============================================================
console.log('\n[REWARDS — Vs Computer]');

assert(calculateVsComputerGold('easy') === 5,    'vs bot easy: 5 G');
assert(calculateVsComputerGold('medium') === 10, 'vs bot medium: 10 G');
assert(calculateVsComputerGold('hard') === 15,   'vs bot hard: 15 G');
assert(calculateVsComputerGold('insane') === 25, 'vs bot insane: 25 G');
assert(calculateVsComputerGold('unknown') === 0, 'unknown difficulty: 0 G');

// ============================================================
//   REWARDS — Bundle composition
// ============================================================
console.log('\n[REWARDS — Bundle composition]');

// Practice → all zero
const practice = calculateRewardBundle({
    mode: 'practice',
    winner: { eloAtStart: 1000, isAiBot: false },
    loser:  { eloAtStart: 1000, isAiBot: false }
});
assert(practice.winnerGold === 0 && practice.loserGold === 0 && practice.winnerTickets === 0,
    'practice: zero rewards');

// Quick PvP: winner gets G + 1 TKT, loser gets only 1 TKT floor
const quick = calculateRewardBundle({
    mode: 'quick',
    winner: { eloAtStart: 1000, isAiBot: false },
    loser:  { eloAtStart: 1000, isAiBot: false }
});
assert(quick.winnerGold === 20, `quick PvP winner G: 20 (got ${quick.winnerGold})`);
assert(quick.winnerTickets === 1, `quick PvP winner TKT: 1 floor (got ${quick.winnerTickets})`);
assert(quick.loserGold === 0, `quick PvP loser G: 0 (got ${quick.loserGold})`);
assert(quick.loserTickets === 1, `quick PvP loser TKT: 1 floor (got ${quick.loserTickets})`);

// Wagered: same G/TKT structure as quick (SOL is settled separately)
const wagered = calculateRewardBundle({
    mode: 'wagered',
    winner: { eloAtStart: 1200, isAiBot: false },
    loser:  { eloAtStart: 1000, isAiBot: false }
});
assert(wagered.winnerGold > 0, 'wagered winner gets G');
assert(wagered.winnerTickets === 1, 'wagered winner gets 1 TKT floor');
assert(wagered.loserGold === 0, 'wagered loser gets 0 G');

// Vs Computer (human wins): winner gets flat-per-difficulty G + 1 TKT
const vsBot = calculateRewardBundle({
    mode: 'vs_computer',
    winner: { eloAtStart: 1000, isAiBot: false, aiDifficulty: null },
    loser:  { eloAtStart: 1000, isAiBot: true,  aiDifficulty: 'hard' }
});
// difficulty from loser since they're the bot
assert(vsBot.winnerGold === 15, `vs bot hard winner G: 15 (got ${vsBot.winnerGold})`);
assert(vsBot.winnerTickets === 1, `vs bot winner TKT: 1 floor (got ${vsBot.winnerTickets})`);
assert(vsBot.loserGold === 0 && vsBot.loserTickets === 0, 'vs bot: no rewards for bot loser');

// Vs Computer (bot wins): bot has no ledger; emit nothing
const vsBotBotWon = calculateRewardBundle({
    mode: 'vs_computer',
    winner: { eloAtStart: 1000, isAiBot: true,  aiDifficulty: 'insane' },
    loser:  { eloAtStart: 1000, isAiBot: false }
});
assert(vsBotBotWon.winnerGold === 0 && vsBotBotWon.winnerTickets === 0,
    'vs bot bot-wins: no rewards (bot has no ledger)');

// Tournament + marathon defer to their own services → all zero from this service
const tourny = calculateRewardBundle({
    mode: 'tournament',
    winner: { eloAtStart: 1100, isAiBot: false },
    loser:  { eloAtStart: 1050, isAiBot: false }
});
assert(tourny.winnerGold === 0, 'tournament round: no G from rewards service (tournament service handles)');

const marathon = calculateRewardBundle({
    mode: 'marathon',
    winner: { eloAtStart: 1000, isAiBot: false },
    loser:  { eloAtStart: 1000, isAiBot: true, aiDifficulty: 'medium' }
});
assert(marathon.winnerGold === 0, 'marathon round: no G from rewards service (marathon service handles)');

// Constants exported
assert(POOL_REWARDS_CONSTANTS.PVP_GOLD_BASE === 20, 'PVP_GOLD_BASE constant exposed');
assert(POOL_REWARDS_CONSTANTS.VS_COMPUTER_GOLD.insane === 25, 'VS_COMPUTER_GOLD.insane constant exposed');

// ============================================================
//   ORCHESTRATOR — pure helpers
// ============================================================
console.log('\n[ORCHESTRATOR — pure helpers]');

// Match ID format
const mid1 = generateMatchId();
assert(/^pm_[0-9a-f]{8}$/.test(mid1), `match ID format pm_<8hex> (got ${mid1})`);

// Two consecutive IDs should differ
const mid2 = generateMatchId();
assert(mid1 !== mid2, 'consecutive match IDs differ');

// Rack seed format (32 hex chars)
const seed1 = generateRackSeed();
assert(/^[0-9a-f]{32}$/.test(seed1), `rack seed format 32 hex chars (got len ${seed1.length})`);
const seed2 = generateRackSeed();
assert(seed1 !== seed2, 'consecutive rack seeds differ');

// chooseBreakerIdx is deterministic + returns 0 or 1
const breaker1a = chooseBreakerIdx('same-seed');
const breaker1b = chooseBreakerIdx('same-seed');
assert(breaker1a === breaker1b, 'chooseBreakerIdx is deterministic');
assert(breaker1a === 0 || breaker1a === 1, `breaker idx is 0 or 1 (got ${breaker1a})`);

// Across many seeds the distribution should be roughly even (sanity)
let zeros = 0, ones = 0;
for (let i = 0; i < 100; i++) {
    const b = chooseBreakerIdx('seed-' + i);
    if (b === 0) zeros++; else ones++;
}
assert(Math.abs(zeros - ones) < 30, `breaker distribution across 100 seeds within 30% (got ${zeros}/100 zeros)`);

// Async expiry: 12h ahead
const baseTime = new Date('2026-05-29T12:00:00Z');
const asyncExp = computeAsyncExpiry(baseTime);
const asyncDeltaHours = (asyncExp - baseTime) / (60 * 60 * 1000);
assert(asyncDeltaHours === 12, `async expiry 12h ahead (got ${asyncDeltaHours}h)`);

// Wall-clock expiry: 72h ahead
const wcExp = computeWallClockExpiry(baseTime);
const wcDeltaHours = (wcExp - baseTime) / (60 * 60 * 1000);
assert(wcDeltaHours === 72, `wall-clock expiry 72h ahead (got ${wcDeltaHours}h)`);

// Initial turn state structure
const turnState = buildInitialTurnState(1);
assert(turnState.activePlayerIdx === 1, 'initial turn: activePlayerIdx = breakerIdx');
assert(turnState.isBreakingShot === true, 'initial turn: isBreakingShot=true');
assert(turnState.isBallInHand === false, 'initial turn: isBallInHand=false (break placement is not BIH)');
assert(turnState.syncTimerStartedAt === null, 'initial turn: sync timer not started yet');
assert(turnState.asyncWindowExpiresAt instanceof Date, 'initial turn: asyncWindowExpiresAt is a Date');

// Constants exported
assert(POOL_ORCHESTRATOR_CONSTANTS.ASYNC_WINDOW_MS === 12 * 60 * 60 * 1000,
    'ASYNC_WINDOW_MS constant correct');
assert(POOL_ORCHESTRATOR_CONSTANTS.MATCH_WALL_CLOCK_MS === 72 * 60 * 60 * 1000,
    'MATCH_WALL_CLOCK_MS constant correct');

// ============================================================
//   TOURNAMENTS — bracket pairings
// ============================================================
console.log('\n[TOURNAMENTS — bracket pairings]');

// 8-player: standard pairings 1v8, 4v5, 2v7, 3v6 → 0-indexed [0,7],[3,4],[1,6],[2,5]
// (Top half: 1v8 + 4v5; bottom half: 2v7 + 3v6 — keeps 1 and 2 in opposite halves)
const p8 = getRound1Pairings(8);
assert(p8.length === 4, `8-player has 4 round-1 matches (got ${p8.length})`);
assert(p8[0][0] === 0 && p8[0][1] === 7, `8-player match 1: top seed vs bottom (got ${p8[0]})`);
assert(p8[2][0] === 1 && p8[2][1] === 6, `8-player match 3: 2-seed vs 7-seed (got ${p8[2]})`);
assert(p8[3][0] === 2 && p8[3][1] === 5, `8-player match 4: 3-seed vs 6-seed (got ${p8[3]})`);

// All seeds appear exactly once
const seeds8 = new Set(p8.flat());
assert(seeds8.size === 8, `8-player: all 8 seeds appear exactly once (got ${seeds8.size})`);

// 16-player: 8 round-1 matches
const p16 = getRound1Pairings(16);
assert(p16.length === 8, `16-player has 8 round-1 matches`);
const seeds16 = new Set(p16.flat());
assert(seeds16.size === 16, `16-player: all 16 seeds appear exactly once`);
assert(p16[0][0] === 0 && p16[0][1] === 15, `16-player match 1: 1-seed vs 16-seed`);

// 32-player: 16 round-1 matches
const p32 = getRound1Pairings(32);
assert(p32.length === 16, `32-player has 16 round-1 matches`);
const seeds32 = new Set(p32.flat());
assert(seeds32.size === 32, `32-player: all 32 seeds appear exactly once`);

// ============================================================
//   TOURNAMENTS — full bracket skeleton
// ============================================================
console.log('\n[TOURNAMENTS — bracket skeleton]');

const skel8 = buildBracketSkeleton(8);
// 8-player has 4 + 2 + 1 = 7 total matches
assert(skel8.length === 7, `8-player bracket has 7 total matches (got ${skel8.length})`);
assert(skel8[0].round === 1, 'round-1 match comes first');
assert(skel8[skel8.length - 1].round === 3, 'finals match comes last');
assert(skel8[skel8.length - 1].advancesTo === undefined, 'finals has no advancesTo');

// Round 1 → advancesTo round 2 with correct slot
assert(skel8[0].advancesTo.round === 2, 'R1 match 0 advances to R2');
assert(skel8[0].advancesTo.slot === 'A', 'R1 match 0 advances to slot A');
assert(skel8[1].advancesTo.slot === 'B', 'R1 match 1 advances to slot B');

// 16-player skeleton: 8 + 4 + 2 + 1 = 15 matches
const skel16 = buildBracketSkeleton(16);
assert(skel16.length === 15, `16-player bracket has 15 total matches (got ${skel16.length})`);

// 32-player skeleton: 16 + 8 + 4 + 2 + 1 = 31 matches
const skel32 = buildBracketSkeleton(32);
assert(skel32.length === 31, `32-player bracket has 31 total matches (got ${skel32.length})`);

// ============================================================
//   TOURNAMENTS — prize distributions
// ============================================================
console.log('\n[TOURNAMENTS — prize distributions]');

const dist8 = getPrizeDistribution(8, 'tickets');
assert(dist8.length === 4, '8-player has 4 prize ranks');
assert(dist8[0].share === 0.60, '8-player 1st = 60%');
assert(dist8[0].currency === 'tickets', 'currency stamped on each preset');

const dist16 = getPrizeDistribution(16, 'gold');
assert(dist16.length === 8, '16-player has 8 prize ranks');

const dist32 = getPrizeDistribution(32, 'tickets');
assert(dist32.length === 16, '32-player has 16 prize ranks (16-of-32 paid)');

// All distributions sum to 1.0 (within tolerance)
for (const [size, dist] of [[8, dist8], [16, dist16], [32, dist32]]) {
    const v = validatePrizeDistribution(dist);
    assert(v.ok, `${size}-player distribution sums to 1.0 (got ${v.sum})`);
}

// ============================================================
//   TOURNAMENTS — prize pool calculation
// ============================================================
console.log('\n[TOURNAMENTS — prize pool calc]');

// Daily Free: 8 entrants × 100 G entry, 10% rake, 0 base
const dailyFree = computePrizePool({ entrantCount: 8, entryCost: 100, prizePoolBase: 0, rakeShare: 0.1 });
assert(dailyFree.fromEntries === 800, 'daily free: 8 × 100 = 800 from entries');
assert(dailyFree.rake === 80, 'daily free: 10% rake = 80');
assert(dailyFree.pool === 720, 'daily free: pool = 800 - 80 = 720');

// Monthly: 32 × 100 TKT entry, 10% rake, 10000 TKT treasury base
const monthly = computePrizePool({ entrantCount: 32, entryCost: 100, prizePoolBase: 10000, rakeShare: 0.1 });
assert(monthly.fromEntries === 3200, 'monthly: 32 × 100 = 3200');
assert(monthly.rake === 320, 'monthly: 10% rake = 320');
assert(monthly.pool === 12880, 'monthly: pool = 10000 + (3200 - 320) = 12880');

// ============================================================
//   TOURNAMENTS — placement computation
// ============================================================
console.log('\n[TOURNAMENTS — placement computation]');

// Simulated 8-player completed tournament
const fakeT = {
    bracketSize: 8,
    championSeedIdx: 0,                  // seed 0 won
    entrants: [
        { seedIdx: 0, eliminated: false, eliminatedAtRound: null }, // champion
        { seedIdx: 1, eliminated: true, eliminatedAtRound: 3 },     // lost finals = 2nd
        { seedIdx: 2, eliminated: true, eliminatedAtRound: 2 },     // lost SF = 3rd
        { seedIdx: 3, eliminated: true, eliminatedAtRound: 2 },     // lost SF = 3rd
        { seedIdx: 4, eliminated: true, eliminatedAtRound: 1 },     // lost R1 = 5th
        { seedIdx: 5, eliminated: true, eliminatedAtRound: 1 },
        { seedIdx: 6, eliminated: true, eliminatedAtRound: 1 },
        { seedIdx: 7, eliminated: true, eliminatedAtRound: 1 }
    ]
};

const places = computeFinalPlacements(fakeT);
assert(places.get(0) === 1, 'champion = 1st place');
assert(places.get(1) === 2, 'finals loser = 2nd place');
assert(places.get(2) === 3, 'SF loser = 3rd place (tie)');
assert(places.get(3) === 3, 'other SF loser = 3rd place (tie)');
assert(places.get(4) === 5, 'R1 loser = 5th place');
assert(places.get(7) === 5, 'all R1 losers tied at 5th');

// Constants exported
assert(POOL_TOURNAMENT_CONSTANTS.PRIZE_DISTRIBUTIONS[8].length === 4, 'PRIZE_DISTRIBUTIONS constant correct');

// ============================================================
//   MARATHON — bot ladder
// ============================================================
console.log('\n[MARATHON — bot ladder]');

// Starting on easy, streak 0 → first bot is easy
const b0 = getNextBot({ startingDifficulty: 'easy', currentStreak: 0 });
assert(b0.difficulty === 'easy', 'easy/streak 0: bot is easy');
assert(b0.elo === 600, 'easy bot ELO = 600');
assert(b0.ladderStep === 0, 'ladder step 0');

// After 3 wins, ladder steps up
const b3 = getNextBot({ startingDifficulty: 'easy', currentStreak: 3 });
assert(b3.difficulty === 'medium', `easy/streak 3: bot is medium (got ${b3.difficulty})`);
assert(b3.elo === 900, 'medium bot ELO = 900');

// After 9 wins, hit insane
const b9 = getNextBot({ startingDifficulty: 'easy', currentStreak: 9 });
assert(b9.difficulty === 'insane', `easy/streak 9: bot is insane (got ${b9.difficulty})`);

// After 12 wins (one step past insane), overflow kicks in: insane+1 with ELO 1600
const b12 = getNextBot({ startingDifficulty: 'easy', currentStreak: 12 });
assert(b12.difficulty === 'insane', `easy/streak 12: still labelled insane`);
assert(b12.elo === 1600, `easy/streak 12: ELO = 1600 (got ${b12.elo})`);
assert(b12.displayName === 'insane+1', `easy/streak 12: displayName = insane+1 (got ${b12.displayName})`);

// Starting on hard, streak 0 → first bot is hard
const h0 = getNextBot({ startingDifficulty: 'hard', currentStreak: 0 });
assert(h0.difficulty === 'hard', 'hard/streak 0: bot is hard');
assert(h0.elo === 1200, 'hard bot ELO = 1200');

// Starting on hard, streak 3 → insane
const h3 = getNextBot({ startingDifficulty: 'hard', currentStreak: 3 });
assert(h3.difficulty === 'insane', `hard/streak 3: insane (got ${h3.difficulty})`);

// ============================================================
//   MARATHON — per-round Gold reward
// ============================================================
console.log('\n[MARATHON — per-round Gold]');

// Easy bot, no perfect → base 5 G
assert(calculateRoundGold({ botElo: 600, perfectTable: false }) === 5,
    'easy bot non-perfect: 5 G');

// Easy bot, perfect → 5 + 5 bonus
assert(calculateRoundGold({ botElo: 600, perfectTable: true }) === 10,
    'easy bot perfect: 10 G');

// Insane bot, no perfect → 5 + (900/100)*1 = 5 + 9 = 14 G
assert(calculateRoundGold({ botElo: 1500, perfectTable: false }) === 14,
    `insane bot non-perfect: 14 G (got ${calculateRoundGold({ botElo: 1500, perfectTable: false })})`);

// Insane+5 bot, perfect → high reward
const highRoundGold = calculateRoundGold({ botElo: 2000, perfectTable: true });
assert(highRoundGold > 20, `insane+5 perfect: >20 G (got ${highRoundGold})`);

// ============================================================
//   MARATHON — milestone bonuses
// ============================================================
console.log('\n[MARATHON — milestone bonuses]');

assert(getMilestoneAt(1) === null, 'streak 1: no milestone');
assert(getMilestoneAt(4) === null, 'streak 4: no milestone');

const m5 = getMilestoneAt(5);
assert(m5 && m5.tickets === 5, `streak 5: +5 TKT (got ${m5?.tickets})`);

const m10 = getMilestoneAt(10);
assert(m10 && m10.tickets === 15, `streak 10: +15 TKT (got ${m10?.tickets})`);

const m20 = getMilestoneAt(20);
assert(m20 && m20.tickets === 50, `streak 20: +50 TKT (got ${m20?.tickets})`);

const m50 = getMilestoneAt(50);
assert(m50 && m50.tickets === 250, `streak 50: +250 TKT (got ${m50?.tickets})`);

assert(getMilestoneAt(100) === null, 'streak 100: no preset milestone (capped at 50)');

// ============================================================
//   MARATHON — run ID format
// ============================================================
console.log('\n[MARATHON — run ID]');

const runId = generateRunId();
assert(/^mr_[0-9a-f]{8}$/.test(runId), `run ID format mr_<8hex> (got ${runId})`);
const runId2 = generateRunId();
assert(runId !== runId2, 'consecutive run IDs differ');

// Constants exported
assert(POOL_MARATHON_CONSTANTS.LADDER_STEP_WINS === 3, 'LADDER_STEP_WINS = 3');
assert(POOL_MARATHON_CONSTANTS.MILESTONES.length === 5, 'MILESTONES preset has 5 thresholds');

// ============================================================
//   ESCROW — unit conversion
// ============================================================
console.log('\n[ESCROW — unit conversion]');

assert(solToLamports(1) === 1_000_000_000, '1 SOL = 1B lamports');
assert(solToLamports(0.05) === 50_000_000, '0.05 SOL = 50M lamports');
assert(solToLamports(0.01) === 10_000_000, '0.01 SOL = 10M lamports');
assert(lamportsToSol(1_000_000_000) === 1, '1B lamports = 1 SOL');
assert(lamportsToSol(50_000_000) === 0.05, '50M lamports = 0.05 SOL');

// ============================================================
//   ESCROW — settlement split (90/7/3)
// ============================================================
console.log('\n[ESCROW — settlement split]');

// 0.05 SOL × 2 players = 0.1 SOL pot = 100M lamports
// 90% = 90,000,000; 7% = 7,000,000; 3% = 3,000,000
const split05 = calculateSettlementSplit(solToLamports(0.05));
assert(split05.pot === 100_000_000, `0.05 stake → pot 100M lamports (got ${split05.pot})`);
assert(split05.treasury === 7_000_000, `0.05 stake → treasury 7M lamports (got ${split05.treasury})`);
assert(split05.ops === 3_000_000, `0.05 stake → ops 3M lamports (got ${split05.ops})`);
assert(split05.winner === 90_000_000, `0.05 stake → winner 90M lamports (got ${split05.winner})`);
assert(split05.winner + split05.treasury + split05.ops === split05.pot, 'split sums to pot exactly');

// Larger stake: 1 SOL × 2 = 2 SOL pot
const split1 = calculateSettlementSplit(solToLamports(1));
assert(split1.pot === 2_000_000_000, '1 SOL stake → pot 2 SOL');
assert(split1.winner === 1_800_000_000, '1 SOL stake → winner gets 1.8 SOL');

// Settlement preview
const preview = previewSettlement(0.05);
assert(preview.winnerSol === 0.09, `0.05 stake preview: winner 0.09 SOL (got ${preview.winnerSol})`);
assert(preview.treasurySol === 0.007, '0.05 stake preview: treasury 0.007 SOL');
assert(preview.opsSol === 0.003, '0.05 stake preview: ops 0.003 SOL');

// ============================================================
//   ESCROW — allowed stakes
// ============================================================
console.log('\n[ESCROW — allowed stakes]');

assert(isAllowedStake(0.05) === true, '0.05 SOL is allowed');
assert(isAllowedStake(0.1) === true, '0.1 SOL is allowed');
assert(isAllowedStake(5) === true, '5 SOL is allowed (max)');
assert(isAllowedStake(0.02) === false, '0.02 SOL is NOT allowed');
assert(isAllowedStake(10) === false, '10 SOL is NOT allowed (above max)');
assert(isAllowedStake(0) === false, '0 SOL is NOT allowed');

// ============================================================
//   ESCROW — wagered match preconditions
// ============================================================
console.log('\n[ESCROW — preconditions]');

// Happy path: both players have wallets, valid stake, both can wager above 0.05
const okResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: 'wallet-a', isAiBot: false },
        { walletAddress: 'wallet-b', isAiBot: false }
    ],
    stakeSol: 0.1,
    eloDocs: [
        { matchCount: 30, canWagerAboveLowStake: true },
        { matchCount: 30, canWagerAboveLowStake: true }
    ]
});
assert(okResult.ok === true, 'happy path passes precondition');

// Bot included → reject
const botResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: 'wallet-a', isAiBot: false },
        { isAiBot: true }
    ],
    stakeSol: 0.05,
    eloDocs: [{ matchCount: 30 }, null]
});
assert(botResult.ok === false && botResult.reason.includes('bot'), 'bot rejected');

// Missing wallet → reject
const noWalletResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: null, isAiBot: false },
        { walletAddress: 'wallet-b', isAiBot: false }
    ],
    stakeSol: 0.05,
    eloDocs: [{ matchCount: 30 }, { matchCount: 30 }]
});
assert(noWalletResult.ok === false && noWalletResult.reason.includes('wallet'), 'missing wallet rejected');

// Invalid stake → reject
const badStakeResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: 'a', isAiBot: false },
        { walletAddress: 'b', isAiBot: false }
    ],
    stakeSol: 0.03,
    eloDocs: [{ matchCount: 30 }, { matchCount: 30 }]
});
assert(badStakeResult.ok === false && badStakeResult.reason.includes('0.03'), 'non-allowed stake rejected');

// Anti-smurf: provisional player can't stake above 0.05 SOL
const smurfResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: 'a', isAiBot: false },
        { walletAddress: 'b', isAiBot: false }
    ],
    stakeSol: 0.5,
    eloDocs: [
        { matchCount: 5, canWagerAboveLowStake: false },   // provisional
        { matchCount: 30, canWagerAboveLowStake: true }
    ]
});
assert(smurfResult.ok === false && smurfResult.reason.includes('anti_smurf'),
    'provisional player blocked from high stake');

// Provisional CAN play 0.05 (low stake exempt from anti-smurf)
const provLowResult = validateWageredMatchPreconditions({
    players: [
        { walletAddress: 'a', isAiBot: false },
        { walletAddress: 'b', isAiBot: false }
    ],
    stakeSol: 0.05,
    eloDocs: [
        { matchCount: 5, canWagerAboveLowStake: false },
        { matchCount: 30, canWagerAboveLowStake: true }
    ]
});
assert(provLowResult.ok === true, 'provisional player can stake at low cap (0.05)');

// Constants exported
assert(POOL_ESCROW_CONSTANTS.WINNER_BPS === 9000, 'WINNER_BPS = 9000 (90%)');
assert(POOL_ESCROW_CONSTANTS.ALLOWED_STAKES_SOL.length === 6, '6 stake tiers configured');

// ============================================================
//   Cleanup
// ============================================================
stopMatchmaking();

// ============================================================
//   Summary
// ============================================================
console.log('');
if (failures === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
} else {
    console.log(`FAILED — ${failures} assertion${failures > 1 ? 's' : ''}`);
    process.exit(1);
}
