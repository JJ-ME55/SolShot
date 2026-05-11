import React, { useState, useEffect, useCallback } from 'react';
import useSocket from '../../hooks/useSocket';
import useIsMobile from '../../hooks/useIsMobile';
import Modal from '../Modal';
import TrophyShareOverlay from '../TrophyShareOverlay';
import TelegramShare from '../TelegramShare';
import { useTelegram } from '../../telegram/TelegramContext';
import { getWeaponById } from '../../data/weapons';
import { haptic } from '../../telegram/haptic';
import ScanBtn from './ScanBtn';

const ordinal = (n) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : n + 'th';

/**
 * Find the MVP weapon for a player from their per-match weaponDamage map.
 * Returns the weapon name (uppercase) or 'CLASSIFIED' if no data.
 */
function computeMvpWeapon(weaponDamage) {
  if (!weaponDamage || typeof weaponDamage !== 'object') return 'CLASSIFIED';
  let bestId = null;
  let bestDmg = 0;
  for (const [id, dmg] of Object.entries(weaponDamage)) {
    if (dmg > bestDmg) { bestDmg = dmg; bestId = id; }
  }
  if (!bestId) return 'CLASSIFIED';
  const wep = getWeaponById(Number(bestId));
  return (wep?.name || 'CLASSIFIED').toUpperCase();
}

/** Sum a weapon-keyed map of numbers. */
function sumWeaponMap(map) {
  if (!map || typeof map !== 'object') return 0;
  return Object.values(map).reduce((a, b) => a + (Number(b) || 0), 0);
}

/*
  Shared After Action Report layout for Win and Lose screens.
  `isWin` flips the stamp, banner color, and copy.
*/
export default function AARScreen({ navigate, screenData, isWin }) {
  const isMobile = useIsMobile();
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [playerStats, setPlayerStats] = useState(null);
  const { isTelegram } = useTelegram();

  // Haptic notification on AAR mount — fires once per screen entry.
  // Win → success buzz, Loss → error buzz. No-op outside Telegram.
  useEffect(() => {
    if (isWin) haptic.win();
    else haptic.lose();
    // intentional: empty deps = fire once per AAR mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Settlement details from server (matchEnd payload). For wagered
  // wins we include the on-chain TX hash + Solscan link in the share
  // text — concrete proof the SOL actually moved on-chain. Devnet
  // matches use ?cluster=devnet on Solscan; mainnet drops the param.
  const settlement = screenData?.settlement || null;
  const settlementTx = settlement?.txSignature || null;
  const winnerPayout = settlement?.winnerPayout || 0;
  const network = (process.env.REACT_APP_SOLANA_NETWORK || 'devnet');
  const solscanBase = 'https://solscan.io/tx/';
  const solscanQs = network === 'mainnet-beta' ? '' : '?cluster=devnet';
  const settlementUrl = settlementTx ? `${solscanBase}${settlementTx}${solscanQs}` : null;

  // Build the share text once — used by both Copy + Share buttons.
  const buildShareText = () => {
    const sig = (playerStats?.signatureWeapon || 'CLASSIFIED').toUpperCase();
    const result = isWin ? 'VICTORY' : 'DEFEAT';
    const score = `${myRoundWins}-${oppRoundWins}`;
    const lines = [];
    if (isWin && wager > 0 && winnerPayout > 0) {
      // Wagered win — lead with the SOL won on-chain
      lines.push(`Just won ${winnerPayout.toFixed(3)} SOL on @SolShotGG`);
      lines.push(`${myName.toUpperCase()} ${score} ${oppName.toUpperCase()} · ${myDmg} DMG · MVP: ${sig}`);
      if (settlementUrl) lines.push(settlementUrl);
      lines.push('solshot.gg · artillery duels on Solana');
    } else if (isWin) {
      lines.push(`${result} · ${myName.toUpperCase()} ${score} ${oppName.toUpperCase()} · ${myDmg} DMG · ${sig}`);
      lines.push('solshot.gg');
    } else {
      lines.push(`${result} · ${myName.toUpperCase()} ${score} ${oppName.toUpperCase()} · ${myDmg} DMG · ${sig}`);
      lines.push('solshot.gg');
    }
    return lines.join('\n');
  };

  const [copyOk, setCopyOk] = useState(false);
  const [shareOk, setShareOk] = useState(false);

  const copyResult = () => {
    const text = buildShareText();
    navigator.clipboard.writeText(text)
      .then(() => { setCopyOk(true); setTimeout(() => setCopyOk(false), 1800); })
      .catch(() => {});
  };

  // Web Share API — falls back to copy if not available (desktop
  // browsers, older mobile). On iOS/Android this opens the native
  // share sheet (TG, Twitter, iMessage, etc.). Native share is far
  // more useful than copy-paste for someone holding their phone.
  const shareResult = async () => {
    const text = buildShareText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: isWin ? 'SolShot · VICTORY' : 'SolShot · Match Result',
          text,
          // Don't pass `url` separately — embedding the Solscan link in
          // text reads better in TG/Twitter previews than a bare URL.
        });
        setShareOk(true);
        setTimeout(() => setShareOk(false), 1800);
        return;
      } catch (err) {
        // User dismissed share sheet, or API failed — fall through to copy
        if (err?.name !== 'AbortError') {
          console.warn('[AAR] share failed:', err?.message || err);
        }
      }
    }
    // Fallback: copy to clipboard
    copyResult();
  };

  const totalRounds = screenData?.totalRounds || (myRoundWins + oppRoundWins);

  // Compute accuracy at the top level so the mobile stat bars can use it
  // (the desktop layout doesn't show accuracy as a bar — only in the
  // Trophy share card — but the mobile design has it as one of 4 stats).
  const myShots = myId && scores[myId] ? sumWeaponMap(scores[myId].weaponShots) : 0;
  const myHits = myId && scores[myId] ? sumWeaponMap(scores[myId].weaponHits) : 0;
  const myAcc = myShots > 0 ? Math.round((myHits / myShots) * 100) : 0;
  const oppShots = opponentId && scores[opponentId] ? sumWeaponMap(scores[opponentId].weaponShots) : 0;
  const oppHits = opponentId && scores[opponentId] ? sumWeaponMap(scores[opponentId].weaponHits) : 0;
  const oppAcc = oppShots > 0 ? Math.round((oppHits / oppShots) * 100) : 0;

  // ── MOBILE LANDSCAPE LAYOUT ───────────────────────────────────────
  // Ports the Handover-from-Design `MobileReport.jsx` spec into a true
  // 2-column 844×390 landscape AAR. Replaces the previous portrait
  // single-column approach which had two bugs flagged by JJ:
  //   1. minHeight:100dvh + overflow:hidden trapped scroll on phones
  //   2. clamp() typography scaled too big in the 390px-tall frame
  // The design uses static type sizes (title 18, callsign 12, stat
  // labels 8) tuned for the landscape phone. Everything fits within
  // the frame — no scroll needed.
  if (isMobile) {
    const stamp = stampText;
    const matchIdShort = `M-#${(screenData?.matchId || 'UNKNOWN').toString().slice(0, 5).toUpperCase()}`;
    return (
      <div style={{
        position: 'relative', height: '100%',
        background: 'var(--bg-deep)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Stamp strip header — DOC · STAMP · M# */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)', letterSpacing: '0.2em',
        }}>
          <span style={{ justifySelf: 'start' }}>DOC 14-C · DECLASSIFIED</span>
          <span style={{
            color: bannerColor, border: `2px solid ${bannerColor}`,
            padding: '2px 8px', transform: 'rotate(-2deg)',
            fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.15em',
          }}>{stamp}</span>
          <span style={{ justifySelf: 'end' }}>{matchIdShort}</span>
        </div>

        {/* Title row — AFTER ACTION REPORT · BO# · WAGER */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          padding: '4px 14px 6px', borderBottom: '1px solid var(--border)',
        }}>
          <div className="stencil" style={{
            fontSize: 16, color: 'var(--bone)', letterSpacing: '0.12em', lineHeight: 1,
          }}>AFTER ACTION REPORT</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)', letterSpacing: '0.2em' }}>
            BO{totalRounds || '?'}{wager > 0 ? ` · ${wager} SOL` : ' · PRACTICE'}{isAIMatch ? ' · VS AI' : ''}
          </div>
        </div>

        {/* BODY: 2 columns — left (winner strip + stat bars) | right (combatants + actions) */}
        <div style={{
          flex: 1, display: 'grid', gridTemplateColumns: '1fr 230px',
          gap: 8, padding: '6px 14px', minHeight: 0,
        }}>
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
            {/* Winner strip */}
            <div style={{
              background: bannerBg, clipPath: 'var(--clip-10)',
              padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 32, color: '#0e1209', lineHeight: 0.8 }}>
                {isWin ? 'W' : 'L'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: '#0e1209', opacity: 0.7, letterSpacing: '0.2em' }}>
                  {verdict}
                </div>
                <div className="stencil" style={{
                  fontSize: 16, color: '#0e1209', letterSpacing: '0.04em', lineHeight: 1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{(myName || 'YOU').toUpperCase()}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: '#0e1209', opacity: 0.7, letterSpacing: '0.2em' }}>FINAL</div>
                <div className="stencil" style={{ fontSize: 20, color: '#0e1209', lineHeight: 1 }}>
                  {myRoundWins} – {oppRoundWins}
                </div>
              </div>
            </div>

            {/* Stat bars card */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              clipPath: 'var(--clip-10)', padding: '8px 12px',
              flex: 1, minHeight: 0,
            }}>
              <MobileStatBar label="DMG DEALT" a={myDmg} b={oppDmg} max={Math.max(900, myDmg, oppDmg)} />
              <MobileStatBar label="ACCURACY" a={myAcc} b={oppAcc} max={100} unit="%" />
              <MobileStatBar label="ROUNDS" a={myRoundWins} b={oppRoundWins} max={totalRounds || 3} />
              <MobileStatBar label="KILLS" a={myKills} b={0} max={Math.max(5, myKills)} />
            </div>

            {/* SOL / Gold reward strip — shown if there's anything to report */}
            {(wager > 0 || myGold > 0) && (
              <div style={{
                display: 'grid', gridTemplateColumns: wager > 0 ? '1fr 1fr' : '1fr',
                gap: 6,
              }}>
                {wager > 0 && (
                  <div style={{
                    padding: '6px 10px',
                    background: isWin ? 'rgba(127,208,96,0.10)' : 'rgba(168,58,26,0.10)',
                    border: `1px solid ${isWin ? 'rgba(127,208,96,0.3)' : 'rgba(168,58,26,0.3)'}`,
                    clipPath: 'var(--clip-6)', textAlign: 'center',
                  }}>
                    <div style={{
                      fontFamily: 'var(--f-display)', fontSize: 16,
                      color: isWin ? '#7fd060' : 'var(--red)', lineHeight: 1, letterSpacing: '0.06em',
                    }}>{isWin ? '+' : '−'}{solDelta.toFixed(3)}</div>
                    <div style={{
                      fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)',
                      letterSpacing: '0.2em', marginTop: 2,
                    }}>SOL {isWin ? 'EARNED' : 'WAGERED'}</div>
                  </div>
                )}
                <div style={{
                  padding: '6px 10px',
                  background: 'rgba(200,120,26,0.08)',
                  border: '1px solid rgba(200,120,26,0.3)',
                  clipPath: 'var(--clip-6)', textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: 'var(--f-display)', fontSize: 16,
                    color: 'var(--accent)', lineHeight: 1, letterSpacing: '0.06em',
                  }}>◆ {myGold}</div>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)',
                    letterSpacing: '0.2em', marginTop: 2,
                  }}>GOLD</div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minHeight: 0 }}>
            {/* Combatants card */}
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              clipPath: 'var(--clip-6)', padding: '6px 9px',
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
            }}>
              {[
                { label: 'YOU', name: myName, color: isWin ? 'var(--accent)' : 'var(--olive)' },
                { label: 'OPPONENT', name: oppName, color: isWin ? 'var(--olive)' : 'var(--accent)' },
              ].map((p, i) => (
                <div key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 6, color: 'var(--olive)', letterSpacing: '0.2em' }}>
                    {p.label}
                  </div>
                  <div className="stencil" style={{
                    fontSize: 11, color: p.color, letterSpacing: '0.06em', lineHeight: 1, marginTop: 2,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {(p.name || 'UNKNOWN').toUpperCase()}
                  </div>
                </div>
              ))}
            </div>

            {/* Settlement TX link — wagered wins only, compact */}
            {isWin && settlementUrl && (
              <a href={settlementUrl} target="_blank" rel="noopener noreferrer" style={{
                fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--accent)',
                letterSpacing: '0.18em', textDecoration: 'none',
                padding: '4px 8px', textAlign: 'center',
                border: '1px solid rgba(200,120,26,0.3)',
                background: 'rgba(200,120,26,0.05)',
                clipPath: 'var(--clip-6)',
              }}>
                ◆ ON-CHAIN · {settlementTx.slice(0, 4)}…{settlementTx.slice(-3)}
              </a>
            )}

            {/* Final standings — N-player matches only */}
            {survivorOrder.length > 2 && (
              <div style={{
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                clipPath: 'var(--clip-6)', padding: '5px 8px',
              }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 6, color: 'var(--accent)', letterSpacing: '0.25em', marginBottom: 3 }}>
                  STANDINGS
                </div>
                {survivorOrder.slice(0, 4).map((id, rank) => {
                  const p = playerMap[id];
                  const isMe = id === myId;
                  return (
                    <div key={id} style={{
                      display: 'grid', gridTemplateColumns: '24px 8px 1fr', gap: 6, alignItems: 'center',
                      padding: '2px 0',
                      fontFamily: 'var(--f-mono)', fontSize: 8, letterSpacing: '0.1em',
                    }}>
                      <span style={{ color: rank === 0 ? 'var(--accent)' : 'var(--muted)' }}>{ordinal(rank + 1)}</span>
                      <div style={{ width: 8, height: 8, background: p?.color || '#fff' }} />
                      <span style={{ color: isMe ? (isWin ? '#7fd060' : 'var(--red)') : 'var(--bone)' }}>
                        {isMe ? 'YOU' : (p?.name || 'UNKNOWN')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Action buttons — 2x grid then primary then back */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button onClick={shareResult} style={mobileBtnSecondary}>
                {shareOk ? '✓ SHARED' : 'SHARE'}
              </button>
              <button onClick={copyResult} style={mobileBtnSecondary}>
                {copyOk ? '✓ COPIED' : 'COPY'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <button onClick={() => setShowCard(true)} style={mobileBtnSecondary}>CARD</button>
              <button onClick={() => navigate('barracks')} style={mobileBtnSecondary}>BARRACKS</button>
            </div>
            <ScanBtn onClick={handlePlayAgain} height={36} fontSize={13}>PLAY AGAIN ▸</ScanBtn>
            <button onClick={handleMenu} style={{ ...mobileBtnSecondary, padding: '5px' }}>◂ MENU</button>

            {/* Footer */}
            <div style={{
              textAlign: 'center', marginTop: 'auto',
              fontFamily: 'var(--f-mono)', fontSize: 6, color: 'var(--muted)',
              letterSpacing: '0.3em',
              paddingTop: 4, borderTop: '1px dashed var(--muted)',
            }}>
              ◣ SOLSHOT.GG · {new Date().toISOString().slice(11, 16)}Z ◣
            </div>
          </div>
        </div>

        {/* Modals (shared with desktop layout) */}
        {opponentLeft && (
          <Modal title="OPPONENT LEFT" message="Your opponent has disconnected."
            buttons={[{ label: 'LOBBY', variant: 'secondary', onClick: handleLobby }]}
            onClose={handleLobby} />
        )}

        {showCard && (() => {
          const myMvp = computeMvpWeapon(scores[myId]?.weaponDamage);
          const oppMvp = computeMvpWeapon(scores[opponentId]?.weaponDamage);
          return (
            <TrophyShareOverlay
              isWin={isWin}
              winner={isWin
                ? { callsign: (myName || 'OPERATIVE').toUpperCase(), damage: myDmg, accuracy: myAcc, shots: myShots, best: myMvp }
                : { callsign: (oppName || 'UNKNOWN').toUpperCase(), damage: oppDmg, accuracy: oppAcc, shots: oppShots, best: oppMvp }
              }
              loser={isWin
                ? { callsign: (oppName || 'UNKNOWN').toUpperCase() }
                : { callsign: (myName || 'OPERATIVE').toUpperCase() }
              }
              score={`${myRoundWins} – ${oppRoundWins}`}
              matchId={matchIdShort}
              terrain={(screenData?.terrain || 'CLASSIFIED').toUpperCase()}
              duration={screenData?.duration || '00:00'}
              onClose={() => setShowCard(false)}
            />
          );
        })()}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(16px, 4vw, 28px) clamp(12px, 4vw, 24px) 100px', position: 'relative', zIndex: 3 }}>
        {/* Stamp header — flex-wraps on phones so the stamp doesn't shove off-screen */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
          flexWrap: 'wrap', gap: 8,
          fontFamily: 'var(--f-mono)', fontSize: 'clamp(9px, 2.4vw, 10px)',
          color: 'var(--olive)', letterSpacing: '0.18em',
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
          fontFamily: 'var(--f-display)', fontSize: 'clamp(26px, 6.5vw, 40px)', color: 'var(--bone)',
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

        {/* Victor strip — clamps scale hero typography down on phones */}
        <div style={{
          background: bannerBg,
          clipPath: 'var(--clip-16)',
          padding: 'clamp(14px, 3.5vw, 22px) clamp(14px, 3.5vw, 24px)',
          marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 'clamp(12px, 3vw, 22px)',
        }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(40px, 11vw, 64px)', color: '#0e1209', lineHeight: 0.8 }}>
            {isWin ? 'W' : 'L'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 'clamp(9px, 2.2vw, 10px)', color: '#0e1209', opacity: 0.7, letterSpacing: '0.22em' }}>
              {verdict}
            </div>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 'clamp(20px, 5.5vw, 32px)', color: '#0e1209',
              letterSpacing: '0.04em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {(myName || 'YOU').toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 'clamp(9px, 2.2vw, 10px)', color: '#0e1209', opacity: 0.7, letterSpacing: '0.22em' }}>
              FINAL SCORE
            </div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 'clamp(24px, 6vw, 36px)', color: '#0e1209', lineHeight: 1 }}>
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
                fontFamily: 'var(--f-display)', fontSize: 'clamp(22px, 5.5vw, 32px)',
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
              fontFamily: 'var(--f-display)', fontSize: 'clamp(22px, 5.5vw, 32px)',
              color: 'var(--accent)', lineHeight: 1, letterSpacing: '0.06em',
            }}>◆ {myGold}</div>
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
              letterSpacing: '0.22em', marginTop: 6,
            }}>GOLD EARNED</div>
          </div>
        </div>

        {/* Combatant comparison — padding tightens on phones, columns stay 1fr 1fr (you vs them is the whole point) */}
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          clipPath: 'var(--clip-16)', padding: 'clamp(14px, 4vw, 24px)', marginBottom: 18,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(10px, 3vw, 20px)',
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
                  fontFamily: 'var(--f-display)', fontSize: 'clamp(16px, 4.5vw, 24px)', color: p.color,
                  letterSpacing: '0.04em', marginTop: 4, textTransform: 'uppercase',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
          {/* Native share sheet (TG, Twitter, iMessage…) on mobile, copy
              fallback on desktop. For wagered wins, share text leads
              with "Just won X SOL" and embeds the on-chain settlement
              TX link to Solscan — concrete proof for anyone you share
              with that the SOL actually moved on-chain. */}
          <button
            onClick={shareResult}
            style={isWin && wager > 0 ? aarBtnAccent : aarBtnSecondary}
          >
            {shareOk ? '✓ SHARED' : (isWin && wager > 0 ? `🏆 SHARE ${winnerPayout.toFixed(2)} SOL WIN` : 'SHARE')}
          </button>
          <button onClick={copyResult} style={aarBtnSecondary}>
            {copyOk ? '✓ COPIED' : 'COPY'}
          </button>
          <button onClick={() => setShowCard(true)} style={aarBtnSecondary}>EXPORT CARD</button>
          <button onClick={() => navigate('barracks')} style={aarBtnSecondary}>BARRACKS</button>
        </div>
        {/* Settlement TX link — direct Solscan view for wagered wins */}
        {isWin && settlementUrl && (
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <a
              href={settlementUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--f-mono)',
                fontSize: 10,
                color: 'var(--accent)',
                letterSpacing: '0.18em',
                textDecoration: 'none',
                opacity: 0.85,
              }}
            >
              ◆ VIEW ON-CHAIN SETTLEMENT — {settlementTx.slice(0, 6)}…{settlementTx.slice(-4)}
            </a>
          </div>
        )}
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

      {showCard && (() => {
        // Compute per-match MVP weapon — accuracy + shot counts already
        // computed at top-level (see myAcc/myShots above) so they can be
        // shared between mobile stat bars and the share card.
        const myScore = myId && scores[myId] ? scores[myId] : {};
        const oppScore = opponentId && scores[opponentId] ? scores[opponentId] : {};
        const myMvp = computeMvpWeapon(myScore.weaponDamage);
        const oppMvp = computeMvpWeapon(oppScore.weaponDamage);
        return (
          <TrophyShareOverlay
            isWin={isWin}
            winner={isWin
              ? { callsign: (myName || 'OPERATIVE').toUpperCase(), damage: myDmg, accuracy: myAcc, shots: myShots, best: myMvp }
              : { callsign: (oppName || 'UNKNOWN').toUpperCase(), damage: oppDmg, accuracy: oppAcc, shots: oppShots, best: oppMvp }
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
        );
      })()}
    </div>
  );
}

// Compact mobile stat bar — landscape phone has tight vertical budget,
// so labels are 8px and the bar is 6px tall (matches design spec).
function MobileStatBar({ label, a, b, max, unit = '' }) {
  const pctA = max > 0 ? Math.min(100, (a / max) * 100) : 0;
  const pctB = max > 0 ? Math.min(100, (b / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--f-mono)', fontSize: 8, letterSpacing: '0.15em',
        marginBottom: 2,
      }}>
        <span style={{ color: 'var(--accent)' }}>{a}{unit}</span>
        <span style={{ color: 'var(--olive)' }}>{label}</span>
        <span style={{ color: 'var(--olive)' }}>{b}{unit}</span>
      </div>
      <div style={{ display: 'flex', gap: 3, height: 6 }}>
        <div style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: pctA + '%', background: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)' }}>
          <div style={{ width: pctB + '%', height: '100%', background: 'var(--olive)' }} />
        </div>
      </div>
    </div>
  );
}

const mobileBtnSecondary = {
  padding: '6px 4px', background: 'var(--bg-raised)', color: 'var(--bone)',
  border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
  fontFamily: 'var(--f-display)', fontSize: 10, letterSpacing: '0.18em',
  cursor: 'pointer',
};

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
