import React, { useRef, useState, useEffect } from 'react';

const s = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    background: 'rgba(10, 12, 8, 0.6)',
    borderRadius: 3,
    border: '1px solid var(--ol)',
    pointerEvents: 'none',
    position: 'relative',
  },
  icon: {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 13,
    color: 'var(--gd)',
  },
  value: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: 16,
    letterSpacing: 1,
    lineHeight: 1,
    transition: 'color 0.3s ease',
  },
};

function GoldDisplay({ gold }) {
  const prevGold = useRef(gold || 0);
  const [delta, setDelta] = useState(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const current = gold || 0;
    const prev = prevGold.current;
    if (current !== prev && prev !== 0) {
      const diff = current - prev;
      setDelta(diff);
      setFlash(true);
      const t1 = setTimeout(() => setFlash(false), 1500);
      const t2 = setTimeout(() => setDelta(null), 1500);
      prevGold.current = current;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    prevGold.current = current;
  }, [gold]);

  return (
    <div style={s.container}>
      <span style={s.icon}>G</span>
      <span style={{
        ...s.value,
        color: flash ? '#ffb300' : 'var(--gd)',
        textShadow: flash ? '0 0 8px rgba(255,179,0,0.6)' : 'none',
      }}>
        {gold || 0}
      </span>
      {delta !== null && (
        <span style={{
          position: 'absolute',
          top: -4,
          right: -6,
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 13,
          color: delta > 0 ? '#4CAF50' : '#ff4444',
          textShadow: delta > 0 ? '0 0 6px rgba(76,175,80,0.6)' : '0 0 6px rgba(255,0,0,0.6)',
          letterSpacing: 1,
          pointerEvents: 'none',
          animation: 'goldDelta 1.5s ease-out forwards',
          zIndex: 10,
        }}>
          {delta > 0 ? '+' : ''}{delta}G
        </span>
      )}
      <style>{`
        @keyframes goldDelta {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-14px); }
        }
      `}</style>
    </div>
  );
}

export default React.memo(GoldDisplay);
