/* global React, Terrain, PixelTank, ScreenHeader */
const { useState: useStateBar } = React;
const _barAsset = (p) => (window.asset ? window.asset(p) : p);

function CornerBrackets({ color = "var(--accent)", size = 18, inset = 8 }) {
  const S = size, I = inset;
  return (
    <>
      <svg width={S} height={S} style={{ position: "absolute", top: I, left: I }}>
        <path d={`M0 ${S} L0 0 L${S} 0`} stroke={color} strokeWidth="2" fill="none" />
      </svg>
      <svg width={S} height={S} style={{ position: "absolute", top: I, right: I }}>
        <path d={`M0 0 L${S} 0 L${S} ${S}`} stroke={color} strokeWidth="2" fill="none" />
      </svg>
      <svg width={S} height={S} style={{ position: "absolute", bottom: I, left: I }}>
        <path d={`M0 0 L0 ${S} L${S} ${S}`} stroke={color} strokeWidth="2" fill="none" />
      </svg>
      <svg width={S} height={S} style={{ position: "absolute", bottom: I, right: I }}>
        <path d={`M${S} 0 L${S} ${S} L0 ${S}`} stroke={color} strokeWidth="2" fill="none" />
      </svg>
    </>
  );
}

function StatCard({ data }) {
  const hasData = data.matches > 0;
  const card = {
    position: "relative", background: "linear-gradient(180deg, #141c0d 0%, #0e1308 100%)",
    border: "1px solid var(--border)", padding: "28px 32px 24px", overflow: "hidden",
  };
  return (
    <div style={card}>
      <CornerBrackets color="var(--accent)" />
      <div style={{
        pointerEvents: "none", position: "absolute", inset: 0,
        backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0,0,0,0.18) 2px 3px)",
        opacity: 0.5,
      }} />
      <div style={{ position: "absolute", top: 0, left: 32, right: 32, height: 1, background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 32, right: 32, height: 1, background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }} />

      <div style={{ position: "relative", zIndex: 2 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <div className="stencil" style={{ fontSize: 20, color: "var(--accent)", letterSpacing: "0.08em" }}>SOLSHOT.GG</div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--olive)", letterSpacing: "0.2em", marginTop: 2 }}>
              {data.mode} // SEASON ZERO
            </div>
          </div>
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em", textAlign: "right" }}>
            <div>FILE · #{data.fileId}</div>
            <div style={{ color: "var(--muted)", marginTop: 2 }}>{data.timestamp}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: 24, alignItems: "start" }}>
          {/* Left — identity */}
          <div>
            <div className="label" style={{ color: "var(--olive)" }}>// CALLSIGN</div>
            <div className="stencil" style={{ fontSize: 68, color: "var(--bone)", lineHeight: 0.95, marginTop: 4, marginBottom: 14, textShadow: "0 0 24px rgba(200,184,122,0.15)" }}>
              {data.callsign}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ border: "1px solid var(--border)", padding: "8px 12px", clipPath: "var(--clip-6)", background: "rgba(0,0,0,0.25)" }}>
                <div className="label" style={{ fontSize: 9, color: "var(--olive)" }}>SIGNATURE WEAPON</div>
                <div className="stencil" style={{ fontSize: 16, color: hasData ? "var(--bone)" : "var(--muted)", marginTop: 2 }}>
                  {hasData ? data.sigWeapon : "CLASSIFIED"}
                </div>
              </div>
              <div style={{ border: "1px solid var(--border)", padding: "8px 12px", clipPath: "var(--clip-6)", background: "rgba(0,0,0,0.25)" }}>
                <div className="label" style={{ fontSize: 9, color: "var(--olive)" }}>RANK</div>
                <div className="stencil" style={{ fontSize: 16, color: hasData ? "var(--bone)" : "var(--muted)", marginTop: 2 }}>
                  {hasData ? data.rank : "RECRUIT"}
                </div>
              </div>
            </div>

            {/* Win rate hero */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div className="label" style={{ fontSize: 11, color: "var(--olive)" }}>WIN RATE</div>
              <div className="stencil" style={{ fontSize: 56, color: "var(--accent)", lineHeight: 0.9, textShadow: "0 0 20px rgba(218,138,40,0.35)" }}>
                {hasData ? `${data.winRate}` : "—"}<span style={{ fontSize: 32, color: "var(--accent-hot)", marginLeft: 4 }}>%</span>
              </div>
            </div>
          </div>

          {/* Right — reticle + QR */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            {/* QR */}
            <div style={{ width: 88, height: 88, background: "var(--bone)", padding: 6, position: "relative" }}>
              <svg viewBox="0 0 20 20" width="100%" height="100%" style={{ imageRendering: "pixelated" }}>
                {[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[1,0],[1,6],[2,0],[2,2],[2,3],[2,4],[2,6],[3,0],[3,2],[3,3],[3,4],[3,6],[4,0],[4,2],[4,3],[4,4],[4,6],[5,0],[5,6],[6,0],[6,1],[6,2],[6,3],[6,4],[6,5],[6,6],
                  [13,0],[13,1],[13,2],[13,3],[13,4],[13,5],[13,6],[14,0],[14,6],[15,0],[15,2],[15,3],[15,4],[15,6],[16,0],[16,2],[16,3],[16,4],[16,6],[17,0],[17,2],[17,3],[17,4],[17,6],[18,0],[18,6],[19,0],[19,1],[19,2],[19,3],[19,4],[19,5],[19,6],
                  [0,13],[0,14],[0,15],[0,16],[0,17],[0,18],[0,19],[1,13],[1,19],[2,13],[2,15],[2,16],[2,17],[2,19],[3,13],[3,15],[3,16],[3,17],[3,19],[4,13],[4,15],[4,16],[4,17],[4,19],[5,13],[5,19],[6,13],[6,14],[6,15],[6,16],[6,17],[6,18],[6,19],
                  [8,2],[9,4],[8,6],[10,8],[12,9],[9,11],[11,13],[8,14],[13,10],[15,9],[17,11],[9,16],[11,17],[14,13],[16,15],[18,13],[8,8],[10,10],[12,12],[11,8],[13,14],[15,11],[17,14],[9,9],[8,10],[10,11]
                ].map(([x,y],i) => <rect key={i} x={x} y={y} width="1" height="1" fill="#0e1209" />)}
              </svg>
            </div>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--olive)", letterSpacing: "0.2em" }}>SCAN TO DEPLOY</div>

            {/* Badge */}
            <div style={{ position: "relative", width: 130, height: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              {hasData ? (
                <>
                  <img src={_barAsset(`assets/badge-${data.badge}.png`)} alt={data.rank} style={{ width: 118, height: 118, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }} />
                  <div className="stencil" style={{ fontSize: 12, color: "var(--accent)", letterSpacing: "0.2em" }}>
                    {data.badge.toUpperCase()}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 118, height: 118, border: "2px dashed var(--muted)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.2em", textAlign: "center", lineHeight: 1.3 }}>
                    NO<br/>RANK
                  </div>
                  <div className="stencil" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.2em" }}>UNRANKED</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "repeating-linear-gradient(90deg, var(--muted) 0 6px, transparent 6px 10px)", margin: "22px 0 18px" }} />

        {/* Stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {[
            ["DMG",    hasData ? data.dmg : "—"],
            ["W · L",  hasData ? `${data.wins}·${data.losses}` : "—"],
            ["BEST",   hasData ? data.best : "—"],
            ["STREAK", hasData ? `${data.streak}W` : "—"],
          ].map(([k,v]) => (
            <div key={k} style={{ textAlign: "center" }}>
              <div className="stencil" style={{ fontSize: 32, color: hasData ? "var(--bone)" : "var(--muted)", lineHeight: 1 }}>{v}</div>
              <div className="label" style={{ color: "var(--olive)", marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em" }}>
          <span>WAGER PROTOCOL · {hasData ? `${data.wagered} SOL` : "LOCKED"}</span>
          <span>{data.matches} MATCHES · solshot.gg</span>
        </div>
      </div>
    </div>
  );
}

function Barracks({ onNav }) {
  const [tab, setTab] = useStateBar("stats");
  const [profile, setProfile] = useStateBar("filled"); // "empty" | "filled"

  const emptyData = {
    callsign: "OPERATIVE", mode: "PRACTICE MODE", fileId: "000-0000",
    timestamp: "NO ENGAGEMENTS", matches: 0,
    sigWeapon: null, rank: null, winRate: 0, wins: 0, losses: 0,
    dmg: 0, best: 0, streak: 0, wagered: 0, clearance: null, badge: null,
  };
  const filledData = {
    callsign: "GRIZZLY-07", mode: "RANKED", fileId: "00A-3F7",
    timestamp: "LAST SEEN 02:41 UTC", matches: 70,
    sigWeapon: "CRAZY IVAN", rank: "SERGEANT", winRate: 60, wins: 42, losses: 28,
    dmg: "48.2K", best: "1.28K", streak: 5, wagered: "12.4", clearance: "LVL 3", badge: "gold",
  };
  const data = profile === "empty" ? emptyData : filledData;

  const leaderboard = [
    { rk: 1, cs: "VIPER-12",   w: 184, l: 32,  d: "142K", rt: "85%" },
    { rk: 2, cs: "HOUND-04",   w: 156, l: 48,  d: "128K", rt: "76%" },
    { rk: 3, cs: "SHADOW-22",  w: 142, l: 61,  d: "118K", rt: "70%" },
    { rk: 4, cs: "RAVEN-77",   w: 128, l: 52,  d: "108K", rt: "71%" },
    { rk: 5, cs: "PIVOT-09",   w: 119, l: 58,  d: "102K", rt: "67%" },
    { rk: 6, cs: "GRIZZLY-07", w:  42, l: 28,  d:  "48K", rt: "60%", me: true },
    { rk: 7, cs: "JACKAL-15",  w:  38, l: 30,  d:  "41K", rt: "55%" },
    { rk: 8, cs: "HUSK-03",    w:  32, l: 34,  d:  "36K", rt: "48%" },
  ];
  const matches = [
    { r: "W", vs: "VIPER-12",  s: "2-1", w: "CRAZY IVAN", dmg: 742, t: "2h AGO",  wgr: "+0.09 SOL" },
    { r: "W", vs: "HOUND-04",  s: "3-0", w: "NAPALM",     dmg: 828, t: "YDAY",    wgr: "+0.27 SOL" },
    { r: "L", vs: "SHADOW-22", s: "1-3", w: "HEATSEEKER", dmg: 512, t: "YDAY",    wgr: "−0.25 SOL" },
    { r: "W", vs: "BOT · L6",  s: "3-2", w: "PINEAPPLE",  dmg: 694, t: "2D",      wgr: "PRACTICE" },
    { r: "L", vs: "PIVOT-09",  s: "0-2", w: "SNIPER",     dmg: 320, t: "3D",      wgr: "−0.10 SOL" },
    { r: "W", vs: "RAVEN-77",  s: "3-1", w: "JACKHAMMER", dmg: 780, t: "4D",      wgr: "+0.09 SOL" },
  ];

  return (
    <div style={{ position: "relative", minHeight: "calc(100vh - 44px)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px", position: "relative", zIndex: 3 }}>
        <ScreenHeader
          title="BARRACKS"
          subtitle="PROFILE · COMBAT RECORD · LEADERBOARD"
          onBack={() => onNav("menu")}
          rightExtras={
            <div style={{ display: "flex", gap: 4, marginLeft: 10 }}>
              {["empty","filled"].map(p => (
                <button key={p} onClick={() => setProfile(p)} style={{
                  padding: "4px 8px",
                  background: profile === p ? "var(--bg-raised)" : "transparent",
                  color: profile === p ? "var(--accent)" : "var(--muted)",
                  border: "1px dashed " + (profile === p ? "var(--accent)" : "var(--muted)"),
                  fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.15em", cursor: "pointer",
                }}>{p === "empty" ? "NEW" : "VETERAN"}</button>
              ))}
            </div>
          }
        />

        {/* Tabs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
          {[["stats","COMBAT RECORD"],["leaderboard","LEADERBOARD"]].map(([id,lbl]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: "12px 0", background: "transparent",
              color: tab === id ? "var(--accent)" : "var(--olive)",
              border: "none",
              borderBottom: "2px solid " + (tab === id ? "var(--accent)" : "transparent"),
              fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: "0.15em",
              cursor: "pointer",
            }}>{lbl}</button>
          ))}
        </div>

        {tab === "stats" ? (
          <>
            <StatCard data={data} />

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <button style={{
                padding: "14px", background: "var(--accent)", color: "#0e1209",
                border: "1px solid var(--accent-hot)", clipPath: "var(--clip-6)",
                fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: "0.15em", cursor: "pointer",
              }}>EXPORT CARD</button>
              <button style={{
                padding: "14px", background: "transparent", color: "var(--accent)",
                border: "1px solid var(--accent)", clipPath: "var(--clip-6)",
                fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: "0.15em", cursor: "pointer",
              }}>POST TO X</button>
            </div>

            {profile === "filled" && (
              <>
                <div className="label" style={{ color: "var(--accent)", marginTop: 30, marginBottom: 10 }}>RECENT ENGAGEMENTS</div>
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", clipPath: "var(--clip-10)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 60px 130px 70px 110px", padding: "10px 16px", fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em", borderBottom: "1px dashed var(--muted)" }}>
                    <span>R</span><span>OPPONENT</span><span>SCORE</span><span>BEST WEAPON</span><span style={{ textAlign: "right" }}>DMG</span><span style={{ textAlign: "right" }}>WAGER</span>
                  </div>
                  {matches.map((m,i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "32px 1fr 60px 130px 70px 110px",
                      padding: "10px 16px",
                      borderBottom: i < matches.length - 1 ? "1px dashed var(--muted)" : "none",
                      alignItems: "center", fontFamily: "var(--f-mono)", fontSize: 12,
                    }}>
                      <span className="stencil" style={{ color: m.r === "W" ? "var(--accent)" : "var(--muted)", fontSize: 16 }}>{m.r}</span>
                      <span style={{ color: "var(--bone)" }}>{m.vs}</span>
                      <span style={{ color: "var(--bone)" }}>{m.s}</span>
                      <span style={{ color: "var(--olive)" }}>{m.w}</span>
                      <span style={{ color: "var(--olive)", textAlign: "right" }}>{m.dmg}</span>
                      <span style={{ textAlign: "right", color: m.wgr.startsWith("+") ? "#7fd060" : m.wgr.startsWith("−") ? "#c86060" : "var(--muted)", letterSpacing: "0.1em" }}>{m.wgr}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {profile === "empty" && (
              <div style={{ textAlign: "center", marginTop: 24, padding: "20px", fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: "0.2em" }}>
                PLAY YOUR FIRST MATCH TO BUILD YOUR RECORD
              </div>
            )}
          </>
        ) : (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", clipPath: "var(--clip-10)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 60px 60px 80px 70px", padding: "12px 20px", fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--olive)", letterSpacing: "0.2em", borderBottom: "1px dashed var(--muted)" }}>
              <span>#</span><span>CALLSIGN</span><span style={{ textAlign: "right" }}>W</span><span style={{ textAlign: "right" }}>L</span><span style={{ textAlign: "right" }}>DMG</span><span style={{ textAlign: "right" }}>RATE</span>
            </div>
            {leaderboard.map((r,i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "40px 1fr 60px 60px 80px 70px",
                padding: "12px 20px",
                borderBottom: i < leaderboard.length - 1 ? "1px dashed var(--muted)" : "none",
                background: r.me ? "rgba(218,138,40,0.08)" : "transparent",
                alignItems: "center", fontFamily: "var(--f-mono)", fontSize: 13,
              }}>
                <span className="stencil" style={{ color: r.rk <= 3 ? "var(--accent)" : "var(--muted)", fontSize: 14 }}>{String(r.rk).padStart(2,"0")}</span>
                <span style={{ color: r.me ? "var(--accent)" : "var(--bone)", letterSpacing: "0.1em" }}>{r.cs}{r.me ? " ← YOU" : ""}</span>
                <span style={{ textAlign: "right", color: "var(--bone)" }}>{r.w}</span>
                <span style={{ textAlign: "right", color: "var(--muted)" }}>{r.l}</span>
                <span style={{ textAlign: "right", color: "var(--olive)" }}>{r.d}</span>
                <span style={{ textAlign: "right", color: "var(--accent)" }}>{r.rt}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <Terrain variant={0} />
    </div>
  );
}

window.Barracks = Barracks;
