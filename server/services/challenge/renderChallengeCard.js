/**
 * Server-side render of the DuelChallengeCard to PNG.
 *
 * JSX → Satori (SVG) → resvg (PNG buffer).
 *
 * Fonts are loaded once at module scope. Card is 1080×1080.
 * Returns a Buffer ready for Telegram Bot API sendPhoto.
 *
 * Usage:
 *   import { renderChallengeCardPng } from './services/challenge/renderChallengeCard.js';
 *   const png = await renderChallengeCardPng({
 *     challenger: { callsign, initials, rank, record, winRate },
 *     opponent:   { callsign, initials, handle },
 *     wager:      { amount, token },
 *     format, matchId, shortUrl, expiresIn,
 *   });
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import DuelChallengeCard, { DUEL_CARD_W, DUEL_CARD_H } from './DuelChallengeCard.compiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, 'fonts');

// Fonts loaded once at module scope. If files are missing, render will throw at first call.
// Exported so sibling renderers (e.g. renderTrophyCard) can reuse the same buffers
// without double-loading.
export let fontBlackOps = null;
export let fontShareTech = null;
try {
    fontBlackOps  = fs.readFileSync(path.join(FONT_DIR, 'BlackOpsOne-Regular.ttf'));
    fontShareTech = fs.readFileSync(path.join(FONT_DIR, 'ShareTechMono-Regular.ttf'));
} catch (err) {
    console.warn('[challenge-card] fonts not loaded:', err.message);
}

/**
 * Derive 2-3 char initials from a callsign.
 * "GRIZZLY-07" → "G7"; "VIPER-12" → "V12"; "OVERLORD" → "OV"; "" → "??"
 */
export function shortInitials(callsign) {
    if (!callsign) return '??';
    const s = String(callsign).trim().toUpperCase();
    if (!s) return '??';
    const dashIdx = s.indexOf('-');
    if (dashIdx > 0 && dashIdx < s.length - 1) {
        const head = s.slice(0, dashIdx);
        const tail = s.slice(dashIdx + 1);
        return head[0] + tail; // first letter + suffix number/string
    }
    return s.slice(0, 2);
}

/**
 * Format a Date or ms-future-timestamp into "HH:MM:SS" remaining countdown,
 * or "NN MIN" for short windows. Returns "EXPIRED" if already past.
 */
export function formatCountdown(expiresAt) {
    if (!expiresAt) return '24:00:00';
    const target = expiresAt instanceof Date ? expiresAt.getTime() : Number(expiresAt);
    const ms = target - Date.now();
    if (ms <= 0) return 'EXPIRED';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h === 0 && m < 60) return `${m} MIN`;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Render the challenge card and return a PNG Buffer.
 * @param {object} props - DuelChallengeCardProps (see component for schema)
 * @returns {Promise<Buffer>}
 */
export async function renderChallengeCardPng(props) {
    if (!fontBlackOps || !fontShareTech) {
        throw new Error('[challenge-card] fonts not loaded — check server/services/challenge/fonts/');
    }

    const element = DuelChallengeCard(props);

    const svg = await satori(element, {
        width: DUEL_CARD_W,
        height: DUEL_CARD_H,
        fonts: [
            { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
            { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
        ],
    });

    const png = new Resvg(svg, { fitTo: { mode: 'width', value: DUEL_CARD_W } })
        .render()
        .asPng();

    return png;
}
