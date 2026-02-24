import React, { useState, useEffect, useCallback } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import JupiterSwap from '../components/JupiterSwap';
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
    filter: 'drop-shadow(0 4px 20px rgba(255, 200, 0, 0.3))',
  },
  rewardRow: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  rewardCard: (color, delay) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '10px 18px',
    background: 'rgba(42, 51, 31, 0.3)',
    border: `1px solid ${color}33`,
    borderRadius: 4,
    animation: `sc 0.4s ease-out ${delay}s both`,
  }),
  rewardValue: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    color: color,
    letterSpacing: 2,
    lineHeight: 1,
  }),
  rewardLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.7,
  },
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
  settlementLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--sg)',
    letterSpacing: 1,
    opacity: 0.6,
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


function WinScreen({ navigate, screenData }) {
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [settlementData] = useState(screenData?.settlement || null);
  const [shotPrice, setShotPrice] = useState(null);

  // Fetch current SHOT price from server (via getShotPrice socket handler from Plan 01)
  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    const handlePrice = (price) => {
      setShotPrice(price);
    };

    socket.on('shotPrice', handlePrice);
    socket.emit('getShotPrice');

    return () => {
      socket.off('shotPrice', handlePrice);
    };
  }, []);

  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const shotEarned = screenData?.shotEarned || {};
  const myId = window.socket?.id;

  // Derive earnings
  const solWon = wager > 0 ? wager * 2 * 0.95 : 0; // ~5% fee
  const myShotEarned = myId && shotEarned[myId] ? shotEarned[myId].earned : 0;
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
        src="/assets/images/branding/win-screen.png"
        alt="Victory"
        style={s.heroBanner}
        draggable={false}
      />

      {/* Reward Cards */}
      <div style={s.rewardRow}>
        {wager > 0 && (
          <div style={s.rewardCard('var(--sg)', 0.1)}>
            <div style={s.rewardValue('var(--sg)')}>+{solWon.toFixed(3)}</div>
            <div style={s.rewardLabel}>SOL EARNED</div>
          </div>
        )}
        {myShotEarned > 0 && (
          <div style={s.rewardCard('var(--sp)', 0.2)}>
            <div style={s.rewardValue('var(--sp)')}>+{myShotEarned}</div>
            <div style={s.rewardLabel}>SHOT EARNED</div>
          </div>
        )}
        <div style={s.rewardCard('var(--gd)', 0.3)}>
          <div style={s.rewardValue('var(--gd)')}>{myGold}</div>
          <div style={s.rewardLabel}>GOLD EARNED</div>
        </div>
      </div>

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
          <div style={s.statValue}>{myId && scores[myId] ? scores[myId].kills || 0 : 0}</div>
          <div style={s.statLabel}>KILLS</div>
        </div>
      </div>

      {/* Settlement TX */}
      {settlementData?.txSignature && (
        <div style={s.settlementLine}>
          TX: {settlementData.txSignature.slice(0, 8)}...{settlementData.txSignature.slice(-8)}
        </div>
      )}

      {waitingRematch && <div style={s.waitingText}>WAITING FOR OPPONENT...</div>}

      {/* Buttons */}
      <div style={s.buttonRow}>
        {!opponentLeft ? (
          <>
            <Button variant="primary" onClick={handleRematch} disabled={waitingRematch} style={{ fontSize: 14, padding: '10px 24px' }}>
              {waitingRematch ? 'WAITING...' : 'REMATCH'}
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

      {/* Jupiter Swap CTA with price context */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', letterSpacing: 1, opacity: 0.6, marginBottom: 4 }}>
          CONVERT WINNINGS TO SHOT
        </div>
        {shotPrice && shotPrice.usdPrice && (
          <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#9945FF', letterSpacing: 1, opacity: 0.7, marginBottom: 6 }}>
            {'SHOT: $' + shotPrice.usdPrice.toFixed(6) + ' USD'}
            {shotPrice.priceChange24h != null && (
              <span style={{ color: shotPrice.priceChange24h >= 0 ? '#00ff88' : '#ff4444', marginLeft: 6 }}>
                {shotPrice.priceChange24h >= 0 ? '+' : ''}{shotPrice.priceChange24h.toFixed(1)}%
              </span>
            )}
          </div>
        )}
        <JupiterSwap
          mode="modal"
          buttonLabel="SWAP SOL -> SHOT"
          buttonStyle={{ fontSize: 9, padding: '5px 12px' }}
          onSuccess={() => {
            if (window.socket) window.socket.emit('getShotInfo');
          }}
        />
      </div>
    </div>
  );
}

export default WinScreen;
