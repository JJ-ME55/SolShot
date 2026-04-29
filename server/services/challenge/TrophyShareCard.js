/**
 * TrophyShareCard — Satori edition
 * ──────────────────────────────────
 * Server-rendered post-match card. 1080×608 (Twitter-optimised).
 * Same JSX renders both in browser DOM and via Satori on Node.
 *
 * SATORI CONSTRAINTS RESPECTED:
 *  - No clip-path           → notched corners replaced with plain borders
 *  - No backdrop-filter     → stat tiles use solid bg + border instead
 *  - No CSS keyframes       → already none
 *  - No display:grid        → 3 stats laid out with flex + flexBasis
 *  - No text-overflow:ellipsis → caller is responsible for callsign length
 *  - Every multi-child parent has display:flex   (Satori requirement)
 *  - text-shadow used minimally (supported, but don't pile it on)
 *
 * USAGE (Node, with Satori + resvg-js):
 *   import TrophyShareCard from './TrophyShareCard';
 *   const svg = await satori(TrophyShareCard(props), { width: 1080, height: 608, fonts: [...] });
 *   const png = new Resvg(svg).render().asPng();
 *
 * USAGE (Browser, for preview / fallback):
 *   <TrophyShareCard {...props} />   — pure React, no extra deps
 *
 * FONTS REQUIRED (must be loaded by Satori host AND in <link> for browser preview):
 *   - 'BlackOpsOne'   (display)   → Black Ops One Regular .ttf
 *   - 'ShareTechMono' (mono)      → Share Tech Mono Regular .ttf
 *   Names must match the `name` field in Satori's fonts array exactly.
 */

import React from 'react';

/* ── Tokens ── */
const C = {
  bgDeep:     '#0e1209',
  bgDeeper:   '#0a0d07',
  ink:        '#06080a',
  accent:     '#ff7a1a',
  accentDeep: '#c44d12',
  accentSoft: '#ffb05a',
  bone:       '#fff8e8',
  bonePale:   '#f4e7c8',
  olive:      '#c4a65d',
  oliveDim:   'rgba(196,166,93,0.6)',
};

const F = {
  display: "'BlackOpsOne', 'Black Ops One', sans-serif",
  mono:    "'ShareTechMono', 'Share Tech Mono', monospace",
};

export const TROPHY_CARD_W = 1080;
export const TROPHY_CARD_H = 608;

export default function TrophyShareCard({
  winner = { callsign: 'GRIZZLY-07', damage: 742, accuracy: 68, shots: 22, best: 'CRAZY IVAN' },
  loser  = { callsign: 'VIPER-12' },
  score  = '2 – 1',
  matchId = 'M-#00000',
  terrain = 'UNKNOWN',
  duration = '00:00',
}) {
  const w = TROPHY_CARD_W;
  const h = TROPHY_CARD_H;

  return (
    <div style={{
      width: w, height: h,
      position: 'relative',
      background: C.bgDeep,
      display: 'flex',          // Satori: parents of multi children need display:flex
      overflow: 'hidden',
    }}>
      {/* Background grid + accent blade — single SVG, all in design coords */}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <defs>
          <pattern id="trophy-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(196,166,93,0.08)" strokeWidth="1" />
          </pattern>
          <linearGradient id="trophy-blade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={C.accent} />
            <stop offset="100%" stopColor={C.accentDeep} />
          </linearGradient>
          {/* Faux scanlines as an SVG pattern (Satori-safe; CSS repeating-linear-gradient on overlays is hit-or-miss) */}
          <pattern id="trophy-scan" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="1" fill="rgba(0,0,0,0.18)" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#trophy-grid)" />
        <polygon
          points={`0,${h} 0,${h * 0.55} ${w * 0.62},0 ${w},0 ${w},${h * 0.18} ${w * 0.42},${h}`}
          fill="url(#trophy-blade)"
          opacity="0.95"
        />
        <rect width={w} height={h} fill="url(#trophy-scan)" />
      </svg>

      {/* TOP BAR — wordmark + match id */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 32,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', fontFamily: F.display, fontSize: 32, color: C.bonePale, letterSpacing: '0.08em' }}>
          <span>SOL</span><span style={{ color: C.accentSoft }}>SHOT</span>
        </div>
        <div style={{ display: 'flex', fontFamily: F.mono, fontSize: 13, letterSpacing: '0.35em', color: 'rgba(244,231,200,0.6)' }}>
          {`MATCH · ${matchId}`}
        </div>
      </div>

      {/* W BADGE — square w/ orange border (no clip-path notch; rectangle reads cleanly at this size) */}
      <div style={{
        position: 'absolute', left: 56, top: 110,
        width: 200, height: 200,
        background: C.bgDeep,
        border: `4px solid ${C.accentSoft}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          fontFamily: F.display, fontSize: 140, color: C.accentSoft,
          lineHeight: 0.8,
          textShadow: '0 0 30px rgba(255,176,90,0.5)',
        }}>W</div>
        <div style={{
          fontFamily: F.mono, fontSize: 13, color: C.bonePale,
          letterSpacing: '0.3em', opacity: 0.7,
          marginTop: 8,
        }}>VICTORY</div>
      </div>

      {/* CALLSIGN + DEFEATED + SCORE */}
      <div style={{
        position: 'absolute', left: 290, top: 130, right: 56,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          fontFamily: F.mono, fontSize: 14, letterSpacing: '0.4em',
          color: 'rgba(255,255,255,0.7)', marginBottom: 8,
        }}>OPERATIVE</div>

        <div style={{
          display: 'flex',
          fontFamily: F.display, fontSize: 110, lineHeight: 0.9,
          color: C.bone, letterSpacing: '0.02em',
          textShadow: '0 4px 0 rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {winner.callsign}
        </div>

        {/* DEFEATED line — flex row so each segment composes cleanly under Satori */}
        <div style={{
          display: 'flex', alignItems: 'center',
          fontFamily: F.mono, fontSize: 16, letterSpacing: '0.25em',
          color: 'rgba(255,255,255,0.85)', marginTop: 14,
        }}>
          <span>DEFEATED</span>
          <span style={{ color: C.bone, marginLeft: 10 }}>{loser.callsign}</span>
          <span style={{ margin: '0 14px', opacity: 0.4 }}>|</span>
          <span style={{
            display: 'flex',
            fontFamily: F.display, fontSize: 28, color: C.bgDeep,
            background: C.bone, padding: '2px 12px',
            letterSpacing: '0.04em',
          }}>{score}</span>
        </div>
      </div>

      {/* 3 HERO STATS — flex row (Satori-safe; no display:grid) */}
      <div style={{
        position: 'absolute', left: 56, right: 56, bottom: 88,
        display: 'flex', flexDirection: 'row',
      }}>
        <TrophyStat label="DMG DEALT"  v={String(winner.damage)}        sub="HP" />
        <Spacer />
        <TrophyStat label="ACCURACY"   v={`${winner.accuracy}%`}         sub={`${winner.shots} SHOTS`} />
        <Spacer />
        <TrophyStat label="MVP WEAPON" v={winner.best}                   sub="SIGNATURE" />
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
        <div style={{ display: 'flex', fontFamily: F.mono, fontSize: 13, color: C.oliveDim, letterSpacing: '0.3em' }}>
          {`▸ TERRAIN ${terrain} · ${duration}`}
        </div>
      </div>
    </div>
  );
}

function Spacer() {
  return <div style={{ width: 16, flexShrink: 0 }} />;
}

function TrophyStat({ label, v, sub }) {
  return (
    <div style={{
      flexGrow: 1, flexBasis: 0,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(10,13,7,0.85)',
      border: '1px solid rgba(255,176,90,0.4)',
      padding: '16px 20px',
    }}>
      <div style={{
        fontFamily: F.mono, fontSize: 11, color: C.olive,
        letterSpacing: '0.3em', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        display: 'flex',
        fontFamily: F.display, fontSize: 48, color: C.bone,
        lineHeight: 0.95, letterSpacing: '0.02em',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>{v}</div>
      <div style={{
        fontFamily: F.mono, fontSize: 11, color: 'rgba(244,231,200,0.5)',
        letterSpacing: '0.25em', marginTop: 4,
      }}>{sub}</div>
    </div>
  );
}
