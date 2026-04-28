import React, { useState, useEffect, useCallback } from 'react';
import useSocket from '../../hooks/useSocket';
import Modal from '../Modal';
import TrophyShareOverlay from '../TrophyShareOverlay';
import TelegramShare from '../TelegramShare';
import { useTelegram } from '../../telegram/TelegramContext';

const ordinal = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

/*
  Shared After Action Report layout for Win and Lose screens.
  `isWin` flips the stamp, banner color, and copy.
*/
export default function AARScreen({ navigate, screenData, isWin }) {
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const { isTelegram } = useTelegram();

  const isAIMatch = screenData?.isAIMatch || false;
  const wager = screenData?.wager || 0;
  const scores = screenData?.scores || {};
  const roundWins = screenData?.roundWins || {};
  const myId = window.socket?.id;
  const myGold = screenData?.goldBalance && myId ? screenData.goldBalance[myId] : 0;
  const solDelta = isWin ? (wager > 0 ? wager * 2 * 0.95 : 0) : wager;
  const opponentId = myId ? Object.keys(roundWins).find(id => id !== myId) : null;
  const survivorOrder = screenData?.survivorOrder || [];
  const allPlayers = screenData?.players || [];
  const playerMap = {};
  allPlayers.forEach(p => { if (p?.socketId) playerMap[p.socketId] = p; });

  const myRoundWins = myId && roundWins[myId] ? roundWins[myId] : 0;
  const oppRoundWins = opponentId && roundWins[opponentId] ? roundWins[opponentId] : 0;
  const myDmg = myId && scores[myId] ? scores[myId].damageDealt || 0 : 0;
  const oppDmg = opponentId && scores[opponentId] ? scores[opponentId].damageDealt || 0 : 0;
  const myKills = myId && scores[myId] ? scores[myId].kills || 0 : 0;

  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    sock.emit('getStats');
    const handler = (data) => setPlayerStats(data);
    sock.on('statsData', handler);
    return () => sock.off('statsData', handler);
  }, []);

  useSocket('opponentLeft', () => setOpponentLeft(true));
  useSocket('playAgain', () => navigate('shop'));

  const handleLobby = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('lobby');
  }, [navigate]);
  const handleMenu = useCallback(() => {
    if (window.socket) window.socket.emit('leaveRoom');
    navigate('menu');
  }, [navigate]);
  const handlePlayAgain = useCallback(() => {
    if (isAIMatch) navigate('ai-practice');
    else handleLobby();
  }, [isAIMatch, handleLobby, navigate]);

  const oppName = opponentId && playerMap[opponentId] ? playerMap[opponentId].name : 'UNKNOWN';
  const myName = myId && playerMap[myId] ? playerMap[myId].name : (localStorage.getItem('solshot_handle') || 'YOU');

  const bannerColor = isWin ? 'var(--accent)' : 'var(--red)';
  const bannerBg = isWin ? 'var(--accent)' : '#a83a1a';
  const stampText = isWin ? '★ CONFIRMED KILL ★' : '✕ MATCH LOST ✕';
  const verdict = isWin ? 'VICTOR' : 'DEFEATED';

  const [copyOk, setCopyOk] = useState(false);
  const copyResult = () => {
    const sig = (playerStats?.signatureWeapon || 'CLASSIFIED').toUpperCase();
    const result = isWin ? 'VICTORY' : 'DEFEAT';
    const score = `${myRoundWins}-${oppRoundWins}`;
    const text = isWin
      ? `${result} · ${myName.toUpperCase()} ${score} ${oppName.toUpperCase()} · ${myDmg} DMG · ${sig} · solshot.gg`
      : `${result} · ${myName.toUpperCase()} ${score} ${oppName.toUpperCase()} · ${myDmg} DMG · ${sig} · solshot.gg`;
    navigator.clipboard.writeText(text)
      .then(() => { setCopyOk(true); setTimeout(() => setCopyOk(false), 1800); })
      .catch(() => {});
  };

  const totalRounds = screenData?.totalRounds || (myRoundWins + oppRoundWins);

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 100px', position: 'relative', zIndex: 3 }}>
        {/* Stamp header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
          fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em',
        }}>
          <span>DOC 14-C · DECLASSIFIED</span>
          <span style={{
            color: bannerColor, border: `2px solid ${bannerColor}`,
            padding: '3px 10px', transform: 'rotate(-2deg)',
            fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.15em',
          }}>{stampText}</span>
          <span>M-#{(screenData?.matchId || 'UNKNOWN').toString().slice(0, 5).toUpperCase()}</span>
        </div>

        <div style={{
          fontFamily: 'var(--f-display)', fontSize: 40, color: 'var(--bone)',
          letterSpacing: '0.06em', borderLeft: '3px solid var(--accent)', paddingLeft: 14,
        }}>AFTER ACTION REPORT</div>
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
          letterSpacing: '0.22em', marginTop: 8, marginBottom: 24, paddingLeft: 17,
        }}>
          MATCH · BO{totalRounds || '?'} {wager > 0 ? ` · WAGER ${wager} SOL` : ' · PRACTICE'}
        </div>

        {/* AI Practice banner */}
        {isAIMatch && (
          <div style={{
            padding: '6px 14px', marginBottom: 14,
            background: 'rgba(200,120,26,0.08)',
            border: '1px solid rgba(200,120,26,0.3)',
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
            letterSpacing: '0.22em', textAlign: 'center',
          }}>
            PRACTICE VS AI — STATS NOT RECORDED
          </div>
        )}

        {/* Victor strip */}
        <div style={{
          background: bannerBg,
          clipPath: 'var(--clip-16)',
          padding: '22px 24px',
          marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 22,
        }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 64, color: '#0e1209', lineHeight: 0.8 }}>
            {isWin ? 'W' : 'L'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#0e1209', opacity: 0.7, letterSpacing: '0.22em' }}>
              {verdict}
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, color: '#0e1209', letterSpacing: '0.04em', lineHeight: 1 }}>
              {(myName || 'YOU').toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: '#0e1209', opacity: 0.7, letterSpacing: '0.22em' }}>
              FINAL SCORE
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 36, color: '#0e1209', lineHeight: 1 }}>
              {myRoundWins} – {oppRoundWins}
            </div>
          </div>
        </div>

        {/* Reward / loss */}
        <div style={{ display: 'grid', gridTemplateColumns: wager > 0 ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 18 }}>
          {wager > 0 && (
            <div style={{
              padding: '14px 20px',
              background: isWin ? 'rgba(127,208,96,0.08)' : 'rgba(168,58,26,0.08)',
              border: `1px solid ${isWin ? 'rgba(127,208,96,0.3)' : 'rgba(168,58,26,0.3)'}`,
              clipPath: 'var(--clip-6)',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--f-display)', fontSize: 32,
                color: isWin ? '#7fd060' : 'var(--red)', lineHeight: 1, letterSpacing: '0.06em',
              }}>{isWin ? '+' : '−'}{solDelta.toFixed(3)}</div>
              <div style={{
                fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
                letterSpacing: '0.22em', marginTop: 6,
              }}>SOL {isWin ? 'EARNED' : 'WAGERED'}</div>
            </div>
          )}
          <div style={{
            padding: '14px 20px',
            background: 'rgba(200,120,26,0.08)',
            border: '1px solid rgba(200,120,26,0.3)',
            clipPath: 'var(--clip-6)',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 32,
              color: 'var(--accent)', lineHeight: 1, letterSpacing: '0.06em',
            }}>◆ {myGold}</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
              letterSpacing: '0.22em', marginTop: 6,
            }}>GOLD EARNED</div>
          </div>
        </div>

        {/* Combatant comparison */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          clipPath: 'var(--clip-16)', padding: 24, marginBottom: 18,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20,
            marginBottom: 20, paddingBottom: 16, borderBottom: '1px dashed var(--muted)',
          }}>
            {[
              { label: 'YOU', name: myName, color: isWin ? 'var(--accent)' : 'var(--olive)', dmg: myDmg, rounds: myRoundWins },
              { label: 'OPPONENT', name: oppName, color: isWin ? 'var(--olive)' : 'var(--accent)', dmg: oppDmg, rounds: oppRoundWins },
            ].map((p, i) => (
              <div key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.22em' }}>
                  COMBATANT · {p.label}
                </div>
                <div style={{
                  fontFamily: 'var(--f-display)', fontSize: 24, color: p.color,
                  letterSpacing: '0.04em', marginTop: 4, textTransform: 'uppercase',
                }}>{p.name}</div>
              </div>
            ))}
          </div>

          <StatBar label="DMG DEALT" a={myDmg} b={oppDmg} max={Math.max(900, myDmg, oppDmg)} />
          <StatBar label="ROUNDS" a={myRoundWins} b={oppRoundWins} max={totalRounds || 3} />
          <StatBar label="KILLS" a={myKills} b={0} max={Math.max(5, myKills)} />
        </div>

        {/* Final standings for 3+ players */}
        {survivorOrder.length > 2 && (
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            clipPath: 'var(--clip-10)', padding: '14px 20px', marginBottom: 18,
          }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.22em', marginBottom: 10 }}>
              FINAL STANDINGS
            </div>
            {survivorOrder.map((id, rank) => {
              const p = playerMap[id];
              const isMe = id === myId;
              return (
                <div key={id} style={{
                  display: 'grid', gridTemplateColumns: '60px 14px 1fr', gap: 12, alignItems: 'center',
                  padding: '8px 0', borderBottom: rank < survivorOrder.length - 1 ? '1px dashed var(--muted)' : 'none',
                }}>
                  <span style={{
                    fontFamily: 'var(--f-display)', fontSize: 16,
                    color: rank === 0 ? 'var(--accent)' : 'var(--muted)',
                    letterSpacing: '0.12em',
                  }}>{ordinal(rank + 1)}</span>
                  <div style={{ width: 12, height: 12, background: p?.color || '#FFF', clipPath: 'var(--clip-6)' }} />
                  <span style={{
                    fontFamily: 'var(--f-mono)', fontSize: 12,
                    color: isMe ? (isWin ? '#7fd060' : 'var(--red)') : 'var(--bone)',
                    letterSpacing: '0.1em',
                  }}>
                    {isMe ? 'YOU' : (p?.name || 'UNKNOWN')}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 12 }}>
          <button onClick={copyResult} style={aarBtnSecondary}>
            {copyOk ? '✓ COPIED' : 'COPY RESULT'}
          </button>
          <button onClick={() => setShowCard(true)} style={aarBtnAccent}>EXPORT CARD</button>
          <button onClick={() => navigate('barracks')} style={aarBtnSecondary}>BARRACKS</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
          <button onClick={handlePlayAgain} style={aarBtnPrimary}>PLAY AGAIN</button>
          <button onClick={handleMenu} style={aarBtnSecondary}>EXIT</button>
        </div>
        {isTelegram && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <TelegramShare isWinner={isWin} playerScore={myRoundWins} opponentScore={oppRoundWins} />
          </div>
        )}

        <div style={{
          textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10,
          color: 'var(--muted)', letterSpacing: '0.3em',
          paddingTop: 16, borderTop: '1px dashed var(--muted)',
        }}>
          ◣ SOLSHOT.GG · FILED {new Date().toISOString().slice(11, 16)}Z ◣
        </div>
      </div>

      {opponentLeft && (
        <Modal title="OPPONENT LEFT" message="Your opponent has disconnected."
          buttons={[{ label: 'LOBBY', variant: 'secondary', onClick: handleLobby }]}
          onClose={handleLobby} />
      )}

      {showCard && (
        <TrophyShareOverlay
          isWin={isWin}
          winner={isWin
            ? {
                callsign: (myName || 'OPERATIVE').toUpperCase(),
                damage: myDmg,
                accuracy: 0,
                shots: 0,
                best: (playerStats?.signatureWeapon || 'CLASSIFIED').toUpperCase(),
              }
            : {
                callsign: (oppName || 'UNKNOWN').toUpperCase(),
                damage: oppDmg,
                accuracy: 0,
                shots: 0,
                best: 'CLASSIFIED',
              }
          }
          loser={isWin
            ? { callsign: (oppName || 'UNKNOWN').toUpperCase() }
            : { callsign: (myName || 'OPERATIVE').toUpperCase() }
          }
          score={`${myRoundWins} – ${oppRoundWins}`}
          matchId={`M-#${(screenData?.matchId || 'UNKNOWN').toString().slice(0, 5).toUpperCase()}`}
          terrain={(screenData?.terrain || 'CLASSIFIED').toUpperCase()}
          duration={screenData?.duration || '00:00'}
          onClose={() => setShowCard(false)}
        />
      )}
    </div>
  );
}

function StatBar({ label, a, b, max }) {
  const pctA = max > 0 ? Math.min(100, (a / max) * 100) : 0;
  const pctB = max > 0 ? Math.min(100, (b / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.18em',
        marginBottom: 6,
      }}>
        <span style={{ color: 'var(--accent)' }}>{a}</span>
        <span style={{ color: 'var(--olive)' }}>{label}</span>
        <span style={{ color: 'var(--olive)' }}>{b}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, height: 10 }}>
        <div style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)', position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: pctA + '%', background: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
          <div style={{ width: pctB + '%', height: '100%', background: 'var(--olive)' }} />
        </div>
      </div>
    </div>
  );
}

const aarBtnPrimary = {
  padding: '14px 12px', background: 'var(--accent)', color: '#0e1209',
  border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
  fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
  cursor: 'pointer',
  boxShadow: '0 0 14px rgba(218,138,40,0.2)',
};
const aarBtnAccent = {
  padding: '12px', background: 'rgba(218,138,40,0.10)', color: 'var(--accent)',
  border: '1px solid var(--accent)', clipPath: 'var(--clip-6)',
  fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.18em',
  cursor: 'pointer',
};
const aarBtnSecondary = {
  padding: '12px', background: 'transparent', color: 'var(--bone)',
  border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
  fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.18em',
  cursor: 'pointer',
};
