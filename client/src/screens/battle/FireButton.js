import React from 'react';

const s = {
  button: (disabled) => ({
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    letterSpacing: 4,
    padding: '12px 42px',
    borderRadius: 4,
    border: 'none',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--kh)' : '#fff',
    background: disabled
      ? 'var(--od)'
      : 'linear-gradient(180deg, var(--ru) 0%, var(--rd) 100%)',
    boxShadow: disabled
      ? 'none'
      : '0 0 12px rgba(204, 34, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.15s ease',
    textTransform: 'uppercase',
    userSelect: 'none',
  }),
};

function FireButton({ onClick, disabled }) {
  return (
    <button
      style={s.button(disabled)}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      FIRE
    </button>
  );
}

export default React.memo(FireButton);
