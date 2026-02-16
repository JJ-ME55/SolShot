import React, { useState } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import { COSMETIC_ITEMS, TIER_COLORS } from '../data/tiers';

const TABS = ['SOL SHOP', 'SHOT BURNS'];

/* ── styles ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  tabBar: {
    display: 'flex',
    borderBottom: '1px solid var(--ol)',
  },
  tab: (active) => ({
    flex: 1,
    padding: '8px 0',
    fontFamily: "'Black Ops One', cursive",
    fontSize: 9,
    letterSpacing: 2,
    textAlign: 'center',
    cursor: 'pointer',
    color: active ? 'var(--am)' : 'var(--kh)',
    borderBottom: active ? '2px solid var(--am)' : '2px solid transparent',
    background: active ? 'rgba(255, 182, 39, 0.04)' : 'transparent',
    transition: 'all 0.15s ease',
    userSelect: 'none',
  }),

  /* Left: Item list */
  leftPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--ol)',
    overflow: 'hidden',
  },
  itemList: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  itemCard: (tierColor, selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 10px',
    borderRadius: 4,
    cursor: 'pointer',
    borderLeft: `3px solid ${tierColor}`,
    border: selected ? `1px solid ${tierColor}` : '1px solid transparent',
    borderLeftWidth: 3,
    borderLeftColor: tierColor,
    background: selected ? `rgba(255, 255, 255, 0.03)` : 'transparent',
    transition: 'all 0.12s ease',
  }),
  itemIcon: (tierColor) => ({
    width: 26,
    height: 26,
    borderRadius: 3,
    background: `${tierColor}11`,
    border: `1px solid ${tierColor}33`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: tierColor,
    flexShrink: 0,
  }),
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 9,
    color: 'var(--bn)',
    letterSpacing: 1,
  },
  itemType: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: tierColor,
    letterSpacing: 1,
    opacity: 0.8,
  }),
  itemPrice: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--gd)',
    letterSpacing: 1,
    flexShrink: 0,
  },

  /* Right: Detail */
  rightPanel: {
    width: '36%',
    minWidth: 180,
    display: 'flex',
    flexDirection: 'column',
    padding: '14px 16px',
    gap: 10,
  },
  detailName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 14,
    color: 'var(--bn)',
    letterSpacing: 2,
  },
  detailTier: (color) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: color,
    letterSpacing: 2,
  }),
  detailDesc: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--kh)',
    letterSpacing: 1,
    lineHeight: 1.6,
    opacity: 0.8,
  },
  detailType: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 7,
    color: 'var(--st)',
    letterSpacing: 2,
    padding: '3px 8px',
    border: '1px solid var(--sd)',
    borderRadius: 3,
    display: 'inline-block',
  },
  comingSoon: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 10,
    color: 'var(--am)',
    letterSpacing: 3,
    textAlign: 'center',
    padding: '6px 12px',
    border: '1px solid var(--am)',
    borderRadius: 4,
    background: 'rgba(255, 182, 39, 0.04)',
    marginTop: 'auto',
  },
  emptyDetail: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 8,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.4,
  },
};

const ICON_MAP = {
  PATTERN: '#',
  TRAIL: '~',
  BLAST: '*',
  SKIN: '^',
};

function ArmoryScreen({ navigate }) {
  const [activeTab, setActiveTab] = useState(0);
  const [selectedId, setSelectedId] = useState(null);

  // Filter items by tab (SOL vs SHOT)
  const filteredItems = COSMETIC_ITEMS.filter((item) => {
    if (activeTab === 0) return item.price.includes('SOL');
    return item.price.includes('SHOT');
  });

  const selectedItem = COSMETIC_ITEMS.find((i) => i.id === selectedId) || null;
  const tierColor = selectedItem ? (TIER_COLORS[selectedItem.tier] || '#6b7b8d') : '#6b7b8d';

  return (
    <>
      <TopBar title="ARMORY" onBack={() => navigate('menu')} />

      <div style={s.container}>
        {/* Left Panel */}
        <div style={s.leftPanel}>
          <div style={s.tabBar}>
            {TABS.map((tab, i) => (
              <div
                key={tab}
                style={s.tab(activeTab === i)}
                onClick={() => { setActiveTab(i); setSelectedId(null); }}
              >
                {tab}
              </div>
            ))}
          </div>

          <div style={s.itemList}>
            {filteredItems.map((item) => {
              const tc = TIER_COLORS[item.tier] || '#6b7b8d';
              return (
                <div
                  key={item.id}
                  style={s.itemCard(tc, selectedId === item.id)}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div style={s.itemIcon(tc)}>
                    {ICON_MAP[item.type] || '?'}
                  </div>
                  <div style={s.itemInfo}>
                    <div style={s.itemName}>{item.name}</div>
                    <div style={s.itemType(tc)}>{item.tier}</div>
                  </div>
                  <div style={s.itemPrice}>{item.price}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div style={s.rightPanel}>
          {selectedItem ? (
            <>
              <div style={s.detailName}>{selectedItem.name}</div>
              <div style={s.detailTier(tierColor)}>{selectedItem.tier}</div>
              <div style={s.detailType}>{selectedItem.type}</div>
              <div style={s.detailDesc}>{selectedItem.desc}</div>

              <Button
                variant="gold"
                disabled
                style={{ fontSize: 10, padding: '8px 16px', marginTop: 8 }}
              >
                {selectedItem.price}
              </Button>
              <div style={s.comingSoon}>COMING SOON</div>
            </>
          ) : (
            <div style={s.emptyDetail}>SELECT AN ITEM</div>
          )}
        </div>
      </div>
    </>
  );
}

export default ArmoryScreen;
