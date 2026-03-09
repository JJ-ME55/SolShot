import React from 'react';
import PlayerHPBar from './PlayerHPBar';
import WindDisplay from './WindDisplay';
import GoldDisplay from './GoldDisplay';
import PotDisplay from './PotDisplay';
import RoundCounter from './RoundCounter';
import MoveCounter from './MoveCounter';
import AngleControl from './AngleControl';
import PowerControl from './PowerControl';
import WeaponSelector from './WeaponSelector';
import FireButton from './FireButton';
import useIsMobile from '../../hooks/useIsMobile';

const s = {
  overlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '6px 10px',
    gap: 8,
  },
  topCenter: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexShrink: 0,
  },
  bottomRow: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '8px 12px',
    gap: 10,
    flexWrap: 'wrap',
  },
  controlsLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    pointerEvents: 'auto',
  },
  controlsCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'auto',
  },
  controlsRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    pointerEvents: 'auto',
  },
  turnLabel: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 16,
    letterSpacing: 3,
    textAlign: 'center',
    padding: '6px 16px',
    borderRadius: 3,
    pointerEvents: 'none',
  },
  turnLabelActive: {
    color: 'var(--sg)',
    background: 'rgba(20, 241, 149, 0.08)',
    border: '1px solid rgba(20, 241, 149, 0.2)',
  },
  turnLabelWaiting: {
    color: 'var(--rd)',
    background: 'rgba(204, 34, 0, 0.08)',
    border: '1px solid rgba(204, 34, 0, 0.2)',
    animation: 'fl 2s ease-in-out infinite',
  },
};


const moveBtn = (disabled, compact) => ({
  fontFamily: "'Black Ops One', cursive",
  fontSize: compact ? 11 : 14,
  letterSpacing: 2,
  padding: compact ? '6px 12px' : '8px 18px',
  borderRadius: 3,
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--kh)' : 'var(--bn)',
  background: disabled ? 'var(--od)' : 'rgba(184, 168, 138, 0.15)',
  opacity: disabled ? 0.4 : 1,
  pointerEvents: disabled ? 'none' : 'auto',
  userSelect: 'none',
});

const forfeitBtn = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 10,
  letterSpacing: 1,
  padding: '4px 8px',
  borderRadius: 3,
  border: '1px solid rgba(204, 34, 0, 0.3)',
  background: 'rgba(204, 34, 0, 0.15)',
  color: 'var(--rd)',
  cursor: 'pointer',
  pointerEvents: 'auto',
  userSelect: 'none',
  opacity: 0.7,
};

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
  const compact = isMobile;

  return (
    <div style={s.overlay}>
      {/* TOP ROW */}
      <div style={s.topRow}>
        {/* N-player HP bar strip */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {players.length > 0 ? players.map((p, i) => (
            <PlayerHPBar
              key={p.socketId || i}
              player={p}
              isActive={i === currentPlayerIndex}
              isMe={i === myPlayerIndex}
            />
          )) : null}
        </div>

        {/* Center stats */}
        <div style={s.topCenter}>
          <WindDisplay wind={wind} />
          <GoldDisplay gold={gold} />
          {wager > 0 && <PotDisplay pot={potDisplay} />}
          <RoundCounter round={round} total={totalRounds} />
        </div>
      </div>

      {/* TURN INDICATOR */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 2, gap: 8 }}>
        <div style={{
          ...s.turnLabel,
          fontSize: compact ? 12 : 16,
          padding: compact ? '4px 10px' : '6px 16px',
          ...(isPlayerTurn ? s.turnLabelActive : s.turnLabelWaiting),
        }}>
          {isPlayerTurn ? 'YOUR TURN' : (
            players.length > 2
              ? (players[currentPlayerIndex]?.name || 'OPPONENT') + "'S TURN"
              : "OPPONENT'S TURN"
          )}
        </div>
        {turnTimer != null && (
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: compact ? 16 : 20,
            color: turnTimer <= 10 ? 'var(--rd)' : 'var(--kh)',
            letterSpacing: 1,
            lineHeight: 1,
            opacity: turnTimer <= 10 ? 1 : 0.6,
            animation: turnTimer <= 10 ? 'fl 1s ease-in-out infinite' : 'none',
            pointerEvents: 'none',
          }}>
            {turnTimer}s
          </div>
        )}
      </div>

      {/* BOTTOM ROW */}
      <div style={{ ...s.bottomRow, padding: compact ? '4px 8px' : '8px 12px', gap: compact ? 6 : 10 }}>
        {/* Left: Angle + Power */}
        <div style={s.controlsLeft}>
          <AngleControl
            angle={players[myPlayerIndex]?.angle || 45}
            onChange={(v) => bridge.setAngle(v)}
            disabled={disabled}
            compact={compact}
          />
          <PowerControl
            power={players[myPlayerIndex]?.power || 60}
            onChange={(v) => bridge.setPower(v)}
            disabled={disabled}
            compact={compact}
          />
        </div>

        {/* Center: Weapon + Fire */}
        <div style={s.controlsCenter}>
          <WeaponSelector
            weapons={weapons}
            currentIndex={currentWeaponIndex}
            onChange={(idx) => bridge.selectWeapon(idx)}
            disabled={disabled}
            compact={compact}
          />
          <FireButton
            onClick={() => bridge.fire()}
            disabled={disabled}
            compact={compact}
          />
        </div>

        {/* Right: Move Controls + Counter + Forfeit (mobile) */}
        <div style={s.controlsRight}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              style={moveBtn(disabled || moveSteps <= 0, compact)}
              onClick={() => bridge.moveLeft()}
              disabled={disabled || moveSteps <= 0}
            >
              {'< A'}
            </button>
            <button
              style={moveBtn(disabled || moveSteps <= 0, compact)}
              onClick={() => bridge.moveRight()}
              disabled={disabled || moveSteps <= 0}
            >
              {'D >'}
            </button>
          </div>
          <MoveCounter moves={moveSteps} />
          {/* Mobile forfeit button — ESC doesn't exist on phones */}
          {isMobile && (
            <button style={forfeitBtn} onClick={onForfeit}>
              FORFEIT
            </button>
          )}
        </div>
      </div>

      {/* ELIMINATION OVERLAY (3+ players only; 2-player ends immediately) */}
      {isEliminated && players.length > 2 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(10, 12, 8, 0.85)',
          border: '1px solid var(--ol)',
          borderRadius: 6,
          padding: '20px 30px',
          textAlign: 'center',
          pointerEvents: 'auto',
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
        }}>
          <div style={{
            fontFamily: "'Black Ops One', cursive",
            fontSize: 22,
            color: 'var(--kh)',
            letterSpacing: 3,
          }}>
            YOU PLACED {eliminatedPlacement === 1 ? '1ST' : eliminatedPlacement === 2 ? '2ND' : eliminatedPlacement === 3 ? '3RD' : eliminatedPlacement + 'TH'}
          </div>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 13,
            color: 'var(--kh)',
            letterSpacing: 2,
            opacity: 0.6,
          }}>
            SPECTATING...
          </div>
          <button
            style={{
              fontFamily: "'Black Ops One', cursive",
              fontSize: 14,
              letterSpacing: 2,
              padding: '8px 20px',
              borderRadius: 3,
              border: '1px solid var(--ol)',
              background: 'rgba(184, 168, 138, 0.15)',
              color: 'var(--bn)',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
            onClick={onLeaveMatch}
          >
            LEAVE MATCH
          </button>
        </div>
      )}
    </div>
  );
}

export default React.memo(BattleHUD);
