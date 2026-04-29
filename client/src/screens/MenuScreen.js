import React, { useState, useEffect, useCallback } from 'react';
import { useTelegram } from '../telegram/TelegramContext';
import { useSolShotWallet } from '../wallet/WalletContext';
import useIsMobile from '../hooks/useIsMobile';
import ScanBtn from '../components/design/ScanBtn';
import DesignTopBar from '../components/design/TopBar';
import TerrainSilhouette from '../components/design/Terrain';

const TURRET = { x: -23, y: 80, rot: -3, w: 198 };
const tankImg = { imageRendering: 'pixelated' };

function MenuScreen({ navigate }) {
  const { isTelegram, user: tgUser } = useTelegram();
  const isMobile = useIsMobile();
  const { shotBalance, balance: solBalance, walletAddress } = useSolShotWallet();
  const [onlineCount, setOnlineCount] = useState(247);

  const callsign = localStorage.getItem('solshot_handle') || 'OPERATIVE';

  useEffect(() => {
    const t = setInterval(() => setOnlineCount(c => Math.max(180, Math.min(320, c + Math.floor(Math.random() * 9) - 4))), 2400);
    return () => clearInterval(t);
  }, []);

  const secondary = [
    { id: 'aibot',    label: 'VS BOT',   sub: 'PRACTICE · NO STAKES · OFFLINE',  screen: 'ai-practice' },
    { id: 'armory',   label: 'ARMORY',   sub: 'GEAR · PRESTIGE · LOADOUT',       screen: 'armory' },
    { id: 'barracks', label: 'BARRACKS', sub: 'STATS · LEADERBOARD',             screen: 'barracks' },
  ];

  if (isMobile) {
    return <MobileMenu navigate={navigate} callsign={callsign} shotBalance={shotBalance || 0} solBalance={solBalance || 0} onlineCount={onlineCount} secondary={secondary} />;
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      {/* Top bar */}
      <DesignTopBar
        callsign={callsign}
        tier="UNRANKED"
        level={1}
        shotBalance={shotBalance || 0}
        solBalance={solBalance || 0}
        badgeSrc="/assets/images/badges/badge-bronze.png"
      />

      {/* Hero content */}
      <div style={{ position: 'relative', zIndex: 3, maxWidth: 420, margin: '0 auto', padding: '24px 24px 60px', textAlign: 'center' }}>
        {/* Tank preview */}
        <div style={{ position: 'relative', height: 140, marginBottom: 16, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 280, height: 140 }}>
            <img src="/assets/images/tanks/tank-tinted.png" alt="tank"
              style={{ ...tankImg, position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', width: 240, height: 'auto',
                       filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.5))' }} />
            <img src="/assets/images/tanks/tank-turret-tinted.png" alt="turret"
              style={{ ...tankImg, position: 'absolute', bottom: TURRET.y, left: '50%',
                       width: TURRET.w, height: 'auto',
                       transform: `translateX(${TURRET.x}%) rotate(${TURRET.rot}deg)`,
                       transformOrigin: '22% 70%',
                       filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.5))' }} />
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: '18%', right: '18%', height: 2,
                        background: 'repeating-linear-gradient(90deg, var(--muted) 0 8px, transparent 8px 14px)', opacity: 0.5 }} />
        </div>

        {/* PLAY button */}
        <ScanBtn onClick={() => navigate('lobby')} height={80} fontSize={44}>
          PLAY
        </ScanBtn>

        {/* Secondary buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, marginBottom: 18 }}>
          {secondary.map(b => (
            <button key={b.id} onClick={() => navigate(b.screen)} style={{
              padding: '13px 18px',
              background: 'var(--bg-raised)',
              color: 'var(--bone)',
              border: '1px solid var(--border)',
              clipPath: 'var(--clip-6)',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 10,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 15, letterSpacing: '0.18em', color: 'var(--bone)', textTransform: 'uppercase' }}>{b.label}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.2em', marginTop: 3 }}>{b.sub}</div>
              </div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--olive)' }}>▸</span>
            </button>
          ))}
        </div>

        {/* How to play */}
        <div
          onClick={() => navigate('howtoplay')}
          style={{
            display: 'inline-block', cursor: 'pointer',
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
            letterSpacing: '0.25em', textDecoration: 'none',
            borderBottom: '1px dotted var(--olive)', paddingBottom: 2,
            marginBottom: 14,
          }}
        >
          HOW TO PLAY →
        </div>

        {/* Online counter */}
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.2em' }}>
          <span style={{ color: '#7fd060' }}>●</span> {onlineCount} ONLINE · MAINNET BETA
        </div>
      </div>

      <TerrainSilhouette />
    </div>
  );
}

/* ═══ MOBILE LANDSCAPE LAYOUT ═══ */
function MobileMenu({ navigate, callsign, shotBalance, solBalance, onlineCount, secondary }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', background: 'var(--bg-deep)' }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.08, zIndex: 0,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 8, left: 12, right: 12, zIndex: 10,
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center', paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/assets/images/badges/badge-bronze.png" style={{ width: 22, height: 22, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }} alt="rank" />
          <div>
            <div style={{ fontFamily: 'var(--f-sec)', fontSize: 11, color: 'var(--bone)', letterSpacing: '0.08em', lineHeight: 1 }}>{callsign}</div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)', letterSpacing: '0.25em', marginTop: 3 }}>UNRANKED · LVL 1</div>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--f-display, "Black Ops One")', fontSize: 22, letterSpacing: '0.04em', lineHeight: 1, userSelect: 'none' }}>
          <span style={{ color: 'var(--olive, #7a9060)' }}>SOL</span>
          <span style={{ color: 'var(--accent, #c8a84a)' }}>SHOT</span>
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.15em' }}>
          <span style={{ color: 'var(--accent)' }}>◆ {(shotBalance || 0).toLocaleString()} SHOT</span>
          <span style={{ color: 'var(--bone)' }}>◇ {(solBalance || 0).toFixed(2)} SOL</span>
        </div>
      </div>

      {/* Body — two columns */}
      <div style={{
        position: 'absolute', top: 42, left: 12, right: 12, bottom: 8, zIndex: 3,
        display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16,
        alignItems: 'center',
      }}>
        {/* LEFT — Tank */}
        <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 180, height: 100 }}>
            <img src="/assets/images/tanks/tank-tinted.png" alt="tank"
              style={{ ...tankImg, position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', width: 140,
                       filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.5))' }} />
            <img src="/assets/images/tanks/tank-turret-tinted.png" alt="turret"
              style={{ ...tankImg, position: 'absolute', bottom: 53, left: '50%',
                       width: 110, transform: 'translateX(-23%) rotate(-3deg)',
                       transformOrigin: '22% 70%',
                       filter: 'drop-shadow(0 2px 0 rgba(0,0,0,0.5))' }} />
            <div style={{ position: 'absolute', bottom: 6, left: 15, right: 15, height: 2,
                          background: 'repeating-linear-gradient(90deg, var(--muted) 0 8px, transparent 8px 14px)', opacity: 0.6 }} />
          </div>

          {/* Online counter */}
          <div style={{
            position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: '0.2em', whiteSpace: 'nowrap',
          }}>
            <span style={{ color: '#7fd060' }}>●</span> {onlineCount} ONLINE
          </div>
        </div>

        {/* RIGHT — CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ScanBtn onClick={() => navigate('lobby')} height={52} fontSize={26}>PLAY</ScanBtn>

          {secondary.map(b => (
            <button key={b.id} onClick={() => navigate(b.screen)} style={{
              padding: '9px 14px',
              background: 'var(--bg-raised)', color: 'var(--bone)',
              border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
              cursor: 'pointer', textAlign: 'left',
              display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 6,
            }}>
              <div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.18em', color: 'var(--bone)', lineHeight: 1, textTransform: 'uppercase' }}>{b.label}</div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 7, color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 2 }}>{b.sub}</div>
              </div>
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)' }}>▸</span>
            </button>
          ))}

          <div onClick={() => navigate('howtoplay')} style={{
            alignSelf: 'center', marginTop: 2, cursor: 'pointer',
            fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--olive)',
            letterSpacing: '0.28em', textDecoration: 'none',
            borderBottom: '1px dotted var(--olive)', paddingBottom: 1,
          }}>HOW TO PLAY →</div>
        </div>
      </div>
    </div>
  );
}

export default MenuScreen;
