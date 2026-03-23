---
doc_id: one-pager
title: "SolShot One-Pager"
wave: 1
status: draft
decisions_referenced:
  - competition-pitch/D1
  - competition-pitch/D2
  - competition-pitch/D3
  - competition-pitch/D4
  - competition-pitch/D5
  - competition-pitch/D6
  - architecture/D1
  - architecture/D3
  - token-economics/D1
  - escrow-flow/D1
  - escrow-flow/D3
  - security-posture/D3
  - security-posture/D6
  - security-posture/D12
---

# SolShot

### Skill-based SOL wagering -- live, not a demo.

Browser-based 1v1 artillery combat on Solana. Players wager real SOL, settled trustlessly via on-chain escrow. Pocket Tanks meets skill-based wagering.

**Play now:** [solshot.gg](https://solshot.gg) | Live on Solana mainnet

---

## How It Works

> The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.

```
 CLIENT              SERVER              CHAIN
 Sends inputs,       Computes physics,   Escrow, settlement,
 renders results     economy, matches    token burns
    |                    |                   |
    |--- angle/power --->|                   |
    |--- weapon -------->|                   |
    |                    |--- settle TX ---->|
    |<-- render data ----|<-- confirmation --|
```

Client sends angle, power, and weapon choice. Server computes trajectory, damage, gold, and win conditions. Client only renders results.

---

## By the Numbers

| | |
|---|---|
| **90 / 7 / 3** | Trustless escrow split -- winner / treasury / ops |
| **3 audits** | Independent security analyses, zero active CRITICAL/HIGH findings |
| **10M SHOT** | Fixed supply, mint authority burned -- supply can only decrease |
| **20 weapons** | 15 base + 5 prestige, across 4 match modes (BO1 / BO3 / BO5) |
| **3 safety layers** | Server recovery, player cancel, permissionless reclaim |

Your funds have three independent escape paths. Server can crash and players never lose SOL.

---

## Jupiter Integration

In-game SOL-to-SHOT swap via Jupiter. Live JUP price feed across all pages. JUP-supported wallet connector. Jupiter powers the token layer so players can acquire SHOT for prestige burns without leaving the game.

---

## Team

Solo founder. Built with AI. Three security audits. Full-stack shipped: React + Phaser 3 client, Express + Socket.IO server, Anchor escrow program, MongoDB Atlas, Meteora DAMM V2 liquidity pool.

SolShot is a skill-based game. Players are responsible for compliance with local regulations.
