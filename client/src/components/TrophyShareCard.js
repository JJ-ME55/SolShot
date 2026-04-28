/**
 * TrophyShareCard
 * ─────────────────
 * Post-match shareable card — Twitter-optimised (1080×608 design size).
 * Drop into the existing CombatCard exporter pipeline (html2canvas → blob → clipboard/download).
 *
 * Design intent:
 *  - Stop-the-scroll on Twitter feeds.
 *  - Identity (callsign) is the hero, not the stats.
 *  - Single accent diagonal "blade" is the signature visual; do not soften it.
 *  - 3 stat callouts MAX. More than 3 dilutes the punch.
 *
 * USAGE:
 *   <TrophyShareCard
 *     winner={{ callsign: 'GRIZZLY-07', damage: 742, accuracy: 68, shots: 22, best: 'CRAZY IVAN' }}
 *     loser={{ callsign: 'VIPER-12' }}
 *     score="2 – 1"
 *     matchId="M-#0A3F7"
 *     terrain="VOLCANIC"
 *     duration="08:42"
 *   />
 *
 *   // Then export with html2canvas (already wired in CombatCard.js):
 *   html2canvas(cardRef.current, { scale: 2, backgroundColor: '#0e1209', useCORS: true })
 *
 * FONTS: requires "Black Ops One" (display) and "Share Tech Mono" loaded globally.
 *        These are already loaded in client/public/index.html.
 *
 * SIZING: card is rendered at fixed 1080×608. Wrap in a parent with
 *         transform: scale(N) for responsive preview; export at 1× for crispness.
 */

import React from 'react';

/* ── Tokens — keep as constants so component is self-contained ── */
const C = {
  bgDeep:        '#0e1209',
  bgDeeper:      '#0a0d07',
  accent:        '#ff7a1a',   // blade gradient stop 1
  accentDeep:    '#c44d12',   // blade gradient stop 2
  accentSoft:    '#ffb05a',   // borders, secondary marks
  bone:          '#fff8e8',
  bonePale:      '#f4e7c8',
  olive:         '#c4a65d',
  oliveDim:      'rgba(196,166,93,0.6)',
};

const F = {
  display: "'Black Ops One', 'Arial Black', sans-serif",
  mono:    "'Share Tech Mono', 'Courier New', monospace",
};

/* Card design dimensions — DO NOT CHANGE without re-tuning all positions */
export const TROPHY_CARD_W = 1080;
export const TROPHY_CARD_H = 608;

/**
 * Recommended callsign length: 1-15 chars.
 * 16+ chars truncates with ellipsis. Anything over ~12 starts to look weak.
 *
 * Card layout: callsign block has 734px available width (1080 - 290 left - 56 right).
 * Black Ops One is wide; each character is roughly 0.78× the font size at letter-spacing 0.02em.
 * Scale font down so the text always fits without truncation up to 15 chars.
 */
function callsignFontSize(name) {
  const len = (name || '').length;
  if (len <= 7)  return 110; // full hero size — "VIPER-12", "GRIZZLY"
  if (len <= 9)  return 92;  // "BANANAGUN", "GRIZZLY-7"
  if (len <= 11) return 78;  // "GRIZZLY-07X"
  if (len <= 13) return 66;
  if (len <= 15) return 56;
  return 48; // 16+ — falls back to ellipsis at this size
}

export const MAX_CALLSIGN_LENGTH = 15;

export default function TrophyShareCard({
  winner,
  loser,
  score = '2 – 1',
  matchId = 'M-#00000',
  terrain = 'UNKNOWN',
  duration = '00:00',
}) {
  const w = TROPHY_CARD_W;
  const h = TROPHY_CARD_H;
  const callsignSize = callsignFontSize(winner?.callsign);

  return (
    <div style={{
      width: w, height: h, position: 'relative',
      background: C.bgDeep,
      overflow: 'hidden',
      // Helps html2canvas: no transforms on the root
    }}>
      {/* Background grid + accent blade (single SVG, all in design coords) */}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        aria-hidden
      >
        <defs>
          <pattern id="trophy-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(196,166,93,0.08)" strokeWidth="1" />
          </pattern>
          <linearGradient id="trophy-blade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={C.accent} />
            <stop offset="100%" stopColor={C.accentDeep} />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill="url(#trophy-grid)" />
        {/* Diagonal accent blade — the signature element */}
        <polygon
          points={`0,${h} 0,${h * 0.55} ${w * 0.62},0 ${w},0 ${w},${h * 0.18} ${w * 0.42},${h}`}
          fill="url(#trophy-blade)"
          opacity="0.95"
        />
      </svg>

      {/* CRT scanlines (pure CSS so html2canvas captures cleanly) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage:
          'repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)',
      }} />

      {/* TOP BAR — wordmark + match id */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontFamily: F.display, fontSize: 32, color: C.bonePale, letterSpacing: '0.08em' }}>
          SOL<span style={{ color: C.accentSoft }}>SHOT</span>
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.35em', color: 'rgba(244,231,200,0.6)' }}>
          MATCH · {matchId}
        </div>
      </div>

      {/* W BADGE */}
      <div style={{
        position: 'absolute', left: 56, top: 110,
        width: 200, height: 200,
        background: C.bgDeep,
        border: `4px solid ${C.accentSoft}`,
        // Beveled corner (notched top-left & bottom-right)
        clipPath:
          'polygon(20px 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0% 100%, 0% 20px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
      }}>
        <div style={{
          fontFamily: F.display, fontSize: 140, color: C.accentSoft,
          lineHeight: 0.8, textShadow: '0 0 30px rgba(255,176,90,0.5)',
        }}>W</div>
        <div style={{
          fontFamily: F.mono, fontSize: 13, color: C.bonePale,
          letterSpacing: '0.3em', opacity: 0.7,
        }}>VICTORY</div>
      </div>

      {/* CALLSIGN + DEFEATED + SCORE */}
      <div style={{ position: 'absolute', left: 290, top: 130, right: 56 }}>
        <div style={{
          fontFamily: F.mono, fontSize: 14, letterSpacing: '0.4em',
          color: 'rgba(255,255,255,0.7)', marginBottom: 8,
        }}>OPERATIVE</div>
        <div style={{
          fontFamily: F.display, fontSize: callsignSize, lineHeight: 0.9,
          color: C.bone, letterSpacing: '0.02em',
          textShadow: '0 4px 0 rgba(0,0,0,0.4)',
          // Truncate gracefully if a callsign is over MAX_CALLSIGN_LENGTH
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {winner.callsign}
        </div>
        <div style={{
          fontFamily: F.mono, fontSize: 16, letterSpacing: '0.25em',
          color: 'rgba(255,255,255,0.85)', marginTop: 12,
        }}>
          DEFEATED <span style={{ color: C.bone, fontWeight: 700 }}>{loser.callsign}</span>
          <span style={{ margin: '0 14px', opacity: 0.4 }}>|</span>
          <span style={{
            fontFamily: F.display, fontSize: 28, color: C.bgDeep,
            background: C.bone, padding: '2px 12px',
          }}>{score}</span>
        </div>
      </div>

      {/* 3 HERO STATS */}
      <div style={{
        position: 'absolute', left: 56, right: 56, bottom: 88,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
      }}>
        <TrophyStat label="DMG DEALT"  v={winner.damage}              sub="HP" />
        <TrophyStat label="ACCURACY"   v={`${winner.accuracy}%`}       sub={`${winner.shots} SHOTS`} />
        <TrophyStat label="MVP WEAPON" v={winner.best}                 sub="SIGNATURE" />
      </div>

      {/* BOTTOM STRIP */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: 56,
        background: C.bgDeeper,
        borderTop: `2px solid ${C.accentSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 56px',
      }}>
        <div style={{ fontFamily: F.mono, fontSize: 13, color: C.olive, letterSpacing: '0.3em' }}>
          SOLSHOT.GG · ARTILLERY COMBAT ON SOLANA
        </div>
        <div style={{ fontFamily: F.mono, fontSize: 13, color: C.oliveDim, letterSpacing: '0.3em' }}>
          ▸ TERRAIN {terrain} · {duration}
        </div>
      </div>
    </div>
  );
}

function TrophyStat({ label, v, sub }) {
  return (
    <div style={{
      background: 'rgba(10,13,7,0.78)',
      border: '1px solid rgba(255,176,90,0.4)',
      clipPath:
        'polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)',
      padding: '16px 20px',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        fontFamily: F.mono, fontSize: 11, color: C.olive,
        letterSpacing: '0.3em', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        fontFamily: F.display, fontSize: 48, color: C.bone,
        lineHeight: 0.95, letterSpacing: '0.02em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{v}</div>
      <div style={{
        fontFamily: F.mono, fontSize: 11, color: 'rgba(244,231,200,0.5)',
        letterSpacing: '0.25em', marginTop: 4,
      }}>{sub}</div>
    </div>
  );
}
