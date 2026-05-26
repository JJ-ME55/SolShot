#!/usr/bin/env node
/**
 * bake-surfaces.js — regenerate solshot_maps/<slug>/surface.png for all
 * 8 themes from each map's heightmap.png + its theme palette + its
 * theme style (smooth gradient vs banded strata).
 *
 * Mirror of the in-browser painter at client/public/map-gallery.html.
 * Keep the two in sync: any tweak to LAYER_STYLE / PALETTES /
 * SURFACE_DEPTH / NUM_LAYERS / smooth-vs-banded logic must land in
 * BOTH places so the bake matches the gallery preview.
 *
 * Usage:  node tools/bake-surfaces.js          # all 8 themes
 *         node tools/bake-surfaces.js urban    # one theme
 *
 * After running, restart the server so maps.js's boot-time cache
 * picks up the new surface.png files.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('../client/node_modules/pngjs');

const OUT_WIDTH = 3456;
const OUT_HEIGHT = 800;
const SURFACE_DEPTH = 200;

// Per-theme render style — must match client/public/map-gallery.html.
//   null → smooth gradient (world-Y anchored)
//   N    → N discrete strata bands (per-column)
const LAYER_STYLE = {
    urban:    null,
    arctic:   null,
    castle:   null,
    canyon:   null,
    volcanic: null,
    desert:   3,
    jungle:   3,
    moon:     3,
};

// Palettes mirrored from tools/from-trace.js — keep in sync.
const PALETTES = {
    urban: [
        { atFrac: 0.00, rgba: [170,  80, 200, 255] },
        { atFrac: 0.10, rgba: [120,  50, 170, 255] },
        { atFrac: 0.30, rgba: [ 75,  28, 120, 255] },
        { atFrac: 0.60, rgba: [ 45,  15,  78, 255] },
        { atFrac: 1.00, rgba: [ 22,   8,  40, 255] },
    ],
    desert:   [{ atFrac: 0, rgba: [220, 180, 110, 255] }, { atFrac: 1, rgba: [90, 60, 30, 255] }],
    jungle:   [{ atFrac: 0, rgba: [110, 130,  55, 255] }, { atFrac: 1, rgba: [30, 45, 20, 255] }],
    moon:     [{ atFrac: 0, rgba: [150, 150, 160, 255] }, { atFrac: 1, rgba: [40, 40, 50, 255] }],
    arctic:   [{ atFrac: 0, rgba: [220, 230, 240, 255] }, { atFrac: 1, rgba: [80, 95, 115, 255] }],
    volcanic: [{ atFrac: 0, rgba: [220, 100,  40, 255] }, { atFrac: 1, rgba: [60, 15, 8, 255] }],
    castle:   [{ atFrac: 0, rgba: [180, 170, 150, 255] }, { atFrac: 1, rgba: [60, 50, 40, 255] }],
    canyon:   [{ atFrac: 0, rgba: [200, 110,  60, 255] }, { atFrac: 1, rgba: [80, 25, 12, 255] }],
};

function samplePalette(palette, t) {
    const tc = Math.max(0, Math.min(1, t));
    for (let i = 0; i < palette.length - 1; i++) {
        const a = palette[i], b = palette[i + 1];
        if (tc >= a.atFrac && tc <= b.atFrac) {
            const span = b.atFrac - a.atFrac || 1;
            const f = (tc - a.atFrac) / span;
            return [
                a.rgba[0] + (b.rgba[0] - a.rgba[0]) * f,
                a.rgba[1] + (b.rgba[1] - a.rgba[1]) * f,
                a.rgba[2] + (b.rgba[2] - a.rgba[2]) * f,
                a.rgba[3] + (b.rgba[3] - a.rgba[3]) * f,
            ];
        }
    }
    return palette[palette.length - 1].rgba;
}

/** Load a heightmap PNG and extract surface y per column (1:1 with the PNG). */
function loadHeights(heightmapPath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(heightmapPath)
            .pipe(new PNG())
            .on('parsed', function () {
                const { width, height, data } = this;
                const heights = new Array(width);
                for (let x = 0; x < width; x++) {
                    let groundY = height - 1;
                    for (let y = 0; y < height; y++) {
                        const idx = (y * width + x) * 4;
                        // White (R > 128) = ground per build-heightmaps.js convention
                        if (data[idx] > 128) { groundY = y; break; }
                    }
                    heights[x] = groundY;
                }
                resolve({ heights, width, height });
            })
            .on('error', reject);
    });
}

/** Paint surface PNG to a Buffer. Mirrors paintSurface() in map-gallery.html. */
function paintSurface(palette, heights, bands) {
    const png = new PNG({ width: OUT_WIDTH, height: OUT_HEIGHT });

    if (bands === null) {
        // SMOOTH: world-Y anchored gradient from highest peak → canvas bottom.
        let minSurfaceY = Infinity;
        for (let x = 0; x < OUT_WIDTH; x++) {
            if (heights[x] < minSurfaceY) minSurfaceY = heights[x];
        }
        const span = Math.max(1, OUT_HEIGHT - minSurfaceY);

        for (let x = 0; x < OUT_WIDTH; x++) {
            const surfaceY = heights[x];
            for (let y = 0; y < OUT_HEIGHT; y++) {
                const idx = (y * OUT_WIDTH + x) * 4;
                if (y < surfaceY) {
                    png.data[idx] = 0; png.data[idx+1] = 0; png.data[idx+2] = 0; png.data[idx+3] = 0;
                    continue;
                }
                const t = Math.max(0, Math.min(1, (y - minSurfaceY) / span));
                const color = samplePalette(palette, t);
                png.data[idx]     = color[0];
                png.data[idx + 1] = color[1];
                png.data[idx + 2] = color[2];
                png.data[idx + 3] = color[3];
            }
        }
    } else {
        // BANDED: per-column strata, palette sampled at band midpoints.
        const bandColors = new Array(bands);
        for (let b = 0; b < bands; b++) {
            const tMid = (b + 0.5) / bands;
            bandColors[b] = samplePalette(palette, tMid);
        }
        const bottomColor = samplePalette(palette, 1);

        for (let x = 0; x < OUT_WIDTH; x++) {
            const surfaceY = heights[x];
            for (let y = 0; y < OUT_HEIGHT; y++) {
                const idx = (y * OUT_WIDTH + x) * 4;
                if (y < surfaceY) {
                    png.data[idx] = 0; png.data[idx+1] = 0; png.data[idx+2] = 0; png.data[idx+3] = 0;
                    continue;
                }
                const depth = y - surfaceY;
                let color;
                if (depth >= SURFACE_DEPTH) {
                    color = bottomColor;
                } else {
                    const bandIdx = Math.min(bands - 1, Math.floor((depth / SURFACE_DEPTH) * bands));
                    color = bandColors[bandIdx];
                }
                png.data[idx]     = color[0];
                png.data[idx + 1] = color[1];
                png.data[idx + 2] = color[2];
                png.data[idx + 3] = color[3];
            }
        }
    }

    return png;
}

function writePng(png, outPath) {
    return new Promise((resolve, reject) => {
        png.pack().pipe(fs.createWriteStream(outPath))
            .on('finish', resolve)
            .on('error', reject);
    });
}

async function bakeTheme(theme) {
    const palette = PALETTES[theme];
    if (!palette) throw new Error(`No palette for theme "${theme}"`);
    if (!(theme in LAYER_STYLE)) throw new Error(`No layer style for theme "${theme}"`);

    const mapDir = path.resolve(__dirname, '..', 'solshot_maps', theme);
    const heightmapPath = path.join(mapDir, 'heightmap.png');
    if (!fs.existsSync(heightmapPath)) {
        throw new Error(`Missing heightmap.png at ${heightmapPath}`);
    }

    const { heights, width, height } = await loadHeights(heightmapPath);
    if (width !== OUT_WIDTH || height !== OUT_HEIGHT) {
        console.warn(`  ! ${theme}: heightmap is ${width}×${height}, expected ${OUT_WIDTH}×${OUT_HEIGHT}. Output sized to spec; will resample on read.`);
    }

    // If heightmap width differs, rescale heights to OUT_WIDTH
    let outHeights = heights;
    if (width !== OUT_WIDTH) {
        outHeights = new Array(OUT_WIDTH);
        for (let x = 0; x < OUT_WIDTH; x++) {
            const srcX = Math.floor(x * (width / OUT_WIDTH));
            outHeights[x] = heights[srcX] * (OUT_HEIGHT / height);
        }
    } else if (height !== OUT_HEIGHT) {
        outHeights = heights.map(y => y * (OUT_HEIGHT / height));
    }

    const bands = LAYER_STYLE[theme];
    const png = paintSurface(palette, outHeights, bands);
    const outPath = path.join(mapDir, 'surface.png');
    await writePng(png, outPath);
    const styleLabel = bands === null ? 'SMOOTH' : `${bands} BANDS`;
    console.log(`✔ ${theme.padEnd(10)} [${styleLabel}] → ${path.relative(process.cwd(), outPath)}`);
}

async function main() {
    const arg = process.argv[2];
    const themes = arg ? [arg] : Object.keys(LAYER_STYLE);

    console.log(`Baking ${themes.length} surface.png file(s)...`);
    for (const theme of themes) {
        try {
            await bakeTheme(theme);
        } catch (err) {
            console.error(`✘ ${theme}: ${err.message}`);
        }
    }
    console.log('');
    console.log('Done. Next:');
    console.log('  1. Copy the new surfaces into client/public/maps-review/ to refresh the gallery');
    console.log('  2. Restart the server (if it caches maps at boot) so the in-game render uses the new surfaces');
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
