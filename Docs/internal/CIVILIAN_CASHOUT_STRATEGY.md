# Civilian Cash-Out Strategy

**Author:** JJ + Claude (2026-05-29)
**Status:** Strategy doc — V1 launch path defined, V3 path locked, V2 left open
**Related:** [V3_ARCADE_ECONOMY_NORTH_STAR.md](V3_ARCADE_ECONOMY_NORTH_STAR.md), [V1_LAUNCH_SPRINT.md](V1_LAUNCH_SPRINT.md), [project_v1_mainnet_scope.md](project_v1_mainnet_scope.md)

---

## 1 — The scenario

JJ was hyping SolShot to a friend and described the following user journey:

> Five friends are in a Telegram group chat. They all want to play SolShot. They each
> put **£5 in via Apple Pay** (we have MoonPay integration so this works today). The
> 5 stakes go into the on-chain escrow PDA as ~£25 worth of SOL. They play a
> 5-player wagered match. The winner takes the 90% pot — roughly **£22.50 of SOL**.
>
> Now the winner has SOL in a wallet they don't really know how to use.
>
> What's the path back to real money? Or to "real-world value" of any kind?
> Do they need to do KYC on a CEX? Can Privy do off-ramp? Is there a slicker
> answer that doesn't make them feel like they're navigating crypto?

This is the **civilian onboarding gate**. Until this loop closes, SolShot is a product
for people who already have wallets — not for the non-crypto mass-market we're
ultimately building for. Solving it is mass-market gating.

### Why it matters more than a UX detail

- **The civilian asks "where's my £22?" within 30 seconds of winning.** If the answer
  is "open a Kraken account, do KYC, send your SOL, sell, withdraw to bank, wait 3
  days" they leave. Permanently. They will not come back to play another match.
- **The 5-friend scenario is exactly the viral loop SolShot relies on.** One winner
  cashing out cleanly = 4 losers who saw it work = 4 more people on-boarded to play
  the next group. One winner trapped in crypto-confusion = the whole group's first
  experience curdles.
- **It's the single biggest leverage point on retention** between "fun crypto toy"
  and "real consumer product".

---

## 2 — Options analyzed

Four paths exist. They differ wildly in engineering cost, regulatory burden,
UX quality, and time-to-ship.

### Option A — No off-ramp (the cop-out)

User wins, sees SOL balance in wallet. We give them no in-app path to cash out.
They Google "how to sell SOL UK" and figure it out themselves (CEX, Kraken,
Coinbase, etc.). Privy's wallet UI lets them export their seed phrase if they
really want.

| | |
|---|---|
| Eng cost | Zero |
| Regulatory burden | Zero (we're not the cash-out operator) |
| Civilian UX | Brutal. ~80% of non-crypto users drop here. |
| Ship-by-launch? | Yes (it ships by doing nothing) |
| Verdict | **Acceptable as fallback. Not acceptable as primary.** |

### Option B — Privy off-ramp via MoonPay Sell

Privy SDK natively supports off-ramp via MoonPay, Coinbase, Ramp Network,
Coinflow, Hifi, Bridge. The cleanest fit given we already use MoonPay for
on-ramp is **MoonPay Sell**: user clicks "Cash out", MoonPay widget opens
in-app, they do one-time KYC, connect a UK bank, MoonPay buys their SOL,
sends GBP to bank within 1-3 working days.

| | |
|---|---|
| Eng cost | ~half day (Privy hook + button + Sell URL config) |
| Regulatory burden | Zero on us (MoonPay is the regulated entity) |
| Civilian UX | Workable, but: KYC friction (5 min upload), 3-5% fees, 1-3 day settlement, ~£20-30 minimum |
| Ship-by-launch? | Yes if prioritized |
| Verdict | **Solid for users who want fiat. But KYC + wait is still a wall.** |

### Option C — Gift card redemption via Bitrefill / Coinsbee deep-link

User has SOL in their Privy embedded wallet. We add a "Cash out for gift
cards" button that deep-links to **Bitrefill** (or Coinsbee) with the user's
wallet address pre-filled. Bitrefill / Coinsbee accept **SOL as a native
payment method** — the user picks a gift card brand (Amazon UK, Just Eat,
Steam, Argos, Spotify, hundreds more), pays in SOL via the `solana:` URI
scheme that Privy handles natively, and receives a gift card code by email
within seconds.

| | |
|---|---|
| Eng cost | **~20 minutes** (button + URL deep-link + affiliate UTM) |
| Regulatory burden | **Zero** (Bitrefill is the merchant of record, not us) |
| KYC for users | **None under ~$1000** (Bitrefill threshold) |
| Civilian UX | **Excellent.** ~60 seconds end-to-end. No bank, no wait, instant Amazon code. |
| Ship-by-launch? | **Yes.** Highest-leverage UX add we can land today. |
| Affiliate revenue | ~2-5% commission on every redemption (Bitrefill Business partner program) |
| Brand control | User briefly leaves SolShot for Bitrefill checkout |
| Verdict | **Recommended primary V1 cash-out path.** |

### Option D — V3 in-app Tickets shop (the dream)

Per [V3_ARCADE_ECONOMY_NORTH_STAR.md](V3_ARCADE_ECONOMY_NORTH_STAR.md), the
long-term answer is a curated in-app shop where players spend **Tickets**
(arcade-wide currency, buyable but never sellable) for:

- Low tier: cosmetics, badges, name colours (soulbound, free for us to emit)
- Mid tier: in-game currency conversions, premium passes
- High tier: real-world prizes (gift cards, USDC, scarce NFTs — capped supply)

Tickets are earned through play (participation floor + leaderboard bonus) and
purchased via Apple Pay → SOL → Tickets swap. The shop is administered
(fixed inventory, fixed prices, weekly resets) — NOT a market.

| | |
|---|---|
| Eng cost | Multi-week build (shop UI, inventory mgmt, gift-card supplier integration via Tillo/Tango/Runa, treasury solvency monitoring, regulatory review) |
| Regulatory burden | **Significant** — buyable Tickets + USDC prizes + leaderboards next to SOL wagering can look like gambling/sweepstakes. Hard gate before ship: legal advice required. |
| Civilian UX | **Best possible.** No app exit, fully branded, single currency, instant redemption. |
| Ship-by-launch? | No — locked to V3 per north star |
| Verdict | **Right answer for the long-term. Wrong horizon for this week's launch.** |

---

## 3 — Recommendation

**Ship the stack:**

| Phase | Primary cash-out path | Secondary |
|---|---|---|
| **V1 launch (today)** | Option C — Bitrefill deep-link | Option A — manual wallet export |
| **V1.x (weeks 2-8)** | Option C, add Option B as a "withdraw to bank" alt for users who specifically want cash | Option A |
| **V2 (5+ player escrow)** | Same as V1.x | Option A |
| **V3 (arcade economy)** | Option D — in-app Tickets shop | Options B + C remain available |

The strategic logic:

1. **Option C closes the civilian story today** with ~20 min of engineering and zero
   regulatory exposure. It's the gateway to "your friend's 5-player TG scenario actually
   works" — which is the use case JJ is using to pitch the product.
2. **Option B is a quality follow-on** for users who specifically want fiat to bank
   (corporate gifters, professionals). KYC + bank settlement is a fine UX for *that*
   audience, just not the casual £5 player.
3. **Option D remains the long-term aspiration** because (a) brand control is
   strategically valuable, (b) the affiliate-cut margin on Bitrefill is small vs
   capturing full retail margin in-house, and (c) cross-arcade Ticket utility
   creates network effects across SolShot, Basketball, Keepie-Uppies, etc.
4. **Option A stays available always** — power users will always want raw wallet
   export to send to a CEX. Not removing it.

The right framing for **today's launch tweet / Discord / press**:

> "Cash out instantly to 600+ gift cards (Amazon, Steam, Just Eat, Spotify...).
> Or send to any wallet. Or, if you've earned more than you expected, MoonPay's
> bank withdrawal is one click away."

That's a more complete story than any single Solana wager product has today.

---

## 4 — Technical implementation: Option C (Bitrefill deep-link)

### 4.1 — Partner program setup (JJ does this)

1. Sign up at https://www.bitrefill.com/business
2. Choose **Affiliate / Referral Partner** (vs reseller/API which is heavier)
3. Get the affiliate ID — looks like `?utm_source=solshot-XXX`
4. Note the commission tier (2-5% depending on volume)
5. Optionally request a custom landing page with SolShot branding

Coinsbee has an analogous program at https://www.coinsbee.com/en/business. JJ
can sign up for both and A/B which one converts better. Default to Bitrefill in
the UI because its UX is slightly tighter (single-page checkout + better mobile).

### 4.2 — Deep-link URL construction

Bitrefill supports URL params for pre-filled checkout state. The minimum
construction:

```js
const cashOutToBitrefill = (walletAddress) => {
    const params = new URLSearchParams({
        paymentMethod: 'solana',           // tell Bitrefill to default to SOL
        utm_source:    'solshot',           // base attribution
        utm_medium:    'in-app-cashout',    // distinguish from other links
        utm_campaign:  'v1-launch',         // bumpable per launch phase
        // affiliate ID — replace with the real one after partner signup
        ref: process.env.REACT_APP_BITREFILL_AFFILIATE_ID,
    });
    return `https://www.bitrefill.com/buy/?${params.toString()}`;
};
```

Note that Bitrefill doesn't *require* the wallet address in the URL — the
SOL payment flow at checkout shows a `solana:` URI that Privy intercepts
natively. The user picks their gift card first, then pays.

### 4.3 — Wallet UI button (the ~20 min change)

Add to `client/src/wallet/WalletContext.js` (or wherever the wallet UI panel
lives — `MyGamesScreen`, `MenuScreen`, etc.):

```jsx
<button
    className="solshot-cashout-btn"
    onClick={() => {
        if (!walletAddress) return;
        const url = cashOutToBitrefill(walletAddress);
        // window.open() works in TG WebView with the right wrapper;
        // for Privy embedded contexts use Privy's openLink helper if it exists.
        window.open(url, '_blank', 'noopener,noreferrer');
        // Analytics: track that the user initiated cash-out.
        recordFunnelEvent('cashout_initiated', { walletAddress }, {
            provider: 'bitrefill',
        });
    }}
>
    💰 Cash out for gift cards
</button>
```

CSS — match the existing wallet UI button family (`Layout.js` has the styled
button components).

### 4.4 — Funnel tracking

Add a new funnel stage to track the conversion funnel:

```
register → auth → wallet_linked → first_deposit → first_settle → first_cashout
```

`first_cashout` is a one-shot per identity, recorded when the user *initiates*
the Bitrefill flow (we can't observe completion from inside SolShot — that
happens on Bitrefill's side). For completion tracking, the Bitrefill affiliate
dashboard reports conversions.

This requires extending `Docs/internal/V1_LAUNCH_SPRINT.md` §S1-T2 funnel
stages — append `'first_cashout'` to `FUNNEL_STAGES` in `server/models/FunnelEvent.js`
and add it to the ordered list.

### 4.5 — Telegram bot integration

The bot's `/wallet` reply should mention the cash-out option:

```
🪙 Your wallet: <truncated-address>
💰 Balance: 0.327 SOL

Options:
• Play another match: /games
• Cash out for gift cards: <bitrefill-affiliate-link>
• Send to your own wallet: open SolShot, tap Wallet
```

### 4.6 — FAQ entry

Add to `Docs/how-to-play.md` and/or a new `Docs/cashing-out.md`:

```markdown
## Cashing out your winnings

After winning a wagered match, your prize lands in your SolShot wallet as
SOL. You have three ways to turn it into something useful:

**1. Gift cards (recommended for amounts under £100).**
Tap "Cash out for gift cards" in your wallet. We use Bitrefill — 600+
brands including Amazon, Steam, Just Eat, Spotify, Argos, Uber. Pay in
SOL, get the code in seconds, no bank account or KYC needed for typical
amounts.

**2. Bank withdrawal (for larger amounts).**
Tap "Cash out to bank" in your wallet (coming soon). Uses MoonPay — they
sell your SOL and send GBP to your bank within 1-3 working days. One-time
KYC verification required.

**3. Send to your own wallet.**
Already have a Solana wallet (Phantom, Solflare)? Use the "Send" option
in your SolShot wallet to transfer SOL out. From your own wallet you
can use any CEX (Coinbase, Kraken) to sell.
```

---

## 5 — Cross-arcade considerations

The SolShot Arcade is the broader hub (Basketball Hoops, Keepie Uppies,
Free-Kick Madness shipped; 7+ more games in the pipeline per
`Docs/internal/Next_Steps_Games.docx`). Cash-out strategy must work
across the hub, not just SolShot.

### Where cash-out lives

For V1:
- Each game has its own wallet UI but they all use the **same Privy embedded
  wallet** under the hood (per the post-hackathon arcade architecture).
- The Bitrefill button lives in `client/src/wallet/WalletContext.js`, which is
  imported by every SolShot Arcade game's client.
- For the standalone-leaderboard games (Basketball, Keepie Uppies,
  Free-Kicks), they currently don't have wagered prizes — their winnings
  are leaderboard placement, not SOL. So they don't strictly need a cash-out
  button. But it's harmless to expose the same wallet UI everywhere for
  consistency.

For V3:
- Tickets are arcade-wide per the north star. A player earns Tickets in any
  game and spends them at the unified shop.
- Wagered SOL stays per-game (SolShot has it now, future PvP games like
  the planned 8 Ball Pool / multiplayer Snake will too).
- The cash-out *strategy* (Bitrefill + MoonPay + V3 shop) applies uniformly;
  the *currencies* differ per tier.

### Affiliate attribution

For Bitrefill commission attribution across games, use a distinct
`utm_medium` per game:

| Game | utm_source | utm_medium |
|---|---|---|
| SolShot | solshot | solshot-cashout |
| Basketball | solshot | basketball-cashout |
| Keepie Uppies | solshot | keepie-uppies-cashout |
| Free-Kicks | solshot | freekicks-cashout |

Single `utm_source=solshot` consolidates the affiliate ID; per-game `utm_medium`
breaks out the analytics so we know which game converts best.

### Mainnet program ID per game

Each game that has wagered escrow has its own on-chain program. The Bitrefill
flow doesn't care — it's wallet-address-based, not program-aware. But the
funnel tracking + cashout analytics need per-game attribution. The
`recordFunnelEvent` call already accepts a `source` / `metadata` object that
can carry the game slug.

---

## 6 — V3 (the longer-term answer)

This section is **forward-looking** — V3 is not shipping for V1 mainnet.
Capturing the technical sketch here so it doesn't get lost between now and
then.

### Tickets as off-chain balance

Like SHOT post-pivot (per [project_shot_pivot_to_ingame.md]), Tickets live as
a server-side `User.stats.ticketBalance` field. No on-chain Ticket SPL token
(see V3 doc §73 — the one-way valve only works if Tickets can't leak via a
secondary market).

Earning Tickets:
- Participation floor: +N Tickets per match completed, regardless of result
- Leaderboard bonus: +100 Tickets for weekly placement, capped
- Win bonus: small (Tickets are abundance-tuned per north star §28)

Spending Tickets:
- Tier 1 — cosmetics: deducted from balance, item added to `User.cosmetics.owned`
- Tier 2 — in-game currency swap: deducted, in-game balance incremented
- Tier 3 — real-world prize: deducted, voucher API called, code emailed

### Shop API integration (V3-eng work)

Three integration patterns, in order of preference:

**Pattern A — Tillo (UK-based, gift-card-as-a-service):**
- REST API: `POST /transactions/issue` with brand + value → returns code + delivery URL
- Wholesale pricing: typically face-value minus 4-8% margin
- Brand coverage: 300+ UK + EU + US brands including Amazon, John Lewis, Argos, Just Eat
- We capture full retail spread (vs Bitrefill's affiliate cut). Better margin economics.

**Pattern B — Tango Card / Reward Genius:**
- Similar API model
- More US-leaning brand catalogue
- Worth comparing against Tillo at integration time

**Pattern C — Runa.io:**
- UK challenger, growing brand list
- Slightly more aggressive pricing

For UK-first launch, **Tillo is the default choice**. We sign up for an
account, pre-fund a balance, and the shop API draws against it.

### Treasury solvency math (the load-bearing constraint)

Per V3 doc §76, real-value prize emission must be globally capped per period
such that:

```
total_ticket_revenue_per_period  >  total_real_value_emitted_per_period
```

Where:
- `total_ticket_revenue_per_period` = Tickets purchased via Apple Pay + Tickets
  earned via wagering rake (a % of treasury fees diverted to the Tickets pool)
- `total_real_value_emitted_per_period` = sum of all gift-card / USDC prize
  payouts at face value (plus the Tillo wholesale markup we pay)

If this inequality ever flips, the treasury bleeds. Worst-case insolvency
leads to gift card redemptions failing — which is reputational ruin.

Implementation safeguards:
- Weekly cap on total real-value shop emission, enforced server-side
- Daily monitoring of Ticket revenue vs emission, dashboarded
- Soulbound cosmetics (Tier 1) cost us zero — they're the bulk of shop
  inventory by item count, the safety release valve

### Regulatory gate (V3 pre-launch)

Per V3 doc §111, before any cash-equivalent prize ships:
- **UK Gambling Commission** consultation: Tickets + leaderboards + cash-out
  may classify as a sweepstakes or skill-based prize promotion. Real
  qualified legal advice required, not vibes.
- **GDPR** for the voucher delivery email pipeline (we collect email addresses
  to deliver gift card codes — even if Tillo handles delivery, we route the
  request).
- **AML / KYC** check on the Tillo or equivalent provider — they handle
  end-user KYC for high-value redemptions, but we need to verify their
  thresholds work for our prize ceiling.

These gates are why V3's real-prize tier is locked out of V1/V2. V1 ships
Bitrefill because Bitrefill is already licensed and KYC'd for what we'd
otherwise build ourselves.

---

## 7 — Action items

### Pre-V1-launch (today / this week)

- [ ] **JJ:** Sign up for Bitrefill Business partner program at
  https://www.bitrefill.com/business. Get affiliate ID. (5 min)
- [ ] **Claude:** Wire the "Cash out for gift cards" button into
  `WalletContext.js` with deep-link + funnel event. (~20 min)
- [ ] **Claude:** Add `first_cashout` to `FUNNEL_STAGES`. (~5 min)
- [ ] **Claude:** Add `Docs/cashing-out.md` user-facing FAQ. (~15 min)
- [ ] **JJ:** Add Bitrefill mention to launch tweet + Discord + TG announcement.
  (~5 min copy)
- [ ] **JJ:** Update bot `/wallet` command to include cash-out link. (~10 min)

### Post-V1 (weeks 2-4)

- [ ] **JJ:** Sign up for Coinsbee Business as a B option for A/B testing.
- [ ] **Claude / JJ:** Add MoonPay Sell hook via Privy SDK for users who want
  bank withdrawal. (~half day)
- [ ] Monitor Bitrefill conversion rate. If <10% of cash-out clicks complete,
  diagnose UX friction.
- [ ] Add cash-out tracking to admin dashboard.

### V3 build (months out, post-V2)

- [ ] Legal review: UK Gambling Commission consultation on Tickets + cash-equivalent shop
- [ ] Tillo / Tango Card / Runa vendor selection
- [ ] Tickets schema + earning logic (already planned per V3 north star)
- [ ] Shop UI + inventory management
- [ ] Treasury solvency dashboard
- [ ] Tier 3 real-value prize emission cap enforcement
- [ ] V3 launch announcement: "Your nan can now play SolShot"

---

## 8 — TL;DR for the launch tweet

> Win on SolShot, cash out instantly. 600+ gift cards via Bitrefill (Amazon, Steam,
> Just Eat, Spotify, Argos) — pay in SOL, get the code in seconds, no KYC under £1k.
> Or send to your own wallet. Or, soon, withdraw to your bank via MoonPay.
> First time crypto winnings actually feel like real money.

That's the civilian story closed, in three lines.
