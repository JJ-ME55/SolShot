import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';

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
    borderRadius: 12,
    marginBottom: 2,
    animation: 'sm 0.5s ease-out both',
    filter: 'drop-shadow(0 4px 20px rgba(255, 200, 0, 0.3))',
  },

  /* ── Tab navigation ── */
  tabNav: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    maxWidth: 400,
    width: '100%',
    borderBottom: '1px solid var(--ol)',
  },
  tab: (active) => ({
    padding: '10px 24px',
    cursor: 'pointer',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    letterSpacing: 2,
    color: active ? 'var(--am)' : 'var(--kh)',
    borderBottom: active ? '2px solid var(--am)' : '2px solid transparent',
    opacity: active ? 1 : 0.5,
    background: 'none',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: active ? 2 : 2,
    borderBottomColor: active ? 'var(--am)' : 'transparent',
    textTransform: 'uppercase',
    userSelect: 'none',
  }),

  /* ── Result tab ── */
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
    border: '1px solid ' + color + '33',
    borderRadius: 4,
    animation: 'sc 0.4s ease-out ' + delay + 's both',
  }),
  rewardValue: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 32,
    color: color,
    letterSpacing: 2,
    lineHeight: 1,
  }),
  rewardLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
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
    fontSize: 26,
    color: 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    marginTop: 3,
  },
  settlementLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--sg)',
    letterSpacing: 1,
    opacity: 0.6,
  },

  /* ── Action tab ── */
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


function WinScreen({ navigate, screenData }) {
  const [activeTab, setActiveTab] = useState('result');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [settlementData] = useState(screenData?.settlement || null);
  const [showCard, setShowCard] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);

  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const myId = window.socket?.id;

  // Derive earnings
  const solWon = wager > 0 ? wager * 2 * 0.95 : 0; // ~5% fee
  const myGold = screenData?.goldBalance && myId ? screenData.goldBalance[myId] : 0;

  // Derive opponent ID from roundWins keys
  const opponentId = myId ? Object.keys(roundWins).find(function(id) { return id !== myId; }) : null;

  // N-player placement leaderboard
  const survivorOrder = screenData?.survivorOrder || [];
  const allPlayers = screenData?.players || [];
  const playerMap = {};
  allPlayers.forEach(p => { if (p && p.socketId) playerMap[p.socketId] = p; });
  const ordinal = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

  // Fetch persistent stats for stat card export
  useEffect(() => {
    const socket = window.socket;
    if (socket) {
      socket.emit('getStats');
      const handler = (data) => setPlayerStats(data);
      socket.on('statsData', handler);
      return () => socket.off('statsData', handler);
    }
  }, []);

  const [rematchWaiting, setRematchWaiting] = useState(false);

  /* ── socket: opponent left ── */
  useSocket('opponentLeft', () => {
    setOpponentLeft(true);
    setRematchWaiting(false);
  });

  /* ── socket: play again accepted by both sides ── */
  useSocket('playAgain', () => {
    navigate('shop');
  });

  const handleRematch = useCallback(() => {
    if (window.socket) {
      window.socket.emit('playAgainRequest');
      setRematchWaiting(true);
    }
  }, []);

  const handleLobby = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('lobby');
  }, [navigate]);

  const handleMenu = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('menu');
  }, [navigate]);

  const handleBarracks = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('barracks');
  }, [navigate]);


  return (
    <div style={s.container}>
      <img
        src="/assets/images/branding/win-screen.png"
        alt="Victory"
        style={s.heroBanner}
        draggable={false}
      />

      {/* Tab Navigation */}
      <div style={s.tabNav}>
        <div style={s.tab(activeTab === 'result')} onClick={() => setActiveTab('result')}>
          RESULT
        </div>
        <div style={s.tab(activeTab === 'action')} onClick={() => setActiveTab('action')}>
          ACTION
        </div>
      </div>

      {/* ── RESULT TAB ── */}
      {activeTab === 'result' && (
        <>
          {/* Reward Cards */}
          <div style={s.rewardRow}>
            {wager > 0 && (
              <div style={s.rewardCard('var(--sg)', 0.1)}>
                <div style={s.rewardValue('var(--sg)')}>+{solWon.toFixed(3)}</div>
                <div style={s.rewardLabel}>SOL EARNED</div>
              </div>
            )}
            <div style={s.rewardCard('var(--gd)', 0.2)}>
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

          {/* N-player Final Standings (3+ players only) */}
          {survivorOrder.length > 2 && (
            <div style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 12,
                color: 'var(--am)',
                letterSpacing: 2,
                marginBottom: 2,
              }}>
                FINAL STANDINGS
              </div>
              {survivorOrder.map((id, rank) => {
                const p = playerMap[id];
                const isMe = id === myId;
                return (
                  <div key={id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    background: isMe ? 'rgba(20, 241, 149, 0.08)' : 'rgba(42, 51, 31, 0.2)',
                    border: isMe ? '1px solid rgba(20, 241, 149, 0.3)' : '1px solid var(--ol)',
                    borderRadius: 3,
                  }}>
                    <span style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: 20,
                      color: rank === 0 ? 'var(--gd)' : 'var(--kh)',
                      width: 30,
                      textAlign: 'center',
                    }}>
                      {ordinal(rank + 1)}
                    </span>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: p?.color || '#FFF',
                      flexShrink: 0,
                    }} />
                    <span style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 13,
                      color: isMe ? 'var(--sg)' : 'var(--bn)',
                      letterSpacing: 1,
                      flex: 1,
                    }}>
                      {isMe ? 'YOU' : (p?.name || 'UNKNOWN')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Settlement TX */}
          {settlementData?.txSignature && (
            <div style={s.settlementLine}>
              {'TX: ' + settlementData.txSignature.slice(0, 8) + '...' + settlementData.txSignature.slice(-8)}
            </div>
          )}
        </>
      )}

      {/* ── ACTION TAB ── */}
      {activeTab === 'action' && (
        <>
          {/* Buttons */}
          <div style={s.buttonRow}>
            <Button variant="primary" onClick={() => setShowCard(true)} style={{ fontSize: 14, padding: '10px 24px' }}>
              EXPORT YOUR CARD
            </Button>
            <Button variant="secondary" onClick={() => {
              const oppName = opponentId && playerMap[opponentId] ? playerMap[opponentId].name : 'UNKNOWN';
              const myDmg = myId && scores[myId] ? scores[myId].damageDealt || 0 : 0;
              const sigWeapon = playerStats?.signatureWeapon || 'CLASSIFIED';
              const text = `Just beat ${oppName} on SolShot \u{1F3AF}\n${myDmg} damage dealt. ${sigWeapon} main.\nsolshot.gg`;
              navigator.clipboard.writeText(text).catch(() => {});
            }} style={{ fontSize: 13, padding: '10px 20px' }}>
              COPY RESULT
            </Button>
          </div>
          <div style={s.buttonRow}>
            <Button variant="primary" onClick={() => navigate('barracks')} style={{ fontSize: 13, padding: '10px 20px' }}>
              VIEW BARRACKS
            </Button>
          </div>
          <div style={s.buttonRow}>
            <Button variant="primary" onClick={handleLobby} style={{ fontSize: 14, padding: '10px 24px' }}>
              PLAY AGAIN
            </Button>
            <Button variant="secondary" onClick={handleMenu} style={{ fontSize: 13, padding: '10px 20px' }}>
              EXIT
            </Button>
          </div>
        </>
      )}

      {/* Opponent left modal — always visible, outside tab conditionals */}
      {opponentLeft && (
        <Modal
          title="OPPONENT LEFT"
          message="Your opponent has disconnected."
          buttons={[{ label: 'LOBBY', variant: 'secondary', onClick: handleLobby }]}
          onClose={handleLobby}
        />
      )}

      {/* Stat Card overlay */}
      {showCard && playerStats && (
        <StatCard
          player={{
            callsign: playerStats.handle || playerStats.callsign || 'OPERATIVE',
            wins: playerStats.wins || 0,
            losses: playerStats.losses || 0,
            totalDamage: playerStats.totalDamage || 0,
            bestWinStreak: playerStats.bestWinStreak || 0,
            matchesPlayed: playerStats.matchesPlayed || 0,
            signatureWeapon: playerStats.signatureWeapon || null,
          }}
          onClose={() => setShowCard(false)}
        />
      )}
    </div>
  );
}

export default WinScreen;
