# SolShot — Trophy Share Card (Satori) Handoff

> **Context:** Server-rendered post-match card, posted by your bot/web after a match settles. Twitter-optimised aspect (1080×608, 1.91:1 — fills the card preview without cropping). Same render stack as the Duel Challenge Card so they ship as one service.

---

## What's in this folder

| File | Purpose |
|---|---|
| `TrophyShareCard.jsx` | **Production component** — same JSX renders in browser DOM and via Satori on Node. |
| `TrophyShareCard_Preview.html` | Standalone preview with **live prop editing**. Test long callsigns, big numbers, edge cases. |
| `CLAUDE_CODE_HANDOFF.md` | This file. |

---

## § A — Render stack (same as Challenge Card)

If you've already wired the duel card, **reuse the same renderer module** — only the component import and dimensions change.

```bash
npm i satori @resvg/resvg-js
```

```ts
// renderTrophyCard.ts
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import TrophyShareCard, { TROPHY_CARD_W, TROPHY_CARD_H } from './TrophyShareCard';

const FONT_DIR = path.join(__dirname, 'fonts');
const fontBlackOps  = await fs.readFile(path.join(FONT_DIR, 'BlackOpsOne-Regular.ttf'));
const fontShareTech = await fs.readFile(path.join(FONT_DIR, 'ShareTechMono-Regular.ttf'));

export async function renderTrophyCardPng(props) {
  const svg = await satori(TrophyShareCard(props), {
    width:  TROPHY_CARD_W,   // 1080
    height: TROPHY_CARD_H,   // 608
    fonts: [
      { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
      { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: TROPHY_CARD_W } }).render().asPng();
}
```

Fonts are the same as the duel card (Black Ops One + Share Tech Mono). If you already loaded them once at module scope for the challenge renderer, **reuse those buffers** — don't double-load.

---

## § B — Satori-safety changes vs the original `TrophyShareCard.jsx`

The original (in `handoff_postmatch_share/`) was built for `html2canvas` and used CSS features Satori doesn't support. This version is functionally equivalent but Satori-clean:

| Original (browser-only) | Satori version |
|---|---|
| `clipPath: polygon(...)` notched corners on W badge + stat tiles | Plain rectangular borders (visually equivalent at this scale) |
| `backdrop-filter: blur(2px)` on stat tiles | Solid `rgba(10,13,7,0.85)` background |
| CSS `repeating-linear-gradient` overlay for scanlines | SVG `<pattern>` overlay (renders identically) |
| `display: grid` for 3 stats | `display: flex` with `flexGrow:1, flexBasis:0` siblings + spacers |
| Bare inline children in flex parents | Every multi-child parent has explicit `display: flex` |
| `text-overflow: ellipsis` on long callsigns | Removed — caller controls callsign length (see § D) |

Visual output is the same. If you A/B them side-by-side at full size you'll see the corners are square instead of notched on the Satori version; everyone else won't.

---

## § C — Wiring

Use it from your match-settled hook (server-side) — produce the PNG, upload to your CDN once, then post the URL anywhere.

```ts
import { renderTrophyCardPng } from './renderTrophyCard';

async function onMatchSettled(match) {
  const png = await renderTrophyCardPng({
    winner: {
      callsign: match.winner.callsign,
      damage:   match.winner.damageDealt,
      accuracy: Math.round(match.winner.accuracy * 100),
      shots:    match.winner.shotCount,
      best:     match.winner.signatureWeapon ?? 'STANDARD',
    },
    loser:    { callsign: match.loser.callsign },
    score:    `${match.winner.rounds} – ${match.loser.rounds}`,
    matchId:  `M-#${match.shortCode}`,
    terrain:  match.terrain.toUpperCase(),
    duration: formatMMSS(match.durationSec),
  });

  // Upload to CDN (S3/R2/Cloudinary), then attach to:
  //   - Telegram bot DM to the winner
  //   - Tweet via Twitter API (the 1.91:1 ratio is exactly the in-feed card size)
  //   - In-app "share" button (returns the CDN url to the client)
}
```

### Tweet attachment

```ts
// twitter-api-v2 example
await twitter.v2.tweet({
  text: `${match.winner.callsign} just took down ${match.loser.callsign} on SolShot. ⚔️\n\nsolshot.gg/m/${match.shortCode}`,
  media: { media_ids: [await twitter.v1.uploadMedia(pngBuffer, { mimeType: 'image/png' })] },
});
```

### Telegram DM (winner only — celebratory ping)

```ts
await bot.sendPhoto(match.winner.tgChatId, png, {
  caption: `🏆 ${match.winner.callsign} — Victory locked in.\nMatch ${match.shortCode} · solshot.gg/m/${match.shortCode}`,
  reply_markup: { inline_keyboard: [[
    { text: '↗ SHARE TO X', url: `https://twitter.com/intent/tweet?url=https://solshot.gg/m/${match.shortCode}` },
    { text: '🔄 REMATCH',    callback_data: `rematch:${match.id}` },
  ]]},
});
```

---

## § D — Props contract

```ts
interface TrophyShareCardProps {
  winner: {
    callsign: string;   // uppercase, ≤12 chars (overflow is hidden, not ellipsised)
    damage:   number;   // integer HP, e.g. 742
    accuracy: number;   // integer 0–100
    shots:    number;   // integer
    best:     string;   // weapon name, ≤14 chars (e.g. 'CRAZY IVAN')
  };
  loser: {
    callsign: string;   // uppercase, ≤12 chars
  };
  score:    string;     // pre-formatted, e.g. '2 – 1' (use the en-dash, not hyphen)
  matchId:  string;     // e.g. 'M-#0A3F7'
  terrain:  string;     // uppercase, ≤10 chars
  duration: string;     // 'MM:SS' or 'H:MM:SS'
}
```

**Caller formats all strings.** The component does no truncation, no number formatting, no rounding. Pre-format `accuracy` to an integer, `damage` to an integer, `duration` to `MM:SS`. If you pass `accuracy: 0.68` you'll get a `0%` rendered.

### Length budgets (tested)

- `winner.callsign` and `loser.callsign`: up to **12 chars** at 110px display font fits cleanly. 13+ will overflow off the right edge — the parent has `overflow:hidden` so it'll clip rather than break the layout, but visually the cut-off is ugly. **Enforce a 12-char callsign cap upstream.**
- `winner.best`: up to **14 chars** in the MVP WEAPON tile. Same clip-on-overflow behaviour.
- `terrain`: up to **10 chars**.

---

## § E — Visual rules — do not change without asking

- **The diagonal blade is the signature.** Don't flatten, soften, or move it.
- **W badge is the focal point.** It's bigger than the wordmark on purpose.
- **3 stats max.** Don't add a fourth — it dilutes the punch and breaks the proportions.
- **Score pill is bone-on-dark.** It's the only inverted element on the card; that's why it pops.
- **No emoji on the card body.** Captions/buttons can use emoji; the card cannot.
- **1080×608.** Don't resize. Twitter compresses to ~1200px wide; rendering at 1080 then upscaling looks fine. Rendering above 1080 wastes bytes.

---

## § F — Acceptance checklist

- [ ] Card renders identically to `TrophyShareCard_Preview.html`.
- [ ] PNG is exactly **1080×608**, file size <250KB.
- [ ] Twitter card preview shows the full image without cropping (1.91:1 sweet spot).
- [ ] Long callsigns (e.g. `OVERLORD-99`) clip without breaking layout.
- [ ] Big numbers (`damage: 9999`, `shots: 199`) don't overflow stat tiles.
- [ ] Match terrain text fits even at the longest variant (`VOLCANIC`, `INDUSTRIAL`).
- [ ] Renderer reuses Satori font buffers from the duel-card module (no double-load).

---

## § G — Future variants (for later)

The component is structured so these slot in cleanly:

- **DEFEAT card** (loser-side share) — invert the W badge to L, swap blade colour to `C.blood`, replace MVP WEAPON with "BIGGEST HIT TAKEN".
- **DRAW card** (rare) — both callsigns same size, no W badge, blade goes neutral olive.
- **RECORD card** — when a player breaks a personal best, replace one stat tile with a "NEW BEST" callout.

Add a `variant` prop (`'win' | 'loss' | 'draw' | 'record'`) and branch decoration; layout stays identical.

---

## TL;DR

> Same Satori + resvg pipeline as the duel card. Drop in `TrophyShareCard.jsx`, share the same fonts. `renderTrophyCardPng(props)` returns a PNG buffer — attach to tweets, Telegram DMs, or upload to CDN for in-app share. Caller formats all strings. Don't add a 4th stat.
