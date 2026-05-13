# SolShot — Telegram Challenge Card Handoff

> **Context:** Server-rendered challenge card for Telegram. Posted by your bot when a player issues a direct call-out. Square 1080×1080. OPEN state only for now (other states — MATCHED, LIVE, EXPIRED, CANCELLED — to follow once this ships).

---

## What's in this folder

| File | What it is | What to do with it |
|---|---|---|
| `DuelChallengeCard.jsx` | **Production component** — same JSX renders both in browser DOM and via Satori on Node. | Drop into your bot's image-rendering service. |
| `DuelChallengeCard_Preview.html` | Standalone preview with **live prop editing** sidebar — open in any browser. | Use to test edge cases (long callsigns, big wagers, etc.) before deploying. |
| `CLAUDE_CODE_HANDOFF.md` | This file. | Read first. |

---

## § A — The render stack

**Use Satori + resvg.** Why:

- **Satori** turns React/JSX into SVG, with proper layout (Yoga flexbox under the hood). The card JSX in this folder is already written within Satori's CSS subset.
- **`@resvg/resvg-js`** rasterizes that SVG to PNG.
- Total render: ~50ms on a small VM. No headless browser, no Chrome dependency, deploys cleanly to Cloudflare Workers / Vercel / Fly / Railway.

```bash
npm i satori @resvg/resvg-js
```

### Render function (paste this verbatim)

```ts
// renderChallengeCard.ts
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
import path from 'node:path';
import DuelChallengeCard from './DuelChallengeCard';

// Load fonts ONCE at module scope, not per request.
const FONT_DIR = path.join(__dirname, 'fonts');
const fontBlackOps    = await fs.readFile(path.join(FONT_DIR, 'BlackOpsOne-Regular.ttf'));
const fontShareTech   = await fs.readFile(path.join(FONT_DIR, 'ShareTechMono-Regular.ttf'));

export async function renderChallengeCardPng(props) {
  const svg = await satori(
    DuelChallengeCard(props),     // call as a function — Satori expects a JSX element
    {
      width: 1080,
      height: 1080,
      fonts: [
        { name: 'BlackOpsOne',   data: fontBlackOps,  weight: 400, style: 'normal' },
        { name: 'ShareTechMono', data: fontShareTech, weight: 400, style: 'normal' },
      ],
    }
  );
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 } })
    .render()
    .asPng();
  return png;   // Buffer, ready for sendPhoto
}
```

### Fonts to download

Both fonts are on Google Fonts (open licence, free to redistribute):
- **Black Ops One** → `BlackOpsOne-Regular.ttf`
- **Share Tech Mono** → `ShareTechMono-Regular.ttf`

Drop both .ttf files into a `fonts/` folder beside the renderer. The `name` in the Satori `fonts` array **must match exactly** what's set in the component (`'BlackOpsOne'` and `'ShareTechMono'`). Do not use the spaces from the Google Fonts UI name.

### Satori gotchas already handled in this component

| Constraint | How we handled it |
|---|---|
| No `clip-path` | Replaced beveled corners with regular borders. |
| No CSS animations | The status dot is a static circle (no blink). |
| Every parent of multiple children needs `display: flex` | All multi-child wrappers explicitly set `display: 'flex'`. |
| `text-shadow` is supported but limited | Used minimally — VS glow + small bone shadow. Tested in Satori 0.10. |
| `transform: rotate()` works on flex elements | The VS rotation is on a flex element, not a `<span>`. |
| Inline SVG `<defs>` with `<pattern>` and `<linearGradient>` | Supported as of Satori 0.10+. If you're on an older version, **upgrade**. |

**Do not** add `backdrop-filter`, `mix-blend-mode`, `filter: blur()`, or CSS keyframe animations to this component. They will silently fail in Satori.

---

## § B — Wiring into your Telegram bot

You have BotFather set up — good. Use the **Bot API** (`node-telegram-bot-api` or `grammy`; both work). Recommended pattern:

```ts
// On a /challenge command (or your existing call-out flow):
import { renderChallengeCardPng } from './renderChallengeCard';

bot.onText(/\/challenge (.+)/, async (msg, match) => {
  const challenge = await createChallenge({ /* ... */ });   // your existing logic
  const png = await renderChallengeCardPng({
    challenger: {
      callsign: challenge.challenger.callsign,
      initials: shortInitials(challenge.challenger.callsign),  // see helper below
      rank:     challenge.challenger.rank,
      record:   `${challenge.challenger.wins}W · ${challenge.challenger.losses}L`,
      winRate:  challenge.challenger.winRatePct,
    },
    opponent: {
      callsign: challenge.opponent.callsign,
      initials: shortInitials(challenge.opponent.callsign),
      handle:   challenge.opponent.tgHandle,
    },
    wager:    { amount: challenge.wager, token: challenge.token },
    format:   challenge.format,                               // 'BO3' etc.
    matchId:  `CH-#${challenge.shortCode}`,
    shortUrl: `solshot.gg/c/${challenge.shortCode}`,
    expiresIn: formatCountdown(challenge.expiresAt),          // 'HH:MM:SS' string
  });

  await bot.sendPhoto(msg.chat.id, png, {
    caption: `${challenge.challenger.callsign} vs ${challenge.opponent.callsign} · ${challenge.wager} ${challenge.token}`,
    reply_markup: {
      inline_keyboard: [[
        { text: '⚔ ACCEPT',  callback_data: `accept:${challenge.id}` },
        { text: '👁 VIEW',   url: `https://solshot.gg/c/${challenge.shortCode}` },
        { text: '✕ DECLINE', callback_data: `decline:${challenge.id}` },
      ]],
    },
  });
});

function shortInitials(callsign) {
  // "GRIZZLY-07" → "G7"; "VIPER-12" → "V12"; "OVERLORD" → "OV"
  const [name, num] = callsign.split('-');
  return num ? name[0] + num : name.slice(0, 2);
}
```

### Inline buttons — three choices, pick one or all

1. **`callback_data: 'accept:<id>'`** → fires a `callback_query` your bot handles. Cheapest. Best for ACCEPT/DECLINE.
2. **`url: 'https://...'`** → opens in browser. Good for VIEW (deep link to your web flow).
3. **`web_app: { url: 'https://...' }`** → opens your **Mini App inside Telegram**. Best UX for ACCEPT if you have a Mini App registered with BotFather. Use `WebAppInfo` and the `Telegram.WebApp` SDK on the receiving page to read the user's Telegram identity.

If your Mini App is set up in BotFather, use option 3 for ACCEPT — players never leave Telegram.

---

## § C — Props contract

```ts
interface DuelChallengeCardProps {
  challenger: {
    callsign: string;     // uppercase, max ~12 chars or it'll ellipsis
    initials: string;     // 2–3 chars, fits inside the avatar square
    rank:     string;     // e.g. 'MAJOR' — uppercase, ~10 chars max
    record:   string;     // pre-formatted, e.g. '47W · 12L'
    winRate:  number;     // integer 0–100
  };
  opponent: {
    callsign: string;     // same constraints
    initials: string;
    handle:   string;     // Telegram @handle, with or without leading @
  };
  wager: {
    amount: number;       // 0.5, 1, 10, etc.
    token:  string;       // 'SOL', 'USDC', etc. — uppercase, ≤4 chars
  };
  format:    string;      // 'BO1' | 'BO3' | 'BO5'
  matchId:   string;      // e.g. 'CH-#0A3F7' — short, uppercase, hex-ish
  shortUrl:  string;      // e.g. 'solshot.gg/c/0A3F7' — no protocol
  expiresIn: string;      // pre-formatted countdown, 'HH:MM:SS' or 'NN MIN'
}
```

**Caller is responsible for formatting strings.** The component does no formatting — you control the typography by controlling the text.

---

## § D — Visual rules — do not change without asking

- **Two-blade background is the signature.** Orange (challenger) vs blood-red (target). Do not flatten or recolour.
- **VS is bigger than any other text on purpose.** Don't shrink it.
- **Symmetric layout.** Challenger and target columns must mirror each other. If you add a field to one, add it (or balance) the other.
- **No emoji on the card body.** The bot caption / inline buttons use emoji; the card itself does not. The `▸` arrow in "ACCEPT NOW" is the only ornament.
- **Wager number is bone-white; token is white.** The orange goes on the *number*, not the token, because the number is the prize.
- **"DECLINE = COWARD"** is the ego-bait line and should stay. If you ever want a softer variant for friendly challenges, branch the component (`tone="friendly"`) — don't water down the default.

---

## § E — Acceptance checklist

- [ ] Card renders identically to `DuelChallengeCard_Preview.html`.
- [ ] PNG output is exactly **1080×1080**, file size under ~250KB after PNG compression.
- [ ] Telegram preview shows the card crisp on mobile clients (test iOS, Android, Desktop, Web).
- [ ] Long callsigns (e.g. `OVERLORD-99`) ellipsis correctly without breaking the layout.
- [ ] Inline buttons fire the right callbacks; ACCEPT routes the second player into the match flow.
- [ ] Wager amount renders correctly for both small (`0.5`) and large (`100`) values.
- [ ] Anonymous / no-rank challengers don't break (default rank to `'OPERATIVE'`, default record to `'NEW'`).

---

## § F — Future states (out of scope for this PR)

The component is structured so additional states slot in cleanly:

- **MATCHED** — replace "SUMMONED" label with "ACCEPTED", swap target avatar tone from cold→hot, top pill goes green.
- **LIVE** — both blades go orange, top pill becomes "● LIVE NOW", expires becomes "LIVE FOR 04:32".
- **EXPIRED** — desaturate the whole card to grayscale, top pill becomes "✕ EXPIRED".
- **CANCELLED** — overlay a "WITHDRAWN" stamp.

Add a `state` prop (`'open' | 'matched' | 'live' | 'expired' | 'cancelled'`) and branch decoration on it. Keep the layout identical.

---

## TL;DR

> Install `satori` + `@resvg/resvg-js`. Drop in `DuelChallengeCard.jsx` and the two .ttf fonts. Call `renderChallengeCardPng(props)` and feed the buffer to `bot.sendPhoto` with an inline keyboard (ACCEPT / VIEW / DECLINE). Use a Mini App for ACCEPT if you have one registered. Don't touch the visual design.
