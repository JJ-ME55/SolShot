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


const moveBtn = (disabled) => ({
  fontFamily: "'Black Ops One', cursive",
  fontSize: 14,
  letterSpacing: 2,
  padding: '8px 18px',
  borderRadius: 3,
  border: 'none',
  cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--kh)' : 'var(--bn)',
  background: disabled ? 'var(--od)' : 'rgba(184, 168, 138, 0.15)',
  opacity: disabled ? 0.4 : 1,
  pointerEvents: disabled ? 'none' : 'auto',
  userSelect: 'none',
});

function BattleHUD({ bridge, gameState, wager, onLeaveMatch }) {
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

  return (
    <div style={s.overlay}>
      {/* ═══ TOP ROW ═══ */}
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

      {/* ═══ TURN INDICATOR ═══ */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
        <div style={{
          ...s.turnLabel,
          ...(isPlayerTurn ? s.turnLabelActive : s.turnLabelWaiting),
        }}>
          {isPlayerTurn ? 'YOUR TURN' : (
            players.length > 2
              ? (players[currentPlayerIndex]?.name || 'OPPONENT') + "'S TURN"
              : "OPPONENT'S TURN"
          )}
        </div>
      </div>

      {/* ═══ BOTTOM ROW ═══ */}
      <div style={s.bottomRow}>
        {/* Left: Angle + Power */}
        <div style={s.controlsLeft}>
          <AngleControl
            angle={players[myPlayerIndex]?.angle || 45}
            onChange={(v) => bridge.setAngle(v)}
            disabled={disabled}
          />
          <PowerControl
            power={players[myPlayerIndex]?.power || 60}
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

        {/* Right: Move Controls + Counter */}
        <div style={s.controlsRight}>
          <div style={{ display: 'flex', gap: 6 }}>
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

      {/* ═══ ELIMINATION OVERLAY ═══ */}
      {isEliminated && (
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
