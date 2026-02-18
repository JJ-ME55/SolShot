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
  value: (wind) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: wind > 0 ? 'var(--sg)' : wind < 0 ? 'var(--rg)' : 'var(--kh)',
    letterSpacing: 1,
    lineHeight: 1,
  }),
  arrow: (wind) => ({
    fontSize: 12,
    color: wind > 0 ? 'var(--sg)' : 'var(--rg)',
  }),
};

function WindDisplay({ wind }) {
  const dir = wind > 0 ? '>' : wind < 0 ? '<' : '--';
  return (
    <div style={s.container}>
      <span style={s.label}>WIND</span>
      <span style={s.arrow(wind)}>{dir}</span>
      <span style={s.value(wind)}>{Math.abs(wind || 0)}</span>
    </div>
  );
}

export default React.memo(WindDisplay);
