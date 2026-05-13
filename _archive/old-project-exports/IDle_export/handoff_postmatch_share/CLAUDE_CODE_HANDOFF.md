# SolShot — Design Handoff for Claude Code

> **Context:** Two deliverables in this folder. Read this whole file before touching code.
> The work is design-validated; treat the visuals as locked unless I say otherwise.

---

## What's in this folder

| File | What it is | What to do with it |
|---|---|---|
| `TrophyShareCard.jsx` | **Production component**, drop-in React. The new post-match shareable card. | **Implement this.** See § A below. |
| `TrophyShareCard_Preview.html` | Standalone preview — open in any browser, no build needed. | Use as your visual reference / pixel diff target. |
| `SolShot_Mobile_Standalone.html` | Offline single-file mobile design exploration (all screens). | Reference only. Do **not** ship this file. See § B below. |
| `CLAUDE_CODE_HANDOFF.md` | This file. | Read first. |

---

## § A — Implement the Trophy Share Card (post-match)

### A1. Goal

Replace the current post-match share UX. After a match ends, the player sees the new **Trophy Share Card** — a 1080×608 image purpose-built to stop scroll on Twitter / X. The existing `CombatCard.js` (career profile card) stays as-is; this is a **new, separate** card for **single-match** results.

### A2. Where it goes

The card replaces / augments whatever currently renders on `client/src/components/PostMatch*` (the after-action / end-of-match screen). The export pipeline is **already built** in `client/src/components/CombatCard.js`:

```js
const canvas = await html2canvas(cardRef.current, {
  backgroundColor: '#0e1209',
  scale: 3,
  logging: false,
  useCORS: true,
});
```

**Reuse that pipeline verbatim.** Same scale, same backgroundColor (`#0e1209` matches the card's bgDeep), same clipboard-then-download fallback. Do not rebuild it.

### A3. Wiring

1. Drop `TrophyShareCard.jsx` into `client/src/components/`.
2. Required fonts are **already loaded** by the existing CombatCard work (`Black Ops One`, `Share Tech Mono`). No new imports.
3. In the post-match screen, render the card inside a wrapper that:
   - **Holds a ref** for html2canvas to capture (this ref points to a fixed `1080×608` div).
   - **Visually scales** the card down to fit the viewport using `transform: scale(N)` on a parent — but the captured div stays at native 1080×608 so export is crisp.

   Pattern:
   ```jsx
   const cardRef = useRef(null);
   const stageRef = useRef(null);
   const [scale, setScale] = useState(1);
   useEffect(() => {
     const fit = () => {
       if (!stageRef.current) return;
       setScale(stageRef.current.clientWidth / 1080);
     };
     fit();
     const ro = new ResizeObserver(fit);
     ro.observe(stageRef.current);
     return () => ro.disconnect();
   }, []);

   <div ref={stageRef} style={{ width: '100%', maxWidth: 1080, aspectRatio: '1080 / 608', overflow: 'hidden', position: 'relative' }}>
     <div style={{ width: 1080, height: 608, transformOrigin: 'top left', transform: `scale(${scale})` }}>
       <div ref={cardRef}>
         <TrophyShareCard winner={...} loser={...} score="2 – 1" matchId={...} terrain={...} duration={...} />
       </div>
     </div>
   </div>
   ```
   Critical: `cardRef` wraps the **unscaled** card. html2canvas does not respect parent CSS transforms reliably; capturing the unscaled element is the safe path.

4. Add four action buttons under the card (match the existing button styling):
   - **Download PNG** — `html2canvas → blob → a.download`
   - **Copy Image** — `html2canvas → blob → ClipboardItem`
   - **Post to X** — opens `https://twitter.com/intent/tweet?text=<encoded>&url=https://solshot.gg/m/<matchId>` in a new tab. (Image must be downloaded/copied separately — Twitter Web Intent doesn't accept image uploads.)
   - **Share Link** — copies `https://solshot.gg/m/<matchId>` to clipboard. Requires the `/m/<matchId>` route to render the card server-side or via OG image; out of scope for this PR but reserve the URL shape.

### A4. Props contract

```ts
interface TrophyShareCardProps {
  winner: {
    callsign: string;     // e.g. "GRIZZLY-07" — uppercase, max ~12 chars or it'll overflow
    damage: number;       // total HP damage dealt this match
    accuracy: number;     // integer percent, 0–100
    shots: number;        // total shots fired
    best: string;         // signature weapon name, e.g. "CRAZY IVAN" — uppercase, max ~14 chars
  };
  loser: {
    callsign: string;     // same constraints
  };
  score?: string;         // default "2 – 1". Use en-dash, not hyphen.
  matchId?: string;       // e.g. "M-#0A3F7"
  terrain?: string;       // single word, uppercase, e.g. "VOLCANIC"
  duration?: string;      // "MM:SS"
}
```

**Length warnings:** the callsign field uses `text-overflow: ellipsis` so longer names won't break layout, but anything over ~12 chars looks weak. Truncate or rank-suffix if needed.

### A5. Visual rules — **do not change without asking**

- **The orange diagonal blade is the signature.** Do not soften it, recolour it, or flatten it. It exists specifically to be recognisable in a 200px Twitter timeline thumbnail.
- **Three stats. Not four. Not five.** I tested four — it dilutes the punch. If a future stat needs to ship, it replaces one of the existing three.
- **Identity (callsign) is the largest text on the card.** Do not let stat numbers compete with it.
- **The "DEFEATED" line is small for a reason.** It's the receipt, not the headline.
- **No emoji, no flair characters** beyond the `▸` arrow already in the bottom strip. The aesthetic is military-tactical; emoji break it.
- **No drop shadows on the card itself.** The card sits on whatever bg the host page provides. Drop shadows are added by the *host wrapper* (preview frame), not the card.

### A6. Acceptance checklist

- [ ] Card renders identically to `TrophyShareCard_Preview.html` (open it side-by-side).
- [ ] `html2canvas` exports a 2160×1216 PNG (at scale: 2) or 3240×1824 (at scale: 3) without missing glyphs, broken gradients, or missing fonts. **Test export, don't assume.**
- [ ] All four action buttons work end-to-end: Download saves, Copy lands in clipboard (verify by pasting into a Twitter compose), Post-to-X opens correct URL, Share-Link copies correct URL.
- [ ] Resizes cleanly on viewports from 360px to 1440px wide.
- [ ] Long callsigns (e.g. "OVERLORD-BRAVO-99") truncate with ellipsis instead of breaking the W badge layout.
- [ ] No console errors on the post-match route.

### A7. Known footguns

- **html2canvas + clip-path:** the W badge and stat tiles use `clip-path: polygon(...)`. html2canvas v1.4+ handles this fine, but if you're on an older version, upgrade or accept square corners on the export. Test before debugging anything else.
- **html2canvas + backdrop-filter:** the stat tiles previously used `backdrop-filter: blur(2px)` which html2canvas ignores. I removed it from the production component; if you re-add CSS effects, **re-test the export**.
- **Font loading race:** if you call `html2canvas` before fonts load, you'll get fallback fonts in the export. Gate the export button behind `document.fonts.ready` or use `await document.fonts.ready` inside the export handler.

---

## § B — The mobile standalone HTML

`SolShot_Mobile_Standalone.html` is an **offline design exploration** — open it in a browser and you'll see a full mobile flow (Home, Deploy, Shop, Loadout, Match HUD, Report, Barracks, Armory, Prestige). It's a **single self-contained file** with all CSS/JS/fonts inlined.

**This is reference, not code to ship.** Use it to:
- See how the design system extends to mobile
- Pull copy decisions, layout patterns, button sizing
- Cross-check that whatever you build on the post-match screen feels consistent with the rest of the app

Do not try to extract React components from it — the inlining process minifies/transforms in ways that aren't pleasant to reverse. Build natively against the existing `client/` codebase.

---

## § C — If something blocks you

1. **Unsure if a visual change is OK?** Ask. Do not freelance on the card visuals.
2. **Existing code conflicts?** The CombatCard exporter pattern is the source of truth — copy from it.
3. **Need a new prop on the card?** Fine, but additive only. Don't change the shape of `winner` / `loser`.

---

## TL;DR

> Drop `TrophyShareCard.jsx` into `client/src/components/`. Render it on the post-match screen inside a `cardRef` div, scaled to fit via a `ResizeObserver`-driven parent transform. Wire four buttons (Download / Copy / Post-to-X / Share-Link) using the **existing** `html2canvas` pipeline from `CombatCard.js`. Do not change the visual design. Test the export at scale: 2 or 3 to confirm fonts and clip-paths render cleanly.
