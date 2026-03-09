import React, { useCallback, useState, useRef } from 'react';

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
  label: (compact) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: compact ? 9 : 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.7,
    minWidth: compact ? 24 : 32,
  }),
  valueInput: (power, compact) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: compact ? 16 : 20,
    color: power > 80 ? 'var(--rg)' : power > 50 ? 'var(--am)' : 'var(--bn)',
    letterSpacing: 1,
    lineHeight: 1,
    minWidth: compact ? 26 : 32,
    width: compact ? 34 : 42,
    textAlign: 'right',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: 0,
    cursor: 'text',
    pointerEvents: 'auto',
  }),
  slider: (disabled, compact) => ({
    width: compact ? 70 : 120,
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

function PowerControl({ power, onChange, disabled, compact = false }) {
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
    <div style={s.container(compact)}>
      <span style={s.label(compact)}>PWR</span>
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
          ...s.valueInput(editing ? parseInt(editValue, 10) || 60 : displayPower, compact),
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
        style={s.slider(disabled, compact)}
      />
    </div>
  );
}

export default React.memo(PowerControl);
