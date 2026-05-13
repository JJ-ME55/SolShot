/* global React, PhoneFrame, StatusBar, MobileChrome, CurrencyChip, TerrainMini, MobileOverlays, ScanBtn */
// Mobile Deploy — mode select via vertical tabs + match config + CTA

function MobileDeploy() {
  const [mode, setMode] = React.useState("quick");
  const [stake, setStake] = React.useState(0.1);
  const [rounds, setRounds] = React.useState(5);
  const [players, setPlayers] = React.useState(2);

  const modes = [
    { id: "bot",      label: "VS BOT",    sub: "PRACTICE · FREE" },
    { id: "duel",     label: "DUEL",      sub: "1V1 · WAGERED" },
    { id: "quick",    label: "QUICK",     sub: "MATCHMAKE" },
    { id: "high",     label: "HIGH ROLL", sub: "2+ SOL" },
    { id: "custom",   label: "CUSTOM",    sub: "SET TERMS" },
  ];

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <TerrainMini height={50} />
      <MobileChrome onBack={() => {}} title="DEPLOY" right={<CurrencyChip compact />} />

      <div style={{
        position: "absolute", top: 52, left: 52, right: 20, bottom: 26,
        display: "grid", gridTemplateColumns: "130px 1fr 160px", gap: 14, zIndex: 5,
      }}>
        {/* LEFT: mode list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={sectionLabel}>MODE</div>
          {modes.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "5px 8px",
              background: mode === m.id ? "var(--accent)" : "var(--bg-raised)",
              color: mode === m.id ? "#0e1209" : "var(--bone)",
              border: "1px solid " + (mode === m.id ? "var(--accent-hot)" : "var(--border)"),
              clipPath: "var(--clip-6)",
              cursor: "pointer", textAlign: "left",
              display: "flex", flexDirection: "column", gap: 0,
            }}>
              <span className="stencil" style={{ fontSize: 10, letterSpacing: "0.15em", lineHeight: 1 }}>{m.label}</span>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, opacity: 0.7, letterSpacing: "0.15em", marginTop: 2 }}>{m.sub}</span>
            </button>
          ))}
        </div>

        {/* MIDDLE: match config */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={sectionLabel}>MATCH CONFIG</div>

          <Row label="STAKE">
            {[0, 0.1, 0.5, 1, 2].map(s => (
              <Chip key={s} active={stake === s} onClick={() => setStake(s)}>
                {s === 0 ? "FREE" : s + " SOL"}
              </Chip>
            ))}
          </Row>
          <Row label="ROUNDS">
            {[3, 5, 10].map(r => (
              <Chip key={r} active={rounds === r} onClick={() => setRounds(r)}>{r}</Chip>
            ))}
          </Row>
          <Row label="PLAYERS">
            {[2, 3, 4].map(p => (
              <Chip key={p} active={players === p} onClick={() => setPlayers(p)}>{p}P</Chip>
            ))}
          </Row>

          <div>
            <div style={sectionLabel}>TANK COLOR</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { c: "#ff6b1a", n: "INFERNO" },
                { c: "#7fd060", n: "JUNGLE" },
                { c: "#4fa8d8", n: "ARCTIC" },
                { c: "#d8b968", n: "DESERT" },
                { c: "#b568d8", n: "VOID" },
              ].map((t, i) => (
                <button key={t.c} style={{
                  width: 22, height: 22, background: t.c,
                  border: "2px solid " + (i === 0 ? "#fff" : "var(--border)"),
                  clipPath: "var(--clip-6)", cursor: "pointer",
                }} title={t.n} />
              ))}
            </div>
          </div>

          <div>
            <div style={sectionLabel}>OPEN LOBBIES · 3</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "var(--f-mono)", fontSize: 7 }}>
              {[
                { h: "WOLFX",  s: "0.5 SOL", p: "1/2", t: "QUICK" },
                { h: "SHADOW", s: "2.0 SOL", p: "2/4", t: "HIGH" },
                { h: "GRIM",   s: "CUSTOM",  p: "1/3", t: "CSTM" },
              ].map((l, i) => (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr auto auto auto",
                  alignItems: "center", gap: 5, padding: "3px 5px",
                  background: "var(--bg-raised)", borderLeft: "2px solid var(--accent)",
                  letterSpacing: "0.12em",
                }}>
                  <span style={{ color: "var(--bone)" }}>{l.h}</span>
                  <span style={{ color: "var(--accent)" }}>{l.s}</span>
                  <span style={{ color: "var(--olive)" }}>{l.p}</span>
                  <button style={{
                    padding: "2px 6px", background: "transparent", color: "var(--accent)",
                    border: "1px solid var(--accent)", fontFamily: "var(--f-mono)", fontSize: 7,
                    letterSpacing: "0.2em", cursor: "pointer",
                  }}>JOIN</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: CTA + summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={sectionLabel}>SUMMARY</div>
          <div style={{
            padding: "10px 8px",
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            clipPath: "var(--clip-6)",
            fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.12em",
            lineHeight: 1.9,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--olive)" }}>MODE</span><span style={{ color: "var(--bone)" }}>QUICK</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--olive)" }}>STAKE</span><span style={{ color: "var(--accent)" }}>{stake} SOL</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--olive)" }}>POT</span><span style={{ color: "var(--accent)" }}>{(stake * players).toFixed(1)} SOL</span></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--olive)" }}>ROUNDS</span><span style={{ color: "var(--bone)" }}>{rounds}</span></div>
          </div>
          <ScanBtn height={46} fontSize={16}>FIND MATCH</ScanBtn>
          <button style={{
            padding: "7px 10px",
            background: "var(--bg-raised)", color: "var(--bone)",
            border: "1px solid var(--border)", clipPath: "var(--clip-6)",
            fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.2em",
            cursor: "pointer",
          }}>HOST CHALLENGE</button>
        </div>
      </div>
    </PhoneFrame>
  );
}

function Row({ label, children }) {
  return (
    <div>
      <div style={sectionLabel}>{label}</div>
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 8px",
      background: active ? "var(--accent)" : "var(--bg-raised)",
      color: active ? "#0e1209" : "var(--bone)",
      border: "1px solid " + (active ? "var(--accent-hot)" : "var(--border)"),
      clipPath: "var(--clip-6)",
      fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.12em",
      cursor: "pointer",
    }}>{children}</button>
  );
}

const sectionLabel = {
  fontFamily: "var(--f-mono)", fontSize: 8,
  color: "var(--olive)", letterSpacing: "0.25em",
  marginBottom: 4,
};

Object.assign(window, { MobileDeploy });
