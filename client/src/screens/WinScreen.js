import React, { useState, useEffect, useCallback, useRef } from 'react';
import Button from '../components/Button';
import Modal from '../components/Modal';
import ShareCard from '../components/ShareCard';
import PrestigeIntro from '../components/PrestigeIntro';
import TelegramShare from '../components/TelegramShare';
import useSocket from '../hooks/useSocket';
import { updatePracticeStats } from '../utils/practiceStats';

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
    fontSize: 14,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 6,
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


function WinScreen({ navigate, screenData }) {
  const [activeTab, setActiveTab] = useState('result');
  const [waitingRematch, setWaitingRematch] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [settlementData] = useState(screenData?.settlement || null);
  const [matchesPlayed, setMatchesPlayed] = useState(0);
  const shareCardRef = useRef(null);

  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const myId = window.socket?.id;

  // Record practice stats + increment matches-played counter
  useEffect(() => {
    var prev = parseInt(localStorage.getItem('solshot_matches_played') || '0', 10);
    var next = prev + 1;
    localStorage.setItem('solshot_matches_played', String(next));
    setMatchesPlayed(next);

    // Phase 27: Record win stats
    const myKills = scores[myId]?.kills || 0;
    const roundsPlayed = screenData?.round || 1;
    const myRoundWins = myId && roundWins[myId] ? roundWins[myId] : 0;
    const myDeaths = roundsPlayed - myRoundWins;
    const myDamage = scores[myId]?.damageDealt || 0;
    updatePracticeStats({ outcome: 'win', kills: myKills, deaths: myDeaths, damageDealt: myDamage });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Progress tab data
  const myMilestones = (screenData?.earnedMilestones && myId)
    ? (screenData.earnedMilestones[myId] || [])
    : [];
  const myPrestige = (screenData?.prestigeInfo && myId)
    ? (screenData.prestigeInfo[myId] || null)
    : null;
  // PrestigeIntro props
  const currentTierName = myPrestige && myPrestige.tier ? myPrestige.tier.name : null;
  const shotBalance = myPrestige ? (myPrestige.balance || 0) : 0;

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

          {/* Prestige intro nudge */}
          <PrestigeIntro
            currentTier={currentTierName}
            shotBalance={shotBalance}
            matchesPlayed={matchesPlayed}
            onNavigatePrestige={() => navigate('prestige')}
          />
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

          {/* Share buttons row */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                var text = 'Just won ' + (solWon > 0 ? solWon.toFixed(3) + ' SOL' : 'a match') + ' on @SolShotGG -- No download, skill-based artillery combat on Solana. solshot.gg';
                window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank', 'width=550,height=420');
              }}
            >
              SHARE ON X
            </button>

            {/* Share on Telegram */}
            <TelegramShare
              isWinner={true}
              playerScore={roundWins[myId] || 0}
              opponentScore={opponentId ? (roundWins[opponentId] || 0) : 0}
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
      <ShareCard ref={shareCardRef} isWin={true} solAmount={solWon} />
    </div>
  );
}

export default WinScreen;
