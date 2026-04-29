import React, { useState, useEffect, useCallback } from 'react';
import ScreenHeader from '../components/design/ScreenHeader';
import TerrainSilhouette from '../components/design/Terrain';
import { COSMETIC_ITEMS, TIER_COLORS } from '../data/tiers';

const ICON_MAP = { PATTERN: '#', TRAIL: '~', BLAST: '*', SKIN: '^', KILL: '!' };

function ArmoryScreen({ navigate }) {
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

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', background: 'var(--bg-deep)', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage: 'linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
      }} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 80px', position: 'relative', zIndex: 3 }}>
        <ScreenHeader
          title="ARMORY"
          subtitle="PERMANENT COSMETICS · PAID IN SOL OR $SHOT"
          onBack={() => navigate('menu')}
          rightExtras={
            <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.2em' }}>
              ◆ {shotBalance.toFixed(1)} SHOT
            </div>
          }
        />

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18 }}>
          {/* Item list */}
          <div>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: '0.22em' }}>
                {tab === 'SOL' ? 'SOL COSMETICS — COMING SOON' : 'NO ITEMS'}
              </div>
            ) : items.map(it => {
              const color = TIER_COLORS[it.tier] || 'var(--olive)';
              const isSel = selectedId === it.id;
              const isOwned = owned.includes(it.id);
              const cat = it.type.toLowerCase();
              const isEquipped = equipped[cat] === it.id;
              return (
                <div key={it.id} onClick={() => setSelectedId(it.id)} style={{
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
                  }}>{ICON_MAP[it.type] || '?'}</div>
                  <div>
                    <div style={{ fontFamily: 'var(--f-sec)', color: 'var(--bone)', fontSize: 15, letterSpacing: '0.04em' }}>{it.name}</div>
                    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, color, letterSpacing: '0.22em', marginTop: 2 }}>
                      {it.tier} · {it.type}{isEquipped ? ' · EQUIPPED' : isOwned ? ' · OWNED' : ''}
                    </div>
                  </div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color, letterSpacing: '0.15em' }}>
                    {it.price}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            clipPath: 'var(--clip-6)', padding: 16,
            alignSelf: 'start', minHeight: 400,
            position: 'sticky', top: 16,
          }}>
            {sel ? (() => {
              const color = TIER_COLORS[sel.tier] || 'var(--olive)';
              const isOwned = owned.includes(sel.id);
              const cat = sel.type.toLowerCase();
              const isEquipped = equipped[cat] === sel.id;
              const isShotItem = sel.price.includes('SHOT');
              const cost = isShotItem ? parseInt(sel.price) : 0;
              const canAfford = shotBalance >= cost;
              return (
                <>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color, letterSpacing: '0.22em' }}>{sel.tier} · {sel.type}</div>
                  <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, color: 'var(--bone)', lineHeight: 1, marginTop: 4, letterSpacing: '0.06em' }}>{sel.name}</div>

                  <div style={{ height: 140, margin: '16px 0', background: 'var(--bg-deep)', border: '1px dashed var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="120" height="70" viewBox="0 0 120 70">
                      <rect x="20" y="34" width="70" height="14" fill={color} />
                      <rect x="38" y="24" width="24" height="12" fill={color} />
                      <rect x="62" y="28" width="30" height="4" fill={color} />
                      <rect x="15" y="48" width="80" height="4" fill="#0e1209" />
                    </svg>
                  </div>

                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--olive)', letterSpacing: '0.08em', lineHeight: 1.5, marginBottom: 10 }}>
                    {sel.desc}
                  </div>

                  {[
                    ['CATEGORY', sel.type, 'var(--bone)'],
                    ['TIER', sel.tier, color],
                    ['PRICE', sel.price, 'var(--accent)'],
                    ['OWNED', isOwned ? (isEquipped ? 'EQUIPPED' : 'YES') : 'NO', isOwned ? '#7fd060' : 'var(--muted)'],
                  ].map(([k, v, c]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed var(--muted)', fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.15em' }}>
                      <span style={{ color: 'var(--olive)' }}>{k}</span>
                      <span style={{ color: c }}>{v}</span>
                    </div>
                  ))}

                  {isOwned ? (
                    <button onClick={() => handleEquip(sel.id, sel.type)} style={{
                      width: '100%', marginTop: 14, padding: 14,
                      background: isEquipped ? 'transparent' : 'var(--accent)',
                      color: isEquipped ? 'var(--accent)' : '#0e1209',
                      border: '1px solid var(--accent)', clipPath: 'var(--clip-6)',
                      fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
                      cursor: 'pointer',
                    }}>{isEquipped ? 'UNEQUIP' : 'EQUIP'}</button>
                  ) : isShotItem ? (
                    <button
                      onClick={canAfford && !buying ? () => handleBuy(sel.id) : undefined}
                      disabled={!canAfford || buying}
                      style={{
                        width: '100%', marginTop: 14, padding: 14,
                        background: canAfford ? 'var(--accent)' : 'var(--muted)',
                        color: '#0e1209',
                        border: '1px solid ' + (canAfford ? 'var(--accent-hot)' : 'var(--border)'),
                        clipPath: 'var(--clip-6)',
                        fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
                        cursor: canAfford && !buying ? 'pointer' : 'default',
                        opacity: !canAfford || buying ? 0.6 : 1,
                      }}>
                      {buying ? 'PROCESSING…' : canAfford ? `BURN ${cost} SHOT` : 'INSUFFICIENT SHOT'}
                    </button>
                  ) : (
                    <button disabled style={{
                      width: '100%', marginTop: 14, padding: 14,
                      background: 'var(--muted)', color: '#0e1209',
                      border: '1px solid var(--border)', clipPath: 'var(--clip-6)',
                      fontFamily: 'var(--f-display)', fontSize: 14, letterSpacing: '0.18em',
                      opacity: 0.6,
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
            })() : (
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--muted)', letterSpacing: '0.22em', textAlign: 'center', paddingTop: 160 }}>
                SELECT AN ITEM
              </div>
            )}
          </div>
        </div>
      </div>

      <TerrainSilhouette />
    </div>
  );
}

export default ArmoryScreen;
