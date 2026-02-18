import React from 'react';

const s = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    pointerEvents: 'none',
  },
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
  },
  dots: {
    display: 'flex',
    gap: 4,
  },
  dot: (filled) => ({
    width: 8,
    height: 8,
    borderRadius: 1,
    background: filled ? 'var(--am)' : 'rgba(184, 168, 138, 0.15)',
    border: filled ? '1px solid var(--am)' : '1px solid var(--ol)',
    transition: 'all 0.2s ease',
  }),
};

function MoveCounter({ moves }) {
  const maxMoves = 4;
  const remaining = Math.max(0, Math.min(moves || 0, maxMoves));

  return (
    <div style={s.container}>
      <span style={s.label}>MOVES</span>
      <div style={s.dots}>
        {Array.from({ length: maxMoves }, (_, i) => (
          <div key={i} style={s.dot(i < remaining)} />
        ))}
      </div>
    </div>
  );
}

export default React.memo(MoveCounter);
