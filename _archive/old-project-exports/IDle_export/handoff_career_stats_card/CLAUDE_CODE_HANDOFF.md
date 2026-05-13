# SolShot — Career Stats Card (Satori) Handoff

> **Context:** Server-rendered "operative file" card. Sent on `/stats` command, forwardable in TG group chats, shareable from the Mini App. **Sibling to** `TrophyShareCard` — same render pipeline, same fonts, intentionally different layout.

---

## What's in this folder

| File | Purpose |
|---|---|
| `CareerStatsCard.jsx` | **Production component** — renders in browser DOM and via Satori on Node. |
| `CareerStatsCard_Preview.html` | Standalone preview with **5 preset states** (strong / long-name / mid / fresh / max-length stress test). Renders at 1080 / 540 / 340 widths to verify Telegram inline legibility. |
| `assets/badge-*.png` | Tier badge PNGs copied from project assets (transparent, ~1254px). |
| `CLAUDE_CODE_HANDOFF.md` | This file. |

---

## § A — Design notes (deviations from the brief)

The brief gave me a layout sketch; I leaned on it as input but pushed in a different direction. Worth flagging up-front so it doesn't surprise you on first paint:

1. **Two-column dossier spread, not "badge-then-text".** The card is split 66/34 — left is the typed file (callsign, record, four stats), right is a darker "wax-seal" panel with the tier badge centered. The 3px orange ribbon down the seam is the visual hook that reads like a sealed document edge.
2. **Top bar uses redaction-tape flanking the registry id** (`▮▮▮ OPERATIVE FILE · A37F ▮▮▮`). Sells the classified-dossier metaphor cheaply, no extra art needed.
3. **Tier badge gets a circular orange ring** (the badges are round military rank coins, so a square frame fights them). The ring is `border-radius: 9999`, which Satori supports fine on a div.
4. **Faint "CLASSIFIED" watermark** behind the badge, rotated -8°, at 6% opacity. Visible only on close inspection — gives the right column atmosphere without competing with the badge.
5. **Stat tiles are 3-across** (TOTAL DMG · K/D · MVP WEAPON) — the MVP tile gets `flexGrow:1.4` for breathing room since weapon names run long. Streak was dropped to give the long-name field room to live.
6. **Auto-fit type, no ellipsis anywhere.** CALLSIGN and MVP WEAPON both step down through a 5-tier ladder as char count grows; tracking tightens in step. The widest 14-char string fits both fields without clipping at any of the three render widths. See § D for the ladder values.
7. **Rank pill is bone-on-orange** when ranked, **outlined olive** when unranked. Same spot, two visual weights — the eye finds it identically.
8. **UNRANKED state is a `[CLASSIFIED]` plate** with "TIER PENDING / EARN A WIN" subtext, replacing the badge. Gives fresh players a reason to come back without making them feel like a mistake.
9. **RECENT FORM strip** — last-10 W/L cells along the bottom of the file panel. Gives the eye a second pattern to read besides numbers and fills what would otherwise be dead band.

If you want it dragged closer to the original brief sketch, the layout primitives are easy to swap — flag the ones you want changed.

---

## § B — Render stack (identical to Trophy / Duel)

```bash
# Already in your dependency tree — no new packages
```

```ts
// renderCareerCard.ts
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import CareerStatsCard, { CAREER_CARD_W, CAREER_CARD_H } from './CareerStatsCard';

const FONT_DIR = path.join(__dirname, 'fonts');
const fontBlackOps  = await fs.readFile(path.join(FONT_DIR, 'BlackOpsOne-Regular.ttf'));
const fontShareTech = await fs.readFile(path.join(FONT_DIR, 'ShareTechMono-Regular.ttf'));

// Pre-load tier badges as base64 data URLs (cheaper than re-reading per request)
const BADGE_DIR = path.join(__dirname, 'assets');
const TIER_BADGES = Object.fromEntries(await Promise.all(
  ['bronze','silver','gold','platinum','diamond'].map(async tier => {
    const buf = await fs.readFile(path.join(BADGE_DIR, `badge-${tier}.png`));
    return [tier.toUpperCase(), `data:image/png;base64,${buf.toString('base64')}`];
  })
));

export async function renderCareerCardPng(props) {
  const tierBadgeUrl = props.tierName === 'NONE' ? null : TIER_BADGES[props.tierName] ?? null;
  const svg = await satori(CareerStatsCard({ ...props, tierBadgeUrl }), {
    width:  CAREER_CARD_W,   // 1080
    height: CAREER_CARD_H,   // 608
    fonts: [
      { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
      { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: CAREER_CARD_W } }).render().asPng();
}
```

**Reuse the font buffers** loaded by your trophy/duel renderers — load once at module scope, not per request.

**Pre-load the badges once at module scope** as base64 data URLs. Don't read from disk per request, and don't pass file paths — Satori needs the binary inline (data URL). The component renders `<img src={tierBadgeUrl}>` and Satori embeds the bytes into the SVG.

### Wiring `/stats`

```ts
bot.command('stats', async (ctx) => {
  const callsign = parseCallsignArg(ctx.message.text) ?? ctx.from.callsign;
  const profile  = await getOperativeProfile(callsign);   // your existing loader

  const png = await renderCareerCardPng({
    callsign:      profile.callsign,
    registryId:    profile.registryId,            // 4-char hex
    tierName:      profile.tier,                  // 'NONE' | 'BRONZE' | ...
    rank:          profile.globalRank,            // null if unranked
    record:        { wins: profile.wins, losses: profile.losses, winRate: profile.winRatePct },
    totalDamage:   profile.lifetimeDamage,
    kills:         profile.lifetimeKills,
    deaths:        profile.lifetimeDeaths,
    streak:        { current: profile.currentStreak, best: profile.bestStreak },
    mvpWeapon:     { name: profile.signatureWeapon, damage: profile.signatureWeaponDamage },
    matchesPlayed: profile.matchesPlayed,
    joinedLabel:   `JOINED ${monthYear(profile.createdAt)}`,
  });

  await ctx.replyWithPhoto({ source: png }, {
    caption: `${profile.callsign} · ${TIER_LABEL[profile.tier]}`,
    reply_markup: { inline_keyboard: [[
      { text: '⚔ CHALLENGE', url: `https://t.me/SolShotBot?start=challenge_${profile.callsign}` },
      { text: '↗ SHARE',     url: `https://twitter.com/intent/tweet?url=https://solshot.gg/op/${profile.callsign}` },
    ]]},
  });
});
```

---

## § C — Props contract

```ts
interface CareerStatsCardProps {
  callsign:    string;          // ≤14 chars, uppercase, pre-clipped (component .slice's defensively)
  registryId:  string;          // 4–6 char hex, e.g. 'A37F'
  tierName:    'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
  tierBadgeUrl: string | null;  // base64 data:image/png;base64,... or null when 'NONE'

  rank:        number | null;   // global leaderboard rank, null = unranked
  record: {
    wins:    number;
    losses:  number;
    winRate: number;            // integer 0–100
  };

  totalDamage: number;          // raw HP, component formats (47400 → '47.4K')
  kills:       number;
  deaths:      number;          // 0 → KD ratio renders as '∞'

  streak: {
    current: number;            // 0 if not on a streak — component falls back to "BEST N"
    best:    number;
  };

  mvpWeapon: {
    name:   string;             // ≤14 chars, component .slice's defensively
    damage: number;             // raw HP, formatted
  };

  matchesPlayed: number;
  joinedLabel:   string;        // pre-formatted, e.g. 'JOINED MAR 2026' or 'JOINED THIS WEEK'
}
```

### Defensive behaviour inside the component

- `callsign` and `mvpWeapon.name` are `.slice(0, 14)`'d — caller's pre-clip is the contract, but the component won't break if you forget.
- `deaths === 0` → KD ratio renders `∞`.
- `streak.current === 0` → big number falls back to `streak.best`, sub-line becomes `BEST N`.
- `tierName === 'NONE'` OR `tierBadgeUrl === null` → `[CLASSIFIED]` plate replaces the badge.
- `rank === null` → outlined `UNRANKED` chip replaces the orange `#NN` rank pill.
- `totalDamage` formatter: ≥1000 → `12.3K`; ≥100k → `127K` (rounded, no decimal); else raw.

---

## § D — Visual rules — do not change without asking

- **The 66/34 column split is structural.** Don't shrink the seal panel below 30% — it stops reading as a sealed document and starts looking like a sidebar.
- **The orange ribbon (3px line at the seam) is the signature.** Keep it.
- **Badge gets a circular ring, not a square one.** The badges are circular military coins; a square frame fights the geometry.
- **No emojis on the card body.** Mono symbols only (`▸`, `·`, `–`, `∞`).
- **Auto-fit ladders — never let a string overflow.** Both CALLSIGN and MVP WEAPON use length-based size+tracking ramps. Don't replace with `text-overflow: ellipsis` (Satori doesn't render it reliably) and don't switch to `overflow:hidden` clipping (looks broken). Extend the ladder if you need new fields.

  **CALLSIGN** (left column, ~640px):
  | chars | size | tracking |
  |-------|------|----------|
  | ≤6    | 108  | 0.04em   |
  | ≤8    | 96   | 0.04em   |
  | ≤10   | 82   | 0.02em   |
  | ≤12   | 70   | 0.01em   |
  | 13–14 | 60   | 0        |

  **MVP WEAPON** (~33% tile, ~220px):
  | chars | size | tracking |
  |-------|------|----------|
  | ≤5    | 48   | 0.02em   |
  | ≤7    | 42   | 0.02em   |
  | ≤9    | 34   | 0.01em   |
  | ≤11   | 28   | 0.01em   |
  | ≤13   | 24   | 0        |
  | 14    | 22   | 0        |

  Calibrated against the known longest weapons: `HOMING MISSILE` and `CHAIN REACTION` (14 chars, prestige rewards). Both render at 22px without clipping.

---

## § E — Acceptance checklist

- [ ] Renders identically to the five presets in `CareerStatsCard_Preview.html` (strong / long-name / mid / fresh / maxlen).
- [ ] PNG is exactly **1080×608**, file size <300KB (badges are heavy — see § F).
- [ ] **MAXLEN preset** (`WWWWWWWWWWWWWW` callsign + `CHAIN REACTION` weapon) renders without overflow at 1080, 540, AND 340 widths.
- [ ] **LONG-NAME preset** (`HOMING MISSILE`, `CHAIN REACTION`) renders cleanly — these are real prestige-reward weapon names, not synthetic stress data.
- [ ] `tierName: 'NONE'` shows the `[CLASSIFIED]` plate, no broken `<img>`.
- [ ] `deaths: 0` shows KD as `∞`, not `NaN` or `Infinity`.
- [ ] Diamond badge (1254×1254 source) doesn't blow file size — see optimisation note below.
- [ ] Reuses font buffers from the trophy/duel renderer module (no double-load).

---

## § F — Performance note: badge optimisation

The tier badges in `assets/` are **1254×1254 PNGs at ~2MB each** (Diamond is the worst). They render at 200×200 inside the card — you're shipping ~10× the resolution you need.

**Recommended**: pre-process the badges to **400×400 PNG with palette-quantised alpha** (`pngquant --quality 65-85` works well) before encoding to base64. Cuts the data URL from ~2.7MB to ~80KB and the final card PNG drops from ~500KB to <250KB. No visible quality loss at the rendered size.

```bash
# One-time at build, before encoding to base64:
pngquant --quality=65-85 --strip --output badge-platinum.opt.png 400 < badge-platinum.png
```

If you don't want to add `pngquant` as a dependency, even just resizing to 400×400 with `sharp` halves the size:

```ts
import sharp from 'sharp';
const optimised = await sharp(rawBuf).resize(400, 400).png({ compressionLevel: 9 }).toBuffer();
```

---

## § G — Future variants

- **`/stats <callsign>`** for looking up other operatives — same render, different profile.
- **WEEKLY stats card** — same layout, but stats are last-7-days only. Add a `period: 'lifetime' | 'week' | 'season'` prop and stamp it in the top sub-strip where `CLASSIFIED · TIER:` currently sits.
- **HEAD-TO-HEAD card** — two operative files side-by-side. Composes the same component twice in a 2160-wide canvas. Save for later.

---

## TL;DR

> Same Satori + resvg pipeline as trophy/duel. Drop in `CareerStatsCard.jsx`, share the same fonts, pre-load tier badges as base64 data URLs at module scope. `renderCareerCardPng(props)` returns a PNG buffer for `/stats`. Don't forget to optimise the source badges before encoding — they're 10× bigger than they need to be.
