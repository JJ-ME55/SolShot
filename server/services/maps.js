/**
 * maps.js — load hand-crafted map heightmaps + spawn anchors from solshot_maps/.
 *
 * At server boot, reads each of the 8 themed map folders and caches:
 *   - heightmap: 1D Uint16Array of surface y per column (length = WIDTH)
 *   - spawnAnchors: 5 x-coords in the LEFT half (mirror to right for spawn parity)
 *   - meta: name, difficulty, indestructibleBoxes, etc.
 *
 * Server uses this to:
 *   1. Pick a random themed map per match (instead of procedural terrain)
 *   2. Pass the loaded heightmap into the existing physics flow
 *   3. Broadcast mapId to clients so they can render the matching backdrop
 *
 * Heightmap PNG convention:
 *   - Width × 800 pure binary grayscale
 *   - White (255) = ground, black (0) = air
 *   - For each column, find the topmost white pixel = surface y at that column
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAPS_DIR = path.resolve(__dirname, '..', '..', 'solshot_maps');
const SOURCE_WIDTH = 3456;          // dims of the on-disk PNGs
const TARGET_WIDTH = 1956;          // engine canonical world width — physics.js TERRAIN_WIDTH
const EXPECTED_HEIGHT = 800;
const WIDTH_SCALE = TARGET_WIDTH / SOURCE_WIDTH;  // ≈ 0.566
const SLUGS = ['desert', 'jungle', 'moon', 'urban', 'arctic', 'volcanic', 'castle', 'canyon'];

const cache = new Map();

/**
 * Parse a heightmap PNG into an array of surface y per column, downsampled
 * from the on-disk SOURCE_WIDTH (3456) to engine TARGET_WIDTH (1956).
 *
 * Surface y = topmost row index where the pixel is white (>=128 R channel).
 * Downsample uses nearest-neighbour (each target column samples one source
 * column at the mapped position) — a heightmap is a piecewise-defined
 * surface, so blending adjacent columns would soften edges artificially.
 */
function pngToHeightmap(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  if (png.width !== SOURCE_WIDTH || png.height !== EXPECTED_HEIGHT) {
    throw new Error(`${pngPath} has wrong dims ${png.width}×${png.height}, expected ${SOURCE_WIDTH}×${EXPECTED_HEIGHT}`);
  }
  // First extract the source heightmap at native 3456-col resolution
  const sourceHeights = new Array(png.width);
  for (let x = 0; x < png.width; x++) {
    let surfaceY = png.height;
    for (let y = 0; y < png.height; y++) {
      const idx = (y * png.width + x) * 4;
      if (png.data[idx] >= 128) {
        surfaceY = y;
        break;
      }
    }
    sourceHeights[x] = surfaceY;
  }
  // Downsample to TARGET_WIDTH using nearest-neighbour sampling
  const heights = new Array(TARGET_WIDTH);
  for (let x = 0; x < TARGET_WIDTH; x++) {
    const srcX = Math.min(SOURCE_WIDTH - 1, Math.round(x / WIDTH_SCALE));
    heights[x] = sourceHeights[srcX];
  }
  return heights;
}

/**
 * Load one themed map from disk. Caches the result.
 */
function loadMap(slug) {
  if (cache.has(slug)) return cache.get(slug);

  const mapDir = path.join(MAPS_DIR, slug);
  const heightmapPath = path.join(mapDir, 'heightmap.png');
  const spawnsPath = path.join(mapDir, 'spawns.json');
  const metaPath = path.join(mapDir, 'meta.json');

  if (!fs.existsSync(heightmapPath)) {
    throw new Error(`Map "${slug}" missing heightmap.png at ${heightmapPath}`);
  }

  const heightmap = pngToHeightmap(heightmapPath);
  const spawns = JSON.parse(fs.readFileSync(spawnsPath, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

  // Scale spawn anchors and indestructible boxes from on-disk 3456-col
  // coordinate space to engine 1956-col coordinate space.
  const scaledAnchors = (spawns.anchors || []).map(a => Math.round(a * WIDTH_SCALE));
  const scaledMeta = { ...meta };
  if (Array.isArray(meta.indestructibleBoxes)) {
    scaledMeta.indestructibleBoxes = meta.indestructibleBoxes.map(b => ({
      x: Math.round(b.x * WIDTH_SCALE),
      y: b.y,
      w: Math.round(b.w * WIDTH_SCALE),
      h: b.h,
    }));
  }

  const data = {
    slug,
    heightmap,
    spawnAnchors: scaledAnchors,
    meta: scaledMeta,
  };
  cache.set(slug, data);
  return data;
}

/**
 * Preload all 8 maps at server boot. Throws if any fail (fail-fast at startup).
 */
export function preloadAllMaps() {
  for (const slug of SLUGS) {
    try {
      const m = loadMap(slug);
      console.log(`[maps] Loaded "${slug}" — ${m.heightmap.length}-col heightmap, ${m.spawnAnchors.length} spawn anchors`);
    } catch (err) {
      console.error(`[maps] Failed to load "${slug}":`, err.message);
      throw err;
    }
  }
  console.log(`[maps] Preloaded ${SLUGS.length} themed maps`);
}

/**
 * Get a copy of the heightmap (mutable — gameplay modifies it during play).
 */
export function getMap(slug) {
  const data = cache.get(slug);
  if (!data) throw new Error(`Unknown map slug: ${slug}`);
  return {
    slug: data.slug,
    heightmap: data.heightmap.slice(),  // copy — gameplay mutates it
    spawnAnchors: data.spawnAnchors.slice(),
    meta: data.meta,
  };
}

/**
 * Pick a random map slug. Returns a fresh copy ready for gameplay.
 *
 * Dev override: if FORCE_MAP env var is set to a known slug, always
 * return that map instead. Useful for iterating on a single heightmap
 * without re-rolling Shot Bot matches until the right one comes up.
 * Example: FORCE_MAP=urban npm run dev.
 */
export function pickRandomMap() {
  const forced = (process.env.FORCE_MAP || '').trim().toLowerCase();
  if (forced && SLUGS.includes(forced)) {
    return getMap(forced);
  }
  const slug = SLUGS[Math.floor(Math.random() * SLUGS.length)];
  return getMap(slug);
}

/**
 * Compute tank spawn positions for N players using the map's spawn anchors.
 *
 * Anchors are left-half x-coords; they're mirrored around centre (1728) to
 * produce the full set of 10 spawn positions. We then select N of those 10,
 * preferring central anchors for low N and adding outer ones as N grows.
 */
export function generateTankPositionsFromMap(mapData, N = 2) {
  const WIDTH = TARGET_WIDTH;
  // Tanks must spawn INSIDE the SAFE_BAND so they're visible on every common
  // landscape viewport (Phaser ENVELOP crops the outer ~267px on each side
  // for narrower aspects). The map's spawn anchors are in left-half WIDTH
  // coordinates; we rescale them so the leftmost lands at SAFE_BAND_OFFSET
  // and the rightmost lands at the safe-band centre.
  const SAFE_BAND_OFFSET = 267;
  const SAFE_BAND_WIDTH = 1422;
  const SAFE_BAND_HALF = SAFE_BAND_WIDTH / 2;  // 711
  const HALF_WIDTH = WIDTH / 2;  // 978
  const { heightmap, spawnAnchors } = mapData;

  // Rescale each anchor from full-canvas left-half [0, 978] to safe-band
  // left-half [SAFE_BAND_OFFSET, SAFE_BAND_OFFSET + SAFE_BAND_HALF].
  // Mirror around centre to get the right-half pool.
  const rescaled = spawnAnchors.map(a => {
    const frac = a / HALF_WIDTH;
    return Math.round(SAFE_BAND_OFFSET + frac * SAFE_BAND_HALF);
  });
  const allAnchors = [];
  for (const a of rescaled) allAnchors.push(a);                       // left half (in safe band)
  for (let i = rescaled.length - 1; i >= 0; i--) {
    allAnchors.push(WIDTH - 1 - rescaled[i]);                         // right half (mirror)
  }
  // allAnchors: 10 positions inside the safe band, ordered left-to-right.

  // Subset selection per N from the 10-position pool (index 0 = leftmost,
  // 9 = rightmost). Goal: maximum spread for low N so tanks aren't point-
  // blank; even distribution as N grows; outermost positions always used
  // before centre positions.
  //   N=2:  [0, 9]                    — far left + far right
  //   N=3:  [0, 5, 9]                 — edges + just-past-centre
  //   N=4:  [0, 3, 6, 9]              — evenly spread quartiles
  //   N=5:  [0, 2, 5, 7, 9]
  //   N=6:  [0, 2, 4, 5, 7, 9]
  //   N=7:  [0, 1, 3, 5, 6, 8, 9]
  //   N=8:  [0, 1, 2, 4, 5, 7, 8, 9]
  //   N=9:  [0, 1, 2, 3, 5, 6, 7, 8, 9]
  //   N=10: [0..9]                    — full pool
  const indexMap = {
    2:  [0, 9],
    3:  [0, 5, 9],
    4:  [0, 3, 6, 9],
    5:  [0, 2, 5, 7, 9],
    6:  [0, 2, 4, 5, 7, 9],
    7:  [0, 1, 3, 5, 6, 8, 9],
    8:  [0, 1, 2, 4, 5, 7, 8, 9],
    9:  [0, 1, 2, 3, 5, 6, 7, 8, 9],
    10: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  };
  const idx = indexMap[N] || indexMap[Math.min(10, Math.max(2, N))];

  return idx.map(i => {
    const x = allAnchors[i];
    return { x, y: heightmap[x] };
  });
}

export const MAP_SLUGS = SLUGS;
export const MAP_WIDTH = TARGET_WIDTH;
export const MAP_HEIGHT = EXPECTED_HEIGHT;
