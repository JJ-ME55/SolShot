import React from 'react';
import Button from '../../components/Button';

const s = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(10, 12, 8, 0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    gap: 12,
  },
  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--rd)',
    letterSpacing: 4,
  },
  message: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 1.6,
    maxWidth: 300,
  },
  wagerWarning: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--rg)',
    letterSpacing: 1,
    padding: '4px 12px',
    border: '1px solid rgba(255, 107, 26, 0.3)',
    borderRadius: 3,
    background: 'rgba(255, 107, 26, 0.06)',
  },
  buttons: {
    display: 'flex',
    gap: 10,
    marginTop: 6,
  },
};

function ExitMenu({ wager, onConfirm, onCancel }) {
  return (
    <div style={s.overlay}>
      <div style={s.title}>EXIT MATCH</div>
      <div style={s.message}>
        Leaving the match will count as a forfeit.
      </div>

      {wager > 0 && (
        <div style={s.wagerWarning}>
          FORFEIT {wager} SOL WAGER
        </div>
      )}

      <div style={s.buttons}>
        <Button
          variant="primary"
          onClick={onConfirm}
          style={{ fontSize: 14, padding: '10px 24px' }}
        >
          FORFEIT
        </Button>
        <Button
          variant="secondary"
          onClick={onCancel}
          style={{ fontSize: 13, padding: '10px 20px' }}
        >
          CANCEL
        </Button>
      </div>
    </div>
  );
}

export default ExitMenu;
