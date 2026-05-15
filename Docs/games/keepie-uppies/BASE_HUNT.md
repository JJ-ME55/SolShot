# Keepie-Uppies — Open-Source Base Hunt v0.1

The arcade playbook recommends finding a Phaser-compatible open-source game to fork as a starter base, projecting 2–3 days saved. **Result of the hunt: no clean Phaser 3 fork target exists.** We build fresh, but we have strong reference material to lean on.

This doc captures what was evaluated, why each candidate failed, and what we use as references instead. Same conclusion as basketball — the casual-arcade-physics-in-Phaser-3 niche is mostly served by paid commercial templates rather than permissively-licensed open-source repos.

---

## Hard requirements (per playbook + project context)

A fork target needs all of:
- **Phaser 3** (we run Phaser 3.55 — Phaser 2 / CreateJS / PlayCanvas / ZIMjs / vanilla canvas all require porting that erases the fork-saving value)
- **MIT, Apache-2.0, or other permissive license** (commercial project — no GPL, no unlicensed code, no commercial-asset-store templates)
- **Single-screen gameplay** (matches our scope)
- **Active or at least recent** (5+ years of bitrot makes it more work than building fresh)
- **Behaviourally close to keepie-uppies** (gravity-only ball + tap input + survival fail condition — anything farther afield isn't a fork target, it's just a "Phaser arcade" project)

---

## Candidates evaluated

### 1. PlayCanvas Keepy Up tutorial

**The closest behavioural match — explicitly a tap-to-keep-football-up tutorial with full source.**

| Criterion | Result |
|---|---|
| License | ⚠️ Tutorial source is public on PlayCanvas.com (project 406050) but no explicit MIT/permissive license attached to the tutorial assets. PlayCanvas engine itself is MIT, but the *tutorial project* is unclear — would need to email them to confirm. |
| Engine | ❌ **PlayCanvas, not Phaser.** Different rendering pipeline, different scene graph, different scripting model. Porting cost > rebuilding. |
| Game features | ✅ Gravity ball + tap input + score increment + game-over on ball-falls-below-line. Mechanically identical to our v0. |
| Playable demo | ✅ Hosted on PlayCanvas Developer Site |
| Verdict | **Reference only.** Read the tutorial for confirmation that our gravity-only + impulse-on-tap model is the right shape; don't fork the code. https://developer.playcanvas.com/tutorials/keepyup-part-four/ |

### 2. CodePen Soccer Up! (ZIMjs + Box2D)

| Criterion | Result |
|---|---|
| License | ⚠️ CodePen entry, not explicitly licensed |
| Engine | ❌ **ZIMjs + Box2D, not Phaser** |
| Game features | ✅ Tap-to-bounce ball + physics body collisions |
| Verdict | **Reference only for the physics-engine approach** (Box2D is overkill for our 1-ball game; we don't need a full physics engine, our impulse-velocity-replace model is simpler). https://codepen.io/danzen/pen/bKvybq |

### 3. MarketJS "Keepy Uppy" + CodeCanyon "Kickups"

| Criterion | Result |
|---|---|
| License | ❌ **Commercial paid templates.** MarketJS sells per-license-tier; CodeCanyon is GPL-incompatible / commercial restricted. |
| Engine | Various (CreateJS for Kickups, unclear for MarketJS) |
| Verdict | **Not usable.** Confirms there's commercial demand for the genre — useful market signal, no code we can pull. |

### 4. BonbonLemon/basketball

| Criterion | Result |
|---|---|
| License | ❌ None (default all-rights-reserved) |
| Engine | ❌ Phaser 2 (2016) |
| Relevance | Basketball precedent. Set the pattern of "no clean fork target → build fresh with reference research." Same outcome here. |
| Verdict | **Historical context only.** https://github.com/BonbonLemon/basketball |

### 5. MTrajK/bouncing-balls

| Criterion | Result |
|---|---|
| License | ✅ **MIT** |
| Engine | ❌ **Vanilla JS + plain HTML Canvas, not Phaser** |
| Stars | 113 (modest but real) |
| Game features | ⚠️ Physics simulation, not a game. Vector math + collision detection between multiple balls. |
| Verdict | **Vector-math reference.** Useful as a sanity check on our 2D vector math (dot, cross, magnitude) but not a fork target. https://github.com/MTrajK/bouncing-balls |

### 6. Phaser 3 official examples (phaserjs/examples)

| Criterion | Result |
|---|---|
| License | ✅ MIT |
| Engine | ✅ Phaser 3 |
| Coverage | ✅ Hundreds of patterns: arcade physics, Matter.js physics, gravity, input handling, sprite tweens |
| Game features | ❌ No keepie-up game specifically — but the building blocks are there |
| Verdict | **Pattern library, not a fork target.** Specifically useful: input-handling examples for unified touch + mouse, sprite-rotation patterns for our spinning ball visual, simple gravity-and-bounce examples for sanity-checking the integration. https://phaser.io/examples/v3 |

### 7. Other GitHub searches

Searched: `phaser 3 keepie up`, `phaser juggling`, `html5 javascript ball juggling`, `phaser 3 football game MIT`, `kick up javascript game source`, `keepy up game open source`. No Phaser 3 + keepie-up-specific permissively-licensed repos surfaced.

A handful of tangentially relevant Phaser 3 football games exist (`sebsowter/phaser-simple-soccer`, `wkallhof/football`) but they're full-pitch multi-player simulations — wrong genre, no value as a base.

---

## Conclusion

**Build fresh on Phaser 3.** The physics model is small enough (one ball, one impulse, gravity, Magnus, walls, floor) that no fork-saving meaningfully accelerates the build. The PlayCanvas tutorial confirms the *shape* of our design is the natural shape for the genre, which is reassurance — but their code is on a different engine and not licence-clean to lift.

**What we use instead:**
- Phaser 3 official examples for arcade physics + input patterns
- MTrajK/bouncing-balls for vector-math sanity checks
- PlayCanvas Keepy Up tutorial as a behavioural reference (read for confirmation, don't fork)
- Basketball Hoops codebase (`arcade/basketball` branch) for: bridge pattern, Phaser scene structure, `safeAudio` wrapper, three-file-sync workflow, server-authoritative pattern, leaderboard service, lobby wiring. **This is by far the most valuable reference** — same project, same conventions, same infrastructure.

Per the playbook ch.13 checklist, the kickoff is:
1. ✅ Read Ball Games Playbook top to bottom
2. ✅ Physics research doc with citations (`PHYSICS_RESEARCH.md`)
3. ⏳ Standalone playtest repo + Vercel
4. ⏳ Constants file drafted with research citations (constants.js after Phase 1)

Estimate per `SCOPING.md`: **~14 days realistic**, ~50% of basketball's cost. The lack of a fork base doesn't change the estimate — basketball was also built fresh.
