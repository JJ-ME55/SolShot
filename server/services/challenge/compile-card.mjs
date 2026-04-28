/**
 * One-shot JSX compiler for DuelChallengeCard.
 *
 * Run from server/ directory:
 *   node services/challenge/compile-card.mjs
 *
 * Produces DuelChallengeCard.compiled.js (a plain ES module with
 * JSX transformed to React.createElement calls).
 *
 * The compiled file is committed to the repo and imported by
 * renderChallengeCardPng.js — no runtime transform needed in
 * production. Re-run this script if the JSX source changes.
 */

import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inputPath  = path.join(__dirname, 'DuelChallengeCard.js');
const outputPath = path.join(__dirname, 'DuelChallengeCard.compiled.js');

const source = fs.readFileSync(inputPath, 'utf8');

const result = await esbuild.transform(source, {
    loader: 'jsx',
    jsx: 'automatic',         // uses react/jsx-runtime — no React.createElement boilerplate
    jsxImportSource: 'react',
    target: 'node20',
    format: 'esm',
});

fs.writeFileSync(outputPath, result.code);
console.log(`compiled ${path.basename(inputPath)} → ${path.basename(outputPath)} (${result.code.length} bytes)`);
