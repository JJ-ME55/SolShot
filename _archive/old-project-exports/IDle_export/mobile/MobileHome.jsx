/* global React, PhoneFrame, StatusBar, MobileOverlays, ScanBtn, LogoMark, NotchPill */
// Mobile Home — landscape port of web MainMenu, CRT terminal theme.
// Respects iPhone safe areas: notch (left), home bar (bottom).

// Turret pose matching web src/MainMenu.jsx exactly — scaled down for less congestion.
const TURRET = { x: -23, y: 48, rot: -3, w: 120 };
const tankImg = { imageRendering: "pixelated" };

function MobileHomeA() {
  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />

      {/* Subtle grid background — CRT terminal */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.08, zIndex: 0,
        backgroundImage: "linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* NOTCH PILL — lives in the safe-zone next to the camera, takes care of the "live stat" */}
      <NotchPill color="#7fd060">
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#7fd060", animation: "blink 1.6s infinite" }} />
        247 ONLINE
      </NotchPill>

      {/* TOPBAR — sits within safe area: left 52 (past notch), right 20 */}
      <div style={{
        position: "absolute", top: 22, left: 52, right: 20, zIndex: 10,
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 8 }}>
          <img src="assets/badge-bronze.png" style={{ width: 22, height: 22, filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.5))" }} alt="rank" />
          <div>
            <div style={{ fontFamily: "var(--f-sec)", fontSize: 11, color: "var(--bone)", letterSpacing: "0.08em", lineHeight: 1 }}>KillDotEm</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.25em", marginTop: 3 }}>BRONZE · LVL 1</div>
          </div>
        </div>

        {/* Wordmark — real PNG asset */}
        <LogoMark height={24} />

        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 14, fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em" }}>
          <span style={{ color: "var(--accent)" }}>◆ 1,240 SHOT</span>
          <span style={{ color: "var(--bone)" }}>◇ 2.31 SOL</span>
        </div>
      </div>

      {/* BODY — two columns: tank left, CTAs right. Generous gaps. Bottom respects home bar. */}
      <div style={{
        position: "absolute", top: 66, left: 52, right: 20, bottom: 28, zIndex: 3,
        display: "grid", gridTemplateColumns: "1fr 320px", gap: 24,
        alignItems: "center",
      }}>
        {/* LEFT — Tank hero, smaller with breathing room */}
        <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 200, height: 110 }}>
            <img src="assets/tank-tinted.png" alt="tank"
              style={{ ...tankImg, position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", width: 150,
                       filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.5))" }} />
            <img src="assets/tank-turret-tinted.png" alt="turret"
              style={{ ...tankImg, position: "absolute", bottom: TURRET.y, left: "50%",
                       width: TURRET.w,
                       transform: `translateX(${TURRET.x}%) rotate(${TURRET.rot}deg)`,
                       transformOrigin: "22% 70%",
                       filter: "drop-shadow(0 2px 0 rgba(0,0,0,0.5))" }} />
            {/* ground marks */}
            <div style={{ position: "absolute", bottom: 14, left: 15, right: 15, height: 2,
                          background: "repeating-linear-gradient(90deg, var(--muted) 0 8px, transparent 8px 14px)", opacity: 0.6 }} />
          </div>
        </div>

        {/* RIGHT — PLAY + ARMORY/BARRACKS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ScanBtn height={60} fontSize={30}>PLAY</ScanBtn>

          {[
            { label: "ARMORY",   sub: "GEAR · PRESTIGE · LOADOUT" },
            { label: "BARRACKS", sub: "STATS · LEADERBOARD" },
          ].map(b => (
            <button key={b.label} style={{
              padding: "10px 14px",
              background: "var(--bg-raised)", color: "var(--bone)",
              border: "1px solid var(--border)", clipPath: "var(--clip-6)",
              cursor: "pointer", textAlign: "left",
              display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6,
            }}>
              <div>
                <div className="stencil" style={{ fontSize: 13, letterSpacing: "0.18em", color: "var(--bone)", lineHeight: 1 }}>{b.label}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.22em", marginTop: 3 }}>{b.sub}</div>
              </div>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)" }}>▸</span>
            </button>
          ))}

          {/* HOW TO PLAY */}
          <a href="#" onClick={(e) => e.preventDefault()} style={{
            alignSelf: "center", marginTop: 2,
            fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)",
            letterSpacing: "0.28em", textDecoration: "none",
            borderBottom: "1px dotted var(--olive)", paddingBottom: 1,
          }}>HOW TO PLAY →</a>
        </div>
      </div>
    </PhoneFrame>
  );
}

Object.assign(window, { MobileHomeA });
