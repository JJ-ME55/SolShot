/**
 * Tests for sim/physics.js — Day 1 / Task 2.
 *
 * Covers:
 *   - spawnStateForSlot returns valid coords for each mode + slot
 *   - integrateMovement standing still on ground decays velocity to 0
 *   - integrateMovement walking forward advances position monotonically
 *   - capsule clamps inside outer arena bounds
 *   - cover boxes push the player out along the shortest axis
 *   - gravity pulls a player downward in air
 *   - jump impulse + landing
 *   - look angles propagate from input to state
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
    ARENA_BOUNDS,
    COVER_BOXES,
    SPAWN_POSITIONS_BY_SLOT,
    spawnStateForSlot,
    neutralInput,
    integrateMovement,
    resolveCollision,
} from '../../services/games/shootout/sim/physics.js';
import { MOVEMENT_TUNING } from '../../services/games/shootout/sim/tuning.js';

// ── spawnStateForSlot ────────────────────────────────────────────────

test('spawnStateForSlot: returns finite coords for 1v1 slots 0..1', () => {
    for (const slot of [0, 1]) {
        const s = spawnStateForSlot('1v1', slot);
        assert.ok(Number.isFinite(s.x));
        assert.ok(Number.isFinite(s.y));
        assert.ok(Number.isFinite(s.z));
        assert.ok(Number.isFinite(s.yaw));
        assert.equal(s.vx, 0);
        assert.equal(s.vy, 0);
        assert.equal(s.vz, 0);
        assert.equal(s.onGround, true);
        assert.equal(s.crouching, false);
    }
});

test('spawnStateForSlot: returns finite coords for 2v2 slots 0..3', () => {
    for (const slot of [0, 1, 2, 3]) {
        const s = spawnStateForSlot('2v2', slot);
        assert.ok(Number.isFinite(s.x));
        assert.ok(Number.isFinite(s.y));
        assert.ok(Number.isFinite(s.z));
    }
});

test('spawnStateForSlot: opposing slots spawn at different positions facing each other', () => {
    const red  = spawnStateForSlot('1v1', 0);
    const blue = spawnStateForSlot('1v1', 1);
    assert.notDeepStrictEqual(
        { x: red.x, y: red.y, z: red.z },
        { x: blue.x, y: blue.y, z: blue.z },
        'red and blue spawn at distinct positions',
    );
    // Current layout (2026-06-08): opposite ends on the Z axis (red at
    // +22, blue at -22). At least 10u of separation — the old close-
    // spawn demo at (12, _, 22) / (18, _, 22) put blue inside the Rect
    // Structure footprint and broke MP testing.
    const sep = Math.hypot(red.x - blue.x, red.z - blue.z);
    assert.ok(sep > 10, `spawns should be well-separated, got ${sep.toFixed(1)}u`);
});

test('spawnStateForSlot: throws on unknown mode + slot', () => {
    assert.throws(() => spawnStateForSlot('5v5', 0));
    assert.throws(() => spawnStateForSlot('1v1', 99));
});

// ── neutralInput ─────────────────────────────────────────────────────

test('neutralInput: all-zeros, no buttons', () => {
    const i = neutralInput();
    assert.equal(i.moveX, 0);
    assert.equal(i.moveZ, 0);
    assert.equal(i.jump, false);
    assert.equal(i.crouch, false);
});

// ── integrateMovement: velocity decay ────────────────────────────────

test('integrateMovement: standing still on ground decays velocity to ~0', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.vx = 3.0; s.vz = -2.0; s.onGround = true; s.y = 0;
    const dt = 1 / 60;
    // Pump enough ticks to fully decay (friction = 12, so a few seconds).
    for (let i = 0; i < 600; i++) {
        integrateMovement(s, neutralInput(), dt);
    }
    assert.ok(Math.abs(s.vx) < 1e-3, `expected vx ≈ 0, got ${s.vx}`);
    assert.ok(Math.abs(s.vz) < 1e-3, `expected vz ≈ 0, got ${s.vz}`);
});

// ── integrateMovement: forward walking ───────────────────────────────

test('integrateMovement: walking forward advances position monotonically', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.x = 0; s.z = 0; s.y = 0;
    // Aim straight at +X so the path is clear of cover.
    // forward = (-sin(yaw), -cos(yaw)); yaw=-π/2 → forward = (1, 0).
    // lookYaw is absolute in the protocol, so set it on the INPUT (not
    // state.yaw, which integrateMovement would overwrite).
    const input = { ...neutralInput(), moveZ: 1, lookYaw: -Math.PI / 2 };

    let prevX = s.x;
    let advancedTicks = 0;
    for (let i = 0; i < 60; i++) {
        integrateMovement(s, input, 1 / 60);
        if (s.x > prevX) advancedTicks += 1;
        prevX = s.x;
    }
    // After a second of forward walk we should have advanced ~maxSpeed
    // meters (4.5). Don't pin too tight — just monotonic and meaningful.
    assert.ok(s.x > 3, `expected forward progress > 3m, got ${s.x}`);
    assert.ok(advancedTicks > 55, `expected near-monotonic advance, got ${advancedTicks}/60`);
});

test('integrateMovement: maxSpeed cap respected (steady-state |v| ≈ maxSpeed)', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.x = 0; s.z = 0; s.y = 0;
    const input = { ...neutralInput(), moveZ: 1, lookYaw: -Math.PI / 2 };
    for (let i = 0; i < 120; i++) integrateMovement(s, input, 1 / 60);
    const speed = Math.hypot(s.vx, s.vz);
    assert.ok(speed > 4.0, `steady-state speed too slow: ${speed}`);
    assert.ok(speed < 5.0, `steady-state speed too fast: ${speed}`);
});

// ── Arena clamping ───────────────────────────────────────────────────

test('resolveCollision: clamps inside outer arena rectangle', () => {
    const s = {
        x: 9999, y: 0, z: 9999,
        vx: 0, vy: 0, vz: 0,
        yaw: 0, pitch: 0, onGround: true, crouching: false,
    };
    resolveCollision(s);
    const r = MOVEMENT_TUNING.capsuleRadius;
    assert.ok(s.x <= ARENA_BOUNDS.mainMaxX - r + 1e-9);
    assert.ok(s.z <= ARENA_BOUNDS.mainMaxZ - r + 1e-9);
});

test('integrateMovement: walking into outer wall stops at wall', () => {
    const s = spawnStateForSlot('1v1', 1); // blue, near +X corner
    // forward = +X toward wall
    const input = { ...neutralInput(), moveZ: 1, lookYaw: -Math.PI / 2 };
    for (let i = 0; i < 120; i++) integrateMovement(s, input, 1 / 60);
    const r = MOVEMENT_TUNING.capsuleRadius;
    assert.ok(s.x <= ARENA_BOUNDS.mainMaxX - r + 1e-6,
        `expected stopped at wall, got x=${s.x}`);
});

// ── Cover boxes ──────────────────────────────────────────────────────

test('resolveCollision: pushes player out of a cover box', () => {
    const box = COVER_BOXES[0];
    // Drop the player slightly inside the box.
    const s = {
        x: (box.minX + box.maxX) / 2,
        y: 0,
        z: (box.minZ + box.maxZ) / 2,
        vx: 0, vy: 0, vz: 0,
        yaw: 0, pitch: 0, onGround: true, crouching: false,
    };
    resolveCollision(s);
    const r = MOVEMENT_TUNING.capsuleRadius;
    const stillInside =
        (s.x + r) > box.minX && (s.x - r) < box.maxX &&
        (s.z + r) > box.minZ && (s.z - r) < box.maxZ;
    assert.equal(stillInside, false, 'expected to be pushed out of cover box');
});

// ── Gravity + jump ───────────────────────────────────────────────────

test('integrateMovement: gravity pulls airborne player downward', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.y = 5; s.onGround = false;
    integrateMovement(s, neutralInput(), 1 / 60);
    assert.ok(s.vy < 0, `expected downward vy after gravity, got ${s.vy}`);
});

test('integrateMovement: jump on ground gives upward impulse + lifts off', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.y = 0; s.onGround = true;
    integrateMovement(s, { ...neutralInput(), jump: true }, 1 / 60);
    assert.ok(s.y > 0, `expected y > 0 after jump, got ${s.y}`);
    assert.ok(s.vy > 0, `expected upward vy after jump, got ${s.vy}`);
    assert.equal(s.onGround, false);
});

test('integrateMovement: dropped from height eventually lands (onGround true, y=0)', () => {
    const s = spawnStateForSlot('1v1', 0);
    s.y = 10; s.onGround = false;
    for (let i = 0; i < 120; i++) integrateMovement(s, neutralInput(), 1 / 60);
    assert.equal(s.y, 0);
    assert.equal(s.onGround, true);
});

// ── Look ─────────────────────────────────────────────────────────────

test('integrateMovement: yaw/pitch propagate from input', () => {
    const s = spawnStateForSlot('1v1', 0);
    integrateMovement(s, { ...neutralInput(), lookYaw: 1.23, lookPitch: -0.4 }, 1 / 60);
    assert.equal(s.yaw, 1.23);
    assert.equal(s.pitch, -0.4);
});

// ── Sanity: SPAWN_POSITIONS_BY_SLOT shape ────────────────────────────

test('SPAWN_POSITIONS_BY_SLOT: 1v1 has exactly 2 entries, 2v2 has 4', () => {
    assert.equal(SPAWN_POSITIONS_BY_SLOT['1v1'].length, 2);
    assert.equal(SPAWN_POSITIONS_BY_SLOT['2v2'].length, 4);
});
