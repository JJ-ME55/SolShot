import React, { useRef, useImperativeHandle } from 'react';
import html2canvas from 'html2canvas';

/* ── styles ── */
const s = {
  /* Offscreen wrapper — position absolute far left so html2canvas can still capture it */
  wrapper: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    pointerEvents: 'none',
    zIndex: -1,
  },
  card: {
    width: 320,
    height: 180,
    background: 'linear-gradient(160deg, #1a2010 0%, #141a0c 60%, #111408 100%)',
    border: '1px solid rgba(184,168,138,0.2)',
    overflow: 'hidden',
    position: 'relative',
    fontFamily: "'Share Tech Mono', monospace",
  },
  topStripe: (isWin) => ({
    height: 2,
    background: isWin
      ? 'linear-gradient(90deg, transparent, #14F195 20%, #00cc77 80%, transparent)'
      : 'linear-gradient(90deg, transparent, #cc2200 20%, #ff4400 80%, transparent)',
  }),
  innerContent: {
    padding: '14px 16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    height: 'calc(100% - 4px)',
    boxSizing: 'border-box',
  },
  outcomeLabel: (isWin) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 28,
    letterSpacing: 3,
    lineHeight: 1,
    color: isWin ? '#14F195' : '#ff4444',
  }),
  solLine: (isWin) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 20,
    letterSpacing: 2,
    color: isWin ? '#14F195' : '#ff4444',
    lineHeight: 1,
  }),
  shotLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    letterSpacing: 1,
    color: '#9945FF',
    lineHeight: 1,
  },
  spacer: {
    flex: 1,
  },
  footerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  footerUrl: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    letterSpacing: 2,
    color: '#ff6b1a',
  },
  footerTagline: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    letterSpacing: 2,
    color: 'rgba(184,168,138,0.4)',
    textTransform: 'uppercase',
  },
  bottomStripe: (isWin) => ({
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    background: isWin
      ? 'linear-gradient(90deg, transparent, #14F195 30%, #00cc77 70%, transparent)'
      : 'linear-gradient(90deg, transparent, #cc2200 30%, #ff4400 70%, transparent)',
    opacity: 0.6,
  }),
};

const ShareCard = React.forwardRef(function ShareCard({ isWin, solAmount, shotEarned, onExported }, ref) {
  const cardRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportToClipboard: async () => {
      if (!cardRef.current) return false;
      try {
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: '#0a0c08',
          scale: 2,
          logging: false,
          useCORS: true,
        });
        const blob = await new Promise(function(r) { canvas.toBlob(r, 'image/png'); });
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          if (onExported) onExported(true);
          return true;
        }
      } catch (e) {
        console.error('[ShareCard] Export failed:', e);
      }
      if (onExported) onExported(false);
      return false;
    },
  }));

  const showSol = solAmount != null && solAmount > 0;
  const showShot = shotEarned != null && shotEarned > 0;
  const solSign = isWin ? '+' : '-';

  return (
    <div style={s.wrapper}>
      <div ref={cardRef} style={s.card}>
        <div style={s.topStripe(isWin)} />
        <div style={s.innerContent}>
          <div style={s.outcomeLabel(isWin)}>
            {isWin ? 'VICTORY' : 'DEFEAT'}
          </div>
          {showSol && (
            <div style={s.solLine(isWin)}>
              {solSign + solAmount.toFixed(3) + ' SOL'}
            </div>
          )}
          {/* SHOT line hidden in practice mode */}
          <div style={s.spacer} />
          <div style={s.footerRow}>
            <div style={s.footerUrl}>SOLSHOT.GG</div>
            <div style={s.footerTagline}>Artillery Combat on Solana</div>
          </div>
        </div>
        <div style={s.bottomStripe(isWin)} />
      </div>
    </div>
  );
});

export default ShareCard;
