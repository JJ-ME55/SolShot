# Arcade Economy — V3 North Star

**Status:** Design locked at principle level. Not built. Do not build before V3.
**Owner:** Jamie
**Purpose:** Capture the arcade-wide economic model so it stops living in a chat log and a head. This is the reference for the dual-currency system that sits *under* the arcade once there's a multi-game arcade to support. It is explicitly NOT a V1 task.

---

## The one-line thesis

Decouple "on-chain economy" from "tradable speculative token." Give indie games real crypto rails — ownership, cross-game value, real prizes — **without** each game launching its own coin, because the per-game coin is exactly what triggers the pump-and-death-spiral that kills indie P2E. One hardened economic core, many closed game-currencies drawing on it.

The radical part is not the closed currency (V-Bucks is closed and nobody calls it novel). It's the **shared, robust arcade economy** that a small studio can plug into to get the benefits of on-chain rails without the fragile, speculative per-game token.

---

## The three-tier model

### Tier 1 — In-game currency (per game; the old $SHOT role)
- Closed. Non-tradable. Never leaves the game.
- **Rewards skill** — you win matches, you earn it, you spend it *inside that game* on entries, unlocks, cosmetics, lives.
- No outside price, so no speculation, ever.
- This is where "AIM. FIRE. WIN. / skill wins" lives at the economic layer.
- **$SHOT becomes this** — an internal balance, not a launched token. (See "What changed" below — this means abandoning the Pump.fun launch path, not deferring it.)

### Tier 2 — Tickets (arcade-wide)
- **Buyable with crypto. Earnable by playing. NOT sellable. NOT tradable.**
- The **one-way valve** is the entire safety mechanism: crypto flows in, Tickets become an internal arcade balance, value never flows back out *through the currency*. Nobody speculates on an asset they can never sell at a profit → no mercenary capital, no farming, no spiral. The asymmetry IS the bulletproofing.
- Arcade-wide: spend Tickets across any game, or swap Tickets *into* a game's Tier 1 currency. This cross-game utility is what makes the economy worth plugging into.
- Named "Tickets" deliberately — the fairground/arcade metaphor is speculation-resistant *semantically* (nobody expects arcade tickets to moon) and signals "this is a game, not an investment." Cultural + regulatory cover for free.

### Tier 3 — Redemption shop (the fairground counter)
- This is the **only** place internal value touches real-world value — so it's the single point of failure and must be hardened hardest.
- **It is a curated, administered shop, NEVER a market.** Fixed inventory, fixed prices, capped supply, weekly resets. There is no chart to pump, no float to attack, no order book.
- Inventory tiered by cost and by real value (see emission rules).
- Because you control supply and price, you can *guarantee* the system never emits more value than it takes in. Sink/source balance is administered, not left to a market to discover and then break.

---

## How Tickets are earned (the hybrid)

Two pools, doing two different jobs:

**Participation floor — ~⅓ Ticket per game, regardless of result.**
- Abundant, broadly distributed, effort-proportional.
- This is the **retention mechanism** — every player, including the bad ones, is always progressing toward *something*. The grinder earning their way to a cosmetic is the point, not a bug.
- Abundance also = safety: low value-per-Ticket means speculation never gets a foothold.

**Leaderboard bonus — ~100 Tickets for placement.**
- Rewards skill, makes being good materially better, gives a reason to try hard.
- **CRITICAL RULE: the leaderboard must rank on a SKILL-RATE metric, not cumulative volume.** Win rate, accuracy, ELO, average placement — something where playing *more* games does NOT mechanically climb you.
  - If the board is cumulative (most wins / most games), the heaviest grinder tops it AND collects the floor → grind and skill collapse into the same activity, and bots sweep both pools. Cumulative board = bot's dream.
  - Rate-based board = bot-resistant: the bot has to actually be *good*, not just tireless. A sharp player on 10 games can outrank a grinder on 50.

**Target ratio (tune on live data):** a dedicated grinder maxing the floor should earn roughly **10–25%** of what a top-placement skilled player earns.
- Above ~30% → "skill wins" becomes a slogan, not a mechanic.
- Below ~10% → casuals feel they earn nothing and churn.
- The exact ⅓ and 100 values are placeholders — tune against live mainnet behaviour, not from the armchair.

---

## Shop tiering (retention + safety are the same wall)

- **Low Ticket cost = pure sink, zero real-world value.** Avatars, skins, name colours, emotes, banners, "played 50 games" badges. Soulbound / non-transferable so there's no resale leak. Costs nothing to emit. This is where the grinder lands — meaningful identity/progression reward that is economically free and un-sellable.
  - Calibration: the *cheapest meaningful* cosmetic must be reachable by a casual player in **days, not months**, or the retention benefit evaporates and it feels like a grind-wall. The bad player should taste a reward early — just never a *valuable* one.
- **High Ticket cost = real-value items** (USDC prizes, scarce NFTs, premium passes). Gated far enough up that a pure grinder can't casually reach them — requires real skill (stacked leaderboard bonuses) or real money (buying Tickets). Value-out stays gated behind effort/spend that exceeds the value itself, which keeps the treasury solvent.

---

## The five non-negotiable rules

1. **One-way valve.** Tickets are buyable and earnable, never sellable, never tradable. Break this and speculation returns.
2. **Rate-based leaderboards.** Skill bonus ranks on rate/skill metrics, never cumulative volume. Break this and grinders + bots sweep the value-out.
3. **Shop is administered, not a market.** Fixed inventory, fixed prices, capped supply. Break this and you've built an exchange you can't control.
4. **Real-value goods are soulbound or modelled.** No uncontrolled secondary market on shop items. Tradable cosmetics = a leak you don't control.
5. **Treasury solvency on USDC-out.** If USDC is in the shop, cap it globally per period and price so real revenue (Ticket purchases + wagering rake) exceeds total USDC emitted. If you can't guarantee inflows > outflows, omit USDC and ship only soulbound goods + passes (which cost nothing to emit).

---

## SOL wagering — keep it firewalled

SolShot wagering still exists alongside this. It is a **separate value-out system** and must NOT touch Tickets/shop:

- **Wagering** = PvP, SOL escrow, 90/7/3, peer-to-peer transfer, house takes rake. Self-balancing by construction — the house never pays out more than players put in.
- **Tickets/shop** = treasury-to-player flow. NOT self-balancing — treasury can go insolvent if emission > revenue.
- **Do not connect them.** No wagering winnings → Tickets. No Tickets → wagering entries. If they touch, an exploiter farms the self-balancing system to feed the non-self-balancing one and drains the treasury.

Two separate value-out paths. Neither feeds the other.

---

## Why pay-to-win does NOT apply

Yes, you can buy Tickets and swap into Tier 1 in-game currency. But in-game currency buys **entries and cosmetics, not aim.** Buying Tickets gets you more *attempts*, never more *skill* — you still have to win the artillery match. That's the Fortnite line exactly: pay for access and cosmetics, never for the win. Skill still decides the match.

---

## The SDK question — yes, but hide the crypto

It does lend itself to an SDK indie devs would want — but **not for the reason you'd pitch first.**

- The seductive (wrong) pitch: "plug in for crypto rails without launching a token." This attracts the exact mercenary-token crowd you're avoiding.
- The real draw: **"we handle the wallet, onboarding, payments, treasury, prize compliance, and player liquidity — you bring a game."** That's the Miniclip/Roblox deal. The crypto is invisible plumbing; the dev's benefit is distribution + zero economic overhead.
- **The SDK's pitch should hide the crypto, not lead with it** — same principle as "skill not earn," applied to the B2B layer.

---

## Known weak spots / threats (eyes open)

- **Cold-start / chicken-and-egg.** The arcade economy is only worth plugging into once it has player liquidity. Day one it has none. SolShot + the three quick-fire titles must seed it first. **The SDK is a V4+ story, not a launch claim.**
- **Regulatory.** Buyable Tickets + USDC prizes + leaderboards, *especially* next to SOL wagering, can look like gambling/sweepstakes in some jurisdictions. Not a V1/V2 blocker, but a **hard gate before Tier 3 / USDC-out ships.** Get a real look before any cash-equivalent prize goes live.
- **Abundance tuning band.** Too abundant → shop feels worthless. Too scarce → farming target returns. Only findable with live data. (Another reason this is V3.)

---

## Sequencing — protect this order

- **V1 — Mainnet (shipping this week).** Just that. SolShot live on mainnet, earning its retention data. No economy work.
- **V2 — 4+ players.** Last-man-standing, broaden the core game. Refactor spec already exists.
- **V3 — Arcade mega-economy.** Everything in this doc. Introduced *after* there's a multi-game arcade for it to sit under and live data to tune against.

**Discipline note (the whole reason this doc exists):** this economy is the most intellectually fun problem on the roadmap. That is exactly why it's dangerous to over-build now. The lever *this month* is retention + onboarding on what just shipped (wallet-link drop-off fix), not modelling emission schedules. The principles above are locked; the *numbers* can only be learned from live behaviour. Lock the shape, close the doc, go ship.

---

## What changed from the hackathon-era plan

- **$SHOT is no longer a launched on-chain token.** It becomes the internal, closed Tier 1 currency. The old 10M-fixed-supply / mint-burned / prestige-burn tokenomics scaffolding was built for a *launched* token and is now largely irrelevant. The Pump.fun launch path is **abandoned, not deferred.** (Confirm this is the call.)
- The arcade-wide tradable token idea (early "$Tokens") is **killed** — a freely-traded arcade currency reintroduces the death-spiral risk this whole model exists to avoid.
