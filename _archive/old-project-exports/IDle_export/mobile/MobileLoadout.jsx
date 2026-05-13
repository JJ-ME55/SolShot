/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays, ScanBtn */
// Mobile Loadout — consumables (not weapons). Paid in $SHOT.

function MobileLoadout() {
  const [cart, setCart] = React.useState({ repair: 2, shield: 1, scout: 0 });
  const items = [
    { id: "repair", n: "REPAIR KIT",    sub: "+25 HP", p: 0.8, max: 3 },
    { id: "shield", n: "IRON SHIELD",   sub: "1-TURN BLOCK", p: 1.5, max: 2 },
    { id: "scout",  n: "SCOUT DRONE",   sub: "REVEAL WIND", p: 0.5, max: 3 },
    { id: "mine",   n: "MINE",          sub: "PLANT·AMBUSH", p: 1.2, max: 3 },
    { id: "boost",  n: "FUEL BOOST",    sub: "+15% MOVE", p: 0.4, max: 5 },
  ];
  const total = Object.entries(cart).reduce((sum, [k, c]) => {
    const item = items.find(i => i.id === k);
    return sum + (item ? item.p * c : 0);
  }, 0);

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />
      <MobileChrome
        onBack={() => {}}
        title="LOADOUT"
        right={
          <span style={{ color: "var(--accent)", fontFamily: "var(--f-mono)", letterSpacing: "0.15em", fontSize: 9 }}>
            ◆ 1,240 SHOT
          </span>
        }
      />

      <div style={{
        position: "absolute", top: 52, left: 52, right: 20, bottom: 60,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
        zIndex: 5, overflowY: "auto",
      }}>
        {items.map(it => (
          <div key={it.id} style={{
            padding: "7px 9px",
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            clipPath: "var(--clip-6)",
            display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 6,
          }}>
            <div>
              <div className="stencil" style={{ fontSize: 11, color: "var(--bone)", letterSpacing: "0.15em" }}>{it.n}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 2 }}>{it.sub}</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.15em", marginTop: 3 }}>◆ {it.p} SHOT</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button style={stepperBtn}>−</button>
              <span style={{ fontFamily: "var(--f-display)", fontSize: 14, color: "var(--bone)", minWidth: 16, textAlign: "center" }}>
                {cart[it.id] || 0}
              </span>
              <button style={stepperBtn}>+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar: total + checkout */}
      <div style={{
        position: "absolute", bottom: 22, left: 52, right: 20,
        display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8,
        zIndex: 6,
      }}>
        <div style={{
          padding: "6px 10px",
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          clipPath: "var(--clip-6)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em",
        }}>
          <span style={{ color: "var(--olive)" }}>TOTAL</span>
          <span style={{ color: "var(--accent)", fontFamily: "var(--f-display)", fontSize: 14 }}>◆ {total.toFixed(1)} SHOT</span>
        </div>
        <ScanBtn width={140} height={40} fontSize={13}>BUY & EQUIP</ScanBtn>
      </div>
    </PhoneFrame>
  );
}

const stepperBtn = {
  width: 22, height: 22,
  background: "var(--bg-deep)", color: "var(--accent)",
  border: "1px solid var(--border)", clipPath: "var(--clip-6)",
  fontFamily: "var(--f-display)", fontSize: 14, letterSpacing: 0,
  cursor: "pointer", padding: 0,
};

Object.assign(window, { MobileLoadout });
