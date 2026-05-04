import React from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSolShotWallet } from '../../wallet/WalletContext';

/**
 * DesignTopBar — header used on Menu + similar hero screens.
 *
 * Right-side cluster shows different things depending on wallet state:
 *   - Disconnected: SIGN IN button that opens Privy's modal (email +
 *     embedded Solana wallet for new users; existing wallets still
 *     supported via Privy's external-wallet picker). Falls back to the
 *     wallet-adapter modal if Privy isn't configured (dev-mode default).
 *   - Connected: SHOT + SOL balances, plus a small truncated address pill
 *
 * Phase 2 of the Syndicate-pattern migration: Privy embedded wallet
 * replaces the wallet-adapter-only flow. Email login auto-provisions a
 * Solana wallet silently — first match should be one tap to start.
 */
export default function DesignTopBar({
  callsign = 'OPERATIVE',
  tier = 'UNRANKED',
  level = 1,
  shotBalance = 0,
  solBalance = 0,
  badgeSrc,
}) {
  const { walletAddress, connected, login: privyLogin, source, openPrivyAccount } = useSolShotWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = React.useState(false);

  // Connect handler — prefer Privy login modal (embedded wallet flow).
  // If Privy isn't configured (dev mode), fall back to wallet-adapter modal.
  const handleConnect = () => {
    if (privyLogin) {
      privyLogin();
    } else {
      setVisible(true);
    }
  };

  // Single-tap — copies the full Solana address to the clipboard so the
  // user can paste it into a funding source (Phantom on another device,
  // exchange withdrawal, etc.). For wallet-adapter users we also open
  // the wallet-adapter modal (which has change-wallet / disconnect).
  // For Privy users, double-tap opens the Privy account modal (handled
  // separately via onDoubleClick) — single-tap just copies.
  const handlePillClick = async () => {
    if (walletAddress) {
      try {
        await navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        // Clipboard API not available (e.g. http context) — fall through to modal
      }
    }
    if (source !== 'privy') {
      setVisible(true);
    }
  };

  // Double-tap — opens Privy's built-in account modal (full address,
  // balance, copy, export private key). For adapter users, falls back
  // to the wallet-adapter modal which has the equivalent controls.
  const handlePillDoubleClick = async () => {
    if (source === 'privy' && openPrivyAccount) {
      const opened = await openPrivyAccount();
      if (opened) return;
      // Fall through to adapter modal if Privy export failed
    }
    setVisible(true);
  };

  const addrShort = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <div style={{
      position: 'relative', zIndex: 3,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', padding: '14px 28px',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 10 }}>
        {badgeSrc && <img src={badgeSrc} style={{ width: 28, height: 28, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} alt="rank" />}
        <div>
          <div style={{ fontFamily: 'var(--f-sec)', fontSize: 13, color: 'var(--bone)', letterSpacing: '0.1em' }}>{callsign}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em' }}>{tier} · LVL {level}</div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 38, letterSpacing: '0.04em', lineHeight: 1, userSelect: 'none' }}>
        <span style={{ color: 'var(--bone)' }}>SOL</span>
        <span style={{ color: 'var(--accent)' }}>SHOT</span>
      </div>
      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em' }}>
        {connected ? (
          <>
            <span style={{ color: 'var(--accent)' }}>&#9670; {shotBalance.toLocaleString()} SHOT</span>
            <span style={{ color: 'var(--bone)' }}>&#9671; {solBalance.toFixed(2)} SOL</span>
            <button
              type="button"
              onClick={handlePillClick}
              onDoubleClick={handlePillDoubleClick}
              title={`${walletAddress}\n\nClick to copy · Double-click to manage wallet`}
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                background: copied ? 'var(--accent)' : 'var(--bg-raised)',
                color: copied ? 'var(--bg-deep)' : 'var(--olive)',
                border: '1px solid var(--border)',
                padding: '5px 9px',
                cursor: 'pointer',
                clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {copied ? 'COPIED' : addrShort}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleConnect}
            style={{
              fontFamily: 'var(--f-display)',
              fontSize: 12,
              letterSpacing: '0.18em',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              padding: '8px 14px',
              cursor: 'pointer',
              clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))',
            }}
          >
            SIGN IN
          </button>
        )}
      </div>
    </div>
  );
}
