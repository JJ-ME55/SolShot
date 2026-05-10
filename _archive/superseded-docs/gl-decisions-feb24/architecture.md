---
topic: "Architecture"
topic_slug: "architecture"
status: complete
interview_date: 2026-02-22
decisions_count: 4
provides: ["architecture-decisions"]
requires: ["competition-pitch-decisions"]
verification_items: []
---

# Architecture — Decisions

## Summary
The architecture doc is a credibility piece for judges, not a dev reference. Total read time target: 15 seconds. One thesis line, two-sentence explainer, one 3-box diagram with 6-word annotations. No implementation details, no event maps, no deployment topology.

## Decisions

### D1: Thesis Statement
**Choice:** "The server owns the physics. The chain owns the money. Neither player nor operator can cheat either."
**Rationale:** One line that communicates both trust guarantees — anti-cheat gameplay AND trustless finance. Lands immediately for both gaming and DeFi judges.
**Alternatives considered:** Leading with just server-auth, leading with just escrow, technical explanation
**Affects docs:** [architecture, one-pager]

### D2: Two-Sentence Explainer
**Choice:** Below the thesis, include: "Client sends angle, power, and weapon choice. Server computes trajectory, damage, gold, and win conditions. Client only renders results."
**Rationale:** Makes the server-authoritative model concrete for readers from DeFi/infra backgrounds who may not immediately grasp what "server owns the physics" means in a game context.
**Alternatives considered:** One-liner only (insufficient for non-gaming judges), paragraph-length explanation (too long)
**Affects docs:** [architecture]

### D3: Diagram — 3-Box with 6-Word Annotations
**Choice:** Simple 3-box diagram: Client ↔ Server ↔ Chain. Each box gets ~6 words of annotation max. Must land in 3 seconds visually. No match lifecycle flow diagram.
**Rationale:** Judges are scanning. A 3-box diagram communicates the full architecture faster than any text. Match lifecycle flow is better suited to a demo video walkthrough.
**Alternatives considered:** Match lifecycle flow diagram, detailed component diagram, sequence diagrams
**Affects docs:** [architecture]

### D4: Audience and Depth
**Choice:** Judges and users only. No future developer audience. No implementation details, no Socket.IO event maps, no deployment topology, no code references.
**Rationale:** There will be no future devs. The doc's job is credibility ("this is real and built properly"), not onboarding.
**Alternatives considered:** Dual-audience layered doc, developer reference appendix
**Affects docs:** [architecture]

## Open Questions
None.

## Raw Notes
- Total target read time for entire architecture doc: 15 seconds
- The thesis line should be used verbatim — it's the user's exact words
- Box annotations should be ~6 words each, e.g.: Client = "Sends inputs, renders results" / Server = "Computes physics, economy, matches" / Chain = "Escrow, settlement, token burns"
- Match lifecycle diagram was explicitly rejected for this doc — reserved for potential demo video content
- The architecture doc is deliberately short — resist the urge to add depth
