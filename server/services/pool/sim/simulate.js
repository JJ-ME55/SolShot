/**
 * Pool shot simulation — top-level entry (Node port).
 *
 * MUST stay byte-equivalent to The-Arcade-git/pool/src/sim/simulate.ts.
 *
 * This is the server's authoritative shot adjudication entry point.
 * Caller:
 *   1. Loads PoolMatch
 *   2. Builds initialBalls from current match state
 *   3. Receives ShotParams from client over socket
 *   4. Calls simulateShot(initialBalls, params, table, physics)
 *   5. Persists result, broadcasts to both clients
 */

import { DEFAULT_MAX_TICKS } from './types.js';
import { stepWorld } from './world.js';

/**
 * @param {SerializableBall[]} initialBalls
 * @param {ShotParams} shotParams
 * @param {TableConfig} table
 * @param {PhysicsConfig} physics
 * @param {number} [maxTicks]
 * @returns {SimulationResult}
 */
export function simulateShot(initialBalls, shotParams, table, physics, maxTicks = DEFAULT_MAX_TICKS) {
  // Defensive deep-clone
  const balls = initialBalls.map((b) => ({
    id: b.id,
    color: b.color,
    position: { x: b.position.x, y: b.position.y },
    velocity: { x: b.velocity.x, y: b.velocity.y },
    spinX: b.spinX,
    spinY: b.spinY,
    visible: b.visible
  }));

  const cueBall = balls.find((b) => b.color === 'white');
  if (!cueBall || !cueBall.visible) {
    return {
      finalBalls: balls,
      events: [{ type: 'simulation_complete', atTick: 0 }],
      ticks: 0,
      truncated: false,
      firstCollidedBallColor: null,
      pocketedBallIds: []
    };
  }

  cueBall.velocity = {
    x: shotParams.power * Math.cos(shotParams.angle),
    y: shotParams.power * Math.sin(shotParams.angle)
  };
  cueBall.spinX = clampUnit(shotParams.spinX);
  cueBall.spinY = clampUnit(shotParams.spinY);

  const events = [];
  let tick = 0;
  let truncated = false;

  while (tick < maxTicks) {
    const anyMoving = stepWorld(balls, table, physics, events, tick);
    tick++;
    if (!anyMoving) break;
  }
  if (tick >= maxTicks) truncated = true;

  events.push({ type: 'simulation_complete', atTick: tick });

  const firstCollidedBallColor = deriveFirstCollidedBallColor(events, balls);
  const pocketedBallIds = events
    .filter((e) => e.type === 'pocket_drop')
    .map((e) => e.ballId)
    .filter((id) => id !== undefined);

  return {
    finalBalls: balls,
    events,
    ticks: tick,
    truncated,
    firstCollidedBallColor,
    pocketedBallIds
  };
}

function clampUnit(s) {
  if (s > 1) return 1;
  if (s < -1) return -1;
  return s;
}

function deriveFirstCollidedBallColor(events, finalBalls) {
  const byId = new Map();
  for (const b of finalBalls) byId.set(b.id, b);

  for (const e of events) {
    if (e.type !== 'ball_collision') continue;
    if (e.ballId === undefined || e.otherBallId === undefined) continue;
    const a = byId.get(e.ballId);
    const b = byId.get(e.otherBallId);
    if (!a || !b) continue;
    if (a.color === 'white') return b.color;
    if (b.color === 'white') return a.color;
  }
  return null;
}
