/**
 * BattlefieldPreview — SVG visualization of a group-chat match in progress.
 *
 * Phase 1 visual context for group-chat — players need to SEE the
 * battlefield (terrain, where everyone is, wind direction) without
 * waiting for the full Phaser integration (Phase 2 follow-up).
 *
 * What it shows:
 *   - Terrain silhouette from match.terrainSnapshot (1D heightmap)
 *   - Each player's tank as a colored square at (currentX, currentY),
 *     scaled into the SVG viewport
 *   - Player labels (callsign + HP) above each tank
 *   - Wind direction arrow + magnitude in top-right
 *   - Active player highlighted with an orange ring
 *   - Eliminated players rendered greyscale + struck through
 *
 * When the viewer is the active player + has aim/power set, an optional
 * trajectoryPreview prop draws a faint dotted arc showing where their
 * shot is going to land. Math mirrors the server's calculateTrajectory
 * (angle - 90° rotation, gravity 300 px/s², wind horizontal accel).
 *
 * Coordinate space:
 *   - Source data is in 1200×800 (TERRAIN_WIDTH × TERRAIN_HEIGHT) coords
 *   - SVG viewBox preserves that, scales to fit container width
 *
 * Performance: pure-SVG (no canvas), re-renders on prop change. Heightmap
 * decimated to ~120 polyline points (every 10px) so the SVG path is
 * compact. Trajectory preview computed on each angle/power change but
 * caps at 200 simulated steps to prevent runaway loops.
 */

import React, { useMemo } from 'react';

const TERRAIN_W = 1200;
const TERRAIN_H = 800;

// Bg theme colors — mirror the client `_bgThemes` in scenes/main/index.js.
// Five distinct biomes; the duplicate "default = jungle" sixth entry was
// retired. Old matches with backgroundIndex=5 stored on the doc fall back
// to jungle via the (idx % length) modulo at the consumer.
const BG_THEMES = [
    { fill: '#0a1a0a', terrainTop: 'rgba(107,123,61,0.95)' },  // 0 jungle
    { fill: '#0a0f1a', terrainTop: 'rgba(190,200,210,0.95)' }, // 1 arctic
    { fill: '#1a140a', terrainTop: 'rgba(210,180,120,0.95)' }, // 2 desert
    { fill: '#0a0a0f', terrainTop: 'rgba(140,140,150,0.95)' }, // 3 moon
    { fill: '#1a0a0a', terrainTop: 'rgba(180,80,30,0.95)' },   // 4 volcanic
];

/** Decimate heightmap to a polyline path string. */
function buildTerrainPath(heightmap, step = 10) {
    if (!Array.isArray(heightmap) || heightmap.length === 0) return null;
    const pts = [];
    pts.push(`M0,${TERRAIN_H}`);
    pts.push(`L0,${heightmap[0]}`);
    for (let x = step; x < heightmap.length; x += step) {
        pts.push(`L${x},${heightmap[x]}`);
    }
    pts.push(`L${heightmap.length - 1},${heightmap[heightmap.length - 1]}`);
    pts.push(`L${heightmap.length - 1},${TERRAIN_H}`);
    pts.push('Z');
    return pts.join(' ');
}

/**
 * Predict trajectory points using Euler integration matching server's
 * calculateTrajectory in physics.js. Returns up to ~maxSteps points,
 * stops early if it exits the play area or hits ground.
 */
function predictTrajectory({ startX, startY, angle, power, wind = 0, gravity = 300, terrain, tanks }) {
    const POWER_FACTOR = 4; // matches server (need to verify — may be different constant)
    const PHYSICS_DT = 1 / 60;
    const MAX_STEPS = 200;

    const velocity = power * POWER_FACTOR;
    // Server's convention: rotation = angle - PI/2 (angle in radians)
    // Our slider uses degrees 0-180. Convert.
    const angleRad = (angle * Math.PI) / 180;
    const rotation = angleRad - Math.PI / 2;

    let vx = velocity * Math.cos(rotation);
    let vy = velocity * Math.sin(rotation);
    let x = startX;
    let y = startY;

    const points = [{ x, y }];
    for (let step = 0; step < MAX_STEPS; step++) {
        vy += gravity * PHYSICS_DT;
        vx += wind * PHYSICS_DT;
        x += vx * PHYSICS_DT;
        y += vy * PHYSICS_DT;
        points.push({ x, y });
        if (x <= 0 || x >= TERRAIN_W - 1) break;
        if (y >= TERRAIN_H) break;
        // Stop on terrain hit (rough check)
        if (terrain && Array.isArray(terrain)) {
            const ix = Math.floor(x);
            if (ix >= 0 && ix < terrain.length && y >= terrain[ix]) break;
        }
        // Stop on tank hit (rough — 32x32 hitbox)
        if (tanks && tanks.length > 0) {
            for (const t of tanks) {
                if (Math.abs(x - t.x) < 18 && Math.abs(y - t.y) < 14) {
                    return points;
                }
            }
        }
    }
    return points;
}

export default function BattlefieldPreview({
    match,
    myTgId,
    aim, // optional: { angle, power, weaponId } for trajectory preview
}) {
    const heightmap = match?.terrainSnapshot;
    const players = match?.players || [];
    const wind = match?.wind || 0;
    const bgIdx = match?.backgroundIndex ?? 0;
    const theme = BG_THEMES[bgIdx % BG_THEMES.length];

    const terrainPath = useMemo(() => buildTerrainPath(heightmap), [heightmap]);

    const myPlayer = players.find(p => p.telegramUserId === myTgId);
    const currentPlayer = players[match?.currentPlayerIndex];
    const isMyTurn = currentPlayer && currentPlayer.telegramUserId === myTgId;

    // Trajectory preview — only when it's my turn and aim is set
    const trajectoryPath = useMemo(() => {
        if (!isMyTurn || !aim || !myPlayer || !heightmap) return null;
        const tanksForCollision = players
            .filter(p => !p.eliminated && p.telegramUserId !== myTgId)
            .map(p => ({ x: p.currentX, y: p.currentY }));
        const pts = predictTrajectory({
            startX: myPlayer.currentX,
            startY: myPlayer.currentY,
            angle: aim.angle,
            power: aim.power,
            wind,
            terrain: heightmap,
            tanks: tanksForCollision,
        });
        if (pts.length < 2) return null;
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');
    }, [aim, myPlayer, heightmap, players, wind, isMyTurn, myTgId]);

    if (!heightmap || !terrainPath) {
        return (
            <div style={styles.empty}>
                <div style={styles.emptyText}>BATTLEFIELD LOADING…</div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.frame, background: theme.fill }}>
            <svg
                viewBox={`0 0 ${TERRAIN_W} ${TERRAIN_H}`}
                preserveAspectRatio="xMidYMax meet"
                style={styles.svg}
            >
                {/* Grid (subtle, top half) */}
                <defs>
                    <pattern id="bf-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                        <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(196,166,93,0.06)" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width={TERRAIN_W} height={TERRAIN_H} fill="url(#bf-grid)" />

                {/* Terrain silhouette — filled polygon */}
                <path d={terrainPath} fill={theme.terrainTop} stroke="rgba(0,0,0,0.4)" strokeWidth="1" />

                {/* Trajectory preview — dotted arc when aiming */}
                {trajectoryPath && (
                    <path
                        d={trajectoryPath}
                        fill="none"
                        stroke="rgba(255,176,90,0.8)"
                        strokeWidth="2"
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                    />
                )}

                {/* Tanks */}
                {players.map((p, i) => {
                    const x = p.currentX ?? 0;
                    const y = p.currentY ?? TERRAIN_H - 50;
                    const isCurrent = i === match?.currentPlayerIndex;
                    const isMe = p.telegramUserId === myTgId;
                    const elim = !!p.eliminated;
                    return (
                        <g key={p.telegramUserId} opacity={elim ? 0.35 : 1}>
                            {/* Active player ring */}
                            {isCurrent && !elim && (
                                <circle cx={x} cy={y} r={26} fill="none" stroke="rgba(255,122,26,0.9)" strokeWidth="3">
                                    <animate attributeName="r" values="22;30;22" dur="1.5s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                            )}

                            {/* Tank body — colored square */}
                            <rect
                                x={x - 14}
                                y={y - 8}
                                width={28}
                                height={14}
                                fill={tankColor(p.tankColor)}
                                stroke={elim ? '#000' : 'rgba(0,0,0,0.5)'}
                                strokeWidth="1.5"
                            />
                            {/* Turret barrel (rough — points up + 30° toward center) */}
                            <line
                                x1={x}
                                y1={y - 8}
                                x2={x + (x < TERRAIN_W / 2 ? 12 : -12)}
                                y2={y - 22}
                                stroke={tankColor(p.tankColor)}
                                strokeWidth="3"
                                strokeLinecap="round"
                            />

                            {/* Label (callsign + HP) */}
                            <text
                                x={x}
                                y={y - 32}
                                fontSize="18"
                                fill={isMe ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.65)'}
                                fontFamily="'Share Tech Mono', monospace"
                                textAnchor="middle"
                                textDecoration={elim ? 'line-through' : 'none'}
                            >
                                {(p.callsign || p.tgUsername || '???').slice(0, 12).toUpperCase()}
                            </text>
                            <text
                                x={x}
                                y={y - 14}
                                fontSize="14"
                                fill={hpColor(p.hp)}
                                fontFamily="'Share Tech Mono', monospace"
                                textAnchor="middle"
                            >
                                {elim ? 'KO' : `${p.hp ?? 100} HP`}
                            </text>
                        </g>
                    );
                })}

                {/* Wind indicator — top-center */}
                {Math.abs(wind) > 0.5 && (
                    <g transform={`translate(${TERRAIN_W / 2}, 40)`}>
                        <text
                            x={0}
                            y={-8}
                            fontSize="16"
                            fill="rgba(255,255,255,0.6)"
                            fontFamily="'Share Tech Mono', monospace"
                            textAnchor="middle"
                        >
                            WIND {wind > 0 ? '→' : '←'} {Math.abs(wind).toFixed(0)}
                        </text>
                        <line
                            x1={-40 * Math.sign(wind)}
                            y1={4}
                            x2={40 * Math.sign(wind)}
                            y2={4}
                            stroke="rgba(255,255,255,0.5)"
                            strokeWidth="2"
                        />
                        <polygon
                            points={wind > 0
                                ? `${40},${-2} ${50},${4} ${40},${10}`
                                : `${-40},${-2} ${-50},${4} ${-40},${10}`}
                            fill="rgba(255,255,255,0.5)"
                        />
                    </g>
                )}
            </svg>
        </div>
    );
}

// ─── helpers ──────────────────────────────────────────────────────────

/** Map TANK_COLORS phaserHex (number) to CSS hex. */
function tankColor(phaserHex) {
    if (typeof phaserHex !== 'number') return '#c8a84a';
    return '#' + phaserHex.toString(16).padStart(6, '0');
}

function hpColor(hp) {
    if (hp == null || hp <= 0) return 'rgba(168,58,26,0.9)';
    if (hp >= 70) return 'rgba(127,208,96,0.9)';
    if (hp >= 35) return 'rgba(218,180,40,0.9)';
    return 'rgba(218,90,40,0.9)';
}

const styles = {
    frame: {
        width: '100%',
        aspectRatio: `${TERRAIN_W} / ${TERRAIN_H}`,
        maxHeight: '50vh',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--border, rgba(196,166,93,0.2))',
        marginBottom: 14,
    },
    svg: {
        width: '100%',
        height: '100%',
        display: 'block',
    },
    empty: {
        width: '100%',
        aspectRatio: `${TERRAIN_W} / ${TERRAIN_H}`,
        maxHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-deeper, #0a0d07)',
        border: '1px solid var(--border)',
        marginBottom: 14,
    },
    emptyText: {
        fontFamily: 'var(--f-mono, monospace)',
        fontSize: 11,
        color: 'var(--olive, #c4a65d)',
        letterSpacing: '0.3em',
    },
};
