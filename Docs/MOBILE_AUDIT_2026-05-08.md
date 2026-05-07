# Mobile Screen Audit — Design vs Shipped (2026-05-08)

> Comparison of `HAndover from Design/mobile/` against shipped `client/src/screens/`.
> Reference fix: AAR mobile branch in `client/src/components/design/AAR.js:201-453` —
> exemplar 2-col landscape pattern. Reads design at `HAndover from Design/mobile/MobileReport.jsx`.
> Mobile breakpoint: `useIsMobile()` returns true when `innerHeight < 500` OR `innerWidth < 600`
> (`client/src/hooks/useIsMobile.js:5`). Design target frame: 844×390 landscape phone.

## Summary

| Screen | Status | Top issue | Effort |
|---|---|---|---|
| MenuScreen ↔ MobileHome | MATCHES | Wallet menu in topbar adds clutter; otherwise clean | S |
| LobbyScreen ↔ MobileDeploy | MISSING | No mobile branch at all — desktop dual-panel only | L |
| BattleScreen + GroupBattleWrapper ↔ MobileMatch | MATCHES | Excellent AAA-pattern mobile branch in BattleHUD | — |
| ShopScreen ↔ MobileShop | PARTIAL | Mobile branch is portrait list+sheet, not 2-col landscape | M |
| BarracksScreen ↔ MobileBarracks | MISSING | No mobile branch; portrait scroll in landscape frame | M |
| LoadoutScreen ↔ MobileLoadout | MISSING | No mobile branch; single-col list scroll | S |
| ArmoryScreen ↔ MobileArmoryPrestige | PARTIAL | Mobile branch is portrait list+sheet, not 4-col grid | M |
| PrestigeScreen ↔ MobileArmoryPrestige | MISSING | Hard-coded 320px+1fr columns; overflows 390px frame | M |
| Shared design components | PARTIAL | ScreenHeader, TopBar use desktop-only sizing (42px, 38px) | S |

Total: **MATCHES 2 · PARTIAL 3 · WRONG 0 · MISSING 4**
Recommended fix order: BattleScreen is already shipped; LobbyScreen first (every wagered match starts here), then BarracksScreen + PrestigeScreen (high-traffic), then ShopScreen + ArmoryScreen layout rewrites, then Loadout + shared component sizing polish.

---

## Per-screen detail

### MenuScreen ↔ MobileHome.jsx
**Status:** MATCHES (with caveats)
**Files:** `client/src/screens/MenuScreen.js:51-255` (mobile branch), `HAndover from Design/mobile/MobileHome.jsx`
**Design intent:** 2-column 844×390 landscape. Left column: tank hero with online counter beneath. Right column (320px wide in design): PLAY ScanBtn (height 60, fontSize 30), then Armory + Barracks rows, then HOW TO PLAY link. Topbar: 1fr/auto/1fr grid with badge+callsign / wordmark / SHOT+SOL.
**Shipped state:** Has a clean `if (isMobile) return <MobileMenu>` branch at line 51. Topbar uses 1fr/auto/1fr identical to design. Body is 1fr/280px grid (design says 320px — 40px tighter, fine). Tank scaling matches. PLAY button height 52 fontSize 26 (design 60/30 — 13% smaller, acceptable). Secondary buttons match. Online counter present. MY GAMES dynamic sub-label is a useful addition not in the design.
**Gaps:**
- `MenuScreen.js:191` — body grid is `1fr 280px`; design specifies `1fr 320px`. Right column is 40px narrower than spec but legible.
- `MenuScreen.js:220` — `ScanBtn height={52} fontSize={26}`; design is `height={60} fontSize={30}`. Slightly shorter primary CTA.
- `MenuScreen.js:178` — wordmark `fontSize: 22`; design `LogoMark height={24}`. Close enough.
- Wallet wiring (`shotBalance`, `solBalance`) is real — design uses static "1,240 SHOT / 2.31 SOL". Correct upgrade.
- Topbar in mobile branch does NOT include Privy wallet menu (chevron dropdown from desktop `DesignTopBar`). Mobile shows only currency display — no SIGN IN button or address pill. **This is a real UX gap on mobile** — disconnected users can't sign in from the menu screen.
**Effort:** S (pad button sizing slightly, surface a SIGN IN entry point on mobile topbar; otherwise solid)
**Notes:** Strong adherence. Desktop branch (lines 56-150) is unrelated and untouched.

---

### LobbyScreen ↔ MobileDeploy.jsx
**Status:** MISSING
**Files:** `client/src/screens/LobbyScreen.js` (1732 lines, no `useIsMobile` import), `HAndover from Design/mobile/MobileDeploy.jsx`
**Design intent:** 3-column landscape — LEFT 130px (mode list with 5 modes stacked, MOBILE/DUEL/QUICK/HIGH/CUSTOM), MIDDLE 1fr (match config: STAKE chips, ROUNDS chips, PLAYERS chips, TANK COLOR swatches, OPEN LOBBIES list), RIGHT 160px (SUMMARY card + FIND MATCH ScanBtn + HOST CHALLENGE). Compact: section labels 8px, chips 9px, lobby rows 7px.
**Shipped state:** Single layout. `s.container` is `display: flex` with 30%-width left config panel + 70% right room list (`LobbyScreen.js:59-189`). Modes are tabs with `fontSize: 11`, wager buttons fontSize 13, format buttons fontSize 14. Room list is the only scroll target. No `if (isMobile)` branch anywhere. No `clamp()` or `@media` queries. Will render identically on phone and laptop — at 844×390 the room list will be cramped and the config panel will be ~250px wide.
**Gaps:**
- `LobbyScreen.js:1` — no `import useIsMobile from '../hooks/useIsMobile'`.
- `LobbyScreen.js:913` (return) — single rendering path.
- `LobbyScreen.js:60-65` — root `s.container` uses `flex: 1; display: flex; overflow: hidden`. The flex direction is row by default, so on a narrow viewport the two panels squash side-by-side rather than stacking.
- Design's 3-col layout (mode list / config / summary+CTA) is not represented at all.
- Section labels in design are `fontSize: 8` letterSpacing 0.25em — shipped uses `fontSize: 15` (`s.sectionLabel`).
- `MATCH_MODES` shipped (vs_bot/practice/wagered/custom_challenge) does not match design's 5 modes (bot/duel/quick/high/custom). Design predates the Option A simplification per the comment in `LobbyScreen.js:11-19`. Either keep shipped modes and re-skin per design, or restore the 5-mode taxonomy if that's the product intent.
**Effort:** L (full rewrite: add `useIsMobile`, build 3-col mobile branch, decide mode taxonomy alignment, port chip/row primitives from design, plus the existing waiting overlay + deposit flow needs to coexist with the new layout)
**Notes:** This is the hottest path — every paid match starts here. Should be priority #1.

---

### BattleScreen + GroupBattleWrapper ↔ MobileMatch.jsx
**Status:** MATCHES (excellent)
**Files:** `client/src/screens/BattleScreen.js:353-410` (delegates to BattleHUD), `client/src/screens/battle/BattleHUD.js:684-855` (mobile branch), `client/src/screens/GroupBattleWrapper.js:285-295` (delegates to BattleHUD), `HAndover from Design/mobile/MobileMatch.jsx`
**Design intent:** Canvas fills entire screen; HUD floats on top. Top-left forfeit ✕, top-corner HP pills (semi-transparent blur), top-center turn pill, top-right wind chip; left-edge angle slider, right-edge power slider; bottom-left weapon strip + move cluster, bottom-right square FIRE button. AAA pattern.
**Shipped state:** `BattleHUD.js:684-855` is a near-perfect implementation. `CornerHPPill`, `WindChipMobile`, `TurnPill`, `EdgeSlider`, `WeaponIconStrip`, `FireSquare`, `ForfeitX`, `MoveCluster` are all built per spec. Safe-area insets respected via `env(safe-area-inset-*)`. Group-chat variant adjusts insets for TG chrome. `is1v1` vs FFA branches handled — FFA shows a strip across the top instead of corner pills.
**Gaps:**
- `BattleHUD.js:786` — power range is `min={5} max={100}`; design uses `min={0} max={100}`. Minor — server probably enforces a min anyway, irrelevant.
- `BattleHUD.js:779` — angle range `min={0} max={180}`; design uses `min={0} max={90}`. Shipped covers wider range because server supports angles past 90 (lobbed shots over the player's own head). Not a bug.
- POT readout (`BattleHUD.js:761-773`) is an addition not in design — useful for wagered matches.
- GroupBattleWrapper at `screens/GroupBattleWrapper.js:314,325` uses `overflow: 'hidden'` on the wrapper but it's the canvas wrapper, not a scroll trap.
**Effort:** S (no changes recommended; possibly fold the design's POT chip styling into the existing one for visual consistency)
**Notes:** This is the gold standard alongside AAR. Use as reference for other screens.

---

### ShopScreen ↔ MobileShop.jsx
**Status:** PARTIAL
**Files:** `client/src/screens/ShopScreen.js:356-521` (mobile branch), `HAndover from Design/mobile/MobileShop.jsx`
**Design intent:** 2-column landscape — LEFT 1.2fr (ARSENAL: vertical list of weapons with name + tier badge + dmg bar + cost + add button), RIGHT 1fr (LOADOUT: card with selected weapons stacked + READY UP ScanBtn). Top: timer bar (3px tall) with "0:18 REMAINING" / "BUY PHASE" labels. Bottom: opponent status strip "OPPONENTS: WOLFX · STILL BUYING / ● MARKET OPEN".
**Shipped state:** Has mobile branch but it's PORTRAIT-pattern: vertical scroll list of weapons + bottom-sheet detail when a weapon is tapped (`ShopScreen.js:436-516`). Header strip with ARSENAL title + gold (`:365-373`). Bottom status bar with timer + inventory pills + READY button (`:394-434`). No 2-col landscape arrangement; no LOADOUT panel showing the cart side-by-side with the catalog. The bottom-sheet pattern is fine for portrait phones but ignores the design's 2-col layout for landscape.
**Gaps:**
- `ShopScreen.js:363` — root is `flexDirection: 'column'`; design is grid 1.2fr / 1fr.
- `ShopScreen.js:436-516` — bottom-sheet weapon detail is good portrait UX but isn't in design — design has the loadout always visible on the right.
- Timer presentation: shipped at `:402-405` puts a 22px digit in the bottom bar; design `:39-46` puts a thin progress-bar at the top with mono labels. Different look.
- No "OPPONENTS: WOLFX · STILL BUYING / MARKET OPEN" status strip at the bottom — shipped has `opponentActivity` text but not styled per design.
- Tier color mapping different: design uses BASE/STD/ADV/ELITE; shipped uses FREE/STANDARD/TACTICAL/RARE/EPIC/LEGENDARY/PRESTIGE.
- `ShopScreen.js:407` — bottom inventory pill row uses `overflow: hidden` on a flex-wrap container — pills past the first row will be clipped on phones.
**Effort:** M (rewrite mobile branch as 2-col landscape with persistent loadout panel; port timer-bar styling; add opponent status strip)
**Notes:** Bottom-sheet detail is genuinely a good mobile pattern — keep it as a tap-to-expand affordance even after rebuilding the landscape layout. The cost is reconciling that with the always-visible loadout.

---

### BarracksScreen ↔ MobileBarracks.jsx
**Status:** MISSING
**Files:** `client/src/screens/BarracksScreen.js` (606 lines, no `useIsMobile`), `HAndover from Design/mobile/MobileBarracks.jsx`
**Design intent:** Tabs (STAT CARD / HISTORY / ACHIEVEMENTS) at top, tab content below. STAT CARD: 1fr/1.3fr/1fr grid — LEFT identity (callsign/wallet/service), MIDDLE 2x3 stats grid (BATTLES, WIN%, K/D, BEST, ACC, EARNED), RIGHT prestige badge + reticle. Type sizes: callsign 20, stats 18, labels 7. HISTORY: scrollable list of W/L rows. ACHIEVEMENTS: 6-col grid of badges.
**Shipped state:** No `useIsMobile` import. Single layout uses `flex:1 + overflowY:auto + minHeight:0` (`BarracksScreen.js:259-266`) — at least the scroll-trap antipattern is avoided per the comment at `:255-258`. Container is `maxWidth: 900, margin: '0 auto', padding: '24px 24px 80px'` (`:273`). Uses `ScreenHeader` (which has `fontSize: 42` title — way oversized for 390px). Tabs are 2 (COMBAT RECORD / LEADERBOARD), not the design's 3 (STAT CARD / HISTORY / ACHIEVEMENTS). Renders `DossierCard` (single card) + match history scrolled below + leaderboard tab. On a 844×390 phone, the 24px padding + ScreenHeader fontSize 42 + DossierCard height will overflow; user has to scroll vertically in landscape (workable but ugly).
**Gaps:**
- `BarracksScreen.js:1` — no `useIsMobile`.
- Single layout means `DossierCard` and tabs render at desktop sizes on phones.
- Tab taxonomy mismatch: shipped has 2 (stats/leaderboard), design has 3 (card/history/achievements). The shipped Combat Record actually mixes design's STAT CARD + HISTORY into one scroll, missing the tab separation; ACHIEVEMENTS isn't represented at all.
- ScreenHeader title `fontSize: 42` (`components/design/ScreenHeader.js:46`) is huge — design's title is ~14-16. ScreenHeader has no mobile sizing.
**Effort:** M (add `useIsMobile`, build mobile branch with 3-tab layout per design; STAT CARD layout is the bulk of the work; HISTORY is a vertical list which is fast; ACHIEVEMENTS grid needs new data plumbing if not already on the player)
**Notes:** Achievements may not have backend data yet — could ship with placeholder grid first.

---

### LoadoutScreen ↔ MobileLoadout.jsx
**Status:** MISSING
**Files:** `client/src/screens/LoadoutScreen.js` (234 lines, no `useIsMobile`), `HAndover from Design/mobile/MobileLoadout.jsx`
**Design intent:** 2-column grid of consumable cards (each card: name, sub-description, price in $SHOT, +/- stepper). Bottom bar: TOTAL display + BUY & EQUIP ScanBtn. Type sizes: card title 11, sub 7, price 8, total 9.
**Shipped state:** Single layout with `flex:1 + overflowY:auto` scroll-safe pattern (`LoadoutScreen.js:56-63`). Renders `ScreenHeader` then ACTIVE LOADOUT panel (3 slot tiles 64x64) then a vertical 1-column list of consumable rows (`:163-221`). Each row is grid `56px 1fr auto` — icon+name+desc+button. No 2-col layout. No bottom-bar TOTAL+BUY ScanBtn — purchases are per-row buttons. Design's stepper UI (-/n/+) isn't there; shipped just shows ACTIVE/N LEFT or BUY button.
**Gaps:**
- `LoadoutScreen.js:1` — no `useIsMobile`.
- Single column layout — design is 2-col grid which fits 4-6 items in the 390px frame without scroll.
- Per-row purchase buttons vs design's cart+total+single BUY button. Different UX paradigm. Shipped is simpler (immediate purchase) but doesn't match design's "cart" flow.
- No stepper for quantity (because shipped consumables auto-stack to "5 matches"). May be a deliberate model change worth confirming.
- ScreenHeader oversized for 390px frame (same issue as Barracks).
**Effort:** S (add mobile branch with 2-col grid; either skip the cart pattern and use shipped per-row buttons reformatted as cards, or add cart state)
**Notes:** Smallest shipped screen — easiest L→S win. Decide cart vs per-row purchase model first.

---

### ArmoryScreen ↔ MobileArmoryPrestige.jsx (Armory half)
**Status:** PARTIAL
**Files:** `client/src/screens/ArmoryScreen.js:237-331` (mobile branch), `HAndover from Design/mobile/MobileArmoryPrestige.jsx:5-89`
**Design intent:** Tabs (SKINS / TURRETS / TRAILS / VOICE), then 4-COLUMN grid of cosmetic cards. Each card: tank silhouette tinted by rarity, name, rarity tag, price/OWNED. Compact: name fontSize 9, rarity 6.
**Shipped state:** Has mobile branch but it's PORTRAIT list+bottom-sheet (`ArmoryScreen.js:237-331`). Header strip with menu/title/balance. Tabs are 2 (SOL SHOP / COSMETICS) — design has 4 (SKINS/TURRETS/TRAILS/VOICE). List is 1-col vertical (`:273-303`) using `ItemRow` component. Tap → bottom sheet with detail. EmptyState handles SOL tab being unimplemented.
**Gaps:**
- 4-col grid vs 1-col list — biggest layout divergence.
- Tab taxonomy: shipped splits by currency (SOL/SHOT), design splits by category (SKIN/TURRET/TRAIL/VOICE). Design is more useful for browsing; shipped is honest about what's currently buyable. Could nest: outer SOL/SHOT, inner category.
- Bottom-sheet detail is fine but design has no detail panel — buying is inline (rarity badge becomes BUY button on tap).
**Effort:** M (rewrite to 4-col grid; reconcile tab taxonomy; preserve EmptyState for SOL-not-yet-shippable case)
**Notes:** The 4-col grid in 390px frame at gap 8px gives ~70px per cell — tight but doable per the design.

---

### PrestigeScreen ↔ MobileArmoryPrestige.jsx (Prestige half)
**Status:** MISSING
**Files:** `client/src/screens/PrestigeScreen.js` (334 lines, no `useIsMobile`), `HAndover from Design/mobile/MobileArmoryPrestige.jsx:91-171`
**Design intent:** Top section (top:56→bottom:92): horizontal 5-col badge ladder with connectors. Each tier: badge (56x56), name (stencil 11), cost (mono 6). Bottom panel (bottom:22): NEXT PRESTIGE callout + BURN ScanBtn (1fr / 110px grid).
**Shipped state:** No mobile branch. Single layout uses `gridTemplateColumns: '320px 1fr'` (`PrestigeScreen.js:109`) — LEFT 320px is current rank visualization (220x220 badge + cost button + progress bar + button), RIGHT 1fr is vertical tier list with detail panel. With 844px landscape minus 48px padding = 796px, RIGHT gets 476px which is fine width-wise; but the LEFT badge is 220x220 + button + text, and RIGHT has 6 tier rows × ~80px each = 480px height — both columns far exceed 390px. The `flex:1 + overflowY:auto` pattern at `:83-90` handles scroll, but the layout was never tuned for landscape.
**Gaps:**
- `PrestigeScreen.js:1` — no `useIsMobile`.
- Single layout: LEFT 320px column is too wide to leave the RIGHT column comfortable in 844px landscape (and forces vertical scrolling by ~150-200px on phones).
- Design's horizontal ladder pattern (5 badges in a row) is the clean landscape solution; shipped doesn't have it.
- Badge `width: 200, height: 200` (`:114`) is sized for desktop; design uses 56x56 in the ladder + 64x64 elsewhere.
**Effort:** M (port design's horizontal ladder + bottom CTA panel; preserve burn flow + result feedback states from shipped)
**Notes:** Burn flow logic (`handleBurn`, `signAndBurnShot`, `prestigeResult` socket) is solid — only the layout needs rebuilding.

---

### Shared design components ↔ mobile-shared.jsx
**Status:** PARTIAL
**Files:** `client/src/components/design/ScreenHeader.js` (73 lines), `client/src/components/design/TopBar.js` (247 lines), `client/src/components/design/ScanBtn.js` (40 lines), `client/src/components/design/Terrain.js` (14 lines), `HAndover from Design/mobile/mobile-shared.jsx`
**Design intent:** Compact landscape phone primitives — `MobileChrome` (back/title/right slot in 18-22px range), `LogoMark` (height 24-26), `CurrencyChip` (fontSize 9), `ScanBtn` (variable width/height/fontSize), `MobileOverlays` (scanlines), `TerrainMini` (height 80).
**Shipped state:** `ScreenHeader` uses fontSize 42 title (`ScreenHeader.js:46`), 11 subtitle. `DesignTopBar` uses fontSize 38 wordmark (`TopBar.js:130`), 13 callsign, 11 currency. `ScanBtn` is parameterized so callers control size — good. `Terrain` is a fixed silhouette (no mobile variant in design's `TerrainMini`).
**Gaps:**
- `ScreenHeader.js:46` — title `fontSize: 42` hard-coded, no mobile branch. Design's mobile chrome title is `fontSize: 14`.
- `TopBar.js:130` — wordmark `fontSize: 38` hard-coded. Design `LogoMark` is height 24-26.
- `ScreenHeader.js:14-72` — no `useIsMobile` check; renders desktop sizing on phones.
- `TopBar.js` — has wallet menu (chevron dropdown) which design's mobile header omits. Functional addition, but doubles header height on mobile.
- `Terrain.js` — single silhouette; design has a `TerrainMini` variant at height 80 specifically for backgrounds in mobile screens.
- `MobileChrome` from design isn't ported to a shared component — every mobile screen rolls its own header strip (Menu, Shop, Armory each have a custom one). Could DRY into a shared `MobileChrome` to keep headers consistent.
**Effort:** S (add `useIsMobile` branches inside ScreenHeader + DesignTopBar; clamp font sizes when `isMobile`; optionally extract a shared `MobileChrome`)
**Notes:** Fixing ScreenHeader/TopBar's mobile sizing helps every screen that uses them automatically — high-leverage change. The wallet-menu / SIGN-IN affordance on mobile needs design input — the current mobile MenuScreen drops the wallet UI entirely, which probably isn't intended.

---

## Recommended Sequence

Ordered by user-facing impact and ROI:

1. **LobbyScreen → MobileDeploy (L)** — Highest impact; every wagered match passes through. Currently desktop-only. Build the 3-col landscape branch (mode list / config / summary+CTA). Reconcile MATCH_MODES taxonomy with design's 5-mode layout while you're in there.

2. **Shared components: ScreenHeader + DesignTopBar (S)** — One PR, fixes oversized headers on every screen using them (Loadout, Barracks, Prestige). Saves M-level work on each downstream screen because the header is no longer the breakage source.

3. **PrestigeScreen → MobileArmoryPrestige (M)** — High-traffic conversion path ($SHOT burns are the prestige loop). Port the horizontal badge ladder pattern; preserve burn flow.

4. **BarracksScreen → MobileBarracks (M)** — User profile / stats / leaderboard. Tab taxonomy alignment is the trickiest bit; achievements grid may need backend coordination.

5. **ShopScreen rewrite (M)** — In-match buy phase needs the 2-col landscape layout so loadout is always visible. Keep the bottom-sheet detail as a layered enhancement.

6. **ArmoryScreen rewrite (M)** — Pre-launch, lower priority because cosmetics are fewer matches/user. 4-col grid + tab taxonomy reconciliation.

7. **LoadoutScreen mobile branch (S)** — Smallest screen; quick win. Decide cart vs per-row purchase first.

8. **MenuScreen polish + SIGN IN affordance (S)** — Marginal layout tweaks, but the missing SIGN-IN on mobile menu is a real onboarding gap.

---

## Cross-cutting Patterns

- **Type-size table from design (use this as the canonical mobile-landscape sizing table):**
  - Title (screen header): 14-16
  - Section label: 8 (letterSpacing 0.25em, color olive)
  - Card title (stencil): 9-12
  - Body mono: 7-9
  - Stat number (display): 14-22
  - Tiny tag: 6-7
  - Primary CTA (ScanBtn fontSize): 13-16 for inline, 26-30 for hero
  - **Shipped uses 42px titles, 38px wordmarks** — the dominant root cause of "design feels off on mobile" complaints.

- **Scroll-trap antipattern (`minHeight: 100dvh + overflow: hidden`):** Per the JJ note, the audit found this in earlier states (BarracksScreen comment at `:255-258` confirms it was once there). Currently fixed in BarracksScreen, LoadoutScreen, PrestigeScreen via the `flex:1 + overflowY:auto + minHeight:0` pattern. **No active instances of the antipattern found.** Good baseline.

- **`clamp()` typography:** Found ZERO instances across the 9 shipped screens audited. All sizes are static — but tuned for desktop, not for the 390px landscape frame. The fix is `useIsMobile()` branches with separate static sizes (per AAR.js exemplar), not `clamp()`.

- **`useIsMobile()` adoption:** 4 of 9 shipped screens use it (Menu, Battle, Shop, Armory). 5 don't (Lobby, Barracks, Loadout, Prestige, GroupBattleWrapper — the last delegates to BattleHUD which does check). The pattern when present is solid (`if (isMobile) return <MobileX>`).

- **The "static sizes per design, not clamp" pattern from AAR is the right model.** Carry it forward for every fix.

- **Design's `MobileChrome` shared component** isn't ported — Menu, Shop, Armory each have a bespoke header strip. Worth extracting once 2-3 more screens land mobile branches, to enforce consistency.

- **Shared CSS tokens are healthy** — `--accent`, `--bone`, `--olive`, `--bg-deep`, `--clip-6`, `--clip-10`, `--f-display`, `--f-mono` are all in use across both design files and shipped. No mismatch found.

- **PortraitWarning** referenced in JJ's prompt — the audit didn't reach `client/src/components/Layout.js` or `App.js` rotation enforcement, but Grep at `client/src/screens/GroupDepositScreen.js` and `Layout.js` show portrait/landscape handling exists. Out of audit scope.
