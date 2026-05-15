# Keepie-Uppies — Technical Scoping v0.1

File-by-file plan for building Keepie-Uppies on the SolShot arcade infrastructure. Based on design v0.1.

---

## Architecture overview

```
        ┌──────────────────────────────────────────────┐
        │ Phaser scene (client/src/games/keepie-uppies/)│
        │  - side-on 2D camera                         │
        │  - ball + pitch backdrop                     │
        │  - tap input handlers (touch + mouse)        │
        │  - client-mirror physics for instant feedback│
        │  - tap-fx ring, score milestones, NEW BEST   │
        └─────────────────┬────────────────────────────┘
                          │ bridge events
                          ▼
        ┌──────────────────────────────────────────────┐
        │ React state + WalletContext (existing)       │
        └─────────────────┬────────────────────────────┘
                          │ socket.io
                          ▼
        ┌──────────────────────────────────────────────┐
        │ Server services                              │
        │ (server/services/games/keepie-uppies/)       │
        │  - lifecycle.js    match state machine       │
        │  - physics.js      simulateRound canonical   │
        │  - rules.js        scoring (one rule: hit++) │
        │  - leaderboard.js  best-score + TG broadcast │
        │  - resolver.js     window-deadline cron      │
        └────┬─────────────┬───────────────────┬───────┘
             │             │                   │
             ▼             ▼                   ▼
        ┌──────────┐ ┌──────────┐  ┌─────────────────────┐
        │ MongoDB  │ │ TG bot   │  │ v2 escrow           │
        │ (matches,│ │ (lobby + │  │ (createMatch /      │
        │ attempts)│ │ leader-  │  │  settleMatch /      │
        │          │ │ board)   │  │  cancelMatch)       │
        └──────────┘ └──────────┘  └─────────────────────┘
```

Bridge / socket / wallet / bot / escrow layers all inherited free from `main`. We add the keepie-uppies-specific game services and wire them into the existing infrastructure (specifically `@TheArcadeGG_Bot` per `2f8471b feat(arcade-bot): add @TheArcadeGG_Bot — multi-game launcher`).

---

## New files — client

| File | Purpose | Effort |
|---|---|---|
| `client/src/games/keepie-uppies/scene.js` | Phaser scene: 2D camera, ball sprite, pitch backdrop, floor line, tap-fx layer | 1.5 days |
| `client/src/games/keepie-uppies/input.js` | Unified tap handler (touch + mouse). Stale-tracking guard per playbook ch.6.1 from day one. | 0.5 day |
| `client/src/games/keepie-uppies/physics.js` | Client-mirror of server `simulateRound` for instant feedback. Identical math, identical constants. | 0.5 day |
| `client/src/games/keepie-uppies/hud.js` / React | Score / best display, game-over overlay with Play Again, NEW BEST banner, milestone pulse | 0.5 day |
| `client/src/games/keepie-uppies/sfx.js` | Web Audio synth for tap thwock / milestone chime / NEW BEST triad / wall tick / game over buzzer. `safeAudio` wrapper around every export from day one. | 0.5 day |
| `client/src/games/keepie-uppies/bridge.js` | Phaser↔React state bridge (mirrors `client/src/scenes/main/index.js`) | 0.25 day |
| `client/src/games/keepie-uppies/data/constants.js` | Physics constants (gravity, ball radius, base-up, gains, Magnus coefficient). Citations in comments per playbook ch.1 — values from `PHYSICS_RESEARCH.md`. | 0.25 day |
| `client/src/games/keepie-uppies/data/assets.js` | Sprite path constants | 0.1 day |
| `client/src/games/keepie-uppies/README.md` | Per-arcade-playbook requirement — what's specific to this game | 0.25 day |
| `client/src/screens/KeepieUppiesScreen.js` | Top-level React screen mounting the Phaser scene (mirror of `BattleScreen.js` / `BasketballScreen.js`) | 0.5 day |
| `public/assets/keepie-uppies/ball.png` | DALL-E generated football, black-and-white panels, transparent PNG | 0.5 day (incl. iteration) |
| `public/assets/keepie-uppies/pitch.png` | DALL-E generated football pitch backdrop, grass + chalk lines + horizon + distant goal | 0.5 day (incl. iteration) |

**Client total: ~5 days**

---

## New files — server

| File | Purpose | Effort |
|---|---|---|
| `server/services/games/keepie-uppies/lifecycle.js` | Match state machine: lobby → active → settled. Uses existing `escrow-v2.js` wrapper. Match ID prefix `keepie:`. | 0.5 day |
| `server/services/games/keepie-uppies/physics.js` | `simulateRound(seed, tapEvents)` — pure function returning `{score, ballPath, terminationReason}`. Deterministic. | 1 day |
| `server/services/games/keepie-uppies/rules.js` | Scoring: `score = successful_taps`. Probably ~5 lines. Window resolver tiebreak logic also lives here. | 0.25 day |
| `server/services/games/keepie-uppies/leaderboard.js` | Best-score tracking, TG broadcast on new leader (mirror of basketball pattern) | 0.5 day |
| `server/services/games/keepie-uppies/resolver.js` | Window-deadline cron — at deadline, freeze leaderboard, call `settleMatch` on the winning wallet | 0.5 day |
| `server/services/games/keepie-uppies/__tests__/physics.test.js` | Deterministic physics tests: same inputs → same outputs. Cover floor crossing, Magnus curve, wall bounce, dead-centre tap reset behaviour. Target ~20-30 tests (basketball had 75 because the surface was larger). | 1 day |

**Server total: ~3.75 days**

---

## Standalone playtest repo + Vercel

| File | Purpose | Effort |
|---|---|---|
| New GitHub repo `solshot-keepie-uppies` (under `BillionaireBonkClub` per basketball convention) | Standalone iteration target | 0.25 day |
| Vercel project wired to that repo | Auto-deploy preview link per push | 0.25 day |
| Mirror of `client/src/games/keepie-uppies/` + minimal harness (React app, no wallet/socket — just the game) | Fast playtest loop | 0.5 day |
| Three-file-sync README documenting standalone ↔ monorepo discipline | Per playbook ch.9.1 | 0.25 day |

**Standalone total: ~1.25 days**

---

## Lobby + bot wiring

| Task | Effort |
|---|---|
| Add `keepie-uppies` to `@TheArcadeGG_Bot` game catalogue + lobby config (player count 2–10, wager amount user-set, window 1d/2d/4d/7d) | 0.5 day |
| Share-card template (Satori-rendered) for "X scored N on Keepie-Uppies" | 0.5 day |
| `/customgame` config flow entries | 0.25 day |

**Lobby/bot total: ~1.25 days**

---

## Playtest + tune

This is the time-bomb item. Basketball burned ~5 days of iteration on physics constants alone (Magnus, restitution, friction, shooter's-square dimensions). Keepie-uppies has far fewer constants (no rim, no board, no friction model on glass), but the ones it does have (`MAGNUS_COEFFICIENT`, `BASE_UP_M_S`, `LATERAL_GAIN`, `VERTICAL_GAIN`, `SPIN_GAIN`) all directly determine feel.

Estimated: **2–3 days of Fish-led playtest + tune loops** through the standalone Vercel deploy. Document each tuning step in `constants.js` per playbook ch.3.4.

---

## Effort total

| Bucket | Days |
|---|---|
| Client | ~5 |
| Server | ~3.75 |
| Standalone repo + Vercel | ~1.25 |
| Lobby + bot wiring | ~1.25 |
| Playtest + tune | ~2.5 |
| Three-file-sync at handoff | ~0.5 |
| **Total realistic** | **~14 days** |

**~50% of basketball's 25–28 day cost.** Within the simplicity thesis. The reduction comes from:
- No spin-coupled rim collision (saved ~2 days)
- No shooter's-square auto-guide (saved ~1 day)
- No 4-ball rack state machine (saved ~1.5 days)
- No swept-detection-into-target debugging (saved ~1 day)
- No depth-ordering tricks across multiple sprites (saved ~1 day)
- No frame-slicing or asset-vs-physics-proportion drift (saved ~1 day)
- One scoring rule instead of swish/rim-in/bank-in/heat-check (saved ~0.5 day)
- One game state instead of idle/running/settling/over (saved ~0.5 day)
- Two assets instead of six (saved ~1 day in DALL-E iteration)
- Smaller test suite (saved ~0.5 day)

---

## Phase plan

| Phase | Goal | Exit criteria |
|---|---|---|
| **0 — Setup** | Branch + standalone repo + Vercel | `arcade/keepie-uppies` exists on origin; standalone repo deploys; kickoff comms entry left |
| **1 — Physics + tests** | Server `simulateRound` runs deterministically; constants stub matches `PHYSICS_RESEARCH.md` | Server tests green; physics file under 200 lines |
| **2 — Scene + ball** | Phaser canvas shows the pitch + ball sitting idle | Loads in browser, no input handlers yet |
| **3 — Input + tap impulse** | Tap on ball bounces it. Off-centre taps curve. Walls bounce. Floor kills. | Playable single attempt on Vercel preview |
| **4 — HUD + sound** | Score / best / game-over flow. `safeAudio`-wrapped synth. | Looks and sounds like a real game in playtest |
| **5 — Playtest + tune** | Iterate constants via Fish-led playtest on Vercel | Fish signs off on feel |
| **6 — Server integration** | Lifecycle + leaderboard + resolver + lobby wiring | Devnet end-to-end: lobby fills → game plays → leaderboard updates → settle on deadline |
| **7 — Three-file-sync + handoff** | Monorepo commit + CLAUDE_COMMS handoff to @main-claude | PR-ready on `arcade/keepie-uppies` |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Magnus coefficient feels wrong even after tuning** — the entire "interesting" of the game lives in this one constant; if it's too low, the game is rhythm-tapping; if it's too high, the game is unplayable random chaos | Medium | Reserve 1.5 days of playtest for this constant alone. Research-cite a starting value (real-world Magnus coefficient for a football at standard tap speeds), then bracket-tune from there. |
| **"Boring after 30 seconds"** — the simplicity-first commitment risks shipping a game nobody comes back to | Medium-low | First-attempt mitigation: ship as designed and playtest with non-Fish humans. If genuinely boring, the v1.1 lever is to add ONE difficulty escalation (gravity ramp at high scores) — designed not to need this, willing to add it if playtest says we do. |
| **Tap-on-ball precision feels unfair on mobile** — fingers are fat, ball is small | Low-medium | Tune `BALL_RADIUS_M` for hitbox to be slightly larger than visual radius (basketball pattern: forgiving hitbox vs strict visual). Document the deliberate inflation in `constants.js`. |
| **Server-authoritative physics divergence from client** — network jitter could cause the client to render a different score than the server confirms | Low | Server is canonical (per arcade playbook). Client shows a temporary "submitted score" UI while waiting for server confirmation. Mismatch surfaces a "score corrected by server" toast (basketball doesn't have this concern because every shot resolves before the next; here it's one event stream per attempt). |
| **AudioContext fragility on mobile** — basketball stuck-bug cascade lesson | Low | `safeAudio` wrapper from line 1 of `sfx.js`. Per-ball render isolation is irrelevant (one ball), but per-tap try/catch in input handler is cheap insurance. |
| **Touch input multi-pointer trap** — basketball's actual stuck-bug cause | Low | Stale-tracking guard from day one. But this game's input is simpler (no drag-and-release state machine — every tap is a discrete event), so the trap may not even apply. Confirm during build. |

---

## Sanity checklist (pre-merge to main)

Mirrors `Docs/ARCADE_NEW_GAME_PLAYBOOK.md` §"Quick sanity-check checklist":

- [ ] Game logic runs server-side, client only renders + mirrors for feedback
- [ ] Winner determined by server, not by client claim
- [ ] `matchId` uses `keepie:<roomId>` convention
- [ ] Escrow `createMatch` / `settleMatch` / `cancelMatch` flow wired
- [ ] At least one local end-to-end test (lobby fill, play, settle on devnet)
- [ ] Game-specific UI in `client/src/games/keepie-uppies/`, no bleed into shared
- [ ] No edits to escrow contract, wallet stack, or audit-related files
- [ ] README in `client/src/games/keepie-uppies/` explains what's game-specific
- [ ] `CI=true npm run build` clean before push (per playbook ch.9.3)
- [ ] Server tests green
- [ ] Standalone playtest repo and monorepo are file-synced at handoff
- [ ] Ball Games Playbook updated with anything new this build taught us
