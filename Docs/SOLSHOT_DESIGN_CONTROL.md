# SOLSHOT — DESIGN CONTROL DOCUMENT
## Brand Identity & Visual Standards
### Version 1.0 — Locked

---

## 1. DESIGN PHILOSOPHY

SolShot's visual identity is **military-tech**: a worn battlefield aesthetic crossed with tactical HUD interfaces. Think Cold War command bunkers, not Silicon Valley dashboards. Everything should feel like it was designed for a field commander — functional, dense with information, slightly weathered.

**NOT**: Clean/minimal, neon-crypto, rounded-friendly, corporate SaaS, generic web3
**YES**: Olive drab, ammunition crates, tactical displays, worn metal, war room maps, ammo counters

The Solana integration is subtle — accent colors only. This is a **game** first, a **crypto product** second.

---

## 2. COLOR PALETTE

### Primary (Battlefield)
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--ol` | Olive Line | `#3d4a2f` | Borders, dividers, subtle outlines |
| `--od` | Olive Dark | `#2a331f` | Card backgrounds, input fields, secondary surfaces |
| `--kh` | Khaki | `#b8a88a` | Secondary text, labels, muted UI elements |
| `--bn` | Bone | `#e8dcc8` | Primary text, headings, high-contrast elements |
| `--mu` | Mud | `#5c4a3a` | Text shadows, deep accents |
| `--bk` | Black Ops | `#0a0c08` | Page background, deepest surfaces |

### Action (Fire & Gold)
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--ru` | Rust | `#c4510a` | Primary buttons (gradient base), CTA backgrounds |
| `--rg` | Range Orange | `#ff6b1a` | Primary accent, button borders, highlights, hover states |
| `--am` | Amber | `#ffb627` | Gold/currency display, weapon tier (rare), warnings |
| `--ad` | Amber Dark | `#a67b1a` | Gold gradients (dark end), prestige button base |
| `--gd` | Gold | `#ffd700` | Currency values, gold coin, shop prices |

### Neutral (Metal & Steel)
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--st` | Steel | `#6b7b8d` | Tactical tier weapons, inactive elements |
| `--sd` | Steel Dark | `#3a4550` | Tank base color, structural elements |

### Status
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--gg` | Go Green | `#7fff44` | Victory, player health, positive states, "owned" badges |
| `--rd` | Red Alert | `#cc2200` | Defeat, damage, unaffordable items, danger, forfeit |

### Crypto (Accent Only)
| Token | Name | Hex | Usage |
|-------|------|-----|-------|
| `--sp` | Sol Purple | `#9945FF` | Epic tier weapons, Solana badge accent, prestige P9 |
| `--sg` | Sol Green | `#14F195` | SOL balance display, "Powered by Solana" badge, pot display |

### Usage Rules
- **Backgrounds** always use `--bk` → `--od` gradients. Never white. Never pure black (#000).
- **Text hierarchy**: `--bn` (headings) → `--kh` (body/labels) → `--kh` at 40-50% opacity (tertiary)
- **Borders**: Always `--ol` or `--od`. Never grey. Never white.
- **Crypto colors** (`--sp`, `--sg`) used ONLY for: wallet balance, SOL pot display, "Powered by Solana" badge, epic weapon tier. Never for backgrounds or primary buttons.
- **Action buttons**: Always `--ru` → dark gradient with `--rg` border. Never flat color.
- **Links/hover**: `--rg` (orange), never blue, never underlined

---

## 3. TYPOGRAPHY

### Font Stack
| Role | Font | Weight | Fallback | Usage |
|------|------|--------|----------|-------|
| **Display** | Black Ops One | 400 | cursive | Logo, screen titles, "VICTORY"/"DEFEATED", hero text |
| **Mono** | Share Tech Mono | 400 | monospace | Labels, stats, prices, badges, data, small text |
| **Numerals** | Bebas Neue | 400 | sans-serif | Large numbers (angle, power, prestige level, countdown) |

```css
@import url('https://fonts.googleapis.com/css2?family=Black+Ops+One&family=Share+Tech+Mono&family=Bebas+Neue&display=swap');
```

### Type Scale
| Element | Font | Size | Color | Letter-spacing | Transform |
|---------|------|------|-------|---------------|-----------|
| Logo "SOLSHOT" | Black Ops One | 44px | `--bn` / `--rg` split | 2px | — |
| Screen title | Black Ops One | 18px | `--bn` | 2px | — |
| Section heading | Black Ops One | 16px | tier color | 1-2px | — |
| Button label | Black Ops One | 13-15px | `--bn` | 2-3px | UPPERCASE |
| Body text | Share Tech Mono | 10px | `--kh` | 1px | — |
| Label/tag | Share Tech Mono | 7-8px | `--kh` @ 40-50% | 2-3px | UPPERCASE |
| Price/stat | Share Tech Mono | 9-11px | `--gd` or `--sg` | — | — |
| Large number | Bebas Neue | 22-28px | `--bn` | — | — |
| Version tag | Share Tech Mono | 8px | `--kh` @ 30% | — | — |

### Rules
- ALL labels and tags are UPPERCASE with letter-spacing ≥ 2px
- Never use sentence case for UI elements — either UPPERCASE or Title Case
- Mono font for anything data-related (prices, stats, wallet addresses, codes)
- Display font ONLY for titles and emphasis — never for body text
- No font-weight variation needed — each font has one weight

---

## 4. LOGO

### Primary Mark
The SolShot logo is the word "SOLSHOT" in Black Ops One where "SOL" is `--bn` (bone) and "SHOT" is `--rg` (range orange). It's accompanied by a tank shell/round icon to the left.

### Shell Icon
A simplified tank shell silhouette:
- Rounded top (warhead)
- Rectangular body
- Color: `--sd` body with `--kh` stroke
- Border: 2px `--kh`
- The "S" character centered inside in Black Ops One, `--bn`

### Logo Variations
| Context | Version |
|---------|---------|
| In-game menu | Full: shell icon + "SOLSHOT" + tagline below |
| Nav bar | Shell icon + "SOLSHOT" text |
| Favicon | Shell icon only, `--rg` fill |
| Social avatar | Shell icon on `--bk` background with `--ol` border |
| Light background | NOT SUPPORTED — always use on dark backgrounds |

### Clear Space
Minimum clear space around logo = height of the "S" in SOLSHOT on all sides.

### Tagline
Below logo, in Share Tech Mono, 9px, `--kh` @ 60%, letter-spacing 3px:
`ARTILLERY COMBAT ON SOLANA`

---

## 5. COMPONENT PATTERNS

### Buttons

**Primary (CTA / Fire / Deploy)**
```css
background: linear-gradient(180deg, #cc3300, #881a00);
border: 2px solid var(--rg);
border-radius: 5px;
box-shadow: 0 0 16px rgba(204, 51, 0, 0.3);
color: var(--bn);
font-family: 'Black Ops One';
letter-spacing: 3px;
```

**Secondary (Lobby / Navigation)**
```css
background: var(--od);
border: 1px solid var(--ol);
border-radius: 4px;
color: var(--kh);
font-family: 'Black Ops One';
letter-spacing: 2px;
```

**Gold Action (Buy / Burn / Prestige)**
```css
background: linear-gradient(180deg, var(--ad), #6a4a10);
border: 1px solid var(--am);
border-radius: 4px;
color: var(--bn);
```

**Disabled**
```css
background: var(--od);
border: 1px solid var(--ol);
color: var(--kh);
opacity: 0.4-0.5;
cursor: not-allowed;
```

### Cards / Panels
```css
background: rgba(26, 32, 16, 0.35-0.7);
border: 1px solid var(--od);
border-radius: 3-4px;
/* Selected state: */
border-color: [tier-color]33;
background: rgba(255, 255, 255, 0.03);
```

### List Items (Weapons, Lobbies, Prestige Tiers)
- Left border accent: 3px solid [tier-color]
- Hover: background shifts to `rgba(255, 107, 26, 0.1)` + border lights up
- Selected: subtle gold/tier-color border glow
- Icon: 22-30px square, rounded 3-4px, gradient background matching tier

### Tier Color System
| Tier | Color | Token |
|------|-------|-------|
| Free | `--kh` dimmed | `var(--kh)` @ 50% |
| Standard | `--kh` | `var(--kh)` |
| Tactical | `--st` | `var(--st)` |
| Rare | `--am` | `var(--am)` |
| Epic | `--sp` | `var(--sp)` |
| Legendary | `--rg` | `var(--rg)` |
| Prestige | `--gg` | `var(--gg)` |

### Health Bars
- Player: `--gg` (green) fill
- Opponent: `--rg` (orange) fill
- Background track: `rgba(10, 12, 8, 0.5)`
- Height: 3px
- Border-radius: 2px

### Stat Bars (Damage, Blast)
- Height: 2-4px
- Background: `var(--od)`
- Fill color: tier-dependent or `--am` / `--rg` based on value
- Border-radius: 1-2px

---

## 6. LAYOUT PATTERNS

### Screen Structure
Every game screen follows this pattern:
```
┌─────────────────────────────────┐
│  TOP BAR (title, nav, wallet)   │  Fixed, 36-40px height
├─────────────────────────────────┤
│         │                       │
│  LEFT   │       RIGHT           │  Flex, overflow-auto
│  PANEL  │       PANEL           │
│  (nav/  │       (detail/        │
│   list) │        content)       │
│         │                       │
├─────────────────────────────────┤
│  BOTTOM BAR (CTA button)        │  Fixed, optional
└─────────────────────────────────┘
```

- Left panel: 30-45% width, contains navigation/list
- Right panel: remaining, contains detail/preview
- Divider: 1px solid `var(--od)`
- Aspect ratio: 16:9 for game viewport

### Landing Page Structure
```
NAV (fixed, blurred backdrop)
HERO (full viewport)
SECTIONS (max-width 1000px, centered)
  → How It Works
  → Arsenal
  → Tokenomics
  → Prestige
  → Roadmap
  → FAQ
CTA (full-width)
RESPONSIBLE GAMING BANNER
FOOTER
```

---

## 7. EFFECTS & MOTION

### Texture Overlays (Always Present)
1. **Noise overlay**: SVG fractalNoise, opacity 0.03, pointer-events none, z-index 100
2. **Scanlines**: repeating-linear-gradient, 2px transparent + 2px rgba(0,0,0,0.02), z-index 99

### Animations
| Name | Usage | Duration | Easing |
|------|-------|----------|--------|
| `si` (slide-in) | Menu items entering from left | 0.3s | ease-out |
| `su` (slide-up) | Stats/cards appearing | 0.3-0.4s | ease-out |
| `sm` (slam) | Victory/Defeat text | 0.5-0.6s | ease-out |
| `sc` (scale pop) | SOL earned reveal | 0.3s | ease-out |
| `vp` (victory pulse) | Victory text glow | 2s | ease-in-out, infinite |
| `dp` (defeat pulse) | Defeat text glow | 3s | ease-in-out, infinite |
| `wd` (wind drift) | Wind direction arrow | 2s | ease-in-out, infinite |
| `ug` (upgrade glow) | Prestige button ready | 2s | ease-in-out, infinite |
| `fl` (flicker) | Subtle container flicker | 5s | infinite |

### Animation Rules
- Stagger list items by 0.08s delay each
- Use `animation-fill-mode: both` for entrance animations
- Never animate more than 3 properties simultaneously
- Prefer transform + opacity over layout properties
- Screen transitions: instant (no page transition animations)

### Gradients
- **Page backgrounds**: `linear-gradient(135deg, #0c1008, #1a2a12 40%, #0a0c08)` or `linear-gradient(180deg, #0c1008, #0a0c08)`
- **Victory background**: `linear-gradient(180deg, #0a1808, #0c2010, #0a0c08)` — green tint
- **Defeat background**: `linear-gradient(180deg, #1a0808, #120808, #0a0808)` — red tint
- **Terrain**: `linear-gradient(180deg, #5a6a38, #3a4820, #1a2010)` — olive gradient
- **Sky**: Dark blue top → warm amber horizon → dark bottom

---

## 8. ICONOGRAPHY

### Style
- No emoji in final game (v5 uses them as placeholders)
- Icons should be simple geometric shapes or SVG paths
- Monochrome, colored by tier/context
- 22-30px bounding box for list items, 36-56px for featured displays

### Weapon Icons
- Existing .webp files in `/assets/images/logos/standard/`
- 30×30px canvas with gradient metal background
- Must be redesigned for SolShot brand (current ones are Pocket Tanks originals)

### Currency Icons
| Currency | Icon | Color |
|----------|------|-------|
| Gold | Hexagonal coin (🪙 placeholder) | `--gd` |
| SOL | Solana logo or `◆` | `--sg` |
| SHOT | Hexagon or `⬡` | `--am` |

### Prestige Badges
- Circular, tier-colored border
- Prestige number centered in Bebas Neue
- Conic gradient progress ring showing tier progress
- Glow: `box-shadow: 0 0 16px [tier-color]33`

---

## 9. WRITING STYLE

### Tone
- Military-casual. Not drill-sergeant barking, not corporate smooth.
- Short, punchy sentences. Sentence fragments OK.
- Technical accuracy (SOL amounts, percentages) always in mono font.
- Never use "Welcome!" or "Let's get started!" — too friendly.
- Acceptable: "Deploy.", "Lock and load.", "Run it back."

### Naming Conventions
| In-Game Term | NOT This |
|-------------|----------|
| Deploy | Play / Start / Begin |
| Armory | Shop / Store / Marketplace |
| Barracks | Profile / Account / Dashboard |
| Prestige | Level Up / Upgrade / Rank Up |
| Gold (in-match) | Coins / Credits / Points |
| SHOT (token) | Tokens / Points / XP |
| Wager | Bet / Stake / Entry fee |
| Pot | Prize pool / Jackpot |
| Rake | Fee / Commission / Tax |

### Button Labels
- Primary CTA: VERB + context → "FIRE", "DEPLOY", "READY — START ROUND"
- Always UPPERCASE
- No emoji in button labels — text only
- Burn actions use the word "BURN" as prefix, not icons

---

## 10. RESPONSIVE NOTES

### Target
- Primary: Desktop browser (16:9 viewport within page)
- Secondary: Landing page responsive (mobile-friendly)
- Game itself is NOT mobile-optimized for v1

### Landing Page Breakpoints
| Width | Changes |
|-------|---------|
| > 900px | Full layout, side-by-side grids |
| 600-900px | 2-column grids → 2-column, nav links hidden |
| < 600px | Single column, stacked CTAs, compressed stats |

---

## 11. DO NOT

- ❌ Use white backgrounds anywhere
- ❌ Use rounded corners > 8px (max border-radius: 8px for containers, 5px for buttons)
- ❌ Use drop shadows with blue/purple tint
- ❌ Use gradient text (exception: logo only if needed)
- ❌ Use Solana purple as a primary/background color
- ❌ Use emoji in production game UI (placeholders only in prototypes)
- ❌ Use emoji in buttons, labels, or headings (no lightning bolts, fire, etc.)
- ❌ Use lowercase for button labels
- ❌ Use "Play" — it's "Deploy"
- ❌ Use friendly/casual crypto language ("wagmi", "gm", "lfg" in official UI)
- ❌ Use card shadows — use borders only
- ❌ Use sans-serif body fonts — always mono for data, display for titles
- ❌ Reference Pocket Tanks in any public-facing material

---

## APPENDIX: CSS VARIABLES BLOCK

```css
:root {
  --ol: #3d4a2f;
  --od: #2a331f;
  --kh: #b8a88a;
  --ru: #c4510a;
  --rg: #ff6b1a;
  --am: #ffb627;
  --ad: #a67b1a;
  --st: #6b7b8d;
  --sd: #3a4550;
  --bn: #e8dcc8;
  --mu: #5c4a3a;
  --bk: #0a0c08;
  --gg: #7fff44;
  --rd: #cc2200;
  --sp: #9945FF;
  --sg: #14F195;
  --gd: #ffd700;
}
```
