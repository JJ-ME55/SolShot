/**
 * Pure pool simulation world (Node port).
 *
 * MUST stay logic-equivalent to The-Arcade-git/pool/src/sim/world.ts.
 * Fixture test in server/scripts/smoke-pool-simulation.mjs verifies
 * results match the browser sim for reference shots.
 *
 * Synced 2026-06-10 to the browser sim's current generation:
 *   - two-regime constant-decel friction (sliding/rolling, Han 2005)
 *     replacing the original exponential damping
 *   - pocket-MOUTH geometry replacing radial pocket checks: cushion
 *     segments have gaps at the pockets (matching the rendered table),
 *     with jaw bounces, depth capture, and rest rules
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

function nextPosition(ball) {
  // Prediction without decel — cushion detection needs where the ball
  // WILL be; deceleration is applied in the advance phase.
  return vAdd(ball.position, ball.velocity);
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
  // TRUE radius capture — centre over the hole. Approach behaviour is
  // handled by the mouth geometry below; capture stays honest.
  for (let i = 0; i < table.pocketsPositions.length; i++) {
    if (vDist(pos, table.pocketsPositions[i]) <= table.pocketRadius) {
      return { hit: true, pocketIdx: i };
    }
  }
  return { hit: false, pocketIdx: -1 };
}

// ──────────────────────────────────────────────────────────────────────
// Pocket-mouth geometry — mirrors the rendered table: each rail is a
// cushion SEGMENT with a GAP at each adjacent pocket. Gap endpoints land
// where the pocket circle crosses the wood-seam line (Pythagoras),
// extended by the chamfer miter to the playing face.
// ──────────────────────────────────────────────────────────────────────

const DEFAULT_WOOD_SEAM_INSET = 48;
const DEFAULT_JAW_CHAMFER = 30;
const DEFAULT_POCKET_RIM = 6;

/**
 * Pocket mouths along one rail. Corner pockets contribute a mouth to
 * BOTH adjacent rails.
 * @returns {Array<{pocketIdx: number, lo: number, hi: number}>}
 */
export function railMouths(rail, table) {
  const seamInset = table.woodSeamInset ?? DEFAULT_WOOD_SEAM_INSET;
  const chamfer = table.jawChamfer ?? DEFAULT_JAW_CHAMFER;
  const mouths = [];
  for (let i = 0; i < table.pocketsPositions.length; i++) {
    const p = table.pocketsPositions[i];
    let onRail = false;
    let seam = 0;
    let perp = 0;
    let along = 0;
    switch (rail) {
      case 'top':
        onRail = p.y <= table.cushionWidth;
        seam = seamInset; perp = p.y; along = p.x;
        break;
      case 'bottom':
        onRail = p.y >= table.height - table.cushionWidth;
        seam = table.height - seamInset; perp = p.y; along = p.x;
        break;
      case 'left':
        onRail = p.x <= table.cushionWidth;
        seam = seamInset; perp = p.x; along = p.y;
        break;
      case 'right':
        onRail = p.x >= table.width - table.cushionWidth;
        seam = table.width - seamInset; perp = p.x; along = p.y;
        break;
    }
    if (!onRail) continue;
    const d = seam - perp;
    const chord = Math.sqrt(Math.max(0, table.pocketRadius * table.pocketRadius - d * d));
    const halfGap = chord + chamfer;
    mouths.push({ pocketIdx: i, lo: along - halfGap, hi: along + halfGap });
  }
  return mouths;
}

/** The mouth containing `lateral` on `rail`, or null if the rail is solid there. */
export function mouthAt(rail, lateral, table) {
  const mouths = railMouths(rail, table);
  for (const m of mouths) {
    if (lateral >= m.lo && lateral <= m.hi) return m;
  }
  return null;
}

/** Pot a ball: hide it, zero its motion, emit the standard event trio. */
function potBall(ball, events, tick, pocketIdx) {
  ball.visible = false;
  ball.velocity = { x: 0, y: 0 };
  ball.spinX = 0;
  ball.spinY = 0;
  events.push({ type: 'pocket_drop', atTick: tick, ballId: ball.id, pocketIdx });
  if (ball.color === 'white') {
    events.push({ type: 'cue_ball_potted', atTick: tick, ballId: ball.id });
  } else if (ball.color === 'black') {
    events.push({ type: 'eight_ball_potted', atTick: tick, ballId: ball.id });
  }
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
  const next = nextPosition(ball);
  let collided = false;

  // Per-rail: reflect only where the cushion segment actually exists.
  // If the crossing point falls inside a pocket mouth there is no rail
  // there — the ball sails into the mouth and the pocket-region pass
  // takes over (capture, jaw bounce, or drop-at-rest).
  const tryRail = (rail, beyond, lateral) => {
    if (!beyond) return;
    if (mouthAt(rail, lateral, table)) return;
    handleCushion(ball, rail, table, physics);
    events.push({ type: 'cushion_hit', atTick: tick, cushion: rail, ballId: ball.id });
    collided = true;
  };

  tryRail('top', isOutsideTopBorder(next, table, physics.ballDiameter), next.x);
  tryRail('left', isOutsideLeftBorder(next, table, physics.ballDiameter), next.y);
  tryRail('right', isOutsideRightBorder(next, table, physics.ballDiameter), next.y);
  tryRail('bottom', isOutsideBottomBorder(next, table, physics.ballDiameter), next.x);

  if (collided) {
    ball.velocity = vMul(ball.velocity, 1 - physics.collisionLoss);
  }
}

// ──────────────────────────────────────────────────────────────────────
// Pocket region — depth capture, jaw bounces, emergency clamp.
// Runs after position advance for any ball beyond a rail line.
// ──────────────────────────────────────────────────────────────────────

function resolvePocketRegion(ball, table, physics, events, tick) {
  const ballR = physics.ballDiameter / 2;
  const minX = table.cushionWidth + ballR;
  const maxX = table.width - table.cushionWidth - ballR;
  const minY = table.cushionWidth + ballR;
  const maxY = table.height - table.cushionWidth - ballR;
  const jawInset = ballR * 0.5;
  const loss = 1 - physics.collisionLoss;

  const checks = [
    {
      rail: 'top',
      beyond: ball.position.y < minY,
      lateral: ball.position.x,
      depthCrossed: (p) => ball.position.y <= p.y,
      clampBack: () => {
        ball.position = { x: ball.position.x, y: minY };
        ball.velocity = { x: ball.velocity.x, y: Math.abs(ball.velocity.y) * loss };
      },
      jawReflect: (wall) => {
        ball.position = { x: wall, y: ball.position.y };
        ball.velocity = { x: -ball.velocity.x * loss, y: ball.velocity.y * loss };
      }
    },
    {
      rail: 'bottom',
      beyond: ball.position.y > maxY,
      lateral: ball.position.x,
      depthCrossed: (p) => ball.position.y >= p.y,
      clampBack: () => {
        ball.position = { x: ball.position.x, y: maxY };
        ball.velocity = { x: ball.velocity.x, y: -Math.abs(ball.velocity.y) * loss };
      },
      jawReflect: (wall) => {
        ball.position = { x: wall, y: ball.position.y };
        ball.velocity = { x: -ball.velocity.x * loss, y: ball.velocity.y * loss };
      }
    },
    {
      rail: 'left',
      beyond: ball.position.x < minX,
      lateral: ball.position.y,
      depthCrossed: (p) => ball.position.x <= p.x,
      clampBack: () => {
        ball.position = { x: minX, y: ball.position.y };
        ball.velocity = { x: Math.abs(ball.velocity.x) * loss, y: ball.velocity.y };
      },
      jawReflect: (wall) => {
        ball.position = { x: ball.position.x, y: wall };
        ball.velocity = { x: ball.velocity.x * loss, y: -ball.velocity.y * loss };
      }
    },
    {
      rail: 'right',
      beyond: ball.position.x > maxX,
      lateral: ball.position.y,
      depthCrossed: (p) => ball.position.x >= p.x,
      clampBack: () => {
        ball.position = { x: maxX, y: ball.position.y };
        ball.velocity = { x: -Math.abs(ball.velocity.x) * loss, y: ball.velocity.y };
      },
      jawReflect: (wall) => {
        ball.position = { x: ball.position.x, y: wall };
        ball.velocity = { x: ball.velocity.x * loss, y: -ball.velocity.y * loss };
      }
    }
  ];

  for (const c of checks) {
    if (!c.beyond) continue;
    const m = mouthAt(c.rail, c.lateral, table);
    if (!m) {
      // Emergency: beyond a rail line with no mouth (tunneled past a
      // jaw in one step) — snap back so rail territory is unreachable.
      c.clampBack();
      events.push({ type: 'cushion_hit', atTick: tick, cushion: c.rail, ballId: ball.id });
      continue;
    }
    const p = table.pocketsPositions[m.pocketIdx];
    if (c.depthCrossed(p)) {
      potBall(ball, events, tick, m.pocketIdx);
      return true;
    }
    // Jaw walls — only reflect when actually moving into the wall.
    const jawLo = m.lo + jawInset;
    const jawHi = m.hi - jawInset;
    const lateralVel = (c.rail === 'top' || c.rail === 'bottom') ? ball.velocity.x : ball.velocity.y;
    if (c.lateral < jawLo && lateralVel < 0) {
      c.jawReflect(jawLo);
      events.push({ type: 'cushion_hit', atTick: tick, cushion: c.rail, ballId: ball.id });
    } else if (c.lateral > jawHi && lateralVel > 0) {
      c.jawReflect(jawHi);
      events.push({ type: 'cushion_hit', atTick: tick, cushion: c.rail, ballId: ball.id });
    }
  }
  return false;
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
// Public API — single tick
// ──────────────────────────────────────────────────────────────────────

/**
 * Run a single physics tick over the world.
 * Mutates the ball objects in place. Pushes any events to the events array.
 *
 * @returns {boolean} true if any ball is still moving after this tick
 */
export function stepWorld(balls, table, physics, events, tick) {
  // Phase 1: cushion collisions (per ball, using predicted next position)
  for (const ball of balls) {
    if (!ball.visible) continue;
    if (vLen(ball.velocity) === 0) continue;
    resolveCushionCollisions(ball, table, physics, events, tick);
  }

  // Phase 2: ball-ball collisions (pairwise)
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

  // Phase 3: advance + two-regime constant-decel friction; pocket region;
  // dead-zone snap with rest rules.
  //   SLIDING — constant decel (skid phase, big decel)
  //   ROLLING — constant decel (long tail, ~20× smaller)
  // Transition when |v| drops below rollSlipThreshold (≈ 5/7·v_initial
  // for a clean no-spin strike — Han 2005 / Shepard).
  let anyMoving = false;
  for (const ball of balls) {
    if (!ball.visible) continue;
    const speed = vLen(ball.velocity);
    if (speed === 0) continue;

    const inSliding = speed > physics.rollSlipThreshold;
    const decel = inSliding ? physics.slidingDecel : physics.rollingDecel;
    const newSpeed = Math.max(0, speed - decel);
    if (newSpeed === 0) {
      ball.velocity = { x: 0, y: 0 };
    } else {
      ball.velocity = vMul(ball.velocity, newSpeed / speed);
    }

    ball.position = vAdd(ball.position, ball.velocity);

    const decayed = decaySpin(ball.spinX, ball.spinY);
    ball.spinX = decayed.spinX;
    ball.spinY = decayed.spinY;

    // Pocket capture — TRUE radius (centre over the hole).
    const pocketHit = isInsidePocket(ball.position, table);
    if (pocketHit.hit) {
      potBall(ball, events, tick, pocketHit.pocketIdx);
      continue;
    }

    // Mouth region — depth capture, jaw bounces, emergency clamp.
    if (resolvePocketRegion(ball, table, physics, events, tick)) {
      continue;
    }

    // Dead-zone snap + rest rules: a stopped ball cannot rest inside a
    // pocket mouth (beyond a rail line) nor with its centre over the
    // visible hole lip. A genuine jaws-hang on the felt stays.
    if (vLen(ball.velocity) < physics.minVelocityLength) {
      ball.velocity = { x: 0, y: 0 };
      ball.spinX = 0;
      ball.spinY = 0;

      const ballR = physics.ballDiameter / 2;
      const minXr = table.cushionWidth + ballR;
      const maxXr = table.width - table.cushionWidth - ballR;
      const minYr = table.cushionWidth + ballR;
      const maxYr = table.height - table.cushionWidth - ballR;

      let restPotIdx = -1;
      if (ball.position.y < minYr) {
        const m = mouthAt('top', ball.position.x, table);
        if (m) restPotIdx = m.pocketIdx;
      } else if (ball.position.y > maxYr) {
        const m = mouthAt('bottom', ball.position.x, table);
        if (m) restPotIdx = m.pocketIdx;
      }
      if (restPotIdx < 0 && ball.position.x < minXr) {
        const m = mouthAt('left', ball.position.y, table);
        if (m) restPotIdx = m.pocketIdx;
      } else if (restPotIdx < 0 && ball.position.x > maxXr) {
        const m = mouthAt('right', ball.position.y, table);
        if (m) restPotIdx = m.pocketIdx;
      }
      if (restPotIdx < 0) {
        const lipR = table.pocketRadius + (table.pocketRim ?? DEFAULT_POCKET_RIM);
        for (let i = 0; i < table.pocketsPositions.length; i++) {
          if (vDist(ball.position, table.pocketsPositions[i]) <= lipR) {
            restPotIdx = i;
            break;
          }
        }
      }
      if (restPotIdx >= 0) {
        potBall(ball, events, tick, restPotIdx);
      }
    } else {
      anyMoving = true;
    }
  }

  return anyMoving;
}
