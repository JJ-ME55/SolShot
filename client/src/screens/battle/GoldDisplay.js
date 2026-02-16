import React from 'react';

const s = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    background: 'rgba(10, 12, 8, 0.6)',
    borderRadius: 3,
    border: '1px solid var(--ol)',
    pointerEvents: 'none',
  },
  icon: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    color: 'var(--gd)',
  },
  value: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 12,
    color: 'var(--gd)',
    letterSpacing: 1,
    lineHeight: 1,
  },
};

function GoldDisplay({ gold }) {
  return (
    <div style={s.container}>
      <span style={s.icon}>G</span>
      <span style={s.value}>{gold || 0}</span>
    </div>
  );
}

export default React.memo(GoldDisplay);
