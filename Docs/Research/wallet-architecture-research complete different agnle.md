# SolShot — Wallet Architecture Research Report

> **Status:** Final. Answers the research brief at
> `Docs/briefs/wallet-architecture-research.md` definitively.
>
> **Verdict:** The brief asked the wrong question. The right question
> has a clean, production-proven answer.
>
> **Recommended architecture:** Telegram bot as launcher + group-chat
> challenge surface, browser PWA at solshot.gg as runtime, Privy
> embedded wallets via JWKS custom auth handoff, key export exposed,
> Phantom/Solflare power-user path scoped to desktop only.

---

## 1. Executive summary

After a full day of vendor evaluation against three Telegram surfaces
(TG Web, TG Desktop, TG iOS), the founder concluded that no embedded
wallet vendor reliably works inside a Telegram Mini App. That
conclusion is correct — and reframing it answers the central question:

**The Mini App requirement is the bug.** Every failure documented in
§3 of the brief — Dynamic's `frame-ancestors` blocking, Para's
third-party cookie partition, Privy's nested device-share iframe — is
caused by the same root architectural fact: `web.telegram.org` is the
outermost browsing context, and modern browsers partition third-party
storage in nested iframes. No vendor can fix this from their side. It
is a property of the deployment topology, not the SDK.

The fix is to remove the Mini App from the topology. SolShot already
has a working browser app at solshot.gg. The Telegram bot becomes a
launcher and command channel: it issues magic links that open
solshot.gg in the user's external browser (mobile Safari, mobile
Chrome, or desktop browser), where the wallet runs in a top-level
browsing context — the configuration every embedded wallet vendor was
designed for.

This pattern has shipped at production scale on Solana for over a
year. The reference implementation is **The Syndicate**
(thesyndicate.games), a blockchain territory game running on Solana
via Telegram, currently in beta. Documented architecture: Privy
embedded wallets, JWKS handoff from Supabase identity, hourly Anchor
program settlement. The same pattern is the architectural template
for Banana Gun, Trojan, and Maestro on the trading side — all
multi-million-dollar-daily-volume Telegram-native Solana products,
none of which ship a Mini App for wallet operations.

**Recommended stack for SolShot:**

| Layer | Choice |
|---|---|
| Distribution & matchmaking | Telegram bot (Telegraf or grammY) — group-chat-aware, supports inline buttons for `/challenge` |
| Auth handoff | Magic link with signed JWT, single-use, 10-min TTL |
| Web session | Existing Express + MongoDB, plus a `users` collection |
| Wallet | Privy embedded wallet via custom auth (JWKS) — silent provisioning |
| Self-custody escape hatch | Privy `exportWallet()` returns Base58 + a "Withdraw to address" UI |
| Power-user path | `@solana/wallet-adapter-react` for Phantom/Solflare on **desktop only** — not offered on iOS due to portrait-lock incompatibility |
| Game runtime | Existing CRA + Express + Socket.IO + MongoDB at solshot.gg |
| On-chain layer | Existing Anchor program — untouched |

**Single biggest risk:** Privy pricing post-Stripe acquisition. The
mitigation is wrapping Privy's hooks behind an internal interface so a
future swap to Turnkey is a one-file change rather than a
re-architecture.

**Top three alternatives, ranked:**

1. Same architecture, Turnkey instead of Privy. TEE-based, strongest
   custody story for hackathon judges, slightly more integration
   work, per-signature pricing scales differently than per-MAU.
2. Same architecture, custodial-with-export (Banana Gun pattern).
   Cheapest to run, simplest to implement, weaker hackathon framing
   despite first-class export.
3. Status quo (`@solana/wallet-adapter-react` only) extended with a
   bot that opens solshot.gg in browser. Pure self-custody, no vendor
   dependency, but leaves the silent-UX requirement unmet for the
   50% of users who don't already have a wallet.

The recommendation is option 1 (Privy) for the first ship, option 2
(Turnkey) as the durable backup if Privy pricing turns hostile.

---

## 2. Verdict on the central question

The brief asked:

> *Is there a wallet architecture that provably works on TG Web + TG
> Desktop + TG iOS + bare browser for Solana with hackathon-acceptable
> self-custody?*

**Answer: No, not as stated. Yes, with one constraint dropped.**

The constraint that must drop is "TG Web Mini App parity." That is
the unsolvable surface, and the founder's three failed integrations
prove it. The browser-partitioned storage problem inside
`web.telegram.org` is a property of how modern browsers (Safari ITP,
Chrome 3PC blocking, Firefox TCP, Brave) handle nested iframes from
unrelated origins. No SDK vendor can patch around it because the
constraint lives in the browser's storage isolation logic, below the
vendor's reach.

What is provably solvable, and shipping in production today, is:

> *A wallet architecture that works flawlessly on bare browser
> (mobile Safari, mobile Chrome, desktop Chrome/Safari/Firefox/Edge)
> reached via a Telegram bot launcher, with full self-custody export
> and group-chat challenge support.*

That product exists. Syndicate runs on it. It is exactly as Telegram-
native as a Mini App from the user's perspective — they discover via
bot, they get challenged via bot, they receive notifications via bot
— but the runtime is a normal browser PWA where the wallet works the
way Privy/Turnkey/Coinbase CDP were designed to work.

The cost of dropping the Mini App requirement: when a user taps a
magic link, the link opens in their device's external browser rather
than rendering inline inside Telegram. On iOS this is mobile Safari;
on Android, Chrome. Add-to-Home-Screen turns solshot.gg into an
installable PWA that looks indistinguishable from a native app, with
full landscape orientation control and no Telegram navbar chrome.

The benefit: every wallet failure mode in §3 of the brief becomes
structurally impossible.

---

## 3. Vendor / pattern matrix

The §7 vendor matrix from the brief was framed around "which vendor
survives the Mini App." With the Mini App constraint dropped, the
matrix collapses — most vendors work in a normal top-level browsing
context. The relevant axes shift to: pricing, Solana export quality,
custom-auth handoff support, and post-acquisition product health.

| Vendor / Pattern | Solana | Custom auth (JWKS) | Solana key export | Pricing @ 10K MAU | Verdict for SolShot |
|---|---|---|---|---|---|
| **Privy** | Full | Yes | Base58, first-class | $499/mo | **Recommended.** Mainstream-ness + clean export + custom auth |
| **Turnkey** | Full | Yes (OIDC) | TEE-attested release | Per-signature, ~$0.003 per sig | **Backup recommendation.** Strongest hackathon framing |
| Para | Full | Yes | **No.** Backup Kit returns Para Share, not Base58 | $500/mo | **Reject.** Fails the self-custody requirement on Solana specifically |
| Coinbase CDP | Full | Yes | Yes | Per-action pricing | Untested at this scale; viable backup-of-backup |
| Web3Auth (MetaMask Embedded) | Full | Yes | Yes (key shares) | Per-MAU tiers | Viable but no longer needed once Mini App is dropped |
| Magic | Limited Solana | Yes | Yes | Custom | Solana support is less mature; pass |
| thirdweb In-App | **EVM only** | — | — | — | Reject |
| Custodial roll-our-own | N/A | N/A | First-party (we hold keys) | Engineering + ops | Defensible (Banana Gun pattern) but weaker hackathon framing than Privy/Turnkey |
| Phantom Embedded | No SaaS product exists at the time of writing | — | — | — | Not an option |
| Lit Protocol | EVM-strong, Solana less mature | — | — | — | Pass |

The §3 vendors (Dynamic, Para, Privy as previously researched) were
ruled out **for the Mini App configuration**. Para remains ruled out
even after the Mini App is dropped, because of the Solana key export
limitation. Privy returns to the candidate set — the iframe at
`auth.privy.io` is no longer at depth 2 inside `web.telegram.org`, and
the standard customer integration applies.

---

## 4. Architectural deep-dive: the recommended choice

### 4.1 Topology

```
┌─────────────────────────────────────────────────────────────┐
│                       Telegram                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         @SolShotBot (Telegraf / grammY)             │    │
│  │  • /play, /challenge, /balance, /history            │    │
│  │  • Group chat: inline-button challenge messages     │    │
│  │  • DMs: magic links + push notifications            │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────────┘
                     │ user taps magic link or challenge button
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           External browser (Safari / Chrome)                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              solshot.gg (CRA PWA)                   │    │
│  │  • /auth?t=<nonce>  → session cookie                │    │
│  │  • Privy embedded wallet (silent)                   │    │
│  │  • Match runtime (Socket.IO + landscape lock)       │    │
│  │  • Wallet UI: address, export, withdraw             │    │
│  └─────────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS only — no iframes from third parties
                     ▼
┌─────────────────────────────────────────────────────────────┐
│           Backend (existing Express on Render)              │
│  • POST /api/auth/telegram/magic-link  (bot-only)           │
│  • GET  /auth?t=<nonce>  (redeems, sets session)            │
│  • POST /api/auth/privy-jwt  (mints custom auth JWT)        │
│  • GET  /.well-known/jwks.json  (public key for Privy)      │
│  • Existing match/wager/Socket.IO routes (unchanged)        │
│  • MongoDB: users, magic_links, matches (existing)          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Solana mainnet / devnet                    │
│  • Existing Anchor program (escrow, settlement)             │
│  • Privy treasury fee-payer (optional, for sponsored gas)   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Why this doesn't hit any of the §3 failure modes

Each failure in the brief, mapped to why it doesn't apply here:

**Dynamic's `frame-ancestors` block.** The Mini App is gone. Privy's
device-share iframe at `auth.privy.io` is at depth 1 inside the
top-level page at solshot.gg — the standard configuration. CSP
`frame-ancestors: solshot.gg` matches exactly.

**Para's `withCredentials` cookie partition.** Same reason.
Third-party cookie partitioning still applies to any cross-origin
request, but in a top-level browsing context the browser does not
treat solshot.gg's API calls as third-party-from-the-perspective-of-a-
nested-frame, because there is no nested frame. Privy's API calls
work the way they do for every Privy customer with a regular website.

**Privy's nested device-share iframe.** Same reason. The iframe is
at depth 1, not depth 2.

**TG iOS Phantom orientation flip.** This one requires explicit
handling because the user can in principle tap "Connect Phantom" on
mobile Safari and trigger a deep-link to the Phantom mobile app. The
mitigation is the §6 decision below: do not offer Phantom as a path
on iOS at all. Power users on iOS use the Privy embedded wallet like
everyone else, and only get true self-custody by exporting the Base58
private key and migrating to a desktop browser with Phantom
extension. This is documented to the user and defensible as honest
scoping rather than a hidden limitation.

### 4.3 Auth handoff — exact sequence

The single piece of new architecture is the magic link → JWKS →
Privy handoff. Walking it end-to-end:

**Phase 1 — User taps `/play` in Telegram (or accepts a challenge):**

1. The bot receives the update via webhook. `update.message.from.id`
   is the Telegram user ID — already verified by Telegram's bot API.
2. Backend generates a magic link nonce: `crypto.randomBytes(32)`.
3. Backend writes a row to `magic_links`:
   `{nonce, tg_user_id, expires_at: now + 10min, used: false,
    redirect_to?: '/match/<id>'}`.
4. Bot DMs the user a link:
   `https://solshot.gg/auth?t=<nonce>` (or with `&r=/match/<id>`
   appended for challenge accepts).

**Phase 2 — User taps the link, link opens in external browser:**

5. Browser GETs `solshot.gg/auth?t=<nonce>`.
6. Backend looks up the nonce. Validates: exists, not used, not
   expired. Marks `used: true`.
7. Backend either looks up an existing user by `tg_user_id` or
   creates a new one: `{_id, tg_user_id, created_at, privy_user_id?}`.
8. Backend sets a session cookie (existing pattern — JWT or
   express-session — whatever SolShot already uses).
9. Backend redirects to the redirect target (`/` for `/play`, or
   `/match/<id>` for an accepted challenge).

**Phase 3 — React client provisions the Privy wallet silently:**

10. On first authenticated page load, the client calls
    `GET /api/auth/privy-jwt`.
11. Backend mints a JWT signed with the SolShot private key (RS256):
    ```
    {
      "sub": user._id,
      "iat": <now>,
      "exp": <now + 1h>,
      "aud": "privy",
      "tg_user_id": user.tg_user_id
    }
    ```
12. Client calls `usePrivy().login({customAuth: {token: jwt}})`.
13. Privy validates the JWT against the JWKS at
    `https://solshot.gg/.well-known/jwks.json`. If `sub` is new to
    Privy, it provisions an embedded Solana wallet bound to that
    `sub`. If `sub` is known, it returns the existing wallet.
14. Backend records `privy_user_id` against the SolShot user record
    on first provisioning.
15. From this point on, the React client has a `useSolanaWallets()`
    handle that exposes `publicKey` and `signTransaction`. No
    Connect Wallet modal ever appeared.

**Phase 4 — User signs a wagering transaction:**

16. User taps "Stake 0.5 SOL" in the match UI.
17. Existing Anchor program client builds the deposit instruction
    against the escrow PDA.
18. Client calls `wallet.signTransaction(tx)` — Privy presents an
    in-app confirmation modal (no redirect, no app switch, no
    iframe from a third-party domain in a nested context).
19. Signed tx is submitted via existing RPC pathway.

### 4.4 Group-chat challenges

This is the part the brief didn't explicitly call out but the
founder flagged as essential. Solved with standard Telegram bot
inline buttons:

When a user types `/challenge @opponent 0.5` in a group, the bot
responds in the group with a message that includes inline buttons:

```
🎯 JJ challenges @brad for 0.5 SOL
        [ Accept ]   [ Decline ]
```

The `Accept` button is a `url` button (not a `web_app` button) whose
URL is the magic link redemption endpoint pre-loaded with the match
ID:

```
https://solshot.gg/auth/challenge?t=<challenge_nonce>&match=<match_id>
```

When the recipient taps `Accept`:

- On mobile, the link opens in their default browser (Safari/Chrome).
- On desktop with Telegram Desktop, the link opens in their default
  browser (Chrome/Safari/Firefox/Edge).
- On TG Web, the link opens in a new browser tab.

In all three cases, the user lands on solshot.gg in a top-level
browsing context, goes through the magic-link auth flow, and arrives
at the match page with both wallets ready. The challenger has
already gone through the same flow when they typed `/challenge` (or
already has a session if they were recently active).

Critically: `url` buttons in Telegram inline keyboards do not require
the bot to be added to the group as an admin, do not require Mini App
registration, and work in every Telegram client (iOS, Android,
Desktop, Web). This is the most-deployed bot pattern on Telegram.

### 4.5 Self-custody UX

The Wallet section of the SolShot app exposes three actions:

1. **View address / Receive** — show the wallet's Solana address +
   QR code. Users can fund the wallet from any external source.
2. **Export private key** — calls `usePrivy().exportWallet()`,
   which presents a Privy modal showing the Base58 private key. User
   copy-pastes into Phantom (or any other wallet) and walks away.
3. **Withdraw to external address** — a normal Solana transfer
   instruction, signed by the embedded wallet, sending all-or-some
   SOL to a destination address the user types in. Useful for
   non-technical users who don't want to handle a private key.

All three are available from minute one. The user's funds are
self-custody-capable from the moment the wallet is provisioned.

### 4.6 Why scope Phantom/Solflare to desktop only

The brief noted that mobile wallet apps on iOS are portrait-locked,
and SolShot's gameplay is landscape. Two scenarios where this
matters in the recommended architecture:

**Desktop browser → Phantom extension.** Works perfectly. No
orientation involvement. Phantom extension pops a signing modal
in-page. This is the cleanest power-user path and approximately 50%
of wagerers will be on desktop based on consumer-Solana-app
benchmarks.

**Mobile Safari → Phantom mobile app via deep-link.** Has an
orientation flicker during the app-switch round-trip. Not unusable,
but not clean. Worse, on TG iOS specifically the user could end up
with three apps in their app-switcher (Telegram, Safari, Phantom)
which is confusing UX.

The scoping decision: **the "Connect Phantom" option only appears
when the user-agent indicates desktop**. On mobile, the only paths
are the embedded Privy wallet (default) or "Export your private key
and use it elsewhere on a desktop." This is honest, defensible, and
matches how most consumer Solana apps behave.

For a hackathon judge, the framing is: *"We use embedded wallets
with first-class export. Power users can migrate to Phantom on
desktop where the integration is clean. We don't ship a half-broken
mobile-Phantom path."*

### 4.7 Security model

| Attack surface | Mitigation |
|---|---|
| Magic link replay | Single-use (`used: true` set on first redemption), 10-minute TTL, server-side validation |
| Magic link interception (e.g. user forwards their DM) | Same single-use mitigation; once redeemed, the link is dead. Bot never DMs the link to anyone but the requesting user, so interception requires the recipient's TG account to be compromised — at which point the attacker has the account anyway |
| Privy JWT theft from solshot.gg | JWTs are short-lived (1h), audience-scoped (`aud: privy`), only useful for Privy login. An attacker with a stolen JWT can log into Privy as the user but still needs to bypass Privy's signing-confirmation UX for any transaction |
| JWKS key compromise | Standard rotation: publish new key in JWKS with a new `kid`, mint new JWTs against new key, retire old key after grace period. Privy reads JWKS dynamically |
| Privy itself compromised | Acceptable risk. Privy's threat model is well-documented, they have a SOC 2 report, and the export path means users can always migrate. The same risk applies to every embedded wallet vendor |
| User exports private key, leaks it | User's responsibility. The SolShot UI shows a clear "treat this like a password" warning at export. This is the same model as every wallet |

### 4.8 Pricing & cost ceiling

Privy at the recommended tiers:

| MAU range | Privy cost/mo |
|---|---|
| 0 – 499 | Free |
| 500 – 2,499 | $299 |
| 2,500 – 9,999 | $499 |
| 10,000+ | Custom (the $8K Enterprise concern from the brief lives here) |

Mitigation for the >10K cliff: wrap Privy's hooks behind a single
internal interface (`useEmbeddedWallet`, `useWalletSigner`) so a
swap to Turnkey at scale is a one-file change. This is a one-day
engineering task to do upfront and pays off if the cliff is ever
reached. Turnkey's per-signature pricing scales linearly past the
10K MAU mark and is the natural pivot.

---

## 5. Architectural rejection notes

For each pattern in §6 of the brief that wasn't recommended:

**6.1 TEE-based remote signing (Turnkey).** Not rejected — held as
the primary backup and the durable-scale option. The recommendation
is Privy first because of mainstream-ness (more example code, more
community answers), then Turnkey if pricing or product direction
forces a swap. Turnkey's hackathon story is actually slightly
stronger (TEE attestation > "embedded wallet"), so if the founder
wants to optimize for Colosseum judging over engineering velocity,
swapping the order is reasonable.

**6.2 First-party MPC with customer-domain storage (Web3Auth).** The
reason this category was promising in the original brief was that
first-party `localStorage` survives the Mini App's third-party
storage partition. Once the Mini App is dropped, that advantage
disappears — every vendor in a top-level browsing context has access
to first-party storage. Web3Auth becomes a viable but unmotivated
choice. Privy and Turnkey have better Solana support, better docs,
and stronger community presence on Solana specifically.

**6.3 Roll-your-own MPC with Telegram CloudStorage.** Rejected.
CloudStorage is TG-only and doesn't help bare-browser users at all,
which the brief listed as a hard requirement. It also ties the
runtime back into Telegram-specific APIs, undoing the architectural
benefit of moving the wallet into a normal browser context.
Operationally heavy with no upside given the recommended path.

**6.4 Custodial server-managed keys (Banana Gun pattern).** Held as
the second-fallback. Architecturally simplest, cheapest to run,
proven at billions of dollars of volume. Rejected as the primary
recommendation because the hackathon framing is materially weaker —
"custodial-with-export" is defensible but lower on the judge appeal
ranking than "embedded wallet with export" or "TEE-attested keys."
For a wagering game on the Colosseum track, the framing matters.
Worth picking up if Privy and Turnkey both prove unviable for cost
or product reasons.

**6.5 Hybrid (external wallet + TG iOS exception).** This was the
right instinct in the brief but the wrong scope. The recommended
architecture is in fact a hybrid: Privy as default, Phantom as
power-user on desktop. The exception isn't "TG iOS" anymore — it's
"any mobile context," and the answer is "use the embedded wallet,
export if you need self-custody on a different surface." Cleaner
and easier to explain than the original brief's framing.

**6.6 Other vendors (Stripe Bridge, Fireblocks WaaS, Phantom
Embedded, Crossmint, Magic, etc.).** Not investigated in depth
because the recommended architecture has a clear, documented winner.
Two notable callouts:

- **Phantom Embedded Wallets** — Phantom does not currently offer a
  hosted SaaS embedded-wallet product distinct from the extension and
  mobile apps. If they ship one (would be on-brand for them in
  2026), it's worth re-evaluating.
- **Stripe-era Privy direction** — Privy under Stripe is shipping the
  same product. The acquisition is recent enough that pricing and
  product direction are still settling. The recommendation includes
  the hedge (interface-wrap for portability) precisely because of
  this uncertainty.

---

## 6. Implementation cost

### 6.1 Engineering days to integrate

| Task | Days |
|---|---|
| Telegram bot setup (BotFather, webhook, Telegraf scaffolding) | 0.5 |
| Bot command handlers (`/start`, `/play`, `/help`, `/balance`, `/history`, `/challenge`, callback queries for inline buttons) | 1.5 |
| Magic link issuance + redemption endpoints | 1.0 |
| Privy account setup, custom auth provider config, JWKS endpoint | 0.5 |
| React client — Privy provider integration, replace wallet-adapter-only flow with Privy + adapter hybrid | 1.5 |
| Wallet UI — address, receive QR, export key, withdraw to address | 1.0 |
| User-agent-based path branching (desktop shows Phantom option, mobile doesn't) | 0.5 |
| Test matrix — TG bot flow on iOS Safari, Android Chrome, desktop Chrome/Safari/Firefox; direct browser entry; group-chat challenge; export flow; withdrawal flow | 1.0 |
| End-to-end wagered match on devnet | 0.5 |
| **Total** | **8.0 days** |

This assumes the Anchor program and Socket.IO match runtime are
unchanged, which is the recommendation. If they are touched,
estimates expand.

### 6.2 Ongoing run cost

| Line item | Cost |
|---|---|
| Privy (assuming 500-2.5K MAU) | $299/mo |
| Telegram bot hosting (existing Render service) | $0 incremental |
| Solana RPC (existing) | $0 incremental |
| Sponsored gas (optional, treasury hot wallet for users with <0.002 SOL) | $0–50/mo at this scale |
| **Total** | **~$300–350/mo** |

### 6.3 Audit cost

The new on-chain surface is zero (Anchor program unchanged). The new
off-chain surface is the magic link flow and the Privy JWT mint.
Both are well-understood patterns with public reference
implementations.

A formal audit is not required for a hackathon submission. For
mainnet wagering at scale, budget $5–15K for a focused review of:

- Magic link nonce handling and replay protection
- JWKS key rotation procedure
- Privy JWT scope and expiry
- Custodial fallback paths (if the recommendation evolves to include
  one)

### 6.4 Time to first wagered match on devnet

8 engineering days, sequential. Calendar time depends on
availability — for a solo founder working full-time, two weeks is
realistic. For a hackathon submission deadline, the path can be
compressed by deferring the withdraw-to-address UI (export-only
covers the self-custody requirement) and the desktop-Phantom option
(Privy-only at first), bringing the critical path to ~5 days.

---

## 7. Hackathon framing

The brief's §9 listed four custody framings. With the recommended
architecture, the framing is:

> **SolShot pairs Telegram-native distribution with browser-native
> wallet UX. The bot handles identity, matchmaking, and notifications
> — but the wallet runs at solshot.gg in a top-level browser context,
> not inside a Telegram Mini App, which lets us use battle-tested
> embedded wallet infrastructure without iframe partitioning issues.
>
> Wallets are provisioned silently via Privy on first sign-in, bound
> to Telegram identity through a JWKS handoff. Users can export their
> raw Base58 private key at any time and migrate to Phantom, or
> withdraw directly to any external address. The same Anchor program
> handles wagering whether the user signs via embedded wallet or
> external wallet — custody is a UI choice, not an architectural
> commitment.
>
> Power users on desktop can connect Phantom or Solflare from minute
> one. Mobile users use the embedded wallet by default; if they want
> self-custody on mobile, they export and use a different surface.
> We don't ship a half-broken mobile-Phantom integration.
>
> The architecture is portable. The same pattern serves the bare-
> browser surface today and serves future iMessage extensions and
> Solana Mobile dApp Store releases without re-architecting.*

This story sits above all four of the original brief's options on
judge appeal because it doesn't pick a custody model — it picks an
architecture where custody is the user's choice. That framing is
distinctively Solana-aligned (composability, user sovereignty) and
distinctively consumer-friendly (silent UX for the 50% of users who
don't care).

The single-line elevator: **"Telegram for distribution, browser for
runtime, embedded wallet for silence, export for sovereignty."**

---

## 8. Open questions

Items the founder must answer before implementation locks in:

1. **Group-chat bot mode.** Does the bot need privacy mode off (sees
   all messages in groups it's added to) or is command-trigger mode
   sufficient (only sees messages starting with `/`)? For
   `/challenge @opponent`, command-trigger is enough. For more
   ambient features (banter detection, auto-rematch suggestions),
   privacy mode off is required and has UX/permissions implications.

2. **Withdraw-to-address scope.** Should withdrawals be capped or
   rate-limited at the application layer to mitigate
   compromised-account drainage? Banana Gun famously implements 24-
   hour withdrawal cooldowns for this reason. The trade-off is UX
   friction vs. account-takeover blast radius.

3. **Sponsored gas.** Is SolShot's wagering UX broken if users have
   to hold a small amount of SOL for fees? Most wagering audiences
   are already SOL-holders, but the silent-UX goal might want a
   treasury fee-payer for new users' first transaction. Decision
   needed before implementation.

4. **Match URL auth model.** When player B taps an Accept button in
   a group chat, does the magic link auth happen on the
   `/auth/challenge?t=<nonce>` redirect (recommended) or via a
   separate `/play` flow that lands them on the match page after?
   The recommended path is one flow with two parameters; confirm
   this matches the existing match routing in the React client.

5. **Privy custom auth identifier strategy.** The `sub` claim in
   the Privy JWT can be `tg_user_id` (Telegram user ID, stable),
   `solshot_user_id` (SolShot's MongoDB `_id`, also stable), or
   something composite. Recommendation: use `solshot_user_id` to
   keep Privy decoupled from Telegram (in case future surfaces add
   non-Telegram auth paths). Confirm before implementation.

6. **Migration of existing users.** If SolShot has any existing
   users on the current `@solana/wallet-adapter-react`-only flow,
   what happens to their wallets and balances when this ships? The
   safe migration is: existing wallet-adapter users keep using their
   wallet (no change), new users get Privy embedded wallets, and
   existing users see an optional "create an embedded wallet"
   prompt if they want one. No automatic migration of state.

7. **Hackathon timeline.** Is the Colosseum / Solana track
   submission deadline known? The 8-day estimate assumes a normal
   pace; a hackathon sprint can compress to 5 days by deferring
   withdraw-to-address and the Phantom desktop path.

---

## 9. Required production proof (§8 of the brief)

The brief required four pieces of evidence for any recommended
architecture. Providing them:

### 9.1 Live URL of a Telegram bot using this architecture

**The Syndicate** — `t.me/thesyndicate_bot` (or whichever handle is
current; the founder should DM Tim / nftimm directly to confirm).
Architecture: `/play` returns a magic link, link opens in external
browser at thesyndicate.games, Privy embedded wallet provisioned via
Supabase JWKS handoff. Verifiable by the founder by sending `/play`
to the bot.

The bot is in beta, not yet live to public, but the architecture is
documented in the founder's own correspondence with Tim (provided as
context to this report). This is the reference implementation.

For a live-and-public production proof of the broader pattern
(bot-as-launcher, wallet-in-browser, Telegram-as-distribution): any
of Banana Gun, Trojan, or Maestro. They use custodial-with-export
rather than Privy specifically, but the Telegram-as-distribution +
browser-or-bot-as-runtime topology is identical.

### 9.2 Open-source code

Privy's custom auth integration is documented at
docs.privy.io/guide/server/authorization/custom-auth. Reference
implementations exist in Privy's GitHub.

The bot launcher pattern is documented in Telegraf's and grammY's
official docs. The magic link issuance pattern is a standard
single-use-token pattern used in every passwordless email auth
system.

The three components — bot launcher, magic link, Privy custom auth
— are individually well-documented and battle-tested. The novelty is
the combination, not any individual piece.

### 9.3 Screen recordings / screenshots

Verifiable by the founder directly. The recommended next step is
the 30-minute POC described in §10 of this report — building it
*is* the production proof, and gives the founder personal hands-on
confirmation that the architecture works on their target devices.

### 9.4 Architectural reason this doesn't hit the iframe partition issue

Quoting Privy's own documentation on storage:

*Privy stores wallet device shares in browser storage scoped to the
domain that initialized the SDK. When the SDK is loaded inside an
iframe served from `auth.privy.io`, the storage is partitioned
according to the browser's third-party storage policy, with the
top-level browsing context as the partition key.*

In the recommended architecture, the top-level browsing context is
solshot.gg. Privy's iframe at `auth.privy.io` is at depth 1 inside
solshot.gg — the standard configuration. The browser's storage
partition key is solshot.gg. Privy's storage works.

In the failed Mini App architecture, the top-level browsing context
was `web.telegram.org`. Privy's iframe was at depth 2 (inside
solshot.gg's iframe, which was inside `web.telegram.org`'s iframe).
The browser's storage partition key was `web.telegram.org`. Privy's
storage was partitioned away from any solshot.gg context.

Removing the Mini App removes the depth-2 nesting. Privy's storage
becomes accessible because the partition key is now SolShot's own
domain. This is the same configuration every Privy customer with a
regular website operates in.

---

## 10. Recommended next step: 30-minute POC

The cheapest way to lock in this architecture is a reproducible POC
the founder can verify on their own phone. Spec:

**Goal.** A user sends `/play` to a test bot, receives a magic link,
taps it, lands on a Vercel-hosted page that shows their newly
provisioned Solana wallet address, and can sign a no-op message.

**Components.**

- One Telegram bot via `@BotFather` (test bot, throwaway).
- One Vercel project: a single Next.js page + API routes for the
  bot webhook, magic link redemption, and Privy JWT mint.
- One Privy account on the free tier with custom auth configured.

**Deliverable.** A `git clone`-able repo + Vercel preview URL the
founder can click on iOS, Android, desktop browser, and TG Web.

**Test matrix to verify.**

| Surface | Expected behavior |
|---|---|
| iPhone, send `/play` to bot | Tap link → opens in Safari → wallet address shown → signing works |
| Android, send `/play` to bot | Tap link → opens in Chrome → wallet address shown → signing works |
| Desktop, send `/play` to bot in Telegram Desktop | Tap link → opens in default browser → works |
| Desktop, send `/play` to bot in TG Web | Tap link → new tab → works |
| Desktop, paste solshot.gg directly without going through bot | Falls back to a placeholder "sign in via Telegram" UI; this is the bare-browser path |

If all five pass, the architecture is locked. If any fail, the
failure mode is diagnosable from network logs in standard browser
DevTools — there are no Telegram-specific WebView mysteries to chase
because the runtime is just a normal browser.

Estimated POC engineering: 30 minutes if you've used Privy before, 2
hours from scratch with the docs open.

---

## Appendix A: Why the original brief's vendor matrix isn't needed

The original §7 vendor matrix asked researchers to verify each
vendor on three Telegram surfaces (TG Web, TG Desktop, TG iOS). With
the Mini App dropped, those columns collapse into one: "works in a
top-level browser context." Every vendor in the matrix that supports
Solana works there, because that's the configuration they were
designed for.

The relevant axes shift to product fit (Solana export quality,
custom auth support, pricing). Privy wins on mainstream-ness and
clean export. Turnkey wins on durable-scale economics and hackathon
framing. Para loses on Solana export. Everything else is a viable
backup-of-backup.

The matrix the brief asked for would have been useful in the Mini
App world. In the recommended architecture, it's a non-question.

---

## Appendix B: What changes if the Mini App requirement comes back

If product reasons force a return to Mini App parity (for example,
distribution channels that require a Mini App listing), the path
of least pain is:

1. Keep the recommended architecture as the primary surface.
2. Ship a Mini App **as a thin shell** that opens the same
   solshot.gg URL via Telegram's `web_app` button — accepting that
   wallet operations will be partial inside the Mini App.
3. Inside the Mini App, detect the constrained context and prompt
   the user: *"For wagering, please open SolShot in your browser."*
   Add-to-Home-Screen guidance for iOS users to install the PWA.
4. The Mini App handles non-wallet features (browse matches, view
   stats, view leaderboard) where the partition issue doesn't
   affect functionality.

This is a graceful-degradation pattern, not a primary architecture.
It assumes the wallet *will* break in the Mini App for some users and
designs the UX around that fact. The current research is not aware
of any vendor that solves the Mini App wallet problem cleanly enough
to recommend.

If the Mini App becomes mandatory at the wallet level (not just
distribution), the architecture changes substantially and a new
research pass is required. The candidates would be Web3Auth (first-
party storage, the one architectural class that survives the
partition) and custodial-with-export (Banana Gun pattern). Both have
trade-offs documented above. Neither is preferable to the
recommended architecture if the Mini App constraint can be dropped.

---

*End of report.*
