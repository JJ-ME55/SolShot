import React, { useState, useEffect, useCallback } from 'react';
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
    borderRadius: 6,
    marginBottom: 2,
    animation: 'sm 0.5s ease-out both',
    filter: 'drop-shadow(0 4px 20px rgba(204, 34, 0, 0.3))',
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
    padding: '8px 20px',
    cursor: 'pointer',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    color: active ? 'var(--am)' : 'var(--kh)',
    opacity: active ? 1 : 0.5,
    background: 'none',
    border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: 2,
    borderBottomColor: active ? 'var(--am)' : 'transparent',
    textTransform: 'uppercase',
    userSelect: 'none',
  }),

  /* ── Result tab ── */
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


function LoseScreen({ navigate, screenData }) {
  const [activeTab, setActiveTab] = useState('result');
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);

  const isAIMatch = screenData?.isAIMatch || false;
  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const myId = window.socket?.id;

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

  return (
    <div style={s.container}>
      <img
        src="/assets/images/branding/lose-screen.png"
        alt="Defeat"
        style={s.heroBanner}
        draggable={false}
      />

      {/* AI Practice banner */}
      {isAIMatch && (
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          padding: '5px 16px',
          borderRadius: 6,
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: 2,
          marginBottom: 4,
        }}>
          PRACTICE VS AI — STATS NOT RECORDED
        </div>
      )}

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
          {/* Loss Card */}
          {wager > 0 && (
            <div style={s.lossCard}>
              <div style={s.lossValue}>{'-' + wager.toFixed(3)}</div>
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
                    background: isMe ? 'rgba(204, 34, 0, 0.08)' : 'rgba(42, 51, 31, 0.2)',
                    border: isMe ? '1px solid rgba(204, 34, 0, 0.2)' : '1px solid var(--ol)',
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
                      color: isMe ? 'var(--rd)' : 'var(--bn)',
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
              const text = `Lost to ${oppName} on SolShot \u{1F4A5}\n${myDmg} damage dealt. ${sigWeapon} main.\nsolshot.gg`;
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
            <Button variant="primary" onClick={isAIMatch ? () => navigate('ai-practice') : handleLobby} style={{ fontSize: 14, padding: '10px 24px' }}>
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

export default LoseScreen;
