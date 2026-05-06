# SolShot Wallet Architecture: Skeptical Deep Research Report

*Prepared 3 May 2026. The brief asks for evidence over vendor marketing. Where evidence is thin or missing, this report says so.*

---

## 1. Executive Summary

**Recommended architecture (least-bad, not perfect):** A **Turnkey-based embedded wallet** with three platform-specific "stampers" — `@turnkey/telegram-cloud-storage-stamper` inside the Telegram Mini App, the Turnkey IndexedDB / passkey client at solshot.gg in the bare browser, and `@solana/wallet-adapter-react` as an optional opt-in for power users who already have Phantom/Solflare on desktop. Server-side: a thin Express service (you already run Express) that validates Telegram `initData`, mints sub-organizations on Turnkey, and brokers signing policies. Self-custody: Turnkey supports first-class raw-Base58 export per their Solana docs, and key custody sits in AWS Nitro Enclaves the vendor can architecturally never read.

**Why this and not the others:** It is the only mainstream Solana embedded-wallet stack on the market that ships an officially-maintained Telegram-Mini-App package whose architecture *does not depend on a third-party iframe*. The CloudStorage stamper uses Telegram's first-party `WebApp.CloudStorage` API (it talks to the Telegram parent frame via `postMessage`, not a cross-origin iframe of its own); all signing then happens via plain HTTPS to `api.turnkey.com`. That is the exact opposite of the architecture that broke Dynamic, Privy and Para on TG Web.

**Single biggest risk:** Production-proof for the **TG Web desktop browser** specifically (web.telegram.org loaded in Chrome/Safari/Firefox/Edge on macOS/Windows/Linux) is still thin. Turnkey publishes a working reference Mini App (`tkhq/demo-telegram-mini-app`) and at least one live Solana-on-Telegram product (Bullpen, `bullpen.fi`) builds on Turnkey. Neither has been independently verified by this researcher to load cleanly inside web.telegram.org from a desktop browser. **You should reproduce the Turnkey demo on web.telegram.org as your very first POC step before committing to this stack.** If it fails there, the only path that is *guaranteed* to work on all three TG surfaces is option (4) below — server-managed custodial wallets in the Banana Gun / BONKbot pattern.

**Top three alternatives, ranked:**

1. **Custodial server-managed keys with first-class export (Banana Gun / BONKbot pattern).** Architecturally has zero TG-surface dependency: no iframe, no third-party cookies, no nested context, no client-side key material. Highest probability of "just works" on TG Web. Trade-off is the custodial framing — defendable for a hackathon if you ship export + withdraw on day one.
2. **Roll-your-own 2-of-2 split using Telegram CloudStorage + a server share.** Same surface-compatibility advantage; bigger engineering lift; you ship your own MPC primitives or vendor a small one.
3. **Coinbase CDP Embedded Wallets** if Solana mainnet support and TEE-isolated keys are sufficient — *untested on TG Web*, no production reference Mini App found.

Para, Privy, Dynamic, Magic, and Phantom Embedded are all explicitly **not** recommended for the TG-Web surface — all five depend on a cross-origin iframe in some form.

---

## 2. Verdict on the Central Question

**Is there a wallet architecture that provably works on TG Web + TG Desktop + TG iOS + bare browser for Solana, with hackathon-acceptable self-custody?**

**Conditional yes, with reservations.** The Turnkey + Telegram-CloudStorage-Stamper pattern is the only vendor-supported architecture that:

- Ships an official, currently-maintained Telegram Mini App SDK package (`@turnkey/telegram-cloud-storage-stamper`) and an official reference repo (`tkhq/demo-telegram-mini-app`).
- Has at least one live Solana-on-Telegram product as a customer (Bullpen, per Bullpen's terms of service: *"the App enables User to … more seamlessly establish an account with Turnkey via the use of Turnkey's API"*).
- Architecturally avoids both the nested-third-party-iframe failure mode (Dynamic, Privy, Para) and the third-party-cookie failure mode (Para's `withCredentials` requests to `api.beta.getpara.com`).
- Supports raw-Base58 import/export on Solana — *"we support imports in mnemonics form (for wallet seeds, this is most common) or in base58 format (for single private key import or export)"* — Turnkey docs.
- Falls back cleanly to its IndexedDB / passkey flow at solshot.gg in the bare browser, which Turnkey explicitly markets as a replacement for legacy iframe stampers: *"Authentication via iframeClient() and injected credentials … is now considered deprecated for new integrations."*

**The honest reservation:** "vendor publishes a TMA package + one customer claims to use it" is not the same as "founder has independently reproduced wallet provisioning + Solana signing inside web.telegram.org loaded in desktop Chrome." None of the three sources I located explicitly states "this works inside web.telegram.org's iframe on desktop." The architectural reasoning (no third-party iframe, no cross-domain cookies) is sound and predicts success, but the founder has correctly told us not to accept architectural reasoning as evidence. The stretch-goal POC in §9 is the only way to convert this from "should work" to "verified."

If the POC fails, the answer to the central question becomes a hard **no for fully embedded self-custody, conditional yes for custodial-with-export** — option (4) below — which is what every multi-billion-dollar Solana Telegram product (Banana Gun, BONKbot, Trojan, Maestro) actually shipped before the BONKbot KMS migration in late 2024 / 2025.

---

## 3. Vendor / Pattern Matrix

| Vendor / Pattern | Solana | TG Web verified | TG Desktop verified | TG iOS verified | Self-custody | Pricing | Production proof |
|---|---|---|---|---|---|---|---|
| **Turnkey + TG CloudStorage stamper** | ✅ first-class (Ed25519 in Nitro Enclave) | **Untested by us, architecturally fits**; no nested iframe | Untested, same architecture | Untested, same architecture | ✅ raw-Base58 export per Turnkey docs | $99/mo Pro + $0.01/sig (or $0.10/sig at free-tier overflow); 25 free sigs/mo | `tkhq/demo-telegram-mini-app`; Bullpen.fi names Turnkey in its T&C |
| **Custodial server-managed (Banana Gun / BONKbot pattern)** | ✅ | ✅ trivially (server-side; client never holds keys) | ✅ | ✅ | ✅ if you ship export + withdraw (BONKbot pattern post-2024) | DIY: KMS ~$1/key/mo + AWS infra | BONKbot ($8.2B+ volume), Trojan ($24B+), Banana Gun, Maestro |
| **Roll-your-own 2-of-2 + TG CloudStorage** | ✅ (build it yourself) | ✅ architecturally | ✅ | ✅ | ✅ by construction | ~$0 vendor + 10–20 dev days | None public; you'd be first |
| **Coinbase CDP Embedded Wallets** | ✅ Solana mainnet + devnet | ❌ untested; uses device-local "Temporary Wallet Secrets"; CSP / WebView behavior in nested TG iframe **not verified** | Untested | Untested | ✅ "users maintain complete control … with the ability to export keys anytime" | Pay-as-you-go; 5K free wallet ops/mo | None on TG specifically |
| **Web3Auth / MetaMask Embedded** | ✅ via MPC + Solana provider | ❌ TG Mini App docs are TON-only; no Solana TG TMA reference | Untested | Untested | ✅ private-key export | Free 1K MAW; $69/mo Growth (~3K MAW) | TON Mini Apps (Melon Games, others); Solana TG TMA: none found |
| **Phantom Embedded Wallets** | ✅ | ❌ **iframe-based by design** ("The Phantom embedded wallet lives inside an iframe"); same nested-iframe class as Dynamic | Untested | Untested | Limited; cross-platform Phantom-account model | "Free" (beta) | None; Phantom Embedded is in beta. Separately, Phantom mobile app is portrait-only — confirmed in your own field test |
| **Crossmint** | ✅ smart wallets + custodial wallets | ❌ no TG TMA reference; their web SDK is API-driven; ⚠️ "Non-custodial signers for Solana are not available in production yet since they are undergoing a security audit" | Untested | Untested | Custodial path: yes; smart-wallet path: gated | 1K MAW free; usage-based | No TG TMA reference found |
| **Magic.link** | Limited Solana support; not the focus | Not designed for TG Mini App; Magic Transfer page says *"We currently support the EVM ecosystem … In the future, we plan to support TON and Solana"* | N/A | N/A | EVM-only key export practically | EVM-pricing | None for Solana on TG |
| **Dynamic (now Fireblocks)** | ✅ EVM + Solana | ❌ confirmed broken by founder; post-acquisition focus shifted to TON for TG Mini Apps (March 2026 announcement) | Founder reports same break | Worked (your test) | ✅ key export | ~Pricing varies | Flooz cited by Dynamic; **TON, not Solana**, in TMA context |
| **Privy (now Stripe)** | ✅ via Solana SDK | ❌ relies on `auth.privy.io` iframe with `frame-ancestors` enforcement, plus *"due to the nature of Telegram's in-app browser, only email login, SMS login, and embedded wallets are supported in Telegram mini-apps"* — Privy's own blog. Founder's research correctly flagged the iframe-storage issue. No TG-Web Solana production reference found. | Same | Sometimes works via Telegram-init flow; not on web | ✅ Base58 export for Solana embedded wallets per Privy docs | Free → $299/mo Core (2.5K MAU) → custom; $8K/mo enterprise reports plausible post-Stripe | Hyperliquid, pump.fun (in mobile app, not TG Web), Anomaly Games (TMA) — none verified as working on web.telegram.org |
| **Para / Capsule** | ❌ For Solana, *"private key export is only available for embedded EVM or Cosmos wallets"* per Para docs (founder's finding holds) | ❌ confirmed broken by founder (`withCredentials` 3P-cookie failure) | Untested | Worked (your test) | ❌ for Solana — no Base58 export | $200/$500/$1000/mo tiers | None for Solana on TG Web |
| **thirdweb** | ❌ In-App Wallet is EVM-only; Solana is server-side only | N/A for client | N/A | N/A | N/A | $99/mo + $0.015/MAU | N/A |
| **External wallet adapter (Phantom/Solflare/Backpack)** | ✅ | ✅ when extension installed | ✅ on Desktop (Electron supports extensions only via host browser link-out) | ❌ deeplink flips orientation; portrait-only Phantom mobile app breaks landscape game | ✅ by construction | Free | This is your shipped state |
| **Reown / WalletConnect AppKit** | ✅ | Partial; multiple confirmed bugs about TG Mini App + WalletConnect (e.g. WalletConnect monorepo discussion #4574 "Wallet connect not work on telegram mini app") | Variable | Same orientation problem on iOS | ✅ | Free | TG TMA bot demo published, but issues persist |

---

## 4. Architectural Deep-Dive on the Recommended Choice

### 4.1 What it is

Turnkey is a wallet-infrastructure provider whose distinguishing architectural decision is putting all sensitive cryptographic operations inside **AWS Nitro Enclaves** (a Trusted Execution Environment). Per Turnkey's own documentation:

> *"Turnkey uses AWS Nitro Enclaves, a type of tamper-proof Trusted Execution Environment (TEE), for all sensitive operations. Private keys are never decrypted outside these enclaves, and only you can authorize key usage with your credentials."*

Every API request to Turnkey is **stamped** — signed with a P-256 keypair the client controls — and the enclave verifies the stamp before doing anything with the key. The "stamper" is a swappable client-side component; what changes between platforms is *where the stamping keypair lives*, not how Turnkey's backend works.

### 4.2 The four stamper choices (the design degree of freedom that makes this work for SolShot)

| Stamper | Where the auth keypair lives | Suitable for |
|---|---|---|
| `@turnkey/telegram-cloud-storage-stamper` | Telegram CloudStorage (`window.Telegram.WebApp.CloudStorage`) | TG Web, TG Desktop, TG iOS, TG Android |
| Turnkey `IndexedDbClient` (in `@turnkey/sdk-browser` / `@turnkey/react-wallet-kit`) | Browser IndexedDB, non-extractable WebCrypto P-256 key | Bare-browser solshot.gg |
| Passkey (WebAuthn) | OS keychain via WebAuthn | Optional MFA on solshot.gg; not a fit for TG Web because TG WebView's WebAuthn surface is unreliable |
| Iframe stamper at `auth.turnkey.com` | Sandboxed iframe | **Do not use for SolShot — same nested-iframe failure class as Dynamic/Privy. Turnkey explicitly deprecates this for new integrations.** |

This is the architectural unlock: SolShot does not have to pick "one stamper to rule them all." You pick the stamper *at runtime per surface*. The user's wallet (their Turnkey sub-org) is the same entity across surfaces; only the local authentication keypair differs.

### 4.3 Why this avoids each of your previously documented failure modes

**Failure mode 1 — Nested third-party iframe (Dynamic, Privy, Phantom Embedded, Para):** A cross-origin iframe inside web.telegram.org's iframe inherits `frame-ancestors` enforcement from the innermost iframe, plus partitioned storage in Safari ITP / Chrome 3P-cookie blocking / Firefox TCP / Brave. The TG-CloudStorage stamper does **not** open an iframe. It calls Telegram's first-party `WebApp.CloudStorage.setItem` / `getItem` (a `postMessage` to the Telegram parent frame, not a cross-origin frame load). Subsequent signing is plain `fetch` to `https://api.turnkey.com` — a same-origin XHR from your domain's perspective.

**Failure mode 2 — Cross-origin cookies with `withCredentials: true` (Para):** Turnkey's API is **stamp-authenticated, not cookie-authenticated**. Every request carries a P-256 signature in a header. There are no third-party cookies in the data plane and therefore no Safari ITP / Chrome 3PC / Firefox TCP partitioning to fail.

**Failure mode 3 — `X-Frame-Options: DENY` racing CSP (Dynamic):** No frame is ever loaded from a Turnkey domain in the recommended path, so neither X-Frame-Options nor frame-ancestors is in scope.

**Failure mode 4 — Mobile orientation flip (Phantom mobile deeplink on iOS):** No deeplink. All signing is in-process inside the TG Mini App.

**Failure mode 5 — Solana signing not supported (Para):** Turnkey signs Ed25519 natively. The Solana wallet stamper, transaction parser, and policy engine are first-class and open-sourced.

### 4.4 Concrete integration shape

**Packages**

```
# Mini App (client)
@turnkey/sdk-browser
@turnkey/telegram-cloud-storage-stamper
@turnkey/solana
@solana/web3.js
@telegram-apps/sdk-react       # or twa-dev/sdk

# solshot.gg (client)
@turnkey/react-wallet-kit       # supersedes @turnkey/sdk-react
@solana/wallet-adapter-react    # for power users who connect Phantom
@solana/wallet-adapter-wallets

# Server (your Express app on Render)
@turnkey/sdk-server
@telegram-apps/init-data-node   # to validate Telegram WebApp initData
```

**Boot path inside the Mini App**

1. `<script src="https://telegram.org/js/telegram-web-app.js">` is the first script in the document head — the CloudStorage API depends on it.
2. On first open, the client calls a `/api/auth/telegram` route on your Express server. Server validates `initData` HMAC against your bot token and returns a server-issued JWT.
3. Client checks Telegram CloudStorage at `TURNKEY_API_KEY`. If absent, client calls `/api/wallet/provision` → server uses `@turnkey/sdk-server` to create a new Turnkey **sub-organization** keyed to the Telegram user ID, creates a Solana wallet inside it (`API_KEY_CURVE_ED25519`), and returns a P-256 stamper keypair for the client to install via `TelegramCloudStorageStamper.create({ cloudStorageAPIKey: apiKey })`.
4. Subsequent signing: `TurnkeyBrowserClient` with the CloudStorage stamper signs Solana transactions client-side (the actual Ed25519 signing happens inside Turnkey's enclave; the *stamping* happens in the Mini App).
5. The signed transaction is broadcast via your existing RPC (Helius, Triton, etc.).

**Boot path on solshot.gg (bare browser)**

1. `TurnkeyProvider` from `@turnkey/react-wallet-kit` mounts. On first visit, user authenticates via email-OTP, social login, or passkey through Turnkey's Auth Proxy. The IndexedDB stamper's P-256 key is generated and stored as non-extractable WebCrypto material per Turnkey's documentation.
2. If the same user logs in to solshot.gg from a different surface (e.g. they used the TMA before), Turnkey's sub-organization model lets them recover via email/OTP and access the same wallet.
3. For users who already have Phantom/Solflare on a desktop browser with the extension, present `WalletMultiButton` from `@solana/wallet-adapter-react-ui` as an alternative path — they sign with Phantom directly, no Turnkey involved.

**Server-side requirements**

- Validate Telegram `initData` HMAC on every authenticated request. Treat the Telegram user ID as the canonical user key.
- Store the mapping `{ telegram_user_id → turnkey_sub_org_id → solana_pubkey }` in MongoDB.
- For wagering deposits/settlement: your Anchor program already exists on devnet. The server constructs the unsigned transaction, the client stamps a Turnkey signing request, the signed transaction is returned and broadcast.
- For *server-side* signing (e.g. settling the loser's stake into the winner's wallet via your escrow PDA), use Turnkey's Solana **policy engine** to whitelist the exact program ID, instruction set, and recipient PDA. This means the server-held API key cannot be misused to drain user wallets even if compromised.
- Turnkey Solana Transaction Management (released 2025) auto-handles blockhash refresh and compute-unit sizing — useful for a wagering game where dropped TXs are user-visible.

### 4.5 Self-custody story (what you tell users and judges)

- Default state: **non-custodial, TEE-isolated.** The user's private key is generated inside an AWS Nitro Enclave; even Turnkey cannot read it. SolShot certainly cannot. Authorization to sign requires the stamper key, which lives in Telegram CloudStorage (which the user controls via Telegram's built-in 2FA, account recovery, etc.) on TMA, or in non-extractable IndexedDB / a passkey on solshot.gg.
- Escape hatch: any user can hit "Export key" and Turnkey delivers a **raw Base58 Solana private key** they can paste into Phantom. Same surface that BONKbot ships post-2024.
- Withdrawal flow: build a "Withdraw to address" button on day one. It creates a SOL transfer transaction to a user-supplied address, stamped from the same flow.

### 4.6 Pricing reality check

- Free: 25 signatures / month total.
- Overage on free: $0.10 per signature.
- Pro tier: ~$99/mo + $0.01 per signature (Turnkey published pricing).
- A wagered match has ≥2 signatures (deposit, settlement). A power user playing 50 matches/month = 100 sigs = $1.00 at Pro. 10K MAU * 50 matches = 1M sigs/mo = ~$10K/mo. **At your stated 10K MAU target, expect $300–$1,000/mo through ~2,500 wagering MAU; budget $5–10K/mo at 10K wagering MAU.** Negotiate enterprise pricing once you cross ~50K signatures/month — Turnkey's published copy says it can come down to "$0.0015 per signature" at enterprise volume.

### 4.7 Production proof (with the caveats the founder asked for)

The brief requires three production-proof artifacts. Here is what exists today, and what is still missing.

1. **Live URL of a Telegram bot whose Mini App provisions a Solana wallet via Turnkey on web.telegram.org.** Bullpen (`bullpen.fi`, `@BullpenFi_bot` on Telegram) is the closest match. Bullpen is publicly documented as a Solana-native Telegram product with a Mini App component, and Bullpen's own terms of service state: *"the App enables User to … more seamlessly establish an account with Turnkey via the use of Turnkey's API."* Turnkey's own marketing names Bullpen as a customer using passkey-based wallets on Solana. **Caveat the founder must verify before committing**: I have not personally loaded Bullpen's Mini App in web.telegram.org from a desktop browser to confirm Solana-wallet provisioning succeeds *on that specific surface.* The Bullpen entry in the Entry.fun directory does mention "miniapp UI", and Bullpen's web platform exists at `bullpen.fi`, but I could not confirm via search results that the Mini App opens cleanly inside web.telegram.org desktop. **Mandatory founder action: open Bullpen's Mini App from web.telegram.org on desktop Chrome/Safari/Firefox and confirm wallet provisioning. If it works, that is your existence proof; if it fails, fall back to option (4).**

2. **Open-source code showing the integration.** Turnkey publishes `https://github.com/tkhq/demo-telegram-mini-app` with a working `/bot` (Telegram bot) and `/src` (Next.js Mini App) and explicit code paths for `/auth` and `/wallet`. The README states: *"Under the hood, this Next.js application uses Turnkey's TelegramCloudStorageStamper and Telegram's CloudStorage to create and store API key authenticators. These authenticators enable client-side stamping of requests to Turnkey without exposing credentials to the app developers. Note that this approach does require trusting Telegram's infrastructure."* Today this demo is EVM-flavored in places, but the same stamper drives Solana sub-orgs identically (curveType `API_KEY_CURVE_ED25519` instead of `API_KEY_CURVE_SECP256K1`).

3. **Documented architectural reason it survives nested-iframe / 3P-cookie partitioning.** Turnkey's IndexedDB blog post is direct: *"Authentication via iframeClient() and injected credentials (e.g., from https://auth.turnkey.com) is now considered deprecated for new integrations. These flows required sensitive credential bundles to be delivered via email or OAuth and injected into a sandboxed iframe — a pattern with limited persistence and higher complexity."* In other words, Turnkey itself acknowledges the iframe pattern is the broken architecture and has migrated to first-party storage (IndexedDB on web, CloudStorage in TMA). For the TMA case specifically: the `TelegramCloudStorageStamper` interacts with the host Telegram client via Telegram's documented `WebApp.CloudStorage` API, which is a `postMessage`-based RPC to the Telegram parent frame — not a third-party iframe load. There is no `frame-ancestors` constraint to fail and no third-party cookie to partition.

---

## 5. Architectural Rejection Notes

**Dynamic Labs.** Your reproduction is consistent with the architecture: Dynamic's WaaS frame is served from `app.dynamicauth.com` and rendered as a child iframe inside the customer Mini App, which itself is the child iframe inside web.telegram.org. Dynamic post-Fireblocks has shipped a Telegram TMA recipe (`dynamic-labs-oss/dynamic-telegram-bot`) and a TON-focused embedded-wallet announcement (March 2026). Neither addresses the Solana TG-Web iframe-ancestor failure you reproduced. **Do not retry without an explicit, written confirmation from Dynamic that the WaaS iframe's `frame-ancestors` and `X-Frame-Options` headers permit `https://web.telegram.org` as a grandparent ancestor on every TG Web edge build.**

**Privy.** Privy's own security FAQ confirms the iframe model: *"The iframe enforces that all frame ancestors must be an allowed origin set by an application admin within the Privy dashboard. This is enforced by both frame ancestor CSP checks and in-code origin validation."* Privy's TG Mini App documentation states only that *"due to the nature of Telegram's in-app browser, only email login, SMS login, and embedded wallets are supported in Telegram mini-apps"* — and the founder's research has correctly identified that this guidance is not a TG-Web-on-desktop guarantee. Acquired by Stripe in June 2025; product roadmap focus has shifted toward stablecoin / fiat integration via Stripe Bridge. No verified TG-Web Solana production reference.

**Para / Capsule.** Founder's reproduction is fundamentally architectural and Para has not solved it. Plus: Solana key export does not exist for Para Solana wallets per their own docs. Disqualified on the self-custody requirement alone.

**thirdweb.** Solana support is server-side API only. Disqualified.

**Phantom Embedded Wallets.** From Phantom's own GitHub: *"The Phantom embedded wallet lives inside an iframe."* Same architectural class as Dynamic and Privy. Currently in beta. Even if it shipped tomorrow with TG-Web fixes, there is no production proof. Phantom's own docs say: *"Eager connecting is not supported in cross-origin iframe contexts."* That is a near-explicit warning for the SolShot use case.

**Crossmint.** No TG Mini App reference. Their Solana smart-wallet path is currently flagged as *"Non-custodial signers for Solana are not available in production yet since they are undergoing a security audit."* Their custodial-wallet path could in principle work as a server-side-only solution but loses the embedded-wallet benefits and adds a vendor.

**Magic.link.** Their own Magic Transfer pages confirm Solana support is roadmap, not shipped. Out.

**Web3Auth / MetaMask Embedded.** Their published TG Mini App tutorials are explicitly TON-blockchain examples, not Solana. The MPC ceremony plus social-login flow is fine on bare browser, but I found no live Solana TG Mini App built on Web3Auth as a production reference. The MPC client also depends on cross-origin requests to Web3Auth's Sapphire network nodes (`*.web3auth.io`) — a class of cross-origin behavior that has not been demonstrated as TG-Web-safe. Worth a 30-minute trial but not the recommended primary stack.

**Coinbase CDP Embedded Wallets.** GA'd in October 2025 with Solana support. Architecture stores keys in TEEs server-side with device-specific "Temporary Wallet Secrets" stored locally. Architecturally promising and there is no obvious TG-Web breakage in the documented model. **Untested.** No production TG Mini App reference. Worth a 30-minute trial as a fallback to Turnkey.

**Reown / WalletConnect AppKit.** Has a TG Mini App integration page, but multiple open issues exist around WC + TMA reliability (e.g. `WalletConnect/walletconnect-monorepo` discussion #4574 *"Wallet connect not work on telegram mini app"*). Treat as an additional adapter for the bare-browser path, not the primary TMA stack.

**Lit Protocol PKP.** Decentralized MPC; high engineering cost; no known Solana TG Mini App in production; latency concerns for a wagering flow. Not recommended as primary.

**ZeroDev / Alchemy Account Kit.** EVM-focused. ZeroDev's own SDK uses a Turnkey iframe under the hood for export (`exportIframeStamper`) — even if Solana arrived tomorrow, the iframe pattern resurfaces. Skip.

**Stripe-era Privy.** No public evidence the Stripe acquisition has resolved iframe partitioning on TG Web. The only Stripe-flagged direction is fiat-rails / stablecoin integration. Same recommendation as base Privy: avoid for SolShot.

---

## 6. Implementation Cost

These estimates are for a solo founder who already has the Anchor program shipped on devnet and has a working CRA / Express / Mongo / Socket.IO stack.

| Item | Estimate |
|---|---|
| **Turnkey path (recommended)** | |
| Account setup + parent org provisioning | 0.5 day |
| Server: validate Telegram initData + create sub-org per user | 1 day |
| Mini App: TelegramCloudStorageStamper boot + provisioning + signing | 2 days |
| solshot.gg: react-wallet-kit + IndexedDB + email/passkey login | 1.5 days |
| Connect Phantom-extension fallback path on solshot.gg + TG Desktop | 0.5 day |
| Wire Turnkey Solana signing into existing wager flow | 1 day |
| Withdraw-to-any-address + Export-Base58 surfaces | 1 day |
| Solana policy-engine setup (whitelist your Anchor program ID, deny everything else) | 1 day |
| Cross-surface QA (TG Web Chrome/Safari/Firefox/Edge × Mac/Win/Linux, TG Desktop, TG iOS, bare browser, TG Android) | 2–3 days |
| **Subtotal** | **10.5–11.5 engineering days** |
| Ongoing run cost @ <2.5K MAU | $99/mo Turnkey Pro + ~$50–200/mo signature overage |
| Ongoing run cost @ ~10K MAU all wagering | $300–$1,000/mo, then negotiate enterprise |
| Audit cost | $0–$5K. Turnkey is SOC2 + has third-party TEE audits; you don't ship key code, so a code audit on the integration is light. Engage a Solana-specialist auditor (OtterSec, Sec3, Halborn) for the *integration shape* and policy rules, not for the wallet itself. Quote ranges $3K–$8K for a 3–5 day review. |
| **Total time to first wagered match on devnet using Turnkey** | **~2.5 weeks of solo-founder work**, of which ~1 week is QA across surfaces |
| | |
| **Alternative: Custodial roll-our-own (Banana Gun / BONKbot pattern)** | |
| AWS KMS setup with Ed25519 (Solana) — note KMS supports secp256k1 natively but Ed25519 requires either external import + envelope encryption (encrypt seed at rest with KMS-managed AES-256, decrypt in process memory at sign time) **or** a third-party HSM. Most TG bots use envelope encryption. | 2 days |
| Signing service (isolated process, mTLS to web tier) | 2 days |
| Per-user keypair generation + DB (encrypted at rest in Mongo Atlas + envelope key in KMS) | 1 day |
| Withdraw + export private key (Base58) flows behind 2FA | 2 days |
| Audit logging + WAF + rate-limiting | 1 day |
| Server-side wager flow integration | 0.5 day |
| QA (less per-surface complexity because the wallet is server-side) | 1 day |
| **Subtotal** | **~9.5 engineering days** |
| Ongoing run cost | KMS ~$1/key/mo for envelope master keys (you only need a small number), AWS infra, Mongo. Realistically $50–$200/mo at <10K MAU. |
| Audit cost | **Higher** — $5K–$20K because the security boundary is your code. A Solana-specialist auditor must review key generation, encryption-at-rest, signing-process isolation, and withdrawal flows. |
| Insurance | Optional but advisable at the $1M+ TVL level: ~$5K–$30K/yr through Nexus Mutual or similar. Not realistic at the hackathon stage; document as a roadmap item. |

**Either path gets you to a wagered devnet match in roughly the same time. Turnkey is lower audit liability; custodial roll-your-own is lower ongoing vendor risk.**

---

## 7. Hackathon Framing

Solana / Colosseum judges have seen every wallet pattern shipped. The framing that wins is *truthful and matches what your code actually does.* Below is how each pattern can be defended; I rank them from most to least judge-friendly for a wagering consumer game:

1. **External-wallet-only (Phantom et al. via wallet-adapter).** *"Self-custody by design. SolShot never touches user keys; signing happens in Phantom; deposits go to a user-controlled wallet that interacts with our Anchor escrow."* Highest judge appeal architecturally. **But this is the failed state for SolShot's TG iOS surface (orientation flip) and is a non-starter for the silent-onboarding goal.** Don't pretend you ship this if you don't.
2. **TEE-based (Turnkey).** *"Wallet keys live inside AWS Nitro Enclave hardware. Even Turnkey cannot read the user's key — verifiable via remote attestation. Authorization requires the user's stamper key, which lives in Telegram CloudStorage on TMA or non-extractable WebCrypto IndexedDB on web. The user retains full export to Phantom-compatible Base58 at any time, and our Solana policy engine restricts our server-held API key to the SolShot program — so even our backend cannot drain user funds."* This is the strongest defensible framing for a consumer Solana app on Telegram in 2026. Bullpen has used a similar story successfully. Judges who have seen Banana Gun and BONKbot's evolution toward non-custodial KMS will recognize this pattern as the gold standard.
3. **Vendor-hosted MPC (Web3Auth, Privy).** *"Threshold signature scheme; no party including the vendor can unilaterally sign."* Defensible; less differentiated; opens the door to the iframe-failure objection if you mention TG. Recommend not to use this framing because it doesn't match the architecture you'd actually ship.
4. **Custodial-with-export (Banana Gun pattern).** *"TG-native UX with first-class self-custody escape hatches via raw-Base58 export and unrestricted withdraw-to-any-address from day one. Industry-standard model used by every multi-billion-dollar Solana Telegram product. Keys are protected in AWS KMS-backed envelope encryption with hardware HSM key wrapping, audit-logged, and rate-limited."* Honest, judges understand the trade-off, and BONKbot's 2024–2025 KMS migration to "intent-based wallet" + 2FA + private-key export is direct prior art. This is the *least sexy but most defensible fallback if the Turnkey POC fails on TG Web.*

**Recommended public framing language for the hackathon submission:**

> "SolShot uses Turnkey's TEE-isolated signing infrastructure with platform-specific authentication: Telegram CloudStorage in-Mini-App, IndexedDB and passkey on web. User keys are generated in AWS Nitro Enclaves and never decrypted outside. Authorization is gated by user-controlled stamper keys; the SolShot server is bound by Turnkey's Solana policy engine to sign only escrow-program instructions. Users can export raw Base58 to Phantom and withdraw to any wallet at any time."

---

## 8. Open Questions for the Founder

These are the items the researcher cannot resolve from public sources. They are blocking; please answer or test them before committing engineering days.

1. **TG Web reproduction of Bullpen.** Open `bullpen.fi`'s Telegram Mini App in web.telegram.org from a fresh desktop Chrome profile. Does the wallet provision? Does signing complete? If yes, that is the existence proof. If no, default to the custodial path.

2. **Same test against `tkhq/demo-telegram-mini-app`.** Clone, deploy the Next.js app to Vercel, point a test bot at it, open in web.telegram.org from desktop. Convert the EVM hooks to Solana (curveType `API_KEY_CURVE_ED25519`, `@turnkey/solana` signing module). Does the Solana sub-org create cleanly? Does signing a devnet TX succeed?

3. **Telegram CloudStorage reliability on TG Web specifically.** Telegram's published spec: 1024 keys per bot per user, 128-char key names, 4096 chars per value, 5 MB device storage and 10 secure-storage items. The CloudStorage API itself has been generally available for over a year, but I did not find an explicit operator post-mortem for CloudStorage failures on web.telegram.org. The Turnkey demo's README explicitly says *"this approach does require trusting Telegram's infrastructure."* If Telegram CloudStorage is ever cleared (e.g. a user logs out and back in), the user's stamper key is lost — they have to recover via email/OTP through Turnkey. Confirm with Telegram support whether CloudStorage values persist across web.telegram.org sessions and across device migration.

4. **Solana policy engine match for your Anchor program.** You'll need to write a Turnkey policy that allows signing only when the transaction's instructions all target your specific program ID and your specific PDAs. I cannot draft this without the deployed mainnet program ID and the list of instruction discriminators (deposit, settle_winner, refund, etc.). Please provide.

5. **Whether SolShot needs *guest* (no-Telegram-account) play.** If yes, Telegram CloudStorage does not exist outside the TMA, and the bare-browser path becomes the *only* path for that user — fine if they always come back to the same browser, awkward if they switch devices. Turnkey's email/OTP recovery works but is friction.

6. **Bullpen's verified TG Web compatibility.** A direct Twitter/X DM to Bullpen's team or a glance at their support channel for "TG Web works?" would shortcut item (1).

7. **Hackathon track timing.** Colosseum's submission cadence and the specific track judging criteria for "Mobile / Consumer" vs "Gaming" matter for framing. Confirm your target track and deadline so the framing language can be tuned.

8. **Is custodial-with-export truly off the table?** If the Turnkey POC takes more than a week to validate, the honest answer for SolShot might be "ship the Banana Gun pattern for the hackathon, migrate to Turnkey post-hackathon." That is what every successful Telegram-native Solana product did. Confirm whether you would accept that path under time pressure.

---

## 9. Stretch Goal: 30-Minute Reproducible POC for Turnkey on TG Web

```
0:00 — Create a Turnkey account at app.turnkey.com. Note your parent org ID + create an Auth Proxy config for "telegram + email" auth.
0:05 — Clone tkhq/demo-telegram-mini-app. cp .env.example .env and fill: TURNKEY_API_PUBLIC_KEY, TURNKEY_API_PRIVATE_KEY, NEXT_PUBLIC_ORGANIZATION_ID, NEXT_PUBLIC_BOT_USERNAME.
0:10 — In src/app/api/createSubOrg edit curveType from API_KEY_CURVE_SECP256K1 to API_KEY_CURVE_ED25519 and adjust DEFAULT_*_ACCOUNTS to a Solana wallet account. Replace @turnkey/sdk-browser EVM signing with @turnkey/solana TurnkeySigner.
0:20 — Deploy the /src directory to Vercel. Note the URL.
0:22 — Create a bot via @BotFather, /setdomain → your Vercel URL, /newapp pointing to the same URL.
0:25 — Open web.telegram.org from a fresh desktop Chrome profile. Open the bot. Click "Open App."
0:27 — Confirm: (a) provisioning succeeds without ECONNABORTED, (b) wallet pubkey appears, (c) a devnet transfer transaction signs and broadcasts.
0:30 — If yes: Turnkey is the path. If no: capture exact console error + network panel + go to option (4).
```

If you also want a Sanity check on the bare-browser path: scaffold any Next.js app, install `@turnkey/react-wallet-kit`, wrap with `TurnkeyProvider`, and call `handleLogin()`. This gives you the IndexedDB stamper path used at solshot.gg — confirm it works on Chrome, Safari, Firefox.

---

## 10. Stretch Goal: What Would It Take to Fix Dynamic / Privy / Para on TG Web?

The honest answer is *redesign the wallet client*, not patch the SDK. Specifically:

**Dynamic.** Would need to remove the third-party WaaS iframe from the critical path entirely — i.e. ship a stamper that lives in IndexedDB on the customer's domain, exactly like Turnkey did when it launched its IndexedDB client. Until and unless Dynamic ships a non-iframe primary client, no CSP / dashboard tweak will fix the nested-iframe problem. Adding `web.telegram.org` to the WaaS frame's `frame-ancestors` is necessary but not sufficient (the X-Frame-Options spec ambiguity bites in some browsers). Not actionable on the founder's timeline.

**Privy.** Same architecture, same fix needed. Privy's own security FAQ confirms the iframe is core to their threat model. They would need to ship a non-iframe authentication and signing path for TG Mini Apps. There is no public roadmap commitment to this. Privy's own blog explicitly tells TMA developers to use `email login, SMS login, and embedded wallets` only — i.e., sidestep the OAuth flows that require the iframe — but the embedded-wallet *signing* path still uses the iframe. Not actionable.

**Para.** Two compounding problems: (a) `withCredentials: true` cross-origin requests fail on Safari ITP / Chrome 3PC blocking when the request is from a Mini App context, and (b) Solana wallets don't have key export. Para would have to (i) move auth to bearer-token in a header (no cross-origin cookies) and (ii) ship Ed25519 export. Both are doable but neither is on Para's published roadmap as of this writing. Not actionable on the founder's timeline.

---

## 11. Caveats

This report makes architectural predictions ("Turnkey + CloudStorage stamper does not depend on a third-party iframe and therefore should not exhibit the failure modes Dynamic / Privy / Para showed") that the founder has correctly told us not to take as proof. Architectural reasoning is **not** the same as a verified production deployment in web.telegram.org loaded from desktop Chrome. The single most important next step is the 30-minute POC in §9. If that POC fails, the recommendation in §1 changes — fall back to the custodial Banana Gun pattern.

Bullpen is identified as the closest-to-production reference for the recommended architecture, but this researcher has not personally verified Bullpen's TG-Web behavior. Treat that data point as suggestive, not conclusive.

Pricing for Turnkey, Privy, Para, and Dynamic is published-list pricing as of the search date; enterprise customers report negotiable rates and the Privy $8K/month enterprise number is a single anecdotal report from the founder, not a published list price.

Telegram Mini Apps is itself a moving target. Telegram has shipped major surface changes during the period covered (DeviceStorage, SecureStorage, fullscreen, landscape mode). Some of these reduce reliance on CloudStorage in ways that could simplify the stack — for instance, Telegram's `SecureStorage` (10 items, OS Keychain / Android Keystore-backed) is a *better* place than CloudStorage to keep a wallet stamper key. The Turnkey TG stamper does not yet wrap this; you may want to fork and migrate. Track Telegram's bot/webapp release notes for changes.

The founder's previous-vendor failure descriptions (Dynamic, Privy, Para) are consistent with what is publicly documented about those vendors' architectures and with known browser behavior in nested cross-origin iframes. Treat them as confirmed.

Solana mainnet vs devnet: every recommendation in this report works identically on both. Turnkey's policy engine, signing, and sub-org model are network-agnostic; you switch by changing the RPC endpoint your client uses. Confirmed in Turnkey's own docs and the StackBlitz demo.

Finally: the recommendation is "least bad," not "perfect." There is no architecture in the Solana-on-Telegram space today that has been independently *and* publicly verified by a multi-customer cohort to work flawlessly across web.telegram.org desktop, TG Desktop on three OSes, TG iOS native, TG Android native, *and* a bare browser, *and* offer non-custodial keys *and* sub-second signing *and* sub-$0.02 per signature. You are picking the option whose architecture *could not break in the same way the previous three vendors did,* and whose vendor has shipped the package and the demo. The remaining risk is empirical — go reproduce.