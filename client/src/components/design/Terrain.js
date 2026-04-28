import React from 'react';

export default function TerrainSilhouette({ height = 200 }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height, pointerEvents: 'none', zIndex: 1 }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 800 200">
        <path d="M0,200 L0,120 C50,100 100,90 150,95 C200,100 250,80 300,85 C350,90 400,70 450,75 C500,80 550,65 600,70 C650,75 700,60 750,72 L800,68 L800,200 Z"
              fill="var(--bg-surface, #111806)" stroke="var(--olive, #7a9060)" strokeWidth="0.75" opacity="0.9" />
        <path d="M0,200 L0,145 C80,140 160,135 240,140 C320,145 400,130 480,135 C560,140 640,128 720,132 L800,130 L800,200 Z"
              fill="var(--bg-raised, #141c0d)" opacity="0.9" />
      </svg>
    </div>
  );
}
