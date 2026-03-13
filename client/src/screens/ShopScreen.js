import React, { useState, useEffect, useRef, useCallback } from 'react';
import TopBar from '../components/TopBar';
import Button from '../components/Button';
import WeaponCard from '../components/WeaponCard';
import Modal from '../components/Modal';
import useIsMobile from '../hooks/useIsMobile';

import useSocket from '../hooks/useSocket';
import WEAPONS, { getTierColor, getWeaponIconUrl, getWeaponById } from '../data/weapons';
import { PRESTIGE_TIERS } from '../data/tiers';

/* ── prestige weapon metadata (weapon ID → tier info) ── */
const PRESTIGE_WEAPON_META = {};
PRESTIGE_TIERS.forEach((tier) => {
  if (tier.weapons && tier.cost > 0) {
    tier.weapons.forEach((wId) => {
      PRESTIGE_WEAPON_META[wId] = {
        tierName: tier.name,
        burnCost: tier.cost,
        color: tier.color,
        reward: tier.reward,
      };
    });
  }
});

/* ── shared styles (desktop + mobile) ── */
const s = {
  container: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },

  /* Left: Weapon Catalog */
  catalogPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--ol)',
    overflow: 'hidden',
  },
  catalogHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--ol)',
  },
  catalogTitle: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--am)',
    letterSpacing: 2,
  },
  goldChip: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 16,
    color: 'var(--gd)',
    letterSpacing: 1,
    display: 'flex',
    alignItems: 'center',
  },
  catalogList: {
    flex: 1,
    overflowY: 'auto',
    padding: '6px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },

  /* Right: Detail + Status (desktop only) */
  rightPanel: {
    width: '34%',
    minWidth: 180,
    display: 'flex',
    flexDirection: 'column',
    padding: '10px 14px',
    gap: 10,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },

  /* Timer */
  timerBlock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 0',
  },
  timerValue: (urgent) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 36,
    color: urgent ? 'var(--rd)' : 'var(--am)',
    letterSpacing: 4,
    lineHeight: 1,
    transition: 'color 0.3s ease',
    animation: urgent ? 'fl 0.5s ease-in-out infinite' : 'none',
  }),
  timerLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 2,
  },

  /* Detail panel */
  detailBox: {
    flex: 1,
    minHeight: 0,
    background: 'rgba(42, 51, 31, 0.2)',
    border: '1px solid var(--ol)',
    borderRadius: 4,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    overflowY: 'auto',
  },
  detailName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 22,
    color: 'var(--bn)',
    letterSpacing: 2,
  },
  detailTier: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 15,
    color: tierColor,
    letterSpacing: 2,
  }),
  detailDesc: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 1,
    lineHeight: 1.6,
    opacity: 0.8,
  },
  detailStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginTop: 4,
  },
  detailStatRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  detailStatLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 1,
    width: 75,
    opacity: 0.7,
  },
  detailStatBar: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    background: 'rgba(184, 168, 138, 0.15)',
    overflow: 'hidden',
  },
  detailStatFill: (pct, color) => ({
    width: pct + '%',
    height: '100%',
    borderRadius: 3,
    background: color,
    transition: 'width 0.3s ease',
  }),
  detailPrice: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 17,
    color: 'var(--gd)',
    letterSpacing: 1,
    marginTop: 4,
  },
  emptyDetail: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--kh)',
    letterSpacing: 2,
    opacity: 0.4,
  },

  /* Loadout */
  loadoutRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  loadoutChip: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: tierColor,
    letterSpacing: 1,
    padding: '4px 10px',
    borderRadius: 3,
    border: `1px solid ${tierColor}33`,
    background: `rgba(${hexToRgb(tierColor)}, 0.06)`,
  }),
  loadoutLabel: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 15,
    color: 'var(--kh)',
    letterSpacing: 2,
    marginBottom: 4,
  },

  /* Bottom bar */
  bottomBar: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  /* Opponent activity */
  activityLine: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--rg)',
    letterSpacing: 1,
    textAlign: 'center',
    opacity: 0.9,
    animation: 'si 0.4s ease-out both',
  },

  /* Pot display */
  potDisplay: {
    display: 'flex',
    justifyContent: 'center',
    padding: '4px 0',
  },
  potBadge: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 14,
    color: 'var(--sg)',
    letterSpacing: 1,
    padding: '4px 12px',
    borderRadius: 3,
    border: '1px solid rgba(20, 241, 149, 0.2)',
    background: 'rgba(20, 241, 149, 0.04)',
    display: 'flex',
    alignItems: 'center',
  },
};

/* ── mobile-only styles ── */
const mob = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  catalogPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  catalogHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 10px',
    borderBottom: '1px solid var(--ol)',
  },
  catalogList: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '4px 6px',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  /* Persistent bottom bar: timer | loadout | ready */
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 10px',
    gap: 8,
    borderTop: '1px solid var(--ol)',
    background: 'rgba(13, 15, 9, 0.95)',
    flexShrink: 0,
  },
  statusTimer: (urgent) => ({
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 22,
    color: urgent ? 'var(--rd)' : 'var(--am)',
    letterSpacing: 2,
    lineHeight: 1,
    minWidth: 28,
    textAlign: 'center',
    animation: urgent ? 'fl 0.5s ease-in-out infinite' : 'none',
  }),
  statusLoadout: {
    flex: 1,
    display: 'flex',
    flexWrap: 'wrap',
    gap: 3,
    alignItems: 'center',
    overflow: 'hidden',
  },
  statusChip: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    color: tierColor,
    letterSpacing: 1,
    padding: '2px 6px',
    borderRadius: 2,
    border: `1px solid ${tierColor}33`,
    background: `rgba(${hexToRgb(tierColor)}, 0.06)`,
    whiteSpace: 'nowrap',
  }),
  /* Bottom sheet overlay */
  sheetBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 8000,
  },
  sheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 8001,
    background: 'linear-gradient(180deg, #1a1c14 0%, #0d0f09 100%)',
    borderTop: '2px solid var(--ol)',
    borderRadius: '12px 12px 0 0',
    padding: '12px 16px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxHeight: '65vh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    animation: 'sheetUp 0.2s ease-out',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'var(--ol)',
    alignSelf: 'center',
    marginBottom: 4,
    flexShrink: 0,
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetName: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 20,
    color: 'var(--bn)',
    letterSpacing: 2,
  },
  sheetTier: (tierColor) => ({
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: tierColor,
    letterSpacing: 2,
  }),
  sheetDesc: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 12,
    color: 'var(--kh)',
    letterSpacing: 1,
    lineHeight: 1.5,
    opacity: 0.8,
  },
  sheetStats: {
    display: 'flex',
    gap: 12,
  },
  sheetStatRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  sheetStatLabel: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 11,
    color: 'var(--kh)',
    letterSpacing: 1,
    width: 34,
    opacity: 0.7,
  },
  sheetStatBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    background: 'rgba(184, 168, 138, 0.15)',
    overflow: 'hidden',
  },
  sheetPrice: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 15,
    color: 'var(--gd)',
    letterSpacing: 1,
    textAlign: 'center',
  },
  sheetPrestige: {
    textAlign: 'center',
  },
};

/* ── keyframe injection for bottom sheet animation ── */
if (typeof document !== 'undefined' && !document.getElementById('shop-sheet-anim')) {
  const style = document.createElement('style');
  style.id = 'shop-sheet-anim';
  style.textContent = `@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
  document.head.appendChild(style);
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}


function ShopScreen({ navigate, screenData }) {
  const isMobile = useIsMobile();

  // Normalize data — lobby format has {host, player}, between-round has {hostId, player1, player2}
  const hostInfo = screenData?.host || {
    socketId: screenData?.hostId,
    name: screenData?.player1?.name,
    color: screenData?.player1?.color,
  };
  const playerInfo = screenData?.player || {
    socketId: null, // joiner's socketId isn't in battle screenData — server will provide via shopEnd
    name: screenData?.player2?.name,
    color: screenData?.player2?.color,
  };

  /* ── state ── */
  const [weapons, setWeapons] = useState(WEAPONS);
  // Initialize gold from between-round data if available, else default 1000
  const [gold, setGold] = useState(() => {
    if (screenData?.goldBalance && window.socket) {
      const myGold = screenData.goldBalance[window.socket.id];
      if (myGold !== undefined) return myGold;
    }
    return 1000;
  });
  const [inventory, setInventory] = useState([0]); // owned weapon IDs
  const [selectedWeaponId, setSelectedWeaponId] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [isReady, setIsReady] = useState(false);
  const [opponentActivity, setOpponentActivity] = useState(null);
  const [error, setError] = useState(null);
  const [wager] = useState(screenData?.wager || 0);
  const [totalRounds, setTotalRounds] = useState(screenData?.totalRounds || 3);
  const [currentRound, setCurrentRound] = useState(screenData?.round || 1);

  const timerRef = useRef(null);
  const activityTimerRef = useRef(null);

  /* ── socket: shop phase init ── */
  useSocket('shopPhase', (data) => {
    if (data.weapons) setWeapons(data.weapons);

    // Store round info from server
    if (data.totalRounds != null) setTotalRounds(data.totalRounds);
    if (data.round != null) setCurrentRound(data.round);

    // Find our gold balance — check all keys for our socket id
    if (data.goldBalance && window.socket) {
      const myId = window.socket.id;
      const myGold = data.goldBalance[myId];
      if (myGold !== undefined) setGold(myGold);
    }

    // Restore inventory from server (important for between-round shops)
    if (data.inventory && window.socket) {
      const myId = window.socket.id;
      const myInv = data.inventory[myId];
      if (myInv && Array.isArray(myInv)) setInventory(myInv);
    }

    // Timer: server sends `timer` (seconds). Start countdown from that value.
    if (data.timer) {
      setTimeRemaining(data.timer);
    }
  });

  /* ── socket: buy result ── */
  useSocket('buyWeaponResult', (data) => {
    if (data.success) {
      setGold(data.balance);
      if (data.inventory) setInventory(data.inventory);
      // On mobile, close the bottom sheet after successful buy
      if (isMobile) setSelectedWeaponId(null);
    } else {
      setError(data.reason || 'Purchase failed');
    }
  });

  /* ── socket: opponent bought weapon ── */
  useSocket('opponentBoughtWeapon', (data) => {
    setOpponentActivity('OPPONENT ACQUIRED: ' + (data.weaponName || 'UNKNOWN'));
    // Clear activity after 3s
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => setOpponentActivity(null), 3000);
  });

  /* ── socket: shop ends -> navigate to battle ── */
  useSocket('shopEnd', (data) => {
    // Build N-player players[] array from server data.
    // screenData.players comes from startPick (has socketId, name, color for all N players).
    const allPlayers = screenData?.players || [];
    const playersArray = allPlayers.map(p => ({
      socketId: p.socketId,
      name: p.name,
      color: p.color,
      weapons: data.weaponsByPlayer?.[p.socketId] || data.hostWeapons || [],
    }));

    navigate('battle', {
      gameType: 3,
      hostId: hostInfo.socketId,
      // Backward-compat (BattleHUD still reads player1/player2 until Phase 19)
      player1: {
        name: hostInfo.name,
        color: hostInfo.color,
        weapons: data.hostWeapons,
      },
      player2: {
        name: playerInfo.name,
        color: playerInfo.color,
        weapons: data.playerWeapons,
      },
      // N-player canonical
      players: playersArray,
      playerCount: playersArray.length || 2,
      wager: wager,
      goldBalance: data.goldBalance,
      round: currentRound,
      totalRounds: totalRounds,
    });
  });

  /* ── socket: opponent left ── */
  useSocket('opponentLeft', () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setError('Opponent has left the match');
  });

  /* ── countdown timer ── */
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          // Auto-ready when timer expires
          if (!isReady && window.socket) {
            window.socket.emit('shopDone');
            setIsReady(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── cleanup activity timer on unmount ── */
  useEffect(() => {
    return () => {
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    };
  }, []);

  /* ── emit ready on mount (triggers shopPhase from server) ── */
  useEffect(() => {
    if (window.socket) {
      window.socket.emit('ready');
    }
  }, []);

  /* ── actions ── */
  const buyWeapon = useCallback((weaponId) => {
    if (!window.socket || isReady) return;
    window.socket.emit('buyWeapon', { weaponId });
  }, [isReady]);

  const handleReady = useCallback(() => {
    if (!window.socket || isReady) return;
    window.socket.emit('shopDone');
    setIsReady(true);
  }, [isReady]);

  /* ── derived ── */
  const selectedWeapon = selectedWeaponId !== null ? getWeaponById(selectedWeaponId) : null;
  const isOwned = (id) => inventory.includes(id);

  /* ══════════════════════════════════════════════
     MOBILE LAYOUT — bottom sheet
     ══════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <>
        <TopBar title="WEAPON SHOP" />

        <div style={mob.container}>
          {/* ─── Weapon list (full width) ─── */}
          <div style={mob.catalogPanel}>
            <div style={mob.catalogHeader}>
              <span style={{ ...s.catalogTitle, fontSize: 14 }}>ARSENAL</span>
              <span style={{ ...s.goldChip, fontSize: 13 }}>
                <img src="/assets/images/currency/icon-gold.png" alt="" style={{ width: 11, height: 11, verticalAlign: 'middle', marginRight: 3 }} />
                {gold + ' GOLD'}
              </span>
            </div>

            <div style={mob.catalogList}>
              {weapons.map((w) => {
                const meta = getWeaponById(w.id) || w;
                return (
                  <WeaponCard
                    key={w.id}
                    weapon={meta}
                    selected={selectedWeaponId === w.id}
                    owned={isOwned(w.id)}
                    iconUrl={getWeaponIconUrl(meta.name)}
                    onClick={() => setSelectedWeaponId(w.id)}
                  />
                );
              })}
            </div>
          </div>

          {/* ─── Opponent activity toast ─── */}
          {opponentActivity && (
            <div style={{ ...s.activityLine, padding: '3px 0' }}>{opponentActivity}</div>
          )}

          {/* ─── Persistent bottom bar: timer | loadout chips | ready ─── */}
          <div style={mob.statusBar}>
            <span style={mob.statusTimer(timeRemaining <= 5)}>
              {String(timeRemaining).padStart(2, '0')}
            </span>

            <div style={mob.statusLoadout}>
              {inventory.map((id) => {
                const w = getWeaponById(id);
                if (!w) return null;
                return (
                  <span key={id} style={mob.statusChip(getTierColor(w.tier))}>
                    {w.name}
                  </span>
                );
              })}
            </div>

            <Button
              variant={isReady ? 'disabled' : 'primary'}
              onClick={handleReady}
              disabled={isReady}
              style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
            >
              {isReady ? 'WAITING...' : 'READY'}
            </Button>
          </div>
        </div>

        {/* ─── Bottom sheet: weapon detail + buy ─── */}
        {selectedWeapon && (
          <>
            <div style={mob.sheetBackdrop} onClick={() => setSelectedWeaponId(null)} />
            <div style={mob.sheet}>
              <div style={mob.sheetHandle} />

              {/* Header: name + tier + price */}
              <div style={mob.sheetHeader}>
                <div>
                  <div style={mob.sheetName}>{selectedWeapon.name}</div>
                  <div style={mob.sheetTier(getTierColor(selectedWeapon.tier))}>
                    {selectedWeapon.tier}
                  </div>
                </div>
                <div style={{ ...mob.sheetPrice, fontSize: 17 }}>
                  {isOwned(selectedWeapon.id)
                    ? 'EQUIPPED'
                    : selectedWeapon.goldCost === 0
                      ? 'FREE'
                      : selectedWeapon.goldCost + 'G'
                  }
                </div>
              </div>

              {/* Description */}
              {selectedWeapon.desc && (
                <div style={mob.sheetDesc}>{selectedWeapon.desc}</div>
              )}

              {/* Stat bars — side by side */}
              <div style={mob.sheetStats}>
                <div style={mob.sheetStatRow}>
                  <span style={mob.sheetStatLabel}>DMG</span>
                  <div style={mob.sheetStatBar}>
                    <div style={s.detailStatFill(
                      Math.min(100, (selectedWeapon.damageFactor / 3.75) * 100),
                      getTierColor(selectedWeapon.tier)
                    )} />
                  </div>
                </div>
                <div style={mob.sheetStatRow}>
                  <span style={mob.sheetStatLabel}>BLR</span>
                  <div style={mob.sheetStatBar}>
                    <div style={s.detailStatFill(
                      Math.min(100, (selectedWeapon.blastRadius / 90) * 100),
                      getTierColor(selectedWeapon.tier)
                    )} />
                  </div>
                </div>
              </div>

              {/* Prestige info */}
              {(() => {
                const prestigeMeta = PRESTIGE_WEAPON_META[selectedWeapon.id];
                if (!prestigeMeta) return null;
                return (
                  <div style={mob.sheetPrestige}>
                    <span style={{
                      fontFamily: "'Black Ops One', cursive",
                      fontSize: 11,
                      color: prestigeMeta.color,
                      letterSpacing: 2,
                    }}>
                      {prestigeMeta.tierName.toUpperCase() + ' PRESTIGE'}
                    </span>
                    <span style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 10,
                      color: 'var(--sp)',
                      letterSpacing: 1,
                      marginLeft: 8,
                    }}>
                      {'REQUIRES ??? SHOT BURN'}
                    </span>
                  </div>
                );
              })()}

              {/* Buy button — full width, big tap target */}
              {!isOwned(selectedWeapon.id) && selectedWeapon.goldCost > 0 && (
                <Button
                  variant="gold"
                  onClick={() => buyWeapon(selectedWeapon.id)}
                  disabled={isReady || gold < selectedWeapon.goldCost}
                  style={{ fontSize: 14, padding: '10px 0', width: '100%' }}
                >
                  {'BUY — ' + selectedWeapon.goldCost + 'G'}
                </Button>
              )}

              {isOwned(selectedWeapon.id) && (
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: 12,
                  color: 'var(--sg)',
                  letterSpacing: 2,
                  textAlign: 'center',
                  padding: '6px 0',
                }}>
                  IN YOUR LOADOUT
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ ERROR MODAL ═══ */}
        {error && (
          <Modal
            title="ERROR"
            message={error}
            buttons={[
              {
                label: error === 'Opponent has left the match' ? 'RETURN TO LOBBY' : 'DISMISS',
                variant: 'secondary',
                onClick: () => {
                  if (error === 'Opponent has left the match') {
                    navigate('lobby');
                  } else {
                    setError(null);
                  }
                },
              },
            ]}
            onClose={() => {
              if (error === 'Opponent has left the match') {
                navigate('lobby');
              } else {
                setError(null);
              }
            }}
          />
        )}
      </>
    );
  }

  /* ══════════════════════════════════════════════
     DESKTOP LAYOUT — original two-panel
     ══════════════════════════════════════════════ */
  return (
    <>
      <TopBar title="WEAPON SHOP" />

      <div style={s.container}>
        {/* ═══ LEFT: WEAPON CATALOG ═══ */}
        <div style={s.catalogPanel}>
          <div style={s.catalogHeader}>
            <span style={s.catalogTitle}>ARSENAL</span>
            <span style={s.goldChip}><img src="/assets/images/currency/icon-gold.png" alt="" style={{ width: 12, height: 12, verticalAlign: 'middle', marginRight: 4 }} />{gold + ' GOLD'}</span>
          </div>

          <div style={s.catalogList}>
            {weapons.map((w) => {
              // Use local WEAPONS metadata for display, server weapons for availability
              const meta = getWeaponById(w.id) || w;
              return (
                <WeaponCard
                  key={w.id}
                  weapon={meta}
                  selected={selectedWeaponId === w.id}
                  owned={isOwned(w.id)}
                  iconUrl={getWeaponIconUrl(meta.name)}
                  onClick={() => setSelectedWeaponId(w.id)}
                />
              );
            })}
          </div>
        </div>

        {/* ═══ RIGHT: DETAIL + STATUS ═══ */}
        <div style={s.rightPanel}>
          {/* Timer */}
          <div>
            <div style={s.timerBlock}>
              <span style={s.timerValue(timeRemaining <= 5)}>
                {String(timeRemaining).padStart(2, '0')}
              </span>
            </div>
            <div style={s.timerLabel}>SECONDS REMAINING</div>
          </div>

          {/* Pot Display (if wagered) */}
          {wager > 0 && (
            <div style={s.potDisplay}>
              <span style={s.potBadge}><img src="/assets/images/currency/icon-sol.png" alt="" style={{ width: 12, height: 12, verticalAlign: 'middle', marginRight: 4 }} />{'POT: ' + (wager * 2) + ' SOL'}</span>
            </div>
          )}

          {/* Weapon Detail */}
          {selectedWeapon ? (
            <div style={s.detailBox}>
              <div style={s.detailName}>{selectedWeapon.name}</div>
              <div style={s.detailTier(getTierColor(selectedWeapon.tier))}>
                {selectedWeapon.tier}
              </div>
              <div style={s.detailDesc}>{selectedWeapon.desc}</div>

              <div style={s.detailStats}>
                <div style={s.detailStatRow}>
                  <span style={s.detailStatLabel}>DAMAGE</span>
                  <div style={s.detailStatBar}>
                    <div style={s.detailStatFill(
                      Math.min(100, (selectedWeapon.damageFactor / 3.75) * 100),
                      getTierColor(selectedWeapon.tier)
                    )} />
                  </div>
                </div>
                <div style={s.detailStatRow}>
                  <span style={s.detailStatLabel}>BLAST</span>
                  <div style={s.detailStatBar}>
                    <div style={s.detailStatFill(
                      Math.min(100, (selectedWeapon.blastRadius / 90) * 100),
                      getTierColor(selectedWeapon.tier)
                    )} />
                  </div>
                </div>
              </div>

              <div style={s.detailPrice}>
                {isOwned(selectedWeapon.id)
                  ? 'EQUIPPED'
                  : selectedWeapon.goldCost === 0
                    ? 'FREE'
                    : selectedWeapon.goldCost + ' GOLD'
                }
              </div>

              {!isOwned(selectedWeapon.id) && selectedWeapon.goldCost > 0 && (
                <Button
                  variant="gold"
                  onClick={() => buyWeapon(selectedWeapon.id)}
                  disabled={isReady || gold < selectedWeapon.goldCost}
                  style={{ fontSize: 13, padding: '8px 18px', marginTop: 4 }}
                >
                  {'BUY - ' + selectedWeapon.goldCost + 'G'}
                </Button>
              )}

              {/* Prestige weapon — tier name, burn cost, and SHOT purchase */}
              {selectedWeapon && (() => {
                const prestigeMeta = PRESTIGE_WEAPON_META[selectedWeapon.id];
                if (!prestigeMeta) return null;
                return (
                  <div style={{ marginTop: 8, textAlign: 'center' }}>
                    <div style={{
                      fontFamily: "'Black Ops One', cursive",
                      fontSize: 12,
                      color: prestigeMeta.color,
                      letterSpacing: 2,
                      marginBottom: 4,
                    }}>
                      {prestigeMeta.tierName.toUpperCase() + ' PRESTIGE'}
                    </div>
                    <div style={{
                      fontFamily: "'Share Tech Mono', monospace",
                      fontSize: 11,
                      color: 'var(--sp)',
                      letterSpacing: 1,
                      marginBottom: 6,
                    }}>
                      {'REQUIRES ??? SHOT BURN'}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={s.detailBox}>
              <div style={s.emptyDetail}>SELECT A WEAPON</div>
            </div>
          )}

          {/* Loadout */}
          <div>
            <div style={s.loadoutLabel}>LOADOUT</div>
            <div style={s.loadoutRow}>
              {inventory.map((id) => {
                const w = getWeaponById(id);
                if (!w) return null;
                return (
                  <span key={id} style={s.loadoutChip(getTierColor(w.tier))}>
                    {w.name}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Opponent Activity */}
          {opponentActivity && (
            <div style={s.activityLine}>{opponentActivity}</div>
          )}

          {/* Ready Button */}
          <div style={s.bottomBar}>
            <Button
              variant={isReady ? 'disabled' : 'primary'}
              onClick={handleReady}
              disabled={isReady}
              style={{ fontSize: 15, padding: '12px 24px', width: '100%' }}
            >
              {isReady ? 'STANDING BY...' : 'READY'}
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ ERROR MODAL ═══ */}
      {error && (
        <Modal
          title="ERROR"
          message={error}
          buttons={[
            {
              label: error === 'Opponent has left the match' ? 'RETURN TO LOBBY' : 'DISMISS',
              variant: 'secondary',
              onClick: () => {
                if (error === 'Opponent has left the match') {
                  navigate('lobby');
                } else {
                  setError(null);
                }
              },
            },
          ]}
          onClose={() => {
            if (error === 'Opponent has left the match') {
              navigate('lobby');
            } else {
              setError(null);
            }
          }}
        />
      )}
    </>
  );
}

export default ShopScreen;
