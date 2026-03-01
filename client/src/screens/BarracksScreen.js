import React, { useState, useEffect } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import CombatCard from '../components/CombatCard';
import { PRESTIGE_TIERS } from '../data/tiers';
import { useSolShotWallet } from '../wallet/WalletContext';

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
  badgeRing: (color) => ({
    width: 90,
    height: 90,
    borderRadius: '50%',
    border: `3px solid ${color}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 12px ${color}33`,
  }),
  badgeText: (color) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 32,
    color: color,
    lineHeight: 1,
  }),
  rankName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--bn)',
    letterSpacing: 3,
    textAlign: 'center',
  },
  walletAddress: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    padding: '3px 10px',
    border: '1px solid var(--ol)',
    borderRadius: 3,
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
};


function BarracksScreen({ navigate }) {
  const [stats, setStats] = useState(null); // null = loading, object = loaded
  const [showCard, setShowCard] = useState(false);

  // CS-04: Use context hook instead of window.solWallet
  const { walletAddress, connected, prestigeInfo: contextPrestige } = useSolShotWallet();

  const prestige = contextPrestige || { tier: 0, tierName: 'Unranked' };

  useEffect(() => {
    // Fetch persistent stats from server
    const socket = window.socket;
    if (socket) {
      socket.emit('getStats');
      const handler = (data) => {
        setStats(data || {
          matchesPlayed: 0, wins: 0, losses: 0,
          totalSolWon: 0, totalSolLost: 0, totalShotEarned: 0,
        });
      };
      socket.on('statsData', handler);
      return () => socket.off('statsData', handler);
    } else {
      // No socket — show zeros
      setStats({ matchesPlayed: 0, wins: 0, losses: 0, totalSolWon: 0, totalSolLost: 0, totalShotEarned: 0 });
    }
  }, []);

  const currentTier = PRESTIGE_TIERS[prestige.tier] || PRESTIGE_TIERS[0];

  const displayAddr = walletAddress
    ? walletAddress.slice(0, 6) + '...' + walletAddress.slice(-6)
    : 'NOT CONNECTED';

  // Derived stats
  const matches = stats?.matchesPlayed || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : null;
  const solEarned = stats?.totalSolWon || 0;
  const shotEarned = stats?.totalShotEarned || 0;
  const kills = stats?.kills || 0;
  const deaths = stats?.deaths || 0;
  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? kills.toFixed(1) : null;

  const fmt = (val) => val > 0 ? val : '--';
  const fmtSol = (val) => val > 0 ? val.toFixed(3) : '--';
  const fmtShot = (val) => val > 0 ? val.toLocaleString() : '--';

  return (
    <>
      <TopBar title="BARRACKS" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Profile */}
        <div style={s.profileSection}>
          <div style={s.badgeRing(currentTier.color)}>
            <span style={s.badgeText(currentTier.color)}>
              P{currentTier.tier}
            </span>
          </div>
          <div style={s.rankName}>{currentTier.name.toUpperCase()}</div>
          <div style={s.walletAddress}>{'* ' + displayAddr}</div>
        </div>

        {/* Stats */}
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
                  <div style={solEarned > 0 ? s.statValue : s.statValueDim}>{fmtSol(solEarned)}</div>
                  <div style={s.statLabel}>SOL EARNED</div>
                </div>
                <div style={s.statCard}>
                  <div style={s.statValueDim}>???</div>
                  <div style={s.statLabel}>SHOT EARNED</div>
                </div>
              </div>

              {/* K/D and Total Kills row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginTop: 6 }}>
                <div style={s.statCard}>
                  <div style={kd != null ? s.statValue : s.statValueDim}>
                    {kd != null ? kd : '--'}
                  </div>
                  <div style={s.statLabel}>K/D RATIO</div>
                </div>
                <div style={s.statCard}>
                  <div style={kills > 0 ? s.statValue : s.statValueDim}>{kills > 0 ? kills : '--'}</div>
                  <div style={s.statLabel}>TOTAL KILLS</div>
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

        {/* Export Combat Card */}
        <div style={s.exportBtn}>
          <Button
            variant="primary"
            onClick={() => setShowCard(true)}
            style={{ fontSize: 13, padding: '10px 28px', letterSpacing: 2 }}
          >
            EXPORT COMBAT CARD
          </Button>
        </div>

        <div style={s.statusLine}>
          {matches > 0 ? `${matches} MATCHES TRACKED` : 'PLAY MATCHES TO BUILD YOUR RECORD'}
        </div>
      </div>

      {/* Combat Card overlay */}
      {showCard && (
        <CombatCard
          handle={displayAddr.slice(0, 6)}
          rank={currentTier.name}
          wallet={displayAddr}
          stats={{ ...stats, kills, deaths }}
          onClose={() => setShowCard(false)}
        />
      )}
    </>
  );
}

export default BarracksScreen;
