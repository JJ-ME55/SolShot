import React, { useState, useCallback } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import useSocket from '../hooks/useSocket';

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '0 30px 20px',
    gap: 10,
    overflowY: 'auto',
  },
  heroBanner: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 6,
    marginBottom: 2,
    animation: 'sm 0.5s ease-out both',
    filter: 'drop-shadow(0 4px 20px rgba(204, 34, 0, 0.3))',
  },

  /* Loss card */
  lossCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 24px',
    background: 'rgba(204, 34, 0, 0.06)',
    border: '1px solid rgba(204, 34, 0, 0.2)',
    borderRadius: 4,
    animation: 'sc 0.4s ease-out 0.1s both',
  },
  lossValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    color: 'var(--rd)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  lossLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.7,
  },

  /* Stats grid */
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    width: '100%',
    maxWidth: 400,
  },
  statItem: {
    textAlign: 'center',
    padding: '6px 0',
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 22,
    color: 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    marginTop: 2,
  },

  buttonRow: {
    display: 'flex',
    gap: 8,
    marginTop: 6,
  },
  waitingText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--am)',
    letterSpacing: 2,
    animation: 'fl 2s ease-in-out infinite',
    marginTop: 4,
  },
};


function LoseScreen({ navigate, screenData }) {
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);

  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const myId = window.socket?.id;
  const myGold = screenData?.goldBalance && myId ? screenData.goldBalance[myId] : 0;

  /* ── socket: playAgain -> back to shop ── */
  useSocket('playAgain', () => {
    setWaitingRematch(false);
    navigate('shop', screenData);
  });

  /* ── socket: opponent left ── */
  useSocket('opponentLeft', () => {
    setWaitingRematch(false);
    setOpponentLeft(true);
  });

  /* ── actions ── */
  const handleRematch = useCallback(() => {
    if (!window.socket) return;
    window.socket.emit('playAgainRequest');
    setWaitingRematch(true);
  }, []);

  const handleLobby = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('lobby');
  }, [navigate]);

  const handleMenu = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('menu');
  }, [navigate]);

  return (
    <div style={s.container}>
      <img
        src="/assets/images/branding/lose-screen.png"
        alt="Defeat"
        style={s.heroBanner}
        draggable={false}
      />

      {/* Loss Card */}
      {wager > 0 && (
        <div style={s.lossCard}>
          <div style={s.lossValue}>-{wager.toFixed(3)}</div>
          <div style={s.lossLabel}>SOL WAGERED</div>
        </div>
      )}

      {/* Stats */}
      <div style={s.statsGrid}>
        <div style={s.statItem}>
          <div style={s.statValue}>{myId && roundWins[myId] ? roundWins[myId] : 0}</div>
          <div style={s.statLabel}>ROUNDS WON</div>
        </div>
        <div style={s.statItem}>
          <div style={s.statValue}>{myId && scores[myId] ? scores[myId].damageDealt || 0 : 0}</div>
          <div style={s.statLabel}>DMG DEALT</div>
        </div>
        <div style={s.statItem}>
          <div style={s.statValue}>{myGold}</div>
          <div style={s.statLabel}>GOLD EARNED</div>
        </div>
      </div>

      {waitingRematch && <div style={s.waitingText}>WAITING FOR OPPONENT...</div>}

      {/* Buttons */}
      <div style={s.buttonRow}>
        {!opponentLeft ? (
          <>
            <Button variant="primary" onClick={handleRematch} disabled={waitingRematch} style={{ fontSize: 14, padding: '10px 24px' }}>
              {waitingRematch ? 'WAITING...' : 'RUN IT BACK'}
            </Button>
            <Button variant="secondary" onClick={handleLobby} style={{ fontSize: 13, padding: '10px 20px' }}>
              LOBBY
            </Button>
            <Button variant="secondary" onClick={handleMenu} style={{ fontSize: 13, padding: '10px 20px' }}>
              MENU
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={handleLobby} style={{ fontSize: 14, padding: '10px 24px' }}>
            RETURN TO LOBBY
          </Button>
        )}
      </div>

      {opponentLeft && (
        <Modal
          title="OPPONENT LEFT"
          message="Your opponent has disconnected."
          buttons={[{ label: 'LOBBY', variant: 'secondary', onClick: handleLobby }]}
          onClose={handleLobby}
        />
      )}
    </div>
  );
}

export default LoseScreen;
