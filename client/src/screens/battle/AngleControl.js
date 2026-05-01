import React, { useCallback, useState, useRef } from 'react';

// Track height bumped 6px → 12px for thumb-friendliness on phones
// (the actual draggable thumb is 12×12 per index.css; matching the
// track to that size makes the hit area visually obvious + easier to
// tap accurately during a turn).
const TRACK_H = 12;

const s = {
  container: (compact, vertical) => ({
    display: 'flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    gap: vertical ? 2 : compact ? 4 : 6,
    padding: vertical ? '4px 3px' : compact ? '3px 6px' : '4px 10px',
    background: 'rgba(10, 12, 8, 0.7)',
    clipPath: 'var(--clip-6)',
    border: '1px solid var(--border)',
  }),
  label: (compact) => ({
    fontFamily: 'var(--f-mono)',
    fontSize: compact ? 9 : 11,
    color: 'var(--olive)',
    letterSpacing: '0.15em',
    opacity: 0.85,
    minWidth: compact ? 24 : 32,
  }),
  valueInput: (compact) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: compact ? 16 : 20,
    color: 'var(--bone)',
    letterSpacing: '0.05em',
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
    height: TRACK_H,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'var(--bg-raised)',
    borderRadius: 0,
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  }),
  sliderVerticalWrap: {
    width: TRACK_H,
    height: 120,
    position: 'relative',
    overflow: 'visible',
  },
  sliderVertical: (disabled) => ({
    width: 120,
    height: TRACK_H,
    appearance: 'none',
    WebkitAppearance: 'none',
    background: 'var(--bg-raised)',
    borderRadius: 0,
    outline: 'none',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    transform: 'rotate(-90deg)',
    transformOrigin: 'center',
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -(TRACK_H / 2),
    marginLeft: -60,
  }),
  unit: {
    fontFamily: 'var(--f-mono)',
    fontSize: 11,
    color: 'var(--olive)',
    opacity: 0.6,
  },
};

function AngleControl({ angle, onChange, disabled, compact = false, vertical = false }) {
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
    <div style={s.container(compact, vertical)}>
      <span style={s.label(compact)}>ANG</span>
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
          ...s.valueInput(compact),
          opacity: disabled ? 0.4 : 1,
          cursor: disabled ? 'default' : 'text',
          ...(vertical ? { textAlign: 'center', width: 30, minWidth: 30 } : {}),
        }}
      />
      <span style={s.unit}>deg</span>
      {vertical ? (
        <div style={s.sliderVerticalWrap}>
          <input
            type="range"
            min={0}
            max={180}
            step={1}
            value={angle || 45}
            onChange={handleSlider}
            disabled={disabled}
            style={s.sliderVertical(disabled)}
          />
        </div>
      ) : (
        <input
          type="range"
          min={0}
          max={180}
          step={1}
          value={angle || 45}
          onChange={handleSlider}
          disabled={disabled}
          style={s.slider(disabled, compact)}
        />
      )}
    </div>
  );
}

export default React.memo(AngleControl);
