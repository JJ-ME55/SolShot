# Session — Map system, camera, 5+ player handling, arcade playbook

**Date:** 2026-05-18
**Author:** main-claude (in session with JJ)
**Status:** Decisions ratified — locked as the new way forward.
**Scope:** Multi-day session covering the variable-viewport map refactor, the 5+ player problem, the arcade procedure consolidation, and two game plans handed off for Fish.

This document records the choices made in this chat so future sessions, future Claudes, and Fish can pick up the new architecture without re-deriving it.

---

## 1. Why we touched any of this

Two problems pushed us into the refactor:

1. **Random procedural terrain has no competitive memory.** Every match is unique, but that means no map ever becomes "the desert map you learned to win on." Worms accepts random terrain because it's the genre's identity. Gunbound proved fixed maps build a competitive scene. The SolShot wager loop wants competitive memory.
2. **5+ player matches cram tanks point-blank.** v2 escrow on-chain caps at 10 players. The 1956-wide canvas, used naively with 2P spawn distribution, put 10 players within point-blank range of each other. Either widen the world or constrain spawns; we needed both.

The session pivoted from random terrain → 8 fixed themed maps with a deliberate spawn-band rule and a per-game player-count subset selection.

---

## 2. The 8 themed maps — final lineup

Locked: **Desert, Jungle, Moon, Urban, Arctic, Volcanic, Castle, Canyon.**

| Slug | Theme | Generation source | Spawn-anchor count |
|---|---|---|---|
| `desert` | Pyramids + Sphinx (Giza complex) | AI-traced silhouette | 5 (mirrored to 10) |
| `jungle` | Stepped Mayan pyramid + fallen temple | AI-traced silhouette | 5 (mirrored to 10) |
| `moon` | Asteroid spire + lunar crater rims + Apollo lander | AI-traced silhouette | 5 (mirrored to 10) |
| `urban` | Trapezoidal skyscrapers (varied heights) | Code-generated | 5 (mirrored to 10) |
| `arctic` | Frozen shipwreck + iceberg peaks | AI-traced silhouette | 5 (mirrored to 10) |
| `volcanic` | Main volcano with V-notch crater + secondary cones | AI-traced silhouette | 5 (mirrored to 10) |
| `castle` | Two corner towers + central gate tower + rubble field | Code-generated | 5 (mirrored to 10) |
| `canyon` | Tall mesa walls + central tall butte + mesa fingers | Code-generated | 5 (mirrored to 10) |

**Mixed-source rationale:** AI silhouettes excel at organic / atmospheric character (volcanoes, ruins, ships). Code-gen wins for clean geometric features (towers, walls, building tops). Each map picked the source that yields the more distinctive top-edge silhouette.

**Decision rule for future maps:** if the iconic feature is shape-defined (steps, walls, towers), use code-gen. If it's character-of-detail (ruins, weathered shapes), use AI-trace. Don't force one approach across all themes.

---

## 3. The variable-viewport canvas (TERRAIN_WIDTH = 1956)

**Locked-in dimensions:**

- Canvas: **1956 × 800** (was 1422 × 800 in pre-refactor SolShot, was 1200 × 800 before that)
- Aspect: 22:9 (wider than any common phone landscape)
- Phaser scale mode: `ENVELOP` (fills viewport, crops whichever axis exceeds)
- Mirror axis: x = **978** (canvas centre)

The 1956 width is wider than what phones can render uncropped — narrower aspects crop the outer ~267 px on each side. That cropped region is intentional space for landmark drama at higher player counts; it's not playable in 2-player matches.

**`SAFE_BAND_WIDTH = 1422`, `SAFE_BAND_OFFSET = 267`** — the central 1422-px region all common landscape viewports render fully. Every spawn anchor must live inside this band.

The variable-viewport refactor is in working tree (uncommitted). When committed, server `physics.js` exports `WORLD_BOUNDS` constants for both the full canvas and the safe band.

---

## 4. Tank spawn positions — the new rule

### 4.1 Anchor pool

Each map defines **5 spawn anchors** in `spawns.json` as left-half x-coordinates (in 3456-canvas coordinates). The server:

1. Scales each anchor from full-canvas coords [0, 978] to safe-band coords [SAFE_BAND_OFFSET, SAFE_BAND_OFFSET + SAFE_BAND_HALF].
2. Mirrors around centre (x = 1728 in 3456 space, x = 978 in 1956 space) to produce 10 positions inside the safe band.

Result: 10 spawn positions inside `[267..1689]`, guaranteed visible on every common landscape viewport.

### 4.2 N-player subset selection

Index 0 = leftmost, 9 = rightmost. For each player count, the subset is chosen to maximise spread:

| N | Indices used | Notes |
|---|---|---|
| 2 | `[0, 9]` | **Outermost pair** for maximum distance — fixes the original `[4, 5]` bug where 2P tanks were 60 px apart |
| 3 | `[0, 5, 9]` | Edges + just past centre |
| 4 | `[0, 3, 6, 9]` | Evenly spread quartiles |
| 5 | `[0, 2, 5, 7, 9]` | |
| 6 | `[0, 2, 4, 5, 7, 9]` | |
| 7 | `[0, 1, 3, 5, 6, 8, 9]` | |
| 8 | `[0, 1, 2, 4, 5, 7, 8, 9]` | |
| 9 | `[0, 1, 2, 3, 5, 6, 7, 8, 9]` | |
| 10 | `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]` | Full pool |

**Cardinal rule for 2P:** outermost anchors only, never middle. The pre-fix middle-two-anchors version put tanks 60 px apart on a 1956 canvas — point-blank, unplayable.

### 4.3 Locked-in numbers (validated end-to-end via Claude Chrome live test)

For canyon at 2P: spawn pair `(431, 540), (1524, 540)` — **1093 px apart**, both inside safe band, both on heightmap surface above the HUD line.

---

## 5. Vertical compression — the playable terrain band

**Final values: `PEAK_MAX_Y = 440`, `VALLEY_MAX_Y = 600`. Range 160 px.**

Every heightmap (AI-traced or code-gen) gets remapped to this band before write. The remap is linear — preserves relative shape, compresses absolute amplitude.

### 5.1 Why these specific values

| Constraint | Implication |
|---|---|
| Default 45° / 60-power arc reaches ~250-300 px above launcher | Peaks at y=440, launchers at y=600 → peak is 160 px above launcher → clearable by default arc |
| HUD bottom edge ≈ y=720 | Valleys at y=600 → 120 px of terrain mass below each tank for craters before they fall behind HUD |
| Legacy procedural terrain had `y >= height * 0.55` (y >= 440) | We're matching the legacy "peaks don't exceed 55% from top" rule that proved playable |

### 5.2 The "dance the line" principle (JJ's framing)

Default arcs must reach typical features. SOME spawn pairs require thinking (higher angle, more power, different weapon) to clear central landmarks. Sweet spot ~160-200 px peak-to-valley range; we sit at 160. If gameplay feels too easy, widen the band; if too hard, narrow it.

The dial lives in `tools/build-heightmaps.js` (code-gen) and `tools/trace-heightmap.js` (AI-trace) — both compress to the same band.

---

## 6. Camera — what we did NOT build

**The camera director was discussed and explicitly deferred.**

Earlier sessions sketched a director that would pan to active tank during aim, follow projectile in flight, zoom out for impact. We did NOT build it this session. The reason: with spawns rescaled to the safe band, all tanks are visible without panning at every player count from 2 to 10. The director was solving a problem we partially designed away.

**What remains true for 5+ players (live as of this session):**
- All 10 spawn anchors live inside the 1422-wide safe band → no tank off-screen on phones
- Spread chosen so per-player slot width is ~140 px at N=10 (1422 / 10) → tanks readable
- Map silhouette (peaks at y=440) is below the HUD's top zone (y=100) → no HUD-clash
- Outer 267 px on each side of the canvas are intentionally cropped on phones — that's where the most dramatic landmark detail lives, visible on wider laptop viewports

**What a camera director would still add (Phase X work, deferred):**
- Zoom on active player turn for aim precision
- Projectile-follow for satisfying flight tracking
- Impact zoom-out for damage readability
- Compass/minimap showing off-screen tank positions when zoomed in

Decision: **not built this session.** The current static-camera + safe-band-rescaled-spawn model proves out the 5+ player UX. If real playtesting shows the camera is missed, build then.

---

## 7. Heightmap generation pipeline

Two parallel pipelines, both terminating at `solshot_maps/<slug>/heightmap.png` (1956 × 800, pure binary):

### 7.1 AI-trace pipeline (`tools/trace-heightmap.js`)

Input: hand-prompted silhouette PNG from ChatGPT Images / Midjourney / DALL·E, saved at `solshot_maps/<slug>/silhouette_source.png`.

Steps:

1. Resize source to 3456 wide (preserve aspect)
2. Align silhouette top to canvas-coords y=280
3. Extract per-column surface y (topmost dark pixel)
4. Mirror left half to right half around centre
5. **Compress vertically** into target band [440..600]
6. Smoothing pass 1 — Gaussian kernel 15 (broad shape smoothing)
7. Auto-detect steep features → indestructible bounding boxes with x-tolerance and width threshold
8. Flatten heightmap inside indestructible boxes (features become "decorative" indestructible markers, not playable geometry)
9. Smoothing pass 2 — Gaussian kernel 11 (cleanup)
10. Write PNG + auto-update meta.json with the auto-detected boxes

### 7.2 Code-gen pipeline (`tools/build-heightmaps.js`)

Per-theme shape function returns surface y for each x in the left half [0..1727]. Functions for:
- Desert (pyramids + Sphinx) — *replaced by AI-trace in current state*
- Jungle (Mayan ziggurat) — *replaced by AI-trace*
- Moon (asteroid spire) — *replaced by AI-trace*
- Arctic (frozen shipwreck) — *replaced by AI-trace*
- Volcanic (volcano + crater notch) — *replaced by AI-trace*
- **Urban** (trapezoidal buildings) — code-gen lives
- **Castle** (corner towers + central gate tower + rubble) — code-gen lives
- **Canyon** (mesa walls + central butte) — code-gen lives

Steps:
1. Compute left half from shape function
2. Mirror to right half
3. Same vertical compression as AI-trace pipeline (target band [440..600])
4. Validate slopes near spawn anchors (≤5 px/col, with indestructible-box exemption)
5. Write PNG

Both pipelines reload via `touch server/services/maps.js` (nodemon picks up the change and preloads from disk).

### 7.3 Urban building shape (the iterations)

Started cosine-tapered rounded hills → looked like Mayan jungle, not city. Tried stepped pyramid → JJ rejected ("looks like pyramid not building"). **Final: TRAPEZOIDAL profile** — inner 82% flat top, outer 18% steep linear ramp to ground. Variable heights for the 5 buildings give visual variety without stacked tiers.

Code in `urbanHeight()` of `tools/build-heightmaps.js`.

---

## 8. Themed backdrop + auto-sampled terrain palette

### 8.1 Backdrop serving

Each map has a backdrop.png at `solshot_maps/<slug>/backdrop.png` (~1846 × 852 native, painted via ChatGPT Images). Server static-serves at `/maps/<slug>/backdrop.png` with traversal guard (only allow `<slug>/backdrop.png` or `<slug>/surface.png`).

Client Phaser preloader registers all 8 themed backdrop textures by key `map-bg-<slug>`. The `createBackground` function prefers themed key over legacy 5-theme fallback.

### 8.2 Auto-sampled terrain palette (JJ's "sample the colours" call)

The breakthrough from this session: instead of hand-tuning per-slug terrain layer colours, **sample the painted ground band of the backdrop** and derive 5 progressively-darker shades.

Method (`sampleTerrainPaletteFromBackdrop` in `client/src/scenes/main/index.js`):

1. Sample bottom 18% of the backdrop (the painted ground area)
2. Central 50% horizontal band (skip edge vignette)
3. Step every 4 pixels, average R/G/B
4. Build 5 layers: factor 1.00, 0.82, 0.65, 0.50, 0.35 of the anchor colour
5. Replace `_currentTheme.terrainLayers` with the sampled palette

Validated colour samples (live captured this session):
- **Moon** → `rgba(43,47,56,1)` (dark slate / lunar grey)
- **Arctic** → blue-white shades
- **Canyon** → `rgba(149,52,30,1)` (red-orange / rust)
- **Urban** → `rgba(35,25,66,1)` (dark purple-navy)
- **Volcanic** → `rgba(37,30,35,1)` (near-black, slight warm)

### 8.3 Tint alpha bump (the "brown speckles" fix)

The terrain renderer fills with a green jungle-texture PNG, then tints with theme color. At the legacy `globalAlpha = 0.5/0.55`, the underlying brown gravel pixels peeked through and read as olive/brown speckles on top of any sampled palette.

**Bumped to `globalAlpha = 0.98` in both base-fill and per-layer-fill paths.** Sampled palette now dominates; the texture PNG is just structural noise.

Locations: `client/src/graphics/terrain.js` lines 23-31 (base fill) and 175-179 (layer fill).

---

## 9. Visual identity policy across the arcade

Locked in `Docs/ARCADE_PLAYBOOK.md` §5:

**Hub UI tokens (shared, locked):**
- Fonts: Black Ops One (display) + Share Tech Mono (mono)
- Palette: olive `#7a9060` / bone `#c8b87a` / orange `#c8781a` / rust `#8a4a12`
- Shape: clip-path angled corners (`--clip-6`, `--clip-10`)

Every game's HUD overlay, score panel, leaderboard, buttons, "Open in Safari ↗" link uses these. Lives in `client/src/styles/tokens.css`.

**Gameplay canvas (per-game, divergent):**
Inside the Phaser canvas, each game uses its own world palette (wood court for basketball, grass for keepie-uppies, themed terrain for SolShot). Forcing olive across every gameplay canvas would make basketball look weird.

**Stat cards (future shared template):**
Not built yet. Per `Next_Steps_Games.docx` §6, a shared stat-card service renders post-match cards in SolShot tokens with per-game data embedded.

Re-audit after game #4 (Bubble Shooter) ships — that game is the first real workout of the shared HUD-token approach.

---

## 10. Arcade playbook — the procedure locked in

Full doc: `Docs/ARCADE_PLAYBOOK.md` (10 sections, ~380 lines).

**Cardinal rules:**
- Branch per game (`arcade/<slug>`) + Vercel project per game (`sol-shot-<slug>`)
- Vercel projects on **JJ's account**, never Fish's (Fish's separate Vercel account holds a stranded basketball deploy we can't update)
- `CI=false` env var on every Vercel project (CRA otherwise treats warnings as errors)
- NO service worker registration (CRA SW caches HTML/JS too aggressively, hotfixes blocked)
- "Open in Safari ↗" escape hatch on every standalone (TG WebView is flaky)
- Touch input MUST have stale-tracking guard (the basketball "stuck-bug")
- `safeAudio` wrapper around every play* export
- TG slash commands strip hyphens — game folder `keepie-uppies/`, URL `sol-shot-keepie-uppies.vercel.app`, command `/keepieuppies`

**The 2026-05-15 near-miss** that codified the per-game-Vercel rule: promoting `arcade/basketball` to production on the shared `sol-shot` Vercel project flipped `www.solshot.gg` to basketball for ~10 minutes. Caught by JJ's manual test, no real users hit it. Fixed by separating Vercel projects per game.

---

## 11. Two games handed off for Fish

Drafted this session:

- **`Docs/games/2048/PLAN.md`** — Fork `gabrielecirulli/2048` (MIT), reskin to SHOT-denominated tiles, slug `/play2048` (TG can't start commands with digits). ~1-1.5 days end-to-end.
- **`Docs/games/bubble-shooter/PLAN.md`** — Fork `rembound/Bubble-Shooter-HTML5` (MIT), bubbles are SHOT-tier currency icons, aim mechanic uses Fish's basketball touch-input expertise. ~1.5-2 days. First real workout of the shared HUD tokens.

Both Tier 2 solo-skill (matches our shipped pattern), no new infrastructure needed.

---

## 12. The 5 unresolved strategic decisions

Per `Docs/internal/Next_Steps_Games.docx` §9. Block Phase 0 of multi-game expansion:

1. **Tickets currency** vs SHOT-only — Tickets recommended as separate on-chain SPL token
2. **Monorepo** vs per-game repos — currently monorepo with branch isolation (working well)
3. **Phaser-only** stack policy — currently de facto, recommendation: lock
4. **Brand name** — bot is `@TheArcadeGG_Bot`, final name deferred
5. **SDK licensing** for third-party studios — deferred to Phase 5

Until decisions 1-3 are answered, Tier 1 (multiplayer PvP) games (8 Ball Pool, top-down shooter, Snake) can't start. Tier 2 (solo-skill) games (2048, Tetris, Bubble Shooter) ship on the existing pattern without resolving them.

---

## 13. Files changed / created this session

**New docs:**
- `Docs/ARCADE_PLAYBOOK.md` — 10-section arcade procedure (~380 lines)
- `Docs/games/2048/PLAN.md` — game spec + Fish handoff
- `Docs/games/bubble-shooter/PLAN.md` — game spec + Fish handoff
- `Docs/internal/SESSION_2026-05-18_MAP_CAMERA_DECISIONS.md` — this file

**Modified docs:**
- `~/.claude/projects/.../memory/MEMORY.md` — appended "## The Arcade" section (~60 lines) so auto-memory carries arcade context across sessions

**Working-tree changes (uncommitted):**
- `server/services/maps.js` — new themed-map loader + `generateTankPositionsFromMap` with safe-band rescaling
- `server/services/physics.js` — `WORLD_BOUNDS` export
- `server/socket-io/main.js` — match flow uses `pickRandomMap()` instead of `generateTerrain()`
- `server/index.js` — static-serve `/maps/<slug>/` route
- `client/src/scenes/main/index.js` — themed backdrop preload, `sampleTerrainPaletteFromBackdrop` method, mapId propagation through terrainGenerated handler
- `client/src/graphics/terrain.js` — tint alpha bump from 0.5/0.55 → 0.98
- `tools/build-heightmaps.js` — vertical compression, urban trapezoid profile
- `tools/trace-heightmap.js` — AI-trace pipeline (smoothing + auto-detect + flatten + recompress)
- `solshot_maps/<8 themes>/` — heightmap.png, backdrop.png, spawns.json, meta.json (8 × 4 files = 32 files), plus `silhouette_source.png` for the 5 AI-traced themes

**Working-tree changes summary:** ~50 files modified or created, including new tools + map asset directory + per-game JSON metadata.

---

## 14. What's explicitly deferred

- **Camera director** for 5+ players (current static-camera + safe-band-rescaled-spawn works without it)
- **Wagering layer** for arcade games (escrow router + Tickets currency = Phase 0 of arcade rollout)
- **Cross-game shared leaderboard** (per-game leaderboards work today; cross-game = Phase 0)
- **Stat card service** (shared template, currently each game has ad-hoc share)
- **iPad fallback polish** (variable-viewport's iPad case clips band edges; deferred)
- **In-flight match heightmap migration** (current behaviour: matches in progress at the moment of refactor continue on old terrain; new matches use new system)

---

## 15. Process notes from this session (for future-Claude)

- **Auto-memory `MEMORY.md` doesn't update itself.** Major architectural pivots (the arcade pivot, the map refactor) don't land in memory unless we explicitly append. Future sessions arrive cold without this context. Append after any session that changes how we build things.
- **The MCP background-task harness can't host long-running dev servers reliably.** CRA + Render dev servers die with exit 127 after a few minutes. Run them in JJ's own terminals.
- **Claude in Chrome works well for live-testing UI changes.** Using `tabs_create_mcp` + `find` + `browser_batch` + `javascript_tool`, we drove SolShot through full match boots end-to-end and confirmed the spawn / palette / heightmap pipeline live. Faster than screenshot ping-pong.
- **JJ's "no guessing" rule applies to debugging too.** When the volcanic/canyon terrain looked green after the palette work, the initial reaction was "the tint isn't applying." Actual cause was likely a Vite/CRA hot-reload miss on graphics/terrain.js — confirmed by checking file contents on disk. Don't assume; verify.
- **The MCP harness ate two background dev-server processes** during this session. Stable approach: JJ runs servers in his terminal, Claude operates them via tool calls.

---

— main-claude, 2026-05-18
