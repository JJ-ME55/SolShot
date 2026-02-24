import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import JupiterSwap from '../components/JupiterSwap';
import ShareCard from '../components/ShareCard';
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

  /* ── Progress tab ── */
  progressSection: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  sectionHeading: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  milestoneItem: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(42, 51, 31, 0.2)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    padding: '8px 12px',
    margin: '3px 0',
  },
  milestoneLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--bn)',
    letterSpacing: 1,
  },
  milestoneReward: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: '#9945FF',
    letterSpacing: 1,
  },
  emptyMilestone: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.5,
    textAlign: 'center',
    padding: '8px 0',
  },
  prestigeBox: {
    background: 'rgba(42, 51, 31, 0.2)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    padding: '10px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  prestigeTierName: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 18,
    color: color || 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
  }),
  prestigeBarTrack: {
    width: '100%',
    height: 6,
    background: 'var(--od)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  prestigeBarFill: (pct) => ({
    width: (pct > 100 ? 100 : pct) + '%',
    height: '100%',
    background: 'linear-gradient(90deg, var(--ru), var(--rg))',
    borderRadius: 3,
    transition: 'width 0.6s ease',
  }),
  prestigeBarLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
  },
  maxTierLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: '#ffcc00',
    letterSpacing: 2,
    textAlign: 'center',
    padding: '4px 0',
  },
  matchesPlayedLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
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


function LoseScreen({ navigate, screenData }) {
  const [activeTab, setActiveTab] = useState('result');
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [shotPrice, setShotPrice] = useState(null);
  const shareCardRef = useRef(null);

  // Fetch current SHOT price from server (via getShotPrice socket handler)
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
  const myId = window.socket?.id;
  const myGold = screenData?.goldBalance && myId ? screenData.goldBalance[myId] : 0;

  // Progress tab data
  const myMilestones = (screenData?.earnedMilestones && myId)
    ? (screenData.earnedMilestones[myId] || [])
    : [];
  const myPrestige = (screenData?.prestigeInfo && myId)
    ? (screenData.prestigeInfo[myId] || null)
    : null;

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

  // Prestige progress bar percentage
  const prestigePct = myPrestige && myPrestige.nextTier && myPrestige.nextTier.burnCost > 0
    ? (myPrestige.balance / myPrestige.nextTier.burnCost) * 100
    : 0;

  return (
    <div style={s.container}>
      <img
        src="/assets/images/branding/lose-screen.png"
        alt="Defeat"
        style={s.heroBanner}
        draggable={false}
      />

      {/* Tab Navigation */}
      <div style={s.tabNav}>
        <div style={s.tab(activeTab === 'result')} onClick={() => setActiveTab('result')}>
          RESULT
        </div>
        <div style={s.tab(activeTab === 'progress')} onClick={() => setActiveTab('progress')}>
          PROGRESS
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
        </>
      )}

      {/* ── PROGRESS TAB ── */}
      {activeTab === 'progress' && (
        <div style={s.progressSection}>

          {/* SHOT Milestones Earned */}
          <div>
            <div style={s.sectionHeading}>MILESTONES EARNED</div>
            {myMilestones.length > 0 ? (
              myMilestones.map((ms, i) => (
                <div key={ms.id || i} style={s.milestoneItem}>
                  <span style={s.milestoneLabel}>{ms.label}</span>
                  <span style={s.milestoneReward}>{'+' + ms.reward + ' SHOT'}</span>
                </div>
              ))
            ) : (
              <div style={s.emptyMilestone}>No new milestones this match</div>
            )}
          </div>

          {/* Prestige Progress */}
          {myPrestige && (
            <div>
              <div style={s.sectionHeading}>PRESTIGE PROGRESS</div>
              <div style={s.prestigeBox}>
                <div style={s.prestigeTierName(myPrestige.tier && myPrestige.tier.color)}>
                  {myPrestige.tier ? myPrestige.tier.name.toUpperCase() : 'UNRANKED'}
                </div>

                {myPrestige.nextTier ? (
                  <>
                    <div style={s.prestigeBarTrack}>
                      <div style={s.prestigeBarFill(prestigePct)} />
                    </div>
                    <div style={s.prestigeBarLabel}>
                      {myPrestige.balance + ' / ' + myPrestige.nextTier.burnCost + ' SHOT to ' + myPrestige.nextTier.name}
                    </div>
                  </>
                ) : (
                  <div style={s.maxTierLabel}>MAX TIER REACHED</div>
                )}

                {myPrestige.matchesPlayed != null && (
                  <div style={s.matchesPlayedLabel}>
                    {'MATCHES PLAYED: ' + myPrestige.matchesPlayed}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ACTION TAB ── */}
      {activeTab === 'action' && (
        <>
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

          {/* Share on X */}
          <button
            style={{
              background: 'none',
              border: '1px solid var(--ol)',
              borderRadius: 4,
              color: 'var(--kh)',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              letterSpacing: 2,
              padding: '8px 20px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              opacity: 0.8,
            }}
            onClick={async () => {
              if (shareCardRef.current) {
                await shareCardRef.current.exportToClipboard();
              }
              var text = 'Tough loss on @SolShotGG -- Run it back? No download, skill-based artillery combat on Solana. solshot.gg';
              window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank', 'width=550,height=420');
            }}
          >
            SHARE ON X
          </button>

          {/* Jupiter Swap CTA with price context */}
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', letterSpacing: 1, opacity: 0.6, marginBottom: 4 }}>
              GET SHOT FOR PRESTIGE UPGRADES
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

      {/* Offscreen ShareCard — rendered for html2canvas capture, invisible to user */}
      <ShareCard ref={shareCardRef} isWin={false} solAmount={wager} shotEarned={0} />
    </div>
  );
}

export default LoseScreen;
