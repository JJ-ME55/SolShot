import React, { useState, useEffect, useRef } from 'react';

const MAX_HP = 250;

const s = {
  container: (side) => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: side === 'left' ? 'flex-start' : 'flex-end',
    gap: 4,
    pointerEvents: 'none',
    minWidth: 140,
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
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 1,
  },
  score: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    color: 'var(--gd)',
    letterSpacing: 2,
    lineHeight: 1,
  },
  hpBarOuter: (side) => ({
    width: 140,
    height: 14,
    borderRadius: 3,
    background: 'rgba(184, 168, 138, 0.12)',
    overflow: 'hidden',
    position: 'relative',
    border: '1px solid rgba(184, 168, 138, 0.2)',
  }),
  hpFillDamage: (pct, side) => ({
    position: 'absolute',
    top: 0,
    [side === 'right' ? 'right' : 'left']: 0,
    width: pct + '%',
    height: '100%',
    borderRadius: 2,
    background: 'rgba(255, 80, 60, 0.4)',
    transition: 'width 1.2s ease-out 0.3s',
  }),
  hpFill: (pct, side) => ({
    position: 'absolute',
    top: 0,
    [side === 'right' ? 'right' : 'left']: 0,
    width: pct + '%',
    height: '100%',
    borderRadius: 2,
    background: pct > 50
      ? 'linear-gradient(180deg, #4CAF50, #2E7D32)'
      : pct > 25
        ? 'linear-gradient(180deg, #FF9800, #E65100)'
        : 'linear-gradient(180deg, #f44336, #B71C1C)',
    transition: 'width 0.4s ease-out, background 0.5s ease',
    boxShadow: pct <= 25 ? '0 0 8px rgba(244, 67, 54, 0.5)' : 'none',
  }),
  hpText: (side) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
    letterSpacing: 1,
  }),
  damageFlash: {
    position: 'absolute',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: '#ff4444',
    textShadow: '0 0 6px rgba(255,0,0,0.6)',
    letterSpacing: 1,
    pointerEvents: 'none',
    animation: 'dmgFlash 1s ease-out forwards',
    zIndex: 10,
  },
};

function ScoreBoard({ tank, side }) {
  const rawHp = tank?.hp ?? MAX_HP;
  const hp = Math.max(0, Math.min(100, Math.round((rawHp / MAX_HP) * 100)));
  const prevHpRef = useRef(rawHp);
  const [damagePct, setDamagePct] = useState(hp);
  const [dmgPopup, setDmgPopup] = useState(null);

  // Trailing damage bar + damage popup
  useEffect(() => {
    const prevHp = prevHpRef.current;
    if (rawHp < prevHp) {
      const dmg = prevHp - rawHp;
      setDmgPopup(dmg);
      // Damage bar shows previous HP % briefly, then shrinks to current
      const timer = setTimeout(() => {
        setDamagePct(hp);
      }, 400);
      // Clear popup after animation
      const popupTimer = setTimeout(() => setDmgPopup(null), 1000);
      prevHpRef.current = rawHp;
      return () => {
        clearTimeout(timer);
        clearTimeout(popupTimer);
      };
    } else {
      setDamagePct(hp);
      prevHpRef.current = rawHp;
    }
  }, [rawHp, hp]);

  return (
    <div style={s.container(side)}>
      <div style={s.nameRow(side)}>
        <div style={s.colorDot(tank?.color)} />
        <span style={s.name}>{tank?.name || 'UNKNOWN'}</span>
      </div>
      <span style={s.score}>{tank?.score || 0}</span>
      <div style={{ position: 'relative' }}>
        <div style={s.hpBarOuter(side)}>
          {/* Trailing damage bar (red ghost) */}
          <div style={s.hpFillDamage(damagePct, side)} />
          {/* Current HP fill */}
          <div style={s.hpFill(hp, side)} />
          {/* HP number overlay */}
          <div style={s.hpText(side)}>
            {rawHp} / {MAX_HP}
          </div>
        </div>
        {/* Damage popup */}
        {dmgPopup && (
          <div style={{
            ...s.damageFlash,
            [side === 'left' ? 'right' : 'left']: -40,
            top: -2,
          }}>
            -{dmgPopup}
          </div>
        )}
      </div>

      {/* Inject keyframe for damage flash */}
      <style>{`
        @keyframes dmgFlash {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-16px); }
        }
      `}</style>
    </div>
  );
}

export default React.memo(ScoreBoard);
