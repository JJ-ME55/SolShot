import React from 'react';
import ScoreBoard from './ScoreBoard';
import WindDisplay from './WindDisplay';
import GoldDisplay from './GoldDisplay';
import PotDisplay from './PotDisplay';
import RoundCounter from './RoundCounter';
import MoveCounter from './MoveCounter';
import AngleControl from './AngleControl';
import PowerControl from './PowerControl';
import WeaponSelector from './WeaponSelector';
import FireButton from './FireButton';

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
  },
  bottomRow: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: '8px 12px',
    gap: 10,
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
    fontSize: 10,
    letterSpacing: 3,
    textAlign: 'center',
    padding: '4px 12px',
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


const moveBtn = (disabled) => ({
  fontFamily: "'Black Ops One', cursive",
  fontSize: 10,
  letterSpacing: 2,
  padding: '6px 14px',
  borderRadius: 3,
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--kh)' : 'var(--bn)',
  background: disabled ? 'var(--od)' : 'rgba(184, 168, 138, 0.15)',
  opacity: disabled ? 0.4 : 1,
  pointerEvents: disabled ? 'none' : 'auto',
  userSelect: 'none',
});

function BattleHUD({ bridge, gameState, wager }) {
  const {
    tank1 = {},
    tank2 = {},
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

  return (
    <div style={s.overlay}>
      {/* ═══ TOP ROW ═══ */}
      <div style={s.topRow}>
        <ScoreBoard tank={tank1} side="left" />

        <div style={s.topCenter}>
          <WindDisplay wind={wind} />
          <GoldDisplay gold={gold} />
          {wager > 0 && <PotDisplay pot={potDisplay} />}
          <RoundCounter round={round} total={totalRounds} />
        </div>

        <ScoreBoard tank={tank2} side="right" />
      </div>

      {/* ═══ TURN INDICATOR ═══ */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
        <div style={{
          ...s.turnLabel,
          ...(isPlayerTurn ? s.turnLabelActive : s.turnLabelWaiting),
        }}>
          {isPlayerTurn ? 'YOUR TURN' : "OPPONENT'S TURN"}
        </div>
      </div>

      {/* ═══ BOTTOM ROW ═══ */}
      <div style={s.bottomRow}>
        {/* Left: Angle + Power */}
        <div style={s.controlsLeft}>
          <AngleControl
            angle={isPlayerTurn ? (tank1.angle || 45) : (tank2.angle || 45)}
            onChange={(v) => bridge.setAngle(v)}
            disabled={disabled}
          />
          <PowerControl
            power={isPlayerTurn ? (tank1.power || 60) : (tank2.power || 60)}
            onChange={(v) => bridge.setPower(v)}
            disabled={disabled}
          />
        </div>

        {/* Center: Weapon + Fire */}
        <div style={s.controlsCenter}>
          <WeaponSelector
            weapons={weapons}
            currentIndex={currentWeaponIndex}
            onChange={(idx) => bridge.selectWeapon(idx)}
            disabled={disabled}
          />
          <FireButton
            onClick={() => bridge.fire()}
            disabled={disabled}
          />
        </div>

        {/* Right: Move Controls */}
        <div style={s.controlsRight}>
          <div style={{
            display: 'flex',
            gap: 6,
          }}>
            <button
              style={moveBtn(disabled || moveSteps <= 0)}
              onClick={() => bridge.moveLeft()}
              disabled={disabled || moveSteps <= 0}
            >
              {'< A'}
            </button>
            <button
              style={moveBtn(disabled || moveSteps <= 0)}
              onClick={() => bridge.moveRight()}
              disabled={disabled || moveSteps <= 0}
            >
              {'D >'}
            </button>
          </div>
          <MoveCounter moves={moveSteps} />
        </div>
      </div>
    </div>
  );
}

export default React.memo(BattleHUD);
