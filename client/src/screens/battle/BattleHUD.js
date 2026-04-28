import React from 'react';
import { getWeaponById, getTierColor } from '../../data/weapons';
import AngleControl from './AngleControl';
import PowerControl from './PowerControl';
import MoveCounter from './MoveCounter';
import useIsMobile from '../../hooks/useIsMobile';

const TIER_LABELS = {
  FREE: 'FREE', STANDARD: 'STD', TACTICAL: 'TAC',
  RARE: 'RARE', EPIC: 'EPIC', LEGENDARY: 'LGND', PRESTIGE: 'PRST',
};
function getTierLabel(tier) { return TIER_LABELS[tier] || 'STD'; }


/* ════════════════════════════════════════════
   PLAYER CARD (top bar)
════════════════════════════════════════════ */
function PlayerCard({ player, isMe, isActive, flipped, compact }) {
  if (!player) return null;
  const hp    = player.hp ?? 250;
  const maxHp = 250;
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const hpColor = hpPct > 50 ? '#4CAF50' : hpPct > 25 ? '#FF9800' : '#f44336';
  const dead  = player.alive === false;
  const pColor = player.color || '#b8a88a';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? 6 : 8,
      flexDirection: flipped ? 'row-reverse' : 'row',
      background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
      border: '1px solid ' + (isActive ? pColor : 'rgba(61,74,47,0.6)'),
      padding: compact ? '5px 8px' : '7px 10px',
      opacity: dead ? 0.35 : 1,
      position: 'relative',
      transition: 'border-color 0.3s',
    }}>
      {/* FIRING badge */}
      {isActive && !dead && (
        <div style={{
          position: 'absolute',
          top: -9,
          left: flipped ? 'auto' : 8,
          right: flipped ? 8 : 'auto',
          background: '#0a0c08',
          color: pColor,
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 8,
          letterSpacing: '0.25em',
          padding: '0 5px',
          whiteSpace: 'nowrap',
        }}>▸ FIRING</div>
      )}

      {/* Color swatch */}
      <div style={{
        width: compact ? 8 : 10,
        height: compact ? 8 : 10,
        borderRadius: 2,
        background: pColor,
        flexShrink: 0,
        boxShadow: isActive ? '0 0 6px ' + pColor : 'none',
      }} />

      {/* Name + HP */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 4,
        }}>
          <span style={{
            fontFamily: "'Black Ops One', cursive",
            fontSize: compact ? 11 : 13,
            color: pColor,
            letterSpacing: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: compact ? 80 : 120,
          }}>
            {player.name || (isMe ? 'YOU' : 'ENEMY')}
            {isMe && (
              <span style={{ fontFamily: "'Share Tech Mono', monospace", color: 'var(--kh)', fontSize: 8, marginLeft: 3 }}>
                · YOU
              </span>
            )}
          </span>
          <span style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 9,
            color: 'var(--kh)',
            letterSpacing: '0.1em',
            flexShrink: 0,
          }}>
            {dead ? 'KIA' : `${hp}/${maxHp}`}
          </span>
        </div>

        {/* HP bar */}
        <div style={{
          height: 4,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.08)',
          marginTop: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: hpPct + '%',
            height: '100%',
            background: hpColor,
            transition: 'width 0.4s ease-out',
          }} />
        </div>
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════
   TURN / ROUND INFO (center of top bar, 1v1)
════════════════════════════════════════════ */
function TurnInfo({ round, totalRounds, turnTimer, isPlayerTurn, wind, players, currentPlayerIndex }) {
  const activePlayer = players[currentPlayerIndex];
  const warn = turnTimer != null && turnTimer <= 10;
  const windDir = wind >= 0 ? '▸' : '◂';

  return (
    <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 130, padding: '0 8px' }}>
      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9,
        color: 'var(--kh)',
        letterSpacing: '0.2em',
        marginBottom: 3,
      }}>
        ROUND {round} / {totalRounds}
      </div>

      <div style={{
        fontFamily: "'Black Ops One', cursive",
        fontSize: 14,
        letterSpacing: '0.08em',
        color: isPlayerTurn ? '#14F195' : '#cc2200',
        lineHeight: 1.2,
      }}>
        {isPlayerTurn
          ? 'YOUR TURN'
          : ((activePlayer?.name || 'ENEMY') + "'S TURN")
        }
      </div>

      {turnTimer != null && (
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: warn ? 22 : 18,
          color: warn ? '#d83030' : 'var(--kh)',
          letterSpacing: 1,
          lineHeight: 1,
          animation: warn ? 'fl 1s ease-in-out infinite' : 'none',
          marginTop: 2,
        }}>
          {String(turnTimer).padStart(2, '0')}s
        </div>
      )}

      <div style={{
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 9,
        color: 'var(--kh)',
        letterSpacing: '0.18em',
        marginTop: 3,
        opacity: 0.7,
      }}>
        WIND {windDir} {Math.abs(wind).toFixed(1)}
      </div>
    </div>
  );
}


/* ════════════════════════════════════════════
   WEAPON CARD (control bar)
════════════════════════════════════════════ */
function WeaponCard({ weapon, isSelected, onClick, disabled }) {
  const meta     = weapon?.id != null ? getWeaponById(weapon.id) : null;
  const tier     = meta?.tier || 'FREE';
  const tColor   = getTierColor(tier);
  const tLabel   = getTierLabel(tier);

  return (
    <button
      onClick={onClick}
      style={{
        background: isSelected ? 'rgba(200,168,74,0.18)' : 'rgba(10,12,8,0.85)',
        color: isSelected ? '#e8dcc8' : '#8a9a80',
        border: '1px solid ' + (isSelected ? '#c8a84a' : '#3d4a2f'),
        padding: '8px 10px',
        cursor: disabled && !isSelected ? 'default' : 'pointer',
        textAlign: 'left',
        minWidth: 110,
        maxWidth: 160,
        opacity: disabled && !isSelected ? 0.45 : 1,
        transition: 'border-color 0.15s, background 0.15s',
        flexShrink: 0,
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: "'Share Tech Mono', monospace",
        fontSize: 11,
        letterSpacing: '0.15em',
        marginBottom: 3,
      }}>
        <span style={{ color: tColor }}>{tLabel}</span>
        {/* All purchased weapons have unlimited use within the match. */}
        <span style={{ color: 'var(--kh)' }}>×∞</span>
      </div>
      <div style={{
        fontFamily: "'Black Ops One', cursive",
        fontSize: 14,
        letterSpacing: 0.5,
        color: isSelected ? '#e8dcc8' : '#b8a88a',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {(weapon?.name || 'SINGLE SHOT').toUpperCase()}
      </div>
    </button>
  );
}


/* ════════════════════════════════════════════
   MOVE BUTTONS
════════════════════════════════════════════ */
function MoveButtons({ bridge, disabled, moveSteps, compact }) {
  const canMove = !disabled && moveSteps > 0;
  const btnStyle = (active) => ({
    fontFamily: "'Black Ops One', cursive",
    fontSize: compact ? 11 : 13,
    letterSpacing: 2,
    padding: compact ? '5px 10px' : '7px 14px',
    border: 'none',
    cursor: active ? 'pointer' : 'default',
    color: active ? '#e8dcc8' : '#5c4a3a',
    background: active ? 'rgba(184,168,138,0.12)' : 'rgba(42,51,31,0.5)',
    opacity: active ? 1 : 0.4,
    userSelect: 'none',
  });

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveLeft() : undefined}>
        {'◀ A'}
      </button>
      {!compact && <MoveCounter moves={moveSteps} />}
      <button style={btnStyle(canMove)} onClick={canMove ? () => bridge.moveRight() : undefined}>
        {'D ▶'}
      </button>
    </div>
  );
}


/* ════════════════════════════════════════════
   MAIN BATTLEHUD
════════════════════════════════════════════ */
function BattleHUD({ bridge, gameState, wager, turnTimer, onLeaveMatch, onForfeit }) {
  const {
    players = [],
    myPlayerIndex = -1,
    currentPlayerIndex = 0,
    isEliminated = false,
    eliminatedPlacement = null,
    isPlayerTurn = false,
    isFiring = false,
    weapons = [],
    currentWeaponIndex = 0,
    moveSteps = 0,
    gold = 0,
    wind = 0,
    round = 1,
    totalRounds = 5,
    potDisplay = 0,
  } = gameState;

  const disabled = !isPlayerTurn || isFiring;
  const isMobile = useIsMobile();

  const myPlayer   = players[myPlayerIndex] || null;
  const angle      = myPlayer?.angle ?? 45;
  const power      = myPlayer?.power ?? 60;

  /* ── Inject FIRE-button clip path if not already in CSS ── */
  /* clip-10: rectangle with top-right and bottom-left corners cut diagonally */
  const fireClip = 'polygon(0% 0%, calc(100% - 12px) 0%, 100% 12px, 100% 100%, 12px 100%, 0% calc(100% - 12px))';

  /* ─────────────────────────────────────
     MOBILE LAYOUT
  ───────────────────────────────────── */
  if (isMobile) {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, display: 'flex', flexDirection: 'column' }}>

        {/* TOP BAR — compact player strips */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          background: 'rgba(14,18,9,0.88)',
          borderBottom: '1px solid rgba(61,74,47,0.5)',
          gap: 6,
        }}>
          <div style={{ display: 'flex', gap: 4, flex: 1 }}>
            {players.map((p, i) => (
              <PlayerCard key={i} player={p} isMe={i === myPlayerIndex} isActive={i === currentPlayerIndex} compact />
            ))}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: "'Black Ops One', cursive", fontSize: 11, color: isPlayerTurn ? '#14F195' : '#cc2200', letterSpacing: 1 }}>
              {isPlayerTurn ? 'YOUR TURN' : 'WAIT'}
            </div>
            {turnTimer != null && (
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: turnTimer <= 10 ? '#d83030' : 'var(--kh)', letterSpacing: 1 }}>
                {turnTimer}s
              </div>
            )}
          </div>
        </div>

        {/* ANGLE SLIDER — left edge */}
        <div style={{
          position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'auto', zIndex: 11,
          opacity: isPlayerTurn ? 1 : 0.08, transition: 'opacity 0.3s',
        }}>
          <AngleControl
            angle={angle}
            onChange={(v) => bridge.setAngle(v)}
            disabled={disabled}
            compact vertical
          />
        </div>

        {/* POWER SLIDER — right edge */}
        <div style={{
          position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
          pointerEvents: 'auto', zIndex: 11,
          opacity: isPlayerTurn ? 1 : 0.08, transition: 'opacity 0.3s',
        }}>
          <PowerControl
            power={power}
            onChange={(v) => bridge.setPower(v)}
            disabled={disabled}
            compact vertical
          />
        </div>

        {/* BOTTOM CONTROLS */}
        <div style={{
          marginTop: 'auto',
          padding: '8px 10px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
          background: 'rgba(14,18,9,0.92)',
          borderTop: '1px solid rgba(61,74,47,0.5)',
          pointerEvents: 'auto',
          opacity: isPlayerTurn ? 1 : 0.08,
          transition: 'opacity 0.3s',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <MoveButtons bridge={bridge} disabled={disabled} moveSteps={moveSteps} compact />
          <MoveCounter moves={moveSteps} />

          {/* Weapon selector — compact horizontal strip */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: 200 }}>
            {weapons.map((w, i) => (
              <WeaponCard key={i} weapon={w} isSelected={i === currentWeaponIndex} onClick={() => bridge.selectWeapon(i)} disabled={disabled} />
            ))}
          </div>

          {/* Fire button */}
          <button
            onClick={disabled ? undefined : () => bridge.fire()}
            style={{
              background: disabled ? '#2a331f' : '#c8a84a',
              color: disabled ? '#5c4a3a' : '#0a0c08',
              border: 'none',
              padding: '8px 20px',
              fontFamily: "'Black Ops One', cursive",
              fontSize: 18,
              letterSpacing: '0.1em',
              cursor: disabled ? 'default' : 'pointer',
              opacity: disabled ? 0.4 : 1,
            }}
          >
            FIRE
          </button>

          {/* Forfeit */}
          <button
            onClick={onForfeit}
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              letterSpacing: 1,
              padding: '5px 8px',
              border: '1px solid rgba(204,34,0,0.3)',
              background: 'rgba(204,34,0,0.12)',
              color: '#cc2200',
              cursor: 'pointer',
            }}
          >
            FORFEIT
          </button>
        </div>

        {/* ELIMINATION OVERLAY */}
        {isEliminated && players.length > 2 && <EliminationOverlay placement={eliminatedPlacement} onLeave={onLeaveMatch} />}
      </div>
    );
  }


  /* ─────────────────────────────────────
     DESKTOP LAYOUT
  ───────────────────────────────────── */
  const is1v1 = players.length <= 2;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 10, display: 'flex', flexDirection: 'column' }}>

      {/* ── TOP BAR ── */}
      <div style={{
        background: 'rgba(14,18,9,0.92)',
        borderBottom: '1px solid rgba(61,74,47,0.6)',
        padding: '10px 16px',
        flexShrink: 0,
      }}>
        {is1v1 ? (
          /* 1v1: two player cards flanking the turn info */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
            <PlayerCard player={players[0]} isMe={myPlayerIndex === 0} isActive={currentPlayerIndex === 0} />
            <TurnInfo
              round={round} totalRounds={totalRounds}
              turnTimer={turnTimer} isPlayerTurn={isPlayerTurn}
              wind={wind} players={players} currentPlayerIndex={currentPlayerIndex}
            />
            <PlayerCard player={players[1]} isMe={myPlayerIndex === 1} isActive={currentPlayerIndex === 1} flipped />
          </div>
        ) : (
          /* FFA: row of player cards + turn ticker below */
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: 'var(--kh)', letterSpacing: '0.2em' }}>
              <span>ROUND {round} / {totalRounds} · {players.length}P FFA</span>
              <span style={{ color: isPlayerTurn ? '#14F195' : '#cc2200', fontFamily: "'Black Ops One', cursive", fontSize: 13 }}>
                {isPlayerTurn ? 'YOUR TURN' : ((players[currentPlayerIndex]?.name || 'ENEMY') + "'S TURN")}
                {turnTimer != null && (
                  <span style={{ color: turnTimer <= 10 ? '#d83030' : 'var(--kh)', fontSize: 14, marginLeft: 8 }}>
                    {String(turnTimer).padStart(2, '0')}s
                  </span>
                )}
              </span>
              <span>WIND {wind >= 0 ? '▸' : '◂'} {Math.abs(wind).toFixed(1)}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, 1fr)`, gap: 8 }}>
              {players.map((p, i) => (
                <PlayerCard key={i} player={p} isMe={i === myPlayerIndex} isActive={i === currentPlayerIndex} compact />
              ))}
            </div>

            {/* Turn queue */}
            <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: 'var(--kh)', letterSpacing: '0.2em' }}>
              <span>TURN ORDER ▸</span>
              {players.map((p, i) => (
                <span key={i} style={{
                  color: i === currentPlayerIndex ? (p.color || 'var(--am)') : (p.alive === false ? '#3a1a0a' : 'var(--kh)'),
                  textDecoration: p.alive === false ? 'line-through' : 'none',
                  fontFamily: i === currentPlayerIndex ? "'Black Ops One', cursive" : "'Share Tech Mono', monospace",
                  fontSize: i === currentPlayerIndex ? 11 : 9,
                }}>
                  {i === currentPlayerIndex ? '' : '▸ '}{p.name || `P${i + 1}`}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── BATTLEFIELD LABELS (overlay on Phaser canvas) ── */}
      <div style={{ flex: 1, position: 'relative', pointerEvents: 'none' }}>
        {wager > 0 && (
          <div style={{
            position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
            fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: '#14F195',
            letterSpacing: '0.2em', opacity: 0.8,
          }}>
            POT ◆ {potDisplay} SOL
          </div>
        )}
        <div style={{
          position: 'absolute', bottom: 10, left: 12,
          fontFamily: "'Share Tech Mono', monospace", fontSize: 9, color: 'rgba(184,168,138,0.4)',
          letterSpacing: '0.2em',
        }}>
          GOLD ◈ {gold}G
        </div>
      </div>

      {/* ── CONTROL BAR ── */}
      <div style={{
        background: 'rgba(14,18,9,0.95)',
        borderTop: '1px solid rgba(61,74,47,0.7)',
        padding: '10px 14px',
        flexShrink: 0,
        pointerEvents: 'auto',
        opacity: isPlayerTurn ? 1 : 0.55,
        transition: 'opacity 0.3s',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'stretch' }}>

          {/* ── WEAPONS PANEL ── */}
          <div style={{
            background: 'rgba(10,12,8,0.6)',
            border: '1px solid rgba(61,74,47,0.6)',
            padding: '8px 10px',
          }}>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              color: 'var(--kh)',
              letterSpacing: '0.2em',
              marginBottom: 6,
            }}>
              ARMAMENT · {weapons.length} LOADED
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {weapons.length === 0 ? (
                <WeaponCard weapon={{ id: 0, name: 'Single Shot' }} isSelected currentIndex={0} disabled={disabled} />
              ) : (
                weapons.map((w, i) => (
                  <WeaponCard
                    key={i}
                    weapon={w}
                    isSelected={i === currentWeaponIndex}
                    onClick={() => !disabled && bridge.selectWeapon(i)}
                    disabled={disabled}
                  />
                ))
              )}
            </div>
          </div>

          {/* ── ANGLE / POWER + MOVE PANEL ── */}
          <div style={{
            background: 'rgba(10,12,8,0.6)',
            border: '1px solid rgba(61,74,47,0.6)',
            padding: '8px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            justifyContent: 'space-between',
          }}>
            {/* Power */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 3 }}>
                <span>POWER</span>
                <span style={{ color: '#c8a84a' }}>{Math.round(power)} / 100</span>
              </div>
              <input
                type="range" min={5} max={100} step={1}
                value={power}
                onChange={(e) => !disabled && bridge.setPower(Number(e.target.value))}
                disabled={disabled}
                style={{ width: '100%', accentColor: '#c8a84a', cursor: disabled ? 'default' : 'pointer' }}
              />
            </div>

            {/* Angle */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', letterSpacing: '0.2em', marginBottom: 3 }}>
                <span>ANGLE</span>
                <span style={{ color: '#c8a84a' }}>{Math.round(angle)}°</span>
              </div>
              <input
                type="range" min={0} max={180} step={1}
                value={angle}
                onChange={(e) => !disabled && bridge.setAngle(Number(e.target.value))}
                disabled={disabled}
                style={{ width: '100%', accentColor: '#c8a84a', cursor: disabled ? 'default' : 'pointer' }}
              />
            </div>

            {/* Move buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MoveButtons bridge={bridge} disabled={disabled} moveSteps={moveSteps} />
              <MoveCounter moves={moveSteps} />
              {/* Forfeit (small) */}
              <button
                onClick={onForfeit}
                style={{
                  marginLeft: 'auto',
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 9, letterSpacing: 1,
                  padding: '4px 8px',
                  border: '1px solid rgba(204,34,0,0.3)',
                  background: 'rgba(204,34,0,0.12)',
                  color: '#cc2200',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  opacity: 0.75,
                }}
              >
                FORFEIT
              </button>
            </div>
          </div>

          {/* ── FIRE BUTTON ── */}
          <button
            onClick={disabled ? undefined : () => bridge.fire()}
            style={{
              background: disabled ? '#1c2410' : '#c8a84a',
              color: disabled ? '#3a4a2f' : '#0a0c08',
              border: 'none',
              clipPath: fireClip,
              padding: '0 36px',
              fontFamily: "'Black Ops One', cursive",
              fontSize: 32,
              letterSpacing: '0.1em',
              cursor: disabled ? 'default' : 'pointer',
              minHeight: 100,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              transition: 'background 0.15s',
              userSelect: 'none',
            }}
          >
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>▼ SPACE</span>
            FIRE
            <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 9, letterSpacing: '0.3em', opacity: 0.6 }}>▲</span>
          </button>
        </div>
      </div>

      {/* ELIMINATION OVERLAY (3+ player matches) */}
      {isEliminated && players.length > 2 && (
        <EliminationOverlay placement={eliminatedPlacement} onLeave={onLeaveMatch} />
      )}

      {/* Keyframe */}
      <style>{`
        @keyframes fl { 0%, 97%, 100% { opacity: 1; } 98% { opacity: 0.6; } 99% { opacity: 1; } }
      `}</style>
    </div>
  );
}


/* ════════════════════════════════════════════
   ELIMINATION OVERLAY
════════════════════════════════════════════ */
function EliminationOverlay({ placement, onLeave }) {
  const ordinal = (n) =>
    n === 1 ? '1ST' : n === 2 ? '2ND' : n === 3 ? '3RD' : (n || '?') + 'TH';

  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(10,12,8,0.9)',
      border: '1px solid rgba(61,74,47,0.8)',
      padding: '22px 32px',
      textAlign: 'center',
      pointerEvents: 'auto',
      zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
    }}>
      <div style={{ fontFamily: "'Black Ops One', cursive", fontSize: 20, color: '#b8a88a', letterSpacing: 3 }}>
        YOU PLACED {ordinal(placement)}
      </div>
      <div style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 11, color: 'var(--kh)', letterSpacing: 2, opacity: 0.6 }}>
        SPECTATING...
      </div>
      <button
        onClick={onLeave}
        style={{
          fontFamily: "'Black Ops One', cursive", fontSize: 13, letterSpacing: 2,
          padding: '8px 20px', border: '1px solid rgba(61,74,47,0.8)',
          background: 'rgba(184,168,138,0.12)', color: '#e8dcc8', cursor: 'pointer',
        }}
      >
        LEAVE MATCH
      </button>
    </div>
  );
}

export default React.memo(BattleHUD);
