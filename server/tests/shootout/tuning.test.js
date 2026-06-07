/**
 * Tests for sim/tuning.js — Day 1 / Task 1.
 *
 * Trivial sanity checks that the well-known movement constants survived
 * the port from c:\Users\jacob\fps-staking-game\visual\main.js. The real
 * physics tests live in physics.test.js — these just guard the table
 * shape so a typo in the port never silently changes movement feel.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { MOVEMENT_TUNING, SOURCE_COMMIT } from '../../services/games/shootout/sim/tuning.js';

test('tuning: SOURCE_COMMIT is a 40-char git sha', () => {
    assert.match(SOURCE_COMMIT, /^[0-9a-f]{40}$/);
});

test('tuning: MOVEMENT_TUNING is frozen', () => {
    assert.equal(Object.isFrozen(MOVEMENT_TUNING), true);
});

test('tuning: well-known constants match source (visual/main.js Player ctor)', () => {
    assert.equal(MOVEMENT_TUNING.groundAccel,    100.0);
    assert.equal(MOVEMENT_TUNING.groundFriction, 12.0);
    assert.equal(MOVEMENT_TUNING.airAccel,       10.0);
    assert.equal(MOVEMENT_TUNING.maxSpeed,       4.5);
    assert.equal(MOVEMENT_TUNING.jumpImpulse,    5.6);
    assert.equal(MOVEMENT_TUNING.gravity,        -20.0);
    assert.equal(MOVEMENT_TUNING.playerHeightStanding,  1.8);
    assert.equal(MOVEMENT_TUNING.playerHeightCrouching, 1.2);
});

test('tuning: physical signs make sense (friction > 0, gravity < 0)', () => {
    assert.ok(MOVEMENT_TUNING.groundFriction > 0, 'friction must be positive');
    assert.ok(MOVEMENT_TUNING.gravity        < 0, 'gravity must be negative');
    assert.ok(MOVEMENT_TUNING.jumpImpulse    > 0, 'jump must be positive (upward)');
    assert.ok(MOVEMENT_TUNING.maxSpeed       > 0);
});
