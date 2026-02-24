import React, { useState, useCallback } from 'react';
import Button from '../components/Button';
import WalletDisplay from '../components/WalletDisplay';
import ResponsibleGaming from '../components/ResponsibleGaming';
import { useTelegram } from '../telegram/TelegramContext';

const PARTNERS = [
  { name: 'SOLANA',  color: '#9945FF' },
  { name: 'JUPITER', color: '#C7F284' },
  { name: 'METEORA', color: '#00D4AA' },
  { name: 'CLAUDE',  color: '#D97706' },
];

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
    fontSize: 14,
    color: 'var(--kh)',
    opacity: 0.6,
    letterSpacing: 3,
    marginTop: 8,
    textTransform: 'uppercase',
  },

  subTagline: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    opacity: 0.5,
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
    zIndex: 1,
  },

  // Ecosystem partners row
  partnersRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
    zIndex: 1,
  },
  partnerBadge: (color) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: color,
    letterSpacing: 2,
    padding: '2px 8px',
    border: '1px solid ' + color + '44',
    borderRadius: 2,
    background: color + '0A',
  }),

  // Nav buttons
  navButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: 260,
    zIndex: 1,
    marginBottom: 16,
  },

  navButton: {
    width: '100%',
    padding: '12px 20px',
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

  jupiterCallout: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: '#C7F284',
    opacity: 0.6,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    zIndex: 1,
  },

  learnMoreLink: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    opacity: 0.5,
    letterSpacing: 2,
    textDecoration: 'none',
    textTransform: 'uppercase',
    zIndex: 1,
    marginTop: 6,
    display: 'block',
  },
};

function MenuScreen({ navigate }) {
  const [hoveredBtn, setHoveredBtn] = useState(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const { isTelegram, user: tgUser } = useTelegram();
  const onLogoError = useCallback(() => setLogoFailed(true), []);

  const navItems = [
    { id: 'deploy', label: 'PLAY FREE', variant: 'primary', screen: 'lobby' },
    { id: 'armory', label: 'ARMORY', variant: 'secondary', screen: 'armory' },
    { id: 'prestige', label: 'PRESTIGE', variant: 'secondary', screen: 'prestige' },
    { id: 'barracks', label: 'BARRACKS', variant: 'secondary', screen: 'barracks' },
  ];

  return (
    <div style={styles.container}>
      {/* Background elements */}
      <div style={styles.bgTerrain} />
      <div style={styles.bgGlow} />

      {/* Logo */}
      <div style={styles.logoSection}>
        {logoFailed ? (
          <div style={styles.logoRow}>
            <span style={{ ...styles.logoText, color: 'var(--bn)' }}>SOL</span>
            <span style={{ ...styles.logoText, color: 'var(--rd)' }}>SHOT</span>
          </div>
        ) : (
          <img
            src="/assets/images/branding/logo-transparent.png"
            alt="SolShot"
            onError={onLogoError}
            style={{ width: 300, height: 'auto', objectFit: 'contain', marginBottom: 6 }}
          />
        )}
        <div style={styles.tagline}>SKILL, NOT LUCK</div>
        <div style={styles.subTagline}>WAGER 0.1 — 1.0 SOL | NO DOWNLOAD REQUIRED</div>
      </div>

      {/* Ecosystem partners row */}
      <div style={styles.partnersRow}>
        {PARTNERS.map((p) => (
          <span key={p.name} style={styles.partnerBadge(p.color)}>{p.name}</span>
        ))}
      </div>

      {/* Navigation buttons */}
      <div style={styles.navButtons}>
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
              variant={item.variant}
              onClick={() => navigate(item.screen)}
              style={styles.navButton}
            >
              {item.label}
              <span
                style={{
                  ...styles.arrow,
                  opacity: hoveredBtn === item.id ? 1 : 0,
                  transform: hoveredBtn === item.id ? 'translateX(0)' : 'translateX(-4px)',
                }}
              >
                {'\u25B6'}
              </span>
            </Button>
          </div>
        ))}
      </div>

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
      <div style={styles.walletSection}>
        <WalletDisplay />
      </div>

      {/* Jupiter Mobile callout */}
      <div style={styles.jupiterCallout}>NEW TO CRYPTO? USE JUPITER MOBILE</div>

      {/* Learn More link */}
      <a href="#" style={styles.learnMoreLink}>LEARN MORE</a>

      {/* Version tag */}
      <div style={styles.versionTag}>v0.5.0-alpha</div>

      {/* Responsible gaming disclosure */}
      <ResponsibleGaming />
    </div>
  );
}

export default MenuScreen;
