import React from 'react';
import { useSolShotWallet } from '../../wallet/WalletContext';

function CurrencyChip() {
  const { shotBalance = 0, balance: solBalance = 0 } = useSolShotWallet();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em' }}>
      <span style={{ color: 'var(--accent)' }}>&#9670; {(shotBalance || 0).toLocaleString()} SHOT</span>
      <span style={{ color: 'var(--bone)' }}>&#9671; {(solBalance || 0).toFixed(2)} SOL</span>
    </div>
  );
}

export default function ScreenHeader({ title, subtitle, onBack, backLabel = 'MENU', rightExtras }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'end',
      marginBottom: 24,
      paddingBottom: 14,
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Left — back button */}
      <div style={{ justifySelf: 'start' }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--olive)',
            fontFamily: 'var(--f-mono)',
            letterSpacing: '0.25em',
            cursor: 'pointer',
            fontSize: 11,
            padding: 0,
            textTransform: 'uppercase',
          }}>&#9666; {backLabel}</button>
        )}
      </div>

      {/* Center — title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--f-display)',
          fontSize: 42,
          color: 'var(--bone)',
          letterSpacing: '0.14em',
          lineHeight: 0.95,
          textTransform: 'uppercase',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 11,
            color: 'var(--olive)',
            letterSpacing: '0.25em',
            marginTop: 6,
            textTransform: 'uppercase',
          }}>{subtitle}</div>
        )}
      </div>

      {/* Right — currency or extras */}
      <div style={{ justifySelf: 'end' }}>
        {rightExtras !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{rightExtras}</div>
        ) : (
          <CurrencyChip />
        )}
      </div>
    </div>
  );
}
