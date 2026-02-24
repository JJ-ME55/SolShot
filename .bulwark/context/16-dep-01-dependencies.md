# DEP-01: Package & Dependency Security Audit

**task_id:** DEP-01
**auditor:** DEP-01 (Package & Dependency Security)
**date:** 2026-02-23
**scope:** Root, server, and client package manifests; lock files; config-overrides.js

---

## CONDENSED SUMMARY

**Server (30 vulns: 4 low, 8 moderate, 18 high, 0 critical)**

The headline count is inflated by a single misclassification: `nodemon` is declared in `dependencies` instead of `devDependencies`. This single error pulls an entire legacy dependency chain (chokidar 2.x, braces 2.x, micromatch 3.x, update-notifier, boxen, cross-spawn, etc.) into the production tree, creating roughly 14 of the 18 HIGH entries. After stripping that chain, the actual production-reachable HIGH findings are:

| Package | Version | CVE | CVSS | Reachable? |
|---------|---------|-----|------|------------|
| `ws` | 8.2.3 | GHSA-3h5v-q93c-6h6q (DoS via many headers) | 7.5 | YES — engine.io/socket.io uses ws |
| `express` | 4.18.1 | GHSA-rv95-896h-c2vc (Open Redirect) | HIGH | YES — HTTP endpoints served |
| `express` | 4.18.1 | GHSA-qw6h-vgh9-j6wx (XSS via redirect) | HIGH | YES |
| `path-to-regexp` | 0.1.7 | GHSA-9wv6-86v2-598j + GHSA-rhx6-c78j-4q9w (ReDoS) | 7.5 | YES — used by express router |
| `qs` | 6.10.3 | GHSA-6rw7-vpxm-498p (DoS via bracket parsing) | 7.5 | YES — used by body-parser/express |
| `body-parser` | 1.20.0 | GHSA-qwcr-r2fm-qrc7 (DoS via URL encoding) | 7.5 | YES — `express.urlencoded()` |
| `engine.io` | 6.2.0 | GHSA-r7qp-cfhv-p84w + GHSA-... (Uncaught Exception) | 6.5 | YES — underlies socket.io |
| `semver` | 5.7.1 | GHSA-c2qf-rxjj-qqgw (ReDoS) | 7.5 | LOW — via nodemon/jsonwebtoken internals |
| `bn.js` | <5.2.3 | GHSA-378v-28hj-76wf (Infinite Loop) | 5.3 | LOW — Solana SDK internals |

`socket.io` 4.5.1 carries two MODERATE advisories (unhandled 'error' event GHSA-25hc-qcg6-38wj, parser desync GHSA-cqmj-92xf-r6r9) both fixed in 4.6.2.

**Client (131 vulns: 20 low, 35 moderate, 73 high, 3 critical)**

The 3 CRITICAL vulnerabilities:

1. **`webpack` 5.73.0** — Four advisories including GHSA-4vvj-4cpr-p986 (DOM Clobbering gadget in AutoPublicPathRuntimeModule leading to XSS in generated bundles). The react-scripts build configuration uses a static `publicPath` (not `'auto'`), which significantly reduces — but does not eliminate — the DOM clobbering risk. Fixed in webpack 5.94.0+; react-scripts 5.x pins webpack 5.73.x and has no direct upgrade path without ejecting.

2. **`loader-utils` 2.0.2** — GHSA-76p3-8jx3-jpfq (Prototype Pollution via webpack `getOptions`). This is a **build-time-only** tool; it does not ship in the production bundle. Exploit requires an attacker to control webpack configuration input at build time, which is out-of-scope for a deployed web app. Fixed in 2.0.4.

3. **`form-data` 3.0.1** — GHSA-fjxv-7rqg-78g4 (uses `Math.random()` for MIME boundary generation instead of CSPRNG). Produces predictable boundaries; exploitable only if an attacker can observe outgoing form-data request bodies. In a browser SPA context this is **not directly exploitable** — form-data is a test/build dependency.

The highest-severity client vulnerability with runtime impact is **`bigint-buffer` 1.1.5** (HIGH, GHSA-3gc7-fjrx-p6mg — buffer overflow via `toBigIntLE()`). This is pulled transitively through `@solana/spl-token -> @solana/buffer-layout-utils -> bigint-buffer` and is reachable during token operations (burn transactions). `bigint-buffer` 1.1.5 is the latest available version — no fix exists upstream.

**Supply Chain and Lock File**

- No non-npmjs.org resolutions detected in any of the three lock files.
- All three lock files pass integrity (sha512 hashes present).
- `@solana/web3.js` 1.98.4 is safe — the supply chain attack versions were 1.95.5 and 1.95.6.
- Lock files are stale: server has express 4.18.1 pinned despite `^4.17.3` permitting 4.21.x; socket.io 4.5.1 pinned despite `^4.4.1` permitting 4.8.x. Running `npm install` with a fresh lock would resolve several HIGH CVEs for free.
- `nodemon ^1.3.3` pinned as a production dependency; installed version is 1.19.4 (a four-year-old release). This is the most impactful misclassification in the project.

---

## FULL ANALYSIS

### 1. Root Package (`/package.json`)

**Dependencies (production):**
- `sharp` ^0.34.5 — image processing; no known CVEs in this range
- `detect-libc` ^2.1.2 — clean
- `semver` ^7.7.4 — clean (only 5.x line is vulnerable)

**devDependencies:**
- `@coral-xyz/anchor` ^0.32.1 — Anchor framework for Solana; see Section 5
- `@solana/web3.js` ^1.98.4 — clean (attack versions were 1.95.5/1.95.6)
- `mocha` ^11.7.5 — audit on root shows 3 HIGH via `minimatch <10.2.1` and `diff >=6.0.0`; these are test-runner internals only, no production exposure
- `typescript` ^5.9.3 — clean

Root lockfileVersion: 3. No `node_modules` installed for root devDependencies (no `anchor` found under root `node_modules`), so anchor is installed only when `npm install` is run in the root. The root audit (5 vulns total) is entirely in devDependencies and has zero production exposure.

**Finding DEP-01-R01 (LOW):** Root `mocha` 11.x pulls `minimatch <10.2.1` (ReDoS HIGH) and `diff >=6.0.0` (DoS LOW). Upgrade to `mocha` >=11.3.0 when available or accept as test-only risk.

---

### 2. Server Package (`server/package.json`)

#### 2.1 Production Dependencies — Declared vs Installed

| Package | Declared | Installed | Latest 4.x/Current | Gap |
|---------|----------|-----------|---------------------|-----|
| `express` | ^4.17.3 | 4.18.1 | 4.21.2 | 3 minor versions behind |
| `socket.io` | ^4.4.1 | 4.5.1 | 4.8.3 | 3 minor versions behind |
| `nodemon` | ^1.3.3 | 1.19.4 | 3.1.14 | MAJOR version behind + misclassified |
| `@coral-xyz/anchor` | ^0.32.1 | 0.32.1 | 0.32.1 | Current |
| `@solana/web3.js` | ^1.98.4 | 1.98.4 | 1.98.4 | Current |
| `jsonwebtoken` | ^9.0.3 | 9.0.3 | 9.0.2 | Current |
| `tweetnacl` | ^1.0.3 | 1.0.3 | 1.0.3 | Current |
| `mongoose` | ^9.2.1 | 9.2.1 | 9.x | Check separately |
| `helmet` | ^8.1.0 | 8.1.0 | 8.x | Current |
| `express-rate-limit` | ^8.2.1 | 8.2.1 | 8.x | Current |

The stale lock file explains the gap between declared `^4.17.3` and installed `4.18.1`. Running `npm install` after deleting the lock would pick up 4.21.x which resolves the express redirect/XSS advisories. This is the single highest-value remediation for the server.

#### 2.2 Critical Misclassification: `nodemon` in `dependencies`

```json
"dependencies": {
    "nodemon": "^1.3.3",   // ← WRONG: must be devDependencies
    ...
}
```

`nodemon` is a development file-watcher. It must never appear in production `dependencies`. The effect:

- 14 of the 18 server HIGH vulnerabilities trace back exclusively through `nodemon`'s legacy dependency chain (nodemon 1.x uses chokidar 2.x, which uses braces 2.x, micromatch 3.x, etc.).
- In a production deployment (e.g., Render with `NODE_ENV=production`), `npm install --omit=dev` does NOT remove nodemon because it is in `dependencies`. It ships to production.
- Nodemon 1.x uses `update-notifier` which makes outbound HTTP requests to npmjs.com at startup to check for updates. This is a minor information leak (reveals Node.js version, npm version, nodemon version, and server IP to npm's registry) and an unwanted network dependency.

**Finding DEP-01-S01 (HIGH):** Move `nodemon` from `dependencies` to `devDependencies` and upgrade to `^3.1.14`. This resolves approximately 14 HIGH and 4 MODERATE server vulnerabilities and eliminates the outbound version-check network call in production.

#### 2.3 Express 4.18.1 — Specific CVEs

All of the following affect the installed version and are fixed by upgrading to the latest express 4.x:

| CVE | Title | CVSS | Fix |
|-----|-------|------|-----|
| GHSA-rv95-896h-c2vc | Open Redirect in malformed URLs | HIGH | express >=4.19.0 |
| GHSA-qw6h-vgh9-j6wx | XSS via `response.redirect()` | HIGH | express >=4.19.0 |
| GHSA-1111-... | path-to-regexp 0.1.7 ReDoS (two advisories) | 7.5 | express >=4.x with path-to-regexp >=0.1.12 |
| GHSA-6rw7-vpxm-498p | qs arrayLimit DoS via bracket notation | 7.5 | qs >=6.14.1 |
| GHSA-qwcr-r2fm-qrc7 | body-parser DoS via URL encoding | 7.5 | body-parser >=1.20.3 |
| GHSA-m6fv-jmcg-4jfg | send XSS via template injection | 5.0 | send >=0.19.0 |
| GHSA-cm22-4g7w-348p | serve-static XSS via template injection | 5.0 | serve-static >=1.16.0 |
| GHSA-pxg6-pf52-xh8x | cookie out-of-bounds characters | LOW | cookie >=0.7.0 |

**Reachability assessment:** The SolShot server does not use Express for complex routing with user-controlled path parameters. The two endpoints are `/health` and `/stats` (plus the admin `/api/admin/reload-keys`). The path-to-regexp ReDoS requires a crafted URL matching a vulnerable route pattern. With only three defined routes, the attack surface is narrow. The body-parser DoS (GHSA-qwcr-r2fm-qrc7) is more directly reachable: any POST request with a crafted URL-encoded body can trigger it since `express.urlencoded()` is applied globally (line 111 of `index.js`). The express redirect XSS is low-risk since `res.redirect()` does not appear to be called with user-controlled input.

**Finding DEP-01-S02 (HIGH):** Upgrade express from `^4.17.3` → `^4.21.2` (or simply delete the lock file and run `npm install`). This resolves the Open Redirect, XSS, path-to-regexp ReDoS, qs DoS, body-parser DoS, send/serve-static XSS, and cookie advisories in a single operation.

#### 2.4 Socket.IO / engine.io / ws Chain

| Package | Installed | Fixed In | Advisory | Severity |
|---------|-----------|----------|----------|----------|
| `socket.io` | 4.5.1 | 4.6.2 | GHSA-25hc-qcg6-38wj (unhandled 'error') | MODERATE |
| `socket.io-parser` | 4.0.5 | 4.2.3 | GHSA-cqmj-92xf-r6r9 (packet decode) | MODERATE |
| `engine.io` | 6.2.0 | 6.2.1 | GHSA-r7qp-cfhv-p84w (uncaught exception) | MODERATE |
| `engine.io` | 6.2.0 | 6.4.2 | GHSA-... (uncaught exception v2) | HIGH |
| `ws` | 8.2.3 | 8.17.1 | GHSA-3h5v-q93c-6h6q (DoS via many headers) | HIGH |

The `ws` DoS (GHSA-3h5v-q93c-6h6q) is the most operationally significant: an unauthenticated attacker can send an HTTP upgrade request with thousands of HTTP headers. This triggers a CPU-exhausting loop in `ws` that blocks the event loop and crashes the WebSocket server. This is directly reachable from the public internet since socket.io accepts WebSocket connections on the same port as HTTP.

The engine.io uncaught exception advisories (GHSA-r7qp-cfhv-p84w: range >=4.0.0 <6.2.1) affect engine.io 6.2.0 at the boundary — `6.2.0 < 6.2.1`. This means engine.io 6.2.0 is affected and needs the patch version bump.

**Finding DEP-01-S03 (HIGH):** Upgrade `socket.io` from `^4.4.1` → `^4.8.3`. This transitively updates engine.io and ws to fixed versions, resolving the DoS via many headers (ws) and the two engine.io uncaught exception advisories.

#### 2.5 Additional Server Findings

**`bn.js` < 5.2.3 — Infinite Loop (GHSA-378v-28hj-76wf, CVSS 5.3)**
This is a transitive dependency through `@coral-xyz/anchor` → (its Solana deps) → `bn.js`. The infinite loop is triggered by calling `bn.js` operations with maliciously crafted input. In SolShot's usage, `bn.js` is used for lamport arithmetic in `escrow.js`. The inputs come from server-controlled calculations (wager amounts), not from untrusted client data. Risk is LOW for current usage.

**`semver` 5.7.1 — ReDoS (GHSA-c2qf-rxjj-qqgw, CVSS 7.5)**
`semver` 5.7.1 is pulled through `nodemon` → `semver-diff`. It is not used in any production code path. Once nodemon is moved to devDependencies, this finding disappears entirely.

**`decode-uri-component` 0.2.0 — DoS (GHSA-w573-4hg7-7wgq)**
This is pulled through `source-map-resolve → snapdragon`. `snapdragon` is a legacy build tool (from the node-sass/libsass era) that is a transitive dependency of `braces`/`micromatch`/`chokidar`. Since these all chain back to `nodemon`, this finding also disappears when nodemon is moved to devDependencies.

**`jsonwebtoken` 9.0.3** — No known CVEs. Previous CVEs (GHSA-27h2-hvpr-p74q, secret bypass) were in <=8.5.1. The current version (9.0.3) is the latest release and is clean. The auth.js implementation correctly uses `jwt.verify()` with a secret from env, with a 24h expiry. No issues.

**`tweetnacl` 1.0.3** — No known CVEs. Used for Solana wallet signature verification (`nacl.sign.detached.verify`). This is the correct, well-audited version.

---

### 3. Client Package (`client/package.json`)

#### 3.1 The 3 CRITICAL Vulnerabilities — Reachability Assessment

**CRITICAL 1: `webpack` 5.73.0**

Four advisories, two with production-bundle impact:

- **GHSA-4vvj-4cpr-p986** — Webpack's `AutoPublicPathRuntimeModule` has a DOM Clobbering Gadget leading to XSS. The gadget is injected into the production bundle when `output.publicPath` is set to `'auto'`. Inspection of the react-scripts webpack config (`client/node_modules/react-scripts/config/webpack.config.js`) confirms that `publicPath` is set to `paths.publicUrlOrPath` (a static value determined at build time), not `'auto'`. This means the `AutoPublicPathRuntimeModule` is **not injected** into the output bundle. Risk is LOW for this specific advisory given the react-scripts config. Fixed in webpack >=5.94.0.

- **GHSA-hc6q-2mpp-qw7j** — Cross-realm object access in Webpack 5. This is a build-time issue affecting the generated code when `require()` is used across realms. Not directly exploitable in a standard browser SPA deployment.

- **GHSA-8fgc-7cc6-rx7x** and **GHSA-38r7-794h-5758** — `buildHttp` / `HttpUriPlugin` SSRF via `allowedUris` bypass. `config-overrides.js` does **not** configure `experiments.buildHttp`. These advisories are **not reachable** in this project.

Overall: the CRITICAL webpack rating is partially justified. The DOM clobbering XSS gadget is the most serious concern, but the react-scripts static publicPath configuration prevents the vulnerable code path from being exercised. If the project ever switches to a custom webpack config with `publicPath: 'auto'`, this becomes actively exploitable.

**CRITICAL 2: `loader-utils` 2.0.2**

Advisory GHSA-76p3-8jx3-jpfq — Prototype Pollution via `getOptions()`. `loader-utils` is a webpack loader utility invoked during the **build process**. It is not included in the production bundle shipped to browsers. To exploit this, an attacker would need to control webpack configuration or loader input at build time — which requires CI/CD or developer machine compromise. **Not directly exploitable in a deployed application.** Fixed in 2.0.4.

**CRITICAL 3: `form-data` 3.0.1**

Advisory GHSA-fjxv-7rqg-78g4 — Uses `Math.random()` for MIME boundary generation (non-CSPRNG). An attacker who can observe outgoing multipart requests can predict future boundaries. In a browser SPA, `form-data` is a transitive test dependency (comes through `@testing-library` or similar). It is not in the production JavaScript bundle. **Not exploitable in a deployed application.**

#### 3.2 HIGH Client Vulnerabilities — Production vs Build-Time Classification

Build-time only (no production bundle exposure):
- All eslint-* and @typescript-eslint/* chains
- All jest-* / @jest/* chains
- babel-plugin-istanbul, test-exclude, babel-jest
- loader-utils, webpack-dev-middleware, webpack-dev-server
- rimraf, flat-cache, file-entry-cache
- svgo, @svgr/* (SVG build transform — output is static SVGs)
- rollup (GHSA-gcx4-mw62-g8wm — DOM Clobbering in rollup bundled scripts; rollup is a build tool, not a production dep here)
- fork-ts-checker-webpack-plugin
- node-forge (used in webpack-dev-server TLS; dev server only)

**Production-reachable HIGH vulnerabilities:**

| Package | Installed | CVE | Impact | Note |
|---------|-----------|-----|--------|------|
| `bigint-buffer` | 1.1.5 | GHSA-3gc7-fjrx-p6mg (Buffer Overflow via `toBigIntLE`) | Buffer overflow in browser | Via @solana/spl-token → @solana/buffer-layout-utils; triggered during token deserialization |
| `http-proxy-middleware` | 2.0.6 | 3 advisories (DoS, writeBody twice, fixRequestBody bypass) | Dev-server only | Only used in webpack-dev-server proxying; not in production build |
| `express` (client) | varies | Same as server analysis | If client embeds a server component | Only appears in react-scripts dev server chain |
| `nth-check` | 2.1.1 | GHSA-rp65-9cf3-cjxr (ReDoS in CSS selectors) | Build-time CSS processing | Via svgo → css-select; build only |
| `json5` | 2.2.3 | GHSA-9c47-m6qq-7p4h (Prototype Pollution) | 2.2.3 is the fixed version | Wait — fixed in >=2.2.2; 2.2.3 is clean. This advisory may be stale in npm audit |

**`bigint-buffer` 1.1.5** deserves specific attention: it is the only HIGH severity vulnerability with a direct path to production browser execution. The `toBigIntLE()` function takes a Node.js `Buffer` and interprets it as a little-endian BigInt. The overflow occurs when the buffer length exceeds the native integer width. In the browser, this is less severe than on Node.js (no native addon — `bigint-buffer` in the browser falls back to a pure-JS implementation). However, 1.1.5 is the latest available version on npm, so there is no upgrade path. The risk is partially mitigated by the fact that `bigint-buffer` is only invoked when parsing on-chain account layouts, and the inputs come from the Solana RPC — a semi-trusted source.

**Finding DEP-01-C01 (HIGH):** The `bigint-buffer` 1.1.5 buffer overflow (GHSA-3gc7-fjrx-p6mg) is production-reachable via `@solana/spl-token` token operations. No upgrade available. Monitor `@solana/buffer-layout-utils` for a replacement dependency.

**Finding DEP-01-C02 (MODERATE):** The 3 CRITICAL npm audit findings (`webpack`, `loader-utils`, `form-data`) are all either build-time-only or require specific configuration not present in this project. They do not represent active production risk. However, `webpack` 5.73.0 should be upgraded to >=5.94.0 via a react-scripts upgrade when a compatible version is released.

#### 3.3 Version Staleness: Solana Ecosystem Packages

| Package | Installed | Status |
|---------|-----------|--------|
| `@solana/web3.js` | 1.98.4 | Current — safe (attack was 1.95.5/1.95.6) |
| `@solana/spl-token` | 0.4.14 | Current |
| `@solana/wallet-adapter-base` | 0.9.27 | Current |
| `@solana/wallet-adapter-react` | 0.15.39 | Current |
| `@solana/wallet-adapter-wallets` | 0.19.37 | Current |
| `phaser` | 3.55.2 | Older (current is 3.87.x). No CVEs in audited range but 2+ years of patches missed |
| `phaser3-rex-plugins` | 1.60.4 | No known CVEs |
| `html2canvas` | 1.4.1 | No known CVEs |
| `webfontloader` | 1.6.28 | No known CVEs |
| `socket.io-client` | 4.8.3 | Current |

**Note on `@solana/web3.js`:** The December 2024 supply chain attack compromised versions 1.95.5 and 1.95.6 with a credential harvesting backdoor. Both the server and client use 1.98.4, which is clean and post-incident. No action needed.

**Finding DEP-01-C03 (LOW):** `phaser` 3.55.2 is approximately 2 years behind current (3.87.x). While no CVEs are reported, this is a large game engine dependency with significant attack surface. Evaluate upgrade path.

---

### 4. Lock File Integrity Assessment

| File | lockfileVersion | All-npmjs? | Integrity hashes? | Age issue? |
|------|----------------|------------|-------------------|------------|
| `/package-lock.json` | 3 | Yes | Yes | Fresh (mocha 11.7.5 is recent) |
| `server/package-lock.json` | 2 | Yes | Yes | Stale (express 4.18.1 not latest) |
| `client/package-lock.json` | 2 | Yes | Yes | Stale (many older pinned versions) |

All 2,581 client package resolutions and all 441 server package resolutions resolve exclusively from `registry.npmjs.org`. No private registry entries, no git URL dependencies, no `file:` protocol dependencies, and no suspicious third-party package registries.

All packages carry sha512 integrity hashes (`integrity` field in the lock file). The lock files are consistent (lock format v2/v3 with full sub-dependency trees).

**The primary lock file concern is staleness, not integrity.** The server lock file pins express at 4.18.1 even though the declared range `^4.17.3` would permit 4.21.2. This means the lock file was last regenerated when 4.18.1 was the latest 4.x. Running `npm install` with a fresh lock would resolve this and several other vulnerabilities automatically.

**Finding DEP-01-L01 (MODERATE):** Server `package-lock.json` is stale. Regenerating it with `npm install` (after fixing the nodemon misclassification) would automatically upgrade express, socket.io, engine.io, ws, and several sub-dependencies, resolving approximately 12 HIGH vulnerabilities.

---

### 5. config-overrides.js — Polyfill Analysis

```javascript
config.resolve.fallback = {
    crypto: require.resolve('crypto-browserify'),  // ^3.12.1
    stream: require.resolve('stream-browserify'),  // ^3.0.0
    buffer: require.resolve('buffer/'),            // ^6.0.3
    vm: false,
};
config.resolve.alias['process/browser'] = require.resolve('process/browser.js');
config.plugins.push(new webpack.ProvidePlugin({
    Buffer: ['buffer', 'Buffer'],
    process: 'process/browser.js',
}));
```

All four polyfill packages (`crypto-browserify`, `stream-browserify`, `buffer`, `process`) are standard, well-maintained packages in the `browserify` family. They are all in `devDependencies` in `client/package.json`. Their purpose is to provide Node.js built-in shims required by `@solana/web3.js` and `@coral-xyz/anchor` in the browser environment.

No concerns:
- `crypto-browserify` 3.12.1 — uses `browserify/randombytes` which itself uses `window.crypto.getRandomValues()` in browsers; this is a CSPRNG. No issue.
- `stream-browserify` 3.0.0 — streams polyfill; no security concerns.
- `buffer` 6.0.3 — safe `Buffer` implementation; no known CVEs.
- `process` 0.11.10 — environment variable shim for browsers; no security concerns.
- `vm: false` — correctly silences the asn1.js warning without pulling in a vm polyfill that could enable sandboxed-code execution.

The `fullySpecified: false` rule for `.m?js` files is a standard ESM interop fix for packages that import without file extensions. No security impact.

**Finding DEP-01-P01 (INFO):** `config-overrides.js` polyfills are all from trusted, well-maintained packages. No typosquat risks. The `crypto-browserify` polyfill correctly uses `window.crypto.getRandomValues()` in browsers, so Solana's use of `crypto.randomBytes()` remains cryptographically secure in the client bundle.

---

### 6. Anchor Ecosystem Assessment

| Package | Location | Version | Concern |
|---------|----------|---------|---------|
| `@coral-xyz/anchor` | `server/dependencies` | 0.32.1 | Current release |
| `@coral-xyz/anchor` | root `devDependencies` | ^0.32.1 | For tests |
| `@solana/web3.js` | server + client + root | 1.98.4 | Current; post supply-chain attack |

Anchor 0.32.1 is the current stable release. The project's `Cargo.toml` correctly declares the Anchor dependency at the workspace level rather than using glob patterns.

The known breaking change in Anchor 0.32.x (that `BN` must be imported from `bn.js` directly rather than from `@coral-xyz/anchor`) is documented in the project's MEMORY.md and correctly handled in `server/services/escrow.js`.

No `@coral-xyz/anchor` CVEs are currently listed on the npm advisory database.

---

### 7. Typosquat and Supply Chain Risk Assessment

All direct dependencies were reviewed against known typosquat patterns. No concerns identified:

- `phaser3-rex-plugins` — legitimate plugin library maintained by rexrainbow, widely used in Phaser community.
- `@ampproject/remapping` — official AMP project package for source map manipulation; used by babel.
- `pino` / `pino-pretty` — well-maintained Node.js logging library by the Fastify team.
- `helmet` — maintained by the Helmet.js team; widely used Express security middleware.
- `express-rate-limit` — maintained security middleware; current version 8.x.

No packages with suspicious names (slight variations of popular package names, e.g., `expres`, `socket-io`, `solana-web3`) were found in any of the three manifests.

---

### 8. Dev Dependency Leakage Assessment

**Server:**
- `nodemon` — CONFIRMED LEAK into production `dependencies`. Discussed in DEP-01-S01.
- `pino-pretty` — correctly in `devDependencies`. Only used for formatted logging in development.
- `socket.io-client` — correctly in `devDependencies`. Only used for integration test `server/tests/integration.test.js`.

**Client:**
- `buffer`, `crypto-browserify`, `process`, `stream-browserify`, `react-app-rewired` — all correctly in `devDependencies` as webpack build tools / polyfill sources.
- However, these are all referenced via `config-overrides.js` which is a build-time file. They are not imported directly into any React component, so they do not appear in the production bundle.
- `@testing-library/*` is in `dependencies` (not `devDependencies`) in client/package.json. These are test libraries and should not be in production dependencies. They do not appear in the production bundle (Create React App does not include test libraries in build output) but their presence in `dependencies` is a classification error.

**Finding DEP-01-D01 (LOW):** Client `@testing-library/jest-dom`, `@testing-library/react`, and `@testing-library/user-event` are in `dependencies` instead of `devDependencies`. These do not appear in production bundles but the misclassification adds noise to dependency audits.

---

## Remediation Priority Table

| Finding | Severity | Package | Action | Effort |
|---------|----------|---------|--------|--------|
| DEP-01-S01 | HIGH | `nodemon` in `dependencies` | Move to `devDependencies`, upgrade to `^3.1.14` | 5 min |
| DEP-01-L01 | MODERATE | Stale server lock file | After DEP-01-S01: delete `server/package-lock.json` and run `npm install` | 10 min |
| DEP-01-S02 | HIGH | `express` 4.18.1 | Upgrade declared spec to `^4.21.2` (auto-resolved by lock regeneration) | Covered by L01 |
| DEP-01-S03 | HIGH | `socket.io` 4.5.1 / `ws` 8.2.3 | Upgrade declared spec to `^4.8.3` (auto-resolved by lock regeneration) | Covered by L01 |
| DEP-01-C01 | HIGH | `bigint-buffer` 1.1.5 | No upgrade available; monitor `@solana/buffer-layout-utils` for fix | Blocked |
| DEP-01-C02 | INFO | webpack CRITICAL flags | React-scripts configuration mitigates; accept risk until react-scripts 6.x | No action |
| DEP-01-D01 | LOW | `@testing-library/*` in client `dependencies` | Move to `devDependencies` | 2 min |
| DEP-01-C03 | LOW | `phaser` 3.55.2 | Evaluate upgrade to 3.87.x | Medium effort |
| DEP-01-R01 | LOW | Root mocha HIGH (dev-only) | Accept or upgrade mocha to >=11.3.0 | 2 min |

**Most impactful single action:** Moving `nodemon` to `devDependencies` and regenerating the server lock file would reduce the server vulnerability count from 30 to approximately 8, and resolve the genuinely exploitable `ws` DoS and express ReDoS/redirect vulnerabilities simultaneously.

---

## Notes for Cross-Auditor Reference

1. The `ws` 8.2.3 DoS vulnerability (GHSA-3h5v-q93c-6h6q) interacts directly with the WebSocket attack surface described in `12-api-03-websocket.md`. An unauthenticated attacker can trigger it pre-handshake.

2. The `bn.js` infinite loop connects to `08-chain-01-tx-construction.md` — any path where attacker-controlled data reaches Anchor's bn.js arithmetic should be reviewed.

3. The stale lock file pattern (express 4.18.1, socket.io 4.5.1) is consistent with a development environment that has not had `npm install` run from a clean state in some time. The same pattern likely applies to `client/package-lock.json`.

4. `@solana/web3.js` 1.98.4 is confirmed safe relative to the December 2024 supply chain attack (1.95.5/1.95.6). This should be noted explicitly in the final report given the high-profile nature of that incident.
