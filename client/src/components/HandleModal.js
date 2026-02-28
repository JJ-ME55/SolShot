import React, { useState, useCallback } from 'react';
import Button from './Button';
import { validateHandle } from '../utils/handleValidation';

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9500,
    background: 'rgba(10, 12, 8, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'linear-gradient(180deg, #1a2010 0%, #0a0c08 100%)',
    border: '1px solid var(--ol)',
    borderRadius: 8,
    padding: '32px 40px',
    maxWidth: 420,
    width: '90%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    animation: 'eg 0.3s ease-out both',
  },
  logo: {
    width: 220,
    height: 'auto',
    objectFit: 'contain',
  },
  logoFallback: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  logoText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 32,
    letterSpacing: 2,
    lineHeight: 1,
  },
  heading: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 24,
    color: 'var(--bn)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 4,
  },
  warning: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    opacity: 0.7,
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 1.6,
  },
  inputWrap: {
    width: '100%',
    position: 'relative',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 16,
    color: 'var(--bn)',
    background: 'var(--od)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    outline: 'none',
    letterSpacing: 2,
    boxSizing: 'border-box',
  },
  charCount: {
    position: 'absolute',
    right: 12,
    bottom: -18,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
  },
  errorText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--rd)',
    letterSpacing: 1,
    height: 16,
    textAlign: 'center',
  },
  confirmHandle: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 28,
    color: 'var(--rg)',
    letterSpacing: 3,
    textAlign: 'center',
    padding: '4px 0',
  },
  btnRow: {
    display: 'flex',
    gap: 12,
    width: '100%',
  },
};

function HandleModal({ onComplete }) {
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);

  const result = validateHandle(input);

  const handleChange = useCallback((e) => {
    // Strip invalid chars as user types, enforce max 16
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
    if (val.length > 16) return;
    setInput(val);
    setError(null);
  }, []);

  const handleLockIn = useCallback(() => {
    const r = validateHandle(input);
    if (!r.valid) {
      setError(r.error);
      return;
    }
    setStep(2);
  }, [input]);

  const handleConfirm = useCallback(() => {
    const uid = crypto.randomUUID();
    localStorage.setItem('solshot_handle', result.sanitized);
    localStorage.setItem('solshot_uid', uid);
    onComplete(result.sanitized, uid);
  }, [result.sanitized, onComplete]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && result.valid) handleLockIn();
  }, [result.valid, handleLockIn]);

  return (
    <div style={s.overlay}>
      <div style={s.card}>
        {/* Logo */}
        {logoFailed ? (
          <div style={s.logoFallback}>
            <span style={{ ...s.logoText, color: 'var(--bn)' }}>SOL</span>
            <span style={{ ...s.logoText, color: 'var(--rd)' }}>SHOT</span>
          </div>
        ) : (
          <img
            src="/assets/images/branding/logo-transparent.png"
            alt="SolShot"
            onError={() => setLogoFailed(true)}
            style={s.logo}
          />
        )}

        {step === 1 ? (
          /* ---- STEP 1: Input ---- */
          <>
            <div style={s.heading}>PICK A NAME</div>
            <div style={s.warning}>
              Choose carefully — your handle is permanent.
              <br />
              No take-backs, no do-overs.
            </div>

            <div style={s.inputWrap}>
              <input
                type="text"
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder="Enter handle..."
                autoFocus
                maxLength={16}
                style={{
                  ...s.input,
                  borderColor: error
                    ? 'var(--rd)'
                    : input && result.valid
                      ? 'var(--rg)'
                      : 'var(--ol)',
                }}
              />
              <div
                style={{
                  ...s.charCount,
                  color: input.length > 13 ? 'var(--am)' : 'var(--kh)',
                  opacity: 0.5,
                }}
              >
                {input.length}/16
              </div>
            </div>

            <div style={s.errorText}>{error || '\u00A0'}</div>

            <Button
              variant="primary"
              disabled={!result.valid}
              onClick={handleLockIn}
              style={{ width: '100%', padding: '14px 24px' }}
            >
              LOCK IT IN
            </Button>
          </>
        ) : (
          /* ---- STEP 2: Confirmation ---- */
          <>
            <div style={s.heading}>LOCK IN AS</div>
            <div style={s.confirmHandle}>{result.sanitized}</div>
            <div style={s.warning}>This can't be changed. Ever.</div>

            <div style={s.btnRow}>
              <Button
                variant="secondary"
                onClick={() => setStep(1)}
                style={{ flex: 1, padding: '14px 0' }}
              >
                GO BACK
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirm}
                style={{ flex: 1, padding: '14px 0' }}
              >
                CONFIRM
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default HandleModal;
