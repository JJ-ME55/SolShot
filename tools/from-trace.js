#!/usr/bin/env node
/**
 * from-trace.js — direct emit of a SolShot heightmap.png from an
 * inline building-list trace.
 *
 * Use case: Jamie marks up a Shot Bot screenshot with a yellow-line
 * silhouette → Claude transcribes the line into the URBAN_TRACE
 * array below → this script writes the resulting 3456 × 800 grayscale
 * heightmap PNG directly to solshot_maps/<theme>/heightmap.png.
 *
 * Bypasses tools/trace-heightmap.js (silhouette-source → smoothed
 * heightmap pipeline) — useful for fast iteration when the input is
 * a deliberate hand-drawn step pattern, not an AI-generated silhouette.
 *
 * Coordinate convention:
 *   - Trace coordinates are authored at the engine's runtime width
 *     (1956 px viewport, matching what Jamie sees in-game).
 *   - PNG output is 3456 × 800 (production canvas dims). x is scaled up
 *     by 3456/1956 ≈ 1.767.
 *   - y in trace coordinates is the surface y in pixel space (0 = top
 *     of canvas, 800 = bottom). STREET_Y is the "empty street" floor;
 *     buildings rise above it with smaller y values.
 *
 * Usage:  node tools/from-trace.js <theme>
 *
 * Where <theme> is one of: desert, jungle, moon, urban, arctic,
 * volcanic, castle, canyon. Currently only urban has an inline trace
 * defined; the others will be added as Jamie sketches them.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('../client/node_modules/pngjs');

// ─── Output spec ────────────────────────────────────────────────────────
const OUT_WIDTH = 3456;
const OUT_HEIGHT = 800;

// ─── Trace coordinate space ─────────────────────────────────────────────
// Trace coords are in 1956-wide game viewport space (the size Jamie sees).
// All x values in the building lists below are 1956-relative.
const TRACE_WIDTH = 1956;
const SCALE = OUT_WIDTH / TRACE_WIDTH;  // 1.767...

// "Street level" y in trace coords — heightmap surface where no building
// exists. Buildings rise above with smaller y values (heights = STREET_Y - h).
const STREET_Y = 700;

// ─── URBAN — Jamie's May 14 yellow-line sketch ─────────────────────────
//
// Traced verbatim from a Shot Bot screenshot Jamie marked up. Numbers are
// best-effort visual reads; correct by replying with another marked-up
// screenshot and a list of which buildings to adjust.
//
// Each entry is { x, w, h } in 1956-coord space:
//   x — left edge of the building
//   w — width
//   h — height above STREET_Y (0 = gap / pass-through at street level)
const URBAN_TRACE = [
  // Far-left low plateau
  { x: 60,   w: 220, h: 120 },
  { x: 280,  w: 30,  h: 55 },
  // (gap 310-345)
  // Tall narrow spire
  { x: 345,  w: 35,  h: 240 },
  { x: 380,  w: 65,  h: 120 },
  // (gap 445-490)
  { x: 490,  w: 50,  h: 145 },
  { x: 540,  w: 85,  h: 20 },
  { x: 625,  w: 55,  h: 160 },
  { x: 680,  w: 80,  h: 75 },
  { x: 760,  w: 60,  h: 145 },
  { x: 820,  w: 60,  h: 55 },
  { x: 880,  w: 80,  h: 120 },
  { x: 960,  w: 50,  h: 20 },
  { x: 1010, w: 90,  h: 105 },
  { x: 1100, w: 30,  h: 20 },
  { x: 1130, w: 60,  h: 120 },
  { x: 1190, w: 50,  h: 60 },
  { x: 1240, w: 50,  h: 135 },
  { x: 1290, w: 80,  h: 40 },
  { x: 1370, w: 60,  h: 100 },
  { x: 1430, w: 70,  h: 55 },
  { x: 1500, w: 70,  h: 140 },
  { x: 1570, w: 70,  h: 20 },
  { x: 1640, w: 80,  h: 120 },
  // (gap 1720-1740)
  { x: 1740, w: 80,  h: 135 },
  // (gap 1820-1830)
  { x: 1830, w: 126, h: 40 },
];

const TRACES = {
  urban: URBAN_TRACE,
  // Add more as Jamie sketches them:
  // desert: DESERT_TRACE,
  // jungle: JUNGLE_TRACE,
  // ...
};

// ─── Build per-column heights from a trace ──────────────────────────────

/**
 * Given a building list in trace coords (1956-wide), produce a
 * 3456-column heights array. heights[x] = surface y at output column x.
 *
 * Default fill is STREET_Y (scaled to output by leaving the y value
 * unchanged — y maps 1:1 since the canvas is 800 tall in both spaces).
 * Buildings overwrite their column range with a lower y (=== higher
 * silhouette).
 */
function buildHeights(trace) {
  const heights = new Array(OUT_WIDTH).fill(STREET_Y);
  for (const b of trace) {
    if (b.h <= 0) continue;
    const topY = STREET_Y - b.h;
    const startX = Math.max(0, Math.round(b.x * SCALE));
    const endX = Math.min(OUT_WIDTH, Math.round((b.x + b.w) * SCALE));
    for (let i = startX; i < endX; i++) {
      if (topY < heights[i]) heights[i] = topY;
    }
  }
  return heights;
}

// ─── Render heightmap PNG ───────────────────────────────────────────────

function renderHeightmapPng(heights, outPath) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width: OUT_WIDTH, height: OUT_HEIGHT });
    for (let y = 0; y < OUT_HEIGHT; y++) {
      for (let x = 0; x < OUT_WIDTH; x++) {
        const idx = (y * OUT_WIDTH + x) * 4;
        // White = ground (y >= surface), black = air
        const v = y >= heights[x] ? 255 : 0;
        png.data[idx]     = v;
        png.data[idx + 1] = v;
        png.data[idx + 2] = v;
        png.data[idx + 3] = 255;
      }
    }
    png.pack().pipe(fs.createWriteStream(outPath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

// ─── Surface art generators ─────────────────────────────────────────────
//
// `palette` is a list of { atFrac, rgba } stops describing a vertical
// gradient applied to each column's terrain band. atFrac=0 lands at the
// heightmap surface (top of building); atFrac=1 lands at SURFACE_DEPTH
// pixels below it. Anything below SURFACE_DEPTH is filled with the
// bottom-most stop's color (solid) — terrain is too thick to dig that
// deep in normal play, so the gradient just needs to look right within
// the dig-reachable band.

const SURFACE_DEPTH = 200; // pixels of gradient below each column's surface y

const PALETTES = {
  // Cyberpunk neon-purple gradient — top of building washed pink/magenta,
  // body fading to deep purple, deep underground near-black with violet bias.
  urban: [
    { atFrac: 0.00, rgba: [170,  80, 200, 255] },
    { atFrac: 0.10, rgba: [120,  50, 170, 255] },
    { atFrac: 0.30, rgba: [ 75,  28, 120, 255] },
    { atFrac: 0.60, rgba: [ 45,  15,  78, 255] },
    { atFrac: 1.00, rgba: [ 22,   8,  40, 255] },
  ],
  // Stubs for future themes — Jamie will refine each as we trace them.
  desert:   [{ atFrac: 0, rgba: [220, 180, 110, 255] }, { atFrac: 1, rgba: [90, 60, 30, 255] }],
  jungle:   [{ atFrac: 0, rgba: [110, 130,  55, 255] }, { atFrac: 1, rgba: [30, 45, 20, 255] }],
  moon:     [{ atFrac: 0, rgba: [150, 150, 160, 255] }, { atFrac: 1, rgba: [40, 40, 50, 255] }],
  arctic:   [{ atFrac: 0, rgba: [220, 230, 240, 255] }, { atFrac: 1, rgba: [80, 95, 115, 255] }],
  volcanic: [{ atFrac: 0, rgba: [220, 100,  40, 255] }, { atFrac: 1, rgba: [60, 15, 8, 255] }],
  castle:   [{ atFrac: 0, rgba: [180, 170, 150, 255] }, { atFrac: 1, rgba: [60, 50, 40, 255] }],
  canyon:   [{ atFrac: 0, rgba: [200, 110,  60, 255] }, { atFrac: 1, rgba: [80, 25, 12, 255] }],
};

/** Sample the palette at depth fraction t∈[0,1]. Linear interpolation between stops. */
function samplePalette(palette, t) {
  if (t <= palette[0].atFrac) return palette[0].rgba;
  if (t >= palette[palette.length - 1].atFrac) return palette[palette.length - 1].rgba;
  for (let i = 0; i < palette.length - 1; i++) {
    const a = palette[i];
    const b = palette[i + 1];
    if (t >= a.atFrac && t <= b.atFrac) {
      const span = b.atFrac - a.atFrac;
      const f = span === 0 ? 0 : (t - a.atFrac) / span;
      return [
        Math.round(a.rgba[0] + f * (b.rgba[0] - a.rgba[0])),
        Math.round(a.rgba[1] + f * (b.rgba[1] - a.rgba[1])),
        Math.round(a.rgba[2] + f * (b.rgba[2] - a.rgba[2])),
        Math.round(a.rgba[3] + f * (b.rgba[3] - a.rgba[3])),
      ];
    }
  }
  return palette[palette.length - 1].rgba;
}

/**
 * Paint surface.png for a given heightmap + palette.
 *
 * Rules from MAP_DESIGN_BRIEF.md §2c:
 *   - RGBA PNG, 3456 × 800
 *   - Transparent above the heightmap silhouette
 *   - Opaque on/below it (engine masks against heightmap at runtime, so the
 *     transparency above is belt-and-braces; below is what gets shown)
 *
 * The gradient stack is applied per-column with depth = y - heightmap[x].
 * For depth >= SURFACE_DEPTH we fall back to the bottom-stop color (terrain
 * too deep to be visibly dug to in normal play).
 */
function renderSurfacePng(heights, palette, outPath) {
  return new Promise((resolve, reject) => {
    const png = new PNG({ width: OUT_WIDTH, height: OUT_HEIGHT });
    for (let x = 0; x < OUT_WIDTH; x++) {
      const surfaceY = heights[x];
      for (let y = 0; y < OUT_HEIGHT; y++) {
        const idx = (y * OUT_WIDTH + x) * 4;
        if (y < surfaceY) {
          // Above the silhouette — fully transparent
          png.data[idx]     = 0;
          png.data[idx + 1] = 0;
          png.data[idx + 2] = 0;
          png.data[idx + 3] = 0;
        } else {
          const depth = y - surfaceY;
          const t = Math.min(1, depth / SURFACE_DEPTH);
          const [r, g, b, a] = samplePalette(palette, t);
          png.data[idx]     = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = a;
        }
      }
    }
    png.pack().pipe(fs.createWriteStream(outPath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main() {
  const theme = process.argv[2];
  if (!theme) {
    console.error('Usage: node tools/from-trace.js <theme>');
    console.error('Known traces:', Object.keys(TRACES).join(', '));
    process.exit(1);
  }
  const trace = TRACES[theme];
  if (!trace) {
    console.error(`No trace defined for "${theme}". Available: ${Object.keys(TRACES).join(', ')}`);
    process.exit(1);
  }

  const outDir = path.resolve(__dirname, '..', 'solshot_maps', theme);
  if (!fs.existsSync(outDir)) {
    console.error(`Map directory does not exist: ${outDir}`);
    process.exit(1);
  }
  const outPath = path.join(outDir, 'heightmap.png');

  console.log(`Building heights from ${trace.length} buildings in 1956-trace space...`);
  const heights = buildHeights(trace);

  // Summary stats so it's obvious if we shipped a flat or broken map
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const distinct = new Set(heights).size;
  console.log(`  Surface y range: ${min} (tallest peak) → ${max} (street)`);
  console.log(`  Distinct y values: ${distinct}`);
  console.log(`  Tallest building height above street: ${STREET_Y - min}px`);

  console.log(`Writing ${OUT_WIDTH} × ${OUT_HEIGHT} grayscale heightmap to ${outPath}...`);
  await renderHeightmapPng(heights, outPath);

  // Surface art — regenerated to match the new heightmap shape with the
  // theme's gradient. Without this, an existing surface.png painted for
  // the OLD heightmap silhouette would only cover building columns that
  // happen to overlap with the new shape; new buildings would render with
  // no surface art (just the dark underlayer fill).
  const palette = PALETTES[theme];
  if (palette) {
    const surfacePath = path.join(outDir, 'surface.png');
    console.log(`Writing ${OUT_WIDTH} × ${OUT_HEIGHT} RGBA surface (${theme} palette) to ${surfacePath}...`);
    await renderSurfacePng(heights, palette, surfacePath);
  } else {
    console.log(`No palette defined for "${theme}" — skipping surface.png.`);
  }

  console.log('Done.');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Restart the server — maps.js caches heightmap.png + surface.png');
  console.log('     at boot, so file changes need a full process restart.');
  console.log('  2. Hard-refresh the browser; start a Shot Bot match.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
