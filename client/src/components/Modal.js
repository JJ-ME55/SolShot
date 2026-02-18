import React from 'react';
import Button from './Button';

const styles = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10, 12, 8, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    background: 'linear-gradient(180deg, #1a2010, #0a0c08)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    padding: '20px 28px',
    minWidth: 260,
    maxWidth: 360,
    textAlign: 'center',
    animation: 'sc 0.3s ease-out both',
  },
  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--bn)',
    letterSpacing: 2,
    marginBottom: 10,
  },
  message: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 1,
    lineHeight: 1.6,
    marginBottom: 16,
  },
  buttons: {
    display: 'flex',
    gap: 8,
    justifyContent: 'center',
  },
};

function Modal({ title, message, buttons = [], onClose }) {
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {title && <div style={styles.title}>{title}</div>}
        {message && <div style={styles.message}>{message}</div>}
        <div style={styles.buttons}>
          {buttons.map((btn, i) => (
            <Button
              key={i}
              variant={btn.variant || 'secondary'}
              onClick={btn.onClick}
              style={{ fontSize: 14, padding: '10px 20px' }}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Modal;
