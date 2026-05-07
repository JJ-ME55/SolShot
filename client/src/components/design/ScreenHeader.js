import React from 'react';
import { useSolShotWallet } from '../../wallet/WalletContext';
import useIsMobile from '../../hooks/useIsMobile';

function CurrencyChip({ isMobile }) {
  const { shotBalance = 0, balance: solBalance = 0 } = useSolShotWallet();
  // Mobile landscape phones have ~26px of header height to spare;
  // 11px chips with 18px gap blow that. Drop to 9px / 10px gap.
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: isMobile ? 10 : 18,
      fontFamily: 'var(--f-mono)',
      fontSize: isMobile ? 9 : 11,
      letterSpacing: '0.15em',
    }}>
      <span style={{ color: 'var(--accent)' }}>&#9670; {(shotBalance || 0).toLocaleString()} SHOT</span>
      <span style={{ color: 'var(--bone)' }}>&#9671; {(solBalance || 0).toFixed(2)} SOL</span>
    </div>
  );
}

export default function ScreenHeader({ title, subtitle, onBack, backLabel = 'MENU', rightExtras }) {
  // Mobile landscape phone is 844x390. The desktop title at fontSize 42
  // eats ~10% of the vertical budget by itself; design spec calls for 14
  // in the mobile chrome strip. Subtitle drops to 8 to match.
  const isMobile = useIsMobile();
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'end',
      marginBottom: isMobile ? 10 : 24,
      paddingBottom: isMobile ? 6 : 14,
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
            fontSize: isMobile ? 9 : 11,
            padding: 0,
            textTransform: 'uppercase',
          }}>&#9666; {backLabel}</button>
        )}
      </div>

      {/* Center — title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--f-display)',
          fontSize: isMobile ? 14 : 42,
          color: 'var(--bone)',
          letterSpacing: isMobile ? '0.18em' : '0.14em',
          lineHeight: 0.95,
          textTransform: 'uppercase',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: 'var(--f-mono)',
            fontSize: isMobile ? 8 : 11,
            color: 'var(--olive)',
            letterSpacing: isMobile ? '0.2em' : '0.25em',
            marginTop: isMobile ? 2 : 6,
            textTransform: 'uppercase',
          }}>{subtitle}</div>
        )}
      </div>

      {/* Right — currency or extras */}
      <div style={{ justifySelf: 'end' }}>
        {rightExtras !== undefined ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10 }}>{rightExtras}</div>
        ) : (
          <CurrencyChip isMobile={isMobile} />
        )}
      </div>
    </div>
  );
}
