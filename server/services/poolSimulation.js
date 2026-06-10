/**
 * Pool Simulation Service — server-authoritative shot adjudication.
 *
 * Exposes the pure sim core (services/pool/sim/) over a higher-level API
 * that:
 *   - validates inputs from clients
 *   - applies safety caps (max ticks, max ball count)
 *   - returns SimulationResult with a small wire-friendly shape
 *
 * V2.β will wire this into the socket handler so that match-in-progress
 * shots get adjudicated here before being broadcast. For now this is
 * stateless — caller provides initialBalls + shotParams, we return the
 * result. The PoolMatch integration (loading current state, persisting
 * result back) is the V2.β piece.
 *
 * Anti-cheat property: client cannot lie about ball positions because
 * server runs the SAME stepWorld() the client browser runs. Any client
 * that reports a different outcome to the same input will be flagged
 * by post-shot verification.
 */

import { simulateShot } from './pool/sim/simulate.js';
import { DEFAULT_MAX_TICKS, DEFAULT_PHYSICS_CONFIG } from './pool/sim/types.js';

// ──────────────────────────────────────────────────────────────────────
// Safety caps
// ──────────────────────────────────────────────────────────────────────

const MAX_BALL_COUNT = 32;
const MAX_POCKET_COUNT = 12;
const ALLOWED_BALL_COLORS = new Set(['white', 'red', 'yellow', 'black']);

// ──────────────────────────────────────────────────────────────────────
// Default table (matches browser game's geometry)
// ──────────────────────────────────────────────────────────────────────

// Synced 2026-06-10 to the LIVE Side Pocket table (The-Arcade pool
// game.config.ts table block). The previous defaults were the legacy
// 1422×720 import-era geometry — server adjudication ran on a
// different table than the one players see. Includes the pocket-mouth
// fields so the sim's cushion gaps match the rendered cushions.
export const DEFAULT_TABLE_CONFIG = Object.freeze({
  width: 1500,
  height: 825,
  cushionWidth: 78,
  pocketsPositions: Object.freeze([
    Object.freeze({ x: 62, y: 62 }),     // TL
    Object.freeze({ x: 750, y: 56 }),    // top-side
    Object.freeze({ x: 1438, y: 62 }),   // TR
    Object.freeze({ x: 62, y: 763 }),    // BL
    Object.freeze({ x: 750, y: 769 }),   // bottom-side
    Object.freeze({ x: 1438, y: 763 })   // BR
  ]),
  pocketRadius: 34,   // synced to client GameConfig 2026-06-10 (was 42 — "pockets too large")
  woodSeamInset: 48,
  jawChamfer: 30,
  pocketRim: 6
});

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Validate a SerializableBall payload from a client.
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateBall(b, idx) {
  if (!b || typeof b !== 'object') return { ok: false, reason: `balls[${idx}] not an object` };
  if (typeof b.id !== 'number' || !Number.isInteger(b.id)) {
    return { ok: false, reason: `balls[${idx}].id must be an integer` };
  }
  if (!ALLOWED_BALL_COLORS.has(b.color)) {
    return { ok: false, reason: `balls[${idx}].color must be one of ${[...ALLOWED_BALL_COLORS].join('|')}` };
  }
  if (!b.position || !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) {
    return { ok: false, reason: `balls[${idx}].position.{x,y} must be finite numbers` };
  }
  if (!b.velocity || !Number.isFinite(b.velocity.x) || !Number.isFinite(b.velocity.y)) {
    return { ok: false, reason: `balls[${idx}].velocity.{x,y} must be finite numbers` };
  }
  if (!Number.isFinite(b.spinX) || !Number.isFinite(b.spinY)) {
    return { ok: false, reason: `balls[${idx}].spin{X,Y} must be finite numbers` };
  }
  if (typeof b.visible !== 'boolean') {
    return { ok: false, reason: `balls[${idx}].visible must be boolean` };
  }
  return { ok: true };
}

/**
 * Validate ShotParams payload from a client.
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateShotParams(p) {
  if (!p || typeof p !== 'object') return { ok: false, reason: 'shotParams not an object' };
  if (!Number.isFinite(p.power) || p.power < 0 || p.power > 1000) {
    return { ok: false, reason: 'shotParams.power must be 0..1000' };
  }
  if (!Number.isFinite(p.angle)) {
    return { ok: false, reason: 'shotParams.angle must be a finite number (radians)' };
  }
  if (!Number.isFinite(p.spinX) || p.spinX < -1 || p.spinX > 1) {
    return { ok: false, reason: 'shotParams.spinX must be in [-1, +1]' };
  }
  if (!Number.isFinite(p.spinY) || p.spinY < -1 || p.spinY > 1) {
    return { ok: false, reason: 'shotParams.spinY must be in [-1, +1]' };
  }
  return { ok: true };
}

/**
 * Validate (optional) TableConfig from a client. Falls back to default.
 * @returns {{ ok: boolean, reason?: string, config?: TableConfig }}
 */
function validateTableConfig(t) {
  if (t === undefined || t === null) return { ok: true, config: DEFAULT_TABLE_CONFIG };
  if (typeof t !== 'object') return { ok: false, reason: 'tableConfig not an object' };
  if (!Number.isFinite(t.width) || t.width <= 0) return { ok: false, reason: 'tableConfig.width must be positive' };
  if (!Number.isFinite(t.height) || t.height <= 0) return { ok: false, reason: 'tableConfig.height must be positive' };
  if (!Number.isFinite(t.cushionWidth) || t.cushionWidth < 0) return { ok: false, reason: 'tableConfig.cushionWidth must be ≥ 0' };
  if (!Number.isFinite(t.pocketRadius) || t.pocketRadius <= 0) return { ok: false, reason: 'tableConfig.pocketRadius must be positive' };
  if (!Array.isArray(t.pocketsPositions) || t.pocketsPositions.length === 0 || t.pocketsPositions.length > MAX_POCKET_COUNT) {
    return { ok: false, reason: `tableConfig.pocketsPositions must be 1..${MAX_POCKET_COUNT}` };
  }
  for (let i = 0; i < t.pocketsPositions.length; i++) {
    const p = t.pocketsPositions[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { ok: false, reason: `tableConfig.pocketsPositions[${i}].{x,y} must be finite numbers` };
    }
  }
  return { ok: true, config: t };
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Simulate a shot — top-level service entry. Validates inputs, runs the
 * sim, returns either the result or a structured error.
 *
 * @param {object} params
 * @param {SerializableBall[]} params.initialBalls
 * @param {ShotParams} params.shotParams
 * @param {TableConfig} [params.tableConfig]   - defaults to DEFAULT_TABLE_CONFIG
 * @param {PhysicsConfig} [params.physicsConfig] - defaults to DEFAULT_PHYSICS_CONFIG
 * @param {number} [params.maxTicks]
 * @returns {{ ok: boolean, result?: SimulationResult, reason?: string }}
 */
export function simulateShotForClient({
  initialBalls,
  shotParams,
  tableConfig,
  physicsConfig,
  maxTicks
}) {
  // Input validation
  if (!Array.isArray(initialBalls)) {
    return { ok: false, reason: 'initialBalls must be an array' };
  }
  if (initialBalls.length === 0) {
    return { ok: false, reason: 'initialBalls must not be empty' };
  }
  if (initialBalls.length > MAX_BALL_COUNT) {
    return { ok: false, reason: `initialBalls length ${initialBalls.length} exceeds cap ${MAX_BALL_COUNT}` };
  }
  for (let i = 0; i < initialBalls.length; i++) {
    const v = validateBall(initialBalls[i], i);
    if (!v.ok) return { ok: false, reason: v.reason };
  }

  const shotV = validateShotParams(shotParams);
  if (!shotV.ok) return { ok: false, reason: shotV.reason };

  const tableV = validateTableConfig(tableConfig);
  if (!tableV.ok) return { ok: false, reason: tableV.reason };
  const table = tableV.config;

  const physics = physicsConfig || DEFAULT_PHYSICS_CONFIG;
  const cap = Number.isFinite(maxTicks) && maxTicks > 0 ? Math.min(maxTicks, DEFAULT_MAX_TICKS) : DEFAULT_MAX_TICKS;

  // Run the sim
  const result = simulateShot(initialBalls, shotParams, table, physics, cap);

  return { ok: true, result };
}

/**
 * Constants exposed for callers + tests.
 */
export const POOL_SIMULATION_CONSTANTS = Object.freeze({
  MAX_BALL_COUNT,
  MAX_POCKET_COUNT,
  ALLOWED_BALL_COLORS: [...ALLOWED_BALL_COLORS]
});

export default {
  simulateShotForClient,
  DEFAULT_TABLE_CONFIG,
  POOL_SIMULATION_CONSTANTS
};
