# Handoff: SolShot Redesign

## Overview
High-fidelity redesign of **SolShot** — a Solana-based tank artillery PvP game — reframed with a **"Field Manual / declassified military dossier"** visual identity. The mocks cover the full player loop: Main Menu → Deploy (challenge flow) → Weapon Shop (30s kit phase) → In-Game HUD → Post-Match Report (AAR), plus meta screens (Barracks, Armory, Loadout, Prestige).

The target feel: stenciled display type, Share Tech Mono body copy, olive/bone/orange palette on a near-black surface, angled clip-path buttons, scanlines + grain + vignette overlays. No neon, no cyberpunk glow, no modern gradient UI tropes.

## About the Design Files
The files in this bundle are **design references created in HTML** — React-via-Babel prototypes showing the intended look, layout, and interactive scaffolding. They are **not production code to copy directly.**

The task is to **recreate these HTML designs in your target codebase** (React, Next.js, Vue, SwiftUI, Unity UI, whatever SolShot actually ships on) using its established patterns, state management, and component primitives. If no frontend exists yet, pick the framework most appropriate for the platform and implement there.

Use this bundle for:
- **Exact visual spec** — colors, typography, spacing, shapes, overlays
- **Screen inventory** — what routes/views exist and what each one does
- **Interaction intent** — click targets, state transitions, copy

Do **not** use for:
- Copying the inline-style React structure — it's prototype-grade, not production
- Shipping the HTML as-is — there's no real backend, no auth, no on-chain integration

## Fidelity
**High-fidelity (hifi).** All colors, typography, spacing, shadows, clip-path shapes, and overlay effects are final. Recreate pixel-for-pixel using your codebase's existing libraries and patterns.

Copy in the mocks is final. Tank art and badges are final (pixel-art PNGs in `assets/`).

---

## Screens / Views

The app is a single-page prototype with 9 routes, selectable from a dev nav. In production these would be real routes (`/`, `/deploy`, `/shop`, etc.) or app screens.

### 1. Main Menu (`menu`)
**Purpose:** Landing screen. Player lands here after connect-wallet. Primary action = PLAY → Deploy.

**Layout:** Centered column, max-width 420px. Top bar (identity + wordmark + currency) spanning full width. Hero = tank preview + PLAY button + two secondary buttons (Armory, Barracks) + "How to play" link + online counter. Terrain silhouette SVG at the bottom of the viewport.

**Key components:**
- **Top bar**: 3-column grid (`1fr auto 1fr`). Left = rank badge (28×28 PNG) + callsign + `BRONZE · LVL 1`. Center = `SOLSHOT` wordmark (Black Ops One, 34px, `SOL` in bone, `SHOT` in accent orange). Right = currency readout `◆ 1,240 SHOT` (accent) `◇ 2.31 SOL` (bone). 14px/28px padding. 1px olive border-bottom.
- **Tank hero**: Composited pixel-art tank (body + turret layer, both PNG) with pixelated image-rendering. 140px tall preview. Ground tick-marks below.
- **PLAY button**: Full-width, `padding: 28px 22px`, `background: var(--accent)` (#c8781a), `color: #0e1209`, `clip-path: var(--clip-10)`, `font-family: Black Ops One`, `font-size: 44px`, `letter-spacing: 0.22em`, centered. `box-shadow: 0 0 28px rgba(218,138,40,0.25)`.
- **Secondary buttons** (Armory, Barracks): `padding: 13px 18px`, raised bg, 1px olive border, clip-6, left-aligned. Label in stencil 15px + sub-label in mono 9px olive. Right chevron `▸`.
- **"HOW TO PLAY →"**: Dotted-underline mono link, 10px olive.
- **Online counter**: `● 247 ONLINE · MAINNET BETA`, live-updates every 2.4s ±4 in range 180–320.

### 2. Deploy / Challenge Flow (`deploy`)
**Purpose:** Choose match mode + terms, find or create a match.

**Layout:** Two-column. Left = mode picker + format + players + tank color. Right = open lobby list.

**Key components:**
- **Mode cards**: Practice (free), Quick Match, Duel, High Roller, Custom Challenge. Selected card highlighted in accent fill.
- **Format**: BO1 / BO3 / BO5 toggle (3 clip-10 buttons, selected = accent fill).
- **Players**: 2P / 3P / 4P toggle (selected = accent fill).
- **Tank color**: 10-swatch picker, each swatch is a clip-10 pixel-art tank in that tint.
- **Open lobbies panel**: Right column, empty-state with target reticle icon + "NO OPEN LOBBIES" message.

### 3. Weapon Shop (`shop`)
**Purpose:** 30-second between-round kit phase. Spend round gold on weapons.

**Layout:** Two-column. Left = weapon list. Right = 28s countdown timer + inventory.

**Weapon rows** (9 weapons — see `src/WeaponShop.jsx` for list):
- Single Shot (free, owned) · Dirt Ball (150G) · Magic Wall (150G) · Skipper (200G) · 3 Shot (200G) · Spider (200G) · Heatseeker (350G) · plus unlockables.
- Each row: tiny weapon icon (28×28 PNG), name in Days One, tactical/standard DMG tag in mono, damage bar (colored segments), SLR radius bar, cost in accent, `+` add button.
- Dimmed state when cost > gold.

**Timer**: 28 in display font, huge (64px+), accent orange, pulsing at <5s.

### 4. In-Game HUD (`match`)
**Purpose:** Minimal in-game overlay. Compass bearing, wind, power meter, weapon select, turn indicator. Preview/prototype only — real gameplay UI lives in the game engine.

**Layout:** Full-bleed terrain background (desert/jungle/moon PNG), tank sprites on terrain, HUD strips top/bottom.
- **Top strip**: Round indicator, shot timer, opponent callsign + HP bar.
- **Bottom strip**: Power bar, angle readout, weapon quick-select (3 slots), FIRE button (accent, clip-10).
- **Center**: Active player's tank with turret aimed per current angle; trajectory arc overlay when Tactical Scope consumable is active.

### 5. After Action Report (`report`)
**Purpose:** Post-match summary. Shown once per match.

**Layout:** Dossier-style document. Classified header + "CONFIRMED KILL" stamp + huge AFTER ACTION REPORT title. Below: victor banner, combatant comparison, shot-by-shot log, SHOT earned, SOL staked/won.

**Key components:**
- **Doc header**: `DOC 14-C · DECLASSIFIED` (left), `✱ CONFIRMED KILL` stamp in orange (center, rotated -3°), `M-#0A3F7` (right). All mono, 10–11px, olive.
- **Title**: `AFTER ACTION REPORT`, Black Ops One, 48px, bone, left-aligned with 3px accent left-rule.
- **Match meta**: `MATCH · BO3   TERRAIN VOLCANIC   DURATION 08:42`.
- **Victor banner**: Angled accent-orange bar. Left = `W` badge + callsign. Right = `FINAL SCORE 2 – 1`. clip-10.
- **Combatant columns**: Two columns with pixel tank silhouette (destroyed for loser). Color-tinted (blue vs red). Shots taken, accuracy, damage dealt.

### 6. Barracks (`barracks`)
**Purpose:** Player profile + combat record + leaderboard.

**Layout:** Title + tabs (Combat Record · Leaderboard). Combat Record tab = dossier card with callsign, rank, signature weapon, QR code, badge, stats grid.

**Callsign card**: `SOLSHOT.GG` header, `RANKED // SEASON ZERO // CALLSIGN`, giant callsign (Black Ops One, 56px, bone), fields (SIGNATURE WEAPON, RANK), sidebar (file number, QR code "SCAN TO DEPLOY", rank badge).

### 7. Armory (`armory`)
**Purpose:** Permanent cosmetics shop. Paid in SOL or $SHOT.

**Layout:** Tabs (SOL Shop · Cosmetics). Each row = rarity letter badge + name + rarity tag + slot (SKIN/TURRET/TRAIL/KILL FX) + SOL cost.

**Sample items**: Solana Gradient (0.1 SOL, legendary skin) · Phantom Turret (0.05 SOL, epic) · SOL Trail (0.03 SOL, epic) · SOL Burst (0.02 SOL, rare Kill FX) · Validator Kill (0.08 SOL, legendary).

### 8. Loadout (`loadout`)
**Purpose:** Select up to 3 consumables for the match. Paid in $SHOT.

**Layout:** Simple list. Each row = letter-badge icon + name + description + SHOT cost.

**Consumables**: Extra Rations (5 SHOT, +200G starting gold) · Smoke Screen (8 SHOT) · Tactical Scope (12 SHOT, trajectory preview 1/3 arc) · Reinforced Armor (18 SHOT, +25 HP).

### 9. Prestige (`prestige`)
**Purpose:** Burn $SHOT to earn rank, unlock signature weapons.

**Layout:** Two-column. Left = big circular rank badge (currently P0 / UNRANKED). Right = tier list.

**Tiers**: Unranked (default, current) · Bronze (10,000 SHOT → Homing Missile) · Silver (50,000 SHOT → Cruiser) · Gold (150,000 SHOT → Tommy Gun) · Platinum · Diamond.

---

## Interactions & Behavior

### Navigation
- Top nav strip (dev-mode): `MENU · DEPLOY · SHOP · MATCH · REPORT · BARRACKS · ARMORY · LOADOUT · PRESTIGE`. In prod, replace with real routing.
- Current route persisted to `localStorage['solshot.route']` for reload stability.
- All screens share the same top nav + SHOT/SOL counter pattern.

### Tweaks (dev only)
- A Tweaks drawer exposes 3 visual themes: `field` (default), `crt`, `poster`. Swapped via `data-theme` attribute on root. In production, default to `field` only — the other themes are design-exploration alternates.

### Animations
- **Online counter**: Updates every 2400ms with ±4 random walk, clamped [180, 320].
- **Shop timer**: Counts down from 28s. Pulse red at <5s.
- **`blink` class**: 1s step-end alternating opacity — for radar/cursor blips.
- **`sweep` keyframe**: translateX(-100% → 100%) — radar sweep.
- All button :active states: `transform: translateY(1px)` for tactile feel.
- Scanlines and grain are **static overlays** (no JS animation) — purely CSS backgrounds.

### Hover states
- Secondary buttons: bg shifts from `--bg-raised` to `--border`, border to `--border-hot`.
- Primary: accent → accent-hot.
- Ghost: transparent → subtle fill.

### Loading/empty/error states
- Deploy's open-lobbies list: reticle icon + "NO OPEN LOBBIES" when empty.
- No explicit loading or error screens mocked — defer to the codebase's existing patterns.

---

## State Management

Minimal global state the prototype tracks (use your codebase's state pattern — Zustand, Redux, React context, etc.):

- `route: string` — current screen (`menu | deploy | shop | match | report | barracks | armory | loadout | prestige`).
- `theme: 'field' | 'crt' | 'poster'` — dev-only theme switch.
- **Player identity**: callsign, rank, level, signature weapon, badge, SHOT balance, SOL balance. Persisted server-side in prod; hardcoded in prototype.
- **Deploy selection**: mode, format (BO1/3/5), players (2/3/4), tank color index. Local until match created.
- **Shop round state**: time remaining, round gold, owned-weapon set.
- **Match state**: scores, turn, active weapon, angle, power, terrain — owned by game engine, not UI.

Data-fetching requirements:
- Wallet connection + SOL balance (Solana web3).
- $SHOT balance (SPL token read).
- Match lobby list (WebSocket or polling).
- Leaderboard (REST).
- Shop catalog (static or REST).

---

## Design Tokens

All tokens defined in `styles/tokens.css`. Below are the production values (theme: `field`, the default).

### Colors
| Token | Hex | Use |
|---|---|---|
| `--bg-deep` | `#0e1209` | Page background |
| `--bg-surface` | `#111806` | Primary surface |
| `--bg-raised` | `#141c0d` | Cards, buttons |
| `--border` | `#1e2a14` | Subtle divider |
| `--border-hot` | `#2e3e20` | Hover border |
| `--bone` | `#c8b87a` | Primary text |
| `--olive` | `#7a9060` | Secondary text / labels |
| `--muted` | `#3a4e2a` | Disabled / dashed-line color |
| `--accent` (orange) | `#c8781a` | Primary action, CTAs, currency |
| `--accent-hot` | `#da8a28` | Accent hover |
| `--rust` | `#8a4a12` | Warning / legacy accent |
| `--red` | `#a83a1a` | Destructive / enemy team |

### Typography
| Family | CSS var | Use |
|---|---|---|
| Black Ops One | `--f-display` | Titles, stencils, buttons |
| Share Tech Mono | `--f-mono` | Body, labels, numbers |
| Days One | `--f-sec` | Weapon names, secondary headings |

All fonts from Google Fonts, loaded in `<head>` of the HTML. Fallbacks: Arial Black, Courier New, Verdana.

**Scale used:**
- Display hero (PLAY): 44px, letter-spacing 0.22em
- Screen title: 48–56px, letter-spacing 0.05em
- Section header: 18–22px, letter-spacing 0.12em
- Body: 14px, line-height 1.5, letter-spacing 0.02em
- Meta / labels: 10–11px mono, letter-spacing 0.15–0.25em, UPPERCASE
- Micro: 9px mono, letter-spacing 0.2em

### Spacing
Ad hoc (inline styles in prototype). Canonical scale to adopt: `4 · 8 · 10 · 14 · 18 · 22 · 28 · 40 · 60` (px).

### Border radius
Almost none — this is an angled/cut-corner aesthetic. Use clip-path instead:
- `--clip-6`: 6px cut corners — small UI chips
- `--clip-10`: 10px cut corners — buttons, cards (default)
- `--clip-16`: 16px cut corners — hero panels

### Shadows
- Hero PLAY: `0 0 28px rgba(218,138,40,0.25)` — soft accent glow (the only "glow" in the system).
- Pixel-art: `drop-shadow(0 2px 0 rgba(0,0,0,0.5))` — 1px hard pixel-drop for tank sprites.

### Overlays (applied globally, on top of all content)
- **Scanlines**: repeating-linear-gradient, 2px on / 1px off, `rgba(0,0,0,var(--scan-opacity))`. Opacity 0.06 in `field`.
- **Grain**: SVG fractal noise, opacity 0.12 in `field`.
- **Vignette**: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)`.

Respect `prefers-reduced-motion` by disabling the counter animation and any future motion; overlays can stay.

---

## Assets

All in `assets/`. Pixel-art PNGs, designed at 1× and scaled with `image-rendering: pixelated`.

| File | Use |
|---|---|
| `solshot-logo.png`, `solshot-logo-transparent.png` | Wordmark (fallback — prefer the inline `<Wordmark>` React component) |
| `tank.png`, `tank-turret.png` | Base tank sprites |
| `tank-tinted.png`, `tank-turret-tinted.png` | Player-color variants |
| `destroyed-tank.png` | AAR loser state |
| `bg-desert.png`, `bg-jungle.png`, `bg-moon.png` | Terrain backgrounds (In-Game HUD) |
| `w-single.png`, `w-sniper.png`, `w-heatseeker.png`, `w-homing.png`, `w-crazy-ivan.png`, `w-napalm.png`, `w-jackhammer.png`, `w-big.png` | Weapon icons for shop/loadout |
| `badge-bronze.png`, `badge-silver.png`, `badge-gold.png`, `badge-platinum.png`, `badge-diamond.png` | Rank badges |

Production: re-export at 2× for retina if needed, or replace with vector versions. Keep the pixel-art silhouette.

---

## Files

| Path | What it is |
|---|---|
| `SolShot Redesign.html` | Prototype entry — loads React via Babel, mounts all screens |
| `styles/tokens.css` | **Design token source of truth.** Port directly. |
| `src/MainMenu.jsx` | Main menu screen |
| `src/Deploy.jsx`, `src/ChallengeFlow.jsx` | Deploy / challenge flow |
| `src/WeaponShop.jsx` | 30s kit-phase shop |
| `src/InGameHUD.jsx` | In-game HUD preview |
| `src/PostMatch.jsx` | After Action Report |
| `src/Barracks.jsx` | Profile / combat record |
| `src/Armory.jsx` | SOL cosmetics shop |
| `src/Loadout.jsx` | Consumables picker |
| `src/Prestige.jsx` | Prestige tiers |
| `src/shared.jsx` | `Wordmark`, `Terrain`, common primitives |
| `assets/` | All images (see Assets table above) |

---

## Recommended implementation order

1. **Port `tokens.css`** verbatim. Verify fonts load. Add scanline + grain + vignette overlay components.
2. **Build shared primitives**: `Wordmark`, `<Button variant="primary|secondary|ghost">`, clip-path utility classes, `Overlay` component, rank badge.
3. **Main Menu** — simplest route, uses every primitive. Ship this first to lock the design language.
4. **Barracks** and **Armory** — mostly static, good warm-up for list/card layouts.
5. **Deploy** and **Loadout** — form-state screens, moderate complexity.
6. **Weapon Shop** — adds timer + live gold state.
7. **Post-Match Report** — data-driven, but read-only.
8. **In-Game HUD** — coordinate with game engine team. HUD only; gameplay stays in engine.

## Open questions for product

- Real route structure? `/play`, `/shop`, `/match/:id`, `/profile`? Prototype uses flat routes.
- Wallet connection happens before Main Menu or on the menu itself?
- Are all 3 themes (`field` / `crt` / `poster`) shipping, or just `field`? Prototype defaults to field.
- Does the callsign on Barracks edit in place, or via a modal?
- In-game HUD: React overlay on a canvas game, or fully inside the game engine?
