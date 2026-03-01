import React, { useState } from 'react';

/* ── PrestigeIntro ──────────────────────────────────────────────────────────
   Contextual nudge introducing prestige system after sufficient gameplay.
   Rendered inline in the Progress tab — NOT a full-screen modal.

   Shows when ALL of:
     - localStorage 'solshot_prestige_intro_seen' is NOT set
     - matchesPlayed >= 3
     - currentTier is null/falsy (base/unranked player)
     - shotBalance > 0

   Props:
     currentTier (string|null)  — player's current prestige tier name
     shotBalance (number)       — player's SHOT token balance
     matchesPlayed (number)     — total matches played (from localStorage counter)
     onNavigatePrestige (fn)    — callback to navigate to PrestigeScreen
─────────────────────────────────────────────────────────────────────────── */

const styles = {
  card: {
    background: 'rgba(153, 69, 255, 0.08)',
    border: '1px solid rgba(153, 69, 255, 0.3)',
    borderRadius: 6,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  badge: {
    width: 40,
    height: 40,
    flexShrink: 0,
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  text: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1.5,
  },
  buttonRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: 8,
  },
  btnLearnMore: {
    padding: '5px 12px',
    background: '#9945FF',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  btnLater: {
    padding: '5px 12px',
    background: 'none',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    color: 'var(--kh)',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'pointer',
    opacity: 0.7,
  },
};

function PrestigeIntro({ currentTier, shotBalance, matchesPlayed, onNavigatePrestige }) {
  const [hidden, setHidden] = useState(false);

  // Check one-time seen flag
  if (localStorage.getItem('solshot_prestige_intro_seen')) return null;
  if (hidden) return null;

  // Check eligibility conditions
  if (matchesPlayed < 3) return null;
  if (currentTier) return null;
  if (!shotBalance || shotBalance <= 0) return null;

  const handleLearnMore = () => {
    localStorage.setItem('solshot_prestige_intro_seen', 'true');
    if (onNavigatePrestige) onNavigatePrestige();
  };

  const handleLater = () => {
    localStorage.setItem('solshot_prestige_intro_seen', 'true');
    setHidden(true);
  };

  return (
    <div style={styles.card}>
      <img
        src="/assets/images/badges/badge-bronze.png"
        alt="Bronze tier"
        style={styles.badge}
        draggable={false}
      />
      <div style={styles.content}>
        <div style={styles.text}>
          {'Ready to level up? Unlock prestige tiers and exclusive weapons! Coming soon.'}
        </div>
        <div style={styles.buttonRow}>
          <button style={styles.btnLearnMore} onClick={handleLearnMore}>
            Learn More
          </button>
          <button style={styles.btnLater} onClick={handleLater}>
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrestigeIntro;
