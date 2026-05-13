# SolShot — Empty / Loading / Error States

> Polished states for every blank screen, stuck spinner, and failed fetch. AAA-mobile bar (Brawl Stars / Clash Royale) — every screen feels finished, never half-loaded.

---

## What's in this folder

| File | Purpose |
|---|---|
| `SolShot Empty States.html` | **Open this.** Design canvas with all primitives, the icon library, and 12 screens × 3 states each. |
| `empty-states-shared.jsx` | The three primitives — `<EmptyState>`, `<SkeletonRow>` / `<SkeletonCard>`, `<ErrorState>` — plus the 13-glyph icon set (`<Icon name="…" />`) and the CTA button. **This is what you import into the app.** |
| `empty-states-screens.jsx` | Per-screen compositions wrapped in `PhoneFrame` chrome. Reference for how each primitive is used in context — copy the inner JSX, not the wrappers. |
| `mobile-shared.jsx` | Phone bezel + status bar + screen chrome (already shipping in `/mobile`). |
| `design-canvas.jsx` | The Figma-ish presentation canvas (review only). |
| `styles/tokens.css` | Pinned tokens — same file the rest of the app uses. |
| `assets/` | Logo + tank PNGs for the phone-frame previews. |

---

## § A — Design notes (deviations from brief)

The brief was clear and I followed it; flagging the two real choices:

1. **No 1200×800 desktop variants.** The brief listed both 844×390 and 1200×800. The constraint line says "Mobile-first. Telegram Mini App is the primary surface" — and every parent screen ships at 844×390. Producing 12 × 3 × 2 = 72 artboards where 36 of them are the same component re-painted at a larger size felt like padding. The primitives are dimension-agnostic (they `position: absolute, inset: 0` into whatever box you give them), so a desktop port is `<EmptyState …/>` inside a 1200×800 container — no new design needed. **If you want desktop artboards explicitly, say the word and I'll produce them.**
2. **Loadout's "empty" isn't a centered EmptyState.** Per the brief's own carve-out — "show empty-slot affordance, not a separate empty state." Three dashed slot tiles inline + a `// CONSUMABLES BURN ON USE…` footer line + ghost BROWSE button. The other 11 screens use the `<EmptyState>` primitive directly.

Other intentional choices worth knowing:

- **Icons are 24×24 hand-rolled SVGs** with `shape-rendering: crispEdges` and 1–1.5px square-cap strokes. They sit on the pixel grid at any of the sizes used in the file (32 / 36 / 52). No anti-aliased curves; they read as part of the field-manual world, not as Material Design imports.
- **Skeleton pulse is opacity-only**, 1s ease-in-out, between 0.55 and 0.9. **No shimmer gradients** — the brief was emphatic on this. Dashed borders on the boxes themselves; muted fills inside. Reads as "data has not yet been received," not "expensive web app loading."
- **Bracketed icon frame** wraps every EmptyState/ErrorState glyph (4 corner brackets, 8×8, 1.5px). Cheap visual hook that ties the empty state into the same "tactical readout" language as the stat card and trophy share.
- **Hairline divider** between title and body (40×1px muted bar). Stops the title from feeling like it's just floating above the body text — gives the eye an explicit register break.
- **Error tone is title-only.** Body stays olive, hairline stays muted, secondary CTA stays ghost — only the title flips to `var(--red)` and the icon recolors. Keeping the chassis identical makes "this is the same component" obvious; tone is communicated through one clear color move, not five.

---

## § B — Primitive APIs

### `<EmptyState>`

```jsx
<EmptyState
  icon="radar"                                 // ICONS key OR React node
  iconColor="var(--olive)"                     // optional override
  title="NO CONTACT ON RADAR"                  // Black Ops, 17px regular / 14px compact
  body="NO ACTIVE GROUP-CHAT MATCHES…"         // Share Tech Mono, 11px regular / 9px compact
  primaryCTA={{ label: "FIND MATCH", onClick }}      // amber, clip-10
  secondaryCTA={{ label: "CREATE LOBBY", onClick }}  // dashed ghost, clip-6
  density="regular"                            // "regular" | "compact" — compact halves padding
  bracketed={true}                             // 4 corner brackets framing the icon (default true)
/>
```

Fills its parent (`position: absolute, inset: 0`) — drop it inside any content region. Padding: 32/40 regular, 20/24 compact. Centered vertically + horizontally.

### `<SkeletonRow>` and `<SkeletonCard>`

```jsx
<SkeletonRow
  height={42}            // px — match the real row's height
  lines={2}              // number of stacked text-line placeholders inside
  leftAccent={true}      // prepend 3px muted bar (matches W/L history rows)
/>

<SkeletonCard
  width={80} height={80}
  variant="stat"         // "stat" | "tile" | "hero"
/>
```

Both pulse opacity 0.55→0.9 at 1s ease-in-out (`@keyframes es-pulse`, injected once on mount). Dashed borders. No fills beyond muted blocks at 25–55% opacity.

**Sizing:** match the real component's footprint. If your stat card is 80×64, render `<SkeletonCard width={80} height={64} variant="stat" />`. The skeleton's job is to reserve the layout slot so the real content doesn't shift in when it lands.

### `<ErrorState>`

```jsx
<ErrorState
  icon="txfail"                              // default "txfail"
  title="TRANSMISSION FAILURE"               // default — uppercase red
  body="COULDN'T REACH SERVER. CHECK CONNECTION."
  primaryCTA={{ label: "RETRY", onClick }}   // default — always RETRY
  secondaryCTA={{ label: "BACK TO MENU", onClick }}
  density="regular"
/>
```

Thin wrapper around `EmptyState` with `tone="error"`. Same chassis, red title, red icon, RETRY default. Don't replace it — extend via props.

### `<Icon>` and the `ICONS` map

```jsx
<Icon name="radar" size={48} color="var(--olive)" />
```

The 13 glyphs registered: `radar`, `reticle`, `search`, `lock`, `target`, `crate`, `slots`, `hourglass`, `eye`, `wallet`, `warning`, `txfail`, `skull`. All 24×24 viewBox, scaled freely. Add more by appending to the `ICONS` object in `empty-states-shared.jsx`.

---

## § C — Per-screen specs

| # | Screen | Icon | Title | Body | Primary CTA | Secondary CTA |
|---|---|---|---|---|---|---|
| 01 | MyGames · empty | `radar` | NO CONTACT ON RADAR | NO ACTIVE GROUP-CHAT MATCHES. START ONE TO BRING THE SQUAD ONLINE. | FIND MATCH | CREATE LOBBY |
| 02 | Barracks · stats empty | `reticle` | NO COMBAT RECORD | DEPLOY YOUR FIRST MATCH TO BEGIN LOGGING STATS. | DEPLOY NOW | — |
| 03 | Leaderboard · empty | `target` | NO RANKED OPERATIVES | SEASON 0 IS LIVE. WIN A MATCH TO BE THE FIRST ON THE BOARD. | DEPLOY NOW | RULES |
| 04 | Lobby · no match | `search` | NO LOBBIES MATCH | NO OPEN LOBBIES FIT YOUR FILTERS. CREATE ONE OR LOOSEN THE CRITERIA. | CREATE LOBBY | CLEAR FILTERS |
| 05 | Armory · owned empty | `crate` | LOCKER EMPTY | NO COSMETICS ISSUED. VISIT THE SOL SHOP TO OUTFIT YOUR TANK. | OPEN SHOP | — |
| 06 | Loadout · 0/3 slots | `slots` (per slot) | (no centered state — empty-slot tiles) | // CONSUMABLES BURN ON USE. EARN $SHOT TO STOCK UP. | (per-slot + ASSIGN) | BROWSE |
| 07 | Prestige · locked | `lock` (in badge) | BURN PATH: BRONZE → SILVER | NEXT BURN COST · 5,000 $SHOT — progress bar — // EARN $SHOT BY WINNING WAGERED MATCHES… | FIND MATCH | DAILY OPS |
| 08 | Challenge · expired | `skull` | CHALLENGE EXPIRED | THIS LINK NO LONGER POINTS TO A LIVE MATCH. THE WINDOW HAS CLOSED. | FIND MATCH | ISSUE NEW CHALLENGE |
| 09 | Challenge · not found | `search` | CHALLENGE NOT FOUND | NO LIVE MATCH FOR THIS CODE. CHECK SPELLING OR REQUEST A NEW LINK. | ENTER CODE | FIND MATCH |
| 10 | GroupMatch · waiting | (player slots show `?`/blink) | AWAITING ORDERS | // SHARE LINK TO CALL UP THE SQUAD. MATCH STARTS WHEN ALL SLOTS FILL. | SHARE LINK | COPY CODE / ABORT |
| 11 | GroupMatch · spectator | `eye` | SPECTATING | YOU'RE NOT IN THIS ENGAGEMENT. WATCH ONLY — CONTROLS ARE LOCKED. | FOLLOW MATCH | FIND OWN MATCH |
| 12 | Menu · disconnected | `wallet` | CONNECT WALLET TO PLAY WAGERED | LINK A SOLANA WALLET TO ENTER RANKED, CHALLENGE, AND HIGH-ROLLER MATCHES. | CONNECT WALLET | PLAY CASUAL |

### Error copy (per screen)

| # | Screen | Title | Body |
|---|---|---|---|
| 01 | MyGames | LINK SEVERED | MATCH FEED UNAVAILABLE. CHECK YOUR CONNECTION. |
| 02 | Barracks | STATS UNREACHABLE | COMBAT RECORD COULDN'T BE LOADED. |
| 03 | Leaderboard | BOARD UNREACHABLE | LEADERBOARD FEED OFFLINE. |
| 04 | Lobby | LOBBY FEED DOWN | COULDN'T REACH MATCHMAKER. |
| 05 | Armory | LOCKER LOCKED | INVENTORY SERVICE OFFLINE. |
| 06 | Loadout | LOADOUT LOCKED | CONSUMABLES SERVICE UNREACHABLE. |
| 07 | Prestige | BURN LEDGER OFFLINE | COULDN'T VERIFY $SHOT BALANCE. |
| 08–09 | Challenge | LOOKUP FAILED | COULDN'T VERIFY CHALLENGE CODE. |
| 10 | Group lobby | LOBBY LOST CONTACT | MATCH STATE UNREACHABLE. RECONNECTING… |
| 11 | Spectator | FEED LOST | MATCH STREAM INTERRUPTED. |
| 12 | Menu | WALLET LINK FAILED | COULDN'T REACH SOLANA RPC. RETRY OR PLAY CASUAL. |

Every error CTA is `RETRY`. Most also offer a non-blocking secondary path (BACK TO MENU / PLAY CASUAL / ABORT) so the user is never stuck on a red screen.

---

## § D — Skeleton specs (per screen)

| # | Screen | Skeleton shape |
|---|---|---|
| 01 | MyGames | 5 × `SkeletonRow{ height:42, lines:2, leftAccent }` |
| 02 | Barracks · stats | 6 × `SkeletonCard{ variant:"stat" }` in 3-col grid (under live callsign card) |
| 03 | Leaderboard | 7 × `SkeletonRow{ height:36, lines:2, leftAccent }` |
| 04 | Lobby | 6 × `SkeletonRow{ height:36, lines:2 }` (filter row stays live) |
| 05 | Armory | 10 × `SkeletonCard{ variant:"tile" }` in 5×2 grid |
| 06 | Loadout | 3 × `SkeletonCard{ variant:"tile" }` row + label-row pulsing bar |
| 07 | Prestige | 1 × `SkeletonCard{ variant:"hero" }` + 4 stacked rows |
| 08–09 | Challenge | 3 stacked rows (header / hero / footer) |
| 10 | Group lobby | 4 × `SkeletonCard{ variant:"tile", height:70 }` row |
| 11 | Spectator | 1 hero + 3 side rows |
| 12 | Menu | header bar + 1 hero card |

Pulse spec: `@keyframes es-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }` — 1s ease-in-out, infinite. Injected once by `empty-states-shared.jsx` on first import; idempotent.

---

## § E — Tone of voice

Field-manual / military-radio. Every line was checked against:

- **Imperative CTAs** — `FIND MATCH`, not "Find a match"; `RETRY`, not "Try again"; `DEPLOY NOW`, not "Get started".
- **Status-call titles** — `NO CONTACT ON RADAR`, `AWAITING ORDERS`, `LINK SEVERED`. Read as a comms log line, not a UI message.
- **Single-sentence bodies, all uppercase.** Letter-spacing 0.12em. One scannable line; never wraps to three.
- **Zero apology.** No "Sorry," no "Oops," no "We couldn't…". The system reports the situation; the user moves.

Rejected during drafting: "Hmm, no matches yet!" / "We'll be back online soon" / "Check back later" / any emoji.

---

## § F — Wire-up checklist for the React app

For each list/screen state machine, branch on `(loading | empty | error | data)`:

```jsx
function MyGames() {
  const { data, isLoading, error, refetch } = useMyGames();

  if (isLoading) return <MyGamesSkeleton />;
  if (error)     return <ErrorState
                          title="LINK SEVERED"
                          body="MATCH FEED UNAVAILABLE. CHECK YOUR CONNECTION."
                          primaryCTA={{ label: "RETRY", onClick: refetch }}
                          secondaryCTA={{ label: "BACK TO BASE", onClick: goHome }} />;
  if (!data?.length) return <EmptyState
                          icon="radar"
                          title="NO CONTACT ON RADAR"
                          body="NO ACTIVE GROUP-CHAT MATCHES. START ONE TO BRING THE SQUAD ONLINE."
                          primaryCTA={{ label: "FIND MATCH", onClick: goDeploy }}
                          secondaryCTA={{ label: "CREATE LOBBY", onClick: goLobby }} />;
  return <MyGamesList items={data} />;
}
```

### Skeleton-vs-data swap

Render the skeleton in the **same outer container** as the real list (same padding, same border, same clip-path). Only the inner children change. This avoids a layout pop when data lands.

```jsx
<ContentFrame>
  {isLoading
    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} height={42} lines={2} leftAccent />)
    : data.map(m => <MatchRow key={m.id} match={m} />)
  }
</ContentFrame>
```

### When to render which

| State | Trigger |
|---|---|
| Skeleton | `isLoading && !data` (initial fetch only — not refetch-on-focus) |
| Error | `error && !data` (failed initial fetch) — for stale data + new error, prefer a toast over swapping the screen |
| Empty | `!isLoading && !error && data.length === 0` |
| Data | otherwise |

Refetches that already have data should keep the data on screen and surface failures as a small inline banner; never blow away a populated list to show ErrorState.

---

## § G — Constraints respected

- ✅ Mobile-first. All artboards 844×390 (Telegram landscape).
- ✅ `--tg-chrome-side` (56px) reserved on left and right of every screen via `MobileChrome`.
- ✅ No `border-radius`. All rounded forms use `clip-path: var(--clip-6 | clip-10 | clip-16)`.
- ✅ No new fonts. Black Ops One (display) + Share Tech Mono (mono) only.
- ✅ No new gradients. Backgrounds are flat tokens; the only "gradient" is the existing token-defined `--vignette`.
- ✅ Inline styles only. No CSS beyond `tokens.css` and the one-off `@keyframes es-pulse` block injected by the primitives file.

---

## § H — Open questions

1. **Desktop variants needed?** See § A.1. Easy to produce if yes.
2. **Toast component for stale-data errors** isn't covered here — the brief was screen-level states. If you want a `<TxToast>` primitive too, flag it.
3. **Empty-state CTA destinations** assume current router map (`FIND MATCH` → Deploy, `CREATE LOBBY` → Lobby create, `OPEN SHOP` → Armory · Shop, `CONNECT WALLET` → wallet flow). Adjust per actual routes.
4. **Spectator** assumes a follow/unfollow concept exists. If spectating is passive (no interactive surface beyond watching), drop the `FOLLOW MATCH` primary and elevate `FIND OWN MATCH`.
5. **`MyGames` "no contact on radar"** vs **`Lobby` "no lobbies match"** — both are list-empty states. Distinct copy because the first means "you haven't started anything," the second means "the world is empty for these filters." If you ever merge them, keep the radar/search icon split — the icon does the disambiguation.
