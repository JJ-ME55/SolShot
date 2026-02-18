# SolShot Asset Integration Guide
## Prompt for Claude: How to use every game image

---

## CONTEXT

SolShot is a browser-based multiplayer artillery game (React + Phaser.js + Node.js) with Solana blockchain integration. The game has a React UI layer for menus/HUD and a Phaser canvas for gameplay (terrain, tanks, projectiles). Assets are stored in `client/public/assets/images/` and referenced either via Phaser's `this.load.image()` or as React `<img>` src paths.

The `Assets/` folder contains all generated game art. Below is every image, what it's for, where it goes in the codebase, and how to wire it up.

---

## ASSET DIRECTORY STRUCTURE

After integration, the client file tree should look like:

```
client/public/assets/images/
├── logos/
│   └── standard/           # Weapon shop icons (30x30 webp)
│       ├── Single_Shot.webp
│       ├── Big_Shot.webp
│       ├── 3_Shot.webp
│       ├── Heatseeker.webp
│       ├── Napalm.webp
│       ├── Sniper_Rifle.webp
│       ├── Homing_Missile.webp
│       ├── Chain_Reaction.webp
│       ├── Crazy_Ivan.webp
│       ├── Spider.webp
│       ├── Tommy_Gun.webp
│       ├── Mountain_Mover.webp
│       ├── Pile_Driver.webp
│       ├── Jackhammer.webp
│       ├── Hail_Storm.webp
│       ├── Magic_Wall.webp
│       ├── Dirtball.webp
│       ├── Cruiser.webp
│       └── ... (all weapon types)
├── backgrounds/            # Battle scene backgrounds (1920x1080)
│   ├── DesertBG.png
│   ├── ArcticBG.png
│   ├── VolcanicBG.png
│   ├── JungleBG.png
│   └── MoonBG.png
├── badges/                 # Prestige tier badges
│   ├── BronzeBadge.png
│   ├── SilverBadge.png
│   ├── GoldBadge.png
│   ├── PlatinumBadge.png
│   └── DiamondBadge.png
├── currency/               # In-game currency icons
│   ├── ShotCoin.png
│   ├── GoldIcon.png
│   └── GreenSolIcon.png
├── tanks/                  # Tank sprites
│   ├── Tank.png
│   ├── TankTurret.png
│   └── TankDestroyed.png
├── branding/               # Logos and social assets
│   ├── SOLSHOT_Logo.png
│   ├── SOLSHOT_Transparent.png
│   ├── TransparentLogoMonochrome.png
│   ├── Solshot_Banner.png
│   └── Solshot_OpenGraph.png
└── (existing assets: logo.png, exit.png, wall.png, etc.)
```

---

## WEAPON ICONS (Shop & HUD)

### How they work in the codebase

Weapon icons are loaded in `client/src/weapons/packs/Standard/logos.js`. Each weapon creates an HTML canvas element and draws a 30x30 webp image onto it. The code pattern is:

```js
export const singleshot = document.createElement('canvas')
singleshot.height = 30
singleshot.width = 30
const singleshotctx = singleshot.getContext('2d')
const singleshotimg = new Image(30, 30)
singleshotimg.src = './assets/images/logos/standard/Single_Shot.webp'
// ... loads and draws to canvas
```

### Integration steps

1. Convert each PNG to WebP: `cwebp -q 90 SingleShot.png -o Single_Shot.webp`
2. Place in `client/public/assets/images/logos/standard/`
3. Filename must match exactly what `logos.js` expects (underscored names)

### Asset → Filename mapping

| Asset File | Target Filename | Weapon ID | Used In |
|-----------|----------------|-----------|---------|
| SingleShot.png | Single_Shot.webp | 0 | WeaponSelector, ShopScreen, ArmoryScreen |
| BigShot.png (newly generated) | Big_Shot.webp | 1 | WeaponSelector, ShopScreen, ArmoryScreen |
| 3Shot.png | 3_Shot.webp | 2 | WeaponSelector, ShopScreen, ArmoryScreen |
| Heatseeker.png | Heatseeker.webp | 4 | WeaponSelector, ShopScreen, ArmoryScreen |
| PileDriver.png | Pile_Driver.webp | 6 | WeaponSelector, ShopScreen, ArmoryScreen |
| JackHammer.png | Jackhammer.webp | 7 | WeaponSelector, ShopScreen, ArmoryScreen |
| Napalm.png | Napalm.webp | 9 | WeaponSelector, ShopScreen, ArmoryScreen |
| Sniper.png | Sniper_Rifle.webp | 10 | WeaponSelector, ShopScreen, ArmoryScreen |
| HailStorm.png | Hail_Storm.webp | 11 | WeaponSelector, ShopScreen, ArmoryScreen |
| Spider.png | Spider.webp | 12 | WeaponSelector, ShopScreen, ArmoryScreen |
| CrazyIvan.png | Crazy_Ivan.webp | 13 | WeaponSelector, ShopScreen, ArmoryScreen |
| TommyGun.png | Tommy_Gun.webp | 15 | WeaponSelector, ShopScreen, ArmoryScreen |
| ChainReaction.png | Chain_Reaction.webp | 16 | WeaponSelector, ShopScreen, ArmoryScreen |
| MagicWall.png | Magic_Wall.webp | 17 | WeaponSelector, ShopScreen, ArmoryScreen |
| Dirtball.png | Dirtball.webp | 19 | WeaponSelector, ShopScreen, ArmoryScreen |
| MountainMover.png | Mountain_Mover.webp | 20 | WeaponSelector, ShopScreen, ArmoryScreen |
| HomingMissile_2.png | Homing_Missile.webp | 24 | WeaponSelector, ShopScreen, ArmoryScreen |
| Cruiser.png (newly generated) | Cruiser.webp | 25 | WeaponSelector, ShopScreen, ArmoryScreen |

**NOTE:** The code also references these weapon logos that DON'T have new art yet (use existing or generate later): Tracer, 5_Shot, Dirt_Mover, Dirt_Slinger, Zapper, Skipper, Worm, Homing_Worm, Pineapple, Firecracker, Scatter_Shot, Ground_Hog. These currently use placeholder colored squares from `extraLogos.js`.

### Processing note
All weapon PNGs need the Gemini sparkle watermark cropped (bottom-right corner) before converting to WebP. Crop in Figma or ImageMagick:
```bash
# Crop bottom-right 40px corner to remove watermark
convert input.png -gravity SouthEast -chop 40x40 output.png
```

---

## BATTLE BACKGROUNDS

### How they work

Currently the background is generated procedurally as a black canvas in `MainScene.createBackground()`. The new backgrounds should replace this with pre-rendered images.

### Integration steps

1. Place PNGs in `client/public/assets/images/backgrounds/`
2. Preload in Phaser's loading scene:
```js
this.load.image('bg-desert', 'assets/images/backgrounds/DesertBG.png')
this.load.image('bg-arctic', 'assets/images/backgrounds/ArcticBG.png')
this.load.image('bg-volcanic', 'assets/images/backgrounds/VolcanicBG.png')
this.load.image('bg-jungle', 'assets/images/backgrounds/JungleBG.png')
this.load.image('bg-moon', 'assets/images/backgrounds/MoonBG.png')
```
3. In `MainScene.createBackground()`, replace the black canvas with:
```js
createBackground = () => {
    const backgrounds = ['bg-desert', 'bg-arctic', 'bg-volcanic', 'bg-jungle', 'bg-moon']
    const selected = backgrounds[Math.floor(Math.random() * backgrounds.length)]
    const bg = this.add.image(this.renderer.width/2, this.renderer.height/2, selected)
    bg.setDisplaySize(this.renderer.width, this.renderer.height)
    bg.setDepth(-3)
}
```

### Asset files

| Asset File | Phaser Key | Description |
|-----------|-----------|-------------|
| DesertBG.png | bg-desert | Sandy dunes, warm tones |
| ArcticBG.png | bg-arctic | Ice/snow, cold blues |
| VolcanicBG.png | bg-volcanic | Lava/fire, reds and oranges |
| JungleBG.png | bg-jungle | Dense foliage, greens |
| MoonBG.png | bg-moon | Lunar surface, grays and blacks |

**DELETE these composites** (they're review/comparison images, not game assets):
- DesertBG_ArcticBG.png
- Desert_Arctic_Volcanic_BG.png

---

## PRESTIGE BADGES

### How they work

Badges display on the **PrestigeScreen** (React component) and in the **TopBar** next to the player's name. Each tier corresponds to a SHOT token burn threshold.

### Integration steps

1. Place PNGs in `client/public/assets/images/badges/`
2. Import in React components:
```jsx
// PrestigeScreen.jsx
const badgeImages = {
    bronze: '/assets/images/badges/BronzeBadge.png',
    silver: '/assets/images/badges/SilverBadge.png',
    gold: '/assets/images/badges/GoldBadge.png',
    platinum: '/assets/images/badges/PlatinumBadge.png',
    diamond: '/assets/images/badges/DiamondBadge.png',
}

// Usage
<img src={badgeImages[currentTier]} alt={`${currentTier} badge`} className="badge-icon" />
```
3. Also display as small 24px icon in TopBar next to player name/wallet address

### Asset files (KEEP versions)

| Asset File | Tier | Burn Threshold | Display Size |
|-----------|------|---------------|-------------|
| BronzeBadge.png | Bronze | 0 SHOT (default) | 48-64px in Prestige, 24px in TopBar |
| SilverBadge.png | Silver | 1,000 SHOT | same |
| GoldBadge.png | Gold | 5,000 SHOT | same |
| PlatinumBadge.png | Platinum | 25,000 SHOT | same |
| DiamondBadge.png | Diamond | 100,000 SHOT | same |

**DELETE these alternates** (inferior versions from art review):
- BronzeBadge2.png
- SilverBadge2.png, SilverBadge3.png
- GoldBadge2.png
- PlatinumBadge2.png
- DiamondBadge2.png, DiamondBadge3.png
- 3Badge_BronzeSilverGold.png (composite preview)

---

## CURRENCY ICONS

### How they work

Currency icons appear in the React HUD during battle and in shop screens:
- **GoldIcon** — In-game gold earned from damage. Shown in BattleHUD ScoreBoard and ShopScreen balance.
- **ShotCoin** — SHOT token balance. Shown in TopBar, PrestigeScreen, and post-match rewards.
- **GreenSolIcon** — SOL balance. Shown in TopBar next to wallet address, and in wager room creation.

### Integration steps

1. Place PNGs in `client/public/assets/images/currency/`
2. Use in React components:
```jsx
// ScoreBoard.jsx — gold display
<img src="/assets/images/currency/GoldIcon.png" alt="gold" className="currency-icon" />
<span>{goldBalance}G</span>

// TopBar.jsx — SOL balance
<img src="/assets/images/currency/GreenSolIcon.png" alt="SOL" className="currency-icon" />
<span>{solBalance} SOL</span>

// TopBar.jsx — SHOT balance
<img src="/assets/images/currency/ShotCoin.png" alt="SHOT" className="currency-icon" />
<span>{shotBalance} SHOT</span>
```

### Asset files

| Asset File | Currency | Where Displayed | Recommended Display Size |
|-----------|----------|----------------|------------------------|
| GoldIcon.png | In-game Gold | BattleHUD, ShopScreen | 20-24px inline with text |
| ShotCoin.png | SHOT Token | TopBar, PrestigeScreen, post-match | 20-24px inline with text |
| GreenSolIcon.png | SOL | TopBar, room creation, wager display | 20-24px inline with text |

---

## TANK SPRITES

### How they work

Tank sprites are drawn on the Phaser canvas. The `Tank` class in `client/src/classes/Tank.js` creates tanks. Currently tanks are drawn procedurally. The new pixel art sprites should replace this.

### Integration steps

1. Place PNGs in `client/public/assets/images/tanks/` (or directly in `client/public/assets/images/`)
2. Preload in Phaser loading scene:
```js
this.load.image('tank-sprite', 'assets/images/tanks/Tank.png')
this.load.image('tank-turret', 'assets/images/tanks/TankTurret.png')
this.load.image('tank-destroyed', 'assets/images/tanks/TankDestroyed.png')
```
3. In `Tank.js`, use sprite instead of procedural drawing:
```js
// Replace canvas-drawn tank with sprite
this.sprite = scene.add.image(x, y, 'tank-sprite')
this.sprite.setTint(playerColor) // Tint for player 1 vs player 2
```
4. On death, swap sprite:
```js
this.sprite.setTexture('tank-destroyed')
```

### Asset files

| Asset File | Purpose | Notes |
|-----------|---------|-------|
| Tank.png | Active tank (both players) | White base — apply tint for P1 (blue) vs P2 (red) |
| TankTurret.png | Rotating turret | Separate from body so it can rotate independently |
| TankDestroyed.png | Dead tank | Shown when HP reaches 0, has smoke/crack damage |

**Tank is pixel art style** — white/gray with black outlines. Keep `image-rendering: pixelated` CSS for crisp pixels at any scale.

---

## BRANDING & SOCIAL

### How they work

These are used across multiple surfaces — not just in-game.

### Asset files

| Asset File | Purpose | Where Used |
|-----------|---------|-----------|
| SOLSHOT_Logo.png | **Primary icon mark** (shell-in-hexagon on dark bg) | Favicon source, PWA icon, app icon, loading screen |
| SOLSHOT_Transparent.png | **Full wordmark** (SOLSHOT text + icon, transparent bg) | MenuScreen header, website header |
| TransparentLogoMonochrome.png | **Monochrome wordmark** (cream on transparent) | Dark backgrounds, overlays, watermarks |
| SOLSHOT_logoBlack.png | Logo on black background | Social media profile picture |
| SOLSHOT_logo_Transparent.png | Logo mark only, transparent bg | Alternative to SOLSHOT_Logo.png for light backgrounds |
| TransparentColourLogo.png | Full-color logo on transparent bg | Press kit, marketing materials |
| Solshot_Banner.png | **Social media banner** (1500x500) | Twitter/X header, Discord banner, Telegram bot banner |
| Solshot_OpenGraph.png | **OG image** (1200x630) | Link previews (Twitter, Discord, Slack, iMessage) |
| Solshotbackground.png | Large background/wallpaper | Press kit, promotional |

### Integration steps

**Loading Screen (replace placeholder "S" logo):**
```js
// In LoadingScene.preload()
this.load.image('logo', 'assets/images/branding/SOLSHOT_Logo.png')
// This already exists — just swap the file
```

**MenuScreen header:**
```jsx
<img src="/assets/images/branding/SOLSHOT_Transparent.png" alt="SolShot" className="menu-logo" />
```

**PWA manifest (client/public/manifest.json):**
```json
{
    "icons": [
        { "src": "assets/images/branding/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "assets/images/branding/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```
→ Export SOLSHOT_Logo.png icon mark at 192x192 and 512x512

**Favicon:**
→ Export SOLSHOT_Logo.png icon mark at 32x32 as favicon.ico, place in `client/public/`

**OG tags (client/public/index.html):**
```html
<meta property="og:image" content="https://solshot.gg/assets/images/branding/Solshot_OpenGraph.png" />
<meta property="og:title" content="SolShot — Artillery Meets DeFi" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="https://solshot.gg/assets/images/branding/Solshot_OpenGraph.png" />
```

---

## COMPLETE DELETE LIST

These files should be removed from the Assets folder (duplicates, inferior alternates, composites, or style violations per art review):

```
DELETE:
- BronzeBadge2.png          (inferior alternate)
- SilverBadge2.png          (inferior alternate)
- SilverBadge3.png          (inferior alternate)
- GoldBadge2.png            (inferior alternate)
- PlatinumBadge2.png        (inferior alternate)
- DiamondBadge2.png         (inferior alternate)
- DiamondBadge3.png         (inferior alternate)
- 3Badge_BronzeSilverGold.png  (composite preview, not a game asset)
- DesertBG_ArcticBG.png     (composite preview)
- Desert_Arctic_Volcanic_BG.png (composite preview)
- Heatseeker_2.png          (gradient style violation)
- Napalm_2.png              (gradient style violation)
- CrazyIvan_2.png           (inferior alternate)
- HomingMissile.png         (inferior to HomingMissile_2.png)
- MountainMover_.png        (duplicate with trailing underscore)
- SOLSHOT_logoBlack.png     (redundant — Logo.png already has dark bg)
- SOLSHOT_logo_Transparent.png  (redundant — use TransparentLogoMonochrome.png)
- Solshotbackground.png     (only for press kit, not needed in game assets)
```

---

## PROCESSING PIPELINE (Batch commands)

```bash
# 1. Crop Gemini watermarks from weapon icons (bottom-right sparkle)
for f in PileDriver.png JackHammer.png HailStorm.png GreenSolIcon.png; do
    convert "$f" -gravity SouthEast -chop 40x40 "cropped_$f"
done

# 2. Convert weapon PNGs to 30x30 WebP for Phaser logos
for f in SingleShot.png 3Shot.png Heatseeker.png Napalm.png Sniper.png \
         HailStorm.png Spider.png CrazyIvan.png TommyGun.png ChainReaction.png \
         MagicWall.png Dirtball.png MountainMover.png HomingMissile_2.png \
         PileDriver.png JackHammer.png BigShot.png Cruiser.png; do
    convert "$f" -resize 30x30 -quality 90 "${f%.png}.webp"
done

# 3. Generate PWA icons from logo
convert SOLSHOT_Logo.png -resize 192x192 icon-192.png
convert SOLSHOT_Logo.png -resize 512x512 icon-512.png
convert SOLSHOT_Logo.png -resize 32x32 favicon.ico

# 4. Move to correct directories
mkdir -p client/public/assets/images/{logos/standard,backgrounds,badges,currency,tanks,branding}
mv *.webp client/public/assets/images/logos/standard/
mv *BG.png client/public/assets/images/backgrounds/
mv *Badge.png client/public/assets/images/badges/
mv GoldIcon.png ShotCoin.png GreenSolIcon.png client/public/assets/images/currency/
mv Tank.png TankTurret.png TankDestroyed.png client/public/assets/images/tanks/
mv SOLSHOT_*.png Solshot_*.png Transparent*.png client/public/assets/images/branding/
```

---

## SUMMARY TABLE

| Category | Count | Status | Integration Effort |
|----------|:-----:|--------|-------------------|
| Weapon Icons | 18 | Ready (crop watermarks, convert to webp) | 30 min |
| Backgrounds | 5 | Ready | 15 min (preload + swap createBackground) |
| Badges | 5 | Ready | 15 min (React img tags) |
| Currency Icons | 3 | Ready | 10 min (React img tags) |
| Tank Sprites | 3 | Ready | 30 min (swap procedural with sprites) |
| Branding/Social | 5 | Ready | 20 min (logo swap, OG tags, PWA icons) |
| **Total** | **39** | **All ready** | **~2 hours total integration** |
