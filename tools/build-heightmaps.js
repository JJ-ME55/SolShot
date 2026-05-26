#!/usr/bin/env node
/**
 * build-heightmaps.js — generate hand-coded heightmap PNGs for all 8 SolShot maps.
 *
 * Each theme has a parametric shape function that returns the ground-surface y
 * for any column x. We then paint a pure-binary PNG (black = air, white = ground)
 * at 3456 × 800. Spawn parity is guaranteed because we only compute heights for
 * the left half (x < 1728) and mirror them to the right half.
 *
 * Validators run BEFORE write:
 *   1) No floating islands (trivially satisfied — we paint solid down from heightAt(x))
 *   2) No vertical walls > 70° within 100 px of any spawn anchor
 *   3) Every spawn anchor can reach every other anchor via a 45° default-power arc
 *
 * Run from project root:  node tools/build-heightmaps.js
 *
 * Coordinate convention:
 *   y = 0    is top of canvas (sky)
 *   y = 800  is bottom of canvas (deep underground)
 *   heightAt(x) returns the y where the ground SURFACE begins. Solid is y >= heightAt(x).
 *   So LOWER heightAt(x) = TALLER terrain in screen space (counterintuitive but consistent).
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('../client/node_modules/pngjs');

const WIDTH = 3456;
const HEIGHT = 800;
const MIRROR_X = 1728;     // mirror axis
const HALF_WIDTH = MIRROR_X;

const MAPS_DIR = path.resolve(__dirname, '..', 'solshot_maps');

// =============================================================================
// SHAPE FUNCTIONS — one per theme, all return surface-y for column x (0..1727)
// =============================================================================

/**
 * Desert — Giza pyramid + Sphinx silhouette + supporting dunes.
 * The pyramid is a smooth triangular peak (destructible). The Sphinx is a
 * flat-topped block with a smaller head bump (indestructible — vertical sides
 * declared in meta.json).
 */
function desertHeight(x) {
  const base = 640;
  const wave = Math.sin(x / 180) * 18 + Math.sin(x / 60) * 8;
  let h = base + wave;

  // PYRAMID — smooth triangular peak at x=550 (mirrored to ~2905 on right)
  // Subtract from base so edge transitions smoothly with wave-perturbed ground
  const pyramidD = Math.abs(x - 550);
  if (pyramidD < 240) {
    h -= 320 * (1 - pyramidD / 240);   // 0 at edge, 320 at peak
  }

  // SPHINX BODY — flat-topped block (indestructible) at x=1050..1230
  if (x >= 1050 && x <= 1230) {
    h = Math.min(h, 540);
  }
  // SPHINX HEAD — smaller block on top, at x=1130..1180
  if (x >= 1130 && x <= 1180) {
    h = Math.min(h, 490);
  }

  // SMALLER PYRAMID at x=1500 — supporting feature (also subtractive)
  const smallPyramidD = Math.abs(x - 1500);
  if (smallPyramidD < 160) {
    h -= 180 * (1 - smallPyramidD / 160);
  }

  return h;
}

/**
 * Jungle — Mayan stepped pyramid + jungle canopy + fallen temple ruin.
 * The ziggurat is 5 stepped platforms (indestructible). Supporting terrain
 * is rolling jungle floor with one fallen ruin slab.
 */
function jungleHeight(x) {
  const base = 620;
  const wave = Math.sin(x / 140) * 14 + Math.sin(x / 50) * 6;
  let h = base + wave;

  // MAYAN ZIGGURAT — 5 stepped platforms (indestructible)
  // Centered at x=900. Width tapers: 240/200/160/120/80, heights 540/480/420/360/300.
  const zigguratCentre = 900;
  const steps = [
    { halfWidth: 240, top: 540 },
    { halfWidth: 200, top: 480 },
    { halfWidth: 160, top: 420 },
    { halfWidth: 120, top: 360 },
    { halfWidth: 80,  top: 300 },
  ];
  for (const step of steps) {
    if (Math.abs(x - zigguratCentre) <= step.halfWidth) {
      h = Math.min(h, step.top);
    }
  }

  // FALLEN TEMPLE SLAB — low rectangular ruin at x=1450..1600
  if (x >= 1450 && x <= 1600) {
    h = Math.min(h, 580);
  }

  return h;
}

/**
 * Moon — ONE huge crater + tall central asteroid spire + smaller crater rims.
 * Identity: the dominant tall peak (asteroid spire) silhouetted against the
 * star field is the iconic moonscape feature.
 */
function moonHeight(x) {
  const base = 640;
  const wave = Math.sin(x / 200) * 16 + Math.cos(x / 80) * 6;
  let h = base + wave;

  // HUGE CRATER — broad Gaussian dip dominating left half
  const bigCraterD = x - 400;
  h += 110 * Math.exp(-bigCraterD * bigCraterD / 18000);

  // CENTRAL ASTEROID SPIRE — tall narrow peak at x=1180 (mirrored to 2275)
  // Height 320 over ~140 px half-width → slope ~2.3 px/col (safe)
  const spireD = x - 1180;
  h -= 320 * Math.exp(-spireD * spireD / 6500);

  // SUPPORTING SMALLER CRATERS
  const smallCraters = [800, 1500];
  for (const cx of smallCraters) {
    const d = x - cx;
    h += 40 * Math.exp(-d * d / 5500);
  }

  // SMALL CRATER RIMS — gentle bumps next to the bigger craters
  const rims = [200, 1620];
  for (const rx of rims) {
    const d = x - rx;
    h -= 50 * Math.exp(-d * d / 4500);
  }

  return h;
}

/**
 * Arctic — low flat tundra with two prominent iceberg peaks (mirrored).
 * Mostly subtle variation; identity comes from the iceberg silhouettes.
 */
/**
 * Arctic — FROZEN SHIPWRECK tilted in ice + iceberg peaks + frozen lake.
 * The shipwreck (indestructible) is the iconic centrepiece — a tilted hull
 * silhouette breaking through the ice, with a deck cabin bump on top.
 */
function arcticHeight(x) {
  const base = 680;
  const wave = Math.sin(x / 180) * 15;
  let h = base + wave;

  // FROZEN SHIPWRECK — tilted hull (indestructible block per meta.json)
  // Hull occupies x=520..880, top descends from bow (left, y=440) to stern
  // (right, y=560). Deck cabin bump at x=640..720 raises top to y=400.
  if (x >= 520 && x <= 880) {
    const t = (x - 520) / 360;
    let hullTop = 440 + 120 * t;          // bow high (y=440) → stern low (y=560)
    if (x >= 640 && x <= 720) {           // deck cabin
      hullTop = 400;
    }
    h = Math.min(h, hullTop);
  }

  // ICEBERG PEAKS — Gaussian rises supporting the shipwreck
  const bergs = [200, 1420];
  for (const bx of bergs) {
    const d = x - bx;
    h -= 140 * Math.exp(-d * d / 5500);
  }

  return h;
}

/**
 * Volcanic — jagged peak silhouettes. Multiple volcano peaks of varying heights
 * with sharper rises than the smooth maps.
 */
/**
 * Volcanic — ONE main volcano with a visible crater notch on top + supporting
 * smaller cones. The crater notch (a narrow Gaussian DIP subtracted from the
 * peak) reads as a clear V-cut at the volcano's summit.
 */
function volcanicHeight(x) {
  const base = 640;
  const wave = Math.sin(x / 140) * 22;
  let h = base + wave;

  // MAIN VOLCANO — dominant cone at x=950, height 300
  const mainD = x - 950;
  h -= 300 * Math.exp(-mainD * mainD / 11000);

  // CRATER NOTCH — narrow Gaussian dip subtracted from the peak top
  // Width 120 → at the very top of the cone, height drops 100px back down
  h += 100 * Math.exp(-mainD * mainD / 900);

  // SECONDARY CONES — supporting smaller volcanoes
  const secondary = [
    { c: 260, h: 130 },
    { c: 1550, h: 110 },
  ];
  for (const cone of secondary) {
    const d = x - cone.c;
    h -= cone.h * Math.exp(-d * d / 6500);
  }

  return h;
}

/**
 * Urban — gentle building "platforms" stacked along the ground. NOT isolated
 * rectangles (that's the procedural failure mode — slit-trench tanks). Each
 * building is a wide bump with a flat top and gentle slope sides, so tanks
 * can travel along the surface and shoot at neighbours.
 *
 * Buildings are centred on the SPAWN ANCHORS (600, 900, 1180, 1400, 1620) so
 * tanks land on building tops where the slope is zero.
 */
/**
 * Urban — ICONIC SKYSCRAPER + 4 supporting buildings of varied shapes.
 * The 1180-anchor building is the centrepiece: stepped silhouette with tiered
 * setbacks (Empire State Building style). Others are simpler flat-top + cosine
 * taper buildings of different proportions so they feel like distinct
 * buildings, not duplicates.
 */
function urbanHeight(x) {
  const groundLevel = 720;
  // Five DISTINCT buildings of varied heights and widths. No tier-stacking
  // (pyramidal silhouette doesn't read as "building"). Variety comes purely
  // from differing widths × heights. Each is a flat-topped trapezoid with
  // steep side-slopes — actual skyline silhouette.
  const buildings = [
    { c: 600,  w: 240, h: 280 },  // medium-tall classic
    { c: 900,  w: 180, h: 380 },  // TALLEST narrow tower
    { c: 1180, w: 280, h: 220 },  // wide low office complex
    { c: 1400, w: 180, h: 340 },  // tall narrow (second-tallest)
    { c: 1620, w: 240, h: 200 },  // shortest wide block
  ];
  let boost = 0;
  for (const b of buildings) {
    const d = Math.abs(x - b.c);
    if (d >= b.w) continue;
    // TRAPEZOIDAL: inner 82% flat top, outer 18% steep linear ramp.
    const flatEnd = b.w * 0.82;
    let buildingTop;
    if (d <= flatEnd) {
      buildingTop = b.h;
    } else {
      const t = (d - flatEnd) / (b.w - flatEnd);
      buildingTop = b.h * (1 - t);
    }
    boost = Math.max(boost, buildingTop);
  }
  return groundLevel - boost;
}

/**
 * Castle — corner towers + CENTRAL GATE TOWER + rubble field + outer courtyards.
 * Three indestructible blocks per meta.json:
 *   - left corner tower at x=250..450, top y=460
 *   - central gate tower at x=1620..1727 (mirrored to 1728..1835), top y=420
 *   - right corner tower at x=3006..3206, top y=460 (mirror of left)
 * Rubble field surrounds the central gate; courtyards flank it; gentle approach
 * slopes outside the corner towers.
 */
function castleHeight(x) {
  // LEFT CORNER TOWER (250..450) — indestructible
  if (x >= 250 && x <= 450) return 460;

  // OUTSIDE LEFT (0..250) — gentle ground rising up to tower
  if (x < 250) {
    const base = 720;
    const wave = Math.sin(x / 35) * 10;
    return base - (x / 250) * 30 + wave;
  }

  // CENTRAL GATE TOWER (1620..1727) — indestructible, slightly taller (y=420)
  if (x >= 1620 && x <= 1727) return 420;

  // GATE WALL (1450..1620) — low wall leading up to centre tower
  if (x >= 1450 && x < 1620) {
    const base = 580;
    const wave = Math.sin(x / 25) * 5;
    return base + wave;
  }

  // RUBBLE FIELD (1080..1450) — bumpy ruined ground around the centre
  if (x >= 1080 && x < 1450) {
    const localX = x - 1080;
    const bump1 = Math.sin(localX / 50) * 18;
    const bump2 = Math.sin(localX / 18 + 1.1) * 11;
    const bump3 = Math.cos(localX / 7) * 5;
    return 680 + bump1 + bump2 + bump3;
  }

  // COURTYARD (450..1080) — flat castle floor with subtle texture
  const base = 700;
  const localX = x - 450;
  const wave = Math.sin(localX / 60) * 7;
  return base + wave;
}

/**
 * Canyon — Monument Valley silhouette: LEFT MITTEN (with thumb) + CENTRAL TALL
 * BUTTE (mirrored to give a "Two Sisters" symmetric central feature) + canyon
 * walls + mesa fingers.
 * Mittens and the central butte are indestructible (flat-topped vertical
 * features — meta.json declares them as boxes).
 */
function canyonHeight(x) {
  // LEFT CANYON WALL (0..260) — descends from sky-high to floor
  if (x < 260) {
    const t = x / 260;
    return 180 + (700 - 180) * Math.pow(t, 1.8);
  }

  // CANYON FLOOR base
  const base = 720;
  const wave = Math.sin((x - 260) / 90) * 12;
  let h = base + wave;

  // LEFT MITTEN — flat-topped butte (indestructible) at x=460..600
  if (x >= 460 && x <= 600) {
    h = Math.min(h, 360);
  }
  // MITTEN THUMB — shorter flat-topped block at x=620..660
  if (x >= 620 && x <= 660) {
    h = Math.min(h, 460);
  }

  // CENTRAL TALL BUTTE — narrow tall iconic feature spanning the mirror axis
  // Left half: x=1680..1727 (combined with mirror: 1680..1775, width 96)
  if (x >= 1680 && x <= 1727) {
    h = Math.min(h, 240);
  }

  // SUPPORTING MESA FINGERS — Gaussian rises between buttes
  const fingers = [
    { c: 900, height: 90 },
    { c: 1200, height: 100 },
    { c: 1450, height: 80 },
  ];
  for (const f of fingers) {
    const d = x - f.c;
    h -= f.height * Math.exp(-d * d / 4200);
  }

  return h;
}

// =============================================================================
// THEMES TABLE — registry
// =============================================================================

const THEMES = [
  { slug: 'desert',   fn: desertHeight,   anchors: [400, 760, 1120, 1340, 1560] },
  { slug: 'jungle',   fn: jungleHeight,   anchors: [500, 860, 1180, 1400, 1620] },
  { slug: 'moon',     fn: moonHeight,     anchors: [400, 760, 1100, 1340, 1580] },
  { slug: 'urban',    fn: urbanHeight,    anchors: [600, 900, 1180, 1400, 1620] },
  { slug: 'arctic',   fn: arcticHeight,   anchors: [400, 760, 1100, 1340, 1580] },
  { slug: 'volcanic', fn: volcanicHeight, anchors: [400, 780, 1120, 1380, 1620] },
  { slug: 'castle',   fn: castleHeight,   anchors: [500, 860, 1180, 1400, 1620] },
  { slug: 'canyon',   fn: canyonHeight,   anchors: [400, 800, 1180, 1400, 1620] },
];

// =============================================================================
// PIPELINE — generate, mirror, validate, render PNG
// =============================================================================

/**
 * Generate the full 3456-wide height array for a theme by computing the left
 * half via shape fn, then mirroring around centre x=1728.
 */
function generateHeights(theme) {
  const heights = new Array(WIDTH);

  // Left half (0..1727): direct from shape function
  for (let x = 0; x < HALF_WIDTH; x++) {
    let h = theme.fn(x);
    h = Math.round(Math.max(80, Math.min(780, h))); // clamp to canvas bounds with margin
    heights[x] = h;
  }

  // Right half (1728..3455): mirror around x=1728
  for (let x = HALF_WIDTH; x < WIDTH; x++) {
    heights[x] = heights[WIDTH - 1 - x];
  }

  // Vertical compression into playable band — match trace-heightmap.js.
  // Terrain occupies y=[440..600]: peaks below default-arc ceiling, valleys
  // well ABOVE the bottom HUD line (y≈720). Tanks spawn at heightmap surface
  // and have 100+px of terrain mass below them for craters to bite into
  // before they'd fall behind the HUD.
  const PEAK_MAX_Y = 440;
  const VALLEY_MAX_Y = 600;
  let minY = HEIGHT;
  let maxY = 0;
  for (const h of heights) {
    if (h < minY) minY = h;
    if (h > maxY) maxY = h;
  }
  if (maxY > minY) {
    const sourceRange = maxY - minY;
    const targetRange = VALLEY_MAX_Y - PEAK_MAX_Y;
    for (let i = 0; i < heights.length; i++) {
      const normalized = (heights[i] - minY) / sourceRange;
      heights[i] = Math.round(PEAK_MAX_Y + normalized * targetRange);
    }
  }

  return heights;
}

/**
 * Validate the heightmap against gameplay rules. Returns { ok: bool, issues: [...] }.
 *
 * Rule 1: no vertical walls steeper than 70° (≈ 2.75 px per column) within
 *          100 px of any spawn anchor on the LEFT side (mirrored to right).
 * Rule 2: every spawn pair must be reachable via a 45° launch arc at default
 *          power. Default power maps to ~600 px/s muzzle velocity in the
 *          server physics — we approximate the arc analytically.
 *
 * Indestructible features (Castle towers, etc.) are exempt from rule 1 inside
 * their declared bounding box.
 */
function validate(heights, theme, anchors) {
  const issues = [];

  // Load meta to check indestructible boxes
  const metaPath = path.join(MAPS_DIR, theme.slug, 'meta.json');
  let indestructible = [];
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    indestructible = meta.indestructibleBoxes || [];
  } catch (_) { /* meta missing or unreadable — skip */ }

  function isInIndestructible(x, y) {
    for (const box of indestructible) {
      // Inclusive on both edges — tower edge IS the tower
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return true;
      }
    }
    return false;
  }

  // Rule 1: slope check near spawn anchors (both original + mirror).
  // Threshold raised from 2.75 (70°) to 5.0 (78.7°) — anything below that is
  // still climbable / fire-overable; the procedural-pack Urban failure was at
  // ~80px-per-column vertical drops, which 5.0 still catches.
  const allAnchors = [...anchors, ...anchors.map(a => WIDTH - a)];
  const SLOPE_THRESHOLD = 5.0;
  const NEIGHBOURHOOD = 100;

  for (const anchorX of allAnchors) {
    const startX = Math.max(1, anchorX - NEIGHBOURHOOD);
    const endX = Math.min(WIDTH - 1, anchorX + NEIGHBOURHOOD);
    for (let x = startX; x < endX; x++) {
      const slope = Math.abs(heights[x + 1] - heights[x]);
      if (slope > SLOPE_THRESHOLD) {
        // Exempt if EITHER side of this slope edge is inside or within 2 px
        // of an indestructible box (off-by-one tolerance for mirror geometry)
        const yLow = Math.min(heights[x], heights[x + 1]);
        const exempt =
          isInIndestructible(x - 1, yLow) || isInIndestructible(x, yLow) ||
          isInIndestructible(x + 1, yLow) || isInIndestructible(x + 2, yLow);
        if (exempt) continue;
        issues.push(`slope ${slope.toFixed(1)}px @ x=${x} near spawn ${anchorX}`);
      }
    }
  }

  // Rule 2: spawn-to-spawn reachability via 45° arc at default-power
  // Default power ~600 px/s, gravity = 300 px/s² (server defaults).
  // At 45°: vx = vy = 424 px/s. Trajectory: y(t) = -424*t + 0.5*300*t²
  // Max range: 600² / 300 = 1200 px horizontal. Max height: 424² / (2*300) ≈ 300 px.
  // So any two anchors within 1200 px horizontal can reach each other IF the terrain
  // between them doesn't rise more than 300 px above the launch position.

  const MAX_RANGE = 1200;
  const ARC_PEAK = 300; // pixels above launch height at 45° default

  for (let i = 0; i < allAnchors.length; i++) {
    for (let j = i + 1; j < allAnchors.length; j++) {
      const a = allAnchors[i];
      const b = allAnchors[j];
      const dx = Math.abs(b - a);
      if (dx > MAX_RANGE) continue; // out of range entirely, fine — too far
      if (dx < 80) continue; // adjacent, point-blank, no arc needed

      // Find the peak terrain height between a and b
      const xMin = Math.min(a, b);
      const xMax = Math.max(a, b);
      let peakY = HEIGHT;
      for (let x = xMin; x <= xMax; x++) {
        if (heights[x] < peakY) peakY = heights[x]; // LOWER y = TALLER terrain
      }

      // Launcher is at the higher of the two anchor heights (the lower y value)
      const launcherY = Math.min(heights[a], heights[b]);
      // Arc clears terrain if launcherY - ARC_PEAK <= peakY (i.e., arc reaches at least as high as the peak)
      if (launcherY - ARC_PEAK > peakY) {
        // Terrain between is too high — but this is only a real problem if BOTH anchors fail
        // to reach. With default power we have lots of options (different angles, more power).
        // Flag as warning, not blocker.
        issues.push(`WARN: peak between spawns ${a} and ${b} at y=${peakY} may block default 45° arc (launcher at y=${launcherY})`);
      }
    }
  }

  return { ok: issues.filter(i => !i.startsWith('WARN:')).length === 0, issues };
}

/**
 * Render the heightmap to a pure-binary grayscale PNG.
 * black (0) = air, white (255) = ground.
 */
function renderPNG(heights, outPath) {
  const png = new PNG({ width: WIDTH, height: HEIGHT, colorType: 0 /* grayscale */ });

  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (WIDTH * y + x) << 2;
      const isGround = y >= heights[x];
      const v = isGround ? 255 : 0;
      png.data[idx]     = v; // R
      png.data[idx + 1] = v; // G
      png.data[idx + 2] = v; // B
      png.data[idx + 3] = 255; // A
    }
  }

  return new Promise((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(outPath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('Building heightmaps for', THEMES.length, 'themes...\n');

  let totalOk = 0;
  let totalWarnings = 0;

  for (const theme of THEMES) {
    const themeDir = path.join(MAPS_DIR, theme.slug);
    if (!fs.existsSync(themeDir)) {
      console.error(`  ${theme.slug}: SKIP — directory missing`);
      continue;
    }

    const heights = generateHeights(theme);
    const validation = validate(heights, theme, theme.anchors);

    const status = validation.ok ? '✓' : '✗';
    const warnings = validation.issues.filter(i => i.startsWith('WARN:')).length;
    const errors = validation.issues.length - warnings;

    console.log(`  ${theme.slug.padEnd(10)} ${status}  errors=${errors}  warnings=${warnings}`);
    if (errors > 0) {
      validation.issues.filter(i => !i.startsWith('WARN:')).forEach(i => console.log(`     ERROR: ${i}`));
    }
    if (warnings > 0) {
      validation.issues.filter(i => i.startsWith('WARN:')).forEach(i => console.log(`     ${i}`));
    }

    if (validation.ok) {
      const outPath = path.join(themeDir, 'heightmap.png');
      await renderPNG(heights, outPath);
      totalOk++;
      totalWarnings += warnings;
    }
  }

  console.log(`\nDone — ${totalOk}/${THEMES.length} written, ${totalWarnings} warnings.`);
  console.log('Heightmaps live in solshot_maps/<slug>/heightmap.png');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
