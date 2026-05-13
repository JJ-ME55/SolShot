/* global React, Terrain, ScreenHeader */
const { useState: useStateArm } = React;

function Armory({ onNav }) {
  const [tab, setTab] = useStateArm("SOL");
  const [selected, setSelected] = useStateArm(null);

  const solItems = [
    { id: "grad",  n: "Solana Gradient", tier: "LEGENDARY", cost: 0.1,  cat: "SKIN" },
    { id: "phant", n: "Phantom Turret",  tier: "EPIC",      cost: 0.05, cat: "TURRET" },
    { id: "sol-t", n: "SOL Trail",       tier: "EPIC",      cost: 0.03, cat: "TRAIL" },
    { id: "sol-b", n: "SOL Burst",       tier: "RARE",      cost: 0.02, cat: "KILL FX" },
    { id: "valk",  n: "Validator Kill",  tier: "LEGENDARY", cost: 0.08, cat: "KILL FX" },
    { id: "saga",  n: "Saga Edition",    tier: "LEGENDARY", cost: 0.15, cat: "SKIN" },
  ];
  const cosItems = [
    { id: "c-fr",  n: "Forest Camo",     tier: "TACTICAL",  cost: 50,   cat: "SKIN" },
    { id: "c-ds",  n: "Desert Camo",     tier: "TACTICAL",  cost: 50,   cat: "SKIN" },
    { id: "c-ar",  n: "Arctic Camo",     tier: "RARE",      cost: 100,  cat: "SKIN" },
    { id: "c-dg",  n: "Digital Camo",    tier: "RARE",      cost: 150,  cat: "SKIN" },
    { id: "c-la",  n: "Lava Camo",       tier: "EPIC",      cost: 300,  cat: "SKIN" },
    { id: "c-vo",  n: "Void Camo",       tier: "LEGENDARY", cost: 600,  cat: "SKIN" },
    { id: "t-fi",  n: "Fire Trail",      tier: "TACTICAL",  cost: 75,   cat: "TRAIL" },
    { id: "t-ne",  n: "Neon Trail",      tier: "RARE",      cost: 150,  cat: "TRAIL" },
    { id: "t-pl",  n: "Plasma Trail",    tier: "EPIC",      cost: 250,  cat: "TRAIL" },
    { id: "t-gh",  n: "Ghost Trail",     tier: "LEGENDARY", cost: 500,  cat: "TRAIL" },
    { id: "b-sh",  n: "Shockwave",       tier: "TACTICAL",  cost: 75,   cat: "BLAST" },
    { id: "b-sk",  n: "Skull Blast",     tier: "RARE",      cost: 200,  cat: "BLAST" },
    { id: "b-th",  n: "Thunder Strike",  tier: "EPIC",      cost: 350,  cat: "BLAST" },
    { id: "b-mu",  n: "Mushroom Cloud",  tier: "LEGENDARY", cost: 750,  cat: "BLAST" },
    { id: "p-bk",  n: "Stealth Black",   tier: "RARE",      cost: 200,  cat: "PATTERN" },
    { id: "p-ch",  n: "Chrome Plated",   tier: "EPIC",      cost: 400,  cat: "PATTERN" },
    { id: "p-go",  n: "Gold Plated",     tier: "LEGENDARY", cost: 1000, cat: "PATTERN" },
    { id: "p-di",  n: "Diamond Encrusted",tier:"LEGENDARY", cost: 2000, cat: "PATTERN" },
    { id: "k-co",  n: "Confetti Kill",   tier: "TACTICAL",  cost: 100,  cat: "KILL FX" },
    { id: "k-fw",  n: "Fireworks",       tier: "RARE",      cost: 200,  cat: "KILL FX" },
  ];
  const tierColor = { TACTICAL: "#4a80f0", RARE: "#8450d8", EPIC: "var(--accent)", LEGENDARY: "#e8c820" };

  const items = tab === "SOL" ? solItems : cosItems;
  const unit = tab === "SOL" ? "SOL" : "SHOT";
  const sel = selected ? items.find(i => i.id === selected) : null;

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 60px", position: "relative", zIndex: 3 }}>
        <ScreenHeader
          title="ARMORY"
          subtitle="PERMANENT COSMETICS · PAID IN SOL OR $SHOT"
          onBack={() => onNav("menu")}
        />

        {/* Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)", marginBottom: 14 }}>
          {["SOL","COSMETICS"].map(t => (
            <button key={t} onClick={() => { setTab(t === "SOL" ? "SOL" : "COS"); setSelected(null); }} style={{
              padding: "14px 0", background: "transparent",
              color: (tab === (t === "SOL" ? "SOL" : "COS")) ? "var(--accent)" : "var(--olive)",
              border: "none",
              borderBottom: "2px solid " + ((tab === (t === "SOL" ? "SOL" : "COS")) ? "var(--accent)" : "transparent"),
              fontFamily: "var(--f-display)", fontSize: 14, letterSpacing: "0.15em",
              cursor: "pointer",
            }}>{t === "SOL" ? "SOL SHOP" : "COSMETICS"}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>
          <div>
            {items.map(it => {
              const isSel = selected === it.id;
              return (
                <div key={it.id} onClick={() => setSelected(it.id)} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "center",
                  padding: "10px 12px",
                  background: isSel ? "var(--bg-raised)" : "transparent",
                  borderLeft: "2px solid " + (isSel ? tierColor[it.tier] : "transparent"),
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}>
                  <div style={{ width: 28, height: 28, background: "var(--bg-surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: tierColor[it.tier], fontFamily: "var(--f-display)", fontSize: 12 }}>
                    {it.cat[0]}
                  </div>
                  <div style={{ fontFamily: "var(--f-sec)", fontSize: 13 }}>
                    <div style={{ color: "var(--bone)", fontWeight: 700, fontSize: 16 }}>{it.n}</div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: tierColor[it.tier], letterSpacing: "0.2em", marginTop: 2 }}>
                      {it.tier} · {it.cat}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: tierColor[it.tier], letterSpacing: "0.15em" }}>
                    {it.cost} {unit}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            clipPath: "var(--clip-6)", padding: "16px",
            alignSelf: "start", minHeight: 400,
            position: "sticky", top: 16,
          }}>
            {sel ? (
              <>
                <div className="label" style={{ color: tierColor[sel.tier] }}>{sel.tier} · {sel.cat}</div>
                <div className="stencil" style={{ fontSize: 22, color: "var(--bone)", lineHeight: 1, marginTop: 4 }}>{sel.n}</div>
                <div style={{ height: 140, margin: "16px 0", background: "var(--bg-deep)", border: "1px dashed var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="120" height="70" viewBox="0 0 120 70">
                    <rect x="20" y="34" width="70" height="14" fill={tierColor[sel.tier]} />
                    <rect x="38" y="24" width="24" height="12" fill={tierColor[sel.tier]} />
                    <rect x="62" y="28" width="30" height="4" fill={tierColor[sel.tier]} />
                    <rect x="15" y="48" width="80" height="4" fill="#0e1209" />
                  </svg>
                </div>
                <div className="kv"><span className="k">CATEGORY</span><span className="v">{sel.cat}</span></div>
                <div className="kv"><span className="k">TIER</span><span className="v" style={{ color: tierColor[sel.tier] }}>{sel.tier}</span></div>
                <div className="kv"><span className="k">PRICE</span><span className="v" style={{ color: "var(--accent)" }}>{sel.cost} {unit}</span></div>
                <div className="kv" style={{ borderBottom: "none" }}><span className="k">OWNED</span><span className="v" style={{ color: "var(--muted)" }}>NO</span></div>
                <button style={{
                  width: "100%", marginTop: 14, padding: "14px", background: "var(--accent)", color: "#0e1209",
                  border: "none", clipPath: "var(--clip-6)", fontFamily: "var(--f-display)", fontSize: 14,
                  letterSpacing: "0.12em", cursor: "pointer",
                }}>PURCHASE</button>
                {unit === "SHOT" && <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em", textAlign: "center", marginTop: 8 }}>SHOT BURNED ON PURCHASE</div>}
              </>
            ) : (
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", letterSpacing: "0.2em", textAlign: "center", paddingTop: 160 }}>SELECT AN ITEM</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Armory = Armory;
