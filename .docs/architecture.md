---
doc_id: architecture
title: "System Architecture"
wave: 2
status: draft
decisions_referenced:
  - architecture/D1
  - architecture/D2
  - architecture/D3
  - architecture/D4
  - escrow-flow/D1
  - escrow-flow/D7
  - security-posture/D2
  - security-posture/D7
  - security-posture/D8
---

# System Architecture

> The server owns the physics. The chain owns the money. Neither player nor operator can cheat either.

```
 CLIENT                  SERVER                  CHAIN
 Sends inputs,           Computes physics,       Escrow, settlement,
 renders results         economy, matches        token burns
    |                        |                       |
    |--- angle/power/wpn --->|                       |
    |                        |--- settle TX -------->|
    |<-- render data --------|<-- confirmation ------|
```

Client sends angle, power, and weapon choice. Server computes trajectory, damage, gold, and win conditions. Client only renders results.

---

## Why Server-Authoritative?

The server is the single source of truth for gameplay. No client can manipulate physics, fabricate hits, or inflate gold. The on-chain program enforces correct settlement math and recipients -- the server can trigger payouts, but it cannot redirect funds.

On-chain latency is ~2-3 seconds total per match (funding + settlement). Matches run 3-8 minutes. The blockchain is invisible during gameplay.
