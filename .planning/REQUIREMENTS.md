# Requirements: SolShot v2.0 — Practice Mode Public Launch

**Defined:** 2026-02-28
**Core Value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## v2.0 Requirements

Requirements for practice mode public launch. Clean, frictionless 2-player experience with no wallet required and no token references visible.

### Handle System

- [ ] **HANDLE-01**: First-time visitor with no handle sees entry modal before menu loads
- [ ] **HANDLE-02**: Handle stored as `solshot_handle` in localStorage with generated UUID as `solshot_uid`
- [ ] **HANDLE-03**: Handle max 16 characters, sanitized (trim whitespace, strip control chars)
- [ ] **HANDLE-04**: Modal clearly states handle is permanent ("Choose carefully")
- [ ] **HANDLE-05**: Handle displayed in TopBar where wallet display would be (practice mode)

### Menu Screen

- [ ] **MENU-01**: Armory, Prestige, and Barracks buttons greyed out and disabled with COMING SOON badge
- [ ] **MENU-02**: PLAY FREE is the only active button
- [ ] **MENU-03**: Subtagline changed from "WAGER 0.1 — 1.0 SOL" to "SKILL-BASED ARTILLERY COMBAT"

### Token Masking

- [ ] **MASK-01**: ShotPriceTicker returns null (hidden entirely), removed from TopBar
- [ ] **MASK-02**: WinScreen hides SHOT earned reward card, Jupiter swap CTA, and CONVERT WINNINGS section
- [ ] **MASK-03**: ShotExplainer modal disabled — never shows
- [ ] **MASK-04**: All visible SHOT references (including prestige burn costs) replaced with ???

### Lobby

- [ ] **LOBBY-01**: Player count locked to 2, selector hidden
- [ ] **LOBBY-02**: Practice mode active, wagered modes (Quick Match, Duel, High Roller) greyed with COMING SOON

### Practice Stats

- [ ] **STATS-01**: Track matches played, wins, losses, and K/D in localStorage keyed by `solshot_uid`
- [ ] **STATS-02**: Stats not connected to any wallet or server
- [ ] **STATS-03**: Data structure designed for easy migration to Barracks later

### How To Play

- [ ] **HTP-01**: `/how-to-play` route renders the full How To Play page with all content from provided doc
- [ ] **HTP-02**: Page styled to match SolShot aesthetic (Black Ops One headings, Share Tech Mono body, olive dark bg, bone text, orange-rust accents)
- [ ] **HTP-03**: Weapons table rendered cleanly as the centrepiece of the page
- [ ] **HTP-04**: TopBar with onBack prop navigates back to menu
- [ ] **HTP-05**: MenuScreen has subtle HOW TO PLAY link below main nav (secondary treatment, doesn't compete with PLAY FREE)
- [ ] **HTP-06**: No wallet required to view, no SHOT references

## Future Requirements

Deferred to post-launch milestones.

### Wagering & Token Economy
- **WAG-01**: Wallet connection flow for wagered matches
- **WAG-02**: SHOT token visibility and price ticker
- **WAG-03**: Jupiter swap integration for in-game token purchase
- **WAG-04**: Prestige burn costs displayed (currently masked with ???)

### Multiplayer Expansion
- **MP-01**: 3-4 player practice matches
- **MP-02**: 3-4 player wagered matches (N-player escrow already built in v1.4)

### Barracks
- **BAR-01**: Barracks screen UI with stats display
- **BAR-02**: Migration from localStorage practice stats to server/wallet-linked stats

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Server-side file changes | Practice launch is client-only; server logic is stable |
| Wallet connection | Practice mode requires zero blockchain interaction |
| SHOT token display | Hidden until wagering goes live |
| Barracks UI | Stats are tracked but UI deferred to post-launch |
| 3-4 player modes | Ship clean 2-player first, expand after feedback |
| Mainnet deployment | Separate operational task |
| New weapons or balance changes | Out of scope for launch prep |
| Battle logic changes | Do not touch BattleScreen game logic |
| Win/Lose navigation flow changes | Do not modify existing screen flow |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HANDLE-01 | Phase 24 | Pending |
| HANDLE-02 | Phase 24 | Pending |
| HANDLE-03 | Phase 24 | Pending |
| HANDLE-04 | Phase 24 | Pending |
| HANDLE-05 | Phase 24 | Pending |
| MENU-01 | Phase 25 | Pending |
| MENU-02 | Phase 25 | Pending |
| MENU-03 | Phase 25 | Pending |
| MASK-01 | Phase 25 | Pending |
| MASK-02 | Phase 25 | Pending |
| MASK-03 | Phase 25 | Pending |
| MASK-04 | Phase 25 | Pending |
| LOBBY-01 | Phase 26 | Pending |
| LOBBY-02 | Phase 26 | Pending |
| STATS-01 | Phase 27 | Pending |
| STATS-02 | Phase 27 | Pending |
| STATS-03 | Phase 27 | Pending |
| HTP-01 | Phase 28 | Pending |
| HTP-02 | Phase 28 | Pending |
| HTP-03 | Phase 28 | Pending |
| HTP-04 | Phase 28 | Pending |
| HTP-05 | Phase 28 | Pending |
| HTP-06 | Phase 28 | Pending |

**Coverage:**
- v2.0 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 — traceability mapped to Phases 24-28*
