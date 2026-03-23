import React, { useCallback, useState, useRef } from 'react';

const s = {
  container: (compact, vertical) => ({
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    gap: vertical ? 2 : compact ? 4 : 6,
    padding: vertical ? '4px 3px' : compact ? '3px 6px' : '4px 10px',
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
  sliderVerticalWrap: {
    width: 6,
    height: 120,
    position: 'relative',
    overflow: 'visible',
  },
  sliderVertical: (disabled) => ({
    width: 120,
    height: 6,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'var(--od)',
    borderRadius: 2,
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transform: 'rotate(-90deg)',
    transformOrigin: 'center',
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -3,
    marginLeft: -60,
  }),
  unit: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    opacity: 0.5,
  },
};

function PowerControl({ power, onChange, disabled, readOnly = false, compact = false, vertical = false }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const sliderDisabled = disabled || readOnly;

  const handleSlider = useCallback((e) => {
    if (!disabled && !readOnly) {
      onChange(Number(e.target.value));
    }
  }, [disabled, readOnly, onChange]);

  const handleFocus = useCallback(() => {
    if (disabled || readOnly) return;
    setEditing(true);
    setEditValue(String(Math.round(power || 60)));
    setTimeout(() => inputRef.current?.select(), 0);
  }, [disabled, readOnly, power]);

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
    <div style={s.container(compact, vertical)}>
      <span style={s.label(compact)}>PWR</span>
      {readOnly ? (
        <span style={{
          ...s.valueInput(displayPower, compact),
          cursor: 'default',
          pointerEvents: 'none',
          ...(vertical ? { textAlign: 'center', width: 30, minWidth: 30 } : {}),
        }}>
          {displayPower}
        </span>
      ) : (
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
            ...(vertical ? { textAlign: 'center', width: 30, minWidth: 30 } : {}),
          }}
        />
      )}
      <span style={s.unit}>%</span>
      {vertical ? (
        <div style={s.sliderVerticalWrap}>
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={power || 60}
            onChange={readOnly ? () => {} : handleSlider}
            disabled={sliderDisabled}
            style={s.sliderVertical(sliderDisabled)}
          />
        </div>
      ) : (
        <input
          type="range"
          min={5}
          max={100}
          step={1}
          value={power || 60}
          onChange={readOnly ? () => {} : handleSlider}
          disabled={sliderDisabled}
          style={s.slider(sliderDisabled, compact)}
        />
      )}
    </div>
  );
}

export default React.memo(PowerControl);
