# Basketball Hoops — Open-Source Base Hunt v0.1

The playbook recommends finding a Phaser-compatible open-source game to fork as a starter base, projecting 2-3 days saved. Result of the hunt: **no clean fork target exists**. We build fresh, but we have strong reference material to lean on.

This doc captures what was evaluated, why each candidate failed, and what we use as references instead.

---

## Hard requirements (per playbook + project context)

A fork target needs all of:
- Phaser 3 (we run Phaser 3.55 — Phaser 2 is a different framework, code doesn't port)
- MIT, Apache-2.0, or other permissive license (we're a commercial project — no GPL, no unlicensed code)
- Single-screen gameplay (matches our scope)
- Active or at least recent (5+ years of bitrot makes it more work than building fresh)

---

## Candidates evaluated

### 1. BonbonLemon/basketball

**The closest behavioural match to what Fish wants — explicitly designed to play like Facebook Messenger's basketball game.**

| Criterion | Result |
|---|---|
| License | ❌ **None** — `license` field is null in GitHub API. By default, all rights reserved. Cannot legally fork into a commercial repo. |
| Phaser version | ❌ **Phaser 2 era** — last pushed 2016-04-16, before Phaser 3 existed (2018). |
| Stars / engagement | ⚠️ 37 stars, 20 forks (modest but real) |
| Game features | ✅ Cursor-direction shooting, rim collision, ball physics, emoji feedback |
| Playable demo | ✅ http://bonbonlemon.github.io/basketball/ — works in browser |
| Verdict | **Reference only.** We can't take the code. We CAN play the demo and study the feel — it's exactly the FB Messenger game Fish named as the inspiration. |

### 2. abritopach/phaser-responsive-basketball-game

| Criterion | Result |
|---|---|
| License | ❌ None specified |
| Phaser version | ⚠️ Unclear (likely Phaser 2 based on commit age) |
| Stars / engagement | ⚠️ 3 stars, 10 commits, no README, no description |
| Game features | ⚠️ Unclear — minimal repo |
| Verdict | **Too thin to be useful.** Looks like an abandoned personal prototype. Skip. |

### 3. Phaser 3 official examples (phaserjs/examples)

| Criterion | Result |
|---|---|
| License | ✅ MIT |
| Phaser version | ✅ Phaser 3 |
| Coverage | ✅ Hundreds of patterns: arcade physics, Matter.js physics, trajectory, collision detection, particles, input handling |
| Game features | ❌ No basketball game specifically — but the building blocks are all here |
| Verdict | **Pattern library, not a fork target.** Use it for trajectory math, collision examples, touch gesture handling. |

### 4. Other GitHub searches

Searched "phaser 3 basketball", "phaser hoop", "phaser 3 sports game", "html5 basketball matter.js", "phaser trajectory shooting MIT". No other Phaser 3 + basketball-specific repos surfaced.

A few tangentially relevant Phaser 3 arcade games exist (Space Shooter Phaser3, idgm5/shootergame) but none with basketball mechanics. Their value as references is no higher than the official Phaser 3 examples.

---

## What this means for the build

### The bad news
**The 2-3 days the playbook projected as fork savings — we don't get those.** No clean Phaser 3 basketball game exists to fork.

### The good news
We have stronger references than expected:

1. **BonbonLemon's playable demo** at http://bonbonlemon.github.io/basketball/ is exactly the feel Fish referenced. Play it. Study it. Re-implement the feel, not the code. The demo is the spec.
2. **Phaser 3 official examples** (https://phaser.io/examples) — copy-paste-friendly patterns for trajectory, collision, touch input, Matter.js physics. MIT licensed, current.
3. **SolShot's own `client/src/scenes/main/index.js`** — the playbook explicitly names this as the reference for "how a game integrates with the SolShot bridge." We've already built a Phaser 3 game on our own infrastructure; reuse that architecture.
4. **Phaser 3 starter templates** (multiple TypeScript/JS scaffolds on GitHub topic `phaser3-game`) — useful if we want a cleaner project init, but we'll integrate directly into `client/src/games/basketball/` per the playbook layout anyway, so this is optional.

### Net time impact

| Path | Estimated saving |
|---|---|
| Original plan: fork a Phaser 3 basketball game | 2-3 days saved |
| **Actual plan: build fresh with strong references** | **~1 day saved (vs zero references)** |

So SCOPING.md's "~25-28 days" estimate doesn't shrink meaningfully from the base hunt. Plan accordingly.

---

## Recommended approach for the scene + input layer

Given no fork target:

1. **Spend ~1 hour on BonbonLemon's demo.** Play it on desktop AND mobile. Time how long shots take, count rim hits vs swishes, note the size-shrink effect as the ball travels (their "3D-like" trick). Take notes — this is the v1 feel target.
2. **Start `scene.js` from scratch** using the SolShot bridge pattern. Reference `client/src/scenes/main/index.js` for the bridge wiring and `EventBus` plumbing.
3. **Pull trajectory + collision patterns from Phaser 3 examples** (specifically the `physics/matter` and `physics/arcade` example folders). Their gravity + projectile examples translate directly.
4. **Touch flick gesture** — implement using Phaser's pointer events (`pointerdown`, `pointermove`, `pointerup`). No external library needed. ~half a day.
5. **Desktop mouse arrow + click** — similar pointer event handling, with a custom `Graphics` object rendering the arrow. ~half a day.

Estimated effort: **2-3 days for scene.js + input layer** (matches original SCOPING.md estimate). The base hunt confirms the estimate is right rather than reducing it.

---

## Reference checklist for the build

Pin these tabs while building:

- [ ] BonbonLemon playable demo: http://bonbonlemon.github.io/basketball/ — the feel target
- [ ] Phaser 3 examples: https://phaser.io/examples — pattern library
- [ ] Phaser 3 docs: https://docs.phaser.io/ — API reference
- [ ] SolShot's main scene: `client/src/scenes/main/index.js` — architecture reference
- [ ] Playbook: `Docs/ARCADE_NEW_GAME_PLAYBOOK.md` — constraints, file layout

---

## What's NOT in scope for this doc

Decisions on engine internals (Arcade physics vs Matter.js, sprite vs vector ball, frame-based vs tween-based animation) — those land in engineering during the build, not as a doc-driven choice. JJ will pick what fits the SolShot stack he already runs.

Decisions on asset sourcing (Midjourney vs Fiverr vs stock vs hand-built) — those land in SCOPING.md's art section, not here.

---

## Verdict

**Build fresh.** Use BonbonLemon as the feel reference (its demo, not its code). Use Phaser 3 examples as the pattern library. Use SolShot's existing scene as the architecture template. The base hunt didn't save us 2-3 days, but it confirmed we're not missing a hidden free win.
