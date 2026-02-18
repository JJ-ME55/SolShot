import React, { useCallback, useState, useRef } from 'react';

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
  valueInput: (power) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    color: power > 80 ? 'var(--rg)' : power > 50 ? 'var(--am)' : 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1,
    minWidth: 32,
    width: 42,
    textAlign: 'right',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: 0,
    cursor: 'text',
    pointerEvents: 'auto',
  }),
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

function PowerControl({ power, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const handleSlider = useCallback((e) => {
    if (!disabled) {
      onChange(Number(e.target.value));
    }
  }, [disabled, onChange]);

  const handleFocus = useCallback(() => {
    if (disabled) return;
    setEditing(true);
    setEditValue(String(Math.round(power || 60)));
    setTimeout(() => inputRef.current?.select(), 0);
  }, [disabled, power]);

  const commitValue = useCallback(() => {
    setEditing(false);
    const num = parseInt(editValue, 10);
    if (!isNaN(num)) {
      onChange(Math.max(5, Math.min(100, num)));
    }
  }, [editValue, onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
    // Stop Phaser from capturing these keys while typing
    e.stopPropagation();
  }, []);

  const displayPower = Math.round(power || 60);

  return (
    <div style={s.container}>
      <span style={s.label}>PWR</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={editing ? editValue : displayPower}
        onChange={(e) => setEditValue(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={handleFocus}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{
          ...s.valueInput(editing ? parseInt(editValue, 10) || 60 : displayPower),
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'default' : 'text',
        }}
      />
      <span style={s.unit}>%</span>
      <input
        type="range"
        min={5}
        max={100}
        step={1}
        value={power || 60}
        onChange={handleSlider}
        disabled={disabled}
        style={s.slider(disabled)}
      />
    </div>
  );
}

export default React.memo(PowerControl);
