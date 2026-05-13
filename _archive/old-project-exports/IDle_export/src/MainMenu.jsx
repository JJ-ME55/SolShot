/* global React, Wordmark, Terrain */
const { useState: useStateMenu, useEffect: useEffectMenu } = React;

// Final turret pose — dialed in manually
const TURRET = { x: -23, y: 80, rot: -3, w: 198 };

function MainMenu({ onNav }) {
  const [onlineCount, setOnlineCount] = useStateMenu(247);

  useEffectMenu(() => {
    const t = setInterval(() => setOnlineCount(c => Math.max(180, Math.min(320, c + Math.floor(Math.random() * 9) - 4))), 2400);
    return () => clearInterval(t);
  }, []);

  const secondary = [
    { id: "armory",   label: "ARMORY",   sub: "GEAR · PRESTIGE · LOADOUT", route: "armory" },
    { id: "barracks", label: "BARRACKS", sub: "STATS · LEADERBOARD",       route: "barracks" },
  ];

  const tankImgStyle = { imageRendering: "pixelated" };

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)", overflow: "hidden" }}>
      {/* grid */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.05,
        backgroundImage: "linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />

      {/* Top bar */}
      <div style={{
        position: "relative", zIndex: 3,
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center", padding: "14px 28px",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 10 }}>
          <img src="assets/badge-bronze.png" style={{ width: 28, height: 28, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))" }} alt="rank" />
          <div>
            <div style={{ fontFamily: "var(--f-sec)", fontSize: 13, color: "var(--bone)", letterSpacing: "0.1em" }}>KillDotEm</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em" }}>BRONZE · LVL 1</div>
          </div>
        </div>
        <Wordmark size={34} />
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 14, fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.15em" }}>
          <span style={{ color: "var(--accent)" }}>◆ 1,240 SHOT</span>
          <span style={{ color: "var(--bone)" }}>◇ 2.31 SOL</span>
        </div>
      </div>

      {/* Hero */}
      <div style={{ position: "relative", zIndex: 3, maxWidth: 420, margin: "0 auto", padding: "24px 24px 60px", textAlign: "center" }}>
        {/* Tank preview — composited body + turret */}
        <div style={{ position: "relative", height: 140, marginBottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 280, height: 140 }}>
            {/* body */}
            <img src="assets/tank-tinted.png" alt="tank"
              style={{ ...tankImgStyle, position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", width: 240, height: "auto",
                       filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.5))" }} />
            {/* turret */}
            <img src="assets/tank-turret-tinted.png" alt="turret"
              style={{ ...tankImgStyle, position: "absolute", bottom: TURRET.y, left: "50%",
                       width: TURRET.w, height: "auto",
                       transform: `translateX(${TURRET.x}%) rotate(${TURRET.rot}deg)`,
                       transformOrigin: "22% 70%",
                       filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.5))" }} />
          </div>
          {/* ground marks */}
          <div style={{ position: "absolute", bottom: 0, left: "18%", right: "18%", height: 2, background: "repeating-linear-gradient(90deg, var(--muted) 0 8px, transparent 8px 14px)", opacity: 0.5 }} />
        </div>

        {/* Primary PLAY */}
        <button onClick={() => onNav("deploy")} style={{
          width: "100%", padding: "28px 22px",
          background: "var(--accent)", color: "#0e1209",
          border: "1px solid var(--accent-hot)", clipPath: "var(--clip-10)",
          fontFamily: "var(--f-display)", fontSize: 44, letterSpacing: "0.22em",
          cursor: "pointer", boxShadow: "0 0 28px rgba(218,138,40,0.25)",
          marginBottom: 10,
          textAlign: "center", textIndent: "0.22em",
        }}>
          PLAY
        </button>

        {/* Secondary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
          {secondary.map(b => (
            <button key={b.id} onClick={() => onNav(b.route)} style={{
              padding: "13px 18px",
              background: "var(--bg-raised)",
              color: "var(--bone)",
              border: "1px solid var(--border)", clipPath: "var(--clip-6)",
              cursor: "pointer",
              textAlign: "left",
              display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10,
            }}>
              <div>
                <div className="stencil" style={{ fontSize: 15, letterSpacing: "0.18em", color: "var(--bone)" }}>{b.label}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 3 }}>{b.sub}</div>
              </div>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 14, color: "var(--olive)" }}>▸</span>
            </button>
          ))}
        </div>

        <a href="#" onClick={(e) => e.preventDefault()} style={{
          display: "inline-block",
          fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)",
          letterSpacing: "0.25em", textDecoration: "none",
          borderBottom: "1px dotted var(--olive)", paddingBottom: 2,
          marginBottom: 14,
        }}>
          HOW TO PLAY →
        </a>

        <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.2em" }}>
          <span style={{ color: "#7fd060" }}>●</span> {onlineCount} ONLINE · MAINNET BETA
        </div>
      </div>

      <Terrain variant={0} />
    </div>
  );
}

window.MainMenu = MainMenu;
