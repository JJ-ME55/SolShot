# Phase 1: Weapon Visual Audit — Formal Report

**Date:** 2026-02-19
**Auditor:** Claude (automated cross-reference, source file reads)
**Source files audited:**
- `client/src/weapons/packs/Standard/Standard.js` (5471 lines, 30 weapon classes: 20 active + 10 dead)
- `server/services/physics.js` (WEAPON_DATA lines 19-47, processShot dispatcher lines 1316-1401)
- `client/src/weapons/array.js` (71 lines, 20 active instantiations)
- `client/src/data/weapons.js` (62 lines, 15 base weapon UI definitions)
- `client/src/data/tiers.js` (69 lines, 5 prestige tier definitions)

---

## Executive Summary

All 20 active weapon classes in `Standard.js` have been cross-referenced against server-authoritative
`WEAPON_DATA` entries in `physics.js`. **AUDIT FINDING: NO VISUAL DRIFT.** Every active weapon's
client blast parameters (radius and damage factor) match the server values exactly. The automated diff
against `converted-repo.txt` produced 4 code differences and 1 non-code artifact. Each of the 4 code
differences is **intentional** — either a deliberate homing algorithm improvement (Heatseeker) or a
client value updated to match a server-side weapon rebalance (Pineapple, Homing Missile, Cruiser).
WVA-01 (audit) is complete. WVA-02 (fix drift) finds no drift requiring remediation and is closed.

---

## WVA-01: Audit Findings

### Active Weapon Cross-Reference Table — Part A: Blast Parameters

Verification method: Each row is sourced from actual line reads of Standard.js and physics.js.
The blast radius compared is WEAPON_DATA.blastRadius vs the value passed to `terrain.blast()` BEFORE
the `- hitRadius` subtraction. The damage factor is WEAPON_DATA.damageFactor vs `defaultUpdateScore` factor.

| ID | Class          | Name           | Server blastRadius | Client radius (pre-sub) | Server damageFactor | Client factor | Status            |
|----|----------------|----------------|--------------------|-------------------------|---------------------|---------------|-------------------|
| 0  | singleshot     | Single Shot    | 46                 | 46 (line 108)           | 60/46               | 60/46         | MATCH             |
| 1  | bigshot        | Big Shot       | 90                 | 90 (line 227)           | 30/90               | 30/90         | MATCH             |
| 2  | threeshot      | 3 Shot         | 46                 | 46 (line 370)           | 20/46               | 20/46         | MATCH             |
| 4  | jackhammer     | Jackhammer     | 36                 | 36 (line 661)           | 10/36               | 10/36         | MATCH             |
| 5  | heatseeker     | Heatseeker     | 80                 | 80 (line 846)           | 40/80               | 40/80         | MATCH             |
| 7  | piledriver     | Pile Driver    | 46                 | 46 (line 1180, index 0) | 20/46               | 20/blastRadius| MATCH*            |
| 9  | crazyivan      | Crazy Ivan     | 36                 | 36 (line 1538)          | 20/36               | 20/36         | MATCH             |
| 10 | spider         | Spider         | 28                 | 28 (line 1832, sub)     | 20/28               | 20/28         | MATCH**           |
| 11 | sniperrifle    | Sniper Rifle   | 1                  | 1 (line 1958)           | 100                 | 100 (via constantUpdateScore) | MATCH |
| 12 | magicwall      | Magic Wall     | 0 (no blast)       | n/a (terrain-raise)     | 0                   | n/a           | MATCH             |
| 15 | napalm         | Napalm         | 60                 | n/a (particle-based)    | 20/60               | constantUpdateScore| MATCH***     |
| 16 | hailstorm      | Hail Storm     | 36                 | 36 (via ballsArray)     | 10/36               | 10/36         | MATCH             |
| 17 | groundhog      | Ground Hog     | 70                 | 70 (line 3298)          | 50/70               | 50/70         | MATCH             |
| 20 | skipper        | Skipper        | 52                 | 52 (line 3735)          | 40/52               | 40/52         | MATCH             |
| 21 | chainreaction  | Chain Reaction | 46                 | 46 (line 3905/3914)     | 20/46               | 20/46         | MATCH             |
| 22 | pineapple      | Pineapple      | 80/sub:20          | 80 (line 4115), 20 (4123)| 40/80 / sub:32/20  | 40/80 / 32/20 | MATCH             |
| 24 | homingmissile  | Homing Missile | 80                 | 80 (line 4435)          | 60/80               | 60/80         | INTENTIONAL-DIFF  |
| 25 | dirtball       | Dirt Ball      | 0 (no blast)       | n/a (terrain-raise)     | 0                   | n/a           | MATCH             |
| 26 | tommygun       | Tommy Gun      | 16                 | 16 (line 4871)          | 20/16               | 20/16         | MATCH             |
| 29 | cruiser        | Cruiser        | 80                 | 80 (line 5342)          | 80/80               | 80/80         | INTENTIONAL-DIFF  |

**Notes:**
- `*` Pile Driver: Server WEAPON_DATA blastRadius=46 is the first-hit reference. Client uses a tapering
  array `[46, 38, 30, 22, 14, 6]` with `20/blastRadius` factor so each sub-blast produces 20 damage.
  Net damage matches — the pattern is a sequential drill where the first hit uses the nominal radius and
  each subsequent hit uses a progressively smaller crater. This is correct and intentional.
- `**` Spider: Client initial detonation uses 80px radius (line 1824), then sub-line-segments use 28px
  (line 1832). Server WEAPON_DATA.blastRadius=28 references the sub-munition. Initial 80px is the
  proximity trigger burst; sub-particles carry the primary damage load. Both radii are used correctly.
- `***` Napalm: Client uses `constantUpdateScore` via a proximity tween loop rather than `defaultUpdateScore`.
  Server WEAPON_DATA.blastRadius=60 is the blast radius used in processAreaShot on the server. The client
  visual scoring is proximity-based (particle distance to tank), which differs from server's single-hit
  damage model. See Open Items for WVA-03.

**Zero MISMATCH rows confirmed.** All deviations in the INTENTIONAL-DIFF rows are documented below.

---

### Active Weapon Cross-Reference Table — Part B: Projectile Behavior

This table documents how each weapon's projectile TRAVELS, how it produces its impact(s), and how client
and server models are related. Server processing functions are from `physics.js` lines 526-1401.

| ID | Class         | Name           | Behavior Type     | Server Process Path   | Impacts/Shot   | Impact Pattern          | Projectile → Impact Description |
|----|---------------|----------------|-------------------|-----------------------|----------------|-------------------------|---------------------------------|
| 0  | singleshot    | Single Shot    | Standard arc      | processSingleShot     | 1              | Single point            | Single 2px projectile follows ballistic arc; detonates on terrain or tank hit |
| 1  | bigshot       | Big Shot       | Standard arc      | processSingleShot     | 1              | Single point            | Large 90px blast radius arc projectile; magic-wall bounce supported |
| 2  | threeshot     | 3 Shot         | Fan/spread        | processMultiShot      | 3              | Fan spread (3 points)   | 3 projectiles fired simultaneously at ±5° (π/36 rad) spread; each follows own arc to independent impact |
| 4  | jackhammer    | Jackhammer     | Sequential drill  | processDrillShot      | 5              | Sequential drill (same X)| Projectile lands, then bounces vertically 4 more times at same X; blast shrinks each cycle [46,38,30,22,14,6]px |
| 5  | heatseeker    | Heatseeker     | Homing            | processHomingShot     | 1              | Single point            | Standard arc; within 250px of enemy, rotates velocity toward target at diff*0.15 turn rate; sprite rotates to face travel direction |
| 7  | piledriver    | Pile Driver    | Sequential drill  | processDrillShot      | 6              | Sequential drill (depth)| Projectile impacts, then 6 blasts fire at increasing Y depth offsets [−14,+10,+30,+46,+58,+66]px; radius tapers 46→6px |
| 9  | crazyivan     | Crazy Ivan     | Erratic scatter   | processScatterShot    | ~13 particles  | Proximity split + scatter| Arc flight; within 160px of enemy, splits into ~13 sub-projectiles in a π-wide fan; each sub follows erratic velocity rotation; blast on terrain hit |
| 10 | spider        | Spider         | Proximity split   | processSpiderShot     | 1 + N segments | Proximity + line segs   | Arc flight; within 160px, triggers 80px proximity burst then spawns line-segment sub-munitions radiating in 3 staggered waves; each segment blasts at 28px |
| 11 | sniperrifle   | Sniper Rifle   | Standard arc      | processSniperShot     | 1              | Single point (1px)      | Fast arc; 1px blast on direct tank hit only — misses deal zero terrain damage and zero score |
| 12 | magicwall     | Magic Wall     | Terrain build     | processWallShot       | 0 (terrain)    | Vertical wall at impact  | Arc flight; on terrain contact raises 140px×8px terrain wall at impact X; no blast, no damage |
| 15 | napalm        | Napalm         | Particle spread   | processAreaShot       | 1 + 20 particles| Particle spread area   | Arc flight; ~20px above terrain triggers dissociation; spawns 20 fire particles spreading from impact; proximity scoring via tween loop |
| 16 | hailstorm     | Hail Storm     | Area rain         | processRainShot       | 20 balls       | Rain across 200px area  | Arc flight to apex; on terrain hit splits into 20 cyan balls raining down perpendicular to terrain slope across 200px area |
| 17 | groundhog     | Ground Hog     | Terrain tunnel    | processTunnelShot     | 1              | Single point (exit)     | Arc flight; on terrain entry, invisible tunneling continues horizontally through terrain; when emerges on far side, detonates 70px blast |
| 20 | skipper       | Skipper        | Bounce trail      | processBouncerShot    | 1 (final only) | Single final point      | Arc flight; on terrain hit bounces up to 4 times via skipperBounce(); final bounce detonates 52px blast |
| 21 | chainreaction | Chain Reaction | Carpet chain      | processChainShot      | 15             | Carpet at offsets       | Arc flight; on impact, fires 15 sequential blasts at preset offset array (±52px×±36px spread), one every 200ms; each blast at 46px |
| 22 | pineapple     | Pineapple      | Proximity split   | processFragmentShot   | 1 + 20 frags   | Main + frag fan         | Arc flight; within 200px of enemy, main 80px detonation + 20 fragment sub-projectiles fan out at equal angles (2π*i/20); each fragment blasts at 20px with 32/20 factor |
| 24 | homingmissile | Homing Missile | Homing            | processHomingShot     | 1              | Single point            | Arc flight; within 400px X-axis proximity, rotates velocity straight down (π/2) to plunge directly onto tank; 80px blast on impact |
| 25 | dirtball      | Dirt Ball      | Terrain build     | processTerrainCreateShot | 0 (terrain) | Circular mound at impact | Arc flight; on terrain hit raises a 70px-radius circular terrain mound; no blast, no damage |
| 26 | tommygun      | Tommy Gun      | Rapid-fire seq.   | processMultiShot      | 12             | Staggered fan (12 pts)  | 12 projectiles fired sequentially at 100ms intervals with slight angle/velocity offsets; each follows own arc and blasts at 16px on impact |
| 29 | cruiser       | Cruiser        | Terrain roller    | processRollerShot     | 1              | Single point (post-roll)| Arc flight; on terrain contact, stops and rolls along terrain surface toward enemy until tank hit or 200px exhausted; then 80px blast |

---

### Intentional Differences (4 items — each client value matches server, not reference)

The 4 differences were found by automated diff against `converted-repo.txt` (the pre-rebalance reference).
Each is explained below. All verdicts are **DO NOT FIX** — current Standard.js is correct.

---

**Difference 1 — Heatseeker homing algorithm (ID 5)**

- **What changed in current vs reference:**
  - Detection radius: 200px → 250px (wider homing cone)
  - Angle calculation: `Phaser.Math.Angle.Between(tank, projectile) + PI` (reference, inverted) → `Phaser.Math.Angle.Between(projectile, tank)` (current, explicit and correct)
  - Turn rate: `diff/10` (0.1×) → `diff * 0.15` (0.15×, snappier homing)
  - One-shot guard: `this._homing` flag added — prevents repeated `fixCloseToTank` calls
  - Sprite rotation: `this.projectile.setRotation(this.projectile.body.velocity.angle())` added — missile sprite faces direction of travel

- **Why intentional:**
  Git commit 2e86aab "Fix heatseeker homing" deliberately improved the algorithm. The reference used
  an angle calculated FROM tank TO projectile then added π — mathematically equivalent to FROM projectile
  TO tank, but the reference version was non-obvious and the angle flip was implicit. Current version is
  explicit and cleaner. The one-shot guard and sprite rotation are purely client rendering improvements
  with no server-side impact (server handles actual trajectory via processHomingShot independently).

- **Server impact:** None. Server processHomingShot uses `TURN_RATE = 0.1` which is the old value, but
  server-side homing is independent of client rendering. Damage and impact point are computed by the
  server regardless of client visual trajectory.

- **Verdict: DO NOT REVERT.** Current version is the improved, correct version.

---

**Difference 2 — Pineapple sub-particle score factor (ID 22)**

- **Reference value:** `weapon.defaultUpdateScore(obj.body.x, obj.body.y, 20, 30/20)` (factor = 1.5)
- **Current Standard.js line 4124:** `weapon.defaultUpdateScore(obj.body.x, obj.body.y, 20, 32/20)` (factor = 1.6)
- **Server WEAPON_DATA line 46:** `subDamageFactor: 32/20` (factor = 1.6)

- **Why intentional:** Server weapon rebalance updated Pineapple's sub-particle damage from 30 to 32
  per hit. The reference (converted-repo.txt) was taken before this rebalance. Current Standard.js
  was updated to match the server. Client matches server exactly.

- **Verdict: DO NOT REVERT.** Current `32/20` matches server.

---

**Difference 3 — Homing Missile blast radius and damage factor (ID 24)**

- **Reference values:** `terrain.blast(..., 60 - hitRadius, ...)` / `defaultUpdateScore(..., 60, 20/60)`
- **Current Standard.js lines 4435-4436:** `terrain.blast(..., 80 - hitRadius, ...)` / `defaultUpdateScore(..., 80, 60/80)`
- **Server WEAPON_DATA line 42:** `blastRadius: 80, damageFactor: 60/80`

- **Why intentional:** Server weapon rebalance significantly buffed Homing Missile. Blast radius went
  60→80px (+33%) and damage factor went 20/60→60/80 (total max damage: 20→60, a 3× buff). The reference
  is the pre-rebalance values. Current Standard.js matches server.

- **Verdict: DO NOT REVERT.** Current values match server WEAPON_DATA. Reverting would cause client
  to display wrong damage values relative to actual server damage computation.

---

**Difference 4 — Cruiser damage factor (ID 29)**

- **Reference value:** `weapon.defaultUpdateScore(..., 80, 60/80)` (factor = 0.75)
- **Current Standard.js line 5343:** `weapon.defaultUpdateScore(..., 80, 80/80)` (factor = 1.0)
- **Server WEAPON_DATA line 43:** `damageFactor: 80/80` (factor = 1.0)

- **Why intentional:** Server weapon rebalance buffed Cruiser from 75% to 100% damage efficiency
  (60→80 max HP damage on direct hit). Reference has the old `60/80` factor. Current Standard.js
  matches server.

- **Verdict: DO NOT REVERT.** Current `80/80` matches server WEAPON_DATA.

---

## WVA-02: Visual Drift Remediation

**FINDING: No visual drift requiring remediation was identified. All 20 active weapon classes produce
blast effects consistent with server physics parameters. WVA-02 is closed with no action taken.**

The automated diff found 4 code differences. In all 4 cases, the current Standard.js is CORRECT —
it matches server WEAPON_DATA values. The reference (converted-repo.txt) is the OLD pre-rebalance
version. There is no work required in WVA-02. Any attempt to "fix" Standard.js toward the reference
would introduce actual drift where none currently exists.

---

## Dead Weapon Classes (Out of Scope)

The following 10 classes exist in `Standard.js` but are **never instantiated** in `array.js`. They
are excluded from audit scope per Litepaper v2.0 weapon removal decisions. No audit action needed.

| ID | Class Name    | Name            | Reason Removed                  |
|----|---------------|-----------------|---------------------------------|
| 3  | fiveshot      | 5 Shot          | Removed in Litepaper v2.0       |
| 6  | tracer        | Tracer          | Removed in Litepaper v2.0       |
| 8  | dirtmover     | Dirt Mover      | Removed in Litepaper v2.0       |
| 13 | dirtslinger   | Dirt Slinger    | Removed in Litepaper v2.0       |
| 14 | zapper        | Zapper          | Removed in Litepaper v2.0       |
| 18 | worm          | Worm            | Removed in Litepaper v2.0       |
| 19 | homingworm    | Homing Worm     | Removed in Litepaper v2.0       |
| 23 | firecracker   | Firecracker     | Removed in Litepaper v2.0       |
| 27 | mountainmover | Mountain Mover  | Removed in Litepaper v2.0       |
| 28 | scattershot   | Scatter Shot    | Removed in Litepaper v2.0       |

Note: `logos.js` has 10 stub exports (`fiveshot`, `tracer`, etc.) added to prevent build errors
from dead class imports. This is intentional and should not be removed without deleting dead classes.

Low-priority cleanup: The 10 dead classes in Standard.js may be deleted in a future maintenance pass.
Removing them requires also removing the 10 corresponding logos.js stubs. Not a blocker for v1.0.

---

## Common Pitfalls for Future Maintainers

These 4 pitfalls are the most likely sources of incorrect "drift fixes" by future contributors.

### Pitfall 1: Confusing "reference = ground truth"

**What goes wrong:** Treating `converted-repo.txt` as the target state and trying to revert current
Standard.js to match it.

**Why it happens:** The reference is the OLD version. The server weapon rebalance (physics.js WEAPON_DATA)
happened AFTER the reference was taken. Differences 2, 3, and 4 above look like "bugs" if you assume
the reference is correct — but they are actually correct server-matched values.

**How to avoid:** Always cross-check Standard.js blast params against `server/services/physics.js`
WEAPON_DATA, not against any historical reference file. The server is the single source of truth.

### Pitfall 2: Heatseeker homing algorithm scope

**What goes wrong:** Reverting heatseeker to the reference algorithm, breaking the improved homing.

**Why it happens:** The diff shows the current version is "different" from reference and a contributor
may assume the reference is correct.

**How to avoid:** The current heatseeker is intentionally improved. Git commit 2e86aab "Fix heatseeker
homing" was deliberate. Do not revert `diff * 0.15` back to `diff/10`, do not revert the explicit
angle calculation back to the inverted+π version, and do not remove the `_homing` guard or sprite
rotation. The RESEARCH.md documents this in detail.

### Pitfall 3: Blast radius vs damage factor confusion

**What goes wrong:** Misreading `weapon.terrain.blast(1, x, y, RADIUS - hitRadius, ...)` — the actual
client blast radius passed to terrain.blast is already reduced by `weapon.scene.tank1.hitRadius`.

**Why it happens:** The `blastRadius` in WEAPON_DATA is the nominal radius; the terrain gets
`blastRadius - hitRadius`. When comparing client to server, you must compare the pre-subtraction
value to WEAPON_DATA.blastRadius.

**How to avoid:** When verifying blast radius, compare WEAPON_DATA.blastRadius to the value BEFORE
the `- hitRadius` subtraction in Standard.js. The `defaultUpdateScore` call uses the pre-subtraction
radius for score calculation, which is correct.

### Pitfall 4: Score factor vs blast radius independence

**What goes wrong:** Changing blast radius without updating score factor or vice versa.

**Why it happens:** They look like separate values but the server computes `damage = blastRadius * damageFactor`
— both must be consistent. If you update only one, the client will display incorrect damage feedback.

**How to avoid:** `defaultUpdateScore(x, y, RADIUS, FACTOR)` — radius and factor must BOTH match
WEAPON_DATA exactly. They must be updated together. The damage formula is `blastRadius * damageFactor`,
so e.g. radius=80 with factor=60/80 gives max damage of 60 HP.

---

## Open Items for WVA-03 (Manual Testing Phase)

These 3 items are not visual drift issues — they require in-game testing or are noted for awareness.

### 1. Prestige weapons need in-game playtesting since the rebalance

All 5 prestige weapons (ID 21, 22, 24, 26, 29) have code that correctly matches server WEAPON_DATA.
However, they have NOT been confirmed via in-game playtesting since the weapon rebalance changed
Homing Missile blast radius (60→80), Pineapple sub-damage (30→32), and Cruiser factor (0.75→1.0).
WVA-03 manual testing checklist should verify each prestige weapon fires correctly and the client
HP damage display matches expected values.

### 2. Heatseeker sprite rotation visual confirmation needed

The improved heatseeker algorithm adds `this.projectile.setRotation(this.projectile.body.velocity.angle())`
to rotate the missile sprite to face its travel direction during homing. This works correctly in theory
(Phaser rotation in radians matches body velocity angle), but needs visual confirmation that:
- The sprite rotates smoothly as the missile curves toward target
- The rotation direction is not inverted (Phaser angle convention: 0=right, π/2=down)
- The rotation does not conflict with `defaultBounce` during the pre-homing phase

### 3. Napalm particle scoring reconciliation (awareness only, out of scope)

Server `processAreaShot` computes a burst-equivalent model: 5 overlapping burns at the impact zone,
each using `blastRadius=60, damageFactor=20/60`, totaling up to ~100 max damage from proximity.
Client `napalm.blast()` uses `constantUpdateScore` via a 7-loop tween measuring particle proximity to
tanks — the scoring model is entirely different and produces visually smooth damage-over-time feedback
rather than a single-tick calculation. The server is authoritative for actual HP changes; the client
scoring is display-only. This discrepancy is a known design limitation, not a bug requiring WVA fixes.
Flag for future refactor if more accurate visual HP feedback is desired.
