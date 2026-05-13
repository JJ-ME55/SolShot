/* global React, Wordmark, Terrain, PixelTank */
const { useState: useStateAAR } = React;

function PostMatch({ onNav }) {
  const winner = {
    callsign: "GRIZZLY-07",
    color: "var(--accent)",
    damage: 742,
    accuracy: 68,
    best: "CRAZY IVAN",
    bestIcon: "w-crazy-ivan.png",
    shots: 22,
    hp: 84,
  };
  const loser = {
    callsign: "VIPER-12",
    color: "var(--olive)",
    damage: 614,
    accuracy: 52,
    best: "HEATSEEKER",
    bestIcon: "w-heatseeker.png",
    shots: 20,
    hp: 0,
  };

  const StatBar = ({ label, a, b, max, unit = "" }) => {
    const pctA = Math.min(100, (a / max) * 100);
    const pctB = Math.min(100, (b / max) * 100);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.15em", marginBottom: 4 }}>
          <span style={{ color: "var(--accent)" }}>{a}{unit}</span>
          <span>{label}</span>
          <span>{b}{unit}</span>
        </div>
        <div style={{ display: "flex", gap: 4, height: 10 }}>
          <div style={{ flex: 1, background: "var(--bg-deep)", border: "1px solid var(--border)", position: "relative", display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: `${pctA}%`, background: "var(--accent)" }} />
          </div>
          <div style={{ flex: 1, background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
            <div style={{ width: `${pctB}%`, background: "var(--olive)" }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "28px 24px 140px", position: "relative", zIndex: 3 }}>

        {/* Stamp header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.2em" }}>
          <span>DOC 14-C · DECLASSIFIED</span>
          <span style={{ color: "var(--accent)", border: "2px solid var(--accent)", padding: "2px 8px", transform: "rotate(-2deg)", fontFamily: "var(--f-display)", fontSize: 12 }}>
            ★ CONFIRMED KILL ★
          </span>
          <span>M-#0A3F7</span>
        </div>

        <div className="briefing" style={{ marginBottom: 6 }}>
          <div className="stencil" style={{ fontSize: 38, color: "var(--bone)" }}>AFTER ACTION REPORT</div>
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--olive)", letterSpacing: "0.2em", marginBottom: 26 }}>
          MATCH · BO3 · TERRAIN VOLCANIC · DURATION 08:42
        </div>

        {/* WINNER STRIP */}
        <div style={{
          background: "var(--accent)",
          clipPath: "var(--clip-16)",
          padding: "22px 24px",
          marginBottom: 18,
          display: "flex", alignItems: "center", gap: 22,
          position: "relative",
        }}>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 64, color: "#0e1209", lineHeight: 0.8 }}>
            W
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "#0e1209", opacity: 0.7, letterSpacing: "0.2em" }}>
              VICTOR
            </div>
            <div className="stencil" style={{ fontSize: 38, color: "#0e1209", letterSpacing: "0.04em", lineHeight: 1 }}>
              {winner.callsign}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "#0e1209", opacity: 0.7, letterSpacing: "0.2em" }}>
              FINAL SCORE
            </div>
            <div className="stencil" style={{ fontSize: 40, color: "#0e1209", lineHeight: 1 }}>
              2 – 1
            </div>
          </div>
        </div>

        {/* BODY GRID */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          clipPath: "var(--clip-16)",
          padding: "24px",
          marginBottom: 18,
        }}>
          {/* Tanks header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20, paddingBottom: 16, borderBottom: "1px dashed var(--muted)" }}>
            {[winner, loser].map((p, i) => (
              <div key={i} style={{ textAlign: i === 0 ? "left" : "right" }}>
                <div className="label">COMBATANT · {i === 0 ? "BLUE" : "RED"}</div>
                <div className="stencil" style={{ fontSize: 24, color: p.color, marginTop: 4 }}>{p.callsign}</div>
                <div style={{ display: "flex", justifyContent: i === 0 ? "flex-start" : "flex-end", marginTop: 8 }}>
                  <PixelTank color={p.color} size={54} flipped={i === 1} />
                </div>
              </div>
            ))}
          </div>

          {/* Comparative stats */}
          <StatBar label="DMG DEALT" a={winner.damage} b={loser.damage} max={900} />
          <StatBar label="ACCURACY" a={winner.accuracy} b={loser.accuracy} max={100} unit="%" />
          <StatBar label="HP REMAINING" a={winner.hp} b={loser.hp} max={250} />
          <StatBar label="SHOTS FIRED" a={winner.shots} b={loser.shots} max={30} />

          {/* Best weapon row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--muted)" }}>
            {[winner, loser].map((p, i) => (
              <div key={i} style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                clipPath: "var(--clip-6)",
                padding: "10px 14px",
                display: "flex", alignItems: "center", gap: 12,
                flexDirection: i === 1 ? "row-reverse" : "row",
                textAlign: i === 1 ? "right" : "left",
              }}>
                <div style={{
                  width: 40, height: 40,
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border-hot)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, color: p.color,
                }}>◈</div>
                <div>
                  <div className="label">BEST WEAPON</div>
                  <div className="stencil" style={{ fontSize: 16, color: "var(--bone)" }}>{p.best}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Round breakdown */}
        <div style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          clipPath: "var(--clip-10)",
          padding: "14px 20px",
          marginBottom: 22,
        }}>
          <div className="label" style={{ marginBottom: 10 }}>ROUND-BY-ROUND</div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { r: 1, w: "GRIZZLY-07", dmg: 250, t: "04:12" },
              { r: 2, w: "VIPER-12",   dmg: 250, t: "02:08" },
              { r: 3, w: "GRIZZLY-07", dmg: 208, t: "02:22" },
            ].map(r => (
              <div key={r.r} style={{
                flex: 1,
                background: "var(--bg-raised)",
                border: "1px solid " + (r.w === winner.callsign ? "var(--accent)" : "var(--border)"),
                clipPath: "var(--clip-6)",
                padding: "10px",
                textAlign: "center",
              }}>
                <div className="label">R{r.r}</div>
                <div className="stencil" style={{ fontSize: 14, color: r.w === winner.callsign ? "var(--accent)" : "var(--olive)" }}>{r.w.split("-")[0]}</div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.15em", marginTop: 2 }}>
                  {r.dmg} DMG · {r.t}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 22 }}>
          <button className="btn" style={{ fontSize: 13 }}>COPY RESULT</button>
          <button className="btn btn-primary" style={{ fontSize: 13 }}>POST TO X</button>
          <button className="btn" style={{ fontSize: 13 }} onClick={() => onNav("match")}>REMATCH ▸</button>
        </div>

        {/* Footer signature */}
        <div style={{
          textAlign: "center",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--muted)",
          letterSpacing: "0.3em",
          paddingTop: 16,
          borderTop: "1px dashed var(--muted)",
        }}>
          ◣ SOLSHOT.GG · FILED 04:14Z · 20 APR 2026 ◣
        </div>

      </div>
      <Terrain variant={2} />
    </div>
  );
}

window.PostMatch = PostMatch;
