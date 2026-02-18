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
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
  },
  value: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1,
  },
  separator: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    opacity: 0.5,
  },
};

function RoundCounter({ round, total }) {
  return (
    <div style={s.container}>
      <span style={s.label}>RND</span>
      <span style={s.value}>{round || 1}</span>
      <span style={s.separator}>/</span>
      <span style={s.value}>{total || 5}</span>
    </div>
  );
}

export default React.memo(RoundCounter);
