# Phase 11: Post-Match & Stats Pipeline - Context

**Gathered:** 24 Feb 2026
**Status:** Ready for planning

<domain>
## Phase Boundary

Post-match experience after a match ends (earnings breakdown, prestige progress, share, swap CTA), server-side stats persistence to MongoDB, Barracks live stats display, and Combat Card React component with PNG export. Requirements: UI-12, UI-13, UI-14, UI-15, UI-16, STAT-01, STAT-02, STAT-03, STAT-04.

</domain>

<decisions>
## Implementation Decisions

### Post-match screen layout
- **Tabbed sections** on the WinScreen: Result tab (current match outcome) + Progress tab (SHOT milestones, prestige progress) + Action tab (share, swap CTA)
- SHOT milestones (UI-12): **Itemized breakdown by source** — show SHOT from kills, SHOT from wins, SHOT from damage. Receipt-style layout.
- Prestige progress (UI-13): **Both SHOT + match count** — SHOT progress toward next tier as primary indicator, matches played as secondary stat
- Escrow explainer (UI-16): **Claude's discretion on placement** — show before first wager, Claude picks whether pre-match gate or post-match contextual nudge

### Share & social format
- X/Twitter share text: **Result + earnings, NO emojis** — e.g., "Just won 0.18 SOL on @SolShotGG -- No download, skill-based artillery combat on Solana. solshot.gg"
- Share includes an **image card attached** — not just text
- Image card is a **simple match result card** (not the full Combat Card) — just this match's W/L, SOL earned, SHOT earned. Lighter and more shareable than a full stats card.

### Combat Card design
- **Fresh design** — do NOT convert the standalone HTML card. Use the app's current style and design a new card for the React component.
- Stats on card: **Core stats + prestige tier + K/D ratio** — matches played, wins, losses, win rate, total SOL won, total SHOT earned, prestige tier, K/D ratio
- Export: **Clipboard copy** via html2canvas → clipboard API. No download fallback needed.
- Triggered from Barracks screen (existing "EXPORT COMBAT CARD" button concept)

### Stats persistence scope
- Server tracks: **Basic + K/D + weapon stats** — matchesPlayed, wins, losses, totalSolWon, totalSolLost, totalShotEarned, kills, deaths, plus per-weapon stats (shots fired, hits, damage dealt). Enables K/D ratio, favorite weapon, accuracy stats.
- Barracks empty state: **Call to action** — "Play your first match to see stats here" with button to lobby. Not just zeros.
- Stats view: **All-time only** — single lifetime view, no recent trends or per-session breakdown

### Claude's Discretion
- Escrow explainer placement and timing
- Tab navigation style (pills, underline tabs, swipe)
- Exact share tweet wording (follow the pattern above)
- Match result card visual layout for sharing
- Combat Card visual design (fresh, not from HTML)
- Stats schema field names and MongoDB document structure
- Barracks layout for displaying live stats

</decisions>

<specifics>
## Specific Ideas

- Share text should NOT have emojis — clean, professional tone
- Combat Card is a fresh design, not a port of the standalone HTML
- Match result share card should be simpler and lighter than the Combat Card — just one match's results
- Weapon stats enable "favorite weapon" display and accuracy percentage on Combat Card/Barracks

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-post-match-stats-pipeline*
*Context gathered: 24 Feb 2026*
