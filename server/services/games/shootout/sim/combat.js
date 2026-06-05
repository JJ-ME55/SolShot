/**
 * Hitscan + bone-driven hitbox positioning.
 *
 * Port of c:\Users\jacob\fps-staking-game\src\engine\combat.ts.
 * Server-side authoritative hitscan: resolve which hitbox a ray hits given
 * the current bone-world-space positions of every player's skeleton.
 * Pure functions. No DOM, no Three.js — Vec3 is a plain {x,y,z}.
 *
 * MUST stay in sync with the client engine file. Bump SOURCE_COMMIT on every
 * re-sync from BillionaireBonkClub/shootout master.
 *
 * Port date: 2026-06-05.
 *
 * Notes:
 *  - Ray-vs-shape primitives + vec utilities are re-used from `./hitboxes.js`
 *    (source TS re-exports them from hitboxes.ts; the runtime port does the
 *    same — no duplication).
 *  - `computeHitNormal` is module-private (not exported in source); kept private
 *    here too. Coverage lives via `testHitscan` HitResult.hitNormal.
 *  - HitResult is the contract consumed by sim/damage.js's `applyDamage`. See
 *    @typedef below; required fields: targetId, zone, multiplier, armorProtected,
 *    isHeadshot. Extra fields (distance/hitPosition/hitNormal) are for VFX +
 *    bullet-trail rendering downstream.
 */

import {
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecNormalize,
  raySphereIntersect,
  rayCapsuleIntersect,
  rayBoxIntersect,
  createDefaultHitboxTemplate,
} from './hitboxes.js';

export const SOURCE_COMMIT = '69dad6bc099faee5551a26c882c07d52b3663c09'; // bump on every Fish-sync

// ========== TYPE DEFINITIONS (JSDoc) ==========

/**
 * @typedef {{ x: number, y: number, z: number }} Vec3
 * Plain 3-vector (NOT a Three.js Vector3).
 */

/**
 * @typedef {'head'|'chest'|'stomach'|'arm_l'|'arm_r'|'leg_l'|'leg_r'} HitboxZone
 */

/**
 * @typedef {Object} Hitbox
 * @property {HitboxZone} zone
 * @property {'sphere'|'box'|'capsule'} shape
 * @property {number} multiplier              - Damage multiplier (e.g. head=4.0)
 * @property {boolean} armorProtected         - Whether armor (or helmet for head) absorbs
 * @property {string} boneName                - Source bone in the skeleton
 * @property {Vec3} center                    - World-space center (updated each tick)
 * @property {Vec3} [offset]                  - Local offset from bone to hitbox center
 * @property {number} [radius]                - For sphere + capsule
 * @property {Vec3} [halfExtents]             - For box
 * @property {Vec3} [endA]                    - For capsule (start point)
 * @property {Vec3} [endB]                    - For capsule (end point)
 * @property {[number,number,number]} [rotation] - For box (euler xyz, optional)
 */

/**
 * @typedef {Hitbox[]} HitboxSet
 */

/**
 * @typedef {Object} HitResult
 * Shape consumed by sim/damage.js's `applyDamage(shooterId, hitResult, weaponConfig)`.
 * @property {string} targetId        - ID of player hit
 * @property {HitboxZone} zone        - Which body zone was hit
 * @property {number} multiplier      - Damage multiplier for that zone
 * @property {number} distance        - Distance from ray origin to hit point
 * @property {Vec3} hitPosition       - World position of impact
 * @property {Vec3} hitNormal         - Surface normal at impact (for particle direction)
 * @property {boolean} isHeadshot     - Convenience flag (zone === 'head')
 * @property {boolean} armorProtected - Whether this zone has armor coverage
 */

// ========== HITBOX SET MANAGEMENT ==========

/**
 * Creates a new hitbox set for a player using the default template.
 *
 * NOTE: `id` is currently unused (source matches) — kept in the signature so
 * future per-player customization (e.g. taller models, gender variants) lands
 * without breaking callers.
 *
 * @param {string} _id - Player id (unused; retained for signature parity)
 * @returns {HitboxSet} Fresh hitbox array
 */
export function createHitboxSet(_id) {
  return createDefaultHitboxTemplate();
}

/**
 * Updates hitbox positions based on current skeleton bone world transforms.
 * Mutates the hitboxSet in place.
 *
 * @param {HitboxSet} hitboxSet - The player's hitbox set to update
 * @param {Record<string, Vec3>} boneWorldPositions - Bone name -> world-space position
 * @returns {void}
 */
export function updateHitboxPositions(hitboxSet, boneWorldPositions) {
  for (const hitbox of hitboxSet) {
    const bonePos = boneWorldPositions[hitbox.boneName];
    if (!bonePos) continue; // Bone not found, skip

    const off = hitbox.offset;
    if (hitbox.shape === 'sphere') {
      // Sphere: center follows bone (+ optional offset, e.g. raise head to skull)
      hitbox.center = off ? vecAdd(bonePos, off) : { ...bonePos };
    } else if (hitbox.shape === 'box') {
      // Box: center follows bone (+ optional offset)
      hitbox.center = off ? vecAdd(bonePos, off) : { ...bonePos };
    } else if (hitbox.shape === 'capsule') {
      // Capsule: endA = bone position, endB = target bone position
      if (hitbox.zone === 'arm_l') {
        hitbox.endA = boneWorldPositions['UpperArm.L'] || hitbox.endA;
        hitbox.endB = boneWorldPositions['Hand.L'] || hitbox.endB;
        hitbox.center = hitbox.endA; // Center for distance sorting
      } else if (hitbox.zone === 'arm_r') {
        hitbox.endA = boneWorldPositions['UpperArm.R'] || hitbox.endA;
        hitbox.endB = boneWorldPositions['Hand.R'] || hitbox.endB;
        hitbox.center = hitbox.endA;
      } else if (hitbox.zone === 'leg_l') {
        // Thigh -> Foot so the capsule covers the full leg (hip through ankle),
        // not just hip-to-knee (Shin bone is at the knee).
        hitbox.endA = boneWorldPositions['Thigh.L'] || hitbox.endA;
        hitbox.endB = boneWorldPositions['Foot.L'] || boneWorldPositions['Shin.L'] || hitbox.endB;
        hitbox.center = hitbox.endA;
      } else if (hitbox.zone === 'leg_r') {
        hitbox.endA = boneWorldPositions['Thigh.R'] || hitbox.endA;
        hitbox.endB = boneWorldPositions['Foot.R'] || boneWorldPositions['Shin.R'] || hitbox.endB;
        hitbox.center = hitbox.endA;
      }
    }
  }
}

// ========== HITSCAN TESTING ==========

/**
 * Tests hitscan ray against all targets' hitboxes.
 *
 * Algorithm:
 *  1. For each target (excluding shooter), test ray vs every hitbox.
 *  2. ARM-PENETRATION: if any target has BOTH an arm hit and a torso hit,
 *     discard the arm hits (arms are "transparent" to torso shots).
 *  3. Return the closest surviving hit across all targets.
 *
 * @param {Vec3} rayOrigin                                - Ray origin (camera position)
 * @param {Vec3} rayDir                                   - Ray direction (must be normalized)
 * @param {{ id: string, hitboxes: HitboxSet }[]} targets - Candidate targets
 * @param {string} [shooterId]                            - Shooter id (skip own hitboxes)
 * @returns {HitResult|null}                              - Closest hit, or null if no hit
 */
export function testHitscan(rayOrigin, rayDir, targets, shooterId) {
  // Collect all hits per target
  /** @type {Map<string, { hitbox: Hitbox, distance: number, position: Vec3 }[]>} */
  const targetHits = new Map();

  for (const target of targets) {
    // Skip shooter (prevent self-hit)
    if (shooterId && target.id === shooterId) continue;

    /** @type {{ hitbox: Hitbox, distance: number, position: Vec3 }[]} */
    const hits = [];

    for (const hitbox of target.hitboxes) {
      /** @type {number|null} */
      let distance = null;

      if (hitbox.shape === 'sphere' && hitbox.radius !== undefined) {
        distance = raySphereIntersect(rayOrigin, rayDir, hitbox.center, hitbox.radius);
      } else if (hitbox.shape === 'capsule' && hitbox.endA && hitbox.endB && hitbox.radius !== undefined) {
        distance = rayCapsuleIntersect(rayOrigin, rayDir, hitbox.endA, hitbox.endB, hitbox.radius);
      } else if (hitbox.shape === 'box' && hitbox.halfExtents) {
        distance = rayBoxIntersect(rayOrigin, rayDir, hitbox.center, hitbox.halfExtents, hitbox.rotation);
      }

      if (distance !== null) {
        const position = vecAdd(rayOrigin, vecScale(rayDir, distance));
        hits.push({ hitbox, distance, position });
      }
    }

    if (hits.length > 0) {
      targetHits.set(target.id, hits);
    }
  }

  // ARM PENETRATION: For each target, if arm hit exists AND torso hit exists, discard arm hits
  targetHits.forEach((hits, targetId) => {
    const armHits = hits.filter((h) => h.hitbox.zone === 'arm_l' || h.hitbox.zone === 'arm_r');
    const torsoHits = hits.filter((h) => h.hitbox.zone === 'chest' || h.hitbox.zone === 'stomach');

    if (armHits.length > 0 && torsoHits.length > 0) {
      // Remove arm hits - arms are "transparent" to torso shots
      const filteredHits = hits.filter((h) => h.hitbox.zone !== 'arm_l' && h.hitbox.zone !== 'arm_r');
      targetHits.set(targetId, filteredHits);
    }
  });

  // Find closest hit across all targets
  /** @type {{ targetId: string, hitbox: Hitbox, distance: number, position: Vec3 }|null} */
  let closestHit = null;
  let closestDist = Infinity;

  targetHits.forEach((hits, targetId) => {
    for (const hit of hits) {
      if (hit.distance < closestDist) {
        closestDist = hit.distance;
        closestHit = { targetId, ...hit };
      }
    }
  });

  if (!closestHit) return null;

  // Compute hit normal based on shape
  const hitNormal = computeHitNormal(closestHit.hitbox, closestHit.position, rayDir);

  return {
    targetId: closestHit.targetId,
    zone: closestHit.hitbox.zone,
    multiplier: closestHit.hitbox.multiplier,
    distance: closestHit.distance,
    hitPosition: closestHit.position,
    hitNormal,
    isHeadshot: closestHit.hitbox.zone === 'head',
    armorProtected: closestHit.hitbox.armorProtected,
  };
}

/**
 * Computes surface normal at hit point based on hitbox shape.
 * Module-private (source does not export this).
 *
 * @param {Hitbox} hitbox       - Hitbox that was struck
 * @param {Vec3} hitPosition    - World-space point of impact
 * @param {Vec3} rayDir         - Ray direction (used for fallback)
 * @returns {Vec3}              - Unit surface normal
 */
function computeHitNormal(hitbox, hitPosition, rayDir) {
  if (hitbox.shape === 'sphere') {
    // Sphere: normal = normalize(hitPoint - center)
    const normal = vecSub(hitPosition, hitbox.center);
    return vecNormalize(normal);
  } else if (hitbox.shape === 'capsule' && hitbox.endA && hitbox.endB) {
    // Capsule: perpendicular from axis to hit point
    const ab = vecSub(hitbox.endB, hitbox.endA);
    const ah = vecSub(hitPosition, hitbox.endA);
    const abDot = vecDot(ab, ab);
    const t = Math.max(0, Math.min(1, vecDot(ah, ab) / abDot));
    const closestOnAxis = vecAdd(hitbox.endA, vecScale(ab, t));
    const normal = vecSub(hitPosition, closestOnAxis);
    return vecNormalize(normal);
  } else if (hitbox.shape === 'box' && hitbox.halfExtents) {
    // Box: find face normal by determining which axis is closest to surface
    const localHit = vecSub(hitPosition, hitbox.center);
    const he = hitbox.halfExtents;

    // Find which face was hit (largest normalized distance)
    const dx = Math.abs(localHit.x / he.x);
    const dy = Math.abs(localHit.y / he.y);
    const dz = Math.abs(localHit.z / he.z);

    if (dx > dy && dx > dz) {
      // X face
      return { x: Math.sign(localHit.x), y: 0, z: 0 };
    } else if (dy > dz) {
      // Y face
      return { x: 0, y: Math.sign(localHit.y), z: 0 };
    } else {
      // Z face
      return { x: 0, y: 0, z: Math.sign(localHit.z) };
    }
  }

  // Fallback: reverse ray direction
  return vecScale(rayDir, -1);
}

/**
 * Tests ray against world geometry (placeholder).
 * Will be wired to Three.js Raycaster in Plan 05 on the client; server-side
 * will use the navmesh / world collision in a future checkpoint.
 *
 * @param {Vec3} _rayOrigin    - Ray origin
 * @param {Vec3} _rayDir       - Ray direction (normalized)
 * @param {number} _maxDistance - Max ray distance
 * @returns {{ position: Vec3, normal: Vec3 }|null} - Always null in the current port
 */
export function testEnvironmentHit(_rayOrigin, _rayDir, _maxDistance) {
  // Placeholder - will integrate with world collision in a later checkpoint
  return null;
}
