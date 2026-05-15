# Keepie-Uppies — DALL-E Art Prompts v0.1

Two assets total. Per Ball Games Playbook ch.11 — brief on physics proportions from day one, list forbidden artifacts explicitly, expect 2–3 iteration rounds.

**Drop completed PNGs at:**
- `public/assets/keepie-uppies/ball.png` (in both monorepo + standalone)
- `public/assets/keepie-uppies/pitch.png` (in both monorepo + standalone)

---

## Asset 1 — `ball.png`

**Target:** ~512×512 PNG with alpha channel. Will render at ~50–80 px diameter on a typical phone screen, so detail beyond panel pattern won't read.

### Primary prompt

> A classic black-and-white-paneled football (soccer ball, Telstar style — 12 black pentagons interlocked with 20 white hexagons), photographed from a slight 3/4 angle so the spherical shape reads clearly, isolated as a **product cutout** on a PURE TRANSPARENT background (alpha channel only). Clean, professional product-photography lighting from the upper-left. Subtle drop shadow OK underneath. No text, no logos, no shadows on the ball except the natural shading.
>
> ABSOLUTELY NO checker pattern, NO halftone dots, NO polka dots, NO pop-art texture, NO splatter, NO grunge, NO decorative border, NO background pattern. The background must be 100% transparent — pure alpha = 0 outside the ball.
>
> Like a sticker cutout ready for compositing into a 2D web game. Square aspect ratio.

### Backup prompt (if transparency keeps failing)

> A classic black-and-white-paneled football (soccer ball, Telstar style — 12 black pentagons interlocked with 20 white hexagons), 3/4 angle, professional product-photography lighting. Isolated on a PURE SOLID `#00FF00` GREEN background with NO pattern of any kind — no checker, no dots, no gradient, no decoration. The green is for chroma-keying. Square aspect ratio.

(If we get the green-screen version, I'll chroma-key it out via pngjs.)

### Iteration notes
- The ball is **the** visual element. Variation 1 should be evaluated for: panel pattern visible, sphere reads clearly at small size, no rim of background colour bleeding in alpha.
- Per playbook ch.5.1 — the ball will be drawn at a known physics radius (`BALL_RADIUS_M = 0.11`); the asset's centre must be at the centre of the PNG and the ball's edge must touch (within ~5 px) the PNG edges. We'll measure with pngjs to confirm centre + radius before sprite-mounting.

---

## Asset 2 — `pitch.png` (grass band only — sky is procedural)

**Target:** wide-rectangle PNG (e.g. 1024×512). Just the grass surface — sits as a band at the bottom of the canvas. Sky above it is drawn procedurally in the scene.

**Direction set by Fish 2026-05-15:** the original prompt had goalposts + golden-hour horizon + chalk lines. Cut. The ball spends the entire game mid-air against the sky, so elaborate horizon detail was wasted. Just grass with mowing stripes, the simplest thing that reads as "you're on a pitch."

### Primary prompt

> A football (soccer) pitch grass texture with classic mowing stripes — alternating bands of slightly darker and slightly lighter green, like the grass has been mowed in opposite directions across the field. Just the grass surface, viewed roughly head-on (slight downward tilt is fine but no strong perspective). No pitch markings, no chalk lines, no players, no ball, no objects, no shadows of objects.
>
> About 5–7 stripes running horizontally across the frame. Subtle but clearly visible contrast between bands. Saturated rich green. Even, natural mid-day lighting.
>
> Aspect ratio: wide rectangle, roughly 2:1 (e.g. 1024×512). This is a ground-band texture that will sit at the bottom of the game canvas — sky above it stays procedural.

### Iteration notes
- The grass band occupies the bottom ~15% of the canvas (matching the placeholder green strip in `src/scene.js`). Sky above stays as the placeholder `#87b8d8` flat colour, or a one-line procedural gradient if Fish wants more depth later.
- Stripes should be subtle — too contrasty becomes distracting. The eye should track the ball, not the grass.
- If horizontal stripes feel wrong against a side-on perspective, try diagonal stripes (mower running diagonally across the camera) as an alternate.

---

## Generation workflow

1. Run primary prompts in DALL-E (or whatever model is current). Generate 3–4 variations of each.
2. Drop the best of each into `public/assets/keepie-uppies/` in **both** the monorepo and the standalone repo.
3. Send screenshots back so I can sanity-check before sprite-mounting:
   - Ball: is it isolated cleanly? Any background bleed? Centre/radius look right?
   - Pitch: does the upper two-thirds (sky) read as calm enough that a black-and-white ball will pop in front of it?
4. If iteration needed, refine prompts and rerun. Document the winning prompt below for posterity (basketball pattern — the prompt that won goes into the playbook).

---

## Final winning prompts

Both assets landed in **one round** (no iteration needed). Quality high, matched briefs cleanly.

### ball.png — winning prompt (used 2026-05-15)

The primary prompt (above) ran clean — DALL-E gave a true-alpha 1024×1024 PNG, ball centred within 8 px of dead-centre, visible radius 343 px (67% of PNG width). No chroma-key fallback needed.

Measured + sprite-mounted via `scripts/measure-ball.mjs` in the standalone repo.

### pitch.png — winning prompt (used 2026-05-15)

Same — primary revised-grass-only prompt landed clean on first run: pure grass, 5–7 horizontal mowing stripes, no horizon/goal/chalk. Saturated rich green. Used as a stretched band along the bottom 18% of the canvas.

The original elaborate prompt (sunset + goalposts + horizon + chalk) generated a beautiful image that competed with the ball visually — Fish flagged "too much," I rewrote, second prompt nailed it. **Lesson for future games: simpler backdrop briefs win for arcade games where the ball is the focal point.**
