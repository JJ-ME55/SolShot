/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays */
// Mobile Barracks — stat card, tabs for profile/history/achievements

function MobileBarracks() {
  const [tab, setTab] = React.useState("card");
  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title="BARRACKS"
        right={<span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em" }}>◆ EXPORT</span>}
      />

      {/* Tabs */}
      <div style={{
        position: "absolute", top: 44, left: 52, right: 20, zIndex: 6,
        display: "flex", gap: 2,
      }}>
        {[
          { id: "card", l: "STAT CARD" },
          { id: "hist", l: "HISTORY" },
          { id: "ach",  l: "ACHIEVEMENTS" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "4px",
            background: tab === t.id ? "var(--bg-raised)" : "transparent",
            color: tab === t.id ? "var(--accent)" : "var(--olive)",
            border: "1px solid " + (tab === t.id ? "var(--accent)" : "transparent"),
            borderBottom: "none",
            fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.25em",
            cursor: "pointer",
          }}>{t.l}</button>
        ))}
      </div>

      {/* Stat card (headliner) */}
      {tab === "card" && (
        <div style={{
          position: "absolute", top: 68, left: 52, right: 20, bottom: 26, zIndex: 5,
          padding: "10px 12px",
          background: "var(--bg-raised)",
          border: "1px solid var(--accent)",
          clipPath: "var(--clip-10)",
          display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr", gap: 10,
        }}>
          {/* Corner brackets */}
          {[0, 1, 2, 3].map(i => <Bracket key={i} pos={i} />)}

          {/* LEFT: identity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// CALLSIGN</div>
            <div className="stencil" style={{ fontSize: 20, color: "var(--bone)", letterSpacing: "0.12em", lineHeight: 1 }}>KillDotEm</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.25em" }}>REC · 0x5H…9T</div>

            <div style={{ marginTop: 8, fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// SERVICE</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 14, color: "var(--bone)", letterSpacing: "0.1em" }}>14 DAYS</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.25em" }}>S0 · BETA</div>
          </div>

          {/* MIDDLE: stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <StatBig k="BATTLES" v="42" />
            <StatBig k="WIN %" v="61" accent />
            <StatBig k="K/D" v="1.8" />
            <StatBig k="BEST" v="7W" />
            <StatBig k="ACC" v="68%" />
            <StatBig k="EARNED" v="◆ 2.4" accent />
          </div>

          {/* RIGHT: badge + reticle */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// PRESTIGE</div>
              <img src="assets/badge-bronze.png" style={{ width: 64, height: 64, marginTop: 4, filter: "drop-shadow(0 0 12px rgba(218,138,40,0.3))" }} alt="" />
              <div style={{ fontFamily: "var(--f-display)", fontSize: 12, color: "var(--bone)", letterSpacing: "0.2em", marginTop: 2 }}>BRONZE</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.25em" }}>LV 1</div>
            </div>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              border: "1px dashed var(--accent)",
              opacity: 0.35, position: "relative", alignSelf: "center",
            }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--accent)", letterSpacing: "0.3em",
              }}>S0 · BETA</div>
            </div>
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === "hist" && (
        <div style={{
          position: "absolute", top: 68, left: 52, right: 20, bottom: 26, zIndex: 5,
          padding: 10,
          background: "var(--bg-raised)", border: "1px solid var(--border)",
          clipPath: "var(--clip-6)",
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 3,
        }}>
          {[
            { r: "W", opp: "WOLFX",   p: "+0.48", m: "DUEL" },
            { r: "W", opp: "SHADOW",  p: "+0.18", m: "QUICK" },
            { r: "L", opp: "GRIM",    p: "-0.50", m: "DUEL" },
            { r: "W", opp: "REAPER",  p: "+0.90", m: "HIGH" },
            { r: "W", opp: "HAWK",    p: "+0.22", m: "QUICK" },
            { r: "L", opp: "IVAN",    p: "-0.10", m: "QUICK" },
          ].map((h, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "auto 1fr auto auto",
              alignItems: "center", gap: 10,
              padding: "5px 8px",
              background: "var(--bg-deep)",
              borderLeft: "3px solid " + (h.r === "W" ? "var(--accent)" : "var(--muted)"),
            }}>
              <span style={{ fontFamily: "var(--f-display)", fontSize: 14, color: h.r === "W" ? "var(--accent)" : "var(--muted)", letterSpacing: "0.1em" }}>{h.r}</span>
              <div>
                <div className="stencil" style={{ fontSize: 10, color: "var(--bone)", letterSpacing: "0.15em" }}>VS {h.opp}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em" }}>{h.m} · 2d ago</div>
              </div>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: h.p.startsWith("+") ? "var(--accent)" : "var(--muted)", letterSpacing: "0.1em" }}>{h.p}</span>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.2em" }}>SOL</span>
            </div>
          ))}
        </div>
      )}

      {/* Achievements tab */}
      {tab === "ach" && (
        <div style={{
          position: "absolute", top: 68, left: 52, right: 20, bottom: 26, zIndex: 5,
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6,
        }}>
          {[
            { l: "FIRST BLOOD", u: true },
            { l: "3 STREAK", u: true },
            { l: "SNIPER", u: true },
            { l: "HIGH ROLLER", u: false },
            { l: "PERFECT", u: false },
            { l: "10 STREAK", u: false },
            { l: "COMEBACK", u: true },
            { l: "OVERKILL", u: false },
            { l: "BOUNTY", u: false },
            { l: "UNTOUCHABLE", u: false },
            { l: "MARKSMAN", u: true },
            { l: "HUNTER", u: false },
          ].map((a, i) => (
            <div key={i} style={{
              padding: "6px 4px",
              background: "var(--bg-raised)",
              border: "1px solid " + (a.u ? "var(--accent)" : "var(--border)"),
              clipPath: "var(--clip-6)",
              textAlign: "center",
              opacity: a.u ? 1 : 0.4,
            }}>
              <div style={{
                width: 20, height: 20, margin: "0 auto 3px",
                background: a.u ? "var(--accent)" : "var(--bg-deep)",
                border: "1px solid var(--border)",
                clipPath: "polygon(50% 0%, 100% 35%, 82% 100%, 18% 100%, 0% 35%)",
              }} />
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: a.u ? "var(--bone)" : "var(--olive)", letterSpacing: "0.2em" }}>
                {a.l}
              </div>
            </div>
          ))}
        </div>
      )}
    </PhoneFrame>
  );
}

function Bracket({ pos }) {
  const size = 10;
  const s = { position: "absolute", width: size, height: size, borderColor: "var(--accent)", borderStyle: "solid", borderWidth: 0 };
  const pad = 4;
  if (pos === 0) return <div style={{ ...s, top: pad, left: pad, borderTopWidth: 2, borderLeftWidth: 2 }} />;
  if (pos === 1) return <div style={{ ...s, top: pad, right: pad, borderTopWidth: 2, borderRightWidth: 2 }} />;
  if (pos === 2) return <div style={{ ...s, bottom: pad, left: pad, borderBottomWidth: 2, borderLeftWidth: 2 }} />;
  return <div style={{ ...s, bottom: pad, right: pad, borderBottomWidth: 2, borderRightWidth: 2 }} />;
}

function StatBig({ k, v, accent }) {
  return (
    <div style={{
      padding: "6px 8px",
      background: "var(--bg-deep)", border: "1px solid var(--border)",
      clipPath: "var(--clip-6)",
    }}>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.25em" }}>{k}</div>
      <div style={{ fontFamily: "var(--f-display)", fontSize: 18, color: accent ? "var(--accent)" : "var(--bone)", letterSpacing: "0.08em", lineHeight: 1 }}>{v}</div>
    </div>
  );
}

Object.assign(window, { MobileBarracks });
