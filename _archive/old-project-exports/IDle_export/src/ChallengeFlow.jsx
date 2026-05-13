/* global React, Wordmark, Terrain, PixelTank */
const { useState: useStateCh, useEffect: useEffectCh } = React;

function ChallengeFlow({ onNav }) {
  const [format, setFormat] = useStateCh("BO3");
  const [callsign, setCallsign] = useStateCh("GRIZZLY-07");
  const [deployed, setDeployed] = useStateCh(false);
  const [copied, setCopied] = useStateCh(false);
  const [seed] = useStateCh("x9k2m");
  const link = `solshot.gg/c/${seed}`;

  const copy = () => {
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const FormatBtn = ({ id, label, rounds, best }) => (
    <button onClick={() => setFormat(id)}
      style={{
        flex: 1,
        background: format === id ? "var(--accent)" : "var(--bg-raised)",
        color: format === id ? "#0e1209" : "var(--bone)",
        border: "1px solid " + (format === id ? "var(--accent-hot)" : "var(--border)"),
        clipPath: "var(--clip-10)",
        padding: "16px 10px",
        cursor: "pointer",
        fontFamily: "var(--f-display)",
        letterSpacing: "0.08em",
        textAlign: "center",
      }}>
      <div style={{ fontSize: 22 }}>{id}</div>
      <div style={{ fontSize: 10, fontFamily: "var(--f-mono)", letterSpacing: "0.15em", opacity: 0.85, marginTop: 4 }}>
        {rounds} · {best}
      </div>
    </button>
  );

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)", padding: 0 }}>
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "32px 24px 200px", position: "relative", zIndex: 3 }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.2em", marginBottom: 20 }}>
          <button onClick={() => onNav("menu")} style={{ background: "transparent", border: "none", color: "var(--olive)", fontFamily: "var(--f-mono)", letterSpacing: "0.2em", cursor: "pointer", fontSize: 11 }}>
            ◂ RETURN TO MENU
          </button>
          <span>FORM 7-B · CHALLENGE ORDER</span>
          <span>TS {new Date().toISOString().slice(11,19)}Z</span>
        </div>

        <div className="briefing" style={{ marginBottom: 28 }}>
          <div className="stencil" style={{ fontSize: 36, color: "var(--bone)" }}>MISSION BRIEFING</div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 4 }}>
            SET TERMS · TRANSMIT LINK · AWAIT OPPONENT
          </div>
        </div>

        {/* COMBATANTS */}
        <div style={{ marginBottom: 26 }}>
          <div className="label" style={{ marginBottom: 10 }}>§01 · COMBATANTS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 14, alignItems: "center" }}>
            {/* You */}
            <div style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border)",
              clipPath: "var(--clip-10)",
              padding: "18px 16px",
              position: "relative",
            }}>
              <div className="label" style={{ color: "var(--accent)" }}>BLUE · YOU</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <PixelTank color="var(--accent)" size={48} />
                <input value={callsign} onChange={e => setCallsign(e.target.value.toUpperCase().slice(0,14))}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px dashed var(--muted)",
                    color: "var(--bone)",
                    fontFamily: "var(--f-display)",
                    fontSize: 22,
                    letterSpacing: "0.06em",
                    width: "100%",
                    padding: "4px 0",
                    outline: "none",
                  }} />
              </div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.2em", marginTop: 8 }}>
                W 42 · L 28 · RATE 60%
              </div>
            </div>

            {/* VS divider */}
            <div style={{ textAlign: "center", color: "var(--muted)" }}>
              <div className="stencil" style={{ fontSize: 28, color: "var(--accent)" }}>VS</div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: "0.2em" }}>1V1</div>
            </div>

            {/* Opponent slot */}
            <div style={{
              background: "transparent",
              border: "1px dashed var(--muted)",
              clipPath: "var(--clip-10)",
              padding: "18px 16px",
              position: "relative",
              minHeight: 100,
            }}>
              <div className="label">RED · AWAITING</div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
                <div style={{ width: 58, height: 36, border: "1px dashed var(--muted)", opacity: 0.5 }} />
                <div style={{ flex: 1 }}>
                  <div className="stencil" style={{ fontSize: 22, color: "var(--muted)" }}>
                    ——————— <span className="blink">_</span>
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.2em", marginTop: 8 }}>
                OPEN SLOT · JOIN VIA LINK
              </div>
            </div>
          </div>
        </div>

        {/* FORMAT */}
        <div style={{ marginBottom: 26 }}>
          <div className="label" style={{ marginBottom: 10 }}>§02 · MATCH FORMAT</div>
          <div style={{ display: "flex", gap: 12 }}>
            <FormatBtn id="BO1" rounds="1 ROUND" best="QUICK" />
            <FormatBtn id="BO3" rounds="BEST OF 3" best="STANDARD" />
            <FormatBtn id="BO5" rounds="BEST OF 5" best="EXTENDED" />
          </div>
        </div>

        {/* TERMS */}
        <div style={{ marginBottom: 26 }}>
          <div className="label" style={{ marginBottom: 10 }}>§03 · ENGAGEMENT TERMS</div>
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            clipPath: "var(--clip-10)",
            padding: "16px 20px",
          }}>
            <div className="kv"><span className="k">TERRAIN</span><span className="v">RANDOMIZED</span></div>
            <div className="kv"><span className="k">STARTING HP</span><span className="v">250</span></div>
            <div className="kv"><span className="k">GOLD BUDGET</span><span className="v">1,000G</span></div>
            <div className="kv"><span className="k">SHOP TIMER</span><span className="v">30 SEC</span></div>
            <div className="kv" style={{ borderBottom: "none" }}><span className="k">WAGER</span><span className="v" style={{ color: "var(--muted)" }}>NONE · PRACTICE</span></div>
          </div>
        </div>

        {/* LINK / DEPLOY */}
        {!deployed ? (
          <button
            className="btn btn-primary"
            onClick={() => setDeployed(true)}
            style={{ width: "100%", padding: "22px", fontSize: 24, letterSpacing: "0.08em" }}>
            <span>▶</span>
            <span>DEPLOY CHALLENGE</span>
          </button>
        ) : (
          <div>
            <div className="label" style={{ marginBottom: 10 }}>§04 · TRANSMISSION LINK</div>
            <div style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-hot)",
              clipPath: "var(--clip-10)",
              padding: "18px 20px",
              display: "flex", gap: 12, alignItems: "center",
              marginBottom: 14,
            }}>
              <span style={{ color: "var(--accent)", fontSize: 18 }}>▸</span>
              <div style={{ flex: 1, fontFamily: "var(--f-mono)", fontSize: 20, color: "var(--bone)", letterSpacing: "0.05em" }}>
                {link}
              </div>
              <button onClick={copy}
                style={{
                  background: copied ? "var(--accent-hot)" : "var(--accent)",
                  color: "#0e1209",
                  border: "none",
                  clipPath: "var(--clip-6)",
                  padding: "10px 18px",
                  fontFamily: "var(--f-display)",
                  letterSpacing: "0.1em",
                  cursor: "pointer",
                  fontSize: 13,
                }}>
                {copied ? "COPIED ✓" : "COPY LINK"}
              </button>
            </div>
            <div style={{
              display: "flex", gap: 10,
              fontFamily: "var(--f-mono)",
              fontSize: 11, letterSpacing: "0.15em",
              color: "var(--olive)",
              marginBottom: 22,
            }}>
              <button className="btn-ghost" style={{ flex: 1, padding: "10px", fontFamily: "var(--f-mono)", cursor: "pointer", clipPath: "var(--clip-6)" }}>
                ▸ SEND TO TELEGRAM
              </button>
              <button className="btn-ghost" style={{ flex: 1, padding: "10px", fontFamily: "var(--f-mono)", cursor: "pointer", clipPath: "var(--clip-6)" }}>
                ▸ POST TO X
              </button>
              <button className="btn-ghost" style={{ flex: 1, padding: "10px", fontFamily: "var(--f-mono)", cursor: "pointer", clipPath: "var(--clip-6)" }}>
                ▸ QR CODE
              </button>
            </div>

            <div style={{
              textAlign: "center",
              fontFamily: "var(--f-mono)",
              fontSize: 12,
              color: "var(--olive)",
              letterSpacing: "0.2em",
              padding: "20px 0",
              borderTop: "1px dashed var(--muted)",
              borderBottom: "1px dashed var(--muted)",
            }}>
              <span className="blink" style={{ color: "var(--accent)" }}>●</span>&nbsp;
              AWAITING OPPONENT · LINK EXPIRES IN 15:00
            </div>
          </div>
        )}

      </div>
      <Terrain variant={1} />
    </div>
  );
}

window.ChallengeFlow = ChallengeFlow;
