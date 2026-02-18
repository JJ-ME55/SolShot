import { useState } from "react";

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Share+Tech+Mono&family=Bebas+Neue&display=swap');

:root {
  --olive: #3d4a2f;
  --olive-dark: #2a331f;
  --olive-deep: #1a2010;
  --khaki: #b8a88a;
  --khaki-light: #d4c5a9;
  --rust: #c4510a;
  --rust-glow: #ff6b1a;
  --amber: #ffb627;
  --amber-dim: #a67b1a;
  --steel: #6b7b8d;
  --steel-dark: #3a4550;
  --bone: #e8dcc8;
  --mud: #5c4a3a;
  --black: #0a0c08;
  --green-glow: #7fff44;
  --red: #cc2200;
  --sol-purple: #9945FF;
  --sol-green: #14F195;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
.stencil { font-family: 'Black Ops One', cursive; }
.mono { font-family: 'Share Tech Mono', monospace; }
.bebas { font-family: 'Bebas Neue', sans-serif; }

@keyframes slide-in { from { transform: translateX(-16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slide-up { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes wind-drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(5px); } }
@keyframes cloud-drift { 0% { transform: translateX(0); } 100% { transform: translateX(30px); } }
@keyframes flicker { 0%,100%{opacity:1}50%{opacity:0.98}73%{opacity:0.99} }
@keyframes explosion-glow {
  0% { opacity: 0; transform: scale(0.5); }
  20% { opacity: 0.8; transform: scale(1.2); }
  100% { opacity: 0; transform: scale(2); }
}

.noise-overlay {
  position: absolute; inset: 0; opacity: 0.03; pointer-events: none; z-index: 100;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.scanlines {
  position: absolute; inset: 0; pointer-events: none; z-index: 99;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 4px);
}

input[type="range"] {
  -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px;
  background: var(--olive-dark); outline: none; width: 100%;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 14px; height: 14px;
  border-radius: 50%; cursor: pointer; border: 2px solid var(--bone); background: var(--amber);
}
`;

function BackButton({ onClick, forfeit }) {
  return (
    <button onClick={onClick} className="mono" style={{
      background: forfeit ? "rgba(140,20,0,0.5)" : "rgba(10,12,8,0.6)",
      border: `1px solid ${forfeit ? "var(--rust-glow)" : "var(--olive)"}`, borderRadius: 3,
      color: forfeit ? "var(--rust-glow)" : "var(--khaki)", fontSize: 10, padding: "4px 10px",
      cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.15s",
    }}>
      <span style={{ fontSize: 12 }}>◂</span> MENU
    </button>
  );
}

function WalletBar({ compact }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10 }}>
      <div className="mono" style={{ fontSize: compact ? 10 : 11, color: "var(--sol-green)" }}>◆ 2.41 SOL</div>
      <div style={{ width: 1, height: 12, background: "var(--olive)" }} />
      <div className="mono" style={{ fontSize: compact ? 10 : 11, color: "var(--amber)" }}>⬡ 847 SHOT</div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN MENU
// ═══════════════════════════════════════
function MainMenu({ go }) {
  const [h, setH] = useState(null);
  const items = [
    { label: "DEPLOY", sub: "Find a match", to: "lobby", accent: "var(--rust-glow)" },
    { label: "ARMORY", sub: "Weapons & loadout", to: "armory", accent: "var(--amber)" },
    { label: "PRESTIGE", sub: "Rank & burn", to: "prestige", accent: "var(--green-glow)" },
    { label: "BARRACKS", sub: "Profile & stats", to: "barracks", accent: "var(--steel)" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg, #0c1008 0%, #1a2a12 40%, #0a0c08 100%)" }}>
      {/* Terrain backdrop */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "55%",
        background: "linear-gradient(180deg, transparent 0%, #1a1208 50%)",
        clipPath: "polygon(0% 50%,5% 35%,12% 45%,20% 20%,28% 35%,35% 15%,42% 30%,50% 10%,58% 25%,65% 12%,72% 28%,78% 18%,85% 32%,92% 22%,100% 30%,100% 100%,0% 100%)",
        opacity: 0.4 }} />
      {/* Distant glow */}
      <div style={{ position: "absolute", top: "30%", left: "60%", width: 60, height: 60, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,107,26,0.25) 0%, transparent 70%)",
        animation: "explosion-glow 5s ease-out infinite" }} />

      {/* Left: Logo */}
      <div style={{ flex: "0 0 45%", display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 40px", position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ width: 40, height: 56, border: "2px solid var(--khaki)", borderRadius: "3px 3px 10px 10px",
            background: "linear-gradient(135deg, var(--steel-dark), var(--steel))",
            boxShadow: "0 3px 10px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: -7, width: 12, height: 12, borderRadius: "50%",
              border: "2px solid var(--khaki)", background: "var(--steel-dark)" }} />
            <span className="stencil" style={{ fontSize: 15, color: "var(--bone)" }}>S</span>
          </div>
          <div>
            <h1 className="stencil" style={{ fontSize: 44, color: "var(--bone)", letterSpacing: 2, lineHeight: 1,
              textShadow: "0 0 16px rgba(255,107,26,0.3), 0 3px 0 var(--mud)" }}>
              SOL<span style={{ color: "var(--rust-glow)" }}>SHOT</span>
            </h1>
            <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", letterSpacing: 3, opacity: 0.6, marginTop: 2 }}>
              ARTILLERY COMBAT ON SOLANA
            </div>
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4,
          background: "rgba(153,69,255,0.1)", border: "1px solid rgba(153,69,255,0.25)",
          borderRadius: 16, padding: "2px 10px", width: "fit-content", marginTop: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--sol-green)" }} />
          <span className="mono" style={{ fontSize: 8, color: "var(--sol-green)" }}>POWERED BY SOLANA</span>
        </div>
        <div style={{ marginTop: 20, padding: "8px 12px", background: "rgba(10,12,8,0.5)",
          border: "1px solid var(--olive)", borderRadius: 4, width: "fit-content" }}>
          <WalletBar />
        </div>
      </div>

      {/* Right: Menu */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 40px 0 20px", gap: 8, position: "relative", zIndex: 10 }}>
        {items.map((item, i) => (
          <button key={i} onClick={() => go(item.to)} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}
            className="stencil" style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", background: h === i ? "rgba(255,107,26,0.1)" : "rgba(26,32,16,0.7)",
              border: `1px solid ${h === i ? item.accent : "var(--olive)"}`,
              borderLeft: `3px solid ${item.accent}`, borderRadius: 4, cursor: "pointer",
              transition: "all 0.2s", animation: `slide-in 0.3s ease-out ${i * 0.08}s both`, textAlign: "left",
            }}>
            <div>
              <div style={{ fontSize: 16, color: "var(--bone)", letterSpacing: 2 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5, letterSpacing: 1, marginTop: 1 }}>{item.sub}</div>
            </div>
            <div style={{ fontSize: 14, color: item.accent, opacity: h === i ? 1 : 0.3,
              transition: "all 0.2s", transform: h === i ? "translateX(3px)" : "none" }}>▸</div>
          </button>
        ))}
      </div>
      <div className="mono" style={{ position: "absolute", bottom: 8, left: 16, fontSize: 8, color: "var(--khaki)", opacity: 0.3 }}>v0.1.0 ALPHA</div>
    </div>
  );
}

// ═══════════════════════════════════════
// ARMORY
// ═══════════════════════════════════════
function Armory({ go }) {
  const [sel, setSel] = useState(2);
  const budget = 7700;
  const weapons = [
    { name: "Mortar", price: 0, owned: 99, tier: "standard", desc: "Standard issue. Reliable arc, decent blast radius.", dmg: 25, blast: 30 },
    { name: "Cluster Bomb", price: 1200, owned: 3, tier: "standard", desc: "Splits into 5 bomblets on descent. Area denial.", dmg: 40, blast: 60 },
    { name: "Meltdown", price: 3500, owned: 1, tier: "rare", desc: "Napalm strike. Burns terrain for 3 turns.", dmg: 55, blast: 45 },
    { name: "Dirt Wall", price: 800, owned: 5, tier: "tactical", desc: "Raises terrain. Bury or shield.", dmg: 0, blast: 80 },
    { name: "Mega Roller", price: 5000, owned: 0, tier: "rare", desc: "Rolls downhill. Crushes everything in path.", dmg: 65, blast: 20 },
    { name: "U238 Penetrator", price: 8000, owned: 0, tier: "epic", desc: "Depleted uranium. Punches through terrain.", dmg: 80, blast: 10 },
    { name: "Tactical Nuke", price: 12000, owned: 0, tier: "legendary", desc: "Total devastation. Reshapes the battlefield.", dmg: 100, blast: 100 },
  ];
  const tc = { standard: "var(--khaki)", tactical: "var(--steel)", rare: "var(--amber)", epic: "var(--sol-purple)", legendary: "var(--rust-glow)" };
  const icons = { standard: "●", tactical: "▦", rare: "★", epic: "◆", legendary: "☢" };
  const w = weapons[sel];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid var(--olive)", background: "rgba(26,32,16,0.5)", flexShrink: 0 }}>
        <BackButton onClick={() => go("menu")} />
        <span className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: 2 }}>ARMORY</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="mono" style={{ fontSize: 12, color: "var(--amber)",
            background: "rgba(255,182,39,0.1)", border: "1px solid rgba(255,182,39,0.25)",
            padding: "2px 10px", borderRadius: 3 }}>${budget.toLocaleString()}</div>
          <WalletBar compact />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: "0 0 55%", overflow: "auto", padding: "8px 10px", borderRight: "1px solid var(--olive-dark)" }}>
          {weapons.map((wp, i) => (
            <div key={i} onClick={() => setSel(i)} style={{
              display: "flex", alignItems: "center", padding: "7px 10px", marginBottom: 2,
              background: sel === i ? "rgba(196,81,10,0.1)" : "rgba(26,32,16,0.3)",
              border: `1px solid ${sel === i ? tc[wp.tier] + "55" : "transparent"}`,
              borderLeft: `3px solid ${tc[wp.tier]}`, borderRadius: 3, cursor: "pointer", transition: "all 0.12s",
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 3, flexShrink: 0, marginRight: 8,
                background: `linear-gradient(135deg, var(--olive-dark), ${tc[wp.tier]}18)`,
                border: `1px solid ${tc[wp.tier]}33`, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 12 }}>{icons[wp.tier]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="stencil" style={{ fontSize: 11, color: tc[wp.tier], letterSpacing: 1 }}>{wp.name}</span>
                  <span className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.4 }}>×{wp.owned}</span>
                </div>
                <div style={{ height: 2, background: "var(--olive-dark)", borderRadius: 1, marginTop: 3 }}>
                  <div style={{ width: `${wp.dmg}%`, height: "100%", borderRadius: 1,
                    background: wp.dmg > 80 ? "var(--rust-glow)" : wp.dmg > 50 ? "var(--amber)" : "var(--khaki)" }} />
                </div>
              </div>
              <div className="mono" style={{ fontSize: 10, marginLeft: 8, flexShrink: 0,
                color: wp.price === 0 ? "var(--green-glow)" : wp.price > budget ? "var(--red)" : "var(--amber)" }}>
                {wp.price === 0 ? "FREE" : `$${wp.price.toLocaleString()}`}
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, padding: "14px 18px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 5,
              background: `linear-gradient(135deg, var(--olive-dark), ${tc[w.tier]}22)`,
              border: `2px solid ${tc[w.tier]}55`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 20 }}>{icons[w.tier]}</div>
            <div>
              <div className="stencil" style={{ fontSize: 16, color: tc[w.tier], letterSpacing: 1 }}>{w.name}</div>
              <div className="mono" style={{ fontSize: 8, color: tc[w.tier], opacity: 0.6, textTransform: "uppercase", letterSpacing: 2 }}>{w.tier}</div>
            </div>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--khaki)", opacity: 0.7, lineHeight: 1.5, marginBottom: 12 }}>{w.desc}</div>
          {[{ label: "DAMAGE", val: w.dmg, color: w.dmg > 80 ? "var(--rust-glow)" : "var(--amber)" },
            { label: "BLAST RADIUS", val: w.blast, color: "var(--khaki)" }].map((s, i) => (
            <div key={i} style={{ marginBottom: 7 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.5 }}>{s.label}</span>
                <span className="mono" style={{ fontSize: 7, color: s.color }}>{s.val}</span>
              </div>
              <div style={{ height: 3, background: "var(--olive-dark)", borderRadius: 2 }}>
                <div style={{ width: `${s.val}%`, height: "100%", borderRadius: 2, background: s.color, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="stencil" style={{ flex: 1, padding: "8px", borderRadius: 4,
              background: w.price <= budget ? "linear-gradient(180deg, var(--rust), #8a3a08)" : "var(--olive-dark)",
              border: `1px solid ${w.price <= budget ? "var(--rust-glow)" : "var(--olive)"}`,
              color: "var(--bone)", fontSize: 12, letterSpacing: 2, cursor: "pointer",
              opacity: w.price <= budget ? 1 : 0.4 }}>BUY</button>
            <button className="stencil" style={{ flex: 1, padding: "8px", borderRadius: 4,
              background: "var(--olive-dark)", border: "1px solid var(--olive)",
              color: "var(--khaki)", fontSize: 12, letterSpacing: 2, cursor: "pointer",
              opacity: w.owned > 0 ? 1 : 0.4 }}>SELL</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// BATTLE HUD — full landscape, layered sky/terrain
// ═══════════════════════════════════════
function BattleHUD({ go }) {
  const [angle, setAngle] = useState(53);
  const [power, setPower] = useState(72);
  const [wpn, setWpn] = useState(0);
  const wpns = ["Mortar ×99", "Cluster Bomb ×3", "Meltdown ×1"];
  const [showExit, setShowExit] = useState(false);

  return (
    <div style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      {/* SKY */}
      <div style={{ position: "absolute", inset: 0,
        background: "linear-gradient(180deg, #0a0f1a 0%, #162040 15%, #2a4060 28%, #4a6070 38%, #7a8868 48%, #c8a050 55%, #e8a030 60%, #d07028 65%, #6a4030 72%, #2a2018 82%, #0a0c08 100%)" }} />
      {/* Clouds */}
      <div style={{ position: "absolute", top: "6%", left: "8%", width: 160, height: 16, borderRadius: 20,
        background: "rgba(180,170,160,0.06)", animation: "cloud-drift 25s linear infinite" }} />
      <div style={{ position: "absolute", top: "14%", left: "55%", width: 110, height: 12, borderRadius: 20,
        background: "rgba(180,170,160,0.04)", animation: "cloud-drift 32s linear 5s infinite" }} />
      <div style={{ position: "absolute", top: "10%", left: "30%", width: 90, height: 10, borderRadius: 20,
        background: "rgba(200,180,140,0.05)", animation: "cloud-drift 28s linear 10s infinite" }} />
      {/* Sun glow */}
      <div style={{ position: "absolute", top: "30%", left: "72%", width: 140, height: 140, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(232,160,48,0.2) 0%, rgba(208,112,40,0.06) 40%, transparent 70%)" }} />

      {/* TERRAIN */}
      <svg viewBox="0 0 960 380" preserveAspectRatio="none" style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "60%" }}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a6a38" />
            <stop offset="15%" stopColor="#4a5a2a" />
            <stop offset="50%" stopColor="#3a4820" />
            <stop offset="100%" stopColor="#1a2010" />
          </linearGradient>
          <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a5530" />
            <stop offset="100%" stopColor="#1a1a0a" />
          </linearGradient>
        </defs>
        {/* Back hills */}
        <path d="M0,180 Q80,130 160,155 Q240,90 320,135 Q400,70 480,115 Q560,55 640,105 Q720,50 800,95 Q880,65 960,85 L960,380 L0,380Z"
          fill="url(#tg2)" opacity="0.5" />
        {/* Main terrain */}
        <path d="M0,230 L30,222 Q60,205 90,215 L120,195 Q150,168 180,180 L210,162 Q240,138 270,150 L300,128 Q330,148 360,138 L390,155 Q420,138 450,148 L480,118 Q510,136 540,128 L570,142 Q600,128 630,148 L660,132 Q690,150 720,138 L750,155 Q780,142 810,160 L840,148 Q870,165 900,152 L930,170 L960,158 L960,380 L0,380Z"
          fill="url(#tg)" />
        {/* Terrain detail */}
        <path d="M0,255 Q120,242 240,250 Q360,238 480,245 Q600,232 720,242 Q840,236 960,244" fill="none" stroke="rgba(90,106,56,0.25)" strokeWidth="1" />
        <path d="M0,290 Q120,282 240,288 Q360,278 480,285 Q600,275 720,283 Q840,278 960,282" fill="none" stroke="rgba(50,60,30,0.2)" strokeWidth="1" />

        {/* Crater from previous shot */}
        <ellipse cx="450" cy="148" rx="18" ry="6" fill="#2a2a15" opacity="0.6" />

        {/* Player tank (left side) */}
        <g transform="translate(155, 155)">
          <rect x="-14" y="2" width="28" height="11" rx="2" fill="#3a4a28" stroke="#7a8a5a" strokeWidth="0.8" />
          <line x1="0" y1="5" x2="-22" y2="-10" stroke="#7a8a5a" strokeWidth="2.8" strokeLinecap="round" />
          <rect x="-16" y="13" width="32" height="6" rx="2" fill="#2a3a1a" stroke="#5a6a3a" strokeWidth="0.5" />
          <circle cx="-10" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5" />
          <circle cx="-2" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5" />
          <circle cx="6" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5" />
          <circle cx="14" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5" />
          {/* Flag */}
          <line x1="0" y1="-2" x2="0" y2="-16" stroke="#7a8a5a" strokeWidth="0.8" />
          <polygon points="0,-16 12,-13 0,-10" fill="var(--green-glow)" opacity="0.7" />
          <text x="0" y="-20" textAnchor="middle" fill="var(--green-glow)" fontSize="9" fontFamily="Share Tech Mono" fontWeight="bold">You</text>
        </g>

        {/* Enemy tank (right side) */}
        <g transform="translate(720, 115)">
          <rect x="-14" y="2" width="28" height="11" rx="2" fill="#5a2a1a" stroke="#aa5533" strokeWidth="0.8" />
          <line x1="0" y1="5" x2="20" y2="-8" stroke="#aa5533" strokeWidth="2.8" strokeLinecap="round" />
          <rect x="-16" y="13" width="32" height="6" rx="2" fill="#4a2010" stroke="#8a4422" strokeWidth="0.5" />
          <circle cx="-10" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5" />
          <circle cx="-2" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5" />
          <circle cx="6" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5" />
          <circle cx="14" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5" />
          <line x1="0" y1="-2" x2="0" y2="-16" stroke="#aa5533" strokeWidth="0.8" />
          <polygon points="0,-16 12,-13 0,-10" fill="var(--rust-glow)" opacity="0.7" />
          <text x="0" y="-20" textAnchor="middle" fill="var(--rust-glow)" fontSize="9" fontFamily="Share Tech Mono">xXDestroyerXx</text>
        </g>

        {/* Trajectory arc hint */}
        <path d="M140,148 Q380,0 708,108" fill="none" stroke="rgba(255,182,39,0.15)" strokeWidth="1" strokeDasharray="6,6" />
      </svg>

      {/* === HUD === */}

      {/* Top-left: Menu + Wind */}
      <div style={{ position: "absolute", top: 8, left: 10, display: "flex", gap: 6, zIndex: 20 }}>
        <button onClick={() => setShowExit(!showExit)} className="mono" style={{
          background: "rgba(10,12,8,0.7)", border: "1px solid var(--olive)", borderRadius: 3,
          color: "var(--khaki)", fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>☰</button>
        {showExit && (
          <button onClick={() => go("menu")} className="mono" style={{
            background: "rgba(140,20,0,0.8)", border: "1px solid var(--rust-glow)", borderRadius: 3,
            color: "var(--bone)", fontSize: 9, padding: "4px 10px", cursor: "pointer",
            animation: "slide-in 0.15s ease-out" }}>
            ✕ EXIT MATCH — FORFEIT 0.16 SOL
          </button>
        )}
        <div style={{ background: "rgba(10,12,8,0.7)", border: "1px solid var(--olive)",
          borderRadius: 3, padding: "3px 10px", display: "flex", alignItems: "center", gap: 5 }}>
          <span className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5 }}>WIND</span>
          <span className="stencil" style={{ fontSize: 15, color: "var(--bone)" }}>23</span>
          <span style={{ fontSize: 13, color: "var(--amber)", animation: "wind-drift 2s ease-in-out infinite" }}>→</span>
        </div>
      </div>

      {/* Top-center: SOL Pot */}
      <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 20,
        background: "rgba(10,12,8,0.7)", border: "1px solid var(--sol-green)",
        borderRadius: 4, padding: "3px 16px", display: "flex", alignItems: "center", gap: 6 }}>
        <span className="mono" style={{ fontSize: 8, color: "var(--sol-green)", opacity: 0.6 }}>POT</span>
        <span className="mono" style={{ fontSize: 15, color: "var(--sol-green)", fontWeight: "bold" }}>0.32 SOL</span>
      </div>

      {/* Top-right: Round */}
      <div style={{ position: "absolute", top: 8, right: 10, zIndex: 20,
        background: "rgba(10,12,8,0.7)", border: "1px solid var(--olive)", borderRadius: 3, padding: "3px 10px" }}>
        <span className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5 }}>ROUND </span>
        <span className="stencil" style={{ fontSize: 14, color: "var(--bone)" }}>3 / 5</span>
      </div>

      {/* Health bars */}
      <div style={{ position: "absolute", top: 36, left: 10, right: 10, display: "flex", gap: 30, zIndex: 20 }}>
        <div style={{ flex: "0 0 180px" }}>
          <div className="mono" style={{ fontSize: 7, color: "var(--green-glow)", marginBottom: 2 }}>YOU — 78 HP</div>
          <div style={{ height: 3, background: "rgba(10,12,8,0.5)", borderRadius: 2 }}>
            <div style={{ width: "78%", height: "100%", borderRadius: 2, background: "var(--green-glow)" }} />
          </div>
        </div>
        <div style={{ flex: "0 0 180px", marginLeft: "auto" }}>
          <div className="mono" style={{ fontSize: 7, color: "var(--rust-glow)", marginBottom: 2, textAlign: "right" }}>xXDestroyerXx — 45 HP</div>
          <div style={{ height: 3, background: "rgba(10,12,8,0.5)", borderRadius: 2 }}>
            <div style={{ width: "45%", height: "100%", borderRadius: 2, background: "var(--rust-glow)", marginLeft: "auto" }} />
          </div>
        </div>
      </div>

      {/* Bottom-left: Angle */}
      <div style={{ position: "absolute", bottom: 10, left: 10, zIndex: 20,
        background: "rgba(10,12,8,0.75)", border: "1px solid var(--olive)", borderRadius: 4, padding: "6px 12px", width: 160 }}>
        <div className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.5, marginBottom: 2 }}>ANGLE</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="bebas" style={{ fontSize: 28, color: "var(--bone)", lineHeight: 1, width: 44 }}>{angle}°</span>
          <input type="range" min="0" max="90" value={angle} onChange={e => setAngle(+e.target.value)}
            style={{ flex: 1, accentColor: "var(--amber)" }} />
        </div>
      </div>

      {/* Bottom-center: Weapon + Fire */}
      <div style={{ position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 20,
        display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6,
          background: "rgba(10,12,8,0.75)", border: "1px solid var(--olive)", borderRadius: 4, padding: "6px 10px" }}>
          <button onClick={() => setWpn(Math.max(0, wpn - 1))} style={{
            background: "none", border: "1px solid var(--olive)", borderRadius: 2,
            color: "var(--khaki)", fontSize: 13, padding: "1px 7px", cursor: "pointer", lineHeight: 1 }}>◂</button>
          <span className="stencil" style={{ fontSize: 11, color: "var(--amber)", letterSpacing: 1, minWidth: 130, textAlign: "center" }}>
            {wpns[wpn]}
          </span>
          <button onClick={() => setWpn(Math.min(wpns.length - 1, wpn + 1))} style={{
            background: "none", border: "1px solid var(--olive)", borderRadius: 2,
            color: "var(--khaki)", fontSize: 13, padding: "1px 7px", cursor: "pointer", lineHeight: 1 }}>▸</button>
        </div>
        <button className="stencil" style={{
          padding: "10px 30px", fontSize: 18, letterSpacing: 5,
          color: "var(--bone)", background: "linear-gradient(180deg, #cc3300, #881a00)",
          border: "2px solid var(--rust-glow)", borderRadius: 5, cursor: "pointer",
          boxShadow: "0 0 20px rgba(204,51,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          textShadow: "0 2px 4px rgba(0,0,0,0.5)" }}>
          FIRE
        </button>
      </div>

      {/* Bottom-right: Power */}
      <div style={{ position: "absolute", bottom: 10, right: 10, zIndex: 20,
        background: "rgba(10,12,8,0.75)", border: "1px solid var(--olive)", borderRadius: 4, padding: "6px 12px", width: 160 }}>
        <div className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.5, marginBottom: 2 }}>POWER</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="bebas" style={{ fontSize: 28, color: power > 80 ? "var(--rust-glow)" : "var(--bone)", lineHeight: 1, width: 44 }}>{power}%</span>
          <input type="range" min="0" max="100" value={power} onChange={e => setPower(+e.target.value)}
            style={{ flex: 1, accentColor: "var(--rust-glow)" }} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// PRESTIGE
// ═══════════════════════════════════════
function Prestige({ go }) {
  const cp = 3;
  const tokens = 847;
  const tiers = [
    { level: 1, cost: 200, name: "Private", color: "#8a8a7a" },
    { level: 2, cost: 400, name: "Corporal", color: "#a0a090" },
    { level: 3, cost: 600, name: "Sergeant", color: "#b8a88a" },
    { level: 4, cost: 900, name: "Lieutenant", color: "#c4a030" },
    { level: 5, cost: 1200, name: "Captain", color: "#daa520" },
    { level: 6, cost: 1600, name: "Major", color: "#ff8c00" },
    { level: 7, cost: 2000, name: "Colonel", color: "#ff6b1a" },
    { level: 8, cost: 2500, name: "Brigadier", color: "#cc2200" },
    { level: 9, cost: 3000, name: "General", color: "#9945FF" },
    { level: 10, cost: 4000, name: "Marshal", color: "#14F195" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid var(--olive)", background: "rgba(26,32,16,0.5)", flexShrink: 0 }}>
        <BackButton onClick={() => go("menu")} />
        <span className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: 2 }}>PRESTIGE</span>
        <WalletBar compact />
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Current rank */}
        <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "16px 24px", borderRight: "1px solid var(--olive-dark)" }}>
          <div style={{ width: 90, height: 90, borderRadius: "50%", margin: "0 auto 14px",
            background: `conic-gradient(${tiers[cp - 1].color} ${cp * 36}deg, var(--olive-dark) 0deg)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 24px ${tiers[cp - 1].color}33` }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "var(--black)",
              display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
              <span className="bebas" style={{ fontSize: 32, color: tiers[cp - 1].color, lineHeight: 1 }}>{cp}</span>
              <span className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.5 }}>PRESTIGE</span>
            </div>
          </div>
          <div className="stencil" style={{ fontSize: 16, color: tiers[cp - 1].color, letterSpacing: 2, marginBottom: 4 }}>
            {tiers[cp - 1].name.toUpperCase()}
          </div>
          <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.5, textAlign: "center" }}>
            Next: {tiers[cp].name}
          </div>
          <div className="mono" style={{ fontSize: 9, color: "var(--amber)", marginTop: 2 }}>
            🔥 {tiers[cp].cost} SHOT to prestige
          </div>

          <div style={{ marginTop: 16, width: "100%" }}>
            <div className="mono" style={{ fontSize: 8, color: "var(--rust-glow)", textAlign: "center", marginBottom: 6, lineHeight: 1.4 }}>
              ⚠ RESETS WEAPONS<br/>TOKENS BURNED FOREVER
            </div>
            <button className="stencil" style={{
              width: "100%", padding: "10px", fontSize: 13, letterSpacing: 2,
              color: tokens >= tiers[cp].cost ? "var(--bone)" : "var(--khaki)",
              background: tokens >= tiers[cp].cost
                ? "linear-gradient(180deg, var(--amber-dim), #6a4a10)" : "var(--olive-dark)",
              border: `1px solid ${tokens >= tiers[cp].cost ? "var(--amber)" : "var(--olive)"}`,
              borderRadius: 4, cursor: tokens >= tiers[cp].cost ? "pointer" : "not-allowed",
              opacity: tokens >= tiers[cp].cost ? 1 : 0.5 }}>
              🔥 PRESTIGE UP
            </button>
          </div>
        </div>

        {/* Right: Ladder */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
          {tiers.map((t, i) => {
            const unlocked = i < cp;
            const current = i === cp - 1;
            const next = i === cp;
            return (
              <div key={i} style={{
                display: "flex", alignItems: "center", padding: "7px 10px", marginBottom: 2,
                background: current ? "rgba(196,81,10,0.08)" : next ? "rgba(255,182,39,0.04)" : "transparent",
                border: `1px solid ${current ? t.color + "33" : "transparent"}`,
                borderRadius: 3, opacity: unlocked || next ? 1 : 0.35,
              }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, marginRight: 10,
                  background: unlocked ? t.color + "18" : "var(--olive-dark)",
                  border: `2px solid ${unlocked ? t.color : "var(--olive)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {unlocked ? <span style={{ color: t.color, fontSize: 11 }}>✓</span>
                    : <span className="bebas" style={{ color: "var(--khaki)", fontSize: 12, opacity: 0.4 }}>{t.level}</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="stencil" style={{ fontSize: 11, color: unlocked ? t.color : "var(--khaki)", letterSpacing: 1 }}>{t.name}</span>
                    {!unlocked && <span className="mono" style={{ fontSize: 9, color: next ? "var(--amber)" : "var(--khaki)", opacity: next ? 1 : 0.3 }}>
                      🔥 {t.cost}
                    </span>}
                  </div>
                  {current && <div className="mono" style={{ fontSize: 7, color: "var(--green-glow)", marginTop: 1 }}>● CURRENT</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOBBY (Deploy screen)
// ═══════════════════════════════════════
function Lobby({ go }) {
  const matches = [
    { host: "TankGod_99", p: 7, wager: 0.1, slots: "3/4", map: "DESERT RIDGE", mode: "FFA" },
    { host: "SolSniper", p: 2, wager: 0.05, slots: "2/4", map: "MOUNTAIN PASS", mode: "FFA" },
    { host: "NukeEmAll", p: 10, wager: 0.5, slots: "1/2", map: "URBAN RUINS", mode: "1v1" },
    { host: "CasualCarl", p: 0, wager: 0.02, slots: "2/4", map: "GREEN VALLEY", mode: "FFA" },
    { host: "WhaleAlert", p: 5, wager: 1.0, slots: "1/4", map: "FORTRESS", mode: "FFA" },
    { host: "BootCamp_Bry", p: 1, wager: 0.03, slots: "3/4", map: "TRAINING GROUND", mode: "FFA" },
  ];
  const pc = ["#666","#8a8a7a","#a0a090","#b8a88a","#c4a030","#daa520","#ff8c00","#ff6b1a","#cc2200","#9945FF","#14F195"];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid var(--olive)", background: "rgba(26,32,16,0.5)", flexShrink: 0 }}>
        <BackButton onClick={() => go("menu")} />
        <span className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: 2 }}>DEPLOY</span>
        <WalletBar compact />
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Quick actions */}
        <div style={{ flex: "0 0 30%", padding: "12px 14px", borderRight: "1px solid var(--olive-dark)",
          display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="stencil" style={{
            width: "100%", padding: "14px 10px", fontSize: 14, letterSpacing: 2,
            color: "var(--bone)", background: "linear-gradient(180deg, #cc3300, #881a00)",
            border: "2px solid var(--rust-glow)", borderRadius: 5, cursor: "pointer",
            boxShadow: "0 0 16px rgba(204,51,0,0.3)", textAlign: "center" }}>
            ⚡ QUICK MATCH
            <div className="mono" style={{ fontSize: 9, opacity: 0.7, marginTop: 3, letterSpacing: 1, fontFamily: "'Share Tech Mono'" }}>0.08 SOL · 4 PLAYER FFA</div>
          </button>
          <button className="stencil" style={{
            width: "100%", padding: "10px", fontSize: 12, letterSpacing: 2,
            color: "var(--amber)", background: "var(--olive-dark)", border: "1px solid var(--olive)",
            borderRadius: 4, cursor: "pointer", textAlign: "center" }}>
            1v1 DUEL
            <div className="mono" style={{ fontSize: 9, opacity: 0.5, marginTop: 2, letterSpacing: 1, fontFamily: "'Share Tech Mono'" }}>0.1 SOL · HEAD TO HEAD</div>
          </button>
          <button className="stencil" style={{
            width: "100%", padding: "10px", fontSize: 12, letterSpacing: 2,
            color: "var(--sol-green)", background: "var(--olive-dark)", border: "1px solid var(--olive)",
            borderRadius: 4, cursor: "pointer", textAlign: "center" }}>
            HIGH ROLLER
            <div className="mono" style={{ fontSize: 9, opacity: 0.5, marginTop: 2, letterSpacing: 1, fontFamily: "'Share Tech Mono'" }}>0.5+ SOL · BIG STAKES</div>
          </button>
          <div style={{ flex: 1 }} />
          <button className="stencil" style={{
            width: "100%", padding: "8px", fontSize: 11, letterSpacing: 2,
            color: "var(--khaki)", background: "transparent", border: "1px solid var(--olive)",
            borderRadius: 4, cursor: "pointer" }}>
            + CREATE MATCH
          </button>
        </div>

        {/* Right: Lobby list */}
        <div style={{ flex: 1, overflow: "auto", padding: "8px 10px" }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.4, letterSpacing: 2, marginBottom: 6, paddingLeft: 4 }}>
            OPEN LOBBIES — {matches.length} MATCHES
          </div>
          {matches.map((m, i) => (
            <div key={i} onClick={() => go("battle")} style={{
              display: "flex", alignItems: "center", padding: "8px 12px", marginBottom: 3,
              background: "rgba(26,32,16,0.35)", border: "1px solid var(--olive-dark)",
              borderRadius: 3, cursor: "pointer", transition: "all 0.12s",
            }}>
              {/* Prestige badge */}
              <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginRight: 10,
                background: m.p > 0 ? pc[m.p] + "15" : "var(--olive-dark)",
                border: `1.5px solid ${m.p > 0 ? pc[m.p] : "var(--olive)"}`,
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="bebas" style={{ fontSize: 11, color: pc[m.p] }}>{m.p > 0 ? `P${m.p}` : "—"}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="stencil" style={{ fontSize: 11, color: "var(--bone)", letterSpacing: 1 }}>{m.host}</span>
                  <span className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.4,
                    background: "var(--olive-dark)", padding: "1px 5px", borderRadius: 2 }}>{m.mode}</span>
                </div>
                <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5, marginTop: 2 }}>
                  {m.map} · {m.slots}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 12, color: "var(--sol-green)", fontWeight: "bold" }}>{m.wager} SOL</div>
                <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.4, marginTop: 1 }}>JOIN ▸</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// BARRACKS (stub)
// ═══════════════════════════════════════
function Barracks({ go }) {
  const stats = [
    { label: "MATCHES PLAYED", val: "342" },
    { label: "WIN RATE", val: "58.2%" },
    { label: "TOTAL KILLS", val: "891" },
    { label: "SOL EARNED", val: "14.7 SOL" },
    { label: "SOL WAGERED", val: "28.3 SOL" },
    { label: "TOKENS BURNED", val: "1,200 SHOT" },
    { label: "FAVOURITE WEAPON", val: "Cluster Bomb" },
    { label: "LONGEST STREAK", val: "12 wins" },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "8px 16px", borderBottom: "1px solid var(--olive)", background: "rgba(26,32,16,0.5)", flexShrink: 0 }}>
        <BackButton onClick={() => go("menu")} />
        <span className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: 2 }}>BARRACKS</span>
        <WalletBar compact />
      </div>
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Profile */}
        <div style={{ flex: "0 0 35%", display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "16px 20px", borderRight: "1px solid var(--olive-dark)" }}>
          {/* Tank avatar */}
          <div style={{ width: 80, height: 80, borderRadius: "50%", marginBottom: 12,
            background: "linear-gradient(135deg, var(--olive-dark), var(--olive))",
            border: "2px solid var(--khaki)", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(184,168,138,0.1)" }}>
            <span style={{ fontSize: 32 }}>⬡</span>
          </div>
          <div className="stencil" style={{ fontSize: 16, color: "var(--bone)", letterSpacing: 1, marginBottom: 2 }}>PLAYER_ONE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 8, color: "#b8a88a", background: "#b8a88a18", border: "1px solid #b8a88a33",
              borderRadius: 3, padding: "1px 5px", fontFamily: "'Bebas Neue'", letterSpacing: 1 }}>P3</span>
            <span className="mono" style={{ fontSize: 9, color: "#b8a88a" }}>SERGEANT</span>
          </div>
          <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.4 }}>Joined Dec 2025</div>
        </div>

        {/* Right: Stats grid */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.4, letterSpacing: 2, marginBottom: 8 }}>
            COMBAT RECORD
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ padding: "10px 12px", background: "rgba(26,32,16,0.35)",
                border: "1px solid var(--olive-dark)", borderRadius: 3 }}>
                <div className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.5, letterSpacing: 1, marginBottom: 3 }}>{s.label}</div>
                <div className="stencil" style={{ fontSize: 14, color: "var(--bone)", letterSpacing: 1 }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════
export default function SolShot() {
  const [screen, setScreen] = useState("menu");

  const go = (s) => setScreen(s);

  const renderScreen = () => {
    switch (screen) {
      case "menu": return <MainMenu go={go} />;
      case "armory": return <Armory go={go} />;
      case "battle": return <BattleHUD go={go} />;
      case "prestige": return <Prestige go={go} />;
      case "lobby": return <Lobby go={go} />;
      case "barracks": return <Barracks go={go} />;
      default: return <MainMenu go={go} />;
    }
  };

  return (
    <div style={{
      background: "#030405",
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px",
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <style>{styles}</style>
      <div style={{
        width: "100%",
        maxWidth: 860,
        aspectRatio: "16/9",
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        border: "1px solid var(--olive)",
        boxShadow: "0 0 40px rgba(0,0,0,0.5), 0 0 80px rgba(10,12,8,0.3)",
        animation: "flicker 5s infinite",
      }}>
        <div className="noise-overlay" />
        <div className="scanlines" />
        {renderScreen()}
      </div>
    </div>
  );
}
