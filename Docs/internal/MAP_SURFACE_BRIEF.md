# SolShot Map Surface Art — Brief for Claude Design

**For:** Claude Design (the design-focused Claude instance JJ is handing this to)
**From:** Engineering (main-claude)
**Status:** Ready to paste — JJ will share the entire `solshot_maps/` folder alongside this brief
**Last updated:** 2026-05-13

---

## Context — what you're being asked to do

SolShot is a browser-based 2D side-view artillery game (Worms / Pocket Tanks lineage). Players fire shots through gravity arcs across destructible terrain. We have 8 fixed, hand-designed maps with three visual layers each. **Two of the three layers are already built.** Your job is the third — the **surface art layer**.

JJ will share the folder `solshot_maps/` with you. Inside it there are 8 sub-folders (one per theme):

```
solshot_maps/
├── arctic/        ── backdrop.png · heightmap.png · meta.json · spawns.json · surface.png
├── canyon/        ── (same 5 files)
├── castle/        ── (same 5 files)
├── desert/        ── (same 5 files)
├── jungle/        ── (same 5 files)
├── moon/          ── (same 5 files)
├── urban/         ── (same 5 files)
└── volcanic/      ── (same 5 files)
```

Each folder is one map. Files in it:

| File | What it is | Your relationship to it |
|---|---|---|
| `backdrop.png` | Far-layer atmospheric painting (sky + distant scenery). AI-generated. | **READ — use its palette + mood as your style anchor for this map** |
| `heightmap.png` | Pure black-and-white silhouette defining the destructible terrain. Hand-coded. | **READ — use its silhouette to know exactly which pixels need to be filled by your surface art** |
| `surface.png` | The visible ground texture overlaying the heightmap silhouette. | **REPLACE — this is your output; overwrite the placeholder that's currently there** |
| `meta.json` | Theme name, difficulty tier, indestructible feature bounding boxes. | READ — orientation |
| `spawns.json` | Tank spawn anchor x-coordinates (mirrored around centre at runtime). | Reference only — don't paint spawn markers on the surface |

---

## The surface layer's job

The engine renders a SolShot match in three layered passes:

1. **Backdrop** — drawn first, fills the whole canvas. Sky and distant scenery.
2. **Heightmap silhouette** — the engine's PHYSICS reference for what's solid ground vs air. Players never see this layer directly; it's just collision geometry.
3. **Surface art** — what players SEE as the ground. Drawn ON TOP of the backdrop, MASKED against the heightmap silhouette. Anywhere the heightmap is white (solid ground), your surface art shows. Anywhere the heightmap is black (air), your surface art is invisible and the backdrop shows through.

So your job per map:

> Paint a 3456 × 800 RGBA PNG. Anywhere the heightmap is WHITE, paint theme-appropriate ground texture filling the entire silhouette down to the bottom of the canvas. Anywhere the heightmap is BLACK, leave fully transparent. The result should look like the painted top-side of solid ground when composited over the backdrop.

---

## Technical specifications

- **Dimensions:** 3456 × 800 pixels (exact — match the heightmap.png dims)
- **Format:** PNG, RGBA (must have an alpha channel)
- **Transparency rule:** wherever the corresponding heightmap.png pixel is BLACK, your surface PNG must be fully transparent (alpha = 0). Wherever the heightmap pixel is WHITE, your surface PNG should be fully opaque (alpha = 255) with painted ground colour.
- **Fill depth:** **the entire silhouette area must be filled with consistent ground colour, all the way down to y=800.** Do NOT paint a thin band at the top of the silhouette and leave the rest transparent — the engine carves craters into the heightmap during play, exposing deeper layers, and an empty interior would show as a hole in the ground.
- **Edge softness:** a tiny 1-2 pixel feathered edge along the silhouette top is OK and helps blend with the backdrop, but the bulk of the silhouette should be opaque.

### Recommended workflow

For each map:

1. **Open** `<theme>/heightmap.png` — this is the shape to fill
2. **Open** `<theme>/backdrop.png` — this is your palette / mood anchor
3. **Paint** the silhouette area with a theme-appropriate textured fill (see per-theme guidance below)
4. **Verify** transparency: the black sky area of the heightmap should be fully transparent in your output
5. **Save** as `<theme>/surface.png`, overwriting the existing placeholder

You can use the heightmap directly as an alpha mask if your tooling supports it: load the heightmap, invert it if needed (so white = opaque ground), apply as alpha channel on top of your colour fill.

---

## Per-theme guidance

For each of the 8 maps, the brief is: take the backdrop's palette as the colour anchor and paint a theme-appropriate ground texture. Specific direction per theme:

### 1. desert
- **Surface:** warm tan-to-amber sand. Subtle grain texture (small irregular dots / cross-hatching). Darker striations near the top of the silhouette (where dunes catch shadow). Lighter base.
- **Palette anchor:** match the backdrop's warm orange-brown atmospheric haze. Surface should feel like the ground UNDER that sky — slightly darker, warmer in shadow.
- **Identity touch:** wind-blown ripple lines along the top contour of the silhouette would sell the dunes hard. Sparse.

### 2. jungle
- **Surface:** deep rich loam soil. Dark green-brown base with hints of leaf litter, exposed root tangles, moss patches near the top of the silhouette.
- **Palette anchor:** match the backdrop's deep green twilight palette. Surface goes a bit warmer (browner) than the sky.
- **Identity touch:** vine tendrils or fern fronds peeking up from the top contour of the silhouette would sell jungle. Don't over-decorate — silhouettes need to read clean.

### 3. moon
- **Surface:** pale lunar grey with crater dust. Slightly cooler grey in shadow (lower in the silhouette), lighter on top (catching sun). Sparse rock fragments / craters dotted on top.
- **Palette anchor:** match the backdrop's cool dark blue-grey palette. Surface should feel "airless and bright" with high local contrast.
- **Identity touch:** small craters as flat oval markings on top of the silhouette would help. Don't paint deep craters — those are heightmap features, and the heightmap already has crater dips painted in.

### 4. urban
- **Surface:** concrete/asphalt at the ground level, building facades on the elevated platforms. Each "platform" in the heightmap is a flat-topped building — paint building texture (window grid, brick lines, neon accents) on the elevated portions, paint asphalt/concrete on the gaps between buildings.
- **Palette anchor:** match the backdrop's purple-magenta sunset palette. Buildings should be dark silhouettes with **glowing window dots** (warm yellow + cool cyan/magenta) that echo the backdrop's neon vibe.
- **Identity touch:** the heightmap has 5 buildings of varying heights — paint them as distinct buildings (different window patterns, slight colour variation between buildings). The valleys between buildings are the "street level" — paint differently to the buildings themselves.

### 5. arctic
- **Surface:** white-blue snow surface. Smooth pale fill with subtle ice texture, slightly darker shadow underneath (deeper into silhouette). The iceberg peaks should have crisp edges suggesting compressed ice.
- **Palette anchor:** match the backdrop's pale icy blue palette. Surface should feel BRIGHT and cold.
- **Identity touch:** subtle ice crystal sparkles on top would sell the cold. Keep them small — readability rules apply.

### 6. volcanic
- **Surface:** dark basalt rock with glowing magma cracks. Base is near-black, but with bright orange-red CRACKS running through the surface — these are the lava veins visible on the volcano slopes. Glowing edges along the top contour of the silhouette.
- **Palette anchor:** match the backdrop's dark red sky. Surface should be DARKER than the sky, but the lava glow should be BRIGHTER than anything else on screen — it's the visual focal point.
- **Identity touch:** the heightmap has prominent volcano peaks — concentrate the brightest lava cracks at the tops of those peaks. The flatter areas between peaks get fewer cracks.

### 7. castle
- **Surface:** stone masonry. The heightmap has two indestructible tower BLOCKS (at x=250..450 left and x=3006..3206 right — see `meta.json indestructibleBoxes`). These should look like solid stone wall texture with mortar lines. The central rubble field (between the towers) should look like broken stone debris, varied tones, lots of detail. Edge of map (outside the towers) is dirt/grass ground.
- **Palette anchor:** match the backdrop's warm golden-hour palette. Stone should be a warm grey-tan that catches that light.
- **Identity touch:** the tower blocks should look STRUCTURAL — straight stone block lines, crenellations at the top edges. The rubble field should look CHAOTIC — irregular broken stones in varied shades.

### 8. canyon
- **Surface:** red rock with horizontal sediment striations. Layered bands of rust/brick/sandstone running horizontally across the silhouette — these tell the geological story of the canyon walls.
- **Palette anchor:** match the backdrop's saturated red-orange canyon palette. Surface should feel like rich oxidised iron.
- **Identity touch:** the heightmap's TALL MESA WALLS on the left and right edges should have the most dramatic horizontal striation banding — they're the canyon walls and they're what makes the map read as canyon. The mesa fingers in the floor should also have horizontal banding, just less dramatic. The flat floor between is a flatter rust-coloured ground.

---

## Style consistency across all 8

Even though the themes are very different, the surface art should feel like it belongs to one game:

- **All surfaces have visible top-edge highlight** where the surface catches the backdrop's dominant light direction
- **All surfaces have darker interior shadow** as the silhouette extends downward (suggesting subsurface depth)
- **All surfaces use the same painterly broad-stroke rendering style** as the backdrops — not photoreal, not pixel art, not cel-shaded line. Look at the 8 backdrops to internalise the style.
- **No surface should be a single flat colour** — every map's ground needs textural variation to feel painted, not coded
- **No fine pixel-level noise** — players will see these on mobile at ~50% scale; broad strokes survive, fine grain doesn't

---

## What success looks like

After your pass, JJ should be able to put each map's three layers (backdrop + heightmap + your new surface) into the engine, run a match on it, and see:

- The backdrop visible as the sky
- The ground visible as your themed surface art (filling the entire silhouette)
- The two layers composing into a coherent, painterly, premium-feeling game environment
- Each of the 8 maps feeling visually distinct from the others (no map looks like a reskin of another)
- The brand reading as "polished competitive game" not "AI hobby project"

---

## What to avoid

- **Painting on the heightmap.** Do not modify `heightmap.png`. That's physics geometry. Modifying it breaks gameplay.
- **Hollow silhouettes.** Don't paint a thin band of detail at the top of the silhouette and leave the rest transparent. The engine carves craters during play and would show holes in the ground.
- **Strong contrast inside the central gameplay band.** The middle 60% of the canvas vertically is where the action happens. Keep surface detail readable; avoid dense / busy patterns that compete with tank sprites and projectiles.
- **Text or symbols of any kind.** No readable text, no logos, no graffiti with words. Abstract texture and structure only.
- **Characters, creatures, vehicles.** No painted figures on the ground.

---

## File handoff

When you're done with each surface, save as `solshot_maps/<theme>/surface.png` overwriting the placeholder. Format: PNG, RGBA, 3456 × 800. JJ will share the updated folder back with engineering for loader integration.

If you want to iterate (paint surface, compare against backdrop, refine), that's encouraged — engineering won't pull anything until JJ signs off.

---

## Questions / blockers

Anything unclear in the spec — flag back to JJ. He'll route to engineering (main-claude) for technical clarifications.
