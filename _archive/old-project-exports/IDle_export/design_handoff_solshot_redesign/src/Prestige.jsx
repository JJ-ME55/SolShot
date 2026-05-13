/* global React, Terrain, ScreenHeader */
const { useState: useStatePr } = React;

function Prestige({ onNav }) {
  const [selected, setSelected] = useStatePr("bronze");
  const currentRank = "unranked"; // player's current state

  const tiers = [
    { id: "unranked", n: "UNRANKED", color: "var(--muted)",  cost: null,    unlock: "NONE",            desc: "Default tier. No prestige unlocked yet." },
    { id: "bronze",   n: "BRONZE",   color: "#c8782c",       cost: "10,000",    unlock: "HOMING MISSILE",  desc: "First step on the ladder. Unlocks permanent Homing Missile in loadout." },
    { id: "silver",   n: "SILVER",   color: "#c8d0d8",       cost: "50,000",    unlock: "CRUISER",         desc: "A rare, expensive shell with extended range. Earn your stripes." },
    { id: "gold",     n: "GOLD",     color: "#e8c428",       cost: "150,000",   unlock: "TOMMY GUN",       desc: "A sustained burst weapon. Gold-tier operatives earn recognition on kill-cards." },
    { id: "platinum", n: "PLATINUM", color: "#b8c0c8",       cost: "400,000",   unlock: "CHAIN REACTION",  desc: "Cascading blasts. Platinum is where this gets serious." },
    { id: "diamond",  n: "DIAMOND",  color: "#7ec8e8",       cost: "1,000,000", unlock: "PINEAPPLE",       desc: "The apex. Special kill-effect, animated callsign, leaderboard crown." },
  ];

  const cur = tiers.find(t => t.id === currentRank);
  const sel = tiers.find(t => t.id === selected);
  const nextTier = tiers[tiers.findIndex(t => t.id === currentRank) + 1];

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "20px 24px 60px", position: "relative", zIndex: 3 }}>
        <ScreenHeader
          title="PRESTIGE"
          subtitle="BURN $SHOT · EARN RANK · UNLOCK SIGNATURE WEAPONS"
          onBack={() => onNav("menu")}
        />

        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 28 }}>
          {/* LEFT — current player card */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20 }}>
            <div style={{ position: "relative", width: 220, height: 220, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
              {cur.id === "unranked" ? (
                <div style={{ width: 200, height: 200, border: "3px dashed var(--muted)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div className="stencil" style={{ fontSize: 60, color: "var(--muted)", letterSpacing: "0.1em" }}>P0</div>
                </div>
              ) : (
                <img src={`assets/badge-${cur.id}.png`} style={{ width: 200, height: 200, filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.6))" }} alt={cur.n} />
              )}
            </div>

            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.25em", marginBottom: 4 }}>CURRENT RANK</div>
            <div className="stencil" style={{ fontSize: 28, color: "var(--bone)", letterSpacing: "0.15em", marginBottom: 14 }}>{cur.n}</div>

            {nextTier && (
              <>
                <div style={{
                  padding: "8px 14px",
                  background: "rgba(132,80,216,0.1)",
                  border: "1px solid rgba(132,80,216,0.4)",
                  clipPath: "var(--clip-6)",
                  fontFamily: "var(--f-display)", fontSize: 12, letterSpacing: "0.15em",
                  color: "#a880e8",
                }}>◆ {nextTier.cost} SHOT</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em", marginTop: 8 }}>
                  NEXT: {nextTier.n} ({nextTier.cost} SHOT)
                </div>
              </>
            )}

            <button style={{
              marginTop: 20,
              padding: "10px 22px",
              background: "transparent",
              color: "var(--muted)",
              border: "1px dashed var(--muted)",
              clipPath: "var(--clip-6)",
              fontFamily: "var(--f-display)", fontSize: 11, letterSpacing: "0.2em",
              cursor: "not-allowed",
            }}>COMING SOON</button>

            <div style={{ marginTop: 28, maxWidth: 260, fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.1em", lineHeight: 1.6, textAlign: "center" }}>
              Prestige burns $SHOT for permanent rank, unlocks a signature weapon, and stamps your callsign across the leaderboards.
            </div>
          </div>

          {/* RIGHT — tier ladder */}
          <div>
            <div className="label" style={{ color: "var(--accent)", marginBottom: 14 }}>PRESTIGE TIERS</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {tiers.map(t => {
                const isSel = selected === t.id;
                const isCur = currentRank === t.id;
                return (
                  <div key={t.id} onClick={() => setSelected(t.id)} style={{
                    display: "grid", gridTemplateColumns: "60px 1fr auto",
                    gap: 16, alignItems: "center",
                    padding: "12px 18px",
                    background: isSel ? "var(--bg-raised)" : "var(--bg-surface)",
                    border: "1px solid " + (isSel ? t.color : "var(--border)"),
                    clipPath: "var(--clip-6)",
                    cursor: "pointer",
                    opacity: t.id === "unranked" ? 0.75 : 1,
                  }}>
                    <div style={{ width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {t.id === "unranked" ? (
                        <div style={{ width: 42, height: 42, border: "2px dashed var(--muted)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontFamily: "var(--f-mono)", fontSize: 14 }}>—</div>
                      ) : (
                        <img src={`assets/badge-${t.id}.png`} style={{ width: 48, height: 48, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }} alt={t.n} />
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="stencil" style={{ fontSize: 16, color: t.color, letterSpacing: "0.15em" }}>{t.n}</span>
                        {isCur && <span style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.25em" }}>◂ CURRENT</span>}
                      </div>
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 2 }}>
                        {t.cost ? `${t.cost} SHOT` : "DEFAULT"}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.2em" }}>UNLOCKS</div>
                      <div style={{ fontFamily: "var(--f-sec)", fontSize: 13, color: "var(--bone)", marginTop: 2 }}>{t.unlock}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected tier detail */}
            {sel && sel.id !== "unranked" && (
              <div style={{
                marginTop: 20,
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                clipPath: "var(--clip-10)",
                padding: "20px 24px",
                display: "grid",
                gridTemplateColumns: "120px 1fr",
                gap: 20,
                alignItems: "center",
              }}>
                <img src={`assets/badge-${sel.id}.png`} style={{ width: 110, height: 110, filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.5))" }} alt={sel.n} />
                <div>
                  <div className="label" style={{ color: sel.color, letterSpacing: "0.25em" }}>PRESTIGE TIER</div>
                  <div className="stencil" style={{ fontSize: 28, color: sel.color, letterSpacing: "0.15em", marginTop: 2, marginBottom: 6 }}>{sel.n}</div>
                  <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bone)", letterSpacing: "0.05em", lineHeight: 1.6 }}>
                    {sel.desc}
                  </div>
                  <div style={{ display: "flex", gap: 22, marginTop: 12, fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.15em" }}>
                    <span><span style={{ color: "var(--olive)" }}>COST</span> <span style={{ color: sel.color, marginLeft: 6 }}>◆ {sel.cost} SHOT</span></span>
                    <span><span style={{ color: "var(--olive)" }}>UNLOCK</span> <span style={{ color: "var(--bone)", marginLeft: 6 }}>{sel.unlock}</span></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <Terrain variant={0} />
    </div>
  );
}

window.Prestige = Prestige;
