import React, { useRef, useEffect, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';
import TrophyShareCard, { TROPHY_CARD_W, TROPHY_CARD_H } from './TrophyShareCard';
import { haptic } from '../telegram/haptic';

/**
 * TrophyShareOverlay
 * ─────────────────
 * Modal wrapper around TrophyShareCard for post-match sharing.
 *
 * - Holds a ref to the unscaled 1080x608 card for html2canvas capture.
 * - Visually scales the card down to fit the viewport using `transform: scale(N)`.
 * - Provides four action buttons: Download PNG, Copy Image, Post to X, Share Link.
 *
 * Usage:
 *   {showCard && (
 *     <TrophyShareOverlay
 *       isWin={isWin}
 *       winner={{ callsign, damage, accuracy, shots, best }}
 *       loser={{ callsign }}
 *       score="2 - 1"
 *       matchId="M-#0A3F7"
 *       terrain="VOLCANIC"
 *       duration="08:42"
 *       onClose={() => setShowCard(false)}
 *     />
 *   )}
 */
export default function TrophyShareOverlay({
  isWin = true,
  winner,
  loser,
  score,
  matchId,
  terrain,
  duration,
  onClose,
}) {
  const cardRef = useRef(null);
  const stageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [feedback, setFeedback] = useState('');
  const [feedbackOk, setFeedbackOk] = useState(false);

  // Fit card to stage width
  useEffect(() => {
    const fit = () => {
      if (!stageRef.current) return;
      const w = stageRef.current.clientWidth;
      setScale(Math.min(1, w / TROPHY_CARD_W));
    };
    fit();
    if (typeof ResizeObserver !== 'undefined' && stageRef.current) {
      const ro = new ResizeObserver(fit);
      ro.observe(stageRef.current);
      window.addEventListener('resize', fit);
      return () => {
        ro.disconnect();
        window.removeEventListener('resize', fit);
      };
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const flash = (msg, ok = true, ms = 2200) => {
    setFeedback(msg);
    setFeedbackOk(ok);
    setTimeout(() => setFeedback(''), ms);
  };

  const renderCanvas = useCallback(async () => {
    if (!cardRef.current) return null;
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* ignore */ }
    }
    return html2canvas(cardRef.current, {
      backgroundColor: '#0e1209',
      scale: 2,
      logging: false,
      useCORS: true,
      width: TROPHY_CARD_W,
      height: TROPHY_CARD_H,
    });
  }, []);

  const downloadPNG = useCallback(async () => {
    setFeedback('RENDERING...');
    setFeedbackOk(false);
    try {
      const canvas = await renderCanvas();
      if (!canvas) throw new Error('No card');
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const name = (winner?.callsign || 'solshot').toLowerCase().replace(/[^a-z0-9-]/g, '');
      a.download = `solshot-${name}-${(matchId || 'match').replace(/[^a-z0-9-]/gi, '')}.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      flash('SAVED', true);
    } catch (err) {
      console.error('[TrophyShareOverlay] download error:', err);
      flash('DOWNLOAD FAILED', false);
    }
  }, [renderCanvas, winner, matchId]);

  const copyImage = useCallback(async () => {
    setFeedback('RENDERING...');
    setFeedbackOk(false);
    try {
      const canvas = await renderCanvas();
      if (!canvas) throw new Error('No card');
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        flash('IMAGE COPIED', true);
      } else {
        // Fallback to download if no Clipboard support (Safari iOS, etc.)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const name = (winner?.callsign || 'solshot').toLowerCase().replace(/[^a-z0-9-]/g, '');
        a.download = `solshot-${name}.png`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        flash('SAVED (CLIPBOARD UNSUPPORTED)', true);
      }
    } catch (err) {
      console.error('[TrophyShareOverlay] copy error:', err);
      flash('COPY FAILED', false);
    }
  }, [renderCanvas, winner]);

  const postToX = useCallback(() => {
    const w = winner?.callsign || 'OPERATIVE';
    const l = loser?.callsign || 'UNKNOWN';
    const verb = isWin ? 'Defeated' : 'Lost to';
    const text = isWin
      ? `${verb} ${l} on SolShot. ${w} confirmed kill. Solana artillery duels — practice mode live.`
      : `${verb} ${w}. Rematch incoming. SolShot — Solana artillery duels — practice mode live.`;
    const url = matchId
      ? `https://solshot.gg/m/${encodeURIComponent(matchId)}`
      : 'https://solshot.gg';
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, '_blank', 'noopener');
  }, [isWin, winner, loser, matchId]);

  const shareLink = useCallback(async () => {
    const url = matchId
      ? `https://solshot.gg/m/${encodeURIComponent(matchId)}`
      : 'https://solshot.gg';
    try {
      await navigator.clipboard.writeText(url);
      flash('LINK COPIED', true);
    } catch (err) {
      flash('CLIPBOARD UNAVAILABLE', false);
    }
  }, [matchId]);

  // Fallback callsigns if winner/loser not yet provided
  const safeWinner = {
    callsign: winner?.callsign || 'OPERATIVE',
    damage: winner?.damage ?? 0,
    accuracy: winner?.accuracy ?? 0,
    shots: winner?.shots ?? 0,
    best: winner?.best || 'CLASSIFIED',
  };
  const safeLoser = { callsign: loser?.callsign || 'UNKNOWN' };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.frame} onClick={(e) => e.stopPropagation()}>
        {/* Stage — width-bound, with aspect-ratio holder so the scaled child sits flush */}
        <div ref={stageRef} style={s.stage}>
          <div style={{
            width: TROPHY_CARD_W,
            height: TROPHY_CARD_H,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
          }}>
            <div ref={cardRef}>
              <TrophyShareCard
                winner={safeWinner}
                loser={safeLoser}
                score={score}
                matchId={matchId}
                terrain={terrain}
                duration={duration}
              />
            </div>
          </div>
        </div>

        {/* Action buttons — 2x2 grid on narrow screens, 4-across on wide */}
        <div style={s.btnRow}>
          <button style={s.btnPrimary}   onClick={() => { haptic.tap(); downloadPNG(); }}>DOWNLOAD PNG</button>
          <button style={s.btnSecondary} onClick={() => { haptic.tap(); copyImage(); }}>COPY IMAGE</button>
          <button style={s.btnSecondary} onClick={() => { haptic.tap(); postToX(); }}>POST TO X</button>
          <button style={s.btnSecondary} onClick={() => { haptic.tap(); shareLink(); }}>SHARE LINK</button>
        </div>

        <button style={s.closeBtn} onClick={() => { haptic.tap(); onClose(); }}>CLOSE</button>

        <div style={feedbackOk ? s.feedbackOk : s.feedback}>
          {feedback && (feedbackOk ? '✓ ' : '') + feedback}
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10, 12, 8, 0.94)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 9000,
    padding: 'clamp(8px, 2.5vw, 16px)',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  },
  frame: {
    width: '100%', maxWidth: 1080,
    display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2vw, 12px)',
  },
  stage: {
    width: '100%', maxWidth: TROPHY_CARD_W,
    aspectRatio: `${TROPHY_CARD_W} / ${TROPHY_CARD_H}`,
    overflow: 'hidden', position: 'relative',
    margin: '0 auto',
    boxShadow: '0 24px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,176,90,0.18)',
  },
  btnRow: {
    display: 'grid',
    // 2-up on phones (140px min ensures readable label), 4-up on wider screens
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
  },
  btnPrimary: {
    padding: 'clamp(11px, 2.8vw, 13px) 12px',
    background: 'var(--accent, #c8781a)',
    color: '#0e1209',
    border: '1px solid var(--accent-hot, #da8a28)',
    clipPath: 'var(--clip-6)',
    fontFamily: 'var(--f-display)',
    fontSize: 'clamp(11px, 2.6vw, 12px)', letterSpacing: '0.18em',
    cursor: 'pointer',
    boxShadow: '0 0 12px rgba(218,138,40,0.25)',
  },
  btnSecondary: {
    padding: 'clamp(11px, 2.8vw, 13px) 12px',
    background: 'transparent',
    color: 'var(--bone, #c8b87a)',
    border: '1px solid var(--border, #1e2a14)',
    clipPath: 'var(--clip-6)',
    fontFamily: 'var(--f-display)',
    fontSize: 'clamp(11px, 2.6vw, 12px)', letterSpacing: '0.18em',
    cursor: 'pointer',
  },
  closeBtn: {
    padding: '10px 12px',
    background: 'transparent',
    color: 'var(--muted, #3a4e2a)',
    border: '1px solid var(--border, #1e2a14)',
    clipPath: 'var(--clip-6)',
    fontFamily: 'var(--f-mono)',
    fontSize: 10, letterSpacing: '0.22em',
    cursor: 'pointer',
  },
  feedback: {
    fontFamily: 'var(--f-mono)', fontSize: 10,
    color: 'var(--muted, #3a4e2a)',
    letterSpacing: '0.22em', textAlign: 'center', height: 14,
  },
  feedbackOk: {
    fontFamily: 'var(--f-mono)', fontSize: 10,
    color: '#7fd060',
    letterSpacing: '0.22em', textAlign: 'center', height: 14,
  },
};
