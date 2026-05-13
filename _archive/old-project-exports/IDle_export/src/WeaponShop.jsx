/* global React, Terrain, ScreenHeader */
const { useState: useStateShop, useEffect: useEffectShop } = React;

function WeaponShop({ onNav }) {
  const [budget] = useStateShop(1000);
  const [cart, setCart] = useStateShop({ single: 1 });
  const [timer, setTimer] = useStateShop(29);
  const [selected, setSelected] = useStateShop(null);

  useEffectShop(() => {
    const t = setInterval(() => setTimer(s => s > 0 ? s - 1 : 0), 1000);
    return () => clearInterval(t);
  }, []);

  const weapons = [
    { id: "single",     n: "Single Shot",  tier: "FREE",     cost: 0,    dmg: 30,  rad: 20, desc: "Standard issue. Unlimited rounds." },
    { id: "dirtball",   n: "Dirt Ball",    tier: "STANDARD", cost: 150,  dmg: 20,  rad: 70, desc: "Massive terrain deformation." },
    { id: "magic",      n: "Magic Wall",   tier: "STANDARD", cost: 150,  dmg: 0,   rad: 0,  desc: "Raises a barrier. Pure utility." },
    { id: "skipper",    n: "Skipper",      tier: "TACTICAL", cost: 200,  dmg: 50,  rad: 22, desc: "Skims along terrain." },
    { id: "three",      n: "3 Shot",       tier: "TACTICAL", cost: 200,  dmg: 25,  rad: 18, desc: "Three-round burst." },
    { id: "spider",     n: "Spider",       tier: "TACTICAL", cost: 200,  dmg: 60,  rad: 45, desc: "Walking bomblets." },
    { id: "heatseeker", n: "Heatseeker",   tier: "TACTICAL", cost: 350,  dmg: 70,  rad: 25, desc: "Tracks nearest target." },
    { id: "napalm",     n: "Napalm",       tier: "RARE",     cost: 400,  dmg: 100, rad: 60, desc: "Burns terrain 3 turns." },
    { id: "pile",       n: "Pile Driver",  tier: "RARE",     cost: 400,  dmg: 120, rad: 18, desc: "Vertical strike. Ignores wind." },
    { id: "sniper",     n: "Sniper Rifle", tier: "RARE",     cost: 500,  dmg: 95,  rad: 8,  desc: "Pinpoint single-shot." },
    { id: "big",        n: "Big Shot",     tier: "RARE",     cost: 600,  dmg: 80,  rad: 40, desc: "Scaled-up standard shell." },
    { id: "hog",        n: "Ground Hog",   tier: "EPIC",     cost: 600,  dmg: 75,  rad: 28, desc: "Burrows under terrain." },
    { id: "jackhammer", n: "Jackhammer",   tier: "EPIC",     cost: 700,  dmg: 40,  rad: 12, desc: "5-round rapid-fire." },
    { id: "hail",       n: "Hail Storm",   tier: "EPIC",     cost: 700,  dmg: 180, rad: 80, desc: "Saturation artillery." },
    { id: "ivan",       n: "Crazy Ivan",   tier: "LEGENDARY",cost: 2500, dmg: 160, rad: 50, desc: "Unpredictable. Round-ending." },
  ];
  const tierColor = {
    FREE: "var(--muted)", STANDARD: "#4fc0b4", TACTICAL: "#4a80f0",
    RARE: "#8450d8", EPIC: "var(--accent)", LEGENDARY: "#e8c820",
  };

  const spent = Object.entries(cart).reduce((a,[id,q]) => a + (weapons.find(w=>w.id===id)?.cost || 0) * q, 0);
  const remaining = budget - spent;

  const add = (w) => { if (w.cost === 0 || remaining < w.cost) return; setCart(c => ({ ...c, [w.id]: (c[w.id] || 0) + 1 })); };
  const remove = (w) => setCart(c => { const q = (c[w.id] || 0) - 1; const next = { ...c }; if (q <= 0) delete next[w.id]; else next[w.id] = q; return next; });

  const sel = selected ? weapons.find(w => w.id === selected) : null;

  const Bar = ({ val, max, color }) => (
    <div style={{ display: "inline-flex", gap: 1, verticalAlign: "middle", marginLeft: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ width: 8, height: 4, background: i < Math.ceil((val/max)*5) ? color : "var(--border)" }} />
      ))}
    </div>
  );

  const loadoutItems = Object.entries(cart).map(([id,q]) => ({ ...weapons.find(w=>w.id===id), q }));

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 24px 40px", position: "relative", zIndex: 3 }}>

        {/* Header */}
        <ScreenHeader
          title="WEAPON SHOP"
          subtitle="30s TO KIT OUT · SPEND YOUR ROUND GOLD"
          onBack={() => onNav("deploy")}
          backLabel="DEPLOY"
          right={
            <div style={{ display: "flex", alignItems: "center", gap: 18, fontFamily: "var(--f-mono)", fontSize: 12, letterSpacing: "0.15em" }}>
              <span style={{ color: "var(--accent)" }}>◆ {budget - spent} GOLD</span>
              <span style={{ color: "var(--olive)" }}>/ {budget}</span>
            </div>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 18 }}>

          {/* ARSENAL */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              <span className="label" style={{ color: "var(--accent)", fontSize: 12 }}>ARSENAL</span>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bone)", letterSpacing: "0.15em" }}>
                ◆ {budget - spent} GOLD
              </span>
            </div>
            <div>
              {weapons.map(w => {
                const inCart = cart[w.id] || 0;
                const canAfford = remaining >= w.cost || inCart > 0 || w.cost === 0;
                const isSel = selected === w.id;
                return (
                  <div key={w.id} onClick={() => setSelected(w.id)} style={{
                    display: "grid", gridTemplateColumns: "32px 1fr auto", gap: 12, alignItems: "center",
                    padding: "8px 12px",
                    background: isSel ? "var(--bg-raised)" : "transparent",
                    borderLeft: "2px solid " + (isSel ? tierColor[w.tier] : "transparent"),
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    opacity: canAfford ? 1 : 0.45,
                  }}>
                    <div style={{ width: 28, height: 28, background: "var(--bg-surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="18" height="10" viewBox="0 0 18 10">
                        <rect x="1" y="4" width="10" height="3" fill={tierColor[w.tier]} />
                        <rect x="11" y="3" width="5" height="5" fill={tierColor[w.tier]} />
                      </svg>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "var(--f-sec)", fontSize: 13 }}>
                      <span style={{ color: "var(--bone)", fontWeight: 700, fontSize: 16 }}>{w.n}</span>
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: tierColor[w.tier], letterSpacing: "0.2em" }}>
                        {w.tier}
                      </span>
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em" }}>DMG</span>
                      <Bar val={w.dmg} max={200} color={tierColor[w.tier]} />
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em" }}>BLR</span>
                      <Bar val={w.rad} max={80} color={tierColor[w.tier]} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {inCart > 0 && w.cost > 0 && (
                        <>
                          <button onClick={e => { e.stopPropagation(); remove(w); }} style={{ width: 22, height: 22, background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--bone)", fontFamily: "var(--f-mono)", cursor: "pointer" }}>−</button>
                          <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bone)", minWidth: 14, textAlign: "center" }}>{inCart}</span>
                        </>
                      )}
                      <span style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: tierColor[w.tier], letterSpacing: "0.15em", minWidth: 60, textAlign: "right" }}>
                        {w.cost === 0 ? "OWNED" : `${w.cost}G`}
                      </span>
                      {w.cost > 0 && (
                        <button onClick={e => { e.stopPropagation(); add(w); }} disabled={remaining < w.cost} style={{
                          width: 28, height: 22,
                          background: inCart > 0 ? "var(--accent)" : "var(--bg-surface)",
                          color: inCart > 0 ? "#0e1209" : "var(--bone)",
                          border: "1px solid " + (inCart > 0 ? "var(--accent-hot)" : "var(--border)"),
                          fontFamily: "var(--f-mono)", fontSize: 13, cursor: remaining < w.cost ? "not-allowed" : "pointer",
                        }}>+</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: TIMER / SPEC / LOADOUT */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Timer */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", clipPath: "var(--clip-6)", padding: "14px", textAlign: "center", marginBottom: 12 }}>
              <div className="stencil" style={{ fontSize: 40, color: timer < 10 ? "#d83030" : "var(--accent)", lineHeight: 1 }}>
                {String(timer).padStart(2,"0")}
              </div>
              <div className="label" style={{ color: "var(--olive)", marginTop: 4 }}>SECONDS REMAINING</div>
            </div>

            {/* Spec */}
            <div style={{
              flex: 1, minHeight: 360,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              clipPath: "var(--clip-6)", padding: "16px",
              display: "flex", alignItems: sel ? "flex-start" : "center", justifyContent: sel ? "stretch" : "center",
              marginBottom: 12,
            }}>
              {sel ? (
                <div style={{ width: "100%" }}>
                  <div className="label" style={{ color: tierColor[sel.tier] }}>{sel.tier}</div>
                  <div className="stencil" style={{ fontSize: 22, color: "var(--bone)", lineHeight: 1, marginTop: 4 }}>{sel.n}</div>
                  <div style={{ height: 70, margin: "12px 0", background: "var(--bg-deep)", border: "1px dashed var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="120" height="40" viewBox="0 0 120 40">
                      <path d="M5,35 Q60,0 115,35" stroke={tierColor[sel.tier]} strokeDasharray="3 3" fill="none" />
                      <rect x="6" y="30" width="16" height="6" fill={tierColor[sel.tier]} />
                      <circle cx="114" cy="35" r="3" fill="var(--accent)" />
                    </svg>
                  </div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", lineHeight: 1.6, marginBottom: 12 }}>{sel.desc}</div>
                  <div className="kv"><span className="k">DAMAGE</span><span className="v">{sel.dmg}</span></div>
                  <div className="kv"><span className="k">BLAST RADIUS</span><span className="v">{sel.rad}</span></div>
                  <div className="kv" style={{ borderBottom: "none" }}><span className="k">COST</span><span className="v" style={{ color: tierColor[sel.tier] }}>{sel.cost === 0 ? "OWNED" : `${sel.cost}G`}</span></div>
                </div>
              ) : (
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)", letterSpacing: "0.2em" }}>SELECT A WEAPON</div>
              )}
            </div>

            {/* Loadout */}
            <div style={{ marginBottom: 10 }}>
              <div className="label" style={{ color: "var(--accent)", marginBottom: 6 }}>LOADOUT</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", minHeight: 30 }}>
                {loadoutItems.map(it => (
                  <span key={it.id} style={{
                    padding: "4px 8px", background: "var(--bg-surface)", border: "1px solid var(--border)",
                    fontFamily: "var(--f-sec)", fontSize: 11, color: "var(--bone)",
                  }}>{it.n}{it.q > 1 ? ` ×${it.q}` : ""}</span>
                ))}
              </div>
            </div>

            <button onClick={() => onNav("match")} style={{
              width: "100%", padding: "16px", background: "var(--accent)", color: "#0e1209",
              border: "none", clipPath: "var(--clip-6)", fontFamily: "var(--f-display)",
              fontSize: 18, letterSpacing: "0.12em", cursor: "pointer",
            }}>READY</button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.WeaponShop = WeaponShop;
