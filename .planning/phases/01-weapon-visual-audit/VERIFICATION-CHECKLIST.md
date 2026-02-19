# Phase 1: Weapon Visual Audit — WVA-03 Verification Checklist

**Date:** 2026-02-19
**Scope:** Manual in-game visual testing of all 20 active weapons
**How to use:** Start a Practice match. Fire each weapon. Check each item as confirmed.
**Mark each item:** `[x]` = confirmed good, `[!]` = issue found (describe below item)

---

## Setup Instructions

Open a Practice match (no wager, free fire). Use the in-game shop to purchase weapons — in Practice
mode gold is unlimited. Set angle and power freely to aim at terrain and at the opponent tank
(position AI or second player accordingly). Test each weapon by firing at terrain and directly at
the opponent tank. Have browser DevTools console open to watch for errors during all tests.

---

## Section 1: Base Weapons (15)

---

### [0] Single Shot (class: singleshot)
**Tier:** FREE | **Sound:** `expmedium2` on impact
**Behavior:** Standard arc — single projectile, single impact

**Fire & Projectile Launch**
- [ ] Small light-blue circle projectile (~2px radius) appears at barrel tip
- [ ] Single projectile launches with expected ballistic arc

**Projectile Flight**
- [ ] Projectile follows ballistic arc influenced by angle, power, and wind
- [ ] Arc is smooth and continuous — no jitter or teleporting

**Trail Effect**
- [ ] Blue/cyan trail renders during flight (light-blue, `r:100 g:200 b:250`)

**Impact & Blast**
- [ ] Projectile detonates at first terrain/tank contact point
- [ ] Blast color is pink transparent inner → solid hot pink outer (`rgba(255,51,153,0)` → `rgba(230,0,115,1)`)
- [ ] Blast radius carves terrain (nominal 46px before hitRadius reduction)
- [ ] Sound `expmedium2` plays on impact

---

### [1] Big Shot (class: bigshot)
**Tier:** RARE | **Sound:** `expmedium` on impact
**Behavior:** Standard arc — large blast radius, single impact

**Fire & Projectile Launch**
- [ ] Small purple/magenta circle projectile (~2px radius) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows ballistic arc influenced by angle, power, and wind
- [ ] Arc is smooth and noticeably similar to Single Shot in flight pattern

**Trail Effect**
- [ ] Purple/magenta trail renders during flight (`r:250 g:0 b:220`)

**Impact & Blast**
- [ ] Projectile detonates at first terrain/tank contact point
- [ ] Blast color is transparent red inner → solid red outer (`rgba(255,0,0,0)` → `rgba(255,0,0,1)`)
- [ ] Blast radius carves terrain (nominal 90px — visibly MUCH larger than Single Shot's 46px)
- [ ] Sound `expmedium` plays on impact
- [ ] Large crater visible after impact (biggest standard blast in the game)

---

### [2] 3 Shot (class: threeshot)
**Tier:** TACTICAL | **Sound:** `expmedium` on impact (per projectile)
**Behavior:** FAN SPREAD — 3 projectiles, separate arcs, 3 craters

**Fire & Projectile Launch**
- [ ] 3 distinct light-blue circle projectiles appear simultaneously at barrel tip
- [ ] All 3 projectiles launch at the same moment
- [ ] 3 projectiles visibly fan out from the barrel (not traveling as a single clump)
- [ ] Fan spread angle is ~±5° per side (±Math.PI/36 from center), visibly distinct separation

**Projectile Flight**
- [ ] Each of the 3 projectiles follows its own independent ballistic arc
- [ ] The outer two projectiles diverge from the center trajectory as they travel
- [ ] Wind affects all 3 arcs consistently (same wind direction, same magnitude)

**Trail Effect**
- [ ] Each projectile has its own blue/cyan trail (`r:100 g:200 b:250`)

**Impact & Blast**
- [ ] Each projectile detonates independently at its own terrain/tank contact point
- [ ] Blast color is black core → yellow outer (`rgba(0,0,0,0)` → `rgba(255,255,0,1)`) — yellow/black explosion
- [ ] Blast radius carves terrain (nominal 46px per projectile)
- [ ] 3 separate terrain craters visible after all projectiles land
- [ ] All 3 craters are at DIFFERENT horizontal positions on the terrain (fanned out, not stacked)
- [ ] Sound `expmedium` plays for each projectile impact (up to 3 sounds)

**Special Behavior**
- [ ] If 1 or 2 projectiles go out of bounds, remaining projectiles continue flying normally
- [ ] Turn ends only when all 3 projectiles have either impacted or gone out of bounds

---

### [4] Jackhammer (class: jackhammer)
**Tier:** EPIC | **Sound:** `expshort` on each drill impact
**Behavior:** SEQUENTIAL DRILL — shrinking projectile, 3 timed blasts at impact site

**Fire & Projectile Launch**
- [ ] Small rectangular blue/cyan projectile (~7px tall, wider than circle) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows ballistic arc (same physics as Single Shot)
- [ ] Projectile is visibly rectangular/square shape, not a circle

**Trail Effect**
- [ ] Blue/cyan trail renders during flight (`r:100 g:200 b:250`)

**Impact & Blast — SEQUENTIAL DRILL**
- [ ] Projectile hits terrain and first blast fires immediately
- [ ] After first blast, the projectile bounces upward and back down to same impact site
- [ ] Second blast fires at same x-position, digging slightly deeper
- [ ] Third blast fires at same x-position, digging deeper still (total: 3 blasts)
- [ ] Visible delay/stagger between each blast (fires on Phaser frames — not instant)
- [ ] Each successive blast is slightly smaller radius than the previous (46→38→30px progression visible)
- [ ] Blast color is pink inner → hot pink outer (`rgba(255,51,153,0)` → `rgba(230,0,115,1)`)
- [ ] A visible vertical shaft or stepped crater forms at impact site

**Special Behavior**
- [ ] `jumpCount` starts at 4, decreasing with each blast — 3 blasts before weapon ends
- [ ] Each jump resets the projectile velocity to upward before it falls again

---

### [5] Heatseeker (class: heatseeker)
**Tier:** TACTICAL | **Sound:** `expmedium` on impact
**Behavior:** HOMING — arc then curve toward enemy tank

> PRIORITY CHECK: This weapon was intentionally rewritten (detection 200→250px, turn rate 0.1→0.15,
> sprite rotation added, one-shot homing guard added). Confirm all new behaviors work correctly.

**Fire & Projectile Launch**
- [ ] Missile-shaped sprite appears at barrel tip (white body with red fins — drawn with canvas paths)
- [ ] Single projectile launches with ballistic arc

**Projectile Flight — HOMING**
- [ ] Projectile initially follows normal ballistic arc (no homing visible at long range)
- [ ] When within ~250px of opponent tank, projectile visibly curves toward enemy tank
- [ ] Homing transition is smooth — arc gradually bends toward target (not instant teleport)
- [ ] Turn rate 0.15 feels responsive and snappy (was 0.1 pre-rewrite — if it feels sluggish, flag it)
- [ ] **SPRITE ROTATION CHECK:** Projectile sprite rotates to face direction of travel throughout entire flight
  - During arc phase: sprite points in direction of velocity
  - During homing phase: sprite continuously updates rotation to face toward tank
- [ ] `_homing` guard fires only ONCE per projectile (no jitter from repeated `fixCloseToTank` calls)
- [ ] When homing activates, exhaust particles emit sideways from the missile sprite

**Trail Effect**
- [ ] No standard trail during non-homing phase
- [ ] During homing phase: small white exhaust particles emit perpendicular to velocity direction

**Impact & Blast**
- [ ] Projectile detonates at terrain or tank contact point
- [ ] Blast color is black core → dark red mid → bright red outer (`rgba(0,0,0,0)` → `rgba(120,0,0,1)` → `rgba(230,0,0,1)`)
- [ ] Blast radius carves terrain (nominal 80px — large blast)
- [ ] Sound `expmedium` plays on impact

**Special Behavior**
- [ ] If enemy tank is out of 250px range throughout flight, projectile follows normal arc to terrain
- [ ] If projectile passes near tank but misses, it detonates on terrain (does not loop back)

---

### [7] Pile Driver (class: piledriver)
**Tier:** RARE | **Sound:** `expshort` on each drill hit
**Behavior:** SEQUENTIAL DRILL — 6 sequential blasts, drilling a vertical shaft

**Fire & Projectile Launch**
- [ ] Small magenta/pink circle projectile (~2px) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Magenta/pink trail renders during flight (`r:240 g:0 b:220`)

**Trail Effect**
- [ ] Magenta/pink trail visible during flight

**Impact & Blast — SEQUENTIAL DRILL (6 hits)**
- [ ] Projectile hits terrain and is immediately destroyed (impact occurs, sprite gone)
- [ ] First blast fires at impact point (radius ~46px)
- [ ] 6 sequential blasts follow in rapid succession (every 5 game frames, so roughly every 83ms)
- [ ] Each successive blast fires at same x-position but progressively deeper y-position
- [ ] Blast depths follow staggered pattern: -14, +10, +30, +46, +58, +66 pixels from impact y
- [ ] Each successive blast has a SMALLER radius: 46, 38, 30, 22, 14, 6px — visibly narrowing shaft
- [ ] A visible vertical shaft / tunnel forms in the terrain from the 6 sequential blasts
- [ ] Blast color is black core → magenta/pink → light pink outer (`rgba(0,0,0,0)` → `rgba(250,0,250,1)` → `rgba(250,200,250,1)`)
- [ ] Sound `expshort` plays for each individual drill hit (up to 6 sounds)
- [ ] All 6 impacts are visually distinct and produce separate terrain craters at different depths

---

### [9] Crazy Ivan (class: crazyivan)
**Tier:** LEGENDARY | **Sound:** `expshort` on each scatter impact
**Behavior:** PROXIMITY SCATTER — erratic flight, splits into scatter particles near tank

**Fire & Projectile Launch**
- [ ] Small purple/blue-tinted circle (~2px, `rgba(120,100,255,1)`) appears at barrel tip
- [ ] Single projectile launches with ballistic arc (initial phase)

**Projectile Flight — ERRATIC SCATTER**
- [ ] Projectile initially follows a normal ballistic arc toward target
- [ ] When within ~160px of opponent tank, projectile dissipates into multiple scatter particles
- [ ] The scatter particles self-propel in different directions (not following a single arc)
- [ ] `split` sound plays when dissociation occurs
- [ ] Each scatter particle has erratic motion: velocity angle updates based on frame-dependent formula
- [ ] Flight path of particles is visibly unpredictable (not smooth arcs)

**Trail Effect**
- [ ] Purple trail on main projectile during initial flight (`r:120 g:100 b:255`)
- [ ] Light purple/lavender trails on scatter particles after split (`r:220 g:200 b:255`)

**Impact & Blast — SCATTER EXPLOSIONS**
- [ ] Each scatter particle detonates individually on terrain contact
- [ ] Blast color is black/transparent → yellow-green mid → bright yellow outer (`rgba(0,0,0,0)` → `rgba(120,120,0,1)` → `rgba(255,255,0,1)`)
- [ ] Blast radius per scatter particle: 36px (nominal)
- [ ] Sound `expshort` plays for each scatter particle impact
- [ ] Multiple distinct terrain craters appear scattered around the impact area
- [ ] Sub-explosions appear at different positions (not all stacked at one point)

**Special Behavior**
- [ ] Main projectile blast (if it hits terrain before reaching tank range): single large blast, 80px radius, then no particles
- [ ] If dissociation occurs near tank: particles fan out in a ~180° arc centered on the approach direction

---

### [10] Spider (class: spider)
**Tier:** TACTICAL | **Sound:** `split` on proximity trigger; `expmedium` / `expshort` on impact
**Behavior:** PROXIMITY LINE WEB — projectile splits near tank, produces line segment particles

**Fire & Projectile Launch**
- [ ] Small light-gray circle (~2.5px, `rgba(200,200,200,1)`) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Light-gray trail renders during flight (`r:200 g:200 b:200`)
- [ ] When within ~160px of opponent tank AND moving toward it, projectile dissipates into line segments
- [ ] `split` sound plays when dissociation occurs

**Trail Effect**
- [ ] Light-gray trail visible during initial arc phase

**Impact & Blast — LINE WEB**
- [ ] On proximity trigger: main projectile destroyed, replaced by line segment particles
- [ ] Line segments radiate outward from dissociation point in angular increments (π/40 radians apart)
- [ ] Segments appear in 3 waves at frames 5, 15, 25 (staggered deployment visible)
- [ ] Line segments grow longer over time (tween scales from 0.01 to full length)
- [ ] Line segment colors: either gray (`rgba(100,100,100,0)` → solid) or white-gray (`rgba(220,220,220,0)` → solid)
- [ ] Line segments travel outward from impact point, covering a circular arc pattern (~90°)
- [ ] Each line segment that hits terrain produces a small blast (28px radius, brownish-orange color)
- [ ] Web pattern is visually recognizable as radiating spokes, not random scatter
- [ ] If projectile hits terrain before reaching proximity range: single large blast (80px, brownish-orange)

---

### [11] Sniper Rifle (class: sniperrifle)
**Tier:** RARE | **Sound:** `sniper` on impact
**Behavior:** Standard arc — 1px pinpoint blast, 100 damage on direct hit

**Fire & Projectile Launch**
- [ ] Tiny white/gray circle (~1px, `rgba(220,220,220,1)`) appears at barrel tip
- [ ] Single very small projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc (same physics)
- [ ] Projectile is noticeably smaller than Single Shot (1px vs 2px radius)

**Trail Effect**
- [ ] White/gray trail renders during flight (`r:220 g:220 b:220`)

**Impact & Blast**
- [ ] Projectile detonates at terrain/tank contact point
- [ ] Blast color is transparent → white-gray outer (`rgba(0,0,0,0)` → `rgba(220,220,220,1)`)
- [ ] Blast radius is 1px — essentially pinpoint, no terrain crater visible
- [ ] Sound `sniper` plays on impact (distinct from standard explosion sounds)
- [ ] Direct tank hit scores 100 damage (visible HP bar reduction)
- [ ] Terrain miss produces no visible terrain carving (radius 1 is negligible)

**Special Behavior**
- [ ] Miss = zero terrain damage (by design — only direct hits count)
- [ ] Self-hit scores -100 (negative damage — penalizes hitting own tank)

---

### [12] Magic Wall (class: magicwall)
**Tier:** STANDARD | **Sound:** `magicwall` on impact
**Behavior:** TERRAIN BUILD — adds terrain instead of destroying it

**Fire & Projectile Launch**
- [ ] Small brown/earth-tone circle (~2px, `rgba(150,100,50,1)`) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Brown/earth-tone trail renders during flight (`r:150 g:100 b:50`)

**Trail Effect**
- [ ] Brown/earth trail visible during flight

**Impact & Blast — TERRAIN BUILD**
- [ ] On terrain contact: projectile does NOT explode — it deposits terrain material
- [ ] A vertical wall structure grows upward from the impact point over ~3 seconds
- [ ] Wall dimensions: ~8px wide, up to 140px tall
- [ ] Wall gradient: green top (`rgba(120,190,0,1)`) fading to brown base (`rgba(120,50,20,1)`)
- [ ] Small blue particles (`0x0099ff`) emit upward from wall top as it grows
- [ ] Sound `magicwall` plays during construction (low-pitched, sustained)
- [ ] Wall is SOLID — other projectiles can detonate against the wall surface
- [ ] Wall raises terrain height at impact x-position (visible as new elevated terrain column)
- [ ] Does NOT damage tanks on contact

---

### [15] Napalm (class: napalm)
**Tier:** RARE | **Sound:** `napalm` on impact
**Behavior:** PARTICLE SPREAD — 20 fire particles spread from impact, area burn

**Fire & Projectile Launch**
- [ ] Small blue circle (~2px, `rgba(0,120,250,1)`) appears at barrel tip
- [ ] Single projectile launches with ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] **Proximity trigger:** When within 20px of terrain surface, Napalm pre-detonates (does NOT wait for direct impact)
- [ ] Blue trail renders during flight (`r:0 g:120 b:250`)

**Trail Effect**
- [ ] Blue/electric trail visible during flight (distinct blue, not cyan)

**Impact & Blast — PARTICLE SPREAD**
- [ ] On terrain proximity or contact: 20 fire particles spread outward from impact point
- [ ] Particles fan out at 360° around impact (evenly spaced, `2π * i/20` angle increments)
- [ ] Particle color: golden-orange (`rgba(250,180,50,0.5)`) — fire appearance
- [ ] Particles follow physics arcs after spreading (affected by gravity)
- [ ] Particles linger for an extended time (7 loop cycles of ~35 frames each)
- [ ] Smoke emitters attach to particles after a brief delay — smoke rises from fire particles
- [ ] Multiple terrain damage events as particles settle on terrain
- [ ] Area of particle spread is substantial (covers terrain horizontally around impact)
- [ ] Sound `napalm` plays on trigger

**Special Behavior**
- [ ] Score updates continuously while particles are within tank hit radius (proximity damage over time)
- [ ] Does NOT produce a classic circular explosion crater — damage is from particle coverage

---

### [16] Hail Storm (class: hailstorm)
**Tier:** EPIC | **Sound:** `aquabomb_splash` on initial impact; `hailstorm` ambient during rain
**Behavior:** AREA RAIN — initial projectile triggers 20 cyan balls that rain down

**Fire & Projectile Launch**
- [ ] Small cyan circle (~2px, `rgba(100,255,255,1)`) appears at barrel tip
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc with cyan trail (`r:100 g:255 b:255`)

**Trail Effect**
- [ ] Cyan/aqua trail visible during initial arc flight

**Impact & Blast — AREA RAIN**
- [ ] Initial projectile hits terrain and triggers `aquabomb_splash` sound
- [ ] Main projectile is destroyed at impact point
- [ ] 20 cyan ball-shaped sub-projectiles spawn from impact point at intervals (1 every 6 frames)
- [ ] Balls are cyan radial gradient (`rgba(0,220,255,1)` center → transparent outer, 5px radius each)
- [ ] Balls rain down from impact height, affected by gravity
- [ ] Balls bounce off terrain surfaces (terrain slope affects bounce direction)
- [ ] Each ball has a lifetime timer — they fade and disappear over time
- [ ] Sound `hailstorm` plays as ambient while balls are active
- [ ] Multiple terrain impacts from individual balls as they bounce and settle
- [ ] Score updates continuously while balls are within tank collision bounds

**Special Behavior**
- [ ] Balls can bounce multiple times before expiring (not just one impact each)
- [ ] Rain area extends outward from initial impact point depending on terrain slope

---

### [17] Ground Hog (class: groundhog)
**Tier:** EPIC | **Sound:** `expmedium` on exit blast
**Behavior:** TERRAIN TUNNEL — enters terrain on impact, tunnels through, exits and detonates

**Fire & Projectile Launch**
- [ ] Small multi-dot sprite appears at barrel (purple center + two white side dots — drill bit appearance)
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Purple/lavender trail renders during arc phase (`r:150 g:100 b:255`)
- [ ] On terrain contact: projectile enters terrain (does NOT detonate on surface contact)

**Trail Effect**
- [ ] Purple/lavender trail visible during arc phase only
- [ ] When inside terrain: sprite canvas is cleared (projectile becomes invisible while tunneling)

**Impact & Blast — TERRAIN TUNNEL**
- [ ] On terrain contact: sprite disappears (canvas cleared) but projectile continues moving
- [ ] Gravity is removed (`setGravityY(0)`) — projectile travels in a straight line through terrain
- [ ] Terrain is dug as projectile passes through (`defaultDigTerrain` — 3px radius, 0.2 alpha removal)
- [ ] A subtle dig trail is visible in terrain as projectile passes through (faint tunnel)
- [ ] When projectile re-emerges from terrain on the other side: DETONATION occurs at exit point
- [ ] Blast appears on the far side of the terrain (not at entry point)
- [ ] Blast color is transparent inner → magenta-red mid → pink-red outer (`rgba(0,0,0,0)` → `rgba(150,0,80,1)` → `rgba(255,0,100,1)`)
- [ ] Blast radius at exit: 70px nominal — large explosion
- [ ] Sound `expmedium` plays at exit blast
- [ ] If projectile reaches base/bottom of map while inside terrain: detonates at bottom

**Special Behavior**
- [ ] Strategy: fire from behind hill to have projectile emerge on far side
- [ ] Projectile visible at entry briefly (1 frame), then invisible during tunneling

---

### [20] Skipper (class: skipper)
**Tier:** TACTICAL | **Sound:** `skipperbounce` on each bounce; `expshort` on final detonation
**Behavior:** BOUNCE TRAIL — bounces along terrain surface, small impacts at bounces, final detonation

**Fire & Projectile Launch**
- [ ] Small light-blue circle (~2px, `rgba(150,220,255,1)`) appears at barrel tip
- [ ] Single projectile launches with relatively low-angle arc (best fired at shallow angle)

**Projectile Flight — BOUNCE TRAIL**
- [ ] Projectile follows ballistic arc toward terrain
- [ ] On first terrain contact: projectile BOUNCES (does NOT detonate)
- [ ] Sound `skipperbounce` plays at each bounce
- [ ] After each bounce, projectile continues forward with modified trajectory (lower arc)
- [ ] Multiple bounces visible (up to 4 bounces before final detonation)
- [ ] Projectile travels significant horizontal distance along terrain surface between bounces
- [ ] Bounces feel physically plausible (angle of incidence affects bounce direction)

**Trail Effect**
- [ ] Blue/cyan trail renders throughout flight (`r:100 g:200 b:250`)
- [ ] Trail visible during arc phases between bounces

**Impact & Blast — BOUNCE TRAIL**
- [ ] Each of the 4 bounce points: projectile bounces using `skipperBounce()` — terrain mark but no blast
- [ ] After 4th bounce (or if bounce fails): final detonation occurs at that position
- [ ] Final blast color: transparent inner → dark yellow mid → bright yellow outer (`rgba(0,0,0,0)` → `rgba(50,50,0,1)` → `rgba(240,240,20,1)`)
- [ ] Final blast radius: 52px nominal
- [ ] Sound `expshort` plays at final detonation
- [ ] Multiple distinct terrain marks/craters visible along the bounce path
- [ ] Overall bounce trail covers significant horizontal distance (not just one point)

**Special Behavior**
- [ ] If Skipper lands on Magic Wall bounce surface (special terrain marker pixel `rgba(230,0,230,1)`): uses `onBounceHit` instead of skipperBounce — effectively a special surface bounce
- [ ] Low-angle firing (near horizontal) produces best horizontal coverage

---

### [25] Dirt Ball (class: dirtball)
**Tier:** STANDARD | **Sound:** `rocks_1` through `rocks_6` (cycling) during impact
**Behavior:** TERRAIN DEPOSIT — adds terrain material in a circular mound pattern

**Fire & Projectile Launch**
- [ ] Small beige/sand circle (~2px, `rgba(250,220,180,1)`) appears at barrel tip
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Beige/sand trail renders during flight (`r:250 g:220 b:180`)

**Trail Effect**
- [ ] Beige/sand/earth-tone trail visible during flight

**Impact & Blast — TERRAIN DEPOSIT**
- [ ] On terrain contact: projectile does NOT explode — it deposits terrain material
- [ ] Terrain material spreads outward in a growing circle from impact point (radius grows to 70px over 90 frames)
- [ ] Deposited material color: `rgba(180,100,50,110+)` — brown/dirt tone
- [ ] The deposit animation is gradual — watch material grow outward (not instant)
- [ ] Rock sliding sounds play during deposit (`rocks_1` through `rocks_6` cycling)
- [ ] After deposit: terrain pixels settle downward via `startFixTerrainTween` (gravity-like collapse)
- [ ] Final result: a raised dirt mound at impact point (terrain above existing surface level)
- [ ] Does NOT damage tanks (no blast, no score update)

**Special Behavior**
- [ ] The mound settles after initial placement — watch for terrain pixels falling to fill gaps
- [ ] The deposit uses `destination-over` compositing — only fills empty (transparent) areas

---

## Section 2: Prestige Weapons (5)

> **IMPORTANT:** These 5 weapons had blast parameters updated in the server weapon rebalance.
> This is the first in-game visual verification since those changes. Pay close attention
> to blast size and effect — compare to the expected values below which now match the server.
> Flag any blast that seems unusually small or large compared to expectations.

---

### [21] Chain Reaction (class: chainreaction)
**Tier:** Platinum Prestige | **Sound:** `expshort` on each carpet explosion
**Behavior:** CARPET CHAIN — single projectile triggers 15 sequential offset explosions

**Fire & Projectile Launch**
- [ ] Tiny white circle (~0.5px, barely visible) projectile appears at barrel
- [ ] Two particle emitters follow the projectile during flight: slow trailing particles + pulsing glow
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] Particle emitters visible during flight: trailing white particles (alpha 0.4→0.1) + expanding glow rings
- [ ] The two-layered trail effect distinguishes this from Single Shot in flight appearance

**Trail Effect**
- [ ] White particle trail with two layers (slow dispersing + pulsing expanding rings)

**Impact & Blast — CARPET CHAIN (15 explosions)**
- [ ] On terrain/tank contact: FIRST explosion fires at impact point immediately
- [ ] 14 subsequent explosions fire at staggered timing (200ms delay each = ~2.8 seconds total for chain)
- [ ] Each explosion fires at an OFFSET position from the original impact point using predefined array:
  `[{-2,-4}, {20,16}, {-42,-12}, {30,16}, {-52,10}, {-50,6}, {12,-20}, {32,-16}, {18,34},
  {-40,-12}, {-2,36}, {54,20}, {-24,-14}, {20,-10}, {46,26}]`
- [ ] Explosions visibly scatter around the impact area (offsets range from -52 to +54px in x, -20 to +36px in y)
- [ ] Each explosion produces its own distinct red blast
- [ ] Blast color: transparent inner → dark red ramp → bright red outer (`rgba(0,0,0,0)` → `rgba(100,0,0,1)` → `rgba(255,0,0,1)`)
- [ ] Blast radius per explosion: 46px nominal
- [ ] Each explosion carves its own terrain crater
- [ ] Sound `expshort` plays for each of the 15 explosions
- [ ] Visible timing stagger: explosions don't all appear at once — 15 distinct blasts over ~2.8s
- [ ] Total area of effect covers a wide spread around initial impact (pattern spans ~100px in each direction)
- [ ] Overall pattern feels like a chain reaction spreading around the impact zone

---

### [22] Pineapple (class: pineapple)
**Tier:** Diamond Prestige | **Sound:** `expmedium` on primary; `expshort` on sub-fragments
**Behavior:** PROXIMITY SPLIT — main projectile splits into 20 sub-fragments near tank

> **REBALANCE NOTE (post-rebalance test):** Sub-particle damageFactor updated from `30/20` to `32/20`
> (matches server WEAPON_DATA). Fragment damage should feel slightly higher than before the rebalance.

**Fire & Projectile Launch**
- [ ] Main projectile: larger sphere with radial gradient (white center → gray → black edge, ~4px radius)
- [ ] More substantial-looking than standard small-circle projectiles
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight — PROXIMITY SPLIT**
- [ ] Projectile follows standard ballistic arc (no trail during non-split phase)
- [ ] When within ~200px of opponent tank: `split` sound plays and projectile dissociates
- [ ] Main projectile is destroyed at split point

**Trail Effect**
- [ ] No trail during main projectile arc phase
- [ ] After split: each green sub-fragment has its own green trail (`r:0 g:230 b:80`)

**Impact & Blast — PROXIMITY SPLIT (20 fragments)**
- [ ] On proximity trigger: main projectile destroyed, 20 sub-projectiles fan outward in all directions
- [ ] Sub-projectiles are small green circles (`rgba(0,230,80,1)`)
- [ ] Sub-projectiles spread at equal angular intervals (360° / 20 = 18° apart) from split point
- [ ] Each sub-projectile follows its own ballistic arc outward from split point
- [ ] Each sub-projectile impacts terrain/tank independently
- [ ] Primary blast (if projectile hits terrain directly without splitting): 80px radius, yellow-black gradient
- [ ] Sub-fragment blast: 20px radius each, yellow-black gradient (`rgba(0,0,0,0)` → `rgba(100,100,0,1)` → `rgba(240,240,0,1)`)
- [ ] Multiple distinct terrain craters appear around the split point
- [ ] All sub-fragments spread visibly in different directions (not all going same way)
- [ ] Sound `expmedium` on primary impact; `expshort` for each sub-fragment impact
- [ ] Rebalance: Fragment damage slightly increased (32/20 factor vs old 30/20) — may be subtle visually

---

### [24] Homing Missile (class: homingmissile)
**Tier:** Bronze Prestige | **Sound:** `homing` on turn activation; `expmedium` on impact
**Behavior:** HOMING (vertical drop) — arcs then drops vertically onto tank when directly above

> **REBALANCE NOTE (post-rebalance test):** Blast radius increased from 60→80px, damageFactor updated
> from `20/60` to `60/80`. Blast should be NOTICEABLY larger than pre-rebalance. If it looks the same
> size as before, this is a regression.

**Fire & Projectile Launch**
- [ ] Same missile sprite as Heatseeker (white body with red fins)
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight — VERTICAL DROP HOMING**
- [ ] Projectile follows standard ballistic arc initially
- [ ] Homing behavior is DIFFERENT from Heatseeker: not a curve, but a vertical drop
- [ ] When within 400px of tank AND directly above (within 10px x-distance): `canTurn` fires ONCE
- [ ] `homing` sound plays when vertical drop activates
- [ ] Projectile velocity snaps to straight down (angle set to Math.PI/2 = downward)
- [ ] Missile drops vertically onto tank position from above — very different from Heatseeker's curve
- [ ] `canTurn` guard ensures this fires only once (no repeated snapping)

**Trail Effect**
- [ ] No specific trail (no `updateTail` call in this class)

**Impact & Blast**
- [ ] Blast color: transparent inner → dark navy → purple mid → light purple → near-white outer
  (`rgba(0,0,0,0)` → `rgba(20,0,100,0.8)` → `rgba(50,20,150,1)` → `rgba(100,80,180,1)` → `rgba(200,200,255,1)`)
- [ ] Blast radius: 80px nominal — LARGER than Heatseeker's 80px (same size, but compare to Single Shot 46px)
- [ ] Blast should appear as a large purple/blue-tinted explosion — visually distinct from other weapons
- [ ] Sound `expmedium` plays on impact
- [ ] Blast feels high-damage (60/80 factor)

**Special Behavior**
- [ ] If missile never gets within 400px of tank or never gets directly above it: follows normal arc to terrain
- [ ] Vertical drop makes this effective for tanks hiding behind terrain walls (drops over the wall)

---

### [26] Tommy Gun (class: tommygun)
**Tier:** Gold Prestige | **Sound:** `rungun` for each shot; `expshort2` on each impact
**Behavior:** RAPID-FIRE SEQUENCE — 12 projectiles fired in rapid succession with spread

**Fire & Projectile Launch**
- [ ] 12 individual small blue-white circle projectiles (`rgba(200,220,255,1)`)
- [ ] Projectiles fire one at a time, 100ms apart (total fire sequence: ~1.2 seconds)
- [ ] Sound `rungun` plays for each individual shot — machine gun sound effect
- [ ] Each shot has a slightly different velocity offset and angle offset (vOffset + aOffset arrays)

**Projectile Flight — RAPID-FIRE**
- [ ] Each of 12 projectiles follows its own independent ballistic arc
- [ ] Arcs differ slightly due to velocity and angle offsets: `aOffset = [0,-3,4,6,-1,0,2,5,-3.5,4.5,-1.5,2]`
- [ ] Projectiles fan out visibly — not all going to same point
- [ ] Wind affects all arcs consistently

**Trail Effect**
- [ ] Each projectile has its own blue-white trail (`r:180 g:200 b:255`)

**Impact & Blast — RAPID-FIRE (12 impacts)**
- [ ] Each of the 12 projectiles detonates independently on terrain/tank contact
- [ ] Blast color: transparent inner → blue → bright blue → near-white outer (`rgba(0,0,0,0)` → `rgba(50,50,150,1)` → `rgba(50,50,255,1)` → `rgba(230,240,255,1)`)
- [ ] Blast radius per projectile: 16px nominal — small individual explosions
- [ ] Sound `expshort2` plays on each impact
- [ ] Multiple small blue craters appear at different positions across impact area
- [ ] At least several distinct terrain craters visible (not all projectiles land at same point)
- [ ] Rapid-fire spread pattern feels like a machine gun burst across the target area

**Special Behavior**
- [ ] Turn ends only when ALL 12 projectiles have impacted or gone out of bounds (`allShot` flag + `particles.length === 0`)
- [ ] Machine gun burst timing: 12 shots at 100ms intervals = barrel continues firing for ~1.2s after first shot

---

### [29] Cruiser (class: cruiser)
**Tier:** Silver Prestige | **Sound:** `expshort` on final blast; `split` when rolling starts
**Behavior:** ROLL THEN BLAST — lands on terrain, rolls along surface, then detonates after ~2s

> **REBALANCE NOTE (post-rebalance test):** damageFactor increased from `60/80` to `80/80`
> (full damage — no reduction). Blast damage should feel maximum for this blast radius.
> Compare to Homing Missile (80px, 60/80) — Cruiser at 80/80 should feel tankier/harder-hitting.

**Fire & Projectile Launch**
- [ ] Small white circle (~2px, `rgba(240,240,240,1)`) appears at barrel tip
- [ ] Single projectile launches with standard ballistic arc

**Projectile Flight**
- [ ] Projectile follows standard ballistic arc
- [ ] White trail renders during flight (`r:240 g:240 b:240`)

**Trail Effect**
- [ ] White trail visible during arc phase

**Impact & Blast — ROLL THEN BLAST**
- [ ] On terrain contact: if landing on open terrain (not inside terrain): projectile STOPS in place and begins rolling
- [ ] Sound `split` plays when rolling begins
- [ ] Projectile rolls along terrain surface in direction of original flight (left or right based on velocity.x)
- [ ] Rolling texture: two white circles on the sprite (wheel-like appearance) — sprite rotates as it rolls
- [ ] Spark/dust trail: small white circles (`0xeeeeee, 0.2 alpha`) appear briefly at rolling position
- [ ] Rolling continues for ~120 frames (~2 seconds at 60fps)
- [ ] After ~2 seconds of rolling: FINAL DETONATION occurs at current rolling position
- [ ] Final blast color: transparent inner → dark red-pink ramp → bright pink-red outer (`rgba(0,0,0,0)` → `rgba(100,0,40,1)` → `rgba(255,0,100,1)`)
- [ ] Final blast radius: 80px nominal — large explosion
- [ ] Sound `expshort` plays on final blast
- [ ] Terrain crater from final blast is large (80px nominal)
- [ ] Rebalance: Full damage (80/80 factor, no reduction) — highest damage-per-hit of the silver prestige tier

**Special Behavior**
- [ ] If landing directly on tank: does NOT roll — detonates immediately at tank position
- [ ] If landing inside terrain (bounced into solid area): detonates immediately (no roll)
- [ ] During rolling: checks every frame for tank collision within hitRadius — detonates on contact

---

## Section 3: Cross-Cutting Checks

---

### Projectile Flight Integrity
- [ ] All homing weapons (Heatseeker, Homing Missile) visibly change direction toward enemy tank
- [ ] Heatseeker curves gradually toward tank (smooth turn)
- [ ] Homing Missile drops vertically when above tank (snaps to downward velocity)
- [ ] Skipper bounces along terrain (does NOT detonate on first terrain contact)
- [ ] Ground Hog enters terrain on contact and tunnels through (does NOT explode on surface)
- [ ] Crazy Ivan scatter particles travel erratically (visibly different from smooth arcs)
- [ ] 3 Shot projectiles visibly fan out from barrel (not traveling as a single clump)
- [ ] Tommy Gun fires in rapid succession with audible 100ms timing between shots (`rungun` sound)
- [ ] Wind affects all non-homing ballistic arcs consistently
- [ ] Pineapple sub-fragments spread in all directions from split point (360° coverage)
- [ ] Chain Reaction explosions continue firing for ~2.8 seconds after initial impact (15 × 200ms)

---

### Multi-Impact Verification
- [ ] Every multi-impact weapon produces SEPARATE, DISTINCT impacts at different positions:
  - Jackhammer (3 blasts — same x, different depths)
  - Pile Driver (6 blasts — same x, progressively deeper)
  - Hail Storm (20 balls — scattered across area)
  - Spider (web segments — radiating outward)
  - Napalm (20 particles — 360° spread)
  - Chain Reaction (15 explosions — scattered offset pattern)
  - Pineapple (20 fragments — 360° fan from split)
  - Tommy Gun (12 shots — slight angle spread)
  - Crazy Ivan (scatter particles — erratic positions)
  - Skipper (4 bounces + final — horizontal trail)
  - 3 Shot (3 projectiles — fan at different x positions)
- [ ] Multi-impact weapons carve MULTIPLE terrain craters (not a single merged crater)
- [ ] Sequential impacts (Jackhammer, Pile Driver, Chain Reaction) have visible timing between hits — they do NOT all appear simultaneously

---

### Audio
- [ ] No weapon plays the wrong sound effect on impact
- [ ] No weapon is completely silent when it should have a sound
- [ ] No weapon produces a JavaScript console error on fire or impact
- [ ] Sniper Rifle plays distinctive `sniper` sound (not the standard `expmedium`/`expshort`)
- [ ] Magic Wall plays distinctive `magicwall` sound (not an explosion sound)
- [ ] Tommy Gun plays `rungun` sound for each shot (12 individual clicks audible during fire sequence)
- [ ] Homing Missile plays `homing` sound when vertical drop activates

---

### Tank Interaction
- [ ] Direct hit on opponent tank registers HP damage (HP bar visibly updates)
- [ ] Sniper Rifle direct hit registers exactly 100 HP damage (or close to it)
- [ ] Near-miss within blast radius of large weapons (Homing Missile 80px, Big Shot 90px, Chain Reaction 46px, Heatseeker 80px) registers splash damage when within radius
- [ ] Multi-impact weapons that land near a tank register damage for each sub-impact within range
- [ ] Magic Wall and Dirt Ball do NOT damage tanks (terrain-only effects)
- [ ] Napalm and Hail Storm register damage over time while particles/balls overlap with tank hitbox

---

### Terrain Carving
- [ ] Standard blast weapons carve a circular crater matching expected relative radius
- [ ] Big Shot crater is visibly much larger than Single Shot crater (90px vs 46px)
- [ ] Homing Missile crater is visibly larger than pre-rebalance expectation (was 60px, now 80px)
- [ ] Terrain-modifying weapons produce correct non-explosive effects:
  - Magic Wall: raises vertical column upward
  - Dirt Ball: deposits horizontal mound of dirt
  - Ground Hog: subtle dig trail through terrain + exit crater
  - Pile Driver: vertical shaft of sequentially-deepening craters
- [ ] No weapon leaves "ghost" terrain pixels or visual artifacts at blast site
- [ ] Skipper bounce trail leaves small marks/indentations at each bounce point along terrain

---

### Console Health
- [ ] Browser DevTools console shows no errors during any weapon fire or blast
- [ ] No "Cannot read property of undefined" or null reference errors
- [ ] No "TypeError" errors during multi-impact staggered explosions (Chain Reaction, Crazy Ivan)
- [ ] No texture-related errors ("texture key already exists") from any weapon
- [ ] No audio-related errors from sound playback
- [ ] No performance warnings (frame rate stays acceptable during multi-impact sequences)

---

## Issue Log

| Weapon | Item | Issue Description |
|--------|------|-------------------|
|        |      |                   |
|        |      |                   |
|        |      |                   |
|        |      |                   |
|        |      |                   |

---

## Sign-off

```
Tester: _______________  Date: _______________

Base Weapons (15): [ ] All passed  [ ] Issues found (see log)
Prestige Weapons (5): [ ] All passed  [ ] Issues found (see log)
Cross-Cutting: [ ] All passed  [ ] Issues found (see log)

WVA-03 Status: [ ] PASSED  [ ] FAILED (issues in log)

Notes:
_______________________________________________________________
_______________________________________________________________
```
