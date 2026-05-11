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
import { useSolShotWallet } from '../wallet/WalletContext';
import BattleHUD from './battle/BattleHUD';
import TutorialOverlay from '../components/TutorialOverlay';

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
        // Persisted aim state from the player's last shot — MainScene
        // applies these on tank init so the turret + power bar pick up
        // where they left off (group-chat is async multi-day; without
        // this each Mini App reopen would reset back to defaults).
        lastAngle: p.lastAngle,
        lastPower: p.lastPower,
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

export default function GroupBattleWrapper({ match, onMatchUpdate, fillMode = false, onLeaveMatch }) {
    const { user: tgUser } = useTelegram();
    const { walletHandle } = useSolShotWallet();
    const canvasRef = useRef(null);
    const bridgeRef = useRef(null);
    const restoredSocketIdRef = useRef(null);
    const [phaserReady, setPhaserReady] = useState(false);

    if (!bridgeRef.current) bridgeRef.current = new GameBridge();
    const bridge = bridgeRef.current;
    const gameState = useGameState(bridge);

    // Server-resolved TG id (set via walletHandle socket event after auth)
    // is the canonical identity. tgUser.id only populates inside an actual
    // TG Mini App context, which we don't use anymore — relying on it
    // alone broke the active-player firing UI in regular-browser sessions.
    const myTgId = walletHandle?.telegramUserId || tgUser?.id || null;

    // Seed bridge with per-match state so BattleHUD has the right gold,
    // round (=1), and wager (free=0) before MainScene's first updateState.
    // Mirrors BattleScreen's bridge.updateState() seed.
    useEffect(() => {
        if (!match) return;
        const me = match.players?.find(p => p.telegramUserId === myTgId);
        bridge.updateState({
            wager: 0,
            potDisplay: 0,
            round: 1,
            totalRounds: 1,
            gold: me?.gold ?? 1000,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [match?.matchId]);

    // Battle-active flag mirror of BattleScreen's. FeedbackButton hides
    // itself while this is true so the floating '?' doesn't stack on
    // top of the move cluster + weapon strip in the bottom-left of
    // mobile group-chat matches.
    useEffect(() => {
        window.__solshotInBattle = true;
        window.dispatchEvent(new Event('solshot:battle-state'));
        return () => {
            window.__solshotInBattle = false;
            window.dispatchEvent(new Event('solshot:battle-state'));
        };
    }, []);

    // Forfeit handler — confirms with the user, then emits forfeitGroupMatch
    // to the server. Server marks the player eliminated (HP=0), advances
    // turn, and posts to chat. If the firer's forfeit makes them the last
    // alive minus 1, server auto-settles the match. The wagered case loses
    // the player's stake (they took 90% themselves only if they were the
    // last standing; otherwise the surviving player wins the pot per the
    // standard split). The 12h idle timer would eventually achieve the same
    // thing, but forfeit is the explicit synchronous version.
    const handleForfeit = React.useCallback(() => {
        if (!match?.matchId) return;
        const isWagered = match.config?.type === 'wagered';
        const confirmMsg = isWagered
            ? `Forfeit Match #${match.matchId}? You will lose your wagered SOL — only the last tank standing wins the pot.`
            : `Forfeit Match #${match.matchId}? Your tank will be eliminated and the match continues without you.`;
        // window.confirm is the lowest-friction confirmation that survives
        // every device + WebView context (TG Mini App, Safari, etc.).
        if (!window.confirm(confirmMsg)) return;
        const sock = window.socket;
        if (!sock || !sock.connected) {
            try { window.alert('Connection lost. Refresh and try again.'); } catch (_) {}
            return;
        }
        sock.emit('forfeitGroupMatch', { matchId: match.matchId });
        // Don't navigate immediately — wait for the server's shotResult-shaped
        // confirmation (next shotResult will reflect the elimination) OR a
        // direct groupMatchCancelled if the forfeit ended the match.
        // Parent (GroupMatchScreen) handles those events.
    }, [match?.matchId, match?.config?.type]);

    // Global keyboard controls — Space=fire, 1-9=weapon select. The Tank
    // class binds QEAD/WS internally for angle/power, so those work via
    // Phaser's input system and don't need a React-level listener.
    // Mirrors BattleScreen's handler verbatim minus Escape (group-chat
    // doesn't have an exit menu).
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const b = bridgeRef.current;
            if (!b) return;
            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    b.fire();
                    break;
                case '1': case '2': case '3': case '4': case '5':
                case '6': case '7': case '8': case '9': {
                    const idx = parseInt(e.key, 10) - 1;
                    const ws = b.state.weapons || [];
                    if (idx < ws.length) b.selectWeapon(idx);
                    break;
                }
                // Q/E/W/S/A/D fall through — handled by Phaser's Tank/Turret
                // input bindings directly.
                default:
                    break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
            {/* React HUD overlay — same component the 1v1 BattleScreen uses.
                Renders top player bar, weapon picker, angle/power sliders,
                FIRE button. Reads gameState from the bridge that MainScene
                writes to in its update() loop. The `gameMode` prop tells
                BattleHUD to hide round counter / forfeit / turn timer that
                don't apply to async multi-day group-chat matches. */}
            {phaserReady && (
                <BattleHUD
                    bridge={bridge}
                    gameState={gameState}
                    wager={0}
                    turnTimer={null}
                    onLeaveMatch={onLeaveMatch}
                    onForfeit={handleForfeit}
                    gameMode="group-chat"
                />
            )}
            {/* First-match tutorial — group-chat shares the same battle
                vocabulary, so we use the same tutorial briefing. Once
                seen on either entry point, never shown again. */}
            {phaserReady && <TutorialOverlay storageKey="solshot.tutorial.battle" />}
        </div>
    );
}

const styles = {
    wrapper: {
        position: 'relative',
        width: '100%',
        // Phaser scene is 1422x800 internally (16:9 native), scales to fit.
        // Use fixed aspect ratio so it doesn't collapse in flex layouts.
        // Must match TERRAIN_WIDTH/HEIGHT in server/services/physics.js.
        aspectRatio: '1422 / 800',
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
