import React, { useCallback } from 'react';

const s = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: 'rgba(10, 12, 8, 0.7)',
    borderRadius: 3,
    border: '1px solid var(--ol)',
  },
  arrow: (disabled) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: disabled ? 'var(--ol)' : 'var(--kh)',
    cursor: disabled ? 'default' : 'pointer',
    padding: '0 4px',
    userSelect: 'none',
    lineHeight: 1,
    transition: 'color 0.15s ease',
  }),
  weaponName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 10,
    color: 'var(--bn)',
    letterSpacing: 1,
    minWidth: 100,
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  ammo: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    textAlign: 'center',
    marginTop: 1,
  },
  nameBlock: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
};

function WeaponSelector({ weapons, currentIndex, onChange, disabled }) {
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

  return (
    <div style={s.container}>
      <span
        style={s.arrow(disabled || total <= 1)}
        onClick={handlePrev}
      >
        {'<'}
      </span>

      <div style={s.nameBlock}>
        <span style={s.weaponName}>
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
