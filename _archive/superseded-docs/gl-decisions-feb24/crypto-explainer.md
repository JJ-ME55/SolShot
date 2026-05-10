---
topic: "Crypto Explainer"
topic_slug: "crypto-explainer"
status: complete
interview_date: 2026-02-22
decisions_count: 5
provides: ["crypto-explainer-decisions"]
requires: ["competition-pitch-decisions"]
verification_items: []
---

# Crypto Explainer — Decisions

## Summary
The "How Wagering Works" doc uses progressive disclosure — start with a two-liner anyone can understand, then go deeper layer by layer. Players read until satisfied and self-select out. Fee breakdown is transparent (7% treasury, 3% ops). Disconnect = forfeit unless genuinely even. No program addresses or explorer links — trust signal is "audited and on-chain."

## Decisions

### D1: Progressive Disclosure Structure
**Choice:** Layer the explainer from simple to technical. Three tiers:
1. **One-two liner** — "Your SOL goes into a locked vault. Winner takes 90%."
2. **Bank vault analogy** — plain-English explanation of escrow, fees, what happens on disconnect. No technical language.
3. **Smart contract lite** — mentions on-chain escrow, audits, trustless settlement. For crypto-literate readers who want to know it's real.
**Rationale:** People read until they're satisfied. Start simple, naturally lose the convinced readers as depth increases. Those who need the most convincing read the most.
**Alternatives considered:** Single technical level, separate beginner/advanced docs, "show me the code" layer with addresses
**Affects docs:** [crypto-explainer]

### D2: Fee Presentation
**Choice:** "10% fee (7% to treasury, 3% to operations)" — transparent breakdown, two components named.
**Rationale:** Middle ground between oversimplified and over-detailed. Players see exactly where the fee goes without needing to understand BPS math.
**Alternatives considered:** "10% match fee" (single number), "10% fee that funds X and Y" (narrative framing)
**Affects docs:** [crypto-explainer, one-pager]

### D3: Disconnect Handling
**Choice:** Document disconnect as:
- 30 seconds to reconnect first
- If no reconnect: **forfeit to the player most likely to win** (ahead on HP or rounds)
- If genuinely even (same HP, tied rounds): refund both players
- The on-chain timeout is a backend safety net for server failure, not a player-facing mechanic
**Rationale:** Flat timeout creates a loophole (losing player disconnects to get money back). Forfeit-to-leader matches real competitive games (FIFA) and is fair.
**Alternatives considered:** 24h flat timeout refund, immediate refund, always-forfeit
**Affects docs:** [crypto-explainer, edge-case-playbook]

### D4: Technical Depth Ceiling
**Choice:** Deepest layer says "audited and on-chain" — no program addresses, no explorer links, no PDA details.
**Rationale:** The audience is players, not developers. "3 security audits" and "on-chain escrow" are sufficient trust signals. Specific addresses add nothing for the target reader.
**Alternatives considered:** Including program address + Solana explorer link, linking to audit reports
**Affects docs:** [crypto-explainer]

### D5: Escrow Timeout — Resolved
**Choice:** Two-tier timeout: **1 hour** for settlement (server/player-triggered cancel) + **48 hours** for permissionless reclaim (anyone can trigger, absolute backstop). The previous 24h flat timeout is stale — code has been updated.
**Rationale:** 1 hour is tight enough to not leave funds hanging after a server crash, while 48 hours for permissionless reclaim gives ample time for normal recovery paths before the nuclear option kicks in.
**Alternatives considered:** 24h flat timeout (stale, replaced), removing timeout entirely
**Affects docs:** [crypto-explainer, edge-case-playbook, architecture]

## Open Questions
- [x] ~~Escrow timeout duration~~ — **Resolved.** Now 1hr settlement + 48hr permissionless reclaim. Code updated.

## Raw Notes
- The disconnect forfeit logic (leader wins, even = refund) may not be fully implemented in current code — current server forfeits the disconnector regardless of score. The doc should describe the desired behavior; code may need updating to match.
- "Bank vault" was the user's preferred analogy for the simple layer
- The 90/7/3 split should be presented as player-facing transparency, not just a technical detail
