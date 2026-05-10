# Why SolShot

## The Gap

No live, skill-based SOL wagering game exists on Solana.

The Solana gaming ecosystem is full of ambitious projects. Most follow the same pattern: large token launches, NFT-gated access, play-to-earn reward loops, and years-long development timelines. Many remain on testnet or exist primarily as whitepapers. Almost none let you wager real SOL on the outcome of a skill-based match - today, on devnet, with trustless settlement.

That gap is where SolShot sits.

---

## Solana Gaming: What Exists

| | Star Atlas | Aurory | Genopets | Typical Solana Game | **SolShot** |
|---|---|---|---|---|---|
| **Model** | Space MMO, play-to-earn | Turn-based RPG, NFT-focused | Move-to-earn + gaming | NFT/P2E-driven | Skill-based SOL wagering |
| **Mainnet status** | Partial (showroom modules) | Live (PvE focus) | Live (step tracking) | Testnet or whitepaper | **Live - full game loop** |
| **Token model** | Dual-token, inflationary | Inflationary rewards | Inflationary rewards | Inflationary | **10M fixed, mint burned** |
| **Wagering** | No direct wagering | No direct wagering | No direct wagering | No direct wagering | **Trustless PDA escrow** |
| **Revenue split** | In-game economy | NFT marketplace fees | Token ecosystem | Varies | **90/7/3 on-chain split** |
| **Security audits** | Disclosed for contracts | Disclosed for contracts | Disclosed for contracts | Rarely disclosed | **3 independent analyses, 0 active CRIT/HIGH** |

These projects do meaningful things. Star Atlas pushes the boundary on what an on-chain game world can be. Aurory demonstrates polished RPG gameplay on Solana. Genopets bridges real-world activity with token rewards. They have earned their communities.

But none of them are what SolShot is: a skill-based wagering game where you put up real SOL, play a real match, and the chain settles the result trustlessly.

---

## Five Differentiators

### 1. Skill-based, not play-to-earn

SolShot is not a reward-farming loop. Players wager SOL on 1v1 artillery matches and the better player wins 90% of the pot. No passive income, no yield optimization, no grinding for token drops. You aim, you fire, you win or lose on skill.

### 2. Live, not a whitepaper

The game is deployed on Solana devnet, with mainnet flip pending the audit-fix redeploy. Escrow program on-chain. SHOT token minted, mint authority burned. 20 weapons balanced and playable. 4 match modes running. Judges can open [solshot.gg](https://solshot.gg) and play a match right now. Most competition entries are prototypes or roadmap documents - SolShot is a shipped product.

### 3. Trustless escrow, not custodial

Player funds go into a PDA derived from the match room ID. The on-chain program enforces the 90/7/3 split, verifies recipients, and settles atomically. The server keypair is an authorized trigger, not an authorized destination - a compromised key cannot redirect funds. Three independent safety layers (server recovery, player cancel, permissionless reclaim) ensure funds are never permanently locked.

### 4. Deflationary token, not inflationary

10M SHOT. Fixed. Mint authority burned - supply can only decrease. Prestige burns are the primary sink: 8,400 SHOT to reach Diamond tier. 1,000 Diamond players would burn nearly the entire supply. Early players are rewarded with genuine scarcity. This is the opposite of the inflationary reward-token model that dominates Solana gaming.

### 5. Security-audited, not trust-me

Three independent security analyses covering on-chain logic, off-chain server code, and mathematical verification of escrow arithmetic. Zero active CRITICAL or HIGH findings. Authority centralization is acknowledged transparently, with multisig governance on the v1.2 roadmap. The security posture is documented, not hand-waved.

---

## Why This Matters

The Solana gaming landscape has no shortage of ambition. What it lacks is a live, wagering-focused game that treats the chain as a financial settlement layer rather than a token distribution engine.

SolShot fills that gap with a concrete thesis: **the server owns the physics, the chain owns the money, neither player nor operator can cheat either.**

Two-person team - JJ on the engineering, Fish on product / strategy / design. AI-augmented build. Three security audits. Live on devnet at [solshot.gg](https://solshot.gg); mainnet pending audit-fix redeploy.

Skill-based SOL wagering - live, not a demo.
