# SolShot Map Backdrops — ChatGPT Images Prompt Pack

Paste-ready brief for ChatGPT Images / DALL·E. Eight backdrops, shared style, themed environments.

**How to use:** open each numbered prompt in turn, paste into ChatGPT Images, generate 3-4 variants per prompt, pick the strongest, save as `solshot_maps/<slug>/backdrop.png`. Heightmap and surface layers are separate briefs (request after backdrops land).

**Reference images to paste alongside prompts 1, 2, 3:** the existing painted backdrops at `Assets/bg-desert.png`, `Assets/bg-jungle.png`, `Assets/bg-moon.png` are the visual style anchor for the entire pack. Drop them into ChatGPT as image inputs alongside the text prompt — the model will match their painterly, low-noise, atmospheric aesthetic across all 8.

**Dimensions reality check:** ChatGPT Images generates at standard aspect ratios. Our target is 3456 × 800 (aspect 4.32:1), which the model won't produce natively. Best path: ask for wide aspect (closest available: 1792×1024 or 16:9), then I'll resize and crop to 3456 × 800 in post-processing. Don't fight the model on exact dims — let it paint, then we sample.

---

## GLOBAL ART DIRECTION

Create eight 2D side-view game background images for **SolShot**, a browser-based artillery game in the Worms / Pocket Tanks / Scorched Earth lineage. The art is the wallpaper of a competitive money game — players spend hours looking at these. All eight images must share the same painterly atmospheric art direction: stylised broad-stroke painting, low pixel-level noise, soft cinematic lighting, layered silhouettes for atmospheric depth, distinct horizon line at roughly 55-65% from the top. The images should feel like different times of day and different worlds within the same game universe.

Reference style: see `Assets/bg-desert.png`, `Assets/bg-jungle.png`, `Assets/bg-moon.png` — these three are the anchor. Same painterly broad-strokes, same atmospheric haze, same level of stylisation, same compositional discipline (gradient sky → mid silhouettes → near silhouettes → ground line).

The backdrops are the **far layer only**. Playable terrain and surface art are separate layers painted on top. So each backdrop should fade to lower-detail / single-tone at the bottom 15% (where the playable ground will overlay), and concentrate visual identity in the sky and distant-mid scenery.

---

## CONSISTENCY RULES

Use the same across all 8:

- Side-view 2D, parallel projection (no perspective, no isometric)
- Horizon at ~55-65% from top
- Painterly broad-stroke rendering (not photoreal, not pixel art, not cel-shaded line art)
- Low pixel-level noise — keep textures graphic and readable at 50% size (mobile players)
- Atmospheric haze providing depth between near and far silhouettes
- Strong sky gradient as the dominant compositional element
- Distant silhouettes in darker shade of the dominant theme hue
- Wide cinematic aspect (4:1 or wider, will be cropped to 3456 × 800)
- Bottom 15% should fade to single-tone or low-detail (playable ground will overlay here)
- Top 10% kept visually quiet (game HUD overlays this — FORFEIT button, WIND chip, score)

Do NOT include any of these on any image:

- Characters, tanks, weapons, projectiles, explosions, creatures
- Text, numbers, signage, readable symbols
- UI elements, HUD bars, buttons, icons
- Logos, watermarks, signatures
- Borders, frames, vignettes
- Cropped readable text (no half-visible signs, no shop fronts with words)
- Random scattered symbols that read as letters or runes

---

## EXPORT / DIMENSION RULES

- **Target final size:** 3456 × 800 pixels, aspect ratio 4.32:1
- **Generate at:** the closest wide aspect ChatGPT Images supports (likely 1792 × 1024 or 16:9)
- **Composition:** important visual elements stay within the central 80% horizontal band; the leftmost and rightmost 10% can be lower-detail extension of the scenery so cropping to 4.32:1 doesn't lose key elements
- **Final post-processing:** images get resized + cropped to 3456 × 800 outside ChatGPT; do not embed text instructions about dimensions in the visible canvas
- **Output:** PNG, high quality, no AI-generation watermarks in the painted scene

---

## IMAGE 1 — DESERT / SAND DUNES

Create a wide cinematic 2D side-view game background.

**Theme:** Sand dunes at dusk. Warm orange and amber palette. The most welcoming, "tutorial" map in the pool — open, readable, calm tension.

**Scene:** Endless rolling sand dunes receding into atmospheric haze toward the horizon. A deep warm orange-to-amber sky gradient occupies the upper 60% of the frame. Far distant mountain silhouettes in dark brown sit at the horizon line (~60% from top), with mid-distance dune ridges in a slightly lighter brown layered in front. Soft ambient dust particle haze in the air. Near-ground (bottom 15%) is a single warm-brown tone, almost flat, ready for a painted ground layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~60% from top. Soft cinematic lighting, single warm light source from beyond the right edge of the frame. Low pixel-level noise — graphic and readable at half size. Atmospheric haze between near and far silhouettes. Reference: existing `bg-desert.png` painted backdrop.

**Composition:** Sky-dominant. Horizon at the upper third of the lower half. Distant mountains and mid dunes layered for depth. Bottom 15% fades to single warm-brown tone for the gameplay ground layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. Tanks will spawn against this. Projectiles will arc across it. Keep the central 60% of vertical space visually clear of distracting fine detail. Avoid extreme contrast in the centre band; reserve high contrast for the silhouette horizon.

**Restrictions:** No characters. No tanks. No creatures. No text. No UI. No logos. No watermark. No readable signs. No borders. No scattered symbols.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 2 — JUNGLE / JUNGLE VALLEY

Create a wide cinematic 2D side-view game background.

**Theme:** Dense jungle valley at twilight. Deep saturated green palette. Mid-density vertical cover — players need to read trajectory through tree silhouettes.

**Scene:** A jungle valley receding into misty depth. Deep green gradient sky (upper jungle canopy filtering twilight) occupying the upper 60% of the frame. Multiple layered tree silhouettes — far layer in pale faded green, mid layer in mid-green, near layer in dark green — creating depth through atmospheric haze. Tropical foliage shapes (palm fronds, hanging vines, fern silhouettes) defining the canopy line at the horizon. Slight ambient mist hanging between the tree layers. Near-ground (bottom 15%) is a single deep-green tone, ready for a painted ground layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~60% from top. Soft cinematic lighting, single cool light source filtered through the canopy from above. Low pixel-level noise — graphic and readable at half size. Atmospheric haze between near and far silhouettes. Reference: existing `bg-jungle.png` painted backdrop.

**Composition:** Layered tree silhouettes carry the visual weight. Sky filtered through canopy at the top. Mid-distance trees as the focal silhouette band. Bottom 15% fades to single deep-green tone for the gameplay ground layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. Tank silhouettes need to remain visible against this. Avoid dense fine foliage detail that could blur with a small tank sprite. Keep tree silhouettes as broad recognisable shapes, not detailed branches.

**Restrictions:** No characters. No tanks. No animals. No creatures. No text. No UI. No logos. No watermark. No readable signs. No borders. No scattered symbols.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 3 — MOON / LUNAR SURFACE

Create a wide cinematic 2D side-view game background.

**Theme:** Lunar surface at night. Black starfield sky with Earth visible. Highest projectile contrast in the pool — bright projectiles read crisply against the dark sky.

**Scene:** A vast black sky filled with delicate scattered stars occupying the upper 70% of the frame. Earth visible in the upper-right quadrant, painted with visible continents and ocean (blue and white), not a generic flat sphere. Earth has a soft atmospheric glow rim. Distant lunar mountain silhouettes along the horizon, painted in dark grey with slight cool blue undertone, layered for depth. Crater rim shapes visible in the mid-distance. Near-ground (bottom 15%) is a single dark grey tone, ready for a painted lunar surface layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~60% from top. Cool atmospheric lighting, single light source from beyond the top-right edge (Earth-glow + distant sun). Low pixel-level noise — graphic and readable at half size. Atmospheric haze between near and far silhouettes is minimal (no air on the moon). Reference: existing `bg-moon.png` painted backdrop.

**Composition:** Sky-dominant with Earth as the secondary focal element. Earth positioned in the upper-right third (rule of thirds). Mountain silhouettes carry the horizon line. Stars scattered in the upper 60% but not overlapping Earth. Bottom 15% fades to single dark grey tone for the gameplay ground layer to overlay. Top 10% kept visually quiet for game HUD overlay — keep stars sparse near the top edge.

**Game readability:** This is a background for active gameplay. The dark sky is intentional for projectile contrast — bright projectiles will read crisply. Keep stars small and scattered, not dense, so they don't compete with projectile sprites. Earth is the visual anchor but should not extend into the central gameplay band.

**Restrictions:** No characters. No astronauts. No spacecraft. No flags. No text. No UI. No logos. No watermark. No constellations forming readable shapes. No borders.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 4 — URBAN / NEON CITYSCAPE

Create a wide cinematic 2D side-view game background.

**Theme:** Cyberpunk cityscape at night. Deep purple-to-magenta twilight palette with neon window accents. The "competitive" map — hard-edge geometric silhouettes, vertical battle.

**Scene:** A city skyline at night, viewed from across a wide street or river. Deep purple-magenta sky gradient occupying the upper 50% of the frame, with hints of distant atmospheric glow. Layered city building silhouettes — far layer (smallest, palest), mid layer (medium, slightly darker), near layer (largest, darkest) — forming the iconic cyberpunk skyline. Buildings have lit windows scattered across them in warm yellow and cool cyan / magenta neon tints, painted as small dots and rectangles of light. A few taller towers stand out at distinct heights. Near-ground (bottom 15%) is a single very dark purple-grey tone, ready for a painted ground layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~55% from top. Cool atmospheric lighting from a single distant point above the city. Low pixel-level noise — graphic and readable at half size. Atmospheric haze between near and far building layers. Window lights are painted as graphic dots, not realistic.

**Composition:** Building silhouettes are the dominant feature. Three layered building bands receding into depth. Sky gradient carries mood; window lights carry punctuation. Bottom 15% fades to single dark purple-grey tone for the gameplay ground layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. Building silhouettes must read as broad recognisable shapes, not detailed architecture. Window lights stay small enough not to compete with projectile sprites. Avoid neon signs or readable text.

**Restrictions:** No characters. No vehicles. No flying craft. No text. No readable signage (no shop names, no billboards with words, no street signs). No UI. No logos. No watermark. No borders.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 5 — ARCTIC / ICEBERG TUNDRA

Create a wide cinematic 2D side-view game background.

**Theme:** Arctic tundra in pale daylight. Cool pale-blue and white palette with subtle aurora hint. The "low-contrast challenge" map — players work harder to read trajectory against the pale sky.

**Scene:** A vast snowy tundra under a pale icy daytime sky. Pale blue-to-white gradient sky occupying the upper 60% of the frame, with a subtle aurora streak (faint green or pink) painted high in the sky as a soft horizontal band. Distant ice mountains and iceberg silhouettes along the horizon in pale lilac-blue, layered for atmospheric depth. Snow-dusted mid-distance ridges in slightly darker blue-white. The whole scene is **bright** — this is not a moody snow scene, it's a midday tundra with low sun. Near-ground (bottom 15%) is a single pale-blue tone, ready for a painted snow layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~62% from top. Soft cool diffuse lighting (no harsh shadows — arctic daylight). Low pixel-level noise — graphic and readable at half size. Atmospheric haze between near and far ice silhouettes; haze is more pronounced than in the desert/jungle scenes (cold air refraction).

**Composition:** Sky and atmosphere dominate. Iceberg silhouettes punctuate the horizon line with crisp triangular peaks. Aurora streak adds visual interest in the upper third without competing with the horizon. Bottom 15% fades to single pale-blue tone for the gameplay snow layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. The low-contrast aesthetic is intentional — this is the "harder to read" map in the pool. But projectile readability must still hold against the pale sky; ensure the sky has *enough* gradient that a dark projectile silhouette reads. Avoid the sky becoming completely flat white.

**Restrictions:** No characters. No wildlife. No animals. No text. No UI. No logos. No watermark. No borders. No human-made structures.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 6 — VOLCANIC / LAVA LAKE

Create a wide cinematic 2D side-view game background.

**Theme:** Volcanic hellscape at twilight. Dark warm palette with glowing magma cracks and ember haze. The "high-stakes prestige" map — players will associate this map with big wagers.

**Scene:** A volcanic landscape under a smoke-darkened red-and-black sky. Sky gradient from deep red (top) through dark crimson to near-black at the horizon, occupying the upper 60% of the frame. Distant jagged volcanic mountain silhouettes in pure black, with glowing red-orange magma cracks running down their flanks. Mid-distance volcanic peaks emit thin ember trails rising into the sky. Subtle ember particles drifting through the air in the mid-distance. The whole scene **glows from within** — magma is the secondary light source, not just decoration. Near-ground (bottom 15%) is a deep volcanic black with subtle orange edge-glow, ready for a painted lava-surface layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~58% from top. Dramatic warm lighting — single light source from below the horizon (the magma glow) plus weak ambient red from the sky. Low pixel-level noise — graphic and readable at half size. Heavy atmospheric haze (volcanic smoke) softens distant silhouettes.

**Composition:** Sky-dominant with the magma glow rim at the horizon as the visual anchor. Jagged peak silhouettes carry the upper edge of the ground layer. Glowing magma cracks punctuate the silhouettes for visual life. Bottom 15% fades to deep volcanic black with subtle warm edge-glow for the gameplay lava-surface layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. The dark warm palette is intentional but projectile readability must hold — the glowing magma elements should NOT be in the central gameplay band (only at the horizon and as silhouette punctuation). Embers should be sparse and small, not distracting.

**Restrictions:** No characters. No demons. No creatures. No text. No UI. No logos. No watermark. No skulls. No borders. No literal flames as foreground objects.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 7 — CASTLE / STONE RUINS

Create a wide cinematic 2D side-view game background.

**Theme:** Medieval stone fortress ruins at golden hour. Warm amber-and-stone palette. The "verticality without claustrophobia" map — fortress silhouettes carry distinct character.

**Scene:** A medieval ruined fortress landscape at golden hour. Warm amber-to-blue gradient sky occupying the upper 60% of the frame (low sun beyond the right edge casts warm light across the scene). Distant mountain silhouettes in deep blue along the horizon. Ruined castle towers and crumbling fortress walls painted as dark silhouettes against the warm sky — two prominent tower silhouettes positioned to suggest fortress remains, with intermediate broken-wall sections between them. Atmospheric dust haze hanging in the warm light. Near-ground (bottom 15%) is a single warm-stone tone, ready for a painted rubble-surface layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~60% from top. Warm golden-hour lighting, single warm light source from beyond the right edge. Low pixel-level noise — graphic and readable at half size. Atmospheric haze (warm dust) softens distant silhouettes and gives the scene a "centuries old" feel.

**Composition:** Castle silhouettes are the focal feature — two prominent towers anchor the composition. Sky gradient and distant mountains provide depth. Light dust haze in the mid-distance. Bottom 15% fades to warm-stone tone for the gameplay rubble-surface layer to overlay. Top 10% kept visually quiet for game HUD overlay.

**Game readability:** This is a background for active gameplay. Castle silhouettes must read as broad recognisable shapes (towers with crenellations, broken walls), not detailed architectural drawings. Avoid windows, flags, or any detail that could be misread as gameplay-significant.

**Restrictions:** No characters. No knights. No flags. No banners with insignia. No text. No UI. No logos. No watermark. No identifiable real-world castles. No borders.

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## IMAGE 8 — CANYON / RED MESA

Create a wide cinematic 2D side-view game background.

**Theme:** Red rock canyon at high noon. Saturated red-orange palette with dramatic verticality. The "skill check" map — towering mesas frame a narrow play corridor.

**Scene:** A red rock canyon viewed from inside the canyon floor. Bright high-noon sky in pale orange-to-blue gradient occupying the upper 40% of the frame (narrower than the other maps — the canyon walls eat into the sky). Towering red mesa silhouettes rising up at the left and right edges of the frame and into the mid-distance — these are the canyon walls. Mesa silhouettes painted with subtle red-rock striation (horizontal banding suggesting sediment layers). Distant smaller mesa formations visible through the canyon mouth in the centre. Subtle dust haze in the canyon air. Near-ground (bottom 15%) is a single red-rust tone, ready for a painted ground layer to overlay.

**Shared style:** Painterly broad-stroke 2D rendering, side-view parallel projection, no perspective. Horizon at ~70% from top (the canyon walls push the visible horizon high, which is part of the map's identity). Warm overhead lighting. Low pixel-level noise — graphic and readable at half size. Light dust haze.

**Composition:** Vertical mesa walls dominate. Bright sky compressed into the upper centre by the canyon walls. Distant mesa formations visible through the canyon mouth as the focal far-element. Bottom 15% fades to red-rust tone for the gameplay ground layer to overlay. Top 10% kept visually quiet for game HUD overlay — sky is in this zone, so keep it cleanly gradient without features.

**Game readability:** This is a background for active gameplay. The mesa walls are visual identity but the playable space is the canyon floor between them — keep the central horizontal band (the floor) visually clear of distracting detail. Mesa striation should be subtle, not loud.

**Restrictions:** No characters. No cacti as foreground objects (small distant cacti in mid-ground are OK as silhouette). No animals. No vehicles. No text. No UI. No logos. No watermark. No borders. No identifiable real-world locations (no Grand Canyon, no Monument Valley as literal references).

**Final output:** A polished wide cinematic game background, painted broad-stroke style, ready for cropping to 3456 × 800 pixels, consistent with the full set of 8 SolShot backdrops.

---

## After generation

For each backdrop:

1. Generate 3-4 variants at the closest wide aspect ChatGPT supports
2. Pick the strongest variant
3. Save to disk as `<theme>-backdrop-source.png` (the raw output)
4. Send to main-claude for resize + crop to 3456 × 800

Once all 8 backdrops are picked and exported to spec, the **heightmap brief** and **surface brief** become the next two prompt packs. Those are tighter technical asks (heightmaps need pure black/white silhouettes, surfaces need transparent-above-heightmap masking) and want their own dedicated prompt structure — request them separately when ready.

---

**Brief written:** 2026-05-13 by main-claude. Style anchored to existing painted backdrops in `Assets/bg-{desert,jungle,moon}.png`. Eight prompts self-contained; each may be pasted independently. Aspect mismatch with 3456×800 target handled in post-processing.
