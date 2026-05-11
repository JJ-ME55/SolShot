# SHOT Token Model

> 10 million fixed supply. Mint authority burned. Supply can only decrease.

SHOT is the utility token of the SolShot ecosystem. It is earned exclusively through gameplay milestones, burned permanently for prestige tier progression, and traded on the secondary market. SHOT is deflationary by design: the mint authority has been burned on-chain, making the 10M cap permanent and immutable. Every prestige burn removes tokens from circulation forever. There is no inflation mechanism, no future minting, and no way to reverse a burn. The total supply of SHOT moves in one direction - down.

---

## Token Specifications

| Parameter | Value |
|-----------|-------|
| **Token Name** | SHOT |
| **Standard** | SPL Token (Solana) |
| **Total Supply** | 10,000,000 SHOT |
| **Decimals** | 9 |
| **Mintable** | No - mint authority burned permanently |

---

## Distribution

The entire 10M supply is allocated at genesis. There are no future emissions from minting, no unlock schedules that create new tokens, and no inflationary mechanisms. Tokens move from the reward pool to players, and from players to burn addresses. That is the only flow.

| Allocation | Amount | Percentage | Custody | Purpose |
|------------|--------|------------|---------|---------|
| **Reward Pool** | 7,000,000 | 70% | Locked in PDA on-chain | Milestone-gated emissions to players |
| **Treasury** | 1,500,000 | 15% | Squads multisig | Ecosystem development, partnerships, liquidity incentives |
| **Team** | 1,000,000 | 10% | Team wallet, 6-week linear vest | Development, infrastructure, operations |
| **Initial Liquidity** | 500,000 | 5% | Meteora DAMM V2 pool | DEX liquidity for secondary market trading |

**Why 70% to rewards:** Most tokens flow to players, not insiders. The reward pool is the largest allocation by far because SolShot's thesis is that the people who play the game should own the majority of the token supply. The heavy reward allocation makes the "play to earn" promise credible.

**Mint authority burned:** After initial minting and distribution, the mint authority is burned on-chain. This is not a promise or a policy - it is a permanent, irreversible, verifiable on-chain action. No one, including the team, can ever increase the supply beyond 10M.

---

## Emission Mechanics

SHOT is emitted from the 7M reward pool based on **one-time gameplay milestones**, not time. There is no passive accrual, no staking yield, and no daily login bonus. Players earn SHOT by achieving specific accomplishments in wagered or practice matches.

### Milestone Schedule

All milestones are one-time unlocks per account. Once claimed, they cannot be repeated.

| Milestone | Requirement | Reward |
|-----------|-------------|--------|
| First Wagered Match | Play 1 wagered match | 10 SHOT |
| 500+ Damage Round | Deal 500+ damage in a single round | 15 SHOT |
| Win Without Prestige | Win using only base weapons | 20 SHOT |
| 10 Wagered Wins | Win 10 wagered matches | 25 SHOT |
| Win Streak | Win 5 matches in a row | 40 SHOT |
| 100 Wagered Matches | Play 100 wagered matches | 50 SHOT |
| 50 Wagered Wins | Win 50 wagered matches | 75 SHOT |
| 100 Total Matches | Reach 100 total matches played | 100 SHOT |

**Total earnable per account:** 335 SHOT across all 8 milestones (at full wagered rate).

**Practice mode:** All emission rates are reduced to 25% of standard. A practice-only player completing all milestones would earn approximately 83 SHOT. This prevents pure grinding without financial commitment from draining the reward pool at the same rate as wagered play.

### Anti-Farming Protections

The emission system includes server-side protections against abuse:

- **Minimum turn count:** Matches must last at least 4 turns to qualify for milestone credit. Instant-forfeit farming yields nothing.
- **30-second cooldown:** A minimum 30-second gap between reward-eligible matches per wallet prevents rapid-fire milestone attempts.
- **Match ID deduplication:** Each match can only be claimed once per account. Replaying the same match ID has no effect.
- **Global supply cap:** The server enforces a hard ceiling at 7M total emitted. Once the reward pool is exhausted, no further SHOT is emitted regardless of milestones achieved.

### The Asymptotic Emission Cap

Monthly emissions are capped at **5% of the remaining reward pool**. This creates an asymptotic curve: as the pool depletes, each month's maximum emission shrinks automatically.

| Month | Remaining Pool | Max Emission (5%) | Cumulative Emitted |
|-------|---------------|-------------------|-------------------|
| 1 | 7,000,000 | 350,000 | 350,000 |
| 2 | 6,650,000 | 332,500 | 682,500 |
| 3 | 6,317,500 | 315,875 | 998,375 |
| 6 | 5,388,421 | 269,421 | 1,611,579 |
| 12 | 4,148,266 | 207,413 | 2,851,734 |
| 24 | 2,459,102 | 122,955 | 4,540,898 |
| 48 | 863,732 | 43,187 | 6,136,268 |

The pool never fully empties. By month 48, over 6.1M SHOT would have been emitted, but the monthly cap drops below 50K. By month 100, less than 5K SHOT per month would be available. This built-in scarcity curve means early players receive SHOT at a meaningfully higher rate than late entrants - a deliberate incentive alignment for early community members.

**Enforcement model:** The 5% monthly cap is enforced manually by the team, not by the program. This is documented transparently as a public commitment. Programmatic enforcement would require complex on-chain time-tracking that adds attack surface without adding trust - the emission is observable on-chain by anyone, and deviation from the stated policy would be immediately visible.

---

## Burn Mechanics: The Prestige System

Burns are the engine of deflation. When a player burns SHOT for prestige, the tokens are permanently removed from circulation via SPL Token burn instruction. The server verifies each burn transaction on-chain before unlocking the tier: confirming the transaction exists, was signed by the correct wallet, targeted the SHOT mint, and burned the exact required amount. Replay protection prevents the same burn transaction from being used twice.

### Prestige Tiers

Each tier unlocks an exclusive weapon that is genuinely more powerful than the last. Burn costs are per-tier, not cumulative - but the table below shows cumulative totals for clarity.

| Tier | Name | Burn Cost | Cumulative | Exclusive Weapon | Max Damage |
|------|------|-----------|------------|------------------|------------|
| 0 | Unranked | - | 0 SHOT | - | - |
| 1 | Bronze | 200 SHOT | 200 SHOT | Homing Missile | 60 |
| 2 | Silver | 500 SHOT | 700 SHOT | Cruiser | 80 |
| 3 | Gold | 1,200 SHOT | 1,900 SHOT | Tommy Gun | 240 |
| 4 | Platinum | 2,500 SHOT | 4,400 SHOT | Chain Reaction | 300 |
| 5 | Diamond | 4,000 SHOT | 8,400 SHOT | Pineapple | 640 |

**Total SHOT burned to reach Diamond: 8,400.**

The prestige burn costs escalate sharply. Bronze costs 200 SHOT - achievable within the first few dozen wagered matches. Diamond costs 4,000 SHOT for that tier alone, requiring sustained play and likely secondary market acquisition. This curve ensures that high-prestige players represent genuine dedication, not casual participation.

### Burn Verification

The server performs five checks before crediting a prestige burn:

1. **Transaction exists** and has reached `confirmed` commitment on Solana.
2. **Replay protection** - the transaction signature has not been used for a previous prestige burn.
3. **Correct mint** - the burn instruction targets the SHOT token mint specifically.
4. **Correct signer** - the burn was authorized by the player's wallet address.
5. **Correct amount** - the burned amount matches or exceeds the required prestige tier cost.

A TOCTOU (time-of-check, time-of-use) guard claims the transaction signature immediately before async verification begins, preventing concurrent verification of the same burn by race condition. Verified signatures are persisted to MongoDB so replay protection survives server restarts.

---

## Scarcity Analysis: The Deflationary Math

This is where the token model becomes interesting. The numbers tell a clear story.

### Supply Pressure

Each player who reaches Diamond prestige removes 8,400 SHOT from circulation permanently. Against a fixed 10M supply:

| Diamond Players | SHOT Burned | Remaining Supply | % Supply Destroyed |
|----------------|-------------|-----------------|-------------------|
| 100 | 840,000 | 9,160,000 | 8.4% |
| 250 | 2,100,000 | 7,900,000 | 21.0% |
| 500 | 4,200,000 | 5,800,000 | 42.0% |
| 750 | 6,300,000 | 3,700,000 | 63.0% |
| 1,000 | 8,400,000 | 1,600,000 | 84.0% |
| 1,190 | 9,996,000 | 4,000 | 99.96% |

**1,000 Diamond players would burn 8.4M SHOT - nearly the entire supply.** This is by design. Prestige scarcity is intentional, not accidental. Early players can reach Diamond at a fraction of the cost (in real-world market value) compared to latecomers who must acquire increasingly scarce SHOT from the secondary market.

This table illustrates the theoretical maximum. In practice, many players will stop at Gold or Platinum, and the reward pool emission curve means fewer tokens enter circulation each month. Both dynamics compress available supply simultaneously.

### Why Scarcity Is a Feature

The escalating scarcity creates three reinforcing dynamics:

1. **Early adopter advantage.** Players who earn SHOT in the first months receive it at higher emission rates and lower market prices. Their path to Diamond is cheaper in every dimension.

2. **Status credibility.** A Diamond player has demonstrably committed significant economic resources. The prestige badge means something because it costs something that cannot be manufactured.

3. **Natural price discovery.** As supply decreases through burns and emission rates decline asymptotically, the secondary market finds equilibrium between players who want to prestige and players willing to sell. No artificial market-making is required.

---

## Extensible Burn Architecture

Prestige is the primary burn sink today. The system is designed with a generic burn mechanism: any SPL burn of SHOT is permanently deflationary, so additional sinks can be added as the economy matures.

**Planned (not yet wired):**
- **Cosmetic purchases** - armory items (tank skins, kill effects, profile badges) purchasable with SHOT. The burn structure exists on-chain; the client integration is pending.

**Future considerations (TBD):**
- Tournament entry fees denominated in SHOT
- Seasonal content unlocks
- Additional weapon tiers beyond Diamond

These are architectural capabilities, not promises. The on-chain burn mechanism is generic - any SPL Token burn of SHOT is permanently deflationary regardless of the reason. Future sinks add pressure to the same fixed supply.

---

## Acquisition: How Players Get SHOT

SHOT cannot be purchased directly from SolShot. There are exactly two paths to acquisition:

1. **Earn it.** Play matches, hit milestones, receive SHOT from the reward pool. This is the primary distribution mechanism and the intended experience.

2. **Buy it on the secondary market.** Players who want to prestige faster than their milestone progression allows can acquire SHOT from other players via DEX trading.

This two-path model ensures that the majority of SHOT supply flows to active players, not to passive buyers. The secondary market exists as an accelerator, not a replacement for gameplay.

---

## DEX and Liquidity

| Parameter | Value |
|-----------|-------|
| **Primary Pool** | Meteora DAMM V2 |
| **Aggregation** | Jupiter |
| **Initial Liquidity** | 500,000 SHOT (5% of supply) paired with SOL |
| **Access** | Any Solana swap interface via Jupiter routing |

**Meteora DAMM V2** provides concentrated liquidity with automatic rebalancing. This was selected for its superior capital efficiency and dynamic fee structure.

**Jupiter aggregation** ensures that SHOT is discoverable and tradeable from any Solana wallet or DEX frontend. Players do not need to navigate directly to Meteora - Jupiter routes through the best available pool automatically.

**In-game swap (planned):** An in-game SOL-to-SHOT swap via Jupiter is planned, allowing players to acquire SHOT for prestige burns without leaving the game client.

---

## Transparency: Team Allocation and Sell Discipline

### Team Allocation: 1M SHOT (10%)

The team allocation vests linearly over **6 weeks** from launch, at a rate of approximately 166,667 SHOT per week. This is a public commitment, not a smart-contract constraint, and that distinction is deliberate.

**Why public commitment rather than on-chain vesting:** Vesting contracts can create a false sense of security. Anyone with upgrade-authority access to a program could circumvent contract-enforced vesting, and SolShot's authority key is currently held by a single engineering lead (the structural single-key risk is named openly in [`security-model.md`](./security-model.md)). A contract-vesting clause that the upgrade authority can bypass would be theatre. The team chose the honest framing instead: a 6-week schedule, governed by public commitment and on-chain observability, with no pretence that the schedule is unbypassable.

**Sell discipline within the vested portion:** As each weekly tranche unlocks, the team commits to a maximum sell rate of 10% of the unlocked team balance per week, sold into volume rather than against thin liquidity. This is layered on top of the 6-week vest, not a replacement for it.

This is a **public commitment, not an on-chain guarantee**. It is observable: anyone can monitor the team wallet and verify compliance with both the 6-week unlock schedule and the 10% weekly sell cap. Deviation would be immediately visible and would destroy the trust the project depends on. That reputational backstop is the real enforcement mechanism.

### Treasury: 1.5M SHOT (15%)

The treasury allocation is held in a **Squads multisig** wallet. Treasury funds are designated for ecosystem development, strategic partnerships, liquidity incentives, and operational continuity. Multisig governance prevents unilateral access.

### Emission Cap: Public Commitment

The 5% monthly emission cap is admin-enforced, not programmatically enforced on-chain. The rationale:

- On-chain emission tracking would require epoch-based time accounting, adding complexity and attack surface.
- The emission is fully observable on-chain - any deviation from the 5% cap would be trivially detectable.
- The admin enforcement model is simpler, more auditable, and equally transparent.

This is documented as a commitment, not disguised as a guarantee.

---

For players: earn SHOT by being good at the game, burn it for powerful weapons.
