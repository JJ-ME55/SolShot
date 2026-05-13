/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays, ScanBtn */
// Mobile Armory — cosmetics (skins, turrets, voice). Paid in SOL. Tabs.
// Mobile Prestige — burn path, 5 tiers, current Bronze.

function MobileArmory() {
  const [tab, setTab] = React.useState("SKINS");
  const tabs = ["SKINS", "TURRETS", "TRAILS", "VOICE"];
  const items = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    name: ["DESERT FOX", "MOON DUST", "URBAN", "ARCTIC", "CRIMSON", "OBSIDIAN", "VOID", "JADE"][i],
    rarity: ["STD", "STD", "RARE", "RARE", "ELITE", "ELITE", "LEGEND", "LEGEND"][i],
    price: [0.05, 0.05, 0.15, 0.2, 0.5, 0.8, 1.5, 2][i],
    owned: i < 2,
  }));
  const rarityColor = { STD: "var(--olive)", RARE: "var(--bone)", ELITE: "var(--accent)", LEGEND: "#d8b968" };

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title="ARMORY"
        right={<span style={{ color: "var(--bone)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em" }}>◇ 2.31 SOL</span>}
      />

      {/* Tabs */}
      <div style={{
        position: "absolute", top: 44, left: 52, right: 20, zIndex: 6,
        display: "flex", gap: 2,
      }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "4px 14px",
            background: tab === t ? "var(--bg-raised)" : "transparent",
            color: tab === t ? "var(--accent)" : "var(--olive)",
            border: "1px solid " + (tab === t ? "var(--accent)" : "transparent"),
            borderBottom: "none",
            fontFamily: "var(--f-mono)", fontSize: 8, letterSpacing: "0.25em",
            cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      {/* Cosmetic grid */}
      <div style={{
        position: "absolute", top: 68, left: 52, right: 20, bottom: 26, zIndex: 5,
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
      }}>
        {items.map(it => (
          <div key={it.id} style={{
            position: "relative",
            background: "var(--bg-raised)",
            border: "1px solid " + (it.owned ? "var(--accent)" : "var(--border)"),
            clipPath: "var(--clip-6)",
            padding: "6px 7px",
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            {/* Preview thumb — tank silhouette placeholder tinted by rarity */}
            <div style={{
              height: 46, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-deep)",
              borderBottom: "1px solid var(--border)",
              position: "relative", overflow: "hidden",
            }}>
              <img src="assets/tank-tinted.png"
                   style={{
                     width: 52, imageRendering: "pixelated",
                     filter: it.rarity === "LEGEND" ? "hue-rotate(50deg) brightness(1.2)"
                           : it.rarity === "ELITE"  ? "hue-rotate(-20deg)"
                           : it.rarity === "RARE"   ? "grayscale(0.3) brightness(1.1)"
                           : "grayscale(0.5) brightness(0.85)",
                   }} alt="" />
            </div>
            <div>
              <div className="stencil" style={{ fontSize: 9, color: "var(--bone)", letterSpacing: "0.15em", lineHeight: 1 }}>{it.name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: rarityColor[it.rarity], letterSpacing: "0.25em" }}>{it.rarity}</span>
                {it.owned
                  ? <span style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--accent)", letterSpacing: "0.25em" }}>OWNED</span>
                  : <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.1em" }}>◇{it.price}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PhoneFrame>
  );
}

function MobilePrestige() {
  const tiers = [
    { id: "bronze",   l: "BRONZE",   current: true,  locked: false, cost: "—" },
    { id: "silver",   l: "SILVER",   current: false, locked: false, cost: "100 SOL BURN" },
    { id: "gold",     l: "GOLD",     current: false, locked: true,  cost: "500 SOL" },
    { id: "platinum", l: "PLATINUM", current: false, locked: true,  cost: "1K SOL" },
    { id: "diamond",  l: "DIAMOND",  current: false, locked: true,  cost: "5K SOL" },
  ];

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title="PRESTIGE"
        right={<span style={{ color: "var(--bone)", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em" }}>BRONZE · LV 1</span>}
      />

      {/* Burn path */}
      <div style={{
        position: "absolute", top: 56, left: 52, right: 20, bottom: 92, zIndex: 5,
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", alignItems: "center",
      }}>
        {tiers.map((t, i) => (
          <div key={t.id} style={{
            position: "relative",
            textAlign: "center",
            opacity: t.locked ? 0.5 : 1,
          }}>
            {/* Connector */}
            {i > 0 && (
              <div style={{
                position: "absolute", left: "-50%", right: "50%",
                top: 38, height: 1,
                background: tiers[i - 1].current || tiers[i].current ? "var(--accent)" : "var(--border)",
                borderTop: "1px dashed " + (tiers[i].locked ? "var(--border)" : "var(--accent)"),
              }} />
            )}
            <img src={`assets/badge-${t.id}.png`}
              style={{
                width: 56, height: 56,
                filter: t.current
                  ? "drop-shadow(0 0 16px rgba(218,138,40,0.5))"
                  : t.locked ? "grayscale(1) brightness(0.6)" : "none",
              }} alt="" />
            <div className="stencil" style={{
              fontSize: 11, letterSpacing: "0.2em", marginTop: 2,
              color: t.current ? "var(--accent)" : "var(--bone)",
            }}>{t.l}</div>
            <div style={{
              fontFamily: "var(--f-mono)", fontSize: 6,
              color: t.current ? "var(--bone)" : "var(--olive)",
              letterSpacing: "0.25em", marginTop: 2,
            }}>
              {t.current ? "★ CURRENT" : t.cost}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom: next-tier panel */}
      <div style={{
        position: "absolute", bottom: 22, left: 52, right: 20, zIndex: 6,
        padding: "8px 12px",
        background: "var(--bg-raised)", border: "1px solid var(--accent)",
        clipPath: "var(--clip-6)",
        display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.3em" }}>// NEXT PRESTIGE</div>
          <div className="stencil" style={{ fontSize: 14, color: "var(--bone)", letterSpacing: "0.2em", marginTop: 1 }}>BURN 100 SOL → SILVER</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--accent)", letterSpacing: "0.25em", marginTop: 2 }}>
            UNLOCKS: +2 LOADOUT · SILVER BADGE · EARNINGS MULT 1.25×
          </div>
        </div>
        <ScanBtn width={110} height={40} fontSize={13}>BURN</ScanBtn>
      </div>
    </PhoneFrame>
  );
}

Object.assign(window, { MobileArmory, MobilePrestige });
