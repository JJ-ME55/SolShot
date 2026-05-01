import React from 'react';
import TopBar from '../components/TopBar';
import WEAPONS, { getTierColor } from '../data/weapons';

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 30px 40px',
  },
  content: {
    maxWidth: 800,
    margin: '0 auto',
  },
  sectionTitle: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--rg)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 12,
    borderBottom: '1px solid var(--ol)',
    paddingBottom: 6,
  },
  para: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--bn)',
    lineHeight: 1.7,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  controlGrid: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '6px 16px',
    marginBottom: 16,
  },
  controlKey: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 13,
    color: 'var(--am)',
    letterSpacing: 1,
    padding: '4px 10px',
    background: 'rgba(42, 51, 31, 0.5)',
    border: '1px solid var(--ol)',
    clipPath: 'var(--clip-6)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  controlDesc: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--kh)',
    letterSpacing: 1,
    display: 'flex',
    alignItems: 'center',
  },
  // Weapons table
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: 8,
  },
  th: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 12,
    color: 'var(--am)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '2px solid var(--ol)',
    whiteSpace: 'nowrap',
  },
  td: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--bn)',
    letterSpacing: 0.5,
    padding: '7px 10px',
    borderBottom: '1px solid rgba(61, 74, 47, 0.4)',
    verticalAlign: 'middle',
  },
  tierBadge: (color) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 1,
    color: color,
    border: `1px solid ${color}44`,
    borderRadius: 2,
    padding: '2px 6px',
    whiteSpace: 'nowrap',
  }),
  weaponDesc: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 0.5,
    opacity: 0.7,
  },
  tip: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--bn)',
    letterSpacing: 0.5,
    lineHeight: 1.6,
    padding: '6px 0 6px 16px',
    borderLeft: '2px solid var(--rg)',
    marginBottom: 8,
  },
};

const CONTROLS = [
  ['Q / E  or  LEFT / RIGHT', 'Adjust aim angle'],
  ['W / S  or  UP / DOWN', 'Adjust shot power'],
  ['A / D', 'Move tank (4 steps per turn)'],
  ['SPACE', 'Fire weapon'],
  ['1-9', 'Select weapon slot'],
  ['SHIFT + key', 'Adjust angle/power by 5'],
  ['ESC', 'Forfeit / exit menu'],
];

function HowToPlayScreen({ navigate }) {
  return (
    <>
      <TopBar title="HOW TO PLAY" onBack={() => navigate('menu')} />

      <div style={s.page}>
        <div style={s.content}>
          {/* Overview */}
          <div style={s.sectionTitle}>WHAT IS SOLSHOT?</div>
          <div style={s.para}>
            SolShot is a skill-based artillery combat game. Two players take turns
            aiming and firing weapons at each other across destructible terrain.
            Reduce your opponent's HP to zero to win the round.
          </div>

          {/* How a match works */}
          <div style={s.sectionTitle}>HOW A MATCH WORKS</div>
          <div style={s.para}>
            1. Pick your loadout in the weapon shop using gold earned each round.
          </div>
          <div style={s.para}>
            2. Take turns adjusting your angle and power, then fire.
          </div>
          <div style={s.para}>
            3. Weapons destroy terrain and deal damage on impact. Some weapons
            drill, bounce, home in, or rain from above.
          </div>
          <div style={s.para}>
            4. The player who eliminates their opponent wins the round.
            Win the match to claim victory.
          </div>

          {/* Controls */}
          <div style={s.sectionTitle}>CONTROLS</div>
          <div style={s.controlGrid}>
            {CONTROLS.map(([key, desc]) => (
              <React.Fragment key={key}>
                <div style={s.controlKey}>{key}</div>
                <div style={s.controlDesc}>{desc}</div>
              </React.Fragment>
            ))}
          </div>

          {/* Weapons Table */}
          <div style={s.sectionTitle}>ARSENAL</div>
          <div style={s.para}>
            Every match starts with Single Shot (free, unlimited ammo).
            Buy additional weapons each round with gold earned from dealing damage and winning rounds.
          </div>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>WEAPON</th>
                <th style={s.th}>TIER</th>
                <th style={s.th}>COST</th>
                <th style={s.th}>BLAST</th>
                <th style={s.th}>DMG</th>
                <th style={s.th}>TYPE</th>
              </tr>
            </thead>
            <tbody>
              {WEAPONS.map((w) => (
                <tr key={w.id}>
                  <td style={s.td}>
                    <div>{w.name}</div>
                    <div style={s.weaponDesc}>{w.desc}</div>
                  </td>
                  <td style={s.td}>
                    <span style={s.tierBadge(getTierColor(w.tier))}>{w.tier}</span>
                  </td>
                  <td style={s.td}>{w.goldCost === 0 ? 'FREE' : w.goldCost + 'G'}</td>
                  <td style={s.td}>{w.blastRadius || '--'}</td>
                  <td style={s.td}>{w.damageFactor > 0 ? 'x' + w.damageFactor : '--'}</td>
                  <td style={s.td}>{w.type}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Tips */}
          <div style={s.sectionTitle}>TIPS</div>
          <div style={s.tip}>
            High ground is king. Use terrain weapons like Dirt Ball and Magic Wall
            to build cover or elevate your position.
          </div>
          <div style={s.tip}>
            The Sniper Rifle deals 100 damage on a direct hit but has a 1px blast radius.
            High risk, high reward.
          </div>
          <div style={s.tip}>
            Heatseeker is forgiving for beginners — it homes toward the opponent.
            But experienced players can dodge with terrain.
          </div>
          <div style={s.tip}>
            Wind affects every shot. Check the wind indicator before firing
            and compensate your aim accordingly.
          </div>
          <div style={s.tip}>
            Drill weapons (Pile Driver, Jackhammer) are devastating when your opponent
            is below you. They punch straight through terrain.
          </div>
        </div>
      </div>
    </>
  );
}

export default HowToPlayScreen;
