**SOLSHOT**

**WEAPON REBALANCE & GAME MECHANICS SPEC**

Version 2.0 // February 2026

*Comprehensive code audit findings, balance changes, and implementation
guide*

**01 // EXECUTIVE SUMMARY**

This document is the result of a full code audit of SolShot's weapon
system, server physics engine, match state machine, and HP system. It
compares the current codebase against the v1.0 litepaper and identifies
every discrepancy, balance issue, and missing implementation. It then
provides concrete specifications for all required changes.

**Critical Findings**

**1. HP System:** HP exists server-side (Score.js, match.js,
mainsocket.js) and is functional, but set to 100. At this value, the
free Single Shot kills in 2 direct hits, making the entire weapon
economy pointless. Recommended change: 250 HP.

**2. Client Damage Display:** The client Score class has this.hp = 100
but never reduces it from turnResult data. The client needs to read the
hp field from server turnResult events and display a health bar.

**3. Server Physics Gap:** 6 of 13 launch weapons have multi-hit, DoT,
or scatter mechanics on the client that the server simulates as
single-impact projectiles. Server and client damage calculations will
disagree for Pile Driver, Crazy Ivan, Spider, Napalm, Hail Storm, and
Sniper Rifle. For a wagered game, this is critical.

**4. Sniper Rifle Mismatch:** Server WEAPON_DATA says blastRadius: 40,
damageFactor: 1.0 = 40 damage. Client uses constantUpdateScore with flat
100 damage and 1px blast radius. Completely different weapon on server
vs client.

**5. Prestige Weapon Balance:** Power curve is backwards. Silver (Chain
Reaction, 300 max damage) is stronger than Platinum (Tommy Gun, 240
max). Diamond (Mountain Mover) does zero damage. Needs complete reorder
and rebuff.

**6. Litepaper Drift:** Multiple claims in the v1.0 litepaper do not
match the codebase, including HP values, weapon descriptions, server
authority claims, and the weapon roster itself.

**02 // HP SYSTEM: 100 → 250**

**Why 250 HP**

The target match length is 5 minutes. With 20 turns per round (10 shots
each) at roughly 15 seconds per turn, that gives 5 minutes. At 250 HP, a
player needs to land 5 perfect Single Shot hits (60 damage each = 300,
overkilling by 50) or a mix of weapon types. Not every shot lands
perfectly, so realistic kill time is 7-8 shots — leaving 2-3 turns of
terrain manipulation, misses, and strategic play.

**Hits-to-Kill Comparison**

|                      |            |              |              |              |              |
|----------------------|------------|--------------|--------------|--------------|--------------|
| **Weapon**           | **Damage** | **@ 100 HP** | **@ 200 HP** | **@ 250 HP** | **@ 300 HP** |
| **Single Shot**      | 60         | 2            | 4            | 5            | 5            |
| **Big Shot**         | 30         | 4            | 7            | 9            | 10           |
| **3 Shot (all hit)** | 60         | 2            | 4            | 5            | 5            |
| **Heatseeker**       | 40         | 3            | 5            | 7            | 8            |
| **Sniper Rifle**     | 100        | 1            | 2            | 3            | 3            |
| **Pile Driver**      | 120 max    | 1            | 2            | 3            | 3            |
| **Jackhammer**       | 50 max     | 2            | 4            | 5            | 6            |
| **Crazy Ivan**       | 260 max    | 1            | 1            | 1            | 2            |

At 250 HP, the Single Shot needs 5 direct hits — creating room for 5
other turns of tactical play. The Sniper Rifle needs 3 direct hits with
a 1px blast radius, making it high-risk/high-reward. Crazy Ivan can
theoretically one-shot but most particles miss, making it a gamble. This
is exactly the balance SolShot needs.

**Code Changes Required (7 Locations)**

|                                    |                             |                                              |
|------------------------------------|-----------------------------|----------------------------------------------|
| **File**                           | **Location**                | **Change**                                   |
| **server/services/match.js**       | **createMatchState()**      | Comment: '100 per player' → '250 per player' |
| **server/services/match.js**       | **resetForNextRound()**     | hp\[playerId\] = 100 → 250                   |
| **server/services/match.js**       | **getRoundWinner()**        | ?? 100 fallback → ?? 250                     |
| **server/socket-io/mainsocket.js** | **requestTerrain (host)**   | ms.hp\[host\] = 100 → 250                    |
| **server/socket-io/mainsocket.js** | **requestTerrain (player)** | ms.hp\[player\] = 100 → 250                  |
| **server/socket-io/mainsocket.js** | **fire handler default**    | hp\[playerId\] = 100 → 250                   |
| **client/src/classes/Score.js**    | **constructor**             | this.hp = 100 → 250                          |

**03 // COMPLETE WEAPON ROSTER**

The redesigned roster has 15 base weapons across 6 tiers plus 5 prestige
weapons, for 20 total. Two weapons are added back from the legacy
codebase (Skipper and Ground Hog) to fill gaps in the tactical toolkit.
All damage values assume 250 HP.

**Launch Roster (15 Weapons)**

|                  |           |          |             |            |         |                     |
|------------------|-----------|----------|-------------|------------|---------|---------------------|
| **Weapon**       | **Tier**  | **Cost** | **Blast R** | **Damage** | **HTK** | **Role**            |
| **Single Shot**  | Free      | 0        | 46          | 60         | 5       | Reliable baseline   |
| **Dirt Ball**    | Standard  | 150G     | —           | 0          | —       | Terrain creation    |
| **Magic Wall**   | Standard  | 200G     | —           | 0          | —       | Terrain wall        |
| **Skipper\***    | Tactical  | 350G     | 52          | 40         | 7       | Bouncing projectile |
| **3 Shot**       | Tactical  | 400G     | 46 ×3       | 20 ea      | 5†      | Spread coverage     |
| **Spider**       | Tactical  | 400G     | 80+28       | 20+subs    | Var     | Proximity split     |
| **Heatseeker**   | Tactical  | 500G     | 80          | 40         | 7       | Guided forgiveness  |
| **Napalm**       | Rare      | 600G     | DoT         | Var        | Var     | Area denial + melt  |
| **Pile Driver**  | Rare      | 600G     | 46→6        | 20 ×6      | 3†      | Terrain drilling    |
| **Sniper Rifle** | Rare      | 700G     | 1px         | 100        | 3       | Precision kill      |
| **Big Shot**     | Rare      | 700G     | 90          | 30         | 9       | Max forgiveness     |
| **Ground Hog\*** | Epic      | 900G     | 70          | 50         | 5       | Tunnel + emerge     |
| **Jackhammer**   | Epic      | 1000G    | 36          | 10 ×5      | 5†      | Vertical drill      |
| **Hail Storm**   | Epic      | 1200G    | DoT         | Var        | Var     | Rain coverage       |
| **Crazy Ivan**   | Legendary | 2500G    | 36 ×15      | 20 ea      | 1†      | Chaos scatter       |

\* Skipper and Ground Hog are added back from the legacy codebase. Both
already have complete client implementations in Standard.js.

† Multi-hit weapons: HTK assumes all projectiles land, which rarely
happens. Realistic HTK is 1.5-2× the listed value.

**Weapon Design Philosophy**

The roster is structured around three strategic pillars that create
meaningful choices:

**Precision vs Forgiveness:** Single Shot (60 dmg, 46r) rewards perfect
aim. Big Shot (30 dmg, 90r) forgives poor aim but requires twice as many
hits. Sniper Rifle (100 dmg, 1px) is the ultimate high-risk/high-reward
— miss by 2 pixels and you deal zero.

**Attack vs Terrain:** Dirt Ball and Magic Wall create cover or bury
opponents. Pile Driver and Ground Hog destroy terrain and expose buried
tanks. Napalm melts terrain while dealing damage. The terrain is an
active strategic element, not just scenery.

**Reliable vs Chaotic:** Heatseeker homes for guaranteed contact. Crazy
Ivan scatters 15 random explosions — devastating if centered, wasted if
scattered. The Gold cost should reflect the risk: reliable weapons are
cheaper, chaotic weapons are expensive but potentially game-ending.

**04 // PRESTIGE WEAPONS (REBALANCED)**

The prestige roster is completely reordered. Each tier must feel more
powerful and more spectacular than the last. A Diamond player should
have access to the most visually dramatic and mechanically devastating
weapon in the game.

**Current vs Proposed**

|              |                    |              |                    |             |                                                            |
|--------------|--------------------|--------------|--------------------|-------------|------------------------------------------------------------|
| **Tier**     | **Current**        | **Cur. Dmg** | **Proposed**       | **New Dmg** | **Rationale**                                              |
| **Bronze**   | **Homing Missile** | 20           | **Homing Missile** | 60          | Buff to match Single Shot; guided = forgiving entry reward |
| **Silver**   | **Chain Reaction** | 300 max      | **Cruiser**        | 80          | Rolling bomb; unique mechanic, solid mid-tier              |
| **Gold**     | **Cruiser**        | 60           | **Tommy Gun**      | 20 ×12      | Rapid-fire burst; visually exciting, ~240 max potential    |
| **Platinum** | **Tommy Gun**      | 240 max      | **Chain Reaction** | 20 ×15      | 15 sequential blasts; ~300 max; spectacle weapon           |
| **Diamond**  | **Mountain Mover** | 0            | **Pineapple**      | 640 max     | Splits into 20 fragments; ultimate prestige weapon         |

**Key Changes Explained**

**Homing Missile (Bronze):** Damage buffed from 20 to 60. The original
20 damage was weaker than the free Single Shot — a terrible first
prestige reward. At 60 with homing, it's equivalent damage to Single
Shot but guided, making it a genuine quality-of-life upgrade that
rewards the player's commitment.

**Cruiser (Silver → moved from Gold):** Damage buffed from 60 to 80. The
rolling mechanic is unique and fun but needs to hit harder than Single
Shot to justify its tier. At 80 it's a meaningful upgrade — reliable
terrain-following damage.

**Tommy Gun (Gold → moved from Platinum):** Kept at 20 per bullet × 12
shots = 240 max. The rapid-fire visual is exciting and the multi-hit
nature creates satisfying screen coverage. Good milestone weapon.

**Chain Reaction (Platinum → moved from Silver):** The 15 sequential
blasts carpet-bombing an area is the most visually spectacular weapon in
the base roster. Moving it to Platinum makes it feel earned. At 300 max
theoretical, it's genuinely powerful.

**Pineapple (Diamond → replaces Mountain Mover):** The current Diamond
weapon (Mountain Mover) does zero damage. That's unacceptable for the
ultimate prestige unlock. Pineapple splits into 20 fragments on
proximity with a theoretical 640 max damage. It already exists in
Standard.js. This is the definitive prestige weapon — visually
explosive, mechanically devastating, and worthy of 8,400 SHOT burned.

Mountain Mover is removed from the prestige roster entirely. It can
remain as a terrain-only utility weapon available in the base shop at
Epic tier if desired, or be cut from the game. A zero-damage weapon has
no place as a prestige reward.

**05 // DAMAGE CURVE ANALYSIS**

This section shows how all 20 weapons perform against 250 HP, sorted by
effective damage per shot. 'Effective' means realistic damage accounting
for typical accuracy — multi-hit weapons rarely land all projectiles.

|                    |             |              |              |          |              |                 |
|--------------------|-------------|--------------|--------------|----------|--------------|-----------------|
| **Weapon**         | **Max Dmg** | **Real Dmg** | **Real HTK** | **Cost** | **Dmg/Gold** | **Category**    |
| **Dirt Ball**      | 0           | 0            | —            | 150G     | —            | Utility         |
| **Magic Wall**     | 0           | 0            | —            | 200G     | —            | Utility         |
| **Big Shot**       | 30          | 25           | 10           | 700G     | 0.04         | Forgiveness     |
| **Heatseeker**     | 40          | 35           | 8            | 500G     | 0.07         | Guided          |
| **Skipper**        | 40          | 30           | 9            | 350G     | 0.09         | Bounce trick    |
| **Spider**         | ~180        | 40           | 7            | 400G     | 0.10         | Proximity split |
| **3 Shot**         | 60          | 40           | 7            | 400G     | 0.10         | Spread          |
| **Ground Hog**     | 50          | 45           | 6            | 900G     | 0.05         | Tunnel          |
| **Jackhammer**     | 50          | 40           | 7            | 1000G    | 0.04         | Vertical drill  |
| **Napalm**         | Var         | 50           | 5            | 600G     | 0.08         | Area denial     |
| **Single Shot**    | 60          | 50           | 5            | Free     | ∞            | Baseline        |
| **Homing Missile** | 60          | 55           | 5            | Prestige | —            | Guided (P)      |
| **Pile Driver**    | 120         | 60           | 5            | 600G     | 0.10         | Drilling        |
| **Cruiser**        | 80          | 65           | 4            | Prestige | —            | Rolling (P)     |
| **Hail Storm**     | Var         | 70           | 4            | 1200G    | 0.06         | Rain            |
| **Sniper Rifle**   | 100         | 70           | 4            | 700G     | 0.10         | Precision       |
| **Tommy Gun**      | 240         | 100          | 3            | Prestige | —            | Rapid-fire (P)  |
| **Crazy Ivan**     | 300         | 120          | 3            | 2500G    | 0.05         | Chaos           |
| **Chain Reaction** | 300         | 150          | 2            | Prestige | —            | Carpet (P)      |
| **Pineapple**      | 640         | 200          | 2            | Prestige | —            | Fragment (P)    |

The damage curve creates clear strategic tiers: Utility (0 damage, pure
terrain), Low (25-40, forgiving), Medium (40-60, balanced), High
(60-100, skill-rewarding), and Devastating (120-200,
prestige/legendary). Each tier has a clear role and no weapon is
strictly dominated by another at the same price point.

**06 // GOLD ECONOMY VALIDATION**

With 250 HP and the revised weapon roster, the Gold economy needs to
hold up across BO1 and BO3 matches. Here's the math:

**Round 1 Budget: 1,000G**

Constrained by design. Players can afford:

**Aggressive:** Sniper Rifle (700G) + Dirt Ball (150G) = 850G. High
damage potential, one defensive option, 150G saved.

**Balanced:** Heatseeker (500G) + 3 Shot (400G) = 900G. Guided + spread
coverage, 100G saved.

**Tactical:** Skipper (350G) + Spider (400G) + Magic Wall (200G) = 950G.
All terrain-aware weapons plus defense.

**Conservative:** Big Shot (700G) + Magic Wall (200G) = 900G. Maximum
forgiveness + defense, 100G saved.

The Legendary tier (Crazy Ivan at 2,500G) is unreachable in round 1,
creating natural aspiration.

**Round 2 Budget (BO3): ~3,500-4,000G**

Assuming round 1 winner dealt ~150 damage (+2,250G), got the kill
(+200G), and won the round (+300G): starting budget of ~3,750G. This
opens up Epic weapons and multiple Rare purchases. Still not enough for
Crazy Ivan unless the player was very efficient in round 1.

**Round 3 Budget (BO5): ~5,000-6,000G+**

By round 3, accumulated Gold from combat makes Crazy Ivan affordable.
This is where the full arsenal opens up and matches become the most
strategic. The economy scales naturally with match length.

**Gold Earning Rates**

Current rates from the litepaper are well-balanced for 250 HP:

**+15G per HP damage dealt:** At 250 HP total, killing a player earns
3,750G. This is the primary income source and directly rewards
aggression.

**+200G kill bonus:** Incentivizes finishing over chip damage.

**+300G round win:** Rewards winning, not just dealing damage.

No changes recommended to Gold earning rates.

**07 // SERVER PHYSICS OVERHAUL**

The current server physics engine (services/physics.js) treats every
weapon as a single-impact projectile. This is fundamentally incompatible
with 6 of the 15 base weapons and 4 of the 5 prestige weapons. For a
wagered game where real SOL is at stake, server and client MUST agree on
damage.

**Weapons Requiring Multi-Hit Server Physics**

|                     |                                                        |                                        |                                                        |
|---------------------|--------------------------------------------------------|----------------------------------------|--------------------------------------------------------|
| **Weapon**          | **Client Mechanic**                                    | **Server (Current)**                   | **Server (Required)**                                  |
| **Sniper Rifle**    | 1px blast, flat 100 dmg via constantUpdateScore        | 40r blast, 40 dmg via standard formula | 1px blast, flat 100 dmg constant                       |
| **Pile Driver**     | 6 sequential blasts drilling downward, 20 dmg each     | Single impact, 50 dmg                  | 6 sequential impacts at increasing depth               |
| **Crazy Ivan**      | ~13 chaotic particles, 20 dmg each at random positions | Single impact treated as scatter       | 13 random offsets from impact, 20 dmg each             |
| **Spider**          | Main blast (80r) + 6 crawling subs (28r each)          | Single impact at 28r                   | Main blast + 6 sub-impacts at offset positions         |
| **Napalm**          | 20 particles, DoT proximity burn over time             | Single 60r impact                      | DoT: N ticks of damage within radius over duration     |
| **Hail Storm**      | 20 bouncing projectiles raining down                   | Single 36r impact                      | N projectiles falling within area, each dealing splash |
| **3 Shot**          | 3 projectiles at spread angles                         | Single impact at 46r                   | 3 separate trajectories + impacts                      |
| **5 Shot**          | 5 projectiles at spread angles                         | Not in server WEAPON_DATA              | 5 separate trajectories + impacts                      |
| **Jackhammer**      | 5 vertical drill blasts at 10 dmg each                 | Single impact at 36r                   | 5 sequential vertical impacts                          |
| **Tommy Gun (P)**   | 12 rapid-fire shots at 20 dmg each                     | Not in server WEAPON_DATA              | 12 separate trajectories + impacts                     |
| **Chain React (P)** | 15 sequential blasts along surface                     | Not in server WEAPON_DATA              | 15 sequential impacts along terrain                    |
| **Pineapple (P)**   | Main blast + 20 fragment sub-munitions                 | Not in server WEAPON_DATA              | Main blast + 20 offset impacts                         |

**Implementation Approach**

Rather than perfectly simulating client-side Phaser physics on the
server (which would require porting the entire particle/bounce/DoT
system), the recommended approach is deterministic approximation:

**Multi-projectile weapons (3 Shot, 5 Shot, Tommy Gun):** Calculate N
separate trajectories with angle offsets matching the client spread
pattern. Each trajectory gets independent impact detection and damage
calculation.

**Sequential weapons (Pile Driver, Jackhammer, Chain Reaction):**
Calculate first impact, then generate subsequent impacts at fixed
offsets (downward for drill, horizontal for chain). Each sub-impact
applies damage independently.

**Scatter weapons (Crazy Ivan, Pineapple):** Calculate main impact
point, then generate N sub-impacts at random offsets within a scatter
radius. Use the same seed on both server and client so randomness is
deterministic.

**DoT weapons (Napalm, Hail Storm):** Convert to equivalent burst
damage. Calculate a fixed number of damage ticks based on proximity to
target at impact. This won't perfectly match the client's real-time
particle simulation, but will be close enough for fair wagering.

**Sniper Rifle:** Simplest fix. Change WEAPON_DATA to blastRadius: 1,
and add a constant damage path that awards 100 on direct hit, 0 on miss.
No trajectory changes needed.

**Updated WEAPON_DATA**

The server WEAPON_DATA object needs to be expanded to include all 20
weapons with correct parameters. The prestige weapons (Homing Missile,
Cruiser, Tommy Gun, Chain Reaction, Pineapple) currently have no server
physics definitions at all — they need to be added.

**08 // TURNS PER ROUND**

The current turnsPerRound is 20 (10 shots each). With 250 HP this should
work, but it's worth validating:

**Best case (skilled player):** Deals ~60 damage per shot on average.
Needs ~4.2 shots to kill. Match ends in ~8 turns total. Well within
20-turn limit.

**Worst case (evenly matched):** Both players deal ~30 damage per shot.
After 10 shots each (20 turns), each has dealt ~300 damage — enough to
kill. Matches almost always end by HP depletion, not turn limit.

**Recommendation:** Keep turnsPerRound at 20. The turn limit serves as a
safety net for stalemates (e.g., both players building walls), not as
the primary match-ending condition.

**Wind**

The litepaper mentions wind affecting projectile trajectory, but the
server physics engine (calculateTrajectory) has no wind parameter. Wind
needs to be added to both server and client physics for parity. This is
a separate implementation task but should be noted as a gap.

**09 // LITEPAPER v2.0 CORRECTIONS**

The following changes should be made to bring the litepaper in line with
the rebalanced codebase:

|                           |                                                    |                                                                                                      |
|---------------------------|----------------------------------------------------|------------------------------------------------------------------------------------------------------|
| **Section**               | **Current**                                        | **Corrected**                                                                                        |
| **Game Mechanics**        | "When one player reaches 0 HP" (HP not specified)  | "Each player starts with 250 HP. When one reaches 0 HP, the round ends."                             |
| **Launch Weapons**        | 13 weapons listed                                  | 15 weapons: add Skipper (Tactical, 350G) and Ground Hog (Epic, 900G)                                 |
| **Weapon count**          | "13 Launch Weapons" in key metrics                 | "15 Launch Weapons"                                                                                  |
| **Prestige: Silver**      | Chain Reaction                                     | Cruiser (rolling terrain bomb, 80 damage)                                                            |
| **Prestige: Gold**        | Cruiser                                            | Tommy Gun (12 rapid-fire shots)                                                                      |
| **Prestige: Platinum**    | Tommy Gun                                          | Chain Reaction (15 sequential blasts)                                                                |
| **Prestige: Diamond**     | Mountain Mover (terrain displacement)              | Pineapple (splits into 20 fragments, 640 max damage)                                                 |
| **Diamond count**         | "18 weapons vs 13 for new players"                 | "20 weapons vs 15 for new players"                                                                   |
| **Security: Server Auth** | "All physics calculations... computed server-side" | Add note: complex weapon physics (scatter, DoT, multi-hit) simulated via deterministic approximation |
| **Wind**                  | "Wind affects projectile trajectory"               | Either implement wind or remove from litepaper                                                       |

**10 // IMPLEMENTATION PRIORITY**

Ordered by impact and dependency:

|        |                                         |            |            |                                                                |
|--------|-----------------------------------------|------------|------------|----------------------------------------------------------------|
| **\#** | **Task**                                | **Effort** | **Impact** | **Notes**                                                      |
| **1**  | **HP 100 → 250 (7 locations)**          | 30 min     | Critical   | Find and replace. Instantly fixes balance.                     |
| **2**  | **Fix Sniper Rifle WEAPON_DATA**        | 15 min     | Critical   | blastRadius: 1, constant 100 damage path.                      |
| **3**  | **Client HP bar from turnResult**       | 2-3 hrs    | High       | Read hp from turnResult, render health bar UI.                 |
| **4**  | **Add Skipper + Ground Hog to server**  | 1-2 hrs    | Medium     | Add WEAPON_DATA entries, add to weapon catalog.                |
| **5**  | **Prestige weapon reorder**             | 1-2 hrs    | High       | Update prestige tiers, swap weapon assignments.                |
| **6**  | **Homing Missile damage buff**          | 30 min     | Medium     | Client: 20→60 in Standard.js. Server: update WEAPON_DATA.      |
| **7**  | **Cruiser damage buff**                 | 30 min     | Medium     | Client: 60→80 in Standard.js. Server: update WEAPON_DATA.      |
| **8**  | **Add Pineapple to prestige (Diamond)** | 1-2 hrs    | High       | Already in Standard.js. Wire to prestige tier.                 |
| **9**  | **Multi-hit server physics**            | 2-3 days   | Critical   | The big one. Required for wagered match integrity.             |
| **10** | **Add prestige weapons to WEAPON_DATA** | 2-3 hrs    | High       | Tommy Gun, Chain Reaction, Pineapple, Cruiser, Homing Missile. |
| **11** | **Wind implementation**                 | 1-2 days   | Medium     | Server + client parity. Or remove from litepaper.              |
| **12** | **Litepaper v2.0 update**               | 2-3 hrs    | Medium     | All corrections from Section 09.                               |

Total estimated effort: 5-7 working days for all changes. Tasks 1-2 can
be done immediately. Task 9 (multi-hit server physics) is the largest
single effort and blocks wagered match integrity.

**11 // FINAL WEAPON ROSTER SUMMARY**

Complete roster of all 20 weapons in SolShot v2.0:

**Base Weapons (15) — Available to all players**

Free: Single Shot

Standard (150-200G): Dirt Ball, Magic Wall

Tactical (350-500G): Skipper, 3 Shot, Spider, Heatseeker

Rare (600-700G): Napalm, Pile Driver, Sniper Rifle, Big Shot

Epic (900-1200G): Ground Hog, Jackhammer, Hail Storm

Legendary (2500G): Crazy Ivan

**Prestige Weapons (5) — Unlocked by burning SHOT**

Bronze (200 SHOT): Homing Missile — guided, 60 damage

Silver (500 SHOT): Cruiser — rolling terrain bomb, 80 damage

Gold (1,200 SHOT): Tommy Gun — 12 rapid-fire shots, 240 max

Platinum (2,500 SHOT): Chain Reaction — 15 sequential blasts, 300 max

Diamond (4,000 SHOT): Pineapple — 20 fragment split, 640 max

*— END OF DOCUMENT —*
