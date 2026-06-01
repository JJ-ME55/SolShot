/**
 * Pool spin physics — pure helpers (Node port).
 *
 * MUST stay byte-equivalent to The-Arcade-git/pool/src/physics/spin.ts.
 * Both files are checked against the same fixture in the smoke test
 * (server/scripts/smoke-pool-simulation.mjs). If you change one, change
 * the other AND run both test suites.
 *
 * See the TS source for full design notes. Quick reference:
 *   spinX ∈ [-1,+1]  sidespin (english): - left, + right
 *   spinY ∈ [-1,+1]  top/back spin: - back (draw), + top (follow)
 *
 * Sign conventions (canvas: x right, y down):
 *   right english on top cushion → ball kicks right (+x)
 *   right english on bottom      → ball kicks left  (-x)
 *   right english on left  cushion → ball kicks up   (-y)
 *   right english on right       → ball kicks down (+y)
 */

export const SIDESPIN_CUSHION_TRANSFER = 0.30;
export const SIDESPIN_CUSHION_LOSS = 0.45;
export const SPIN_FOLLOWTHROUGH_FACTOR = 0.6;
export const SPINY_OBJECT_BALL_LOSS = 0.7;
export const SPIN_FRICTION = 0.012;
export const SPIN_DEAD_ZONE = 0.005;

/**
 * @param {number} s
 * @returns {number}
 */
export function clampSpinAxis(s) {
  if (s > 1) return 1;
  if (s < -1) return -1;
  return s;
}

/**
 * @param {number} spinX
 * @param {number} spinY
 * @returns {{ spinX: number, spinY: number }}
 */
export function decaySpin(spinX, spinY) {
  const sx = spinX * (1 - SPIN_FRICTION);
  const sy = spinY * (1 - SPIN_FRICTION);
  return {
    spinX: Math.abs(sx) < SPIN_DEAD_ZONE ? 0 : sx,
    spinY: Math.abs(sy) < SPIN_DEAD_ZONE ? 0 : sy
  };
}

/**
 * @param {'top'|'bottom'|'left'|'right'} cushion
 * @param {{ x: number, y: number }} velAfterReflect
 * @param {number} spinX
 * @returns {{ velocity: { x: number, y: number }, spinAfter: number }}
 */
export function applySidespinToCushionBounce(cushion, velAfterReflect, spinX) {
  if (spinX === 0) return { velocity: velAfterReflect, spinAfter: 0 };

  let kickX = 0;
  let kickY = 0;

  switch (cushion) {
    case 'top': {
      const normalSpeed = Math.abs(velAfterReflect.y);
      kickX = spinX * normalSpeed * SIDESPIN_CUSHION_TRANSFER;
      break;
    }
    case 'bottom': {
      const normalSpeed = Math.abs(velAfterReflect.y);
      kickX = -spinX * normalSpeed * SIDESPIN_CUSHION_TRANSFER;
      break;
    }
    case 'left': {
      const normalSpeed = Math.abs(velAfterReflect.x);
      kickY = -spinX * normalSpeed * SIDESPIN_CUSHION_TRANSFER;
      break;
    }
    case 'right': {
      const normalSpeed = Math.abs(velAfterReflect.x);
      kickY = spinX * normalSpeed * SIDESPIN_CUSHION_TRANSFER;
      break;
    }
  }

  const velocity = {
    x: velAfterReflect.x + kickX,
    y: velAfterReflect.y + kickY
  };
  const spinAfter = spinX * (1 - SIDESPIN_CUSHION_LOSS);
  return { velocity, spinAfter };
}

/**
 * @param {{ x: number, y: number }} cueVelAfterCollision
 * @param {{ x: number, y: number }} cueVelBeforeCollision
 * @param {number} spinY
 * @returns {{ velocity: { x: number, y: number }, spinAfter: number }}
 */
export function applyTopBackSpinToBallCollision(cueVelAfterCollision, cueVelBeforeCollision, spinY) {
  if (spinY === 0) return { velocity: cueVelAfterCollision, spinAfter: 0 };

  const preSpeed = Math.sqrt(
    cueVelBeforeCollision.x * cueVelBeforeCollision.x +
    cueVelBeforeCollision.y * cueVelBeforeCollision.y
  );
  if (preSpeed < 0.001) return { velocity: cueVelAfterCollision, spinAfter: 0 };

  const fwdX = cueVelBeforeCollision.x / preSpeed;
  const fwdY = cueVelBeforeCollision.y / preSpeed;

  const followMag = spinY * SPIN_FOLLOWTHROUGH_FACTOR * preSpeed;

  const velocity = {
    x: cueVelAfterCollision.x + fwdX * followMag,
    y: cueVelAfterCollision.y + fwdY * followMag
  };
  const spinAfter = spinY * (1 - SPINY_OBJECT_BALL_LOSS);
  return { velocity, spinAfter };
}
