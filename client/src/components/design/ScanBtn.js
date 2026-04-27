import React from 'react';

export default function ScanBtn({ children, onClick, width, height, fontSize = 28, style = {}, disabled = false }) {
  // When height is provided, use explicit height. Otherwise use padding (design spec: 28px 22px for PLAY).
  const sizeStyle = height
    ? { height }
    : { padding: '28px 22px' };

  return (
    <button onClick={disabled ? undefined : onClick} style={{
      position: 'relative',
      width: width || '100%',
      ...sizeStyle,
      background: disabled ? 'var(--muted)' : 'var(--accent)',
      border: disabled ? '1px solid var(--border)' : '1px solid var(--accent-hot)',
      clipPath: 'var(--clip-10)',
      cursor: disabled ? 'default' : 'pointer',
      overflow: 'hidden',
      boxShadow: disabled ? 'none' : '0 0 28px rgba(218,138,40,0.25)',
      opacity: disabled ? 0.5 : 1,
      marginBottom: 10,
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(10,8,2,0) 0 2px, rgba(10,8,2,0.35) 2px 3px)',
      }} />
      <span style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
        fontFamily: 'var(--f-display, "Black Ops One")',
        fontSize, color: '#0e1209', letterSpacing: '0.22em',
        textIndent: '0.22em', lineHeight: 1,
        textTransform: 'uppercase',
        textShadow: '0 1px 0 rgba(255,220,140,0.35)',
      }}>{children}</span>
    </button>
  );
}
