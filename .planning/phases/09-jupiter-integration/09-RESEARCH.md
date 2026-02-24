# Phase 9: Jupiter Integration - Research

**Researched:** 2026-02-24
**Domain:** Jupiter ecosystem integration (wallet, price feed, swap widget)
**Confidence:** MEDIUM (mix of verified official docs and inferred CSP requirements)

## Summary

This phase integrates three Jupiter products into SolShot: (1) Jupiter Mobile wallet adapter for wallet connectivity, (2) Jupiter Price API V3 for live SHOT/SOL pricing, and (3) Jupiter Plugin (formerly Terminal) for in-app SOL-to-SHOT swaps with platform fee routing.

The standard approach is: add `@jup-ag/jup-mobile-adapter` with Reown peer dependencies to the wallet list, create a server-side price service that calls the Price API V3 endpoint, and embed Jupiter Plugin via CDN script (`plugin.jup.ag/plugin-v1.js`) in integrated/modal display modes across three screens (prestige shop, weapon shop, post-match). Platform fees are configured via `formProps.referralAccount` and `formProps.referralFee` after creating a referral account on `referral.jup.ag`.

**Primary recommendation:** Use the CDN approach for Jupiter Plugin (not the NPM package) to avoid webpack conflicts in the CRA build. The Plugin loads its own bundle on-demand and works via `window.Jupiter.init()` -- cleanest integration path for react-app-rewired projects.

## Jupiter Mobile Wallet Adapter

### Package & Installation (MEDIUM confidence)
| Library | Version | Purpose |
|---------|---------|---------|
| `@jup-ag/jup-mobile-adapter` | latest (check npm) | Jupiter Mobile wallet support |
| `@reown/appkit` | >= 1.6.0 | WalletConnect protocol (peer dep) |
| `@reown/appkit-adapter-solana` | >= 1.6.0 | Solana adapter for Reown (peer dep) |
| `@reown/appkit-wallet-button` | >= 1.6.0 | Wallet button UI (peer dep) |

**Source:** [GitHub - TeamRaccoons/jup-mobile-adapter](https://github.com/TeamRaccoons/jup-mobile-adapter)

**Actual peer dependencies from package.json (verified):**
```json
{
  "react": ">=18",
  "@reown/appkit": ">=1.6.0",
  "@reown/appkit-adapter-solana": ">=1.6.0",
  "@reown/appkit-wallet-button": ">=1.6.0",
  "@solana/wallet-adapter-base": ">=0.9.0",
  "@solana/web3.js": ">=1.95.0"
}
```

Next.js is NOT a peer dependency (earlier search results were misleading -- verified from actual package.json on GitHub). React >=18 is compatible with this CRA project.

**Installation:**
```bash
npm install @jup-ag/jup-mobile-adapter @reown/appkit @reown/appkit-adapter-solana @reown/appkit-wallet-button
```

**Usage pattern:**
```javascript
import { useWrappedReownAdapter } from '@jup-ag/jup-mobile-adapter';

const { jupiterAdapter } = useWrappedReownAdapter({
  appKitOptions: {
    metadata: {
      name: 'SolShot',
      description: 'Multiplayer artillery game on Solana',
      url: 'https://solshot.gg',
      icons: ['https://solshot.gg/logo.png'],
    },
    projectId: process.env.REACT_APP_REOWN_PROJECT_ID,
    features: { analytics: false, email: false, socials: false },
    enableWallets: false,
  },
});

// Add to wallets array in WalletContext.js
const wallets = useMemo(() => [
  jupiterAdapter,       // Jupiter Mobile first (highlighted)
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
].filter(Boolean), [jupiterAdapter]);
```

### Reown Project ID Requirement
A free Reown project ID is required. Register at [dashboard.reown.com](https://dashboard.reown.com/). This is stored as `REACT_APP_REOWN_PROJECT_ID` in client `.env`.

### Webpack Polyfill Risk (MEDIUM confidence)
The Reown/WalletConnect stack may need additional Node.js polyfills beyond what `config-overrides.js` currently provides. The existing polyfills are:
- `crypto` (crypto-browserify) -- ALREADY SET
- `stream` (stream-browserify) -- ALREADY SET
- `buffer` (buffer/) -- ALREADY SET
- `vm` (false) -- ALREADY SET

Reown may additionally need:
- `assert` (assert/)
- `http` (stream-http)
- `https` (https-browserify)
- `os` (os-browserify/browser)
- `url` (url/)

**Recommendation:** Install these proactively and add to `config-overrides.js`. If not needed, the fallback entries are harmless. If needed and missing, the build will fail cryptically.

### Alternative: Skip Mobile Adapter, Use Standard Wallet (LOW confidence)
Jupiter Mobile may register itself as a Solana Standard Wallet, meaning it might appear automatically in the wallet-adapter modal without any extra package. However, this is unverified -- the mobile adapter package provides guaranteed support and a highlighted position.

## Jupiter Price API V3

### Endpoint (HIGH confidence)
**Source:** [Jupiter Price API V3 Docs](https://dev.jup.ag/docs/price/v3)

| Property | Value |
|----------|-------|
| Base URL | `https://api.jup.ag/price/v3` |
| Method | `GET` |
| Auth | `x-api-key` header (required for all tiers) |
| Free Tier | 60 requests/minute (Lite tier, free API key from portal.jup.ag) |
| Max IDs per request | 50 |

**Request:**
```javascript
const response = await fetch(
  `https://api.jup.ag/price/v3?ids=${SHOT_MINT_ADDRESS}`,
  { headers: { 'x-api-key': process.env.JUP_API_KEY } }
);
const data = await response.json();
```

**Response schema (verified from official docs):**
```json
{
  "4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd": {
    "usdPrice": 0.000123,
    "blockId": 348004026,
    "decimals": 9,
    "priceChange24h": 1.25
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `usdPrice` | number | USD price of the token |
| `blockId` | number | Block ID for price recency verification |
| `decimals` | number | Token decimals (9 for SHOT) |
| `priceChange24h` | number | 24h percentage price change |

**Tokens without recent trades (7+ days) will NOT return prices.** This is relevant for SHOT on devnet where trading may be minimal.

### API Key Setup
1. Go to [portal.jup.ag](https://portal.jup.ag)
2. Sign up with email
3. Get a free Lite tier API key
4. Store as `JUP_API_KEY` in server `.env`

### lite-api.jup.ag Deprecation Warning (HIGH confidence)
The requirements mention `lite-api.jup.ag` but this domain is being deprecated. Migration to `api.jup.ag` with an API key is required. The endpoint path changes slightly:
- Old: `https://lite-api.jup.ag/price/v2?ids=...` (no key needed)
- New: `https://api.jup.ag/price/v3?ids=...` (key required)

**Source:** [Migrate from Lite API](https://dev.jup.ag/portal/migrate-from-lite-api)

### Server-Side vs Client-Side
**Recommendation:** Call Price API from the SERVER, not the client. Reasons:
1. API key stays server-side (not exposed in client bundle)
2. Can cache/throttle to stay within 60 req/min
3. Broadcast price updates to all clients via Socket.IO
4. SOL price is also available in the same call for conversion

### Polling Strategy
```
Server polls every 30-60 seconds:
  GET api.jup.ag/price/v3?ids=SHOT_MINT,SOL_MINT
  Cache result in memory
  Emit 'shotPrice' to all connected clients via Socket.IO
```

## Jupiter Plugin SDK (formerly Terminal)

### Rebranding Note (HIGH confidence)
Jupiter Terminal has been rebranded to **Jupiter Plugin**. The NPM package is `@jup-ag/plugin` (v1.0.13 as of Feb 2026). The CDN is at `plugin.jup.ag`. The old `@jup-ag/terminal` package and `terminal.jup.ag` CDN still work but are deprecated.

**Source:** [GitHub - jup-ag/plugin](https://github.com/jup-ag/plugin)

### Integration Method: CDN Script (Recommended) (HIGH confidence)

**CDN URL:** `https://plugin.jup.ag/plugin-v1.js`

Add to `index.html`:
```html
<script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer></script>
```

This avoids all webpack/CRA bundling issues. The Plugin loads its own app bundle (~425KB gzipped) on-demand when `init()` is called.

**Source:** [Jupiter Plugin HTML Example](https://dev.jup.ag/tool-kits/plugin/html-app-example)

### TypeScript Types (verified from source)

**IInit interface (from GitHub source `src/types/index.d.ts`):**
```typescript
interface IInit {
  displayMode?: 'modal' | 'integrated' | 'widget';
  integratedTargetId?: string;
  widgetStyle?: {
    position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
    size?: 'sm' | 'default';
    offset?: { x?: number; y?: number };
  };
  containerStyles?: CSSProperties;
  containerClassName?: string;
  formProps?: FormProps;
  enableWalletPassthrough?: boolean;
  passthroughWalletContextState?: WalletContextState;
  onRequestConnectWallet?: () => void | Promise<void>;
  autoConnect?: boolean;
  branding?: { logoUri?: string; name?: string };
  defaultExplorer?: 'Solana Explorer' | 'Solscan' | 'Solana Beach' | 'SolanaFM';
  onSwapError?: (args: { error?: TransactionError; quoteResponseMeta: QuoteResponse | null }) => void;
  onSuccess?: (args: { txid: string; swapResult: SwapResult; quoteResponseMeta: QuoteResponse | null }) => void;
  onFormUpdate?: (form: IForm) => void;
  onScreenUpdate?: (screen: IScreen) => void;
  scriptDomain?: string;
}

interface FormProps {
  swapMode?: 'ExactInOrOut' | 'ExactIn' | 'ExactOut';
  initialAmount?: string;
  fixedAmount?: boolean;
  initialInputMint?: string;   // SOL mint for SOL->SHOT
  initialOutputMint?: string;  // SHOT mint
  fixedMint?: string;          // Lock output to SHOT
  referralAccount?: string;    // Referral account pubkey
  referralFee?: number;        // Fee in basis points (e.g., 50 = 0.5%)
  excludeDexes?: string[];
}
```

**Source:** [GitHub - plugin types](https://github.com/jup-ag/plugin/blob/main/src/types/index.d.ts)

### React Integration Pattern

```javascript
// In a React component
import { useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useRef } from 'react';

function JupiterSwap({ onClose }) {
  const walletState = useWallet();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && window.Jupiter) {
      window.Jupiter.init({
        displayMode: 'integrated',
        integratedTargetId: 'jupiter-swap-container',
        enableWalletPassthrough: true,
        formProps: {
          initialInputMint: 'So11111111111111111111111111111111111111112', // SOL
          initialOutputMint: '4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd', // SHOT
          fixedMint: '4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd', // Lock to SHOT
          swapMode: 'ExactIn',
          referralAccount: 'YOUR_REFERRAL_ACCOUNT_PUBKEY',
          referralFee: 50, // 0.5% = 50 bps
        },
        branding: {
          logoUri: '/assets/images/logo.png',
          name: 'SolShot',
        },
        defaultExplorer: 'Solscan',
        onSuccess: ({ txid }) => {
          console.log('[SolShot] Swap successful:', txid);
          // Refresh SHOT balance
        },
        onSwapError: ({ error }) => {
          console.error('[SolShot] Swap failed:', error);
        },
      });
      initialized.current = true;
    }
  }, []);

  // Sync wallet state when it changes
  useEffect(() => {
    if (window.Jupiter && initialized.current) {
      window.Jupiter.syncProps({
        passthroughWalletContextState: walletState,
      });
    }
  }, [walletState]);

  return <div id="jupiter-swap-container" style={{ width: '100%', maxWidth: 400 }} />;
}
```

### API Methods on `window.Jupiter`
```typescript
window.Jupiter.init(props: IInit)     // Initialize/open
window.Jupiter.resume()                // Resume previous session
window.Jupiter.close()                 // Close/hide
window.Jupiter.syncProps(props)        // Update wallet state
```

### Display Mode Recommendations per Screen

| Screen | Mode | Rationale |
|--------|------|-----------|
| Prestige Shop (JUP-03) | `integrated` | Embedded alongside burn UI, always visible |
| Weapon Shop (JUP-04) | `modal` | Opened via "Buy SHOT" CTA button |
| Post-Match (JUP-05) | `modal` | Quick access, doesn't need permanent space |

## Platform Fees

### Setup Flow (MEDIUM confidence)

**Step 1: Create Referral Account**
Go to [referral.jup.ag](https://referral.jup.ag/) and create a referral account. This is an on-chain account that receives swap fees.

**Step 2: Configure in Plugin**
```javascript
formProps: {
  referralAccount: 'YOUR_REFERRAL_ACCOUNT_PUBKEY',
  referralFee: 50, // basis points (50 = 0.5%)
}
```

**Step 3: Fee Token Accounts**
Create referral token accounts for each token you expect fees in (SOL and SHOT). This can be done via the referral dashboard or programmatically.

### Alternative: Direct API Fee (for API-based swaps)
If using the Swap API directly (not Plugin), fees are configured differently:
```javascript
// Quote endpoint: platformFeeBps parameter
// Swap endpoint: feeAccount parameter (token account, not referral account)
```

The Plugin approach uses `referralAccount` + `referralFee` in formProps. The API approach uses `platformFeeBps` + `feeAccount`. These are different mechanisms -- do NOT mix them.

**Source:** [Add Fees to Swap](https://dev.jup.ag/docs/swap/add-fees-to-swap), [Referral Program](https://dev.jup.ag/tool-kits/referral-program)

### Fee Ranges
Typical platform fees range from 20-100 bps (0.2% - 1.0%). Higher fees may discourage swaps. For a game integration, 50 bps (0.5%) is reasonable.

## CSP Requirements

### Domains to Whitelist (MEDIUM confidence)

The exact CSP domains are not documented by Jupiter. Based on analysis of the Plugin's network behavior and API endpoints, these domains are needed:

**`script-src` additions:**
```
https://plugin.jup.ag
```
(Required: the CDN script itself loads from here)

**`connect-src` additions:**
```
https://api.jup.ag
https://plugin.jup.ag
https://tokens.jup.ag
https://cache.jup.ag
https://referral.jup.ag
```

**`style-src` additions:**
The Plugin injects its own styles. May need `'unsafe-inline'` (already present in current CSP).

**For Reown/WalletConnect (mobile adapter):**
```
wss://relay.walletconnect.com
https://relay.walletconnect.com
https://explorer-api.walletconnect.com
https://rpc.walletconnect.com
```

### Current CSP in index.html (for reference)
```
connect-src 'self'
  https://api.devnet.solana.com wss://api.devnet.solana.com
  https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com
  https://solshot-server.onrender.com wss://solshot-server.onrender.com
  ws://localhost:5001 wss://localhost:5001;
```

**What needs to be added:**
```
connect-src ... https://api.jup.ag https://plugin.jup.ag https://tokens.jup.ag https://cache.jup.ag wss://relay.walletconnect.com https://relay.walletconnect.com;
script-src 'self' https://plugin.jup.ag;
```

**Important:** The current CSP has `frame-src 'none'`. If the Plugin uses iframes internally, this may need to be changed to `frame-src https://plugin.jup.ag`. Test this during integration.

**Validation approach:** Open the browser DevTools Console after integration and watch for CSP violation errors. Add missing domains as they appear.

## Integration Gotchas

### Gotcha 1: Jupiter Plugin Singleton
**What goes wrong:** Calling `window.Jupiter.init()` multiple times with different configs (e.g., different screens) does NOT create separate instances. The Plugin is a singleton.
**How to avoid:** Call `init()` once with a default config, then update via `syncProps()` or `close()` + `init()` when switching screens. Alternatively, use `modal` mode and re-init each time with different `formProps`.
**Warning signs:** Second screen shows first screen's token configuration.

### Gotcha 2: Wallet Passthrough Timing
**What goes wrong:** `window.Jupiter.init()` is called before `window.Jupiter` is defined (CDN script not loaded yet).
**How to avoid:** Either check `window.Jupiter` exists before calling, or use the `defer` attribute on the script tag and initialize in a `useEffect`. Add a polling check:
```javascript
const waitForJupiter = () => new Promise((resolve) => {
  if (window.Jupiter) return resolve();
  const interval = setInterval(() => {
    if (window.Jupiter) { clearInterval(interval); resolve(); }
  }, 100);
});
```

### Gotcha 3: Plugin CSS Conflicts
**What goes wrong:** Jupiter Plugin injects its own CSS that may conflict with SolShot's existing styles (especially dark theme, font sizes, z-index).
**How to avoid:** Use `containerClassName` to scope styles. The integrated mode renders inside your target div, so container overflow/sizing needs to be set explicitly. Set `containerStyles: { width: '100%', maxWidth: 420 }`.

### Gotcha 4: CRA Polyfill Gaps with Reown
**What goes wrong:** Build fails with "Module not found: Error: Can't resolve 'assert'" or similar Node.js module errors after adding `@reown/appkit`.
**How to avoid:** Proactively add all potential polyfills to `config-overrides.js`:
```javascript
config.resolve.fallback = {
  ...config.resolve.fallback,
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer/'),
  assert: require.resolve('assert/'),
  http: require.resolve('stream-http'),
  https: require.resolve('https-browserify'),
  os: require.resolve('os-browserify/browser'),
  url: require.resolve('url/'),
  vm: false,
};
```

Install missing polyfills:
```bash
npm install --save-dev assert stream-http https-browserify os-browserify url
```

### Gotcha 5: SHOT Token Not on Jupiter (Devnet)
**What goes wrong:** SHOT token may not have a Jupiter market/pool on devnet, so Price API returns no data and Plugin shows "Route not found" for swaps.
**How to avoid:** Check if a SHOT/SOL pool exists on Jupiter. If not, either: (a) create a liquidity pool on Raydium/Meteora for devnet SHOT, or (b) gracefully handle the "no route" case in the UI. For the hackathon, consider showing a placeholder price if API returns nothing.
**Warning signs:** Price API response is empty object `{}` for SHOT mint.

### Gotcha 6: Price API Key Exposure
**What goes wrong:** Calling Price API from the client exposes the API key in network requests.
**How to avoid:** Always proxy through the server. Create a `server/services/jupiter-price.js` service that calls the API server-side and emits cached prices via Socket.IO.

### Gotcha 7: Referral Account Creation
**What goes wrong:** Passing a referral account pubkey that hasn't been initialized on-chain causes swaps to fail.
**How to avoid:** Create the referral account at [referral.jup.ag](https://referral.jup.ag/) BEFORE configuring it in the Plugin. Also create token accounts for both SOL and SHOT mints.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token swaps | Custom DEX integration | Jupiter Plugin (`window.Jupiter.init()`) | Jupiter aggregates all DEX liquidity, handles routing, slippage, and error handling |
| Token price feed | Direct DEX pool queries | Jupiter Price API V3 | Aggregated price across all markets, handles outlier filtering |
| Wallet connect (mobile) | Custom WalletConnect | `@jup-ag/jup-mobile-adapter` | Wraps Reown/WalletConnect protocol with Jupiter Mobile app deep-linking |
| Referral/fee tracking | Custom fee instruction | Jupiter Referral Program | On-chain program handles fee splitting, token account management |
| Swap UI | Custom swap interface | Jupiter Plugin integrated mode | Full swap UI with token search, routes, slippage, and confirmations |

## Architecture Patterns

### Recommended Project Structure
```
client/
  public/
    index.html                    # Add Plugin CDN script + CSP updates
  src/
    wallet/
      WalletContext.js            # Add Jupiter Mobile adapter
    components/
      JupiterSwap.js              # Reusable Jupiter Plugin wrapper component
      ShotPriceDisplay.js         # Price display component (receives via context/props)
    screens/
      PrestigeScreen.js           # Embed JupiterSwap (integrated mode)
      ShopScreen.js               # Add "Buy SHOT" button -> JupiterSwap (modal mode)
      BattleScreen.js             # Post-match: "Buy SHOT" CTA -> JupiterSwap (modal mode)

server/
  services/
    jupiter-price.js              # Price API V3 polling service
  socket-io/
    main.js                       # Emit 'shotPrice' events to clients
```

### Pattern 1: Reusable Jupiter Swap Component
**What:** A single `JupiterSwap` React component that wraps `window.Jupiter.init()` with SolShot defaults.
**When to use:** Any screen that needs a swap widget.
**Key:** Accept `displayMode` and `onSuccess` as props, share the rest (mints, referral, branding).

### Pattern 2: Server-Side Price Polling
**What:** Server polls Price API every 30-60s, caches, broadcasts via Socket.IO.
**When to use:** Always. Never call Price API from client.
**Key:** Handle empty responses gracefully (token may not have recent trades).

### Pattern 3: Lazy Jupiter Initialization
**What:** Don't call `window.Jupiter.init()` until the user navigates to a screen that needs it.
**When to use:** Always. The Plugin loads ~425KB on first init().
**Key:** Show a loading spinner while Plugin initializes.

### Anti-Patterns to Avoid
- **Multiple init() calls:** The Plugin is a singleton. Don't init() in every component.
- **Client-side API key:** Never put `JUP_API_KEY` in `REACT_APP_*` env vars.
- **Polling Price API from client:** Wastes rate limit, exposes key, duplicates requests.
- **Ignoring "no route" errors:** SHOT may not have liquidity. Handle gracefully.

## Code Examples

### 1. Jupiter Plugin CDN in index.html
```html
<!-- Add before closing </head> tag -->
<script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer></script>
```

**Source:** [Jupiter Plugin HTML Example](https://dev.jup.ag/tool-kits/plugin/html-app-example)

### 2. Server-Side Price Service
```javascript
// server/services/jupiter-price.js
const JUP_API_KEY = process.env.JUP_API_KEY;
const SHOT_MINT = process.env.SHOT_TOKEN_MINT;
const SOL_MINT = 'So11111111111111111111111111111111111111112';

let cachedPrice = null;
let lastFetch = 0;
const POLL_INTERVAL = 30_000; // 30 seconds

export async function getShotPrice() {
  const now = Date.now();
  if (cachedPrice && now - lastFetch < POLL_INTERVAL) return cachedPrice;

  try {
    const res = await fetch(
      `https://api.jup.ag/price/v3?ids=${SHOT_MINT},${SOL_MINT}`,
      { headers: { 'x-api-key': JUP_API_KEY } }
    );
    const data = await res.json();
    cachedPrice = {
      shotUsd: data[SHOT_MINT]?.usdPrice ?? null,
      solUsd: data[SOL_MINT]?.usdPrice ?? null,
      shotSol: data[SHOT_MINT] && data[SOL_MINT]
        ? data[SHOT_MINT].usdPrice / data[SOL_MINT].usdPrice
        : null,
      change24h: data[SHOT_MINT]?.priceChange24h ?? null,
      blockId: data[SHOT_MINT]?.blockId ?? null,
      timestamp: now,
    };
    lastFetch = now;
  } catch (err) {
    console.warn('[Jupiter] Price fetch error:', err.message);
  }
  return cachedPrice;
}
```

### 3. Wallet Context Update (adding Jupiter Mobile)
```javascript
// In WalletContext.js SolShotWalletProvider
import { useWrappedReownAdapter } from '@jup-ag/jup-mobile-adapter';

export function SolShotWalletProvider({ children }) {
  const { jupiterAdapter } = useWrappedReownAdapter({
    appKitOptions: {
      metadata: {
        name: 'SolShot',
        description: 'Artillery wagering on Solana',
        url: 'https://solshot.gg',
        icons: ['/logo192.png'],
      },
      projectId: process.env.REACT_APP_REOWN_PROJECT_ID || '',
      features: { analytics: false, email: false, socials: false },
      enableWallets: false,
    },
  });

  const wallets = useMemo(() => [
    jupiterAdapter,
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ].filter(Boolean), [jupiterAdapter]);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <SolShotWalletInner>{children}</SolShotWalletInner>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### 4. TypeScript Declaration for CDN (optional, for IDE support)
```typescript
// client/src/types/jupiter.d.ts
interface JupiterPlugin {
  init: (props: any) => void;
  resume: () => void;
  close: () => void;
  syncProps: (props: { passthroughWalletContextState?: any }) => void;
}

interface Window {
  Jupiter?: JupiterPlugin;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@jup-ag/terminal` NPM | `@jup-ag/plugin` NPM + CDN | 2025 | Package renamed; old still works but deprecated |
| `terminal.jup.ag` CDN | `plugin.jup.ag` CDN | 2025 | New CDN domain; old redirects |
| `lite-api.jup.ag` (no key) | `api.jup.ag` + API key | 2025 (migration ongoing) | Free tier now requires API key from portal.jup.ag |
| Price API V2 | Price API V3 | June 2025 | Better accuracy, simpler response (usdPrice, blockId, decimals, priceChange24h) |
| `platformFeeAndAccounts` in Terminal | `referralAccount` + `referralFee` in Plugin formProps | 2025 | Simplified fee config in Plugin |
| Separate WalletConnect setup | `@jup-ag/jup-mobile-adapter` | 2025 | Wraps Reown, provides `useWrappedReownAdapter` hook |

**Deprecated/outdated:**
- `lite-api.jup.ag`: Being deprecated. Use `api.jup.ag` with API key.
- `@jup-ag/terminal`: Renamed to `@jup-ag/plugin`. Still functional but not maintained.
- `terminal.jup.ag`: Old CDN domain. Use `plugin.jup.ag`.
- `platformFeeAndAccounts` object: Old Terminal param. Plugin uses `formProps.referralAccount` + `formProps.referralFee`.

## Open Questions

1. **SHOT Token Liquidity on Jupiter**
   - What we know: SHOT is minted on devnet (`4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd`), mint authority burned, 10M supply.
   - What's unclear: Does a SHOT/SOL liquidity pool exist on any Jupiter-aggregated DEX (Raydium, Meteora, Orca) on devnet? Without a pool, Price API returns nothing and Plugin shows "no route."
   - Recommendation: Check if pool exists. If not, create one on Raydium/Meteora with a small amount of liquidity for devnet testing. For hackathon demo, consider hardcoding a placeholder price if API returns null.

2. **Plugin iframe vs inline rendering**
   - What we know: Plugin renders UI inside a target div in integrated mode.
   - What's unclear: Does the Plugin use an iframe internally (which would require CSP `frame-src`), or does it render directly into the DOM?
   - Recommendation: Test with current CSP. If iframe-related CSP errors appear, add `frame-src https://plugin.jup.ag`.

3. **Reown Polyfill Completeness**
   - What we know: Reown/WalletConnect needs Node.js polyfills. Current config-overrides.js has crypto, stream, buffer.
   - What's unclear: The exact set of additional polyfills needed for the specific version of `@reown/appkit` that will be installed.
   - Recommendation: Install all common polyfills proactively (assert, http, https, os, url). Test build immediately after adding the mobile adapter package.

4. **Jupiter Mobile Wallet Highlighting**
   - What we know: JUP-01 requires Jupiter Mobile in "top position with highlight."
   - What's unclear: The `@solana/wallet-adapter-react-ui` WalletModalProvider may not support custom highlighting of individual wallets.
   - Recommendation: Jupiter Mobile will appear first by being first in the wallets array. For visual highlighting, may need to add custom CSS targeting the wallet list item (inspect the rendered modal for class names).

## Sources

### Primary (HIGH confidence)
- [GitHub - jup-ag/plugin types](https://github.com/jup-ag/plugin/blob/main/src/types/index.d.ts) - Complete IInit and FormProps TypeScript interfaces
- [Jupiter Plugin HTML Example](https://dev.jup.ag/tool-kits/plugin/html-app-example) - CDN integration pattern
- [Jupiter Plugin Customization](https://dev.jup.ag/tool-kits/plugin/customization) - All configuration options
- [Jupiter Price API V3](https://dev.jup.ag/docs/price/v3) - Endpoint, params, response schema
- [Migrate from Lite API](https://dev.jup.ag/portal/migrate-from-lite-api) - API key migration guide

### Secondary (MEDIUM confidence)
- [GitHub - TeamRaccoons/jup-mobile-adapter](https://github.com/TeamRaccoons/jup-mobile-adapter) - Mobile adapter package and peer deps
- [Jupiter Mobile Adapter Docs](https://dev.jup.ag/tool-kits/wallet-kit/jupiter-mobile-adapter) - Setup instructions
- [Add Fees to Swap](https://dev.jup.ag/docs/swap/add-fees-to-swap) - Platform fee configuration
- [Referral Program](https://dev.jup.ag/tool-kits/referral-program) - Referral account setup
- [Plugin Playground](https://plugin.jup.ag/) - Interactive configuration tool

### Tertiary (LOW confidence)
- CSP domain list: Inferred from API endpoints and common Jupiter infrastructure. Not officially documented. Needs runtime verification.
- Reown polyfill requirements: Based on community reports of webpack 5 issues with WalletConnect. Actual requirements depend on installed version.
- Jupiter Mobile wallet highlighting: No official docs on custom styling the wallet-adapter modal. Needs CSS inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - Packages verified from GitHub/npm, but exact version compatibility with this CRA project untested
- Architecture: HIGH - CDN integration pattern well-documented, React patterns are standard
- Price API: HIGH - Endpoint and response format verified from official docs
- Plugin SDK: HIGH - TypeScript types verified from source code
- Platform fees: MEDIUM - Referral program documented but exact Plugin integration flow needs testing
- CSP: LOW - Not officially documented; inferred from API domains
- Wallet adapter: MEDIUM - Package verified but CRA/polyfill compat untested

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (30 days; Jupiter ecosystem moves fast but Plugin v1 API is stable)
