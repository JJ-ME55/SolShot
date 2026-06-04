# Escrow Reuse — Design Note (The Arcade)

**Status:** Direction agreed 2026-06-04. Not yet built — captured for when the next
wagered game needs real on-chain escrow.

## What the v2 escrow actually is
`solshot-escrow-v2` is **not SolShot-specific**. It's a generic N-player (2–10)
match-escrow engine:
- `create_match(match_id, wager, players[], duration, deposit_window)`
- `deposit_wager` → `settle_match(winner)` (90/7/3 split) / `cancel_match` / `permissionless_reclaim`
- `GlobalConfig` PDA (`[b"config"]`, singleton per program) holds authority / treasury / ops / fee bps.

Any game can use it. Matches are isolated by `match_id` (an arbitrary ≤32-char string → PDA `[b"match", match_id]`).

Mainnet instance (SolShot): program `BNLgn96LqskqcgTTf7cPZ5iHkaKqRdSiCdGzcAw4L7uS`,
config `R4u6CSnzdVbPgzcC9ukvo8bTzEH2ZF549PVGPDTGYKN`, authority = Squad vault `9f1M…`.

## Two reuse models

### Option A — duplicate (one instance per game)
Deploy the **same audited bytecode** under a new program ID + its own `GlobalConfig`.
Proven trivially on 2026-06-04 (throwaway program `9bu1j…` was a duplicate of this `.so`).
- ✅ Isolated treasury / fees / pause / blast-radius per game; supports third-party studios.
- ❌ ~2.7 SOL rent each + another program to govern/monitor.
- Requires `escrow-v2.js` to be parameterized by program ID (small refactor — it currently
  binds one `ESCROW_PROGRAM_ID_V2`).

### Option B — share one deployment (CHOSEN as the default)
All games create matches in the **same** program, namespaced by `match_id`
(`pool_<id>`, `ss_<id>`, …).
- ✅ **No program change.** Each game just calls the existing `createMatchEscrowV2(...)`
  with a prefixed `match_id`. (Pool's escrow is off-chain today → wiring it on-chain is
  exactly this.)
- ✅ Cheapest, one program to govern/audit/monitor, one unified arcade treasury
  (aligns with the V3 arcade-economy north star).
- ⚠️ **Shared pause** — pausing the program halts every game at once.
- ⚠️ **One `GlobalConfig`** — one treasury + one fee split for all games. A code change
  (per-game config PDA keyed by a `game_id`) would be needed for per-game economics.

## Decision
**Use Option B** — shared program, namespaced `match_ids`, one arcade treasury — as the
default for SolShot's own games (1v1, group-chat, pool, future first-party games).

It's not a one-way door: any game can be **split out to its own instance (A)** later by
deploying a duplicate and pointing that game's *new* matches at it (existing matches stay
put). Do that when a game needs its own economics/treasury, or when escrow is licensed to
a third-party studio (Phase 5).

## Implementation notes (Option B, when building)
- Namespace `match_id` per game (`<gameslug>_<id>`), enforce uniqueness per game.
- Each game's server module imports `createMatchEscrowV2` / `settleMatchEscrowV2` /
  `cancelMatchEscrowV2` / `buildDepositTransactionV2` from `escrow-v2.js` and calls them
  with its namespaced id. No new program, no new config.
- All games share the one `GlobalConfig` (treasury/ops/fees). If per-game fees become a
  requirement, evolve to per-`game_id` config PDAs (the "B-hybrid") before splitting to A.
- Client deposit validation (`WalletContext.ALLOWED_ESCROW_PROGRAM_IDS`) already allows the
  configured program — shared program means no change there.
