import React from 'react';

/* ── ShotExplainer ──────────────────────────────────────────────────────────
   One-time modal explaining SHOT tokens when a player first earns them.
   Shown once ever via localStorage 'solshot_shot_explained' flag.
   Props: isOpen (bool), onClose (fn)
─────────────────────────────────────────────────────────────────────────── */

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9800,
  },
  box: {
    background: '#1a1f14',
    border: '1px solid rgba(153, 69, 255, 0.4)',
    borderRadius: 8,
    padding: 24,
    maxWidth: 400,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    boxShadow: '0 8px 40px rgba(153, 69, 255, 0.2)',
  },
  header: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    color: '#ffcc00',
    letterSpacing: 3,
    lineHeight: 1,
    textAlign: 'center',
  },
  pointList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  point: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bullet: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: '#9945FF',
    letterSpacing: 1,
    flexShrink: 0,
    marginTop: 1,
  },
  pointText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1.5,
  },
  button: {
    width: '100%',
    padding: '12px 0',
    background: '#9945FF',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 3,
    textTransform: 'uppercase',
    cursor: 'pointer',
    marginTop: 4,
  },
};

function ShotExplainer({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.box} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>You earned SHOT!</div>

        <div style={styles.pointList}>
          <div style={styles.point}>
            <span style={styles.bullet}>01</span>
            <span style={styles.pointText}>
              {'SHOT is the SolShot game token. You earn it by playing matches.'}
            </span>
          </div>
          <div style={styles.point}>
            <span style={styles.bullet}>02</span>
            <span style={styles.pointText}>
              {'Burn SHOT to unlock prestige tiers: Bronze, Silver, Gold, Platinum, Diamond.'}
            </span>
          </div>
          <div style={styles.point}>
            <span style={styles.bullet}>03</span>
            <span style={styles.pointText}>
              {'Each tier unlocks exclusive weapons with unique abilities.'}
            </span>
          </div>
        </div>

        <button style={styles.button} onClick={onClose}>
          Got it!
        </button>
      </div>
    </div>
  );
}

export default ShotExplainer;
