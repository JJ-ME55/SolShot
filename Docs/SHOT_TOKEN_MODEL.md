# SHOT Token Model — SUPERSEDED

> **This document is obsolete.** It described SHOT as an on-chain SPL token
> with a Pump.fun mint, 10M fixed supply, Meteora DAMM v2 liquidity pool,
> Jupiter aggregation, and a 70/15/10/5 distribution. **None of that is the
> current design.**

## What changed

**2026-05-26 — SHOT pivot to closed in-game currency.**

The Pump.fun launch path was abandoned (not deferred). SHOT is now a closed
in-game currency:

- **Earned in-game** via gameplay milestones (no on-chain mint).
- **Spent in-game** on Prestige burns and cosmetic unlocks (no on-chain
  transactions — just decrement a server-side balance).
- **Not tradable, not transferable, not redeemable for SOL.** This is
  intentional: the goal is to make SHOT serve gameplay, not market
  dynamics.
- The devnet SPL mint `4NnYBycLLo8acgbkLz2SyCXd3KU8jgHQLEmrVypi5VLd` is
  orphaned and will never be used.

The Prestige tier system that was driven by SHOT burns is still alive —
it now decrements the server-side `User.stats.shotBalance` field instead
of calling an on-chain SPL burn instruction. The user experience is
identical; the underlying mechanism is off-chain.

## Why the pivot

Three forcing functions converged:

1. **V3 Arcade Economy** — the three-tier economy (closed in-game currency →
   Tickets → admin-curated redemption shop) was settled as the long-term
   direction. SHOT-as-SPL didn't fit. See
   `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md`.

2. **V1 mainnet scope lock** — V1 is "SOL wagering live, v2 escrow only, no
   SHOT on-chain." Shipping an SPL token requires liquidity pools, market
   monitoring, and ongoing economic maintenance — none of which made sense
   at V1's small-scope wager-driven entry point.

3. **Regulatory simplicity** — a closed in-game currency with no secondary
   market sidesteps the "is this a security?" question.

## Current sources of truth

If you are reading this to understand the SHOT model **today**, read:

- `Docs/internal/V3_ARCADE_ECONOMY_NORTH_STAR.md` — the three-tier economy
- `Docs/internal/V1_LAUNCH_SPRINT.md` — V1 scope including SHOT off-chain
- `Docs/SolShot_Litepaper_v2.2.md` (or higher) — user-facing pitch
  (note: as of 2026-05-28 the litepaper still describes SHOT as on-chain;
  it's flagged for v2.3 rewrite)

The original 230+ line model document (Pump.fun mint, Meteora DAMM,
Jupiter, distribution percentages, burn cadence math, etc.) has been
removed from this file because retaining it actively misinforms anyone
skimming for the current design. The full text remains accessible via
`git show <pre-2026-05-28-commit>:Docs/SHOT_TOKEN_MODEL.md` for historical
context.
