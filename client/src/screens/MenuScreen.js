import React, { useState, useCallback } from 'react';
import Button from '../components/Button';
import WalletDisplay from '../components/WalletDisplay';
import ResponsibleGaming from '../components/ResponsibleGaming';
import { useTelegram } from '../telegram/TelegramContext';
import useIsMobile from '../hooks/useIsMobile';
import useControlScheme from '../hooks/useControlScheme';


const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },

  // Background terrain silhouette
  bgTerrain: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '35%',
    background: 'linear-gradient(180deg, transparent, #1a2010 40%, #2a3818)',
    clipPath: 'polygon(0% 60%, 5% 55%, 12% 58%, 20% 45%, 28% 50%, 35% 38%, 42% 42%, 50% 35%, 58% 40%, 65% 32%, 72% 38%, 78% 30%, 85% 35%, 92% 28%, 100% 33%, 100% 100%, 0% 100%)',
    zIndex: 0,
  },

  // Explosion glow
  bgGlow: {
    position: 'absolute',
    bottom: '25%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 200,
    height: 200,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255, 107, 26, 0.08) 0%, transparent 70%)',
    zIndex: 0,
  },

  // Logo section
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 1,
  },

  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },

  // Shell icon (CSS drawn, not emoji)
  shellIcon: {
    width: 32,
    height: 44,
    background: 'var(--sd)',
    border: '2px solid var(--kh)',
    borderRadius: '8px 8px 3px 3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 16,
    color: 'var(--bn)',
  },

  logoText: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 44,
    letterSpacing: 2,
    lineHeight: 1,
  },

  tagline: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 18,
    color: 'var(--kh)',
    opacity: 0.7,
    letterSpacing: 4,
    marginTop: 10,
    textTransform: 'uppercase',
  },

  subTagline: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    opacity: 0.5,
    letterSpacing: 2,
    marginTop: 6,
    marginBottom: 20,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 1,
  },

  // Nav buttons
  navButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    width: 300,
    zIndex: 1,
    marginBottom: 20,
  },

  navButton: {
    width: '100%',
    padding: '14px 24px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Arrow indicator (replaces emoji)
  arrow: {
    position: 'absolute',
    right: 14,
    fontSize: 10,
    color: 'var(--kh)',
    opacity: 0,
    transition: 'opacity 0.15s, transform 0.15s',
  },

  comingSoonBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 9,
    letterSpacing: 1,
    color: 'var(--bn)',
    background: 'var(--sd)',
    border: '1px solid var(--st)',
    borderRadius: 3,
    padding: '2px 6px',
    textTransform: 'uppercase',
    zIndex: 1,
  },

  // Wallet section
  walletSection: {
    zIndex: 1,
    marginBottom: 12,
  },

  // Version tag
  versionTag: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    opacity: 0.3,
    zIndex: 1,
  },

  // Control scheme selector
  controlSchemeSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    zIndex: 1,
  },

  controlSchemeLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    opacity: 0.5,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  controlSchemePicker: {
    display: 'flex',
    gap: 6,
  },

};

function MenuScreen({ navigate }) {
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const { isTelegram, user: tgUser } = useTelegram();
  const isMobile = useIsMobile();
  const [scheme, setScheme] = useControlScheme(isMobile);
  const onLogoError = useCallback(() => setLogoFailed(true), []);

  const navItems = [
    { id: 'deploy', label: 'PLAY FREE', variant: 'primary', screen: 'lobby' },
    { id: 'ai-practice', label: 'VS SHOT BOT', variant: 'secondary', screen: 'ai-practice' },
    { id: 'loadout', label: 'LOADOUT', variant: 'secondary', screen: 'loadout' },
    { id: 'armory', label: 'ARMORY', variant: 'secondary', screen: 'armory' },
    { id: 'prestige', label: 'PRESTIGE', variant: 'secondary', screen: 'prestige', comingSoon: true },
    { id: 'barracks', label: 'BARRACKS', variant: 'secondary', screen: 'barracks' },
  ];

  return (
    <div style={{ ...styles.container, paddingBottom: isMobile ? 44 : 0, ...(isMobile ? { justifyContent: 'center', paddingTop: 0 } : {}) }}>
      {/* Background elements */}
      <div style={styles.bgTerrain} />
      <div style={styles.bgGlow} />

      {isMobile ? (
        /* ═══ MOBILE LANDSCAPE LAYOUT ═══ */
        <>
          {/* Wallet — top right (crypto standard) */}
          <div style={{ position: 'absolute', top: 8, right: 12, zIndex: 10 }}>
            <WalletDisplay />
          </div>

          {/* Logo — bigger, centered */}
          <div style={{ ...styles.logoSection, marginBottom: 4 }}>
            {logoFailed ? (
              <div style={styles.logoRow}>
                <span style={{ ...styles.logoText, fontSize: 32, color: 'var(--bn)' }}>SOL</span>
                <span style={{ ...styles.logoText, fontSize: 32, color: 'var(--rd)' }}>SHOT</span>
              </div>
            ) : (
              <img
                src="/assets/images/branding/logo-transparent.png"
                alt="SolShot"
                onError={onLogoError}
                style={{ width: 215, height: 'auto', objectFit: 'contain', marginBottom: 2 }}
              />
            )}
            <div style={{ ...styles.tagline, fontSize: 10, marginTop: 2, letterSpacing: 2 }}>SKILL, NOT LUCK</div>
          </div>

          {/* 2x2 button grid */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            width: 320,
            justifyContent: 'center',
            zIndex: 1,
            marginBottom: 6,
          }}>
            {navItems.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  width: 'calc(50% - 3px)',
                  animation: `si 0.3s ease-out ${idx * 0.06}s both`,
                }}
              >
                <Button
                  variant={item.comingSoon ? 'disabled' : item.variant}
                  onClick={item.comingSoon ? undefined : () => navigate(item.screen)}
                  disabled={item.comingSoon}
                  style={{ ...styles.navButton, padding: '7px 10px', fontSize: 12, position: 'relative' }}
                >
                  {item.label}
                  {item.comingSoon && (
                    <span style={{ ...styles.comingSoonBadge, fontSize: 7, top: -6, right: -4, padding: '1px 4px' }}>SOON</span>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* HOW TO PLAY link */}
          <div
            onClick={() => navigate('howtoplay')}
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10,
              color: 'var(--kh)',
              letterSpacing: 2,
              cursor: 'pointer',
              opacity: 0.5,
              zIndex: 1,
            }}
          >
            HOW TO PLAY
          </div>

          {/* Telegram badge */}
          {isTelegram && tgUser && (
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 11,
              color: 'var(--kh)',
              letterSpacing: 1,
              padding: '2px 8px',
              border: '1px solid var(--ol)',
              borderRadius: 3,
              marginTop: 4,
              zIndex: 1,
              opacity: 0.7,
            }}>
              {'TG: @' + (tgUser.username || tgUser.first_name || 'UNKNOWN')}
            </div>
          )}
        </>
      ) : (
        /* ═══ DESKTOP LAYOUT (unchanged) ═══ */
        <>
          {/* Logo */}
          <div style={{ ...styles.logoSection, marginBottom: 6 }}>
            {logoFailed ? (
              <div style={styles.logoRow}>
                <span style={{ ...styles.logoText, fontSize: 44, color: 'var(--bn)' }}>SOL</span>
                <span style={{ ...styles.logoText, fontSize: 44, color: 'var(--rd)' }}>SHOT</span>
              </div>
            ) : (
              <img
                src="/assets/images/branding/logo-transparent.png"
                alt="SolShot"
                onError={onLogoError}
                style={{ width: 340, height: 'auto', objectFit: 'contain', marginBottom: 8 }}
              />
            )}
            <div style={{ ...styles.tagline, fontSize: 18, marginTop: 10, letterSpacing: 4 }}>SKILL, NOT LUCK</div>
            <div style={{ ...styles.subTagline, fontSize: 14, marginTop: 6, marginBottom: 20 }}>SKILL-BASED ARTILLERY COMBAT</div>
          </div>

          {/* Navigation buttons */}
          <div style={{ ...styles.navButtons, width: 300, gap: 10, marginBottom: 20 }}>
            {navItems.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  animation: `si 0.3s ease-out ${idx * 0.08}s both`,
                }}
                onMouseEnter={() => setHoveredBtn(item.id)}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <Button
                  variant={item.comingSoon ? 'disabled' : item.variant}
                  onClick={item.comingSoon ? undefined : () => navigate(item.screen)}
                  disabled={item.comingSoon}
                  style={{ ...styles.navButton, padding: '14px 24px', position: 'relative' }}
                >
                  {item.label}
                  {item.comingSoon && (
                    <span style={styles.comingSoonBadge}>COMING SOON</span>
                  )}
                  {!item.comingSoon && (
                    <span
                      style={{
                        ...styles.arrow,
                        opacity: hoveredBtn === item.id ? 1 : 0,
                        transform: hoveredBtn === item.id ? 'translateX(0)' : 'translateX(-4px)',
                      }}
                    >
                      {'\u25B6'}
                    </span>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {/* How To Play link */}
          <div
            onClick={() => navigate('howtoplay')}
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
              color: 'var(--kh)',
              letterSpacing: 2,
              cursor: 'pointer',
              opacity: 0.6,
              marginBottom: 12,
              zIndex: 1,
              transition: 'opacity 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { e.target.style.opacity = '1'; e.target.style.color = 'var(--rg)'; }}
            onMouseLeave={(e) => { e.target.style.opacity = '0.6'; e.target.style.color = 'var(--kh)'; }}
          >
            HOW TO PLAY
          </div>

          {/* Control scheme selector removed — classic is default, mouse-aim can be toggled in battle settings */}

          {/* Telegram user badge (when in Telegram) */}
          {isTelegram && tgUser && (
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 13,
              color: 'var(--kh)',
              letterSpacing: 1,
              padding: '4px 12px',
              border: '1px solid var(--ol)',
              borderRadius: 3,
              marginBottom: 8,
              zIndex: 1,
              opacity: 0.7,
            }}>
              {'TG: @' + (tgUser.username || tgUser.first_name || 'UNKNOWN')}
            </div>
          )}

          {/* Wallet display */}
          <div style={{ ...styles.walletSection, marginBottom: 12 }}>
            <WalletDisplay />
          </div>
        </>
      )}

      {/* Version tag */}
      <div style={styles.versionTag}>v0.5.0-alpha</div>

      {/* Responsible gaming disclosure — hidden on mobile (declutter) */}
      {!isMobile && <ResponsibleGaming navigate={navigate} />}
    </div>
  );
}

export default MenuScreen;
