# SOLSHOT ASSET MASTER
### Single Source of Truth — Client Visual & Audio Assets
**Last updated:** 2026-02-17 | **Supersedes:** ASSET_MASTER v1, ASSET_PATHING, ASSET_INTEGRATION_GUIDE, ASSET_INTEGRATION_PROMPT

---

## 0. STATUS SUMMARY

| Category | Generated | Deployed | Remaining |
|----------|-----------|----------|-----------|
| Weapon icons | 18/18 ✅ | 0 (old webp in place) | Deploy + format decision |
| Backgrounds | 5/6 | 0 | 1 (bg-default) |
| Badges | 5/5 ✅ | 0 | Deploy |
| Currency icons | 3/3 ✅ | 0 | Deploy |
| Tank sprites | 3/3 ✅ | 0 | Deploy + code refactor |
| Branding | 5/5 ✅ | 0 | Deploy + favicon/manifest |
| Explosion VFX | 0/2 | 0 | Generate (P2) |
| Discord icon | 0/1 | 0 | Generate (P1) |
| Terrain textures | 0/6 | Old PT in place | Generate or verify |
| Crosshair cursor | 0/1 | 0 | Generate |
| **Totals** | **39 ready** | **0 deployed** | **11 items** |

**Bottom line:** 39 assets in `Assets/` ready to copy into client. 24 legacy files to delete. 11 items still to generate.

---

## 1. FORMAT DECISION (do this first)

Current weapon icons in client are `.webp`. Your new assets are `.png`. Pick one:

**Option A — Keep .png, change code (simplest):**
```javascript
// client/src/data/weapons.js — change one line in getWeaponIconUrl():
const filename = weaponName.replace(/ /g, '_') + '.png';  // was .webp
```
Also update `logos.js` (Phaser loader) to reference `.png` instead of `.webp`.

**Option B — Convert to .webp (best performance):**
```bash
for f in Assets/*.png; do cwebp -q 90 "$f" -o "${f%.png}.webp"; done
```

**Recommendation:** Option A for now. `.png` is fine for 256x256 icons. Optimize later.

---

## 2. DEPLOY SCRIPT

Run from `C:\Users\johnk\SolShot\`. Creates directories and copies all 39 assets.

```bash
#!/bin/bash
CLIENT="client/public/assets/images"
ASSETS="Assets"

# ─── Create new directories ───
mkdir -p "$CLIENT/backgrounds"
mkdir -p "$CLIENT/badges"
mkdir -p "$CLIENT/currency"
mkdir -p "$CLIENT/tanks"
mkdir -p "$CLIENT/branding"

# ─── WEAPON ICONS → logos/standard/ (18 files) ───
cp "$ASSETS/SingleShot.png"     "$CLIENT/logos/standard/Single_Shot.png"
cp "$ASSETS/BigShot.png"        "$CLIENT/logos/standard/Big_Shot.png"
cp "$ASSETS/3Shot.png"          "$CLIENT/logos/standard/3_Shot.png"
cp "$ASSETS/JackHammer.png"     "$CLIENT/logos/standard/Jackhammer.png"
cp "$ASSETS/Heatseeker.png"     "$CLIENT/logos/standard/Heatseeker.png"
cp "$ASSETS/PileDriver.png"     "$CLIENT/logos/standard/Pile_Driver.png"
cp "$ASSETS/CrazyIvan.png"      "$CLIENT/logos/standard/Crazy_Ivan.png"
cp "$ASSETS/Spider.png"         "$CLIENT/logos/standard/Spider.png"
cp "$ASSETS/Sniper.png"         "$CLIENT/logos/standard/Sniper_Rifle.png"
cp "$ASSETS/MagicWall.png"      "$CLIENT/logos/standard/Magic_Wall.png"
cp "$ASSETS/Napalm.png"         "$CLIENT/logos/standard/Napalm.png"
cp "$ASSETS/HailStorm.png"      "$CLIENT/logos/standard/Hail_Storm.png"
cp "$ASSETS/Dirtball.png"       "$CLIENT/logos/standard/Dirtball.png"
cp "$ASSETS/ChainReaction.png"  "$CLIENT/logos/standard/Chain_Reaction.png"
cp "$ASSETS/HomingMissile.png"  "$CLIENT/logos/standard/Homing_Missile.png"
cp "$ASSETS/Cruiser.png"        "$CLIENT/logos/standard/Cruiser.png"
cp "$ASSETS/TommyGun.png"       "$CLIENT/logos/standard/Tommy_Gun.png"
cp "$ASSETS/MountainMover.png"  "$CLIENT/logos/standard/Mountain_Mover.png"

# ─── BACKGROUNDS → backgrounds/ (5 files) ───
cp "$ASSETS/ArcticBG.png"       "$CLIENT/backgrounds/bg-arctic.png"
cp "$ASSETS/DesertBG.png"       "$CLIENT/backgrounds/bg-desert.png"
cp "$ASSETS/JungleBG.png"       "$CLIENT/backgrounds/bg-jungle.png"
cp "$ASSETS/MoonBG.png"         "$CLIENT/backgrounds/bg-moon.png"
cp "$ASSETS/VolcanicBG.png"     "$CLIENT/backgrounds/bg-volcanic.png"

# ─── BADGES → badges/ (5 files) ───
cp "$ASSETS/BronzeBadge.png"    "$CLIENT/badges/badge-bronze.png"
cp "$ASSETS/SilverBadge.png"    "$CLIENT/badges/badge-silver.png"
cp "$ASSETS/GoldBadge.png"      "$CLIENT/badges/badge-gold.png"
cp "$ASSETS/PlatinumBadge.png"  "$CLIENT/badges/badge-platinum.png"
cp "$ASSETS/DiamondBadge.png"   "$CLIENT/badges/badge-diamond.png"

# ─── CURRENCY → currency/ (3 files) ───
cp "$ASSETS/GreenSolIcon.png"   "$CLIENT/currency/icon-sol.png"
cp "$ASSETS/ShotCoin.png"       "$CLIENT/currency/icon-shot.png"
cp "$ASSETS/GoldIcon.png"       "$CLIENT/currency/icon-gold.png"

# ─── TANKS → tanks/ (3 files) ───
cp "$ASSETS/Tank.png"           "$CLIENT/tanks/tank-base.png"
cp "$ASSETS/TankTurret.png"     "$CLIENT/tanks/turret-base.png"
cp "$ASSETS/DestroyedTank.png"  "$CLIENT/tanks/tank-destroyed.png"

# ─── BRANDING → branding/ + legacy replacements (5 files) ───
cp "$ASSETS/SOLSHOT_Logo.png"              "$CLIENT/branding/logo-full.png"
cp "$ASSETS/SOLSHOT_Transparent.png"       "$CLIENT/branding/logo-transparent.png"
cp "$ASSETS/TransparentLogoMonochrome.png" "$CLIENT/branding/logo-monochrome.png"
cp "$ASSETS/Solshot_Banner.png"            "$CLIENT/branding/banner.png"
cp "$ASSETS/Solshot_OpenGraph.png"         "$CLIENT/branding/og-preview.png"

# ─── REPLACE LEGACY PLACEHOLDERS ───
cp "$ASSETS/SOLSHOT_Logo.png"              "$CLIENT/logo.png"
cp "$ASSETS/Solshot_OpenGraph.png"         "client/public/og-preview.png"

echo "✅ 39 assets deployed"
```

---

## 3. DELETE LIST

### 3a. Pocket Tanks remnants — DELETE immediately (24 files)

```bash
cd client/public/assets/images

# PT screenshots (7)
rm -f ptss1.png ptss2.png ptss3.png ptss4.png
rm -f pt_3.png pt_4.png pt_5.png

# Old PT UI icons (16)
rm -f ad-solid.svg
rm -f address-book-regular.png address-book-regular.svg
rm -f clapperboard.png clapperboard.svg
rm -f face-frown-regular.png face-frown-regular.svg
rm -f keyboard-regular.png keyboard-regular.svg
rm -f question-solid.png question-solid.svg
rm -f youtube.png youtube.svg
rm -f screenshot.png title.svg

# Unused font (1)
rm -f ../fonts/DMSans.ttf
```

### 3b. Files to VERIFY before deleting

| File | Used In | Action |
|------|---------|--------|
| `compress.png` | `scenes/loading/index.js` — fullscreen icon | Replace or remove fullscreen toggle |
| `expand.png` | `scenes/loading/index.js` — fullscreen icon | Same |
| `a.png` | Unknown | Inspect — likely PT |
| `b.png` | Unknown | Inspect — likely PT |
| `c.png` | `scenes/scene-1/` — loaded as `'cover'` | PT cover art — delete |
| `exit.png` | Exit button | Keep, retheme later |
| `wall.png` | Magic Wall weapon texture | Keep |
| `cursor.svg` | CSS cursor in `index.css` | Replace with crosshair (see §7) |
| `favicon.ico` | `index.html` | Replace with SolShot version |

### 3c. Old .webp weapon icons — DELETE after confirming .png works

```bash
cd client/public/assets/images/logos/standard
rm -f Single_Shot.webp Big_Shot.webp 3_Shot.webp Jackhammer.webp
rm -f Heatseeker.webp Pile_Driver.webp Crazy_Ivan.webp Spider.webp
rm -f Sniper_Rifle.webp Magic_Wall.webp Napalm.webp Hail_Storm.webp
rm -f Dirtball.webp Chain_Reaction.webp Homing_Missile.webp
rm -f Cruiser.webp Tommy_Gun.webp Mountain_Mover.webp
```

### 3d. Orphaned weapon icons — KEEP for future expansion

These 12 `.webp` files are NOT in `weapons.js` shop and have no replacement PNGs. They're PT weapons you may want to add later:

`5_Shot` · `Dirt_Mover` · `Dirt_Slinger` · `Firecracker` · `Ground_Hog` · `Homing_Worm` · `Pineapple` · `Scatter_Shot` · `Skipper` · `Tracer` · `Worm` · `Zapper`

Generate matching `.png` icons when adding them to the shop.

### 3e. Assets/ folder files — DO NOT DEPLOY (alternates/composites)

| File | Reason |
|------|--------|
| `CrazyIvan_2.png` | Alternate |
| `HomingMissile (2).png` | Alternate |
| `HomingMissile_2.png` | Alternate |
| `Napalm (2).png` | Alternate |
| `TankDestroyed.png` | Duplicate of `DestroyedTank.png` |
| `GoldToken.png` | Alternate of `GoldIcon.png` |
| `SolDiamon.png` | Alternate of `GreenSolIcon.png` |
| `3Badge_BronzeSilverGold.png` | Marketing composite |

---

## 4. STILL NEEDS GENERATING

### P0 — Blocking launch
| Item | Spec |
|------|------|
| `bg-default.png` | 1920x600+, overcast/dusk battlefield sky. Dark olive (#1a2a12) → horizon glow (#4a562a). No foreground. |

### P1 — Should have
| Item | Spec |
|------|------|
| Discord server icon | 512x512, shell in crosshair, no text (Prompt #5 from GPT doc) |
| Crosshair cursor SVG | 32x32, circle + crosshairs, Range Orange (#ff6b1a) 60% opacity |
| `favicon.ico` | Resize `SOLSHOT_Logo.png` to 32x32 + 16x16 |
| `logo192.png` | Resize `SOLSHOT_Logo.png` to 192x192 |
| `logo512.png` | Resize `SOLSHOT_Logo.png` to 512x512 |
| `apple-touch-icon.png` | Resize `SOLSHOT_Logo.png` to 180x180 |

### P2 — Post-launch
| Item | Spec |
|------|------|
| Explosion spritesheet (large) | 768x128, 6 frames (Prompt #41) |
| Explosion spritesheet (small) | 256x64, 4 frames (Prompt #42) |
| 6 default terrain textures | 256x256 tileable, olive-earth palette (see §9) |
| 5 biome terrain sets (30 files) | Desert/arctic/volcanic/jungle/moon variants |

---

## 5. CODE CHANGES REQUIRED

### 5a. weapons.js — icon format
```javascript
// client/src/data/weapons.js
function getWeaponIconUrl(weaponName) {
  const filename = weaponName.replace(/ /g, '_') + '.png';  // was .webp
  return `${process.env.PUBLIC_URL}/assets/images/logos/standard/${filename}`;
}
```

### 5b. logos.js — Phaser icon loader
Change all `.webp` references to `.png` in `client/src/weapons/packs/Standard/logos.js`

### 5c. terrain.js — replace green fallback colors
```javascript
// client/src/graphics/terrain.js line ~87
// REPLACE bright green with olive-earth:
var layers = [
  {color: 'rgba(107,123,61,1)',  width: 10},   // Olive surface
  {color: 'rgba(92,106,53,1)',   width: 30},   // Dark olive
  {color: 'rgba(74,86,42,1)',    width: 70},    // Earth
  {color: 'rgba(58,69,31,1)',    width: 130},   // Dark earth
  {color: 'rgba(42,51,31,1)',    width: 200}    // Deepest
];
```

### 5d. App.js — fix PT title
```javascript
// client/src/App.js line ~29001
title: 'SolShot',  // was 'Pocket Tanks'
```

### 5e. index.html — OG meta tags
```html
<meta property="og:image" content="%PUBLIC_URL%/og-preview.png" />
<meta property="og:title" content="SolShot — Artillery Wagering on Solana" />
<meta property="og:description" content="Aim. Fire. Earn. 1v1 tank battles with real SOL wagers." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="%PUBLIC_URL%/og-preview.png" />
```

### 5f. manifest.json
```json
{
  "name": "SolShot",
  "short_name": "SolShot",
  "description": "Artillery Combat on Solana",
  "theme_color": "#0a0c08",
  "background_color": "#0a0c08",
  "icons": [
    { "src": "favicon.ico", "sizes": "32x32 16x16", "type": "image/x-icon" },
    { "src": "logo192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "logo512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
```

---

## 6. PRESTIGE SYSTEM REFERENCE

Two separate systems — both valid, different purposes:

**Military Ranks** (`data/tiers.js`) — 11 tiers, cosmetic progression:
Unranked → Private → Corporal → Sergeant → Lieutenant → Captain → Major → Colonel → General → Commander → Supreme (0 → 100k SHOT)

**Prestige Badges** (landing page) — 5 tiers, weapon unlocks:
| Badge | SHOT Cost | Weapon Unlocked | File |
|-------|-----------|-----------------|------|
| Bronze | 200 | Homing Missile | `badge-bronze.png` |
| Silver | 500 | Chain Reaction | `badge-silver.png` |
| Gold | 1,200 | Cruiser | `badge-gold.png` |
| Platinum | 2,500 | Tommy Gun | `badge-platinum.png` |
| Diamond | 4,000 | Mountain Mover | `badge-diamond.png` |

---

## 7. DESIGN SYSTEM TOKENS (DO NOT MODIFY)

**Colors** (17 CSS variables in `index.css`):
`--ol` #3d4a2f · `--od` #2a331f · `--kh` #b8a88a · `--ru` #c4510a · `--rg` #ff6b1a · `--am` #ffb627 · `--ad` #a67b1a · `--st` #6b7b8d · `--sd` #3a4550 · `--bn` #e8dcc8 · `--mu` #5c4a3a · `--bk` #0a0c08 · `--gg` #7fff44 · `--rd` #cc2200 · `--sp` #9945FF · `--sg` #14F195 · `--gd` #ffd700

**Fonts:** Black Ops One (headings) · Share Tech Mono (body) · Bebas Neue (numbers)

**Animations:** si · su · sm · sc · fl · vp · dp · wd · ug · eg

---

## 8. SOUND AUDIT

**Music:** `background.mp3`, `intro.mp3`, `winner.mp3` (dedup — exists in root + `others/`)
**SFX:** 28 files in `others/` — explosions (8), weapons (6), terrain (7), misc (5), UI (2)
**Missing:** match start fanfare, turn notification, wager lock chime, wallet connect sound

---

## 9. TERRAIN TEXTURE SPECS (for future generation)

| File | Layer | Color Range | Description |
|------|-------|-------------|-------------|
| `1.png` | Surface (10px) | `#6b7b3d` → `#5c6a35` | Olive topsoil |
| `2.png` | Sub-surface (30px) | `#5c6a35` → `#4a562a` | Darker earth |
| `3.png` | Clay (70px) | `#4a562a` → `#3d4a22` | Clay-brown |
| `4.png` | Rock (130px) | `#3d4a22` → `#2a331f` | Grey-brown stone |
| `5.png` | Deep rock (200px) | `#2a331f` → `#1a2010` | Dark stone |
| `6.png` | Base fill | `#1a1a14` → `#0f0f0a` | Near-black bedrock |

Format: 256x256px, seamless tileable, PNG.

---

## 10. EXECUTION ORDER

```
 1. Run deploy script (§2)                    ← Copy 39 assets
 2. Run delete script (§3a)                   ← Remove 24 PT files
 3. Inspect verify files (§3b)                ← Check compress/expand/a/b/c
 4. Update weapons.js (§5a)                   ← .webp → .png
 5. Update logos.js (§5b)                     ← .webp → .png
 6. Fix terrain colors (§5c)                  ← Green → olive
 7. Fix App.js title (§5d)                    ← "Pocket Tanks" → "SolShot"
 8. Update index.html meta (§5e)              ← OG tags
 9. Update manifest.json (§5f)                ← Icons + theme
10. Delete old .webp weapon icons (§3c)       ← After confirming .png works
11. Generate bg-default.png                   ← Last P0 blocker
12. Generate favicon + logo192 + logo512      ← Resize from SOLSHOT_Logo.png
13. Generate crosshair cursor SVG             ← Replace red arrow
14. Test in browser + Telegram                ← Verify nothing broken
```

---

*Supersedes: SOLSHOT_ASSET_MASTER.md v1, SOLSHOT_ASSET_PATHING.md, SOLSHOT_ASSET_INTEGRATION_GUIDE.md, SOLSHOT_ASSET_INTEGRATION_PROMPT.md*
