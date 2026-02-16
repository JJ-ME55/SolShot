import React from 'react';

const s = {
  container: (side) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: side === 'left' ? 'flex-start' : 'flex-end',
    gap: 3,
    pointerEvents: 'none',
    minWidth: 100,
  }),
  nameRow: (side) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexDirection: side === 'left' ? 'row' : 'row-reverse',
  }),
  colorDot: (color) => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color || '#FFF',
  }),
  name: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 9,
    color: 'var(--bn)',
    letterSpacing: 1,
  },
  score: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    color: 'var(--gd)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  hpBar: {
    width: 80,
    height: 4,
    borderRadius: 2,
    background: 'rgba(184, 168, 138, 0.15)',
    overflow: 'hidden',
  },
  hpFill: (pct, side) => ({
    width: pct + '%',
    height: '100%',
    borderRadius: 2,
    background: pct > 50 ? 'var(--sg)' : pct > 25 ? 'var(--am)' : 'var(--rd)',
    transition: 'width 0.5s ease, background 0.5s ease',
    float: side === 'right' ? 'right' : 'left',
  }),
};

function ScoreBoard({ tank, side }) {
  const hp = tank?.hp ?? 100;
  return (
    <div style={s.container(side)}>
      <div style={s.nameRow(side)}>
        <div style={s.colorDot(tank?.color)} />
        <span style={s.name}>{tank?.name || 'UNKNOWN'}</span>
      </div>
      <span style={s.score}>{tank?.score || 0}</span>
      <div style={s.hpBar}>
        <div style={s.hpFill(hp, side)} />
      </div>
    </div>
  );
}

export default React.memo(ScoreBoard);
