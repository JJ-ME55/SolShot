---
topic: "Token Economics"
topic_slug: "token-economics"
status: complete
interview_date: 2026-02-22
decisions_count: 7
provides: ["token-economics-decisions"]
requires: ["competition-pitch-decisions"]
verification_items: ["litepaper-dex-update"]
---

# Token Economics — Decisions

## Summary
SHOT is a fixed-supply (10M), deflationary utility token. Mint authority burned — supply can only decrease. Distribution: 70% reward pool (milestone-gated, 5% monthly cap), 15% treasury (Squads multisig), 10% team (unlocked, sell-disciplined), 5% initial liquidity (Meteora DAMM V2). Prestige burns are the primary sink — 8,400 SHOT to reach Diamond. Scarcity is intentional: early players are rewarded. Additional burn sinks planned but TBD.

## Decisions

### D1: Token Distribution
**Choice:** 10M fixed supply, mint authority burned. Distribution:
- 7M (70%) — Reward pool, locked in PDA on-chain
- 1.5M (15%) — Treasury, Squads multisig
- 1M (10%) — Team, unlocked at launch, no vesting
- 500K (5%) — Initial liquidity, seeded into Meteora DAMM V2 pool
**Rationale:** Heavy reward pool allocation (70%) ensures most tokens flow to players, not insiders. Mint authority burned makes the cap credible and permanent.
**Alternatives considered:** Vesting schedule for team, smaller reward pool with larger treasury
**Affects docs:** [token-economics, one-pager, competitive-landscape]

### D2: Emission Mechanics
**Choice:** SHOT emitted from reward pool based on one-time gameplay milestones (not time-based). Monthly emission capped at 5% of remaining pool. As pool depletes, monthly emission naturally decreases — built-in scarcity curve. Practice mode milestones emit at 25% rate.
**Rationale:** Milestone-based emission rewards skill and dedication, not just time online. The 5% cap creates an asymptotic curve — pool never fully empties, emission slows naturally.
**Alternatives considered:** Time-based emission, match-count-based, uncapped emission
**Affects docs:** [token-economics, how-to-play]

### D3: Emission Cap Enforcement
**Choice:** The 5% monthly emission cap is admin-enforced discipline, not on-chain programmatic enforcement.
**Rationale:** Programmatic enforcement would require complex on-chain time-tracking. Admin discipline is documented publicly as a commitment. Transparent and honest.
**Alternatives considered:** On-chain enforcement via epoch-based emission PDA
**Affects docs:** [token-economics, security-model]

### D4: Team Allocation — Sell Discipline
**Choice:** Team tokens fund development, infrastructure, and operations. No vesting or lock — founder has full discretion. Self-imposed sell discipline: max 10% of team allocation per week under normal conditions, selling into volume rather than against thin liquidity.
**Rationale:** Honest framing. No fake vesting that could be circumvented. Sell discipline is a public commitment, not a smart contract guarantee.
**Alternatives considered:** Token vesting contract, time-locked release
**Affects docs:** [token-economics]

### D5: DEX and Liquidity
**Choice:** Meteora DAMM V2 as the primary liquidity pool. Jupiter aggregation layer for routing. Litepaper references to Raydium are outdated and must be updated.
**Rationale:** Meteora DAMM V2 provides concentrated liquidity with automatic rebalancing. Jupiter aggregation ensures SHOT is accessible from any Solana swap interface.
**Alternatives considered:** Raydium (outdated, originally planned), Orca
**Affects docs:** [token-economics, one-pager, crypto-explainer]

### D6: Prestige Scarcity — Intentional
**Choice:** Prestige scarcity is a feature, not a bug. 1,000 Diamond players would burn 8.4M SHOT — nearly the entire supply. Early players are rewarded for being early. As supply tightens, reaching Diamond becomes increasingly difficult for latecomers.
**Rationale:** Creates genuine status and exclusivity. Diamond prestige means something because it's hard. Early adopters get a real economic advantage — standard incentive alignment for early communities.
**Alternatives considered:** Adjustable burn costs, inflation to offset burns
**Affects docs:** [token-economics, competitive-landscape]

### D7: Future Burn Sinks
**Choice:** Prestige is the first and primary burn sink. Additional burn sinks are planned but specifics are TBD. Frame as "designed with extensible burn architecture" — the system supports new sinks as the economy matures. Do not promise specific future sinks. **Activation pending:** burn structure exists on-chain, cosmetic purchases (armory items for SHOT) not wired yet.
**Rationale:** Keeps deflationary mechanic accessible even as prestige becomes prohibitively expensive. Honest about what's built vs what's planned. Cosmetic burns add a second sink accessible at any prestige tier.
**Alternatives considered:** Committing to specific future sinks now (premature)
**Affects docs:** [token-economics]

## Open Questions
- [ ] Litepaper v2.1 still references Raydium — needs updating to Meteora DAMM V2 — confidence: high, source: interview

## Raw Notes
- Burn costs per tier: Bronze 200, Silver 500, Gold 1,200, Platinum 2,500, Diamond 4,000 (cumulative: 8,400)
- Milestone examples from litepaper: first wagered match (10 SHOT), 10 wagered wins (25), 50 wagered wins (75), deal 500+ dmg in single round (15), win 5 in a row (40), etc.
- All milestones are one-time unlocks per account — not repeatable
- "SHOT cannot be purchased directly" — only earned through gameplay or bought on secondary market
- The asymptotic emission curve means month 1 max = 350K SHOT, month 2 max = 332.5K, etc.
- Team sell discipline is a public commitment, not enforceable on-chain — document transparently
- "Additional burn sinks" should be framed as architectural capability, not a promise
