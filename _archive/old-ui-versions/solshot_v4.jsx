import { useState, useEffect } from "react";

const styles = `
@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Share+Tech+Mono&family=Bebas+Neue&display=swap');

:root {
  --olive: #3d4a2f; --olive-dark: #2a331f; --khaki: #b8a88a; --rust: #c4510a;
  --rust-glow: #ff6b1a; --amber: #ffb627; --amber-dim: #a67b1a; --steel: #6b7b8d;
  --steel-dark: #3a4550; --bone: #e8dcc8; --mud: #5c4a3a; --black: #0a0c08;
  --green-glow: #7fff44; --red: #cc2200; --sol-purple: #9945FF; --sol-green: #14F195;
  --gold: #ffd700;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.stencil { font-family: 'Black Ops One', cursive; }
.mono { font-family: 'Share Tech Mono', monospace; }
.bebas { font-family: 'Bebas Neue', sans-serif; }

@keyframes slide-in { from { transform: translateX(-16px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes slide-up { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes wind-drift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(5px); } }
@keyframes cloud-drift { 0% { transform: translateX(0); } 100% { transform: translateX(30px); } }
@keyframes flicker { 0%,100%{opacity:1}50%{opacity:0.98} }
@keyframes explosion-glow { 0%{opacity:0;transform:scale(.5)}20%{opacity:.8;transform:scale(1.2)}100%{opacity:0;transform:scale(2)} }
@keyframes victory-pulse { 0%,100%{text-shadow:0 0 20px rgba(127,255,68,.4)}50%{text-shadow:0 0 30px rgba(127,255,68,.7)} }
@keyframes defeat-pulse { 0%,100%{text-shadow:0 0 20px rgba(204,34,0,.4)}50%{text-shadow:0 0 30px rgba(204,34,0,.6)} }
@keyframes sol-count { 0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)} }
@keyframes stamp { 0%{transform:scale(3) rotate(-10deg);opacity:0}60%{transform:scale(1) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0deg);opacity:1} }
@keyframes shimmer { 0%{background-position:-200% center}100%{background-position:200% center} }
@keyframes unlock-glow { 0%,100%{box-shadow:0 0 8px rgba(255,215,0,0.2)}50%{box-shadow:0 0 16px rgba(255,215,0,0.5)} }
@keyframes fade-in { from{opacity:0}to{opacity:1} }

.noise-overlay {
  position:absolute;inset:0;opacity:0.03;pointer-events:none;z-index:100;
  background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.scanlines {
  position:absolute;inset:0;pointer-events:none;z-index:99;
  background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px);
}
input[type="range"] {
  -webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--olive-dark);outline:none;width:100%;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;border:2px solid var(--bone);background:var(--amber);
}
`;

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} className="mono" style={{
      background:"rgba(10,12,8,0.6)",border:"1px solid var(--olive)",borderRadius:3,
      color:"var(--khaki)",fontSize:10,padding:"4px 10px",cursor:"pointer",
      display:"flex",alignItems:"center",gap:4}}>
      <span style={{fontSize:12}}>◂</span> MENU
    </button>
  );
}
function WalletBar() {
  return (
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div className="mono" style={{fontSize:10,color:"var(--sol-green)"}}>◆ 2.41 SOL</div>
      <div style={{width:1,height:12,background:"var(--olive)"}} />
      <div className="mono" style={{fontSize:10,color:"var(--amber)"}}>⬡ 847 SHOT</div>
    </div>
  );
}
function TopBar({ go, title, children }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"8px 16px",borderBottom:"1px solid var(--olive)",background:"rgba(26,32,16,0.5)",flexShrink:0}}>
      <BackButton onClick={() => go("menu")} />
      <span className="stencil" style={{fontSize:18,color:"var(--bone)",letterSpacing:2}}>{title}</span>
      <div style={{display:"flex",alignItems:"center",gap:10}}>{children || <WalletBar />}</div>
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN MENU
// ═══════════════════════════════════════
function MainMenu({ go }) {
  const [h,setH] = useState(null);
  const items = [
    {label:"DEPLOY",sub:"Find a match",to:"lobby",accent:"var(--rust-glow)"},
    {label:"ARMORY",sub:"Skins & cosmetics",to:"armory",accent:"var(--amber)"},
    {label:"PRESTIGE",sub:"Rank & burn",to:"prestige",accent:"var(--green-glow)"},
    {label:"BARRACKS",sub:"Profile & stats",to:"barracks",accent:"var(--steel)"},
  ];
  return (
    <div style={{height:"100%",display:"flex",position:"relative",overflow:"hidden",
      background:"linear-gradient(135deg,#0c1008 0%,#1a2a12 40%,#0a0c08 100%)"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"55%",
        background:"linear-gradient(180deg,transparent 0%,#1a1208 50%)",
        clipPath:"polygon(0% 50%,5% 35%,12% 45%,20% 20%,28% 35%,35% 15%,42% 30%,50% 10%,58% 25%,65% 12%,72% 28%,78% 18%,85% 32%,92% 22%,100% 30%,100% 100%,0% 100%)",opacity:0.4}} />
      <div style={{position:"absolute",top:"30%",left:"60%",width:60,height:60,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(255,107,26,0.25) 0%,transparent 70%)",
        animation:"explosion-glow 5s ease-out infinite"}} />

      <div style={{flex:"0 0 45%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 40px",position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <div style={{width:40,height:56,border:"2px solid var(--khaki)",borderRadius:"3px 3px 10px 10px",
            background:"linear-gradient(135deg,var(--steel-dark),var(--steel))",
            boxShadow:"0 3px 10px rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",
            position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",top:-7,width:12,height:12,borderRadius:"50%",border:"2px solid var(--khaki)",background:"var(--steel-dark)"}} />
            <span className="stencil" style={{fontSize:15,color:"var(--bone)"}}>S</span>
          </div>
          <div>
            <h1 className="stencil" style={{fontSize:44,color:"var(--bone)",letterSpacing:2,lineHeight:1,
              textShadow:"0 0 16px rgba(255,107,26,0.3),0 3px 0 var(--mud)"}}>
              SOL<span style={{color:"var(--rust-glow)"}}>SHOT</span>
            </h1>
            <div className="mono" style={{fontSize:9,color:"var(--khaki)",letterSpacing:3,opacity:0.6,marginTop:2}}>ARTILLERY COMBAT ON SOLANA</div>
          </div>
        </div>
        <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"rgba(153,69,255,0.1)",
          border:"1px solid rgba(153,69,255,0.25)",borderRadius:16,padding:"2px 10px",width:"fit-content",marginTop:8}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:"var(--sol-green)"}} />
          <span className="mono" style={{fontSize:8,color:"var(--sol-green)"}}>POWERED BY SOLANA</span>
        </div>
        <div style={{marginTop:20,padding:"8px 12px",background:"rgba(10,12,8,0.5)",border:"1px solid var(--olive)",borderRadius:4,width:"fit-content"}}>
          <WalletBar />
        </div>
      </div>

      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 40px 0 20px",gap:8,position:"relative",zIndex:10}}>
        {items.map((item,i) => (
          <button key={i} onClick={() => go(item.to)} onMouseEnter={() => setH(i)} onMouseLeave={() => setH(null)}
            className="stencil" style={{
              display:"flex",alignItems:"center",justifyContent:"space-between",
              padding:"12px 16px",background:h===i?"rgba(255,107,26,0.1)":"rgba(26,32,16,0.7)",
              border:`1px solid ${h===i?item.accent:"var(--olive)"}`,
              borderLeft:`3px solid ${item.accent}`,borderRadius:4,cursor:"pointer",
              transition:"all 0.2s",animation:`slide-in 0.3s ease-out ${i*0.08}s both`,textAlign:"left"}}>
            <div>
              <div style={{fontSize:16,color:"var(--bone)",letterSpacing:2}}>{item.label}</div>
              <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.5,letterSpacing:1,marginTop:1}}>{item.sub}</div>
            </div>
            <div style={{fontSize:14,color:item.accent,opacity:h===i?1:0.3,transition:"all 0.2s",transform:h===i?"translateX(3px)":"none"}}>▸</div>
          </button>
        ))}
      </div>
      <div className="mono" style={{position:"absolute",bottom:8,left:16,fontSize:8,color:"var(--khaki)",opacity:0.3}}>v0.1.0</div>
    </div>
  );
}

// ═══════════════════════════════════════
// ARMORY — Cosmetics shop (SOL + SHOT tabs)
// ═══════════════════════════════════════
function Armory({ go }) {
  const [tab, setTab] = useState("sol");
  const [sel, setSel] = useState(0);

  const solItems = [
    { name: "Desert Storm", type: "TANK SKIN", price: "0.3 SOL", rarity: "rare", desc: "Sand camo pattern with weathered scratches.", owned: false, img: "🏜" },
    { name: "Midnight Ops", type: "TANK SKIN", price: "0.5 SOL", rarity: "epic", desc: "Matte black stealth coating. Near invisible at night.", owned: true, img: "🌑" },
    { name: "Inferno Trail", type: "KILL EFFECT", price: "0.2 SOL", rarity: "rare", desc: "Leaves a burning trail on the ground after your shots.", owned: false, img: "🔥" },
    { name: "Shockwave", type: "EXPLOSION", price: "0.4 SOL", rarity: "epic", desc: "Circular blast wave ripples outward from impact.", owned: false, img: "💥" },
    { name: "Arctic Terrain", type: "TERRAIN THEME", price: "0.8 SOL", rarity: "legendary", desc: "Turns the battlefield into a frozen tundra.", owned: false, img: "❄" },
    { name: "Neon Tracer", type: "SHOT TRAIL", price: "0.15 SOL", rarity: "standard", desc: "Bright green tracer line follows your projectile.", owned: true, img: "✦" },
  ];
  const shotItems = [
    { name: "Sergeant Camo", type: "PRESTIGE SKIN", price: "150 SHOT 🔥", rarity: "prestige", desc: "Exclusive to Prestige 3+. Woodland digital pattern.", req: "P3", owned: false, img: "🎖" },
    { name: "Colonel's Edge", type: "LOBBY BORDER", price: "400 SHOT 🔥", rarity: "prestige", desc: "Animated red border around your name in lobbies.", req: "P7", owned: false, img: "⭐" },
    { name: "Marshal Crown", type: "NAME TAG", price: "800 SHOT 🔥", rarity: "legendary", desc: "Golden crown icon before your name. Max prestige only.", req: "P10", owned: false, img: "👑" },
    { name: "Skull Kill Icon", type: "KILL MARKER", price: "100 SHOT 🔥", rarity: "rare", desc: "Skull appears over enemies you eliminate.", req: "P1", owned: true, img: "💀" },
    { name: "Thunder Strike", type: "EXPLOSION", price: "250 SHOT 🔥", rarity: "epic", desc: "Lightning bolts radiate from impact point.", req: "P5", owned: false, img: "⚡" },
    { name: "Ghost Smoke", type: "DEATH EFFECT", price: "200 SHOT 🔥", rarity: "rare", desc: "Your destroyed tank dissolves into ghostly smoke.", req: "P2", owned: false, img: "👻" },
  ];

  const items = tab === "sol" ? solItems : shotItems;
  const item = items[sel] || items[0];
  const rc = { standard: "var(--khaki)", rare: "var(--amber)", epic: "var(--sol-purple)", legendary: "var(--rust-glow)", prestige: "var(--green-glow)" };

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TopBar go={go} title="ARMORY" />

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Left: tabs + list */}
        <div style={{flex:"0 0 55%",display:"flex",flexDirection:"column",borderRight:"1px solid var(--olive-dark)"}}>
          {/* Tabs */}
          <div style={{display:"flex",borderBottom:"1px solid var(--olive-dark)",flexShrink:0}}>
            {[{key:"sol",label:"SOL SHOP",color:"var(--sol-green)"},{key:"shot",label:"SHOT BURNS",color:"var(--amber)"}].map(t => (
              <button key={t.key} onClick={() => {setTab(t.key);setSel(0);}} className="mono" style={{
                flex:1,padding:"8px",fontSize:10,letterSpacing:2,cursor:"pointer",
                color:tab===t.key?t.color:"var(--khaki)",
                background:tab===t.key?"rgba(255,255,255,0.03)":"transparent",
                borderBottom:tab===t.key?`2px solid ${t.color}`:"2px solid transparent",
                border:"none",borderRight:"1px solid var(--olive-dark)",opacity:tab===t.key?1:0.4,
                transition:"all 0.15s"}}>
                {t.label}
              </button>
            ))}
          </div>
          {/* List */}
          <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
            {items.map((it,i) => (
              <div key={i} onClick={() => setSel(i)} style={{
                display:"flex",alignItems:"center",padding:"7px 10px",marginBottom:2,
                background:sel===i?"rgba(255,255,255,0.03)":"transparent",
                border:`1px solid ${sel===i?rc[it.rarity]+"33":"transparent"}`,
                borderLeft:`3px solid ${rc[it.rarity]}`,borderRadius:3,cursor:"pointer",transition:"all 0.12s"}}>
                <div style={{width:30,height:30,borderRadius:4,flexShrink:0,marginRight:8,
                  background:`linear-gradient(135deg,var(--olive-dark),${rc[it.rarity]}15)`,
                  border:`1px solid ${rc[it.rarity]}30`,display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:16}}>{it.img}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span className="stencil" style={{fontSize:10,color:rc[it.rarity],letterSpacing:1}}>{it.name}</span>
                    {it.owned && <span className="mono" style={{fontSize:7,color:"var(--green-glow)",
                      background:"rgba(127,255,68,0.1)",padding:"1px 4px",borderRadius:2}}>OWNED</span>}
                  </div>
                  <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.4,marginTop:1,letterSpacing:1}}>{it.type}</div>
                </div>
                <div className="mono" style={{fontSize:9,color:tab==="sol"?"var(--sol-green)":"var(--amber)",flexShrink:0,textAlign:"right"}}>
                  {it.price}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: detail */}
        <div style={{flex:1,padding:"16px 20px",display:"flex",flexDirection:"column"}}>
          {/* Preview */}
          <div style={{width:"100%",height:100,borderRadius:6,marginBottom:12,
            background:`linear-gradient(135deg,var(--olive-dark),${rc[item.rarity]}10)`,
            border:`1px solid ${rc[item.rarity]}22`,display:"flex",alignItems:"center",justifyContent:"center",
            position:"relative",overflow:"hidden"}}>
            <span style={{fontSize:40,opacity:0.8}}>{item.img}</span>
            {/* Rarity tag */}
            <div className="mono" style={{position:"absolute",top:6,right:8,fontSize:7,letterSpacing:2,
              color:rc[item.rarity],textTransform:"uppercase",opacity:0.6}}>{item.rarity}</div>
            {item.req && (
              <div className="mono" style={{position:"absolute",top:6,left:8,fontSize:7,
                color:"var(--green-glow)",background:"rgba(127,255,68,0.1)",
                border:"1px solid rgba(127,255,68,0.2)",padding:"1px 6px",borderRadius:2}}>
                REQUIRES {item.req}
              </div>
            )}
          </div>

          <div className="stencil" style={{fontSize:16,color:rc[item.rarity],letterSpacing:1,marginBottom:2}}>{item.name}</div>
          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4,letterSpacing:2,marginBottom:8}}>{item.type}</div>
          <div className="mono" style={{fontSize:10,color:"var(--khaki)",opacity:0.7,lineHeight:1.6,marginBottom:12}}>{item.desc}</div>

          {tab === "shot" && (
            <div style={{padding:"8px 10px",background:"rgba(255,107,26,0.05)",border:"1px solid rgba(255,107,26,0.15)",
              borderRadius:3,marginBottom:12}}>
              <div className="mono" style={{fontSize:8,color:"var(--rust-glow)",lineHeight:1.5}}>
                🔥 SHOT tokens are permanently burned on purchase. This item is cosmetic only — no gameplay advantage.
              </div>
            </div>
          )}

          <div style={{flex:1}} />

          <button className="stencil" style={{
            width:"100%",padding:"10px",fontSize:13,letterSpacing:2,borderRadius:4,cursor:"pointer",
            color:item.owned?"var(--green-glow)":"var(--bone)",
            background:item.owned?"var(--olive-dark)":tab==="sol"?"linear-gradient(180deg,#1a6a4a,#0a4a30)":"linear-gradient(180deg,var(--amber-dim),#6a4a10)",
            border:`1px solid ${item.owned?"var(--olive)":tab==="sol"?"var(--sol-green)":"var(--amber)"}`,
          }}>
            {item.owned ? "✓ EQUIPPED" : tab === "sol" ? `BUY — ${item.price}` : `BURN — ${item.price}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// PRESTIGE — with reward previews
// ═══════════════════════════════════════
function Prestige({ go }) {
  const cp = 3;
  const tokens = 847;

  const tiers = [
    { lv:1, cost:200, name:"Private", color:"#8a8a7a", tank:"Olive Drab", effect:"—", badge:"Bronze pip", extra:"Basic camo unlock" },
    { lv:2, cost:400, name:"Corporal", color:"#a0a090", tank:"Gunmetal", effect:"Dust cloud", badge:"Silver pip", extra:"Ghost Smoke unlock" },
    { lv:3, cost:600, name:"Sergeant", color:"#b8a88a", tank:"Desert Tan", effect:"Dirt spray", badge:"Gold pip", extra:"Sergeant Camo unlock" },
    { lv:4, cost:900, name:"Lieutenant", color:"#c4a030", tank:"Gold Trim", effect:"Spark burst", badge:"Bronze bar", extra:"Ranked queue access" },
    { lv:5, cost:1200, name:"Captain", color:"#daa520", tank:"Tiger Stripe", effect:"Fire ring", badge:"Silver bar", extra:"Thunder Strike unlock" },
    { lv:6, cost:1600, name:"Major", color:"#ff8c00", tank:"Blaze Orange", effect:"Shockwave", badge:"Gold bar", extra:"Custom lobby banners" },
    { lv:7, cost:2000, name:"Colonel", color:"#ff6b1a", tank:"Blood Red", effect:"Lightning", badge:"Silver eagle", extra:"Colonel's Edge border" },
    { lv:8, cost:2500, name:"Brigadier", color:"#cc2200", tank:"Crimson Black", effect:"Nuke flash", badge:"Gold eagle", extra:"Animated lobby entry" },
    { lv:9, cost:3000, name:"General", color:"#9945FF", tank:"Void Purple", effect:"Plasma burst", badge:"Diamond star", extra:"Custom kill messages" },
    { lv:10, cost:4000, name:"Marshal", color:"#14F195", tank:"Sol Green Holo", effect:"Solar flare", badge:"Animated crown", extra:"Marshal Crown + legendary frame" },
  ];

  const [selTier, setSelTier] = useState(cp); // show next tier by default

  const t = tiers[selTier];
  const unlocked = selTier < cp;
  const isNext = selTier === cp;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TopBar go={go} title="PRESTIGE" />

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Left: Current rank + ladder */}
        <div style={{flex:"0 0 45%",display:"flex",flexDirection:"column",borderRight:"1px solid var(--olive-dark)"}}>
          {/* Current rank badge */}
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--olive-dark)",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:56,height:56,borderRadius:"50%",flexShrink:0,
              background:`conic-gradient(${tiers[cp-1].color} ${cp*36}deg,var(--olive-dark) 0deg)`,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:`0 0 16px ${tiers[cp-1].color}33`}}>
              <div style={{width:44,height:44,borderRadius:"50%",background:"var(--black)",
                display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}>
                <span className="bebas" style={{fontSize:22,color:tiers[cp-1].color,lineHeight:1}}>{cp}</span>
                <span className="mono" style={{fontSize:6,color:"var(--khaki)",opacity:0.5}}>PRESTIGE</span>
              </div>
            </div>
            <div>
              <div className="stencil" style={{fontSize:14,color:tiers[cp-1].color,letterSpacing:2}}>{tiers[cp-1].name.toUpperCase()}</div>
              <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.5,marginTop:2}}>
                Next: {tiers[cp].name} · {tiers[cp].cost} SHOT
              </div>
              <div className="mono" style={{fontSize:9,color:"var(--amber)",marginTop:1}}>⬡ {tokens} SHOT available</div>
            </div>
          </div>

          {/* Ladder */}
          <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
            {tiers.map((tier,i) => {
              const ul = i < cp;
              const cur = i === cp - 1;
              const nxt = i === cp;
              return (
                <div key={i} onClick={() => setSelTier(i)} style={{
                  display:"flex",alignItems:"center",padding:"6px 10px",marginBottom:2,
                  background:selTier===i?"rgba(255,255,255,0.03)":cur?"rgba(196,81,10,0.05)":"transparent",
                  border:`1px solid ${selTier===i?tier.color+"44":"transparent"}`,
                  borderRadius:3,cursor:"pointer",opacity:ul||nxt?1:0.35,transition:"all 0.12s"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginRight:8,
                    background:ul?tier.color+"18":"var(--olive-dark)",
                    border:`2px solid ${ul?tier.color:"var(--olive)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {ul ? <span style={{color:tier.color,fontSize:10}}>✓</span>
                      : <span className="bebas" style={{color:"var(--khaki)",fontSize:11,opacity:0.4}}>{tier.lv}</span>}
                  </div>
                  <div style={{flex:1}}>
                    <span className="stencil" style={{fontSize:10,color:ul?tier.color:"var(--khaki)",letterSpacing:1}}>{tier.name}</span>
                    {cur && <span className="mono" style={{fontSize:7,color:"var(--green-glow)",marginLeft:6}}>● CURRENT</span>}
                  </div>
                  {!ul && <span className="mono" style={{fontSize:8,color:nxt?"var(--amber)":"var(--khaki)",opacity:nxt?1:0.3}}>🔥{tier.cost}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: tier detail / rewards */}
        <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,borderRadius:"50%",
              background:t.color+"20",border:`2px solid ${t.color}`,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span className="bebas" style={{fontSize:18,color:t.color}}>{t.lv}</span>
            </div>
            <div>
              <div className="stencil" style={{fontSize:16,color:t.color,letterSpacing:1}}>{t.name.toUpperCase()}</div>
              <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4}}>{unlocked?"UNLOCKED":"🔥 "+t.cost+" SHOT TO UNLOCK"}</div>
            </div>
          </div>

          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4,letterSpacing:2,marginBottom:6}}>REWARDS</div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {[
              {label:"TANK SKIN",val:t.tank,icon:"🎨"},
              {label:"KILL EFFECT",val:t.effect,icon:"💥"},
              {label:"LOBBY BADGE",val:t.badge,icon:"🎖"},
              {label:"SPECIAL",val:t.extra,icon:"⭐"},
            ].map((r,i) => (
              <div key={i} style={{padding:"8px 10px",background:"rgba(26,32,16,0.4)",
                border:`1px solid ${unlocked?t.color+"22":"var(--olive-dark)"}`,borderRadius:3}}>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                  <span style={{fontSize:10}}>{r.icon}</span>
                  <span className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.4,letterSpacing:1}}>{r.label}</span>
                </div>
                <div className="mono" style={{fontSize:10,color:unlocked?t.color:"var(--bone)",opacity:unlocked?1:0.7}}>{r.val}</div>
              </div>
            ))}
          </div>

          <div style={{flex:1}} />

          {/* Prestige button */}
          {isNext && (
            <div>
              <div className="mono" style={{fontSize:8,color:"var(--rust-glow)",textAlign:"center",marginBottom:6,lineHeight:1.4}}>
                ⚠ WEAPONS RESET TO MORTAR ONLY · TOKENS BURNED PERMANENTLY
              </div>
              <button className="stencil" style={{
                width:"100%",padding:"10px",fontSize:14,letterSpacing:2,borderRadius:4,cursor:"pointer",
                color:tokens>=t.cost?"var(--bone)":"var(--khaki)",
                background:tokens>=t.cost?"linear-gradient(180deg,var(--amber-dim),#6a4a10)":"var(--olive-dark)",
                border:`1px solid ${tokens>=t.cost?"var(--amber)":"var(--olive)"}`,
                opacity:tokens>=t.cost?1:0.5,
                animation:tokens>=t.cost?"unlock-glow 2s ease-in-out infinite":"none"}}>
                🔥 PRESTIGE TO {t.name.toUpperCase()} — {t.cost} SHOT
              </button>
            </div>
          )}
          {unlocked && (
            <div style={{padding:"10px",background:"rgba(127,255,68,0.05)",border:"1px solid rgba(127,255,68,0.15)",
              borderRadius:4,textAlign:"center"}}>
              <span className="mono" style={{fontSize:10,color:"var(--green-glow)"}}>✓ RANK ACHIEVED — REWARDS ACTIVE</span>
            </div>
          )}
          {!isNext && !unlocked && (
            <div style={{padding:"10px",background:"rgba(255,255,255,0.02)",border:"1px solid var(--olive-dark)",
              borderRadius:4,textAlign:"center"}}>
              <span className="mono" style={{fontSize:9,color:"var(--khaki)",opacity:0.4}}>
                REACH PRESTIGE {t.lv - 1} FIRST
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOBBY — with round length selector
// ═══════════════════════════════════════
function Lobby({ go }) {
  const [rounds, setRounds] = useState(3);
  const matches = [
    {host:"TankGod_99",p:7,wager:0.1,slots:"3/4",map:"DESERT RIDGE",mode:"FFA",rnds:5},
    {host:"SolSniper",p:2,wager:0.05,slots:"2/4",map:"MOUNTAIN PASS",mode:"FFA",rnds:3},
    {host:"NukeEmAll",p:10,wager:0.5,slots:"1/2",map:"URBAN RUINS",mode:"1v1",rnds:1},
    {host:"CasualCarl",p:0,wager:0.02,slots:"2/4",map:"GREEN VALLEY",mode:"FFA",rnds:3},
    {host:"WhaleAlert",p:5,wager:1.0,slots:"1/4",map:"FORTRESS",mode:"FFA",rnds:5},
    {host:"BootCamp_Bry",p:1,wager:0.03,slots:"3/4",map:"TRAINING",mode:"FFA",rnds:1},
  ];
  const pc = ["#666","#8a8a7a","#a0a090","#b8a88a","#c4a030","#daa520","#ff8c00","#ff6b1a","#cc2200","#9945FF","#14F195"];

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TopBar go={go} title="DEPLOY" />
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 30%",padding:"10px 12px",borderRight:"1px solid var(--olive-dark)",display:"flex",flexDirection:"column",gap:6}}>
          {/* Round selector */}
          <div style={{padding:"8px 10px",background:"rgba(26,32,16,0.4)",border:"1px solid var(--olive-dark)",borderRadius:4}}>
            <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.4,letterSpacing:2,marginBottom:6}}>MATCH LENGTH</div>
            <div style={{display:"flex",gap:4}}>
              {[1,3,5].map(r => (
                <button key={r} onClick={() => setRounds(r)} className="stencil" style={{
                  flex:1,padding:"6px 4px",fontSize:12,borderRadius:3,cursor:"pointer",
                  color:rounds===r?"var(--black)":"var(--khaki)",
                  background:rounds===r?"var(--amber)":"var(--olive-dark)",
                  border:`1px solid ${rounds===r?"var(--amber)":"var(--olive)"}`,
                  transition:"all 0.15s"}}>
                  {r === 1 ? "1" : `BO${r}`}
                </button>
              ))}
            </div>
            <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.3,marginTop:4,textAlign:"center"}}>
              {rounds === 1 ? "SUDDEN DEATH — 1 ROUND" : rounds === 3 ? "BEST OF 3 — STANDARD" : "BEST OF 5 — COMPETITIVE"}
            </div>
          </div>

          <button onClick={() => go("battle")} className="stencil" style={{
            width:"100%",padding:"12px 10px",fontSize:13,letterSpacing:2,
            color:"var(--bone)",background:"linear-gradient(180deg,#cc3300,#881a00)",
            border:"2px solid var(--rust-glow)",borderRadius:5,cursor:"pointer",
            boxShadow:"0 0 16px rgba(204,51,0,0.3)",textAlign:"center"}}>
            ⚡ QUICK MATCH
            <div className="mono" style={{fontSize:8,opacity:0.7,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.08 SOL · BO{rounds} · 4P FFA</div>
          </button>
          <button onClick={() => go("battle")} className="stencil" style={{
            width:"100%",padding:"8px",fontSize:11,letterSpacing:2,color:"var(--amber)",
            background:"var(--olive-dark)",border:"1px solid var(--olive)",borderRadius:4,cursor:"pointer",textAlign:"center"}}>
            1v1 DUEL
            <div className="mono" style={{fontSize:8,opacity:0.5,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.1 SOL · BO{rounds}</div>
          </button>
          <button className="stencil" style={{
            width:"100%",padding:"8px",fontSize:11,letterSpacing:2,color:"var(--sol-green)",
            background:"var(--olive-dark)",border:"1px solid var(--olive)",borderRadius:4,cursor:"pointer",textAlign:"center"}}>
            HIGH ROLLER
            <div className="mono" style={{fontSize:8,opacity:0.5,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.5+ SOL · BO{rounds}</div>
          </button>
          <div style={{flex:1}} />
          <button className="stencil" style={{width:"100%",padding:"7px",fontSize:10,letterSpacing:2,color:"var(--khaki)",
            background:"transparent",border:"1px solid var(--olive)",borderRadius:4,cursor:"pointer"}}>+ CREATE MATCH</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4,letterSpacing:2,marginBottom:4,paddingLeft:4}}>OPEN LOBBIES</div>
          {matches.map((m,i) => (
            <div key={i} onClick={() => go("battle")} style={{
              display:"flex",alignItems:"center",padding:"7px 10px",marginBottom:2,
              background:"rgba(26,32,16,0.35)",border:"1px solid var(--olive-dark)",borderRadius:3,cursor:"pointer"}}>
              <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginRight:8,
                background:m.p>0?pc[m.p]+"15":"var(--olive-dark)",border:`1.5px solid ${m.p>0?pc[m.p]:"var(--olive)"}`,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span className="bebas" style={{fontSize:10,color:pc[m.p]}}>{m.p>0?`P${m.p}`:"—"}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <span className="stencil" style={{fontSize:10,color:"var(--bone)",letterSpacing:1}}>{m.host}</span>
                  <span className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.4,background:"var(--olive-dark)",padding:"1px 4px",borderRadius:2}}>{m.mode}</span>
                  <span className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.3}}>BO{m.rnds}</span>
                </div>
                <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.4,marginTop:1}}>{m.map} · {m.slots}</div>
              </div>
              <div className="mono" style={{fontSize:11,color:"var(--sol-green)",fontWeight:"bold"}}>{m.wager} SOL</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// BATTLE HUD
// ═══════════════════════════════════════
function BattleHUD({ go }) {
  const [angle,setAngle]=useState(53);const [power,setPower]=useState(72);
  const [wpn,setWpn]=useState(0);const wpns=["Mortar ×99","Cluster Bomb ×3","Meltdown ×1"];
  const [showExit,setShowExit]=useState(false);
  return (
    <div style={{height:"100%",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#0a0f1a 0%,#162040 15%,#2a4060 28%,#4a6070 38%,#7a8868 48%,#c8a050 55%,#e8a030 60%,#d07028 65%,#6a4030 72%,#2a2018 82%,#0a0c08 100%)"}} />
      <div style={{position:"absolute",top:"6%",left:"8%",width:160,height:16,borderRadius:20,background:"rgba(180,170,160,0.06)",animation:"cloud-drift 25s linear infinite"}} />
      <div style={{position:"absolute",top:"30%",left:"72%",width:140,height:140,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,160,48,0.2) 0%,transparent 70%)"}} />
      <svg viewBox="0 0 960 380" preserveAspectRatio="none" style={{position:"absolute",bottom:0,left:0,width:"100%",height:"60%"}}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a6a38"/><stop offset="50%" stopColor="#3a4820"/><stop offset="100%" stopColor="#1a2010"/></linearGradient>
          <linearGradient id="tg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a5530"/><stop offset="100%" stopColor="#1a1a0a"/></linearGradient>
        </defs>
        <path d="M0,180 Q80,130 160,155 Q240,90 320,135 Q400,70 480,115 Q560,55 640,105 Q720,50 800,95 Q880,65 960,85 L960,380 L0,380Z" fill="url(#tg2)" opacity="0.5"/>
        <path d="M0,230 L30,222 Q60,205 90,215 L120,195 Q150,168 180,180 L210,162 Q240,138 270,150 L300,128 Q330,148 360,138 L390,155 Q420,138 450,148 L480,118 Q510,136 540,128 L570,142 Q600,128 630,148 L660,132 Q690,150 720,138 L750,155 Q780,142 810,160 L840,148 Q870,165 900,152 L960,158 L960,380 L0,380Z" fill="url(#tg)"/>
        <g transform="translate(155,155)"><rect x="-14" y="2" width="28" height="11" rx="2" fill="#3a4a28" stroke="#7a8a5a" strokeWidth="0.8"/><line x1="0" y1="5" x2="-22" y2="-10" stroke="#7a8a5a" strokeWidth="2.8" strokeLinecap="round"/><rect x="-16" y="13" width="32" height="6" rx="2" fill="#2a3a1a"/><text x="0" y="-14" textAnchor="middle" fill="var(--green-glow)" fontSize="9" fontFamily="Share Tech Mono" fontWeight="bold">You</text></g>
        <g transform="translate(720,115)"><rect x="-14" y="2" width="28" height="11" rx="2" fill="#5a2a1a" stroke="#aa5533" strokeWidth="0.8"/><line x1="0" y1="5" x2="20" y2="-8" stroke="#aa5533" strokeWidth="2.8" strokeLinecap="round"/><rect x="-16" y="13" width="32" height="6" rx="2" fill="#4a2010"/><text x="0" y="-14" textAnchor="middle" fill="var(--rust-glow)" fontSize="9" fontFamily="Share Tech Mono">xXDestroyerXx</text></g>
        <path d="M140,148 Q380,0 708,108" fill="none" stroke="rgba(255,182,39,0.15)" strokeWidth="1" strokeDasharray="6,6"/>
      </svg>

      <div style={{position:"absolute",top:8,left:10,display:"flex",gap:6,zIndex:20}}>
        <button onClick={()=>setShowExit(!showExit)} className="mono" style={{background:"rgba(10,12,8,0.7)",border:"1px solid var(--olive)",borderRadius:3,color:"var(--khaki)",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>☰</button>
        {showExit&&<button onClick={()=>go("menu")} className="mono" style={{background:"rgba(140,20,0,0.85)",border:"1px solid var(--rust-glow)",borderRadius:3,color:"var(--bone)",fontSize:9,padding:"4px 10px",cursor:"pointer",animation:"slide-in 0.15s ease-out"}}>✕ EXIT — FORFEIT 0.16 SOL</button>}
        <div style={{background:"rgba(10,12,8,0.7)",border:"1px solid var(--olive)",borderRadius:3,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}>
          <span className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.5}}>WIND</span>
          <span className="stencil" style={{fontSize:15,color:"var(--bone)"}}>23</span>
          <span style={{fontSize:13,color:"var(--amber)",animation:"wind-drift 2s ease-in-out infinite"}}>→</span>
        </div>
        <div style={{background:"rgba(10,12,8,0.7)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:3,padding:"3px 10px",display:"flex",alignItems:"center",gap:4}}>
          <span style={{fontSize:10}}>🪙</span><span className="mono" style={{fontSize:11,color:"var(--gold)"}}>1,850</span>
        </div>
      </div>
      <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:20,background:"rgba(10,12,8,0.7)",border:"1px solid var(--sol-green)",borderRadius:4,padding:"3px 16px",display:"flex",alignItems:"center",gap:6}}>
        <span className="mono" style={{fontSize:8,color:"var(--sol-green)",opacity:0.6}}>POT</span>
        <span className="mono" style={{fontSize:15,color:"var(--sol-green)",fontWeight:"bold"}}>0.32 SOL</span>
      </div>
      <div style={{position:"absolute",top:8,right:10,zIndex:20,background:"rgba(10,12,8,0.7)",border:"1px solid var(--olive)",borderRadius:3,padding:"3px 10px"}}>
        <span className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.5}}>ROUND </span><span className="stencil" style={{fontSize:14,color:"var(--bone)"}}>3 / 5</span>
      </div>
      <div style={{position:"absolute",top:36,left:10,right:10,display:"flex",gap:30,zIndex:20}}>
        <div style={{flex:"0 0 180px"}}><div className="mono" style={{fontSize:7,color:"var(--green-glow)",marginBottom:2}}>YOU — 78 HP</div><div style={{height:3,background:"rgba(10,12,8,0.5)",borderRadius:2}}><div style={{width:"78%",height:"100%",borderRadius:2,background:"var(--green-glow)"}}/></div></div>
        <div style={{flex:"0 0 180px",marginLeft:"auto"}}><div className="mono" style={{fontSize:7,color:"var(--rust-glow)",marginBottom:2,textAlign:"right"}}>xXDestroyerXx — 45 HP</div><div style={{height:3,background:"rgba(10,12,8,0.5)",borderRadius:2}}><div style={{width:"45%",height:"100%",borderRadius:2,background:"var(--rust-glow)",marginLeft:"auto"}}/></div></div>
      </div>
      <div style={{position:"absolute",bottom:10,left:10,zIndex:20,background:"rgba(10,12,8,0.75)",border:"1px solid var(--olive)",borderRadius:4,padding:"6px 12px",width:155}}>
        <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.5,marginBottom:2}}>ANGLE</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span className="bebas" style={{fontSize:28,color:"var(--bone)",lineHeight:1,width:44}}>{angle}°</span><input type="range" min="0" max="90" value={angle} onChange={e=>setAngle(+e.target.value)}/></div>
      </div>
      <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",zIndex:20,display:"flex",alignItems:"center",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(10,12,8,0.75)",border:"1px solid var(--olive)",borderRadius:4,padding:"6px 10px"}}>
          <button onClick={()=>setWpn(Math.max(0,wpn-1))} style={{background:"none",border:"1px solid var(--olive)",borderRadius:2,color:"var(--khaki)",fontSize:13,padding:"1px 7px",cursor:"pointer",lineHeight:1}}>◂</button>
          <span className="stencil" style={{fontSize:11,color:"var(--amber)",letterSpacing:1,minWidth:130,textAlign:"center"}}>{wpns[wpn]}</span>
          <button onClick={()=>setWpn(Math.min(wpns.length-1,wpn+1))} style={{background:"none",border:"1px solid var(--olive)",borderRadius:2,color:"var(--khaki)",fontSize:13,padding:"1px 7px",cursor:"pointer",lineHeight:1}}>▸</button>
        </div>
        <button className="stencil" style={{padding:"10px 30px",fontSize:18,letterSpacing:5,color:"var(--bone)",background:"linear-gradient(180deg,#cc3300,#881a00)",border:"2px solid var(--rust-glow)",borderRadius:5,cursor:"pointer",boxShadow:"0 0 20px rgba(204,51,0,0.4),inset 0 1px 0 rgba(255,255,255,0.1)",textShadow:"0 2px 4px rgba(0,0,0,0.5)"}}>FIRE</button>
      </div>
      <div style={{position:"absolute",bottom:10,right:10,zIndex:20,background:"rgba(10,12,8,0.75)",border:"1px solid var(--olive)",borderRadius:4,padding:"6px 12px",width:155}}>
        <div className="mono" style={{fontSize:7,color:"var(--khaki)",opacity:0.5,marginBottom:2}}>POWER</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span className="bebas" style={{fontSize:28,color:power>80?"var(--rust-glow)":"var(--bone)",lineHeight:1,width:44}}>{power}%</span><input type="range" min="0" max="100" value={power} onChange={e=>setPower(+e.target.value)}/></div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// WIN SCREEN — with SHOT milestone
// ═══════════════════════════════════════
function WinScreen({ go }) {
  const [show,setShow]=useState(0);
  useEffect(()=>{const a=setTimeout(()=>setShow(1),600);const b=setTimeout(()=>setShow(2),1200);const c=setTimeout(()=>setShow(3),1800);return()=>{clearTimeout(a);clearTimeout(b);clearTimeout(c)};},[]);
  return (
    <div style={{height:"100%",position:"relative",overflow:"hidden",background:"linear-gradient(180deg,#0a1808,#0c2010,#0a0c08)"}}>
      <div style={{position:"absolute",top:"10%",left:"50%",transform:"translateX(-50%)",width:400,height:200,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(127,255,68,0.08) 0%,transparent 70%)"}} />
      <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",zIndex:10}}>
        <div className="stencil" style={{fontSize:52,color:"var(--green-glow)",letterSpacing:6,lineHeight:1,
          animation:"stamp 0.5s ease-out,victory-pulse 2s ease-in-out 0.5s infinite",
          textShadow:"0 0 30px rgba(127,255,68,0.5),0 4px 0 #2a5a10",marginBottom:6}}>VICTORY</div>
        <div className="mono" style={{fontSize:10,color:"var(--khaki)",opacity:0.6,letterSpacing:3,marginBottom:20}}>MATCH COMPLETE — BEST OF 5 — 3 ROUNDS WON</div>

        {/* Earnings row */}
        <div style={{display:"flex",gap:12,marginBottom:16}}>
          {/* SOL earned */}
          <div style={{background:"rgba(20,241,149,0.08)",border:"2px solid var(--sol-green)",borderRadius:8,padding:"12px 28px",textAlign:"center",
            animation:show>=1?"sol-count 0.3s ease-out":"none",opacity:show>=1?1:0,transition:"opacity 0.3s"}}>
            <div className="mono" style={{fontSize:8,color:"var(--sol-green)",opacity:0.6,letterSpacing:2,marginBottom:3}}>SOL EARNED</div>
            <div className="stencil" style={{fontSize:30,color:"var(--sol-green)",letterSpacing:2}}>+0.288</div>
            <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.3,marginTop:2}}>0.32 POT — 10% RAKE</div>
          </div>
          {/* SHOT milestone (conditional) */}
          <div style={{background:"rgba(255,182,39,0.06)",border:"1px solid rgba(255,182,39,0.3)",borderRadius:8,padding:"12px 20px",textAlign:"center",
            opacity:show>=2?1:0,transition:"opacity 0.4s",animation:show>=2?"slide-up 0.3s ease-out":"none"}}>
            <div className="mono" style={{fontSize:8,color:"var(--amber)",opacity:0.6,letterSpacing:2,marginBottom:3}}>MILESTONE</div>
            <div className="stencil" style={{fontSize:24,color:"var(--amber)"}}>+5 SHOT</div>
            <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4,marginTop:2}}>🏆 3 WINS TODAY</div>
          </div>
        </div>

        {/* Stats */}
        {show>=2 && (
          <div style={{display:"flex",gap:12,marginBottom:24,animation:"slide-up 0.4s ease-out"}}>
            {[{l:"DAMAGE",v:"342"},{l:"KILLS",v:"3"},{l:"ACCURACY",v:"67%"},{l:"BEST SHOT",v:"128 dmg"},{l:"GOLD EARNED",v:"2,850"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center",padding:"6px 10px",background:"rgba(26,32,16,0.4)",border:"1px solid var(--olive-dark)",borderRadius:3}}>
                <div className="mono" style={{fontSize:6,color:"var(--khaki)",opacity:0.4,letterSpacing:1,marginBottom:2}}>{s.l}</div>
                <div className="stencil" style={{fontSize:14,color:"var(--bone)"}}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:10,opacity:show>=3?1:0,transition:"opacity 0.3s"}}>
          <button onClick={()=>go("battle")} className="stencil" style={{
            padding:"11px 28px",fontSize:14,letterSpacing:3,color:"var(--bone)",
            background:"linear-gradient(180deg,var(--rust),#8a3a08)",border:"2px solid var(--rust-glow)",
            borderRadius:5,cursor:"pointer",boxShadow:"0 0 16px rgba(196,81,10,0.3)"}}>⚡ REMATCH — 0.08 SOL</button>
          <button onClick={()=>go("lobby")} className="stencil" style={{padding:"11px 20px",fontSize:12,letterSpacing:2,
            color:"var(--khaki)",background:"var(--olive-dark)",border:"1px solid var(--olive)",borderRadius:5,cursor:"pointer"}}>LOBBY</button>
          <button onClick={()=>go("menu")} className="mono" style={{padding:"11px 14px",fontSize:10,color:"var(--khaki)",
            background:"transparent",border:"1px solid var(--olive)",borderRadius:5,cursor:"pointer",opacity:0.6}}>MENU</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOSE SCREEN — SOL only, no SHOT loss
// ═══════════════════════════════════════
function LoseScreen({ go }) {
  const [show,setShow]=useState(0);
  useEffect(()=>{const a=setTimeout(()=>setShow(1),800);const b=setTimeout(()=>setShow(2),1400);return()=>{clearTimeout(a);clearTimeout(b)};},[]);
  return (
    <div style={{height:"100%",position:"relative",overflow:"hidden",background:"linear-gradient(180deg,#1a0808,#120808,#0a0808)"}}>
      <div style={{position:"absolute",top:"10%",left:"50%",transform:"translateX(-50%)",width:400,height:200,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(204,34,0,0.06) 0%,transparent 70%)"}} />
      <div style={{position:"absolute",bottom:"30%",left:"30%",width:20,height:20,borderRadius:"50%",background:"rgba(100,80,60,0.15)",animation:"explosion-glow 6s ease-out infinite"}} />

      <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",zIndex:10}}>
        <div className="stencil" style={{fontSize:48,color:"var(--red)",letterSpacing:5,lineHeight:1,
          animation:"stamp 0.6s ease-out,defeat-pulse 3s ease-in-out 0.6s infinite",
          textShadow:"0 0 20px rgba(204,34,0,0.4),0 4px 0 #3a0a00",marginBottom:6,opacity:0.9}}>DEFEATED</div>
        <div className="mono" style={{fontSize:10,color:"var(--khaki)",opacity:0.5,letterSpacing:3,marginBottom:20}}>ELIMINATED — ROUND 4 OF 5</div>

        {/* SOL lost */}
        <div style={{background:"rgba(204,34,0,0.06)",border:"1px solid rgba(204,34,0,0.3)",borderRadius:8,padding:"12px 32px",marginBottom:20,textAlign:"center"}}>
          <div className="mono" style={{fontSize:8,color:"var(--red)",opacity:0.6,letterSpacing:2,marginBottom:3}}>WAGER LOST</div>
          <div className="stencil" style={{fontSize:28,color:"var(--red)",letterSpacing:2,opacity:0.8}}>−0.08 SOL</div>
          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.3,marginTop:3}}>Winner: xXDestroyerXx</div>
        </div>

        {/* Stats */}
        {show>=1 && (
          <div style={{display:"flex",gap:12,marginBottom:24,animation:"slide-up 0.4s ease-out"}}>
            {[{l:"DAMAGE",v:"218"},{l:"KILLS",v:"1"},{l:"ACCURACY",v:"42%"},{l:"ROUNDS WON",v:"1 / 4"},{l:"BEST SHOT",v:"86 dmg"}].map((s,i)=>(
              <div key={i} style={{textAlign:"center",padding:"6px 10px",background:"rgba(30,16,16,0.5)",border:"1px solid rgba(100,30,20,0.2)",borderRadius:3}}>
                <div className="mono" style={{fontSize:6,color:"var(--khaki)",opacity:0.35,letterSpacing:1,marginBottom:2}}>{s.l}</div>
                <div className="stencil" style={{fontSize:14,color:"var(--bone)",opacity:0.7}}>{s.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{display:"flex",gap:10,opacity:show>=2?1:0,transition:"opacity 0.3s"}}>
          <button onClick={()=>go("battle")} className="stencil" style={{
            padding:"11px 28px",fontSize:14,letterSpacing:3,color:"var(--bone)",
            background:"linear-gradient(180deg,var(--rust),#8a3a08)",border:"2px solid var(--rust-glow)",
            borderRadius:5,cursor:"pointer",boxShadow:"0 0 16px rgba(196,81,10,0.3)"}}>⚡ RUN IT BACK — 0.08 SOL</button>
          <button onClick={()=>go("lobby")} className="stencil" style={{padding:"11px 20px",fontSize:12,letterSpacing:2,
            color:"var(--khaki)",background:"var(--olive-dark)",border:"1px solid var(--olive)",borderRadius:5,cursor:"pointer"}}>LOBBY</button>
          <button onClick={()=>go("menu")} className="mono" style={{padding:"11px 14px",fontSize:10,color:"var(--khaki)",
            background:"transparent",border:"1px solid var(--olive)",borderRadius:5,cursor:"pointer",opacity:0.6}}>MENU</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// BARRACKS (profile)
// ═══════════════════════════════════════
function Barracks({ go }) {
  const stats = [
    {l:"MATCHES PLAYED",v:"342"},{l:"WIN RATE",v:"58.2%"},{l:"TOTAL KILLS",v:"891"},{l:"SOL EARNED",v:"14.7 SOL"},
    {l:"SOL WAGERED",v:"28.3 SOL"},{l:"TOKENS BURNED",v:"1,200 SHOT"},{l:"FAVOURITE WEAPON",v:"Cluster Bomb"},{l:"LONGEST STREAK",v:"12 wins"},
  ];
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TopBar go={go} title="BARRACKS" />
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 35%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"16px 20px",borderRight:"1px solid var(--olive-dark)"}}>
          <div style={{width:70,height:70,borderRadius:"50%",marginBottom:10,background:"linear-gradient(135deg,var(--olive-dark),var(--olive))",border:"2px solid var(--khaki)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 20px rgba(184,168,138,0.1)"}}>
            <span style={{fontSize:28}}>⬡</span>
          </div>
          <div className="stencil" style={{fontSize:14,color:"var(--bone)",letterSpacing:1,marginBottom:2}}>PLAYER_ONE</div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
            <span style={{fontSize:8,color:"#b8a88a",background:"#b8a88a18",border:"1px solid #b8a88a33",borderRadius:3,padding:"1px 5px",fontFamily:"'Bebas Neue'",letterSpacing:1}}>P3</span>
            <span className="mono" style={{fontSize:9,color:"#b8a88a"}}>SERGEANT</span>
          </div>
          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4}}>Joined Dec 2025</div>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"10px 14px"}}>
          <div className="mono" style={{fontSize:8,color:"var(--khaki)",opacity:0.4,letterSpacing:2,marginBottom:6}}>COMBAT RECORD</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {stats.map((s,i)=>(
              <div key={i} style={{padding:"8px 10px",background:"rgba(26,32,16,0.35)",border:"1px solid var(--olive-dark)",borderRadius:3}}>
                <div className="mono" style={{fontSize:6,color:"var(--khaki)",opacity:0.5,letterSpacing:1,marginBottom:2}}>{s.l}</div>
                <div className="stencil" style={{fontSize:13,color:"var(--bone)",letterSpacing:1}}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// APP
// ═══════════════════════════════════════
export default function SolShot() {
  const [screen,setScreen]=useState("menu");
  const go=s=>setScreen(s);
  const S={menu:<MainMenu go={go}/>,lobby:<Lobby go={go}/>,armory:<Armory go={go}/>,prestige:<Prestige go={go}/>,barracks:<Barracks go={go}/>,battle:<BattleHUD go={go}/>,shop:<Armory go={go}/>,win:<WinScreen go={go}/>,lose:<LoseScreen go={go}/>};
  return (
    <div style={{background:"#030405",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"12px",fontFamily:"'Share Tech Mono',monospace"}}>
      <style>{styles}</style>
      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap",justifyContent:"center"}}>
        {["menu","lobby","armory","prestige","barracks","battle","win","lose"].map(s=>(
          <button key={s} onClick={()=>go(s)} className="mono" style={{padding:"3px 8px",fontSize:8,letterSpacing:1,
            color:screen===s?"#0a0c08":"var(--khaki)",background:screen===s?"var(--amber)":"transparent",
            border:`1px solid ${screen===s?"var(--amber)":"var(--olive)"}`,borderRadius:2,cursor:"pointer"}}>{s}</button>
        ))}
      </div>
      <div style={{width:"100%",maxWidth:860,aspectRatio:"16/9",position:"relative",overflow:"hidden",borderRadius:8,
        border:"1px solid var(--olive)",boxShadow:"0 0 40px rgba(0,0,0,0.5)",animation:"flicker 5s infinite"}}>
        <div className="noise-overlay"/><div className="scanlines"/>
        {S[screen]||<MainMenu go={go}/>}
      </div>
    </div>
  );
}
