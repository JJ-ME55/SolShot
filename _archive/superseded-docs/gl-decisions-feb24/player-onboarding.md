---
topic: "Player Onboarding"
topic_slug: "player-onboarding"
status: complete
interview_date: 2026-02-22
decisions_count: 5
provides: ["player-onboarding-decisions"]
requires: ["competition-pitch-decisions"]
verification_items: []
---

# Player Onboarding — Decisions

## Summary
The how-to-play guide is a "handed you a controller" tutorial — short, snappy, gameplay-first. No wallet setup instructions, no crypto jargon. Practice mode is the zero-friction entry point (no wallet needed). The guide should surface non-obvious mechanics that trip up first-timers.

## Decisions

### D1: Guide Scope — Gameplay Only
**Choice:** The how-to-play guide covers game mechanics only. No wallet setup, no Solana explainers, no crypto onboarding. Players are expected to sort wallet stuff out themselves.
**Rationale:** The audience is "crypto-curious to crypto-native" — they can handle wallet setup. The guide's job is to teach the game, not Solana.
**Alternatives considered:** Including Phantom install walkthrough, linking to wallet setup guides
**Affects docs:** [how-to-play]

### D2: Tone — Controller Handoff
**Choice:** Short, snappy tutorial voice. "I just handed you a controller — here's what you need to know." Not a polished corporate tutorial, not a wiki. Direct, friendly, minimal.
**Rationale:** Matches the game's personality — competitive, accessible, no-nonsense.
**Alternatives considered:** Numbered step-by-step guide, wiki-style reference, video-first approach
**Affects docs:** [how-to-play]

### D3: Player Flow to Document
**Choice:** Document the two entry paths:
- **Practice path (zero friction):** Menu → Deploy (orange button) → Practice Match → join waiting room → Shop (spend 1000G on weapons) → Battle (alternating turns, angle/power/weapon) → round ends at 0 HP or 20 turns
- **Wagering path:** Menu → Deploy → select wager mode (Quick/Duel/High Roller) → pick wager amount + format (BO1/BO3/BO5) → wallet prompt → confirm amount → waiting room → Shop → Battle
- Can also browse open rooms and join directly (prompted to accept match conditions before entering)
**Rationale:** Practice-first path shows the game is playable without any crypto commitment. Wagering path layered on top.
**Alternatives considered:** Single unified flow, wagering-first presentation
**Affects docs:** [how-to-play]

### D4: Screen Terminology
**Choice:** Use the in-game UI names consistently:
- **Deploy** — match lobby / find a game
- **Shop** — weapon selection between rounds (spend gold on weapons)
- **Armory** — cosmetic items (skins, patterns, trails, blast effects, kill effects)
- **Prestige** — tier unlocks via SHOT token burns
- **Barracks** — tank customization
**Rationale:** Guide should match exactly what the player sees on screen.
**Alternatives considered:** Using generic terms ("lobby", "weapon select")
**Affects docs:** [how-to-play]

### D5: Non-Obvious Mechanics to Highlight
**Choice:** Include a "tips" or "what to know" section covering these gotchas:
1. **Wind** — affects projectile trajectory horizontally, changes each round, check the wind indicator before aiming
2. **Multiple weapons** — you can buy more than one weapon per Shop phase, don't just grab one
3. **Gold conservation** — in BO3/BO5, manage gold across rounds; saving gold early lets you buy stronger weapons later
4. **Tank movement on hit** — direct hits push your tank, affecting your position for next turn
**Rationale:** These are the moments that trip up first-timers. Surfacing them early prevents frustration and shows depth.
**Alternatives considered:** Letting players discover organically, separate "advanced tips" doc
**Affects docs:** [how-to-play]

## Open Questions
None.

## Raw Notes
- Menu has 4 buttons: Deploy (bright orange, primary CTA), Armory, Prestige, Barracks
- 1000G starting gold, +15G per HP damage, +200G kill bonus, +300G round win
- Turns alternate (random first turn), 60s per turn, 10 turns each per round
- Round ends: 0 HP death OR 20 turns exhausted (winner by total damage)
- HP is 250 per round, resets between rounds
- Practice mode = 0 SOL wager = no wallet needed
- The guide should NOT link out to wallet setup — just skip it entirely
