# Feature Landscape: N-Player Artillery (2–4)

**Domain:** Browser-based multiplayer turn-based artillery, last-man-standing format
**Project:** SolShot — refactoring 1v1 to support 2–4 players
**Researched:** 2026-02-26
**Research mode:** Ecosystem — surveying Worms, ShellShock Live, Tank Stars, Pocket Tanks

---

## Research Notes on Sources

Games surveyed:
- **Worms Armageddon / WMD** — The genre gold standard for N-player FFA turn-based artillery. Up to 6 teams online. Round-robin turn order. Elimination-based. Multi-round "rounds to win" format.
- **ShellShock Live** — Up to 8 players, simultaneous-fire or sequential, multiple game modes (Deathmatch FFA, Points, Assassin, Juggernaut). Eliminated players spectate.
- **Tank Stars** — Mobile 1v1 only. No N-player mode. Not directly relevant but confirms 10-second turn timers as a viable mobile pattern.
- **Pocket Tanks** — 1v1 only by design. Community requests for 4-player exist but never shipped. Confirms this refactor enters uncharted territory for the Pocket Tanks sub-genre.

Confidence: MEDIUM. Core turn mechanics and elimination behavior sourced from official wikis and community documentation. BO3/BO5 with N players is under-documented in the genre — extrapolated from Worms WMD's "rounds to win" system and first-principles game design.

---

## Table Stakes

Features players expect from any N-player artillery game. Absence makes the product feel broken or unfinished.

| Feature | Why Expected | Complexity | Existing Code Dependency |
|---------|--------------|------------|--------------------------|
| Round-robin turn order | Every artillery game with 3+ players uses this. Players are confused/angry if skipped. | Low | `getNextTurn()` rewrite (already spec'd in brief) |
| Skip eliminated players in turn rotation | If an eliminated player's turn is never skipped, the game halts. Non-negotiable correctness. | Low | `players[i].alive` flag + `getNextTurn` loop |
| N HP bars in HUD | Players need to see all opponents' health at a glance. 2-bar HUD breaks at 3+ players. | Medium | GameBridge extension, React HUD |
| Eliminated player visual state | Tank visually destroyed/greyed. HP bar greyed out. Players know who is alive. | Low | Phaser tank destroy + bridge setPlayerEliminated |
| Turn indicator for active player | With 4 players, it's unclear whose turn it is. Arrow or glow on active tank + active HP bar highlight. | Low | Extend existing turn logic |
| Color-coded players | Each of 2–4 players has a unique, persistent color. No confusion about who is who. | Low | Colors already defined: red/blue/green/yellow in brief |
| Last-man-standing win condition | Standard for N-player FFA. The survivor wins the round. | Low | `isRoundOver` — count alive > 1 |
| Player count selector in room creation | Host must be able to choose 2, 3, or 4. | Low | `createRoom` + LobbyScreen UI |
| Lobby shows N/maxPlayers slot count | "2/4 players" status. Players need to know how full a room is. | Low | `getOpenRooms` broadcast |
| Waiting room shows all N joined players with ready status | Players expect to see all participants before game starts. | Low | Room broadcast update |
| Game starts only when all slots filled AND all ready | Prevents starting with ghost slots. | Low | `ready` handler checks `players.every(p => p.isReady)` |
| Disconnected player handling for N players | If one of 4 disconnects mid-match, the remaining 3 should continue (not block). | Medium | Reconnect logic needs "eliminate-on-timeout" path for 3+ player matches |
| Spectating after elimination | Industry standard. Eliminated players watch remaining combat. | Medium | New client state: spectator mode after playerEliminated |

---

## Differentiators

Features that are not universally expected but add real value. Worms and ShellShock Live do not all implement these for small-scale N-player modes.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Placement-based round scoring (1st/2nd/3rd/4th) | Fairer than binary win/lose for N-player BO3/BO5. Rewards 2nd place survival, not just the winner. | Medium | Worms WMD awards: 4th=0pts, 3rd=1pt, 2nd=2pts, 1st=3pts. Apply to `roundWins` tracking. |
| Gold economy scaled to player count | More targets = more damage opportunities = faster gold accumulation. Reduce kill bonus or damage-gold rate for 3–4 player matches or balance will snowball. | Medium | `gold.js` kill/damage bonuses need a `playerCount` scale factor |
| Weapon shop between rounds carries forward for survivors only | Eliminated players in a BO3 round should not carry eliminated-round weapons. Standard Worms behavior: surviving player keeps inventory. | Medium | `weaponInventories` reset for eliminated players at round start |
| "Gang-up on leader" mitigation: no enforced targeting, players choose freely | Do not implement forced target restrictions. Let natural FFA politics emerge. Assassin-mode forced targeting (ShellShock) works for 8 players, not 4. | Low (design decision, no code) | Anti-feature avoidance — see below |
| Post-round placement summary screen | Show "1st: [player], 2nd: [player], 3rd: [player]" with gold earned per placement. Replaces current 2-player win/lose screen. | Medium | WinScreen.js / LoseScreen.js redesign |
| Seeker badge in waiting room for Seeker device owners | Differentiates SolShot for its target distribution channel. Low-lift unique identity signal. | Low | Already spec'd in seeker brief, ~30 LOC hook |
| N-player escrow: pot split winner-takes-all | All N wagers pool into escrow, winner claims (N-1) × wager minus fees. | High | Anchor program needs N-slot PDA; `create_match` needs `player_count: u8` |
| Placement-based pot split for 3–4 player wager matches | Industry-standard poker tournament structure: 1st takes ~65%, 2nd takes ~35% (3-player) or 60/25/15 (4-player). Requires Anchor program changes. | Very High | Out of scope for this milestone; winner-takes-all is sufficient for launch |

---

## Anti-Features

Features to deliberately NOT build. These are common mistakes in N-player artillery design.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Forced target restrictions ("Assassin mode" style for 4 players) | Works in 8-player lobbies where direct targeting would chaos. At 3–4 players it feels arbitrary and kills agency. Community discusses this as a known frustration in smaller Worms lobbies. | Let players choose any target freely. Natural FFA politics emerge organically. |
| Simultaneous-fire mode (all shoot at once) | ShellShock Live offers it, but it requires fundamentally different server physics (concurrent projectile resolution). SolShot is server-authoritative sequential. Rewriting the physics model is out of scope. | Keep sequential turn-based. 60-second turn timers already prevent slowdowns. |
| Team modes (2v2 for 4 players) | Adds entirely separate matchmaking queue, team chat, shared weapon pools, and "friendly fire" decision. This is a second product feature set, not an extension of FFA. | FFA only for this milestone. Team modes are a future milestone. |
| Friendly fire toggle | In FFA with 3–4 players, friendly fire doesn't apply (no allies). Adding it as a team mode pre-requisite drags in team mode complexity. | Not applicable in FFA. Remove from consideration. |
| Turn time limit reduction for N players | Intuition says "4 players means longer waits, so reduce turn time." But 60 seconds already feels tight. Shorter turns penalize thoughtful play. Perceived wait time is better addressed by spectator engagement, not timer reduction. | Keep 60-second timer. Add spectator engagement (animation observation) instead. |
| Variable player counts mid-match (drop-in) | Allowing a 5th player to join an in-progress 4-player match is UX/server complexity that adds no product value for SolShot's wager context. | Fixed player count set at room creation, locked when game starts. |
| BO3/BO5 for 3–4 player matches at launch | Best-of series with N players requires placement tracking across rounds, which weapon inventories carry forward for which survivors, and round-win scoring logic that is meaningfully different from 1v1 BO3. The single-round (BO1) FFA format is what players expect and what Worms WMD defaults to for FFA. | Ship BO1 FFA for 3–4 players. Keep BO3/BO5 as 1v1-only formats initially. |
| Spectator chat or spectator-to-player messaging | Scope creep. Spectating after elimination is the feature — allowing spectators to communicate disrupts the match. | Read-only spectating. No chat, no interference. |
| AI bot fill for incomplete lobbies | Adding bots requires a physics-capable AI decision system — essentially building an AI player. This is a separate multi-week milestone. | Design the lobby with a "start early" option (host can start with fewer than maxPlayers, filling the remaining slot count with... nothing — just don't fill). OR require all slots filled. Recommend: require all slots filled. |

---

## Feature Dependencies

Dependencies between features — what must exist before what.

```
Room creation maxPlayers selector
  → Lobby N-player waiting room
    → Server: players[] array replaces host/player binary
      → requestTerrain: N tank spawn positions
        → Phaser: N tank instances (this.tanks[])
          → N HP bars in HUD
            → Turn rotation skipping eliminated players
              → playerEliminated event
                → Client spectator state
                → HUD bar greyed out
              → Last-man-standing isRoundOver
                → Round winner determination (N-player)
                  → Placement-based scoring (differentiator)
                    → Post-round placement summary screen

Gold economy scale factor (differentiator)
  → Depends on: players[] array (player count known)
  → No other dependencies

N-player escrow (differentiator)
  → Depends on: Anchor program N-slot PDA
  → Depends on: All game logic milestone complete
  → Do NOT block game logic on this
```

---

## MVP Recommendation

For this milestone (2–4 player game logic), prioritize in this order:

**Must ship:**
1. `players[]` array server model (all else depends on this)
2. Round-robin turn rotation with eliminated-player skipping
3. N tank positions from terrain generation
4. `playerEliminated` event + visual + HUD
5. Last-man-standing `isRoundOver` (alive count <= 1)
6. N HP bars in React HUD with color coding and turn indicator
7. Lobby: player count selector, N-player waiting room, all-ready gate
8. Client: N tank instances, `myPlayerIndex` turn detection
9. Spectator state after elimination (passive — no gameplay)

**Defer to follow-on milestone:**
- Placement-based scoring (BO1 round winner = last alive; that is sufficient)
- Gold economy scale factor (balance pass after playtesting)
- Weapon shop carry-forward for survivors only (acceptable to reset all at round start for launch)
- N-player escrow / Anchor program changes (Practice mode first, wager N-player later)
- Placement pot split (high complexity, low urgency)
- Post-round placement summary screen (use existing WinScreen/LoseScreen with N names)
- BO3/BO5 for 3–4 players (defer; BO1 FFA launches cleanly)

---

## BO3/BO5 with N Players — Design Note

The existing BO3/BO5 system uses `isMatchOver(ms, hostId, playerId)` which is binary (first to ceil(maxRounds/2) round wins). For N-player FFA, the equivalent would be:

**Option A (recommended for launch): Track round wins, first to 2 (BO3) or 3 (BO5) wins the match.**
- Round winner = last player alive per round
- Simplest extension of existing logic
- Works but means eliminated players in early rounds are locked out of meaningful BO3 participation

**Option B (deferred): Placement points across rounds.**
- Worms WMD style: 4th=0pts, 3rd=1pt, 2nd=2pt, 1st=3pts per round
- After N rounds, highest point total wins
- More engaging for players who get eliminated first
- More complex scoring logic

**Recommendation:** Ship BO1 only for 3–4 player FFA at launch. BO3/BO5 for N-player is a subsequent design+implementation milestone after playtesting validates the base game.

---

## Gold Economy Scaling — Design Note

Current economy: 1000G start, +15G per HP dealt, +200G kill bonus, +300G win bonus.

In a 4-player match with three valid targets (vs. one in 1v1), the expected gold per round increases roughly 2–3x from damage opportunities. This means players reach weapon shop prices faster and the economy feels inflated.

**Recommendation for launch:** Do not tune yet. Ship with identical economy and observe. The weapon shop exists between rounds (BO3/BO5) — for BO1 FFA (recommended launch format for N-player), there is no between-round shop, so economy balance is moot for the first milestone.

**If BO3/BO5 N-player ships later:** Apply a `playerCount` scale factor to kill/damage gold rewards. Suggested: divide kill bonus by `(playerCount - 1)` so killing 1 of 3 opponents nets the same gold as killing the 1 opponent in 1v1.

---

## Wager / Escrow Design Note for N Players

The existing Anchor program (`CqvRC6mSJe2CrBtENVfCEPkgRW3WwxLSL9C1hgXz7GtD`) uses a binary 2-wallet PDA. For N-player wagering:

- `create_match` needs `player_count: u8` and N depositor slots
- `deposit_wager` called individually by each of N players
- `settle_match` pays out winner from the pooled amount (N × wager × 0.90), with 7% treasury, 3% ops
- `cancel_match` refunds all N depositors in full

This is a meaningful Anchor program rewrite. **Do not block the game logic milestone on it.** Practice mode (no wager) validates N-player game logic first.

**Winner-takes-all is correct for launch.** Placement-based pot split (60/25/15 for 4-player) is complex and requires more smart contract logic. It can ship as a follow-on upgrade without breaking existing matches.

---

## Sources

- [Worms Armageddon — Worms Wiki](https://worms.fandom.com/wiki/Worms_Armageddon) — turn order, alliance system
- [Worms WMD Turn Order Discussion — Steam](https://steamcommunity.com/app/327030/discussions/0/208684375422028813/) — "rounds to win" multi-round format, random turn start
- [ShellShock Live — Wikipedia](https://en.wikipedia.org/wiki/ShellShock_Live) — FFA deathmatch, elimination, spectating
- [ShellShock Live Game Modes Archive Wiki](https://shellshock-live-archive.fandom.com/wiki/Game_Modes) — Deathmatch, Points, Assassin modes
- [ShellShock Live Spectator Discussion — Steam](https://steamcommunity.com/app/326460/discussions/0/357285398699932778/) — eliminated players enter spectate
- [ShellShock Live NamuWiki](https://en.namu.wiki/w/ShellShock%20Live) — simultaneous fire alternative, mode list
- [Worms WMD FFA Scoring — Steam community thread](https://steamcommunity.com/app/327030/discussions/0/1488866813778981941/) — "teaming up" kingmaker dynamics in FFA
- [Last Man Standing — Wikipedia](https://en.wikipedia.org/wiki/Last_man_standing_(video_games)) — genre definition, spectate pattern
- [Kingmaking Problem — Board Game Designers Forum](https://www.bgdf.com/forum/archive/archive-game-creation/topics-game-design/tigd-kingmaking-common-problem-2) — FFA fairness design
- [Worms Tournament Scoring note](https://steamcommunity.com/app/327030/discussions/0/343788552537127120/) — 4th/3rd/2nd/1st placement scoring
- [Poker Tournament Payout Structure — Beasts of Poker](https://beastsofpoker.com/poker-tournament-payout-structure/) — N-player pot split ratios reference
- [Matchmaking with bots — Heroic Labs](https://forum.heroiclabs.com/t/matchmaking-with-bots/4326) — bot-fill tradeoffs
- SolShot codebase: `server/services/match.js`, `SOLSHOT_SEEKER_AND_4PLAYER_BRIEF.md` — existing architecture reference
