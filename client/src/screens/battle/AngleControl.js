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
  label: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
    minWidth: 32,
  },
  value: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    color: 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1,
    minWidth: 32,
    textAlign: 'right',
  },
  slider: (disabled) => ({
    width: 120,
    height: 6,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'var(--od)',
    borderRadius: 2,
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }),
  unit: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    opacity: 0.5,
  },
};

function AngleControl({ angle, onChange, disabled }) {
  const handleChange = useCallback((e) => {
    if (!disabled) {
      onChange(Number(e.target.value));
    }
  }, [disabled, onChange]);

  return (
    <div style={s.container}>
      <span style={s.label}>ANG</span>
      <span style={s.value}>{Math.round(angle || 45)}</span>
      <span style={s.unit}>deg</span>
      <input
        type="range"
        min={0}
        max={180}
        step={1}
        value={angle || 45}
        onChange={handleChange}
        disabled={disabled}
        style={s.slider(disabled)}
      />
    </div>
  );
}

export default React.memo(AngleControl);
