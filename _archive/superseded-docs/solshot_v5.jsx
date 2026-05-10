import { useState, useEffect } from "react";

const S = `
@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Share+Tech+Mono&family=Bebas+Neue&display=swap');
:root{--ol:#3d4a2f;--od:#2a331f;--kh:#b8a88a;--ru:#c4510a;--rg:#ff6b1a;--am:#ffb627;--ad:#a67b1a;--st:#6b7b8d;--sd:#3a4550;--bn:#e8dcc8;--mu:#5c4a3a;--bk:#0a0c08;--gg:#7fff44;--rd:#cc2200;--sp:#9945FF;--sg:#14F195;--gd:#ffd700}
*{box-sizing:border-box;margin:0;padding:0}
.st{font-family:'Black Ops One',cursive}.mo{font-family:'Share Tech Mono',monospace}.be{font-family:'Bebas Neue',sans-serif}
@keyframes si{from{transform:translateX(-16px);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes su{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
@keyframes wd{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
@keyframes cd{0%{transform:translateX(0)}100%{transform:translateX(30px)}}
@keyframes fl{0%,100%{opacity:1}50%{opacity:0.98}}
@keyframes eg{0%{opacity:0;transform:scale(.5)}20%{opacity:.8;transform:scale(1.2)}100%{opacity:0;transform:scale(2)}}
@keyframes vp{0%,100%{text-shadow:0 0 20px rgba(127,255,68,.4)}50%{text-shadow:0 0 30px rgba(127,255,68,.7)}}
@keyframes dp{0%,100%{text-shadow:0 0 20px rgba(204,34,0,.4)}50%{text-shadow:0 0 30px rgba(204,34,0,.6)}}
@keyframes sc{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes sm{0%{transform:scale(3) rotate(-10deg);opacity:0}60%{transform:scale(1) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0deg)}}
@keyframes ug{0%,100%{box-shadow:0 0 8px rgba(255,215,0,0.2)}50%{box-shadow:0 0 16px rgba(255,215,0,0.5)}}
.no{position:absolute;inset:0;opacity:0.03;pointer-events:none;z-index:100;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.sl{position:absolute;inset:0;pointer-events:none;z-index:99;background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.02) 2px,rgba(0,0,0,0.02) 4px)}
input[type="range"]{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;background:var(--od);outline:none;width:100%}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;border:2px solid var(--bn);background:var(--am)}
`;

// Shared components
const W=()=><div style={{display:"flex",alignItems:"center",gap:6}}><div className="mo" style={{fontSize:10,color:"var(--sg)"}}>◆ 2.41 SOL</div><div style={{width:1,height:12,background:"var(--ol)"}}/><div className="mo" style={{fontSize:10,color:"var(--am)"}}>⬡ 847 SHOT</div></div>;
const TB=({go,title})=><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--ol)",background:"rgba(26,32,16,0.5)",flexShrink:0}}><button onClick={()=>go("menu")} className="mo" style={{background:"rgba(10,12,8,0.6)",border:"1px solid var(--ol)",borderRadius:3,color:"var(--kh)",fontSize:10,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:12}}>◂</span> MENU</button><span className="st" style={{fontSize:18,color:"var(--bn)",letterSpacing:2}}>{title}</span><W/></div>;

// ── MAIN MENU ──
function Menu({go}){
  const[h,sH]=useState(null);
  const I=[{l:"DEPLOY",s:"Find a match",t:"lobby",a:"var(--rg)"},{l:"ARMORY",s:"Skins & cosmetics",t:"armory",a:"var(--am)"},{l:"PRESTIGE",s:"Rank & burn",t:"prestige",a:"var(--gg)"},{l:"BARRACKS",s:"Profile & stats",t:"barracks",a:"var(--st)"}];
  return(
    <div style={{height:"100%",display:"flex",position:"relative",overflow:"hidden",background:"linear-gradient(135deg,#0c1008,#1a2a12 40%,#0a0c08)"}}>
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"55%",background:"linear-gradient(180deg,transparent,#1a1208 50%)",clipPath:"polygon(0% 50%,5% 35%,12% 45%,20% 20%,28% 35%,35% 15%,42% 30%,50% 10%,58% 25%,65% 12%,72% 28%,78% 18%,85% 32%,92% 22%,100% 30%,100% 100%,0% 100%)",opacity:0.4}}/>
      <div style={{position:"absolute",top:"30%",left:"60%",width:60,height:60,borderRadius:"50%",background:"radial-gradient(circle,rgba(255,107,26,0.25),transparent 70%)",animation:"eg 5s ease-out infinite"}}/>
      <div style={{flex:"0 0 45%",display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 40px",position:"relative",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
          <div style={{width:40,height:56,border:"2px solid var(--kh)",borderRadius:"3px 3px 10px 10px",background:"linear-gradient(135deg,var(--sd),var(--st))",boxShadow:"0 3px 10px rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",top:-7,width:12,height:12,borderRadius:"50%",border:"2px solid var(--kh)",background:"var(--sd)"}}/>
            <span className="st" style={{fontSize:15,color:"var(--bn)"}}>S</span>
          </div>
          <div>
            <h1 className="st" style={{fontSize:44,color:"var(--bn)",letterSpacing:2,lineHeight:1,textShadow:"0 0 16px rgba(255,107,26,0.3),0 3px 0 var(--mu)"}}>SOL<span style={{color:"var(--rg)"}}>SHOT</span></h1>
            <div className="mo" style={{fontSize:9,color:"var(--kh)",letterSpacing:3,opacity:0.6,marginTop:2}}>ARTILLERY COMBAT ON SOLANA</div>
          </div>
        </div>
        <div style={{display:"inline-flex",alignItems:"center",gap:4,background:"rgba(153,69,255,0.1)",border:"1px solid rgba(153,69,255,0.25)",borderRadius:16,padding:"2px 10px",width:"fit-content",marginTop:8}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:"var(--sg)"}}/>
          <span className="mo" style={{fontSize:8,color:"var(--sg)"}}>POWERED BY SOLANA</span>
        </div>
        <div style={{marginTop:20,padding:"8px 12px",background:"rgba(10,12,8,0.5)",border:"1px solid var(--ol)",borderRadius:4,width:"fit-content"}}><W/></div>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 40px 0 20px",gap:8,position:"relative",zIndex:10}}>
        {I.map((x,i)=><button key={i} onClick={()=>go(x.t)} onMouseEnter={()=>sH(i)} onMouseLeave={()=>sH(null)} className="st" style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",background:h===i?"rgba(255,107,26,0.1)":"rgba(26,32,16,0.7)",border:`1px solid ${h===i?x.a:"var(--ol)"}`,borderLeft:`3px solid ${x.a}`,borderRadius:4,cursor:"pointer",transition:"all 0.2s",animation:`si 0.3s ease-out ${i*0.08}s both`,textAlign:"left"}}><div><div style={{fontSize:16,color:"var(--bn)",letterSpacing:2}}>{x.l}</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.5,letterSpacing:1,marginTop:1}}>{x.s}</div></div><div style={{fontSize:14,color:x.a,opacity:h===i?1:0.3,transition:"all 0.2s",transform:h===i?"translateX(3px)":"none"}}>▸</div></button>)}
      </div>
      <div className="mo" style={{position:"absolute",bottom:8,left:16,fontSize:8,color:"var(--kh)",opacity:0.3}}>v0.1.0</div>
    </div>
  );
}

// ── LOBBY ──
function Lobby({go}){
  const[r,sR]=useState(3);
  const M=[{h:"TankGod_99",p:7,w:0.1,s:"3/4",m:"DESERT RIDGE",md:"FFA",r:5},{h:"SolSniper",p:2,w:0.05,s:"2/4",m:"MOUNTAIN PASS",md:"FFA",r:3},{h:"NukeEmAll",p:10,w:0.5,s:"1/2",m:"URBAN RUINS",md:"1v1",r:1},{h:"CasualCarl",p:0,w:0.02,s:"2/4",m:"GREEN VALLEY",md:"FFA",r:3},{h:"WhaleAlert",p:5,w:1.0,s:"1/4",m:"FORTRESS",md:"FFA",r:5},{h:"BootCamp",p:1,w:0.03,s:"3/4",m:"TRAINING",md:"FFA",r:1}];
  const pc=["#666","#8a8a7a","#a0a090","#b8a88a","#c4a030","#daa520","#ff8c00","#ff6b1a","#cc2200","#9945FF","#14F195"];
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TB go={go} title="DEPLOY"/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 30%",padding:"10px 12px",borderRight:"1px solid var(--od)",display:"flex",flexDirection:"column",gap:6}}>
          <div style={{padding:"8px 10px",background:"rgba(26,32,16,0.4)",border:"1px solid var(--od)",borderRadius:4}}>
            <div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:6}}>MATCH LENGTH</div>
            <div style={{display:"flex",gap:4}}>
              {[1,3,5].map(v=><button key={v} onClick={()=>sR(v)} className="st" style={{flex:1,padding:"6px 4px",fontSize:12,borderRadius:3,cursor:"pointer",color:r===v?"var(--bk)":"var(--kh)",background:r===v?"var(--am)":"var(--od)",border:`1px solid ${r===v?"var(--am)":"var(--ol)"}`,transition:"all 0.15s"}}>{v===1?"1":`BO${v}`}</button>)}
            </div>
            <div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.3,marginTop:4,textAlign:"center"}}>{r===1?"SUDDEN DEATH":r===3?"BEST OF 3":"BEST OF 5"}</div>
          </div>
          <button onClick={()=>go("shop")} className="st" style={{width:"100%",padding:"12px 10px",fontSize:13,letterSpacing:2,color:"var(--bn)",background:"linear-gradient(180deg,#cc3300,#881a00)",border:"2px solid var(--rg)",borderRadius:5,cursor:"pointer",boxShadow:"0 0 16px rgba(204,51,0,0.3)",textAlign:"center"}}>⚡ QUICK MATCH<div className="mo" style={{fontSize:8,opacity:0.7,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.08 SOL · BO{r} · 4P FFA</div></button>
          <button onClick={()=>go("shop")} className="st" style={{width:"100%",padding:"8px",fontSize:11,letterSpacing:2,color:"var(--am)",background:"var(--od)",border:"1px solid var(--ol)",borderRadius:4,cursor:"pointer",textAlign:"center"}}>1v1 DUEL<div className="mo" style={{fontSize:8,opacity:0.5,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.1 SOL · BO{r}</div></button>
          <button onClick={()=>go("shop")} className="st" style={{width:"100%",padding:"8px",fontSize:11,letterSpacing:2,color:"var(--sg)",background:"var(--od)",border:"1px solid var(--ol)",borderRadius:4,cursor:"pointer",textAlign:"center"}}>HIGH ROLLER<div className="mo" style={{fontSize:8,opacity:0.5,marginTop:2,fontFamily:"'Share Tech Mono'"}}>0.5+ SOL · BO{r}</div></button>
          <div style={{flex:1}}/>
          <button onClick={()=>go("shop")} className="st" style={{width:"100%",padding:"7px",fontSize:10,letterSpacing:2,color:"var(--kh)",background:"transparent",border:"1px solid var(--ol)",borderRadius:4,cursor:"pointer"}}>+ CREATE MATCH</button>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
          <div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:4,paddingLeft:4}}>OPEN LOBBIES</div>
          {M.map((x,i)=><div key={i} onClick={()=>go("shop")} style={{display:"flex",alignItems:"center",padding:"7px 10px",marginBottom:2,background:"rgba(26,32,16,0.35)",border:"1px solid var(--od)",borderRadius:3,cursor:"pointer"}}>
            <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginRight:8,background:x.p>0?pc[x.p]+"15":"var(--od)",border:`1.5px solid ${x.p>0?pc[x.p]:"var(--ol)"}`,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="be" style={{fontSize:10,color:pc[x.p]}}>{x.p>0?`P${x.p}`:"—"}</span></div>
            <div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:5}}><span className="st" style={{fontSize:10,color:"var(--bn)",letterSpacing:1}}>{x.h}</span><span className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,background:"var(--od)",padding:"1px 4px",borderRadius:2}}>{x.md}</span><span className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.3}}>BO{x.r}</span></div><div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,marginTop:1}}>{x.m} · {x.s}</div></div>
            <div className="mo" style={{fontSize:11,color:"var(--sg)",fontWeight:"bold"}}>{x.w} SOL</div>
          </div>)}
        </div>
      </div>
    </div>
  );
}

// ── WEAPON SHOP (between rounds) ──
function Shop({go}){
  const[sel,sS]=useState(0);const[gd,sG]=useState(1850);const[inv,sI]=useState([99,0,0,0,0,0,0]);
  const WP=[{n:"Mortar",p:0,t:"s",d:"Standard issue. Infinite.",dm:25,bl:30,ic:"●"},{n:"Cluster Bomb",p:300,t:"s",d:"5 bomblets on descent.",dm:40,bl:60,ic:"●"},{n:"Meltdown",p:600,t:"r",d:"Napalm. Burns 3 turns.",dm:55,bl:45,ic:"★"},{n:"Dirt Wall",p:200,t:"t",d:"Raise terrain. Shield.",dm:0,bl:80,ic:"▦"},{n:"Mega Roller",p:800,t:"r",d:"Downhill crusher.",dm:65,bl:20,ic:"★"},{n:"U238 Penetrator",p:1200,t:"e",d:"Through terrain.",dm:80,bl:10,ic:"◆"},{n:"Tactical Nuke",p:2500,t:"l",d:"Total devastation.",dm:100,bl:100,ic:"☢"}];
  const tc={s:"var(--kh)",t:"var(--st)",r:"var(--am)",e:"var(--sp)",l:"var(--rg)"};
  const buy=i=>{if(WP[i].p===0||WP[i].p>gd)return;sG(g=>g-WP[i].p);sI(v=>{const n=[...v];n[i]++;return n})};
  const w=WP[sel];
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 16px",borderBottom:"1px solid var(--ol)",background:"rgba(26,32,16,0.5)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><span className="st" style={{fontSize:16,color:"var(--bn)",letterSpacing:2}}>WEAPON SHOP</span><span className="mo" style={{fontSize:9,color:"var(--kh)",opacity:0.4}}>ROUND 1 OF 5</span></div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,215,0,0.1)",border:"1px solid rgba(255,215,0,0.3)",padding:"3px 12px",borderRadius:3}}><span style={{fontSize:12}}>🪙</span><span className="st" style={{fontSize:16,color:"var(--gd)"}}>{gd.toLocaleString()}</span><span className="mo" style={{fontSize:8,color:"var(--gd)",opacity:0.6}}>GOLD</span></div>
          <div style={{background:"rgba(10,12,8,0.5)",border:"1px solid var(--sg)",borderRadius:3,padding:"3px 10px"}}><span className="mo" style={{fontSize:9,color:"var(--sg)",opacity:0.6}}>POT </span><span className="mo" style={{fontSize:11,color:"var(--sg)"}}>0.32 SOL</span></div>
        </div>
      </div>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 58%",overflow:"auto",padding:"6px 10px",borderRight:"1px solid var(--od)"}}>
          {WP.map((wp,i)=><div key={i} onClick={()=>sS(i)} style={{display:"flex",alignItems:"center",padding:"7px 10px",marginBottom:2,background:sel===i?"rgba(255,215,0,0.06)":"rgba(26,32,16,0.3)",border:`1px solid ${sel===i?"rgba(255,215,0,0.2)":"transparent"}`,borderLeft:`3px solid ${tc[wp.t]}`,borderRadius:3,cursor:"pointer",transition:"all 0.12s"}}>
            <div style={{width:26,height:26,borderRadius:3,flexShrink:0,marginRight:8,background:`linear-gradient(135deg,var(--od),${tc[wp.t]}18)`,border:`1px solid ${tc[wp.t]}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>{wp.ic}</div>
            <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span className="st" style={{fontSize:11,color:tc[wp.t],letterSpacing:1}}>{wp.n}</span><div style={{display:"flex",alignItems:"center",gap:8}}><span className="mo" style={{fontSize:9,color:"var(--bn)",opacity:0.6}}>×{inv[i]}</span>{wp.p>0&&<button onClick={e=>{e.stopPropagation();buy(i)}} className="mo" style={{fontSize:8,padding:"2px 8px",borderRadius:2,cursor:"pointer",background:wp.p<=gd?"rgba(255,215,0,0.15)":"var(--od)",border:`1px solid ${wp.p<=gd?"rgba(255,215,0,0.35)":"var(--ol)"}`,color:wp.p<=gd?"var(--gd)":"var(--kh)",opacity:wp.p<=gd?1:0.4}}>+ BUY</button>}</div></div>
              <div style={{height:2,background:"var(--od)",borderRadius:1,marginTop:3}}><div style={{width:`${wp.dm}%`,height:"100%",borderRadius:1,background:wp.dm>80?"var(--rg)":wp.dm>50?"var(--am)":"var(--kh)"}}/></div>
            </div>
            <div className="mo" style={{fontSize:10,marginLeft:10,flexShrink:0,width:44,textAlign:"right",color:wp.p===0?"var(--gg)":wp.p>gd?"var(--rd)":"var(--gd)"}}>{wp.p===0?"FREE":`🪙${wp.p}`}</div>
          </div>)}
        </div>
        <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column"}}>
          <div className="st" style={{fontSize:18,color:tc[w.t],letterSpacing:1,marginBottom:4}}>{w.n}</div>
          <div className="mo" style={{fontSize:10,color:"var(--kh)",opacity:0.7,lineHeight:1.5,marginBottom:14}}>{w.d}</div>
          {[{l:"DAMAGE",v:w.dm,c:w.dm>80?"var(--rg)":"var(--am)"},{l:"BLAST",v:w.bl,c:"var(--kh)"}].map((s,i)=><div key={i} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}><span className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.5}}>{s.l}</span><span className="mo" style={{fontSize:7,color:s.c}}>{s.v}</span></div><div style={{height:4,background:"var(--od)",borderRadius:2}}><div style={{width:`${s.v}%`,height:"100%",borderRadius:2,background:s.c,transition:"width 0.3s"}}/></div></div>)}
          <div style={{flex:1}}/>
          <div style={{borderTop:"1px solid var(--od)",paddingTop:8}}><div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:4}}>LOADOUT</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{WP.map((wp,i)=>inv[i]>0&&<span key={i} className="mo" style={{fontSize:8,color:tc[wp.t],background:tc[wp.t]+"12",border:`1px solid ${tc[wp.t]}33`,padding:"2px 6px",borderRadius:2}}>{wp.n} ×{inv[i]}</span>)}</div></div>
        </div>
      </div>
      <div style={{padding:"8px 16px",borderTop:"1px solid var(--ol)",background:"rgba(10,12,8,0.9)",flexShrink:0}}>
        <button onClick={()=>go("battle")} className="st" style={{width:"100%",padding:"10px",fontSize:15,letterSpacing:3,color:"var(--bn)",background:"linear-gradient(180deg,var(--ru),#8a3a08)",border:"1px solid var(--rg)",borderRadius:4,cursor:"pointer",boxShadow:"0 0 12px rgba(196,81,10,0.3)"}}>READY — START ROUND</button>
      </div>
    </div>
  );
}

// ── BATTLE HUD ──
function Battle({go}){
  const[a,sA]=useState(53);const[p,sP]=useState(72);const[wp,sW]=useState(0);const wps=["Mortar ×99","Cluster ×3","Meltdown ×1"];
  const[ex,sE]=useState(false);const[rd,sR]=useState(1);
  const fire=()=>{const n=rd+1;if(n>3){go(Math.random()>0.4?"win":"lose")}else{sR(n);go("shop")}};
  return(
    <div style={{height:"100%",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#0a0f1a 0%,#162040 15%,#2a4060 28%,#4a6070 38%,#7a8868 48%,#c8a050 55%,#e8a030 60%,#d07028 65%,#6a4030 72%,#2a2018 82%,#0a0c08 100%)"}}/>
      <div style={{position:"absolute",top:"6%",left:"8%",width:160,height:16,borderRadius:20,background:"rgba(180,170,160,0.06)",animation:"cd 25s linear infinite"}}/>
      <div style={{position:"absolute",top:"14%",left:"50%",width:100,height:10,borderRadius:20,background:"rgba(180,170,160,0.03)",animation:"cd 30s linear 8s infinite"}}/>
      <div style={{position:"absolute",top:"30%",left:"72%",width:140,height:140,borderRadius:"50%",background:"radial-gradient(circle,rgba(232,160,48,0.2),transparent 70%)"}}/>
      <svg viewBox="0 0 960 380" preserveAspectRatio="none" style={{position:"absolute",bottom:0,left:0,width:"100%",height:"60%"}}>
        <defs><linearGradient id="tg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a6a38"/><stop offset="50%" stopColor="#3a4820"/><stop offset="100%" stopColor="#1a2010"/></linearGradient><linearGradient id="t2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a5530"/><stop offset="100%" stopColor="#1a1a0a"/></linearGradient></defs>
        <path d="M0,180 Q80,130 160,155 Q240,90 320,135 Q400,70 480,115 Q560,55 640,105 Q720,50 800,95 Q880,65 960,85 L960,380 L0,380Z" fill="url(#t2)" opacity="0.5"/>
        <path d="M0,230 L30,222 Q60,205 90,215 L120,195 Q150,168 180,180 L210,162 Q240,138 270,150 L300,128 Q330,148 360,138 L390,155 Q420,138 450,148 L480,118 Q510,136 540,128 L570,142 Q600,128 630,148 L660,132 Q690,150 720,138 L750,155 Q780,142 810,160 L840,148 Q870,165 900,152 L960,158 L960,380 L0,380Z" fill="url(#tg)"/>
        <ellipse cx="450" cy="148" rx="18" ry="6" fill="#2a2a15" opacity="0.6"/>
        <g transform="translate(155,155)"><rect x="-14" y="2" width="28" height="11" rx="2" fill="#3a4a28" stroke="#7a8a5a" strokeWidth="0.8"/><line x1="0" y1="5" x2="-22" y2="-10" stroke="#7a8a5a" strokeWidth="2.8" strokeLinecap="round"/><rect x="-16" y="13" width="32" height="6" rx="2" fill="#2a3a1a"/><circle cx="-10" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5"/><circle cx="-1" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5"/><circle cx="8" cy="19" r="3" fill="#2a3a1a" stroke="#4a5a30" strokeWidth="0.5"/><text x="0" y="-14" textAnchor="middle" fill="var(--gg)" fontSize="9" fontFamily="Share Tech Mono" fontWeight="bold">You</text></g>
        <g transform="translate(720,115)"><rect x="-14" y="2" width="28" height="11" rx="2" fill="#5a2a1a" stroke="#aa5533" strokeWidth="0.8"/><line x1="0" y1="5" x2="20" y2="-8" stroke="#aa5533" strokeWidth="2.8" strokeLinecap="round"/><rect x="-16" y="13" width="32" height="6" rx="2" fill="#4a2010"/><circle cx="-10" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5"/><circle cx="-1" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5"/><circle cx="8" cy="19" r="3" fill="#4a2010" stroke="#6a3318" strokeWidth="0.5"/><text x="0" y="-14" textAnchor="middle" fill="var(--rg)" fontSize="9" fontFamily="Share Tech Mono">xXDestroyerXx</text></g>
        <path d="M140,148 Q380,0 708,108" fill="none" stroke="rgba(255,182,39,0.15)" strokeWidth="1" strokeDasharray="6,6"/>
      </svg>
      {/* HUD */}
      <div style={{position:"absolute",top:8,left:10,display:"flex",gap:6,zIndex:20}}>
        <button onClick={()=>sE(!ex)} className="mo" style={{background:"rgba(10,12,8,0.7)",border:"1px solid var(--ol)",borderRadius:3,color:"var(--kh)",fontSize:10,padding:"4px 8px",cursor:"pointer"}}>☰</button>
        {ex&&<button onClick={()=>go("menu")} className="mo" style={{background:"rgba(140,20,0,0.85)",border:"1px solid var(--rg)",borderRadius:3,color:"var(--bn)",fontSize:9,padding:"4px 10px",cursor:"pointer",animation:"si 0.15s ease-out"}}>✕ EXIT — FORFEIT 0.16 SOL</button>}
        <div style={{background:"rgba(10,12,8,0.7)",border:"1px solid var(--ol)",borderRadius:3,padding:"3px 10px",display:"flex",alignItems:"center",gap:5}}><span className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.5}}>WIND</span><span className="st" style={{fontSize:15,color:"var(--bn)"}}>23</span><span style={{fontSize:13,color:"var(--am)",animation:"wd 2s ease-in-out infinite"}}>→</span></div>
        <div style={{background:"rgba(10,12,8,0.7)",border:"1px solid rgba(255,215,0,0.25)",borderRadius:3,padding:"3px 10px",display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10}}>🪙</span><span className="mo" style={{fontSize:11,color:"var(--gd)"}}>1,850</span></div>
      </div>
      <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:20,background:"rgba(10,12,8,0.7)",border:"1px solid var(--sg)",borderRadius:4,padding:"3px 16px",display:"flex",alignItems:"center",gap:6}}><span className="mo" style={{fontSize:8,color:"var(--sg)",opacity:0.6}}>POT</span><span className="mo" style={{fontSize:15,color:"var(--sg)",fontWeight:"bold"}}>0.32 SOL</span></div>
      <div style={{position:"absolute",top:8,right:10,zIndex:20,background:"rgba(10,12,8,0.7)",border:"1px solid var(--ol)",borderRadius:3,padding:"3px 10px"}}><span className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.5}}>ROUND </span><span className="st" style={{fontSize:14,color:"var(--bn)"}}>{rd} / 5</span></div>
      <div style={{position:"absolute",top:36,left:10,right:10,display:"flex",gap:30,zIndex:20}}>
        <div style={{flex:"0 0 180px"}}><div className="mo" style={{fontSize:7,color:"var(--gg)",marginBottom:2}}>YOU — 78 HP</div><div style={{height:3,background:"rgba(10,12,8,0.5)",borderRadius:2}}><div style={{width:"78%",height:"100%",borderRadius:2,background:"var(--gg)"}}/></div></div>
        <div style={{flex:"0 0 180px",marginLeft:"auto"}}><div className="mo" style={{fontSize:7,color:"var(--rg)",marginBottom:2,textAlign:"right"}}>xXDestroyerXx — 45 HP</div><div style={{height:3,background:"rgba(10,12,8,0.5)",borderRadius:2}}><div style={{width:"45%",height:"100%",borderRadius:2,background:"var(--rg)",marginLeft:"auto"}}/></div></div>
      </div>
      <div style={{position:"absolute",bottom:10,left:10,zIndex:20,background:"rgba(10,12,8,0.75)",border:"1px solid var(--ol)",borderRadius:4,padding:"6px 12px",width:155}}>
        <div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.5,marginBottom:2}}>ANGLE</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span className="be" style={{fontSize:28,color:"var(--bn)",lineHeight:1,width:44}}>{a}°</span><input type="range" min="0" max="90" value={a} onChange={e=>sA(+e.target.value)}/></div>
      </div>
      <div style={{position:"absolute",bottom:10,left:"50%",transform:"translateX(-50%)",zIndex:20,display:"flex",alignItems:"center",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(10,12,8,0.75)",border:"1px solid var(--ol)",borderRadius:4,padding:"6px 10px"}}>
          <button onClick={()=>sW(Math.max(0,wp-1))} style={{background:"none",border:"1px solid var(--ol)",borderRadius:2,color:"var(--kh)",fontSize:13,padding:"1px 7px",cursor:"pointer",lineHeight:1}}>◂</button>
          <span className="st" style={{fontSize:11,color:"var(--am)",letterSpacing:1,minWidth:120,textAlign:"center"}}>{wps[wp]}</span>
          <button onClick={()=>sW(Math.min(wps.length-1,wp+1))} style={{background:"none",border:"1px solid var(--ol)",borderRadius:2,color:"var(--kh)",fontSize:13,padding:"1px 7px",cursor:"pointer",lineHeight:1}}>▸</button>
        </div>
        <button onClick={fire} className="st" style={{padding:"10px 30px",fontSize:18,letterSpacing:5,color:"var(--bn)",background:"linear-gradient(180deg,#cc3300,#881a00)",border:"2px solid var(--rg)",borderRadius:5,cursor:"pointer",boxShadow:"0 0 20px rgba(204,51,0,0.4),inset 0 1px 0 rgba(255,255,255,0.1)",textShadow:"0 2px 4px rgba(0,0,0,0.5)"}}>FIRE</button>
      </div>
      <div style={{position:"absolute",bottom:10,right:10,zIndex:20,background:"rgba(10,12,8,0.75)",border:"1px solid var(--ol)",borderRadius:4,padding:"6px 12px",width:155}}>
        <div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.5,marginBottom:2}}>POWER</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span className="be" style={{fontSize:28,color:p>80?"var(--rg)":"var(--bn)",lineHeight:1,width:44}}>{p}%</span><input type="range" min="0" max="100" value={p} onChange={e=>sP(+e.target.value)}/></div>
      </div>
    </div>
  );
}

// ── WIN ──
function Win({go}){
  const[sh,sS]=useState(0);
  useEffect(()=>{const a=setTimeout(()=>sS(1),600);const b=setTimeout(()=>sS(2),1200);const c=setTimeout(()=>sS(3),1800);return()=>{clearTimeout(a);clearTimeout(b);clearTimeout(c)}},[]);
  return(
    <div style={{height:"100%",position:"relative",overflow:"hidden",background:"linear-gradient(180deg,#0a1808,#0c2010,#0a0c08)"}}>
      <div style={{position:"absolute",top:"10%",left:"50%",transform:"translateX(-50%)",width:400,height:200,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(127,255,68,0.08),transparent 70%)"}}/>
      <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",zIndex:10}}>
        <div className="st" style={{fontSize:52,color:"var(--gg)",letterSpacing:6,lineHeight:1,animation:"sm 0.5s ease-out,vp 2s ease-in-out 0.5s infinite",textShadow:"0 0 30px rgba(127,255,68,0.5),0 4px 0 #2a5a10",marginBottom:6}}>VICTORY</div>
        <div className="mo" style={{fontSize:10,color:"var(--kh)",opacity:0.6,letterSpacing:3,marginBottom:20}}>MATCH COMPLETE — BEST OF 5 — 3 ROUNDS WON</div>
        <div style={{display:"flex",gap:12,marginBottom:16}}>
          <div style={{background:"rgba(20,241,149,0.08)",border:"2px solid var(--sg)",borderRadius:8,padding:"12px 28px",textAlign:"center",animation:sh>=1?"sc 0.3s ease-out":"none",opacity:sh>=1?1:0,transition:"opacity 0.3s"}}><div className="mo" style={{fontSize:8,color:"var(--sg)",opacity:0.6,letterSpacing:2,marginBottom:3}}>SOL EARNED</div><div className="st" style={{fontSize:30,color:"var(--sg)",letterSpacing:2}}>+0.288</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.3,marginTop:2}}>0.32 POT — 10% RAKE</div></div>
          <div style={{background:"rgba(255,182,39,0.06)",border:"1px solid rgba(255,182,39,0.3)",borderRadius:8,padding:"12px 20px",textAlign:"center",opacity:sh>=2?1:0,transition:"opacity 0.4s",animation:sh>=2?"su 0.3s ease-out":"none"}}><div className="mo" style={{fontSize:8,color:"var(--am)",opacity:0.6,letterSpacing:2,marginBottom:3}}>MILESTONE</div><div className="st" style={{fontSize:24,color:"var(--am)"}}>+5 SHOT</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4,marginTop:2}}>🏆 3 WINS TODAY</div></div>
        </div>
        {sh>=2&&<div style={{display:"flex",gap:12,marginBottom:24,animation:"su 0.4s ease-out"}}>{[{l:"DAMAGE",v:"342"},{l:"KILLS",v:"3"},{l:"ACCURACY",v:"67%"},{l:"BEST SHOT",v:"128 dmg"},{l:"GOLD",v:"2,850"}].map((s,i)=><div key={i} style={{textAlign:"center",padding:"6px 10px",background:"rgba(26,32,16,0.4)",border:"1px solid var(--od)",borderRadius:3}}><div className="mo" style={{fontSize:6,color:"var(--kh)",opacity:0.4,letterSpacing:1,marginBottom:2}}>{s.l}</div><div className="st" style={{fontSize:14,color:"var(--bn)"}}>{s.v}</div></div>)}</div>}
        <div style={{display:"flex",gap:10,opacity:sh>=3?1:0,transition:"opacity 0.3s"}}>
          <button onClick={()=>go("lobby")} className="st" style={{padding:"11px 28px",fontSize:14,letterSpacing:3,color:"var(--bn)",background:"linear-gradient(180deg,var(--ru),#8a3a08)",border:"2px solid var(--rg)",borderRadius:5,cursor:"pointer",boxShadow:"0 0 16px rgba(196,81,10,0.3)"}}>⚡ REMATCH</button>
          <button onClick={()=>go("lobby")} className="st" style={{padding:"11px 20px",fontSize:12,letterSpacing:2,color:"var(--kh)",background:"var(--od)",border:"1px solid var(--ol)",borderRadius:5,cursor:"pointer"}}>LOBBY</button>
          <button onClick={()=>go("menu")} className="mo" style={{padding:"11px 14px",fontSize:10,color:"var(--kh)",background:"transparent",border:"1px solid var(--ol)",borderRadius:5,cursor:"pointer",opacity:0.6}}>MENU</button>
        </div>
      </div>
    </div>
  );
}

// ── LOSE ──
function Lose({go}){
  const[sh,sS]=useState(0);
  useEffect(()=>{const a=setTimeout(()=>sS(1),800);const b=setTimeout(()=>sS(2),1400);return()=>{clearTimeout(a);clearTimeout(b)}},[]);
  return(
    <div style={{height:"100%",position:"relative",overflow:"hidden",background:"linear-gradient(180deg,#1a0808,#120808,#0a0808)"}}>
      <div style={{position:"absolute",top:"10%",left:"50%",transform:"translateX(-50%)",width:400,height:200,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(204,34,0,0.06),transparent 70%)"}}/>
      <div style={{height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",zIndex:10}}>
        <div className="st" style={{fontSize:48,color:"var(--rd)",letterSpacing:5,lineHeight:1,animation:"sm 0.6s ease-out,dp 3s ease-in-out 0.6s infinite",textShadow:"0 0 20px rgba(204,34,0,0.4),0 4px 0 #3a0a00",marginBottom:6,opacity:0.9}}>DEFEATED</div>
        <div className="mo" style={{fontSize:10,color:"var(--kh)",opacity:0.5,letterSpacing:3,marginBottom:20}}>ELIMINATED — ROUND 4 OF 5</div>
        <div style={{background:"rgba(204,34,0,0.06)",border:"1px solid rgba(204,34,0,0.3)",borderRadius:8,padding:"12px 32px",marginBottom:20,textAlign:"center"}}><div className="mo" style={{fontSize:8,color:"var(--rd)",opacity:0.6,letterSpacing:2,marginBottom:3}}>WAGER LOST</div><div className="st" style={{fontSize:28,color:"var(--rd)",letterSpacing:2,opacity:0.8}}>−0.08 SOL</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.3,marginTop:3}}>Winner: xXDestroyerXx</div></div>
        {sh>=1&&<div style={{display:"flex",gap:12,marginBottom:24,animation:"su 0.4s ease-out"}}>{[{l:"DAMAGE",v:"218"},{l:"KILLS",v:"1"},{l:"ACCURACY",v:"42%"},{l:"ROUNDS WON",v:"1/4"},{l:"BEST SHOT",v:"86 dmg"}].map((s,i)=><div key={i} style={{textAlign:"center",padding:"6px 10px",background:"rgba(30,16,16,0.5)",border:"1px solid rgba(100,30,20,0.2)",borderRadius:3}}><div className="mo" style={{fontSize:6,color:"var(--kh)",opacity:0.35,letterSpacing:1,marginBottom:2}}>{s.l}</div><div className="st" style={{fontSize:14,color:"var(--bn)",opacity:0.7}}>{s.v}</div></div>)}</div>}
        <div style={{display:"flex",gap:10,opacity:sh>=2?1:0,transition:"opacity 0.3s"}}>
          <button onClick={()=>go("lobby")} className="st" style={{padding:"11px 28px",fontSize:14,letterSpacing:3,color:"var(--bn)",background:"linear-gradient(180deg,var(--ru),#8a3a08)",border:"2px solid var(--rg)",borderRadius:5,cursor:"pointer",boxShadow:"0 0 16px rgba(196,81,10,0.3)"}}>⚡ RUN IT BACK</button>
          <button onClick={()=>go("lobby")} className="st" style={{padding:"11px 20px",fontSize:12,letterSpacing:2,color:"var(--kh)",background:"var(--od)",border:"1px solid var(--ol)",borderRadius:5,cursor:"pointer"}}>LOBBY</button>
          <button onClick={()=>go("menu")} className="mo" style={{padding:"11px 14px",fontSize:10,color:"var(--kh)",background:"transparent",border:"1px solid var(--ol)",borderRadius:5,cursor:"pointer",opacity:0.6}}>MENU</button>
        </div>
      </div>
    </div>
  );
}

// ── ARMORY (cosmetics) ──
function Armory({go}){
  const[tab,sT]=useState("sol");const[sel,sS]=useState(0);
  const sol=[{n:"Desert Storm",t:"TANK SKIN",p:"0.3 SOL",r:"rare",d:"Sand camo with scratches.",o:false,i:"🏜"},{n:"Midnight Ops",t:"TANK SKIN",p:"0.5 SOL",r:"epic",d:"Matte black stealth.",o:true,i:"🌑"},{n:"Inferno Trail",t:"KILL EFFECT",p:"0.2 SOL",r:"rare",d:"Burning trail on shots.",o:false,i:"🔥"},{n:"Shockwave",t:"EXPLOSION",p:"0.4 SOL",r:"epic",d:"Blast wave from impact.",o:false,i:"💥"},{n:"Arctic Terrain",t:"TERRAIN",p:"0.8 SOL",r:"legendary",d:"Frozen tundra battlefield.",o:false,i:"❄"},{n:"Neon Tracer",t:"TRAIL",p:"0.15 SOL",r:"standard",d:"Green tracer line.",o:true,i:"✦"}];
  const shot=[{n:"Sergeant Camo",t:"PRESTIGE SKIN",p:"150 SHOT 🔥",r:"prestige",d:"P3+ digital woodland.",q:"P3",o:false,i:"🎖"},{n:"Colonel's Edge",t:"BORDER",p:"400 SHOT 🔥",r:"prestige",d:"Animated red name border.",q:"P7",o:false,i:"⭐"},{n:"Marshal Crown",t:"NAME TAG",p:"800 SHOT 🔥",r:"legendary",d:"Golden crown icon.",q:"P10",o:false,i:"👑"},{n:"Skull Kill",t:"KILL MARKER",p:"100 SHOT 🔥",r:"rare",d:"Skull over killed enemies.",q:"P1",o:true,i:"💀"},{n:"Thunder Strike",t:"EXPLOSION",p:"250 SHOT 🔥",r:"epic",d:"Lightning from impact.",q:"P5",o:false,i:"⚡"},{n:"Ghost Smoke",t:"DEATH FX",p:"200 SHOT 🔥",r:"rare",d:"Tank dissolves to smoke.",q:"P2",o:false,i:"👻"}];
  const items=tab==="sol"?sol:shot;const it=items[sel]||items[0];
  const rc={standard:"var(--kh)",rare:"var(--am)",epic:"var(--sp)",legendary:"var(--rg)",prestige:"var(--gg)"};
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TB go={go} title="ARMORY"/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 55%",display:"flex",flexDirection:"column",borderRight:"1px solid var(--od)"}}>
          <div style={{display:"flex",borderBottom:"1px solid var(--od)",flexShrink:0}}>
            {[{k:"sol",l:"SOL SHOP",c:"var(--sg)"},{k:"shot",l:"SHOT BURNS",c:"var(--am)"}].map(x=><button key={x.k} onClick={()=>{sT(x.k);sS(0)}} className="mo" style={{flex:1,padding:"8px",fontSize:10,letterSpacing:2,cursor:"pointer",color:tab===x.k?x.c:"var(--kh)",background:tab===x.k?"rgba(255,255,255,0.03)":"transparent",borderBottom:tab===x.k?`2px solid ${x.c}`:"2px solid transparent",border:"none",borderRight:"1px solid var(--od)",opacity:tab===x.k?1:0.4,transition:"all 0.15s"}}>{x.l}</button>)}
          </div>
          <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
            {items.map((x,i)=><div key={i} onClick={()=>sS(i)} style={{display:"flex",alignItems:"center",padding:"7px 10px",marginBottom:2,background:sel===i?"rgba(255,255,255,0.03)":"transparent",border:`1px solid ${sel===i?rc[x.r]+"33":"transparent"}`,borderLeft:`3px solid ${rc[x.r]}`,borderRadius:3,cursor:"pointer",transition:"all 0.12s"}}>
              <div style={{width:30,height:30,borderRadius:4,flexShrink:0,marginRight:8,background:`linear-gradient(135deg,var(--od),${rc[x.r]}15)`,border:`1px solid ${rc[x.r]}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>{x.i}</div>
              <div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6}}><span className="st" style={{fontSize:10,color:rc[x.r],letterSpacing:1}}>{x.n}</span>{x.o&&<span className="mo" style={{fontSize:7,color:"var(--gg)",background:"rgba(127,255,68,0.1)",padding:"1px 4px",borderRadius:2}}>OWNED</span>}</div><div className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,marginTop:1,letterSpacing:1}}>{x.t}</div></div>
              <div className="mo" style={{fontSize:9,color:tab==="sol"?"var(--sg)":"var(--am)",flexShrink:0}}>{x.p}</div>
            </div>)}
          </div>
        </div>
        <div style={{flex:1,padding:"16px 20px",display:"flex",flexDirection:"column"}}>
          <div style={{width:"100%",height:100,borderRadius:6,marginBottom:12,background:`linear-gradient(135deg,var(--od),${rc[it.r]}10)`,border:`1px solid ${rc[it.r]}22`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}><span style={{fontSize:40,opacity:0.8}}>{it.i}</span><div className="mo" style={{position:"absolute",top:6,right:8,fontSize:7,letterSpacing:2,color:rc[it.r],textTransform:"uppercase",opacity:0.6}}>{it.r}</div>{it.q&&<div className="mo" style={{position:"absolute",top:6,left:8,fontSize:7,color:"var(--gg)",background:"rgba(127,255,68,0.1)",border:"1px solid rgba(127,255,68,0.2)",padding:"1px 6px",borderRadius:2}}>REQUIRES {it.q}</div>}</div>
          <div className="st" style={{fontSize:16,color:rc[it.r],letterSpacing:1,marginBottom:2}}>{it.n}</div>
          <div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:8}}>{it.t}</div>
          <div className="mo" style={{fontSize:10,color:"var(--kh)",opacity:0.7,lineHeight:1.6,marginBottom:12}}>{it.d}</div>
          {tab==="shot"&&<div style={{padding:"8px 10px",background:"rgba(255,107,26,0.05)",border:"1px solid rgba(255,107,26,0.15)",borderRadius:3,marginBottom:12}}><div className="mo" style={{fontSize:8,color:"var(--rg)",lineHeight:1.5}}>🔥 SHOT tokens permanently burned. Cosmetic only.</div></div>}
          <div style={{flex:1}}/>
          <button className="st" style={{width:"100%",padding:"10px",fontSize:13,letterSpacing:2,borderRadius:4,cursor:"pointer",color:it.o?"var(--gg)":"var(--bn)",background:it.o?"var(--od)":tab==="sol"?"linear-gradient(180deg,#1a6a4a,#0a4a30)":"linear-gradient(180deg,var(--ad),#6a4a10)",border:`1px solid ${it.o?"var(--ol)":tab==="sol"?"var(--sg)":"var(--am)"}`}}>{it.o?"✓ EQUIPPED":tab==="sol"?`BUY — ${it.p}`:`BURN — ${it.p}`}</button>
        </div>
      </div>
    </div>
  );
}

// ── PRESTIGE ──
function Pres({go}){
  const cp=3,tk=847;
  const T=[{l:1,c:200,n:"Private",cl:"#8a8a7a",tk:"Olive Drab",fx:"—",bg:"Bronze pip",ex:"Basic camo"},{l:2,c:400,n:"Corporal",cl:"#a0a090",tk:"Gunmetal",fx:"Dust cloud",bg:"Silver pip",ex:"Ghost Smoke"},{l:3,c:600,n:"Sergeant",cl:"#b8a88a",tk:"Desert Tan",fx:"Dirt spray",bg:"Gold pip",ex:"Sgt Camo"},{l:4,c:900,n:"Lieutenant",cl:"#c4a030",tk:"Gold Trim",fx:"Spark burst",bg:"Bronze bar",ex:"Ranked access"},{l:5,c:1200,n:"Captain",cl:"#daa520",tk:"Tiger Stripe",fx:"Fire ring",bg:"Silver bar",ex:"Thunder Strike"},{l:6,c:1600,n:"Major",cl:"#ff8c00",tk:"Blaze Orange",fx:"Shockwave",bg:"Gold bar",ex:"Lobby banners"},{l:7,c:2000,n:"Colonel",cl:"#ff6b1a",tk:"Blood Red",fx:"Lightning",bg:"Silver eagle",ex:"Colonel's Edge"},{l:8,c:2500,n:"Brigadier",cl:"#cc2200",tk:"Crimson Black",fx:"Nuke flash",bg:"Gold eagle",ex:"Animated entry"},{l:9,c:3000,n:"General",cl:"#9945FF",tk:"Void Purple",fx:"Plasma burst",bg:"Diamond star",ex:"Kill messages"},{l:10,c:4000,n:"Marshal",cl:"#14F195",tk:"Sol Holo",fx:"Solar flare",bg:"Crown",ex:"Marshal Crown"}];
  const[st,sT]=useState(cp);const t=T[st];const ul=st<cp;const nx=st===cp;
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TB go={go} title="PRESTIGE"/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 45%",display:"flex",flexDirection:"column",borderRight:"1px solid var(--od)"}}>
          <div style={{padding:"14px 20px",borderBottom:"1px solid var(--od)",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:56,height:56,borderRadius:"50%",flexShrink:0,background:`conic-gradient(${T[cp-1].cl} ${cp*36}deg,var(--od) 0deg)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 16px ${T[cp-1].cl}33`}}><div style={{width:44,height:44,borderRadius:"50%",background:"var(--bk)",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column"}}><span className="be" style={{fontSize:22,color:T[cp-1].cl,lineHeight:1}}>{cp}</span><span className="mo" style={{fontSize:6,color:"var(--kh)",opacity:0.5}}>PRESTIGE</span></div></div>
            <div><div className="st" style={{fontSize:14,color:T[cp-1].cl,letterSpacing:2}}>{T[cp-1].n.toUpperCase()}</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.5,marginTop:2}}>Next: {T[cp].n} · {T[cp].c} SHOT</div><div className="mo" style={{fontSize:9,color:"var(--am)",marginTop:1}}>⬡ {tk} available</div></div>
          </div>
          <div style={{flex:1,overflow:"auto",padding:"6px 10px"}}>
            {T.map((x,i)=>{const u=i<cp,cu=i===cp-1,nx2=i===cp;return<div key={i} onClick={()=>sT(i)} style={{display:"flex",alignItems:"center",padding:"6px 10px",marginBottom:2,background:st===i?"rgba(255,255,255,0.03)":cu?"rgba(196,81,10,0.05)":"transparent",border:`1px solid ${st===i?x.cl+"44":"transparent"}`,borderRadius:3,cursor:"pointer",opacity:u||nx2?1:0.35,transition:"all 0.12s"}}>
              <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginRight:8,background:u?x.cl+"18":"var(--od)",border:`2px solid ${u?x.cl:"var(--ol)"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>{u?<span style={{color:x.cl,fontSize:10}}>✓</span>:<span className="be" style={{color:"var(--kh)",fontSize:11,opacity:0.4}}>{x.l}</span>}</div>
              <div style={{flex:1}}><span className="st" style={{fontSize:10,color:u?x.cl:"var(--kh)",letterSpacing:1}}>{x.n}</span>{cu&&<span className="mo" style={{fontSize:7,color:"var(--gg)",marginLeft:6}}>● YOU</span>}</div>
              {!u&&<span className="mo" style={{fontSize:8,color:nx2?"var(--am)":"var(--kh)",opacity:nx2?1:0.3}}>🔥{x.c}</span>}
            </div>})}
          </div>
        </div>
        <div style={{flex:1,padding:"14px 18px",display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:t.cl+"20",border:`2px solid ${t.cl}`,display:"flex",alignItems:"center",justifyContent:"center"}}><span className="be" style={{fontSize:18,color:t.cl}}>{t.l}</span></div>
            <div><div className="st" style={{fontSize:16,color:t.cl,letterSpacing:1}}>{t.n.toUpperCase()}</div><div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4}}>{ul?"UNLOCKED":"🔥 "+t.c+" SHOT"}</div></div>
          </div>
          <div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:6}}>REWARDS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
            {[{la:"TANK",v:t.tk,ic:"🎨"},{la:"KILL FX",v:t.fx,ic:"💥"},{la:"BADGE",v:t.bg,ic:"🎖"},{la:"SPECIAL",v:t.ex,ic:"⭐"}].map((r,i)=><div key={i} style={{padding:"8px 10px",background:"rgba(26,32,16,0.4)",border:`1px solid ${ul?t.cl+"22":"var(--od)"}`,borderRadius:3}}><div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}><span style={{fontSize:10}}>{r.ic}</span><span className="mo" style={{fontSize:7,color:"var(--kh)",opacity:0.4,letterSpacing:1}}>{r.la}</span></div><div className="mo" style={{fontSize:10,color:ul?t.cl:"var(--bn)",opacity:ul?1:0.7}}>{r.v}</div></div>)}
          </div>
          <div style={{flex:1}}/>
          {nx&&<div><div className="mo" style={{fontSize:8,color:"var(--rg)",textAlign:"center",marginBottom:6,lineHeight:1.4}}>⚠ WEAPONS RESET · TOKENS BURNED</div><button className="st" style={{width:"100%",padding:"10px",fontSize:14,letterSpacing:2,borderRadius:4,cursor:"pointer",color:tk>=t.c?"var(--bn)":"var(--kh)",background:tk>=t.c?"linear-gradient(180deg,var(--ad),#6a4a10)":"var(--od)",border:`1px solid ${tk>=t.c?"var(--am)":"var(--ol)"}`,opacity:tk>=t.c?1:0.5,animation:tk>=t.c?"ug 2s ease-in-out infinite":"none"}}>🔥 PRESTIGE TO {t.n.toUpperCase()} — {t.c} SHOT</button></div>}
          {ul&&<div style={{padding:"10px",background:"rgba(127,255,68,0.05)",border:"1px solid rgba(127,255,68,0.15)",borderRadius:4,textAlign:"center"}}><span className="mo" style={{fontSize:10,color:"var(--gg)"}}>✓ RANK ACHIEVED</span></div>}
          {!nx&&!ul&&<div style={{padding:"10px",background:"rgba(255,255,255,0.02)",border:"1px solid var(--od)",borderRadius:4,textAlign:"center"}}><span className="mo" style={{fontSize:9,color:"var(--kh)",opacity:0.4}}>REACH P{t.l-1} FIRST</span></div>}
        </div>
      </div>
    </div>
  );
}

// ── BARRACKS ──
function Barracks({go}){
  const st=[{l:"MATCHES",v:"342"},{l:"WIN RATE",v:"58.2%"},{l:"KILLS",v:"891"},{l:"SOL EARNED",v:"14.7"},{l:"SOL WAGERED",v:"28.3"},{l:"SHOT BURNED",v:"1,200"},{l:"FAV WEAPON",v:"Cluster Bomb"},{l:"BEST STREAK",v:"12 wins"}];
  return(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"linear-gradient(180deg,#0c1008,#0a0c08)"}}>
      <TB go={go} title="BARRACKS"/>
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <div style={{flex:"0 0 35%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"16px 20px",borderRight:"1px solid var(--od)"}}>
          <div style={{width:70,height:70,borderRadius:"50%",marginBottom:10,background:"linear-gradient(135deg,var(--od),var(--ol))",border:"2px solid var(--kh)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 20px rgba(184,168,138,0.1)"}}><span style={{fontSize:28}}>⬡</span></div>
          <div className="st" style={{fontSize:14,color:"var(--bn)",letterSpacing:1,marginBottom:2}}>PLAYER_ONE</div>
          <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}><span style={{fontSize:8,color:"#b8a88a",background:"#b8a88a18",border:"1px solid #b8a88a33",borderRadius:3,padding:"1px 5px",fontFamily:"'Bebas Neue'",letterSpacing:1}}>P3</span><span className="mo" style={{fontSize:9,color:"#b8a88a"}}>SERGEANT</span></div>
          <div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4}}>Joined Dec 2025</div>
        </div>
        <div style={{flex:1,overflow:"auto",padding:"10px 14px"}}>
          <div className="mo" style={{fontSize:8,color:"var(--kh)",opacity:0.4,letterSpacing:2,marginBottom:6}}>COMBAT RECORD</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:5}}>
            {st.map((s,i)=><div key={i} style={{padding:"8px 10px",background:"rgba(26,32,16,0.35)",border:"1px solid var(--od)",borderRadius:3}}><div className="mo" style={{fontSize:6,color:"var(--kh)",opacity:0.5,letterSpacing:1,marginBottom:2}}>{s.l}</div><div className="st" style={{fontSize:13,color:"var(--bn)",letterSpacing:1}}>{s.v}</div></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── APP ──
export default function SolShot(){
  const[sc,go]=useState("menu");
  const R={menu:<Menu go={go}/>,lobby:<Lobby go={go}/>,shop:<Shop go={go}/>,battle:<Battle go={go}/>,win:<Win go={go}/>,lose:<Lose go={go}/>,armory:<Armory go={go}/>,prestige:<Pres go={go}/>,barracks:<Barracks go={go}/>};
  return(
    <div style={{background:"#030405",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"12px",fontFamily:"'Share Tech Mono',monospace"}}>
      <style>{S}</style>
      <div style={{width:"100%",maxWidth:860,aspectRatio:"16/9",position:"relative",overflow:"hidden",borderRadius:8,border:"1px solid var(--ol)",boxShadow:"0 0 40px rgba(0,0,0,0.5)",animation:"fl 5s infinite"}}>
        <div className="no"/><div className="sl"/>
        {R[sc]||<Menu go={go}/>}
      </div>
    </div>
  );
}
