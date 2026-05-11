import React, { useRef, useState, useCallback } from 'react';
import html2canvas from 'html2canvas';

/* ── Asset paths (mapped from standalone HTML to project assets) ── */
const LOGO_SRC = '/assets/images/branding/logo-transparent.png';
const SOL_ICON = '/assets/images/currency/icon-sol.png';
const SHOT_ICON = '/assets/images/currency/icon-shot.png';

/* ── Styles ── */
const s = {
  /* Overlay backdrop */
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(10, 12, 8, 0.92)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9000,
    gap: 14,
    padding: 20,
  },

  /* Card wrapper */
  card: {
    width: 320,
    background: 'linear-gradient(160deg, #1a2010 0%, #141a0c 60%, #111408 100%)',
    border: '1px solid var(--ol)',
    position: 'relative',
    overflow: 'hidden',
    clipPath: 'polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)',
  },
  topStripe: {
    height: 2,
    background: 'linear-gradient(90deg, transparent, var(--ru) 20%, var(--rg) 80%, transparent)',
  },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 13px 8px',
    borderBottom: '1px solid var(--od)',
  },
  brandLogo: {
    height: 24,
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
  },
  brandFallback: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 15,
    letterSpacing: 2,
  },
  cardLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.45)',
    letterSpacing: '0.2em',
    textAlign: 'right',
    lineHeight: 2,
    textTransform: 'uppercase',
  },

  /* Identity */
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '11px 13px',
    borderBottom: '1px solid var(--od)',
  },
  avatar: {
    width: 50,
    height: 50,
    background: 'var(--od)',
    border: '1.5px solid var(--ol)',
    borderRadius: 3,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    clipPath: 'polygon(8px 0%, 100% 0%, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0% 100%, 0% 8px)',
  },
  avatarText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 17,
    color: 'var(--kh)',
    letterSpacing: 1,
  },
  rank: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--am)',
    letterSpacing: '0.2em',
    marginBottom: 3,
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  rankPip: {
    width: 5,
    height: 5,
    background: 'var(--am)',
    clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  },
  handle: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--bn)',
    letterSpacing: 2,
    lineHeight: 1,
    marginBottom: 5,
  },
  wallet: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'rgba(184,168,138,0.4)',
    letterSpacing: '0.06em',
  },

  /* Section label */
  sectionLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.4)',
    letterSpacing: '0.3em',
    textAlign: 'center',
    padding: '5px 0 4px',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--od)',
  },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr 1fr',
    borderBottom: '1px solid var(--od)',
  },
  stat: {
    padding: '9px 6px 8px',
    textAlign: 'center',
    borderRight: '1px solid var(--od)',
  },
  statLast: {
    padding: '9px 6px 8px',
    textAlign: 'center',
  },
  statVal: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 26,
    lineHeight: 1,
    marginBottom: 3,
    color: 'var(--bn)',
    letterSpacing: 1,
  },
  statValOrange: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 26,
    lineHeight: 1,
    marginBottom: 3,
    color: 'var(--rg)',
    textShadow: '0 0 10px rgba(255,107,26,0.35)',
    letterSpacing: 1,
  },
  statValDim: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 26,
    lineHeight: 1,
    marginBottom: 3,
    color: 'rgba(184,168,138,0.2)',
    letterSpacing: 1,
  },
  statLbl: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.45)',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
  },

  /* Earnings */
  earnings: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    borderBottom: '1px solid var(--od)',
  },
  earn: {
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    borderRight: '1px solid var(--od)',
  },
  earnLast: {
    padding: '8px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  earnIcon: {
    width: 22,
    height: 22,
    objectFit: 'contain',
    opacity: 0.85,
    flexShrink: 0,
  },
  earnIconFallback: {
    width: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    flexShrink: 0,
  },
  earnValSol: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: 'var(--sg)',
    lineHeight: 1,
    letterSpacing: '0.5px',
  },
  earnValShot: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    color: 'var(--gd)',
    lineHeight: 1,
    letterSpacing: '0.5px',
  },
  earnValDim: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'rgba(184,168,138,0.2)',
    lineHeight: 1,
  },
  earnLbl: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.4)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginTop: 2,
  },

  /* Win rate */
  winrateRow: {
    padding: '7px 13px 6px',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    borderBottom: '1px solid var(--od)',
  },
  wrLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.4)',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  wrTrack: {
    flex: 1,
    height: 3,
    background: 'var(--od)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  wrFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg, var(--ru), var(--rg))',
    borderRadius: 2,
  }),
  wrPct: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
  },

  /* Footer */
  footer: {
    padding: '10px 13px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    borderTop: '1px solid var(--od)',
  },
  footerUrl: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 16,
    letterSpacing: 2,
    color: 'var(--rg)',
    textShadow: '0 0 12px rgba(255,107,26,0.35)',
  },
  footerTagline: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'rgba(184,168,138,0.3)',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
  },
  bottomStripe: {
    height: 2,
    background: 'linear-gradient(90deg, transparent, var(--ru) 30%, var(--rg) 70%, transparent)',
    opacity: 0.6,
  },

  /* Action buttons */
  saveBtn: {
    width: 320,
    background: 'linear-gradient(180deg, var(--ru), #881a00)',
    border: '2px solid var(--rg)',
    borderRadius: 5,
    color: 'var(--bn)',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    letterSpacing: 3,
    padding: 11,
    cursor: 'pointer',
    textTransform: 'uppercase',
    boxShadow: '0 0 16px rgba(204,51,0,0.3)',
  },
  closeBtn: {
    width: 320,
    background: 'transparent',
    border: '1px solid var(--ol)',
    borderRadius: 5,
    color: 'var(--kh)',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: 8,
    cursor: 'pointer',
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  feedback: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'rgba(184,168,138,0.3)',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
  feedbackOk: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--gg)',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
};

function CombatCard({ handle, rank, wallet, stats, onClose }) {
  const cardRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackOk, setFeedbackOk] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [solIconError, setSolIconError] = useState(false);
  const [shotIconError, setShotIconError] = useState(false);

  const {
    matchesPlayed = 0,
    wins = 0,
    losses = 0,
    totalSolWon = 0,
    totalShotEarned = 0,
    kills = 0,
    deaths = 0,
  } = stats || {};

  const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : null;
  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? kills.toFixed(1) : null;
  const avatarInitials = (handle || '??').replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() || '??';

  const formatSol = (val) => val > 0 ? val.toFixed(3) : null;
  const formatShot = (val) => val > 0 ? val.toLocaleString() : null;
  const hasMatches = matchesPlayed > 0;

  const exportCard = useCallback(async () => {
    if (!cardRef.current) return;
    setFeedback('RENDERING...');
    setFeedbackOk(false);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0a0c08',
        scale: 3,
        logging: false,
        useCORS: true,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      // Try clipboard first
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          setFeedback('COPIED · READY TO PASTE');
          setFeedbackOk(true);
          return;
        } catch { /* fall through to download */ }
      }
      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `solshot-${(handle || 'card').toLowerCase()}-card.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('SAVED');
      setFeedbackOk(true);
    } catch (err) {
      setFeedback('EXPORT FAILED');
      setFeedbackOk(false);
      console.error('[CombatCard] Export error:', err);
    }
  }, [handle]);

  return (
    <div style={s.overlay} onClick={onClose}>
      {/* Card — stop click propagation so clicking card doesn't close */}
      <div ref={cardRef} style={s.card} onClick={(e) => e.stopPropagation()}>
        <div style={s.topStripe} />

        {/* HEADER */}
        <div style={s.header}>
          <div>
            {!logoError ? (
              <img
                style={s.brandLogo}
                src={LOGO_SRC}
                alt="SOLSHOT"
                onError={() => setLogoError(true)}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={s.brandFallback}>
                <span style={{ color: 'var(--bn)' }}>SOL</span>
                <span style={{ color: 'var(--rg)' }}>SHOT</span>
              </div>
            )}
          </div>
          <div style={s.cardLabel}>COMBAT CARD</div>
        </div>

        {/* IDENTITY */}
        <div style={s.identity}>
          <div style={s.avatar}>
            <span style={s.avatarText}>{avatarInitials}</span>
          </div>
          <div>
            <div style={s.rank}>
              <div style={s.rankPip} />
              <span>{(rank || 'UNRANKED').toUpperCase()}</span>
            </div>
            <div style={s.handle}>{(handle || 'OPERATIVE').toUpperCase()}</div>
            <div style={s.wallet}>{wallet || 'NOT CONNECTED'}</div>
          </div>
        </div>

        {/* COMBAT RECORD */}
        <div style={s.sectionLabel}>Combat Record</div>
        <div style={s.statsRow}>
          <div style={s.stat}>
            <div style={hasMatches ? s.statVal : s.statValDim}>
              {hasMatches ? matchesPlayed : '--'}
            </div>
            <div style={s.statLbl}>Matches</div>
          </div>
          <div style={s.stat}>
            <div style={wins > 0 ? s.statValOrange : s.statValDim}>
              {wins > 0 ? wins : '--'}
            </div>
            <div style={s.statLbl}>Wins</div>
          </div>
          <div style={s.stat}>
            <div style={losses > 0 ? s.statVal : s.statValDim}>
              {losses > 0 ? losses : '--'}
            </div>
            <div style={s.statLbl}>Losses</div>
          </div>
          <div style={s.statLast}>
            <div style={kd != null ? s.statVal : s.statValDim}>
              {kd != null ? kd : '--'}
            </div>
            <div style={s.statLbl}>K/D</div>
          </div>
        </div>

        {/* EARNINGS */}
        <div style={s.earnings}>
          <div style={s.earn}>
            {!solIconError ? (
              <img
                style={s.earnIcon}
                src={SOL_ICON}
                alt="SOL"
                onError={() => setSolIconError(true)}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{ ...s.earnIconFallback, color: '#14F195' }}>&#9678;</div>
            )}
            <div>
              <div style={formatSol(totalSolWon) ? s.earnValSol : s.earnValDim}>
                {formatSol(totalSolWon) || '--'}
              </div>
              <div style={s.earnLbl}>SOL Earned</div>
            </div>
          </div>
          <div style={s.earnLast}>
            {!shotIconError ? (
              <img
                style={s.earnIcon}
                src={SHOT_ICON}
                alt="SHOT"
                onError={() => setShotIconError(true)}
                crossOrigin="anonymous"
              />
            ) : (
              <div style={{ ...s.earnIconFallback, color: '#ffb627' }}>&#11041;</div>
            )}
            <div>
              <div style={s.earnValDim}>???</div>
              <div style={s.earnLbl}>$SHOT Earned</div>
            </div>
          </div>
        </div>

        {/* WIN RATE */}
        <div style={s.winrateRow}>
          <div style={s.wrLabel}>Win Rate</div>
          <div style={s.wrTrack}>
            <div style={s.wrFill(winRate != null ? winRate : 0)} />
          </div>
          <div style={s.wrPct}>{winRate != null ? `${winRate}%` : '--%'}</div>
        </div>

        {/* FOOTER */}
        <div style={s.footer}>
          <div style={s.footerUrl}>SOLSHOT.GG</div>
          <div style={s.footerTagline}>Artillery Combat on Solana</div>
        </div>
        <div style={s.bottomStripe} />
      </div>

      {/* Action buttons */}
      <button
        style={s.saveBtn}
        onClick={(e) => { e.stopPropagation(); exportCard(); }}
        onMouseOver={(e) => { e.currentTarget.style.boxShadow = '0 0 24px rgba(255,107,26,0.5)'; e.currentTarget.style.borderColor = 'var(--am)'; }}
        onMouseOut={(e) => { e.currentTarget.style.boxShadow = '0 0 16px rgba(204,51,0,0.3)'; e.currentTarget.style.borderColor = 'var(--rg)'; }}
      >
        {'\u2B07'} &nbsp;SAVE COMBAT CARD
      </button>
      <button
        style={s.closeBtn}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        CLOSE
      </button>
      <div style={feedbackOk ? s.feedbackOk : s.feedback}>
        {feedback && (feedbackOk ? '\u2713 ' : '') + feedback}
      </div>
    </div>
  );
}

export default CombatCard;
