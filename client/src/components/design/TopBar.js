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
  const { walletAddress, connected, login: privyLogin, source } = useSolShotWallet();
  const { setVisible } = useWalletModal();

  // Connect handler — prefer Privy login modal (embedded wallet flow).
  // If Privy isn't configured (dev mode), fall back to wallet-adapter modal.
  const handleConnect = () => {
    if (privyLogin) {
      privyLogin();
    } else {
      setVisible(true);
    }
  };

  // Pill click — when connected via Privy, opens the Privy account modal
  // (manage wallets, export key, log out). When connected via adapter,
  // opens the wallet-adapter modal (disconnect, change wallet).
  const handlePillClick = () => {
    if (source === 'privy' && privyLogin) {
      // Privy doesn't expose an "open account" hook directly via usePrivy
      // — clicking the pill just keeps the address visible for now. A
      // dedicated Wallet screen ships in a follow-up commit with export
      // + withdraw + disconnect.
      return;
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
              title={walletAddress}
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                letterSpacing: '0.18em',
                background: 'var(--bg-raised)',
                color: 'var(--olive)',
                border: '1px solid var(--border)',
                padding: '5px 9px',
                cursor: 'pointer',
                clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))',
              }}
            >
              {addrShort}
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
