---
doc_id: crypto-explainer
title: "How Wagering Works"
wave: 2
status: draft
decisions_referenced:
  - crypto-explainer/D1
  - crypto-explainer/D2
  - crypto-explainer/D3
  - crypto-explainer/D4
  - crypto-explainer/D5
  - escrow-flow/D1
  - escrow-flow/D2
  - escrow-flow/D3
  - escrow-flow/D4
  - escrow-flow/D7
  - security-posture/D6
  - security-posture/D8
  - security-posture/D12
  - architecture/D1
---

# How Wagering Works

Your SOL goes into a locked vault. Winner takes 90%.

That's the whole system. If you want to know more, keep reading.

---

## The Short Version

When you wager SOL on a SolShot match, both players deposit their wager into an escrow account on the Solana blockchain. Nobody can touch those funds during the match -- not you, not your opponent, not even the SolShot server. When the match ends, the winner receives 90% of the total pot directly to their wallet. The remaining 10% is a fee: 7% goes to the SolShot treasury and 3% covers operations.

That's it. You play, you win (or lose), the money moves automatically.

---

## How the Vault Works

Think of it like a bank vault with a time lock.

### Both Players Deposit

When you accept a wagered match, your wallet asks you to confirm the deposit. Your opponent does the same thing. Both deposits go into a single vault on the Solana blockchain -- a dedicated escrow account created just for your match. Once the funds are in, that vault is locked. No one can open it early.

If your opponent doesn't deposit within the 2-3 minute funding window, you get a full refund. No match, no risk.

### The Match Plays Out

While you're aiming, firing, and blowing up terrain, your SOL sits untouched in the vault. The blockchain isn't involved in gameplay at all -- it just holds the money. The game server handles physics, damage, gold, and everything you see on screen. You won't notice any delay from the blockchain; the total on-chain overhead is about 2 seconds across the entire match.

### The Winner Gets Paid

When the match ends, settlement happens automatically. A single transaction splits the pot:

| Recipient | Share | On a 0.5 SOL wager (1.0 SOL pot) |
|---|---|---|
| **Winner** | 90% | 0.9 SOL |
| **Treasury** | 7% | 0.07 SOL |
| **Operations** | 3% | 0.03 SOL |

The SOL arrives in the winner's wallet within seconds. The vault is closed. Done.

---

## What If Something Goes Wrong?

### "What if I disconnect?"

You get 30 seconds to reconnect. If you come back within that window, the match continues like nothing happened.

If you don't reconnect in time, the match resolves based on who was winning:

- **One player is ahead** (more HP remaining, or leading on rounds won): That player wins the pot. This is the same as any competitive game -- if you're losing and walk away, you lose.
- **Match is perfectly tied** (same HP, same rounds won): Both players get a full refund. Nobody wins, nobody loses.

The 30-second reconnect window plus score-based resolution means accidental disconnects are handled fairly, and intentional disconnects can't be exploited. A losing player can't pull the plug to get their money back.

### "What if the server crashes?"

Your SOL is safe. The server doesn't hold your money -- the blockchain does. The server can crash, reboot, lose power, or burst into flames, and your funds remain in the vault on-chain.

Here's what happens: When the server recovers, it checks for any matches that were in progress with funded escrows and settles them based on the last known game state. Whoever was winning gets the win.

But you don't have to rely on the server recovering at all. Your funds have three independent escape paths:

1. **Server recovery** -- The server restarts and settles based on last known state. This is the normal path and handles the vast majority of disruptions.
2. **Player cancel** -- If the server stays down past the escrow's expiry window (1 hour), either player can trigger a cancel directly on-chain. Both players get a full refund. No server required.
3. **Permissionless reclaim** -- If 48 hours pass and nothing has happened -- server gone, both players inactive, whatever -- anyone can trigger a reclaim on the blockchain. Both players get refunded automatically. This is the absolute backstop. It doesn't matter what happened to the server or the players. The funds come home.

Three layers of protection, each independent of the others. At no point can your SOL be permanently locked.

### "What if my wallet disconnects but I'm still in the game?"

Wallet connection and game connection are separate. Your game session runs over a direct connection to the server. Even if your wallet momentarily disconnects, the match continues. Your wallet is only needed for the initial deposit and to receive your winnings -- it's not involved in gameplay.

---

## The Fee

SolShot takes a 10% fee on every wagered match. Here's exactly where it goes:

- **7% to the treasury** -- Funds development, infrastructure, and the SHOT token reward pool.
- **3% to operations** -- Covers server costs, Solana transaction fees, and ongoing maintenance.

The fee is deducted from the total pot at settlement. If two players each wager 0.25 SOL (0.5 SOL total pot), the winner receives 0.45 SOL, the treasury receives 0.035 SOL, and operations receives 0.015 SOL. All three transfers happen in a single atomic transaction -- there's no partial payout state.

---

## Under the Hood

This section is for readers who want to know what "on-chain escrow" actually means. If the bank vault analogy was enough for you, you can stop here.

### On-Chain Escrow

SolShot uses a smart contract (called a "program" on Solana) that lives permanently on the blockchain. When you deposit SOL for a match, your funds go into a program-derived account -- an escrow address that the program controls. The program enforces the rules: it knows how much was deposited, who deposited it, and who is allowed to receive funds at settlement.

The SolShot server can trigger settlement, but it cannot choose where the funds go. The on-chain program validates that the correct amounts go to the correct wallets -- the winner's wallet, the treasury, and the operations account. A compromised server key cannot redirect funds or drain accounts. It can only trigger settlement of existing matches to their original participants.

### Trustless Settlement

"Trustless" means you don't have to trust anyone for the money to move correctly. The rules are encoded in the program on the blockchain. The server determines who wins the match (it runs the game physics), but the program determines how the money moves. The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.

### Security

SolShot's escrow program has undergone 3 independent security analyses covering the on-chain program, the server and client, and the mathematical correctness of all financial arithmetic. Zero active CRITICAL or HIGH severity findings remain unresolved.

All server endpoints are authenticated, rate-limited, and input-validated. Authority keys can be rotated without disrupting active matches.

### Settlement Timing

On-chain operations add about 2-3 seconds total per match: less than 2 seconds for Solana confirmation, under 1 second for server processing. During gameplay, no blockchain interaction occurs -- the chain is invisible until settlement.

---

## Quick Reference

| Question | Answer |
|---|---|
| Where does my SOL go? | Into a locked escrow account on the Solana blockchain. |
| Can anyone touch it during the match? | No. Not you, not your opponent, not the server. |
| What does the winner get? | 90% of the total pot, sent directly to their wallet. |
| What's the fee? | 10% (7% treasury, 3% operations). |
| What if I disconnect? | 30 seconds to reconnect. If not, the player in the lead wins. If tied, both get refunded. |
| What if the server crashes? | Your SOL is safe. Three independent recovery paths ensure funds are never locked. |
| How long does settlement take? | About 2 seconds. |
| Is the escrow audited? | Yes. 3 independent security analyses. Zero active CRITICAL/HIGH findings. |
| Can funds ever be permanently locked? | No. Permissionless reclaim after 48 hours is the absolute backstop. Anyone can trigger it. |

---

SolShot is a skill-based game. Players are responsible for compliance with local regulations.
