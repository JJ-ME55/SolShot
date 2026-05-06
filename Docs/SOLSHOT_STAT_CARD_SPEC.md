# SolShot — Stat Card Spec
**For Claude Code implementation**
Last updated: Practice Mode launch phase

---

## Purpose

The stat card is a shareable player identity card generated from persistent MongoDB stats. It is the primary organic marketing mechanic for SolShot's practice mode launch — every time a player shares their card, SolShot gets a free impression with a direct link to the site.

The card is designed to work across two contexts:
- **Mobile** — tappable link, screenshot and share directly to X
- **Desktop / stream** — QR code scannable from another device

---

## Design Decisions & Rationale

### No rank or tier system on this card

A named rank system (e.g. Conscript → Assassin) was considered and rejected. Reasons:

1. Ranks earned through wins alone would undermine the prestige system at main launch. A player who reaches "Assassin" rank for free has less incentive to burn $SHOT for Bronze prestige.
2. Prestige tiers (Bronze → Diamond) from the litepaper carry real token economic weight — weapon unlocks, cosmetics, future gating. A free parallel rank system creates a confusing hierarchy.
3. Raw stats are a stronger flex than a label. The numbers tell the story.

**Decision: No rank label. Stats only.**

### Prestige card is shelved for main launch

At main launch, prestige players will receive an entirely different card — different colour palette, different energy, potentially animated, with weapon art. It should look categorically better than the practice card so the contrast itself becomes a conversion hook.

The practice card deliberately leaves that space empty. A player who has played 80 matches and has no prestige badge is their own best advertisement for the SHOT token.

**Decision: Prestige card is a separate component, built at main launch, not now.**

### Signature Weapon rules

- Label: **SIGNATURE WEAPON**
- Sourced from: most-used purchased weapon from match history
- **Single Shot is excluded** — it is the free default weapon and carries no identity signal
- If a player has not used any purchased weapon: display **CLASSIFIED**
- CLASSIFIED is intentional — it signals there is something to unlock, not that data is missing

### QR code + link

- Both point to **solshot.gg**
- QR is for desktop and stream contexts where a second device would scan it
- Tappable text link (`solshot.gg`) is for mobile where scanning your own screen is friction
- Telegram is the right destination during private tester week invites but the card is a permanent artefact — solshot.gg is the correct long-term destination

### Aspect ratio

- **16:9** locked via `aspectRatio: "16/9"`
- Optimal for X/Twitter card preview embeds
- Scales cleanly across all viewport sizes using `clamp()` for all font sizes
- Do not break this ratio — it affects how X renders the image in feed

### Footer tease

- Static line: `WAGERING UNLOCKS SOON`
- Subtle, low contrast — not a headline, just a seed
- Remains on the card until wagering goes live, at which point it is removed or replaced with wager stats

---

## Stats displayed on card

All sourced from MongoDB player document. Schema fields noted.

| Display Label | MongoDB Field | Format |
|---|---|---|
| CALLSIGN | `callsign` | String, uppercase |
| DMG DEALT | `totalDamage` | Number, auto-converts to `K` above 999 |
| WINS | `wins` | Integer |
| LOSSES | `losses` | Integer |
| K / D | Computed: `wins / losses` | 2 decimal places, handles 0 losses |
| BEST STREAK | `bestWinStreak` | Integer, displayed as `NW` |
| WIN RATE | Computed: `wins / matchesPlayed` | Percentage, integer |
| MATCHES PLAYED | `matchesPlayed` | Integer, shown in footer |
| SIGNATURE WEAPON | `signatureWeapon` | String from weapon list, excludes Single Shot |

---

## Colour palette & typography

```
Background:     #0d0f09  (near black, olive tint)
Card surface:   #161912 → #0d0f09  (gradient)
Primary text:   #EDE9D5  (bone white)
Accent:         #E8572A  (orange rust)
Muted text:     #363929  (dark olive)
Borders:        #1e2114 / #2e3120
```

**Fonts** (Google Fonts):
- `Black Ops One` — callsign, stat values, branding
- `Share Tech Mono` — labels, metadata, footer

---

## Card component rules

1. Card width: `min(calc(100vw - 40px), 720px)` — never exceeds 720px, always fits mobile
2. Aspect ratio: locked 16/9, do not modify
3. All font sizes via `clamp()` — test at 320px width (minimum mobile) and 1280px desktop
4. Scanlines overlay: `repeating-linear-gradient` at 4px intervals, `rgba(0,0,0,0.12)` — keep subtle
5. Corner bracket decorations: orange rust at 55% opacity, 14×14px, all four corners
6. Orange top bar: 2px, fades at edges — do not make solid
7. Left accent strip: vertical, fades top and bottom, purely decorative

---

## Export / share behaviour

- Card is rendered as a fixed DOM element
- PNG export via `html2canvas` or equivalent — capture only the card div, not the controls
- Downloaded filename: `solshot-[callsign]-card.png` (lowercase callsign)
- Share to X button should pre-populate tweet text:
  ```
  [CALLSIGN] // [WINS]W [LOSSES]L // SIGNATURE WEAPON: [WEAPON]
  solshot.gg
  ```
- QR code library: `qrcode.react` or `qrcode` npm package, rendered white on transparent, sized to fit bottom-right zone of card

---

## Component code (React reference implementation)

This is the approved mock. Implement this into the SolShot codebase as a standalone React component. Props should accept the player stats object from MongoDB. The controls panel below the card is for demo/testing only — remove in production, data comes from props.

```jsx
import { useState } from "react"

const WEAPONS = [
  "Single Shot", "Crazy Ivan", "Pile Driver", "Hailstorm",
  "Sniper Rifle", "Heatseeker", "Napalm", "Ground Hog",
  "Jackhammer", "Spider", "3 Shot", "Big Shot", "Skipper",
  "Magic Wall", "Dirt Ball"
]

const RANKS = [
  { label: "CONSCRIPT", min: 0, max: 2, color: "#8B7355" },
  { label: "GUNNER", min: 3, max: 10, color: "#A0A0A0" },
  { label: "MARKSMAN", min: 11, max: 25, color: "#C8A84B" },
  { label: "SNIPER", min: 26, max: 50, color: "#5BA8D4" },
  { label: "ASSASSIN", min: 51, max: Infinity, color: "#E8472A" },
]

const getRank = (wins) => RANKS.find(r => wins >= r.min && wins <= r.max)

export default function StatCard() {
  const [data, setData] = useState({
    callsign: "BUCKSHOT",
    wins: 14,
    losses: 6,
    damage: 8470,
    streak: 5,
    weapon: "Crazy Ivan",
    matches: 20,
  })

  const rank = getRank(data.wins)
  const kd = data.losses === 0 ? data.wins.toFixed(2) : (data.wins / data.losses).toFixed(2)
  const winRate = data.matches === 0 ? 0 : Math.round((data.wins / data.matches) * 100)

  return (
    <div style={{
      fontFamily: "'Black Ops One', cursive",
      background: "#060708",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      gap: "20px"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Share+Tech+Mono&display=swap" rel="stylesheet" />

      {/* CARD — 16:9 locked */}
      <div style={{
        width: "min(calc(100vw - 40px), 720px)",
        aspectRatio: "16/9",
        position: "relative",
        background: "linear-gradient(145deg, #161912 0%, #0d0f09 40%, #131610 100%)",
        border: "1px solid #2e3120",
        boxShadow: "0 0 0 1px #E8572A18, 0 24px 80px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.03)",
        overflow: "hidden",
        borderRadius: "3px",
      }}>

        {/* Scanline overlay */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
        }} />

        {/* Vignette */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)"
        }} />

        {/* Top orange bar */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "2px", zIndex: 4,
          background: "linear-gradient(90deg, transparent 0%, #E8572A 20%, #E8572A 80%, transparent 100%)"
        }} />

        {/* Bottom dim bar */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "1px", zIndex: 4,
          background: "linear-gradient(90deg, transparent, #2e3120, transparent)"
        }} />

        {/* Corner brackets */}
        {[
          { top: 10, left: 10, borderTop: "1px solid #E8572A55", borderLeft: "1px solid #E8572A55" },
          { top: 10, right: 10, borderTop: "1px solid #E8572A55", borderRight: "1px solid #E8572A55" },
          { bottom: 10, left: 10, borderBottom: "1px solid #E8572A55", borderLeft: "1px solid #E8572A55" },
          { bottom: 10, right: 10, borderBottom: "1px solid #E8572A55", borderRight: "1px solid #E8572A55" },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 14, height: 14, zIndex: 5, ...s }} />
        ))}

        {/* Left accent strip */}
        <div style={{
          position: "absolute", left: 0, top: "15%", bottom: "15%", width: "2px", zIndex: 2,
          background: "linear-gradient(180deg, transparent, #E8572A44 40%, #E8572A44 60%, transparent)"
        }} />

        {/* Main content */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 3,
          display: "flex", flexDirection: "column",
          padding: "clamp(12px, 3.2%, 24px)",
        }}>

          {/* TOP ROW — branding */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "clamp(4px, 1.2%, 10px)" }}>
            <div>
              <div style={{
                fontFamily: "'Black Ops One', cursive",
                fontSize: "clamp(9px, 1.9vw, 14px)",
                color: "#E8572A",
                letterSpacing: "0.18em",
                lineHeight: 1,
              }}>SOLSHOT.GG</div>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: "clamp(6px, 1vw, 8px)",
                color: "#363929",
                letterSpacing: "0.14em",
                marginTop: "3px"
              }}>PRACTICE MODE // SEASON ZERO</div>
            </div>

            {/* QR code zone — replace div with <QRCode> component pointing to solshot.gg */}
            <div style={{
              width: "clamp(32px, 7vw, 54px)",
              aspectRatio: "1",
              background: "#1a1c14",
              border: "1px solid #2e3120",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: "clamp(4px, 0.7vw, 6px)",
                color: "#363929",
                letterSpacing: "0.1em",
                textAlign: "center"
              }}>QR</div>
            </div>
          </div>

          {/* CALLSIGN HERO */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: "clamp(2px, 0.8%, 6px)" }}>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "clamp(5px, 0.9vw, 7px)",
              color: "#363929",
              letterSpacing: "0.35em",
              marginBottom: "clamp(2px, 0.5%, 4px)"
            }}>// CALLSIGN</div>

            <div style={{
              fontFamily: "'Black Ops One', cursive",
              fontSize: "clamp(28px, 7.5vw, 58px)",
              color: "#EDE9D5",
              letterSpacing: "0.04em",
              lineHeight: 0.95,
              textShadow: "0 2px 40px rgba(232,87,42,0.12), 0 0 80px rgba(232,87,42,0.06)"
            }}>{data.callsign || "—"}</div>

            {/* Signature weapon */}
            <div style={{
              display: "flex", alignItems: "center", gap: "clamp(4px, 0.8%, 7px)",
              marginTop: "clamp(3px, 0.8%, 7px)"
            }}>
              <div style={{ width: "clamp(10px, 2.2vw, 18px)", height: "1px", background: "#E8572A", flexShrink: 0 }} />
              <div style={{
                fontFamily: "'Share Tech Mono', monospace",
                fontSize: "clamp(7px, 1.3vw, 10px)",
                color: data.weapon === "CLASSIFIED" ? "#363929" : "#E8572A",
                letterSpacing: "0.14em",
                whiteSpace: "nowrap"
              }}>
                {data.weapon && data.weapon !== "Single Shot"
                  ? `SIGNATURE WEAPON: ${data.weapon.toUpperCase()}`
                  : "SIGNATURE WEAPON: CLASSIFIED"
                }
              </div>
              <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #E8572A22, transparent)" }} />
            </div>
          </div>

          {/* STATS ROW */}
          <div style={{
            borderTop: "1px solid #252718",
            paddingTop: "clamp(6px, 1.5%, 12px)",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "clamp(2px, 0.5%, 4px)",
            marginBottom: "clamp(4px, 1%, 8px)"
          }}>
            {[
              { label: "DMG DEALT", value: data.damage >= 1000 ? `${(data.damage/1000).toFixed(1)}K` : data.damage },
              { label: "WINS", value: data.wins },
              { label: "LOSSES", value: data.losses },
              { label: "K / D", value: kd },
              { label: "BEST STREAK", value: `${data.streak}W` },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                textAlign: "center",
                padding: "clamp(4px, 1%, 8px) 0",
                borderRight: i < 4 ? "1px solid #1e2114" : "none",
              }}>
                <div style={{
                  fontFamily: "'Black Ops One', cursive",
                  fontSize: "clamp(13px, 3vw, 24px)",
                  color: "#EDE9D5",
                  lineHeight: 1,
                }}>{stat.value}</div>
                <div style={{
                  fontFamily: "'Share Tech Mono', monospace",
                  fontSize: "clamp(4px, 0.8vw, 6.5px)",
                  color: "#363929",
                  letterSpacing: "0.12em",
                  marginTop: "clamp(2px, 0.4%, 4px)"
                }}>{stat.label}</div>
              </div>
            ))}
          </div>

          {/* BOTTOM BAR */}
          <div style={{
            borderTop: "1px solid #1e2114",
            paddingTop: "clamp(4px, 0.9%, 7px)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "clamp(5px, 0.85vw, 6.5px)",
              color: "#2a2d1c",
              letterSpacing: "0.18em"
            }}>WAGERING UNLOCKS SOON</div>
            <div style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: "clamp(5px, 0.85vw, 6.5px)",
              color: "#2a2d1c",
              letterSpacing: "0.12em"
            }}>{winRate}% WIN RATE // {data.matches} MATCHES PLAYED // solshot.gg</div>
          </div>

        </div>
      </div>
    </div>
  )
}
```

---

## Implementation notes for Claude Code

### QR code
- Replace the placeholder `<div>` in the top-right with a QR component
- Recommended: `qrcode.react` — `<QRCodeSVG value="https://solshot.gg" size={54} fgColor="#EDE9D5" bgColor="transparent" />`
- Size should scale with card using `clamp` or a percentage of card width

### PNG export
- Use `html2canvas` targeting the card div only (not the page wrapper)
- Filename: `solshot-${callsign.toLowerCase()}-card.png`
- Trigger via a button outside the card bounds — do not render export UI inside the card

### Share to X
Pre-populate tweet text on share button click:
```
{CALLSIGN} // {WINS}W {LOSSES}L // {SIGNATURE WEAPON}
solshot.gg
```

### Props interface (production)
```js
// Remove demo controls. Accept player object from MongoDB:
StatCard.propTypes = {
  player: {
    callsign: String,
    wins: Number,
    losses: Number,
    totalDamage: Number,
    bestWinStreak: Number,
    matchesPlayed: Number,
    signatureWeapon: String, // null or "Single Shot" → renders CLASSIFIED
  }
}
```

### Signature weapon logic
```js
const displayWeapon = (!player.signatureWeapon || player.signatureWeapon === "Single Shot")
  ? "CLASSIFIED"
  : player.signatureWeapon.toUpperCase()
```

---

## Future: Prestige card (main launch — do not build now)

At main launch, prestige players (Bronze → Diamond) will receive a separate card component. It should:

- Have an entirely different visual identity — distinct colour palette per prestige tier, weapon art, potentially animated
- Look categorically better than the practice card — the contrast is the conversion hook
- Show prestige tier badge prominently
- Retain the same stats but add wagered match stats (SOL won/lost, wager win rate)
- The practice card should remain available as a secondary card for non-prestige players

The empty prestige space on the practice card is intentional. It signals incompleteness. Do not add a prestige placeholder or "UNRANKED" label — the absence is the message.
