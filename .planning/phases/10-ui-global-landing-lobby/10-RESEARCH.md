# Phase 10: UI — Global, Landing & Lobby - Research

**Researched:** 2026-02-24
**Domain:** React UI modifications — price ticker, landing screen copy, lobby wager display, shop prestige integration
**Confidence:** HIGH (research based on reading actual codebase files; all patterns are from verified existing code)

## Summary

Phase 10 is a React UI-only phase: no new server services, no new socket handlers, no new dependencies. Every requirement maps to modifying or extending existing components. The shotPrice socket pattern is already proven in WinScreen.js and LoseScreen.js. JupiterSwap.js is already integrated in ShopScreen.js and PrestigeScreen.js. The wallet adapter already highlights Jupiter Mobile as RECOMMENDED.

The main work is: (1) extract a reusable ShotPriceTicker component used by TopBar.js so all screens show the ticker, (2) update MenuScreen.js with ecosystem partner logos, three CTAs, and required copy, (3) add a "What is a wallet?" help link to WalletDisplay.js or the wallet connect flow, (4) enhance LobbyScreen.js wager display to show pot and payout math, (5) add Practice mode onramp framing in LobbyScreen.js, and (6) enhance ShopScreen.js prestige weapon display to show burn cost and tier requirement alongside the existing JupiterSwap button.

**Primary recommendation:** Build ShotPriceTicker as a standalone component, add it to TopBar.js as a center element (between back button and wallet), and share the same getShotPrice socket pattern already used in WinScreen. Every other requirement is targeted copy/UI edits to existing screens.

## Standard Stack

This phase uses only libraries already installed. No new dependencies needed.

### Core (already installed)
| Library | Purpose | Location |
|---------|---------|---------|
| React (useState, useEffect, useCallback) | Component state and socket subscriptions | All screen files |
| window.socket | Socket.IO client, shared across app | Exposed via App.js non-enumerable property |
| JupiterSwap.js | SOL-to-SHOT swap modal | `client/src/components/JupiterSwap.js` |
| useSocket hook | Socket event subscriptions with stale-closure safety | `client/src/hooks/useSocket.js` |
| TopBar.js | Shared navigation bar across all inner screens | `client/src/components/TopBar.js` |
| WalletDisplay.js | Wallet connect button + balance chips | `client/src/components/WalletDisplay.js` |
| @solana/wallet-adapter-react-ui | WalletMultiButton (wallet connect modal) | Already installed |

### CSS Variables (already defined in index.css)
| Variable | Value | Use in this phase |
|---------|-------|-------------------|
| `--sp` | `#9945FF` | Sol Purple — prestige, SHOT price ticker |
| `--sg` | `#14F195` | Sol Green — SOL amounts, payout display |
| `--am` | `#ffb627` | Amber — gold, wager badges |
| `--kh` | `#b8a88a` | Khaki — secondary text |
| `--gd` | `#ffd700` | Gold — currency values |
| `--bn` | `#e8dcc8` | Bone — primary text |
| `--rg` | `#ff6b1a` | Range Orange — hover, accents |

### Fonts (already loaded via Google Fonts in index.css)
- `'Black Ops One', cursive` — headings, screen titles
- `'Share Tech Mono', monospace` — ticker text, labels, mono data
- `'Bebas Neue', sans-serif` — large numeric displays

## Architecture Patterns

### Existing shotPrice Socket Pattern (verified from WinScreen.js + LoseScreen.js)

Both post-game screens already use this exact pattern. Phase 10 extracts it into a reusable component:

```javascript
// Source: client/src/screens/WinScreen.js lines 113-128
const [shotPrice, setShotPrice] = useState(null);

useEffect(() => {
  const socket = window.socket;
  if (!socket) return;

  const handlePrice = (price) => {
    setShotPrice(price);
  };

  socket.on('shotPrice', handlePrice);
  socket.emit('getShotPrice');

  return () => {
    socket.off('shotPrice', handlePrice);
  };
}, []);
```

The server returns `{ usdPrice: number|null, priceChange24h: number|null, lastUpdated: number|null }`.
`usdPrice` is null when: API key missing, token has no liquidity, or API down.

### TopBar.js Current Layout (verified from TopBar.js)

TopBar currently has: [Back Button] [Title (absolute center)] [WalletDisplay]. To add a ticker without disrupting the center-title positioning, add the ticker as a second row below the bar, OR replace the absolute-centered title with a flex layout that includes the ticker in the center slot.

Recommended approach: Add the ticker as a subtle element in the title area when a title is present, or as a persistent second row when no title is present (menu). The existing position: absolute on the title must be reworked if adding ticker alongside it.

**Simpler approach:** Add ticker as a fixed bottom strip on TopBar, or as a new `ShotPriceTicker` component that renders beneath TopBar in Layout — callers add it to screens that want it. But the requirement says "visible in header on every screen," so integrating into TopBar.js itself is correct.

**Concrete TopBar layout change:**
```javascript
// Before: title is position:absolute centered over the full bar
// After: three-column flex with left (back), center (title + ticker), right (wallet)
// The ticker renders beneath the title in the center column, font-size 10px, subtle opacity
```

### Wager Payout Calculation (verified from LobbyScreen.js)

Current LobbyScreen shows wager as `amount + ' SOL'`. The requirement is to show pot and winner payout. From the escrow program (90/7/3 BPS split hardcoded in lib.rs), winner receives 90% of pot:

```javascript
// Source: MEMORY.md — "Settlement: 90/7/3 BPS split (winner/treasury/ops)"
// pot = wager * 2  (both players put in wager)
// winnerPayout = pot * 0.90

function formatWagerWithPayout(wager) {
  if (wager === 0) return 'FREE';
  const pot = wager * 2;
  const payout = (pot * 0.90).toFixed(3);
  return `${pot} SOL pot — winner takes ${payout} SOL`;
}
```

This replaces the current `formatWager()` helper in LobbyScreen.js.

### Practice Mode Framing (verified from LobbyScreen.js MATCH_MODES)

`practice` mode is already defined: `{ label: 'PRACTICE', wagerRange: [0, 0], formats: [1], color: 'var(--kh)' }`. The mode selector renders the label. To add the onramp framing, add a conditional sublabel beneath the mode selector that shows the onramp message when Practice is selected.

```javascript
// In LobbyScreen.js, beneath mode selector:
{matchMode === 'practice' && (
  <div style={s.sublabel}>
    PRACTICE FREE. EARN SHOT. WAGER WHEN READY.
  </div>
)}
```

### Prestige Weapons in ShopScreen.js (verified from ShopScreen.js + tiers.js)

Currently ShopScreen.js detects prestige weapons with:
```javascript
selectedWeapon.tier && selectedWeapon.tier.toLowerCase().includes('prestige')
```
And shows the JupiterSwap button. But weapons.js uses `tier: 'PRESTIGE'` (uppercase), and `PRESTIGE_TIERS` in tiers.js defines which weapon IDs map to each tier. The ShopScreen needs to show burn cost and tier requirement. This requires cross-referencing WEAPONS array with PRESTIGE_TIERS to find which tier unlocks each prestige weapon.

```javascript
// Source: client/src/data/tiers.js PRESTIGE_TIERS
// Each tier has: { tier: N, name: 'Bronze', cost: 200, weapons: [24] }
// weapons.js doesn't currently include prestige weapon entries (IDs 21,22,24,26,29)
// These are prestige-only — not in the 15-weapon WEAPONS array

// ShopScreen receives weapons from server via shopPhase socket event
// Prestige weapons would need to appear in that list to be visible in shop
// Current shop only shows WEAPONS from weapons.js (15 base weapons)
```

**Critical finding:** Prestige weapons (IDs 21, 22, 24, 26, 29) are defined in tiers.js `weapons: [24]` arrays but NOT in `client/src/data/weapons.js`. ShopScreen.js pulls from the WEAPONS constant. For the shop to show prestige weapons with burn cost and tier requirement, either: (a) add prestige weapon metadata to weapons.js or a separate prestige-weapons.js, or (b) render a separate prestige section in ShopScreen that reads from PRESTIGE_TIERS. Option (b) is cleaner and doesn't risk breaking server weapon sync.

### Ecosystem Partner Logos (MenuScreen.js)

MenuScreen.js currently has a `solanaBadge` with a dot and "POWERED BY SOLANA" text. The requirement calls for a logos row with: Solana, Jupiter, Meteora, Claude. These should be rendered as image tags pointing to public assets, or as styled text badges if image assets are not present.

**Check existing assets:**
```
/assets/images/branding/ — logo-transparent.png, logo-full.png, logo-monochrome.png, banner.png, og-preview.png, win-screen.png, lose-screen.png
/assets/images/logos/ — weapon logos
```
Partner logos (Solana, Jupiter, Meteora, Claude) do NOT appear to exist as image assets. They will need to be either: (a) fetched from official CDNs (requires CSP update), (b) created as SVG text badges styled to match each brand's color, or (c) added as PNG assets manually.

**Recommended approach:** Styled text badges with brand colors — no new image files, no CSP changes. Each badge shows the partner name in their brand color:
- Solana: `#9945FF` (purple) or `#14F195` (green)
- Jupiter: `#C7F284` (lime green, Jupiter brand)
- Meteora: `#00D4AA` (teal, Meteora brand)
- Claude/Anthropic: `#D97706` (amber orange) or simply `#E8DCC8`

### "What is a Wallet?" Help Link (UI-07)

WalletDisplay.js renders WalletMultiButton when not connected. The wallet modal is controlled by `@solana/wallet-adapter-react-ui`. Adding a help link requires either: (a) wrapping WalletMultiButton in a container and adding a link below it, or (b) injecting CSS into the wallet modal (same pattern as the RECOMMENDED badge injection in WalletContext.js lines 125-154).

**Recommended approach:** In WalletDisplay.js, when `!connected`, render WalletMultiButton plus a small help link below:
```javascript
{!connected && (
  <div style={{ textAlign: 'center', marginTop: 4 }}>
    <a href="https://solana.com/learn/what-is-a-crypto-wallet" target="_blank" rel="noopener noreferrer"
       style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: 10, color: 'var(--kh)', opacity: 0.6, letterSpacing: 1 }}>
      WHAT IS A WALLET?
    </a>
  </div>
)}
```
The CSP in index.html blocks external links opening. `target="_blank"` opens in a new tab in the browser — this is fine since the game is landscape browser. The CSP `connect-src` doesn't restrict `<a>` tags.

### ShotPriceTicker Component Design

Extract into `client/src/components/ShotPriceTicker.js`:

```javascript
// Source pattern: WinScreen.js lines 113-128 + 259-270
import React, { useState, useEffect } from 'react';

function ShotPriceTicker() {
  const [shotPrice, setShotPrice] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    const handlePrice = (price) => {
      setShotPrice(price);
      setReady(true);
    };

    socket.on('shotPrice', handlePrice);
    socket.emit('getShotPrice');

    return () => {
      socket.off('shotPrice', handlePrice);
    };
  }, []);

  // Before first response: show nothing (avoid flash of N/A)
  if (!ready) return null;

  // No price data: pre-launch state
  if (!shotPrice || shotPrice.usdPrice === null) {
    return (
      <span style={tickerStyle}>SHOT: N/A</span>
    );
  }

  const change = shotPrice.priceChange24h;
  const changeColor = change >= 0 ? '#14F195' : '#cc2200';
  const changeStr = change != null ? ` | ${change >= 0 ? '+' : ''}${change.toFixed(1)}%` : '';

  return (
    <span style={tickerStyle}>
      {'SHOT $' + shotPrice.usdPrice.toFixed(4)}
      {changeStr && <span style={{ color: changeColor }}>{changeStr}</span>}
    </span>
  );
}
```

The ticker should be subtle: `font-size: 10px`, `color: var(--sp)` (Sol Purple), `opacity: 0.7`, `letter-spacing: 1px`.

### TopBar.js Integration of ShotPriceTicker

The TopBar center area uses `position: absolute; left: 50%; transform: translateX(-50%)` for the title — this creates a stacking issue with adding a ticker alongside it. The cleanest fix is to change the center slot from absolute to flex-column:

```javascript
// After: center as column flex
centerColumn: {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: 1,
},
title: {
  fontFamily: "'Black Ops One', cursive",
  fontSize: 18,
  color: 'var(--bn)',
  letterSpacing: 2,
  textTransform: 'uppercase',
},
// ShotPriceTicker renders below title
```

The wrapper then becomes `display: flex; align-items: center` with three children: `[left div][center div flex-1][right div]`, removing the `position: relative` + absolute trick.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SOL-to-SHOT swap UI | Custom swap form | `JupiterSwap.js` (already built Phase 9) | Singleton, wallet passthrough, platform fee routing already handled |
| SHOT price fetching | Client-side API call | `getShotPrice` socket event (Phase 9 server service) | API key stays server-side; rate limiting; caching already implemented |
| Wallet connection modal | Custom modal | `WalletMultiButton` from `@solana/wallet-adapter-react-ui` | Jupiter Mobile highlighting already injected via CSS in WalletContext.js |
| Partner logo SVGs | Fetch from CDN | Styled text badges | Avoids CSP `img-src` extension; no new assets; works offline |
| Payout calculation | Complex fee derivation | Simple math: `pot * 2 * 0.90` | 90/7/3 BPS split is hardcoded in escrow program — no server call needed |

## Common Pitfalls

### Pitfall 1: TopBar Title Absolute Positioning Conflict
**What goes wrong:** Adding ShotPriceTicker to TopBar while title uses `position: absolute; left: 50%; transform: translateX(-50%)` causes the ticker to overlap or be obscured by the absolute-positioned title.
**Why it happens:** The absolute title escapes normal flow and sits on top of other flex children.
**How to avoid:** Replace the absolute centering with a three-column flex layout (`left div, center div flex:1, right div`). The center column becomes `display: flex; flex-direction: column; align-items: center`.
**Warning signs:** Ticker appears behind title text; title shifts when ticker is present.

### Pitfall 2: shotPrice Socket Listener on Non-Connected Screens
**What goes wrong:** ShotPriceTicker subscribes to `shotPrice` event via `window.socket`. If the socket is not yet connected (e.g., on LoadingScreen), `socket.on()` throws or silently fails.
**Why it happens:** LoadingScreen renders before socket connection is confirmed. TopBar renders on all inner screens, but `window.socket` is set in App.js and is always defined (even if not connected).
**How to avoid:** The existing pattern `if (!socket) return;` at the top of the useEffect handles this. Also: TopBar is NOT shown on LoadingScreen or MenuScreen — LoadingScreen has no TopBar, MenuScreen has no TopBar. So the ticker only needs to render on screens that already use TopBar (Lobby, Shop, etc.) where the socket is confirmed connected.
**Warning signs:** `Cannot call on of undefined` errors in console.

### Pitfall 3: Prestige Weapon IDs Not In weapons.js
**What goes wrong:** Adding prestige weapon display logic in ShopScreen that references `getWeaponById()` for prestige weapon IDs (21, 22, 24, 26, 29) returns `null` because they are NOT in the 15-weapon `WEAPONS` array in weapons.js.
**Why it happens:** Prestige weapons are defined only in tiers.js `weapons: [id]` arrays. They're not in the base weapon catalog — they're unlocked by tier, not purchased with gold.
**How to avoid:** In ShopScreen's prestige section, read weapon IDs from PRESTIGE_TIERS (imported from tiers.js) rather than from WEAPONS. Build a lookup: `{ 24: 'Homing Missile (Bronze)', 29: 'Cruiser (Silver)', ... }` inline or import from a new prestige-weapons metadata file.
**Warning signs:** `getWeaponById(24)` returns null; prestige weapon names show as undefined.

### Pitfall 4: WalletDisplay "What is a Wallet?" Link in Compact Mode
**What goes wrong:** WalletDisplay renders in `compact` mode in TopBar (no SHOT balance chip). Adding the help link to WalletDisplay unconditionally causes it to appear in the TopBar on every screen, not just the wallet connect screen.
**Why it happens:** The `compact` prop controls SHOT balance visibility, but the help link would render whenever `!connected` regardless of compact mode.
**How to avoid:** Only show the help link when `!compact` (i.e., full mode). Full mode is used in MenuScreen. The requirement says "wallet connect screen" — which maps to the WalletMultiButton modal. The link should render in MenuScreen's wallet section (full WalletDisplay), not in the compact TopBar version.
**Warning signs:** Help link appears in TopBar on every inner screen.

### Pitfall 5: CSP img-src Blocking External Partner Logos
**What goes wrong:** Fetching Solana/Jupiter/Meteora logos from their official CDNs (e.g., `https://upload.wikimedia.org/...` or `https://jup.ag/logo.png`) fails silently because `img-src` CSP in index.html only allows `'self' data: blob:`.
**Why it happens:** index.html CSP: `img-src 'self' data: blob:` — no external domains whitelisted.
**How to avoid:** Use styled text badges (CSS-only) instead of `<img>` tags for partner logos. This requires zero CSP changes and no asset management.
**Warning signs:** Partner logo `<img>` elements render as broken image icons.

### Pitfall 6: Multiple getShotPrice Emits From Multiple Components
**What goes wrong:** If ShotPriceTicker in TopBar AND WinScreen AND LoseScreen all emit `getShotPrice` on mount, the server processes three near-simultaneous requests per page navigation. Not harmful, but wasteful.
**Why it happens:** Each component independently subscribes to the socket price event.
**How to avoid:** This is acceptable behavior — the server handler is cheap (just reads from module-level cache). WinScreen and LoseScreen do NOT have TopBar, so they won't double-subscribe. The only risk is TopBar + other screens that also have the ticker. Since TopBar is the only place the ticker lives, there's only one subscription per screen session.
**Warning signs:** None serious; log output shows multiple getShotPrice events per screen load.

### Pitfall 7: Payout Display for Practice Mode (0 SOL Wager)
**What goes wrong:** Calling `formatWagerWithPayout(0)` with the new payout formula shows "0 SOL pot — winner takes 0.000 SOL" which is ugly for the practice mode free tier.
**Why it happens:** The formula handles 0 wager as a number rather than a special case.
**How to avoid:** Keep the existing guard: `if (wager === 0) return 'FREE'` at the top of the formatter before doing pot math.
**Warning signs:** Room cards in lobby show "0 SOL pot — winner takes 0.000 SOL" for practice rooms.

## Code Examples

### ShotPriceTicker Component (new file)
```javascript
// Source pattern: WinScreen.js lines 111-128, 258-271
// File: client/src/components/ShotPriceTicker.js
import React, { useState, useEffect } from 'react';

function ShotPriceTicker({ style = {} }) {
  const [shotPrice, setShotPrice] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const socket = window.socket;
    if (!socket) return;

    const handlePrice = (price) => {
      setShotPrice(price);
      setReady(true);
    };

    socket.on('shotPrice', handlePrice);
    socket.emit('getShotPrice');

    return () => {
      socket.off('shotPrice', handlePrice);
    };
  }, []);

  if (!ready) return null;

  const baseStyle = {
    fontFamily: "'Share Tech Mono', monospace",
    fontSize: 10,
    letterSpacing: 1,
    color: 'var(--sp)',
    opacity: 0.75,
    ...style,
  };

  if (!shotPrice || shotPrice.usdPrice === null) {
    return <span style={baseStyle}>SHOT: N/A</span>;
  }

  const change = shotPrice.priceChange24h;
  const changeColor = change != null && change >= 0 ? '#14F195' : '#cc2200';

  return (
    <span style={baseStyle}>
      {'SHOT $' + shotPrice.usdPrice.toFixed(4)}
      {change != null && (
        <span style={{ color: changeColor, marginLeft: 4 }}>
          {change >= 0 ? '+' : ''}{change.toFixed(1)}{'%'}
        </span>
      )}
    </span>
  );
}

export default ShotPriceTicker;
```

### TopBar.js — Three-Column Flex Layout with Ticker
```javascript
// Modified TopBar.js — replaces absolute-positioned title with three-column flex
// Source: existing TopBar.js, pattern from WinScreen.js shotPrice
const styles = {
  bar: { /* existing */ },
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    gap: 0,
  },
  left: { flexShrink: 0, minWidth: 80 },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontFamily: "'Black Ops One', cursive",
    fontSize: 18,
    color: 'var(--bn)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  right: { flexShrink: 0, minWidth: 80, display: 'flex', justifyContent: 'flex-end' },
};

// JSX:
<div style={styles.wrapper}>
  <div style={styles.left}>
    {onBack && <button ...>MENU</button>}
  </div>
  <div style={styles.center}>
    {title && <div style={styles.title}>{title}</div>}
    <ShotPriceTicker />
  </div>
  <div style={styles.right}>
    {showWallet && <WalletDisplay compact />}
  </div>
</div>
```

### LobbyScreen.js — formatWager with Payout
```javascript
// Source: existing formatWager() in LobbyScreen.js line 489-492
// Enhanced to show pot size and winner payout
// 90/7/3 BPS: winner gets 90% of pot (source: MEMORY.md escrow settlement)
function formatWagerWithPayout(amount) {
  if (amount === 0) return 'FREE';
  const pot = (amount * 2).toFixed(2);
  const payout = (amount * 2 * 0.90).toFixed(3);
  return `${pot} SOL pot \u2014 winner takes ${payout} SOL`;
}

// Also: room card wager badge in JSX shows this string
// wagerBadge style already handles amount > 0 conditional color
```

### LobbyScreen.js — Practice Mode Onramp Label
```javascript
// In LobbyScreen.js, inside the left panel after mode selector
// Source: existing s.sublabel style in LobbyScreen.js
{matchMode === 'practice' && (
  <div style={{
    ...s.sublabel,
    color: 'var(--sg)',
    opacity: 0.8,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: -4,
  }}>
    PRACTICE FREE. EARN SHOT. WAGER WHEN READY.
  </div>
)}
```

### MenuScreen.js — Ecosystem Partner Logos Row (CSS badges, no images)
```javascript
// Replace existing solanaBadge div with a partners row
// No external image fetches needed — avoids CSP img-src restrictions
const partnersRow = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
  justifyContent: 'center',
  marginBottom: 12,
  zIndex: 1,
};

const partnerBadge = (color) => ({
  fontFamily: "'Share Tech Mono', monospace",
  fontSize: 10,
  color: color,
  letterSpacing: 2,
  padding: '2px 8px',
  border: `1px solid ${color}44`,
  borderRadius: 2,
  background: `${color}0A`,
});

// Partner colors (brand-accurate):
// Solana: #9945FF (purple) | Jupiter: '#C7F284' | Meteora: '#00D4AA' | Claude: '#D97706'
const PARTNERS = [
  { name: 'SOLANA',   color: '#9945FF' },
  { name: 'JUPITER',  color: '#C7F284' },
  { name: 'METEORA',  color: '#00D4AA' },
  { name: 'CLAUDE',   color: '#D97706' },
];

// JSX (replace solanaBadge):
<div style={partnersRow}>
  {PARTNERS.map((p) => (
    <span key={p.name} style={partnerBadge(p.color)}>{p.name}</span>
  ))}
</div>
```

### MenuScreen.js — Three CTAs
```javascript
// Current navItems array has: DEPLOY, ARMORY, PRESTIGE, BARRACKS
// Requirement: three CTAs — Play Free (primary), Connect Wallet, Learn More
// Play Free maps to lobby navigation (already exists as DEPLOY)
// "Connect Wallet" should trigger WalletMultiButton — needs wallet context
// "Learn More" can link to litepaper/docs URL

// Recommended: Add CTAs as a distinct section ABOVE the nav buttons
// Keep existing nav buttons (they're the app's main navigation)
// The three CTAs serve as landing page conversion elements for new visitors

const HERO_CTAs = [
  { id: 'play',    label: 'PLAY FREE',       variant: 'primary',   action: 'lobby' },
  // "Connect Wallet" handled by WalletDisplay (WalletMultiButton) — already present
  // "Learn More" as a text link to litepaper
];
```

**Note on "Connect Wallet" CTA:** WalletDisplay.js already renders WalletMultiButton when `!connected`. The existing wallet section in MenuScreen.js already serves this CTA. No additional button is needed — just better visual placement and labeling. Add a label above WalletDisplay: "NEW? CONNECT A WALLET TO WAGER SOL."

**Note on "Learn More" CTA:** Link to litepaper/external docs. Since this is a web game, an `<a href>` tag suffices. Target URL TBD (could be `/docs`, GitHub, or litepaper PDF in public assets).

### MenuScreen.js — Required Copy Elements
```javascript
// Skill-based tagline (add/replace existing tagline)
taglineText: 'SKILL, NOT LUCK. WAGER 0.1 TO 1.0 SOL.';
subTagline: 'ARTILLERY COMBAT — NO DOWNLOAD REQUIRED';

// Current tagline: 'ARTILLERY COMBAT ON SOLANA'
// Required additions:
// 1. Skill-not-luck emphasis
// 2. Wager range visible (0.1–1.0 SOL, matching MATCH_MODES in LobbyScreen.js)
// 3. "No download" message
```

### ShopScreen.js — Prestige Weapon Burn Cost + Tier Display
```javascript
// Source: client/src/data/tiers.js PRESTIGE_TIERS
// Prestige weapons live in tiers.js, NOT in weapons.js
// Build lookup at top of ShopScreen.js:
import { PRESTIGE_TIERS } from '../data/tiers';

// Build a map: weaponId -> { tierName, burnCost, tierColor }
const PRESTIGE_WEAPON_META = {};
PRESTIGE_TIERS.forEach((tier) => {
  if (tier.weapons && tier.cost > 0) {
    tier.weapons.forEach((wId) => {
      PRESTIGE_WEAPON_META[wId] = {
        tierName: tier.name,
        burnCost: tier.cost,
        color: tier.color,
        reward: tier.reward,
      };
    });
  }
});

// In weapon detail panel, detect prestige:
const prestigeMeta = selectedWeapon ? PRESTIGE_WEAPON_META[selectedWeapon.id] : null;

// If prestigeMeta exists, show burn cost + tier requirement:
{prestigeMeta && (
  <div>
    <div style={{ color: prestigeMeta.color, fontSize: 11, letterSpacing: 2 }}>
      {prestigeMeta.tierName.toUpperCase() + ' PRESTIGE'}
    </div>
    <div style={{ color: 'var(--sp)', fontSize: 11, letterSpacing: 1 }}>
      {'REQUIRES ' + prestigeMeta.burnCost.toLocaleString() + ' SHOT BURN'}
    </div>
    <JupiterSwap
      mode="modal"
      buttonLabel={'BUY SHOT TO UNLOCK ' + prestigeMeta.tierName.toUpperCase()}
      buttonStyle={{ marginTop: 6, fontSize: 8, padding: '5px 10px' }}
    />
  </div>
)}
```

## State of the Art

| Old Approach | Current Approach | Implication |
|---|---|---|
| Inline price fetching per screen | Centralized ShotPriceTicker component | Extract once, reuse in TopBar |
| `position: absolute` title in TopBar | Three-column flex layout | Enables ticker in center without overlap |
| "POWERED BY SOLANA" single badge | Multi-partner ecosystem row | More conversion-friendly landing |
| `formatWager()` shows only amount | `formatWagerWithPayout()` shows pot+payout | Clearer value proposition |
| JupiterSwap button with generic label | Prestige-aware label with burn cost | Drives prestige engagement |

**Deprecated patterns to avoid:**
- `window.solWallet.*` — all wallet access is via `useSolShotWallet()` context hook (CS-04 completed)
- Fetching SHOT price client-side — always use server socket pattern to protect API key

## Open Questions

1. **"Learn More" CTA destination URL**
   - What we know: requirement says CTA should exist; no URL specified
   - What's unclear: is there a litepaper URL, GitHub link, or docs page?
   - Recommendation: Default to `/docs` path or link to `SolShot_Litepaper_v2.0.md` if served as public asset; planner should note this as a URL TBD placeholder

2. **Prestige weapons appearing in weapon shop**
   - What we know: Prestige weapons (IDs 21,22,24,26,29) are NOT in the 15-weapon WEAPONS array; ShopScreen shows weapons from server `shopPhase` event
   - What's unclear: does the server currently send prestige weapons in shopPhase? Checking the server WEAPON_CATALOG would confirm
   - Recommendation: Research task or planner note — if server doesn't send prestige weapons in shopPhase, the shop can't display them to buy. The burn-cost display in UI-10 may need to be a separate "prestige locked" section in the shop sidebar rather than inline with purchasable weapons

3. **MenuScreen layout for landing CTAs**
   - What we know: MenuScreen is a game navigation screen, not a traditional web landing page; it renders inside a 16:9 viewport constrained layout
   - What's unclear: do the three CTAs replace the existing nav buttons or supplement them?
   - Recommendation: Supplement — the nav buttons (DEPLOY, ARMORY, PRESTIGE, BARRACKS) are the app's core navigation. The CTAs are marketing-oriented additions targeted at first-time visitors. Add CTAs above or alongside the wallet display section.

4. **Meteora brand color**
   - What we know: Meteora is a Solana DeFi protocol; their brand color from web search appears to be approximately `#00D4AA` (teal) or similar
   - What's unclear: exact hex without checking official Meteora brand assets
   - Recommendation: Use `#00D4AA` as placeholder; planner can flag for visual verification

## Sources

### Primary (HIGH confidence — read directly from codebase)
- `client/src/screens/WinScreen.js` — shotPrice socket pattern, lines 113-128, 258-271
- `client/src/screens/LoseScreen.js` — shotPrice socket pattern (confirmed same approach)
- `client/src/components/TopBar.js` — current layout structure, absolute title positioning
- `client/src/components/JupiterSwap.js` — existing Jupiter Terminal singleton component
- `client/src/components/WalletDisplay.js` — WalletMultiButton, compact mode, connected state
- `client/src/screens/MenuScreen.js` — current landing/menu layout and nav structure
- `client/src/screens/LobbyScreen.js` — MATCH_MODES, formatWager, wager display
- `client/src/screens/ShopScreen.js` — prestige weapon detection, JupiterSwap integration
- `client/src/screens/PrestigeScreen.js` — PRESTIGE_TIERS usage, burn flow
- `client/src/data/weapons.js` — 15-weapon WEAPONS array (prestige IDs NOT present)
- `client/src/data/tiers.js` — PRESTIGE_TIERS with weapon IDs and burn costs
- `client/src/index.css` — CSS variables, fonts
- `client/src/components/Layout.js` — viewport structure (16:9, flex column)
- `client/src/App.js` — screen routing, socket bridge
- `client/public/index.html` — CSP policy, Jupiter CDN script tag
- `client/src/hooks/useSocket.js` — socket subscription pattern
- `server/services/jupiter-price.js` — getShotPrice return shape
- `server/socket-io/main.js` line 2615 — getShotPrice socket handler
- `client/src/wallet/WalletContext.js` lines 125-154 — RECOMMENDED badge CSS injection pattern

### Secondary (MEDIUM confidence)
- MEMORY.md — `90/7/3 BPS split (winner/treasury/ops)` for payout calculation
- MEMORY.md — Phase 9 completed items confirming JupiterSwap.js, price service, socket handler all exist

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed, no new deps needed
- Architecture: HIGH — patterns read directly from working production code
- Pitfalls: HIGH — identified from actual code structure analysis
- Partner brand colors: LOW — CSS badge colors for Jupiter/Meteora unverified against official brand guidelines; functional but may need visual tweak

**Research date:** 2026-02-24
**Valid until:** 2026-03-25 (stable codebase, no external API changes)
