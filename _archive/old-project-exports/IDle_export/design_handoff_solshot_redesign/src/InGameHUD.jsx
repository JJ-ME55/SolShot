/* global React, PixelTank */
const { useState: useStateHud, useEffect: useEffectHud } = React;

function InGameHUD({ onNav }) {
  const [mode, setMode] = useStateHud("1v1"); // 1v1 | FFA3 | FFA4 | 2v2
  const [power, setPower] = useStateHud(62);
  const [angle, setAngle] = useStateHud(48);
  const [selWeapon, setSelWeapon] = useStateHud(2);
  const [timer, setTimer] = useStateHud(18);

  useEffectHud(() => {
    const t = setInterval(() => setTimer(s => s > 0 ? s - 1 : 30), 1000);
    return () => clearInterval(t);
  }, []);

  const weapons = [
    { n: "SINGLE SHOT", qty: "∞", tier: "FREE" },
    { n: "BIG SHOT", qty: 3, tier: "STD" },
    { n: "HEATSEEKER", qty: 2, tier: "TAC" },
    { n: "NAPALM", qty: 1, tier: "RARE" },
    { n: "JACKHAMMER", qty: 2, tier: "TAC" },
    { n: "CRAZY IVAN", qty: 1, tier: "LGND" },
  ];
  const tierColor = { FREE: "var(--muted)", STD: "var(--olive)", TAC: "var(--bone)", RARE: "var(--accent)", EPIC: "#c04020", LGND: "#d83030" };

  // Player rosters per mode
  const allPlayers = {
    "1v1": [
      { cs: "GRIZZLY-07", color: "var(--accent)", team: "BLUE", hp: 184, max: 250, you: true, active: true },
      { cs: "VIPER-12",   color: "#d83030",      team: "RED",  hp: 127, max: 250 },
    ],
    "FFA3": [
      { cs: "GRIZZLY-07", color: "var(--accent)", team: "BLUE",   hp: 184, max: 200, you: true, active: true },
      { cs: "VIPER-12",   color: "#d83030",      team: "RED",    hp: 150, max: 200 },
      { cs: "HOUND-04",   color: "#6eaf52",      team: "GREEN",  hp: 92,  max: 200 },
    ],
    "FFA4": [
      { cs: "GRIZZLY-07", color: "var(--accent)", team: "BLUE",   hp: 142, max: 180, you: true, active: true },
      { cs: "VIPER-12",   color: "#d83030",      team: "RED",    hp: 98,  max: 180 },
      { cs: "HOUND-04",   color: "#6eaf52",      team: "GREEN",  hp: 155, max: 180 },
      { cs: "SHADOW-22",  color: "#c69dff",      team: "PURPLE", hp: 64,  max: 180 },
    ],
    "2v2": [
      { cs: "GRIZZLY-07", color: "var(--accent)", team: "BLUE",  hp: 184, max: 200, you: true, active: true },
      { cs: "HOUND-04",   color: "#6eaf52",      team: "BLUE",  hp: 122, max: 200 },
      { cs: "VIPER-12",   color: "#d83030",      team: "RED",   hp: 140, max: 200 },
      { cs: "SHADOW-22",  color: "#c69dff",      team: "RED",   hp: 88,  max: 200 },
    ],
  };
  const players = allPlayers[mode];
  const activeIdx = players.findIndex(p => p.active);
  const turnQueue = [...players.map((p,i) => i).filter(i => i !== activeIdx)];

  // Tank positions on terrain per mode
  const tankPos = {
    "1v1":  [ { l: "9%",  b: "42%" }, { r: "8%",  b: "44%", f: true } ],
    "FFA3": [ { l: "7%",  b: "42%" }, { l: "48%", b: "52%", f: true }, { r: "7%", b: "44%", f: true } ],
    "FFA4": [ { l: "6%",  b: "42%" }, { l: "32%", b: "48%" }, { l: "62%", b: "50%", f: true }, { r: "6%", b: "44%", f: true } ],
    "2v2":  [ { l: "6%",  b: "42%" }, { l: "22%", b: "46%" }, { r: "22%", b: "48%", f: true }, { r: "6%", b: "44%", f: true } ],
  }[mode];

  const modeLabel = { "1v1": "1V1 DUEL", "FFA3": "3-PLAYER FFA", "FFA4": "4-PLAYER FFA", "2v2": "2V2 SQUAD" }[mode];

  const PlayerCard = ({ p, i, compact }) => (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: p.active ? "var(--bg-raised)" : "transparent",
      border: "1px solid " + (p.active ? p.color : "var(--border)"),
      clipPath: "var(--clip-6)",
      padding: compact ? "6px 10px" : "8px 12px",
      opacity: p.hp <= 0 ? 0.35 : 1,
      position: "relative",
    }}>
      {p.active && (
        <div style={{ position: "absolute", top: -6, left: 8, background: "var(--bg-deep)", color: p.color, fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.2em", padding: "0 6px" }}>
          ▸ FIRING
        </div>
      )}
      <PixelTank color={p.color} size={compact ? 28 : 34} flipped={i % 2 === 1 && mode === "1v1"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="stencil" style={{ fontSize: compact ? 13 : 15, color: p.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.cs}{p.you && <span style={{ color: "var(--muted)", fontSize: 9, marginLeft: 4 }}>· YOU</span>}
          </span>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.15em" }}>
            {p.hp}/{p.max}
          </span>
        </div>
        <div style={{ height: 5, background: "var(--bg-deep)", border: "1px solid var(--border)", marginTop: 3 }}>
          <div style={{ width: `${Math.max(0,(p.hp/p.max)*100)}%`, height: "100%", background: p.color }} />
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em", marginTop: 2 }}>
          {p.team}{mode === "2v2" ? " TEAM" : ""} · {p.hp <= 0 ? "KIA" : "ACTIVE"}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)", background: "var(--bg-deep)" }}>

      {/* MODE SWITCHER (demo control, not normally in-game) */}
      <div style={{ padding: "8px 20px", background: "var(--bg-deep)", borderBottom: "1px dashed var(--muted)", display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
        <span>◣ DEMO · PREVIEW HUD FOR</span>
        {[["1v1","1V1"],["FFA3","3P FFA"],["FFA4","4P FFA"],["2v2","2V2 SQUAD"]].map(([id,lbl]) => (
          <button key={id} onClick={() => setMode(id)} style={{
            background: mode === id ? "var(--accent)" : "var(--bg-raised)",
            color: mode === id ? "#0e1209" : "var(--bone)",
            border: "1px solid var(--border)", padding: "3px 10px",
            fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.2em",
            cursor: "pointer",
          }}>{lbl}</button>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>MODE: {modeLabel}</span>
      </div>

      {/* TOP PLAYER BAR — adapts to player count */}
      <div style={{ padding: "14px 20px", background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}>
        {mode === "1v1" ? (
          // 1v1 keeps classic center round-indicator layout
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
            <PlayerCard p={players[0]} i={0} />
            <div style={{ textAlign: "center" }}>
              <div className="label">ROUND 2 · BO3</div>
              <div className="stencil" style={{ fontSize: 20, color: "var(--accent)" }}>
                BLUE TURN · <span style={{ color: timer < 6 ? "#d83030" : "var(--bone)" }}>{String(timer).padStart(2,"0")}s</span>
              </div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
                SCORE 1–0 · WIND ▸ 3.2 M/S
              </div>
            </div>
            <PlayerCard p={players[1]} i={1} />
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
              <span>ROUND 2 · {players.length} COMBATANTS · {players.filter(p=>p.hp>0).length} ACTIVE</span>
              <span className="stencil" style={{ fontSize: 14, color: "var(--accent)" }}>
                {players[activeIdx].cs} FIRING · <span style={{ color: timer < 6 ? "#d83030" : "var(--bone)" }}>{String(timer).padStart(2,"0")}s</span>
              </span>
              <span>WIND ▸ 3.2 M/S</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${players.length}, 1fr)`, gap: 8 }}>
              {players.map((p, i) => <PlayerCard key={i} p={p} i={i} compact={players.length >= 4} />)}
            </div>
            {/* Turn order ticker */}
            <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "center", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
              <span>TURN ORDER ▸</span>
              <span className="stencil" style={{ color: players[activeIdx].color, fontSize: 12, border: "1px solid " + players[activeIdx].color, padding: "2px 8px" }}>
                {players[activeIdx].cs}
              </span>
              {turnQueue.map(idx => (
                <span key={idx} style={{ color: players[idx].hp > 0 ? "var(--muted)" : "#4a2014", textDecoration: players[idx].hp <= 0 ? "line-through" : "none", fontSize: 10, letterSpacing: "0.2em" }}>
                  ▸ {players[idx].cs}
                </span>
              ))}
              {mode === "2v2" && <span style={{ marginLeft: "auto", color: "var(--muted)" }}>TEAM HP · BLUE {players.filter(p=>p.team==="BLUE").reduce((a,p)=>a+p.hp,0)} · RED {players.filter(p=>p.team==="RED").reduce((a,p)=>a+p.hp,0)}</span>}
            </div>
          </>
        )}
      </div>

      {/* BATTLEFIELD */}
      <div style={{
        position: "relative",
        height: 360,
        background: "linear-gradient(to bottom, #1a2410 0%, #0e1209 100%)",
        overflow: "hidden",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ position: "absolute", inset: 0, opacity: 0.08, backgroundImage: "linear-gradient(to right, var(--olive) 1px, transparent 1px), linear-gradient(to bottom, var(--olive) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        <svg viewBox="0 0 1920 360" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <path d="M0,360 L0,240 L120,220 L260,250 L400,210 L540,230 L680,200 L820,220 L960,160 L1100,180 L1240,220 L1380,200 L1520,230 L1660,210 L1800,240 L1920,220 L1920,360 Z" fill="#1c2a12" stroke="#3a4e2a" strokeWidth="1" />
          <circle cx="720" cy="215" r="16" fill="#0e1209" />
          <path d="M180,198 Q600,40 1080,190" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 6" />
          <g transform="translate(1080,190)">
            <circle r="14" fill="none" stroke="var(--accent)" strokeWidth="1" />
            <line x1="-20" y1="0" x2="20" y2="0" stroke="var(--accent)" strokeWidth="1" />
            <line x1="0" y1="-20" x2="0" y2="20" stroke="var(--accent)" strokeWidth="1" />
          </g>
        </svg>
        {players.map((p, i) => {
          const pos = tankPos[i];
          const style = { position: "absolute", bottom: pos.b, ...(pos.l ? { left: pos.l } : { right: pos.r }), opacity: p.hp <= 0 ? 0.3 : 1 };
          return (
            <div key={i} style={style}>
              <PixelTank color={p.color} size={48} flipped={pos.f} />
              <div style={{ textAlign: "center", fontFamily: "var(--f-mono)", fontSize: 9, color: p.color, letterSpacing: "0.15em", marginTop: 2 }}>
                {p.cs.split("-")[0]}
              </div>
            </div>
          );
        })}
        <div style={{ position: "absolute", top: 10, left: 14, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>GRID 47.N / 12.E</div>
        <div style={{ position: "absolute", top: 10, right: 14, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>RANGE 864M</div>
      </div>

      {/* CONTROL BAR */}
      <div style={{ padding: "16px 20px", background: "var(--bg-surface)", display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 14, alignItems: "stretch" }}>
        {/* Weapon list — includes TARGETING toggle for FFA */}
        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", clipPath: "var(--clip-6)", padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span className="label">ARMAMENT · {weapons.length} LOADED</span>
            {mode !== "1v1" && mode !== "2v2" && (
              <span className="label" style={{ color: "var(--accent)" }}>TARGET: FREE AIM</span>
            )}
            {mode === "2v2" && (
              <span className="label" style={{ color: "var(--accent)" }}>FRIENDLY FIRE: OFF</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {weapons.map((w, i) => (
              <button key={i} onClick={() => setSelWeapon(i)} style={{
                background: selWeapon === i ? "var(--accent)" : "var(--bg-deep)",
                color: selWeapon === i ? "#0e1209" : "var(--bone)",
                border: "1px solid " + (selWeapon === i ? "var(--accent-hot)" : "var(--border)"),
                padding: "8px 10px", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.1em",
                cursor: "pointer", textAlign: "left", minWidth: 120,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: selWeapon === i ? "#0e1209" : tierColor[w.tier] }}>{w.tier}</span>
                  <span>×{w.qty}</span>
                </div>
                <div className="stencil" style={{ fontSize: 13, marginTop: 2, color: selWeapon === i ? "#0e1209" : "var(--bone)" }}>{w.n}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", clipPath: "var(--clip-6)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
              <span>POWER</span><span style={{ color: "var(--accent)" }}>{power.toString().padStart(3,"0")} / 100</span>
            </div>
            <input type="range" min="0" max="100" value={power} onChange={e => setPower(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }} />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em" }}>
              <span>ANGLE</span><span style={{ color: "var(--accent)" }}>{angle}°</span>
            </div>
            <input type="range" min="0" max="180" value={angle} onChange={e => setAngle(+e.target.value)} style={{ width: "100%", accentColor: "var(--accent)" }} />
          </div>
          {mode !== "1v1" && (
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em", paddingTop: 4, borderTop: "1px dashed var(--muted)" }}>
              AIM ▸ <span style={{ color: "#d83030" }}>{players[1]?.cs}</span> (auto-tracked)
            </div>
          )}
        </div>

        <button onClick={() => onNav("report")} style={{
          background: "var(--accent)", color: "#0e1209", border: "none",
          clipPath: "var(--clip-10)", padding: "0 40px",
          fontFamily: "var(--f-display)", fontSize: 28, letterSpacing: "0.1em",
          cursor: "pointer", minHeight: 110,
        }}>
          <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.3em", opacity: 0.7 }}>▼ SPACE</div>
          FIRE
          <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.3em", opacity: 0.7 }}>▲</div>
        </button>
      </div>
    </div>
  );
}

window.InGameHUD = InGameHUD;
