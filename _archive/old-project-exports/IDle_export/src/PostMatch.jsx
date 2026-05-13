/* global React, Wordmark, Terrain, PixelTank */
const { useState: useStateAAR } = React;

/* ─────────────────────────────────────────────────────────────
   SHAREABLE POST-MATCH CARD — Twitter-optimised (1200×675 → 16:9-ish)
   Three variants. Pick via the radio in the toolbar above the card.
   ───────────────────────────────────────────────────────────── */

function ShareCard({ variant, winner, loser, matchId, terrain, duration }) {
  // Common scale: card is rendered at design-px 1080×608 then CSS-scaled to fit.
  const W = 1080, H = 608;

  if (variant === "trophy") return <ShareTrophy w={W} h={H} winner={winner} loser={loser} matchId={matchId} terrain={terrain} duration={duration} />;
  if (variant === "ticker") return <ShareTicker w={W} h={H} winner={winner} loser={loser} matchId={matchId} terrain={terrain} duration={duration} />;
  return <ShareDossier w={W} h={H} winner={winner} loser={loser} matchId={matchId} terrain={terrain} duration={duration} />;
}

/* ── VARIANT A: DOSSIER ──
   Manila folder / declassified file. Big stencil callsign, overstamp.
   Hero is IDENTITY + RESULT. Stats are an afterthought. Most "human". */
function ShareDossier({ w, h, winner, loser, matchId, terrain, duration }) {
  return (
    <div style={{
      width: w, height: h, position: "relative",
      background: "#d9cfb4",
      color: "#1a1a14",
      fontFamily: "var(--f-mono)",
      overflow: "hidden",
    }}>
      {/* Paper texture via repeating gradients */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          repeating-linear-gradient(0deg, rgba(60,40,20,0.04) 0px, rgba(60,40,20,0.04) 1px, transparent 1px, transparent 3px),
          radial-gradient(ellipse at 20% 10%, rgba(120,90,40,0.18), transparent 50%),
          radial-gradient(ellipse at 90% 90%, rgba(80,60,30,0.22), transparent 60%)
        `,
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }} />
      {/* Punch holes */}
      <div style={{ position: "absolute", left: 26, top: 90, width: 14, height: 14, borderRadius: "50%", background: "#1a1a14", opacity: 0.5 }} />
      <div style={{ position: "absolute", left: 26, top: h - 104, width: 14, height: 14, borderRadius: "50%", background: "#1a1a14", opacity: 0.5 }} />

      {/* Top metadata strip */}
      <div style={{ position: "absolute", left: 70, right: 36, top: 28, display: "flex", justifyContent: "space-between", fontSize: 14, letterSpacing: "0.3em", color: "rgba(26,26,20,0.6)" }}>
        <span>FILE NO. {matchId}</span>
        <span>SOLSHOT · OPS DIVISION</span>
        <span>EYES ONLY</span>
      </div>

      {/* CONFIRMED KILL stamp */}
      <div style={{
        position: "absolute", right: 56, top: 76,
        border: "5px solid #a83a1f",
        color: "#a83a1f",
        padding: "10px 22px",
        fontFamily: "var(--f-display)",
        fontSize: 30,
        letterSpacing: "0.08em",
        transform: "rotate(-9deg)",
        opacity: 0.92,
        boxShadow: "inset 0 0 0 2px #a83a1f",
      }}>
        ★ CONFIRMED KILL ★
      </div>

      {/* Big VICTOR identity block */}
      <div style={{ position: "absolute", left: 70, top: 130, right: 36 }}>
        <div style={{ fontSize: 18, letterSpacing: "0.4em", color: "rgba(26,26,20,0.55)", marginBottom: 6 }}>
          OPERATIVE · VICTOR
        </div>
        <div style={{
          fontFamily: "var(--f-display)",
          fontSize: 132,
          lineHeight: 0.85,
          color: "#1a1a14",
          letterSpacing: "0.02em",
          textShadow: "2px 2px 0 rgba(0,0,0,0.08)",
        }}>
          {winner.callsign}
        </div>
        <div style={{ fontSize: 16, letterSpacing: "0.3em", color: "rgba(26,26,20,0.6)", marginTop: 14 }}>
          DEFEATED · <span style={{ color: "#1a1a14", fontWeight: 700 }}>{loser.callsign}</span> · BO3 · FINAL <span style={{ color: "#a83a1f", fontWeight: 700 }}>2 — 1</span>
        </div>
      </div>

      {/* Tank sketch panel */}
      <div style={{
        position: "absolute", right: 60, top: 320,
        width: 280, height: 150,
        background: "rgba(255,253,245,0.5)",
        border: "1px dashed rgba(26,26,20,0.4)",
        padding: 12,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(26,26,20,0.6)" }}>FIG. 1 — VICTOR'S RIG</div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <PixelTank color="#a83a1f" size={72} />
        </div>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", color: "rgba(26,26,20,0.6)", textAlign: "right" }}>
          TERRAIN · {terrain}
        </div>
      </div>

      {/* Stat rows — hand-typed feeling */}
      <div style={{ position: "absolute", left: 70, top: 340, width: 540 }}>
        <DossierStat label="DAMAGE DEALT" v={winner.damage} unit=" HP" />
        <DossierStat label="ACCURACY" v={winner.accuracy} unit=" %" />
        <DossierStat label="SIGNATURE WEAPON" v={winner.best} />
        <DossierStat label="ENGAGEMENT TIME" v={duration} />
      </div>

      {/* Footer */}
      <div style={{ position: "absolute", left: 70, right: 36, bottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontFamily: "var(--f-display)", fontSize: 28, letterSpacing: "0.12em", color: "#1a1a14" }}>
            SOL<span style={{ color: "#a83a1f" }}>SHOT</span>.GG
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(26,26,20,0.55)", marginTop: 2 }}>
            ARTILLERY COMBAT · ON-CHAIN
          </div>
        </div>
        <div style={{ fontSize: 12, letterSpacing: "0.25em", color: "rgba(26,26,20,0.55)", textAlign: "right" }}>
          FILED 04:14Z · 20 APR 2026<br/>
          AUTH: J. COLLINS · OPS-3
        </div>
      </div>
    </div>
  );
}

function DossierStat({ label, v, unit = "" }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", justifyContent: "space-between",
      padding: "10px 0",
      borderBottom: "1px dashed rgba(26,26,20,0.35)",
    }}>
      <div style={{ fontSize: 13, letterSpacing: "0.3em", color: "rgba(26,26,20,0.7)" }}>{label}</div>
      <div style={{ fontFamily: "var(--f-display)", fontSize: 30, color: "#1a1a14", letterSpacing: "0.04em" }}>
        {v}<span style={{ color: "#a83a1f" }}>{unit}</span>
      </div>
    </div>
  );
}

/* ── VARIANT B: TROPHY ──
   Bold, cinematic. Fills the frame with a big winner portrait.
   Optimised for retweet stop-power. */
function ShareTrophy({ w, h, winner, loser, matchId, terrain, duration }) {
  return (
    <div style={{
      width: w, height: h, position: "relative",
      background: "#0e1209",
      overflow: "hidden",
    }}>
      {/* Diagonal split background */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid-trophy" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(196,166,93,0.08)" strokeWidth="1" />
          </pattern>
          <linearGradient id="orange-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff7a1a" />
            <stop offset="100%" stopColor="#c44d12" />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill="url(#grid-trophy)" />
        {/* Big diagonal blade of accent */}
        <polygon points={`0,${h} 0,${h * 0.55} ${w * 0.62},0 ${w},0 ${w},${h * 0.18} ${w * 0.42},${h}`} fill="url(#orange-grad)" opacity="0.95" />
        {/* Subtle scanlines */}
        <rect width={w} height={h} fill="url(#scan-trophy)" />
      </svg>
      {/* Scanlines via CSS */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)",
        pointerEvents: "none",
      }} />

      {/* Top bar */}
      <div style={{ position: "absolute", left: 56, right: 56, top: 32, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--f-display)", fontSize: 32, color: "#f4e7c8", letterSpacing: "0.08em" }}>
          SOL<span style={{ color: "#ffb05a" }}>SHOT</span>
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, letterSpacing: "0.35em", color: "rgba(244,231,200,0.6)" }}>
          MATCH · {matchId}
        </div>
      </div>

      {/* W badge */}
      <div style={{
        position: "absolute", left: 56, top: 110,
        width: 200, height: 200,
        background: "#0e1209",
        border: "4px solid #ffb05a",
        clipPath: "polygon(20px 0%, 100% 0%, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0% 100%, 0% 20px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
        gap: 8,
      }}>
        <div style={{ fontFamily: "var(--f-display)", fontSize: 140, color: "#ffb05a", lineHeight: 0.8, textShadow: "0 0 30px rgba(255,176,90,0.5)" }}>W</div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "#f4e7c8", letterSpacing: "0.3em", opacity: 0.7 }}>VICTORY</div>
      </div>

      {/* Callsign + score */}
      <div style={{ position: "absolute", left: 290, top: 130, right: 56 }}>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 14, letterSpacing: "0.4em", color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
          OPERATIVE
        </div>
        <div style={{
          fontFamily: "var(--f-display)",
          fontSize: 110,
          lineHeight: 0.9,
          color: "#fff8e8",
          letterSpacing: "0.02em",
          textShadow: "0 4px 0 rgba(0,0,0,0.4)",
        }}>
          {winner.callsign}
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 16, color: "rgba(255,255,255,0.85)", letterSpacing: "0.25em", marginTop: 12 }}>
          DEFEATED <span style={{ color: "#fff8e8", fontWeight: 700 }}>{loser.callsign}</span>
          <span style={{ margin: "0 14px", opacity: 0.4 }}>|</span>
          <span style={{ fontFamily: "var(--f-display)", fontSize: 28, color: "#0e1209", background: "#fff8e8", padding: "2px 12px" }}>2 – 1</span>
        </div>
      </div>

      {/* Bottom: 3 hero stats */}
      <div style={{ position: "absolute", left: 56, right: 56, bottom: 88, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <TrophyStat label="DMG DEALT" v={winner.damage} sub="HP" />
        <TrophyStat label="ACCURACY" v={winner.accuracy + "%"} sub={`${winner.shots} SHOTS`} />
        <TrophyStat label="MVP WEAPON" v={winner.best} sub="SIGNATURE" />
      </div>

      {/* Bottom strip */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: 56,
        background: "#0a0d07",
        borderTop: "2px solid #ffb05a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 56px",
      }}>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "#c4a65d", letterSpacing: "0.3em" }}>
          SOLSHOT.GG · ARTILLERY COMBAT ON SOLANA
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 13, color: "rgba(196,166,93,0.6)", letterSpacing: "0.3em" }}>
          ▸ TERRAIN {terrain} · {duration}
        </div>
      </div>
    </div>
  );
}

function TrophyStat({ label, v, sub }) {
  return (
    <div style={{
      background: "rgba(10,13,7,0.78)",
      border: "1px solid rgba(255,176,90,0.4)",
      clipPath: "polygon(10px 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%, 0% 10px)",
      padding: "16px 20px",
      backdropFilter: "blur(2px)",
    }}>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "#c4a65d", letterSpacing: "0.3em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--f-display)", fontSize: 48, color: "#fff8e8", lineHeight: 0.95, letterSpacing: "0.02em" }}>
        {v}
      </div>
      <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "rgba(244,231,200,0.5)", letterSpacing: "0.25em", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

/* ── VARIANT C: TICKER ──
   Bloomberg / live broadcast style. Horizontal data-rich layout.
   For the data-head crowd. */
function ShareTicker({ w, h, winner, loser, matchId, terrain, duration }) {
  return (
    <div style={{
      width: w, height: h, position: "relative",
      background: "#0a0e07",
      overflow: "hidden",
      fontFamily: "var(--f-mono)",
      color: "#c4a65d",
    }}>
      {/* Subtle CRT scanline */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(0deg, rgba(196,166,93,0.04) 0px, rgba(196,166,93,0.04) 1px, transparent 1px, transparent 3px)",
        pointerEvents: "none",
      }} />

      {/* Header bar */}
      <div style={{
        height: 50,
        borderBottom: "2px solid #ff7a1a",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        background: "rgba(255,122,26,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "var(--f-display)", fontSize: 22, color: "#fff8e8", letterSpacing: "0.1em" }}>
            SOL<span style={{ color: "#ff7a1a" }}>SHOT</span>
          </span>
          <span style={{ fontSize: 11, letterSpacing: "0.35em", color: "rgba(196,166,93,0.7)" }}>· LIVE FEED ·</span>
        </div>
        <div style={{ display: "flex", gap: 28, fontSize: 12, letterSpacing: "0.25em" }}>
          <span><span style={{ opacity: 0.5 }}>MATCH</span> {matchId}</span>
          <span><span style={{ opacity: 0.5 }}>TERRAIN</span> {terrain}</span>
          <span><span style={{ opacity: 0.5 }}>DURATION</span> {duration}</span>
        </div>
      </div>

      {/* Result megaphone — winner row + loser row */}
      <div style={{ padding: "32px 40px 0" }}>
        {/* Winner row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 220px",
          alignItems: "center",
          gap: 20,
          padding: "14px 0",
          borderBottom: "1px solid rgba(196,166,93,0.2)",
        }}>
          <div style={{
            background: "#ff7a1a", color: "#0a0e07",
            fontFamily: "var(--f-display)", fontSize: 38,
            textAlign: "center", lineHeight: 1,
            padding: "6px 0",
          }}>W</div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#ff7a1a", marginBottom: 4 }}>VICTOR · BLUE TEAM</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 64, color: "#fff8e8", lineHeight: 0.9, letterSpacing: "0.02em" }}>
              {winner.callsign}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(196,166,93,0.6)", marginBottom: 2 }}>FINAL</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 80, color: "#ff7a1a", lineHeight: 0.85 }}>2–1</div>
          </div>
        </div>

        {/* Loser row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr 220px",
          alignItems: "center",
          gap: 20,
          padding: "12px 0",
          opacity: 0.5,
        }}>
          <div style={{
            background: "transparent", color: "#c4a65d",
            border: "2px solid #c4a65d",
            fontFamily: "var(--f-display)", fontSize: 32,
            textAlign: "center", lineHeight: 1,
            padding: "5px 0",
          }}>L</div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(196,166,93,0.7)", marginBottom: 2 }}>DEFEATED · RED TEAM</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 40, color: "#c4a65d", lineHeight: 0.95 }}>
              {loser.callsign}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, letterSpacing: "0.25em", color: "rgba(196,166,93,0.6)" }}>
            {loser.damage} DMG · {loser.accuracy}%
          </div>
        </div>
      </div>

      {/* Stat ticker grid */}
      <div style={{ position: "absolute", left: 40, right: 40, bottom: 80, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        {[
          { l: "DMG DEALT", v: winner.damage, d: "+128", sub: "vs OPP" },
          { l: "ACCURACY", v: winner.accuracy + "%", d: "+16", sub: "vs OPP" },
          { l: "SHOTS", v: winner.shots, d: "↑↑", sub: `${winner.hp} HP LEFT` },
          { l: "MVP", v: winner.best, d: "★", sub: "SIG WEAPON" },
        ].map((s, i) => (
          <div key={i} style={{
            padding: "16px 20px",
            borderRight: i < 3 ? "1px solid rgba(196,166,93,0.2)" : "none",
            borderTop: "1px solid rgba(196,166,93,0.2)",
            borderBottom: "1px solid rgba(196,166,93,0.2)",
            background: i % 2 === 0 ? "rgba(196,166,93,0.03)" : "transparent",
          }}>
            <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "rgba(196,166,93,0.65)", marginBottom: 6 }}>
              {s.l}
            </div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 32, color: "#fff8e8", lineHeight: 1 }}>
              {s.v}
            </div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", color: "#ff7a1a", marginTop: 4 }}>
              ▲ {s.d} <span style={{ color: "rgba(196,166,93,0.5)" }}>· {s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom ticker tape */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: 36,
        background: "#ff7a1a",
        color: "#0a0e07",
        display: "flex", alignItems: "center",
        fontSize: 12, letterSpacing: "0.35em", fontWeight: 700,
        padding: "0 24px",
        whiteSpace: "nowrap",
        gap: 28,
      }}>
        <span>● SOLSHOT.GG</span>
        <span>·</span>
        <span>▸ ARTILLERY COMBAT ON SOLANA</span>
        <span>·</span>
        <span>▸ CHALLENGE {winner.callsign} → SOLSHOT.GG/CH/{matchId}</span>
        <span>·</span>
        <span>● LIVE</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   POST MATCH PAGE
   ───────────────────────────────────────────────────────────── */

function PostMatch({ onNav }) {
  const [variant, setVariant] = useStateAAR("dossier");
  const [showShare, setShowShare] = useStateAAR(false);
  const stageRef = React.useRef(null);
  const [stageW, setStageW] = useStateAAR(936);
  React.useEffect(() => {
    if (!stageRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setStageW(w);
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);
  const cardScale = stageW / 1080;
  const stageH = stageW * (608 / 1080);

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

  const matchId = "M-#0A3F7";
  const terrain = "VOLCANIC";
  const duration = "08:42";

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
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 24px 140px", position: "relative", zIndex: 3 }}>

        {/* Stamp header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.2em" }}>
          <span>DOC 14-C · DECLASSIFIED</span>
          <span style={{ color: "var(--accent)", border: "2px solid var(--accent)", padding: "2px 8px", transform: "rotate(-2deg)", fontFamily: "var(--f-display)", fontSize: 12 }}>
            ★ CONFIRMED KILL ★
          </span>
          <span>{matchId}</span>
        </div>

        <div className="briefing" style={{ marginBottom: 6 }}>
          <div className="stencil" style={{ fontSize: 38, color: "var(--bone)" }}>AFTER ACTION REPORT</div>
        </div>
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--olive)", letterSpacing: "0.2em", marginBottom: 26 }}>
          MATCH · BO3 · TERRAIN VOLCANIC · DURATION {duration}
        </div>

        {/* ─────────── SHAREABLE CARD HERO ─────────── */}
        <div style={{ marginBottom: 22 }}>
          {/* Toolbar above card */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderBottom: "none",
            clipPath: "polygon(10px 0%, 100% 0%, 100% 100%, 0% 100%, 0% 10px)",
            padding: "12px 16px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.25em" }}>
                ▸ SHAREABLE CARD
              </span>
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.2em" }}>
                · 1200×675 · TWITTER OPTIMAL
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { id: "dossier", label: "DOSSIER" },
                { id: "trophy",  label: "TROPHY"  },
                { id: "ticker",  label: "TICKER"  },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setVariant(v.id)}
                  style={{
                    fontFamily: "var(--f-mono)",
                    fontSize: 10,
                    letterSpacing: "0.25em",
                    padding: "6px 12px",
                    border: "1px solid " + (variant === v.id ? "var(--accent)" : "var(--border)"),
                    background: variant === v.id ? "var(--accent)" : "transparent",
                    color: variant === v.id ? "#0e1209" : "var(--olive)",
                    cursor: "pointer",
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Card stage with proper aspect — scales card to fit 992px wide */}
          <div style={{
            background: "#06080a",
            border: "1px solid var(--border)",
            borderTop: "none",
            padding: 28,
            display: "flex", justifyContent: "center", alignItems: "center",
            backgroundImage: `
              linear-gradient(45deg, rgba(255,255,255,0.015) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.015) 75%),
              linear-gradient(45deg, rgba(255,255,255,0.015) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.015) 75%)
            `,
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 8px 8px",
          }}>
            <div ref={stageRef} style={{
              width: "100%",
              maxWidth: 936,
              height: stageH,
              position: "relative",
              boxShadow: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,166,93,0.2)",
              overflow: "hidden",
            }}>
              <div style={{
                width: 1080,
                height: 608,
                transformOrigin: "top left",
                transform: `scale(${cardScale})`,
              }}>
                <ShareCard variant={variant} winner={winner} loser={loser} matchId={matchId} terrain={terrain} duration={duration} />
              </div>
            </div>
          </div>

          {/* Action row */}
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderTop: "none",
            clipPath: "polygon(0% 0%, 100% 0%, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0% 100%)",
            padding: "12px 16px",
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8,
          }}>
            <button className="btn" style={{ fontSize: 11 }}>⬇ DOWNLOAD PNG</button>
            <button className="btn" style={{ fontSize: 11 }}>⎘ COPY IMAGE</button>
            <button className="btn btn-primary" style={{ fontSize: 11 }}>𝕏 POST TO X</button>
            <button className="btn" style={{ fontSize: 11 }}>🔗 SHARE LINK</button>
          </div>
        </div>

        {/* ─────────── DETAILED REPORT (collapsible feel) ─────────── */}
        <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--olive)", letterSpacing: "0.3em", marginBottom: 10 }}>
          ▾ FULL DEBRIEF
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

          <StatBar label="DMG DEALT" a={winner.damage} b={loser.damage} max={900} />
          <StatBar label="ACCURACY" a={winner.accuracy} b={loser.accuracy} max={100} unit="%" />
          <StatBar label="HP REMAINING" a={winner.hp} b={loser.hp} max={250} />
          <StatBar label="SHOTS FIRED" a={winner.shots} b={loser.shots} max={30} />

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

        {/* Bottom actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 22 }}>
          <button className="btn" style={{ fontSize: 13 }} onClick={() => onNav("menu")}>◂ HOME</button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => onNav("match")}>REMATCH ▸</button>
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
