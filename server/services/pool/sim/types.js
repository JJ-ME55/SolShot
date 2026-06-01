/**
 * Pool sim type constants (Node port).
 *
 * MUST stay byte-equivalent to The-Arcade-git/pool/src/sim/types.ts.
 *
 * JSDoc types here document the shape only; runtime values are the
 * shared constants below.
 */

/**
 * @typedef {'white'|'red'|'yellow'|'black'} BallColor
 */

/**
 * @typedef {Object} IVec2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} SerializableBall
 * @property {number} id
 * @property {BallColor} color
 * @property {IVec2} position
 * @property {IVec2} velocity
 * @property {number} spinX
 * @property {number} spinY
 * @property {boolean} visible
 */

/**
 * @typedef {Object} ShotParams
 * @property {number} power
 * @property {number} angle
 * @property {number} spinX
 * @property {number} spinY
 */

/**
 * @typedef {Object} TableConfig
 * @property {number} width
 * @property {number} height
 * @property {number} cushionWidth
 * @property {IVec2[]} pocketsPositions
 * @property {number} pocketRadius
 */

/**
 * @typedef {Object} PhysicsConfig
 * @property {number} friction
 * @property {number} collisionLoss
 * @property {number} ballDiameter
 * @property {number} minVelocityLength
 */

/**
 * @typedef {'top'|'bottom'|'left'|'right'} CushionId
 */

/**
 * @typedef {'cushion_hit'|'ball_collision'|'pocket_drop'|'cue_ball_potted'|'eight_ball_potted'|'simulation_complete'} ShotEventType
 */

/**
 * @typedef {Object} ShotEvent
 * @property {ShotEventType} type
 * @property {number} atTick
 * @property {CushionId} [cushion]
 * @property {number} [ballId]
 * @property {number} [otherBallId]
 * @property {number} [pocketIdx]
 */

/**
 * @typedef {Object} SimulationResult
 * @property {SerializableBall[]} finalBalls
 * @property {ShotEvent[]} events
 * @property {number} ticks
 * @property {boolean} truncated
 * @property {BallColor|null} firstCollidedBallColor
 * @property {number[]} pocketedBallIds
 */

/** @type {PhysicsConfig} */
export const DEFAULT_PHYSICS_CONFIG = Object.freeze({
  friction: 0.018,
  collisionLoss: 0.018,
  ballDiameter: 32,
  minVelocityLength: 0.05
});

export const DEFAULT_MAX_TICKS = 5000;
