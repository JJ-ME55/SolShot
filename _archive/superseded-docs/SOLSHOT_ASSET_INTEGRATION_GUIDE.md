# SolShot Asset Integration Prompt

Use this prompt when working with Claude on the SolShot codebase to integrate the art assets from the `Assets/` folder.

---

## PROMPT (copy from here)

---

I need you to integrate the game art assets from `Assets/` into the SolShot codebase. Here is exactly which image goes where and how each is used. The codebase has two rendering layers: **Phaser** (canvas-based game engine) and **React** (UI overlay). Some images are loaded by Phaser via `this.load.image()`, others are used in React components via `<img>` tags or CSS, and some are loaded into canvas elements via `new Image()`.

## ASSET DIRECTORY STRUCTURE

All source images are in `Assets/` at the project root. They need to be placed in the correct subdirectories under `client/public/assets/images/` for Phaser assets, or imported/referenced from React components.

---

## 1. WEAPON ICONS (Phaser — weapon selector HUD)

**Where they go:** `client/public/assets/images/logos/standard/`
**How they're loaded:** In `client/src/weapons/packs/Standard/logos.js`, each weapon has a canvas element that loads a 30x30 `.webp` image via `new Image()`. The file naming convention uses underscores and `.webp` format.
**Display size:** 30x30 pixels (rendered on canvas)

Convert each PNG to 30x30 `.webp` and place in the logos directory. Match the existing naming convention exactly:

| Source File (Assets/) | Target Path | Replaces/Creates |
|---|---|---|
| `SingleShot.png` | `logos/standard/Single_Shot.webp` | Existing file |
| `3Shot.png` | `logos/standard/3_Shot.webp` | Existing file |
| `Heatseeker.png` | `logos/standard/Heatseeker.webp` | Existing file |
| `Napalm.png` | `logos/standard/Napalm.webp` | Existing file |
| `Sniper.png` | `logos/standard/Sniper_Rifle.webp` | Existing file |
| `HomingMissile_2.png` | `logos/standard/Homing_Missile.webp` | Existing file |
| `MountainMover.png` | `logos/standard/Mountain_Mover.webp` | Existing file |
| `PileDriver.png` | `logos/standard/Pile_Driver.webp` | Existing file (crop Gemini watermark first) |
| `JackHammer.png` | `logos/standard/Jackhammer.webp` | Existing file (crop Gemini watermark first) |
| `HailStorm.png` | `logos/standard/Hail_Storm.webp` | Existing file (crop Gemini watermark first) |
| `ChainReaction.png` | `logos/standard/Chain_Reaction.webp` | Existing file |
| `CrazyIvan.png` | `logos/standard/Crazy_Ivan.webp` | Existing file |
| `Dirtball.png` | `logos/standard/Dirtball.webp` | Existing file |
| `Spider.png` | `logos/standard/Spider.webp` | Existing file |
| `MagicWall.png` | `logos/standard/Magic_Wall.webp` | Existing file |
| `TommyGun.png` | `logos/standard/Tommy_Gun.webp` | Existing file |
| `BigShot.png` | `logos/standard/Big_Shot.webp` | Existing file (NEW ART) |
| `Cruiser.png` | `logos/standard/Cruiser.webp` | Existing file (NEW ART) |

**IMPORTANT:** The PNG source files have dark backgrounds (#0A0C08) baked in. For the weapon selector, you need to:
1. Remove the dark background (make transparent)
2. Resize to 30x30
3. Convert to .webp
4. The cream (#E8DCC8) icon should be the only visible content

Use ImageMagick or similar:
```bash
# For each weapon icon:
convert Assets/SingleShot.png -resize 30x30 -fuzz 15% -transparent "#0A0C08" logos/standard/Single_Shot.webp
```

---

## 2. TANK SPRITES (Phaser — drawn to canvas)

**Where they go:** Not loaded as static files. Tanks are currently drawn procedurally in `client/src/classes/Tank.js` using canvas 2D context (36x24 pixel sprites drawn in code).
**How to integrate:** Replace the procedural drawing code with image-based sprites.

| Source File | Usage | Notes |
|---|---|---|
| `Tank.png` | Active tank sprite | Replace the canvas drawing in Tank.js constructor with this image. White/gray base allows recoloring per player via canvas tinting. |
| `TankDestroyed.png` | Destroyed tank state | Show when tank HP reaches 0. Currently no destroyed state exists — this is a NEW feature. |
| `TankTurret.png` | Turret sprite | Currently the turret is drawn procedurally in `client/src/classes/Turret.js`. Replace with this image. The turret rotates based on player angle input. |

**Integration approach for Tank.js:**
```javascript
// Instead of drawing on canvas, load the image:
// In MainScene preload:
this.load.image('tank-sprite', 'assets/images/sprites/tank.png')
this.load.image('tank-destroyed', 'assets/images/sprites/tank-destroyed.png')
this.load.image('turret-sprite', 'assets/images/sprites/turret.png')
```

Place these at: `client/public/assets/images/sprites/`

---

## 3. BACKGROUNDS (Phaser — battle scene backdrop)

**Where they go:** `client/public/assets/images/backgrounds/`
**How they're loaded:** Currently the background is generated procedurally in `MainScene.createBackground()` as a solid black or gradient canvas. Replace with themed background images.
**Display:** Full viewport width/height, rendered at depth -3 (behind everything).

| Source File | Background Theme | Used When |
|---|---|---|
| `DesertBG.png` | Desert/sand landscape | Random selection or match setting |
| `ArcticBG.png` | Snow/ice landscape | Random selection or match setting |
| `VolcanicBG.png` | Lava/volcanic landscape | Random selection or match setting |
| `JungleBG.png` | Tropical jungle | Random selection or match setting |
| `MoonBG.png` | Lunar/space setting | Random selection or match setting |

**Integration in MainScene:**
```javascript
// In preload:
this.load.image('bg-desert', 'assets/images/backgrounds/desert.png')
this.load.image('bg-arctic', 'assets/images/backgrounds/arctic.png')
this.load.image('bg-volcanic', 'assets/images/backgrounds/volcanic.png')
this.load.image('bg-jungle', 'assets/images/backgrounds/jungle.png')
this.load.image('bg-moon', 'assets/images/backgrounds/moon.png')

// In createBackground(), replace the procedural canvas with:
const bgKeys = ['bg-desert','bg-arctic','bg-volcanic','bg-jungle','bg-moon']
const bgKey = bgKeys[Math.floor(Math.random() * bgKeys.length)]
this.add.image(this.renderer.width/2, this.renderer.height/2, bgKey)
  .setDisplaySize(this.renderer.width, this.renderer.height)
  .setDepth(-3)
```

---

## 3B. TERRAIN BIOME PAIRING (Phaser — terrain layers must match background)

**THE PROBLEM:** The terrain in `client/src/graphics/terrain.js` is hardcoded with green grass/earth layers. The `createLayers()` function loads 5 tileable pattern images (`./assets/images/1.png` through `./assets/images/5.png`) that are all green. This means arctic, desert, volcanic, and moon backgrounds will all have green rolling hills in front of them, which looks wrong.

**THE FIX:** Create 5 biome-specific terrain texture sets (5 layers each = 25 small tileable PNGs), and select the correct set based on which background was randomly chosen.

### Current code in `terrain.js`:

```javascript
// In createLayers():
img[index].src = `./assets/images/${index + 1}.png`;
```

### New approach — biome-aware terrain:

**Step 1:** Store the chosen biome in the scene so terrain.js can read it:

```javascript
// In MainScene.createBackground() — pick biome FIRST, store it:
const biomes = ['desert', 'arctic', 'volcanic', 'jungle', 'moon']
this.currentBiome = biomes[Math.floor(Math.random() * biomes.length)]

const bgKey = 'bg-' + this.currentBiome
this.add.image(this.renderer.width/2, this.renderer.height/2, bgKey)
  .setDisplaySize(this.renderer.width, this.renderer.height)
  .setDepth(-3)
```

**Step 2:** Modify `createLayers()` in `terrain.js` to use the biome:

```javascript
// Change this line:
img[index].src = `./assets/images/${index + 1}.png`;

// To this:
const biome = terrain.scene.currentBiome || 'jungle'
img[index].src = `./assets/images/terrain/${biome}/${index + 1}.png`;
```

**Step 3:** Also update the fallback layer colors to match the biome. Replace the hardcoded green layers:

```javascript
// Current (hardcoded green):
var layers = [
  {color: 'rgba(0,190,0,1)', width: 10},
  {color: 'rgba(0,180,0,1)', width: 30},
  {color: 'rgba(0,160,30,1)', width: 70},
  {color: 'rgba(0,140,50,1)', width: 130},
  {color: 'rgba(0,120,50,1)', width: 200}
]

// New (biome-aware):
const biomeColors = {
  jungle: [
    {color: 'rgba(0,190,0,1)', width: 10},
    {color: 'rgba(0,180,0,1)', width: 30},
    {color: 'rgba(0,160,30,1)', width: 70},
    {color: 'rgba(0,140,50,1)', width: 130},
    {color: 'rgba(0,120,50,1)', width: 200}
  ],
  desert: [
    {color: 'rgba(210,180,120,1)', width: 10},
    {color: 'rgba(194,160,100,1)', width: 30},
    {color: 'rgba(178,140,80,1)', width: 70},
    {color: 'rgba(160,120,60,1)', width: 130},
    {color: 'rgba(140,100,50,1)', width: 200}
  ],
  arctic: [
    {color: 'rgba(230,240,250,1)', width: 10},
    {color: 'rgba(200,220,240,1)', width: 30},
    {color: 'rgba(170,200,230,1)', width: 70},
    {color: 'rgba(140,175,210,1)', width: 130},
    {color: 'rgba(110,150,190,1)', width: 200}
  ],
  volcanic: [
    {color: 'rgba(80,60,60,1)', width: 10},
    {color: 'rgba(60,40,40,1)', width: 30},
    {color: 'rgba(50,30,30,1)', width: 70},
    {color: 'rgba(40,20,20,1)', width: 130},
    {color: 'rgba(30,15,15,1)', width: 200}
  ],
  moon: [
    {color: 'rgba(180,180,185,1)', width: 10},
    {color: 'rgba(155,155,160,1)', width: 30},
    {color: 'rgba(130,130,135,1)', width: 70},
    {color: 'rgba(105,105,110,1)', width: 130},
    {color: 'rgba(80,80,85,1)', width: 200}
  ]
}

const biome = terrain.scene.currentBiome || 'jungle'
var layers = biomeColors[biome]
```

### Terrain texture files to create:

Place in `client/public/assets/images/terrain/{biome}/1.png` through `5.png`.
Each is a small tileable texture (same dimensions as the existing `1.png`–`5.png`).

| Biome | Layer 1 (surface) | Layer 2 | Layer 3 | Layer 4 | Layer 5 (deepest) |
|-------|-------------------|---------|---------|---------|-------------------|
| `jungle/` | Bright grass green | Medium grass | Dark green earth | Rich soil brown-green | Deep earth dark green |
| `desert/` | Light sand tan | Warm sand | Darker sand/clay | Red-brown clay | Dark rock brown |
| `arctic/` | White snow | Light blue-white ice | Blue-gray packed snow | Slate blue permafrost | Dark blue-gray rock |
| `volcanic/` | Dark charcoal gray | Darker gray-red | Black rock with red flecks | Deep black basalt | Near-black obsidian |
| `moon/` | Light silver-gray regolith | Medium gray dust | Darker gray rock | Charcoal gray | Near-black moon rock |

### Generating terrain textures:

**Option A — ImageMagick color-shift from existing green textures:**

```bash
mkdir -p client/public/assets/images/terrain/{jungle,desert,arctic,volcanic,moon}

# Jungle: just copy existing green textures
for i in 1 2 3 4 5; do
  cp client/public/assets/images/$i.png client/public/assets/images/terrain/jungle/$i.png
done

# Desert: hue-shift green to tan/brown
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 100,60,50 client/public/assets/images/terrain/desert/$i.png
done

# Arctic: hue-shift to blue-white, desaturate
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 120,30,200 client/public/assets/images/terrain/arctic/$i.png
done

# Volcanic: darken dramatically, shift toward red-black
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 40,80,0 client/public/assets/images/terrain/volcanic/$i.png
done

# Moon: full desaturate to grayscale
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 90,0,100 client/public/assets/images/terrain/moon/$i.png
done
```

**Option B — Generate fresh textures in Gemini (better quality):**

Use these prompts to create tileable terrain textures for each biome. Each should be a small seamless tile (64x64 or 128x128):

> **Desert Layer 1 (surface):** Seamless tileable texture of light sand surface, viewed from above. Warm tan color (#D2B478). Subtle grain and small pebble detail. No shadows, flat lighting. 64x64 pixels.

> **Arctic Layer 1 (surface):** Seamless tileable texture of packed white snow surface, viewed from above. Bright white (#E6F0FA) with very subtle blue crystal sparkle. No shadows, flat lighting. 64x64 pixels.

> **Volcanic Layer 1 (surface):** Seamless tileable texture of dark charcoal volcanic rock surface, viewed from above. Dark gray (#504040) with tiny orange-red cracks suggesting heat below. No shadows, flat lighting. 64x64 pixels.

> **Moon Layer 1 (surface):** Seamless tileable texture of lunar regolith (moon dust) surface, viewed from above. Light silver-gray (#B4B4B9) with tiny crater dimples. No shadows, flat lighting. 64x64 pixels.

Repeat for layers 2-5, going progressively darker for each biome.

### Preloading terrain textures:

Add to MainScene preload (or LoadingScene) so they're ready before terrain draws:

```javascript
// In preload:
const biomes = ['jungle', 'desert', 'arctic', 'volcanic', 'moon']
biomes.forEach(biome => {
  for (let i = 1; i <= 5; i++) {
    this.load.image(`terrain-${biome}-${i}`, `assets/images/terrain/${biome}/${i}.png`)
  }
})
```

Note: If you use the `new Image()` approach that `createLayers()` currently uses (loading images directly into canvas patterns), you don't need Phaser preloading — the existing `img[index].src = ...` pattern handles it. Just change the path.

---

## 4. LOGOS & BRANDING (React — UI screens + Phaser loading)

**Where they go:** `client/public/assets/images/` and `client/public/`
**How they're used:** Mix of Phaser `this.load.image()` and React `<img>` references.

| Source File | Usage | Target Path | Used In |
|---|---|---|---|
| `SOLSHOT_Logo.png` | Icon mark (shell in crosshair) | `client/public/assets/images/logo.png` | LoadingScreen — `this.load.image('logo', 'assets/images/logo.png')` — the main logo shown during load. **Replaces current placeholder.** |
| `SOLSHOT_Transparent.png` | Full wordmark with tagline | `client/public/assets/images/solshot-wordmark.png` | MenuScreen header, About screen |
| `TransparentLogoMonochrome.png` | Monochrome version | `client/public/assets/images/solshot-mono.png` | Dark-themed screens where color logo is too busy |
| `Solshotbackground.png` | Menu background | `client/public/assets/images/menu-bg.png` | MenuScreen background |

### PWA / Browser Assets:

| Source File | Usage | Target Path |
|---|---|---|
| `SOLSHOT_Logo.png` | Favicon (resize to 32x32) | `client/public/favicon.ico` |
| `SOLSHOT_Logo.png` | PWA icon small (resize to 192x192) | `client/public/logo192.png` |
| `SOLSHOT_Logo.png` | PWA icon large (resize to 512x512) | `client/public/logo512.png` |

Also update `client/public/manifest.json`:
```json
{
  "short_name": "SolShot",
  "name": "SolShot - Artillery Battle Arena",
  "icons": [
    { "src": "favicon.ico", "sizes": "64x64 32x32 24x24 16x16", "type": "image/x-icon" },
    { "src": "logo192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "logo512.png", "type": "image/png", "sizes": "512x512" }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#0A0C08",
  "background_color": "#0A0C08"
}
```

And update `client/public/index.html` `<title>` and `<meta>`:
```html
<title>SolShot</title>
<meta name="description" content="1v1 Artillery Battle Arena on Solana" />
```

---

## 5. SOCIAL / MARKETING (HTML meta tags)

| Source File | Usage | Target Path | Implementation |
|---|---|---|---|
| `Solshot_OpenGraph.png` | Social sharing preview (1200x630) | `client/public/og-image.png` | Add to index.html: `<meta property="og:image" content="%PUBLIC_URL%/og-image.png" />` |
| `Solshot_Banner.png` | Twitter card / Telegram splash | `client/public/banner.png` | `<meta name="twitter:image" content="%PUBLIC_URL%/banner.png" />` |

Add these meta tags to `client/public/index.html` `<head>`:
```html
<meta property="og:title" content="SolShot - Artillery Battle Arena" />
<meta property="og:description" content="1v1 tank battles with SOL wagers on Solana" />
<meta property="og:image" content="%PUBLIC_URL%/og-image.png" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="SolShot" />
<meta name="twitter:image" content="%PUBLIC_URL%/banner.png" />
```

---

## 6. PRESTIGE BADGES (React — PrestigeScreen)

**Where they go:** `client/public/assets/images/badges/`
**How they're used:** Displayed in the PrestigeScreen React component showing the player's current tier and available upgrades. Also shown as small icons next to player names in the lobby and scoreboard.

| Source File | Tier | Target Path |
|---|---|---|
| `BronzeBadge.png` | Bronze (0-99 SHOT burned) | `badges/bronze.png` |
| `SilverBadge.png` | Silver (100-499 SHOT) | `badges/silver.png` |
| `GoldBadge.png` | Gold (500-1999 SHOT) | `badges/gold.png` |
| `PlatinumBadge.png` | Platinum (2000-4999 SHOT) | `badges/platinum.png` |
| `DiamondBadge.png` | Diamond (5000+ SHOT) | `badges/diamond.png` |

In PrestigeScreen React component:
```jsx
<img src={`/assets/images/badges/${tierName}.png`} alt={tierName} className="badge-icon" />
```

Small badge icon next to player names (lobby, scoreboard): resize to 24x24 inline.

---

## 7. CURRENCY ICONS (React — HUD, wallet display)

**Where they go:** `client/public/assets/images/icons/`
**How they're used:** Displayed inline in React HUD components next to balance numbers.

| Source File | Usage | Target Path | Display Size |
|---|---|---|---|
| `ShotCoin.png` | SHOT token balance indicator | `icons/shot-coin.png` | 20-24px inline next to SHOT balance |
| `GoldIcon.png` | In-match gold currency | `icons/gold.png` | 20-24px inline next to gold balance in BattleHUD |
| `GreenSolIcon.png` | SOL balance indicator | `icons/sol.png` | 20-24px inline next to SOL balance in TopBar (crop Gemini watermark first) |

In React components:
```jsx
// TopBar.jsx - SOL balance
<img src="/assets/images/icons/sol.png" alt="SOL" style={{width: 20, height: 20}} />
<span>{solBalance} SOL</span>

// BattleHUD ScoreBoard - Gold
<img src="/assets/images/icons/gold.png" alt="Gold" style={{width: 20, height: 20}} />
<span>{goldBalance}G</span>

// PrestigeScreen / TopBar - SHOT balance
<img src="/assets/images/icons/shot-coin.png" alt="SHOT" style={{width: 20, height: 20}} />
<span>{shotBalance} SHOT</span>
```

---

## 8. FILES TO DELETE (duplicates/inferior versions)

These are alternate versions that scored lower in review. Remove from `Assets/` to avoid confusion:

- `Heatseeker_2.png` (gradient style, doesn't match)
- `Napalm_2.png` (gradient style, doesn't match)
- `CrazyIvan_2.png` (inferior to CrazyIvan.png)
- `HomingMissile.png` (inferior to HomingMissile_2.png)
- `MountainMover_.png` (duplicate with underscore)
- `BronzeBadge2.png` (alternate, not chosen)
- `SilverBadge2.png`, `SilverBadge3.png` (alternates)
- `GoldBadge2.png` (alternate)
- `PlatinumBadge2.png` (alternate)
- `DiamondBadge2.png`, `DiamondBadge3.png` (alternates)
- `SOLSHOT_logoBlack.png` (black background version, not needed)
- `SOLSHOT_logo_Transparent.png` (duplicate of SOLSHOT_Transparent.png)
- `TransparentColourLogo.png` (colour version, monochrome preferred)
- `DesertBG_ArcticBG.png` (combined preview, not game asset)
- `Desert_Arctic_Volcanic_BG.png` (combined preview, not game asset)
- `3Badge_BronzeSilverGold.png` (combined preview, not game asset)

---

## 9. CONVERSION COMMANDS

Run these from the project root to prepare all assets:

```bash
# Create target directories
mkdir -p client/public/assets/images/logos/standard
mkdir -p client/public/assets/images/sprites
mkdir -p client/public/assets/images/backgrounds
mkdir -p client/public/assets/images/badges
mkdir -p client/public/assets/images/icons

# Weapon icons: remove dark bg, resize to 30x30, convert to webp
for file in SingleShot 3Shot Heatseeker Napalm Sniper MountainMover ChainReaction CrazyIvan Dirtball Spider MagicWall TommyGun BigShot Cruiser; do
  convert "Assets/${file}.png" -resize 30x30 -fuzz 20% -transparent "#0A0C08" "client/public/assets/images/logos/standard/${file}.webp"
done

# Special cases with different source/target names:
convert Assets/HomingMissile_2.png -resize 30x30 -fuzz 20% -transparent "#0A0C08" client/public/assets/images/logos/standard/Homing_Missile.webp
convert Assets/Sniper.png -resize 30x30 -fuzz 20% -transparent "#0A0C08" client/public/assets/images/logos/standard/Sniper_Rifle.webp
convert Assets/PileDriver.png -resize 30x30 -fuzz 20% -transparent "#0A0C08" client/public/assets/images/logos/standard/Pile_Driver.webp
convert Assets/JackHammer.png -resize 30x30 -fuzz 20% -transparent "#0A0C08" client/public/assets/images/logos/standard/Jackhammer.webp
convert Assets/HailStorm.png -resize 30x30 -fuzz 20% -transparent "#0A0C08" client/public/assets/images/logos/standard/Hail_Storm.webp

# Tank sprites (keep transparency, no bg removal needed)
cp Assets/Tank.png client/public/assets/images/sprites/tank.png
cp Assets/TankDestroyed.png client/public/assets/images/sprites/tank-destroyed.png
cp Assets/TankTurret.png client/public/assets/images/sprites/turret.png

# Backgrounds
cp Assets/DesertBG.png client/public/assets/images/backgrounds/desert.png
cp Assets/ArcticBG.png client/public/assets/images/backgrounds/arctic.png
cp Assets/VolcanicBG.png client/public/assets/images/backgrounds/volcanic.png
cp Assets/JungleBG.png client/public/assets/images/backgrounds/jungle.png
cp Assets/MoonBG.png client/public/assets/images/backgrounds/moon.png

# Badges
cp Assets/BronzeBadge.png client/public/assets/images/badges/bronze.png
cp Assets/SilverBadge.png client/public/assets/images/badges/silver.png
cp Assets/GoldBadge.png client/public/assets/images/badges/gold.png
cp Assets/PlatinumBadge.png client/public/assets/images/badges/platinum.png
cp Assets/DiamondBadge.png client/public/assets/images/badges/diamond.png

# Currency icons
cp Assets/ShotCoin.png client/public/assets/images/icons/shot-coin.png
cp Assets/GoldIcon.png client/public/assets/images/icons/gold.png
cp Assets/GreenSolIcon.png client/public/assets/images/icons/sol.png

# Logos & branding
cp Assets/SOLSHOT_Logo.png client/public/assets/images/logo.png
cp Assets/SOLSHOT_Transparent.png client/public/assets/images/solshot-wordmark.png
cp Assets/TransparentLogoMonochrome.png client/public/assets/images/solshot-mono.png
cp Assets/Solshotbackground.png client/public/assets/images/menu-bg.png

# PWA icons (resize from logo)
convert Assets/SOLSHOT_Logo.png -resize 192x192 client/public/logo192.png
convert Assets/SOLSHOT_Logo.png -resize 512x512 client/public/logo512.png
convert Assets/SOLSHOT_Logo.png -resize 32x32 client/public/favicon.ico

# Social / OG images
cp Assets/Solshot_OpenGraph.png client/public/og-image.png
cp Assets/Solshot_Banner.png client/public/banner.png

# Terrain biome textures (color-shift from existing green textures)
mkdir -p client/public/assets/images/terrain/{jungle,desert,arctic,volcanic,moon}

# Jungle: copy existing green textures as-is
for i in 1 2 3 4 5; do
  cp client/public/assets/images/$i.png client/public/assets/images/terrain/jungle/$i.png
done

# Desert: hue-shift green to tan/brown
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 100,60,50 client/public/assets/images/terrain/desert/$i.png
done

# Arctic: hue-shift to blue-white, desaturate heavily
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 120,30,200 client/public/assets/images/terrain/arctic/$i.png
done

# Volcanic: darken dramatically, shift toward red-black
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 40,80,0 client/public/assets/images/terrain/volcanic/$i.png
done

# Moon: full desaturate to grayscale
for i in 1 2 3 4 5; do
  convert client/public/assets/images/$i.png -modulate 90,0,100 client/public/assets/images/terrain/moon/$i.png
done
```

---

## SUMMARY TABLE

| Category | Count | Source Dir | Target Dir | Format |
|---|---|---|---|---|
| Weapon Icons | 18 | `Assets/` | `logos/standard/` | 30x30 .webp, transparent bg |
| Tank Sprites | 3 | `Assets/` | `sprites/` | .png, transparent bg |
| Backgrounds | 5 | `Assets/` | `backgrounds/` | .png, full viewport |
| Terrain Biome Textures | 25 | Generated/shifted | `terrain/{biome}/` | Small tileable .png (5 per biome) |
| Logos/Branding | 4 | `Assets/` | `images/` | .png |
| PWA Icons | 3 | `Assets/` | `client/public/` | .png + .ico |
| Social Images | 2 | `Assets/` | `client/public/` | .png |
| Prestige Badges | 5 | `Assets/` | `badges/` | .png |
| Currency Icons | 3 | `Assets/` | `icons/` | .png, 20-24px inline |
| **Total** | **68** | | | |

---

END OF PROMPT
