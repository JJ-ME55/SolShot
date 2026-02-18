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
  valueInput: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    color: 'var(--bn)',
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
    setEditValue(String(Math.round(angle || 45)));
    setTimeout(() => inputRef.current?.select(), 0);
  }, [disabled, angle]);

  const commitValue = useCallback(() => {
    setEditing(false);
    const num = parseInt(editValue, 10);
    if (!isNaN(num)) {
      onChange(Math.max(0, Math.min(180, num)));
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

  const displayAngle = Math.round(angle || 45);

  return (
    <div style={s.container}>
      <span style={s.label}>ANG</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={editing ? editValue : displayAngle}
        onChange={(e) => setEditValue(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={handleFocus}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{
          ...s.valueInput,
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'default' : 'text',
        }}
      />
      <span style={s.unit}>deg</span>
      <input
        type="range"
        min={0}
        max={180}
        step={1}
        value={angle || 45}
        onChange={handleSlider}
        disabled={disabled}
        style={s.slider(disabled)}
      />
    </div>
  );
}

export default React.memo(AngleControl);
