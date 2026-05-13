/* global React */
// Mobile shared primitives — landscape phone (844×390)
// Safe areas:
//   LEFT  = 44px  (iPhone Dynamic Island / camera notch when rotated)
//   RIGHT = 16px  (bezel)
//   TOP   = 20px  (status bar)
//   BOT   = 26px  (home indicator swipe bar)

const { useState: useStateM, useEffect: useEffectM } = React;

// Landscape phone bezel — iPhone-ish, simplified
function PhoneFrame({ children, width = 844, height = 390, notch = true }) {
  return (
    <div style={{
      position: "relative",
      width, height,
      background: "#000",
      borderRadius: 40,
      padding: 10,
      boxShadow: "0 0 0 2px #1a1a1a, 0 30px 60px rgba(0,0,0,0.45)",
    }}>
      {/* Screen */}
      <div style={{
        position: "relative",
        width: "100%", height: "100%",
        borderRadius: 30,
        overflow: "hidden",
        background: "var(--bg-deep)",
      }}>
        {notch && (
          <>
            {/* Dynamic Island / camera pill */}
            <div style={{
              position: "absolute", top: "50%", left: 6,
              transform: "translateY(-50%)",
              width: 26, height: 110,
              background: "#000",
              borderRadius: 13,
              zIndex: 60,
              boxShadow: "inset 0 0 0 1px #0a0a0a",
            }} />
          </>
        )}
        {children}
        {/* Home-indicator swipe bar — bottom center */}
        <div style={{
          position: "absolute", bottom: 6, left: "50%",
          transform: "translateX(-50%)",
          width: 110, height: 4,
          background: "rgba(232,216,154,0.35)",
          borderRadius: 2,
          zIndex: 60, pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

// iOS-style status bar (landscape: time left, battery right, BOTH inside safe area)
function StatusBar({ time = "9:41" }) {
  return (
    <div style={{
      position: "absolute", top: 4, left: 44, right: 20,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      fontSize: 10, fontFamily: "var(--f-mono)",
      color: "var(--bone)",
      letterSpacing: "0.1em",
      zIndex: 50,
      pointerEvents: "none",
    }}>
      <span style={{ opacity: 0.75 }}>{time}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.75 }}>
        <span>5G</span>
        <svg width="16" height="8" viewBox="0 0 16 8">
          <rect x="0" y="1" width="13" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="0.8"/>
          <rect x="14" y="3" width="1.3" height="2" fill="currentColor"/>
          <rect x="1.5" y="2.5" width="8" height="3" fill="currentColor"/>
        </svg>
      </span>
    </div>
  );
}

// Actual SolShot wordmark — uses the brand PNG asset
function LogoMark({ height = 26, style = {} }) {
  return (
    <img src="assets/solshot-logo-transparent.png" alt="SolShot"
      style={{ height, width: "auto", display: "block", imageRendering: "auto", ...style }} />
  );
}

// Dynamic-island style "pill" that hugs the notch (left side, landscape)
// Use for non-critical live info the user taps to expand (online count, LIVE indicator, match timer)
function NotchPill({ children, color = "var(--accent)" }) {
  return (
    <div style={{
      position: "absolute", top: "50%", left: 42,
      transform: "translateY(-50%)",
      display: "flex", alignItems: "center", gap: 6,
      padding: "3px 10px 3px 8px",
      background: "rgba(0,0,0,0.7)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      fontFamily: "var(--f-mono)", fontSize: 8,
      color, letterSpacing: "0.15em",
      zIndex: 55,
    }}>
      {children}
    </div>
  );
}

// Compact top chrome for mobile screens (back, title, right slot)
// Pushed into safe area: left 44 (past notch), right 20 (bezel)
function MobileChrome({ onBack, title, right, backLabel = "◂" }) {
  return (
    <div style={{
      position: "absolute", top: 18, left: 52, right: 20,
      display: "grid", gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      fontFamily: "var(--f-mono)", fontSize: 10,
      color: "var(--olive)", letterSpacing: "0.2em",
      zIndex: 10,
    }}>
      <button onClick={onBack} style={{
        background: "transparent", border: "none",
        color: "var(--accent)", fontFamily: "var(--f-mono)",
        fontSize: 11, letterSpacing: "0.2em", cursor: "pointer", padding: 0,
      }}>{backLabel}</button>
      <span className="stencil" style={{
        textAlign: "center", color: "var(--bone)",
        fontSize: 14, letterSpacing: "0.25em",
      }}>{title}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, fontSize: 9 }}>{right}</div>
    </div>
  );
}

// Currency chip
function CurrencyChip({ compact = false }) {
  return (
    <div style={{
      display: "flex", gap: compact ? 8 : 14,
      fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em",
    }}>
      <span style={{ color: "var(--accent)" }}>◆ 1,240</span>
      <span style={{ color: "var(--bone)" }}>◇ 2.31</span>
    </div>
  );
}

// Terrain silhouette (compact, for mobile)
function TerrainMini({ height = 80 }) {
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0,
      height, pointerEvents: "none", zIndex: 1,
    }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 80">
        <path d="M0,80 L0,50 L30,48 L60,40 L90,50 L120,35 L160,30 L200,38 L240,28 L280,36 L320,32 L360,42 L400,38 L400,80 Z"
              fill="var(--bg-surface)" stroke="var(--olive)" strokeWidth="0.75" opacity="0.9" />
        <path d="M0,80 L0,60 L50,58 L100,60 L150,54 L200,58 L250,52 L300,56 L350,54 L400,56 L400,80 Z"
              fill="var(--bg-raised)" opacity="0.9" />
      </svg>
    </div>
  );
}

// Tiny tank (uses existing tinted sprites)
function TinyTank({ scale = 1, flip = false, style = {} }) {
  return (
    <div style={{
      position: "relative",
      width: 60 * scale, height: 32 * scale,
      transform: flip ? "scaleX(-1)" : "none",
      ...style,
    }}>
      <img src="assets/tank-tinted.png"
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%", imageRendering: "pixelated" }} alt="" />
      <img src="assets/tank-turret-tinted.png"
        style={{ position: "absolute", bottom: 18 * scale, left: 6 * scale, width: 48 * scale, transform: "rotate(-8deg)", transformOrigin: "22% 70%", imageRendering: "pixelated" }} alt="" />
    </div>
  );
}

// Scanline / grain overlay (mobile-scoped — lower opacity so screens read cleanly)
function MobileOverlays() {
  return (
    <>
      <div style={{
        position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 3px)",
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 41, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)",
      }} />
    </>
  );
}

// Scanline CTA button — signature SolShot primary action
// Amber fill + horizontal raster lines across the button body
function ScanBtn({ children, width, height = 56, fontSize = 28, onClick, style = {} }) {
  return (
    <button onClick={onClick} style={{
      position: "relative",
      width: width || "100%",
      height,
      background: "var(--accent)",
      border: "1px solid var(--accent-hot)",
      clipPath: "var(--clip-10)",
      cursor: "pointer",
      padding: 0,
      overflow: "hidden",
      boxShadow: "0 0 18px rgba(232,164,48,0.22)",
      ...style,
    }}>
      {/* Scanline raster overlay on the button */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(to bottom, rgba(10,8,2,0) 0 2px, rgba(10,8,2,0.35) 2px 3px)",
      }} />
      <span className="stencil" style={{
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: "100%",
        fontSize, color: "#0e1209", letterSpacing: "0.22em",
        textIndent: "0.22em", lineHeight: 1,
        textShadow: "0 1px 0 rgba(255,220,140,0.35)",
      }}>{children}</span>
    </button>
  );
}

Object.assign(window, { PhoneFrame, StatusBar, MobileChrome, CurrencyChip, TerrainMini, TinyTank, MobileOverlays, ScanBtn, LogoMark, NotchPill });
