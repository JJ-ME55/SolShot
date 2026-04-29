/**
 * CareerStatsCard — Satori edition · v2 (legibility pass)
 * ────────────────────────────────────────────────────────
 * 1080×608. Sister to TrophyShareCard.
 *
 * v2 CHANGES (vs v1) — driven by the fact this card is 90% viewed
 * inline in a Telegram thread at ~340px wide:
 *   - Removed the diagonal orange blade (was fighting the typography
 *     and reading as a smudge at thumbnail size).
 *   - Pumped every label/sub-line ~50% bigger.
 *   - Stat tiles are taller, numbers bigger (52px → can survive Telegram compression).
 *   - Killed the redaction-tape strip (read as junk at small size).
 *   - Added a "RECENT FORM" 10-match W/L row at the bottom of the file
 *     panel — uses the empty space, gives the eye a second pattern to
 *     read besides numbers.
 *   - Top strip leads with TIER name (the most player-relevant info).
 *
 * SAME SATORI CONSTRAINTS:
 *   - Every multi-child parent has display:flex
 *   - No clip-path, no backdrop-filter, no display:grid, no CSS keyframes
 *   - No text-overflow:ellipsis (caller pre-clips, we belt-and-braces .slice)
 */

import React from 'react';

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

function fmtK(n) {
  if (n == null) return '—';
  if (n >= 100000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000)   return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}
function clip(s, n) { return (s ?? '').toString().slice(0, n); }

const TIER_LABEL = {
  NONE:     'UNRANKED',
  BRONZE:   'BRONZE',
  SILVER:   'SILVER',
  GOLD:     'GOLD',
  PLATINUM: 'PLATINUM',
  DIAMOND:  'DIAMOND',
};

export default function CareerStatsCard({
  callsign      = 'GRIZZLY-07',
  registryId    = 'A37F',
  tierName      = 'BRONZE',
  tierBadgeUrl  = null,
  rank          = 47,
  record        = { wins: 47, losses: 12, winRate: 78 },
  totalDamage   = 47400,
  kills         = 127,
  deaths        = 89,
  streak        = { current: 9, best: 14 },
  mvpWeapon     = { name: 'HEATSEEK', damage: 12400 },
  matchesPlayed = 59,
  joinedLabel   = 'JOINED MAR 2026',
  recentForm    = null,                  // optional: array of 'W' | 'L', up to 10, most-recent-last
}) {
  // v3: dropped STREAK tile — 3-up row gives MVP WEAPON the breathing room it needs.

  const w = CAREER_CARD_W;
  const h = CAREER_CARD_H;

  const cs   = clip(callsign, 14);
  const reg  = clip(registryId, 6).toUpperCase();
  const wpn  = clip(mvpWeapon?.name ?? '—', 14);

  // CALLSIGN auto-fit (1–14 chars). Big-Ops-One is wide; ladder calibrated so
  // the widest 14-char string ("WWWWWWWWWWWWWW") fits the ~640px left column.
  // Tracking tightens slightly as size drops so the type still feels stamped.
  const csLen = cs.length;
  const csSize =
    csLen <= 6  ? 108 :
    csLen <= 8  ? 96  :
    csLen <= 10 ? 82  :
    csLen <= 12 ? 70  :
                  60;   // 13–14
  const csTrack =
    csLen <= 8  ? '0.04em' :
    csLen <= 10 ? '0.02em' :
    csLen <= 12 ? '0.01em' :
                  '0';

  // MVP WEAPON auto-fit (1–14 chars). Tile is ~33% of left column ≈ 220px wide.
  const wpnLen = wpn.length;
  const wpnSize =
    wpnLen <= 5  ? 48 :
    wpnLen <= 7  ? 42 :
    wpnLen <= 9  ? 34 :
    wpnLen <= 11 ? 28 :
    wpnLen <= 13 ? 24 :
                    22;  // 14
  const wpnTrack =
    wpnLen <= 7  ? '0.02em' :
    wpnLen <= 11 ? '0.01em' :
                    '0';

  // TOTAL DMG auto-fit. fmtK output: '412', '47.4K', '187K', '1.2M' if extended.
  // Realistic 1–6 chars. Calibrated for the same ~220px tile width as MVP.
  const dmgStr = fmtK(totalDamage);
  const dmgLen = dmgStr.length;
  const dmgSize =
    dmgLen <= 3 ? 56 :
    dmgLen <= 4 ? 50 :
    dmgLen <= 5 ? 44 :
                  38;  // 6+
  const dmgTrack = dmgLen <= 4 ? '0.02em' : '0.01em';

  // K/D auto-fit. '${kills}/${deaths}' ranges from '0/0' (3) to '999/999' (7).
  const kdStr = `${kills}/${deaths}`;
  const kdLen = kdStr.length;
  const kdSize =
    kdLen <= 3 ? 56 :
    kdLen <= 5 ? 48 :
    kdLen <= 7 ? 40 :
                  34;  // 8+ (e.g. 9999/9999)
  const kdTrack = kdLen <= 5 ? '0.02em' : '0.01em';

  const tier = TIER_LABEL[tierName] || 'UNRANKED';
  const isUnranked = tierName === 'NONE' || !tierBadgeUrl;

  const kdRatio = deaths > 0 ? (kills / deaths).toFixed(2) : '∞';

  // Recent-form fallback: derive from streak if not provided.
  const form = (recentForm && recentForm.length > 0)
    ? recentForm.slice(-10)
    : Array.from({ length: 10 }, (_, i) => i < (streak?.current ?? 0) ? 'W' : 'L');

  // Right column dimensions
  const sealW = w * 0.34;
  const sealLeft = w - sealW;

  return (
    <div style={{
      width: w, height: h,
      position: 'relative',
      background: C.bgDeep,
      display: 'flex',
      overflow: 'hidden',
    }}>
      {/* Background — grid only, no diagonal blade */}
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position:'absolute', left:0, top:0 }}>
        <defs>
          <pattern id="cs-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(196,166,93,0.06)" strokeWidth="1" />
          </pattern>
          <pattern id="cs-scan" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="3" height="1" fill="rgba(0,0,0,0.14)" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#cs-grid)" />
        {/* Right-side seal panel */}
        <rect x={sealLeft} y="0" width={sealW} height={h} fill={C.bgDeeper} />
        <rect x={sealLeft} y="0" width="3" height={h} fill={C.accent} />
        <rect width={w} height={h} fill="url(#cs-scan)" />
      </svg>

      {/* TOP BAR — wordmark + registry id */}
      <div style={{
        position: 'absolute', left: 56, right: 56, top: 30,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display:'flex', alignItems:'center' }}>
          <div style={{ display:'flex', fontFamily: F.display, fontSize: 36, color: C.bonePale, letterSpacing: '0.08em' }}>
            <span>SOL</span><span style={{ color: C.accentSoft }}>SHOT</span>
          </div>
          <div style={{
            display:'flex',
            marginLeft: 18,
            fontFamily: F.mono, fontSize: 16, letterSpacing: '0.3em', color: C.olive,
            borderLeft: `1px solid ${C.olive}`,
            paddingLeft: 18,
          }}>
            OPERATIVE FILE
          </div>
        </div>
        <div style={{
          display:'flex',
          fontFamily: F.mono, fontSize: 16, letterSpacing: '0.3em', color: C.bonePale,
          background: 'rgba(0,0,0,0.45)',
          border: `1px solid rgba(255,176,90,0.35)`,
          padding: '6px 14px',
        }}>
          {`ID · ${reg}`}
        </div>
      </div>

      {/* ── LEFT COLUMN: THE FILE ── */}
      <div style={{
        position: 'absolute', left: 56, top: 96, width: sealLeft - 56 - 32,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display:'flex',
          fontFamily: F.mono, fontSize: 17, letterSpacing: '0.4em',
          color: C.accentSoft, marginBottom: 10,
        }}>
          OPERATIVE
        </div>

        {/* CALLSIGN — auto-fits 1–14 chars; tracking tightens as size drops */}
        <div style={{
          display: 'flex',
          fontFamily: F.display, fontSize: csSize, lineHeight: 0.92,
          color: C.bone, letterSpacing: csTrack,
          textShadow: '0 4px 0 rgba(0,0,0,0.45)',
          whiteSpace: 'nowrap',
        }}>
          {cs}
        </div>

        {/* Record line — bigger, brighter */}
        <div style={{
          display: 'flex', alignItems: 'center',
          fontFamily: F.mono, fontSize: 17, letterSpacing: '0.18em',
          marginTop: 18, color: C.bonePale,
        }}>
          {rank != null ? (
            <span style={{
              display:'flex', background: C.accent, color: C.ink,
              padding: '5px 14px', letterSpacing: '0.12em',
              fontFamily: F.display, fontSize: 22,
            }}>{`#${rank}`}</span>
          ) : (
            <span style={{
              display:'flex', border: `1.5px solid ${C.olive}`, color: C.olive,
              padding: '5px 14px', letterSpacing: '0.25em', fontSize: 14,
            }}>UNRANKED</span>
          )}
          <span style={{ marginLeft: 14, marginRight: 14, opacity: 0.5 }}>·</span>
          <span style={{ color: C.bone, fontSize: 22, fontFamily: F.display, letterSpacing:'0.04em' }}>
            {`${record.wins}W`}
          </span>
          <span style={{ margin: '0 8px', color: C.olive }}>–</span>
          <span style={{ color: C.bone, fontSize: 22, fontFamily: F.display, letterSpacing:'0.04em' }}>
            {`${record.losses}L`}
          </span>
          <span style={{ marginLeft: 14, marginRight: 14, opacity: 0.5 }}>·</span>
          <span style={{ color: C.accentSoft, fontSize: 22, fontFamily: F.display, letterSpacing:'0.04em' }}>
            {`${record.winRate}%`}
          </span>
        </div>

        {/* 3 STAT TILES — wider, more breathing room (MVP WEAPON gets ~33% not 25%).
            TOTAL DMG, K/D, and MVP WEAPON all use char-length-based size+tracking
            ladders so values never overflow the tile or get clipped. */}
        <div style={{ display: 'flex', flexDirection: 'row', marginTop: 26 }}>
          <Stat label="TOTAL DMG"  big={dmgStr} sub="HP DEALT"           bigSize={dmgSize} bigTrack={dmgTrack} />
          <Spacer />
          <Stat label="K / D"      big={kdStr}  sub={`${kdRatio} RATIO`} bigSize={kdSize}  bigTrack={kdTrack} />
          <Spacer />
          <Stat label="MVP WEAPON" big={wpn}    sub={`${fmtK(mvpWeapon?.damage)} DMG`} bigSize={wpnSize} bigTrack={wpnTrack} flexGrow={1.4} />
        </div>

        {/* RECENT FORM — fills the dead band, gives the eye a second pattern */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
          <div style={{
            display:'flex',
            fontFamily: F.mono, fontSize: 13, letterSpacing: '0.35em', color: C.olive,
            marginBottom: 8,
          }}>
            > RECENT FORM · LAST 10
          </div>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            {form.map((r, i) => (
              <FormCell key={i} result={r} />
            ))}
          </div>
        </div>
      </div>

      {/* ── RIGHT COLUMN: THE SEAL ── */}
      <div style={{
        position: 'absolute',
        left: sealLeft, top: 0,
        width: sealW, height: h - 56,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: 40,
      }}>
        {/* Faint CLASSIFIED watermark behind the badge */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, top: '52%',
          display: 'flex', justifyContent: 'center',
          fontFamily: F.display, fontSize: 96, letterSpacing: '0.05em',
          color: 'rgba(196,166,93,0.07)',
          transform: 'translateY(-50%) rotate(-8deg)',
        }}>
          CLASSIFIED
        </div>

        {/* TIER eyebrow — sits above the badge so the player sees it first */}
        <div style={{
          display:'flex',
          fontFamily: F.mono, fontSize: 14, letterSpacing: '0.45em',
          color: C.olive, marginBottom: 18,
        }}>
          - TIER -
        </div>

        {/* The seal */}
        {isUnranked ? (
          <UnrankedPlate />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 240, height: 240,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              border: `2px solid ${C.accent}`,
              borderRadius: 9999,
              opacity: 0.7,
            }} />
            <div style={{
              position: 'absolute', inset: 10,
              border: `1px solid rgba(255,176,90,0.5)`,
              borderRadius: 9999,
            }} />
            <img src={tierBadgeUrl} width={220} height={220} style={{ display: 'flex' }} />
          </div>
        )}

        {/* Tier name — big, hero-treated */}
        <div style={{
          marginTop: 22,
          display:'flex',
          fontFamily: F.display, fontSize: 40,
          letterSpacing: '0.12em',
          color: C.bone,
          textShadow: '0 3px 0 rgba(0,0,0,0.4)',
        }}>
          {tier}
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
        <div style={{ fontFamily: F.mono, fontSize: 14, color: C.olive, letterSpacing: '0.3em' }}>
          SOLSHOT.GG · ARTILLERY ON SOLANA
        </div>
        <div style={{ display: 'flex', fontFamily: F.mono, fontSize: 14, color: C.oliveDim, letterSpacing: '0.3em' }}>
          {`> ${matchesPlayed} MATCHES · ${joinedLabel}`}
        </div>
      </div>
    </div>
  );
}

function Spacer() { return <div style={{ width: 12, flexShrink: 0 }} />; }

function Stat({ label, big, sub, bigSize = 44, bigTrack = '0.02em', flexGrow = 1 }) {
  return (
    <div style={{
      flexGrow, flexBasis: 0,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(10,13,7,0.85)',
      border: '1px solid rgba(255,176,90,0.4)',
      padding: '18px 20px 16px',
      minWidth: 0,
    }}>
      <div style={{
        display:'flex',
        fontFamily: F.mono, fontSize: 14, color: C.accentSoft,
        letterSpacing: '0.28em', marginBottom: 10,
      }}>{label}</div>
      <div style={{
        display: 'flex',
        fontFamily: F.display, fontSize: bigSize, color: C.bone,
        lineHeight: 0.95, letterSpacing: bigTrack,
        whiteSpace: 'nowrap',
      }}>{big}</div>
      <div style={{
        display:'flex',
        fontFamily: F.mono, fontSize: 13, color: 'rgba(244,231,200,0.65)',
        letterSpacing: '0.22em', marginTop: 8,
      }}>{sub}</div>
    </div>
  );
}

function FormCell({ result }) {
  const win = result === 'W';
  return (
    <div style={{
      flexGrow: 1, flexBasis: 0,
      height: 36,
      marginRight: 4,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: win ? C.accent : 'rgba(168,58,31,0.35)',
      border: `1px solid ${win ? C.accentSoft : 'rgba(168,58,31,0.7)'}`,
      fontFamily: F.display, fontSize: 18,
      color: win ? C.ink : C.bonePale,
      letterSpacing: '0.05em',
    }}>
      {result}
    </div>
  );
}

function UnrankedPlate() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: 240, height: 240,
      border: `2px dashed rgba(196,166,93,0.55)`,
      background: 'rgba(0,0,0,0.4)',
    }}>
      <div style={{ display:'flex', fontFamily: F.display, fontSize: 26, color: C.olive, letterSpacing: '0.18em' }}>
        [ CLASSIFIED ]
      </div>
      <div style={{ marginTop: 14, display:'flex', fontFamily: F.mono, fontSize: 13, letterSpacing: '0.3em', color: 'rgba(196,166,93,0.7)' }}>
        TIER PENDING
      </div>
      <div style={{ marginTop: 4, display:'flex', fontFamily: F.mono, fontSize: 13, letterSpacing: '0.3em', color: 'rgba(196,166,93,0.7)' }}>
        EARN A WIN
      </div>
    </div>
  );
}
