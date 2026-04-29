/**
 * One-shot JSX compiler for card components in this directory.
 *
 * Run from server/ directory:
 *   node services/challenge/compile-card.mjs
 *
 * Compiles every *Card.js JSX source in this folder into a sibling
 * *.compiled.js (plain ESM, no React.createElement boilerplate, uses
 * react/jsx-runtime under the hood).
 *
 * The compiled files are committed to the repo and imported by the
 * render functions — no runtime transform needed in production.
 * Re-run this script if any JSX source changes.
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sources to compile. Add a new card here to include it.
const SOURCES = [
    'DuelChallengeCard.js',
    'TrophyShareCard.js',
    'CareerStatsCard.js',
];

for (const filename of SOURCES) {
    const inputPath = path.join(__dirname, filename);
    if (!fs.existsSync(inputPath)) {
        console.warn(`skipping ${filename} — not found`);
        continue;
    }
    const outputPath = path.join(__dirname, filename.replace(/\.js$/, '.compiled.js'));

    const source = fs.readFileSync(inputPath, 'utf8');
    const result = await esbuild.transform(source, {
        loader: 'jsx',
        jsx: 'automatic',
        jsxImportSource: 'react',
        target: 'node20',
        format: 'esm',
    });

    fs.writeFileSync(outputPath, result.code);
    console.log(`compiled ${filename} → ${path.basename(outputPath)} (${result.code.length} bytes)`);
}
