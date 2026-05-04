import React from 'react';
import { useSolShotWallet } from '../../wallet/WalletContext';

/**
 * DesignTopBar — header used on Menu + similar hero screens.
 *
 * Right-side cluster shows different things depending on wallet state:
 *   - Disconnected: SIGN IN button that opens Privy's modal (email or
 *     Telegram login → embedded Solana wallet provisioned silently).
 *   - Connected: SHOT + SOL balances, plus a small truncated address pill
 *     - Single-tap: copy address to clipboard
 *     - Double-tap: open Privy's wallet-management modal (export key,
 *       full address view)
 *
 * Privy is the single sign-in path. The wallet-adapter (Phantom/Solflare
 * extension auto-connect) was stripped to simplify UX to a two-button
 * sign-in: Email or Telegram.
 */
export default function DesignTopBar({
  callsign = 'OPERATIVE',
  tier = 'UNRANKED',
  level = 1,
  shotBalance = 0,
  solBalance = 0,
  badgeSrc,
}) {
  const { walletAddress, connected, login, openPrivyAccount } = useSolShotWallet();
  const [copied, setCopied] = React.useState(false);

  // Connect handler — opens Privy login modal (email + Telegram options).
  const handleConnect = () => {
    if (login) login();
  };

  // Single-tap — copy the full Solana address to the clipboard so the
  // user can paste it into a funding source (CEX withdrawal, friend's
  // app, etc.). Double-tap opens Privy's account modal (handled below).
  const handlePillClick = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      // Clipboard API not available (e.g. http context) — silent
    }
  };

  // Double-tap — opens Privy's built-in account modal (full address +
  // private-key reveal). No-op if Privy isn't ready (dev-mode fallback).
  const handlePillDoubleClick = async () => {
    if (openPrivyAccount) {
      await openPrivyAccount();
    }
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
