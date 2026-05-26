# SolShot Map Design Brief

**For:** the designer authoring SolShot's first 8 hand-designed maps  
**From:** SolShot engineering (JJ + Claude)  
**Status:** v1 — pre-authoring, await designer questions before kick-off  
**Last updated:** 2026-05-13

---

## 1. Mission

SolShot is a browser-based 2D side-view artillery game (Pocket Tanks lineage) running real-money matches on Solana. We're shifting from random procedurally-generated terrain to **8 fixed, hand-designed maps**. The pivot is intentional — fixed maps unlock the competitive-mastery loop that random terrain cannot: memorisable layouts, skill-rewarding play, tournament viability, and brandable identities ("won on Iceberg"). The closest genre comparable is Gunbound, whose fixed map pool sustained a competitive scene in Korea for years.

You will deliver 8 maps. Each one is a **3456 × 800 px** painted scene with three layers (backdrop, terrain heightmap, terrain surface) plus a small metadata JSON. The terrain is **destructible during play** — weapons carve craters and chunks out of the ground. Maps reset to their pristine state between matches.

---

## 2. Deliverables per map

Five files per map. Naming convention: `<theme-slug>` (lowercase, hyphen-separated).

```
maps/
└── <theme-slug>/
    ├── backdrop.png          ← 3456 × 800 RGB, sky / atmosphere layer (no terrain, no UI)
    ├── heightmap.png         ← 3456 × 800 grayscale, defines destructible silhouette
    ├── surface.png           ← 3456 × 800 RGBA, the visible ground art (top side aligned to heightmap)
    ├── spawns.json           ← 5 spawn-anchor x-coords (mirrored to give 10 total)
    └── meta.json             ← theme name, difficulty tier, palette hints, ambient FX
```

### 2a. `backdrop.png`

Far background layer. Sky, distant silhouettes, atmospheric haze. **Never destroyed.** Always visible behind terrain. This is where mood lives.

Style reference: the three already-painted backdrops in `Assets/bg-desert.png`, `bg-jungle.png`, `bg-moon.png`. Same painterly, slightly-stylised, low-noise aesthetic. **Please re-output these three at 3456 × 800 in the same style as part of the deliverable** — they're currently square, and the SolShot watermark in the corner should be removed (we apply branding elsewhere).

Resolution: 3456 × 800 native. Do **not** upscale from a smaller canvas — paint at full width or tile a wider canvas down. Mobile users will see this at ~50% scale on iPhone landscape, so pixel-level noise will not survive — keep textures broad and graphic.

### 2b. `heightmap.png` (physics)

The shape of the destructible ground. The engine reads this as the silhouette of the playable terrain.

- Format: grayscale PNG, 3456 × 800
- **Black (0,0,0) = empty air**
- **White (255,255,255) = solid ground**
- No anti-aliasing. Sharp edges only. Convert at threshold = 128 if your tool antialiases by default.
- The top edge of solid pixels in each column is what the physics engine treats as "ground height at x." Tanks sit on top of it; projectiles collide with it; craters carve into it.
- No floating islands. Any solid pixel in column X must have solid pixels in all rows below it down to y=800. Floating geometry breaks the collision model.
- Indestructible features (e.g., castle walls) — leave a marker for now, we'll flag them in `meta.json` with bounding boxes. You can author them visually identical to destructible terrain; the engine handles destructibility separately.

### 2c. `surface.png` (art)

How the ground LOOKS on top of the heightmap. Sand grain on Desert, grass on Jungle, basalt + lava cracks on Volcanic, etc.

- Format: RGBA PNG, 3456 × 800
- **Transparent above the heightmap silhouette, opaque on/below it.** The engine masks this layer against the heightmap at runtime — anywhere the heightmap is black, this layer is invisible.
- Carry the surface art down ~120 px into the silhouette (no need to paint all the way to y=800 — anything below ~120 px from the top of the silhouette is never seen because terrain is too thick to dig through that deep).
- When weapons crater the heightmap, the surface PNG is masked automatically. You don't need to paint sub-surface "underground" detail.
- Keep silhouette readable against backdrop. A pale sandy surface on a pale sky backdrop is unreadable on mobile.

### 2d. `spawns.json`

Five spawn-anchor x-coordinates. The engine **mirrors them around x=1728** (centre of 3456) to produce 10 total anchors. This guarantees spawn parity for free — every spawn position has a perfect mirror.

```json
{
  "anchors": [432, 864, 1296, 1500, 1700]
}
```

Becomes spawn positions: `[432, 864, 1296, 1500, 1700, 1756, 1956, 2160, 2592, 3024]` (originals plus their reflections around centre).

**Rules for anchor placement:**

- Anchors are x-coordinates. Y is derived automatically — the tank sits on top of the heightmap at that x.
- Place the leftmost anchor no closer than **300 px** to the left edge (no spawn-camping the wall).
- Place the rightmost anchor no closer than **300 px** to centre (anchors get mirrored — placing one too close to centre creates a "double-spawn" near 1728).
- Spread anchors so neighbouring positions are **at least 200 px apart** when reflected.
- Each anchor should land on **playable terrain** — not the peak of a tall mountain (sliding tanks), not the bottom of a deep pit (camped from above), not adjacent to indestructible walls.
- Each anchor should have **roughly equivalent cover** within 300 px reach — comparable mountains, comparable open ground. A spawn surrounded by cover next to one in open ground breaks parity even if mirrored.

### 2e. `meta.json`

```json
{
  "name": "Sand Dunes",
  "slug": "sand-dunes",
  "difficulty": "easy",       // easy | medium | hard
  "boundary": "open-pit",     // see Section 5 — same on every map for v1
  "skybox": "open",           // open | capped (open for v1)
  "ambient": {
    "music": "desert-loop-01.mp3",
    "particles": "dust-motes" // see Section 9 — optional
  },
  "indestructibleBoxes": []   // [{x, y, w, h}] for castle walls etc. Empty for natural-terrain maps.
}
```

---

## 3. The 8 maps

The themes are locked, the visuals are yours. Each entry: theme intent, mood, difficulty tier, what makes it different from the other 7.

| # | Slug | Theme | Difficulty | Brief |
|---|---|---|---|---|
| 1 | `desert` | Sand dunes, dusk palette | Easy | The "tutorial" map. Rolling open dunes. Sparse rock cover. Warm orange/brown palette. High visibility. Backdrop already exists — extend to 3456 × 800. |
| 2 | `jungle` | Dense jungle valley | Medium | Mid-density vertical cover. Tree silhouettes flanking a central clearing. Saturated greens. Tests precision aim. Backdrop already exists — extend. |
| 3 | `moon` | Cratered lunar surface | Medium | Black starfield sky, bright cratered terrain = ideal projectile contrast. Low ambient gravity feel via tall, low-frequency dunes. Backdrop already exists — extend. |
| 4 | `urban` | Cyberpunk cityscape | Hard | Hard-edge geometric building silhouettes. Neon-on-grey palette. Symmetric vertical layout — towers on each side framing a central street. Some indestructible building faces; rooftops destructible. |
| 5 | `arctic` | Tundra / icebergs | Easy | Pale palette challenge map. Flat-to-rolling snow + scattered iceberg shapes. Low-contrast — players have to work harder to read trajectory. Counter-weight to Jungle's saturation. |
| 6 | `volcanic` | Hellscape / lava lake | Hard | Dark warm palette. Glowing terrain edges. Lava-lake bottom (visual variant of "open pit") — falling off screen is fire-death. Smoke particles drifting up. High-stakes mood, premium prestige feel. |
| 7 | `castle` | Symmetric medieval ruins | Hard | Stone fortress, two towers framing a central rubble field. Mix of **indestructible stone** (tower bases, foundation walls) and **destructible rubble** (battlements, debris). Pulls from Gunbound's Nirvana + Worms' Camelot. |
| 8 | `canyon` | Red rock mesa corridor | Hard | Narrow horizontal corridor with one tall mesa per spawn-cluster. Sky open above. Forces direct-fire and ricochet shots. The "skill check" map. Distinct from Desert via red rock + dramatic vertical scale. |

### Difficulty tier definitions

These tags drive matchmaking — easier maps get picked more often for new players, harder maps for players who've played 50+ matches.

- **Easy:** Open terrain, generous cover, projectile trajectory reads clearly against backdrop, no precision-critical shots required. Forgiving for new players. Desert and Arctic.
- **Medium:** Vertical or distance cover present, requires aim adjustment for terrain features but no trick-shot mechanics. Jungle and Moon.
- **Hard:** Precision angles, vertical play, ricochet/bounce considerations, or terrain features that punish casual aim. Urban, Volcanic, Castle, Canyon.

### Skill ladder rationale

The 8-map pool covers the full skill curve so:

- A new player gets matched onto Easy maps disproportionately during onboarding — their first ten matches feel readable.
- Mid-tier players see Medium maps regularly, building map memory.
- Top-tier matches (tournaments, high wagers) bias toward Hard maps where the player who's mastered Urban or Castle has a real edge.
- Random map selection within tier preserves variety without dumping a Hard map on a brand-new player.

---

## 4. The three non-negotiable design rules

These come from competitive map design literature and the Worms / Gunbound / ShellShock Live tournament communities. Violating any one of them makes the map unsuitable for competitive play — the entire pivot from random to fixed maps fails if these aren't held.

### Rule 1 — Spawn parity is sacred

Every spawn anchor must have equivalent positional advantage. Equivalent cover within 300 px, equivalent height-above-centre-line, equivalent weapon reach to the opposite spawn.

The mirror-around-centre rule (Section 2d) handles this automatically for the LEFT-RIGHT axis. Your job is to make sure no anchor is set on a feature that breaks parity in some other way — e.g., anchor 0 on a tall plateau and anchor 4 in an open pit reflects to (low plateau, open pit) — broken.

When in doubt, **mirror the terrain itself near each anchor**. Castle, Urban, and Canyon should be visibly symmetric. Desert, Jungle, Moon, Arctic, Volcanic can be asymmetric overall but each anchor's local 600 × 200 neighbourhood should be mirrored.

### Rule 2 — Projectile silhouette must always read

A 9 px artillery shell must be visible against your backdrop at every point in a full-power 45° arc. Test before you submit each map: fire a default-power shot in a still frame, screenshot, verify the projectile is clearly visible against every backdrop pixel it crosses.

This rules out:
- Purely dark backdrops (Volcanic gets away with it via glowing terrain edges; pure-black-sky-without-stars would fail)
- High-contrast random-noise backdrops (Worms "Cheese" theme — visually confusing, terrain blends with decoration)
- Heavy fog/weather overlays (always reduce projectile readability — banned for v1)

### Rule 3 — One boundary rule, applied consistently

For SolShot v1, the boundary rules are:

- **Sides bounce** — projectiles ricochet off the left/right walls
- **Top open** — no ceiling, projectiles can leave the top of the playfield (they return on the natural arc)
- **Bottom open pit** — falling tanks die; falling projectiles disappear

These are the same on **every** map. Volcanic's "bottom = lava lake" is a **visual reskin only** — same mechanic, different art. Don't design a map that requires a different boundary rule (no enclosed caverns, no looping wraparound). Players cannot internalise mixed boundary rules across a map pool.

---

## 5. Existing assets — what to do with them

Three backdrops exist:

- `Assets/bg-desert.png` — dusk gradient, layered hill silhouettes, ~640 × 640
- `Assets/bg-jungle.png` — dense tree silhouettes, atmospheric haze, ~640 × 640
- `Assets/bg-moon.png` — night sky with Earth + stars, cratered horizon, ~640 × 640

**Use these as the style anchor for the other five.** Same painterly broad-strokes feel, same level of stylisation, similar saturation. The five new backdrops (urban, arctic, volcanic, castle, canyon) should feel like they belong to the same family.

**Re-output the existing three at 3456 × 800** as part of the deliverable. They were originally painted square; for the wide play canvas they need to be re-comped (or repainted) at the production aspect. Drop the SolShot diamond watermark in the corner — branding goes elsewhere.

---

## 6. Pixel density and multi-resolution

Players will see your maps on:

- **Desktop:** Chrome / Safari / Firefox at 1080p, 1440p, 4K. Canvas renders at native 3456 × 800 with browser scaling. Detail-tier rendering — players see your fine grain.
- **Mobile:** iPhone / Android landscape, ~393 × 852 viewport. The canvas is scaled to fit; on iPhone 15 a 36 px tank renders as ~18 viewport px. Mid-tier detail rendering — pixel-level noise is lost.
- **Telegram in-app browser:** ~370 × 800 viewport. Lowest-tier rendering — broad strokes only.

What this means for the art:

- **Paint at full 3456 native.** Do not upscale from smaller. Phaser blits the PNG at the canvas's native resolution and the browser scales it; upscaling artefacts are visible at desktop 4K.
- **Keep the silhouette graphic.** Recognisable shapes (a tree, a mesa, a building) must read at 50% size. If your jungle tree turns into a green blur at the mobile scale, simplify.
- **Avoid sub-3 px detail.** Anything finer is lost on mobile. Coarse hatching, broad cell-shaded strokes, painterly transitions. Look at the existing three backdrops — that's the bar.
- **Use the camera's natural framing.** On 2–4 player matches, the camera only shows the central ~1956 px of the map. Your most-seen real estate is the centre. Save your most striking visual moments (a dramatic mesa, a glowing pool, a ruined tower) for the central band — they appear on every match. The wings only appear in 5+ player matches; design them to look great, but understand they're less-seen.

---

## 7. The camera director — what the player actually sees

This is critical context. The map is always 3456 × 800, but **the player rarely sees all of it at once**. A camera director controls what's framed based on what's happening:

| Player count | Default frame | Director behaviour |
|---|---|---|
| 2P | Centre ~1500 × 800 of the map | Static — no panning needed |
| 3P–4P | Centre ~1956 × 800 (matches today's view) | Static — fits in canvas |
| 5P–6P | Centre ~2700 × 800 | Director on — pans to active tank's turn, follows projectile in flight |
| 7P–8P | Centre ~3200 × 800 | Director active — same as above |
| 9P–10P | Full 3456 × 800 | Director very active — per-turn pan, projectile-follow, impact zoom-out |

**Director events:**

- `onTurnStart(activeTank)` — smooth pan to that tank, zoom to ~1.3x for aiming clarity
- `onFire(projectile)` — switch to following the projectile mid-flight
- `onImpact(point)` — pan to impact site, zoom back to ~1.0x, hold for 800 ms before next turn
- `onEliminated(localPlayer)` — zoom out to fit-world view, give the player a "spectator" overview
- `onIdle()` — return to fit-world default for the match's player count

**HUD compass** sits along the top of the screen showing all tank positions across the full 3456 width even when the camera is zoomed in on one slice. Players always know where everyone is regardless of camera position.

**Implications for your map design:**

1. **Centre is the always-seen area.** Anchors 4 and 5 (the two closest to centre) appear in every match including 2P. Make the central terrain visually compelling — this is what new players see most.
2. **Wings are the high-N spectacle.** Anchors 0 and 9 only appear in 5+ player matches. The wings can carry more dramatic terrain — wider mesas, taller towers, more elaborate scenery. Big spectacle for the big games.
3. **Vertical headroom matters.** When the director zooms in on an active tank, it shows ~30% of the canvas width but the FULL 800 px height. Don't tuck critical detail in a thin horizontal band — paint with the full 800 px in mind. A tall tower visible only in zoomed-in view is fine; a 60-px-tall band of detail at y=400 that's only visible at fit-world zoom is wasted effort.

---

## 8. Genre wisdom — distilled

Notes from competitive Worms / Gunbound / ShellShock Live communities and competitive level-design literature. These are not strict rules but they're the lessons the genre has earned over 30 years.

1. **Symmetry is a tool, not a religion.** Castle, Urban, Canyon are visibly symmetric — that's their identity. Desert, Jungle, Moon, Arctic, Volcanic are asymmetric — that's also their identity. What matters is spawn parity, which mirror-around-centre gives you for free regardless of overall map symmetry.
2. **Open maps reward aim. Tight maps reward patience.** A spread of both means players can't out-grind one playstyle. Our 8 maps cover the spread: Desert (open) → Canyon (very tight) with the others in between.
3. **No spawn dominance.** Worms competitive scene's biggest single complaint about hand-designed maps is "this spawn always wins." Mirror-around-centre kills this entirely.
4. **Avoid the cavern trap.** Worms-style closed-roof maps (indestructible ceiling) play badly — they disable too many weapon types and draw too often. None of our 8 maps should have an indestructible ceiling. Castle's tower bases are localised indestructible, not a roof.
5. **Joke themes kill brand identity.** Worms' Cheese / Sports / Music themes are fun in casual but undermine competitive perception. SolShot has real money on the line — every map should feel intentional. None of the 8 are joke themes.
6. **Player memory rewards consistency.** Once a map is shipped, terrain features shouldn't change in patches. Cosmetic skinning is fine (skin packs, seasonal variants) but the underlying heightmap shape stays fixed forever. Players invest hours learning Castle's tower angles — those angles can't move.
7. **The "always-on" backdrops are the wallpaper of the player's hours.** Players will spend more time looking at your backdrops than any other art in the game. Treat them like album covers.

---

## 9. Optional flourishes (post-v1)

Nice-to-have, low-priority, do not let these distract from getting the 8 maps shipped:

- **Ambient particles** — dust motes on Desert, snow flurries on Arctic, embers on Volcanic. Simple Phaser particle emitters, ~20-40 particles. Add via `meta.json.ambient.particles`.
- **Parallax depth** — backdrop split into 2-3 layers (sky / far mountains / mid mountains) for parallax scrolling as the camera pans. Worth it if it adds ~10% effort; skip if it doubles authoring time.
- **Day/night variants** — same heightmap, different backdrop palette. Could be done as a content drop later. Not v1.
- **Map-specific weapon variants** — e.g., napalm sticks longer on Jungle's foliage. Out of scope for design; engineering will flag if/when this becomes a thing.

---

## 10. Submission and iteration

### Format

Deliver per-map as:

```
<theme-slug>/
├── backdrop.png        (PNG, RGB, 3456 × 800)
├── heightmap.png       (PNG, grayscale 8-bit, 3456 × 800, no antialiasing)
├── surface.png         (PNG, RGBA, 3456 × 800)
├── spawns.json
└── meta.json
```

Plus a **single Figma / PSD file per map** showing the layered source — so we can iterate on individual layers without re-exporting from scratch. Layers named: `backdrop`, `surface`, `silhouette` (the heightmap), `spawn-markers` (visual indicators only, not exported).

### Recommended order

Start with **Desert** as the v1 prototype. It's the easiest theme (open, warm, high-visibility), the backdrop already exists in the right style, and getting one map end-to-end will surface any issues with the spec before five more are in flight. Once Desert ships and we've validated the loader, the other seven can run in parallel.

### Iteration loop

1. Designer delivers Desert
2. Engineering loads it into a dev branch, runs a 4-player playtest
3. Designer + engineering review: spawn balance, projectile readability, backdrop/surface contrast, mobile rendering check
4. Designer iterates (typically 1-2 rounds)
5. Map merges to main
6. Move to next map

Plan for ~half a day per map of post-submission iteration regardless of theme. Spawn anchor tuning is the most common iteration loop — paint quality almost never needs a redo.

### Timeline (engineering's ask, not a hard deadline)

- Week 1: Desert end-to-end (designer + engineering pipeline validation)
- Week 2: 3 more maps in parallel (Jungle, Moon, Arctic — the easier ones, completing the Easy and Medium tiers)
- Week 3: 4 hard maps (Urban, Volcanic, Castle, Canyon)
- Week 4: Iteration + polish

~4 weeks total elapsed, ~half a designer (one map every 2-3 days steady state).

---

## 11. Questions before kick-off

Before you start painting, please send us:

1. Any clarifying questions on the spec above
2. A rough style test — a 1500 × 800 crop of one map (probably Desert) showing backdrop + surface art in your interpretation of the existing-three style. We'll signal-check before you go full-width.
3. Your file format preference for the source files (Figma / PSD / something else) — we'll match whatever your workflow is.

---

## 12. Engineering contacts

- **JJ** (project lead) — overall art direction, theme call, final approval
- **main-claude** (engineering, async via JJ) — runtime integration, spawn-anchor math, pipeline questions

Iterations and questions can flow via JJ → engineering. Don't try to ping engineering directly; the project doesn't have async channels set up for designer ↔ engineering yet.

---

**That's the brief.** Read it, sit with it for a day, then send us the questions list. We'd rather front-load the clarifications than rework four maps.
