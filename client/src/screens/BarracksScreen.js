import React, { useState, useEffect } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';
import StatCardOverlay from '../components/StatCard';
import { useTelegram } from '../telegram/TelegramContext';
import { haptic } from '../telegram/haptic';
import PRESTIGE_TIERS, { TIER_COLORS } from '../data/tiers';
import { EmptyState, SkeletonCard, SkeletonRow } from '../components/EmptyStates';

const TIER_BADGE_FILES = {
  Bronze:   '/assets/images/badges/badge-bronze.png',
  Silver:   '/assets/images/badges/badge-silver.png',
  Gold:     '/assets/images/badges/badge-gold.png',
  Platinum: '/assets/images/badges/badge-platinum.png',
  Diamond:  '/assets/images/badges/badge-diamond.png',
};

function fmtDmg(val) {
  if (!val || val <= 0) return '—';
  return val >= 1000 ? `${(val / 1000).toFixed(1)}K` : String(val);
}

function CornerBrackets({ color = 'var(--accent)', size = 18, inset = 8 }) {
  const S = size, I = inset;
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none' };
  return (
    <>
      <svg width={S} height={S} style={{ position: 'absolute', top: I, left: I, pointerEvents: 'none' }}><path d={`M0 ${S} L0 0 L${S} 0`} {...stroke} /></svg>
      <svg width={S} height={S} style={{ position: 'absolute', top: I, right: I, pointerEvents: 'none' }}><path d={`M0 0 L${S} 0 L${S} ${S}`} {...stroke} /></svg>
      <svg width={S} height={S} style={{ position: 'absolute', bottom: I, left: I, pointerEvents: 'none' }}><path d={`M0 0 L0 ${S} L${S} ${S}`} {...stroke} /></svg>
      <svg width={S} height={S} style={{ position: 'absolute', bottom: I, right: I, pointerEvents: 'none' }}><path d={`M${S} 0 L${S} ${S} L0 ${S}`} {...stroke} /></svg>
    </>
  );
}

function DossierCard({ callsign, matches, wins, losses, totalDamage, bestWinStreak, signatureWeapon, winRate, kd }) {
  const hasData = matches > 0;
  return (
    <div style={{
      position: 'relative', background: 'linear-gradient(180deg, #141c0d 0%, #0e1308 100%)',
      border: '1px solid var(--border)', padding: '28px 32px 24px', overflow: 'hidden',
    }}>
      <CornerBrackets />
      <div style={{
        pointerEvents: 'none', position: 'absolute', inset: 0,
        backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0,0,0,0.18) 2px 3px)',
        opacity: 0.5,
      }} />
      <div style={{ position: 'absolute', top: 0, left: 32, right: 32, height: 1, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 32, right: 32, height: 1, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

      <div style={{ position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--accent)', letterSpacing: '0.08em' }}>SOLSHOT.GG</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.2em', marginTop: 2 }}>
              PRACTICE MODE // SEASON ZERO
            </div>
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em', textAlign: 'right' }}>
            <div>FILE · #{hasData ? '00A-3F7' : '000-0000'}</div>
            <div style={{ color: 'var(--muted)', marginTop: 2 }}>{hasData ? `${matches} ENGAGEMENTS` : 'NO ENGAGEMENTS'}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 24, alignItems: 'start' }}>
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em' }}>{'// CALLSIGN'}</div>
            <div style={{
              fontFamily: 'var(--f-display)', fontSize: 56, color: 'var(--bone)',
              lineHeight: 0.95, marginTop: 4, marginBottom: 14, letterSpacing: '0.04em',
              textShadow: '0 0 24px rgba(200,184,122,0.15)',
            }}>{(callsign || 'OPERATIVE').toUpperCase()}</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ border: '1px solid var(--border)', padding: '8px 12px', clipPath: 'var(--clip-6)', background: 'rgba(0,0,0,0.25)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em' }}>SIGNATURE WEAPON</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: signatureWeapon ? 'var(--bone)' : 'var(--muted)', letterSpacing: '0.1em', marginTop: 2 }}>
                  {signatureWeapon ? signatureWeapon.toUpperCase() : 'CLASSIFIED'}
                </div>
              </div>
              <div style={{ border: '1px solid var(--border)', padding: '8px 12px', clipPath: 'var(--clip-6)', background: 'rgba(0,0,0,0.25)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em' }}>K / D</div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: kd ? 'var(--bone)' : 'var(--muted)', letterSpacing: '0.1em', marginTop: 2 }}>
                  {kd || 'RECRUIT'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.22em' }}>WIN RATE</div>
              <div style={{
                fontFamily: 'var(--f-display)', fontSize: 48, color: 'var(--accent)',
                lineHeight: 0.9, letterSpacing: '0.04em',
                textShadow: '0 0 20px rgba(218,138,40,0.35)',
              }}>
                {winRate != null ? winRate : '—'}
                <span style={{ fontSize: 28, color: 'var(--accent-hot)', marginLeft: 4 }}>%</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 130, height: 150, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <img
                src="/assets/images/badges/badge-bronze.png"
                alt="rank"
                style={{ width: 118, height: 118, filter: hasData ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' : 'grayscale(1) brightness(0.4)' }}
              />
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 12, color: hasData ? 'var(--accent)' : 'var(--muted)', letterSpacing: '0.22em' }}>
                {hasData ? 'BRONZE' : 'UNRANKED'}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'repeating-linear-gradient(90deg, var(--muted) 0 6px, transparent 6px 10px)', margin: '22px 0 18px' }} />

        {/* Stat row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            ['DMG', fmtDmg(totalDamage)],
            ['W · L', hasData ? `${wins}·${losses}` : '—'],
            ['MATCHES', hasData ? matches : '—'],
            ['STREAK', bestWinStreak > 0 ? `${bestWinStreak}W` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, color: hasData ? 'var(--bone)' : 'var(--muted)', lineHeight: 1, letterSpacing: '0.04em' }}>{v}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em',
        }}>
          <span>WAGER PROTOCOL · {process.env.REACT_APP_WAGERED_ENABLED === 'true' ? 'LIVE' : 'LOCKED'}</span>
          <span>{hasData ? `${matches} MATCHES` : '0 MATCHES'} · solshot.gg</span>
        </div>
      </div>
    </div>
  );
}

function BarracksScreen({ navigate }) {
  const [stats, setStats] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [tab, setTab] = useState('stats');
  const [showCard, setShowCard] = useState(false);
  const [inviteUrl, setInviteUrl] = useState(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [shareError, setShareError] = useState(null);

  // Telegram context — needed for switchInlineQuery share
  const { isTelegram } = useTelegram();

  // Phase 4 — fetch personal invite link on mount
  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    sock.emit('getInviteLink');
    const handler = (data) => { if (data?.ok && data.url) setInviteUrl(data.url); };
    sock.on('inviteLink', handler);
    return () => sock.off('inviteLink', handler);
  }, []);

  /**
   * Share My Stats — pop the TG chat picker, drop the career card image
   * into whichever chat the user picks. Server's inline_query handler
   * uses ctx.from.id to render the SENDER's card (not whatever's in the
   * query payload), so users can only share their own stats.
   *
   * Outside of TG, falls back to copying a public link to the card PNG.
   */
  const handleShareStats = () => {
    haptic.tap();
    setShareError(null);
    const tg = window.Telegram?.WebApp;
    if (tg?.switchInlineQuery) {
      try {
        tg.switchInlineQuery('stats', ['users', 'groups']);
      } catch (err) {
        setShareError('Share unavailable in this client.');
      }
      return;
    }
    // Web fallback — copy /api/stats/<id>/card.png if we can resolve TG id;
    // otherwise just copy the Mini App URL so they can view in TG.
    const fallbackUrl = 'https://t.me/SolShotGG_bot/play?startapp=stats';
    if (navigator.share) {
      navigator.share({ title: 'SolShot stats', url: fallbackUrl }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(fallbackUrl).catch(() => {});
      setShareError('Link copied. Open in Telegram to share the card.');
      setTimeout(() => setShareError(null), 2500);
    }
  };

  const handleInvite = () => {
    if (!inviteUrl) return;
    haptic.tap();
    const tg = window.Telegram?.WebApp;
    if (tg?.switchInlineQuery) {
      // Best UX: pop the chat picker, send via inline mode (when implemented)
      const code = inviteUrl.split('rf_')[1] || '';
      tg.switchInlineQuery('rf_' + code, ['users', 'groups']);
    } else if (navigator.share) {
      navigator.share({ title: 'SolShot', text: 'Come play SolShot, both of us earn 25 SHOT', url: inviteUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(inviteUrl)
        .then(() => { setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1800); })
        .catch(() => {});
    }
  };

  useEffect(() => {
    const sock = window.socket;
    if (sock) {
      sock.emit('getStats');
      const handler = (data) => setStats(data || { matchesPlayed: 0, wins: 0, losses: 0, totalDamage: 0, bestWinStreak: 0 });
      sock.on('statsData', handler);
      return () => sock.off('statsData', handler);
    }
    setStats({ matchesPlayed: 0, wins: 0, losses: 0, totalDamage: 0, bestWinStreak: 0 });
  }, []);

  useEffect(() => {
    const sock = window.socket;
    if (sock) {
      sock.emit('getLeaderboard');
      const handler = (data) => setLeaderboard(data?.players || []);
      sock.on('leaderboardData', handler);
      return () => sock.off('leaderboardData', handler);
    }
    setLeaderboard([]);
  }, []);

  const matches = stats?.matchesPlayed || 0;
  const wins = stats?.wins || 0;
  const losses = stats?.losses || 0;
  const totalDamage = stats?.totalDamage || 0;
  const bestWinStreak = stats?.bestWinStreak || 0;
  const winRate = matches > 0 ? Math.round((wins / matches) * 100) : null;
  const kd = losses > 0 ? (wins / losses).toFixed(2) : wins > 0 ? wins.toFixed(1) : null;
  const callsign = stats?.handle || stats?.callsign || localStorage.getItem('solshot_handle') || 'OPERATIVE';
  const signatureWeapon = stats?.signatureWeapon && stats.signatureWeapon !== 'Single Shot' ? stats.signatureWeapon : null;
  const matchHistory = stats?.matchHistory || [];

  const playerData = { callsign, wins, losses, totalDamage, bestWinStreak, matchesPlayed: matches, signatureWeapon };

  return (
    // flex:1 + overflowY:auto inside Layout's overflow:hidden flex viewport.
    // Previous `minHeight: 100dvh + overflow: hidden` collapsed scroll on
    // phones — the leaderboard tab content overflowed but couldn't be
    // scrolled. Same fix pattern that resolved GroupMatchScreen.
    <div style={{
      position: 'relative',
      flex: 1,
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: 'var(--bg-deep)',
      minHeight: 0,
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px', position: 'relative', zIndex: 3 }}>
        <ScreenHeader
          title="BARRACKS"
          subtitle="PROFILE · COMBAT RECORD · LEADERBOARD"
          onBack={() => navigate('menu')}
        />

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
          {[['stats', 'COMBAT RECORD'], ['leaderboard', 'LEADERBOARD']].map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '12px 0', background: 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--olive)',
              border: 'none',
              borderBottom: '2px solid ' + (tab === id ? 'var(--accent)' : 'transparent'),
              fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>{lbl}</button>
          ))}
        </div>

        {tab === 'stats' && (
          <>
            {stats === null ? (
              /* Skeleton: 6-stat grid placeholder so layout doesn't pop
                 when stats land. Mirrors the DossierCard's stat row. */
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} variant="stat" height={64} />
                ))}
              </div>
            ) : (
              <DossierCard
                callsign={callsign}
                matches={matches} wins={wins} losses={losses}
                totalDamage={totalDamage} bestWinStreak={bestWinStreak}
                signatureWeapon={signatureWeapon} winRate={winRate} kd={kd}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button onClick={() => setShowCard(true)} style={{
                padding: '14px', background: 'var(--accent)', color: '#0e1209',
                border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em', cursor: 'pointer',
              }}>EXPORT CARD</button>
              <button onClick={() => navigate('lobby')} style={{
                padding: '14px', background: 'transparent', color: 'var(--accent)',
                border: '1px solid var(--accent)', clipPath: 'var(--clip-6)',
                fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em', cursor: 'pointer',
              }}>FIND A MATCH</button>
            </div>

            {/* Prestige progression — current tier + burn-to-next visual.
                Renders for every authenticated user (matches > 0 OR not),
                because it's also a teaser for new players to see what's
                ahead of them. */}
            {stats && (() => {
              const tierIdx = stats.prestigeTier || 0;
              const cur = PRESTIGE_TIERS[tierIdx] || PRESTIGE_TIERS[0];
              const next = PRESTIGE_TIERS[tierIdx + 1] || null;
              const shotBalance = stats.shotBalance || 0;
              const totalBurned = stats.totalBurned || stats.shotBurned || 0;
              const isMaxed = !next;
              // For unranked players showing teaser → cost is for Bronze
              const targetCost = next?.cost || 0;
              const pct = isMaxed ? 100 : Math.min(100, Math.round((shotBalance / targetCost) * 100));
              const tierColor = TIER_COLORS[(cur.name || 'STANDARD').toUpperCase()] || cur.color || 'var(--accent)';
              const badge = TIER_BADGE_FILES[cur.name];
              return (
                <div style={{
                  marginTop: 14, padding: '14px 16px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  clipPath: 'var(--clip-10)',
                }}>
                  <div style={{
                    fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
                    letterSpacing: '0.22em', marginBottom: 8,
                  }}>PRESTIGE PROGRESSION</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                    {badge ? (
                      <img src={badge} alt="" style={{
                        width: 56, height: 56, objectFit: 'contain', flexShrink: 0,
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                      }} />
                    ) : (
                      <div style={{
                        width: 56, height: 56, flexShrink: 0,
                        border: '2px dashed var(--olive)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--f-mono)', fontSize: 8, letterSpacing: '0.18em',
                        color: 'var(--olive)', textAlign: 'center', lineHeight: 1.1,
                      }}>UN<br/>RANKED</div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: 'var(--f-display)', fontSize: 16, color: tierColor,
                        letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1,
                      }}>{(cur.name || 'UNRANKED').toUpperCase()} TIER</div>
                      <div style={{
                        fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
                        letterSpacing: '0.18em', marginTop: 6, lineHeight: 1.3,
                      }}>
                        {isMaxed
                          ? `MAX TIER · ${totalBurned.toLocaleString()} SHOT BURNED`
                          : `${shotBalance.toLocaleString()} / ${targetCost.toLocaleString()} SHOT TO ${next.name.toUpperCase()}`}
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{
                    width: '100%', height: 8, background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border)', clipPath: 'var(--clip-3)',
                    overflow: 'hidden', position: 'relative', marginBottom: 12,
                  }}>
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: isMaxed
                        ? 'linear-gradient(90deg, #64c8ff, #b4a0ff)'
                        : tierColor,
                      transition: 'width 280ms ease-out',
                      boxShadow: pct > 0 ? `0 0 8px ${tierColor}` : 'none',
                    }} />
                  </div>
                  {!isMaxed && (
                    <div style={{
                      fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
                      letterSpacing: '0.06em', lineHeight: 1.4, marginBottom: 10,
                    }}>
                      {shotBalance >= targetCost
                        ? `Ready to burn — unlocks ${next.reward} weapon`
                        : `Earn ${(targetCost - shotBalance).toLocaleString()} more SHOT to unlock ${next.reward}`}
                    </div>
                  )}
                  <button onClick={() => { haptic.tap(); navigate('prestige'); }} style={{
                    width: '100%', padding: '10px',
                    background: 'transparent', color: 'var(--bone)',
                    border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                    fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em', cursor: 'pointer',
                  }}>{isMaxed ? 'OPEN PRESTIGE' : 'OPEN PRESTIGE · BURN SHOT'}</button>
                </div>
              );
            })()}

            {/* Share My Stats — pop chat picker, drop career card into any TG chat */}
            {isTelegram && stats && (stats.matchesPlayed || 0) > 0 && (
              <div style={{
                marginTop: 14, padding: '14px 16px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                clipPath: 'var(--clip-10)',
              }}>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
                  letterSpacing: '0.22em', marginBottom: 6,
                }}>SHARE MY OPERATIVE FILE</div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
                  letterSpacing: '0.06em', marginBottom: 10, lineHeight: 1.5,
                }}>
                  Drop your career card into any chat — let them see what you've earned.
                </div>
                <button onClick={handleShareStats} style={{
                  width: '100%', padding: '10px', background: 'var(--accent)', color: '#0e1209',
                  border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                  fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em', cursor: 'pointer',
                }}>SHARE MY STATS</button>
                {shareError && (
                  <div style={{
                    marginTop: 8, fontFamily: 'var(--f-mono)', fontSize: 10,
                    color: 'var(--olive)', letterSpacing: '0.1em', textAlign: 'center',
                  }}>{shareError}</div>
                )}
              </div>
            )}

            {/* Phase 4 — referral / invite panel */}
            {inviteUrl && (
              <div style={{
                marginTop: 14, padding: '14px 16px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                clipPath: 'var(--clip-10)',
              }}>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
                  letterSpacing: '0.22em', marginBottom: 6,
                }}>RECRUIT — EARN 25 SHOT</div>
                <div style={{
                  fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)',
                  letterSpacing: '0.06em', marginBottom: 10, lineHeight: 1.5,
                }}>
                  Both you and your friend get 25 SHOT when they finish their first wagered match.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={handleInvite} style={{
                    padding: '10px', background: 'var(--accent)', color: '#0e1209',
                    border: '1px solid var(--accent-hot)', clipPath: 'var(--clip-6)',
                    fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em', cursor: 'pointer',
                  }}>SEND INVITE</button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl)
                        .then(() => { setInviteCopied(true); setTimeout(() => setInviteCopied(false), 1800); })
                        .catch(() => {});
                    }}
                    style={{
                      padding: '10px', background: 'transparent', color: 'var(--bone)',
                      border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                      fontFamily: 'var(--f-display)', fontSize: 11, letterSpacing: '0.18em', cursor: 'pointer',
                    }}>{inviteCopied ? '✓ COPIED' : 'COPY LINK'}</button>
                </div>
              </div>
            )}

            {matchHistory.length > 0 && (
              <>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.22em', marginTop: 28, marginBottom: 10 }}>
                  RECENT ENGAGEMENTS
                </div>
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', clipPath: 'var(--clip-10)' }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '32px 1fr 60px 70px 70px 100px',
                    padding: '10px 16px', fontFamily: 'var(--f-mono)', fontSize: 9,
                    color: 'var(--olive)', letterSpacing: '0.2em',
                    borderBottom: '1px dashed var(--muted)',
                  }}>
                    <span>R</span><span>OPPONENT</span><span>K·D</span><span>MODE</span>
                    <span style={{ textAlign: 'right' }}>DMG</span>
                    <span style={{ textAlign: 'right' }}>GOLD</span>
                  </div>
                  {matchHistory.map((m, i) => {
                    const isWin = m.result === 'WIN' || m.result === 'win' || m.result === 'W';
                    const resultChar = isWin ? 'W' : 'L';
                    const kd = `${m.kills || 0}·${m.deaths || 0}`;
                    const modeShort = (m.mode || 'QUICK').replace('_', ' ').toUpperCase().slice(0, 8);
                    const goldStr = m.goldEarned > 0 ? `+${m.goldEarned}G` : m.goldEarned < 0 ? `${m.goldEarned}G` : '—';
                    const goldColor = m.goldEarned > 0 ? '#7fd060' : m.goldEarned < 0 ? '#c86060' : 'var(--muted)';
                    return (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '32px 1fr 60px 70px 70px 100px',
                        padding: '10px 16px',
                        borderBottom: i < matchHistory.length - 1 ? '1px dashed var(--muted)' : 'none',
                        alignItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 12,
                      }}>
                        <span style={{ fontFamily: 'var(--f-display)', fontSize: 16, color: isWin ? 'var(--accent)' : 'var(--muted)' }}>{resultChar}</span>
                        <span style={{ color: 'var(--bone)', letterSpacing: '0.06em' }}>{(m.opponent || 'UNKNOWN').toUpperCase()}</span>
                        <span style={{ color: 'var(--bone)' }}>{kd}</span>
                        <span style={{ color: 'var(--olive)', fontSize: 10 }}>{modeShort}</span>
                        <span style={{ color: 'var(--olive)', textAlign: 'right' }}>{fmtDmg(m.damageDealt)}</span>
                        <span style={{ textAlign: 'right', color: goldColor, letterSpacing: '0.1em' }}>{goldStr}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {matches === 0 && (
              <div style={{ textAlign: 'center', marginTop: 24, padding: 20, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.22em' }}>
                PLAY YOUR FIRST MATCH TO BUILD YOUR RECORD
              </div>
            )}
          </>
        )}

        {tab === 'leaderboard' && (
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', clipPath: 'var(--clip-10)' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 80px 70px',
              padding: '12px 20px', fontFamily: 'var(--f-mono)', fontSize: 9,
              color: 'var(--olive)', letterSpacing: '0.22em',
              borderBottom: '1px dashed var(--muted)',
            }}>
              <span>#</span><span>CALLSIGN</span>
              <span style={{ textAlign: 'right' }}>W</span>
              <span style={{ textAlign: 'right' }}>L</span>
              <span style={{ textAlign: 'right' }}>DMG</span>
              <span style={{ textAlign: 'right' }}>RATE</span>
            </div>
            {leaderboard === null ? (
              /* Loading: 7 skeleton rows matching the leaderboard grid */
              <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Array.from({ length: 7 }).map((_, i) => (
                  <SkeletonRow key={i} height={36} lines={2} leftAccent />
                ))}
              </div>
            ) : leaderboard.length === 0 ? (
              /* Empty: genuinely-empty ecosystem (early days) — pitch it
                 as a recruitment moment, not a sad state. */
              <div style={{ position: 'relative', minHeight: 280 }}>
                <EmptyState
                  icon="target"
                  title="NO RANKED OPERATIVES"
                  body="SEASON 0 IS LIVE. WIN A MATCH TO BE THE FIRST ON THE BOARD."
                  primaryCTA={{ label: 'DEPLOY NOW', onClick: () => navigate('lobby') }}
                />
              </div>
            ) : (
              leaderboard.map((p, i) => {
                const isMe = p.callsign?.toUpperCase() === callsign.toUpperCase();
                const mRate = (p.wins + p.losses) > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : 0;
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 60px 60px 80px 70px',
                    padding: '12px 20px',
                    borderBottom: i < leaderboard.length - 1 ? '1px dashed var(--muted)' : 'none',
                    background: isMe ? 'rgba(218,138,40,0.08)' : 'transparent',
                    alignItems: 'center', fontFamily: 'var(--f-mono)', fontSize: 12,
                  }}>
                    <span style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: i < 3 ? 'var(--accent)' : 'var(--muted)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ color: isMe ? 'var(--accent)' : 'var(--bone)', letterSpacing: '0.1em' }}>
                      {(p.callsign || '').toUpperCase()}{isMe ? ' ← YOU' : ''}
                    </span>
                    <span style={{ textAlign: 'right', color: 'var(--bone)' }}>{p.wins}</span>
                    <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{p.losses}</span>
                    <span style={{ textAlign: 'right', color: 'var(--olive)' }}>{fmtDmg(p.totalDamage)}</span>
                    <span style={{ textAlign: 'right', color: 'var(--accent)' }}>{mRate}%</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <TerrainSilhouette />

      {showCard && <StatCardOverlay player={playerData} onClose={() => setShowCard(false)} />}
    </div>
  );
}

export default BarracksScreen;
