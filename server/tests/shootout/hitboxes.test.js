import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  ZONE_MULTIPLIERS,
  createDefaultHitboxTemplate,
} from '../../services/games/shootout/sim/hitboxes.js';

// Plan deviation: the Checkpoint 1 plan prescribed tests for HITBOX_ZONES
// and createHitboxSet — neither exist in the source TS. HITBOX_ZONES is a TS
// type union (no runtime shape); createHitboxSet lives in combat.ts and will
// port with sim/combat.js in Task A.3. Source is the truth.

test('zone multipliers — head 4x, chest 1x, stomach 1.25x, arms 1x, legs 0.75x', () => {
  assert.equal(ZONE_MULTIPLIERS.head, 4.0);
  assert.equal(ZONE_MULTIPLIERS.chest, 1.0);
  assert.equal(ZONE_MULTIPLIERS.stomach, 1.25);
  assert.equal(ZONE_MULTIPLIERS.arm_l, 1.0);
  assert.equal(ZONE_MULTIPLIERS.arm_r, 1.0);
  assert.equal(ZONE_MULTIPLIERS.leg_l, 0.75);
  assert.equal(ZONE_MULTIPLIERS.leg_r, 0.75);
});

test('default template has head/chest/stomach/arms/legs hitboxes', () => {
  const tpl = createDefaultHitboxTemplate();
  const zones = tpl.map((h) => h.zone).sort();
  assert.deepEqual(zones, ['arm_l', 'arm_r', 'chest', 'head', 'leg_l', 'leg_r', 'stomach']);
});

test('head hitbox: sphere, radius 0.20, armorProtected (helmet)', () => {
  const head = createDefaultHitboxTemplate().find((h) => h.zone === 'head');
  assert.equal(head.shape, 'sphere');
  assert.equal(head.radius, 0.20);
  assert.equal(head.armorProtected, true);
  assert.equal(head.boneName, 'Head');
  assert.deepEqual(head.offset, { x: 0, y: 0.13, z: 0 });
});

test('chest hitbox: box, halfExtents preserved, armorProtected', () => {
  const chest = createDefaultHitboxTemplate().find((h) => h.zone === 'chest');
  assert.equal(chest.shape, 'box');
  assert.equal(chest.armorProtected, true);
  assert.deepEqual(chest.halfExtents, { x: 0.19, y: 0.16, z: 0.15 });
});

test('legs are capsules, NOT armor-protected, radius 0.095', () => {
  const tpl = createDefaultHitboxTemplate();
  const legL = tpl.find((h) => h.zone === 'leg_l');
  const legR = tpl.find((h) => h.zone === 'leg_r');
  assert.equal(legL.shape, 'capsule');
  assert.equal(legR.shape, 'capsule');
  assert.equal(legL.armorProtected, false);
  assert.equal(legR.armorProtected, false);
  assert.equal(legL.radius, 0.095);
  assert.equal(legR.radius, 0.095);
});

test('arms are capsules, armor-protected, radius 0.075', () => {
  const tpl = createDefaultHitboxTemplate();
  const armL = tpl.find((h) => h.zone === 'arm_l');
  const armR = tpl.find((h) => h.zone === 'arm_r');
  assert.equal(armL.shape, 'capsule');
  assert.equal(armR.shape, 'capsule');
  assert.equal(armL.armorProtected, true);
  assert.equal(armR.armorProtected, true);
  assert.equal(armL.radius, 0.075);
  assert.equal(armR.radius, 0.075);
});
