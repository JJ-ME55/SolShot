import React, { useEffect, useState } from 'react';
import { useSolShotWallet } from '../wallet/WalletContext';

/**
 * WelcomeModal — first-sign-in onboarding prompt.
 *
 * Shown once when `isFreshSignIn` flips true (set by Privy's
 * useLogin().onComplete when isNewUser === true). Two paths from here:
 *
 *   1. "ADD 0.05 SOL" — opens the Privy funding modal (Apple Pay /
 *      Google Pay / card). Most direct route to first wagered match.
 *   2. "SKIP" — dismiss; user can fund later via wallet menu, or hit
 *      the lobby balance gate which auto-prompts when they pick a
 *      wager > balance.
 *
 * Idempotency: backed by a localStorage flag so a refresh after dismiss
 * doesn't re-show. The Privy isFreshSignIn flag clears on first action,
 * but localStorage protects against the edge case of the user closing
 * the tab without acting before clearFreshSignIn fires.
 */
const STORAGE_KEY = 'solshot_welcome_modal_shown_v1';

export default function WelcomeModal() {
  const { isFreshSignIn, clearFreshSignIn, fundWallet, walletAddress } = useSolShotWallet();
  const [shown, setShown] = useState(false);
  const [funding, setFunding] = useState(false);

  // Open when freshSignIn flips true AND we haven't shown it before
  // (for this browser). Once shown, persist so refresh doesn't re-pop.
  useEffect(() => {
    if (!isFreshSignIn) return;
    if (!walletAddress) return; // wait for wallet to be ready
    try {
      const seenKey = `${STORAGE_KEY}:${walletAddress}`;
      if (localStorage.getItem(seenKey)) {
        // Already shown for this wallet — clear flag and bail
        clearFreshSignIn();
        return;
      }
      localStorage.setItem(seenKey, '1');
    } catch (_) {
      // localStorage unavailable (private mode etc.) — show anyway
    }
    setShown(true);
  }, [isFreshSignIn, walletAddress, clearFreshSignIn]);

  const handleAddSol = async () => {
    if (!fundWallet) return;
    setFunding(true);
    try {
      await fundWallet({ amount: '0.05' });
    } finally {
      setFunding(false);
      setShown(false);
      clearFreshSignIn();
    }
  };

  const handleSkip = () => {
    setShown(false);
    clearFreshSignIn();
  };

  if (!shown) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
          maxWidth: 420,
          width: '100%',
          padding: '32px 28px',
          clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Header — accent stripe + title */}
        <div style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 10,
          color: 'var(--accent)',
          letterSpacing: '0.3em',
          marginBottom: 8,
        }}>
          ◆ OPERATIVE — DEPLOY READY
        </div>
        <div style={{
          fontFamily: 'var(--f-display)',
          fontSize: 28,
          color: 'var(--bone)',
          letterSpacing: '0.06em',
          lineHeight: 1.1,
          marginBottom: 16,
        }}>
          WELCOME TO<br />
          <span style={{ color: 'var(--bone)' }}>SOL</span>
          <span style={{ color: 'var(--accent)' }}>SHOT</span>
        </div>

        {/* Body */}
        <div style={{
          fontFamily: 'var(--f-sec)',
          fontSize: 14,
          color: 'var(--bone)',
          lineHeight: 1.5,
          marginBottom: 24,
        }}>
          You're set up. To play wagered matches, you'll need a small
          amount of SOL in your wallet — we suggest{' '}
          <strong style={{ color: 'var(--accent)' }}>0.05 SOL</strong>{' '}
          to cover a few rounds plus fees.
        </div>

        <div style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 10,
          color: 'var(--olive)',
          letterSpacing: '0.18em',
          marginBottom: 22,
          paddingLeft: 12,
          borderLeft: '2px solid var(--accent)',
        }}>
          PAY WITH APPLE PAY · GOOGLE PAY · CARD<br />
          ARRIVES IN ~30s — NO EXCHANGE NEEDED
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button
            type="button"
            onClick={handleAddSol}
            disabled={funding}
            style={{
              fontFamily: 'var(--f-display)',
              fontSize: 13,
              letterSpacing: '0.18em',
              background: funding ? 'var(--muted)' : 'var(--accent)',
              color: funding ? 'var(--olive)' : 'var(--bg-deep)',
              border: 'none',
              padding: '12px 16px',
              cursor: funding ? 'default' : 'pointer',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          >
            {funding ? 'OPENING…' : '+ ADD 0.05 SOL'}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            disabled={funding}
            style={{
              fontFamily: 'var(--f-mono)',
              fontSize: 11,
              letterSpacing: '0.2em',
              background: 'transparent',
              color: 'var(--olive)',
              border: '1px solid var(--border)',
              padding: '10px 16px',
              cursor: 'pointer',
            }}
          >
            SKIP — I'LL ADD IT LATER
          </button>
        </div>

        {/* Footnote */}
        <div style={{
          fontFamily: 'var(--f-mono)',
          fontSize: 9,
          color: 'var(--olive)',
          letterSpacing: '0.2em',
          marginTop: 16,
          opacity: 0.6,
        }}>
          PRACTICE MODE IS FREE · NO SOL NEEDED
        </div>
      </div>
    </div>
  );
}
