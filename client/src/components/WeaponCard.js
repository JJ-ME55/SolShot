import React, { useState } from 'react';
import { getTierColor } from '../data/weapons';

const s = {
  card: (tierColor, selected, hovered) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    borderTop: selected ? `1px solid ${tierColor}` : hovered ? '1px solid var(--ol)' : '1px solid transparent',
    borderRight: selected ? `1px solid ${tierColor}` : hovered ? '1px solid var(--ol)' : '1px solid transparent',
    borderBottom: selected ? `1px solid ${tierColor}` : hovered ? '1px solid var(--ol)' : '1px solid transparent',
    borderLeft: `3px solid ${tierColor}`,
    background: selected
      ? `rgba(${hexToRgb(tierColor)}, 0.06)`
      : hovered
        ? 'rgba(42, 51, 31, 0.3)'
        : 'transparent',
    transition: 'all 0.12s ease',
    boxShadow: selected ? `0 0 8px rgba(${hexToRgb(tierColor)}, 0.15)` : 'none',
  }),
  iconBox: (tierColor) => ({
    width: 40,
    height: 40,
    borderRadius: 3,
    background: 'rgba(10, 12, 8, 0.6)',
    border: `1px solid ${tierColor}33`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  }),
  iconImg: {
    width: 32,
    height: 32,
    objectFit: 'contain',
    imageRendering: 'pixelated',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  name: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tierLabel: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: tierColor,
    letterSpacing: 1,
    opacity: 0.8,
    flexShrink: 0,
  }),
  statRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  statBar: (width, color) => ({
    width: 60,
    height: 6,
    borderRadius: 3,
    background: 'rgba(184, 168, 138, 0.15)',
    position: 'relative',
    overflow: 'hidden',
  }),
  statFill: (width, color) => ({
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: width + '%',
    borderRadius: 2,
    background: color,
    transition: 'width 0.3s ease',
  }),
  statLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    opacity: 0.6,
    width: 32,
  },
  priceArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
    flexShrink: 0,
  },
  price: (isFree) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    letterSpacing: 1,
    color: isFree ? 'var(--kh)' : 'var(--gd)',
  }),
  owned: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--sg)',
    letterSpacing: 1,
  },
};

/* Convert hex to r,g,b string */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function WeaponCard({ weapon, selected, owned, iconUrl, onClick }) {
  const [hovered, setHovered] = useState(false);
  const tierColor = getTierColor(weapon.tier);

  // Normalize stats for bar display
  const dmgPct = Math.min(100, (weapon.damageFactor / 3.75) * 100);
  const blastPct = Math.min(100, (weapon.blastRadius / 90) * 100);

  return (
    <div
      style={s.card(tierColor, selected, hovered)}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
    >
      {/* Icon */}
      <div style={s.iconBox(tierColor)}>
        {iconUrl ? (
          <img src={iconUrl} alt={weapon.name} style={s.iconImg} onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <span style={{ fontSize: 12, color: tierColor }}>*</span>
        )}
      </div>

      {/* Info */}
      <div style={s.info}>
        <div style={s.nameRow}>
          <span style={s.name}>{weapon.name}</span>
          <span style={s.tierLabel(tierColor)}>{weapon.tier}</span>
        </div>
        <div style={s.statRow}>
          <span style={s.statLabel}>DMG</span>
          <div style={s.statBar(dmgPct, tierColor)}>
            <div style={s.statFill(dmgPct, tierColor)} />
          </div>
          <span style={s.statLabel}>BLR</span>
          <div style={s.statBar(blastPct, tierColor)}>
            <div style={s.statFill(blastPct, tierColor)} />
          </div>
        </div>
      </div>

      {/* Price / Status */}
      <div style={s.priceArea}>
        {owned ? (
          <span style={s.owned}>OWNED</span>
        ) : (
          <span style={s.price(weapon.goldCost === 0)}>
            {weapon.goldCost === 0 ? 'FREE' : weapon.goldCost + 'G'}
          </span>
        )}
      </div>
    </div>
  );
}

export default WeaponCard;
