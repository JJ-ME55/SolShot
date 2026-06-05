import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createHitboxSet,
  updateHitboxPositions,
  testHitscan,
  testEnvironmentHit,
} from '../../services/games/shootout/sim/combat.js';
import { ZONE_MULTIPLIERS } from '../../services/games/shootout/sim/hitboxes.js';

// Plan deviation: the Checkpoint 1 plan listed tests for `computeHitNormal` as a
// public export — source keeps it module-private (only `testHitscan` uses it).
// We exercise normal computation indirectly through testHitscan's HitResult.
// Plan also listed ray-primitive tests (sphere/box/capsule) — those already
// live in A.1's hitboxes coverage; not repeated here.
//
// `createHitboxSet(id)` takes an id arg but doesn't use it in source (returns
// the default template verbatim). Port preserves the signature for fidelity.

// ---------- helpers ----------

/**
 * Build a synthetic target standing at (x, 0, z) facing +Z, with bones
 * positioned roughly like a humanoid. Centered on the player's torso.
 */
function makeTarget(id, x, z) {
  const bones = {
    Head: { x, y: 1.55, z },           // sphere centered at +0.13 → 1.68 (skull)
    Chest: { x, y: 1.30, z },          // chest box center y ~1.36
    Spine: { x, y: 1.05, z },          // stomach box center y ~1.10
    'UpperArm.L': { x: x - 0.25, y: 1.40, z },
    'Hand.L':     { x: x - 0.30, y: 1.00, z },
    'UpperArm.R': { x: x + 0.25, y: 1.40, z },
    'Hand.R':     { x: x + 0.30, y: 1.00, z },
    'Thigh.L': { x: x - 0.10, y: 0.85, z },
    'Foot.L':  { x: x - 0.10, y: 0.05, z },
    'Thigh.R': { x: x + 0.10, y: 0.85, z },
    'Foot.R':  { x: x + 0.10, y: 0.05, z },
  };
  const hitboxes = createHitboxSet(id);
  updateHitboxPositions(hitboxes, bones);
  return { id, hitboxes, bones };
}

// ---------- createHitboxSet ----------

test('createHitboxSet returns a fresh array with all 7 zones', () => {
  const set = createHitboxSet('p1');
  const zones = set.map((h) => h.zone).sort();
  assert.deepEqual(zones, ['arm_l', 'arm_r', 'chest', 'head', 'leg_l', 'leg_r', 'stomach']);
  // Independent instances
  const set2 = createHitboxSet('p2');
  assert.notEqual(set, set2);
});

// ---------- updateHitboxPositions ----------

test('updateHitboxPositions: sphere head follows Head bone + offset', () => {
  const set = createHitboxSet('p');
  updateHitboxPositions(set, { Head: { x: 1, y: 2, z: 3 } });
  const head = set.find((h) => h.zone === 'head');
  // offset is { x: 0, y: 0.13, z: 0 }
  assert.deepEqual(head.center, { x: 1, y: 2.13, z: 3 });
});

test('updateHitboxPositions: arm capsule endA = UpperArm, endB = Hand', () => {
  const set = createHitboxSet('p');
  updateHitboxPositions(set, {
    'UpperArm.L': { x: 0, y: 1.5, z: 0 },
    'Hand.L':     { x: 0, y: 1.0, z: 0 },
  });
  const armL = set.find((h) => h.zone === 'arm_l');
  assert.deepEqual(armL.endA, { x: 0, y: 1.5, z: 0 });
  assert.deepEqual(armL.endB, { x: 0, y: 1.0, z: 0 });
  assert.deepEqual(armL.center, { x: 0, y: 1.5, z: 0 }); // center := endA
});

test('updateHitboxPositions: leg capsule Thigh -> Foot (full leg)', () => {
  const set = createHitboxSet('p');
  updateHitboxPositions(set, {
    'Thigh.R': { x: 0.1, y: 0.85, z: 0 },
    'Foot.R':  { x: 0.1, y: 0.05, z: 0 },
  });
  const legR = set.find((h) => h.zone === 'leg_r');
  assert.deepEqual(legR.endA, { x: 0.1, y: 0.85, z: 0 });
  assert.deepEqual(legR.endB, { x: 0.1, y: 0.05, z: 0 });
});

test('updateHitboxPositions: leg falls back to Shin if no Foot', () => {
  const set = createHitboxSet('p');
  updateHitboxPositions(set, {
    'Thigh.L': { x: 0, y: 0.85, z: 0 },
    'Shin.L':  { x: 0, y: 0.45, z: 0 },
  });
  const legL = set.find((h) => h.zone === 'leg_l');
  assert.deepEqual(legL.endB, { x: 0, y: 0.45, z: 0 });
});

test('updateHitboxPositions: missing bone is skipped (no throw)', () => {
  const set = createHitboxSet('p');
  // Empty bone map — should not throw
  updateHitboxPositions(set, {});
  // head.center stays at original template value {0,0,0}
  const head = set.find((h) => h.zone === 'head');
  assert.deepEqual(head.center, { x: 0, y: 0, z: 0 });
});

// ---------- testHitscan: empty + miss ----------

test('testHitscan: no targets → null', () => {
  const result = testHitscan(
    { x: 0, y: 1.5, z: 0 },
    { x: 0, y: 0, z: 1 },
    [],
    'shooter',
  );
  assert.equal(result, null);
});

test('testHitscan: ray that misses entirely → null', () => {
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 10, y: 1.5, z: 0 }, // way off to the side
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.equal(result, null);
});

// ---------- testHitscan: zone resolution ----------

test('testHitscan: ray at head level hits head, isHeadshot=true', () => {
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.68, z: 0 }, // head sphere center y is ~1.68 (1.55 + 0.13)
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result, 'expected a hit');
  assert.equal(result.zone, 'head');
  assert.equal(result.isHeadshot, true);
  assert.equal(result.multiplier, ZONE_MULTIPLIERS.head);
  assert.equal(result.targetId, 't');
  assert.equal(result.armorProtected, true); // helmet protects head zone
});

test('testHitscan: ray at chest level hits chest', () => {
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.36, z: 0 }, // chest box center y is ~1.30 + 0.06 = 1.36
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result, 'expected a hit');
  assert.equal(result.zone, 'chest');
  assert.equal(result.isHeadshot, false);
  assert.equal(result.multiplier, ZONE_MULTIPLIERS.chest);
});

// ---------- testHitscan: shooter self-hit filter ----------

test('testHitscan: shooterId filter skips the shooter own hitboxes', () => {
  const shooter = makeTarget('me', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.68, z: 0 },
    { x: 0, y: 0, z: 1 },
    [shooter],
    'me', // shooter id matches the only target → no hit
  );
  assert.equal(result, null);
});

test('testHitscan: with no shooterId, even own hitboxes register', () => {
  const t = makeTarget('me', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.68, z: 0 },
    { x: 0, y: 0, z: 1 },
    [t],
    undefined,
  );
  assert.ok(result);
  assert.equal(result.targetId, 'me');
});

// ---------- testHitscan: arm-penetration rule ----------

test('testHitscan: arm-penetration — ray grazing arm AND chest returns chest hit', () => {
  // Place target with the LEFT arm physically in front of the chest along the
  // ray path. Ray fires through the arm region, but chest box is wide enough
  // that the ray also intersects it. Arm hit must be discarded.
  const target = makeTarget('t', 0, 5);
  // Move arm in front of chest so ray hits arm before chest
  const set = target.hitboxes;
  const armL = set.find((h) => h.zone === 'arm_l');
  // Position arm capsule directly along ray: endA close, endB further
  armL.endA = { x: 0, y: 1.36, z: 4.5 };
  armL.endB = { x: 0, y: 1.36, z: 4.7 };
  armL.center = armL.endA;
  // Ray goes straight through arm and into chest behind it
  const result = testHitscan(
    { x: 0, y: 1.36, z: 0 },
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result);
  // Arm hit suppressed in favor of chest hit
  assert.equal(result.zone, 'chest');
});

test('testHitscan: arm-only hit (no torso hit) still returns arm', () => {
  const target = makeTarget('t', 0, 5);
  const set = target.hitboxes;
  // Move arm WAY out to the side so chest can't be hit by a ray through arm
  const armL = set.find((h) => h.zone === 'arm_l');
  armL.endA = { x: 2, y: 1.36, z: 4.9 };
  armL.endB = { x: 2, y: 1.36, z: 5.1 };
  armL.center = armL.endA;
  // Ray aimed at arm position only
  const result = testHitscan(
    { x: 2, y: 1.36, z: 0 },
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result);
  assert.equal(result.zone, 'arm_l');
});

// ---------- testHitscan: closest-target selection ----------

test('testHitscan: closest of multiple targets wins', () => {
  const near = makeTarget('near', 0, 3);
  const far  = makeTarget('far',  0, 10);
  const result = testHitscan(
    { x: 0, y: 1.36, z: 0 },
    { x: 0, y: 0, z: 1 },
    [far, near], // pass far first to prove ordering does not matter
    'shooter',
  );
  assert.ok(result);
  assert.equal(result.targetId, 'near');
});

// ---------- testHitscan: HitResult shape matches damage.applyDamage contract ----------

test('testHitscan: HitResult has every field damage.applyDamage reads', () => {
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.68, z: 0 },
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result);
  // Fields damage.js reads: targetId, zone, multiplier, armorProtected, isHeadshot
  assert.equal(typeof result.targetId, 'string');
  assert.equal(typeof result.zone, 'string');
  assert.equal(typeof result.multiplier, 'number');
  assert.equal(typeof result.armorProtected, 'boolean');
  assert.equal(typeof result.isHeadshot, 'boolean');
  // Plus distance/hitPosition/hitNormal for VFX downstream
  assert.equal(typeof result.distance, 'number');
  assert.equal(typeof result.hitPosition.x, 'number');
  assert.equal(typeof result.hitNormal.x, 'number');
});

test('testHitscan: hitNormal on sphere points outward from center', () => {
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.68, z: 0 }, // y aligned with head center
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result);
  assert.equal(result.zone, 'head');
  // Normal at hit point should be roughly (0, 0, -1) — ray came from -z
  // and hit the front of the sphere. Sphere center at (0,1.68,5),
  // entry point ~ (0,1.68,4.80). Normal = (entry - center) normalized ≈ (0,0,-1).
  assert.ok(result.hitNormal.z < -0.9, `expected z ≈ -1, got ${result.hitNormal.z}`);
});

test('testHitscan: hitNormal on chest box is axis-aligned (-z front face)', () => {
  // Chest box at center (0, 1.36, 5), halfExtents (0.19, 0.16, 0.15). Front face
  // is at z = 4.85. Ray from (0, 1.36, 0) along +z enters that face → normal points
  // back toward shooter: (0, 0, -1). Exercises the box-face branch of
  // computeHitNormal that the sphere head test never reaches.
  const target = makeTarget('t', 0, 5);
  const result = testHitscan(
    { x: 0, y: 1.36, z: 0 },
    { x: 0, y: 0, z: 1 },
    [target],
    'shooter',
  );
  assert.ok(result);
  assert.equal(result.zone, 'chest');
  assert.ok(result.hitNormal.z < -0.9, `expected z ≈ -1, got ${result.hitNormal.z}`);
  assert.ok(Math.abs(result.hitNormal.x) < 0.1, `expected x ≈ 0, got ${result.hitNormal.x}`);
  assert.ok(Math.abs(result.hitNormal.y) < 0.1, `expected y ≈ 0, got ${result.hitNormal.y}`);
});

// NOTE: a capsule-perpendicular hitNormal test would naturally belong here,
// but the source's rayCapsuleIntersect cylinder-body math has a sign error
// in the closest-approach formula — it computes (v·w)/|w|² where it should
// compute -(v·w)/|w|², so perpendicular rays return a t<0 and silently miss.
// All existing capsule tests get away with it because they use rays parallel
// to the capsule axis (the parallel branch returns earlier via cap-sphere
// intersection). This is a faithful-port artifact; tracking it as an
// upstream issue against BillionaireBonkClub/shootout's src/engine/hitboxes.ts
// alongside the computeHitNormal degenerate-capsule NaN (I-1 from A.3 review).
// Capsule-hitNormal coverage will land once the upstream is fixed and we
// re-sync this port.

// ---------- testEnvironmentHit (placeholder) ----------

test('testEnvironmentHit: returns null (Three.js placeholder)', () => {
  const r = testEnvironmentHit({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 100);
  assert.equal(r, null);
});
