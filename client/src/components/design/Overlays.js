import React from 'react';

export function Overlays() {
  return (
    <>
      <div className="scanlines" />
      <div className="grain" />
      <div className="vignette" />
    </>
  );
}

export function MobileOverlays() {
  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 3px)',
      }} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)',
      }} />
    </>
  );
}
