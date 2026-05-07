/**
 * BattleHUD.js — DROP-IN REPLACEMENT
 *
 * Same import path, same external contract as the previous BattleHUD:
 *   import BattleHUD from './BattleHUD';
 *   <BattleHUD
 *     bridge={bridge}                 // .setAngle / .setPower / .fire / .selectWeapon / .moveLeft / .moveRight
 *     gameState={gameState}           // unchanged shape
 *     wager={wager}
 *     turnTimer={turnTimer}
 *     onLeaveMatch={onLeaveMatch}
 *     onForfeit={onForfeit}
 *     gameMode={gameMode}             // 'group-chat' | other
 *   />
 *
 * What changed
 * ────────────
 *  ▸ MOBILE branch fully rebuilt to the AAA mobile playbook:
 *      • Canvas fills viewport — HUD floats over it. No solid bars.
 *      • Top-corner HP pills (semi-transparent, blurred, name + HP).
 *      • Top-center turn pill — small, glowing, "● YOUR TURN · 0:12".
 *      • Top-right wind chip (arrow + number).
 *      • Edge sliders: thin transparent vertical tracks (angle L / power R).
 *      • Bottom-left weapon icon strip — tap to cycle.
 *      • Bottom-right SQUARE chamfered FIRE button (clip-10) — flat amber,
 *        scanline raster, stencil type, glows + pulses when ready.
 *      • Forfeit collapses to a tiny ✕ icon top-left.
 *      • iOS Safari safe-area insets respected (top URL bar / bottom toolbar).
 *      • Move buttons live in a small floating cluster above the weapon strip.
 *  ▸ DESKTOP branch is unchanged.
 *  ▸ FFAPlayerStrip + EliminationOverlay reused; FFA on mobile uses the
 *    new compact strip in place of the corner pills (more than 2 players).
 *  ▸ Hooks identical: AngleControl/PowerControl still used on desktop only;
 *    mobile uses an inline EdgeSlider that calls bridge.setAngle/setPower.
 *  ▸ Theme: stays on the CRT terminal vocabulary — --f-display / --f-mono,
 *    --accent / --accent-hot / --gg / --red / --bone / --olive, --clip-6,
 *    --clip-10. No new tokens introduced.
 *
 * Required CSS tokens (already in your index.css if BattleHUD was rendering):
 *   --bg-deep, --bg-raised, --border, --bone, --olive, --kh, --accent,
 *   --accent-hot, --red, --rust, --gg, --muted, --f-display, --f-mono,
 *   --clip-6, --clip-10
 */

import React from 'react';
import { getWeaponById, getTierColor, getWeaponIconUrl } from '../../data/weapons';
import AngleControl from './AngleControl';
import PowerControl from './PowerControl';
import MoveCounter from './MoveCounter';
import useIsMobile from '../../hooks/useIsMobile';

const TIER_LABELS = {
  FREE: 'FREE', STANDARD: 'STD', TACTICAL: 'TAC',
  RARE: 'RARE', EPIC: 'EPIC', LEGENDARY: 'LGND', PRESTIGE: 'PRST',
};
function getTierLabel(tier) { return TIER_LABELS[tier] || 'STD'; }

const FIRE_CLIP = 'polygon(0% 0%, calc(100% - 12px) 0%, 100% 12px, 100% 100%, 12px 100%, 0% calc(100% - 12px))';


/* ════════════════════════════════════════════
   MOBILE PRIMITIVES (new AAA-pattern overlays)
════════════════════════════════════════════ */

/** Tiny corner HP pill — name + HP/MAX with color-banded bar.  */
function CornerHPPill({ player, isMe, side }) {
  if (!player) return null;
  const hp     = player.hp ?? 250;
  const max    = 250;
  const pct    = Math.max(0, Math.min(100, (hp / max) * 100));
  const dead   = player.alive === false;
  const pColor = player.color || 'var(--bone)';
  const hpC    = pct > 50 ? 'var(--gg, #14F195)' : pct > 25 ? 'var(--accent)' : 'var(--red)';
  const flip   = side === 'right';

  return (
    <div style={{
      padding: '5px 10px',
      background: 'rgba(10,12,8,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid ${pColor}`,
      clipPath: 'var(--clip-6)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexDirection: flip ? 'row-reverse' : 'row',
      minWidth: 130,
      maxWidth: 170,
      opacity: dead ? 0.4 : 1,
      boxShadow: `0 0 12px ${pColor}33`,
      pointerEvents: 'none',
    }}>
      <div style={{
        width: 6, height: 6, background: pColor,
        boxShadow: `0 0 6px ${pColor}`, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0, textAlign: flip ? 'right' : 'left' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 6,
          flexDirection: flip ? 'row-reverse' : 'row',
        }}>
          <span style={{
            fontFamily: 'var(--f-display)',
            fontSize: 10,
            color: 'var(--bone)',
            letterSpacing: '0.1em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 110,
          }}>
            {(player.name || (isMe ? 'YOU' : 'ENEMY')).toUpperCase()}
          </span>
          <span style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 8,
            color: dead ? 'var(--rust)' : hpC,
            letterSpacing: '0.05em',
            flexShrink: 0,
          }}>
            {dead ? 'KIA' : `${hp}/${max}`}
          </span>
        </div>
        <div style={{
          marginTop: 3, height: 3,
          background: 'rgba(0,0,0,0.5)', overflow: 'hidden',
          display: 'flex', justifyContent: flip ? 'flex-end' : 'flex-start',
        }}>
          <div style={{ width: pct + '%', height: '100%', background: hpC, transition: 'width 0.4s' }} />
        </div>
      </div>
    </div>
  );
}


/** Top-center turn pill — stencil + scanlines, glowing edge */
function TurnPill({ isPlayerTurn, players, currentPlayerIndex, turnTimer }) {
  const accent = isPlayerTurn ? 'var(--gg, #14F195)' : '#ff7a4a';
  const accentRgb = isPlayerTurn ? '20,241,149' : '168,58,26';
  const label = isPlayerTurn
    ? `YOUR TURN${turnTimer != null ? ` · ${String(turnTimer).padStart(2, '0')}s` : ''}`
    : `WAITING FOR ${(players[currentPlayerIndex]?.name || 'OPPONENT').toUpperCase().slice(0, 14)}`;

  return (
    <div style={{
      position: 'relative',
      padding: '5px 14px',
      background: `rgba(${accentRgb},0.10)`,
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: `1px solid rgba(${accentRgb},0.45)`,
      clipPath: 'var(--clip-6)',
      display: 'flex', alignItems: 'center', gap: 8,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      <span style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.22) 2px 3px)',
      }} />
      <span style={{ fontSize: 8, color: accent, position: 'relative', animation: 'bhpulse 1.4s ease-in-out infinite' }}>●</span>
      <span style={{
        position: 'relative',
        fontFamily: 'var(--f-display)', fontSize: 11,
        color: accent, letterSpacing: '0.25em',
        textShadow: `0 0 8px rgba(${accentRgb},0.55)`,
      }}>{label}</span>
    </div>
  );
}


/** Wind chip — small icon top-right */
function WindChipMobile({ wind }) {
  const dir = wind > 0 ? '▸' : wind < 0 ? '◂' : '·';
  return (
    <div style={{
      padding: '3px 8px',
      background: 'rgba(10,12,8,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(232,216,154,0.2)',
      clipPath: 'var(--clip-6)',
      display: 'flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--f-mono)', fontSize: 9,
      color: 'var(--bone)', letterSpacing: '0.15em',
      pointerEvents: 'none',
    }}>
      <span style={{ color: 'var(--olive)', fontSize: 7, letterSpacing: '0.2em' }}>WIND</span>
      <span style={{ color: 'var(--accent)' }}>{dir}</span>
      <span>{Math.abs(wind || 0).toFixed(0)}</span>
    </div>
  );
}


/** Vertical edge slider — thin transparent track, big touch target */
function EdgeSlider({ side, label, unit, value, onChange, min, max, color, disabled }) {
  const trackH = 170;
  const safeMin = min ?? 0;
  const safeMax = max ?? 100;
  const v = Math.max(safeMin, Math.min(safeMax, value ?? safeMin));
  const pct = (v - safeMin) / (safeMax - safeMin || 1);
  const thumbY = (1 - pct) * trackH;
  const trackRef = React.useRef(null);

  const handle = (clientY) => {
    if (disabled || !trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const rel = Math.max(0, Math.min(r.height, clientY - r.top));
    const np = 1 - rel / r.height;
    onChange(Math.round(safeMin + np * (safeMax - safeMin)));
  };

  return (
    <div style={{
      position: 'absolute',
      top: '50%', transform: 'translateY(-50%)',
      [side]: side === 'left' ? 8 : 8,
      zIndex: 11, pointerEvents: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      opacity: disabled ? 0.4 : 1, transition: 'opacity 0.3s',
    }}>
      <div style={{
        padding: '2px 7px',
        background: 'rgba(10,12,8,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${color}`,
        clipPath: 'var(--clip-6)',
        fontFamily: 'var(--f-display)', fontSize: 13,
        color, letterSpacing: '0.05em',
        minWidth: 36, textAlign: 'center',
        textShadow: `0 0 6px ${color}66`,
      }}>{Math.round(v)}{unit}</div>

      <div
        ref={trackRef}
        onMouseDown={(e) => handle(e.clientY)}
        onMouseMove={(e) => { if (e.buttons === 1) handle(e.clientY); }}
        onTouchStart={(e) => handle(e.touches[0].clientY)}
        onTouchMove={(e) => handle(e.touches[0].clientY)}
        style={{
          position: 'relative',
          width: 28, height: trackH,
          cursor: disabled ? 'default' : 'ns-resize',
          display: 'flex', justifyContent: 'center',
          touchAction: 'none',
        }}
      >
        <div style={{
          width: 4, height: '100%',
          background: 'rgba(10,12,8,0.55)',
          border: `1px solid ${color}33`,
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: pct * 100 + '%',
            background: `linear-gradient(to top, ${color}, ${color}66)`,
            opacity: 0.55,
          }} />
        </div>

        <div style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          top: thumbY - 6,
          width: 18, height: 12,
          background: color,
          border: '1px solid rgba(0,0,0,0.7)',
          boxShadow: `0 0 10px ${color}, 0 1px 2px rgba(0,0,0,0.6)`,
        }} />
      </div>

      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 7,
        color: 'var(--olive)', letterSpacing: '0.25em',
      }}>{label}</div>
    </div>
  );
}


/** Weapon icon strip — bottom-left, tap to select */
function WeaponIconStrip({ weapons, currentWeaponIndex, onSelect, disabled }) {
  const list = weapons && weapons.length > 0 ? weapons : [{ id: 0, name: 'Single Shot' }];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px',
      background: 'rgba(10,12,8,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(232,216,154,0.18)',
      clipPath: 'var(--clip-6)',
      maxWidth: 'calc(100vw - 160px)',
      overflowX: 'auto',
      pointerEvents: 'auto',
    }}>
      {list.map((w, i) => {
        const meta = w?.id != null ? getWeaponById(w.id) : null;
        const name = (meta?.name || w?.name || 'SHOT').toUpperCase();
        const tier = meta?.tier || 'FREE';
        const tColor = getTierColor(tier);
        const active = i === currentWeaponIndex;
        const iconUrl = (() => { try { return getWeaponIconUrl(meta?.name || w?.name || 'Single Shot'); } catch (_) { return null; } })();

        return (
          <button
            key={i}
            onClick={() => !disabled && onSelect(i)}
            disabled={disabled && !active}
            style={{
              position: 'relative',
              width: 36, height: 36,
              background: active ? 'rgba(232,164,48,0.18)' : 'transparent',
              border: active ? '1px solid var(--accent)' : `1px solid ${tColor}33`,
              color: active ? 'var(--accent)' : 'var(--olive)',
              cursor: disabled && !active ? 'default' : 'pointer',
              padding: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              clipPath: 'var(--clip-6)',
              boxShadow: active ? '0 0 8px rgba(232,164,48,0.35)' : 'none',
              transition: 'all 0.15s',
              overflow: 'hidden',
              flexShrink: 0,
            }}
            title={name}
          >
            {active && (
              <span style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.18) 2px 3px)',
              }} />
            )}
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                onError={(e) => { e.target.style.display = 'none'; }}
                style={{
                  position: 'relative',
                  width: 20, height: 20, objectFit: 'contain',
                  imageRendering: 'pixelated',
                  filter: active ? 'none' : 'grayscale(0.4) brightness(0.85)',
                }}
              />
            ) : (
              <span style={{ position: 'relative', fontSize: 14, lineHeight: 1 }}>•</span>
            )}
            <span style={{
              position: 'relative',
              fontFamily: 'var(--f-display)', fontSize: 6,
              letterSpacing: '0.18em', marginTop: 2, opacity: 0.9,
              maxWidth: '100%', whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{name.slice(0, 5)}</span>
          </button>
        );
      })}
    </div>
  );
}


/** Square chamfered FIRE — clip-10, scanlines, stencil */
function FireSquare({ disabled, onFire }) {
  return (
    <button
      onClick={disabled ? undefined : onFire}
      disabled={disabled}
      style={{
        position: 'relative',
        width: 80, height: 70,
        background: disabled ? 'rgba(80,55,28,0.45)' : 'var(--accent)',
        border: disabled ? '1px solid rgba(140,95,50,0.4)' : '1px solid var(--accent-hot)',
        clipPath: 'var(--clip-10)',
        color: disabled ? 'rgba(180,140,90,0.4)' : '#0e1209',
        cursor: disabled ? 'default' : 'pointer',
        padding: 0, overflow: 'hidden',
        boxShadow: disabled
          ? 'none'
          : '0 0 18px rgba(232,164,48,0.4), 0 0 36px rgba(232,164,48,0.15)',
        animation: disabled ? 'none' : 'firepulse 2.2s ease-in-out infinite',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}>
      <span style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(10,8,2,0) 0 2px, rgba(10,8,2,0.38) 2px 3px)',
      }} />
      <span style={{
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
        fontFamily: 'var(--f-display)', fontSize: 22,
        letterSpacing: '0.22em', textIndent: '0.22em', lineHeight: 1,
        textShadow: disabled ? 'none' : '0 1px 0 rgba(255,220,140,0.4)',
      }}>
        FIRE
        <span style={{
          fontFamily: 'var(--f-mono)', fontSize: 7, letterSpacing: '0.3em',
          marginTop: 4, opacity: 0.55, textIndent: 0,
        }}>▼ TAP</span>
      </span>
    </button>
  );
}


/** Tiny forfeit ✕ — top-left corner */
function ForfeitX({ onForfeit }) {
  return (
    <button
      onClick={onForfeit}
      title="Forfeit"
      style={{
        width: 24, height: 24,
        background: 'rgba(10,12,8,0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border: '1px solid rgba(168,58,26,0.5)',
        color: '#ff7a4a',
        fontFamily: 'var(--f-mono)', fontSize: 11, lineHeight: 1,
        clipPath: 'var(--clip-6)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        letterSpacing: 0,
        pointerEvents: 'auto',
      }}>✕</button>
  );
}


/** Compact move buttons + counter — small floating cluster */
function MoveCluster({ bridge, disabled, moveSteps }) {
  const canMove = !disabled && moveSteps > 0;
  const btnStyle = (active) => ({
    fontFamily: 'var(--f-display)', fontSize: 10,
    letterSpacing: '0.18em',
    padding: '4px 8px',
    border: '1px solid rgba(232,216,154,0.18)',
    cursor: active ? 'pointer' : 'default',
    color: active ? 'var(--bone)' : 'var(--muted)',
    background: active ? 'rgba(184,168,138,0.12)' : 'rgba(10,12,8,0.4)',
    clipPath: 'var(--clip-6)',
    opacity: active ? 1 : 0.5,
    userSelect: 'none',
  });

  // Vertical stack — was horizontal but the wide row clipped the player's
  // tank when its X happened to overlap the cluster's X (most common
  // when terrain peaks centre-left). Stacking vertically collapses the
  // cluster width from ~200px to ~50px so it tucks against the left
  // edge under the angle slider without intruding into the play area.
  // Each button keeps its native horizontal text orientation.
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '4px 6px',
      background: 'rgba(10,12,8,0.55)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      border: '1px solid rgba(232,216,154,0.18)',
      clipPath: 'var(--clip-6)',
      pointerEvents: 'auto',
    }}>
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveLeft() : undefined}>◀ A</button>
      <MoveCounter moves={moveSteps} />
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveRight() : undefined}>D ▶</button>
    </div>
  );
}


/* ════════════════════════════════════════════
   DESKTOP / FFA primitives — UNCHANGED
   (Player card, FFA strip, Turn info, Weapon
   card, desktop-only Move buttons. These are
   identical to the previous BattleHUD so the
   desktop experience is byte-for-byte the same.)
════════════════════════════════════════════ */
function PlayerCard({ player, isMe, isActive, flipped, compact }) {
  if (!player) return null;
  const hp = player.hp ?? 250;
  const maxHp = 250;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const hpColor = hpPct > 50 ? 'var(--gg)' : hpPct > 25 ? 'var(--accent-hot)' : 'var(--red)';
  const dead = player.alive === false;
  const pColor = player.color || 'var(--bone)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: compact ? 6 : 8,
      flexDirection: flipped ? 'row-reverse' : 'row',
      background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
      border: '1px solid ' + (isActive ? pColor : 'rgba(61,74,47,0.6)'),
      padding: compact ? '5px 8px' : '7px 10px',
      opacity: dead ? 0.35 : 1,
      position: 'relative',
      transition: 'border-color 0.3s',
    }}>
      {isActive && !dead && (
        <div style={{
          position: 'absolute', top: -9,
          left: flipped ? 'auto' : 8, right: flipped ? 8 : 'auto',
          background: 'var(--bg-deep)', color: pColor,
          fontFamily: 'var(--f-mono)', fontSize: 8,
          letterSpacing: '0.25em', padding: '0 5px', whiteSpace: 'nowrap',
        }}>▸ FIRING</div>
      )}
      <div style={{
        width: compact ? 8 : 10, height: compact ? 8 : 10,
        borderRadius: 2, background: pColor, flexShrink: 0,
        boxShadow: isActive ? '0 0 6px ' + pColor : 'none',
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontFamily: 'var(--f-display)', fontSize: compact ? 11 : 13,
            color: pColor, letterSpacing: 0.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: compact ? 80 : 120,
          }}>
            {player.name || (isMe ? 'YOU' : 'ENEMY')}
            {isMe && <span style={{ fontFamily: 'var(--f-mono)', color: 'var(--kh)', fontSize: 8, marginLeft: 3 }}>· YOU</span>}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--kh)', letterSpacing: '0.1em', flexShrink: 0 }}>
            {dead ? 'KIA' : `${hp}/${maxHp}`}
          </span>
        </div>
        <div style={{ height: 4, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.08)', marginTop: 3, overflow: 'hidden' }}>
          <div style={{ width: hpPct + '%', height: '100%', background: hpColor, transition: 'width 0.4s ease-out' }} />
        </div>
      </div>
    </div>
  );
}

function FFAPlayerStrip({ players, myIdx, currentIdx }) {
  const aliveCount = players.filter(p => p.alive !== false).length;
  const me = players[myIdx];
  const current = players[currentIdx];
  const meIsCurrent = myIdx === currentIdx;
  const others = players.map((p, i) => ({ p, i })).filter(({ i }) => i !== currentIdx && i !== myIdx);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '3px 8px', background: 'var(--bg-raised)',
        border: '1px solid var(--border)', clipPath: 'var(--clip-6)', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'var(--f-display)', fontSize: 12, color: 'var(--bone)', letterSpacing: '0.08em', lineHeight: 1 }}>{aliveCount}/{players.length}</span>
        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)', letterSpacing: '0.2em', marginTop: 2 }}>ALIVE</span>
      </div>
      <PlayerCard player={current} isMe={meIsCurrent} isActive compact />
      {!meIsCurrent && me && <PlayerCard player={me} isMe isActive={false} compact />}
      {others.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center', minWidth: 0, flex: 1, maxWidth: 140 }}>
          {others.map(({ p, i }) => {
            const dead = p.alive === false;
            const hp = p.hp ?? 250;
            const hpPct = Math.max(0, Math.min(100, (hp / 250) * 100));
            const tint = p.color || 'var(--olive)';
            return (
              <div key={i} title={`${p.name || `P${i + 1}`} · ${dead ? 'KIA' : `${hp}/250`}`}
                style={{ width: 14, height: 18, background: 'var(--bg-deep)', border: `1px solid ${dead ? 'var(--rust)' : tint}`, position: 'relative', opacity: dead ? 0.35 : 1, flexShrink: 0 }}>
                {!dead && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${hpPct}%`, background: tint, opacity: 0.6 }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TurnInfo({ round, totalRounds, turnTimer, isPlayerTurn, wind, players, currentPlayerIndex, gameMode }) {
  const activePlayer = players[currentPlayerIndex];
  const warn = turnTimer != null && turnTimer <= 10;
  const windDir = wind >= 0 ? '▸' : '◂';
  const isGroupChat = gameMode === 'group-chat';

  return (
    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 130, padding: '0 8px' }}>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 3 }}>
        {isGroupChat ? `${players.filter(p => p.alive !== false).length}/${players.length} ALIVE` : `ROUND ${round} / ${totalRounds}`}
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.08em', color: isPlayerTurn ? 'var(--gg, #14F195)' : 'var(--red)', lineHeight: 1.2 }}>
        {isPlayerTurn ? 'YOUR TURN' : ((activePlayer?.name || 'ENEMY') + "'S TURN")}
      </div>
      {turnTimer != null && (
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: warn ? 22 : 18, color: warn ? 'var(--red)' : 'var(--kh)', letterSpacing: 1, lineHeight: 1, animation: warn ? 'fl 1s ease-in-out infinite' : 'none', marginTop: 2 }}>
          {String(turnTimer).padStart(2, '0')}s
        </div>
      )}
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--kh)', letterSpacing: '0.18em', marginTop: 3, opacity: 0.7 }}>
        WIND {windDir} {Math.abs(wind).toFixed(1)}
      </div>
    </div>
  );
}

function WeaponCard({ weapon, isSelected, onClick, disabled }) {
  const meta = weapon?.id != null ? getWeaponById(weapon.id) : null;
  const tier = meta?.tier || 'FREE';
  const tColor = getTierColor(tier);
  const tLabel = getTierLabel(tier);
  return (
    <button onClick={onClick} style={{
      background: isSelected ? 'rgba(200,168,74,0.18)' : 'rgba(10,12,8,0.85)',
      color: isSelected ? 'var(--bone)' : 'var(--olive)',
      border: '1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)'),
      padding: '8px 10px', cursor: disabled && !isSelected ? 'default' : 'pointer',
      textAlign: 'left', minWidth: 110, maxWidth: 160,
      opacity: disabled && !isSelected ? 0.45 : 1,
      transition: 'border-color 0.15s, background 0.15s', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.15em', marginBottom: 3 }}>
        <span style={{ color: tColor }}>{tLabel}</span>
        <span style={{ color: 'var(--kh)' }}>×∞</span>
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: 0.5, color: 'var(--bone)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {(meta?.name || weapon?.name || 'SINGLE SHOT').toUpperCase()}
      </div>
    </button>
  );
}

function MoveButtons({ bridge, disabled, moveSteps, compact }) {
  const canMove = !disabled && moveSteps > 0;
  const btnStyle = (active) => ({
    fontFamily: 'var(--f-display)', fontSize: compact ? 11 : 13, letterSpacing: 2,
    padding: compact ? '5px 10px' : '7px 14px', border: 'none',
    cursor: active ? 'pointer' : 'default',
    color: active ? 'var(--bone)' : 'var(--muted)',
    background: active ? 'rgba(184,168,138,0.12)' : 'rgba(42,51,31,0.5)',
    opacity: active ? 1 : 0.4, userSelect: 'none',
  });
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveLeft() : undefined}>◀ A</button>
      {!compact && <MoveCounter moves={moveSteps} />}
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveRight() : undefined}>D ▶</button>
    </div>
  );
}


/* ════════════════════════════════════════════
   MAIN BATTLEHUD
════════════════════════════════════════════ */
function BattleHUD({ bridge, gameState, wager, turnTimer, onLeaveMatch, onForfeit, gameMode }) {
  const {
    players = [], myPlayerIndex = -1, currentPlayerIndex = 0,
    isEliminated = false, eliminatedPlacement = null,
    isPlayerTurn = false, isFiring = false,
    weapons = [], currentWeaponIndex = 0,
    moveSteps = 0, gold = 0, wind = 0,
    round = 1, totalRounds = 5, potDisplay = 0,
  } = gameState;

  const disabled = !isPlayerTurn || isFiring;
  const isMobile = useIsMobile();
  const isGroupChat = gameMode === 'group-chat';
  const myPlayer = players[myPlayerIndex] || null;
  const angle = myPlayer?.angle ?? 45;
  const power = myPlayer?.power ?? 60;

  /* ─────────────────────────────────────
     MOBILE — full-bleed AAA overlay
  ───────────────────────────────────── */
  if (isMobile) {
    const oppIdx = players.findIndex((_, i) => i !== myPlayerIndex);
    const opponent = oppIdx >= 0 ? players[oppIdx] : null;
    const is1v1 = players.length <= 2;

    // Safe-area shorthands. group-chat reserves 48px each side for TG chrome.
    const topInset = isGroupChat
      ? 'max(20px, calc(env(safe-area-inset-top, 0px) + 20px))'
      : 'max(14px, calc(env(safe-area-inset-top, 0px) + 14px))';
    const sideInsetL = isGroupChat
      ? 'max(48px, calc(env(safe-area-inset-left, 0px) + 48px))'
      : 'max(14px, calc(env(safe-area-inset-left, 0px) + 14px))';
    const sideInsetR = isGroupChat
      ? 'max(48px, calc(env(safe-area-inset-right, 0px) + 48px))'
      : 'max(14px, calc(env(safe-area-inset-right, 0px) + 14px))';
    const bottomInset = 'max(16px, env(safe-area-inset-bottom, 16px))';

    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10 }}>
        {/* TOP-LEFT: forfeit ✕ */}
        {!isGroupChat && (
          <div style={{ position: 'absolute', top: topInset, left: sideInsetL, zIndex: 13 }}>
            <ForfeitX onForfeit={onForfeit} />
          </div>
        )}

        {/* TOP-LEFT/RIGHT player pills (1v1) OR FFA strip across the top */}
        {is1v1 ? (
          <>
            <div style={{
              position: 'absolute',
              top: topInset,
              left: `calc(${sideInsetL} + ${isGroupChat ? '0px' : '34px'})`,
              zIndex: 12,
            }}>
              {myPlayer && <CornerHPPill player={myPlayer} isMe side="left" />}
            </div>
            <div style={{ position: 'absolute', top: topInset, right: sideInsetR, zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              {opponent && <CornerHPPill player={opponent} isMe={false} side="right" />}
              <WindChipMobile wind={wind} />
            </div>
          </>
        ) : (
          <div style={{
            position: 'absolute',
            top: topInset,
            left: sideInsetL,
            right: sideInsetR,
            zIndex: 12,
            padding: '6px 8px',
            background: 'rgba(10,12,8,0.55)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(61,74,47,0.5)',
            clipPath: 'var(--clip-6)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <FFAPlayerStrip players={players} myIdx={myPlayerIndex} currentIdx={currentPlayerIndex} />
            <WindChipMobile wind={wind} />
          </div>
        )}

        {/* TOP-CENTER turn pill */}
        <div style={{
          position: 'absolute',
          top: `calc(${topInset} + 38px)`,
          left: '50%', transform: 'translateX(-50%)',
          zIndex: 11,
        }}>
          <TurnPill
            isPlayerTurn={isPlayerTurn}
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            turnTimer={turnTimer}
          />
        </div>

        {/* POT (top-center, below turn pill — only if wagered) */}
        {wager > 0 && (
          <div style={{
            position: 'absolute',
            top: `calc(${topInset} + 70px)`,
            left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--f-mono)', fontSize: 9,
            color: 'var(--gg, #14F195)', letterSpacing: '0.2em',
            opacity: 0.75, pointerEvents: 'none', zIndex: 11,
          }}>
            POT ◆ {potDisplay} SOL
          </div>
        )}

        {/* LEFT: angle slider */}
        <EdgeSlider
          side="left" label="ANG" unit="°"
          value={angle} onChange={(v) => bridge.setAngle(v)}
          min={0} max={180} color="var(--accent)" disabled={disabled}
        />

        {/* RIGHT: power slider */}
        <EdgeSlider
          side="right" label="PWR" unit=""
          value={power} onChange={(v) => bridge.setPower(v)}
          min={5} max={100} color="#e8d89a" disabled={disabled}
        />

        {/* BOTTOM-LEFT: weapons + move cluster */}
        <div style={{
          position: 'absolute',
          bottom: bottomInset,
          left: sideInsetL,
          zIndex: 12,
          display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start',
        }}>
          <MoveCluster bridge={bridge} disabled={disabled} moveSteps={moveSteps} />
          <WeaponIconStrip
            weapons={weapons}
            currentWeaponIndex={currentWeaponIndex}
            onSelect={(i) => bridge.selectWeapon(i)}
            disabled={disabled}
          />
        </div>

        {/* BOTTOM-LEFT corner: gold readout (tiny, decorative) */}
        <div style={{
          position: 'absolute',
          bottom: `calc(${bottomInset} + 84px)`,
          left: sideInsetL,
          fontFamily: 'var(--f-mono)', fontSize: 8,
          color: 'rgba(184,168,138,0.5)',
          letterSpacing: '0.2em', pointerEvents: 'none', zIndex: 11,
        }}>
          GOLD ◈ {gold}G
        </div>

        {/* BOTTOM-RIGHT: square FIRE */}
        <div style={{
          position: 'absolute',
          bottom: bottomInset,
          right: sideInsetR,
          zIndex: 14,
        }}>
          <FireSquare disabled={disabled} onFire={() => bridge.fire()} />
        </div>

        {/* GROUP-CHAT: forfeit lives in a corner stack with leave instead */}
        {isGroupChat && (
          <div style={{
            position: 'absolute',
            bottom: `calc(${bottomInset} + 90px)`,
            right: sideInsetR,
            zIndex: 13,
          }}>
            <ForfeitX onForfeit={onForfeit} />
          </div>
        )}

        {/* ELIMINATION OVERLAY */}
        {isEliminated && players.length > 2 && (
          <EliminationOverlay placement={eliminatedPlacement} onLeave={onLeaveMatch} />
        )}

        <style>{`
          @keyframes bhpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
          @keyframes firepulse {
            0%,100% { box-shadow: 0 0 18px rgba(232,164,48,0.4), 0 0 36px rgba(232,164,48,0.15); }
            50%     { box-shadow: 0 0 26px rgba(232,164,48,0.65), 0 0 52px rgba(232,164,48,0.3); }
          }
          @keyframes fl { 0%,97%,100% { opacity: 1; } 98% { opacity: 0.6; } 99% { opacity: 1; } }
        `}</style>
      </div>
    );
  }


  /* ─────────────────────────────────────
     DESKTOP — UNCHANGED FROM PREVIOUS BUILD
  ───────────────────────────────────── */
  const is1v1 = players.length <= 2;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'rgba(14,18,9,0.92)',
        borderBottom: '1px solid rgba(61,74,47,0.6)',
        padding: isGroupChat
          ? 'max(10px, env(safe-area-inset-top, 10px)) max(56px, calc(env(safe-area-inset-right, 0px) + 56px)) 10px max(56px, calc(env(safe-area-inset-left, 0px) + 56px))'
          : '10px 16px',
        flexShrink: 0,
      }}>
        {is1v1 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <PlayerCard player={players[0]} isMe={myPlayerIndex === 0} isActive={currentPlayerIndex === 0} />
            <TurnInfo round={round} totalRounds={totalRounds} turnTimer={turnTimer} isPlayerTurn={isPlayerTurn} wind={wind} players={players} currentPlayerIndex={currentPlayerIndex} gameMode={gameMode} />
            <PlayerCard player={players[1]} isMe={myPlayerIndex === 1} isActive={currentPlayerIndex === 1} flipped />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--kh)', letterSpacing: '0.2em' }}>
              <span>{isGroupChat ? `${players.filter(p => p.alive !== false).length}/${players.length} ALIVE · GROUP CHAT` : `ROUND ${round} / ${totalRounds} · ${players.length}P FFA`}</span>
              <span style={{ color: isPlayerTurn ? 'var(--gg, #14F195)' : 'var(--red)', fontFamily: 'var(--f-display)', fontSize: 13 }}>
                {isPlayerTurn ? 'YOUR TURN' : ((players[currentPlayerIndex]?.name || 'ENEMY') + "'S TURN")}
                {turnTimer != null && <span style={{ color: turnTimer <= 10 ? 'var(--red)' : 'var(--kh)', fontSize: 14, marginLeft: 8 }}>{String(turnTimer).padStart(2, '0')}s</span>}
              </span>
              <span>WIND {wind >= 0 ? '▸' : '◂'} {Math.abs(wind).toFixed(1)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, 1fr)`, gap: 8 }}>
              {players.map((p, i) => <PlayerCard key={i} player={p} isMe={i === myPlayerIndex} isActive={i === currentPlayerIndex} compact />)}
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--kh)', letterSpacing: '0.2em' }}>
              <span>TURN ORDER ▸</span>
              {players.map((p, i) => (
                <span key={i} style={{
                  color: i === currentPlayerIndex ? (p.color || 'var(--am)') : (p.alive === false ? 'var(--rust)' : 'var(--kh)'),
                  textDecoration: p.alive === false ? 'line-through' : 'none',
                  fontFamily: i === currentPlayerIndex ? 'var(--f-display)' : 'var(--f-mono)',
                  fontSize: i === currentPlayerIndex ? 11 : 9,
                }}>{i === currentPlayerIndex ? '' : '▸ '}{p.name || `P${i + 1}`}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', pointerEvents: 'none' }}>
        {wager > 0 && (
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--gg, #14F195)', letterSpacing: '0.2em', opacity: 0.8 }}>
            POT ◆ {potDisplay} SOL
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 10, left: 12, fontFamily: 'var(--f-mono)', fontSize: 9, color: 'rgba(184,168,138,0.4)', letterSpacing: '0.2em' }}>
          GOLD ◈ {gold}G
        </div>
      </div>

      <div style={{
        background: 'linear-gradient(to top, rgba(14,18,9,0.82) 60%, rgba(14,18,9,0.0) 100%)',
        borderTop: '1px solid rgba(61,74,47,0.45)',
        padding: '10px 14px', flexShrink: 0, pointerEvents: 'auto',
        opacity: isPlayerTurn ? 1 : 0.55, transition: 'opacity 0.3s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'stretch' }}>
          <div style={{ background: 'rgba(10,12,8,0.6)', border: '1px solid rgba(61,74,47,0.6)', padding: '8px 10px' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 6 }}>
              ARMAMENT · {weapons.length} LOADED
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {weapons.length === 0
                ? <WeaponCard weapon={{ id: 0, name: 'Single Shot' }} isSelected disabled={disabled} />
                : weapons.map((w, i) => (
                    <WeaponCard key={i} weapon={w} isSelected={i === currentWeaponIndex} onClick={() => !disabled && bridge.selectWeapon(i)} disabled={disabled} />
                  ))}
            </div>
          </div>

          <div style={{ background: 'rgba(10,12,8,0.6)', border: '1px solid rgba(61,74,47,0.6)', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 3 }}>
                <span>POWER</span><span style={{ color: 'var(--accent)' }}>{Math.round(power)} / 100</span>
              </div>
              <input type="range" min={5} max={100} step={1} value={power} onChange={(e) => !disabled && bridge.setPower(Number(e.target.value))} disabled={disabled} style={{ width: '100%', accentColor: 'var(--accent)', cursor: disabled ? 'default' : 'pointer' }} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 3 }}>
                <span>ANGLE</span><span style={{ color: 'var(--accent)' }}>{Math.round(angle)}°</span>
              </div>
              <input type="range" min={0} max={180} step={1} value={angle} onChange={(e) => !disabled && bridge.setAngle(Number(e.target.value))} disabled={disabled} style={{ width: '100%', accentColor: 'var(--accent)', cursor: disabled ? 'default' : 'pointer' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MoveButtons bridge={bridge} disabled={disabled} moveSteps={moveSteps} />
              <MoveCounter moves={moveSteps} />
              <button onClick={onForfeit} style={{
                marginLeft: 'auto', fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: 1,
                padding: '4px 8px', border: '1px solid rgba(204,34,0,0.3)',
                background: 'rgba(204,34,0,0.12)', color: 'var(--red)', cursor: 'pointer',
                pointerEvents: 'auto', opacity: 0.75,
              }}>FORFEIT</button>
            </div>
          </div>

          <button onClick={disabled ? undefined : () => bridge.fire()} style={{
            background: disabled ? 'var(--bg-raised)' : 'var(--accent)',
            color: disabled ? 'var(--muted)' : 'var(--bg-deep)',
            border: 'none', clipPath: FIRE_CLIP, padding: '0 36px',
            fontFamily: 'var(--f-display)', fontSize: 32, letterSpacing: '0.1em',
            cursor: disabled ? 'default' : 'pointer', minHeight: 100,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            transition: 'background 0.15s', userSelect: 'none',
          }}>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>▼ SPACE</span>
            FIRE
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>▲</span>
          </button>
        </div>
      </div>

      {isEliminated && players.length > 2 && <EliminationOverlay placement={eliminatedPlacement} onLeave={onLeaveMatch} />}

      <style>{`
        @keyframes fl { 0%,97%,100% { opacity: 1; } 98% { opacity: 0.6; } 99% { opacity: 1; } }
      `}</style>
    </div>
  );
}


/* ════════════════════════════════════════════
   ELIMINATION OVERLAY
   Auto-shown on KIA. Self-dismissable so the player can keep
   spectating the live match — can be re-summoned via the small
   pill that lingers in the corner.
════════════════════════════════════════════ */
function EliminationOverlay({ placement, onLeave }) {
  const [dismissed, setDismissed] = React.useState(false);
  const ordinal = (n) => n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : (n || '?') + 'TH';

  // Dismissed: tiny corner pill that re-opens the overlay or leaves outright.
  if (dismissed) {
    return (
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'rgba(10,12,8,0.7)', border: '1px solid rgba(61,74,47,0.6)',
        padding: '4px 6px', pointerEvents: 'auto',
      }}>
        <button onClick={() => setDismissed(false)} style={{
          fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: 1.5,
          background: 'transparent', border: 'none', color: 'var(--olive)',
          cursor: 'pointer', padding: '2px 6px',
        }} title="Show elimination panel">KIA · {ordinal(placement)}</button>
        <button onClick={onLeave} style={{
          fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: 1.5,
          background: 'transparent', border: 'none', color: 'var(--olive)',
          cursor: 'pointer', padding: '2px 6px', borderLeft: '1px solid rgba(61,74,47,0.6)',
        }} title="Leave match">LEAVE</button>
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      background: 'rgba(10,12,8,0.9)', border: '1px solid rgba(61,74,47,0.8)',
      padding: '22px 32px', textAlign: 'center', pointerEvents: 'auto', zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
      minWidth: 200,
    }}>
      {/* Close X — top-right of overlay. Dismisses to corner pill so the
          player can spectate the rest of the match (Just1Fishing's request
          after the GF9B match showed the overlay locked the view). */}
      <button onClick={() => setDismissed(true)} style={{
        position: 'absolute', top: 4, right: 4,
        fontFamily: 'var(--f-mono)', fontSize: 14, lineHeight: 1,
        background: 'transparent', border: 'none', color: 'var(--olive)',
        cursor: 'pointer', padding: '4px 8px',
      }} title="Hide — keep spectating" aria-label="Dismiss elimination overlay">×</button>

      <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--bone)', letterSpacing: 3 }}>YOU PLACED {ordinal(placement)}</div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--kh)', letterSpacing: 2, opacity: 0.6 }}>SPECTATING...</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setDismissed(true)} style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: 1.5,
          padding: '8px 14px', border: '1px solid rgba(61,74,47,0.6)',
          background: 'transparent', color: 'var(--olive)', cursor: 'pointer',
        }}>WATCH</button>
        <button onClick={onLeave} style={{
          fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: 2,
          padding: '8px 20px', border: '1px solid rgba(61,74,47,0.8)',
          background: 'rgba(184,168,138,0.12)', color: 'var(--bone)', cursor: 'pointer',
        }}>LEAVE MATCH</button>
      </div>
    </div>
  );
}

export default React.memo(BattleHUD);
