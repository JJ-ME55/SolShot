# Phase 13: Client Security - Research

**Researched:** 2026-02-25
**Domain:** CRA build configuration, CSP reporting, console.log stripping
**Confidence:** HIGH

## Summary

Phase 13 has three independent requirements that do not interact with each other. The codebase is a
Create React App project using react-app-rewired 2.2.1 with no existing source map suppression and
no CSP report endpoint. Twenty active console.log statements exist across the client source.

**SEC-01 (source maps):** CRA's `GENERATE_SOURCEMAP` env var is natively supported — adding
`GENERATE_SOURCEMAP=false` to `client/.env.production` is the correct and sufficient approach.
Vercel should also have this set as a build environment variable. The current build output already
contains .map files, confirming they are being generated.

**SEC-02 (CSP report-uri):** The CSP is configured via helmet 8.1.0 in `server/index.js`. A
`reportUri` directive added to the existing CSP directives block and a corresponding
`POST /api/csp-report` Express endpoint is all that is required. The endpoint needs to accept
`Content-Type: application/csp-report` requests.

**SEC-03 (console.log):** Twenty active console.log statements exist across 6 client files.
The recommended automated approach for CRA+react-app-rewired 2.x is to use
`babel-plugin-transform-remove-console` injected via config-overrides.js by manually traversing
`config.module.rules` to find and modify the app's babel-loader. The `injectBabelPlugin` helper
is deprecated in react-app-rewired 2.x and must not be used. An alternative with no new
dependencies is Terser's `drop_console` option via config-overrides.js.

**Primary recommendation:** All three requirements are achievable with small, targeted changes:
one `.env.production` file, two additions to `server/index.js` (reportUri directive + POST route),
and one change to `config-overrides.js` for console stripping — or manual deletion of the 20
console.log lines.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-scripts (CRA) | 5.0.1 | Build toolchain | Already installed |
| react-app-rewired | 2.2.1 | Webpack override | Already installed |
| helmet | 8.1.0 | CSP headers | Already installed |
| babel-plugin-transform-remove-console | 6.9.4 | Strip console.log at compile time | Standard Babel plugin for this exact purpose |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| customize-cra | latest | Adds `addBabelPlugin` helper for react-app-rewired 2.x | Only if you want a cleaner API; adds a new dependency |
| terser-webpack-plugin | bundled with CRA | Minifier with `drop_console` option | Use if you want no new npm dependencies |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| babel-plugin-transform-remove-console | Manual deletion of console.log statements | Manual is simpler (20 lines), no new dependency, verified by grep |
| babel-plugin-transform-remove-console | Terser `drop_console: true` in config-overrides.js | No new dependency, but harder to verify the specific lines removed |
| babel-plugin-transform-remove-console | `customize-cra addBabelPlugin` | Cleaner API but requires an additional package |
| report-uri | report-to (Reporting API) | `report-to` has incomplete Firefox support as of 2025; use both directives for maximum coverage |

**Installation (if using babel plugin):**
```bash
cd client && npm install --save-dev babel-plugin-transform-remove-console
```

## Architecture Patterns

### Recommended Project Structure

No new files or folders needed. Changes touch:
```
client/
├── .env.production          # NEW: GENERATE_SOURCEMAP=false (+ INLINE_RUNTIME_CHUNK=false already in .env)
└── config-overrides.js      # MODIFIED: add babel plugin OR terser drop_console

server/
└── index.js                 # MODIFIED: add reportUri directive + POST /api/csp-report route
```

### Pattern 1: GENERATE_SOURCEMAP via .env.production

**What:** CRA reads env files in priority order: `.env.production.local` > `.env.local` >
`.env.production` > `.env`. The `GENERATE_SOURCEMAP` variable is read directly by react-scripts'
webpack.config.js at line 42: `const shouldUseSourceMap = process.env.GENERATE_SOURCEMAP !== 'false';`.
Setting it to `'false'` (string) disables all source map generation and the source-map-loader rule.

**When to use:** Use `.env.production` for the canonical setting. Also set it as a Vercel build
environment variable so the deployed build inherits it even without the file being committed.

**Example:**
```bash
# client/.env.production
GENERATE_SOURCEMAP=false
REACT_APP_SERVER_URL=https://solshot-server.onrender.com
REACT_APP_SOLANA_NETWORK=mainnet-beta
REACT_APP_ESCROW_PROGRAM_ID=CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD
REACT_APP_SHOT_TOKEN_MINT=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd
INLINE_RUNTIME_CHUNK=false
```

Note: `.env.production` should be committed (it contains no secrets). Vercel will merge its own
environment variables with the file.

### Pattern 2: CSP report-uri in helmet

**What:** The `reportUri` camelCase key (or `"report-uri"` kebab-case) is added to the existing
`directives` object in the helmet CSP configuration. It accepts an array with a single string
value — the endpoint path. A corresponding Express POST route handles the incoming reports.

**When to use:** The endpoint should log violations (at minimum) and ideally store or forward them.
Since the project has a monitoring service already (`server/services/monitoring.js`), the endpoint
can call `trackError()` or simply `console.error()` with the violation data.

**Example (server/index.js additions):**
```javascript
// In helmet contentSecurityPolicy.directives:
reportUri: ['/api/csp-report'],

// New Express route (before app.listen or after other routes):
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body['csp-report'] || req.body;
    console.error('[CSP] Violation:', JSON.stringify(report));
    res.status(204).end();
});
```

The `type: 'application/csp-report'` is required because browsers send violations with this
Content-Type, not `application/json`.

**Note on report-to:** The phase requirement only specifies `report-uri`. If dual coverage is
wanted, add a `Reporting-Endpoints` header and `report-to` directive, but this is not required
by SEC-02.

### Pattern 3: Console.log stripping options

#### Option A: Manual deletion (RECOMMENDED for this project)

20 active console.log lines across 6 files is a small number. Manual deletion is:
- Zero new dependencies
- Immediately verifiable by grep
- No risk of stripping logs from third-party code accidentally
- Keeps console.warn/console.error (which are legitimate error handlers) intact

Files requiring changes:
- `client/src/classes/Tank.js` — 1 line (position debug)
- `client/src/components/JupiterSwap.js` — 2 lines (swap success/init)
- `client/src/index.js` — 1 line (service worker registered)
- `client/src/scenes/main/index.js` — 8 lines (turn/HP debugging)
- `client/src/screens/BattleScreen.js` — 1 line (escrow signed)
- `client/src/wallet/JupiterMobileAdapter.js` — 1 line (mobile not available)
- `client/src/wallet/WalletContext.js` — 6 lines (tx sent/confirmed/auth)

All 20 are debug tracing. console.warn and console.error are retained (they signal real errors).

#### Option B: babel-plugin-transform-remove-console via config-overrides.js

**Critical constraint:** CRA's app babel-loader sets `babelrc: false, configFile: false` — a
`.babelrc` file at project root is NOT read. The plugin must be injected by modifying the
babel-loader options in webpack config directly. The `injectBabelPlugin` helper from
react-app-rewired 2.x is deprecated (it throws a deprecation error).

The correct approach for react-app-rewired 2.x without customize-cra is to traverse the webpack
rule tree manually:

```javascript
// config-overrides.js (additions to existing override function)
module.exports = function override(config, env) {
    // ... existing polyfill config ...

    if (env === 'production') {
        // CRA webpack structure: module.rules[n].oneOf contains the babel-loader
        const oneOf = config.module.rules.find(r => r.oneOf);
        if (oneOf) {
            const babelRule = oneOf.oneOf.find(
                r => r.loader && r.loader.includes('babel-loader') && r.include
            );
            if (babelRule && babelRule.options && babelRule.options.plugins) {
                babelRule.options.plugins.push(
                    ['transform-remove-console', { exclude: ['error', 'warn'] }]
                );
            }
        }
    }

    // ... rest of existing config ...
    return config;
};
```

The `exclude: ['error', 'warn']` preserves error handlers, removing only `console.log`,
`console.info`, and `console.debug`.

#### Option C: Terser `drop_console` via config-overrides.js

No new npm dependency. Terser-webpack-plugin is already used by CRA internally.
However, `drop_console` strips ALL console methods (including error/warn) and operates at
minification stage, not source stage, so the grep verification step is still meaningful.

```javascript
// In config-overrides.js override function, for production:
if (env === 'production' && config.optimization && config.optimization.minimizer) {
    const TerserPlugin = require('terser-webpack-plugin');
    config.optimization.minimizer = config.optimization.minimizer.map(plugin => {
        if (plugin instanceof TerserPlugin) {
            plugin.options.terserOptions = plugin.options.terserOptions || {};
            plugin.options.terserOptions.compress = plugin.options.terserOptions.compress || {};
            plugin.options.terserOptions.compress.drop_console = true;
        }
        return plugin;
    });
}
```

**Downside:** This also removes console.warn and console.error. If those are needed in
production for debugging wallet/escrow errors, this is the wrong choice.

### Anti-Patterns to Avoid

- **Using `injectBabelPlugin` from react-app-rewired 2.x:** This is deprecated and throws a
  runtime error. Use manual rule traversal or customize-cra instead.
- **Placing `.babelrc` at project root and expecting CRA to use it:** CRA sets `babelrc: false`
  and `configFile: false` for the app babel-loader. The file is silently ignored.
- **Using `customize-cra` without installing it:** It is not currently installed. Adding it
  requires `npm install --save-dev customize-cra`.
- **Setting GENERATE_SOURCEMAP=false in the build script:** This works (`GENERATE_SOURCEMAP=false npm run build`) but is fragile. The `.env.production` file approach is declarative and applies
  consistently to Vercel and CI builds.
- **Rate-limiting the CSP report endpoint:** The endpoint does not need to be behind
  `requireAdminKey` but should have its own basic rate limit to prevent log flooding.
  The existing `httpLimiter` middleware (100 req/15min) already covers all routes, so no extra
  rate limiting is needed unless reports are frequent.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stripping console.log at build time | Custom webpack plugin | babel-plugin-transform-remove-console OR Terser drop_console | Both are production-tested; custom solutions miss edge cases (template literals, method aliases) |
| CSP violation parsing | Custom body-parser type handling | `express.json({ type: 'application/csp-report' })` | Browsers send a non-standard Content-Type; express.json with type option handles it |
| Source map control | Webpack devtool override in config-overrides | GENERATE_SOURCEMAP env var | CRA's env var controls ALL source map settings (JS, CSS, source-map-loader) simultaneously; devtool override misses CSS maps |

**Key insight:** All three SEC requirements have one-liner or near-one-liner solutions using the
existing tooling. Avoid over-engineering.

## Common Pitfalls

### Pitfall 1: babelrc: false breaks .babelrc approach
**What goes wrong:** Developer adds `.babelrc` with the transform-remove-console plugin. Build runs
without error but console.log still appears in production bundle.
**Why it happens:** CRA explicitly sets `babelrc: false` and `configFile: false` in the
babel-loader options for the app source. This intentionally prevents external babel config files
from being read.
**How to avoid:** Always inject babel plugins via config-overrides.js by traversing
`config.module.rules.find(r => r.oneOf).oneOf`.
**Warning signs:** No build error when `.babelrc` is malformed.

### Pitfall 2: report-uri endpoint needs application/csp-report content-type
**What goes wrong:** Express route uses `express.json()` without the type option. Browser POST
arrives with Content-Type `application/csp-report` instead of `application/json`. Express rejects
the body as non-JSON, `req.body` is empty, and violations are silently swallowed.
**Why it happens:** Browsers intentionally send a non-standard Content-Type for CSP reports.
**How to avoid:** Use `express.json({ type: 'application/csp-report' })` as the body-parser
middleware on the route.
**Warning signs:** Route handler fires but `req.body` is `{}`.

### Pitfall 3: .map files present in Vercel deploy despite .env.production
**What goes wrong:** .env.production is in .gitignore or not committed. Vercel build runs without
GENERATE_SOURCEMAP=false and generates .map files.
**Why it happens:** CRA's `.env.production` is typically committed (unlike `.env.local`). If
omitted from git, Vercel won't have it. Alternatively, the Vercel project dashboard environment
variables may override it.
**How to avoid:** Commit `.env.production` (no secrets, just build flags). Also set
`GENERATE_SOURCEMAP=false` in Vercel project settings as a redundant safeguard.
**Warning signs:** After deploy, check `https://solshot.gg/static/js/*.map` — should return 404.

### Pitfall 4: Terser drop_console removes console.error from wallet/escrow code
**What goes wrong:** If Terser `drop_console` is chosen (Option C), it removes ALL console methods
including `console.error` calls in WalletContext.js and escrow code that serve as observable
error signals for users debugging wallet issues in devtools.
**Why it happens:** `drop_console: true` is a blunt instrument — it strips everything.
**How to avoid:** Use babel-plugin-transform-remove-console with `exclude: ['error', 'warn']`,
or use manual deletion which gives per-line control.
**Warning signs:** After build, attempt to trigger a wallet error — no console output at all.

### Pitfall 5: CSP report-uri causes false-positive violations
**What goes wrong:** The /api/csp-report endpoint is flooded with reports from browser extensions,
wallet adapter scripts, or Jupiter plugin loading.
**Why it happens:** Third-party scripts that run in the page context trigger CSP violations
that aren't caused by the app itself.
**How to avoid:** Log violations but don't alert on every one. Consider logging at debug level
and only alerting if a specific known-good directive is violated. This is operationally relevant
but out of scope for Phase 13's three success criteria.

## Code Examples

### SEC-01: Source Map Disable

```bash
# Source: CRA official docs, react-scripts config/webpack.config.js line 42
# File: client/.env.production (commit this file)
GENERATE_SOURCEMAP=false
INLINE_RUNTIME_CHUNK=false
REACT_APP_SERVER_URL=https://solshot-server.onrender.com
REACT_APP_SOLANA_NETWORK=mainnet-beta
REACT_APP_ESCROW_PROGRAM_ID=CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD
REACT_APP_SHOT_TOKEN_MINT=4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd
```

**Verification:**
```bash
cd client && GENERATE_SOURCEMAP=false npm run build
ls build/static/js/*.map  # Should list no files (or exit 1 = no matches = pass)
```

### SEC-02: CSP report-uri + endpoint

```javascript
// Source: MDN report-uri docs, helmet docs
// server/index.js — add to existing contentSecurityPolicy.directives:
contentSecurityPolicy: {
    directives: {
        // ... existing directives ...
        reportUri: ['/api/csp-report'],
    },
}

// server/index.js — new route (add after existing routes):
app.post('/api/csp-report', express.json({ type: 'application/csp-report' }), (req, res) => {
    const report = req.body['csp-report'] || req.body;
    console.error('[CSP Violation]', JSON.stringify({
        directive: report['violated-directive'],
        blocked: report['blocked-uri'],
        document: report['document-uri'],
    }));
    res.status(204).end();
});
```

### SEC-03: Console.log removal (Manual approach — recommended)

Exact files and line numbers to delete/comment (current build, active lines only):

- `client/src/classes/Tank.js:202` — `console.log('[SolShot] Tank...')`
- `client/src/components/JupiterSwap.js:108` — `console.log('[JupiterSwap] Swap success:'`
- `client/src/components/JupiterSwap.js:125` — `console.log('[JupiterSwap] Initializing...'`
- `client/src/index.js:19` — `console.log('[SolShot] Service worker registered:'`
- `client/src/scenes/main/index.js:305` — `console.log('[SolShot] checkSwitchTurn: waiting...'`
- `client/src/scenes/main/index.js:309` — `console.log('[SolShot] checkSwitchTurn: applying...'`
- `client/src/scenes/main/index.js:489` — `console.log('[SolShot] turnResult received:'`
- `client/src/scenes/main/index.js:527` — `console.log('[SolShot] applyTurnResult: impact='`
- `client/src/scenes/main/index.js:532` — `console.log('[SolShot] applyTurnResult: terrainUpdate'`
- `client/src/scenes/main/index.js:537` — `console.log('[SolShot] applyTurnResult: NO terrainUpdate'`
- `client/src/scenes/main/index.js:549` — `console.log('[SolShot] HP update: '`
- `client/src/scenes/main/index.js:565` — `console.log('[SolShot] HP update (fallback):'`
- `client/src/screens/BattleScreen.js:133` — `console.log('[Battle] Escrow deposit signed:'`
- `client/src/wallet/JupiterMobileAdapter.js:29` — `console.log('[JupiterMobileAdapter] Jupiter Mobile not available'`
- `client/src/wallet/WalletContext.js:271` — `console.log('[SolShot] Escrow deposit TX sent:'`
- `client/src/wallet/WalletContext.js:275` — `console.log('[SolShot] Escrow deposit confirmed:'`
- `client/src/wallet/WalletContext.js:325` — `console.log('[SolShot] SHOT burn TX sent:'`
- `client/src/wallet/WalletContext.js:329` — `console.log('[SolShot] SHOT burn confirmed:'`
- `client/src/wallet/WalletContext.js:345` — `console.log('[SolShot] Auth confirmed by server'`
- `client/src/wallet/WalletContext.js:371` — `console.log('[SolShot] Auto-authenticating wallet...'`

**Verification grep (should return 0 lines):**
```bash
grep -r "console\.log" client/src/ --include="*.js" | grep -v "^\s*//" | grep -v "//console"
```

### SEC-03: Console.log removal (babel-plugin approach — automated)

```bash
cd client && npm install --save-dev babel-plugin-transform-remove-console
```

```javascript
// config-overrides.js — add in the override function body, after existing code:
if (env === 'production') {
    const oneOf = config.module.rules.find(r => r.oneOf);
    if (oneOf) {
        const babelRule = oneOf.oneOf.find(
            r => r.loader && r.loader.includes('babel-loader') && r.include
        );
        if (babelRule && babelRule.options) {
            babelRule.options.plugins = babelRule.options.plugins || [];
            babelRule.options.plugins.push(
                ['transform-remove-console', { exclude: ['error', 'warn'] }]
            );
        }
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `injectBabelPlugin` in react-app-rewired | Manual webpack rule traversal or customize-cra | react-app-rewired 2.0 | `injectBabelPlugin` is deprecated and throws; manual traversal is required |
| `.babelrc` for CRA projects | babel.config.js or plugin injection via config-overrides | CRA 4+ | CRA sets `babelrc: false` for app source; .babelrc files are silently ignored |
| `report-uri` only | Both `report-uri` + `report-to` | CSP Level 3 / 2023+ | Firefox still lacks report-to support as of 2025; use both for coverage |
| Source maps always on | `GENERATE_SOURCEMAP=false` env var | CRA 2.0+ | Directly supported by react-scripts; no webpack config change needed |

**Deprecated/outdated:**
- `injectBabelPlugin`: Throws deprecation error in react-app-rewired 2.x — do not use
- `.babelrc` file at CRA project root: Silently ignored for app source
- `getBabelLoader` helper: Deprecated as of react-app-rewired 2.0

## Open Questions

1. **Should `.env.production` be committed to git?**
   - What we know: It contains no secrets (all REACT_APP_* values are public; GENERATE_SOURCEMAP is a build flag)
   - What's unclear: Current `.gitignore` policy for env files
   - Recommendation: Commit it. CRA convention is that `.env.production` is committed while `.env.local` is not. Verify with `git check-ignore client/.env.production`.

2. **Does Vercel's build command need updating to pass GENERATE_SOURCEMAP?**
   - What we know: Vercel reads `client/.env.production` during build if it's present in the repo. It also reads project-level env vars set in the Vercel dashboard.
   - What's unclear: Whether the Vercel project dashboard has any conflicting env vars set.
   - Recommendation: Set `GENERATE_SOURCEMAP=false` in both `.env.production` AND Vercel dashboard for belt-and-suspenders.

3. **Should console.warn/error in wallet/escrow be preserved?**
   - What we know: There are 25 console.warn/console.error calls in client src; most are error handlers in WalletContext.js (TX validation failed, auth error, balance fetch error).
   - What's unclear: The phase requirement says "console.log statements" specifically, not all console methods.
   - Recommendation: Remove only console.log. Preserve console.warn and console.error — they provide observable error signals for users debugging wallet/escrow issues. The SEC-03 criterion says "No console.log statements execute", not all console methods.

4. **Should server-side console.log be stripped?**
   - What we know: SEC-03 says "verified by searching source and checking browser console" — browser console is client-side only. Server has 75+ console.log calls (mostly structured debug logging).
   - What's unclear: Phase intent.
   - Recommendation: Server console.log is entirely out of scope for Phase 13. Server stdout is not exposed to browsers. These logs are operational infrastructure.

## Sources

### Primary (HIGH confidence)
- CRA `react-scripts/config/webpack.config.js` line 42 — `GENERATE_SOURCEMAP` env var is read directly
- CRA `react-scripts/config/env.js` lines 26-34 — `.env.production` file loading order confirmed
- CRA webpack.config.js lines 433-434 — `babelrc: false, configFile: false` confirmed for app source
- MDN `Content-Security-Policy/report-uri` — POST format, deprecation status, dual-directive approach
- helmet 8.1.0 installed — `contentSecurityPolicy.directives.reportUri` is camelCase key

### Secondary (MEDIUM confidence)
- react-app-rewired GitHub issue #180 — `injectBabelPlugin` usage (confirmed deprecated in 2.x by checking installed index.js)
- babeljs.io/docs/babel-plugin-transform-remove-console — `exclude` option confirmed
- Babel plugin npm registry — latest version 6.9.4

### Tertiary (LOW confidence)
- WebSearch results on customize-cra `addBabelPlugin` — verified not installed, not required
- WebSearch on Terser `drop_console` — confirmed available in TerserPlugin, not verified against this exact CRA version

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are installed and their behavior verified by reading source
- Architecture patterns: HIGH — verified by reading CRA webpack.config.js source directly
- Pitfalls: HIGH — confirmed by reading actual CRA babel-loader config (babelrc: false)

**Research date:** 2026-02-25
**Valid until:** 2026-04-25 (stable tooling — CRA 5.x, helmet 8.x, react-app-rewired 2.x)
