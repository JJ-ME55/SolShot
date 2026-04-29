/**
 * CareerStatsCard — Satori edition
 * ──────────────────────────────────
 * Server-rendered "operative file" card. 1080×608 (Twitter 1.91:1).
 * Sibling to TrophyShareCard — same fonts, same render pipeline,
 * intentionally different layout (dossier vs. victory).
 *
 * DESIGN INTENT (deliberate departures from the brief):
 *  - Layout: TWO-COLUMN spread, not "badge then text". Left = TYPED FILE
 *    (callsign + record + four stats). Right = WAX-SEAL panel with the
 *    prestige badge sitting on a vertical orange ribbon, like a sealed
 *    document. The badge is round, so it earns a circular frame, not a
 *    square one shoe-horned next to it.
 *  - Top bar reads "OPERATIVE FILE · CLASSIFIED" with redaction bars
 *    flanking the registry id. Sells the dossier metaphor cheaply.
 *  - Stats block is 4 across the bottom-left (not the full bottom width).
 *    Tighter tiles, smaller numbers than trophy card — this is a
 *    reference card, not a flex.
 *  - Watermark: a faint "CLASSIFIED" stamp, rotated -8°, behind the seal.
 *  - UNRANKED state: badge frame becomes an outlined "[CLASSIFIED]" plate.
 *
 * SATORI CONSTRAINTS (same as Trophy card — don't break these):
 *  - Every multi-child parent has display:flex
 *  - No clip-path, no backdrop-filter, no display:grid, no CSS keyframes
 *  - No text-overflow:ellipsis (caller pre-clips, we belt-and-braces .slice)
 *
 * USAGE (Node):
 *   import CareerStatsCard, { CAREER_CARD_W, CAREER_CARD_H } from './CareerStatsCard';
 *   const svg = await satori(CareerStatsCard(props), { width: CAREER_CARD_W, height: CAREER_CARD_H, fonts });
 *   const png = new Resvg(svg).render().asPng();
 */

import React from 'react';

/* ── Tokens (identical to Trophy card — do NOT diverge) ── */
const C = {
  bgDeep:     '#0e1209',
  bgDeeper:   '#0a0d07',
  ink:        '#06080a',
  accent:     '#ff7a1a',
  accentDeep: '#c44d12',
  accentSoft: '#ffb05a',
  blood:      '#a83a1f',
  bone:       '#fff8e8',
  bonePale:   '#f4e7c8',
  olive:      '#c4a65d',
  oliveDim:   'rgba(196,166,93,0.6)',
};
const F = {
  display: "'BlackOpsOne', 'Black Ops One', sans-serif",
  mono:    "'ShareTechMono', 'Share Tech Mono', monospace",
};

export const CAREER_CARD_W = 1080;
export const CAREER_CARD_H = 608;

/* Format helpers — caller passes raw, component formats */
function fmtK(n) {
  if (n == null) return '—';
  if (n >= 100000) return `${Math.round(n / 1000)}K`;
  if (n >= 10000)  return `${(n / 1000).toFixed(1)}K`;
  if (n >= 1000)   return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function clip(s, n) { return (s ?? '').toString().slice(0, n); }

const TIER_LABEL = {
  NONE:     'UNRANKED',
  BRONZE:   'BRONZE TIER',
  SILVER:   'SILVER TIER',
  GOLD:     'GOLD TIER',
  PLATINUM: 'PLATINUM TIER',
  DIAMOND:  'DIAMOND TIER',
};

export default function CareerStatsCard({
  callsign      = 'GRIZZLY-07',
  registryId    = 'A37F',
  tierName      = 'BRONZE',
  tierBadgeUrl  = null,             // base64 data-URL or null
  rank          = 47,                // null if unranked
  record        = { wins: 47, losses: 12, winRate: 78 },
  totalDamage   = 47400,
  kills         = 127,
  deaths        = 89,
  streak        = { current: 9, best: 14 },
  mvpWeapon     = { name: 'HEATSEEK', damage: 12400 },
  matchesPlayed = 59,
  joinedLabel   = 'JOINED MAR 2026',
}) {
  const w = CAREER_CARD_W;
  const h = CAREER_CARD_H;

  const cs    = clip(callsign, 14);
  const reg   = clip(registryId, 6).toUpperCase();
  const wpn   = clip(mvpWeapon?.name ?? '—', 14);
  const tier  = TIER_LABEL[tierName] || 'UNRANKED';
  const isUnranked = tierName === 'NONE' || !tierBadgeUrl;

  const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : '∞';
  const streakBig = streak?.current > 0 ? streak.current : streak?.best ?? 0;
  const streakSub = streak?.current > 0 ? 'CURRENT' : `BEST ${streak?.best ?? 0}`;

  return (
    <div style={{
      width: w, height: h,
      position: 'relative',
      background: C.bgDeep,
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Background — grid + faint diagonal blade (less aggressive than trophy) */}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position:'absolute', left:0, top:0 }}>
        <defs>
          <pattern id="cs-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(196,166,93,0.06)" strokeWidth="1" />
          </pattern>
          <linearGradient id="cs-blade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.accent} stopOpacity="0.6" />
            <stop offset="100%" stopColor={C.accentDeep} stopOpacity="0.4" />
          </linearGradient>
          <pattern id="cs-scan" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="1" fill="rgba(0,0,0,0.16)" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#cs-grid)" />
        {/* Right-side wax-seal panel: solid darker block with orange ribbon edge */}
        <rect x={w * 0.66} y="0" width={w * 0.34} height={h} fill={C.bgDeeper} />
        <rect x={w * 0.66} y="0" width="3" height={h} fill={C.accent} />
        {/* Faint diagonal accent across the file area */}
        <polygon
          points={`0,${h} 0,${h*0.78} ${w*0.42},0 ${w*0.66},0 ${w*0.66},${h*0.05} ${w*0.18},${h}`}
          fill="url(#cs-blade)"
          opacity="0.55"
        />
        <rect width={w} height={h} fill="url(#cs-scan)" />
      </svg>

      {/* TOP BAR — wordmark + classified strip + registry id */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 28,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display:'flex', fontFamily: F.display, fontSize: 30, color: C.bonePale, letterSpacing: '0.08em' }}>
          <span>SOL</span><span style={{ color: C.accentSoft }}>SHOT</span>
        </div>
        <div style={{ display:'flex', alignItems:'center' }}>
          <div style={{ width: 44, height: 12, background: C.bone, marginRight: 12 }} />
          <div style={{ display: 'flex', fontFamily: F.mono, fontSize: 13, letterSpacing: '0.4em', color: C.bonePale }}>
            {`OPERATIVE FILE · ${reg}`}
          </div>
          <div style={{ width: 44, height: 12, background: C.bone, marginLeft: 12 }} />
        </div>
      </div>

      {/* Sub-strip under top bar — "CLASSIFIED" tape */}
      <div style={{
        position: 'absolute', left: 56, top: 70,
        display: 'flex', alignItems: 'center',
        fontFamily: F.mono, fontSize: 11, letterSpacing: '0.45em', color: C.olive,
      }}>
        <span>{`━━━ CLASSIFIED · TIER: ${tier} ━━━`}</span>
      </div>

      {/* ── LEFT COLUMN: THE FILE ── */}
      <div style={{
        position: 'absolute', left: 56, top: 116, width: w * 0.62 - 56, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ fontFamily: F.mono, fontSize: 13, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
          OPERATIVE
        </div>
        <div style={{
          display: 'flex',
          fontFamily: F.display, fontSize: 84, lineHeight: 0.92,
          color: C.bone, letterSpacing: '0.02em',
          textShadow: '0 4px 0 rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap', overflow: 'hidden',
        }}>
          {cs}
        </div>

        {/* Record line — three pills */}
        <div style={{
          display: 'flex', alignItems: 'center',
          fontFamily: F.mono, fontSize: 14, letterSpacing: '0.25em',
          marginTop: 14, color: C.bonePale,
        }}>
          {rank != null ? (
            <>
              <span style={{ display:'flex', background: C.accent, color: C.ink, padding: '3px 10px', letterSpacing: '0.15em', fontFamily: F.display, fontSize: 18 }}>
                {`#${rank}`}
              </span>
              <span style={{ marginLeft: 10, marginRight: 10, opacity: 0.4 }}>·</span>
            </>
          ) : (
            <>
              <span style={{ display:'flex', border: `1px solid ${C.olive}`, color: C.olive, padding: '3px 10px', letterSpacing: '0.25em', fontSize: 12 }}>
                UNRANKED
              </span>
              <span style={{ marginLeft: 10, marginRight: 10, opacity: 0.4 }}>·</span>
            </>
          )}
          <span style={{ color: C.bone, fontWeight: 'normal' }}>{`${record.wins}W`}</span>
          <span style={{ margin: '0 6px', color: C.olive }}>–</span>
          <span style={{ color: C.bone }}>{`${record.losses}L`}</span>
          <span style={{ marginLeft: 10, marginRight: 10, opacity: 0.4 }}>·</span>
          <span style={{ color: C.accentSoft }}>{`${record.winRate}% WR`}</span>
        </div>

        {/* 4 STAT TILES */}
        <div style={{ display: 'flex', flexDirection: 'row', marginTop: 26 }}>
          <Stat label="TOTAL DMG"   big={fmtK(totalDamage)}              sub="HP DEALT" />
          <Spacer />
          <Stat label="K / D"        big={`${kills}/${deaths}`}            sub={`${kdRatio} RATIO`} smallBig />
          <Spacer />
          <Stat label="STREAK"       big={String(streakBig)}               sub={streakSub} />
          <Spacer />
          <Stat label="MVP WEAPON"   big={wpn}                              sub={`${fmtK(mvpWeapon?.damage)} DMG`} smallBig />
        </div>
      </div>

      {/* ── RIGHT COLUMN: THE SEAL ── */}
      <div style={{
        position: 'absolute',
        left: w * 0.66, top: 0,
        width: w * 0.34, height: h - 56,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: 28,
      }}>
        {/* Faint CLASSIFIED watermark behind the badge */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: '50%',
          display: 'flex', justifyContent: 'center',
          fontFamily: F.display, fontSize: 110, letterSpacing: '0.05em',
          color: 'rgba(196,166,93,0.06)',
          transform: 'translateY(-50%) rotate(-8deg)',
          pointerEvents: 'none',
        }}>
          CLASSIFIED
        </div>

        {/* The seal itself */}
        {isUnranked ? (
          <UnrankedPlate />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 220, height: 220,
            position: 'relative',
          }}>
            {/* Outer ring chrome */}
            <div style={{
              position: 'absolute', inset: 0,
              border: `2px solid ${C.accent}`,
              borderRadius: 9999,
              opacity: 0.6,
            }} />
            <div style={{
              position: 'absolute', inset: 8,
              border: `1px solid rgba(255,176,90,0.5)`,
              borderRadius: 9999,
            }} />
            <img src={tierBadgeUrl} width={200} height={200} style={{ display: 'flex' }} />
          </div>
        )}

        {/* Tier label */}
        <div style={{
          marginTop: 22,
          fontFamily: F.display, fontSize: 28,
          letterSpacing: '0.15em',
          color: C.bone,
          display: 'flex',
        }}>
          {tier}
        </div>
        <div style={{
          marginTop: 6,
          fontFamily: F.mono, fontSize: 11, letterSpacing: '0.35em',
          color: C.olive,
          display: 'flex',
        }}>
          ▸ STATUS · ACTIVE
        </div>
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
          {`▸ ${matchesPlayed} MATCHES · ${joinedLabel}`}
        </div>
      </div>
    </div>
  );
}

function Spacer() { return <div style={{ width: 12, flexShrink: 0 }} />; }

function Stat({ label, big, sub, smallBig }) {
  return (
    <div style={{
      flexGrow: 1, flexBasis: 0,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(10,13,7,0.85)',
      border: '1px solid rgba(255,176,90,0.35)',
      padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: F.mono, fontSize: 10, color: C.olive,
        letterSpacing: '0.3em', marginBottom: 6,
      }}>{label}</div>
      <div style={{
        display: 'flex',
        fontFamily: F.display, fontSize: smallBig ? 30 : 40, color: C.bone,
        lineHeight: 0.95, letterSpacing: '0.02em',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>{big}</div>
      <div style={{
        fontFamily: F.mono, fontSize: 10, color: 'rgba(244,231,200,0.5)',
        letterSpacing: '0.25em', marginTop: 4,
      }}>{sub}</div>
    </div>
  );
}

function UnrankedPlate() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 220, height: 220,
      border: `2px dashed rgba(196,166,93,0.5)`,
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div style={{ display:'flex', fontFamily: F.display, fontSize: 22, color: C.olive, letterSpacing: '0.2em' }}>
        [ CLASSIFIED ]
      </div>
      <div style={{ marginTop: 10, fontFamily: F.mono, fontSize: 11, letterSpacing: '0.3em', color: 'rgba(196,166,93,0.6)' }}>
        TIER PENDING
      </div>
      <div style={{ marginTop: 4, fontFamily: F.mono, fontSize: 11, letterSpacing: '0.3em', color: 'rgba(196,166,93,0.6)' }}>
        EARN A WIN
      </div>
    </div>
  );
}
