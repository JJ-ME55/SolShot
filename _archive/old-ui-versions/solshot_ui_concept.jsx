import { useState } from "react";

const screens = ["MAIN MENU", "ARMORY", "BATTLE HUD", "PRESTIGE", "LOBBY"];

// Military stencil-style CSS
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

body { background: var(--black); }

.screen-container {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  height: 680px;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 2px solid var(--olive);
}

/* Noise texture overlay */
.noise-overlay {
  position: absolute;
  inset: 0;
  opacity: 0.04;
  pointer-events: none;
  z-index: 100;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
}

/* Scanline effect */
.scanlines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 99;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 2px,
    rgba(0,0,0,0.03) 2px,
    rgba(0,0,0,0.03) 4px
  );
}

.stencil { font-family: 'Black Ops One', cursive; }
.mono { font-family: 'Share Tech Mono', monospace; }
.bebas { font-family: 'Bebas Neue', sans-serif; }

/* Animations */
@keyframes flicker {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.97; }
  73% { opacity: 0.99; }
}

@keyframes pulse-glow {
  0%, 100% { text-shadow: 0 0 8px var(--rust-glow), 0 0 20px rgba(255,107,26,0.3); }
  50% { text-shadow: 0 0 12px var(--rust-glow), 0 0 30px rgba(255,107,26,0.5); }
}

@keyframes slide-in {
  from { transform: translateX(-20px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes badge-shine {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}

@keyframes scope-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.05); opacity: 0.8; }
}

@keyframes wind-drift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(4px); }
}

@keyframes shell-arc {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  25% { transform: translate(60px, -80px) rotate(90deg); opacity: 1; }
  50% { transform: translate(120px, -40px) rotate(180deg); opacity: 1; }
  75% { transform: translate(180px, 30px) rotate(270deg); opacity: 0.8; }
  100% { transform: translate(220px, 100px) rotate(360deg); opacity: 0; }
}

@keyframes explosion-bloom {
  0% { transform: scale(0); opacity: 1; }
  50% { transform: scale(1); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}
`;

// ═══════════════════════════════════════
// MAIN MENU SCREEN
// ═══════════════════════════════════════
function MainMenu({ onNavigate }) {
  const [hovered, setHovered] = useState(null);
  
  return (
    <div style={{
      height: "100%",
      background: `
        linear-gradient(180deg, 
          #0c1008 0%, 
          #1a2a12 30%, 
          #2a3a1f 60%, 
          #1a1a0a 100%
        )
      `,
      position: "relative",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Sky/terrain backdrop */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "45%",
        background: `
          linear-gradient(180deg, transparent 0%, #1a1208 40%),
          linear-gradient(135deg, #2a3320 0%, #1a2010 50%, #0f1508 100%)
        `,
        clipPath: "polygon(0% 35%, 8% 20%, 15% 30%, 25% 10%, 35% 25%, 45% 5%, 55% 20%, 65% 8%, 75% 22%, 85% 12%, 92% 28%, 100% 15%, 100% 100%, 0% 100%)",
        opacity: 0.6,
      }} />
      
      {/* Distant explosions */}
      <div style={{
        position: "absolute",
        top: "38%",
        left: "25%",
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,107,26,0.4) 0%, transparent 70%)",
        animation: "explosion-bloom 3s ease-out infinite",
      }} />
      <div style={{
        position: "absolute",
        top: "42%",
        right: "20%",
        width: 30,
        height: 30,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,182,39,0.3) 0%, transparent 70%)",
        animation: "explosion-bloom 4s ease-out 1.5s infinite",
      }} />
      
      {/* Logo area */}
      <div style={{ 
        padding: "60px 30px 20px", 
        textAlign: "center",
        position: "relative",
        zIndex: 10,
      }}>
        {/* Dog tag decoration */}
        <div style={{
          width: 50,
          height: 70,
          border: "2px solid var(--khaki)",
          borderRadius: "4px 4px 12px 12px",
          margin: "0 auto 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, var(--steel-dark), var(--steel))",
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute",
            top: -8,
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: "2px solid var(--khaki)",
            background: "var(--steel-dark)",
          }} />
          <span className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: -1 }}>S</span>
        </div>
        
        <h1 className="stencil" style={{
          fontSize: 52,
          color: "var(--bone)",
          letterSpacing: 3,
          textShadow: "0 0 20px rgba(255,107,26,0.4), 0 4px 0 var(--mud), 0 6px 20px rgba(0,0,0,0.8)",
          lineHeight: 1,
          marginBottom: 4,
        }}>
          SOL<span style={{ color: "var(--rust-glow)" }}>SHOT</span>
        </h1>
        
        <div className="mono" style={{
          fontSize: 10,
          color: "var(--khaki)",
          letterSpacing: 4,
          textTransform: "uppercase",
          opacity: 0.7,
        }}>
          ARTILLERY COMBAT ON SOLANA
        </div>
        
        {/* SOL badge */}
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "rgba(153,69,255,0.15)",
          border: "1px solid rgba(153,69,255,0.3)",
          borderRadius: 20,
          padding: "3px 10px",
          marginTop: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sol-green)" }} />
          <span className="mono" style={{ fontSize: 9, color: "var(--sol-green)" }}>POWERED BY SOLANA</span>
        </div>
      </div>
      
      {/* Menu buttons */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 40px",
        gap: 10,
        position: "relative",
        zIndex: 10,
      }}>
        {[
          { label: "DEPLOY", sub: "Find a match", screen: 2, accent: "var(--rust-glow)" },
          { label: "ARMORY", sub: "Weapons & loadout", screen: 1, accent: "var(--amber)" },
          { label: "PRESTIGE", sub: "Rank & status", screen: 3, accent: "var(--green-glow)" },
          { label: "BARRACKS", sub: "Profile & stats", screen: 4, accent: "var(--steel)" },
        ].map((item, i) => (
          <button
            key={i}
            onClick={() => onNavigate(item.screen)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="stencil"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px",
              background: hovered === i 
                ? `linear-gradient(90deg, rgba(255,107,26,0.15), transparent)`
                : "rgba(26,32,16,0.8)",
              border: `1px solid ${hovered === i ? item.accent : "var(--olive)"}`,
              borderLeft: `3px solid ${item.accent}`,
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.2s",
              animation: `slide-in 0.4s ease-out ${i * 0.1}s both`,
              textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontSize: 18, color: "var(--bone)", letterSpacing: 2 }}>{item.label}</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.6, letterSpacing: 1, marginTop: 2 }}>
                {item.sub}
              </div>
            </div>
            <div style={{ 
              fontSize: 16, 
              color: item.accent, 
              opacity: hovered === i ? 1 : 0.4,
              transition: "all 0.2s",
              transform: hovered === i ? "translateX(4px)" : "none",
            }}>▸</div>
          </button>
        ))}
      </div>
      
      {/* Bottom bar */}
      <div style={{
        padding: "12px 20px",
        borderTop: "1px solid var(--olive)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(10,12,8,0.8)",
        position: "relative",
        zIndex: 10,
      }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.5 }}>
          v0.1.0 ALPHA
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--sol-green)" }}>◆ 2.4 SOL</div>
          <div style={{ width: 1, height: 12, background: "var(--olive)" }} />
          <div className="mono" style={{ fontSize: 10, color: "var(--amber)" }}>⬡ 847 SHOT</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ARMORY (WEAPON SHOP) SCREEN
// ═══════════════════════════════════════
function Armory({ onNavigate }) {
  const [selected, setSelected] = useState(1);
  const [budget] = useState(7700);
  
  const weapons = [
    { name: "Mortar", price: 0, owned: 99, tier: "standard", desc: "Basic shell. Gets the job done.", dmg: 25 },
    { name: "Cluster Bomb", price: 1200, owned: 3, tier: "standard", desc: "Splits into 5 mini-shells on descent.", dmg: 40 },
    { name: "Meltdown", price: 3500, owned: 1, tier: "rare", desc: "Napalm area denial. Burns for 3 turns.", dmg: 55 },
    { name: "Dirt Wall", price: 800, owned: 5, tier: "tactical", desc: "Raises terrain. Bury your enemies.", dmg: 0 },
    { name: "Mega Roller", price: 5000, owned: 0, tier: "rare", desc: "Rolls downhill crushing everything.", dmg: 65 },
    { name: "U238 Penetrator", price: 8000, owned: 0, tier: "epic", desc: "Punches through terrain. Unstoppable.", dmg: 80 },
    { name: "Tactical Nuke", price: 12000, owned: 0, tier: "legendary", desc: "Devastation. Reshapes the battlefield.", dmg: 100 },
  ];
  
  const tierColors = {
    standard: "var(--khaki)",
    tactical: "var(--steel)",
    rare: "var(--amber)",
    epic: "var(--sol-purple)",
    legendary: "var(--rust-glow)",
  };
  
  return (
    <div style={{
      height: "100%",
      background: "linear-gradient(180deg, #0c1008, #141a0e, #0a0c08)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--olive)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(26,32,16,0.6)",
      }}>
        <button onClick={() => onNavigate(0)} className="mono" style={{
          background: "none", border: "1px solid var(--olive)", borderRadius: 3,
          color: "var(--khaki)", fontSize: 10, padding: "4px 8px", cursor: "pointer",
        }}>◂ BACK</button>
        <span className="stencil" style={{ fontSize: 20, color: "var(--bone)", letterSpacing: 2 }}>ARMORY</span>
        <div className="mono" style={{ 
          fontSize: 12, color: "var(--amber)", 
          background: "rgba(255,182,39,0.1)", 
          border: "1px solid rgba(255,182,39,0.3)",
          padding: "3px 8px", borderRadius: 3,
        }}>
          ${budget.toLocaleString()}
        </div>
      </div>
      
      {/* Weapon list */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px" }}>
        {weapons.map((w, i) => (
          <div
            key={i}
            onClick={() => setSelected(i)}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "10px 12px",
              marginBottom: 4,
              background: selected === i 
                ? "rgba(196,81,10,0.12)" 
                : "rgba(26,32,16,0.4)",
              border: `1px solid ${selected === i ? tierColors[w.tier] + "66" : "var(--olive-dark)"}`,
              borderLeft: `3px solid ${tierColors[w.tier]}`,
              borderRadius: 4,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {/* Weapon icon placeholder */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 4,
              background: `linear-gradient(135deg, var(--olive-dark), ${tierColors[w.tier]}22)`,
              border: `1px solid ${tierColors[w.tier]}44`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
              marginRight: 10,
            }}>
              {w.tier === "legendary" ? "☢" : w.tier === "epic" ? "◆" : w.tier === "rare" ? "★" : w.tier === "tactical" ? "▦" : "●"}
            </div>
            
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="stencil" style={{ 
                  fontSize: 13, 
                  color: tierColors[w.tier],
                  letterSpacing: 1,
                }}>{w.name}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--khaki)", opacity: 0.5 }}>
                  ×{w.owned}
                </span>
              </div>
              
              {selected === i && (
                <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.6, marginTop: 3 }}>
                  {w.desc}
                </div>
              )}
              
              {/* Damage bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.4, width: 24 }}>DMG</span>
                <div style={{ flex: 1, height: 3, background: "var(--olive-dark)", borderRadius: 2 }}>
                  <div style={{
                    width: `${w.dmg}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: w.dmg > 80 ? "var(--rust-glow)" : w.dmg > 50 ? "var(--amber)" : "var(--khaki)",
                  }} />
                </div>
              </div>
            </div>
            
            {/* Price */}
            <div className="mono" style={{
              fontSize: 11,
              color: w.price === 0 ? "var(--green-glow)" : w.price > budget ? "var(--red)" : "var(--amber)",
              marginLeft: 10,
              textAlign: "right",
              flexShrink: 0,
            }}>
              {w.price === 0 ? "FREE" : `$${w.price.toLocaleString()}`}
            </div>
          </div>
        ))}
      </div>
      
      {/* Buy/Sell bar */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--olive)",
        display: "flex",
        gap: 8,
        background: "rgba(10,12,8,0.9)",
      }}>
        <button className="stencil" style={{
          flex: 1, padding: "10px", borderRadius: 4,
          background: "linear-gradient(180deg, var(--rust), #8a3a08)",
          border: "1px solid var(--rust-glow)",
          color: "var(--bone)", fontSize: 14, letterSpacing: 2, cursor: "pointer",
          boxShadow: "0 2px 8px rgba(196,81,10,0.3)",
        }}>BUY</button>
        <button className="stencil" style={{
          flex: 1, padding: "10px", borderRadius: 4,
          background: "var(--olive-dark)",
          border: "1px solid var(--olive)",
          color: "var(--khaki)", fontSize: 14, letterSpacing: 2, cursor: "pointer",
        }}>SELL</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// BATTLE HUD SCREEN
// ═══════════════════════════════════════
function BattleHUD({ onNavigate }) {
  const [angle, setAngle] = useState(53);
  const [power, setPower] = useState(72);
  const [weaponIdx, setWeaponIdx] = useState(0);
  const weaponList = ["Mortar ×99", "Cluster Bomb ×3", "Meltdown ×1", "Dirt Wall ×5"];
  
  return (
    <div style={{
      height: "100%",
      position: "relative",
      background: "linear-gradient(180deg, #1a2840 0%, #2a3a4a 20%, #4a5a3a 50%, #3a4a2a 70%, #1a2010 100%)",
      overflow: "hidden",
    }}>
      {/* Sky */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "40%",
        background: "linear-gradient(180deg, #0c1520 0%, #1a3050 40%, #3a5060 70%, #6a7a60 100%)",
      }} />
      
      {/* Clouds */}
      <div style={{
        position: "absolute", top: "8%", left: "10%",
        width: 120, height: 30, borderRadius: 20,
        background: "rgba(200,210,200,0.08)",
        animation: "wind-drift 8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", top: "15%", right: "5%",
        width: 80, height: 20, borderRadius: 20,
        background: "rgba(200,210,200,0.05)",
        animation: "wind-drift 12s ease-in-out 2s infinite",
      }} />
      
      {/* Terrain */}
      <svg viewBox="0 0 420 300" style={{
        position: "absolute",
        bottom: "15%",
        left: 0,
        right: 0,
        width: "100%",
      }}>
        {/* Mountain terrain */}
        <path d="M0,200 L20,180 L40,190 L60,150 L80,160 L100,120 L120,140 L140,100 L160,130 L180,90 L200,110 L220,80 L240,100 L260,120 L280,90 L300,110 L320,130 L340,100 L360,120 L380,140 L400,110 L420,140 L420,300 L0,300Z"
          fill="url(#terrain-grad)" />
        <defs>
          <linearGradient id="terrain-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a5a30" />
            <stop offset="40%" stopColor="#3a4a22" />
            <stop offset="100%" stopColor="#1a2010" />
          </linearGradient>
        </defs>
        
        {/* Player tank */}
        <g transform="translate(80, 148)">
          <rect x="-8" y="0" width="16" height="8" rx="2" fill="var(--olive)" stroke="var(--khaki)" strokeWidth="0.5" />
          <line x1="0" y1="2" x2="-14" y2="-8" stroke="var(--khaki)" strokeWidth="2" strokeLinecap="round" />
          <rect x="-10" y="8" width="20" height="4" rx="1" fill="var(--olive-dark)" />
          {/* Name tag */}
          <text x="0" y="-14" textAnchor="middle" fill="var(--green-glow)" fontSize="7" fontFamily="Share Tech Mono">You</text>
        </g>
        
        {/* Enemy tank */}
        <g transform="translate(320, 98)">
          <rect x="-8" y="0" width="16" height="8" rx="2" fill="#8a3030" stroke="#cc6644" strokeWidth="0.5" />
          <line x1="0" y1="2" x2="12" y2="-6" stroke="#cc6644" strokeWidth="2" strokeLinecap="round" />
          <rect x="-10" y="8" width="20" height="4" rx="1" fill="#5a2020" />
          <text x="0" y="-14" textAnchor="middle" fill="#ff6644" fontSize="7" fontFamily="Share Tech Mono">xXDestroyerXx</text>
        </g>
        
        {/* Shell trajectory (dotted arc) */}
        <path d="M68,142 Q150,40 308,92" fill="none" stroke="rgba(255,182,39,0.25)" strokeWidth="1" strokeDasharray="4,4" />
      </svg>
      
      {/* Top HUD bar */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 12px",
        background: "linear-gradient(180deg, rgba(10,12,8,0.8), transparent)",
        zIndex: 20,
      }}>
        {/* Wind */}
        <div style={{
          background: "rgba(10,12,8,0.7)",
          border: "1px solid var(--olive)",
          borderRadius: 4,
          padding: "4px 10px",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.6 }}>WIND</span>
          <span className="stencil" style={{ fontSize: 16, color: "var(--bone)" }}>23</span>
          <span style={{ 
            fontSize: 14, 
            color: "var(--amber)",
            animation: "wind-drift 2s ease-in-out infinite",
          }}>→</span>
        </div>
        
        {/* SOL Pot */}
        <div style={{
          background: "rgba(10,12,8,0.7)",
          border: "1px solid var(--sol-green)",
          borderRadius: 4,
          padding: "4px 10px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--sol-green)", opacity: 0.7 }}>POT</span>
          <span className="mono" style={{ fontSize: 14, color: "var(--sol-green)", fontWeight: "bold" }}>0.32 SOL</span>
        </div>
        
        {/* Round */}
        <div style={{
          background: "rgba(10,12,8,0.7)",
          border: "1px solid var(--olive)",
          borderRadius: 4,
          padding: "4px 10px",
        }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.6 }}>RND</span>
          <span className="stencil" style={{ fontSize: 14, color: "var(--bone)", marginLeft: 4 }}>3/5</span>
        </div>
      </div>
      
      {/* Health bars */}
      <div style={{
        position: "absolute",
        top: 44,
        left: 12,
        right: 12,
        display: "flex",
        gap: 8,
        zIndex: 20,
      }}>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--green-glow)", marginBottom: 2 }}>YOU — 78 HP</div>
          <div style={{ height: 4, background: "var(--olive-dark)", borderRadius: 2 }}>
            <div style={{ width: "78%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg, var(--green-glow), #44cc22)" }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--rust-glow)", marginBottom: 2, textAlign: "right" }}>xXDestroyerXx — 45 HP</div>
          <div style={{ height: 4, background: "var(--olive-dark)", borderRadius: 2 }}>
            <div style={{ width: "45%", height: "100%", borderRadius: 2, background: "linear-gradient(90deg, var(--red), var(--rust-glow))", marginLeft: "auto" }} />
          </div>
        </div>
      </div>
      
      {/* Bottom controls */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(0deg, rgba(10,12,8,0.95), rgba(10,12,8,0.8), transparent)",
        padding: "30px 12px 12px",
        zIndex: 20,
      }}>
        {/* Weapon selector */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          marginBottom: 10,
        }}>
          <button onClick={() => setWeaponIdx(Math.max(0, weaponIdx - 1))} style={{
            background: "none", border: "1px solid var(--olive)", borderRadius: 3,
            color: "var(--khaki)", fontSize: 16, padding: "2px 8px", cursor: "pointer",
          }}>◂</button>
          <div className="stencil" style={{
            fontSize: 13,
            color: "var(--amber)",
            letterSpacing: 1,
            minWidth: 160,
            textAlign: "center",
            padding: "5px 12px",
            background: "rgba(26,32,16,0.6)",
            border: "1px solid var(--olive)",
            borderRadius: 4,
          }}>
            {weaponList[weaponIdx]}
          </div>
          <button onClick={() => setWeaponIdx(Math.min(weaponList.length - 1, weaponIdx + 1))} style={{
            background: "none", border: "1px solid var(--olive)", borderRadius: 3,
            color: "var(--khaki)", fontSize: 16, padding: "2px 8px", cursor: "pointer",
          }}>▸</button>
        </div>
        
        {/* Angle & Power */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5, marginBottom: 3 }}>ANGLE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="bebas" style={{ fontSize: 28, color: "var(--bone)", lineHeight: 1 }}>{angle}°</span>
              <input type="range" min="0" max="90" value={angle} onChange={e => setAngle(+e.target.value)}
                style={{ flex: 1, accentColor: "var(--amber)" }} />
            </div>
          </div>
          <div style={{ width: 1, background: "var(--olive)" }} />
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5, marginBottom: 3 }}>POWER</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span className="bebas" style={{ fontSize: 28, color: power > 80 ? "var(--rust-glow)" : "var(--bone)", lineHeight: 1 }}>{power}%</span>
              <input type="range" min="0" max="100" value={power} onChange={e => setPower(+e.target.value)}
                style={{ flex: 1, accentColor: "var(--rust-glow)" }} />
            </div>
          </div>
        </div>
        
        {/* FIRE button */}
        <button className="stencil" style={{
          width: "100%",
          padding: "14px",
          fontSize: 22,
          letterSpacing: 6,
          color: "var(--bone)",
          background: "linear-gradient(180deg, #cc3300, #881a00)",
          border: "2px solid var(--rust-glow)",
          borderRadius: 6,
          cursor: "pointer",
          boxShadow: "0 0 20px rgba(204,51,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)",
          textShadow: "0 2px 4px rgba(0,0,0,0.5)",
        }}>
          FIRE
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// PRESTIGE SCREEN
// ═══════════════════════════════════════
function PrestigeScreen({ onNavigate }) {
  const currentPrestige = 3;
  const currentTokens = 847;
  
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
    <div style={{
      height: "100%",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--olive)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(26,32,16,0.6)",
      }}>
        <button onClick={() => onNavigate(0)} className="mono" style={{
          background: "none", border: "1px solid var(--olive)", borderRadius: 3,
          color: "var(--khaki)", fontSize: 10, padding: "4px 8px", cursor: "pointer",
        }}>◂ BACK</button>
        <span className="stencil" style={{ fontSize: 20, color: "var(--bone)", letterSpacing: 2 }}>PRESTIGE</span>
        <div className="mono" style={{ fontSize: 11, color: "var(--amber)" }}>⬡ {currentTokens} SHOT</div>
      </div>
      
      {/* Current rank display */}
      <div style={{
        padding: "24px 20px",
        textAlign: "center",
        borderBottom: "1px solid var(--olive-dark)",
      }}>
        {/* Badge */}
        <div style={{
          width: 80,
          height: 80,
          margin: "0 auto 12px",
          borderRadius: "50%",
          background: `conic-gradient(${tiers[currentPrestige - 1].color} ${currentPrestige * 36}deg, var(--olive-dark) 0deg)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 20px ${tiers[currentPrestige - 1].color}44`,
          position: "relative",
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--black)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
          }}>
            <span className="bebas" style={{ fontSize: 28, color: tiers[currentPrestige - 1].color, lineHeight: 1 }}>
              {currentPrestige}
            </span>
            <span className="mono" style={{ fontSize: 7, color: "var(--khaki)", opacity: 0.6 }}>PRESTIGE</span>
          </div>
        </div>
        
        <div className="stencil" style={{ fontSize: 18, color: tiers[currentPrestige - 1].color, letterSpacing: 2 }}>
          {tiers[currentPrestige - 1].name.toUpperCase()}
        </div>
        <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.5, marginTop: 4 }}>
          NEXT: {tiers[currentPrestige].name} — {tiers[currentPrestige].cost} SHOT to prestige
        </div>
      </div>
      
      {/* Prestige ladder */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>
        {tiers.map((t, i) => {
          const unlocked = i < currentPrestige;
          const current = i === currentPrestige - 1;
          const next = i === currentPrestige;
          const canAfford = currentTokens >= t.cost;
          
          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 12px",
              marginBottom: 3,
              background: current ? "rgba(196,81,10,0.1)" : next ? "rgba(255,182,39,0.05)" : "transparent",
              border: `1px solid ${current ? t.color + "44" : next ? "var(--olive)" : "transparent"}`,
              borderRadius: 4,
              opacity: unlocked || next ? 1 : 0.4,
            }}>
              {/* Level indicator */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: unlocked ? t.color + "22" : "var(--olive-dark)",
                border: `2px solid ${unlocked ? t.color : "var(--olive)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
                flexShrink: 0,
              }}>
                {unlocked ? (
                  <span style={{ color: t.color, fontSize: 12 }}>✓</span>
                ) : (
                  <span className="bebas" style={{ color: "var(--khaki)", fontSize: 13, opacity: 0.5 }}>{t.level}</span>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="stencil" style={{ fontSize: 12, color: unlocked ? t.color : "var(--khaki)", letterSpacing: 1 }}>
                    {t.name}
                  </span>
                  {!unlocked && (
                    <span className="mono" style={{ 
                      fontSize: 10, 
                      color: next && canAfford ? "var(--green-glow)" : "var(--khaki)", 
                      opacity: next ? 1 : 0.4 
                    }}>
                      🔥 {t.cost} SHOT
                    </span>
                  )}
                </div>
                {current && (
                  <div className="mono" style={{ fontSize: 8, color: "var(--green-glow)", marginTop: 2 }}>
                    ● CURRENT RANK
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Prestige button */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--olive)",
        background: "rgba(10,12,8,0.9)",
      }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--rust-glow)", textAlign: "center", marginBottom: 6 }}>
          ⚠ PRESTIGE RESETS ALL WEAPONS. TOKENS ARE BURNED PERMANENTLY.
        </div>
        <button className="stencil" style={{
          width: "100%",
          padding: "12px",
          fontSize: 16,
          letterSpacing: 3,
          color: currentTokens >= tiers[currentPrestige].cost ? "var(--bone)" : "var(--khaki)",
          background: currentTokens >= tiers[currentPrestige].cost 
            ? "linear-gradient(180deg, var(--amber-dim), #6a4a10)"
            : "var(--olive-dark)",
          border: `1px solid ${currentTokens >= tiers[currentPrestige].cost ? "var(--amber)" : "var(--olive)"}`,
          borderRadius: 4,
          cursor: currentTokens >= tiers[currentPrestige].cost ? "pointer" : "not-allowed",
          opacity: currentTokens >= tiers[currentPrestige].cost ? 1 : 0.5,
        }}>
          🔥 PRESTIGE UP — {tiers[currentPrestige].cost} SHOT
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOBBY SCREEN
// ═══════════════════════════════════════
function Lobby({ onNavigate }) {
  const matches = [
    { host: "TankGod_99", prestige: 7, wager: 0.1, players: "3/4", map: "DESERT RIDGE" },
    { host: "SolSniper", prestige: 2, wager: 0.05, players: "2/4", map: "MOUNTAIN PASS" },
    { host: "NukeEmAll", prestige: 10, wager: 0.5, players: "1/2", map: "URBAN RUINS" },
    { host: "CasualCarl", prestige: 0, wager: 0.02, players: "2/4", map: "GREEN VALLEY" },
    { host: "WhaleAlert", prestige: 5, wager: 1.0, players: "1/4", map: "FORTRESS" },
  ];
  
  const tierColors = ["#8a8a7a","#8a8a7a","#a0a090","#b8a88a","#c4a030","#daa520","#ff8c00","#ff6b1a","#cc2200","#9945FF","#14F195"];
  
  return (
    <div style={{
      height: "100%",
      background: "linear-gradient(180deg, #0c1008, #0a0c08)",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{
        padding: "14px 16px",
        borderBottom: "1px solid var(--olive)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: "rgba(26,32,16,0.6)",
      }}>
        <button onClick={() => onNavigate(0)} className="mono" style={{
          background: "none", border: "1px solid var(--olive)", borderRadius: 3,
          color: "var(--khaki)", fontSize: 10, padding: "4px 8px", cursor: "pointer",
        }}>◂ BACK</button>
        <span className="stencil" style={{ fontSize: 20, color: "var(--bone)", letterSpacing: 2 }}>BARRACKS</span>
        <div style={{ width: 50 }} />
      </div>
      
      {/* Quick Match */}
      <div style={{ padding: "12px 16px" }}>
        <button className="stencil" style={{
          width: "100%", padding: "14px", fontSize: 16, letterSpacing: 3,
          color: "var(--bone)",
          background: "linear-gradient(180deg, var(--rust), #881a00)",
          border: "2px solid var(--rust-glow)",
          borderRadius: 6, cursor: "pointer",
          boxShadow: "0 0 16px rgba(196,81,10,0.3)",
        }}>
          ⚡ QUICK MATCH — 0.08 SOL
        </button>
      </div>
      
      <div className="mono" style={{ fontSize: 9, color: "var(--khaki)", opacity: 0.4, padding: "0 16px 8px", letterSpacing: 2 }}>
        OPEN LOBBIES
      </div>
      
      {/* Match list */}
      <div style={{ flex: 1, overflow: "auto", padding: "0 12px" }}>
        {matches.map((m, i) => (
          <div key={i} style={{
            padding: "10px 12px",
            marginBottom: 4,
            background: "rgba(26,32,16,0.4)",
            border: "1px solid var(--olive-dark)",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                {/* Prestige badge */}
                {m.prestige > 0 && (
                  <span style={{
                    fontSize: 8,
                    color: tierColors[m.prestige],
                    background: tierColors[m.prestige] + "15",
                    border: `1px solid ${tierColors[m.prestige]}33`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    fontFamily: "'Bebas Neue'",
                    letterSpacing: 1,
                  }}>P{m.prestige}</span>
                )}
                <span className="stencil" style={{ fontSize: 12, color: "var(--bone)", letterSpacing: 1 }}>{m.host}</span>
              </div>
              <div className="mono" style={{ fontSize: 8, color: "var(--khaki)", opacity: 0.5 }}>
                {m.map} · {m.players}
              </div>
            </div>
            <div style={{
              textAlign: "right",
            }}>
              <div className="mono" style={{ 
                fontSize: 12, 
                color: "var(--sol-green)", 
                fontWeight: "bold",
              }}>
                {m.wager} SOL
              </div>
              <button className="mono" style={{
                fontSize: 8,
                color: "var(--bone)",
                background: "var(--olive)",
                border: "1px solid var(--khaki)",
                borderRadius: 3,
                padding: "2px 8px",
                cursor: "pointer",
                marginTop: 3,
              }}>JOIN</button>
            </div>
          </div>
        ))}
      </div>
      
      {/* Create match */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid var(--olive)",
        background: "rgba(10,12,8,0.9)",
      }}>
        <button className="stencil" style={{
          width: "100%", padding: "10px", fontSize: 13, letterSpacing: 2,
          color: "var(--amber)",
          background: "var(--olive-dark)",
          border: "1px solid var(--olive)",
          borderRadius: 4, cursor: "pointer",
        }}>
          + CREATE MATCH
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// APP SHELL
// ═══════════════════════════════════════
export default function SolShotConcept() {
  const [screen, setScreen] = useState(0);
  
  const renderScreen = () => {
    switch (screen) {
      case 0: return <MainMenu onNavigate={setScreen} />;
      case 1: return <Armory onNavigate={setScreen} />;
      case 2: return <BattleHUD onNavigate={setScreen} />;
      case 3: return <PrestigeScreen onNavigate={setScreen} />;
      case 4: return <Lobby onNavigate={setScreen} />;
      default: return <MainMenu onNavigate={setScreen} />;
    }
  };
  
  return (
    <div style={{ 
      background: "#050708", 
      minHeight: "100vh", 
      display: "flex", 
      flexDirection: "column",
      alignItems: "center", 
      padding: "16px",
      fontFamily: "'Share Tech Mono', monospace",
    }}>
      <style>{styles}</style>
      
      {/* Screen selector */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 12,
        flexWrap: "wrap",
        justifyContent: "center",
      }}>
        {screens.map((name, i) => (
          <button
            key={i}
            onClick={() => setScreen(i)}
            className="mono"
            style={{
              padding: "5px 10px",
              fontSize: 9,
              letterSpacing: 1,
              color: screen === i ? "#0a0c08" : "var(--khaki)",
              background: screen === i ? "var(--amber)" : "transparent",
              border: `1px solid ${screen === i ? "var(--amber)" : "var(--olive)"}`,
              borderRadius: 3,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {name}
          </button>
        ))}
      </div>
      
      {/* Phone frame */}
      <div className="screen-container" style={{ animation: "flicker 4s infinite" }}>
        <div className="noise-overlay" />
        <div className="scanlines" />
        {renderScreen()}
      </div>
      
      <div className="mono" style={{ 
        fontSize: 9, 
        color: "var(--khaki)", 
        opacity: 0.3, 
        marginTop: 12,
        textAlign: "center",
      }}>
        SOLSHOT — UI CONCEPT v0.1 — TAP SCREENS ABOVE TO NAVIGATE
      </div>
    </div>
  );
}
