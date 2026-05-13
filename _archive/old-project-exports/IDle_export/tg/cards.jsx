/* global React, ReactDOM, DesignCanvas, DCSection, DCArtboard */

/* =====================================================================
   SOLSHOT TELEGRAM CHALLENGE CARDS — square 1080×1080, OPEN state
   Direct call-out: challenger names a specific opponent. Ego pressure.
   3 directions side-by-side; user picks one to take to production.
   ===================================================================== */

/* ── Sample data — same across all 3 cards for fair comparison ── */
const CHALLENGE = {
  challenger: {
    callsign: "GRIZZLY-07",
    rank: "MAJOR",
    record: "47W · 12L",
    winRate: 79,
    wallet: "7xKw...3FdQ",
  },
  opponent: {
    callsign: "VIPER-12",   // named directly — this is a CALL-OUT
    handle: "@viper12",
    rank: "CAPTAIN",
  },
  wager: { amount: 0.5, token: "SOL" },
  format: "BO3",
  matchId: "CH-#0A3F7",
  expiresIn: "24:00:00",
  shortUrl: "solshot.gg/c/0A3F7",
};

/* ── Shared palette (matches Trophy card lineage) ── */
const TG_C = {
  bgDeep:     "#0e1209",
  bgDeeper:   "#0a0d07",
  ink:        "#06080a",
  accent:     "#ff7a1a",
  accentDeep: "#c44d12",
  accentSoft: "#ffb05a",
  blood:      "#a83a1f",
  bone:       "#fff8e8",
  bonePale:   "#f4e7c8",
  olive:      "#c4a65d",
  oliveDim:   "rgba(196,166,93,0.55)",
  paper:      "#d9cfb4",
  paperInk:   "#1a1a14",
};
const TG_F = {
  display: "'Black Ops One', 'Arial Black', sans-serif",
  mono:    "'Share Tech Mono', 'Courier New', monospace",
};

/* =====================================================================
   DIRECTION A — DUEL POSTER
   Two callsigns slammed against a vertical "VS". Aggressive, symmetric.
   Reads instantly even at TG thumbnail size. Big wager bottom-center.
   ===================================================================== */
function CardDuel() {
  const W = 1080, H = 1080;
  return (
    <div style={{ width: W, height: H, position: "relative", background: TG_C.bgDeep, overflow: "hidden", fontFamily: TG_F.mono }}>
      {/* Grid bg + diagonal accent slabs */}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="duel-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(196,166,93,0.06)" strokeWidth="1" />
          </pattern>
          <linearGradient id="duel-blade-l" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={TG_C.accent} />
            <stop offset="100%" stopColor={TG_C.accentDeep} />
          </linearGradient>
          <linearGradient id="duel-blade-r" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={TG_C.blood} />
            <stop offset="100%" stopColor="#5a1e0a" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#duel-grid)" />
        {/* Left blade (challenger) */}
        <polygon points={`0,0 ${W*0.5 - 20},0 ${W*0.5 - 60},${H} 0,${H}`} fill="url(#duel-blade-l)" opacity="0.92" />
        {/* Right blade (opponent) — drained, dark */}
        <polygon points={`${W*0.5 + 20},0 ${W},0 ${W},${H} ${W*0.5 + 60},${H}`} fill="url(#duel-blade-r)" opacity="0.78" />
      </svg>

      {/* Scanlines */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 3px)" }} />

      {/* TOP BAR: brand left, status right */}
      <div style={{ position: "absolute", left: 56, right: 56, top: 36, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: TG_F.display, fontSize: 40, color: TG_C.bone, letterSpacing: "0.08em" }}>
          SOL<span style={{ color: TG_C.accentSoft }}>SHOT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(10,13,7,0.7)", border: "1px solid rgba(255,176,90,0.5)", padding: "6px 14px" }}>
          <span style={{ width: 8, height: 8, background: TG_C.accentSoft, borderRadius: "50%", boxShadow: `0 0 10px ${TG_C.accentSoft}` }} />
          <span style={{ fontSize: 14, letterSpacing: "0.3em", color: TG_C.bonePale }}>OPEN CHALLENGE</span>
        </div>
      </div>

      {/* HEADLINE */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 110, textAlign: "center" }}>
        <div style={{ fontSize: 16, letterSpacing: "0.5em", color: "rgba(255,248,232,0.6)" }}>
          ━━━ DIRECT CALL-OUT ━━━
        </div>
      </div>

      {/* TWO CALLSIGNS + VS */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 200, display: "grid", gridTemplateColumns: "1fr 160px 1fr", alignItems: "center", padding: "0 30px", gap: 0 }}>
        {/* Challenger (left) */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: "0.4em", color: "rgba(255,248,232,0.7)", marginBottom: 10 }}>CHALLENGER</div>
          <DuelAvatar text="G7" tone="hot" />
          <div style={{ fontFamily: TG_F.display, fontSize: 52, color: TG_C.bone, lineHeight: 0.95, letterSpacing: "0.02em", marginTop: 18, textShadow: "0 4px 0 rgba(0,0,0,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px" }}>
            {CHALLENGE.challenger.callsign}
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.3em", color: TG_C.accentSoft, marginTop: 8 }}>
            {CHALLENGE.challenger.rank}
          </div>
          <div style={{ fontSize: 12, letterSpacing: "0.25em", color: "rgba(255,248,232,0.6)", marginTop: 4 }}>
            {CHALLENGE.challenger.record} · {CHALLENGE.challenger.winRate}% WR
          </div>
        </div>

        {/* VS */}
        <div style={{ textAlign: "center", position: "relative" }}>
          <div style={{
            fontFamily: TG_F.display, fontSize: 160, color: TG_C.bone,
            lineHeight: 0.85, letterSpacing: "-0.02em",
            textShadow: `0 0 40px ${TG_C.accent}, 4px 4px 0 ${TG_C.ink}`,
            transform: "rotate(-3deg)",
          }}>VS</div>
        </div>

        {/* Opponent (right) */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: "0.4em", color: "rgba(255,248,232,0.7)", marginBottom: 10 }}>SUMMONED</div>
          <DuelAvatar text="V12" tone="cold" />
          <div style={{ fontFamily: TG_F.display, fontSize: 52, color: TG_C.bone, lineHeight: 0.95, letterSpacing: "0.02em", marginTop: 18, textShadow: "0 4px 0 rgba(0,0,0,0.4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 4px" }}>
            {CHALLENGE.opponent.callsign}
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.3em", color: TG_C.bonePale, marginTop: 8 }}>
            {CHALLENGE.opponent.handle}
          </div>
          <div style={{ fontSize: 12, letterSpacing: "0.25em", color: "rgba(255,248,232,0.6)", marginTop: 4 }}>
            DECLINE = COWARD
          </div>
        </div>
      </div>

      {/* TERMS BAR — wager + format */}
      <div style={{ position: "absolute", left: 56, right: 56, bottom: 168,
        background: TG_C.ink, border: `2px solid ${TG_C.accentSoft}`,
        clipPath: "polygon(16px 0%, 100% 0%, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0% 100%, 0% 16px)",
        display: "grid", gridTemplateColumns: "1fr 1fr", padding: "20px 28px",
      }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", color: TG_C.olive, marginBottom: 4 }}>WAGER</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 56, color: TG_C.accentSoft, lineHeight: 1, textShadow: `0 0 20px rgba(255,176,90,0.4)` }}>
            {CHALLENGE.wager.amount} <span style={{ color: TG_C.bone, fontSize: 32 }}>{CHALLENGE.wager.token}</span>
          </div>
        </div>
        <div style={{ borderLeft: `1px solid rgba(196,166,93,0.3)`, paddingLeft: 28 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", color: TG_C.olive, marginBottom: 4 }}>FORMAT</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 56, color: TG_C.bone, lineHeight: 1 }}>
            {CHALLENGE.format} <span style={{ fontSize: 22, color: TG_C.olive, letterSpacing: "0.1em" }}>· FIRST TO 2</span>
          </div>
        </div>
      </div>

      {/* BOTTOM CTA STRIP */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 100,
        background: TG_C.bgDeeper, borderTop: `2px solid ${TG_C.accentSoft}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 56px",
      }}>
        <div>
          <div style={{ fontFamily: TG_F.display, fontSize: 24, color: TG_C.accentSoft, letterSpacing: "0.15em" }}>
            ▸ ACCEPT NOW
          </div>
          <div style={{ fontSize: 14, letterSpacing: "0.3em", color: TG_C.olive, marginTop: 2 }}>
            {CHALLENGE.shortUrl}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", color: TG_C.olive }}>EXPIRES IN</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 28, color: TG_C.bone, letterSpacing: "0.05em" }}>
            {CHALLENGE.expiresIn}
          </div>
        </div>
      </div>

      {/* Match ID corner stamp */}
      <div style={{ position: "absolute", left: 56, top: 86, fontSize: 11, letterSpacing: "0.3em", color: "rgba(196,166,93,0.6)" }}>
        {CHALLENGE.matchId}
      </div>
    </div>
  );
}

function DuelAvatar({ text, tone }) {
  const accent = tone === "hot" ? TG_C.accentSoft : TG_C.bonePale;
  return (
    <div style={{
      width: 140, height: 140, margin: "0 auto",
      background: TG_C.ink,
      border: `4px solid ${accent}`,
      clipPath: "polygon(18px 0%, 100% 0%, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0% 100%, 0% 18px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: tone === "hot" ? `0 0 30px rgba(255,176,90,0.4)` : "none",
    }}>
      <span style={{ fontFamily: TG_F.display, fontSize: 56, color: accent, letterSpacing: "0.05em" }}>{text}</span>
    </div>
  );
}

/* =====================================================================
   DIRECTION B — WANTED POSTER
   Bounty / call-out poster. Manila/aged paper, big stencil typography,
   "DEAD OR ALIVE" energy applied to artillery duels. More playful-aggressive.
   ===================================================================== */
function CardWanted() {
  const W = 1080, H = 1080;
  return (
    <div style={{ width: W, height: H, position: "relative", background: TG_C.paper, overflow: "hidden", fontFamily: TG_F.mono, color: TG_C.paperInk }}>
      {/* Aged paper texture */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: `
          repeating-linear-gradient(0deg, rgba(60,40,20,0.04) 0px, rgba(60,40,20,0.04) 1px, transparent 1px, transparent 3px),
          radial-gradient(ellipse at 15% 8%, rgba(120,90,40,0.22), transparent 55%),
          radial-gradient(ellipse at 88% 92%, rgba(80,60,30,0.28), transparent 60%),
          radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(60,40,20,0.18) 100%)
        `,
        mixBlendMode: "multiply",
      }} />

      {/* Torn-edge top */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 14, background: TG_C.paperInk,
        clipPath: "polygon(0% 0%, 3% 100%, 6% 20%, 11% 100%, 15% 30%, 20% 100%, 25% 10%, 30% 100%, 36% 20%, 42% 100%, 48% 0%, 54% 100%, 60% 30%, 66% 100%, 72% 10%, 78% 100%, 84% 20%, 90% 100%, 96% 0%, 100% 100%, 100% 0%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 14, background: TG_C.paperInk,
        clipPath: "polygon(0% 100%, 3% 0%, 6% 80%, 11% 0%, 15% 70%, 20% 0%, 25% 90%, 30% 0%, 36% 80%, 42% 0%, 48% 100%, 54% 0%, 60% 70%, 66% 0%, 72% 90%, 78% 0%, 84% 80%, 90% 0%, 96% 100%, 100% 0%, 100% 100%)" }} />

      {/* Top metadata */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 50, display: "flex", justifyContent: "space-between", fontSize: 14, letterSpacing: "0.3em", color: "rgba(26,26,20,0.6)" }}>
        <span>BOUNTY NO. {CHALLENGE.matchId}</span>
        <span>SOLSHOT · OPEN CHALLENGE</span>
        <span>EXPIRES {CHALLENGE.expiresIn}</span>
      </div>

      {/* HEADLINE */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 100, textAlign: "center" }}>
        <div style={{ fontFamily: TG_F.display, fontSize: 130, color: TG_C.paperInk, lineHeight: 0.85, letterSpacing: "0.02em" }}>
          WANTED
        </div>
        <div style={{ fontSize: 18, letterSpacing: "0.6em", color: "rgba(26,26,20,0.7)", marginTop: 6 }}>
          ━━━ FOR ARTILLERY DUEL ━━━
        </div>
      </div>

      {/* OPPONENT mugshot/name - the main hero */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 290, textAlign: "center" }}>
        <div style={{
          width: 280, height: 280, margin: "0 auto",
          background: TG_C.ink,
          border: `6px solid ${TG_C.paperInk}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          boxShadow: "8px 8px 0 rgba(26,26,20,0.25)",
        }}>
          {/* Crosshair overlay */}
          <svg width="280" height="280" style={{ position: "absolute", inset: 0 }} viewBox="0 0 280 280">
            <circle cx="140" cy="140" r="100" fill="none" stroke={TG_C.blood} strokeWidth="3" strokeDasharray="6 6" opacity="0.9"/>
            <line x1="140" y1="20" x2="140" y2="80" stroke={TG_C.blood} strokeWidth="3"/>
            <line x1="140" y1="200" x2="140" y2="260" stroke={TG_C.blood} strokeWidth="3"/>
            <line x1="20" y1="140" x2="80" y2="140" stroke={TG_C.blood} strokeWidth="3"/>
            <line x1="200" y1="140" x2="260" y2="140" stroke={TG_C.blood} strokeWidth="3"/>
          </svg>
          <span style={{ fontFamily: TG_F.display, fontSize: 100, color: TG_C.bonePale, letterSpacing: "0.04em", position: "relative", zIndex: 2 }}>V12</span>
        </div>

        <div style={{ fontFamily: TG_F.display, fontSize: 72, color: TG_C.paperInk, lineHeight: 0.9, letterSpacing: "0.04em", marginTop: 28, textShadow: "3px 3px 0 rgba(168,58,31,0.3)" }}>
          {CHALLENGE.opponent.callsign}
        </div>
        <div style={{ fontSize: 16, letterSpacing: "0.4em", color: "rgba(26,26,20,0.7)", marginTop: 6 }}>
          ALIAS · {CHALLENGE.opponent.handle}
        </div>
      </div>

      {/* REWARD/BOUNTY */}
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 184, textAlign: "center" }}>
        <div style={{ fontSize: 18, letterSpacing: "0.5em", color: "rgba(26,26,20,0.7)" }}>━━ FOR THE REWARD OF ━━</div>
        <div style={{ fontFamily: TG_F.display, fontSize: 110, color: TG_C.blood, lineHeight: 1, letterSpacing: "0.02em", marginTop: 4, textShadow: `4px 4px 0 rgba(26,26,20,0.18)` }}>
          {CHALLENGE.wager.amount} <span style={{ color: TG_C.paperInk }}>{CHALLENGE.wager.token}</span>
        </div>
        <div style={{ fontSize: 14, letterSpacing: "0.35em", color: "rgba(26,26,20,0.6)", marginTop: 4 }}>
          {CHALLENGE.format} · WINNER TAKES ALL
        </div>
      </div>

      {/* BOTTOM stamp + signature */}
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", color: "rgba(26,26,20,0.55)" }}>ISSUED BY</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 26, color: TG_C.paperInk, letterSpacing: "0.04em", marginTop: 2 }}>
            {CHALLENGE.challenger.callsign}
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", color: "rgba(26,26,20,0.55)", marginTop: 2 }}>
            {CHALLENGE.challenger.rank} · {CHALLENGE.challenger.record}
          </div>
        </div>
        {/* Round red stamp */}
        <div style={{
          border: `5px solid ${TG_C.blood}`,
          color: TG_C.blood,
          padding: "12px 20px",
          fontFamily: TG_F.display,
          fontSize: 22, letterSpacing: "0.1em",
          transform: "rotate(-7deg)",
          opacity: 0.92,
        }}>
          OPEN<br/>CHALLENGE
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: TG_F.display, fontSize: 24, color: TG_C.paperInk, letterSpacing: "0.12em" }}>
            SOL<span style={{ color: TG_C.blood }}>SHOT</span>.GG
          </div>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", color: "rgba(26,26,20,0.55)", marginTop: 2 }}>
            {CHALLENGE.shortUrl}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   DIRECTION C — TRANSMISSION
   Intercepted signal / radio dispatch. Broadcast format. Ego-bait via
   "ON-AIR" framing — the call-out is being WITNESSED. Public humiliation.
   ===================================================================== */
function CardTransmission() {
  const W = 1080, H = 1080;
  return (
    <div style={{ width: W, height: H, position: "relative", background: TG_C.bgDeeper, overflow: "hidden", fontFamily: TG_F.mono, color: TG_C.bone }}>
      {/* Heavy CRT scanlines */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "repeating-linear-gradient(0deg, rgba(196,166,93,0.06) 0px, rgba(196,166,93,0.06) 1px, transparent 1px, transparent 3px)" }} />
      {/* Vignette */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)" }} />
      {/* Subtle grid */}
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, opacity: 0.4 }}>
        <defs>
          <pattern id="tx-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,122,26,0.08)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#tx-grid)" />
      </svg>

      {/* TOP STATUS BAR — broadcast chrome */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 76,
        background: "rgba(255,122,26,0.08)", borderBottom: `2px solid ${TG_C.accent}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 40px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ width: 14, height: 14, background: TG_C.accent, borderRadius: "50%", boxShadow: `0 0 16px ${TG_C.accent}`, animation: "tg-blink 1.2s step-end infinite" }} />
          <span style={{ fontFamily: TG_F.display, fontSize: 28, color: TG_C.bone, letterSpacing: "0.12em" }}>
            ● ON-AIR
          </span>
          <span style={{ fontSize: 12, letterSpacing: "0.3em", color: "rgba(196,166,93,0.7)" }}>· INTERCEPTED TRANSMISSION ·</span>
        </div>
        <div style={{ fontSize: 12, letterSpacing: "0.3em", color: "rgba(196,166,93,0.7)" }}>
          FREQ {CHALLENGE.matchId} · {CHALLENGE.expiresIn} REMAINING
        </div>
      </div>

      {/* CHALLENGER strip (sender) */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 124,
        display: "grid", gridTemplateColumns: "100px 1fr", gap: 24, alignItems: "center",
        padding: "16px 20px",
        background: "rgba(255,122,26,0.06)",
        border: `1px solid rgba(255,122,26,0.35)`,
        borderLeft: `4px solid ${TG_C.accent}`,
      }}>
        <div style={{
          width: 100, height: 100,
          background: TG_C.bgDeep, border: `3px solid ${TG_C.accentSoft}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: TG_F.display, fontSize: 36, color: TG_C.accentSoft,
          clipPath: "polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)",
        }}>G7</div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.4em", color: TG_C.accent, marginBottom: 4 }}>━ FROM · CHALLENGER ━</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 48, color: TG_C.bone, lineHeight: 0.95, letterSpacing: "0.02em" }}>
            {CHALLENGE.challenger.callsign}
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.25em", color: "rgba(196,166,93,0.7)", marginTop: 6 }}>
            {CHALLENGE.challenger.rank} · {CHALLENGE.challenger.record} · WR {CHALLENGE.challenger.winRate}%
          </div>
        </div>
      </div>

      {/* MESSAGE — the call-out */}
      <div style={{ position: "absolute", left: 60, right: 60, top: 296,
        background: TG_C.bgDeep,
        border: `1px solid rgba(196,166,93,0.3)`,
        padding: "32px 36px",
        fontFamily: TG_F.mono,
      }}>
        <div style={{ fontSize: 12, letterSpacing: "0.4em", color: TG_C.olive, marginBottom: 16 }}>
          ▸ TRANSMISSION BEGINS
        </div>
        <div style={{ fontSize: 26, lineHeight: 1.45, letterSpacing: "0.04em", color: TG_C.bone }}>
          <span style={{ color: TG_C.accentSoft, fontFamily: TG_F.display, fontSize: 32, letterSpacing: "0.06em" }}>{CHALLENGE.opponent.callsign}</span>{" "}
          — I'M CALLING YOU OUT.<br/>
          <span style={{ color: TG_C.olive }}>NO RUNNING. NO REMATCH ALIBIS.</span><br/>
          ONE FIGHT. <span style={{ color: TG_C.accentSoft, fontFamily: TG_F.display, fontSize: 32 }}>{CHALLENGE.wager.amount} {CHALLENGE.wager.token}</span> ON THE TABLE.
        </div>
        <div style={{ fontSize: 12, letterSpacing: "0.4em", color: TG_C.olive, marginTop: 16, textAlign: "right" }}>
          ▸ TRANSMISSION ENDS · SIGNED {CHALLENGE.challenger.callsign}
        </div>
      </div>

      {/* TARGET strip (recipient) — drained, awaiting */}
      <div style={{ position: "absolute", left: 60, right: 60, bottom: 220,
        display: "grid", gridTemplateColumns: "100px 1fr 200px", gap: 24, alignItems: "center",
        padding: "16px 20px",
        background: "rgba(168,58,31,0.08)",
        border: `1px solid rgba(168,58,31,0.4)`,
        borderLeft: `4px solid ${TG_C.blood}`,
      }}>
        <div style={{
          width: 100, height: 100,
          background: TG_C.bgDeep, border: `3px solid rgba(255,248,232,0.4)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: TG_F.display, fontSize: 36, color: "rgba(255,248,232,0.7)",
          clipPath: "polygon(12px 0%, 100% 0%, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0% 100%, 0% 12px)",
        }}>V12</div>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.4em", color: TG_C.blood, marginBottom: 4 }}>━ TO · TARGET ━</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 48, color: TG_C.bone, lineHeight: 0.95, letterSpacing: "0.02em" }}>
            {CHALLENGE.opponent.callsign}
          </div>
          <div style={{ fontSize: 13, letterSpacing: "0.25em", color: "rgba(255,248,232,0.55)", marginTop: 6 }}>
            {CHALLENGE.opponent.handle} · AWAITING RESPONSE
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgba(255,248,232,0.55)" }}>STATUS</div>
          <div style={{ fontFamily: TG_F.display, fontSize: 22, color: TG_C.blood, letterSpacing: "0.08em" }}>
            ● UNANSWERED
          </div>
        </div>
      </div>

      {/* BOTTOM — terms + CTA */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 156,
        borderTop: `2px solid ${TG_C.accent}`,
        background: "rgba(10,13,7,0.96)",
        display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 60px",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: TG_C.olive }}>WAGER</div>
            <div style={{ fontFamily: TG_F.display, fontSize: 38, color: TG_C.accentSoft, lineHeight: 1, marginTop: 2 }}>
              {CHALLENGE.wager.amount} {CHALLENGE.wager.token}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: TG_C.olive }}>FORMAT</div>
            <div style={{ fontFamily: TG_F.display, fontSize: 38, color: TG_C.bone, lineHeight: 1, marginTop: 2 }}>
              {CHALLENGE.format}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", color: TG_C.olive }}>RESPOND VIA</div>
            <div style={{ fontFamily: TG_F.display, fontSize: 22, color: TG_C.accentSoft, letterSpacing: "0.12em", lineHeight: 1, marginTop: 2 }}>
              SOL<span style={{ color: TG_C.bone }}>SHOT</span>.GG
            </div>
            <div style={{ fontSize: 11, letterSpacing: "0.25em", color: TG_C.olive, marginTop: 2 }}>
              /c/{CHALLENGE.matchId.replace("CH-#","")}
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes tg-blink { 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}

/* =====================================================================
   PAGE — design canvas with three artboards
   ===================================================================== */
function App() {
  return (
    <DesignCanvas>
      <DCSection id="open-challenge" title="OPEN CHALLENGE — direct call-out, square 1080×1080">
        <DCArtboard id="duel" label="A · DUEL POSTER" width={1080} height={1080}>
          <CardDuel />
        </DCArtboard>
        <DCArtboard id="wanted" label="B · WANTED POSTER" width={1080} height={1080}>
          <CardWanted />
        </DCArtboard>
        <DCArtboard id="transmission" label="C · TRANSMISSION" width={1080} height={1080}>
          <CardTransmission />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
