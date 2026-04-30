/**
 * GroupBattleWrapper — mounts the existing 1v1 Phaser MainScene for a
 * group-chat match.
 *
 * Why we reuse MainScene unchanged (vs writing a new scene):
 *   The 1v1 trajectory + blast + tank gravity + weapon animation quality
 *   was painstakingly tuned. Forking to a parallel scene would risk drift
 *   and quality regression. Instead we add a `gameMode === 'group-chat'`
 *   flag to MainScene at four narrow branch points (terrain bootstrap,
 *   fire emit, shotResult listener, and a few no-op gates for live-broadcast
 *   emits that group-chat doesn't use). Same scene, same physics, same
 *   animations — different I/O envelope.
 *
 * What this wrapper does:
 *   1. Builds sceneData from the GroupMatch document. Identity-maps each
 *      player's telegramUserId (Number) to a String socketId, since
 *      MainScene's player matching is keyed on socket.id strings.
 *   2. Temporarily overrides window.socket.id to the local user's
 *      String(myTgId) so MainScene's `myPlayerIndex` resolution works.
 *      Restores on unmount.
 *   3. Calls startBattle() with the sceneData. MainScene reads gameMode,
 *      bootstraps from sceneData.terrainSnapshot directly (no requestTerrain
 *      socket round-trip), wires the shotResult adapter.
 *   4. On match.state transitions (active → settled), the parent
 *      GroupMatchScreen unmounts this and shows the settled summary —
 *      we don't try to manage match-end UI in here.
 *
 * Constraints / known limitations:
 *   - One match at a time. If user navigates to a different group match,
 *     parent should remount this with the new matchId.
 *   - Spectator support: a viewer who isn't a player still sees the scene
 *     but with myPlayerIndex = -1, so input is gated off via existing
 *     "is my turn" checks. Their tank position highlights will work.
 *   - Real-time updates: server only pushes shotResult to the firer's
 *     socket. Other players see the new state when their Mini App
 *     refetches (e.g. on next chat ping deep-link tap). v2 should use
 *     socket.io rooms to broadcast.
 */

import React, { useEffect, useRef, useState } from 'react';
import GameBridge from '../bridge/GameBridge';
import { startBattle, destroyBattle } from '../bridge/PhaserBootstrap';
import useGameState from '../hooks/useGameState';
import { useTelegram } from '../telegram/TelegramContext';

/** Build the sceneData payload MainScene expects, from a GroupMatch. */
function buildSceneData(match, myTgId) {
    const players = (match.players || []).map(p => ({
        socketId: String(p.telegramUserId),
        name: (p.callsign || p.tgUsername || 'OPERATIVE').slice(0, 16),
        color: p.tankColor,
        // Map purchased weapon IDs from the GroupMatch player doc into the
        // shape MainScene expects ([{ id }, ...]). Default loadout is
        // [0] = Single Shot, set in startMatch on the server.
        weapons: ((p.weapons && p.weapons.length) ? p.weapons : [0]).map((id) => ({ id })),
        hp: p.hp,
    }));
    const positions = (match.players || []).map(p => ({
        socketId: String(p.telegramUserId),
        pos: { x: p.currentX, y: p.currentY },
        x: p.currentX,
        y: p.currentY,
    }));
    const currentPlayer = match.players?.[match.currentPlayerIndex];
    return {
        // Top-level mode flag MainScene branches on
        gameMode: 'group-chat',
        gameType: 3,                                 // multiplayer code path
        matchId: match.matchId,
        hostId: players[0]?.socketId || null,        // first player is "host"
        firstTurn: currentPlayer ? String(currentPlayer.telegramUserId) : null,
        players,
        positions,
        terrainSnapshot: match.terrainSnapshot,
        wind: match.wind || 0,
        backgroundIndex: match.backgroundIndex || 0,
        // Wager + round info — group-chat is single-life, no rounds. Provide
        // sensible defaults so any HUD that reads these doesn't NaN.
        wager: 0,
        round: 1,
        totalRounds: 1,
        // Local user's tg id, exposed so MainScene's socket.id check resolves
        myTgIdString: String(myTgId),
    };
}

export default function GroupBattleWrapper({ match, onMatchUpdate, fillMode = false }) {
    const { user: tgUser } = useTelegram();
    const canvasRef = useRef(null);
    const bridgeRef = useRef(null);
    const restoredSocketIdRef = useRef(null);
    const [phaserReady, setPhaserReady] = useState(false);

    if (!bridgeRef.current) bridgeRef.current = new GameBridge();
    const bridge = bridgeRef.current;
    const gameState = useGameState(bridge);

    const myTgId = tgUser?.id;

    // Mount Phaser with sceneData built from match. Only runs once on mount;
    // match updates flow in via groupMatchData socket events that MainScene
    // consumes through the shotResult listener (turnResult-shaped translation).
    useEffect(() => {
        if (!canvasRef.current || !match) return;
        if (!myTgId) return; // no identity → can't render

        // MainScene's `myPlayerIndex` resolution does
        //   socket.id === player.socketId
        // For group-chat we want it to match telegramUserId-as-string.
        // Override window.socket.id to String(myTgId) for the duration of
        // this scene's lifetime, restoring on unmount.
        const sock = window.socket;
        if (sock) {
            restoredSocketIdRef.current = sock.id;
            try {
                Object.defineProperty(sock, 'id', {
                    value: String(myTgId),
                    configurable: true,
                    writable: true,
                });
            } catch (_) {
                // Some socket.io versions seal id; fall back to direct assign
                sock.id = String(myTgId);
            }
        }

        const sceneData = buildSceneData(match, myTgId);

        // Bridge-ready callback — pushed by MainScene after terrain bootstrap
        bridge.onReady = () => setPhaserReady(true);

        startBattle(canvasRef.current, sceneData, bridge);

        return () => {
            destroyBattle();
            bridge.onReady = null;
            // Restore the original socket.id so other 1v1 flows continue working
            const sock2 = window.socket;
            if (sock2 && restoredSocketIdRef.current !== null) {
                try {
                    Object.defineProperty(sock2, 'id', {
                        value: restoredSocketIdRef.current,
                        configurable: true,
                        writable: true,
                    });
                } catch (_) {
                    sock2.id = restoredSocketIdRef.current;
                }
                restoredSocketIdRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // mount once — match updates handled via shotResult inside MainScene

    // Refresh match snapshot from server periodically + after each shot.
    // The shotResult socket event is consumed inside MainScene's group-chat
    // adapter, but we ALSO want React-side state (HP labels, turn indicator
    // in any non-Phaser HUD) to reflect the new state. The shotResult event
    // includes `match` snapshot — surface it via onMatchUpdate.
    useEffect(() => {
        if (!window.socket) return;
        const handler = (data) => {
            if (data?.match) {
                onMatchUpdate?.(data.match);
            }
        };
        window.socket.on('shotResult', handler);
        return () => window.socket.off('shotResult', handler);
    }, [onMatchUpdate]);

    // fillMode: parent (active-mode HUD) provides flex:1 sizing; we just
    // fill 100%/100% with no aspect-ratio constraint. Phaser's Scale.FIT
    // mode handles the aspect ratio internally, with letterboxing if the
    // container's aspect doesn't match 1200:800.
    //
    // !fillMode (legacy): wrapper enforces aspect ratio + maxHeight cap,
    // sized inside a scrollable parent.
    const wrapperStyle = fillMode ? styles.fillWrapper : styles.wrapper;

    return (
        <div style={wrapperStyle}>
            <div ref={canvasRef} style={styles.canvas} />
            {!phaserReady && (
                <div style={styles.loadingOverlay}>
                    <div style={styles.loadingText}>DEPLOYING…</div>
                </div>
            )}
        </div>
    );
}

const styles = {
    wrapper: {
        position: 'relative',
        width: '100%',
        // Phaser scene is 1200x800 internally, scales to fit.
        // Use fixed aspect ratio so it doesn't collapse in flex layouts.
        aspectRatio: '1200 / 800',
        maxHeight: '70vh',
        background: 'var(--bg-deep, #0e1209)',
        overflow: 'hidden',
        cursor: 'url("/assets/images/crosshair.svg") 16 16, crosshair',
        marginBottom: 14,
        border: '1px solid var(--border, rgba(196,166,93,0.2))',
    },
    fillWrapper: {
        position: 'relative',
        flex: 1,
        width: '100%',
        height: '100%',
        background: 'var(--bg-deep, #0e1209)',
        overflow: 'hidden',
        cursor: 'url("/assets/images/crosshair.svg") 16 16, crosshair',
    },
    canvas: {
        width: '100%',
        height: '100%',
    },
    loadingOverlay: {
        position: 'absolute', inset: 0,
        background: 'rgba(14, 18, 9, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
    },
    loadingText: {
        fontFamily: 'var(--f-mono, monospace)',
        fontSize: 12,
        color: 'var(--accent, #ff7a1a)',
        letterSpacing: '0.3em',
    },
};
