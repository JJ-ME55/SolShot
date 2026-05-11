import React, { useState, useEffect, useCallback } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { COSMETIC_ITEMS, TIER_COLORS } from '../data/tiers';
import { EmptyState } from '../components/EmptyStates';

const ICON_MAP = { PATTERN: '#', TRAIL: '~', BLAST: '*', SKIN: '^', KILL: '!' };

// ── Row renderer (shared desktop + mobile) ────────────────────────────
function ItemRow({ item, isSel, isOwned, isEquipped, onClick }) {
  const color = TIER_COLORS[item.tier] || 'var(--olive)';
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center',
      padding: '10px 12px',
      background: isSel ? 'var(--bg-raised)' : 'transparent',
      borderLeft: '2px solid ' + (isSel ? color : 'transparent'),
      borderBottom: '1px solid var(--border)',
      cursor: 'pointer',
    }}>
      <div style={{
        width: 28, height: 28, background: 'var(--bg-surface)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color, fontFamily: 'var(--f-display)', fontSize: 14,
      }}>{ICON_MAP[item.type] || '?'}</div>
      <div>
        <div style={{ fontFamily: 'var(--f-sec)', color: 'var(--bone)', fontSize: 15, letterSpacing: '0.04em' }}>{item.name}</div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color, letterSpacing: '0.22em', marginTop: 2 }}>
          {item.tier} · {item.type}{isEquipped ? ' · EQUIPPED' : isOwned ? ' · OWNED' : ''}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color, letterSpacing: '0.15em' }}>
        {item.price}
      </div>
    </div>
  );
}

// ── Detail panel renderer (shared) ────────────────────────────────────
function DetailPanel({ item, owned, equipped, shotBalance, buying, feedback, onBuy, onEquip }) {
  if (!item) {
    return (
      <div style={{
        fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--muted)',
        letterSpacing: '0.22em', textAlign: 'center', paddingTop: 160,
      }}>SELECT AN ITEM</div>
    );
  }
  const color = TIER_COLORS[item.tier] || 'var(--olive)';
  const isOwned = owned.includes(item.id);
  const cat = item.type.toLowerCase();
  const isEquipped = equipped[cat] === item.id;
  const isShotItem = item.price.includes('SHOT');
  const cost = isShotItem ? parseInt(item.price) : 0;
  const canAfford = shotBalance >= cost;
  return (
    <>
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color, letterSpacing: '0.22em' }}>{item.tier} · {item.type}</div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--bone)', lineHeight: 1, marginTop: 4, letterSpacing: '0.06em' }}>{item.name}</div>

      {/* Cosmetic preview — subtle idle animation */}
      <div style={{
        height: 140, margin: '16px 0',
        background: 'var(--bg-deep)',
        border: '1px dashed var(--muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <style>{`
          @keyframes armory-sweep {
            0%   { transform: translateX(-100%); opacity: 0; }
            50%  { opacity: 0.6; }
            100% { transform: translateX(220%); opacity: 0; }
          }
          @keyframes armory-turret {
            0%, 100% { transform: rotate(-6deg); }
            50%      { transform: rotate(6deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .armory-sweep, .armory-turret { animation: none !important; }
          }
        `}</style>
        <div className="armory-sweep" style={{
          position: 'absolute',
          top: 0, bottom: 0, left: 0,
          width: '40%',
          background: `linear-gradient(90deg, transparent, ${color}33, transparent)`,
          animation: 'armory-sweep 4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
        <svg width="120" height="70" viewBox="0 0 120 70">
          <rect x="20" y="34" width="70" height="14" fill={color} />
          <g
            className="armory-turret"
            style={{
              transformOrigin: '50px 36px',
              transformBox: 'fill-box',
              animation: 'armory-turret 3.6s ease-in-out infinite',
            }}
          >
            <rect x="38" y="24" width="24" height="12" fill={color} />
            <rect x="62" y="28" width="30" height="4" fill={color} />
          </g>
          <rect x="15" y="48" width="80" height="4" fill="var(--bg-deep)" />
        </svg>
      </div>

      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.08em', lineHeight: 1.5, marginBottom: 10 }}>
        {item.desc}
      </div>

      {[
        ['CATEGORY', item.type, 'var(--bone)'],
        ['TIER', item.tier, color],
        ['PRICE', item.price, 'var(--accent)'],
        ['OWNED', isOwned ? (isEquipped ? 'EQUIPPED' : 'YES') : 'NO', isOwned ? '#7fd060' : 'var(--muted)'],
      ].map(([k, v, c]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--muted)', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.15em' }}>
          <span style={{ color: 'var(--olive)' }}>{k}</span>
          <span style={{ color: c }}>{v}</span>
        </div>
      ))}

      {isOwned ? (
        <button onClick={() => onEquip(item.id, item.type)} style={{
          width: '100%', marginTop: 14, padding: 14,
          background: isEquipped ? 'transparent' : 'var(--accent)',
          color: isEquipped ? 'var(--accent)' : '#0e1209',
          border: '1px solid var(--accent)', clipPath: 'var(--clip-6)',
          fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
          cursor: 'pointer',
        }}>{isEquipped ? 'UNEQUIP' : 'EQUIP'}</button>
      ) : (
        // Cosmetic purchases are scaffolded but not all assets/equip
        // pipelines are fully wired up. Disable the buy button across
        // every non-owned item with a COMING SOON stamp so users
        // (and judges) don't tap into a half-shipped flow. Price text
        // above this button stays visible — JJ wants the prices left
        // intact, just the action button gated. AJVD QA pass May 8.
        <button disabled style={{
          width: '100%', marginTop: 14, padding: 14,
          background: 'var(--muted)', color: '#0e1209',
          border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
          fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
          opacity: 0.6, cursor: 'default',
        }}>COMING SOON</button>
      )}

      {isShotItem && !isOwned && (
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.22em', textAlign: 'center', marginTop: 8 }}>
          SHOT BURNED ON PURCHASE
        </div>
      )}

      {feedback && (
        <div style={{
          fontFamily: 'var(--f-mono)', fontSize: 11,
          color: feedback.type === 'success' ? '#7fd060' : '#c86060',
          letterSpacing: '0.2em', marginTop: 8, textAlign: 'center',
        }}>{feedback.text}</div>
      )}
    </>
  );
}

function ArmoryScreen({ navigate }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState('SHOT'); // 'SOL' | 'SHOT' — default SHOT, that's where cosmetics live
  const [selectedId, setSelectedId] = useState(null);
  const [owned, setOwned] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [shotBalance, setShotBalance] = useState(0);
  const [buying, setBuying] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    const sock = window.socket;
    if (!sock) return;
    sock.emit('getCosmetics');
    sock.emit('getShotInfo');
    const onCosmetics = (data) => { setOwned(data.owned || []); setEquipped(data.equipped || {}); };
    const onShotInfo = (data) => setShotBalance(data.balance || 0);
    sock.on('cosmeticsData', onCosmetics);
    sock.on('shotInfo', onShotInfo);
    return () => { sock.off('cosmeticsData', onCosmetics); sock.off('shotInfo', onShotInfo); };
  }, []);

  const handleBuy = useCallback((itemId) => {
    if (buying) return;
    const sock = window.socket;
    if (!sock) return;
    setBuying(true);
    sock.emit('buyCosmetic', { itemId });
    const handler = (data) => {
      setBuying(false);
      if (data.success) {
        setOwned(prev => [...prev, data.itemId]);
        setShotBalance(data.newBalance);
        setFeedback({ type: 'success', text: 'PURCHASED' });
      } else {
        setFeedback({ type: 'error', text: data.error || 'FAILED' });
      }
      setTimeout(() => setFeedback(null), 2000);
      sock.off('buyCosmeticResult', handler);
    };
    sock.on('buyCosmeticResult', handler);
  }, [buying]);

  const handleEquip = useCallback((itemId, category) => {
    const sock = window.socket;
    if (!sock) return;
    const cat = category.toLowerCase();
    const isEquipped = equipped[cat] === itemId;
    sock.emit('equipCosmetic', { itemId: isEquipped ? null : itemId, category: cat });
    const handler = (data) => {
      if (data.success) setEquipped(prev => ({ ...prev, [data.category]: data.itemId }));
      sock.off('equipCosmeticResult', handler);
    };
    sock.on('equipCosmeticResult', handler);
  }, [equipped]);

  const items = COSMETIC_ITEMS.filter(it => tab === 'SOL' ? it.price.includes('SOL') : it.price.includes('SHOT'));
  const sel = items.find(i => i.id === selectedId) || null;

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────
  // Single-column list + bottom-sheet detail (matches ShopScreen pattern).
  // Tap a row → sheet pops up from bottom; tap backdrop or close to dismiss.
  if (isMobile) {
    return (
      <div style={{
        position: 'relative', height: '100%', background: 'var(--bg-deep)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <div onClick={() => navigate('menu')} style={{
            fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
            letterSpacing: '0.22em', cursor: 'pointer',
          }}>◂ MENU</div>
          <div style={{ fontFamily: 'var(--f-display)', fontSize: 14, color: 'var(--bone)', letterSpacing: '0.18em' }}>ARMORY</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--accent)', letterSpacing: '0.15em' }}>
            ◆ {shotBalance.toFixed(1)}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          {[['SOL', 'SOL SHOP'], ['SHOT', 'COSMETICS']].map(([id, lbl]) => (
            <button key={id} onClick={() => { setTab(id); setSelectedId(null); }} style={{
              padding: '12px 0', background: tab === id ? 'rgba(218,138,40,0.04)' : 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--olive)',
              border: 'none',
              borderBottom: '2px solid ' + (tab === id ? 'var(--accent)' : 'transparent'),
              fontFamily: 'var(--f-display)', fontSize: 12, letterSpacing: '0.18em',
              cursor: 'pointer',
            }}>{lbl}</button>
          ))}
        </div>

        {/* Item list — independent scroll */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {items.length === 0 ? (
            <div style={{ padding: 24 }}>
              {tab === 'SOL' ? (
                <EmptyState
                  icon="lock"
                  title="SOL SHOP COMING SOON"
                  body="DIRECT SOL PURCHASES UNLOCK SOON. UNTIL THEN, BURN $SHOT VIA PRESTIGE TO UNLOCK COSMETICS."
                  primaryCTA={{ label: 'OPEN $SHOT TAB', onClick: () => setTab('SHOT') }}
                />
              ) : (
                <EmptyState
                  icon="crate"
                  title="LOCKER EMPTY"
                  body="NO COSMETICS AVAILABLE. CATALOG MAY BE LOADING."
                />
              )}
            </div>
          ) : items.map(it => {
            const cat = it.type.toLowerCase();
            return (
              <ItemRow
                key={it.id} item={it}
                isSel={selectedId === it.id}
                isOwned={owned.includes(it.id)}
                isEquipped={equipped[cat] === it.id}
                onClick={() => setSelectedId(it.id)}
              />
            );
          })}
        </div>

        {/* Bottom sheet for selection */}
        {sel && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 8000 }}
              onClick={() => setSelectedId(null)} />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 8001,
              background: 'var(--bg-surface)',
              borderTop: '1px solid var(--accent)',
              padding: '16px 18px',
              maxHeight: '80vh', overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}>
              {/* Close affordance */}
              <div onClick={() => setSelectedId(null)} style={{
                position: 'absolute', top: 8, right: 14, cursor: 'pointer',
                fontFamily: 'var(--f-mono)', fontSize: 18, color: 'var(--olive)',
              }}>✕</div>
              <DetailPanel item={sel} owned={owned} equipped={equipped}
                shotBalance={shotBalance} buying={buying} feedback={feedback}
                onBuy={handleBuy} onEquip={handleEquip} />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────
  // True dual-column independent scroll (matches ShopScreen). Header
  // is fixed-height; left list + right detail each scroll on their own.
  // height: 100% fits the 90dvh bordered Layout frame (NOT 100dvh —
  // that would push past the frame).
  return (
    <div style={{ position: 'relative', height: '100%', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: '100%' }}>
        {/* LEFT: Catalog */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 16,
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
          }}>
            <div onClick={() => navigate('menu')} style={{
              fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)',
              letterSpacing: '0.22em', cursor: 'pointer',
            }}>◂ MENU</div>
            <div>
              <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--bone)', letterSpacing: '0.12em' }}>ARMORY</div>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--olive)', letterSpacing: '0.22em', marginTop: 4 }}>
                PERMANENT COSMETICS · PAID IN SOL OR $SHOT
              </div>
            </div>
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 14, color: 'var(--accent)', letterSpacing: '0.15em' }}>
              ◆ {shotBalance.toFixed(1)} SHOT
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            {[['SOL', 'SOL SHOP'], ['SHOT', 'COSMETICS']].map(([id, lbl]) => (
              <button key={id} onClick={() => { setTab(id); setSelectedId(null); }} style={{
                padding: '14px 0', background: tab === id ? 'rgba(218,138,40,0.04)' : 'transparent',
                color: tab === id ? 'var(--accent)' : 'var(--olive)',
                border: 'none',
                borderBottom: '2px solid ' + (tab === id ? 'var(--accent)' : 'transparent'),
                fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
                cursor: 'pointer',
              }}>{lbl}</button>
            ))}
          </div>

          {/* List — independent scroll */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div style={{ padding: 24 }}>
                {tab === 'SOL' ? (
                  <EmptyState
                    icon="lock"
                    title="SOL SHOP COMING SOON"
                    body="DIRECT SOL PURCHASES UNLOCK SOON. UNTIL THEN, BURN $SHOT VIA PRESTIGE TO UNLOCK COSMETICS."
                    primaryCTA={{ label: 'OPEN $SHOT TAB', onClick: () => setTab('SHOT') }}
                  />
                ) : (
                  <EmptyState
                    icon="crate"
                    title="LOCKER EMPTY"
                    body="NO COSMETICS AVAILABLE. CATALOG MAY BE LOADING."
                  />
                )}
              </div>
            ) : items.map(it => {
              const cat = it.type.toLowerCase();
              return (
                <ItemRow
                  key={it.id} item={it}
                  isSel={selectedId === it.id}
                  isOwned={owned.includes(it.id)}
                  isEquipped={equipped[cat] === it.id}
                  onClick={() => setSelectedId(it.id)}
                />
              );
            })}
          </div>
        </div>

        {/* RIGHT: Detail panel — independent scroll */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: 18, overflowY: 'auto' }}>
          <DetailPanel item={sel} owned={owned} equipped={equipped}
            shotBalance={shotBalance} buying={buying} feedback={feedback}
            onBuy={handleBuy} onEquip={handleEquip} />
        </div>
      </div>
    </div>
  );
}

export default ArmoryScreen;
