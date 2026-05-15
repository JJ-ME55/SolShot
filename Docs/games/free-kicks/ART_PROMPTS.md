# Free-Kick Madness — Art Prompts v0.1

DALL-E prompt drafts for each asset, applying [`BALL_GAMES_PLAYBOOK §11`](../../BALL_GAMES_PLAYBOOK.md#11-asset-generation-lessons-dall-e) lessons:

- Transparent backgrounds — DALL-E struggles; prompt for it explicitly and follow up with cleanup.
- Reference style transfer — feed a reference image when possible.
- Specify proportions explicitly — DALL-E does not respect implicit aspect ratios.
- Element overlap kills frame-slicing — keep each sprite isolated.

The stadium / floodlit art is more ambitious than basketball's streetball court. Plan on 3-4 DALL-E iterations per asset to land it. **All sprite assets need a final pngjs measurement pass to capture true bounding box + visible centre — playbook §5.5.**

---

## Style anchor — overall visual reference

Before generating individual assets, lock the **art-style anchor** in your head. The pitch is:

> *"A modern football video-game art style. Like FIFA's free-kick camera, but slightly stylised — not photoreal. Saturated floodlight at night, deep blue/black sky, the pitch a vivid green. Crowd in silhouette except where lit. Punchy, arcade-readable, with a touch of comic-book line work."*

Save 2-3 reference images you like in `Docs/games/free-kicks/art-refs/` before generating, and use them as DALL-E reference uploads.

---

## 1. Stadium hero background

**Purpose:** Single hero image rendered behind everything. The "world" the player sees from the kicker's POV. Sky, far stands, near stands silhouette, floodlights, light haze. The goal frame is rendered as a separate sprite on top.

### Prompt v1

> A first-person view from behind a football during a floodlit night match in a packed stadium. Wide aspect ratio (16:9). The viewer is at ground level, looking down the pitch toward the goal area. Stadium fills the background: tiered stands packed with silhouetted crowd, four large floodlight pylons rising from the corners of the stadium, deep blue-black night sky above. Floodlights cast a warm white wash across the scene with visible lens flares and atmospheric haze. The pitch surface (vivid bright green grass) is visible in the foreground stretching toward the goal. The goal itself is OMITTED — leave the centre-back of the image clear so a goal frame sprite can be composited on top. Slight wide-angle lens distortion. Stylised semi-realistic art, like a modern football video game. No players, no ball, no UI. Saturated colours, punchy contrast.

### Notes

- The "OMIT the goal" instruction is critical — the goal is a separate sprite for animation control.
- Aspect ratio: 16:9 minimum (the canvas is 1956×800 on SolShot — match or exceed).
- Iterate on the floodlight position until they don't overlap the goal area in the centre.

### Failure modes to watch

- DALL-E often places a goal in the scene anyway → manually mask out in Photoshop.
- Crowd too detailed → say "silhouetted" in the prompt repeatedly.

---

## 2. Pitch foreground

**Purpose:** Maybe not a separate asset — if §1 has the pitch baked in, skip this. If we need a parallax layer for the near-ground (so the ball can sit on it cleanly), here's the prompt.

### Prompt v1

> A patch of football pitch grass viewed from a low angle, slight perspective foreshortening, vivid green with light/dark mowing stripes visible. The near edge of the penalty arc is partially visible at the top of the image (a white painted curve). Wide aspect (16:9), transparent background outside the grass area. No ball, no players. Stylised semi-realistic.

### Notes

- Most likely **drop this asset** — bake the pitch into the stadium hero.

---

## 3. Goal frame + netting sprite

**Purpose:** The goal as a separate sprite, composited over the stadium. Independent depth-ordering for the "ball in net" caught-visual (playbook §5.3).

### Prompt v1

> A football goal frame with white netting, viewed from a first-person POV behind the ball, dead-centre. Standard regulation proportions (7.32m wide, 2.44m tall — the frame should be roughly 3× as wide as it is tall). White goalposts and crossbar, slightly thicker than realistic for arcade readability. White net behind the frame, fine mesh pattern, slightly transparent (you should be able to see motion through it). Transparent background outside the goal. No pitch, no crowd, no defenders. Stylised semi-realistic, modern football video game style. Sharp clean lines.

### Notes

- Critical: aspect ratio must be 3:1 (or close). Measure with pngjs after generation.
- Net transparency lets the celebration / target-hit visual punch through.
- Iterate until the post thickness reads cleanly at game scale.

---

## 4. Wall defender sprites

**Purpose:** N defenders rendered side by side to form the wall. Per design we need **at least 2 kit colours** so the wall doesn't look like one blob, and **3-4 body / pose variants** so a 6-defender wall is visually varied.

### Prompt v1 — Kit A (e.g. red shirt, white shorts)

> A professional football player standing in a defensive wall pose, viewed from directly in front. Full body, head to toe. Wearing a red short-sleeve football shirt with white sleeves trim, white shorts, red socks, modern football boots. Arms folded across the groin (the standard wall pose for protection). Eyes focused forward, intense expression, slight crouch. Realistic adult male proportions. Stylised semi-realistic, modern football video game style. **Transparent background — no pitch, no shadow, no scenery.** Centred subject. No ball, no other players.

### Prompt v1 — Kit B (e.g. white shirt, black shorts — Real Madrid style)

> [same as above with: "Wearing a white short-sleeve football shirt with black trim, white shorts, black socks..."]

### Pose variants to generate

Make 3-4 of each kit:
- (a) Arms-crossed-over-groin standard wall pose, neutral face.
- (b) Same pose but slight head turn looking at the ball position.
- (c) Same pose, taller player (height variation gives the wall texture).
- (d) Same pose, shorter / stockier player.

### Notes

- **Transparent background is non-negotiable** — restate in the prompt at least twice and check the alpha channel of every output.
- DALL-E will often add a shadow under the feet → ask explicitly for "no shadow" and erase any that slips through.
- Measure with pngjs after each generation to confirm visible bounding box. Defenders at game scale should be ~1.8m tall in world units.
- No facial detail required for v1 — small enough at game scale that it doesn't matter.

---

## 5. Football sprite

**Purpose:** The ball. Same sprite throughout the trajectory, with depth-emphasis scaling (playbook §5.4 — 2× scale at launch, 1× at goal distance).

### Prompt v1

> A modern football (soccer ball), viewed from a 3/4 angle. White with black geometric panels in the classic icosahedral pattern (12 black pentagons, 20 white hexagons). Sharp clean lines, slight specular highlight on top-left to indicate light source. Stylised semi-realistic, modern football video game style. Centred subject. **Transparent background — no pitch, no shadow, no field markings.**

### Notes

- One ball sprite. We do NOT generate rotation frames — the ball travels too fast to need them at game scale.
- If we DO want rotation later (v1.1), use a 4-frame loop and pick one panel pattern that reads cleanly at speed.
- Pngjs measure after generation — the visible centre should be exact for trajectory plotting.

---

## 6. Target sprites

**Purpose:** Two overlay sprites visible in the goal mouth — `+10` and `❤️`.

### Prompt v1 — `+10` target

> A gold metallic disc, viewed straight-on, with the text "+10" embossed in bold sans-serif numerals on the front face. Slight 3D depth so the edges of the disc are visible. Subtle radial gleam suggesting metal shine. Centred subject. **Transparent background — no pitch, no field, no shadow.** Stylised semi-realistic, modern football video game style.

### Prompt v1 — ❤️ heart target

> A glossy red heart shape, viewed straight-on, slight 3D depth. Strong red colour with a small white highlight at the upper-left to suggest gloss. Symmetric. Centred subject. **Transparent background — no pitch, no shadow, no border.** Slightly stylised, modern arcade game look.

### Notes

- Both rendered at the same scale so they slot into the same hitbox dimensions (~0.6m × 0.6m in world units).
- The ❤️ heart gets a subtle pulse animation in-engine (CSS/canvas keyframe scaling 1.0 ↔ 1.1) — DALL-E doesn't need to handle that.
- The `+10` may want a subtle rotation in-engine for visual punch — also CSS, not DALL-E.

---

## 7. HUD elements

Most HUD will be CSS / Phaser shapes — minimal DALL-E here.

| Element | Approach |
|---|---|
| Lives bar (5 small ❤️ icons) | Reuse the ❤️ target sprite at small scale. CSS-render the count. |
| Score readout | Pure text, Phaser BitmapText. No DALL-E. |
| Scenario chip ("18m • centre • 3-man wall") | Pure CSS / Phaser. No DALL-E. |
| Miss-type popup ("BLOCKED!" / "OVER!" / "WIDE!" / "POST!") | Pure text with a strong outline / shadow. Phaser BitmapText. |
| Goal-celebration text ("GOAL!") | Pure text with screen-shake + crowd-roar SFX. Phaser BitmapText. |

No DALL-E prompts needed.

---

## 8. Live swipe trail (no DALL-E)

Rendered live in Phaser as a curved line that follows the gesture path. Faded tail. Pure shader / canvas drawing.

---

## Checklist before generating

- [ ] Style reference images saved to `Docs/games/free-kicks/art-refs/`.
- [ ] DALL-E quota confirmed.
- [ ] Photoshop / Procreate ready for background-cleanup and alpha-mask passes.
- [ ] pngjs measurement script ready to run on each output (see basketball's `scripts/measure-sprite.js` if it exists; otherwise add one).

---

## Iteration log (fill in as we generate)

| Asset | Iteration | Prompt change | Result | Notes |
|---|---|---|---|---|
| Stadium hero | v1 | initial | — | — |
| Goal frame | v1 | initial | — | — |
| Wall defender Kit A pose (a) | v1 | initial | — | — |
| Wall defender Kit B pose (a) | v1 | initial | — | — |
| Football | v1 | initial | — | — |
| +10 target | v1 | initial | — | — |
| ❤️ target | v1 | initial | — | — |
