import React, { useState } from 'react';

const baseStyle = {
  fontFamily: "'Black Ops One', cursive",
  fontSize: 13,
  letterSpacing: 3,
  textTransform: 'uppercase',
  cursor: 'pointer',
  padding: '10px 20px',
  borderRadius: 5,
  color: 'var(--bn)',
  transition: 'all 0.15s ease',
  textAlign: 'center',
  userSelect: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
};

const variants = {
  primary: {
    background: 'linear-gradient(180deg, #cc3300, #881a00)',
    border: '2px solid var(--rg)',
    boxShadow: '0 0 16px rgba(204, 51, 0, 0.3)',
  },
  secondary: {
    background: 'var(--od)',
    border: '1px solid var(--ol)',
    color: 'var(--kh)',
    boxShadow: 'none',
  },
  gold: {
    background: 'linear-gradient(180deg, var(--ad), #6a4a10)',
    border: '1px solid var(--am)',
    boxShadow: '0 0 12px rgba(255, 182, 39, 0.2)',
  },
  disabled: {
    background: 'var(--od)',
    border: '1px solid var(--ol)',
    color: 'var(--kh)',
    opacity: 0.45,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
};

const hoverVariants = {
  primary: {
    boxShadow: '0 0 24px rgba(204, 51, 0, 0.5)',
    background: 'linear-gradient(180deg, #dd4400, #992200)',
  },
  secondary: {
    borderColor: 'var(--rg)',
    color: 'var(--bn)',
    background: 'rgba(255, 107, 26, 0.08)',
  },
  gold: {
    boxShadow: '0 0 20px rgba(255, 182, 39, 0.4)',
  },
  disabled: {},
};

function Button({ variant = 'primary', children, onClick, style, disabled, ...props }) {
  const [hovered, setHovered] = useState(false);

  const effectiveVariant = disabled ? 'disabled' : variant;
  const variantStyle = variants[effectiveVariant] || variants.primary;
  const hoverStyle = hovered && !disabled ? (hoverVariants[effectiveVariant] || {}) : {};

  return (
    <button
      style={{
        ...baseStyle,
        ...variantStyle,
        ...hoverStyle,
        ...style,
      }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      {...props}
    >
      {children}
    </button>
  );
}

export default Button;
