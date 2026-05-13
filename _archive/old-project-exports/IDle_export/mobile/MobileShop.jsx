/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays, ScanBtn */
// Mobile Weapon Shop — in-flow, 30s timer, split left:weapons right:loadout

function MobileShop() {
  const budget = 350;
  const [spent, setSpent] = React.useState(145);
  const [selected, setSelected] = React.useState([
    { id: "single", n: "SINGLE",   c: 0,   count: 5, tier: "BASE" },
    { id: "big",    n: "BIG SHOT", c: 25,  count: 3, tier: "STD" },
    { id: "3shot",  n: "3-SHOT",   c: 50,  count: 2, tier: "STD" },
    { id: "heat",   n: "HEATSEEK", c: 120, count: 1, tier: "ADV" },
  ]);

  const available = [
    { id: "nap",  n: "NAPALM",     c: 90,  tier: "ADV",   dmg: 80 },
    { id: "jack", n: "JACKHAMMER", c: 150, tier: "ELITE", dmg: 120 },
    { id: "snip", n: "SNIPER",     c: 80,  tier: "ADV",   dmg: 95 },
    { id: "iv",   n: "CRAZY IVAN", c: 110, tier: "ELITE", dmg: 70 },
    { id: "big",  n: "BIG SHOT",   c: 25,  tier: "STD",   dmg: 45 },
  ];

  const tierColor = { BASE: "var(--muted)", STD: "var(--olive)", ADV: "var(--bone)", ELITE: "var(--accent)" };

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title="WEAPON SHOP"
        right={
          <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", letterSpacing: "0.15em", fontSize: 9 }}>
            ◆ {budget - spent} / {budget}
          </span>
        }
      />

      {/* Timer bar */}
      <div style={{ position: "absolute", top: 44, left: 52, right: 20, zIndex: 6 }}>
        <div style={{ position: "relative", height: 3, background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: "62%", background: "var(--accent)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em" }}>
          <span>0:18 REMAINING</span>
          <span style={{ color: "var(--accent)" }}>BUY PHASE</span>
        </div>
      </div>

      {/* Split: catalog | loadout */}
      <div style={{
        position: "absolute", top: 72, left: 52, right: 20, bottom: 54,
        display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, zIndex: 5,
      }}>
        {/* CATALOG */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={sectionLabel}>ARSENAL</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, overflowY: "auto" }}>
            {available.map(w => (
              <div key={w.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto",
                alignItems: "center", gap: 6,
                padding: "5px 7px",
                background: "var(--bg-raised)", border: "1px solid var(--border)",
                clipPath: "var(--clip-6)",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="stencil" style={{ fontSize: 11, color: "var(--bone)", letterSpacing: "0.15em" }}>{w.n}</span>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: tierColor[w.tier], letterSpacing: "0.2em" }}>{w.tier}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
                    <span style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>DMG</span>
                    <div style={{ width: 50, height: 3, background: "var(--bg-deep)", border: "1px solid var(--muted)" }}>
                      <div style={{ width: (w.dmg / 150) * 100 + "%", height: "100%", background: tierColor[w.tier] }} />
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.1em" }}>◆{w.c}</span>
                <button style={{
                  padding: "3px 6px",
                  background: "transparent", color: "var(--accent)",
                  border: "1px solid var(--accent)", clipPath: "var(--clip-6)",
                  fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.15em", cursor: "pointer",
                }}>+</button>
              </div>
            ))}
          </div>
        </div>

        {/* LOADOUT */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={sectionLabel}>LOADOUT</div>
          <div style={{
            flex: 1,
            padding: "6px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            clipPath: "var(--clip-6)",
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            {selected.map(w => (
              <div key={w.id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto",
                alignItems: "center", gap: 4,
                padding: "3px 5px",
                background: "var(--bg-deep)",
                borderLeft: "2px solid " + tierColor[w.tier],
              }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.1em" }}>×{w.count}</span>
                <span className="stencil" style={{ fontSize: 9, color: "var(--bone)", letterSpacing: "0.12em" }}>{w.n}</span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.15em" }}>◆{w.c * w.count}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 4 }}>
            <ScanBtn height={42} fontSize={15}>READY UP</ScanBtn>
          </div>
        </div>
      </div>

      {/* Bottom opponent status strip — above home bar */}
      <div style={{
        position: "absolute", bottom: 22, left: 52, right: 20,
        padding: "4px 10px",
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        clipPath: "var(--clip-6)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: "var(--f-mono)", fontSize: 7, letterSpacing: "0.2em", color: "var(--olive)",
        zIndex: 5,
      }}>
        <span>OPPONENTS: <span style={{ color: "var(--bone)" }}>WOLFX · STILL BUYING</span></span>
        <span><span className="blink" style={{ color: "var(--accent)" }}>●</span> MARKET OPEN</span>
      </div>
    </PhoneFrame>
  );
}

const sectionLabel = {
  fontFamily: "var(--f-mono)", fontSize: 8,
  color: "var(--olive)", letterSpacing: "0.25em",
  marginBottom: 3,
};

Object.assign(window, { MobileShop });
