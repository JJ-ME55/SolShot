# Requirements: SolShot v3.0 — Public Practice Launch

**Defined:** 2026-03-23
**Core Value:** Browser-based multiplayer artillery combat on Solana with real SOL wagering, settled trustlessly via on-chain escrow.

## v3.0 Requirements

Requirements for public practice launch. Aiming overhaul, terrain balance, escrow hardening, and community launch.

### Aiming — Desktop

- [ ] **AIM-01**: Player can aim turret by moving mouse cursor over game canvas — turret barrel tracks cursor position relative to tank
- [ ] **AIM-02**: Mouse distance from tank maps to power level (clamped 5–100)
- [ ] **AIM-03**: Left-click fires the current weapon
- [ ] **AIM-04**: Q/E keyboard aim still works as fine-tune fallback on top of mouse aim
- [ ] **AIM-05**: Mouse aim only active during player's own turn
- [ ] **AIM-06**: React angle/power sliders update as read-only displays reflecting mouse position

### Aiming — Mobile

- [ ] **AIM-07**: Player can tap anywhere on game canvas to rotate turret toward that position
- [ ] **AIM-08**: Power slider remains as primary power control on mobile
- [ ] **AIM-09**: FIRE button remains as primary fire trigger on mobile
- [ ] **AIM-10**: Tap-to-aim only active during player's own turn

### Control Settings

- [ ] **CTRL-01**: Settings/menu screen has control scheme selector (Classic Sliders / Mouse Aim on desktop, Classic Sliders / Tap to Aim on mobile)
- [ ] **CTRL-02**: Control preference persists in localStorage
- [ ] **CTRL-03**: Default is new aiming (mouse/tap), classic available as fallback

### Terrain

- [ ] **TERR-01**: Magic Wall placements tracked by server with round-placed timestamp
- [ ] **TERR-02**: Walls expire after N rounds (configurable, default 3–5) and terrain reverts
- [ ] **TERR-03**: Visual indicator on walls approaching expiry (crack/fade on final round)

### Escrow Hardening

- [ ] **ESC-01**: Integration test covers full match flow: create → deposit → play → settle on devnet
- [ ] **ESC-02**: Stress test with multiple concurrent escrow matches
- [ ] **ESC-03**: Edge case audit: timeout refund, cancel mid-match, double-settle, disconnect during deposit
- [ ] **ESC-04**: Verify burn TX replay protection survives server restart

### Go Public

- [ ] **PUB-01**: Leaderboard screen accessible from menu showing top players by wins/K/D
- [ ] **PUB-02**: Launch announcement content ready (tweet/thread, screenshots)

## Future Requirements

Deferred to post-v3.0 milestones (from TODO.md roadmap).

### Telegram Mini App (Phase 8 in TODO.md)
- **TG-01**: Telegram bot via BotFather
- **TG-02**: Embedded wallets via Privy/Dynamic
- **TG-03**: Share match results to Telegram chat
- **TG-04**: Invite friend via TG deep link

### 3P/4P Expansion (Phase 9 in TODO.md)
- **MP-01**: 3-4 player practice matches enabled in lobby
- **MP-02**: Seeker/dApp Store submission

### Token Launch + Wagering (Phase 10 in TODO.md)
- **WAG-01**: SHOT token on mainnet with Metaplex metadata
- **WAG-02**: Meteora LP + Jupiter listing
- **WAG-03**: Wagered match modes live on mainnet
- **WAG-04**: SHOT Consumables Shop (5 items, burn on purchase)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Trajectory preview / aim assist | Tactical Scope is a future SHOT consumable, not a free feature |
| Touch-drag aim (Angry Birds style) | User decided tap-to-aim is better UX for mobile |
| New weapons or balance changes | Out of scope for this milestone |
| Wallet connection changes | Practice mode, no blockchain interaction |
| Token/SHOT visibility | Stays masked until wagering milestone |
| Mainnet deployment | Separate operational task |
| 3-4 player lobby unlock | Deferred to multiplayer expansion milestone |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (populated by roadmapper) | | |

**Coverage:**
- v3.0 requirements: 18 total
- Mapped to phases: 0
- Unmapped: 18

---
*Requirements defined: 2026-03-23*
*Last updated: 2026-03-23 after initial definition*
