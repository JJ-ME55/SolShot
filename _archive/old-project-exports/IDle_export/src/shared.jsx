/* global React */
// SolShot — shared primitives

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Terrain silhouette (SVG, parametric) ----------
function Terrain({ variant = 0, color }) {
  // Several different crests so we can vary per-screen
  const paths = [
    "M0,120 L0,72 L60,54 L120,66 L180,38 L260,52 L340,28 L420,48 L500,32 L580,50 L660,40 L740,62 L820,46 L900,58 L980,40 L1060,56 L1140,42 L1220,60 L1300,48 L1380,64 L1460,50 L1540,66 L1620,52 L1700,70 L1780,58 L1860,72 L1920,60 L1920,120 Z",
    "M0,120 L0,88 L80,74 L160,90 L240,62 L320,78 L400,54 L480,72 L560,46 L640,68 L720,50 L800,74 L880,58 L960,82 L1040,66 L1120,88 L1200,70 L1280,92 L1360,74 L1440,96 L1520,80 L1600,102 L1680,86 L1760,108 L1840,92 L1920,112 L1920,120 Z",
    "M0,120 L0,96 L100,82 L200,98 L300,76 L400,92 L500,70 L600,88 L700,62 L800,84 L900,68 L1000,88 L1100,74 L1200,92 L1300,78 L1400,98 L1500,84 L1600,104 L1700,90 L1800,108 L1900,96 L1920,104 L1920,120 Z"
  ];
  const p = paths[variant % paths.length];
  return (
    <div className="terrain">
      <svg viewBox="0 0 1920 120" preserveAspectRatio="none">
        <path d={p} fill={color || "var(--bg-surface)"} />
        <path d={p} fill="none" stroke="var(--muted)" strokeWidth="1" opacity="0.6" transform="translate(0,-1)" />
      </svg>
    </div>
  );
}

// ---------- Pixel tank SVG (parametric so we don't depend on PNG tint) ----------
function PixelTank({ color = "var(--olive)", flipped = false, size = 64 }) {
  // 16x10 pixel tank
  const px = size / 16;
  const rects = [
    // Hull
    [2,5,12,2,color],
    [1,7,14,1,color],
    [2,8,12,1,"#2a3a1c"],
    // Treads
    [1,9,14,1,"#0e1209"],
    [2,8,1,1,"#0e1209"],
    [13,8,1,1,"#0e1209"],
    // Turret
    [5,3,5,2,color],
    [6,2,3,1,color],
    // Barrel
    [9,3,5,1,color],
    [13,2,2,1,color],
    // Shadow
    [4,6,8,1,"#0e1209"],
  ];
  return (
    <svg width={size*1.2} height={size*0.75} viewBox={`0 0 ${16*px} ${10*px}`}
         style={{ transform: flipped ? "scaleX(-1)" : "none", imageRendering: "pixelated", display: "block" }}>
      {rects.map(([x,y,w,h,c], i) => (
        <rect key={i} x={x*px} y={y*px} width={w*px} height={h*px} fill={c} />
      ))}
    </svg>
  );
}

// ---------- Corner tick marks (for framing panels) ----------
function Ticks({ color = "var(--muted)" }) {
  return (
    <svg className="ticks" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} viewBox="0 0 100 100" preserveAspectRatio="none">
      <g fill="none" stroke={color} strokeWidth="0.5">
        <path d="M0,3 L3,3 L3,0" />
        <path d="M97,0 L97,3 L100,3" />
        <path d="M100,97 L97,97 L97,100" />
        <path d="M3,100 L3,97 L0,97" />
      </g>
    </svg>
  );
}

// ---------- Overlays (scan / grain / vignette) ----------
function Overlays() {
  return (
    <>
      <div className="grain" />
      <div className="scanlines" />
      <div className="vignette" />
    </>
  );
}

// ---------- Top chrome (thin tactical bar) ----------
function TopChrome({ theme, setTheme, onNav, route }) {
  const themes = [
    { id: "field", label: "Field Manual" },
    { id: "crt", label: "CRT Terminal" },
    { id: "poster", label: "Stencil Poster" },
  ];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16,
      padding: "10px 20px",
      borderBottom: "1px solid var(--border)",
      background: "var(--bg-surface)",
      fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
      position: "relative", zIndex: 10,
    }}>
      <div style={{ color: "var(--accent)" }}>◣ CH-01</div>
      <div style={{ color: "var(--olive)" }}>SECURE LINK</div>
      <div style={{ color: "var(--olive)" }}>MAINNET · BETA</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", gap: 6 }}>
        {["MENU","DEPLOY","SHOP","MATCH","REPORT","BARRACKS","ARMORY","LOADOUT","PRESTIGE"].map((r, i) => {
          const routeIds = ["menu","deploy","shop","match","report","barracks","armory","loadout","prestige"];
          const active = route === routeIds[i];
          return (
            <button key={r} onClick={() => onNav(routeIds[i])}
              style={{
                background: active ? "var(--border)" : "transparent",
                border: "1px solid " + (active ? "var(--border-hot)" : "transparent"),
                color: active ? "var(--bone)" : "var(--olive)",
                padding: "4px 10px",
                fontFamily: "var(--f-mono)",
                fontSize: 11, letterSpacing: "0.2em",
                cursor: "pointer",
              }}>
              {r}
            </button>
          );
        })}
      </div>
      <div style={{ width: 1, height: 16, background: "var(--border)" }} />
      <div style={{ display: "flex", gap: 4 }}>
        {themes.map(t => (
          <button key={t.id} onClick={() => setTheme(t.id)}
            title={t.label}
            style={{
              background: theme === t.id ? "var(--accent)" : "var(--bg-raised)",
              color: theme === t.id ? "#0e1209" : "var(--olive)",
              border: "1px solid var(--border)",
              padding: "4px 10px",
              fontFamily: "var(--f-mono)",
              fontSize: 10, letterSpacing: "0.2em",
              cursor: "pointer",
            }}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Standardized screen header (unified titles + currency + user chip) ----------
// Used by every secondary screen (Deploy / Shop / Barracks / Armory / Loadout / Prestige / Report).
// - title: big stencil page title (consistent ~42px display)
// - subtitle: optional mono tagline under title
// - onBack: back-nav callback; label defaults to "MENU"
// - right: right side content. Default shows standard currency chip (SHOT + SOL).
function ScreenHeader({ title, subtitle, onBack, backLabel = "MENU", right, rightExtras }) {
  const defaultRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "var(--f-mono)", fontSize: 12, letterSpacing: "0.15em" }}>
      <span style={{ color: "var(--accent)" }}>◆ 1,240 SHOT</span>
      <span style={{ color: "var(--bone)" }}>◇ 2.31 SOL</span>
      {rightExtras}
    </div>
  );
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "end",
      marginBottom: 24,
      paddingBottom: 14,
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ justifySelf: "start" }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: "transparent", border: "none",
            color: "var(--olive)", fontFamily: "var(--f-mono)",
            letterSpacing: "0.25em", cursor: "pointer", fontSize: 11,
            padding: 0,
          }}>◂ {backLabel}</button>
        )}
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="stencil" style={{
          fontSize: 42, color: "var(--bone)",
          letterSpacing: "0.14em", lineHeight: 0.95,
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)",
            letterSpacing: "0.25em", marginTop: 6,
          }}>{subtitle}</div>
        )}
      </div>
      <div style={{ justifySelf: "end" }}>
        {right === undefined ? defaultRight : right}
      </div>
    </div>
  );
}

// ---------- Bone header / logo lockup ----------
function Wordmark({ size = 48 }) {
  return (
    <div className="stencil" style={{
      fontSize: size,
      display: "inline-flex",
      lineHeight: 1,
      letterSpacing: "0.04em",
    }}>
      <span style={{ color: "var(--bone)" }}>SOL</span>
      <span style={{ color: "var(--accent)" }}>SHOT</span>
    </div>
  );
}

// Export to global scope
Object.assign(window, {
  Terrain, PixelTank, Ticks, Overlays, TopChrome, Wordmark, ScreenHeader
});
