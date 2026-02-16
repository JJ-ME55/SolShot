import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameBridge from '../bridge/GameBridge';
import { startBattle, destroyBattle } from '../bridge/PhaserBootstrap';
import useGameState from '../hooks/useGameState';
import useSocket from '../hooks/useSocket';
import BattleHUD from './battle/BattleHUD';
import ExitMenu from './battle/ExitMenu';
import Modal from '../components/Modal';

/* -- styles -- */
const s = {
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: '#000',
  },
  canvas: {
    width: '100%',
    height: '100%',
  },
  deployOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10, 12, 8, 0.95)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    gap: 10,
  },
  deployTitle: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--am)',
    letterSpacing: 4,
    animation: 'fl 1.5s ease-in-out infinite',
  },
  deployBar: {
    width: 200,
    height: 4,
    borderRadius: 2,
    background: 'var(--od)',
    overflow: 'hidden',
  },
  deployFill: {
    height: '100%',
    borderRadius: 2,
    background: 'var(--am)',
    animation: 'loadFill 2s ease-out forwards',
  },
  deploySub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.6,
  },
};


function BattleScreen({ navigate, screenData }) {
  const canvasRef = useRef(null);
  const bridgeRef = useRef(null);
  const [phaserReady, setPhaserReady] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [error, setError] = useState(null);

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

  /* -- Socket: matchEnd -> navigate to win/lose -- */
  useSocket('matchEnd', (data) => {
    const myId = window.socket?.id;
    const isWinner = data.winner === myId;
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

  /* -- ESC key for exit menu -- */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowExit((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  /* -- Initialize Phaser scene -- */
  useEffect(() => {
    if (!canvasRef.current) return;

    // Set wager and pot on bridge initial state
    bridge.updateState({
      wager: wager,
      potDisplay: wager * 2,
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

      {/* Error Modal */}
      {error && (
        <Modal
          title="DISCONNECTED"
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
