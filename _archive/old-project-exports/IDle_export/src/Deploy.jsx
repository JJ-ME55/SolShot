/* global React, Terrain, PixelTank, ScreenHeader */
const { useState: useStateDep } = React;

function Deploy({ onNav }) {
  const [mode, setMode] = useStateDep("PRACTICE");
  const [format, setFormat] = useStateDep("BO1");
  const [players, setPlayers] = useStateDep("2P");
  const [color, setColor] = useStateDep("#d83030");
  const [callsign, setCallsign] = useStateDep("");

  const modes = [
    { id: "PRACTICE",    wager: "FREE",      desc: "FREE PRACTICE MODE",       live: true  },
    { id: "QUICK MATCH", wager: "0.1 SOL",   desc: "AUTO-MATCH · WAGERED",     live: false },
    { id: "DUEL",        wager: "0.25 SOL",  desc: "EXTENDED · WAGERED",       live: false },
    { id: "HIGH ROLLER", wager: "1.0 SOL",   desc: "MAX STAKES · WAGERED",     live: false },
    { id: "CUSTOM CHALLENGE", wager: "ANY",  desc: "SET YOUR OWN TERMS",       live: true  },
  ];
  const formats = mode === "DUEL" || mode === "HIGH ROLLER" ? ["BO3","BO5"] : ["BO1","BO3","BO5"];
  const colors = ["#d83030","#c8781a","#e8c820","#6eaf52","#4fc0b4","#4a80f0","#8450d8","#c63090","#a83a1a","#c8b87a"];
  const activeMode = modes.find(m => m.id === mode);

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 160px", position: "relative", zIndex: 3 }}>
        <ScreenHeader
          title="DEPLOY"
          subtitle="CHOOSE MODE · SET TERMS · FIND OR CREATE A MATCH"
          onBack={() => onNav("menu")}
        />

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18 }}>

          {/* LEFT: CONFIG */}
          <div>
            <div className="label" style={{ color: "var(--accent)", marginBottom: 8 }}>MODE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginBottom: 6 }}>
              {modes.map(m => (
                <button key={m.id} onClick={() => m.live && setMode(m.id)} disabled={!m.live} style={{
                  background: mode === m.id ? "var(--bg-raised)" : "var(--bg-surface)",
                  color: mode === m.id ? "var(--accent)" : m.live ? "var(--bone)" : "var(--muted)",
                  border: "1px solid " + (mode === m.id ? "var(--accent)" : "var(--border)"),
                  clipPath: "var(--clip-6)", padding: "10px 6px", cursor: m.live ? "pointer" : "not-allowed",
                  fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.08em", position: "relative",
                  opacity: m.live ? 1 : 0.6, lineHeight: 1.15, minHeight: 46,
                }}>
                  {m.id}
                  {!m.live && <div style={{ position: "absolute", top: -4, right: -4, background: "var(--muted)", color: "var(--bg-deep)", fontSize: 7, padding: "1px 4px", letterSpacing: "0.15em" }}>SOON</div>}
                  {mode === m.id && <div style={{ position: "absolute", top: -4, right: -4, background: "var(--accent)", color: "#0e1209", fontFamily: "var(--f-mono)", fontSize: 8, padding: "1px 4px", letterSpacing: "0.15em" }}>{m.wager}</div>}
                </button>
              ))}
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em", marginBottom: 14 }}>
              {activeMode.desc}
            </div>

            <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>FORMAT</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {formats.map(f => (
                <button key={f} onClick={() => setFormat(f)} style={{
                  flex: 1, padding: "10px",
                  background: format === f ? "var(--accent)" : "var(--bg-surface)",
                  color: format === f ? "#0e1209" : "var(--bone)",
                  border: "1px solid " + (format === f ? "var(--accent-hot)" : "var(--border)"),
                  clipPath: "var(--clip-6)", fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: "0.08em",
                  cursor: "pointer",
                }}>{f}</button>
              ))}
            </div>

            <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>PLAYERS</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
              {["2P","3P","4P"].map(p => (
                <button key={p} onClick={() => setPlayers(p)} style={{
                  flex: 1, padding: "10px",
                  background: players === p ? "var(--accent)" : "var(--bg-surface)",
                  color: players === p ? "#0e1209" : "var(--bone)",
                  border: "1px solid " + (players === p ? "var(--accent-hot)" : "var(--border)"),
                  clipPath: "var(--clip-6)", fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: "0.08em",
                  cursor: "pointer",
                }}>{p}</button>
              ))}
            </div>

            <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>TANK COLOR</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 18, flexWrap: "wrap" }}>
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 28, height: 28, background: c, cursor: "pointer",
                  border: "2px solid " + (color === c ? "var(--bone)" : "var(--border)"),
                  clipPath: "var(--clip-6)",
                }} />
              ))}
            </div>

            <button onClick={() => onNav("shop")} style={{
              width: "100%", padding: "16px", background: "var(--accent)", color: "#0e1209",
              border: "none", clipPath: "var(--clip-10)", fontFamily: "var(--f-display)",
              fontSize: 16, letterSpacing: "0.12em", cursor: "pointer", marginBottom: 6,
            }}>CREATE MATCH</button>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", textAlign: "center", letterSpacing: "0.2em", marginBottom: 20 }}>
              ◆ {mode === "PRACTICE" ? "FREE MATCH" : activeMode.wager + " WAGER"}
            </div>

            <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>CHALLENGE PLAYER</div>
            <div style={{ display: "flex", gap: 4 }}>
              <input value={callsign} onChange={e => setCallsign(e.target.value.toUpperCase().slice(0,16))}
                placeholder="ENTER CALLSIGN"
                style={{
                  flex: 1, background: "var(--bg-surface)", border: "1px solid var(--border)",
                  color: "var(--bone)", fontFamily: "var(--f-mono)", fontSize: 11,
                  letterSpacing: "0.15em", padding: "10px 12px", outline: "none",
                  clipPath: "var(--clip-6)",
                }} />
              <button style={{
                background: "var(--bg-raised)", color: "var(--bone)", border: "1px solid var(--border)",
                padding: "0 16px", fontFamily: "var(--f-display)", fontSize: 12, letterSpacing: "0.1em",
                cursor: "pointer", clipPath: "var(--clip-6)",
              }}>SEND</button>
            </div>
          </div>

          {/* RIGHT: OPEN LOBBIES */}
          <div>
            <div className="label" style={{ color: "var(--accent)", marginBottom: 8 }}>OPEN LOBBIES</div>
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              clipPath: "var(--clip-10)", minHeight: 600, padding: "40px 20px",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
              textAlign: "center",
            }}>
              <svg width="72" height="72" viewBox="0 0 72 72" style={{ opacity: 0.5 }}>
                <rect x="8" y="24" width="56" height="32" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                <path d="M8,24 L36,10 L64,24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                <circle cx="36" cy="40" r="8" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
                <line x1="36" y1="30" x2="36" y2="36" stroke="var(--accent)" strokeWidth="1.5" />
                <line x1="36" y1="44" x2="36" y2="50" stroke="var(--accent)" strokeWidth="1.5" />
                <line x1="26" y1="40" x2="32" y2="40" stroke="var(--accent)" strokeWidth="1.5" />
                <line x1="40" y1="40" x2="46" y2="40" stroke="var(--accent)" strokeWidth="1.5" />
              </svg>
              <div className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: "0.2em" }}>
                NO OPEN LOBBIES
              </div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.2em", maxWidth: 300, lineHeight: 1.6 }}>
                BE FIRST INTO THE FIELD. CONFIGURE MODE AT LEFT AND CREATE A MATCH.
              </div>
            </div>
          </div>
        </div>
      </div>
      <Terrain variant={0} />
    </div>
  );
}

window.Deploy = Deploy;
