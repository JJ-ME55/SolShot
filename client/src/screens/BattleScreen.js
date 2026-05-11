import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameBridge from '../bridge/GameBridge';
import { startBattle, destroyBattle } from '../bridge/PhaserBootstrap';
import useGameState from '../hooks/useGameState';
import useSocket from '../hooks/useSocket';
import useIsMobile from '../hooks/useIsMobile';
import BattleHUD from './battle/BattleHUD';
import ExitMenu from './battle/ExitMenu';
import Modal from '../components/Modal';
import TutorialOverlay from '../components/TutorialOverlay';
import MovementHint from '../components/MovementHint';
import { useSolShotWallet } from '../wallet/WalletContext';
import { haptic } from '../utils/haptic';

/* -- styles -- */
const s = {
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-deep)',
    cursor: 'url("/assets/images/crosshair.svg") 16 16, crosshair',
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
  deployOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(14, 18, 9, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    gap: 14,
  },
  deployTitle: {
    fontFamily: 'var(--f-display)',
    fontSize: 22,
    color: 'var(--accent)',
    letterSpacing: '0.22em',
    textShadow: '0 0 18px rgba(218,138,40,0.35)',
  },
  deployBar: {
    width: 220,
    height: 4,
    background: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  deployFill: {
    height: '100%',
    background: 'var(--accent)',
    animation: 'loadFill 2s ease-out forwards',
  },
  deploySub: {
    fontFamily: 'var(--f-mono)',
    fontSize: 11,
    color: 'var(--olive)',
    letterSpacing: '0.22em',
  },
  disconnectOverlay: {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--bg-surface)',
    border: '1px solid var(--red)',
    borderTop: 'none',
    clipPath: 'var(--clip-6)',
    padding: '12px 24px',
    zIndex: 45,
    textAlign: 'center',
  },
  disconnectText: {
    fontFamily: 'var(--f-mono)',
    fontSize: 11,
    color: 'var(--red)',
    letterSpacing: '0.2em',
  },
  disconnectTimer: {
    fontFamily: 'var(--f-display)',
    fontSize: 22,
    color: 'var(--red)',
    letterSpacing: '0.12em',
    marginTop: 4,
  },
};


function BattleScreen({ navigate, screenData }) {
  const canvasRef = useRef(null);
  const bridgeRef = useRef(null);
  const leftMatchRef = useRef(false);
  const [phaserReady, setPhaserReady] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [error, setError] = useState(null);
  const [disconnectCountdown, setDisconnectCountdown] = useState(null);
  const countdownRef = useRef(null);
  // Turn-timer default in seconds. Bumped from 60s to 600s (10 min)
  // on 2026-05-10 to match the server-side TURN_TIMEOUT_MS — see
  // server/socket-io/main.js. Async-friendly cadence; a player who
  // minimises briefly doesn't auto-forfeit any more.
  const [turnTimer, setTurnTimer] = useState(600);
  const turnTimerRef = useRef(null);

  const isMobile = useIsMobile();

  // Phase 2 polish — enable Telegram closing confirmation while a match is
  // active. Without this, swiping down on the Mini App in TG closes it
  // instantly, which on a wagered match means losing the wager to the 30s
  // reconnect-then-forfeit logic. We toggle it on at mount, off at unmount.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.enableClosingConfirmation) return;
    try { tg.enableClosingConfirmation(); } catch (_) { /* older client */ }
    return () => {
      try { tg.disableClosingConfirmation?.(); } catch (_) { /* ignore */ }
    };
  }, []);

  // Battle-active flag for global overlays (FeedbackButton hides itself
  // when this is true to avoid overlapping the FIRE button + A/D move
  // cluster on mobile). Window-scoped because the FeedbackButton lives
  // outside this component tree (mounted at Layout level). URL-based
  // detection doesn't work here: SolShot routes are state-driven, not
  // path-driven, so the path stays "/" through a match.
  useEffect(() => {
    window.__solshotInBattle = true;
    window.dispatchEvent(new Event('solshot:battle-state'));
    return () => {
      window.__solshotInBattle = false;
      window.dispatchEvent(new Event('solshot:battle-state'));
    };
  }, []);

  // CS-04: Use context hook instead of window.solWallet
  const { signAndSendEscrowDeposit } = useSolShotWallet();

  // Initialize bridge once
  if (!bridgeRef.current) {
    bridgeRef.current = new GameBridge();
  }

  const bridge = bridgeRef.current;
  const gameState = useGameState(bridge);

  const wager = screenData?.wager || 0;

  /* -- Bridge ready callback (Phaser -> React) -- */
  useEffect(() => {
    bridge.onReady = () => setPhaserReady(true);

    // Game events (matchEnd, roundEnd, opponentLeft, matchSettled)
    // are handled via useSocket below, not bridge callbacks.
    // Phaser scene doesn't fire these — the server sends them directly.

    return () => {
      bridge.onReady = null;
    };
  }, [bridge]);

  /* -- Socket: escrowDeposit -> auto-sign deposit transaction -- */
  useSocket('escrowDeposit', async (data) => {
    if (!data?.transaction) return;
    if (signAndSendEscrowDeposit) {
      const sig = await signAndSendEscrowDeposit(data.transaction, data.roomId || screenData?.roomId);
      if (!sig) {
        setError('Failed to deposit wager to escrow. Match may not proceed.');
      }
    }
  });

  /* -- Leave Match: navigate to lobby immediately (eliminated player) -- */
  const handleLeaveMatch = useCallback(() => {
    leftMatchRef.current = true;
    if (window.socket) {
      window.socket.emit('leaveRoom');
    }
    destroyBattle();
    navigate('lobby');
  }, [navigate]);

  /* -- Socket: matchEnd -> navigate to win/lose -- */
  useSocket('matchEnd', (data) => {
    if (leftMatchRef.current) return; // Already navigating via Leave Match
    const myId = window.socket?.id;
    const isWinner = data.winner === myId;
    haptic.heavy(); // MOB-01: haptic feedback on win or lose
    navigate(isWinner ? 'win' : 'lose', {
      ...screenData,
      ...data,
    });
  });

  /* -- Socket: roundEnd -> navigate back to shop -- */
  useSocket('roundEnd', (data) => {
    navigate('shop', {
      ...screenData,
      ...data,
    });
  });

  /* -- Socket: opponent left -- */
  useSocket('opponentLeft', () => {
    setError('Opponent has left the match');
  });

  /* -- Socket: matchSettled (forfeit) -- */
  useSocket('matchSettled', (data) => {
    navigate('win', {
      ...screenData,
      settlement: data,
    });
  });

  /* -- Reconnect handlers removed for P1 launch -- */

  /* -- Socket: turn timeout — server auto-advanced the turn -- */
  useSocket('turnTimeout', (data) => {
    if (bridgeRef.current) {
      bridgeRef.current.updateState({
        currentTurn: data.nextTurn,
        turnCount: data.turnCount,
      });
    }
  });

  /* -- Turn timer: 10-min countdown (was 60s pre-2026-05-10), resets on turn change -- */
  useEffect(() => {
    if (!phaserReady) return;
    // Reset to 10 min whenever the turn changes — matches server
    // TURN_TIMEOUT_MS at server/socket-io/main.js. Async-friendly.
    setTurnTimer(600);
    if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    turnTimerRef.current = setInterval(() => {
      setTurnTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, [gameState.currentPlayerIndex, phaserReady]);

  /* -- Cleanup countdown interval on unmount -- */
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (turnTimerRef.current) clearInterval(turnTimerRef.current);
    };
  }, []);

  /* -- Global keyboard controls -- */
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const b = bridgeRef.current;
      if (!b) return;

      switch (e.key) {
        case 'Escape':
          setShowExit((prev) => !prev);
          break;

        // ── Angle: Q/E or Left/Right arrows ──
        case 'q':
        case 'Q':
        case 'ArrowLeft': {
          e.preventDefault();
          const cur = b.state.players?.[b.state.myPlayerIndex]?.angle || 45;
          b.setAngle(Math.max(0, cur - (e.shiftKey ? 5 : 1)));
          break;
        }
        case 'e':
        case 'E':
        case 'ArrowRight': {
          e.preventDefault();
          const cur = b.state.players?.[b.state.myPlayerIndex]?.angle || 45;
          b.setAngle(Math.min(180, cur + (e.shiftKey ? 5 : 1)));
          break;
        }

        // ── Power: W/S or Up/Down arrows ──
        case 'w':
        case 'W':
        case 'ArrowUp': {
          e.preventDefault();
          const cur = b.state.players?.[b.state.myPlayerIndex]?.power || 60;
          b.setPower(Math.min(100, cur + (e.shiftKey ? 5 : 1)));
          break;
        }
        case 's':
        case 'S':
        case 'ArrowDown': {
          e.preventDefault();
          const cur = b.state.players?.[b.state.myPlayerIndex]?.power || 60;
          b.setPower(Math.max(5, cur - (e.shiftKey ? 5 : 1)));
          break;
        }

        // ── Movement: A/D ──
        case 'a':
        case 'A':
          b.moveLeft();
          break;
        case 'd':
        case 'D':
          b.moveRight();
          break;

        // ── Fire: Space ──
        case ' ':
          e.preventDefault();
          b.fire();
          break;

        // ── Weapon select: 1-9 number keys ──
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9': {
          const weaponIdx = parseInt(e.key, 10) - 1;
          const weapons = b.state.weapons || [];
          if (weaponIdx < weapons.length) {
            b.selectWeapon(weaponIdx);
          }
          break;
        }

        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* -- Initialize Phaser scene -- */
  useEffect(() => {
    if (!canvasRef.current) return;

    // Set wager and pot on bridge initial state
    const numPlayersInMatch = screenData?.players?.length || screenData?.maxPlayers || 2;
    bridge.updateState({
      wager: wager,
      potDisplay: wager * numPlayersInMatch,
      round: screenData?.round || 1,
      totalRounds: screenData?.totalRounds || 5,
      gold: screenData?.goldBalance?.[window.socket?.id] || 1000,
    });

    // Start real Phaser game with MainScene
    startBattle(canvasRef.current, {
      ...screenData,
      gameType: 3, // Online multiplayer
    }, bridge);

    return () => {
      destroyBattle();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* -- Exit / Forfeit -- */
  const handleForfeit = useCallback(() => {
    if (window.socket) {
      window.socket.emit('leaveRoom');
    }
    destroyBattle();
    navigate('lobby');
  }, [navigate]);

  return (
    <div style={s.wrapper}>
      {/* Phaser Canvas Container */}
      <div ref={canvasRef} style={s.canvas} />

      {/* Deploying Overlay */}
      {!phaserReady && (
        <div style={s.deployOverlay}>
          <div style={s.deployTitle}>DEPLOYING...</div>
          <div style={s.deployBar}>
            <div style={s.deployFill} />
          </div>
          <div style={s.deploySub}>LOADING BATTLEFIELD</div>
        </div>
      )}

      {/* React HUD Overlay */}
      {phaserReady && (
        <BattleHUD
          bridge={bridge}
          gameState={gameState}
          wager={wager}
          turnTimer={turnTimer}
          onLeaveMatch={handleLeaveMatch}
          onForfeit={() => setShowExit(true)}
        />
      )}

      {/* First-match tutorial briefing — auto-dismisses after seen once,
          persisted in localStorage. No-op on subsequent matches. */}
      {phaserReady && <TutorialOverlay storageKey="solshot.tutorial.battle" />}

      {/* In-battle A / D movement reminder — fires once per device on
          the first turn the player gets, separate from the tutorial so
          existing users (who've already dismissed the briefing) still
          get nudged. JJ pre-submission ask, May 9. */}
      {phaserReady && (
        <MovementHint
          active={!!gameState.isPlayerTurn}
          gameMode={undefined}
          storageKey="solshot.hint.movement.v1"
        />
      )}

      {/* Exit Menu */}
      {showExit && (
        <ExitMenu
          wager={wager}
          onConfirm={handleForfeit}
          onCancel={() => setShowExit(false)}
        />
      )}

      {/* Disconnect overlay removed — reconnect disabled for P1 */}

      {/* Error Modal */}
      {error && (
        <Modal
          title={error.includes('forfeit') ? 'VICTORY' : 'DISCONNECTED'}
          message={error}
          buttons={[{
            label: 'RETURN TO LOBBY',
            variant: 'secondary',
            onClick: () => navigate('lobby'),
          }]}
          onClose={() => navigate('lobby')}
        />
      )}
    </div>
  );
}

export default BattleScreen;
