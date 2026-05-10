# How Wagering Works in SolShot

*On-chain escrow. Trustless settlement. Your money, your control.*

---

SolShot lets players wager real SOL in PvP matches. This post explains exactly how the money flows from deposit to settlement, and why you never have to trust us with your funds.

## The Short Version

Both players deposit SOL into a smart contract. Nobody can touch it during the match. When the match ends, the contract sends 90% to the winner. Done.

## The Full Flow

### 1. Choosing a Wager

When you enter the lobby, you pick a wager tier:

| Tier | Wager | Total Pot | Winner Gets |
|------|-------|-----------|-------------|
| Micro | 0.01 SOL | 0.02 SOL | 0.018 SOL |
| Low | 0.05 SOL | 0.10 SOL | 0.09 SOL |
| Mid | 0.10 SOL | 0.20 SOL | 0.18 SOL |
| High | 0.25 SOL | 0.50 SOL | 0.45 SOL |
| Max | 0.50 SOL | 1.00 SOL | 0.90 SOL |

Practice matches (zero wager) are always available for players who want to play without stakes.

### 2. The Escrow Deposit

When both players accept the match, the SolShot server creates an escrow account on the Solana blockchain using a Program Derived Address (PDA). Both players sign a transaction depositing their wager into this PDA.

Key points about the escrow:

- It is a smart contract on Solana, not a wallet we control.
- Nobody (not us, not either player) can withdraw from the escrow until the match result is submitted.
- The escrow address and deposit transactions are publicly verifiable on any Solana block explorer.

### 3. The Match

The match proceeds normally. Weapon shop, combat, terrain destruction. All server-authoritative. The physics and damage are calculated on our servers, not in your browser.

During the match, the escrow just sits there. Untouchable.

### 4. Settlement

When one player wins (opponent reaches 0 HP), the server calls the `settle_match` instruction on the smart contract. This single transaction distributes the pot:

- **90% to the winner.** Sent directly to their wallet.
- **7% to treasury.** Funds game development and operations.
- **3% to operations.** Covers server costs and gas fees.

Settlement happens in under 2 seconds. The SOL appears in the winner's wallet immediately.

### 5. What the Math Looks Like

All settlement arithmetic uses integer lamports (Solana's smallest unit, like satoshis for Bitcoin). We never use floating-point math. This prevents rounding errors that could lose or create fractions of SOL.

For a 0.10 SOL match (100,000,000 lamports per player, 200,000,000 total):

- Winner: 180,000,000 lamports (0.18 SOL)
- Treasury: 14,000,000 lamports (0.014 SOL)
- Operations: 6,000,000 lamports (0.006 SOL)

Total out: 200,000,000 lamports. Exactly matches total in. No rounding leakage.

## Edge Cases

**What if I disconnect?**
You get a 10-minute window to reconnect. If you do not return, you forfeit the match and your opponent receives the pot.

**What if the server crashes?**
The escrow contract has a timeout mechanism. If no settlement instruction is received within a defined window, either player can trigger a refund that returns both deposits.

**What if both players disconnect?**
The match is cancelled and the escrow refunds both players.

**Can SolShot steal my wager?**
No. The settlement instruction requires a valid match result signed by the server authority. The server cannot settle in favor of a wallet that was not a participant. The contract code is open-source and can be audited by anyone. Three independent security audits (SOS on-chain, BOK math invariants, DB off-chain) ran across the on-chain programs, server, and math layer ahead of public launch. Reports are in the repo.

## Why Not Just Use a Server Wallet?

We could hold funds in a server-controlled wallet. Many games do this. The problem: you would have to trust us not to steal the funds, not to get hacked, and not to make mistakes with the math.

On-chain escrow removes that trust requirement. The rules are encoded in a smart contract. The contract does exactly what it says, every time, verifiable by anyone. It is trustless. You do not need to trust us at all.

## The Rake

SolShot takes a 10% total rake on wagered matches (7% treasury + 3% operations). This is transparent, consistent, and visible in every settlement transaction.

For context, most poker platforms take 5-10% rake. Most crypto gaming platforms take 3-15%. Our 10% is competitive and clearly disclosed.

The 7% treasury allocation funds continued game development: new weapons, terrain themes, tournaments and infrastructure improvements. The 3% operations allocation covers server hosting, Solana gas fees and database costs.

## Verifying Transactions

Every settlement produces a Solana transaction signature stored in the match record. You can look up any match settlement on Solscan or any Solana explorer to verify the exact amounts transferred.

Your match history in the Barracks shows every wagered match with the settlement signature. Full transparency.

---

Questions about wagering? Join our Discord at discord.gg/solshot.

**Play now at solshot.gg**
