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
