import React from 'react';

/**
 * DesignTopBar — header used on Menu + similar hero screens.
 *
 * When `walletAddress` is missing, the right-side currency readout is
 * replaced with a CONNECT WALLET chip so new players see a clear
 * affordance instead of '◆ 0 SHOT  ◇ 0.00 SOL' which reads as broken.
 * Pass `onConnectWallet` to wire the chip into your wallet flow.
 */
export default function DesignTopBar({
  callsign = 'OPERATIVE',
  tier = 'UNRANKED',
  level = 1,
  shotBalance = 0,
  solBalance = 0,
  badgeSrc,
  walletAddress,
  onConnectWallet,
}) {
  const connected = !!walletAddress;
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
      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em' }}>
        {connected ? (
          <>
            <span style={{ color: 'var(--accent)' }}>&#9670; {shotBalance.toLocaleString()} SHOT</span>
            <span style={{ color: 'var(--bone)' }}>&#9671; {solBalance.toFixed(2)} SOL</span>
          </>
        ) : (
          <button
            onClick={onConnectWallet}
            style={{
              fontFamily: 'var(--f-display)',
              fontSize: 11,
              letterSpacing: '0.22em',
              padding: '8px 14px',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              clipPath: 'var(--clip-6)',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            ◇ CONNECT WALLET
          </button>
        )}
      </div>
    </div>
  );
}
