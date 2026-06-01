/**
 * Pure pool simulation world (Node port).
 *
 * MUST stay byte-equivalent to The-Arcade-git/pool/src/sim/world.ts.
 * Fixture test in server/scripts/smoke-pool-simulation.mjs verifies
 * results match the browser sim for reference shots.
 *
 * See the TS source for full design notes.
 */

import {
  applySidespinToCushionBounce,
  applyTopBackSpinToBallCollision,
  decaySpin
} from './spin.js';

// ──────────────────────────────────────────────────────────────────────
// Vector math helpers
// ──────────────────────────────────────────────────────────────────────

function vAdd(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function vSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function vMul(a, s) { return { x: a.x * s, y: a.y * s }; }
function vLen(a) { return Math.sqrt(a.x * a.x + a.y * a.y); }
function vDot(a, b) { return a.x * b.x + a.y * b.y; }
function vDist(a, b) {
  const dx = a.x - b.x; const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ──────────────────────────────────────────────────────────────────────
// Cushion + pocket helpers
// ──────────────────────────────────────────────────────────────────────

function nextPosition(ball, friction) {
  const v = vMul(ball.velocity, 1 - friction);
  return vAdd(ball.position, v);
}

function isOutsideTopBorder(pos, table, ballDiameter) {
  return pos.y - ballDiameter / 2 <= table.cushionWidth;
}
function isOutsideLeftBorder(pos, table, ballDiameter) {
  return pos.x - ballDiameter / 2 <= table.cushionWidth;
}
function isOutsideRightBorder(pos, table, ballDiameter) {
  return pos.x + ballDiameter / 2 >= table.width - table.cushionWidth;
}
function isOutsideBottomBorder(pos, table, ballDiameter) {
  return pos.y + ballDiameter / 2 >= table.height - table.cushionWidth;
}

function isInsidePocket(pos, table) {
  for (let i = 0; i < table.pocketsPositions.length; i++) {
    if (vDist(pos, table.pocketsPositions[i]) <= table.pocketRadius) {
      return { hit: true, pocketIdx: i };
    }
  }
  return { hit: false, pocketIdx: -1 };
}

// ──────────────────────────────────────────────────────────────────────
// Cushion collision
// ──────────────────────────────────────────────────────────────────────

function handleCushion(ball, cushion, table, physics) {
  switch (cushion) {
    case 'top':
      ball.position = {
        x: ball.position.x,
        y: ball.position.y + (table.cushionWidth - ball.position.y + physics.ballDiameter / 2)
      };
      ball.velocity = { x: ball.velocity.x, y: -ball.velocity.y };
      break;
    case 'left':
      ball.position = {
        x: ball.position.x + (table.cushionWidth - ball.position.x + physics.ballDiameter / 2),
        y: ball.position.y
      };
      ball.velocity = { x: -ball.velocity.x, y: ball.velocity.y };
      break;
    case 'right':
      ball.position = {
        x: ball.position.x + (table.width - table.cushionWidth - ball.position.x - physics.ballDiameter / 2),
        y: ball.position.y
      };
      ball.velocity = { x: -ball.velocity.x, y: ball.velocity.y };
      break;
    case 'bottom':
      ball.position = {
        x: ball.position.x,
        y: ball.position.y + (table.height - table.cushionWidth - ball.position.y - physics.ballDiameter / 2)
      };
      ball.velocity = { x: ball.velocity.x, y: -ball.velocity.y };
      break;
  }

  const r = applySidespinToCushionBounce(cushion, ball.velocity, ball.spinX);
  ball.velocity = r.velocity;
  ball.spinX = r.spinAfter;
}

function resolveCushionCollisions(ball, table, physics, events, tick) {
  const next = nextPosition(ball, physics.friction);
  let collided = false;

  if (isOutsideTopBorder(next, table, physics.ballDiameter)) {
    handleCushion(ball, 'top', table, physics);
    events.push({ type: 'cushion_hit', atTick: tick, cushion: 'top', ballId: ball.id });
    collided = true;
  }
  if (isOutsideLeftBorder(next, table, physics.ballDiameter)) {
    handleCushion(ball, 'left', table, physics);
    events.push({ type: 'cushion_hit', atTick: tick, cushion: 'left', ballId: ball.id });
    collided = true;
  }
  if (isOutsideRightBorder(next, table, physics.ballDiameter)) {
    handleCushion(ball, 'right', table, physics);
    events.push({ type: 'cushion_hit', atTick: tick, cushion: 'right', ballId: ball.id });
    collided = true;
  }
  if (isOutsideBottomBorder(next, table, physics.ballDiameter)) {
    handleCushion(ball, 'bottom', table, physics);
    events.push({ type: 'cushion_hit', atTick: tick, cushion: 'bottom', ballId: ball.id });
    collided = true;
  }

  if (collided) {
    ball.velocity = vMul(ball.velocity, 1 - physics.collisionLoss);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Ball-ball collision
// ──────────────────────────────────────────────────────────────────────

function resolveBallsCollision(first, second, physics) {
  if (!first.visible || !second.visible) return false;

  const n = vSub(first.position, second.position);
  const dist = vLen(n);
  if (dist > physics.ballDiameter) return false;

  const firstPre = { x: first.velocity.x, y: first.velocity.y };
  const secondPre = { x: second.velocity.x, y: second.velocity.y };

  const mtdFactor = (physics.ballDiameter - dist) / dist;
  const mtd = vMul(n, mtdFactor);
  first.position = vAdd(first.position, vMul(mtd, 0.5));
  second.position = vSub(second.position, vMul(mtd, 0.5));

  const un = vMul(n, 1 / dist);
  const ut = { x: -un.y, y: un.x };

  const v1n = vDot(un, first.velocity);
  const v1t = vDot(ut, first.velocity);
  const v2n = vDot(un, second.velocity);
  const v2t = vDot(ut, second.velocity);

  const v1nTag = vMul(un, v2n);
  const v1tTag = vMul(ut, v1t);
  const v2nTag = vMul(un, v1n);
  const v2tTag = vMul(ut, v2t);

  first.velocity = vAdd(v1nTag, v1tTag);
  second.velocity = vAdd(v2nTag, v2tTag);

  first.velocity = vMul(first.velocity, 1 - physics.collisionLoss);
  second.velocity = vMul(second.velocity, 1 - physics.collisionLoss);

  if (first.color === 'white' && first.spinY !== 0) {
    const r = applyTopBackSpinToBallCollision(first.velocity, firstPre, first.spinY);
    first.velocity = r.velocity;
    first.spinY = r.spinAfter;
  }
  if (second.color === 'white' && second.spinY !== 0) {
    const r = applyTopBackSpinToBallCollision(second.velocity, secondPre, second.spinY);
    second.velocity = r.velocity;
    second.spinY = r.spinAfter;
  }

  return true;
}

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

/**
 * Run a single physics tick over the world. Mutates balls in place,
 * pushes events to the events array.
 *
 * @param {SerializableBall[]} balls
 * @param {TableConfig} table
 * @param {PhysicsConfig} physics
 * @param {ShotEvent[]} events
 * @param {number} tick
 * @returns {boolean} true if any ball is still moving after this tick
 */
export function stepWorld(balls, table, physics, events, tick) {
  // Phase 1: cushion collisions
  for (const ball of balls) {
    if (!ball.visible) continue;
    if (vLen(ball.velocity) === 0) continue;
    resolveCushionCollisions(ball, table, physics, events, tick);
  }

  // Phase 2: ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.visible) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b.visible) continue;
      const collided = resolveBallsCollision(a, b, physics);
      if (collided) {
        events.push({
          type: 'ball_collision',
          atTick: tick,
          ballId: a.id,
          otherBallId: b.id
        });
      }
    }
  }

  // Phase 3: advance + friction + pocket + dead-zone
  let anyMoving = false;
  for (const ball of balls) {
    if (!ball.visible) continue;
    const speed = vLen(ball.velocity);
    if (speed === 0) continue;

    ball.velocity = vMul(ball.velocity, 1 - physics.friction);
    ball.position = vAdd(ball.position, ball.velocity);

    const decayed = decaySpin(ball.spinX, ball.spinY);
    ball.spinX = decayed.spinX;
    ball.spinY = decayed.spinY;

    const pocketHit = isInsidePocket(ball.position, table);
    if (pocketHit.hit) {
      ball.visible = false;
      ball.velocity = { x: 0, y: 0 };
      ball.spinX = 0;
      ball.spinY = 0;
      events.push({
        type: 'pocket_drop',
        atTick: tick,
        ballId: ball.id,
        pocketIdx: pocketHit.pocketIdx
      });
      if (ball.color === 'white') {
        events.push({ type: 'cue_ball_potted', atTick: tick, ballId: ball.id });
      } else if (ball.color === 'black') {
        events.push({ type: 'eight_ball_potted', atTick: tick, ballId: ball.id });
      }
      continue;
    }

    if (vLen(ball.velocity) < physics.minVelocityLength) {
      ball.velocity = { x: 0, y: 0 };
      ball.spinX = 0;
      ball.spinY = 0;
    } else {
      anyMoving = true;
    }
  }

  return anyMoving;
}
