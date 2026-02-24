import React, { useState, useEffect } from 'react';

const baseStyle = {
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 10,
  color: 'var(--sp)',
  opacity: 0.75,
  letterSpacing: 1,
  whiteSpace: 'nowrap',
};

function ShotPriceTicker({ style }) {
  const [shotPrice, setShotPrice] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    const handlePrice = (price) => {
      setShotPrice(price);
      setReady(true);
    };

    socket.on('shotPrice', handlePrice);
    socket.emit('getShotPrice');

    return () => {
      socket.off('shotPrice', handlePrice);
    };
  }, []);

  if (!ready) return null;

  if (!shotPrice || shotPrice.usdPrice === null) {
    return (
      <span style={{ ...baseStyle, ...style }}>
        {'SHOT: N/A'}
      </span>
    );
  }

  const price = shotPrice.usdPrice;
  const change = shotPrice.priceChange24h;
  const priceText = 'SHOT $' + price.toFixed(4);

  let changeEl = null;
  if (change !== null && change !== undefined) {
    const isPositive = change >= 0;
    const sign = isPositive ? '+' : '';
    const changeColor = isPositive ? '#14F195' : '#cc2200';
    changeEl = (
      <span style={{ color: changeColor, marginLeft: 4 }}>
        {'| ' + sign + change.toFixed(1) + '%'}
      </span>
    );
  }

  return (
    <span style={{ ...baseStyle, ...style }}>
      {priceText}
      {changeEl}
    </span>
  );
}

export default ShotPriceTicker;
