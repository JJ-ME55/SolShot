/* global React, PhoneFrame, StatusBar, MobileOverlays */
// Mobile Match HUD — landscape, thumb sliders (L=angle, R=power), tank battle center

function MobileMatch() {
  const [angle, setAngle] = React.useState(58);
  const [power, setPower] = React.useState(72);
  const [hp] = React.useState([85, 62]);
  const [round] = React.useState(3);
  const [wind] = React.useState({ dir: 1, speed: 12 });

  return (
    <PhoneFrame>
      <StatusBar />
      <MobileOverlays />

      {/* Sky gradient */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "linear-gradient(to bottom, #1a1e10 0%, #0e1209 60%)",
      }} />

      {/* Distant terrain silhouette */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 220, zIndex: 1 }}>
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 800 220">
          <path d="M0,220 L0,140 L80,135 L160,128 L240,140 L320,120 L400,108 L480,118 L560,102 L640,112 L720,100 L800,110 L800,220 Z"
                fill="#0a0f06" opacity="0.6" />
          <path d="M0,220 L0,170 L60,168 L120,172 L180,162 L240,170 L300,160 L360,168 L420,155 L480,168 L540,158 L600,166 L660,156 L720,164 L800,158 L800,220 Z"
                fill="var(--bg-surface)" stroke="var(--olive)" strokeWidth="0.5" opacity="0.85" />
          <path d="M0,220 L0,200 L100,198 L200,202 L300,196 L400,200 L500,194 L600,198 L700,192 L800,196 L800,220 Z"
                fill="var(--bg-raised)" opacity="0.95" />
        </svg>
      </div>

      {/* TOP STRIP: HP bars + round + wind */}
      <div style={{
        position: "absolute", top: 14, left: 50, right: 32, zIndex: 10,
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 10,
      }}>
        {/* Player 1 (you) */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--f-sec)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.1em" }}>KillDotEm</span>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--bone)" }}>{hp[0]}/100</span>
          </div>
          <HPBar value={hp[0]} color="var(--accent)" />
        </div>

        {/* Center: round + pot + wind */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "3px 10px",
          background: "var(--bg-raised)", border: "1px solid var(--border)",
          clipPath: "var(--clip-6)",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>ROUND</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 12, color: "var(--bone)", letterSpacing: "0.15em" }}>{round}/5</div>
          </div>
          <div style={{ width: 1, height: 18, background: "var(--border)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>POT</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 12, color: "var(--accent)", letterSpacing: "0.1em" }}>0.5</div>
          </div>
          <div style={{ width: 1, height: 18, background: "var(--border)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.2em" }}>WIND</div>
            <div style={{ fontFamily: "var(--f-display)", fontSize: 10, color: "var(--bone)", letterSpacing: "0.1em" }}>
              {wind.dir > 0 ? "▸" : "◂"} {wind.speed}
            </div>
          </div>
        </div>

        {/* Player 2 (opponent) */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--bone)" }}>{hp[1]}/100</span>
            <span style={{ fontFamily: "var(--f-sec)", fontSize: 10, color: "#a83a1a", letterSpacing: "0.1em" }}>WOLFX</span>
          </div>
          <HPBar value={hp[1]} color="#a83a1a" align="right" />
        </div>
      </div>

      {/* CENTER: tanks on terrain */}
      {/* Player tank (left) */}
      <div style={{ position: "absolute", bottom: 80, left: 120, zIndex: 5 }}>
        <div style={{ position: "relative", width: 80, height: 40 }}>
          <img src="assets/tank-tinted.png"
            style={{ position: "absolute", bottom: 0, left: 0, width: 70, imageRendering: "pixelated", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.7))" }} alt="" />
          <img src="assets/tank-turret-tinted.png"
            style={{ position: "absolute", bottom: 24, left: 6, width: 58, transform: `rotate(${-angle}deg)`, transformOrigin: "22% 70%", imageRendering: "pixelated" }} alt="" />
        </div>
      </div>

      {/* Trajectory arc (dotted) */}
      <svg style={{ position: "absolute", bottom: 90, left: 120, width: 600, height: 180, zIndex: 4, pointerEvents: "none" }}
           viewBox="0 0 600 180" preserveAspectRatio="none">
        <path d={arcPath(angle, power)} fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.6" />
      </svg>

      {/* Opponent tank (right) */}
      <div style={{ position: "absolute", bottom: 80, right: 120, zIndex: 5 }}>
        <div style={{ position: "relative", width: 80, height: 40, transform: "scaleX(-1)" }}>
          <img src="assets/tank-tinted.png"
            style={{ position: "absolute", bottom: 0, left: 0, width: 70, imageRendering: "pixelated", filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.7)) hue-rotate(-25deg) saturate(1.2)" }} alt="" />
          <img src="assets/tank-turret-tinted.png"
            style={{ position: "absolute", bottom: 24, left: 6, width: 58, transform: "rotate(-40deg)", transformOrigin: "22% 70%", imageRendering: "pixelated", filter: "hue-rotate(-25deg) saturate(1.2)" }} alt="" />
        </div>
      </div>

      {/* LEFT THUMB SLIDER: ANGLE */}
      <ThumbSlider
        label="ANGLE"
        side="left"
        value={angle}
        onChange={setAngle}
        min={0}
        max={90}
        unit="°"
        color="var(--accent)"
      />

      {/* RIGHT THUMB SLIDER: POWER */}
      <ThumbSlider
        label="POWER"
        side="right"
        value={power}
        onChange={setPower}
        min={0}
        max={100}
        unit="%"
        color="var(--bone)"
      />

      {/* BOTTOM CENTER: weapon picker + fire button — above home bar */}
      <div style={{
        position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 10,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {/* Weapon carousel (prev/current/next) */}
        <button style={weaponNavBtn}>◂</button>
        <div style={{
          padding: "4px 10px",
          background: "var(--bg-raised)", border: "1px solid var(--accent)",
          clipPath: "var(--clip-6)",
          display: "flex", flexDirection: "column", alignItems: "center",
          minWidth: 110,
        }}>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 6, color: "var(--olive)", letterSpacing: "0.25em" }}>WEAPON 2/4</span>
          <span className="stencil" style={{ fontSize: 14, color: "var(--accent)", letterSpacing: "0.15em", lineHeight: 1 }}>BIG SHOT</span>
          <span style={{ fontFamily: "var(--f-mono)", fontSize: 7, color: "var(--bone)", letterSpacing: "0.2em", marginTop: 2 }}>×3 · DMG 45</span>
        </div>
        <button style={weaponNavBtn}>▸</button>

        {/* Fire button */}
        <button style={{
          marginLeft: 6,
          width: 62, height: 44,
          background: "var(--accent)", color: "#0e1209",
          border: "2px solid var(--accent-hot)",
          clipPath: "var(--clip-6)",
          fontFamily: "var(--f-display)", fontSize: 14, letterSpacing: "0.2em",
          cursor: "pointer", boxShadow: "0 0 16px rgba(218,138,40,0.5)",
        }}>FIRE</button>
      </div>

      {/* Turn indicator banner */}
      <div style={{
        position: "absolute", top: 44, left: "50%", transform: "translateX(-50%)",
        fontFamily: "var(--f-mono)", fontSize: 8, color: "var(--accent)",
        letterSpacing: "0.3em", zIndex: 9,
      }}>
        <span className="blink">●</span> YOUR TURN · 0:12
      </div>
    </PhoneFrame>
  );
}

// ── HP bar ────────────────────────────────────────
function HPBar({ value, color, align = "left" }) {
  return (
    <div style={{
      position: "relative", height: 7,
      background: "var(--bg-raised)", border: "1px solid var(--border)",
      clipPath: "polygon(0 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 3px 100%, 0 calc(100% - 3px))",
    }}>
      <div style={{
        position: "absolute",
        ...(align === "right" ? { right: 0 } : { left: 0 }),
        top: 0, bottom: 0,
        width: value + "%",
        background: color,
      }} />
    </div>
  );
}

// ── Thumb slider (vertical, side-mounted) ────────────────────────────
function ThumbSlider({ label, side, value, onChange, min, max, unit, color }) {
  const trackH = 160;
  const pct = (value - min) / (max - min);
  const thumbY = (1 - pct) * trackH;

  const trackRef = React.useRef(null);
  const handlePointer = (clientY) => {
    if (!trackRef.current) return;
    const r = trackRef.current.getBoundingClientRect();
    const rel = Math.max(0, Math.min(r.height, clientY - r.top));
    const newPct = 1 - rel / r.height;
    onChange(Math.round(min + newPct * (max - min)));
  };

  return (
    <div style={{
      position: "absolute", top: "50%", transform: "translateY(-50%)",
      [side]: side === "left" ? 50 : 20,
      zIndex: 10,
      width: 62,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    }}>
      {/* Value display */}
      <div style={{
        padding: "3px 8px",
        background: "var(--bg-raised)", border: "1px solid " + color,
        clipPath: "var(--clip-6)",
        fontFamily: "var(--f-display)", fontSize: 16, letterSpacing: "0.08em",
        color, minWidth: 52, textAlign: "center",
      }}>
        {value}{unit}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onMouseDown={(e) => handlePointer(e.clientY)}
        onMouseMove={(e) => { if (e.buttons === 1) handlePointer(e.clientY); }}
        onTouchMove={(e) => handlePointer(e.touches[0].clientY)}
        style={{
          position: "relative",
          width: 16, height: trackH,
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          clipPath: "var(--clip-6)",
          cursor: "ns-resize",
        }}
      >
        {/* Tick marks */}
        {[0.25, 0.5, 0.75].map(t => (
          <div key={t} style={{
            position: "absolute", left: -3, right: -3,
            top: t * trackH,
            height: 1, background: "var(--muted)", opacity: 0.5,
          }} />
        ))}
        {/* Fill */}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          height: pct * 100 + "%",
          background: color, opacity: 0.25,
        }} />
        {/* Thumb */}
        <div style={{
          position: "absolute", left: -5, right: -5,
          top: thumbY - 6,
          height: 12,
          background: color,
          border: "1px solid #0e1209",
          boxShadow: "0 0 8px " + color,
        }} />
      </div>

      {/* Label */}
      <div style={{
        fontFamily: "var(--f-mono)", fontSize: 7,
        color: "var(--olive)", letterSpacing: "0.25em",
      }}>{label}</div>
    </div>
  );
}

// Simple cubic-ish arc path for preview
function arcPath(angle, power) {
  // Convert angle/power to an approximate peak height and reach
  const rad = (angle * Math.PI) / 180;
  const reach = Math.max(80, Math.min(580, (power / 100) * 600));
  const peak = Math.max(20, Math.sin(rad) * (power / 100) * 160);
  return `M0,140 Q${reach / 2},${140 - peak} ${reach},120`;
}

const weaponNavBtn = {
  width: 24, height: 24,
  background: "var(--bg-raised)", color: "var(--olive)",
  border: "1px solid var(--border)", clipPath: "var(--clip-6)",
  fontFamily: "var(--f-mono)", fontSize: 12, letterSpacing: 0,
  cursor: "pointer", padding: 0,
};

Object.assign(window, { MobileMatch });
