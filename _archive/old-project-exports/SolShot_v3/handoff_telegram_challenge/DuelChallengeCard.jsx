/**
 * DuelChallengeCard
 * ─────────────────
 * Square 1080×1080 challenge card for Telegram. Direct call-out format.
 * Server-rendered: JSX → Satori (SVG) → resvg (PNG) → posted by bot.
 *
 * SATORI CONSTRAINTS HONOURED:
 *  - No clip-path (replaced beveled corners with regular borders or SVG masks).
 *  - No CSS animations (the on-screen "blink" was decorative only; this is a static card).
 *  - SVG defs/patterns/gradients ARE supported by Satori (verified in Satori v0.10+).
 *  - No `backdrop-filter`, no `mix-blend-mode`.
 *  - `transform: rotate()` IS supported on standard elements.
 *  - All fonts loaded explicitly via Satori's `fonts` option (see handoff doc).
 *
 * USAGE (server, Node):
 *   import satori from 'satori';
 *   import { Resvg } from '@resvg/resvg-js';
 *   const svg = await satori(
 *     <DuelChallengeCard {...props} />,
 *     { width: 1080, height: 1080, fonts: [...] }
 *   );
 *   const png = new Resvg(svg).render().asPng();
 *   // Then sendPhoto via Bot API.
 *
 * Also valid client-side (React) for previews — same JSX renders in DOM.
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
  blood:      '#a83a1f',
  bloodDeep:  '#5a1e0a',
  bone:       '#fff8e8',
  bonePale:   '#f4e7c8',
  olive:      '#c4a65d',
};
const F = {
  display: 'BlackOpsOne',     // Satori expects exact font.name match — see handoff doc
  mono:    'ShareTechMono',
};

export const DUEL_CARD_W = 1080;
export const DUEL_CARD_H = 1080;

export default function DuelChallengeCard({
  challenger,        // { callsign, rank, record, winRate, initials }
  opponent,          // { callsign, handle, initials }
  wager,             // { amount, token }
  format = 'BO3',
  matchId,           // e.g. "CH-#0A3F7"
  shortUrl,          // e.g. "solshot.gg/c/0A3F7"
  expiresIn,         // e.g. "24:00:00" — pre-formatted string
}) {
  const W = DUEL_CARD_W;
  const H = DUEL_CARD_H;

  return (
    <div style={{
      width: W,
      height: H,
      position: 'relative',
      background: C.bgDeep,
      display: 'flex',
      // Satori requires display:flex on flex parents; we use absolute layout
      // for most children, but the root needs an explicit display.
    }}>
      {/* ── BACKGROUND: grid + two diagonal blades (one SVG) ── */}
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <defs>
          <pattern id="duel-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(196,166,93,0.06)" strokeWidth="1" />
          </pattern>
          <linearGradient id="duel-blade-l" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.accent} />
            <stop offset="100%" stopColor={C.accentDeep} />
          </linearGradient>
          <linearGradient id="duel-blade-r" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={C.blood} />
            <stop offset="100%" stopColor={C.bloodDeep} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#duel-grid)" />
        {/* Challenger blade (left) — orange */}
        <polygon
          points={`0,0 ${W * 0.5 - 20},0 ${W * 0.5 - 60},${H} 0,${H}`}
          fill="url(#duel-blade-l)"
          opacity="0.92"
        />
        {/* Target blade (right) — blood, drained */}
        <polygon
          points={`${W * 0.5 + 20},0 ${W},0 ${W},${H} ${W * 0.5 + 60},${H}`}
          fill="url(#duel-blade-r)"
          opacity="0.78"
        />
      </svg>

      {/* ── TOP BAR: brand + status pill ── */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 36,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', fontFamily: F.display, fontSize: 40, color: C.bone, letterSpacing: '0.08em' }}>
          <span>SOL</span>
          <span style={{ color: C.accentSoft }}>SHOT</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(10,13,7,0.7)',
          border: `1px solid rgba(255,176,90,0.5)`,
          padding: '6px 14px',
        }}>
          {/* Status dot — plain div, no animation */}
          <div style={{ width: 8, height: 8, background: C.accentSoft, borderRadius: 999 }} />
          <div style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: '0.3em', color: C.bonePale }}>
            OPEN CHALLENGE
          </div>
        </div>
      </div>

      {/* ── MATCH ID stamp ── */}
      <div style={{
        position: 'absolute', left: 56, top: 92,
        fontFamily: F.mono, fontSize: 11, letterSpacing: '0.3em',
        color: 'rgba(196,166,93,0.6)',
      }}>
        {matchId}
      </div>

      {/* ── HEADLINE ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 130,
        display: 'flex', justifyContent: 'center',
        fontFamily: F.mono, fontSize: 16, letterSpacing: '0.5em',
        color: 'rgba(255,248,232,0.6)',
      }}>
        ━━━ DIRECT CALL-OUT ━━━
      </div>

      {/* ── HEAD-TO-HEAD: challenger | VS | target ── */}
      <div style={{
        position: 'absolute', left: 30, right: 30, top: 220,
        display: 'flex', flexDirection: 'row', alignItems: 'center',
      }}>
        {/* Challenger */}
        <DuelSide
          label="CHALLENGER"
          initials={challenger.initials}
          callsign={challenger.callsign}
          subtitleColor={C.accentSoft}
          subtitleText={challenger.rank}
          metaText={`${challenger.record} · ${challenger.winRate}% WR`}
          tone="hot"
        />

        {/* VS — center */}
        <div style={{
          width: 160,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <div style={{
            fontFamily: F.display,
            fontSize: 160,
            color: C.bone,
            lineHeight: 0.85,
            letterSpacing: '-0.02em',
            textShadow: `0 0 40px ${C.accent}, 4px 4px 0 ${C.ink}`,
            transform: 'rotate(-3deg)',
            display: 'flex',
          }}>
            VS
          </div>
        </div>

        {/* Target */}
        <DuelSide
          label="SUMMONED"
          initials={opponent.initials}
          callsign={opponent.callsign}
          subtitleColor={C.bonePale}
          subtitleText={opponent.handle}
          metaText="DECLINE = COWARD"
          tone="cold"
        />
      </div>

      {/* ── TERMS BAR: wager + format ── */}
      <div style={{
        position: 'absolute', left: 56, right: 56, bottom: 168,
        display: 'flex', flexDirection: 'row',
        background: C.ink,
        border: `2px solid ${C.accentSoft}`,
        padding: '20px 28px',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.3em', color: C.olive, marginBottom: 4 }}>
            WAGER
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: F.display, fontSize: 56, color: C.accentSoft, lineHeight: 1 }}>
            <span>{wager.amount}</span>
            <span style={{ color: C.bone, fontSize: 32, marginLeft: 14 }}>{wager.token}</span>
          </div>
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', flexGrow: 1,
          borderLeft: `1px solid rgba(196,166,93,0.3)`,
          paddingLeft: 28,
        }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.3em', color: C.olive, marginBottom: 4 }}>
            FORMAT
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: F.display, fontSize: 56, color: C.bone, lineHeight: 1 }}>
            <span>{format}</span>
            <span style={{ fontSize: 22, color: C.olive, letterSpacing: '0.1em', marginLeft: 14 }}>· FIRST TO 2</span>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CTA STRIP ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 56px',
        background: C.bgDeeper,
        borderTop: `2px solid ${C.accentSoft}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: F.display, fontSize: 24, color: C.accentSoft, letterSpacing: '0.15em' }}>
            ▸ ACCEPT NOW
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 14, letterSpacing: '0.3em', color: C.olive, marginTop: 2 }}>
            {shortUrl}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: '0.3em', color: C.olive }}>
            EXPIRES IN
          </div>
          <div style={{ fontFamily: F.display, fontSize: 28, color: C.bone, letterSpacing: '0.05em' }}>
            {expiresIn}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Single-side block (shared between challenger and target) ── */
function DuelSide({ label, initials, callsign, subtitleColor, subtitleText, metaText, tone }) {
  const ringColor = tone === 'hot' ? C.accentSoft : C.bonePale;
  const initialsColor = tone === 'hot' ? C.accentSoft : C.bonePale;

  return (
    <div style={{
      flexGrow: 1,
      flexBasis: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 10px',
    }}>
      <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.4em', color: 'rgba(255,248,232,0.7)', marginBottom: 10 }}>
        {label}
      </div>

      {/* Avatar */}
      <div style={{
        width: 140, height: 140,
        background: C.ink,
        border: `4px solid ${ringColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ fontFamily: F.display, fontSize: 56, color: initialsColor, letterSpacing: '0.05em' }}>
          {initials}
        </div>
      </div>

      {/* Callsign — clamped to single line via fixed height + overflow hidden */}
      <div style={{
        marginTop: 18,
        maxWidth: '100%',
        height: 50,
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          fontFamily: F.display,
          fontSize: 52,
          color: C.bone,
          lineHeight: 1,
          letterSpacing: '0.02em',
          textShadow: '0 4px 0 rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap',
        }}>
          {callsign}
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: F.mono, fontSize: 13, letterSpacing: '0.3em',
        color: subtitleColor, marginTop: 12,
      }}>
        {subtitleText}
      </div>

      {/* Meta */}
      <div style={{
        fontFamily: F.mono, fontSize: 12, letterSpacing: '0.25em',
        color: 'rgba(255,248,232,0.6)', marginTop: 4,
      }}>
        {metaText}
      </div>
    </div>
  );
}
