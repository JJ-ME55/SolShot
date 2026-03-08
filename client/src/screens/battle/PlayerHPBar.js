import React, { useState, useEffect, useRef } from 'react';

const MAX_HP = 250;

const ordinal = (n) =>
  n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

function PlayerHPBar({ player, isActive, isMe }) {
  const rawHp = Math.min(MAX_HP, player?.hp ?? MAX_HP);
  const hp = Math.max(0, Math.min(100, Math.round((rawHp / MAX_HP) * 100)));
  const isEliminated = player?.alive === false;

  const prevHpRef = useRef(rawHp);
  const [damagePct, setDamagePct] = useState(hp);
  const [dmgPopup, setDmgPopup] = useState(null);

  // Trailing damage bar + damage popup (same pattern as ScoreBoard)
  useEffect(() => {
    const prevHp = prevHpRef.current;
    if (rawHp < prevHp) {
      const dmg = prevHp - rawHp;
      setDmgPopup(dmg);
      const timer = setTimeout(() => {
        setDamagePct(hp);
      }, 400);
      const popupTimer = setTimeout(() => setDmgPopup(null), 1000);
      prevHpRef.current = rawHp;
      return () => {
        clearTimeout(timer);
        clearTimeout(popupTimer);
      };
    } else {
      setDamagePct(hp);
      prevHpRef.current = rawHp;
    }
  }, [rawHp, hp]);

  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      pointerEvents: 'none',
    }}>
      {/* Name row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        overflow: 'hidden',
      }}>
        {/* Turn arrow */}
        {isActive ? (
          <span style={{
            color: 'var(--am)',
            fontSize: 9,
            lineHeight: 1,
            flexShrink: 0,
          }}>&#9654;</span>
        ) : (
          <span style={{ width: 9, flexShrink: 0 }} />
        )}
        {/* Color dot */}
        <div style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: player?.color || '#FFF',
          flexShrink: 0,
        }} />
        {/* Name */}
        <span style={{
          fontFamily: "'Black Ops One', cursive",
          fontSize: 11,
          color: isMe ? 'var(--am)' : 'var(--bn)',
          letterSpacing: 0.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {player?.name || (isMe ? 'YOU' : 'UNKNOWN')}
        </span>
      </div>

      {/* HP bar row */}
      <div style={{ position: 'relative' }}>
        {isEliminated ? (
          /* Eliminated: grey bar with OUT + placement */
          <div style={{
            height: 12,
            borderRadius: 2,
            background: 'rgba(100,100,100,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 9,
              color: 'var(--kh)',
              letterSpacing: 1,
              opacity: 0.7,
            }}>
              {player?.placement != null
                ? 'OUT ' + ordinal(player.placement)
                : 'OUT'}
            </span>
          </div>
        ) : (
          /* Alive: HP bar with damage trail */
          <div style={{
            height: 12,
            borderRadius: 2,
            background: 'rgba(184,168,138,0.12)',
            border: '1px solid rgba(184,168,138,0.2)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Trailing damage bar (red ghost) */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: damagePct + '%',
              height: '100%',
              borderRadius: 2,
              background: 'rgba(255,80,60,0.4)',
              transition: 'width 1.2s ease-out 0.3s',
            }} />
            {/* Current HP fill */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: hp + '%',
              height: '100%',
              borderRadius: 2,
              background: hp > 50
                ? 'linear-gradient(180deg, #4CAF50, #2E7D32)'
                : hp > 25
                  ? 'linear-gradient(180deg, #FF9800, #E65100)'
                  : 'linear-gradient(180deg, #f44336, #B71C1C)',
              transition: 'width 0.4s ease-out',
              boxShadow: hp <= 25 ? '0 0 8px rgba(244,67,54,0.5)' : 'none',
            }} />
            {/* HP number overlay */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              color: '#fff',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              letterSpacing: 0.5,
            }}>
              {rawHp} / {MAX_HP}
            </div>
          </div>
        )}

        {/* Damage popup */}
        {dmgPopup && (
          <div style={{
            position: 'absolute',
            top: -2,
            right: -4,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 13,
            color: '#ff4444',
            textShadow: '0 0 6px rgba(255,0,0,0.6)',
            letterSpacing: 1,
            pointerEvents: 'none',
            animation: 'dmgFlash 1s ease-out forwards',
            zIndex: 10,
          }}>
            -{dmgPopup}
          </div>
        )}
      </div>

      {/* Inject keyframe for damage flash */}
      <style>{`
        @keyframes dmgFlash {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-16px); }
        }
      `}</style>
    </div>
  );
}

export default React.memo(PlayerHPBar);
