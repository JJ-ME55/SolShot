import React from 'react';

export default function DesignTopBar({ callsign = 'OPERATIVE', tier = 'UNRANKED', level = 1, shotBalance = 0, solBalance = 0, badgeSrc }) {
  return (
    <div style={{
      position: 'relative', zIndex: 3,
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center', padding: '14px 28px',
      borderBottom: '1px solid var(--border, #1e2a14)',
    }}>
      <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 10 }}>
        {badgeSrc && <img src={badgeSrc} style={{ width: 28, height: 28, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} alt="rank" />}
        <div>
          <div style={{ fontFamily: 'var(--f-sec, "Days One")', fontSize: 13, color: 'var(--bone, #c8b87a)', letterSpacing: '0.1em' }}>{callsign}</div>
          <div style={{ fontFamily: 'var(--f-mono, "Share Tech Mono")', fontSize: 9, color: 'var(--olive, #7a9060)', letterSpacing: '0.2em' }}>{tier} · LVL {level}</div>
        </div>
      </div>
      <div style={{ fontFamily: 'var(--f-display, "Black Ops One")', fontSize: 38, letterSpacing: '0.04em', lineHeight: 1, userSelect: 'none' }}>
        <span style={{ color: 'var(--bone, #c8b87a)' }}>SOL</span>
        <span style={{ color: 'var(--accent, #c8781a)' }}>SHOT</span>
      </div>
      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em' }}>
        <span style={{ color: 'var(--accent, #c8781a)' }}>&#9670; {shotBalance.toLocaleString()} SHOT</span>
        <span style={{ color: 'var(--bone, #c8b87a)' }}>&#9671; {solBalance.toFixed(2)} SOL</span>
      </div>
    </div>
  );
}
