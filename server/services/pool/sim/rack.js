/**
 * Standard 8-ball rack — server-side.
 *
 * Positions match the browser game's GameConfig (pool/src/game.config.ts
 * on The-Arcade arcade/8-ball-pool branch). Match these exactly or the
 * server's sim will produce different physics outcomes than the browser
 * would predict — defeating the whole point of the byte-equivalent
 * sim core.
 *
 * Ball IDs follow the convention in services/pool/sim/types.js:
 *   0      = cue ball (white)
 *   1-7    = first object group (the variable-name "redBalls" in the
 *            henshmi code, which holds Color.yellow balls)
 *   8      = black (the 8 ball)
 *   9-15   = second object group ("yellowBalls", Color.red)
 *
 * Browser game coordinate space: x=1500, y=825 — the standard table.
 */

/**
 * @returns {SerializableBall[]} fresh standard rack at break position
 */
export function getStandardRack() {
  // Yellow-group balls (id 1-7) — "redBallsPositions" in the browser config
  const yellowPositions = [
    { x: 1056, y: 433 },
    { x: 1090, y: 374 },
    { x: 1126, y: 393 },
    { x: 1126, y: 472 },
    { x: 1162, y: 335 },
    { x: 1162, y: 374 },
    { x: 1162, y: 452 }
  ];

  // Red-group balls (id 9-15) — "yellowBallsPositions" in the browser config
  const redPositions = [
    { x: 1022, y: 413 },
    { x: 1056, y: 393 },
    { x: 1090, y: 452 },
    { x: 1126, y: 354 },
    { x: 1126, y: 433 },
    { x: 1162, y: 413 },
    { x: 1162, y: 491 }
  ];

  const balls = [];

  // Cue ball
  balls.push(makeBall(0, 'white', 413, 413));

  // Yellow group (id 1-7)
  yellowPositions.forEach((p, i) => {
    balls.push(makeBall(1 + i, 'yellow', p.x, p.y));
  });

  // Eight ball
  balls.push(makeBall(8, 'black', 1090, 413));

  // Red group (id 9-15)
  redPositions.forEach((p, i) => {
    balls.push(makeBall(9 + i, 'red', p.x, p.y));
  });

  return balls;
}

function makeBall(id, color, x, y) {
  return {
    id,
    color,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    spinX: 0,
    spinY: 0,
    visible: true
  };
}

/**
 * @returns {TableConfig} the standard table geometry the server uses.
 *
 * Matches the browser's gameSize (1500, 825) and table.cushionWidth +
 * pockets layout. NOT the same as DEFAULT_TABLE_CONFIG (which is the
 * simplified 1422x720 used by tests). Use this for live matches.
 */
export function getStandardTableConfig() {
  // From the browser GameConfig — pocket positions read from
  // game.config.ts on arcade/8-ball-pool
  return {
    width: 1500,
    height: 825,
    cushionWidth: 26,
    pocketsPositions: [
      { x: 64, y: 64 },          // top-left
      { x: 750, y: 33 },         // top-mid
      { x: 1436, y: 64 },        // top-right
      { x: 64, y: 761 },         // bottom-left
      { x: 750, y: 792 },        // bottom-mid
      { x: 1436, y: 761 }        // bottom-right
    ],
    pocketRadius: 32
  };
}
