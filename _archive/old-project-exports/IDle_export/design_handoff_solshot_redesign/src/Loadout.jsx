/* global React, Terrain, ScreenHeader */
const { useState: useStateLd } = React;

function Loadout({ onNav }) {
  const [cart, setCart] = useStateLd({});
  const items = [
    { id: "rat",  k: "G", n: "Extra Rations",    desc: "+200G starting gold",          cost: 5,  tier: "STD"  },
    { id: "smk",  k: "S", n: "Smoke Screen",     desc: "Blocks opponent Scope",         cost: 8,  tier: "STD"  },
    { id: "sco",  k: "T", n: "Tactical Scope",   desc: "Trajectory preview (1/3 arc)",  cost: 12, tier: "TAC"  },
    { id: "arm",  k: "A", n: "Reinforced Armor", desc: "+25 HP (275 total)",            cost: 18, tier: "TAC"  },
    { id: "ovr",  k: "O", n: "Overcharge",       desc: "Power max 115",                 cost: 25, tier: "RARE" },
  ];
  const tierColor = { STD: "var(--olive)", TAC: "#4a80f0", RARE: "#8450d8" };
  const total = Object.entries(cart).reduce((a,[id,q]) => a + (items.find(i=>i.id===id)?.cost || 0) * q, 0);
  const toggle = id => setCart(c => ({ ...c, [id]: c[id] ? 0 : 1 }));

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)", background: "var(--bg-deep)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px 60px", position: "relative", zIndex: 3 }}>
        <ScreenHeader
          title="LOADOUT"
          subtitle={`CONSUMABLES · ${total.toFixed(1)} SHOT SELECTED`}
          onBack={() => onNav("menu")}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
          {items.map(it => {
            const active = cart[it.id];
            return (
              <div key={it.id} onClick={() => toggle(it.id)} style={{
                display: "grid", gridTemplateColumns: "56px 1fr auto", gap: 14, alignItems: "center",
                padding: "14px 18px",
                background: active ? "var(--bg-raised)" : "var(--bg-surface)",
                border: "1px solid " + (active ? tierColor[it.tier] : "var(--border)"),
                clipPath: "var(--clip-6)",
                cursor: "pointer",
              }}>
                <div style={{
                  width: 44, height: 44,
                  background: "var(--bg-deep)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--f-display)", fontSize: 22, color: tierColor[it.tier],
                }}>{it.k}</div>
                <div>
                  <div style={{ fontFamily: "var(--f-sec)", fontSize: 16, color: "var(--bone)", fontWeight: 700 }}>{it.n}</div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.05em", marginTop: 2 }}>{it.desc}</div>
                </div>
                <div style={{
                  padding: "8px 14px",
                  background: active ? "var(--accent)" : "var(--bg-deep)",
                  color: active ? "#0e1209" : "var(--bone)",
                  border: "1px solid " + (active ? "var(--accent-hot)" : "var(--border)"),
                  fontFamily: "var(--f-display)", fontSize: 12, letterSpacing: "0.15em",
                }}>{it.cost} SHOT</div>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: "center", fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.2em", marginBottom: 18 }}>
          CONSUMABLES LAST 5 MATCHES — SHOT IS BURNED ON PURCHASE
        </div>

        {total > 0 && (
          <button onClick={() => onNav("menu")} style={{
            width: "100%", padding: "16px", background: "var(--accent)", color: "#0e1209",
            border: "none", clipPath: "var(--clip-6)", fontFamily: "var(--f-display)",
            fontSize: 16, letterSpacing: "0.12em", cursor: "pointer",
          }}>ACTIVATE · {total.toFixed(1)} SHOT</button>
        )}
      </div>
    </div>
  );
}

window.Loadout = Loadout;
