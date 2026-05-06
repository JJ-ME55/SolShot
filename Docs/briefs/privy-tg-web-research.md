# Privy + TG Web Research

**Date:** 2026-05-03
**Question:** Does Privy provably support TG Web + TG Desktop + TG iOS Mini App embedded wallets — all three surfaces — for a Solana app?

**Short verdict:** **NO — not provably.** Privy's architecture is *the same architectural class* as Dynamic. It uses an iframe at `auth.privy.io` that holds the device share in iframe localStorage, with origin enforcement via `frame-ancestors` CSP plus in-code origin validation. While Privy explicitly documents adding `web.telegram.org` to allowed origins (better than Dynamic), the **third-party storage problem that breaks Dynamic on TG Web also applies to Privy** in browsers that partition storage (Safari ITP, Firefox Total Cookie Protection, Chrome with 3PC blocked, and Telegram's WebView shells). Privy has no documented workaround, no public production proof of working in TG Web specifically, and no documented Storage Access API integration in their SDK.

The case is *better* than Dynamic — Privy explicitly mentions web.telegram.org as a supported allowed-origin and has TG-aware login helpers. But "better than Dynamic" is not "proven to work." The user has been burned twice. The honest answer is that the same iframe-localStorage architecture that broke Dynamic and the cross-origin-credentials architecture that broke Para is present in Privy and **no public production app or community thread confirms it works in TG Web (web.telegram.org in a normal desktop browser) with embedded wallet signing**.

---

## Section 1 — Architectural fundamentals

### 1.1 Does Privy use a sub-iframe inside the user's app for signing?

**Yes.** Confirmed by multiple sources including Privy's own docs and security FAQ:

> "Privy secures wallets directly on user devices using browser-enforced isolation via iframes, with the Privy iframe running in a separate process with its own isolated memory space, completely separated from the application." (docs.privy.io)

> "When the embedded wallet needs to use the private key to produce a signature, the Privy SDK will pass the message for the signature to the isolated iframe, which will reconstitute the private key in-memory using the device share and auth share to compute the signature using ECDSA, then pass the signature back to the Privy SDK and flush the assembled private key from memory." (docs.privy.io)

**Domain:** `auth.privy.io` — confirmed from CSP docs ("frame-src must allow `https://auth.privy.io`") and from SDK source references ("origin check verifies `https://auth.privy.io`").

**Frame-ancestors enforcement:**

> "The Privy iframe enforces that all frame ancestors must be an allowed origin set by an application admin within the Privy dashboard, enforced by both frame ancestor CSP checks and in-code origin validation." (docs.privy.io/security/security-faqs)

**Configurable per-app from dashboard:** Yes. Origin is set in Dashboard → Settings → Domains → "Allowed Origins". Privy explicitly documents adding `web.telegram.org` (both `http://` and `https://`):

> "To use your app as a Telegram Mini-App in the Telegram web client, add `http://web.telegram.org` and `https://web.telegram.org` to your allowed domains in the dashboard Configuration > App settings > Domains tab." (docs.privy.io/recipes/react/seamless-telegram)

**X-Frame-Options:** Not directly documented. Modern browsers prefer CSP `frame-ancestors` over X-Frame-Options when both are present, so even if Privy serves XFO=DENY, the CSP should win in modern browsers — *but* this is exactly the kind of thing that bit Dynamic when CDN cache returned a stale XFO header.

**KEY CAVEAT FOR TG WEB:** The Privy iframe's parent is *the customer's app*, not `web.telegram.org`. The customer's app is what's loaded inside `web.telegram.org`'s iframe. So Privy's `frame-ancestors` only needs to list the customer's domain — **the grandparent (web.telegram.org) is not an ancestor of `auth.privy.io` from Privy's perspective**. This is *better* than Dynamic's architecture and means Privy's `frame-ancestors` should not be the failure point. **The failure point shifts to third-party storage partitioning**, which is worse and has no clean fix.

### 1.2 Does Privy use cross-origin cookies (`withCredentials: true`)?

**Partially.** Privy uses two storage mechanisms simultaneously:

1. **Access tokens / session:** stored as either `localStorage` on the customer's app domain *or* as `HttpOnly` cookies on the customer's verified production domain. From docs:

   > "Privy can store a user's access token either with browser's local storage or as a HttpOnly cookie set on the app's base domain, with local storage being the default." (docs.privy.io/recipes/react/cookies)
   >
   > "Each app can only have one cookie domain. Once your domain is verified, the corresponding App ID can only be used on that exact production domain."
   >
   > "Cookies set by Privy are by default set with the `SameSite` attribute set to `Strict`." (toggle to `Lax` available)

   **This is good.** Because the auth-token cookie is set on the *customer's domain* (the iframe's parent), it's first-party from the iframe's perspective when reading. SameSite=Strict/Lax does not break this if the iframe communicates back via postMessage rather than direct XHR with credentials.

2. **Device share (the wallet half-key):** stored in `auth.privy.io` iframe's localStorage. From SDK behavior docs:

   > "The device share from Privy's key sharding system is persisted on the user's device, and in a browser environment, this is stored in the browser's local storage via the iframe."
   >
   > "By design, the embedded wallet's private key is only ever stored in-memory within the isolated iframe."

   **This is the problem.** localStorage in a third-party iframe (`auth.privy.io` embedded in a page on a different domain) is partitioned in:
   - Safari (ITP since v13.1): blocked by default
   - Firefox (Total Cookie Protection, default since 2022): partitioned per top-level site
   - Chrome (when third-party cookies blocked, including Incognito and Privacy Sandbox enrollment)
   - iOS WKWebView ≥14: ITP enabled by default; "third party cookies cannot be used by default"
   - Android WebView: third-party cookies disabled by default; apps must opt in via `CookieManager#setAcceptThirdPartyCookies`

   When localStorage is partitioned, the iframe can write a device share, but on the next visit (especially after being navigated to from a different top-level origin, e.g., user opens Mini App once from web.telegram.org and once from a deep link), the partitioned storage doesn't persist or doesn't match — the wallet appears to "disappear" or fail to sign.

**Documented workaround:** None. Privy docs don't mention the Storage Access API, partitioned cookies (CHIPS), or any "use postMessage-based storage relay" pattern. There is no `useFetchAdapter` equivalent and no documented mode that puts everything in `localStorage` on the parent domain.

### 1.3 Does Privy use a WebSocket?

Privy's published CSP recommendations include WebSocket entries only for WalletConnect (`wss://relay.walletconnect.com` etc.) and Coinbase Wallet (`wss://www.walletlink.org`). Privy's own infrastructure surfaces in CSP as `https://auth.privy.io` and `https://*.rpc.privy.systems` (HTTPS, not WSS). So **MPC signing does not appear to use a runtime WebSocket from Privy's own infra**, which is one less failure mode in TG Web. Good.

---

## Section 2 — TG-specific support

### 2.1 Privy's documented TG Mini App integration path

**Two official docs:**

- **[Seamless Telegram login (recipe)](https://docs.privy.io/recipes/react/seamless-telegram):** uses `linkTelegram(launchParams)` from `usePrivy`. This is for *seamless first-party login* using Telegram's `initData`/`launchParams` — i.e., zero-tap auto-login when the Mini App opens.
- **[Log in with Telegram (dashboard guide)](https://docs.privy.io/guide/dashboard/telegram):** covers the standard Telegram Login Widget popup flow.

**TG Web vs TG mobile differentiation:**

> "To use your app as a Telegram Mini-App in the Telegram web client, you must add `http://web.telegram.org` and `https://web.telegram.org` to your allowed domains."

That is the **only** sentence that mentions web.telegram.org directly. There is **no** sentence that says "this is tested on TG Web," "this works on TG Web," or "TG Web is fully supported." The doc treats web.telegram.org as just another allowed-origin entry, not as a tested compatibility surface. Quote the doc at face value: this is a config note, not a guarantee of compatibility.

**TG-specific server-side setup:** The seamless flow requires the bot token configured in Privy dashboard's Socials tab so Privy can verify Telegram `initData` HMAC server-side. Standard.

**Iframe / popup / redirect dance:**
- Standard `loginWithTelegram`: **popup** ("Telegram's authentication pop-up will emerge"). Popups in TG Web inside an iframe are notoriously fragile — Telegram's web client may force the popup into the parent browser context, breaking the postMessage callback.
- Seamless via `launchParams`: **fully silent**, server validates `initData` HMAC. This is the path that *might* work, but it still depends on the device share being readable from `auth.privy.io` iframe localStorage on subsequent visits.

**Domain caveats from the docs:**
- "Telegram does not support `.xyz` domains for authentication." (Note: SolShot is on `.gg`, fine.)
- Trailing paths not supported, wildcards only as subdomain.

**Explicit "this works on TG Web" quote:** None found. The docs say *configure* `web.telegram.org`, not that it has been *tested and confirmed to work*. This is a meaningful distinction.

### 2.2 Public production examples on TG Web

Confirmed Privy + Telegram production apps (from blog posts, tweets, and reviews):
- **Inco Slot Machine** (`t.me/inco_slots_demo_bot`)
- **Inco Hangman** (`t.me/IncoHangmanGameBot`)
- **Anomaly Games** (Web3 game launcher)
- **Fren Pet** (mentioned in Privy's tweet)
- **PolyCool** (Polymarket copy-trading TMA, confirmed to use Privy in 2026 review)
- **Trojan** (Solana trading bot — uses Privy infra)
- **Sofamon** (mentioned by Privy)

**TG Web specifically (web.telegram.org in a desktop browser):** **Zero verified reports.** None of the references I found say "I opened this Mini App in web.telegram.org on Chrome desktop and the Privy wallet provisioned cleanly." All blog posts, tweets, and reviews talk about "Telegram Mini Apps" generically — which in practice usually means the iOS or Android native app where the WebView is somewhat more permissive.

The Inco demo bots and PolyCool both ship Mini Apps that *can* technically be opened in TG Web, but I have no evidence they were *tested* there or that wallet provisioning succeeds there. Given that the TG-native app is the dominant surface in TG-app marketing, it's entirely plausible (in fact likely) that those teams shipped without testing TG Web at all.

### 2.3 Community threads about Privy + TG Web

Searched extensively. Findings:

- **No GitHub issue, Discord post, or Stack Overflow thread** specifically titled "Privy breaks on TG Web" or "third-party cookies block Privy in Telegram." Either it works fine for everyone (unlikely given the architectural constraints), or — much more likely — *almost no one has tested it* because TG mobile is the default surface and TG Web is an afterthought.
- Two adjacent issues:
  - [tauri-apps/tauri#14056](https://github.com/tauri-apps/tauri/issues/14056) — Privy iframe rejects `tauri:///file://` in `frame-ancestors`. No Privy response. Confirms `frame-ancestors` is strict and not flexibly configurable.
  - [unlock-protocol/unlock#15275](https://github.com/unlock-protocol/unlock/issues/15275) — Privy OAuth login fails when host app is itself in an iframe (Google OAuth tries to popup/redirect, breaks). Closed without public resolution. **This one is directly relevant** — it's the same nesting situation as TG Web.

The unlock-protocol issue is the closest signal we have, and it indicates that Privy + nested-iframe + OAuth is a known broken path. The seamless `launchParams` flow side-steps the OAuth popup, but the device share localStorage problem remains.

---

## Section 3 — TG Desktop specifically

TG Desktop is the Electron-based app for macOS / Windows / Linux. It renders Mini Apps using the OS's WebView (WebKit on macOS, Chromium-based on Windows/Linux via the Electron build).

**Privy on TG Desktop:** No documentation, no testing reports.

**Architectural reasoning:**
- TG Desktop's WebView typically runs in a *native* WebView context, not nested inside `web.telegram.org` — so the grandparent-iframe problem doesn't apply.
- Cookie/storage policies depend on the underlying WebView (macOS WebKit = ITP active = third-party storage blocked by default; Windows/Linux Chromium = depends on flags).
- macOS TG Desktop does NOT support webview inspection in beta (per Telegram's published docs), so debugging is harder.

**Prediction (not proof):** TG Desktop on Windows/Linux with Chromium-based WebView is the *most likely* of the three surfaces to work because it's a native WebView (not nested iframe) and Chromium hasn't fully blocked 3PC by default yet. macOS TG Desktop is the *least* likely to work because WKWebView has ITP on by default. **No public proof either way.**

---

## Section 4 — Privy's TG-related docs in detail

Pages reviewed:
- `docs.privy.io/recipes/react/seamless-telegram` ✓
- `docs.privy.io/guide/dashboard/telegram` ✓
- `docs.privy.io/authentication/user-authentication/login-methods/telegram` ✓
- `privy.io/blog/building-telegram-apps` ✓
- `docs.privy.io/security/security-faqs` ✓
- `docs.privy.io/security/implementation-guide/content-security-policy` ✓
- `docs.privy.io/recipes/react/cookies` ✓
- `docs.privy.io/guide/react/configuration/allowed-domains` ✓

**Quotes most relevant to TG Web compatibility:**

> "Due to the nature of Telegram's in-app browser, only email login, SMS login, and embedded wallets are supported in Telegram mini-apps." (privy.io/blog/building-telegram-apps)

> "To use your app as a Telegram Mini-App in the Telegram web client, add `http://web.telegram.org` and `https://web.telegram.org` to your allowed domains." (docs.privy.io/recipes/react/seamless-telegram)

> "If you have CSP enforcement, `script-src` must allow `https://telegram.org` to download Telegram's widget script, and `frame-src` must allow `https://oauth.telegram.org` to render Telegram's widget iframe." (docs.privy.io)

> "The Privy iframe enforces that all frame ancestors must be an allowed origin set by an application admin within the Privy dashboard, enforced by both frame ancestor CSP checks and in-code origin validation." (docs.privy.io/security/security-faqs)

**No quote that says "Privy works in TG Web" or "we have tested TG Web." There is no doc page titled "Telegram Web compatibility" or "third-party storage in TG Web" or anything similar.**

---

## Section 5 — Pricing

From [privy.io/pricing](https://www.privy.io/pricing) (verified May 2026):

| Tier | MAU | Price |
|---|---|---|
| Free | 0–499 | $0 |
| Scale | 500–2,499 | **$299/mo** |
| Scale | 2,500–9,999 | **$499/mo** |
| Enterprise | 10K+ MAU, 50K+ signatures, or $1M+ TX volume | **Custom (usage-based)** |

Free tier includes 50K monthly signatures and $1M monthly transaction volume.

**The user's friend's $8K bill in December 2025:** I cannot find a public source confirming a specific $8K bill, but the math is consistent with the Enterprise tier. If you tip over 10K MAU, you move to "custom pricing per transaction or transacting wallet." There are anecdotal reports across web3 dev forums of WaaS providers (Privy and others) issuing 4–5-figure overage bills post-product-market-fit. The pricing page confirms this *can* happen — Enterprise is custom and not bounded.

**For SolShot at 100–10K MAU year 1:**
- 0–499: free
- 500–2,499: $299/mo = **$3,588/yr**
- 2,500–9,999: $499/mo = **$5,988/yr**

That's reasonable for the MAU band you're targeting. But: **once you hit 10K MAU you're in custom-pricing land** and pricing is not predictable. By contrast:
- **Web3Auth (now MetaMask Embedded):** ~$69/mo basic
- **Para:** $200/mo for 2,500 MAU
- **Turnkey:** signature-based, ~$0.001-0.01/sig
- **Dynamic:** $0/mo up to 1K MAU then ~$199/mo (you already have the contract; the issue was technical not financial)

**Verdict on pricing:** Privy is *fine* for year-1 SolShot economics. It's not the best deal, but it's not the disaster the friend's $8K bill might suggest — that's an at-scale problem, not a startup problem. The TG Web compatibility issue is far more concerning than the price.

---

## Section 6 — Verdict

### Q11: Does Privy work on all three TG surfaces?

**NO. Not provably.**

Breakdown by surface:

| Surface | Verdict | Reason |
|---|---|---|
| **TG iOS Mini App (native)** | **Probably yes** | Telegram-iOS WebView since iOS 14 has ITP enabled, but most production Privy+TG examples (Inco, Anomaly, PolyCool) work here. The device-share localStorage issue is mitigated because users typically open the same Mini App from the same TG entry point, and the nested-iframe problem doesn't apply in a native WebView. |
| **TG Desktop (Win/Linux)** | **Likely yes** | Chromium-based WebView, third-party cookies still allowed by default. Native WebView, not nested iframe. No public proof but architecturally fine. |
| **TG Desktop (macOS)** | **Uncertain → likely broken** | WKWebView with ITP on by default. Same iframe-storage-partition issue as Safari. No public testing reports. |
| **TG Web (web.telegram.org)** | **Not proven; high risk of failure** | Customer app loaded as iframe inside web.telegram.org. The Privy `auth.privy.io` iframe is a *grandchild* of web.telegram.org. Browsers (Safari ITP, Firefox TCP, Chrome 3PC-blocked, Brave) partition `auth.privy.io` localStorage per top-level site, breaking the device-share persistence. **No documented Storage Access API workaround in Privy's SDK.** No public production app verified working on web.telegram.org with Privy. |

The user's stated requirement is "TG Web is non-negotiable." On the evidence available, **Privy cannot be confirmed to work on TG Web**. Same architectural class as Dynamic. Probably better edges (explicit web.telegram.org allowed-origin support, parent-domain cookies for auth tokens), but the device-share-in-iframe-localStorage architecture means storage partitioning will bite at least some browser/setting combinations and there is no documented escape hatch.

### Q12: What other options have proof on all three surfaces?

Brutally:

1. **Turnkey** — signs in AWS Nitro Enclaves (TEE) server-side; SDK uses API keys signed client-side. **No iframe**, no third-party storage required. Already documented usage with Telegram Cloud Storage (`window.Telegram.WebApp.CloudStorage`) for persisting the API key. **Bullpen** is a live Solana TG bot built on Turnkey. This is the most architecturally TG-Web-friendly option I found. **Caveat:** still no specific proof of web.telegram.org desktop testing, but the architecture is much more compatible than iframe-based options.

2. **Web3Auth (MetaMask Embedded)** — has a published Telegram Mini App guide with both client-side and server-side setup. Uses MPC with shares stored in different places (one share in browser, one on Auth Network nodes). Browser share is in localStorage on the *customer's app domain* (first-party), not in a Privy-style iframe — so storage partitioning does NOT apply. **However:** their published TG guide is heavily TON-blockchain-focused; Solana support exists but is less of a first-class TMA pattern. Worth investigating.

3. **Phantom Embedded SDK (beta)** — iframe-based again, similar architectural risk to Privy. Phantom's own discussion thread confirms TG Mini Apps require deep-links (no extension support), which means Phantom Embedded would have the same iframe-in-iframe problem. **Skip.**

4. **Openfort** — has a published `sample-telegram-mini-app-Embedded-Wallet`, but the sample is EVM-only; Solana support exists at Openfort but is "EVM-focused today; native smart account support on Solana is not yet available." For a Solana-first product, **skip**.

5. **Custodial-on-server (your own keypair-per-user, server-managed)** — bypasses every browser storage problem because no client-side keys exist. The user has explicitly rejected this in `project_dynamic_decision.md`, but it remains the only architecture with *zero* TG-Web-specific risk.

6. **Roll-your-own MPC with TG `CloudStorage`** — store one key share in `window.Telegram.WebApp.CloudStorage` (synced with TG's account, works in all three TG surfaces by design), one share with your server. This is what Turnkey effectively does, and what some teams (Bullpen) build directly. Most TG-Web-compatible architecture available, but operationally heavy.

**Recommendation order based on TG Web compatibility risk (lowest risk first):**
1. Turnkey (architecturally best fit; verified TG production via Bullpen)
2. Web3Auth/MetaMask Embedded (has explicit TG guide; first-party storage)
3. Custodial server-side keys (only zero-risk option, user has rejected)
4. Privy (better than Dynamic, but same architectural class — risk of TG-Web failure)
5. Para / Dynamic (already burned; do not re-attempt)
6. Phantom Embedded (iframe-based; high TG Web risk)

**Final word:** "Privy is documented to support TG Web" is true. "Privy is proven to work on TG Web with Solana embedded wallet signing in production" is **not** true based on any source I could find. If you ship Privy without testing TG Web in Safari and Chrome-with-3PC-off, you will discover a third failure-after-signup. **Test on web.telegram.org in Safari before committing.**

---

## Sources

Privy official:
- https://privy.io/blog/building-telegram-apps
- https://docs.privy.io/recipes/react/seamless-telegram
- https://docs.privy.io/guide/dashboard/telegram
- https://docs.privy.io/authentication/user-authentication/login-methods/telegram
- https://docs.privy.io/security/security-faqs
- https://docs.privy.io/security/implementation-guide/content-security-policy
- https://docs.privy.io/recipes/react/cookies
- https://docs.privy.io/guide/react/configuration/allowed-domains
- https://www.privy.io/pricing
- https://privy.io/blog/how-privy-embedded-wallets-work
- https://www.privy.io/embedded-wallets-101

Privy-related GitHub issues:
- https://github.com/tauri-apps/tauri/issues/14056 (Privy iframe rejects tauri origin)
- https://github.com/unlock-protocol/unlock/issues/15275 (Privy OAuth fails in nested iframe)
- https://github.com/privy-io/examples (no TG Mini App example, only `privy-node-telegram-trading-bot`)

Stripe acquisition and pricing:
- https://privy.io/blog/announcing-our-acquisition-by-stripe
- https://www.openfort.io/blog/privy-alternatives

Browser storage architecture:
- https://www.smashingmagazine.com/2025/05/reliably-detecting-third-party-cookie-blocking-2025/
- https://muthuvijay.com/blog/2020-05-04-webkit-itp/
- https://privacysandbox.google.com/cookies/storage-access-api
- https://caniwebview.com/features/cookies/

Telegram WebView platform:
- https://core.telegram.org/bots/webapps
- https://docs.telegram-mini-apps.com/platform/about

Competitor / alternative options:
- https://www.turnkey.com/blog/best-solana-wallets-dapp-developers (Bullpen reference)
- https://blog.web3auth.io/unlock-the-power-of-telegram-mini-apps-with-web3auth/
- https://web3auth.io/docs/guides/telegram-miniapp-client
- https://github.com/openfort-xyz/sample-telegram-mini-app-Embedded-Wallet
- https://github.com/thirdweb-example/telegram-mini-app
- https://github.com/orgs/phantom/discussions/266
