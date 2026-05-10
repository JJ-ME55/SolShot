# SolShot — Wallet Architecture Deep Research Brief

> **Audience:** Senior researcher with deep knowledge of Solana wallet
> infrastructure, embedded wallet SaaS, MPC / TEE architectures, browser
> security models, and Telegram Mini App platform constraints.
>
> **Output expected:** A standalone written report that conclusively
> answers the central question below with evidence, then recommends a
> path forward. See §10 for the full deliverable spec.
>
> **Posture:** The founder has burned a full day on three vendors that
> all failed in production. He is correctly skeptical of vendor
> marketing. *"Should work" / "is documented to work" / "the docs say"
> are NOT evidence.* Production apps + verified architecture + reproducible
> behavior are evidence.

---

## 1. The central question

**What is the canonical wallet architecture for a Solana app whose Mini
App must work flawlessly on ALL THREE Telegram surfaces — TG Web
(`web.telegram.org`), TG Desktop (Electron-ish), and TG iOS native — AND
also work as a regular browser web app at solshot.gg?**

Where "work flawlessly" means:
- Wallet provisioning succeeds on first open
- Transaction signing works without redirects out of Telegram
- User has self-custody (or a credible self-custody escape hatch)
- No "this content is blocked" / "page can't be shown" / `ECONNABORTED`
  errors on any of the three TG surfaces

If the founder's incredulity is correct — *"genuinely impossible that
this isn't solved"* — find the existing solution and document its exact
architecture. If it's actually unsolved, document why and what the path
forward looks like.

---

## 2. Project context

**SolShot** is a 1v1 / multi-player artillery game on Solana. Users
wager SOL on match outcomes; the on-chain layer is a custom Anchor
program (already shipped on devnet). The off-chain layer is a CRA React
client + Express + Socket.IO + MongoDB on Render.

User base targeted across:
- **Telegram Mini App** (Web + Desktop + iOS + Android — mandatory parity)
- **iMessage / iOS** (future — extension)
- **Bare browser** at solshot.gg (working today)
- **Solana Mobile (Seeker dApp Store)** (future)

Approximate user split (founder estimate): 50% wagerers / 50%
non-wagerers. Both camps need accounts; only wagerers need a real
Solana wallet for deposits + settlement.

The founder's stated goal: *"a silent wallet experience"* — users
shouldn't think about wallet onboarding for free play, and even
wagerers should have minimal friction.

---

## 3. What we've already tried and ruled out

Document each vendor's failure mode precisely so the researcher can
confirm or refute these claims and avoid recommending the same path.

### 3.1 Dynamic Labs (`@dynamic-labs/sdk-react-core`)

- **Failed on TG Web.** Root cause: Dynamic's WaaS iframe at
  `app.dynamicauth.com/waas-v1/...` is nested inside the customer Mini
  App, which is itself nested inside `web.telegram.org`'s iframe.
  Dynamic's `frame-ancestors` CSP allows the customer's domain but not
  `web.telegram.org`. The grandparent ancestor blocks the iframe.
  Adding `web.telegram.org` to Dynamic's dashboard CORS Origins did not
  reliably propagate to the WaaS iframe's `frame-ancestors` header. Plus
  Dynamic still served `X-Frame-Options: DENY` alongside `frame-ancestors`,
  which some browsers honor over CSP per spec ambiguity.
- Phantom-equivalent self-custody: ✅ user can export private key.
- Worked on TG iOS native (no nested iframe, native WebView).

### 3.2 Para / Capsule (`@getpara/react-sdk`)

- **Failed on TG Web.** Root cause: Para's user-management-client
  (`@getpara/user-management-client`) uses `withCredentials: true` for
  cross-origin requests with a 60-second timeout. Telegram Web's WebView
  partitions third-party storage and blocks third-party cookies by
  default in modern Chrome / Safari / Firefox. Cross-origin requests to
  `api.beta.usecapsule.com` and `api.beta.getpara.com` time out with
  `ECONNABORTED`. The MPC computation client fires 9 retries against
  `mpc-network.beta.getpara.com` (WSS) before giving up.
- Solana key export: ❌ **not supported** for Solana wallets per Para
  docs ("private key export is only available for embedded EVM or
  Cosmos wallets"). Workaround is Para Connect's Backup Kit which
  exposes the user's Para Share, not a Phantom-pasteable Base58 secret.
- Pricing: $200/mo Starter (2,500 MAU), $500/mo Growth (10,000 MAU),
  $1,000/mo Scale (25,000 MAU). Materially cheaper than Privy.

### 3.3 Privy (`@privy-io/react-auth`)

- **Not migrated to**, but deep research determined Privy uses an iframe
  at `auth.privy.io` for device-share storage. Same architectural class
  as Dynamic — nested iframes inside `web.telegram.org` get partitioned
  storage in Safari ITP / Chrome 3PC blocking / Firefox TCP / Brave.
- Solana key export: ✅ `exportWallet()` returns Base58.
- Pricing: $299/mo (500-2,499 MAU), $499/mo (2,500-9,999 MAU).
  Founder's friend hit an $8K Enterprise bill in December 2025 (post-Stripe
  acquisition).
- Production examples on TG Web specifically: NONE found.

### 3.4 thirdweb In-App Wallets

- **Solana not supported in In-App Wallets.** Their In-App Wallet is
  EVM-only. Solana support is server-side API only (`x-secret-key`
  required). Cannot serve as a client-side embedded wallet for SolShot.
- Pricing was attractive ($99/mo + $0.015/MAU).

### 3.5 External wallets via WalletConnect / `@solana/wallet-adapter-react`

- **Works in browser + TG Web + TG Desktop with extensions installed**
  (Phantom, Solflare, Backpack via Chrome/Edge/Firefox extensions).
- **Fails on TG iOS:** native Phantom mobile app is portrait-only,
  SolShot is landscape-only. WalletConnect deep-link flips orientation
  and breaks the game.
- **Fails as silent UX:** users without an extension hit a connect
  modal on first wager. Friction.
- This is the current shipped state of SolShot.

### 3.6 Custodial server-managed wallets (Trojan / Banana Gun pattern)

- **Architecturally works everywhere** — no iframe, no third-party
  cookies, no nested context issues. Server generates Solana keypair,
  encrypts at rest (KMS / envelope encryption), signs on user's behalf.
  User can export private key + withdraw to external wallet at any time.
- **Trade-off:** custodial liability. We hold (encrypted) keys. Hackathon
  judges on Solana / Colosseum tracks may penalize "custodial" framing
  unless explicitly defended with self-custody escape hatches.
- **Production proof:** Banana Gun, Maestro, Trojan all $millions/day
  TG-native, all this pattern.

---

## 4. Hard requirements

Non-negotiable. A solution that fails any of these is a non-starter.

1. **TG Web (`web.telegram.org`) parity with mobile.** No "open the mobile
   app for the full experience" caveats. A user opening the bot's Mini
   App in `web.telegram.org` on desktop Chrome/Safari/Firefox/Edge MUST
   be able to provision a wallet, sign a transaction, and play a wagered
   match without any error toast, popup failure, or feature degradation.

2. **TG Desktop parity.** Same as TG Web — TG Desktop is a separate
   Electron-ish container and may behave differently than TG Web. Verify
   on macOS, Windows, Linux variants.

3. **TG iOS parity.** Native Telegram on iPhone. No orientation flip out
   of TG into a portrait-only wallet app. No "Safari can't open this
   page" errors.

4. **Solana mainnet support** for production. Devnet for testing. Same
   provider must work on both.

5. **Self-custody story** acceptable to a Solana hackathon judge. Either:
   - True non-custodial (user holds key shares / can export raw secret), OR
   - Custodial with **first-class user-export of raw Base58 private
     key** + **withdraw-to-any-address flow**. Banana Gun pattern.

6. **No nested-iframe dependency on third-party domains** for wallet
   provisioning or signing. iframes within iframes (which is exactly the
   TG Web case) are the broken architecture across Dynamic / Privy / Para.
   Either avoid iframes entirely OR find a vendor whose iframes have
   been verified to work in TG Web's nested context with production
   apps as proof.

7. **Build does not require a vendor's permission to work.** I.e. no
   single SaaS provider whose outage breaks 100% of users.

---

## 5. Soft requirements

Preferred but defensible alternatives accepted.

1. **Silent wallet provisioning on first open.** Free players never see
   a "connect wallet" or "create wallet" modal. Wagerers can hit one
   explicit confirmation but nothing more.

2. **Pricing predictability.** Published per-MAU pricing with no
   per-signature, per-tx-volume, or "contact sales" surprise. Solo
   founder budget — $500-1000/mo viable through 10K MAU; $5K+/mo at
   <10K MAU is not.

3. **Active product roadmap.** Vendor is shipping new features, not in
   wind-down. Acquisitions (Privy → Stripe, Dynamic → Fireblocks) are
   neutral; the question is whether the team is still actively
   improving the product.

4. **Open-source SDK** preferred. Closed-source vendor lock-in is real.

5. **Production reference apps on TG Web specifically.** Not just
   "we have customers on Telegram" — actual live bots whose Mini App
   loads cleanly in `web.telegram.org` and provisions a wallet.

---

## 6. Architectural patterns to evaluate

These are the categories the researcher should investigate, not specific
vendors. The vendor list in §7 is examples, not exhaustive.

### 6.1 TEE-based remote signing (Turnkey pattern)

- Wallet keys live inside an AWS Nitro Enclave (or equivalent secure
  enclave) on the vendor's servers.
- Client SDK calls a REST API to request signatures. No client-side key
  material, no client-side iframe.
- Self-custody story: vendor architecturally cannot access the keys
  (TEE attestation), but CAN refuse to sign. Authorization is via API
  key + user authentication.
- **Why this likely works on TG Web:** no nested-iframe storage, just
  HTTPS API calls.
- **Investigate:** is signing latency acceptable for a wagered game's
  deposit flow? Per-transaction cost? Free tier? Does anyone live on
  Solana TG with this pattern?

### 6.2 First-party MPC with customer-domain storage (Web3Auth pattern)

- MPC shares stored in the customer's domain's `localStorage` /
  `IndexedDB` (first-party storage from the browser's perspective).
- No third-party iframe needed for share retrieval.
- **Why this likely works on TG Web:** the Mini App's domain is the
  storage domain — no third-party partitioning issue.
- **Investigate:** Web3Auth's PnP / Single-Factor Auth modes for Solana
  on TG Mini App. Production apps on TG Web specifically.

### 6.3 Roll-your-own MPC with Telegram CloudStorage

- Use `Telegram.WebApp.CloudStorage` API to persist a key share
  client-side (user-bound, TG-native, ~10KB limit per key).
- Server holds the second share. Both required to sign.
- **Pros:** TG-native, no iframe, no third-party cookies.
- **Cons:** operationally heavy. Need to ship our own MPC primitives or
  vendor a library. CloudStorage is TG-only — doesn't help bare-browser
  users.

### 6.4 Custodial server-managed keys with first-class export (Banana Gun pattern)

- Already described in §3.6. Architecturally simplest and most
  surface-compatible. Trade-off is the custodial framing.
- **Investigate:** what does a hackathon-defensible implementation look
  like? KMS setup, audit logging, key rotation, withdrawal cooldowns,
  insurance, jurisdiction. Real costs.

### 6.5 Hybrid: external wallet (Phantom/Solflare) with TG iOS exception

- Default to `@solana/wallet-adapter-react` everywhere it works (browser,
  TG Web, TG Desktop with extensions).
- For TG iOS where mobile wallet apps are portrait-only and break
  landscape, fall back to a different mechanism — could be option 6.4
  (custodial), 6.1 (TEE), or 6.3 (roll-your-own MPC).
- **Investigate:** what production TG-native Solana products do for
  iOS specifically? Do any of them solve the orientation issue cleanly?

### 6.6 New / under-researched options

The researcher should look for any other pattern not in this list.
Candidates worth checking:

- **Stripe Bridge / Stripe Wallets** (post-Privy acquisition; has Stripe
  pivoted Privy's product?)
- **Fireblocks Wallets-as-a-Service** (post-Dynamic acquisition;
  enterprise-focused but might have a startup tier)
- **Coinbase Embedded Wallets** (Coinbase Developer Platform — CDP)
- **Magic Link** (is Solana support real and TG-Web-tested?)
- **Lit Protocol** (PKP / decentralized MPC — does it work in TG?)
- **Zerodev / Alchemy Account Kit** (mostly EVM, but check Solana)
- **Phantom Embedded Wallets** (does Phantom offer their own embedded
  wallet SaaS?)
- **Crossmint Wallets** (multi-chain, has TG examples)
- **Squads / Drift Wallets** (less likely but worth checking)
- **MetaMask Embedded** (formerly Web3Auth; same core, new branding)

---

## 7. Vendor / pattern candidates to specifically investigate

For each, produce a short table answer covering:

| Vendor / Pattern | Solana support | TG Web verified | TG Desktop verified | TG iOS verified | Self-custody story | Pricing | Production proof |
|---|---|---|---|---|---|---|---|

Required candidates:

1. **Turnkey** — TEE-based. Bullpen reportedly live on Solana via Turnkey.
2. **Web3Auth / MetaMask Embedded** — first-party MPC.
3. **Coinbase Embedded Wallets (CDP)** — recent product, Solana TBD.
4. **Phantom Embedded Wallets** — does Phantom have a hosted/SaaS
   embedded option distinct from its extension/mobile apps?
5. **Crossmint** — has Solana + TG examples documented.
6. **Magic** — historically EVM-strong; Solana?
7. **Stripe-era Privy direction** — has the post-acquisition product
   addressed iframe partitioning?
8. **Custodial roll-our-own** — full architecture spec for SolShot's case.
9. **Roll-your-own MPC + TG CloudStorage** — feasibility study.

---

## 8. Required production proof

For any candidate the researcher recommends, they MUST provide:

1. **Live URL of a Telegram bot** whose Mini App can be opened in
   `web.telegram.org` from a desktop browser, provisions a Solana
   wallet, and signs a transaction. Researcher must have personally
   verified this works.

2. **Open-source code** showing how that bot integrated the vendor.
   Either the bot's own repo, or a near-identical reference app from
   the vendor that the researcher confirms behaves the same way.

3. **Screen-recording or screenshots** demonstrating the working flow on
   TG Web. (Researcher's responsibility to capture during verification.)

4. **A documented architectural reason why the vendor doesn't hit the
   nested-iframe / third-party-cookie partition issue.** Quote the
   vendor's own description of their storage / signing model.

If a candidate is recommended without all four, the recommendation is
non-actionable.

---

## 9. Hackathon framing question

Independent of which architecture wins, the report should also answer:

**How should SolShot frame whichever wallet choice is made for hackathon
judges, given that the founder is targeting Solana / Colosseum tracks?**

- TEE-based: "Vendor provides hardware-isolated signing infrastructure;
  user retains authorization control."
- MPC (vendor-hosted): "Threshold signature scheme; no party including
  vendor can unilaterally sign."
- Custodial-with-export: "TG-native UX with first-class self-custody
  escape hatches via export and withdraw."
- External-wallet-only: "Self-custody by design; works on every Solana
  surface."

Each has a defensible story; the research should rank them by judge
appeal for a wagering / consumer game on Solana TG.

---

## 10. Required deliverable structure

Write the report to `Docs/briefs/wallet-architecture-research.md`.

1. **Executive summary** (1 page) — recommended architecture, why,
   single biggest risk, top 3 alternatives ranked.

2. **Verdict on the central question** — yes/no with evidence:
   *"Is there a wallet architecture that provably works on TG Web + TG
   Desktop + TG iOS + bare browser for Solana with hackathon-acceptable
   self-custody?"*

3. **Vendor / pattern matrix** — full table from §7 filled in.

4. **Architectural deep-dive on the recommended choice** — how it works,
   why it doesn't hit our previous failure modes, exact integration
   shape (packages, hooks, server-side requirements), security model.

5. **Architectural rejection notes** — for each of the patterns in §6
   not recommended, why not. One paragraph each.

6. **Implementation cost** — engineering days to integrate, ongoing run
   cost, audit cost, total time to first wagered match on devnet.

7. **Hackathon framing** — answer §9.

8. **Open questions** — anything the researcher couldn't conclude
   without information the founder must provide. Specific questions.

---

## 11. Tone

Skeptical. Show your work. The founder has been burned twice today by
"this should work" answers from vendor docs that didn't survive
production reality. Citations from vendor docs are accepted as
*claims*, not *evidence*. Production reference apps + the researcher's
personal verification + architectural analysis are evidence.

Don't recommend vendors who haven't been tested on TG Web specifically.
Say "untested" rather than "should work."

If the answer is *"there is no clean solution today, here is the
least-bad path forward"* — say that. The founder respects honesty
more than optimism.

---

## 12. Out of scope

- Wallet UX / button styling — separate concern, design layer.
- Specific integration code — the report is architecture + verdict, not
  implementation. Code comes after the architecture is locked.
- Non-Solana chains. Solana-only.
- Telegram bot business logic, group-chat mode, escrow program
  decisions. Those are settled in other briefs.

---

## 13. Stretch goals

If time allows:

- A 30-minute reproducible POC for the recommended architecture: a
  minimal TG Mini App that opens in TG Web, provisions a Solana wallet,
  signs a no-op message. Hosted on a Vercel preview URL the founder
  can click on his phone.
- A "what would it take to fix Dynamic / Privy / Para's TG Web breakage
  at the SDK level?" appendix — sometimes the right answer is "fork the
  SDK and patch it."
