# SOLSHOT — ART ASSET CHECKLIST
## For GPT-4o / DALL-E / Midjourney Generation

---

## PRIORITY KEY
- P0 = Must have before launch
- P1 = Should have before launch
- P2 = Nice to have, can add post-launch

---

## 1. LOGO & BRANDING (P0)

| Asset | Spec | Variants Needed | Notes |
|-------|------|-----------------|-------|
| Primary logo | "SOLSHOT" wordmark, Black Ops One style, SOL=bone SHOT=orange | Light (for dark bg), dark (for light bg) | Used everywhere: site, socials, game |
| Icon mark | Tank shell / crosshair icon, reads at 32x32 | Full color, monochrome | Favicon, app icon, social avatar |
| Favicon | 32x32 and 16x16 .ico | Single | From icon mark |
| Social banner | 1500x500 Twitter/X header | Single | Logo + tagline + terrain silhouette |
| Discord server icon | 512x512 | Single | Icon mark on dark bg |
| Open Graph image | 1200x630 | Single | For link previews (logo + tagline + screenshot) |

**Prompt direction:** Military stencil aesthetic. No gradients in the icon. Colors: bone (#e8dcc8), orange (#ff6b1a), on black ops (#0a0c08) background. Think Cold War-era markings, not clean tech startup.

---

## 2. WEAPON ICONS (P0)

Need one icon per weapon. Used in shop screen, battle HUD weapon selector, and loadout display. Must read clearly at 40x40px.

| # | Weapon | Style Direction |
|---|--------|-----------------|
| 1 | Single Shot | Simple round shell / bullet |
| 2 | Dirt Ball | Dirt mound / earth ball |
| 3 | Magic Wall | Brick wall segment / shield |
| 4 | 3 Shot | Three small shells in fan pattern |
| 5 | Spider | Spider silhouette or cluster of legs |
| 6 | Heatseeker | Missile with heat waves / target reticle |
| 7 | Napalm | Flame / fire canister |
| 8 | Pile Driver | Downward arrow / hammer |
| 9 | Sniper Rifle | Crosshair / rifle scope |
| 10 | Big Shot | Large shell / fat bomb |
| 11 | Jackhammer | Drill / jackhammer tool |
| 12 | Hail Storm | Cloud with rain of dots |
| 13 | Crazy Ivan | Skull / explosion chaos / question marks |

**Prestige weapons:**
| # | Weapon | Style Direction |
|---|--------|-----------------|
| 14 | Homing Missile | Guided missile with tracking lines |
| 15 | Chain Reaction | Chain links / sequential blast circles |
| 16 | Cruiser | Joystick-guided missile / pilot seat |
| 17 | Tommy Gun | Machine gun barrel / bullet spray |
| 18 | Mountain Mover | Mountain cracking / seismic waves |

**Spec:** Monochrome base (bone/khaki), colored by tier in the UI. Simple geometric shapes, not detailed illustrations. Transparent background PNG. 128x128px source (scales down to 40x40 in-game).

**Prompt direction:** Military technical manual illustration style. Flat, minimal, like icons you'd find on equipment labels. No gradients, no 3D effects.

---

## 3. TANK SPRITES (P1)

| Asset | Spec | Variants | Notes |
|-------|------|----------|-------|
| Tank body | Side-view, facing right | 8 color variants (one per player color) | Matches the 8 colors in data/colors.js |
| Tank turret | Separate from body, rotatable | Same 8 colors | Rotates independently for aiming |
| Tank destroyed | Smoking/damaged version | 8 colors or 1 grayscale | Shown on defeat |

**Colors needed:** Red, Blue, Green, Yellow, Orange, Purple, Teal, Pink (or whatever the 8 player colors are — match to data/colors.js)

**Spec:** Pixel art style or clean vector. Side-view profile. ~64x48px sprite at 1x. Turret origin point clearly defined for rotation.

**Prompt direction:** Chunky military tank silhouette. Not realistic — stylized, almost cartoon-military. Think Metal Slug or Advance Wars proportions. Must look good at small size on terrain.

> NOTE: The current codebase draws tanks programmatically in Phaser. These sprites would replace that. Could also stay with programmatic tanks for v1 and add sprites later.

---

## 4. PRESTIGE BADGES (P1)

| Tier | Badge | Color | Icon Idea |
|------|-------|-------|-----------|
| Bronze | Circular badge | #CD7F32 | Single chevron / star |
| Silver | Circular badge | #C0C0C0 | Double chevron / two stars |
| Gold | Circular badge | #FFD700 | Triple chevron / three stars |
| Platinum | Circular badge | #E5E4E2 | Eagle / diamond shape |
| Diamond | Circular badge | #B9F2FF | Diamond gem / crown |

**Spec:** Circular or shield-shaped. Must read at 24x24px (next to player name). Also used at 64x64 in Prestige screen. Transparent PNG. Military insignia / rank badge aesthetic.

**Prompt direction:** Military rank insignia meets gaming achievement badge. Worn metal texture. Each tier visually distinct at a glance.

---

## 5. TERRAIN THEMES (P2 — Post-Launch)

| Theme | Palette | Notes |
|-------|---------|-------|
| Desert (default) | Sandy yellows, browns | Launch terrain |
| Arctic | Whites, light blues | Snow-covered |
| Volcanic | Dark reds, blacks, lava orange | Lava pools |
| Jungle | Deep greens, browns | Dense vegetation color |
| Moon | Greys, dark sky | Low gravity feel |

**Spec:** These are color palettes + background gradients, not full illustrations. The terrain is a heightmap rendered in Phaser. The "theme" is the fill color, background gradient, and sky gradient.

**What to generate:** One background illustration per theme (1200x800, gradient sky + distant scenery). Terrain fill colors are defined in code.

---

## 6. UI ELEMENTS (P2)

| Asset | Spec | Notes |
|-------|------|-------|
| Gold coin icon | 16x16 and 32x32 | Hexagonal, amber (#FFD700) |
| SOL icon | 16x16 and 32x32 | Diamond/Solana shape, green (#14F195) |
| SHOT icon | 16x16 and 32x32 | Hexagon, amber (#FFB627) |
| Explosion VFX spritesheet | 5-8 frames, 64x64 each | For Phaser animation |
| Smoke trail | 4-6 frames, small | Projectile trail |

> NOTE: Current codebase uses canvas-drawn VFX. These sprites would be upgrades, not blockers.

---

## 7. SOUND EFFECTS (P2)

Not image gen — but listing for completeness. Can source from Freesound.org (CC0) or generate via ElevenLabs SFX.

| Sound | Notes |
|-------|-------|
| Menu click | Short, metallic |
| Weapon fire (generic) | Cannon/mortar thump |
| Explosion (small) | For Single Shot, Sniper |
| Explosion (large) | For Big Shot, Napalm |
| Explosion (chain) | For Jackhammer, Chain Reaction |
| Terrain deform | Earth crumble sound |
| Victory sting | Short military trumpet/fanfare |
| Defeat sting | Low, somber tone |
| Timer tick | Clock tick for shop countdown |
| Gold earned | Coin clink |
| Weapon buy | Cash register / equip sound |

---

## GPT-4o BATCH GENERATION PLAN

To efficiently generate assets with GPT-4o image gen:

### Batch 1: Logo (most important, may need iteration)
- "Military stencil logo, the word SOLSHOT, SOL in cream/bone color, SHOT in orange, black background, no gradients, Cold War military marking style, clean and bold"
- Generate 4 variations, pick best, iterate

### Batch 2: Weapon icons (do all 18 in themed batches)
- "Set of 6 military technical manual style weapon icons, flat monochrome, cream/bone color on transparent background, simple geometric shapes: [list weapons]. Style: equipment label icons, no gradients, no 3D"
- 3 batches of 6

### Batch 3: Prestige badges (5 total)
- "5 military rank insignia badges, circular, worn metal texture: Bronze (copper), Silver, Gold, Platinum (white metal), Diamond (ice blue). Each with increasing complexity. Style: military achievement medal"

### Batch 4: Social assets
- Use logo + terrain silhouette for Twitter banner, OG image, Discord icon

### Batch 5 (Post-launch): Tank sprites, terrain backgrounds, VFX

---

## WHAT TO DO WITH GENERATED ASSETS

1. Generate at highest resolution possible
2. Clean up in Figma (remove artifacts, ensure transparency, crop)
3. Export at required sizes (128px source -> 40px game, 32px favicon, etc.)
4. For weapon icons: save as individual PNGs in `/client/public/assets/images/logos/`
5. For logo: save all variants + favicon
6. For social: upload directly to Twitter/Discord

---

## SUMMARY — WHAT'S NEEDED BEFORE LAUNCH

| Category | Count | Priority |
|----------|-------|----------|
| Logo + icon mark | 2-3 variants | P0 |
| Social assets (banner, avatar, OG) | 3-4 | P0 |
| Weapon icons | 18 | P0 |
| Prestige badges | 5 | P1 |
| Tank sprites | 8 colors x 2 parts | P1 (or stay programmatic) |
| Terrain themes | 1 default (others post-launch) | P2 |
| UI icons (gold, SOL, SHOT) | 3 | P2 (use text chars for now) |
| Sound effects | ~12 | P2 |

**Minimum viable art: Logo + 18 weapon icons + social assets = ~25 images to generate.**
