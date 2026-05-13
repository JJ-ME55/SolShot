**SOLSHOT**

**LITEPAPER**

**ARTILLERY COMBAT ON SOLANA**

Version 2.0 // February 2026

**SolShot.gg**

*This document describes the design, mechanics, and tokenomics of
SolShot, a browser-based multiplayer artillery game with Solana
blockchain integration. It is not financial advice and does not
constitute an offer of securities.*

**ARTILLERY COMBAT ON SOLANA**

**CONTENTS**

01 OVERVIEW

02 GAME MECHANICS

03 WEAPON SYSTEM

04 GOLD ECONOMY

05 SOL WAGERING

06 SHOT TOKEN

07 PRESTIGE SYSTEM

08 SECURITY

09 ROADMAP

10 TEAM & LINKS

**01 // OVERVIEW**

SolShot is a browser-based, real-time multiplayer artillery game built
on the Solana blockchain. Players compete in 1v1 tank battles, adjusting
angle and power to fire projectiles across destructible terrain. The
twist: matches can be wagered with real SOL, settled trustlessly through
on-chain escrow smart contracts.

The game combines the nostalgia of classic artillery games (Pocket
Tanks, Scorched Earth, Worms) with the speed and low cost of Solana
transactions, creating a skill-based wagering experience where better
players earn more.

**Key Metrics**

|                 |                 |                    |                |
|-----------------|-----------------|--------------------|----------------|
| **Wager Tiers** | **Winner Take** | **Launch Weapons** | **Settlement** |
| 0.01 - 0.5 SOL  | 90%             | 15 + 5 Prestige    | \< 2 sec       |

**Core Principles**

**Server-Authoritative.** All physics, damage, and economy calculations
run server-side. The client sends inputs (angle, power, weapon choice)
and receives results. Complex weapon mechanics (scatter, multi-hit,
area-of-effect) are simulated via deterministic approximation to ensure
server and client agree on outcomes.

**Trustless Settlement.** Wagers are held in on-chain Solana escrow
programs. Neither the server nor any player can access escrowed funds.
Settlement is automatic and verifiable.

**Skill Over Spend.** SHOT tokens are earned through gameplay
milestones, not purchased. Prestige weapons offer escalating power as a
reward for dedication, but a new player with perfect aim and smart
weapon purchases can beat any prestige player.

**02 // GAME MECHANICS**

**Match Flow**

1\. Both players connect Solana wallets and select a wager tier.

2\. Both players deposit SOL into an on-chain escrow PDA.

3\. The server generates a random terrain heightmap and assigns starting
positions.

4\. Players enter the weapon shop phase (30 seconds). Each starts with
1,000 Gold.

5\. Combat begins. Players alternate turns, adjusting angle, power, and
weapon selection.

6\. The server calculates trajectories, impact, damage, and terrain
deformation for each shot.

7\. Each player starts with 250 HP. When one player reaches 0 HP, the
round ends. Best-of-1, best-of-3, or best-of-5.

8\. The winner receives 90% of the pot via on-chain settlement. 7%
treasury, 3% operations.

**Health System**

Each player begins every round with 250 HP. Damage is calculated
server-side based on blast radius, distance from impact, and
weapon-specific damage factors. Direct hits deal maximum damage; splash
damage falls off linearly with distance from the impact point.
Self-damage is possible — hitting yourself with your own weapon costs
HP. When a player reaches 0 HP, the round ends immediately.

The 250 HP pool is calibrated so that the free Single Shot requires 5
direct hits to kill, giving players time to use terrain manipulation,
weapon variety, and tactical movement across approximately 10 turns per
player. Matches typically last 4-6 minutes.

**Match Modes**

|                 |             |                 |            |
|-----------------|-------------|-----------------|------------|
| **Mode**        | **Players** | **Wager**       | **Format** |
| **Quick Match** | 1v1         | 0.01 - 0.1 SOL  | BO1 / BO3  |
| **Duel**        | 1v1         | 0.05 - 0.25 SOL | BO3 / BO5  |
| **High Roller** | 1v1         | 0.25 - 0.5 SOL  | BO3 / BO5  |
| **Practice**    | 1v1         | Free            | BO1        |

**Terrain**

Terrain is represented as a 1D heightmap array generated server-side.
Both clients receive identical terrain data. Explosions deform terrain
by modifying the heightmap — creating craters, collapsing hills, and
exposing buried tanks. Terrain is a core tactical element: high ground
provides range advantage, valleys provide cover, and terrain
manipulation weapons (Dirt Ball, Magic Wall) can reshape the
battlefield.

**Turns & Movement**

Each round has a maximum of 20 turns (10 per player), alternating. On
each turn, a player can adjust their turret angle, set power, select a
weapon, and optionally move their tank left or right (up to 4 steps per
round). Movement is limited — repositioning is a strategic decision, not
a dodge mechanic. If neither player reaches 0 HP after 20 turns, the
player with the higher remaining HP wins the round.

**03 // WEAPON SYSTEM**

SolShot launches with 15 weapons across 6 tiers, plus 5
prestige-exclusive weapons unlocked by burning SHOT tokens. Each weapon
has distinct physics behavior — there are no reskins or stat variations
of the same weapon.

**Launch Roster (15 Weapons)**

|                  |           |          |                                                     |            |
|------------------|-----------|----------|-----------------------------------------------------|------------|
| **Weapon**       | **Tier**  | **Cost** | **Behavior**                                        | **Damage** |
| **Single Shot**  | Free      | 0        | Standard projectile, small blast. Infinite ammo.    | 60         |
| **Dirt Ball**    | Standard  | 150G     | Raises terrain on impact. Defensive utility.        | 0          |
| **Magic Wall**   | Standard  | 200G     | Erects terrain wall. Blocks incoming fire.          | 0          |
| **Skipper**      | Tactical  | 350G     | Bounces across terrain surface. Trick shots.        | 40         |
| **3 Shot**       | Tactical  | 400G     | Three projectiles fan out mid-air.                  | 20 ea      |
| **Spider**       | Tactical  | 400G     | Splits into crawling sub-munitions on proximity.    | Var        |
| **Heatseeker**   | Tactical  | 500G     | Homes toward opponent tank. Guided forgiveness.     | 40         |
| **Napalm**       | Rare      | 600G     | Area burn, melts terrain. Damage over time.         | Var        |
| **Pile Driver**  | Rare      | 600G     | Drills down through terrain. 6 sequential blasts.   | 120        |
| **Sniper Rifle** | Rare      | 700G     | Pinpoint 1px blast. Maximum precision damage.       | 100        |
| **Big Shot**     | Rare      | 700G     | Large blast radius. Maximum aim forgiveness.        | 30         |
| **Ground Hog**   | Epic      | 900G     | Tunnels through terrain, emerges and detonates.     | 50         |
| **Jackhammer**   | Epic      | 1,000G   | Drills vertically into terrain. 5 chain blasts.     | 50         |
| **Hail Storm**   | Epic      | 1,200G   | Rains projectiles over wide area. Damage over time. | Var        |
| **Crazy Ivan**   | Legendary | 2,500G   | 15 random explosions. Total chaos.                  | 300        |

**Prestige Weapons (5 Exclusive)**

|                    |              |               |                                                         |            |
|--------------------|--------------|---------------|---------------------------------------------------------|------------|
| **Weapon**         | **Prestige** | **Burn Cost** | **Behavior**                                            | **Damage** |
| **Homing Missile** | Bronze       | 200 SHOT      | Guided missile. Reliable homing toward opponent.        | 60         |
| **Cruiser**        | Silver       | 500 SHOT      | Rolling terrain bomb. Follows ground surface to target. | 80         |
| **Tommy Gun**      | Gold         | 1,200 SHOT    | Rapid-fire burst of 12 small shots.                     | 240        |
| **Chain Reaction** | Platinum     | 2,500 SHOT    | 15 sequential blasts carpet-bombing along terrain.      | 300        |
| **Pineapple**      | Diamond      | 4,000 SHOT    | Splits into 20 explosive fragments on proximity.        | 640        |

Diamond prestige players have access to 20 weapons vs 15 for new
players. Each prestige tier unlocks a weapon that is genuinely more
powerful than the last — rewarding hundreds of hours of dedication with
escalating firepower. However, every prestige weapon can be countered by
smart terrain play and precise aiming with base weapons.

**Weapon Design Philosophy**

The weapon roster is built around three strategic pillars:

**Precision vs Forgiveness.** Single Shot (60 damage, small blast)
rewards perfect aim. Big Shot (30 damage, huge blast) forgives poor aim
but requires more hits. Sniper Rifle (100 damage, 1px blast) is the
ultimate high-risk/high-reward — miss by 2 pixels and you deal zero.

**Attack vs Terrain.** Dirt Ball and Magic Wall create cover or bury
opponents. Pile Driver and Ground Hog destroy terrain and expose buried
tanks. Napalm melts terrain while dealing damage. The battlefield is an
active strategic element.

**Reliable vs Chaotic.** Heatseeker homes for guaranteed contact. Crazy
Ivan scatters 15 random explosions — devastating if centered, wasted if
scattered. Reliable weapons are cheaper; chaotic weapons are expensive
but potentially game-ending.

**04 // GOLD ECONOMY**

Gold is the in-match currency used to purchase weapons during the shop
phase. It exists only within a match and never persists between matches.
Gold cannot be traded, sold, or converted to any other currency.

**Earning Gold**

|                      |             |                           |
|----------------------|-------------|---------------------------|
| **Source**           | **Amount**  | **Notes**                 |
| **Starting Balance** | 1,000G      | Every player, every match |
| **Damage Dealt**     | +15G per HP | Incentivizes aggression   |
| **Kill Bonus**       | +200G       | Finishing blow reward     |
| **Round Win**        | +300G       | Winner of the round       |

**Budget Strategy**

With 1,000G starting balance, round 1 loadout options are constrained.
Players must make meaningful choices:

**Aggressive:** Sniper Rifle (700G) + Dirt Ball (150G) = 850G. High
damage potential with one defensive option.

**Balanced:** Heatseeker (500G) + 3 Shot (400G) = 900G. Guided weapon
plus spread coverage.

**Tactical:** Skipper (350G) + Spider (400G) + Magic Wall (200G) = 950G.
Terrain-aware arsenal plus defense.

**Conservative:** Big Shot (700G) + Magic Wall (200G) = 900G. Maximum
forgiveness plus protection.

The Legendary tier (Crazy Ivan at 2,500G) is impossible to buy in round
1 — players must earn Gold through combat first. In a BO3 match, a
player who wins round 1 decisively could afford Crazy Ivan by round 2,
creating natural power progression within each match.

**05 // SOL WAGERING**

**Wager Tiers**

|           |            |               |                  |                   |              |
|-----------|------------|---------------|------------------|-------------------|--------------|
| **Tier**  | **Amount** | **Total Pot** | **Winner (90%)** | **Treasury (7%)** | **Ops (3%)** |
| **Micro** | 0.01 SOL   | 0.02 SOL      | 0.018 SOL        | 0.0014 SOL        | 0.0006 SOL   |
| **Low**   | 0.05 SOL   | 0.10 SOL      | 0.09 SOL         | 0.007 SOL         | 0.003 SOL    |
| **Mid**   | 0.10 SOL   | 0.20 SOL      | 0.18 SOL         | 0.014 SOL         | 0.006 SOL    |
| **High**  | 0.25 SOL   | 0.50 SOL      | 0.45 SOL         | 0.035 SOL         | 0.015 SOL    |
| **Max**   | 0.50 SOL   | 1.00 SOL      | 0.90 SOL         | 0.07 SOL          | 0.03 SOL     |

**Escrow Mechanism**

All wagers are handled by an Anchor smart contract deployed on Solana.
The flow is:

1\. Match creator calls create_match, which initializes an escrow PDA
(Program Derived Address) with the wager amount and match parameters.

2\. Both players call deposit_wager, transferring SOL from their wallets
to the escrow PDA.

3\. The match proceeds. The server tracks the authoritative match state.

4\. On match completion, the server calls settle_match with the winner
address. The escrow distributes funds: 90% to winner, 7% to treasury, 3%
to operations.

5\. If both players disconnect or the match is cancelled before
completion, cancel_match returns deposits to both players.

All settlement uses integer lamport arithmetic (no floating point) to
prevent rounding errors. Transactions are verified on-chain and
settlement signatures are stored in the match record.

**Edge Cases**

|                                  |                                                        |
|----------------------------------|--------------------------------------------------------|
| **Scenario**                     | **Outcome**                                            |
| **Player disconnects mid-match** | 30s reconnect window, then forfeit. Opponent wins pot. |
| **Server crashes mid-match**     | Escrow refunds both players automatically.             |
| **Both players disconnect**      | Match cancelled. Escrow refunds both.                  |
| **Timeout (no action 60s)**      | Turn auto-forfeits. After 3 forfeits, match ends.      |
| **Insufficient balance to join** | Server rejects join. No escrow created.                |

**06 // SHOT TOKEN**

SHOT is the utility and governance token of the SolShot ecosystem. It is
earned through gameplay milestones and burned permanently for prestige
tier progression. SHOT is deflationary by design — the total supply can
only decrease over time as players burn tokens for prestige.

**Token Specifications**

|                  |                                          |
|------------------|------------------------------------------|
| **Parameter**    | **Value**                                |
| **Token Name**   | SHOT                                     |
| **Standard**     | SPL Token (Solana)                       |
| **Total Supply** | 10,000,000 SHOT                          |
| **Decimals**     | 9                                        |
| **Mintable**     | No (fixed supply, mint authority burned) |

**Distribution**

|                       |            |                |                                   |
|-----------------------|------------|----------------|-----------------------------------|
| **Allocation**        | **Amount** | **Percentage** | **Vesting**                       |
| **Reward Pool (PDA)** | 7,000,000  | 70%            | Emitted via milestones, max 5%/mo |
| **Treasury**          | 1,500,000  | 15%            | Controlled by multisig            |
| **Team**              | 1,000,000  | 10%            | 12-month cliff, 24-month linear   |
| **Initial Liquidity** | 500,000    | 5%             | Locked in Raydium pool            |

**Emission Mechanics**

SHOT is emitted from the reward pool PDA based on gameplay milestones,
not time. Examples of milestones: first match played, 10 wins, 100
matches, 1000 damage dealt in a single match, etc. The maximum emission
rate is capped at 5% of the remaining pool per calendar month. As the
pool depletes, emission rates naturally decrease — creating scarcity
over time.

Critically, SHOT cannot be purchased directly. The only way to acquire
SHOT is to play the game and hit milestones, or to buy it on the
secondary market (Raydium). This ensures that SHOT distribution rewards
active, skilled players.

**Burn Mechanics**

When a player burns SHOT for prestige, the tokens are sent to a dead
address and permanently removed from circulation. Burns are
irreversible. The total SHOT supply decreases with every prestige
action, making remaining SHOT more scarce over time. Total SHOT required
to reach Diamond prestige: 8,400 SHOT (200 + 500 + 1,200 + 2,500 +
4,000).

**07 // PRESTIGE SYSTEM**

The prestige system rewards dedicated players with exclusive weapons and
cosmetic upgrades. Each tier requires burning an increasing amount of
SHOT tokens permanently. Prestige is a one-way commitment — once burned,
tokens cannot be recovered.

|              |               |                |                      |                                           |
|--------------|---------------|----------------|----------------------|-------------------------------------------|
| **Tier**     | **Burn Cost** | **Cumulative** | **Exclusive Weapon** | **Weapon Power**                          |
| **Bronze**   | 200 SHOT      | 200 SHOT       | **Homing Missile**   | Guided, 60 damage. Reliable entry reward. |
| **Silver**   | 500 SHOT      | 700 SHOT       | **Cruiser**          | Rolling terrain bomb, 80 damage.          |
| **Gold**     | 1,200 SHOT    | 1,900 SHOT     | **Tommy Gun**        | 12 rapid-fire shots, 240 max damage.      |
| **Platinum** | 2,500 SHOT    | 4,400 SHOT     | **Chain Reaction**   | 15 sequential blasts, 300 max damage.     |
| **Diamond**  | 4,000 SHOT    | 8,400 SHOT     | **Pineapple**        | 20 fragment split, 640 max damage.        |

Each prestige tier also unlocks cosmetic rewards: unique tank skins,
kill effects, profile badges, and name borders. These are visual markers
of commitment.

Prestige weapons are designed to escalate in power with each tier. The
Bronze Homing Missile matches Single Shot damage but adds guidance. The
Diamond Pineapple is the most devastating weapon in the game — splitting
into 20 explosive fragments with a theoretical maximum of 640 damage.
Each tier genuinely feels like an upgrade, rewarding the hundreds of
hours required to reach it.

Prestige is deliberately expensive. Reaching Diamond requires earning
and burning 8,400 SHOT — representing hundreds of hours of gameplay.
This ensures that high-prestige players are genuinely experienced, not
just wealthy.

**08 // SECURITY**

**Server Authority**

SolShot uses a fully server-authoritative architecture. The client is a
rendering layer only. All physics calculations (trajectory, impact,
damage, terrain deformation), all economy operations (Gold earning,
weapon purchases), and all match state transitions are computed
server-side. The client sends only player inputs: angle, power, and
weapon ID. The server validates these inputs, computes results, and
broadcasts outcomes to both clients.

Complex weapon mechanics — scatter patterns (Crazy Ivan), multi-hit
sequences (Chain Reaction, Pile Driver), area-of-effect burns (Napalm),
and fragment splits (Pineapple) — are simulated server-side using
deterministic approximation. Both server and client use identical random
seeds for scatter patterns, ensuring damage calculations agree between
server authority and client rendering.

**Anti-Cheat Measures**

Client inputs are validated against the current match state (correct
turn, valid weapon, within bounds). Position data comes from the server,
not the client — players cannot teleport or modify tank positions. Gold
balances and weapon inventories are tracked server-side — no client-side
manipulation is possible. Rate limiting prevents spam actions and API
abuse. Per-socket rate limiters escalate from silent drop to disconnect
for sustained abuse. Settlement uses integer lamport arithmetic to
prevent floating-point rounding exploits. Async mutex locks on
settlement operations prevent double-settlement race conditions.

**Smart Contract Security**

The escrow program will undergo a third-party security audit before
mainnet deployment. The program uses Anchor framework best practices:
PDA-based escrow accounts, explicit account validation, and authority
checks on all state-modifying instructions. The mint authority for SHOT
will be burned after initial minting, making the token supply
permanently fixed.

**09 // ROADMAP**

|                          |             |                                                                                           |
|--------------------------|-------------|-------------------------------------------------------------------------------------------|
| **Phase**                | **Target**  | **Deliverables**                                                                          |
| **1. Foundation**        | Weeks 1-2   | MongoDB integration, weapon trimming, SolShot branding, server restructure                |
| **2. Server Authority**  | Weeks 3-4   | Server-side physics (incl. multi-hit), turn validation, match state machine, Gold economy |
| **3. Wallet + Wagering** | Weeks 5-8   | Wallet connect, escrow program, wager tiers, trustless settlement                         |
| **4. SHOT + Prestige**   | Weeks 9-13  | SHOT token mint, milestone emissions, prestige burns, exclusive weapons                   |
| **5. Polish + Deploy**   | Weeks 14-16 | UI reskin, art assets, HP bar, mainnet deploy, Raydium pool, SolShot.gg live              |
| **6. Expand**            | Ongoing     | Tournaments, leaderboards, terrain themes, seasonal content, mobile                       |

**10 // TEAM & LINKS**

**Links**

**Website:** solshot.gg

**Game:** app.solshot.gg

**Twitter:** @SolShotGG

**Discord:** discord.gg/solshot

**GitHub:** github.com/JJ-ME55/SolShot

**DISCLAIMER**

*This litepaper is provided for informational purposes only. It does not
constitute financial advice, an offer of securities, or a solicitation
of investment. SHOT tokens are utility tokens with no expectation of
profit. The value of SHOT may fluctuate and may go to zero. SolShot
involves wagering real cryptocurrency — players should never wager more
than they can afford to lose. Players must be 18+ to participate in
wagered matches. SolShot may not be available in all jurisdictions. The
team reserves the right to modify game mechanics, tokenomics, and
roadmap as development progresses.*

**SOLSHOT // AIM. FIRE. EARN.**
