import React from 'react';

const s = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    background: 'rgba(10, 12, 8, 0.6)',
    borderRadius: 3,
    border: '1px solid rgba(20, 241, 149, 0.2)',
    pointerEvents: 'none',
  },
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--sg)',
    letterSpacing: 1,
    opacity: 0.7,
  },
  value: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: 'var(--sg)',
    letterSpacing: 1,
    lineHeight: 1,
  },
};

function PotDisplay({ pot }) {
  return (
    <div style={s.container}>
      <span style={s.label}>POT</span>
      <span style={s.value}>{pot ? pot.toFixed(2) : '0.00'}</span>
    </div>
  );
}

export default React.memo(PotDisplay);
