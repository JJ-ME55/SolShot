# Weapon Visual Identity Overhaul — Design Document

**Date:** 2026-02-19
**Status:** Approved
**Author:** John + Claude (brainstorm)

## Problem

15 of 20 weapons fire a ~2px circle on a standard arc with a thin colored gradient trail. The only visual difference is trail color. Players cannot distinguish weapons during flight, prestige unlocks don't feel special, and there's nothing screen-recordable for promo content.

Heatseeker and Skipper are the exceptions — both have unique flight behavior that makes them visually exciting. Every weapon needs this level of intentional visual design.

## Design Principle

> "If when I shoot it, the visual process of the projectile leaving and landing is EXACTLY the same as Single Shot, we've missed a trick."

Every weapon must be visually distinguishable during ALL phases:
1. **Launch** — muzzle effect, initial appearance
2. **Flight** — projectile shape, size, trail character, flight animation
3. **Impact** — explosion, terrain effect, aftermath

## Implementation Approach

**Option A + surgical particle additions:**
- Enhance existing `updateTail()` system in Weapon.js
- Add new helper methods: `spawnParticle(x, y, color, size, lifetime, velocity)`
- Modify each weapon's `create()` for larger/shaped canvases
- Modify each weapon's `update()` for richer trail rendering
- Add lightweight particle utility (~50 lines) to Weapon.js base class for lingering effects

**NOT building:** Full particle engine. We add a simple `spawnParticle()` utility for the 5-6 weapons that need lingering/burst effects.

## Reference Games

- **Pocket Tanks** (direct inspiration): Behavior IS the visual. 385+ weapons differentiated by flight behavior, not sprite art.
- **Worms Armageddon/WMD**: Character and humor through unique weapon shapes. Audio-visual combos create dread (Holy Hand Grenade). Cascade explosions are the most spectacular category.
- **iShoot**: Terrain manipulation as visual feedback. Super weapons signal through scale.

## Cross-Game Visual Design Patterns Applied

1. **Behavior IS the visual** — bouncing, homing, splitting, burrowing, rolling
2. **Impact IS the payoff** — size scaling, fire spread, chain reactions, cascades
3. **Multi-hit weapons telegraph through repetition** — visible bounce rhythm, dust puffs
4. **Heavy weapons differ through scale** — larger projectile, thicker trail, screen presence
5. **Prestige weapons signal through complexity** — more moving parts, longer duration, unique colors
6. **Trail effects communicate energy** — thickness, particle density, glow, linger time
7. **Visual hierarchy through color** — muted basics → saturated mid-tier → special effects prestige

---

## Full Weapon Visual Specifications

### TIER 1 — Clean & Simple (intentionally understated, polished)

#### Single Shot (ID: 0)
- **Projectile:** Bright cyan sphere, 3px. Clean, no frills.
- **Trail:** Short crisp cyan gradient, fades quickly. No particles, no glow.
- **Flight:** Standard arc. The simplicity IS the design.
- **Identity:** "The reliable starter" — everyone recognizes it, nobody's impressed.

#### Dirt Ball (ID: 25)
- **Projectile:** Brown/earth-toned lumpy sphere, 5-6px. Draw 2-3 overlapping circles slightly offset for irregular edge.
- **Trail:** Dust particles — small brown dots drifting downward behind it, shedding dirt in flight.
- **Flight:** Standard arc but feels heavy/lobbed.
- **Identity:** Looks like what it is — a ball of dirt. The weight and lumpiness telegraph "terrain builder."

#### Magic Wall (ID: 12)
- **Projectile:** Shimmering translucent blue-white slab (already a rectangle). Slow rotation during flight like a tumbling card.
- **Trail:** Sparkle particles — tiny white dots that twinkle and fade.
- **Flight:** Tumbling rotation. Telegraphs "creates something" not "destroys something."
- **Identity:** Magical, constructive. The rotation and sparkle set it apart.

#### Sniper Rifle (ID: 11)
- **Projectile:** Thin white streak (1px wide, 8-10px long). Almost invisible. Crosses screen noticeably faster.
- **Trail:** Brief tracer line that fades almost instantly. Subtle muzzle flash pulse on fire.
- **Flight:** Flat, fast. "Blink and you'll miss it."
- **Identity:** Speed and precision. Impact is a tight, sharp hit marker.

### TIER 2 — Distinct Personality

#### Big Shot (ID: 1)
- **Projectile:** Noticeably larger (5-6px), deep magenta, feels HEAVY.
- **Trail:** Thick smoky trail — wider, denser, darker than other weapons.
- **Flight:** Lobbed cannonball arc. Subtle weight feel.
- **Identity:** "Something big is coming." Size telegraphs the massive explosion payoff.

#### Heatseeker (ID: 5) — NO CHANGES NEEDED
- Already the gold standard. Rocket shape with fins, homing curve, particle exhaust.

#### Skipper (ID: 20) — MINOR ENHANCEMENT
- **Addition:** Small dust/spark puff at each bounce point. Currently bounces are just direction changes — tiny particle burst on each terrain contact. Each puff slightly smaller than the last.
- **Identity:** Already great. Puffs make the skipping rhythm even more satisfying.

#### Hailstorm (ID: 16)
- **Projectile:** Light blue-white ice payload, 4px. Frosty trail of tiny white particles.
- **Sub-projectiles:** Ice shards — small angular shapes (not circles), ice-blue. Frost-puff on each terrain contact.
- **Flight:** Cold/frozen visual. Dissociation scatters sharp ice, not green balls.
- **Identity:** Reads as "hailstorm" — rain of sharp ice.

#### Crazy Ivan (ID: 9)
- **Projectile:** Pulsing, flickering orb. Visible wobble in flight (1-2px random jitter). Color shifts purple↔red.
- **Trail:** Erratic — jagged, stuttery, not smooth. Telegraphs instability.
- **Flight:** Unstable, unpredictable feeling. Split burst is dramatic bright flash.
- **Identity:** LOOKS crazy. The wobble and color shift say "this thing is dangerous and unpredictable."

#### Tommy Gun (ID: 26) — Gold Prestige
- **Projectile:** Bright tracer rounds — alternating blue-white hot streaks per bullet.
- **Trail:** Each bullet trail lingers briefly, creating fan of tracer lines visible simultaneously. Muzzle flash pulses with each shot.
- **Flight:** Rapid-fire bullet hell spray of hot metal.
- **Identity:** "Bullet hell." Gold tint to tracers reflecting prestige tier.

### TIER 3 — Complex & Spectacular (multi-phase visual stories)

#### 3 Shot (ID: 2)
- **Projectile:** Single projectile launches. At arc peak, visibly SPLITS INTO 3 with small flash/burst.
- **Trail:** 3 separate cyan trails fan out in trident pattern after split.
- **Flight:** The split moment IS the visual event. Before split = single projectile. After = three diverging paths.
- **Identity:** The mid-air separation. Reference: Pocket Tanks 3/5 Shot fan spread.

#### Spider (ID: 10)
- **Projectile:** Larger pulsing orb (4px) that subtly throbs during flight, telegraphing imminent split.
- **Trail:** Main projectile has thick gray trail. Sub-projectiles leave thin erratic trails like spider silk.
- **Flight:** Proximity trigger produces visible burst ring flash before 8 legs scatter.
- **Identity:** The throb → burst → scatter sequence. Reference: Worms Cluster Bomb.

#### Pile Driver (ID: 7)
- **Projectile:** Heavier (3-4px), magenta, thick blunt trail.
- **Trail:** Dense, wide magenta smoke.
- **Flight:** Standard arc. Impact triggers sequential blast rings pushing downward — each of 6 blasts visible as shockwave ring descending into earth.
- **Identity:** Weight in flight, drilling rhythm on impact. Distinct from Jackhammer by being heavier and drilling deeper.

#### Jackhammer (ID: 4)
- **Projectile:** Square (not circle — already coded). Cyan. Smaller, faster than Pile Driver.
- **Trail:** Thin cyan trail matching square aesthetic.
- **Flight:** On each bounce, square visibly shrinks (already coded). Add spark/dust puff on each bounce contact.
- **Identity:** Mechanical rhythm — bounce-shrink-spark, bounce-shrink-spark. Rapid and percussive vs Pile Driver's heavy single strike.

#### Ground Hog (ID: 17)
- **Projectile:** Purple with gray satellite dots (already coded as triple-circle).
- **Trail:** Standard arc trail in flight. TUNNELING PHASE: dirt particles erupt from terrain surface above burrowing path — like a mole under a lawn.
- **Flight:** Two-phase visual. Air = normal projectile. Underground = moving trail of surface dirt eruptions.
- **Identity:** The visible tunneling. Exit should have dramatic debris spray burst before detonation.

#### Napalm (ID: 15)
- **Projectile:** Larger (4px), orange-yellow, glowing. Grows warmer/brighter approaching impact.
- **Trail:** Flickering flame particles — orange/yellow dots that drift slightly and linger behind. Not just a gradient tail but actual small particle dots that fade over time.
- **Flight:** Flaming ball, not a yellow bullet. Fire trail is universally recognizable.
- **Identity:** Fire. Lingering flame particles in the wake. Reference: every fire weapon in every game.

#### Chain Reaction (ID: 21) — Platinum Prestige
- **Projectile:** Bright white-hot orb (4px) with intense glow.
- **Trail:** Heavy white particle trail with sparks.
- **Flight:** Standard arc. Impact triggers 15 chain explosions connected by visible energy arcs between detonation points — like a lit fuse racing across terrain.
- **Identity:** The relentless cascade march. Each explosion pulses white→orange→red. Platinum prestige = elite visual. Opponent watches destruction march toward them with building dread.

### TIER 4 — Fear Factor (prestige weapons, opponent should panic)

#### Homing Missile (ID: 24) — Bronze Prestige
- **Projectile:** Visible missile shape (bulkier than Heatseeker — wider body, larger fins). Red-orange coloring.
- **Trail:** Thick exhaust plume — dense smoke particles that linger in the air.
- **Flight:** Arc phase → visible STALL MOMENT (missile pauses, tips downward) → accelerated vertical drop with intensified exhaust. The stall-and-drop is the fear moment.
- **Identity:** The L-shaped trajectory with dramatic stall. Opponent watches it hover above them, then plummet.

#### Cruiser (ID: 29) — Silver Prestige
- **Projectile:** Metallic silver-white, slightly larger (4px), armored/mechanical look.
- **Trail:** Clean white trail in flight. ROLLING PHASE: tread mark trail on terrain surface + spark particles from contact point.
- **Flight:** Standard arc → lands → rolls along terrain for ~2 seconds. Rolling phase feels unstoppable.
- **Identity:** The grinding roll. "Is it going to reach me?" Tension builds during the 2-second roll. Final detonation = heavy blast.

#### Pineapple (ID: 22) — Diamond Prestige
- **Projectile:** Large (6-8px) green pulsing grenade shape. Visible segments like a real pineapple grenade. Glowing green core.
- **Trail:** Heavy green particle smoke with sparks.
- **Flight:** Proximity split = dramatic freeze-frame green flash → 20 sub-munitions scatter outward like a firework. Each sub-munition has own mini green trail.
- **Identity:** THE "oh fuck" weapon. Green glow and heavy trail are immediately recognizable. Scatter fills significant screen area. Chaos incarnate. Diamond tier = maximum visual spectacle.

---

## Technical Scope

### Changes to Weapon.js (base class)
- Add `spawnParticle(x, y, color, size, lifetime, velocity)` utility method (~50 lines)
- Add `spawnBurstEffect(x, y, count, color, spread)` convenience method
- Existing `updateTail()` remains for weapons that just need thicker/different trails

### Changes per weapon class in Standard.js
- `create()` — new canvas dimensions, draw new shapes (larger circles, missile shapes, squares, irregular edges)
- `update()` — call particle spawn for trail effects, add jitter/wobble/rotation animations
- `onTerrainHit()` / `onBounceHit()` — add bounce puffs, split flashes, tunneling particles
- `blast()` — enhanced explosion visuals for prestige weapons

### Weapons requiring lingering particles (spawnParticle):
1. Napalm — flame particles that linger in trail
2. Ground Hog — dirt eruptions above tunnel path
3. Spider — burst ring on proximity trigger
4. Pineapple — scatter flash + 20 sub-munition trails
5. Chain Reaction — energy arcs between detonation points
6. Skipper — bounce dust puffs
7. Jackhammer — bounce spark puffs

### Weapons needing only canvas/trail changes (no particles):
1. Single Shot — slightly larger (3px)
2. Big Shot — much larger (5-6px), thicker trail
3. Dirt Ball — lumpy shape, brown dust trail via updateTail
4. Magic Wall — slow rotation animation
5. Sniper Rifle — streak shape, tracer-style trail
6. 3 Shot — visible mid-air split (already splits, needs flash effect)
7. Pile Driver — larger projectile, blast ring visuals on drill-down
8. Hailstorm — ice shard shapes, frost-colored palette swap
9. Crazy Ivan — wobble jitter, color shift, erratic trail
10. Tommy Gun — tracer appearance, muzzle flash
11. Homing Missile — missile shape, exhaust plume, stall animation
12. Cruiser — rolling sparks, tread marks

### NOT changing:
- Heatseeker — already perfect
- Server physics (physics.js) — zero changes, visual only
- Damage/blast radius values — zero changes
- Weapon behavior/mechanics — zero changes

### Estimated scope:
- Weapon.js: +50-80 lines (particle utility)
- Standard.js: ~20-40 lines changed per weapon × 19 weapons = ~400-750 lines modified
- No new files, no new dependencies
- Client-only changes, server untouched

---

## Success Criteria

1. A player can identify which weapon was fired by watching the projectile in flight — before impact
2. Prestige weapons are immediately recognizable and feel elite/fear-inducing
3. Every weapon has at least ONE visual distinction from Single Shot (size, shape, trail, animation, or behavior)
4. Screen recordings of weapon fire look exciting and varied — content-creator ready
5. No gameplay/balance changes — purely visual enhancement
</content>
</invoke>