/**
 * Server-side render of the CareerStatsCard to PNG.
 *
 * JSX → Satori (SVG) → resvg (PNG buffer).
 *
 * 1080×608, Twitter-optimised. Sibling to renderTrophyCard — reuses the
 * same fonts (Black Ops One + Share Tech Mono) loaded by renderChallengeCard.
 *
 * Tier badges are pre-loaded once at module scope as base64 data URLs.
 * Satori needs the binary inline (data URL), not a file path. Loading once
 * keeps cold-call latency low; the platinum badge is ~2MB so we eat it
 * once at boot rather than per request.
 *
 * Usage:
 *   import { renderCareerCardPng } from './services/challenge/renderCareerCard.js';
 *   const png = await renderCareerCardPng({
 *     callsign, registryId, tierName, rank,
 *     record: { wins, losses, winRate },
 *     totalDamage, kills, deaths,
 *     streak: { current, best },
 *     mvpWeapon: { name, damage },
 *     matchesPlayed, joinedLabel,
 *   });
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CareerStatsCard, { CAREER_CARD_W, CAREER_CARD_H } from './CareerStatsCard.compiled.js';
import { fontBlackOps, fontShareTech } from './renderChallengeCard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BADGE_DIR = path.join(__dirname, 'assets', 'badges');

// Load tier badges once at boot. Map TIER_NAME → data URL.
// Missing files don't throw — the component gracefully falls back to
// the [CLASSIFIED] plate for any null badge URL.
const TIER_BADGES = {};
for (const tier of ['bronze', 'silver', 'gold', 'platinum', 'diamond']) {
    const fp = path.join(BADGE_DIR, `badge-${tier}.png`);
    try {
        const buf = fs.readFileSync(fp);
        TIER_BADGES[tier.toUpperCase()] = `data:image/png;base64,${buf.toString('base64')}`;
    } catch (err) {
        console.warn(`[career-card] missing tier badge: ${tier}`, err.message);
    }
}

/**
 * Render the career stats card and return a PNG Buffer.
 * @param {object} props - CareerStatsCardProps (see CareerStatsCard.js for schema).
 *   Pass tierName as one of NONE | BRONZE | SILVER | GOLD | PLATINUM | DIAMOND.
 *   tierBadgeUrl is auto-resolved here from the tier name.
 * @returns {Promise<Buffer>}
 */
export async function renderCareerCardPng(props) {
    if (!fontBlackOps || !fontShareTech) {
        throw new Error('[career-card] fonts not loaded — check server/services/challenge/fonts/');
    }

    const tierName = String(props.tierName || 'NONE').toUpperCase();
    const tierBadgeUrl = tierName === 'NONE' ? null : (TIER_BADGES[tierName] || null);

    const element = CareerStatsCard({ ...props, tierName, tierBadgeUrl });

    const svg = await satori(element, {
        width: CAREER_CARD_W,
        height: CAREER_CARD_H,
        fonts: [
            { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
            { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
        ],
    });

    const png = new Resvg(svg, { fitTo: { mode: 'width', value: CAREER_CARD_W } })
        .render()
        .asPng();

    return png;
}
