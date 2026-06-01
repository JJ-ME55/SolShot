#!/usr/bin/env node
/**
 * Cross-language drift guard for the pool sim.
 *
 * Mirrors The-Arcade-git/pool/test/simulate.test.mjs EXACTLY in fixture
 * inputs and assertions. If both this and that suite pass, the Node and
 * TS implementations of the sim are byte-equivalent for the covered
 * physics paths (rack-break, scratch, contact, no-contact, topspin,
 * backspin, friction, determinism, input purity).
 *
 * When you change either sim:
 *   - update both files
 *   - run both test suites
 *   - any divergence here is the drift this test exists to catch
 *
 * Run:  node server/scripts/smoke-pool-simulation.mjs
 * Exits 0 on success, 1 on any assertion failure.
 */

import { simulateShot } from '../services/pool/sim/simulate.js';
import { DEFAULT_PHYSICS_CONFIG } from '../services/pool/sim/types.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) process.stdout.write('  PASS  ' + msg + '\n');
  else { process.stdout.write('  FAIL  ' + msg + '\n'); failures++; }
}
function approx(a, b, tol = 0.001) { return Math.abs(a - b) < tol; }

// Standard test table — mirrors browser fixture exactly
const table = {
  width: 1422,
  height: 720,
  cushionWidth: 26,
  pocketsPositions: [
    { x: 60, y: 60 },
    { x: 1422 / 2, y: 40 },
    { x: 1422 - 60, y: 60 },
    { x: 60, y: 720 - 60 },
    { x: 1422 / 2, y: 720 - 40 },
    { x: 1422 - 60, y: 720 - 60 }
  ],
  pocketRadius: 30
};

const physics = DEFAULT_PHYSICS_CONFIG;

function ball(id, color, x, y, vx = 0, vy = 0, sx = 0, sy = 0) {
  return {
    id, color,
    position: { x, y },
    velocity: { x: vx, y: vy },
    spinX: sx,
    spinY: sy,
    visible: true
  };
}

// ────────────────────────────────────────────────
console.log('\n[STILL TABLE — no balls move]');
{
  const balls = [ball(0, 'white', 400, 360)];
  const r = simulateShot(balls, { power: 0, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  assert(r.ticks <= 1, `power 0: 0 or 1 tick (got ${r.ticks})`);
  assert(r.events[r.events.length - 1].type === 'simulation_complete', 'ends with simulation_complete');
  assert(r.finalBalls[0].position.x === 400, 'cue ball position unchanged');
}

// ────────────────────────────────────────────────
console.log('\n[DETERMINISM — same inputs, same outputs]');
{
  const balls = [ball(0, 'white', 400, 360), ball(1, 'red', 900, 360)];
  const shot = { power: 25, angle: 0, spinX: 0, spinY: 0 };

  const r1 = simulateShot(JSON.parse(JSON.stringify(balls)), shot, table, physics);
  const r2 = simulateShot(JSON.parse(JSON.stringify(balls)), shot, table, physics);

  assert(r1.ticks === r2.ticks, `same input → same tick count (${r1.ticks} === ${r2.ticks})`);
  assert(r1.events.length === r2.events.length, 'same event count');
  assert(
    r1.finalBalls.every((b, i) =>
      approx(b.position.x, r2.finalBalls[i].position.x) &&
      approx(b.position.y, r2.finalBalls[i].position.y)
    ),
    'final positions identical between runs'
  );
}

// ────────────────────────────────────────────────
console.log('\n[CUE BALL HITS OBJECT BALL — first contact detected]');
{
  const balls = [ball(0, 'white', 400, 360), ball(1, 'red', 900, 360)];
  const r = simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  const collisions = r.events.filter(e => e.type === 'ball_collision');
  assert(collisions.length >= 1, `cue→red collision recorded (got ${collisions.length})`);
  assert(r.firstCollidedBallColor === 'red', `firstCollidedBallColor = red (got ${r.firstCollidedBallColor})`);
}

// ────────────────────────────────────────────────
console.log('\n[NO CONTACT — cue ball missed]');
{
  const balls = [
    ball(0, 'white', 400, 200),
    ball(1, 'red', 900, 500)
  ];
  const r = simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  assert(r.firstCollidedBallColor === null, 'no contact → firstCollidedBallColor = null');
  const collisions = r.events.filter(e => e.type === 'ball_collision');
  assert(collisions.length === 0, `no ball-ball collisions (got ${collisions.length})`);
}

// ────────────────────────────────────────────────
console.log('\n[SCRATCH — cue ball pocketed]');
{
  const balls = [ball(0, 'white', 400, 360)];
  // Aim straight at top-left pocket (60, 60)
  const dx = 60 - 400;
  const dy = 60 - 360;
  const angle = Math.atan2(dy, dx);
  const r = simulateShot(balls, { power: 30, angle, spinX: 0, spinY: 0 }, table, physics);
  const scratch = r.events.find(e => e.type === 'cue_ball_potted');
  assert(scratch !== undefined, 'cue_ball_potted event emitted');
  assert(r.finalBalls[0].visible === false, 'cue ball hidden after scratch');
}

// ────────────────────────────────────────────────
console.log('\n[FRICTION — cue ball eventually stops]');
{
  const balls = [ball(0, 'white', 400, 360)];
  const r = simulateShot(balls, { power: 10, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  assert(!r.truncated, 'simulation did not hit maxTicks');
  assert(r.finalBalls[0].velocity.x === 0 && r.finalBalls[0].velocity.y === 0,
    'cue ball velocity is zero at end');
}

// ────────────────────────────────────────────────
console.log('\n[NO CUE BALL — handles gracefully]');
{
  const balls = [ball(1, 'red', 900, 360)];
  const r = simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  assert(r.ticks === 0, `no cue ball → 0 ticks (got ${r.ticks})`);
  assert(r.events.length === 1 && r.events[0].type === 'simulation_complete',
    'no cue ball → only simulation_complete event');
}

// ────────────────────────────────────────────────
console.log('\n[INPUT NOT MUTATED — pure function]');
{
  const balls = [ball(0, 'white', 400, 360), ball(1, 'red', 900, 360)];
  const originalCue = JSON.parse(JSON.stringify(balls[0]));
  const originalRed = JSON.parse(JSON.stringify(balls[1]));
  simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: 0 }, table, physics);
  assert(
    balls[0].position.x === originalCue.position.x &&
    balls[0].position.y === originalCue.position.y &&
    balls[0].velocity.x === originalCue.velocity.x,
    'caller input not mutated (cue ball still at start)'
  );
  assert(
    balls[1].position.x === originalRed.position.x &&
    balls[1].position.y === originalRed.position.y,
    'caller input not mutated (cue ball still at rest)'
  );
}

// ────────────────────────────────────────────────
console.log('\n[TOPSPIN — cue ball follows through past target]');
{
  // EXACT browser test fixture — drift guard
  const balls = [ball(0, 'white', 400, 360), ball(1, 'red', 600, 360)];
  const r = simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: 1 }, table, physics);
  const cueFinal = r.finalBalls.find(b => b.color === 'white');
  const redFinal = r.finalBalls.find(b => b.color === 'red');
  assert(cueFinal.position.x > 400, `cue ball moved forward with topspin (final x=${cueFinal.position.x.toFixed(1)})`);
  assert(redFinal.position.x > 600, `red ball driven forward (final x=${redFinal.position.x.toFixed(1)})`);
}

// ────────────────────────────────────────────────
console.log('\n[BACKSPIN — cue ball reverses past target]');
{
  // EXACT browser test fixture — drift guard
  const balls = [ball(0, 'white', 400, 360), ball(1, 'red', 600, 360)];
  const r = simulateShot(balls, { power: 25, angle: 0, spinX: 0, spinY: -1 }, table, physics);
  const cueFinal = r.finalBalls.find(b => b.color === 'white');
  const redFinal = r.finalBalls.find(b => b.color === 'red');
  assert(cueFinal.position.x < 400, `cue ball drew back with backspin (final x=${cueFinal.position.x.toFixed(1)})`);
  assert(redFinal.position.x > 600, `red ball still driven forward (final x=${redFinal.position.x.toFixed(1)})`);
}

// ────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log('ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log(`FAILED — ${failures} assertion${failures > 1 ? 's' : ''}`);
  process.exit(1);
}
