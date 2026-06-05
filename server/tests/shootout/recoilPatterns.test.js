/**
 * Tests for sim/recoilPatterns.js.
 *
 * Plan-deviation notes:
 *  - Plan sketch used `update(dt, {moving, scoped})` and `getSpreadAngle(weapon, scoped)`.
 *    Source's real signatures are:
 *      update(dt, speed, onGround, crouching, timeSinceLastShot, weaponType)
 *      getSpreadAngle(weaponType, crouching)
 *    There is NO "scoped" parameter in recoil-patterns.ts. Tests below mirror
 *    the real source signatures.
 *  - Weapon-type args are bare strings ('AK47', 'M4A1', 'SMG', 'PISTOL', 'KNIFE')
 *    because the source `WeaponType` is a TS string-enum (`AK47 = 'AK47'`), so
 *    `WeaponType.AK47 === 'AK47'` at runtime.
 *  - Source uses `Math.random()` inside PISTOL recoil + `getSpreadAngle`. Tests
 *    that touch those code paths stub `Math.random` to make assertions stable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCE_COMMIT,
  AK47_PATTERN,
  M4A1_PATTERN,
  getRecoilAngle,
  AccuracyModel,
  getFinalShotAngle,
} from '../../services/games/shootout/sim/recoilPatterns.js';

// ---------- SOURCE_COMMIT ----------

test('SOURCE_COMMIT is set to a real-looking sha', () => {
  assert.match(SOURCE_COMMIT, /^[0-9a-f]{40}$/);
});

// ---------- Pattern tables ----------

test('AK47_PATTERN has 30 entries', () => {
  assert.equal(AK47_PATTERN.length, 30);
});

test('M4A1_PATTERN has 30 entries', () => {
  assert.equal(M4A1_PATTERN.length, 30);
});

test('AK47_PATTERN[0] matches source first-shot value', () => {
  assert.deepEqual(AK47_PATTERN[0], { x: 0.0, y: 0.6 });
});

test('AK47_PATTERN[7] matches source 8th-shot value', () => {
  assert.deepEqual(AK47_PATTERN[7], { x: -0.5, y: 0.4 });
});

test('M4A1_PATTERN[0] matches source first-shot value', () => {
  assert.deepEqual(M4A1_PATTERN[0], { x: 0.0, y: 0.5 });
});

// ---------- getRecoilAngle ----------

test('getRecoilAngle AK47 first shot', () => {
  assert.deepEqual(getRecoilAngle('AK47', 0), { x: 0.0, y: 0.6 });
});

test('getRecoilAngle AK47 8th shot (index 7)', () => {
  assert.deepEqual(getRecoilAngle('AK47', 7), { x: -0.5, y: 0.4 });
});

test('getRecoilAngle AK47 wraps with modulo at end of pattern', () => {
  // shotIndex 30 -> 30 % 30 = 0
  assert.deepEqual(getRecoilAngle('AK47', 30), AK47_PATTERN[0]);
  // shotIndex 37 -> 37 % 30 = 7
  assert.deepEqual(getRecoilAngle('AK47', 37), AK47_PATTERN[7]);
});

test('getRecoilAngle M4A1 wraps with modulo at end of pattern', () => {
  assert.deepEqual(getRecoilAngle('M4A1', 30), M4A1_PATTERN[0]);
});

test('getRecoilAngle SMG returns scaled M4 pattern (x*0.7, y*0.65)', () => {
  // Shot 1: M4 is {0.0, 0.5} -> {0.0, 0.5*0.65 = 0.325}
  assert.deepEqual(getRecoilAngle('SMG', 0), { x: 0.0, y: 0.5 * 0.65 });
  // Shot 7 (index 6): M4 is {0.2, 0.4} -> {0.2*0.7, 0.4*0.65}
  assert.deepEqual(getRecoilAngle('SMG', 5), {
    x: 0.2 * 0.7,
    y: 0.4 * 0.65,
  });
});

test('getRecoilAngle KNIFE returns zero', () => {
  assert.deepEqual(getRecoilAngle('KNIFE', 0), { x: 0, y: 0 });
  assert.deepEqual(getRecoilAngle('KNIFE', 50), { x: 0, y: 0 });
});

test('getRecoilAngle PISTOL is bounded random kick', () => {
  // Stub Math.random for deterministic check.
  // Use Object.is-tolerant comparisons because (0.5 - 0.5) * 0.2 produces +0
  // but float arithmetic in other paths can produce -0.
  const origRandom = Math.random;
  try {
    Math.random = () => 0.5;
    let r = getRecoilAngle('PISTOL', 0);
    assert.equal(r.x, 0); // (0.5 - 0.5) * 0.2
    assert.ok(Math.abs(r.y - 0.5) < 1e-12, `y=${r.y}`); // 0.4 + 0.5 * 0.2

    Math.random = () => 0.0;
    r = getRecoilAngle('PISTOL', 5);
    assert.ok(Math.abs(r.x - -0.1) < 1e-12, `x=${r.x}`); // (0 - 0.5) * 0.2
    assert.ok(Math.abs(r.y - 0.4) < 1e-12, `y=${r.y}`); // 0.4 + 0

    Math.random = () => 1.0;
    r = getRecoilAngle('PISTOL', 99);
    assert.ok(Math.abs(r.x - 0.1) < 1e-12, `x=${r.x}`); // (1 - 0.5) * 0.2
    assert.ok(Math.abs(r.y - 0.6) < 1e-12, `y=${r.y}`); // 0.4 + 0.2
  } finally {
    Math.random = origRandom;
  }
});

test('getRecoilAngle unknown weapon returns zero', () => {
  assert.deepEqual(getRecoilAngle('UNKNOWN_GUN', 0), { x: 0, y: 0 });
});

// ---------- AccuracyModel ----------

test('AccuracyModel starts at 1.0', () => {
  const m = new AccuracyModel();
  assert.equal(m.accuracy, 1.0);
});

test('AccuracyModel.reset restores 1.0', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.3;
  m.reset();
  assert.equal(m.accuracy, 1.0);
});

test('AccuracyModel standing still on ground stays / converges to 1.0', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.3; // start degraded
  // standing still: speed=0, onGround=true, crouching=false, timeSince=10s (no spray penalty), weapon=AK47
  // counter-strafe blendSpeed=100, dt=0.05 -> dt*blendSpeed=5 -> clamp to 1 -> instant snap.
  m.update(0.05, 0, true, false, 10, 'AK47');
  assert.equal(m.accuracy, 1.0);
});

test('AccuracyModel airborne with rifle drives accuracy toward 0', () => {
  const m = new AccuracyModel();
  // airborne: blendSpeed=5, target=0.0. Run many ticks.
  for (let i = 0; i < 200; i++) {
    m.update(0.05, 0, false, false, 10, 'AK47');
  }
  assert.ok(m.accuracy < 0.01, `expected accuracy ~0, got ${m.accuracy}`);
});

test('AccuracyModel airborne with pistol clamps target at 0.1', () => {
  const m = new AccuracyModel();
  for (let i = 0; i < 200; i++) {
    m.update(0.05, 0, false, false, 10, 'PISTOL');
  }
  assert.ok(
    Math.abs(m.accuracy - 0.1) < 0.001,
    `expected accuracy ~0.1, got ${m.accuracy}`,
  );
});

test('AccuracyModel moving on ground drives rifle accuracy toward 0.1', () => {
  const m = new AccuracyModel();
  // speed > 10 on ground -> target 0.1 (rifle). blendSpeed=5 (since speed >= 10 fails the counter-strafe branch).
  for (let i = 0; i < 400; i++) {
    m.update(0.05, 25, true, false, 10, 'AK47');
  }
  assert.ok(
    Math.abs(m.accuracy - 0.1) < 0.005,
    `expected ~0.1, got ${m.accuracy}`,
  );
});

test('AccuracyModel spray penalty: short timeSinceLastShot scales target down', () => {
  const m = new AccuracyModel();
  // Standing still, but timeSinceLastShot = 0 -> target = 1.0 * (0/0.45) = 0.
  // blendSpeed=100, dt=0.05 -> snap.
  m.update(0.05, 0, true, false, 0, 'AK47');
  assert.equal(m.accuracy, 0);
});

test('AccuracyModel.accuracy is clamped to [0, 1]', () => {
  const m = new AccuracyModel();
  // Force a weird state and verify clamp still holds after update.
  m.accuracy = 1.0;
  m.update(0.016, 0, true, false, 10, 'AK47');
  assert.ok(m.accuracy >= 0 && m.accuracy <= 1);
});

// ---------- getSpreadAngle ----------

test('getSpreadAngle at perfect accuracy returns {0,0}', () => {
  const m = new AccuracyModel();
  m.accuracy = 1.0;
  // (1.0 - 1.0) * maxSpread = 0 -> regardless of Math.random, both components are 0.
  // Use abs comparison to tolerate -0 from float multiply.
  const s = m.getSpreadAngle('AK47', false);
  assert.equal(Math.abs(s.x), 0);
  assert.equal(Math.abs(s.y), 0);
});

test('getSpreadAngle at degraded accuracy is bounded by maxSpread (rifle=5)', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.5; // spreadRadius = 0.5 * 5 = 2.5
  const origRandom = Math.random;
  try {
    // Force max-distance, angle=0 (cos=1, sin=0) -> {2.5, 0}
    let calls = 0;
    Math.random = () => (calls++ === 0 ? 0 : 1); // first call is angle, second is dist
    const s = m.getSpreadAngle('AK47', false);
    assert.ok(Math.abs(s.x - 2.5) < 1e-9, `x=${s.x}`);
    assert.ok(Math.abs(s.y) < 1e-9, `y=${s.y}`);
  } finally {
    Math.random = origRandom;
  }
});

test('getSpreadAngle pistol maxSpread is 3.0', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.0; // spreadRadius = 1.0 * 3 = 3
  const origRandom = Math.random;
  try {
    let calls = 0;
    Math.random = () => (calls++ === 0 ? 0 : 1);
    const s = m.getSpreadAngle('PISTOL', false);
    assert.ok(Math.abs(s.x - 3.0) < 1e-9, `x=${s.x}`);
    assert.ok(Math.abs(s.y) < 1e-9, `y=${s.y}`);
  } finally {
    Math.random = origRandom;
  }
});

test('getSpreadAngle crouching applies 0.7 multiplier', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.0; // rifle spread = 1.0 * 5 = 5, then * 0.7 = 3.5
  const origRandom = Math.random;
  try {
    let calls = 0;
    Math.random = () => (calls++ === 0 ? 0 : 1);
    const s = m.getSpreadAngle('AK47', true);
    assert.ok(Math.abs(s.x - 3.5) < 1e-9, `x=${s.x}`);
  } finally {
    Math.random = origRandom;
  }
});

test('getSpreadAngle output stays within radius for many random draws', () => {
  const m = new AccuracyModel();
  m.accuracy = 0.5; // radius = 2.5 (rifle)
  for (let i = 0; i < 500; i++) {
    const s = m.getSpreadAngle('AK47', false);
    const r = Math.sqrt(s.x * s.x + s.y * s.y);
    assert.ok(r <= 2.5 + 1e-9, `radius ${r} exceeded 2.5`);
  }
});

// ---------- getFinalShotAngle ----------

test('getFinalShotAngle at perfect accuracy equals pattern delta', () => {
  // accuracy=1.0 -> spread is {0,0}; result = AK47_PATTERN[0]
  const a = getFinalShotAngle('AK47', 0, 1.0, false);
  assert.deepEqual(a, { x: 0.0, y: 0.6 });
});

test('getFinalShotAngle sums pattern + spread', () => {
  const origRandom = Math.random;
  try {
    // For AK47 shot 0 at accuracy 0.5: pattern={0, 0.6}, spreadRadius=2.5.
    // Force angle=0, dist=max -> spread = {2.5, 0}; sum = {2.5, 0.6}.
    let calls = 0;
    Math.random = () => (calls++ === 0 ? 0 : 1);
    const a = getFinalShotAngle('AK47', 0, 0.5, false);
    assert.ok(Math.abs(a.x - 2.5) < 1e-9, `x=${a.x}`);
    assert.ok(Math.abs(a.y - 0.6) < 1e-9, `y=${a.y}`);
  } finally {
    Math.random = origRandom;
  }
});
