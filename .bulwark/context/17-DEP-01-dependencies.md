---
task_id: db-phase1-dep-01
provides: [dep-01-findings, dep-01-invariants]
focus_area: dep-01
files_analyzed:
  - server/package.json
  - server/package-lock.json
  - client/package.json
  - client/package-lock.json
  - render.yaml
  - client/vercel.json
  - client/.npmrc
finding_count: 12
severity_breakdown: {critical: 1, high: 5, medium: 4, low: 2}
---
<!-- CONDENSED_SUMMARY_START -->
# DEP-01: Package & Dependency Security — Condensed Summary

## QS VERSION VERDICT — HIGHEST PRIORITY

**`qs` is 6.14.2 in both `server/package-lock.json` and `client/package-lock.json`.**
6.14.2 >> 6.10.3 threshold. Prototype pollution via Express URL-encoded body parser is **NOT VULNERABLE**.
The INJ-05 concern (auth bypass via HTTP body) can be closed for `qs`.

---

## Key Findings (Top 10)

- **DEPRECATED auth SDK**: `@privy-io/server-auth@1.32.5` is officially deprecated — replacement is `@privy-io/node`. All server Privy JWT verification routes through a dead package — `server/services/privyAuth.js`
- **socket.io-parser 4.2.5 is at the exact upper boundary of CVE GHSA-677m-j7p3-52f9** (unbounded binary attachments DoS). npm audit reports it as vulnerable (range: 4.0.0 - 4.2.5 inclusive). Both `server/package-lock.json` and `client/package-lock.json` install 4.2.5. Fix is available — `server/package.json`, `client/package.json`
- **express-rate-limit 8.2.1 installed, CVE GHSA-46wh-pxpv-q5gq** (IPv4-mapped IPv6 bypass of per-client rate limiting). Vulnerable range: 8.2.0 - <8.2.2. Installed version 8.2.1 is vulnerable. Direct dependency in `server/package.json`
- **path-to-regexp 0.1.12 in server lockfile** (CVE GHSA-37ch-88jc-xwx2 — ReDoS via multiple route params). Vulnerable: <0.1.13. 0.1.12 < 0.1.13 = VULNERABLE. Pulled in by `express@4.22.1` — `server/package-lock.json`
- **CRITICAL: handlebars 4.7.8 in client** (multiple JS injection CVEs GHSA-3mfm-83xf-c92r, GHSA-2w6w-674q-4c4q, prototype pollution XSS). Vulnerable range: 4.0.0 - 4.7.8. Pulled in by `phaser3-rex-plugins@^1.60.4` — `client/package-lock.json`
- **nodemon 1.19.4 in server `dependencies` (not devDependencies)** — ships to production on Render, carries chokidar/braces/micromatch/minimatch HIGH ReDoS chains (13 of 20 server vulns trace here) — `server/package.json:29`
- **`react@19.2.5` in server `dependencies`** — server-side card rendering needs React but it should be in devDependencies or a separate renderer context; as a production dep it inflates bundle and adds React CVE surface — `server/package.json:33`
- **`@solana/spl-token@0.4.14` in client carries bigint-buffer HIGH CVE** (GHSA-3gc7-fjrx-p6mg — buffer overflow via toBigIntLE). No semver-compatible fix; fix requires downgrade to 0.1.8 (major version break) — `client/package.json:9`
- **All direct deps use `^` (caret) semver** — allows automatic minor+patch upgrades on fresh installs; no exact pins anywhere. Server+client: 100% caret-ranged — `server/package.json`, `client/package.json`
- **@testing-library/* in client `dependencies` (not devDependencies)** — `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event` all ship to production Vercel build, inflating attack surface — `client/package.json:7-9`

## Critical Mechanisms

- **Render build uses `npm ci --ignore-scripts`**: lockfile respected on server. `--ignore-scripts` is a positive security control (no postinstall execution). `render.yaml:16`
- **Vercel uses `npm run build`** (no `npm ci` in vercel.json) — Vercel's default behavior runs `npm ci` when a lockfile is present but this is not enforced explicitly. `client/vercel.json:3`
- **Client `.npmrc` contains `legacy-peer-deps=true`** — suppresses peer-dependency conflict errors, can mask version resolution issues and pull in unexpected transitive deps. `client/.npmrc`
- **socket.io-parser is a shared transitive** of both `socket.io@4.8.3` (server) and `socket.io-client@4.8.3` (client). The CVE affects how the parser handles binary attachment counts — a malicious client sending crafted Socket.IO messages could exhaust server memory.

## Invariants & Assumptions

- INVARIANT: `qs >= 6.10.3` is required to prevent prototype pollution via Express body parser — ENFORCED at `server/package-lock.json` (6.14.2 installed) ✓
- INVARIANT: postinstall scripts cannot run arbitrary code at install-time on Render — ENFORCED via `--ignore-scripts` flag in `render.yaml:16` ✓
- INVARIANT: lockfiles are committed and used in CI/CD builds — ENFORCED (both lockfiles tracked in git, Render uses `npm ci`) ✓
- ASSUMPTION: `express-rate-limit` protects all rate-limited routes uniformly — UNVALIDATED if Render runs on dual-stack (IPv4-mapped IPv6 can bypass GHSA-46wh-pxpv-q5gq) ⚠
- ASSUMPTION: `@privy-io/server-auth` receives security patches — VIOLATED: package is officially deprecated, replacement is `@privy-io/node` ⚠
- ASSUMPTION: socket.io-parser is safe for production use — UNVALIDATED: 4.2.5 is flagged in CVE range for unbounded binary attachment DoS ⚠

## Risk Observations (Prioritized)

1. **express-rate-limit IPv6 bypass (DIRECT dep, HIGH)**: `server/package.json` declares `^8.2.1`, lockfile has 8.2.1. GHSA-46wh-pxpv-q5gq: IPv4-mapped IPv6 addresses bypass per-client limits. Rate limiting protects create-room throttle and other endpoints. If Render is dual-stack, any client can bypass rate limiting by using `::ffff:x.x.x.x` addressing. Fix: upgrade to `>=8.2.2` (simple npm update).
2. **socket.io-parser DoS (transitive, HIGH)**: 4.2.5 is at or inside the vulnerable range per npm audit. GHSA-677m-j7p3-52f9: attacker can send messages with an unbounded binary attachment count, exhausting server memory. Render Starter plan has 512MB RAM — targeted DoS could kill the server process. Fix: `npm update socket.io` (should pull socket.io-parser >=4.2.6).
3. **handlebars JS injection (CRITICAL in client)**: 4.7.8 pulled in by `phaser3-rex-plugins`. Not used directly in SolShot source. Risk is build-time (no server-side Handlebars rendering) and attacker would need to compromise a dev machine or the phaser3-rex-plugins package itself. Lower exploitability in production but concerning.
4. **@privy-io/server-auth deprecated**: All Privy JWT verification goes through a dead package. Deprecated does not mean immediately broken, but security patches may not be issued for future CVEs. The replacement is `@privy-io/node`.
5. **path-to-regexp 0.1.12 ReDoS**: Used by Express for route matching. An attacker who can supply a specially crafted URL to a route with multiple parameters could cause catastrophic regex backtracking. Express 4 uses path-to-regexp 0.1.x for basic routes. Exploitability depends on whether any SolShot routes have multiple wildcard parameters.
6. **nodemon in production deps**: Nodemon and its dependency tree (chokidar, braces, micromatch, cross-spawn — all HIGH CVEs) are installed on the production Render instance. Nodemon is not started in production (`startCommand: node index.js`), but the packages exist in `node_modules/` and the vulnerabilities exist in installed code.

## Novel Attack Surface

- **Deprecated @privy-io/server-auth as supply-chain single point**: The entire wallet-link authorization chain (`/api/wallet/link-from-tg-token`, Telegram→wallet binding) runs through a deprecated package. If `@privy-io/server-auth` npm package is ever taken over or modified post-deprecation, every Privy JWT verification is compromised.
- **legacy-peer-deps in client .npmrc**: This setting causes npm to use npm 6 peer-dependency resolution behavior, which can silently install older versions of packages when there are peer conflicts. Combined with `^` pinning, a fresh `npm install` on a new dev machine could resolve to lower (and potentially more vulnerable) versions than the lockfile specifies — the lockfile is the guard here, but `npm install` (not `npm ci`) would bypass it.

## Cross-Focus Handoffs

- → **AUTH-01 / SEC-02**: `@privy-io/server-auth` is deprecated (`server/services/privyAuth.js`). Verify whether a migration to `@privy-io/node` is planned — the deprecation note may indicate different JWT verification API surface.
- → **ERR-03**: `express-rate-limit@8.2.1` IPv6 bypass means rate limiting on `createRoom` and other socket events can be bypassed via IPv4-mapped IPv6. Check if Socket.IO connection rate limiting would also be affected.
- → **API-03**: socket.io-parser 4.2.5 DoS vector — unbounded binary attachment count. Verify if any SolShot socket events accept binary data that could be weaponized from the server's `socket.io` side.

## Trust Boundaries

Server npm dependencies are installed via `npm ci --ignore-scripts` on Render (lockfile-controlled, postinstall disabled). This is a solid baseline. However, three direct dependencies have known CVEs: `express-rate-limit` (IPv6 rate-limit bypass), `nodemon` (misclassified as production dep, HIGH ReDoS tree), and the deprecated `@privy-io/server-auth`. The client dependency tree is significantly more polluted: 2,294 packages total, 47 CVEs, 1 CRITICAL (handlebars from phaser3-rex-plugins). Client vulnerabilities are lower risk since they are browser-executed build artifacts, but the Privy SDK pulling in MetaMask SDK (deprecated) and WalletConnect v2 stacks adds considerable untrusted transitive surface to the wallet interaction layer. Neither server nor client uses exact version pins — the lockfiles are the sole source of reproducibility.
<!-- CONDENSED_SUMMARY_END -->

---

# DEP-01: Package & Dependency Security — Full Analysis

## Executive Summary

Both the server (Node.js/Express/Socket.IO) and client (React CRA) have known CVE exposure. The server has 20 vulnerabilities (7 moderate, 13 high, 0 critical) and the client has 47 (13 low, 8 moderate, 25 high, 1 critical). The most important finding is:

**`qs` is 6.14.2 in both lockfiles. Prototype pollution via Express urlencoded body parser is NOT present.**

The most actionable server findings are: `express-rate-limit@8.2.1` (direct dep, IPv6 rate-limit bypass, trivial to fix with `npm update`), `socket.io-parser@4.2.5` (transitive, DoS), and the deprecated `@privy-io/server-auth`. On the client, `handlebars@4.7.8` (critical via phaser3-rex-plugins) and `@solana/spl-token@0.4.14` (HIGH bigint-buffer) are the headline CVEs.

The build infrastructure is reasonably sound: Render uses `npm ci --ignore-scripts` (lockfile-honoring, postinstall-blocked), both lockfiles are committed. The main gap is the client Vercel build does not explicitly use `npm ci` (relying on Vercel's default behavior) and `client/.npmrc` sets `legacy-peer-deps=true` which can interfere with clean resolution.

## Scope

**In scope:** Server `package.json`, `package-lock.json`, client `package.json`, `package-lock.json`, deployment configs (`render.yaml`, `client/vercel.json`), client `.npmrc`, root `package.json`.

**Out of scope:** Anchor/Rust on-chain programs in `programs/`.

## Key Mechanisms

### Build & Install Pipeline

**Server (Render):**
- Build command: `npm ci --ignore-scripts` (`render.yaml:16`)
- Start command: `node index.js` (nodemon is installed but NOT used in production)
- `npm ci` enforces exact lockfile versions — no resolution drift
- `--ignore-scripts` blocks all lifecycle scripts including `postinstall`, `install`, `preinstall`
- No postinstall scripts found in server `package-lock.json` (verified: 0 packages have lifecycle scripts)

**Client (Vercel):**
- Build command: `npm run build` → `react-app-rewired build` (`client/vercel.json:3`)
- Vercel runs `npm ci` by default when `package-lock.json` is present (not explicitly enforced in config)
- `client/.npmrc` has `legacy-peer-deps=true` — alters peer resolution to npm v6 behavior
- No explicit `--ignore-scripts` for client builds

### Version Pinning Policy

- **Both server and client use 100% caret (`^`) ranges** — `^x.y.z` allows automatic minor + patch upgrades on fresh `npm install`
- `npm ci` in the build pipeline uses the lockfile, so production installs are deterministic
- **The lockfile is the only defense against version drift** — if a developer runs `npm install` locally (not `npm ci`), they may get different versions
- No exact (`=x.y.z`) or tilde (`~x.y.z`) pins anywhere in either `package.json`

## Trust Model

### Server Package Trust

| Package | Type | Version | Status |
|---------|------|---------|--------|
| `@coral-xyz/anchor` | Direct dep | 0.32.1 | No known CVEs (verified) |
| `@privy-io/server-auth` | Direct dep | 1.32.5 | **DEPRECATED** — no future patches |
| `@solana/web3.js` | Direct dep | 1.98.4 | No known CVEs in lockfile |
| `express` | Direct dep | 4.22.1 | No direct CVEs; `path-to-regexp@0.1.12` transitive HIGH |
| `express-rate-limit` | **Direct dep** | **8.2.1** | **HIGH CVE GHSA-46wh-pxpv-q5gq — IPv6 bypass** |
| `socket.io` | Direct dep | 4.8.3 | `socket.io-parser@4.2.5` transitive HIGH |
| `nodemon` | **Direct dep (should be devDep)** | **1.19.4** | **HIGH CVE tree (chokidar/braces/micromatch)** |
| `jsonwebtoken` | Direct dep | 9.0.3 | No known CVEs |
| `helmet` | Direct dep | 8.1.0 | No known CVEs |
| `mongoose` | Direct dep | 9.2.1 | No known CVEs; 9.6.1 available |
| `tweetnacl` | Direct dep | 1.0.3 | No known CVEs |

### Client Package Trust

| Package | Type | Version | Status |
|---------|------|---------|--------|
| `@privy-io/react-auth` | Direct dep | 3.23.1 | Active, no direct CVEs |
| `@solana/web3.js` | Direct dep | 1.98.4 | No known CVEs |
| `@solana/spl-token` | **Direct dep** | **0.4.14** | **HIGH CVE via bigint-buffer (GHSA-3gc7-fjrx-p6mg)** |
| `react` | Direct dep | 18.1.0 | 18.3.1 available (minor); 19.2.6 latest |
| `react-scripts` | **Direct dep** | **5.0.1** | **HIGH tree (svgo, svgr, css-minimizer, nth-check, workbox)** |
| `phaser` | Direct dep | 3.55.2 | 3.90.0 wanted, 4.1.0 latest — major jump |
| `phaser3-rex-plugins` | Direct dep | 1.60.4 | Pulls `handlebars@4.7.8` — **CRITICAL CVEs** |
| `socket.io-client` | Direct dep | 4.8.3 | `socket.io-parser@4.2.5` transitive HIGH |

## State Analysis

No relevant databases or caches for dependency management. Key state:
- Lockfiles committed at: `server/package-lock.json`, `client/package-lock.json` — verified by `git ls-files`
- Root `package.json` contains workspace-level Anchor/Solana deps for BOK test tooling (`@coral-xyz/anchor`, `@solana/web3.js`, mocha, chai)

## Focus-Specific Analysis

### DEP-01-A: The `qs` Question (Highest Priority)

**Verdict: NOT VULNERABLE.**

- `server/package-lock.json`: `"qs": "~6.14.0"` range; installed version `6.14.2`
- `client/package-lock.json`: installed version `6.14.2`
- CVE threshold: `qs < 6.10.3` is vulnerable to prototype pollution
- 6.14.2 > 6.10.3 — **SAFE**
- Express 4.22.1 uses its own `qs` dependency (`express -> body-parser -> qs`) — this is the version in `node_modules/qs` (6.14.2), not a nested shadowed version
- The INJ-05 prototype pollution vector via HTTP body parser is **NOT present** in this installation

### DEP-01-B: express-rate-limit — DIRECT HIGH CVE

**CVE:** GHSA-46wh-pxpv-q5gq — IPv4-mapped IPv6 addresses bypass per-client rate limiting

- Installed: `8.2.1` (direct dep in `server/package.json:25`)
- Vulnerable range: `>=8.2.0 <8.2.2`
- Fix available: upgrade to `>=8.2.2` (`npm update express-rate-limit` → installs `8.5.1` per `npm outdated`)
- **Impact**: Rate limiting on `createRoom`, matchmaking throttle, and any HTTP endpoints protected by `express-rate-limit` can be bypassed by a client that connects via an IPv4-mapped IPv6 address (e.g., `::ffff:1.2.3.4`). This depends on whether Render runs in dual-stack mode. If so, an attacker could circumvent the create-room throttle to flood the matchmaking system.
- **Exploitability**: Moderate. Render's default may be IPv4-only on the Starter plan, but this is not confirmed. The fix is trivial — one `npm update`.
- **File reference**: `server/package.json:25`, `server/index.js` (rate limiter setup)

### DEP-01-C: socket.io-parser 4.2.5 — DoS Vector

**CVE:** GHSA-677m-j7p3-52f9 — `socket.io allows an unbounded number of binary attachments`

- Installed: `4.2.5` (transitive via `socket.io@4.8.3` and `socket.io-client@4.8.3`)
- npm audit marks range `4.0.0 - 4.2.5` as vulnerable (inclusive upper bound)
- **Impact**: A malicious client can send a Socket.IO message claiming a very large number of binary attachments without actually providing them, causing the server to allocate memory indefinitely waiting for those attachments. On Render Starter (512 MB RAM), this is a credible OOM/DoS path.
- **Context**: All SolShot socket events go through this parser. Any unauthenticated or authenticated attacker with a socket connection can trigger this.
- **Fix**: `npm update socket.io` in server; `npm update socket.io-client` in client. Should resolve socket.io-parser to >=4.2.6.

### DEP-01-D: path-to-regexp 0.1.12 — Express Route ReDoS

**CVE:** GHSA-37ch-88jc-xwx2

- Installed: `0.1.12` (transitive of `express@4.22.1`)
- Vulnerable: `<0.1.13`
- **Impact**: Specially crafted URLs matching routes with multiple parameters can cause catastrophic regex backtracking, blocking the Node.js event loop. For Express, this requires an attacker-controlled URL to hit a multi-parameter route.
- **SolShot context**: Review `server/index.js` and Express route definitions for routes with multiple `:param` segments. HTTP REST endpoints are limited but any with pattern like `/api/:userId/:matchId` would be exploitable.
- **Fix**: Express 5.x (available as `5.2.1`) uses a modern path-to-regexp. Or pin express at a patched 4.x backport if available.

### DEP-01-E: handlebars 4.7.8 — CRITICAL JavaScript Injection

**CVEs:** GHSA-3mfm-83xf-c92r, GHSA-2w6w-674q-4c4q, GHSA-2qvq-rjwj-gvw9 (and 5 more)

- Installed: `4.7.8` in `client/package-lock.json`
- Source: `phaser3-rex-plugins@1.60.4` depends on `handlebars@^4.7.7`
- **Impact in production**: Handlebars is a template engine. In a browser context, `handlebars` is bundled into the client JS by webpack. If `phaser3-rex-plugins` uses handlebars at runtime for game UI rendering, an attacker who can influence template data could achieve JS injection. However, if Rex plugins uses handlebars only for its own internal string formatting with static templates, the attack surface may be minimal.
- **Build-time risk**: The CRITICAL designation applies most strongly to server-side handlebars rendering (not present here) and template compilation vulnerabilities. In a CRA-bundled browser context, exploitation requires attacker-controlled template strings.
- **Fix**: No semver-compatible fix (phaser3-rex-plugins pins to `^4.7.7`). Would require phaser3-rex-plugins to update, or pinning phaser3-rex-plugins to a fork.

### DEP-01-F: @solana/spl-token 0.4.14 — bigint-buffer HIGH CVE

**CVE:** GHSA-3gc7-fjrx-p6mg — Buffer overflow via `toBigIntLE()` in `bigint-buffer`

- Installed: `@solana/spl-token@0.4.14` in `client/package.json:9`
- Vulnerable transitive: `@solana/buffer-layout-utils` → `bigint-buffer`
- **Impact**: `bigint-buffer` is a native Node.js addon. In a browser context (webpack bundle), native addons are typically shimmed or excluded, which likely means this CVE is not exercisable in the browser. However, if the spl-token functions using bigint-buffer are called with attacker-controlled data, the risk escalates.
- **SolShot context**: `@solana/spl-token` is used by `WalletContext.js` for `signAndBurnShot()` (building SPL burn instructions). The inputs are user-controlled (burnAmount), but they flow through Solana SDK math which would normalize before hitting bigint-buffer.
- **Fix**: npm suggests downgrading to `@solana/spl-token@0.1.8` which is a major version break. Practically, this CVE may be low risk in browser context.

### DEP-01-G: nodemon in Production Dependencies

- `server/package.json:29`: `"nodemon": "^1.3.3"` is in `dependencies`, not `devDependencies`
- Installed version: `1.19.4`
- `render.yaml` start command is `node index.js` — nodemon is NOT started in production
- **But**: nodemon (and its entire HIGH CVE tree: chokidar, braces/anymatch/micromatch ReDoS, minimatch ReDoS, cross-spawn ReDoS) is installed on the Render production container via `npm ci`
- **Why this matters**: These vulnerabilities exist in `node_modules/` on the production server. They are only exploitable if code paths import nodemon or its dependencies — which does not happen in normal server operation. However, they contribute to the vulnerability count and represent attack surface if any code were to dynamically require them.
- **Also misclassified**: `react@19.2.5` is in server `dependencies` (needed for card rendering via satori/resvg). React is a legitimate server dep here for SSR card generation, but the misclassification of nodemon is worth correcting.
- **Fix**: Move `nodemon` to `devDependencies`. Add `--omit=dev` to Render's build command or confirm `npm ci` in production ignores devDeps (it does not by default — `NODE_ENV=production npm ci` or `npm ci --omit=dev` would be needed).

### DEP-01-H: @privy-io/server-auth Deprecated

- Installed: `@privy-io/server-auth@1.32.5`
- npm deprecation message: "This package is deprecated. If you are looking for the latest features and support, use `@privy-io/node` instead."
- Used by: `server/services/privyAuth.js` for JWT verification on wallet-link endpoints
- **Impact**: Deprecated packages do not receive security patches for future CVEs. If a vulnerability is found in Privy's JWT verification logic, `@privy-io/server-auth` users may not receive a fix.
- **Migration path**: `@privy-io/node` is the replacement — API surface may differ from `@privy-io/server-auth`. Migration risk is low-medium.

### DEP-01-I: Testing Libraries in Client Production Dependencies

- `client/package.json:7-9`: `@testing-library/jest-dom`, `@testing-library/react`, `@testing-library/user-event` are in `dependencies` (not `devDependencies`)
- These are bundled into the production Vercel build artifact
- react-scripts' build process tree-shakes unused imports, but these packages are still present in `node_modules/` and potentially bundled if any test file is accidentally included
- **Practical impact**: Minor (increases bundle size, adds test code to production artifact), but represents poor hygiene

### DEP-01-J: All Deps Are Caret-Pinned — Lockfile Is The Only Guard

- `server/package.json`: 18 deps (all `^`), 3 devDeps (all `^`)
- `client/package.json`: 18 deps (all `^`), 10 devDeps (all `^`)
- No exact pins (`=x.y.z`) anywhere
- The lockfile being committed to git and `npm ci` being used in production builds is the defense
- **Risk scenario**: A developer who runs `npm install` (not `npm ci`) locally updates the lockfile with new transitive versions, which then get committed and deployed. The lockfile is the integrity boundary, not the package.json.

### DEP-01-K: Lockfile Integrity and CI Enforcement

**Positive findings:**
- `server/package-lock.json` and `client/package-lock.json` are both committed to git (verified via `git ls-files`)
- Render build uses `npm ci` — lockfile-enforcing
- `--ignore-scripts` flag blocks postinstall scripts on Render (verified: 0 postinstall scripts in server lockfile anyway)

**Gaps:**
- No `.github/workflows/` CI (no GitHub Actions) — no automated `npm audit` on PR
- Vercel client build uses `npm run build` (not `npm ci`); however Vercel's build system default is `npm ci` when a lockfile is present — but this is not explicitly enforced in `client/vercel.json`
- `client/.npmrc` has `legacy-peer-deps=true` — alters resolution behavior, can mask peer conflicts silently

### DEP-01-L: Solana SDK Versions

- `@solana/web3.js@1.98.4` — No known CVEs in npm advisory database at this version
- `@coral-xyz/anchor@0.32.1` — No known CVEs. Anchor uses its own BN handling (documented `bn.js` direct import in project due to Anchor 0.32.1 breaking change — correctly handled in `server/services/escrow.js`)
- `@privy-io/react-auth@3.23.1` — Active, no known CVEs. Pulls in MetaMask SDK (deprecated, not maintained) and WalletConnect v2 stacks as transitive deps via `@wagmi/connectors`
- MetaMask SDK `0.33.1` — deprecated ("No longer maintained, superseded by https://docs.metamask.io/metamask-connect"), pulled in by Privy's wagmi connectors — not used directly by SolShot code

## Cross-Focus Intersections

- **INJ-05 (Prototype Pollution)**: `qs@6.14.2` closes the urlencoded body parser prototype pollution path. However, `axios` in client lockfile has multiple prototype pollution CVEs (GHSA-w9j2-pvgh-6h63, GHSA-pf86-5x62-jrwf, etc.) — these affect client-side HTTP requests if axios is used to communicate with third-party APIs. SolShot client does not appear to directly import axios, but transitive usage could be present.
- **ERR-03 (Rate Limiting)**: `express-rate-limit@8.2.1` IPv6 bypass directly undercuts the create-room throttle and any HTTP rate limiting in `server/index.js`. This is a concrete rate-limit evasion path.
- **AUTH-01 (Authentication)**: `@privy-io/server-auth` being deprecated means the JWT verification layer in `server/services/privyAuth.js` uses an unmaintained library. Any future JWT algorithm confusion or signature bypass CVE in Privy's SDK would not be patched.
- **SEC-02 (Credentials)**: All secrets still loaded via env vars; no package introduces unexpected credential scanning or telemetry — positive finding.

## Cross-Reference Handoffs

- → **INJ-05 (Prototype Pollution)**: `qs` verdict is SAFE (6.14.2). Close the INJ-05 `qs` concern. But flag `axios` prototype pollution CVEs in client — verify if SolShot client code ever calls axios directly or via a transitive path.
- → **ERR-03 (Rate Limiting)**: express-rate-limit 8.2.1 IPv6 bypass needs verification against Render's network stack. Recommend upgrading to 8.5.1 (trivial).
- → **AUTH-01**: `@privy-io/server-auth` deprecated — AUTH-01 agent should verify privyAuth.js JWT verification behavior and whether the deprecation affects security guarantees.
- → **API-03**: socket.io-parser 4.2.5 DoS — API-03 agent should assess whether any SolShot socket events accept binary data that would compound this risk.

## Risk Observations

1. **express-rate-limit IPv6 bypass (HIGH, direct dep)**: 8.2.1 installed, fix is 8.5.1, one npm update away. `server/package.json:25`
2. **socket.io-parser DoS (HIGH, transitive)**: 4.2.5 in vulnerable range, affects both server socket.io and client socket.io-client. `server/package-lock.json`, `client/package-lock.json`
3. **path-to-regexp ReDoS (HIGH, transitive of express)**: 0.1.12 < 0.1.13. Express route regex backtracking. `server/package-lock.json`
4. **handlebars CRITICAL (client, transitive of phaser3-rex-plugins)**: 4.7.8, multiple JS injection CVEs. Low exploitability in browser bundle context but CRITICAL severity rating. `client/package-lock.json`
5. **@privy-io/server-auth deprecated (medium-high risk)**: Active codebase dependency, no future patches. `server/package.json:19`, `server/services/privyAuth.js`
6. **nodemon in production dependencies (medium)**: HIGH CVE tree deployed to Render unnecessarily. `server/package.json:29`
7. **@solana/spl-token bigint-buffer overflow (HIGH, likely low exploitability in browser)**: `client/package.json:9`
8. **No automated npm audit in CI (medium)**: No GitHub Actions or equivalent. Vulnerabilities accumulate silently between manual audit runs.
9. **Testing libraries in client production deps (low)**: @testing-library/* in `dependencies` instead of `devDependencies`. `client/package.json:7-9`
10. **All deps caret-pinned (low)**: Lockfile-dependent reproducibility only. `server/package.json`, `client/package.json`

## Novel Attack Surface Observations

1. **Privy SDK transitive pull-in of deprecated MetaMask SDK**: `@privy-io/react-auth` pulls `@wagmi/connectors` which pulls `@metamask/sdk@0.33.1` (deprecated, "no longer maintained"). If MetaMask SDK contains wallet interaction code that runs in the browser, a compromised or abandoned MetaMask SDK npm package could affect Privy wallet operations without SolShot authors being aware.

2. **legacy-peer-deps + fresh npm install race**: If a new developer runs `npm install` instead of `npm ci` in the client directory, `legacy-peer-deps=true` in `.npmrc` combined with caret ranges could resolve to a different (older, potentially more vulnerable) version of a peer-depended package. The lockfile would then be updated with those versions. Since there is no CI guard (`npm audit --audit-level=high` as a PR gate), this drift could go unnoticed until the next manual audit.

3. **phaser3-rex-plugins as an indirect attack surface**: This is a less-maintained community plugin (1.60.4 is not the latest, 4.1.0 phaser major is out). It pulls handlebars, which carries CRITICAL CVEs. If phaser3-rex-plugins itself were compromised via a supply chain attack, it would be an effective vector into every SolShot client build.

## Questions for Other Focus Areas

1. **For AUTH-01**: Does `server/services/privyAuth.js` have a graceful fallback if `@privy-io/server-auth` fails to initialize? If so, can that fallback be triggered in production by crashing the Privy module?
2. **For INJ-05**: Are any of the axios CVEs (prototype pollution in `validateStatus`, `parseReviver`, HTTP adapter) reachable through Privy's internal axios usage in the browser client?
3. **For ERR-03**: What is the `express-rate-limit` configuration in `server/index.js`? Does it use per-IP rate limiting (affected by IPv6 bypass) or per-socket/per-wallet rate limiting?
4. **For API-03**: Does the SolShot socket.io server ever receive binary frames (Buffer-typed data) from clients? If so, the socket.io-parser DoS is immediately exercisable.

## Raw Notes

- `npm audit --json` run directly in `server/` and `client/` directories on 2026-05-07
- Server: 20 vulns confirmed (7 moderate, 13 high, 0 critical) — matches pre-scan
- Client: 47 vulns confirmed (13 low, 8 moderate, 25 high, 1 critical) — matches pre-scan
- qs exact version from `server/package-lock.json`: `"qs": "~6.14.0"` range entry, `"qs": { "version": "6.14.2" }` installed — SAFE
- express-rate-limit: `package.json` declares `^8.2.1`, lockfile installs `8.2.1` exactly — the `^` range would allow 8.2.2 but lock froze at 8.2.1 before the patch was available
- socket.io-parser: npm audit treats 4.2.5 as within the vulnerable range (4.0.0-4.2.5 inclusive) — either 4.2.5 never received the fix, or the fix landed in 4.2.6+
- nodemon `1.19.4` is in `dependencies` (not `devDependencies`) — this is finding H053 from Bulwark Feb #1 (RECHECK status, still present)
- Client `.npmrc` has `legacy-peer-deps=true` — this existed before May 2026 based on file timestamp (Apr 29 2026)
- No postinstall scripts found in either lockfile (0 packages with lifecycle scripts)
- Root `package.json` at `C:/Users/johnk/SolShot/package.json` contains BOK testing workspace deps only, not the main application
- Vercel build command in `client/vercel.json` is `npm run build` — Vercel documentation states it uses `npm ci` when `package-lock.json` is present, but this is not guaranteed if the build script is overridden
- `@metamask/sdk` deprecated, pulled by `@wagmi/connectors` which is a transitive of `@privy-io/react-auth`

---

**One-line summary:** `qs` is 6.14.2 (SAFE); highest-priority actionable fixes are `express-rate-limit` 8.2.1→8.5.1 (IPv6 rate-limit bypass, one `npm update`), `socket.io-parser` DoS (update socket.io), and `@privy-io/server-auth` deprecation migration to `@privy-io/node`.
