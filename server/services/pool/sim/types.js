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
 * @property {number} [woodSeamInset]  Pocket-mouth geometry: wood-seam inset (default 48, matches render FELT_INSET)
 * @property {number} [jawChamfer]     Chamfer miter wood-seam → playing face (default 30)
 * @property {number} [pocketRim]      Visible hole lip beyond pocketRadius (default 6)
 */

/**
 * @typedef {Object} PhysicsConfig
 * @property {number} friction          LEGACY — unused by stepWorld since the two-regime refactor
 * @property {number} slidingDecel      px/tick² while sliding/skidding (Han 2005 μ_s regime)
 * @property {number} rollingDecel      px/tick² while rolling (μ_r regime, ~20× smaller)
 * @property {number} rollSlipThreshold |v| below this = pure rolling
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

/**
 * @type {PhysicsConfig}
 * Synced 2026-06-10 to the LIVE game's tuning (The-Arcade pool
 * game.config.ts physics + ball blocks) — two-regime constant decel,
 * 38px balls. The previous defaults here were the original exponential
 * generation and made server adjudication disagree with every client
 * shot.
 */
export const DEFAULT_PHYSICS_CONFIG = Object.freeze({
  friction: 0.018,            // legacy, unused by stepWorld
  slidingDecel: 1.2,
  rollingDecel: 0.06,
  rollSlipThreshold: 15,
  collisionLoss: 0.018,
  ballDiameter: 38,
  minVelocityLength: 0.05
});

export const DEFAULT_MAX_TICKS = 5000;
