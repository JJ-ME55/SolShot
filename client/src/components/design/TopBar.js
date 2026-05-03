import React from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useSolShotWallet } from '../../wallet/WalletContext';

/**
 * DesignTopBar — header used on Menu + similar hero screens.
 *
 * Right-side cluster shows different things depending on wallet state:
 *   - Disconnected: a CONNECT WALLET button that opens the standard
 *     Solana wallet adapter modal (Phantom / Solflare / Jupiter Mobile)
 *   - Connected: SHOT + SOL balances, plus a small truncated address pill
 *
 * Earlier versions of this file had a comment claiming "SolShot uses
 * Dynamic embedded wallets, no connect step." That was true during the
 * Phase 8B Dynamic experiment, which is no longer in the codebase —
 * Dynamic broke on TG Web's nested-iframe context (frame-ancestors CSP)
 * and was removed. The standard wallet adapter is the only path now,
 * and connecting is an explicit user action.
 */
export default function DesignTopBar({
  callsign = 'OPERATIVE',
  tier = 'UNRANKED',
  level = 1,
  shotBalance = 0,
  solBalance = 0,
  badgeSrc,
}) {
  const { walletAddress, connected } = useSolShotWallet();
  const { setVisible } = useWalletModal();

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
              onClick={() => setVisible(true)}
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
            onClick={() => setVisible(true)}
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
            CONNECT WALLET
          </button>
        )}
      </div>
    </div>
  );
}
