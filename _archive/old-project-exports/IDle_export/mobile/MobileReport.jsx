/* global React, PhoneFrame, StatusBar, MobileChrome, MobileOverlays, ScanBtn */
// Mobile After Action Report — direct port of web PostMatch to landscape

const WINNER = { callsign: "GRIZZLY-07", color: "var(--accent)", damage: 742, accuracy: 68, best: "CRAZY IVAN", shots: 22, hp: 84 };
const LOSER  = { callsign: "VIPER-12",   color: "var(--olive)",  damage: 614, accuracy: 52, best: "HEATSEEKER", shots: 20, hp: 0 };

function StatBar({ label, a, b, max, unit = "" }) {
  const pctA = Math.min(100, (a / max) * 100);
  const pctB = Math.min(100, (b / max) * 100);
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.15em", marginBottom: 2 }}>
        <span style={{ color: "var(--accent)" }}>{a}{unit}</span>
        <span>{label}</span>
        <span>{b}{unit}</span>
      </div>
      <div style={{ display: "flex", gap: 3, height: 6 }}>
        <div style={{ flex: 1, background: "var(--bg-deep)", border: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: `${pctA}%`, background: "var(--accent)" }} />
        </div>
        <div style={{ flex: 1, background: "var(--bg-deep)", border: "1px solid var(--border)" }}>
          <div style={{ width: `${pctB}%`, background: "var(--olive)" }} />
        </div>
      </div>
    </div>
  );
}

function MobileReport() {
  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />

      {/* Stamp strip header — DOC · CONFIRMED KILL · M# */}
      <div style={{
        position: "absolute", top: 22, left: 52, right: 22, zIndex: 10,
        display: "grid", gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.2em",
      }}>
        <span style={{ justifySelf: "start" }}>DOC 14-C · DECLASSIFIED</span>
        <span style={{
          color: "var(--accent)", border: "2px solid var(--accent)",
          padding: "2px 8px", transform: "rotate(-2deg)",
          fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.15em",
        }}>★ CONFIRMED KILL ★</span>
        <span style={{ justifySelf: "end" }}>M-#0A3F7</span>
      </div>

      {/* TITLE + subtitle */}
      <div style={{
        position: "absolute", top: 42, left: 52, right: 22, zIndex: 10,
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <div className="stencil" style={{ fontSize: 18, color: "var(--bone)", letterSpacing: "0.12em", lineHeight: 1 }}>
          AFTER ACTION REPORT
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--olive)", letterSpacing: "0.2em" }}>
          BO3 · VOLCANIC · 08:42
        </div>
      </div>

      {/* BODY: 2 columns — left (winner strip + stat bars) | right (combatants + rounds + actions) */}
      <div style={{
        position: "absolute", top: 66, left: 52, right: 22, bottom: 26, zIndex: 5,
        display: "grid", gridTemplateColumns: "1fr 230px", gap: 12,
      }}>
        {/* LEFT COL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {/* Winner strip */}
          <div style={{
            background: "var(--accent)", clipPath: "var(--clip-10)",
            padding: "10px 14px",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 36, color: "#0e1209", lineHeight: 0.8 }}>W</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "#0e1209", opacity: 0.7, letterSpacing: "0.2em" }}>VICTOR</div>
              <div className="stencil" style={{ fontSize: 18, color: "#0e1209", letterSpacing: "0.04em", lineHeight: 1 }}>{WINNER.callsign}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "#0e1209", opacity: 0.7, letterSpacing: "0.2em" }}>FINAL</div>
              <div className="stencil" style={{ fontSize: 22, color: "#0e1209", lineHeight: 1 }}>2 – 1</div>
            </div>
          </div>

          {/* Stat bars */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            clipPath: "var(--clip-10)", padding: "10px 12px",
          }}>
            <StatBar label="DMG DEALT"    a={WINNER.damage}   b={LOSER.damage}   max={900} />
            <StatBar label="ACCURACY"     a={WINNER.accuracy} b={LOSER.accuracy} max={100} unit="%" />
            <StatBar label="HP REMAINING" a={WINNER.hp}       b={LOSER.hp}       max={250} />
            <StatBar label="SHOTS FIRED"  a={WINNER.shots}    b={LOSER.shots}    max={30} />
          </div>
        </div>

        {/* RIGHT COL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Combatants */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            clipPath: "var(--clip-6)", padding: "7px 9px",
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
          }}>
            {[WINNER, LOSER].map((p, i) => (
              <div key={i} style={{ textAlign: i === 0 ? "left" : "right" }}>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>
                  {i === 0 ? "BLUE" : "RED"}
                </div>
                <div className="stencil" style={{ fontSize: 12, color: p.color, letterSpacing: "0.08em", lineHeight: 1, marginTop: 2 }}>
                  {p.callsign}
                </div>
                <div style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--muted)", letterSpacing: "0.18em", marginTop: 3 }}>
                  BEST · <span style={{ color: "var(--bone)" }}>{p.best}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Round breakdown */}
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            clipPath: "var(--clip-6)", padding: "6px 8px",
          }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.25em", marginBottom: 4 }}>ROUND-BY-ROUND</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { r: 1, w: "GRIZZLY-07", dmg: 250, t: "04:12" },
                { r: 2, w: "VIPER-12",   dmg: 250, t: "02:08" },
                { r: 3, w: "GRIZZLY-07", dmg: 208, t: "02:22" },
              ].map(r => {
                const win = r.w === WINNER.callsign;
                return (
                  <div key={r.r} style={{
                    flex: 1,
                    background: "var(--bg-raised)",
                    border: "1px solid " + (win ? "var(--accent)" : "var(--border)"),
                    clipPath: "var(--clip-6)",
                    padding: "4px 2px", textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>R{r.r}</div>
                    <div className="stencil" style={{ fontSize: 9, color: win ? "var(--accent)" : "var(--olive)", lineHeight: 1, marginTop: 1 }}>
                      {r.w.split("-")[0]}
                    </div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--muted)", letterSpacing: "0.12em", marginTop: 2 }}>
                      {r.dmg}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <button style={btnSecondary}>COPY</button>
            <button style={btnSecondary}>POST TO X</button>
          </div>
          <ScanBtn height={38} fontSize={13}>REMATCH ▸</ScanBtn>
          <button style={{ ...btnSecondary, padding: "6px" }}>◂ MENU</button>

          {/* Signature footer */}
          <div style={{
            textAlign: "center",
            fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--muted)",
            letterSpacing: "0.3em", marginTop: "auto",
            paddingTop: 4, borderTop: "1px dashed var(--muted)",
          }}>
            ◣ SOLSHOT.GG · FILED 04:14Z ◣
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

const btnSecondary = {
  padding: "6px 4px",
  background: "var(--bg-raised)", color: "var(--bone)",
  border: "1px solid var(--border)", clipPath: "var(--clip-6)",
  fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.18em",
  cursor: "pointer",
};

Object.assign(window, { MobileReport });
