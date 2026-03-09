import React, { useCallback } from 'react';
import { getWeaponIconUrl } from '../../data/weapons';

const s = {
  container: (compact) => ({
    display: 'flex',
    alignItems: 'center',
    gap: compact ? 4 : 6,
    padding: compact ? '3px 6px' : '4px 10px',
    background: 'rgba(10, 12, 8, 0.7)',
    borderRadius: 3,
    border: '1px solid var(--ol)',
  }),
  arrow: (disabled) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 20,
    color: disabled ? 'var(--ol)' : 'var(--kh)',
    cursor: disabled ? 'default' : 'pointer',
    padding: '0 6px',
    userSelect: 'none',
    lineHeight: 1,
    transition: 'color 0.15s ease',
  }),
  weaponName: (compact) => ({
    fontFamily: "'Black Ops One', cursive",
    fontSize: compact ? 11 : 14,
    color: 'var(--bn)',
    letterSpacing: 1,
    minWidth: compact ? 60 : 120,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  }),
  ammo: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 2,
  },
  nameBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};

function WeaponSelector({ weapons, currentIndex, onChange, disabled, compact = false }) {
  const current = weapons && weapons.length > 0
    ? weapons[currentIndex] || weapons[0]
    : { name: 'Single Shot' };

  const total = weapons ? weapons.length : 1;
  const idx = currentIndex || 0;

  const handlePrev = useCallback(() => {
    if (disabled || total <= 1) return;
    const newIdx = idx <= 0 ? total - 1 : idx - 1;
    onChange(newIdx);
  }, [disabled, total, idx, onChange]);

  const handleNext = useCallback(() => {
    if (disabled || total <= 1) return;
    const newIdx = idx >= total - 1 ? 0 : idx + 1;
    onChange(newIdx);
  }, [disabled, total, idx, onChange]);

  const iconSize = compact ? 20 : 32;

  return (
    <div style={s.container(compact)}>
      <span
        style={s.arrow(disabled || total <= 1)}
        onClick={handlePrev}
      >
        {'<'}
      </span>

      <div style={s.nameBlock}>
        <img src={getWeaponIconUrl(current.name || 'Single Shot')} alt="" style={{ width: iconSize, height: iconSize, objectFit: 'contain', imageRendering: 'pixelated', marginBottom: 3 }} onError={(e) => { e.target.style.display = 'none'; }} />
        <span style={s.weaponName(compact)}>
          {current.name || 'SINGLE SHOT'}
        </span>
        <span style={s.ammo}>
          {idx + 1}/{total}
        </span>
      </div>

      <span
        style={s.arrow(disabled || total <= 1)}
        onClick={handleNext}
      >
        {'>'}
      </span>
    </div>
  );
}

export default React.memo(WeaponSelector);
