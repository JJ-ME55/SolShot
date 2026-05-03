import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';

/**
 * StatCard — Practice mode shareable combat profile card.
 *
 * Two rendering modes:
 * 1. Preview: 720x405 card scaled to fit viewport via CSS transform (what the user sees)
 * 2. Export:  1600x900 canonical card rendered offscreen, always identical regardless of device
 *
 * All internal sizes use fixed px. No vw/vh/clamp — deterministic export.
 * Visual language: Cold War command bunker + military propaganda + premium social flex.
 */

const CARD_URL = 'https://solshot.gg';

// Preview card (on-screen)
const CARD_W = 720;
const CARD_H = 405;

// Export card (canonical — always this size in the PNG)
const EXPORT_W = 1600;
const EXPORT_H = 900;
const EXPORT_SCALE = EXPORT_W / CARD_W; // 2.222...

/* ── Prestige accent config ── */

const PRESTIGE_STYLES = {
  bronze: {
    label: 'BRONZE',
    primary: '#C47A2C',
    glow: 'rgba(196,122,44,0.25)',
    // Micro-accent: warm shift on chrome, subtle on stamp
    bracketAlpha: '44',  // same as base — bronze is subtle
    stampOpacity: 0.28,
  },
  silver: {
    label: 'SILVER',
    primary: '#9FA6AD',
    glow: 'rgba(159,166,173,0.25)',
    bracketAlpha: '40',
    stampOpacity: 0.28,
  },
  gold: {
    label: 'GOLD',
    primary: '#D4AF37',
    glow: 'rgba(212,175,55,0.32)',
    bracketAlpha: '50',
    stampOpacity: 0.34,
  },
  diamond: {
    label: 'DIAMOND',
    primary: '#6FD3FF',
    glow: 'rgba(111,211,255,0.30)',
    bracketAlpha: '50',
    stampOpacity: 0.36, // brighter — doesn't blend into bg
  },
};

// Base accent (no prestige)
const BASE_ACCENT = '#E8572A';

/* ── Helpers ── */

const formatDamage = (value = 0) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${value}`;
};

const formatKD = (wins = 0, losses = 0) => {
  if (losses === 0) return wins > 0 ? wins.toFixed(2) : '0.00';
  return (wins / losses).toFixed(2);
};

const formatWinRate = (wins = 0, matchesPlayed = 0) => {
  if (!matchesPlayed) return 0;
  return Math.round((wins / matchesPlayed) * 100);
};

const getDisplayWeapon = (signatureWeapon) => {
  if (!signatureWeapon || signatureWeapon === 'Single Shot') return 'CLASSIFIED';
  return signatureWeapon.toUpperCase();
};

const getPrestigeMeta = (prestigeTier, prestigeIcons) => {
  const tier = PRESTIGE_STYLES[prestigeTier];
  if (!tier) return null;
  return {
    ...tier,
    color: tier.primary,
    icon: prestigeIcons?.[prestigeTier],
  };
};

/* ── Prestige Stamp sub-component ── */

function PrestigeStamp({ prestigeMeta, exportMode }) {
  const sc = exportMode ? EXPORT_SCALE : 1;

  // Vacant badge — shown when no prestige
  if (!prestigeMeta) {
    return (
      <div style={{
        position: 'absolute',
        right: 40 * sc,
        top: '34%',
        transform: 'rotate(-5deg)',
        pointerEvents: 'none',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6 * sc,
        opacity: 0.08,
      }}>
        {/* Ghost badge circle */}
        <div style={{
          width: 40 * sc,
          height: 40 * sc,
          borderRadius: '50%',
          border: `1.5px dashed #EDE9D5`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Lock icon — simple padlock shape via CSS */}
          <div style={{ position: 'relative', width: 12 * sc, height: 14 * sc }}>
            {/* Shackle */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 2 * sc,
              width: 8 * sc,
              height: 6 * sc,
              borderRadius: `${4 * sc}px ${4 * sc}px 0 0`,
              border: `1.5px solid #EDE9D5`,
              borderBottom: 'none',
            }} />
            {/* Body */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 12 * sc,
              height: 9 * sc,
              background: '#EDE9D5',
              borderRadius: 1,
            }} />
          </div>
        </div>
        {/* Label */}
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: 7 * sc,
          color: '#EDE9D5',
          letterSpacing: '0.22em',
          whiteSpace: 'nowrap',
        }}>CLEARANCE: LOCKED</div>
      </div>
    );
  }

  const { primary, glow, stampOpacity, label } = prestigeMeta;
  const isDiamond = label === 'DIAMOND';
  const isGold = label === 'GOLD';
  return (
    <div style={{
      position: 'absolute',
      right: 32 * sc,
      top: '36%',
      transform: 'rotate(-5deg)',
      pointerEvents: 'none',
      zIndex: 2,
    }}>
      {/* Telemetry line behind stamp */}
      <div style={{
        position: 'absolute',
        top: '50%',
        right: -20 * sc,
        width: 60 * sc,
        height: 1,
        background: `linear-gradient(90deg, ${primary}14, ${primary}06)`,
        pointerEvents: 'none',
      }} />
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7 * sc,
        opacity: stampOpacity,
      }}>
        {prestigeMeta.icon && (
          <img
            src={prestigeMeta.icon}
            alt=""
            style={{
              width: 24 * sc,
              height: 24 * sc,
              objectFit: 'contain',
              filter: isDiamond ? 'grayscale(0.1) brightness(1.5)'
                : isGold ? 'grayscale(0.1) brightness(1.4)'
                : 'grayscale(0.2) brightness(1.3)',
            }}
          />
        )}
        <div style={{
          fontFamily: "'Share Tech Mono', monospace",
          letterSpacing: '0.18em',
          color: primary,
          fontSize: 12 * sc,
          whiteSpace: 'nowrap',
          textShadow: (isGold || isDiamond)
            ? `0 0 ${12 * sc}px ${glow}, 0 0 ${4 * sc}px ${glow}`
            : `0 0 ${10 * sc}px ${glow}`,
        }}>
          CLEARANCE: {label}
        </div>
      </div>
      {/* Double-border stamp effect */}
      <div style={{
        position: 'absolute',
        inset: `${-6 * sc}px ${-14 * sc}px`,
        border: `1px solid ${primary}22`,
        borderRadius: 2,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        inset: `${-9 * sc}px ${-17 * sc}px`,
        border: `1px solid ${primary}0e`,
        borderRadius: 3,
        pointerEvents: 'none',
      }} />
    </div>
  );
}

/* ── Default prestige badge paths ── */
const DEFAULT_PRESTIGE_ICONS = {
  bronze: '/assets/images/badges/badge-bronze.png',
  silver: '/assets/images/badges/badge-silver.png',
  gold: '/assets/images/badges/badge-gold.png',
  platinum: '/assets/images/badges/badge-platinum.png',
  diamond: '/assets/images/badges/badge-diamond.png',
};

/* ── Card internals (shared between preview and export) ── */

function CardInternals({ callsign, wins, losses, totalDamage, bestWinStreak, matchesPlayed,
  displayWeapon, winRate, kd, fmtDmg, prestigeMeta, callsignSize, tierGlow,
  showQr, qrValue, exportMode }) {

  const sc = exportMode ? EXPORT_SCALE : 1;

  // Prestige micro-accents — subtle tinting on chrome elements
  const accentPrimary = prestigeMeta?.primary || BASE_ACCENT;
  const bracketAlpha = prestigeMeta?.bracketAlpha || '44';
  const bracketColor = `${accentPrimary}${bracketAlpha}`;
  // Weapon bar: blend toward tier if prestige active, else base orange
  const weaponBarColor = displayWeapon === 'CLASSIFIED' ? '#434734'
    : prestigeMeta ? accentPrimary : BASE_ACCENT;

  const stats = [
    { label: 'DMG', value: fmtDmg },
    { label: 'WINS', value: wins },
    { label: 'LOSSES', value: losses },
    { label: 'K / D', value: kd },
    { label: 'STREAK', value: `${bestWinStreak}W` },
  ];

  return (
    <>
      {/* ── Background atmosphere layers ── */}

      {/* Diagonal targeting lines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(32deg, transparent 48%, #E8572A06 49%, #E8572A06 49.5%, transparent 50%),
          linear-gradient(-15deg, transparent 48%, #E8572A04 49%, #E8572A04 49.5%, transparent 50%)
        `,
      }} />

      {/* Faint reticle — right side atmosphere */}
      <div style={{
        position: 'absolute',
        right: 90 * sc,
        top: '40%',
        width: 100 * sc,
        height: 100 * sc,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.05,
      }}>
        <div style={{ position: 'absolute', inset: 0, border: '1px solid #EDE9D5', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', inset: `${16 * sc}px`, border: '1px solid #EDE9D5', borderRadius: '50%', opacity: 0.4 }} />
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#EDE9D5' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#EDE9D5' }} />
      </div>

      {/* Vertical telemetry line — right quadrant */}
      <div style={{
        position: 'absolute',
        right: 140 * sc,
        top: '8%',
        bottom: '8%',
        width: 1,
        background: 'linear-gradient(180deg, transparent, #E8572A08 30%, #E8572A08 70%, transparent)',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.10) 3px, rgba(0,0,0,0.10) 4px)',
      }} />

      {/* Noise texture */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        opacity: 0.03,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />

      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.55) 100%)',
      }} />

      {/* ── Chrome accents ── */}

      {/* Top bar — base orange with prestige tint overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2 * sc, zIndex: 4,
        background: `linear-gradient(90deg, transparent 0%, ${BASE_ACCENT} 15%, ${BASE_ACCENT} 85%, transparent 100%)`,
      }} />
      {prestigeMeta && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2 * sc, zIndex: 4,
          background: `linear-gradient(90deg, transparent 0%, ${accentPrimary} 15%, ${accentPrimary} 85%, transparent 100%)`,
          opacity: 0.3,
          pointerEvents: 'none',
        }} />
      )}

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2 * sc, zIndex: 4,
        background: 'linear-gradient(90deg, transparent, #2e3120 30%, #2e3120 70%, transparent)',
      }} />

      {/* Corner brackets — tinted by prestige */}
      {[
        { top: 8 * sc, left: 8 * sc, borderTop: `1px solid ${bracketColor}`, borderLeft: `1px solid ${bracketColor}` },
        { top: 8 * sc, right: 8 * sc, borderTop: `1px solid ${bracketColor}`, borderRight: `1px solid ${bracketColor}` },
        { bottom: 8 * sc, left: 8 * sc, borderBottom: `1px solid ${bracketColor}`, borderLeft: `1px solid ${bracketColor}` },
        { bottom: 8 * sc, right: 8 * sc, borderBottom: `1px solid ${bracketColor}`, borderRight: `1px solid ${bracketColor}` },
      ].map((bracket, i) => (
        <div key={i} style={{ position: 'absolute', width: 16 * sc, height: 16 * sc, zIndex: 5, ...bracket }} />
      ))}

      {/* Left accent strip */}
      <div style={{
        position: 'absolute', left: 0, top: '12%', bottom: '12%', width: 2 * sc, zIndex: 2,
        background: 'linear-gradient(180deg, transparent, #E8572A33 35%, #E8572A33 65%, transparent)',
      }} />

      {/* Right accent */}
      <div style={{
        position: 'absolute', right: 0, top: '20%', bottom: '20%', width: 1, zIndex: 2,
        background: 'linear-gradient(180deg, transparent, #2e312055 40%, #2e312055 60%, transparent)',
      }} />

      {/* ── Prestige clearance stamp ── */}
      <PrestigeStamp prestigeMeta={prestigeMeta} exportMode={exportMode} />

      {/* ── Main content ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 3,
        display: 'flex', flexDirection: 'column',
        padding: `${20 * sc}px ${28 * sc}px ${16 * sc}px ${28 * sc}px`,
      }}>

        {/* TOP ROW — branding + QR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 * sc }}>
          <div>
            <div style={{
              fontFamily: "'Black Ops One', cursive",
              fontSize: 13 * sc,
              color: '#E8572A',
              letterSpacing: '0.18em',
              lineHeight: 1,
            }}>SOLSHOT.GG</div>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 7.5 * sc,
              color: '#50553D',
              letterSpacing: '0.14em',
              marginTop: 3 * sc,
            }}>PRACTICE MODE // SEASON ZERO</div>
          </div>
          {showQr && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 * sc }}>
              <div style={{
                width: 48 * sc,
                height: 48 * sc,
                background: '#13150f',
                border: '1px solid #2e3120',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 3 * sc,
              }}>
                <QRCodeSVG
                  value={qrValue || CARD_URL}
                  size={42 * sc}
                  fgColor="#EDE9D5"
                  bgColor="transparent"
                  level="L"
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 5.5 * sc,
                color: '#434734',
                letterSpacing: '0.16em',
                textAlign: 'center',
              }}>SCAN TO DEPLOY</div>
            </div>
          )}
        </div>

        {/* CALLSIGN — dominant visual element */}
        <div style={{ flex: '0 0 auto', paddingLeft: 4 * sc }}>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 7 * sc,
            color: '#50553D',
            letterSpacing: '0.35em',
            marginBottom: 1 * sc,
          }}>// CALLSIGN</div>
          <div style={{
            fontFamily: "'Black Ops One', cursive",
            fontSize: callsignSize * sc,
            color: '#EDE9D5',
            letterSpacing: '0.01em',
            lineHeight: 0.92,
            maxWidth: 500 * sc,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textShadow: `0 2px ${18 * sc}px rgba(232,87,42,0.28), 0 0 ${45 * sc}px rgba(232,87,42,0.10), 0 ${2 * sc}px ${5 * sc}px rgba(0,0,0,0.95)`,
          }}>
            {(callsign || '\u2014').toUpperCase()}
          </div>

          {/* SIGNATURE WEAPON — classification plate */}
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            marginTop: 7 * sc,
            background: '#0d0f09cc',
            border: '1px solid #2E3120',
            borderRadius: 1,
            maxWidth: 320 * sc,
            overflow: 'hidden',
          }}>
            <div style={{
              width: 5 * sc,
              flexShrink: 0,
              background: weaponBarColor,
            }} />
            <div style={{ padding: `${6 * sc}px ${14 * sc}px` }}>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 6.5 * sc,
                color: '#50553D',
                letterSpacing: '0.22em',
                lineHeight: 1,
                marginBottom: 2 * sc,
              }}>SIGNATURE WEAPON</div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 13 * sc,
                letterSpacing: '0.10em',
                lineHeight: 1.2,
                color: displayWeapon === 'CLASSIFIED' ? '#7a8060' : '#EDE9D5',
              }}>
                {displayWeapon}
              </div>
            </div>
          </div>
        </div>

        {/* HERO METRIC — win rate */}
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 6 * sc,
          marginTop: 6 * sc,
          paddingLeft: 4 * sc,
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 9 * sc,
            color: '#50553D',
            letterSpacing: '0.22em',
          }}>WIN RATE</div>
          <div style={{
            fontFamily: "'Black Ops One', cursive",
            fontSize: 50 * sc,
            color: '#E8572A',
            lineHeight: 1,
            letterSpacing: '0.01em',
            textShadow: prestigeMeta
              ? `0 0 ${30 * sc}px ${prestigeMeta.glow}, 0 0 ${60 * sc}px ${prestigeMeta.glow.replace(/[\d.]+\)$/, '0.08)')}, 0 ${2 * sc}px ${6 * sc}px rgba(0,0,0,0.7)`
              : `0 0 ${30 * sc}px rgba(232,87,42,0.30), 0 0 ${60 * sc}px rgba(232,87,42,0.10), 0 ${2 * sc}px ${6 * sc}px rgba(0,0,0,0.7)`,
          }}>
            {winRate}<span style={{
              fontSize: 28 * sc,
              color: '#E8572A77',
              marginLeft: 1,
            }}>%</span>
          </div>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* SUPPORT STATS — five-column row */}
        <div style={{
          borderTop: '1px solid #1E2114',
          paddingTop: 10 * sc,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 0,
          marginBottom: 6 * sc,
        }}>
          {stats.map((stat, i) => (
            <div key={stat.label} style={{
              textAlign: 'center',
              padding: `${6 * sc}px ${2 * sc}px`,
              borderRight: i < 4 ? '1px solid #1e2114' : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                fontFamily: "'Black Ops One', cursive",
                fontSize: 27.5 * sc,
                color: '#EDE9D5',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}>{stat.value}</div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: 7.5 * sc,
                color: '#50553D',
                letterSpacing: '0.14em',
                marginTop: 5 * sc,
              }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* FOOTER */}
        <div style={{
          borderTop: '1px solid #1E2114',
          paddingTop: 6 * sc,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 6.5 * sc,
            color: '#434734',
            letterSpacing: '0.18em',
          }}>WAGER PROTOCOL: {process.env.REACT_APP_WAGERED_ENABLED === 'true' ? 'LIVE' : 'LOCKED'}</div>
          <div style={{
            fontFamily: "'Share Tech Mono', monospace",
            fontSize: 6.5 * sc,
            color: '#434734',
            letterSpacing: '0.12em',
          }}>{matchesPlayed} MATCHES &bull; solshot.gg</div>
        </div>

      </div>
    </>
  );
}

/* ── Main Component ── */

function StatCard({ player, onClose, logoUrl, qrValue, showQr = true, prestigeIcons }) {
  const cardRef = useRef(null);
  const exportRef = useRef(null);
  const wrapRef = useRef(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackOk, setFeedbackOk] = useState(false);
  const [scale, setScale] = useState(1);

  const icons = useMemo(
    () => ({ ...DEFAULT_PRESTIGE_ICONS, ...prestigeIcons }),
    [prestigeIcons]
  );

  const {
    callsign = 'OPERATIVE',
    wins = 0,
    losses = 0,
    totalDamage = 0,
    bestWinStreak = 0,
    matchesPlayed = 0,
    signatureWeapon = null,
    prestigeTier = null,
  } = player || {};

  const kd = useMemo(() => formatKD(wins, losses), [wins, losses]);
  const winRate = useMemo(() => formatWinRate(wins, matchesPlayed), [wins, matchesPlayed]);
  const displayWeapon = useMemo(() => getDisplayWeapon(signatureWeapon), [signatureWeapon]);
  const fmtDmg = useMemo(() => formatDamage(totalDamage), [totalDamage]);
  const prestigeMeta = useMemo(() => getPrestigeMeta(prestigeTier, icons), [prestigeTier, icons]);
  const tierGlow = prestigeMeta?.color || '#E8572A';

  // Callsign font size — scale down for long names
  const callsignSize = useMemo(() => {
    const len = (callsign || '').length;
    if (len <= 6) return 64;
    if (len <= 10) return 54;
    if (len <= 14) return 42;
    return 33;
  }, [callsign]);

  // Scale preview card to fit viewport
  useEffect(() => {
    const updateScale = () => {
      const maxW = window.innerWidth - 40;
      const maxH = window.innerHeight - 160;
      const s = Math.min(1, maxW / CARD_W, maxH / CARD_H);
      setScale(s);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Shared props for card internals
  const cardProps = {
    callsign, wins, losses, totalDamage, bestWinStreak, matchesPlayed,
    displayWeapon, winRate, kd, fmtDmg, prestigeMeta, callsignSize, tierGlow,
    showQr, qrValue,
  };

  const exportCard = useCallback(async () => {
    if (!cardRef.current) return;
    setFeedback('RENDERING...');
    setFeedbackOk(false);
    try {
      // Export from the visible preview card at high DPI for crisp output
      // html2canvas can't reliably render offscreen nodes
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#0d0f09',
        scale: 3,
        width: CARD_W,
        height: CARD_H,
        logging: false,
        useCORS: true,
        ignoreTransform: true,
      });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (navigator.clipboard && window.ClipboardItem) {
        try {
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          setFeedback('COPIED TO CLIPBOARD');
          setFeedbackOk(true);
          return;
        } catch { /* fall through to download */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.download = `solshot-${(callsign || 'unknown').toLowerCase()}-card.png`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      setFeedback('SAVED');
      setFeedbackOk(true);
    } catch (err) {
      setFeedback('EXPORT FAILED');
      setFeedbackOk(false);
      console.error('[StatCard] Export error:', err);
    }
  }, [callsign]);

  const buildShareText = useCallback(() => {
    return `${(callsign || 'UNKNOWN').toUpperCase()} // ${wins}W ${losses}L // SIGNATURE WEAPON: ${displayWeapon}\nsolshot.gg`;
  }, [callsign, wins, losses, displayWeapon]);

  const shareToX = useCallback(() => {
    const text = buildShareText();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }, [buildShareText]);

  return (
    <div style={s.overlay} onClick={onClose}>
      {/* ── Hidden canonical export card (1600x900) ── */}
      <div style={{
        position: 'fixed',
        left: -9999,
        top: -9999,
        width: EXPORT_W,
        height: EXPORT_H,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: -1,
      }}>
        <div
          ref={exportRef}
          style={{
            width: EXPORT_W,
            height: EXPORT_H,
            position: 'relative',
            background: 'linear-gradient(155deg, #1a1d14 0%, #0d0f09 35%, #111410 70%, #0d0f09 100%)',
            border: '1px solid #2e3120',
            overflow: 'hidden',
            borderRadius: 4,
          }}
        >
          <CardInternals {...cardProps} exportMode={true} />
        </div>
      </div>

      {/* ── Visible preview card (720x405 scaled) ── */}
      <div ref={wrapRef} style={{ width: CARD_W * scale, height: CARD_H * scale, flexShrink: 0 }}>
        <div
          ref={cardRef}
          style={{
            width: CARD_W,
            height: CARD_H,
            position: 'relative',
            background: 'linear-gradient(155deg, #1a1d14 0%, #0d0f09 35%, #111410 70%, #0d0f09 100%)',
            border: '1px solid #2e3120',
            boxShadow: '0 0 0 1px #E8572A12, 0 24px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.02)',
            overflow: 'hidden',
            borderRadius: 2,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CardInternals {...cardProps} exportMode={false} />
        </div>
      </div>

      {/* ACTION BUTTONS — outside export bounds */}
      <div style={{ ...s.btnRow, width: CARD_W * scale }}>
        <button style={s.exportBtn} onClick={(e) => { e.stopPropagation(); exportCard(); }}>
          EXPORT CARD
        </button>
        <button style={s.shareBtn} onClick={(e) => { e.stopPropagation(); shareToX(); }}>
          POST TO X
        </button>
      </div>
      <button style={{ ...s.closeBtn, width: CARD_W * scale }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
        CLOSE
      </button>
      <div style={feedbackOk ? s.feedbackOk : s.feedback}>
        {feedback && (feedbackOk ? '\u2713 ' : '') + feedback}
      </div>
    </div>
  );
}

/* ── Styles (overlay + action buttons only — card internals use inline with sc multiplier) ── */
const s = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(10, 12, 8, 0.94)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 9000, gap: 12, padding: 20,
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  },
  btnRow: {
    display: 'flex', gap: 10,
  },
  exportBtn: {
    flex: 1,
    background: 'linear-gradient(180deg, #E8572A, #881a00)',
    border: '2px solid #E8572A',
    borderRadius: 4,
    color: '#EDE9D5',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    letterSpacing: 3,
    padding: 11,
    cursor: 'pointer',
    textTransform: 'uppercase',
    boxShadow: '0 0 16px rgba(232,87,42,0.3)',
  },
  shareBtn: {
    flex: 1,
    background: 'transparent',
    border: '2px solid #E8572A44',
    borderRadius: 4,
    color: '#E8572A',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    letterSpacing: 3,
    padding: 11,
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  closeBtn: {
    background: 'transparent',
    border: '1px solid #2e3120',
    borderRadius: 4,
    color: '#50553D',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: 8,
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  feedback: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: '#50553D',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
  feedbackOk: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: '#4CAF50',
    letterSpacing: '0.2em',
    textAlign: 'center',
    height: 14,
  },
};

export default StatCard;
