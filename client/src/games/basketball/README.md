# Basketball Hoops — client

First-person free-throw shooter on the SolShot arcade infrastructure.
Spec: `Docs/games/basketball/DESIGN.md`. File-by-file plan:
`Docs/games/basketball/SCOPING.md`.

## What's in this folder

```
client/src/games/basketball/
├── data/
│   └── constants.js          # canvas + physics dims (mirror of server)
├── input/
│   ├── touchFlick.js         # mobile flick-to-shoot handler
│   └── mouseArrow.js         # desktop aim-arrow handler
├── backboard.js              # deterministic backboard motion (mirror of server)
├── bridge.js                 # Phaser ↔ React state channel + submitShot stub
├── scene.js                  # Phaser scene: rendering + animation
├── hud.js                    # React HUD (score, heat check, play-again)
├── BasketballScreen.js       # top-level React component
└── README.md                 # this file
```

## How to play

- **Mobile** — press on the ball, flick upward toward the hoop, release. The flick's direction = angle, speed = power.
- **Desktop** — move the mouse below the ball, the yellow arrow shows where the ball will fly (opposite the cursor). Click to shoot.

Make the basket = score, ball resets, shoot again. Miss = the round ends, your best score is logged.

## Scoring

| Result            | Points (normal) | Points (heat check) |
| ----------------- | --------------- | ------------------- |
| Swish             | 2               | 3                   |
| Rim-in            | 1               | 1                   |
| Backboard bank-in | 1               | 1                   |
| Miss              | round over      | round over          |

Heat check activates after 3 swishes within 10 seconds of each other. While active, swishes are worth +1. Rim-in or bank-in baskets break the streak. A 10-second gap also expires it.

## v0 status (what works / what doesn't)

| Piece                              | Status                                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Phaser scene rendering             | ✅ Backboard + hoop + ball, deterministic moving backboard from shot 6 onward                  |
| Touch flick input                  | ✅ Direction + speed → angle/power                                                              |
| Mouse aim input                    | ✅ Cursor below ball → directional arrow                                                        |
| Trajectory animation               | ✅ Replays the server's returned trajectory at 60Hz                                             |
| HUD (score, heat check, play-again) | ✅ Polls bridge state via rAF                                                                  |
| **Real physics + collision**       | ⚠️ Mocked locally — bridge.submitShot uses a simplified gravity-only stub with no rim/backboard collision |
| **Server roundtrip**               | ❌ Not wired — bridge stub returns local mock result                                            |
| **Time-windowed wager + lobby**    | ❌ Not wired — depends on the bot/`customgame` config flow (JJ-gated)                          |
| **Real-time TG leaderboard**       | ❌ Not wired — depends on the server lifecycle + bot broadcast (JJ-gated)                      |

To turn this into a fully real game we need Phase 4 (integration with the shared `groupchat/`, `socket-io/`, `MenuScreen.js`, and `PhaserBootstrap.js`). Per `Docs/ARCADE_NEW_GAME_PLAYBOOK.md`, those touches must land as separate PRs to `main` before this branch merges.

## Running it standalone

The scene + HUD don't depend on the rest of the SolShot app — you can drop `<BasketballScreen />` into any React page to play the v0 prototype:

```jsx
import { BasketballScreen } from './games/basketball/BasketballScreen';

export default function TestPage() {
    return <BasketballScreen />;
}
```

For now this folder ships disconnected from the app router — Phase 4 wires it into the menu + lobby flow.

## Constants — keep in sync with the server

`data/constants.js` and `backboard.js` here are mirrors of
`server/services/games/basketball/constants.js` and
`server/services/games/basketball/backboard.js`. Anything that
affects the physics layout (positions, sizes, gravity, scoring) MUST
match. The duplication is intentional for v0 — Phase 4 will move
shared-only constants into a single source.

## What NOT to touch

Per the playbook:
- `programs/solshot-escrow-v2/` on-chain contract
- `server/services/escrow-v2.js` escrow wrapper
- `client/src/wallet/` wallet stack
- `server/services/groupchat/lifecycle.js` bot lobby state machine
- The shared litepaper / token model / architecture docs
