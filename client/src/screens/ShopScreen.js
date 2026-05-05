import React, { useState, useEffect, useRef, useCallback } from 'react';
import Modal from '../components/Modal';
import useIsMobile from '../hooks/useIsMobile';
import useSocket from '../hooks/useSocket';
import WEAPONS, { getTierColor, getWeaponIconUrl, getWeaponById } from '../data/weapons';
import { PRESTIGE_TIERS } from '../data/tiers';

const PRESTIGE_WEAPON_META = {};
PRESTIGE_TIERS.forEach((tier) => {
  if (tier.weapons && tier.cost > 0) {
    tier.weapons.forEach((wId) => {
      PRESTIGE_WEAPON_META[wId] = { tierName: tier.name, burnCost: tier.cost, color: tier.color, reward: tier.reward };
    });
  }
});

if (typeof document !== 'undefined' && !document.getElementById('shop-sheet-anim')) {
  const style = document.createElement('style');
  style.id = 'shop-sheet-anim';
  style.textContent = `@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`;
  document.head.appendChild(style);
}

/* 5-pip stat indicator — matches design reference */
function StatPips({ value, max, color }) {
  const filled = Math.ceil((value / max) * 5);
  return (
    <div style={{ display: 'inline-flex', gap: 2, verticalAlign: 'middle' }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          width: 8, height: 4,
          background: i < filled ? color : 'var(--border)',
        }} />
      ))}
    </div>
  );
}

function WeaponRow({ weapon, selected, owned, iconUrl, onClick }) {
  const tierColor = getTierColor(weapon.tier);
  const dmgVal = Math.min(100, (weapon.damageFactor / 3.75) * 100);
  const blastVal = Math.min(100, (weapon.blastRadius / 90) * 100);

  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center',
      padding: '10px 14px',
      background: selected ? 'var(--bg-raised)' : 'transparent',
      borderLeft: '2px solid ' + (selected ? tierColor : 'transparent'),
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer',
    }}>
      {/* Icon */}
      <div style={{
        width: 36, height: 36,
        background: 'var(--bg-deep)', border: '1px solid var(--border)',
        clipPath: 'var(--clip-6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {iconUrl ? (
          <img src={iconUrl} alt={weapon.name}
            style={{ width: 28, height: 28, objectFit: 'contain', imageRendering: 'pixelated' }}
            onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <span style={{ fontSize: 14, color: tierColor }}>✱</span>
        )}
      </div>

      {/* Name + stats */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--f-sec)', fontSize: 14, color: 'var(--bone)', letterSpacing: '0.04em' }}>{weapon.name}</span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: tierColor, letterSpacing: '0.22em' }}>{weapon.tier}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: '0.2em' }}>DMG</span>
          <StatPips value={dmgVal} max={100} color={tierColor} />
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: '0.2em', marginLeft: 4 }}>BLR</span>
          <StatPips value={blastVal} max={100} color={tierColor} />
        </div>
      </div>

      {/* Cost */}
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '0.15em',
        color: owned ? '#7fd060' : weapon.goldCost === 0 ? 'var(--olive)' : tierColor,
        minWidth: 60, textAlign: 'right',
      }}>
        {owned ? 'OWNED' : weapon.goldCost === 0 ? 'FREE' : weapon.goldCost + 'G'}
      </div>
    </div>
  );
}

function ShopScreen({ navigate, screenData }) {
  const isMobile = useIsMobile();

  // ─── Group-chat mode ──────────────────────────────────────────────────
  // When invoked from GroupMatchScreen for an active group-chat match,
  // we run a stripped-down async flow: no countdown, no opponent activity,
  // no 'ready' lobby coordination. Initial state is read from the match
  // doc, purchases use the `purchaseGroupWeapon` server handler, and
  // lock-in emits `groupShopComplete` then calls back to the parent.
  // See server/socket-io/groupchat.js + lifecycle.startMatch initialization.
  const isGroupChat = screenData?.gameMode === 'group-chat';
  const groupMatchId = screenData?.groupMatchId || screenData?.match?.matchId;
  const myTgId = screenData?.myTgId;

  const hostInfo = screenData?.host || {
    socketId: screenData?.hostId,
    name: screenData?.player1?.name,
    color: screenData?.player1?.color,
  };
  const playerInfo = screenData?.player || {
    socketId: null,
    name: screenData?.player2?.name,
    color: screenData?.player2?.color,
  };

  // For group-chat, pull initial gold/inventory from the match doc.
  const myGroupPlayer = isGroupChat
    ? screenData?.match?.players?.find(p => p.telegramUserId === myTgId)
    : null;

  const [weapons, setWeapons] = useState(WEAPONS);
  const [gold, setGold] = useState(() => {
    if (isGroupChat) return myGroupPlayer?.gold ?? 1000;
    if (screenData?.goldBalance && window.socket) {
      const myGold = screenData.goldBalance[window.socket.id];
      if (myGold !== undefined) return myGold;
    }
    return 1000;
  });
  const [inventory, setInventory] = useState(() => {
    if (isGroupChat && myGroupPlayer?.weapons?.length) return [...myGroupPlayer.weapons];
    return [0];
  });
  const [selectedWeaponId, setSelectedWeaponId] = useState(null);
  // Group-chat shop has no timer pressure — it's an async multi-day match.
  const [timeRemaining, setTimeRemaining] = useState(isGroupChat ? null : 30);
  const [isReady, setIsReady] = useState(false);
  const [opponentActivity, setOpponentActivity] = useState(null);
  const [error, setError] = useState(null);
  const [wager] = useState(screenData?.wager || 0);
  const [totalRounds, setTotalRounds] = useState(screenData?.totalRounds || 3);
  const [currentRound, setCurrentRound] = useState(screenData?.round || 1);

  const timerRef = useRef(null);
  const activityTimerRef = useRef(null);

  useSocket('shopPhase', (data) => {
    if (isGroupChat) return; // group-chat doesn't push shopPhase
    if (data.weapons) setWeapons(data.weapons);
    if (data.totalRounds != null) setTotalRounds(data.totalRounds);
    if (data.round != null) setCurrentRound(data.round);
    if (data.goldBalance && window.socket) {
      const myGold = data.goldBalance[window.socket.id];
      if (myGold !== undefined) setGold(myGold);
    }
    if (data.inventory && window.socket) {
      const myInv = data.inventory[window.socket.id];
      if (myInv && Array.isArray(myInv)) setInventory(myInv);
    }
    if (data.timer) setTimeRemaining(data.timer);
  });

  useSocket('buyWeaponResult', (data) => {
    if (isGroupChat) return;
    if (data.success) {
      setGold(data.balance);
      if (data.inventory) setInventory(data.inventory);
      if (isMobile) setSelectedWeaponId(null);
    } else {
      setError(data.reason || 'Purchase failed');
    }
  });

  // Pending optimistic purchases — keyed by weaponId. Each entry stores
  // the rollback values (gold + inventory) so a server rejection can
  // restore the pre-click state. Most purchases will server-confirm
  // before the player notices, so the rollback path is rare.
  const pendingPurchasesRef = useRef({});

  // Group-chat purchase result — same shape semantics, sibling event.
  // The client already optimistically deducted gold + appended weapon
  // when buyWeapon was called below. On success we just sync to the
  // server's authoritative balance (may be off by 1 if there's a
  // rounding race). On failure we roll back to the pre-click snapshot.
  useSocket('purchaseGroupWeaponResult', (data) => {
    if (!isGroupChat) return;
    if (data.success) {
      // Reconcile against server-authoritative values
      setGold(data.balance);
      if (data.inventory) setInventory(data.inventory);
      delete pendingPurchasesRef.current[data.weaponId];
    } else {
      // Roll back the optimistic update for this weapon (if any)
      const pending = pendingPurchasesRef.current[data.weaponId];
      if (pending) {
        setGold(pending.gold);
        setInventory(pending.inventory);
        delete pendingPurchasesRef.current[data.weaponId];
      }
      const reasonMap = {
        insufficient_gold: 'Not enough gold.',
        already_owned: 'Already in your loadout.',
        unknown_weapon: 'Unknown weapon.',
        match_not_active: 'Match is no longer active.',
        not_a_player: 'You\'re not a player in this match.',
        no_identity: 'No Telegram identity. Reopen via the bot link.',
      };
      setError(reasonMap[data.reason] || data.reason || 'Purchase failed');
    }
  });

  // Group-chat lock-in ack — fired after server flips player.shopComplete=true.
  // Optimistic flow: ShopScreen already exited to the battle UI when the
  // user pressed READY (see handleReady). This handler is now a no-op
  // confirmation; if it never arrives, the server-side shopComplete flag
  // didn't flip and the player will be routed back to the shop on their
  // next refresh. Still call onShopComplete defensively for the case
  // where the optimistic exit didn't happen (no `onShopComplete` prop).
  useSocket('groupShopCompleteAck', () => {
    if (!isGroupChat) return;
    setIsReady(true);
  });

  useSocket('opponentBoughtWeapon', (data) => {
    if (isGroupChat) return;
    setOpponentActivity('OPPONENT ACQUIRED: ' + (data.weaponName || 'UNKNOWN'));
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => setOpponentActivity(null), 3000);
  });

  useSocket('shopEnd', (data) => {
    if (isGroupChat) return; // group-chat uses groupShopCompleteAck instead
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
      player1: { name: hostInfo.name, color: hostInfo.color, weapons: data.hostWeapons },
      player2: { name: playerInfo.name, color: playerInfo.color, weapons: data.playerWeapons },
      players: playersArray,
      playerCount: playersArray.length || 2,
      wager,
      goldBalance: data.goldBalance,
      round: currentRound,
      totalRounds,
      isAIMatch: screenData?.isAIMatch || false,
    });
  });

  useSocket('opponentLeft', () => {
    if (isGroupChat) return; // not applicable in async multi-day matches
    if (timerRef.current) clearInterval(timerRef.current);
    setError('Opponent has left the match');
  });

  useEffect(() => {
    if (isGroupChat) return; // no auto-ready countdown in group-chat
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (!isReady && window.socket) {
            window.socket.emit('shopDone');
            setIsReady(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isGroupChat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (activityTimerRef.current) clearTimeout(activityTimerRef.current); }, []);
  useEffect(() => {
    if (isGroupChat) return; // 'ready' is 1v1 lobby coordination
    if (window.socket) window.socket.emit('ready');
  }, [isGroupChat]);

  const buyWeapon = useCallback((weaponId) => {
    if (!window.socket || isReady) return;
    if (isGroupChat) {
      // OPTIMISTIC: deduct gold + append weapon immediately so the UI
      // responds the instant the player taps. Server reconciles via
      // purchaseGroupWeaponResult; on rejection we roll back to the
      // snapshot stored in pendingPurchasesRef.
      const meta = getWeaponById(weaponId);
      const cost = meta?.goldCost ?? 0;
      // Don't optimistically apply if we'd go negative (client-side guard
      // mirrors the server's insufficient_gold check)
      if (gold < cost) return;
      // Don't optimistically apply if already owned (server would reject)
      if (inventory.includes(weaponId)) return;
      pendingPurchasesRef.current[weaponId] = { gold, inventory: [...inventory] };
      setGold(gold - cost);
      setInventory([...inventory, weaponId]);
      if (isMobile) setSelectedWeaponId(null);
      window.socket.emit('purchaseGroupWeapon', { matchId: groupMatchId, weaponId });
      return;
    }
    window.socket.emit('buyWeapon', { weaponId });
  }, [isReady, isGroupChat, groupMatchId, gold, inventory, isMobile]);

  const handleReady = useCallback(() => {
    if (!window.socket || isReady) return;
    if (isGroupChat) {
      // OPTIMISTIC: flip ready + exit to battle immediately, don't wait
      // for the server ack. Server side groupShopComplete is idempotent
      // (just sets shopComplete=true). If it fails, the player gets
      // routed back to the shop on their next refresh — recoverable.
      setIsReady(true);
      window.socket.emit('groupShopComplete', { matchId: groupMatchId });
      if (typeof screenData?.onShopComplete === 'function') {
        screenData.onShopComplete({ inventory, gold });
      }
      return;
    }
    window.socket.emit('shopDone');
    setIsReady(true);
  }, [isReady, isGroupChat, groupMatchId, inventory, gold, screenData]);

  const selectedWeapon = selectedWeaponId !== null ? getWeaponById(selectedWeaponId) : null;
  const isOwned = (id) => inventory.includes(id);

  const ErrorModal = error && (
    <Modal
      title="ERROR"
      message={error}
      buttons={[{
        label: error === 'Opponent has left the match' ? 'RETURN TO LOBBY' : 'DISMISS',
        variant: 'secondary',
        onClick: () => {
          if (error === 'Opponent has left the match') navigate('lobby');
          else setError(null);
        },
      }]}
      onClose={() => {
        if (error === 'Opponent has left the match') navigate('lobby');
        else setError(null);
      }}
    />
  );

  /* ══ MOBILE ══ */
  if (isMobile) {
    return (
      // height: '100%' fits whatever the Layout container is (90dvh
      // bordered desktop frame OR 100dvh full mobile viewport). Using
      // '100dvh' here forced the screen to be taller than the desktop
      // frame, clipping the bottom 10% — which is exactly where the
      // pinned READY button lives.
      <div style={{ position: 'relative', height: '100%', background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--bone)', letterSpacing: '0.18em' }}>ARSENAL</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--accent)', letterSpacing: '0.15em' }}>
            ◆ {gold} GOLD
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {weapons.map((w) => {
            const meta = getWeaponById(w.id) || w;
            return (
              <WeaponRow key={w.id} weapon={meta} selected={selectedWeaponId === w.id}
                owned={isOwned(w.id)} iconUrl={getWeaponIconUrl(meta.name)}
                onClick={() => setSelectedWeaponId(w.id)} />
            );
          })}
        </div>

        {opponentActivity && (
          <div style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)',
            letterSpacing: '0.2em', padding: '4px 10px', textAlign: 'center',
            background: 'rgba(200,120,26,0.08)',
          }}>{opponentActivity}</div>
        )}

        {/* Bottom status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)', flexShrink: 0,
        }}>
          {!isGroupChat && (
            <span style={{
              fontFamily: 'var(--f-display)', fontSize: 22,
              color: timeRemaining <= 5 ? '#c86060' : 'var(--accent)',
              letterSpacing: '0.12em', minWidth: 34, textAlign: 'center',
            }}>{String(timeRemaining).padStart(2, '0')}</span>
          )}
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 3, overflow: 'hidden' }}>
            {inventory.map((id) => {
              const w = getWeaponById(id);
              if (!w) return null;
              const tc = getTierColor(w.tier);
              return (
                <span key={id} style={{
                  fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '0.15em',
                  padding: '2px 6px', color: tc, border: `1px solid ${tc}55`,
                  whiteSpace: 'nowrap',
                }}>{w.name}</span>
              );
            })}
          </div>
          <button
            onClick={handleReady} disabled={isReady}
            style={{
              padding: '8px 14px',
              background: isReady ? 'var(--muted)' : 'var(--accent)',
              color: '#0e1209',
              border: '1px solid ' + (isReady ? 'var(--border)' : 'var(--accent-hot)'),
              clipPath: 'var(--clip-6)',
              fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.15em',
              cursor: isReady ? 'default' : 'pointer',
              opacity: isReady ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}>{isReady ? 'STANDBY…' : 'READY'}</button>
        </div>

        {/* Bottom sheet for selection */}
        {selectedWeapon && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 8000 }}
              onClick={() => setSelectedWeaponId(null)} />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 8001,
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--accent)',
              padding: '16px 18px',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              display: 'flex', flexDirection: 'column', gap: 10,
              maxHeight: '70vh', overflowY: 'auto',
              animation: 'sheetUp 0.2s ease-out',
            }}>
              <div style={{ width: 36, height: 4, background: 'var(--border)', alignSelf: 'center', marginBottom: 4 }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--bone)', letterSpacing: '0.08em' }}>{selectedWeapon.name}</div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: getTierColor(selectedWeapon.tier), letterSpacing: '0.22em' }}>{selectedWeapon.tier}</div>
                </div>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.12em' }}>
                  {isOwned(selectedWeapon.id) ? 'EQUIPPED' : selectedWeapon.goldCost === 0 ? 'FREE' : selectedWeapon.goldCost + 'G'}
                </div>
              </div>

              {selectedWeapon.desc && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.05em', lineHeight: 1.5 }}>
                  {selectedWeapon.desc}
                </div>
              )}

              {[
                ['DMG', Math.min(100, (selectedWeapon.damageFactor / 3.75) * 100)],
                ['BLR', Math.min(100, (selectedWeapon.blastRadius / 90) * 100)],
              ].map(([k, pct]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--olive)', letterSpacing: '0.22em', width: 30 }}>{k}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[0,1,2,3,4,5,6,7].map((i) => (
                      <div key={i} style={{ width: 10, height: 6, background: i < Math.ceil((pct / 100) * 8) ? getTierColor(selectedWeapon.tier) : 'var(--border)' }} />
                    ))}
                  </div>
                </div>
              ))}

              {(() => {
                const pm = PRESTIGE_WEAPON_META[selectedWeapon.id];
                if (!pm) return null;
                return (
                  <div style={{ textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: pm.color, letterSpacing: '0.22em' }}>
                    {pm.tierName.toUpperCase()} PRESTIGE · REQUIRES ??? SHOT BURN
                  </div>
                );
              })()}

              {!isOwned(selectedWeapon.id) && selectedWeapon.goldCost > 0 && (
                <button
                  onClick={() => buyWeapon(selectedWeapon.id)}
                  disabled={isReady || gold < selectedWeapon.goldCost}
                  style={{
                    width: '100%', padding: 12,
                    background: gold < selectedWeapon.goldCost || isReady ? 'var(--muted)' : 'var(--accent)',
                    color: '#0e1209',
                    border: '1px solid ' + (gold < selectedWeapon.goldCost || isReady ? 'var(--border)' : 'var(--accent-hot)'),
                    clipPath: 'var(--clip-6)',
                    fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
                    cursor: gold < selectedWeapon.goldCost || isReady ? 'not-allowed' : 'pointer',
                    opacity: gold < selectedWeapon.goldCost || isReady ? 0.6 : 1,
                  }}>BUY — {selectedWeapon.goldCost}G</button>
              )}

              {isOwned(selectedWeapon.id) && (
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: '#7fd060', letterSpacing: '0.22em', textAlign: 'center', padding: '6px 0' }}>
                  IN YOUR LOADOUT
                </div>
              )}
            </div>
          </>
        )}

        {ErrorModal}
      </div>
    );
  }

  /* ══ DESKTOP ══ */
  return (
    // height: '100%' fits the 90dvh bordered Layout frame. minHeight:
    // '100dvh' was forcing the inner grid taller than the frame, so the
    // bottom rows (READY button on the right column) clipped below the
    // border.
    <div style={{ position: 'relative', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%' }}>
        {/* LEFT: Catalog */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--bone)', letterSpacing: '0.12em' }}>WEAPON SHOP</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 4 }}>
                {isGroupChat
                  ? 'PRE-BATTLE LOADOUT · SPEND YOUR GOLD'
                  : `ROUND ${currentRound} / ${totalRounds} · SPEND YOUR GOLD`}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.15em' }}>
              ◆ {gold} GOLD
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {weapons.map((w) => {
              const meta = getWeaponById(w.id) || w;
              return (
                <WeaponRow key={w.id} weapon={meta} selected={selectedWeaponId === w.id}
                  owned={isOwned(w.id)} iconUrl={getWeaponIconUrl(meta.name)}
                  onClick={() => setSelectedWeaponId(w.id)} />
              );
            })}
          </div>
        </div>

        {/* RIGHT: Timer, Detail, Loadout, Ready */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: 18, gap: 14, overflowY: 'auto' }}>
          {/* Timer (1v1 only — group-chat is async, no countdown) */}
          {!isGroupChat && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              clipPath: 'var(--clip-6)', padding: 18, textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--f-display)', fontSize: 48,
                color: timeRemaining < 10 ? '#c86060' : 'var(--accent)',
                lineHeight: 1, letterSpacing: '0.08em',
                textShadow: timeRemaining < 10 ? 'none' : '0 0 20px rgba(218,138,40,0.3)',
              }}>{String(timeRemaining).padStart(2, '0')}</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 6 }}>
                SECONDS REMAINING
              </div>
            </div>
          )}

          {/* Group-chat mode banner — replaces the timer card */}
          {isGroupChat && (
            <div style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              clipPath: 'var(--clip-6)', padding: 16, textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'var(--f-display)', fontSize: 16, color: 'var(--bone)',
                letterSpacing: '0.18em',
              }}>NO RUSH</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.18em', marginTop: 6, lineHeight: 1.5 }}>
                ASYNC MATCH · BUY WHAT YOU WANT
                <br/>LOCK IN WHEN READY
              </div>
            </div>
          )}

          {/* Pot */}
          {wager > 0 && (
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, color: '#7fd060',
              letterSpacing: '0.2em', textAlign: 'center',
              padding: '6px 12px', border: '1px solid rgba(127,208,96,0.25)',
            }}>
              POT: {wager * (screenData?.players?.length || 2)} SOL
            </div>
          )}

          {/* Weapon detail */}
          <div style={{
            flex: 1, minHeight: 280,
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            clipPath: 'var(--clip-6)', padding: 16,
          }}>
            {selectedWeapon ? (
              <>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: getTierColor(selectedWeapon.tier), letterSpacing: '0.22em' }}>
                  {selectedWeapon.tier}
                </div>
                <div style={{ fontFamily: 'var(--f-display)', fontSize: 20, color: 'var(--bone)', lineHeight: 1, marginTop: 4, letterSpacing: '0.08em' }}>
                  {selectedWeapon.name}
                </div>
                {selectedWeapon.desc && (
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.05em', lineHeight: 1.5, marginTop: 10 }}>
                    {selectedWeapon.desc}
                  </div>
                )}

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['DAMAGE', Math.min(100, (selectedWeapon.damageFactor / 3.75) * 100)],
                    ['BLAST RADIUS', Math.min(100, (selectedWeapon.blastRadius / 90) * 100)],
                  ].map(([k, pct]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em', width: 90, flexShrink: 0 }}>{k}</span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                          <div key={i} style={{
                            width: 12, height: 8,
                            background: i < Math.ceil((pct / 100) * 10) ? getTierColor(selectedWeapon.tier) : 'var(--border)',
                          }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: 14, fontFamily: 'var(--f-mono)', fontSize: 14,
                  color: 'var(--accent)', letterSpacing: '0.15em',
                }}>
                  {isOwned(selectedWeapon.id) ? 'EQUIPPED' : selectedWeapon.goldCost === 0 ? 'FREE' : selectedWeapon.goldCost + ' GOLD'}
                </div>

                {!isOwned(selectedWeapon.id) && selectedWeapon.goldCost > 0 && (
                  <button
                    onClick={() => buyWeapon(selectedWeapon.id)}
                    disabled={isReady || gold < selectedWeapon.goldCost}
                    style={{
                      width: '100%', marginTop: 10, padding: 10,
                      background: gold < selectedWeapon.goldCost || isReady ? 'var(--muted)' : 'var(--accent)',
                      color: '#0e1209',
                      border: '1px solid ' + (gold < selectedWeapon.goldCost || isReady ? 'var(--border)' : 'var(--accent-hot)'),
                      clipPath: 'var(--clip-6)',
                      fontFamily: 'var(--f-display)', fontSize: 13, letterSpacing: '0.18em',
                      cursor: gold < selectedWeapon.goldCost || isReady ? 'not-allowed' : 'pointer',
                      opacity: gold < selectedWeapon.goldCost || isReady ? 0.6 : 1,
                    }}>BUY — {selectedWeapon.goldCost}G</button>
                )}

                {(() => {
                  const pm = PRESTIGE_WEAPON_META[selectedWeapon.id];
                  if (!pm) return null;
                  return (
                    <div style={{ marginTop: 10, textAlign: 'center', fontFamily: 'var(--f-mono)', fontSize: 10, color: pm.color, letterSpacing: '0.22em' }}>
                      {pm.tierName.toUpperCase()} PRESTIGE · REQUIRES ??? SHOT BURN
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--muted)', letterSpacing: '0.22em',
              }}>SELECT A WEAPON</div>
            )}
          </div>

          {/* Loadout */}
          <div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.22em', marginBottom: 6 }}>
              LOADOUT
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 30 }}>
              {inventory.map((id) => {
                const w = getWeaponById(id);
                if (!w) return null;
                const tc = getTierColor(w.tier);
                return (
                  <span key={id} style={{
                    padding: '4px 10px', background: 'var(--bg-surface)',
                    border: `1px solid ${tc}55`, color: tc,
                    fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '0.12em',
                  }}>{w.name}</span>
                );
              })}
            </div>
          </div>

          {opponentActivity && (
            <div style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent)',
              letterSpacing: '0.15em', textAlign: 'center', padding: '6px 0',
            }}>{opponentActivity}</div>
          )}

          <button
            onClick={handleReady} disabled={isReady}
            style={{
              width: '100%', padding: 16,
              background: isReady ? 'var(--muted)' : 'var(--accent)',
              color: '#0e1209',
              border: '1px solid ' + (isReady ? 'var(--border)' : 'var(--accent-hot)'),
              clipPath: 'var(--clip-10)',
              fontFamily: 'var(--f-display)', fontSize: 16, letterSpacing: '0.22em',
              cursor: isReady ? 'default' : 'pointer',
              opacity: isReady ? 0.6 : 1,
              boxShadow: isReady ? 'none' : '0 0 18px rgba(218,138,40,0.22)',
            }}>{isReady ? 'STANDING BY…' : 'READY'}</button>
        </div>
      </div>

      {ErrorModal}
    </div>
  );
}

export default ShopScreen;
