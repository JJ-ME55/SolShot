import React, { useRef, useCallback, useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';

/**
 * StatCard — Practice mode shareable stat card.
 * Fixed 720x405 (16:9) card, scaled to fit viewport via CSS transform.
 * All internal sizes use fixed px — no vw units — so html2canvas export
 * works correctly on any device / zoom level.
 */

const CARD_URL = 'https://solshot.gg';
const CARD_W = 720;
const CARD_H = 405;

function StatCard({ player, onClose }) {
  const cardRef = useRef(null);
  const wrapRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackOk, setFeedbackOk] = useState(false);
  const [scale, setScale] = useState(1);

  const {
    callsign = 'OPERATIVE',
    wins = 0,
    losses = 0,
    totalDamage = 0,
    bestWinStreak = 0,
    matchesPlayed = 0,
    signatureWeapon = null,
  } = player || {};

  const kd = losses === 0
    ? wins > 0 ? wins.toFixed(2) : '0.00'
    : (wins / losses).toFixed(2);
  const winRate = matchesPlayed === 0 ? 0 : Math.round((wins / matchesPlayed) * 100);
  const displayWeapon = (!signatureWeapon || signatureWeapon === 'Single Shot')
    ? 'CLASSIFIED'
    : signatureWeapon.toUpperCase();
  const fmtDmg = totalDamage >= 1000
    ? `${(totalDamage / 1000).toFixed(1)}K`
    : totalDamage;

  // Scale card to fit viewport
  useEffect(() => {
    const updateScale = () => {
      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 140; // room for buttons below
      const s = Math.min(1, maxW / CARD_W, maxH / CARD_H);
      setScale(s);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  const exportCard = useCallback(async () => {
    if (!cardRef.current) return;
    setFeedback('RENDERING...');
    setFeedbackOk(false);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0d0f09',
        scale: 3,
        width: CARD_W,
        height: CARD_H,
        logging: false,
        useCORS: true,
        // Ignore the CSS transform so html2canvas captures at native 720x405
        ignoreTransform: true,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      // Try clipboard first
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          setFeedback('COPIED TO CLIPBOARD');
          setFeedbackOk(true);
          return;
        } catch { /* fall through to download */ }
      }
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `solshot-${callsign.toLowerCase()}-card.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('SAVED');
      setFeedbackOk(true);
    } catch (err) {
      setFeedback('EXPORT FAILED');
      setFeedbackOk(false);
      console.error('[StatCard] Export error:', err);
    }
  }, [callsign]);

  const shareToX = useCallback(() => {
    const text = `${callsign.toUpperCase()} // ${wins}W ${losses}L // SIGNATURE WEAPON: ${displayWeapon}\nsolshot.gg`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }, [callsign, wins, losses, displayWeapon]);

  const stats = [
    { label: 'DMG DEALT', value: fmtDmg },
    { label: 'WINS', value: wins },
    { label: 'LOSSES', value: losses },
    { label: 'K / D', value: kd },
    { label: 'BEST STREAK', value: `${bestWinStreak}W` },
  ];

  return (
    <div style={s.overlay} onClick={onClose}>
      {/* Scale wrapper — sizes the card visually, card itself is always 720x405 */}
      <div ref={wrapRef} style={{
        width: CARD_W * scale,
        height: CARD_H * scale,
        flexShrink: 0,
      }}>
        <div
          ref={cardRef}
          style={{ ...s.card, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scanline overlay */}
          <div style={s.scanlines} />

          {/* Vignette */}
          <div style={s.vignette} />

          {/* Top orange bar */}
          <div style={s.topBar} />

          {/* Bottom dim bar */}
          <div style={s.bottomBar} />

          {/* Corner brackets */}
          {cornerBrackets.map((bracket, i) => (
            <div key={i} style={{ ...s.cornerBase, ...bracket }} />
          ))}

          {/* Left accent strip */}
          <div style={s.leftAccent} />

          {/* Main content */}
          <div style={s.content}>

            {/* TOP ROW — branding + QR */}
            <div style={s.topRow}>
              <div>
                <div style={s.brandName}>SOLSHOT.GG</div>
                <div style={s.brandSub}>PRACTICE MODE // SEASON ZERO</div>
              </div>
              <div style={s.qrBox}>
                <QRCodeSVG
                  value={CARD_URL}
                  size={54}
                  fgColor="#EDE9D5"
                  bgColor="transparent"
                  level="L"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            </div>

            {/* CALLSIGN HERO */}
            <div style={s.heroSection}>
              <div style={s.callsignLabel}>// CALLSIGN</div>
              <div style={s.callsignText}>{callsign.toUpperCase() || '\u2014'}</div>

              {/* Signature weapon */}
              <div style={s.weaponRow}>
                <div style={s.weaponDash} />
                <div style={{
                  ...s.weaponText,
                  color: displayWeapon === 'CLASSIFIED' ? '#7a8060' : '#E8572A',
                }}>
                  SIGNATURE WEAPON: {displayWeapon}
                </div>
                <div style={s.weaponFade} />
              </div>
            </div>

            {/* STATS ROW */}
            <div style={s.statsRow}>
              {stats.map((stat, i) => (
                <div key={stat.label} style={{
                  ...s.statCell,
                  borderRight: i < 4 ? '1px solid #1e2114' : 'none',
                }}>
                  <div style={s.statValue}>{stat.value}</div>
                  <div style={s.statLabel}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* BOTTOM BAR */}
            <div style={s.footerRow}>
              <div style={s.footerTease}>WAGERING UNLOCKS SOON</div>
              <div style={s.footerMeta}>
                {winRate}% WIN RATE // {matchesPlayed} MATCHES PLAYED // solshot.gg
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ACTION BUTTONS — outside the card */}
      <div style={{ ...s.btnRow, width: CARD_W * scale }}>
        <button style={s.exportBtn} onClick={(e) => { e.stopPropagation(); exportCard(); }}>
          EXPORT CARD
        </button>
        <button style={s.shareBtn} onClick={(e) => { e.stopPropagation(); shareToX(); }}>
          SHARE TO X
        </button>
      </div>
      <button style={{ ...s.closeBtn, width: CARD_W * scale }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
        CLOSE
      </button>
      <div style={feedbackOk ? s.feedbackOk : s.feedback}>
        {feedback && (feedbackOk ? '\u2713 ' : '') + feedback}
      </div>
    </div>
  );
}

/* ── Corner bracket data ── */
const cornerBrackets = [
  { top: 10, left: 10, borderTop: '1px solid #E8572A55', borderLeft: '1px solid #E8572A55' },
  { top: 10, right: 10, borderTop: '1px solid #E8572A55', borderRight: '1px solid #E8572A55' },
  { bottom: 10, left: 10, borderBottom: '1px solid #E8572A55', borderLeft: '1px solid #E8572A55' },
  { bottom: 10, right: 10, borderBottom: '1px solid #E8572A55', borderRight: '1px solid #E8572A55' },
];

/* ── Styles — all fixed px, no vw units ── */
const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10, 12, 8, 0.92)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9000, gap: 14, padding: 20,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    position: 'relative',
    background: 'linear-gradient(145deg, #161912 0%, #0d0f09 40%, #131610 100%)',
    border: '1px solid #2e3120',
    boxShadow: '0 0 0 1px #E8572A18, 0 24px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.03)',
    overflow: 'hidden',
    borderRadius: 3,
  },
  scanlines: {
    position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)',
  },
  vignette: {
    position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
    background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 4,
    background: 'linear-gradient(90deg, transparent 0%, #E8572A 20%, #E8572A 80%, transparent 100%)',
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, zIndex: 4,
    background: 'linear-gradient(90deg, transparent, #2e3120, transparent)',
  },
  cornerBase: {
    position: 'absolute', width: 14, height: 14, zIndex: 5,
  },
  leftAccent: {
    position: 'absolute', left: 0, top: '15%', bottom: '15%', width: 2, zIndex: 2,
    background: 'linear-gradient(180deg, transparent, #E8572A44 40%, #E8572A44 60%, transparent)',
  },
  content: {
    position: 'absolute', inset: 0, zIndex: 3,
    display: 'flex', flexDirection: 'column',
    padding: 24,
  },

  /* Top row */
  topRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 10,
  },
  brandName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: '#E8572A',
    letterSpacing: '0.18em',
    lineHeight: 1,
  },
  brandSub: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: '#7a8060',
    letterSpacing: '0.14em',
    marginTop: 3,
  },
  qrBox: {
    width: 54,
    height: 54,
    background: '#1a1c14',
    border: '1px solid #2e3120',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 2,
  },

  /* Hero section */
  heroSection: {
    flex: 1, display: 'flex', flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: 6,
  },
  callsignLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: '#7a8060',
    letterSpacing: '0.35em',
    marginBottom: 4,
  },
  callsignText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 58,
    color: '#EDE9D5',
    letterSpacing: '0.04em',
    lineHeight: 0.95,
    textShadow: '0 2px 40px rgba(232,87,42,0.12), 0 0 80px rgba(232,87,42,0.06)',
  },
  weaponRow: {
    display: 'flex', alignItems: 'center',
    gap: 7,
    marginTop: 7,
  },
  weaponDash: {
    width: 18, height: 1,
    background: '#E8572A', flexShrink: 0,
  },
  weaponText: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.14em',
    whiteSpace: 'nowrap',
  },
  weaponFade: {
    flex: 1, height: 1,
    background: 'linear-gradient(90deg, #E8572A22, transparent)',
  },

  /* Stats row */
  statsRow: {
    borderTop: '1px solid #252718',
    paddingTop: 12,
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 4,
    marginBottom: 8,
  },
  statCell: {
    textAlign: 'center',
    padding: '8px 0',
  },
  statValue: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 24,
    color: '#EDE9D5',
    lineHeight: 1,
  },
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 6.5,
    color: '#7a8060',
    letterSpacing: '0.12em',
    marginTop: 4,
  },

  /* Footer */
  footerRow: {
    borderTop: '1px solid #1e2114',
    paddingTop: 7,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerTease: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 6.5,
    color: '#6b7050',
    letterSpacing: '0.18em',
  },
  footerMeta: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 6.5,
    color: '#6b7050',
    letterSpacing: '0.12em',
  },

  /* Action buttons */
  btnRow: {
    display: 'flex', gap: 10,
  },
  exportBtn: {
    flex: 1,
    background: 'linear-gradient(180deg, #E8572A, #881a00)',
    border: '2px solid #E8572A',
    borderRadius: 5,
    color: '#EDE9D5',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    letterSpacing: 3,
    padding: 11,
    cursor: 'pointer',
    textTransform: 'uppercase',
    boxShadow: '0 0 16px rgba(232,87,42,0.3)',
  },
  shareBtn: {
    flex: 1,
    background: 'transparent',
    border: '2px solid #E8572A55',
    borderRadius: 5,
    color: '#E8572A',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    letterSpacing: 3,
    padding: 11,
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #2e3120',
    borderRadius: 5,
    color: '#7a8060',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: 8,
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  feedback: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: '#7a8060',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
  feedbackOk: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: '#4CAF50',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
};

export default StatCard;
