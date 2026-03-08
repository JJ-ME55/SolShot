import React, { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import StatCard from '../components/StatCard';

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '16px 30px 20px',
    gap: 12,
    overflowY: 'auto',
  },

  /* Profile header */
  profileSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  callsignHero: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 28,
    color: 'var(--bn)',
    letterSpacing: 4,
    textAlign: 'center',
    lineHeight: 1,
  },
  handleSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.5,
    textTransform: 'uppercase',
  },

  /* Stats grid */
  statsSection: {
    width: '100%',
    maxWidth: 440,
    marginTop: 4,
  },
  statsLabel: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: 'var(--am)',
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 6,
  },
  statCard: {
    textAlign: 'center',
    padding: '8px 6px',
    background: 'rgba(42, 51, 31, 0.2)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    color: 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  statValueHighlight: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    color: 'var(--rg)',
    letterSpacing: 2,
    lineHeight: 1,
    textShadow: '0 0 8px rgba(255,107,26,0.3)',
  },
  statValueDim: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 24,
    color: 'rgba(184,168,138,0.25)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    marginTop: 3,
  },

  /* Win rate bar */
  winRateSection: {
    width: '100%',
    maxWidth: 440,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 2px',
  },
  wrLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: 'var(--kh)',
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    opacity: 0.5,
  },
  wrTrack: {
    flex: 1,
    height: 4,
    background: 'var(--od)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  wrFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg, var(--ru), var(--rg))',
    borderRadius: 2,
    transition: 'width 0.8s ease',
  }),
  wrPct: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: 'var(--kh)',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
  },

  /* Export button */
  exportBtn: {
    marginTop: 4,
  },

  /* Loading / status */
  statusLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.4,
  },

  /* Tab navigation */
  tabNav: {
    display: 'flex',
    gap: 0,
    maxWidth: 440,
    width: '100%',
    borderBottom: '1px solid var(--ol)',
  },
  tab: (active) => ({
    flex: 1,
    padding: '8px 0',
    cursor: 'pointer',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    color: active ? 'var(--am)' : 'var(--kh)',
    opacity: active ? 1 : 0.5,
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--am)' : '2px solid transparent',
    textTransform: 'uppercase',
    textAlign: 'center',
    userSelect: 'none',
  }),

  /* Leaderboard */
  lbTable: {
    width: '100%',
    maxWidth: 440,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  lbHeader: {
    display: 'grid',
    gridTemplateColumns: '30px 1fr 50px 50px 50px',
    gap: 6,
    padding: '6px 10px',
    borderBottom: '1px solid var(--ol)',
  },
  lbHeaderCell: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.5,
    textTransform: 'uppercase',
  },
  lbRow: (isMe) => ({
    display: 'grid',
    gridTemplateColumns: '30px 1fr 50px 50px 50px',
    gap: 6,
    padding: '7px 10px',
    background: isMe ? 'rgba(255, 107, 26, 0.08)' : 'rgba(42, 51, 31, 0.2)',
    border: isMe ? '1px solid rgba(255, 107, 26, 0.2)' : '1px solid var(--ol)',
    borderRadius: 3,
    alignItems: 'center',
  }),
  lbRank: (rank) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: rank === 1 ? '#ffcc00' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : 'var(--kh)',
    textAlign: 'center',
    lineHeight: 1,
  }),
  lbName: (isMe) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: isMe ? 'var(--rg)' : 'var(--bn)',
    letterSpacing: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  lbStat: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    textAlign: 'center',
  },
  lbStatHighlight: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--sg)',
    letterSpacing: 1,
    textAlign: 'center',
  },
};


function BarracksScreen({ navigate }) {
  const [stats, setStats] = useState(null);
  const [showCard, setShowCard] = useState(false);
  const [activeTab, setActiveTab] = useState('stats');
  const [leaderboard, setLeaderboard] = useState(null);

  useEffect(() => {
    const socket = window.socket;
    if (socket) {
      socket.emit('getStats');
      const handler = (data) => {
        setStats(data || {
          matchesPlayed: 0, wins: 0, losses: 0,
          totalDamage: 0, bestWinStreak: 0,
        });
      };
      socket.on('statsData', handler);
      return () => socket.off('statsData', handler);
    } else {
      setStats({ matchesPlayed: 0, wins: 0, losses: 0, totalDamage: 0, bestWinStreak: 0 });
    }
  }, []);

  useEffect(() => {
    const socket = window.socket;
    if (socket) {
      socket.emit('getLeaderboard');
      const handler = (data) => setLeaderboard(data?.players || []);
      socket.on('leaderboardData', handler);
      return () => socket.off('leaderboardData', handler);
    } else {
      setLeaderboard([]);
    }
  }, []);

  // Derived stats
  const matches = stats?.matchesPlayed || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const totalDamage = stats?.totalDamage || 0;
  const bestWinStreak = stats?.bestWinStreak || 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : null;
  const kd = losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? wins.toFixed(1) : null;
  const callsign = stats?.handle || stats?.callsign || 'OPERATIVE';
  const signatureWeapon = stats?.signatureWeapon || null;

  const fmt = (val) => val > 0 ? val : '--';
  const fmtDmg = (val) => val >= 1000 ? `${(val / 1000).toFixed(1)}K` : val > 0 ? val : '--';

  // Build player object for StatCard
  const playerData = {
    callsign,
    wins,
    losses,
    totalDamage,
    bestWinStreak,
    matchesPlayed: matches,
    signatureWeapon,
  };

  return (
    <>
      <TopBar title="BARRACKS" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Callsign header */}
        <div style={s.profileSection}>
          <div style={s.callsignHero}>{callsign.toUpperCase()}</div>
          <div style={s.handleSub}>PRACTICE MODE // SEASON ZERO</div>
        </div>

        {/* Tab Navigation */}
        <div style={s.tabNav}>
          <div style={s.tab(activeTab === 'stats')} onClick={() => setActiveTab('stats')}>
            YOUR STATS
          </div>
          <div style={s.tab(activeTab === 'leaderboard')} onClick={() => setActiveTab('leaderboard')}>
            LEADERBOARD
          </div>
        </div>

        {/* ── LEADERBOARD TAB ── */}
        {activeTab === 'leaderboard' && (
          <div style={s.lbTable}>
            <div style={s.lbHeader}>
              <div style={s.lbHeaderCell}>#</div>
              <div style={s.lbHeaderCell}>CALLSIGN</div>
              <div style={s.lbHeaderCell}>W</div>
              <div style={s.lbHeaderCell}>L</div>
              <div style={s.lbHeaderCell}>DMG</div>
            </div>
            {leaderboard === null ? (
              <div style={s.statusLine}>LOADING...</div>
            ) : leaderboard.length === 0 ? (
              <div style={{ ...s.statusLine, textAlign: 'center', padding: '20px 0' }}>
                NO PLAYERS YET -- BE THE FIRST
              </div>
            ) : (
              leaderboard.map((p, i) => {
                const isMe = p.callsign.toUpperCase() === callsign.toUpperCase();
                const fmtD = p.totalDamage >= 1000 ? `${(p.totalDamage / 1000).toFixed(1)}K` : p.totalDamage;
                return (
                  <div key={i} style={s.lbRow(isMe)}>
                    <div style={s.lbRank(i + 1)}>{i + 1}</div>
                    <div style={s.lbName(isMe)}>{p.callsign.toUpperCase()}</div>
                    <div style={s.lbStatHighlight}>{p.wins}</div>
                    <div style={s.lbStat}>{p.losses}</div>
                    <div style={s.lbStat}>{fmtD}</div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── STATS TAB ── */}
        {activeTab === 'stats' && (
        <>
        <div style={s.statsSection}>
          <div style={s.statsLabel}>COMBAT RECORD</div>

          {stats === null ? (
            <div style={s.statusLine}>LOADING STATS...</div>
          ) : matches === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 13, color: 'var(--kh)', letterSpacing: 2, opacity: 0.5, marginBottom: 12 }}>
                PLAY YOUR FIRST MATCH TO SEE STATS HERE
              </div>
              <Button variant="primary" onClick={() => navigate('lobby')} style={{ fontSize: 13, padding: '10px 28px', letterSpacing: 2 }}>
                FIND A MATCH
              </Button>
            </div>
          ) : (
            <>
              <div style={s.statsGrid}>
                <div style={s.statCard}>
                  <div style={matches > 0 ? s.statValue : s.statValueDim}>{fmt(matches)}</div>
                  <div style={s.statLabel}>MATCHES</div>
                </div>
                <div style={s.statCard}>
                  <div style={wins > 0 ? s.statValueHighlight : s.statValueDim}>{fmt(wins)}</div>
                  <div style={s.statLabel}>WINS</div>
                </div>
                <div style={s.statCard}>
                  <div style={losses > 0 ? s.statValue : s.statValueDim}>{fmt(losses)}</div>
                  <div style={s.statLabel}>LOSSES</div>
                </div>
                <div style={s.statCard}>
                  <div style={winRate != null ? s.statValue : s.statValueDim}>
                    {winRate != null ? winRate + '%' : '--'}
                  </div>
                  <div style={s.statLabel}>WIN RATE</div>
                </div>
                <div style={s.statCard}>
                  <div style={totalDamage > 0 ? s.statValue : s.statValueDim}>{fmtDmg(totalDamage)}</div>
                  <div style={s.statLabel}>DMG DEALT</div>
                </div>
                <div style={s.statCard}>
                  <div style={bestWinStreak > 0 ? s.statValueHighlight : s.statValueDim}>
                    {bestWinStreak > 0 ? `${bestWinStreak}W` : '--'}
                  </div>
                  <div style={s.statLabel}>BEST STREAK</div>
                </div>
              </div>

              {/* K/D row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                <div style={s.statCard}>
                  <div style={kd != null ? s.statValue : s.statValueDim}>
                    {kd != null ? kd : '--'}
                  </div>
                  <div style={s.statLabel}>K / D</div>
                </div>
                <div style={s.statCard}>
                  <div style={signatureWeapon && signatureWeapon !== 'Single Shot' ? s.statValueHighlight : s.statValueDim}>
                    {signatureWeapon && signatureWeapon !== 'Single Shot' ? signatureWeapon.toUpperCase() : 'CLASSIFIED'}
                  </div>
                  <div style={s.statLabel}>SIG. WEAPON</div>
                </div>
              </div>

              {/* Win rate visual bar */}
              <div style={{ marginTop: 8 }}>
                <div style={s.winRateSection}>
                  <div style={s.wrLabel}>Win Rate</div>
                  <div style={s.wrTrack}>
                    <div style={s.wrFill(winRate || 0)} />
                  </div>
                  <div style={s.wrPct}>{winRate != null ? winRate + '%' : '--%'}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Export Stat Card */}
        <div style={s.exportBtn}>
          <Button
            variant="primary"
            onClick={() => setShowCard(true)}
            style={{ fontSize: 13, padding: '10px 28px', letterSpacing: 2 }}
          >
            EXPORT STAT CARD
          </Button>
        </div>

        <div style={s.statusLine}>
          {matches > 0 ? `${matches} MATCHES TRACKED` : 'PLAY MATCHES TO BUILD YOUR RECORD'}
        </div>
        </>
        )}
      </div>

      {/* Stat Card overlay */}
      {showCard && (
        <StatCard
          player={playerData}
          onClose={() => setShowCard(false)}
        />
      )}
    </>
  );
}

export default BarracksScreen;
