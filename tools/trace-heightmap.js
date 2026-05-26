#!/usr/bin/env node
/**
 * trace-heightmap.js — convert an AI-generated silhouette PNG into a spec-
 * compliant SolShot heightmap.
 *
 * Source convention (input): pure black silhouette on white background, any
 * dimensions. The bottom of the image is solid black (playable ground), the
 * top is white (sky), the silhouette is the transition.
 *
 * Output convention (SolShot heightmap): grayscale 3456 × 800 PNG. Black =
 * air (sky), white = ground. Top-of-white edge defines surface y per column.
 *
 * Usage:  node tools/trace-heightmap.js <theme>
 *
 * Expects `solshot_maps/<theme>/silhouette_source.png` to exist.
 * Writes     `solshot_maps/<theme>/heightmap.png` at 3456 × 800.
 *
 * Pipeline:
 *   1. Load source
 *   2. Scale to WIDTH = 3456 wide preserving aspect
 *   3. Find topmost black pixel y in source; position it at TARGET_HORIZON_Y
 *      in the output by cropping a 800-row window of the resized image
 *   4. For each column, find topmost black pixel = surface y
 *   5. Mirror left half to right half (spawn parity)
 *   6. Validate slopes near spawn anchors (warnings only — AI-traced shapes
 *      often have steep features near indestructible landmarks)
 *   7. Render heightmap PNG
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('../client/node_modules/pngjs');

const WIDTH = 3456;
const HEIGHT = 800;
const MIRROR_X = WIDTH / 2;
const TARGET_HORIZON_Y = 280; // where the topmost feature in the source lands in our output

function loadPNG(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on('parsed', function () { resolve(this); })
      .on('error', reject);
  });
}

function savePNG(png, filePath) {
  return new Promise((resolve, reject) => {
    png.pack().pipe(fs.createWriteStream(filePath))
      .on('finish', resolve)
      .on('error', reject);
  });
}

// Bilinear-ish resize to WIDTH-wide, preserving aspect.
function resizeToWidth(source) {
  const sw = source.width;
  const sh = source.height;
  const scale = WIDTH / sw;
  const newH = Math.round(sh * scale);
  const out = new PNG({ width: WIDTH, height: newH });
  for (let y = 0; y < newH; y++) {
    const srcY = Math.min(sh - 1, Math.floor(y / scale));
    for (let x = 0; x < WIDTH; x++) {
      const srcX = Math.min(sw - 1, Math.floor(x / scale));
      const srcIdx = (srcY * sw + srcX) * 4;
      const dstIdx = (y * WIDTH + x) * 4;
      out.data[dstIdx]     = source.data[srcIdx];
      out.data[dstIdx + 1] = source.data[srcIdx + 1];
      out.data[dstIdx + 2] = source.data[srcIdx + 2];
      out.data[dstIdx + 3] = 255;
    }
  }
  return out;
}

// Find the topmost dark pixel anywhere in the image (the topmost point of the
// silhouette). Returns its y, or null if the image is entirely white.
function findTopmostDarkY(img) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      if (img.data[idx] < 128) return y;
    }
  }
  return null;
}

// Crop / pad the resized image to exactly HEIGHT rows so that the topmost
// silhouette pixel lands at TARGET_HORIZON_Y in the output.
function alignToCanvas(resized) {
  const topDark = findTopmostDarkY(resized);
  if (topDark === null) {
    throw new Error('Source image has no silhouette — entirely white');
  }
  // We want output[y=TARGET_HORIZON_Y] to come from resized[y=topDark].
  // → output[y=k] = resized[y = topDark - TARGET_HORIZON_Y + k]
  const srcOffset = topDark - TARGET_HORIZON_Y;

  const out = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y++) {
    const srcY = y + srcOffset;
    for (let x = 0; x < WIDTH; x++) {
      const dstIdx = (y * WIDTH + x) * 4;
      if (srcY < 0 || srcY >= resized.height) {
        // Out-of-bounds: above → white (sky), below → black (ground)
        const v = srcY < 0 ? 255 : 0;
        out.data[dstIdx]     = v;
        out.data[dstIdx + 1] = v;
        out.data[dstIdx + 2] = v;
        out.data[dstIdx + 3] = 255;
      } else {
        const srcIdx = (srcY * WIDTH + x) * 4;
        out.data[dstIdx]     = resized.data[srcIdx];
        out.data[dstIdx + 1] = resized.data[srcIdx + 1];
        out.data[dstIdx + 2] = resized.data[srcIdx + 2];
        out.data[dstIdx + 3] = 255;
      }
    }
  }
  return out;
}

// Per column, find the topmost black pixel — that's our surface y.
// If the column is entirely white, set surface to HEIGHT (sky all the way down).
function extractHeights(img) {
  const heights = new Array(WIDTH);
  for (let x = 0; x < WIDTH; x++) {
    let surfaceY = HEIGHT;
    for (let y = 0; y < HEIGHT; y++) {
      const idx = (y * WIDTH + x) * 4;
      if (img.data[idx] < 128) {
        surfaceY = y;
        break;
      }
    }
    heights[x] = surfaceY;
  }
  return heights;
}

// Mirror left half to right half for spawn parity.
function mirrorHeights(heights) {
  for (let x = MIRROR_X; x < WIDTH; x++) {
    heights[x] = heights[WIDTH - 1 - x];
  }
  return heights;
}

// Compress the heightmap vertically into the playable terrain band.
//
// Two gameplay rules that drive the band placement:
//
// 1. Default-power 45° arcs reach ~300px above the launcher. So peaks must
//    be at y >= PEAK_MAX_Y (440 to match the legacy procedural rule).
//
// 2. The terrain should occupy roughly the bottom HALF of the canvas (not
//    just the bottom 30%). This is what made the legacy procedural terrain
//    feel "alive" — features visible across the full width, with the base
//    floating around y=550-700, not pinned at y=800.
//
// So we compress the full source range [sourceMin, sourceMax] linearly into
// [PEAK_MAX_Y, VALLEY_MAX_Y], giving us a real playable band.
function compressVertically(heights) {
  const PEAK_MAX_Y = 440;     // highest peak — under default-arc clearance
  const VALLEY_MAX_Y = 600;   // lowest valley — keeps tanks well above HUD edge
                              // Peak-to-valley range = 160px (clearable by default 45°/60 power)
                              // Tanks spawn at heightmap surface y=440..600 → 100-160px
                              // of terrain mass below them for crater damage before
                              // they fall behind the bottom HUD at y≈720
  let minY = HEIGHT;
  let maxY = 0;
  for (const h of heights) {
    if (h < minY) minY = h;
    if (h > maxY) maxY = h;
  }
  if (maxY === minY) return heights; // flat terrain — nothing to compress

  // Linear remap: old [minY..maxY] → new [PEAK_MAX_Y..VALLEY_MAX_Y]
  const sourceRange = maxY - minY;
  const targetRange = VALLEY_MAX_Y - PEAK_MAX_Y;
  const scale = targetRange / sourceRange;
  const out = new Array(heights.length);
  for (let i = 0; i < heights.length; i++) {
    const normalized = (heights[i] - minY) / sourceRange;  // 0 (peak) to 1 (valley)
    out[i] = Math.round(PEAK_MAX_Y + normalized * targetRange);
  }
  return out;
}

// Gaussian smoothing of the heights array. Kernel size 7 (= ±3 cols) softens
// single-column spikes (smokestacks, masts, antenna) into rounded cones while
// preserving the broader silhouette character.
function smoothHeights(heights, kernelSize = 7) {
  const half = Math.floor(kernelSize / 2);
  // Build a Gaussian kernel
  const weights = [];
  let sumW = 0;
  for (let i = -half; i <= half; i++) {
    const sigma = half / 1.5;
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    weights.push(w);
    sumW += w;
  }
  for (let i = 0; i < weights.length; i++) weights[i] /= sumW;

  const out = new Array(heights.length);
  for (let x = 0; x < heights.length; x++) {
    let v = 0;
    for (let k = -half; k <= half; k++) {
      const sx = Math.max(0, Math.min(heights.length - 1, x + k));
      v += heights[sx] * weights[k + half];
    }
    out[x] = Math.round(v);
  }
  return out;
}

// Render the heightmap PNG: white below surface, black above.
function renderHeightmap(heights, outPath) {
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      const isGround = y >= heights[x];
      const v = isGround ? 255 : 0;
      png.data[idx]     = v;
      png.data[idx + 1] = v;
      png.data[idx + 2] = v;
      png.data[idx + 3] = 255;
    }
  }
  return savePNG(png, outPath);
}

// Auto-detect steep features and group them into bounding boxes that will
// be written to meta.json as indestructible regions. After smoothing, any
// column with slope > threshold is part of a "feature" (smokestack, mast,
// iceberg spike, ship superstructure). Adjacent steep columns merge into
// single bounding boxes. The boxes tell the validator to exempt those
// slopes — tanks just won't spawn on those features, but they read in the
// silhouette as part of the landmark.
function detectSteepFeatures(heights, slopeThreshold = 20, gapTolerance = 12, minWidth = 10) {
  const steepCols = new Set();
  for (let x = 0; x < heights.length - 1; x++) {
    if (Math.abs(heights[x + 1] - heights[x]) > slopeThreshold) {
      steepCols.add(x);
      steepCols.add(x + 1);
    }
  }
  const sortedSteep = [...steepCols].sort((a, b) => a - b);
  const regions = [];
  let current = null;
  for (const x of sortedSteep) {
    if (current === null || x - current.maxX > gapTolerance) {
      current = { minX: x, maxX: x };
      regions.push(current);
    } else {
      current.maxX = x;
    }
  }
  const boxes = [];
  for (const r of regions) {
    const startX = Math.max(0, r.minX - 6);
    const endX = Math.min(heights.length - 1, r.maxX + 6);
    if (endX - startX < minWidth) continue;
    let minY = Infinity;
    for (let x = startX; x <= endX; x++) {
      if (heights[x] < minY) minY = heights[x];
    }
    const topY = Math.max(0, minY - 8);
    boxes.push({
      x: startX,
      y: topY,
      w: endX - startX + 1,
      h: HEIGHT - topY,
    });
  }
  return boxes;
}

// Replace heights inside indestructible box x-ranges with smoothly interpolated
// values from the nearest non-box surface heights. The boxes still record where
// the decorative feature LIVES; the heightmap underneath becomes clean ground.
function flattenInsideBoxes(heights, boxes) {
  const out = heights.slice();
  // For each box, find the surface heights JUST OUTSIDE the box x-range on the
  // left and right, then linearly interpolate across the box.
  for (const b of boxes) {
    const leftX = Math.max(0, b.x - 1);
    const rightX = Math.min(WIDTH - 1, b.x + b.w);
    const leftY = heights[leftX];
    const rightY = heights[rightX];
    const span = rightX - leftX;
    if (span < 1) continue;
    for (let x = b.x; x < b.x + b.w; x++) {
      const t = (x - leftX) / span;
      out[x] = Math.round(leftY * (1 - t) + rightY * t);
    }
  }
  return out;
}

// Light validation — report steep slopes near spawn anchors that are NOT
// inside any indestructible bounding box.
function validate(heights, anchors, boxes = []) {
  const allAnchors = [...anchors, ...anchors.map(a => WIDTH - a)];
  const NEIGHBOURHOOD = 100;
  const STEEP_THRESHOLD = 5;
  let steep = 0;
  let maxSlope = 0;

  function inBox(x, y) {
    for (const b of boxes) {
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2) return true;
    }
    return false;
  }

  for (const anchorX of allAnchors) {
    const startX = Math.max(1, anchorX - NEIGHBOURHOOD);
    const endX = Math.min(WIDTH - 1, anchorX + NEIGHBOURHOOD);
    for (let x = startX; x < endX; x++) {
      const slope = Math.abs(heights[x + 1] - heights[x]);
      if (slope <= STEEP_THRESHOLD) continue;
      const yLow = Math.min(heights[x], heights[x + 1]);
      if (inBox(x, yLow) || inBox(x + 1, yLow)) continue;
      if (slope > maxSlope) maxSlope = slope;
      steep++;
    }
  }
  return { steepEdgesNearSpawns: steep, maxSlope };
}

async function main() {
  const theme = process.argv[2];
  if (!theme) {
    console.error('Usage: node tools/trace-heightmap.js <theme>');
    process.exit(1);
  }

  const mapDir = path.resolve(__dirname, '..', 'solshot_maps', theme);
  const sourcePath = path.join(mapDir, 'silhouette_source.png');
  const outPath = path.join(mapDir, 'heightmap.png');
  const spawnsPath = path.join(mapDir, 'spawns.json');

  if (!fs.existsSync(sourcePath)) {
    console.error(`No silhouette_source.png in ${mapDir}`);
    process.exit(1);
  }

  console.log(`Loading source: ${sourcePath}`);
  const source = await loadPNG(sourcePath);
  console.log(`  Source dims: ${source.width} × ${source.height}`);

  console.log(`Resizing to ${WIDTH} wide...`);
  const resized = resizeToWidth(source);
  console.log(`  Resized dims: ${resized.width} × ${resized.height}`);

  console.log(`Aligning silhouette top to y=${TARGET_HORIZON_Y} of output...`);
  const aligned = alignToCanvas(resized);

  console.log('Extracting per-column surface y...');
  let heights = extractHeights(aligned);

  console.log('Mirroring left half to right half...');
  heights = mirrorHeights(heights);

  console.log('Compressing vertically — cap peaks at y=420 so default-power arcs can reach...');
  heights = compressVertically(heights);

  console.log('Smoothing pass 1 — Gaussian kernel 15 (broader silhouette shaping)...');
  heights = smoothHeights(heights, 15);

  console.log('Auto-detecting steep features → indestructible bounding boxes (lower threshold)...');
  const boxes = detectSteepFeatures(heights, 10, 18, 14);
  console.log(`  Found ${boxes.length} indestructible regions`);

  console.log('Flattening heightmap inside indestructible boxes (features become decorative)...');
  heights = flattenInsideBoxes(heights, boxes);

  console.log('Smoothing pass 2 — Gaussian kernel 11 (clean up residual high-freq noise)...');
  heights = smoothHeights(heights, 11);

  console.log(`Rendering heightmap to ${outPath}`);
  await renderHeightmap(heights, outPath);

  // Update meta.json with auto-detected indestructible boxes
  const metaPath = path.join(mapDir, 'meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.indestructibleBoxes = boxes;
    if (!meta.landmarks) meta.landmarks = [];
    meta.landmarks = [
      `Heightmap traced from AI-generated silhouette source`,
      `${boxes.length} auto-detected indestructible feature regions`,
    ];
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    console.log(`  Wrote ${boxes.length} boxes to ${metaPath}`);
  }

  let anchors = [];
  try {
    anchors = JSON.parse(fs.readFileSync(spawnsPath, 'utf8')).anchors || [];
  } catch (_) { /* spawns optional */ }

  if (anchors.length > 0) {
    const v = validate(heights, anchors, boxes);
    console.log(`Validation: ${v.steepEdgesNearSpawns} unexempted steep edges within ±100px of spawn anchors (max slope ${v.maxSlope}px/col)`);
  }

  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
