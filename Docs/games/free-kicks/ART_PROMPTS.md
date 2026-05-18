# Free-Kick Madness — Art Prompts v0.2 (Flick Kick aesthetic)

Replaces the v0.1 night-floodlit direction. Fish picked **Flick Kick Football** (PikPok) as the visual reference target after frame analysis of his gameplay clips. The aesthetic is:

> Daytime stadium, packed cheering crowd, vivid green pitch, blue sky, classic football kit, cartoonish-stylized but clearly recognisable — family-friendly arcade look.

Reference frames live at `C:\Users\jacob\SolShot\Other Games\Flick kick\` (clips `IMG_5051.MP4` + `Curved shots new.MP4`). When generating with DALL-E / ChatGPT, **upload one of those frames as a reference image** and ask for "match this art style."

Applying [`BALL_GAMES_PLAYBOOK §11`](../../BALL_GAMES_PLAYBOOK.md#11-asset-generation-lessons-dall-e):
- Transparent backgrounds — prompt for it explicitly, follow up with cleanup
- Reference style transfer — feed a Flick Kick screenshot as reference
- Specify proportions explicitly — DALL-E does not respect implicit aspect ratios
- Element overlap kills frame-slicing — keep each sprite isolated

Plan on 3-5 DALL-E iterations per asset. All sprite assets need a final pngjs measurement pass to capture true bounding box + visible centre.

## Style anchor

> *"A bright daytime football stadium, packed with a colourful cheering crowd. Vivid blue sky, intense green pitch with subtle mowing stripes, classic FIFA-style goal with white posts and white netting. Cartoonish-stylised art, like a modern mobile arcade football game — clean lines, saturated colours, family-friendly, slightly comic-book."*

Reference Flick Kick by name in the prompt when iterating — many image models recognise it.

## Save location

All generated assets go in:

```
C:\Users\jacob\solshot-free-kicks\public\assets\
```

Filenames are listed under each asset below. The Phaser scene auto-loads from there — if the file is present, the scene uses it; if missing, it falls back to the Phaser primitive. So you can drop one asset at a time and see the layered improvement.

---

## 1. Stadium hero background — `stadium-hero.png`

**Purpose:** Single hero image rendered behind everything as the world backdrop. The goal, players, ball, and HUD all composite ON TOP. Single image, no animation in v1.

**Dimensions:** 800 × 1200 px (matches our virtual canvas aspect). The image fills the canvas; the goal-render area must be EMPTY (transparent or sky-coloured) in the centre so the goal sprite composites cleanly.

### Prompt

> A bright daytime football stadium scene viewed from behind the kicker's position on the pitch. **800×1200 portrait** aspect ratio. **Match the visual style of Flick Kick Football (the PikPok iOS game) exactly** — cartoonish-stylised but recognisable.
>
> Layers from top to bottom:
>
> 1. **Sky** (top ~25% of image): bright clear daytime blue, gentle gradient from lighter at horizon (~#9ec5e8) to deeper blue above (~#5fa5d9). No clouds, no haze.
>
> 2. **Stadium roof line** (~30% from top): dark teal-grey curved roof structure with small bright lighting fixtures along its underside; thin vertical white pillars supporting it at the sides.
>
> 3. **Far crowd** (~35-45% from top): tiered stadium seating packed with a colourful cheering crowd rendered as red/orange/blue/white/yellow coloured speckles — no detailed faces. Densely packed.
>
> 4. **Mid stadium banner row** (~45% from top): a clear horizontal advertising band running the full width — alternating red, white, and blue rectangular ad panels, no text (we'll overlay our own logos later).
>
> 5. **Near crowd** (~50-60% from top): slightly more detailed crowd silhouettes with visible flag bunting and head dots. Occasional waving flags (blue + white).
>
> 6. **Goal-area band** (~58-62% from top): a darker horizontal band where the goal will composite on top — DO NOT INCLUDE A GOAL FRAME HERE, leave this band clean so a goal sprite can be placed cleanly.
>
> 7. **Pitch** (bottom ~38%): bright vivid green grass with subtle horizontal mowing stripes (alternating slightly-darker and slightly-lighter bands). A white penalty arc curve visible in the lower foreground. White goal line visible just in front of the goal-area band.
>
> No players, no ball, no HUD, no text labels. Cartoonish-stylised art style — saturated colours, clean edges, slight comic-book line work. Match Flick Kick Football's visual feel.

**Failure modes to watch:**
- DALL-E sometimes puts a goal frame in the scene anyway → mask it out in Photoshop or regenerate
- Crowd too detailed (visible faces) → emphasise "small coloured speckles, no faces"
- Sky too dark / night vibe → emphasise "BRIGHT DAYTIME"
- Pitch missing mowing stripes → ask explicitly for "horizontal lighter/darker mowing bands"

---

## 2. Goal frame + net — `goal-frame.png`

**Purpose:** Composited on top of the stadium hero, showing the goal frame + netting. Transparent background.

**Dimensions:** ~600 × 250 px (3:1 ratio, matches regulation 7.32m × 2.44m). Centre of the image is the goal mouth. The image needs alpha transparency outside the netting/posts.

### Prompt

> A football goal frame with white netting, viewed straight on from a slightly-low first-person angle. **Match the visual style of Flick Kick Football.**
>
> **Image dimensions: approximately 600 px wide × 250 px tall (3:1 aspect ratio).**
>
> The goal:
> - Three thick clean white goalposts (left vertical, right vertical, horizontal crossbar). Posts noticeably thicker than realistic — arcade-readable.
> - Cylindrical 3D feel — subtle shading suggests roundness, not flat lines.
> - Drop shadow beneath each post connection.
> - White net behind the frame, mesh pattern clearly visible — fine grid of thin lines.
> - Net is semi-transparent — you can see through it to whatever is behind.
> - Net hangs on the back two side posts and the top.
>
> **Background: completely transparent (alpha channel).** No pitch, no sky, no crowd. Just the goal frame and netting against transparency.
>
> Cartoonish-stylised, family-friendly, clean line art.

**Failure modes:**
- DALL-E adds pitch grass under the goal → re-prompt and mask in Photoshop
- Net too opaque → request "fine white mesh, mostly transparent"
- Posts too thin (realistic) → emphasise "thick arcade-style posts"

---

## 3. Defender sprite — `defender-blue.png` (also `-red.png` for kit variant)

**Purpose:** Wall defender figure. Full body, transparent BG. Multiple copies composited side-by-side to form a defensive wall.

**Dimensions:** ~120 × 280 px portrait (figure occupies most of the height, centred horizontally).

### Prompt v1 (Blue kit)

> A male professional footballer standing in a defensive wall pose, viewed from directly in front. **Match the visual style of Flick Kick Football.**
>
> **Image dimensions: approximately 120 px wide × 280 px tall, portrait.**
>
> Pose: standing upright, both arms folded down over the groin (the standard wall pose for protection during a free kick). Slightly serious facial expression, eyes forward.
>
> Kit:
> - **Long-sleeve blue jersey** (medium blue, like Italy or Chelsea)
> - **White shorts**
> - **Blue socks** pulled up to the knee
> - **Brown or black football boots**
>
> Body: realistic adult male proportions, full body head-to-toe in frame. Slightly cartoonish-stylised proportions (head ~1/7 of body height), but clearly recognisable as a player. Light skin tone for the head; simple cartoonish facial features (eyes, nose, eyebrows).
>
> **Background: completely transparent (alpha channel).** No pitch, no shadow under feet, no scenery.
>
> Cartoonish-stylised, family-friendly, clean edges. Match Flick Kick Football's player art style.

### Prompt v1 (Red kit — for variety in the wall)

> [Same as above but: "Long-sleeve red jersey, white shorts, red socks, brown football boots."]

**Failure modes:**
- DALL-E adds a shadow → explicitly state "no shadow beneath"
- Face too detailed (realistic) → emphasise "simple cartoonish features"
- Body too realistic vs stylised → reference Flick Kick by name
- Hair colour: leave unspecified to get variety. Generate 3-4 versions per kit and pick the most varied set.

---

## 4. Goalkeeper sprite — `goalkeeper.png`

**Purpose:** Sometimes a keeper stands in the goal mouth (per Flick Kick gameplay). Transparent BG, same scale as defender but ARMS WIDE / ready pose.

### Prompt

> A male football goalkeeper standing in the goal mouth, ready stance. **Match the visual style of Flick Kick Football.**
>
> **Image dimensions: approximately 120 px wide × 280 px tall, portrait.**
>
> Pose: standing upright with arms slightly spread out from sides (ready to dive). Hands open, palms forward.
>
> Kit:
> - **Long-sleeve yellow jersey** (bright yellow, classic keeper colour)
> - **Black shorts**
> - **Black socks** pulled up
> - **Goalkeeper gloves** (white) visible on hands
> - **Brown or black boots**
>
> Body: realistic adult male proportions, full body head-to-toe in frame. Cartoonish-stylised. Light skin head with simple features. Eyes alert, focused forward.
>
> **Background: completely transparent (alpha channel).** No shadow, no scenery.
>
> Cartoonish-stylised, family-friendly. Match Flick Kick Football's keeper art style.

---

## 5. Football sprite — `ball.png`

**Purpose:** The ball. Single sprite used throughout the trajectory with depth-emphasis scaling.

**Dimensions:** ~256 × 256 px square, ball centred.

### Prompt

> A modern classic football (soccer ball) viewed from a 3/4 angle. **Match the visual style of Flick Kick Football.**
>
> **Image dimensions: 256 px × 256 px square, ball centred in frame.**
>
> Pattern: **classic icosahedral panels** — 12 black pentagons connected by white hexagons (the iconic Telstar pattern). Pentagons should be clearly visible (~5-6 of them in view at this angle).
>
> Subtle glossy highlight on the top-left of the ball.
>
> Soft drop shadow beneath the ball (a slightly elongated grey ellipse under the ball's bottom).
>
> **Background: completely transparent (alpha channel).** No pitch, no scenery.
>
> Cartoonish-stylised, clean edges. Should look like the ball in Flick Kick Football's screenshots.

---

## 6. Target sprites — `target-plus10.png` and `target-heart.png`

**Purpose:** Overlaid on the goal mouth showing where +10 / ❤️ targets are. Transparent BG.

**Dimensions:** ~128 × 128 px each.

### Prompt — `target-plus10.png`

> A golden bullseye / dartboard-style target with the text **"+10"** embossed in bold sans-serif numerals in the centre. **Match the visual style of Flick Kick Football** (where they have round bullseye targets in the goal mouth).
>
> **Image dimensions: 128 px × 128 px square.**
>
> Concentric rings: outermost ring gold/yellow, middle ring red/orange, innermost ring darker red. The "+10" text is centred and clearly readable in white or dark contrast.
>
> Subtle 3D depth — the rings have a slight bevel.
>
> **Background: completely transparent (alpha channel).**
>
> Cartoonish-stylised, family-friendly.

### Prompt — `target-heart.png`

> A glossy bright red heart shape, viewed straight-on. Subtle 3D depth and gloss highlight on the upper-left. **Match the visual style of Flick Kick Football.**
>
> **Image dimensions: 128 px × 128 px square, heart centred.**
>
> No text. Just the heart.
>
> **Background: completely transparent (alpha channel).**
>
> Cartoonish-stylised, family-friendly.

---

## Workflow

1. **Run the stadium hero first.** It's the biggest visual win. Iterate 3-5 times until it matches Flick Kick's daytime vibe.
2. **Save to** `C:\Users\jacob\solshot-free-kicks\public\assets\stadium-hero.png`.
3. **Refresh the Vercel URL on your phone** — the game auto-detects the asset and uses it.
4. **Move to goal frame next.** Same workflow.
5. **Then defenders + keeper** (these come in matched sets; the scene code picks one per slot).
6. **Then ball + targets.**

After each asset lands, send me a screenshot of the in-game render and we'll calibrate any sprite-anchor / scale adjustments.

---

## v0.1 → v0.2 changelog

- **Removed** the entire night-floodlit-stadium direction
- **Added** the Flick Kick daytime style anchor
- **Replaced** all six core prompts with Flick-Kick-targeted wording
- **Added** explicit save paths so the scene-loader can find each file
- **Added** the workflow (stadium-first → swap incrementally)
- The v0.1 art-refs (basketball-style streetball references) are not relevant here. New refs are the Flick Kick clips already in `Other Games\Flick kick\`.
