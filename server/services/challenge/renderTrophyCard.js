/**
 * Server-side render of the TrophyShareCard to PNG.
 *
 * JSX → Satori (SVG) → resvg (PNG buffer).
 *
 * 1080×608, Twitter-optimised (1.91:1 aspect, fills the in-feed card preview
 * without cropping). Same render pipeline as the DuelChallengeCard — reuses
 * the same fonts (Black Ops One + Share Tech Mono) loaded by renderChallengeCard.
 *
 * Usage:
 *   import { renderTrophyCardPng } from './services/challenge/renderTrophyCard.js';
 *   const png = await renderTrophyCardPng({
 *     winner:   { callsign, damage, accuracy, shots, best },
 *     loser:    { callsign },
 *     score:    '2 – 1',
 *     matchId:  'M-#0A3F7',
 *     terrain:  'VOLCANIC',
 *     duration: '08:42',
 *   });
 *
 * Caller is responsible for formatting all strings (no truncation, no
 * number rounding inside the component). See the handoff doc for length
 * budgets — callsign ≤12 chars, best ≤14 chars, terrain ≤10 chars.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import TrophyShareCard, { TROPHY_CARD_W, TROPHY_CARD_H } from './TrophyShareCard.compiled.js';
import { fontBlackOps, fontShareTech } from './renderChallengeCard.js';

/**
 * Render the trophy share card and return a PNG Buffer.
 * @param {object} props - TrophyShareCardProps (see TrophyShareCard.js for schema)
 * @returns {Promise<Buffer>}
 */
export async function renderTrophyCardPng(props) {
    if (!fontBlackOps || !fontShareTech) {
        throw new Error('[trophy-card] fonts not loaded — check server/services/challenge/fonts/');
    }

    const element = TrophyShareCard(props);

    const svg = await satori(element, {
        width: TROPHY_CARD_W,
        height: TROPHY_CARD_H,
        fonts: [
            { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
            { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
        ],
    });

    const png = new Resvg(svg, { fitTo: { mode: 'width', value: TROPHY_CARD_W } })
        .render()
        .asPng();

    return png;
}
