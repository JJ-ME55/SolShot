# Phase 1: Weapon Visual Audit - Research

**Researched:** 2026-02-19
**Domain:** Phaser 3 client-side weapon rendering (Standard.js vs converted-repo.txt reference)
**Confidence:** HIGH

---

## Summary

A direct diff of Standard.js (current, 5471 lines) against the weapon section of converted-repo.txt (reference, lines 39234-45139) was performed. The diff produced exactly **5 changed regions**. Of those, **4 are code changes** and **1 is content appended only in the reference** (logos.js, not a weapon class).

The current Standard.js is already aligned with the server's WEAPON_DATA catalog in `server/services/physics.js`. The three blast-parameter changes found in the diff are cases where the current Standard.js was intentionally updated to match the server's rebalanced weapon values — the reference is the *old* pre-rebalance version. The fourth change (heatseeker) is an intentional client-side homing algorithm improvement.

**Primary recommendation:** No visual drift requiring correction was found in any ACTIVE weapon class. The 20 active weapon classes in Standard.js are correct. Planning tasks should focus on verifying prestige weapons work properly in-game since they have been rebalanced but the rebalance is correctly reflected in both server and client code.

---

## Active Weapons: Complete Catalog

**15 Base Weapons (always available):**

| ID | Class Name | Name | Tier | Notes |
|----|-----------|------|------|-------|
| 0 | singleshot | Single Shot | FREE | Identical to reference |
| 1 | bigshot | Big Shot | RARE | Identical to reference |
| 2 | threeshot | 3 Shot | TACTICAL | Identical to reference |
| 4 | jackhammer | Jackhammer | EPIC | Identical to reference |
| 5 | heatseeker | Heatseeker | TACTICAL | Intentionally rewritten (see below) |
| 7 | piledriver | Pile Driver | RARE | Identical to reference |
| 9 | crazyivan | Crazy Ivan | LEGENDARY | Identical to reference |
| 10 | spider | Spider | TACTICAL | Identical to reference |
| 11 | sniperrifle | Sniper Rifle | RARE | Identical to reference |
| 12 | magicwall | Magic Wall | STANDARD | Identical to reference |
| 15 | napalm | Napalm | RARE | Identical to reference |
| 16 | hailstorm | Hail Storm | EPIC | Identical to reference |
| 17 | groundhog | Ground Hog | EPIC | Identical to reference |
| 20 | skipper | Skipper | TACTICAL | Identical to reference |
| 25 | dirtball | Dirt Ball | STANDARD | Identical to reference |

**5 Prestige Weapons (unlocked by burning SHOT tokens):**

| ID | Class Name | Name | Prestige Tier | Notes |
|----|-----------|------|---------------|-------|
| 21 | chainreaction | Chain Reaction | Platinum | Identical to reference |
| 22 | pineapple | Pineapple | Diamond | Sub-particle score factor updated to match server |
| 24 | homingmissile | Homing Missile | Bronze | Blast radius updated to match server |
| 26 | tommygun | Tommy Gun | Gold | Identical to reference |
| 29 | cruiser | Cruiser | Silver | Score factor updated to match server |

---

## Diff Results: All Differences Found

The automated diff (`diff <current_weapons_stripped> <reference_weapons>`) returned exactly 5 changed regions:

### Difference 1: Heatseeker `checkCloseToTank` (Active weapon, ID 5)

**Classification:** INTENTIONAL IMPROVEMENT — not drift, not a bug

**Current Standard.js (lines 749-764):**
```javascript
checkCloseToTank = (weapon) => {
    var oppTank = weapon.tank === weapon.scene.tank1 ? weapon.scene.tank2 : weapon.scene.tank1
    if (Phaser.Math.Distance.Between(...) < 250) {   // detection radius: 250
        if (!this._homing) {
            this._homing = true
            weapon.fixCloseToTank(this.projectile, {oppTankDist: 250})
        }
        var targetAngle = Phaser.Math.Angle.Between(
            this.projectile.body.x, this.projectile.body.y,   // FROM projectile
            oppTank.centre.x, oppTank.centre.y                // TO tank
        );
        var diff = Phaser.Math.Angle.Wrap(targetAngle - currentAngle)
        this.projectile.body.velocity.rotate(diff * 0.15)     // turn rate: 0.15
        this.projectile.setRotation(...)                       // sprite rotation added
    }
}
```

**Reference (converted-repo.txt lines 39982-39988):**
```javascript
checkCloseToTank = (weapon) => {
    if (Phaser.Math.Distance.Between(...) < 200) {    // detection radius: 200
        weapon.fixCloseToTank(this.projectile, {oppTankDist: 200})
        var targetAngle = Phaser.Math.Angle.Between(
            oppTank.centre.x, oppTank.centre.y,        // FROM tank (INVERTED)
            this.projectile.body.x, this.projectile.body.y
        ) + Math.PI;                                   // + Math.PI (180-degree flip)
        var diff = Phaser.Math.Angle.Wrap(targetAngle - ...)
        this.projectile.body.velocity.rotate(diff/10)  // turn rate: 0.1
    }
}
```

**Key changes in current version vs reference:**
- Detection radius: 200 → 250 px (wider homing cone)
- Angle calculation: reference used `Angle.Between(tank, projectile) + PI` which is equivalent to `Angle.Between(projectile, tank)` — current version makes this explicit
- Turn rate: `diff/10` (0.1) → `diff * 0.15` (snappier homing)
- One-shot guard (`this._homing`) added to prevent repeated `fixCloseToTank` calls
- Sprite rotation added to face direction of travel

**Server impact:** None. Homing is pure client rendering. Server physics handles actual trajectory server-side. The memory confirms "Heatseeker homing rewrite" was a deliberate fix.

### Difference 2: Pineapple sub-particle score factor (Active prestige weapon, ID 22)

**Current Standard.js (line 4124):**
```javascript
weapon.defaultUpdateScore(obj.body.x, obj.body.y, 20, 32/20)
```

**Reference:**
```javascript
weapon.defaultUpdateScore(obj.body.x, obj.body.y, 20, 30/20)
```

**Server WEAPON_DATA:** `subDamageFactor: 32/20`

**Verdict:** Current Standard.js **matches the server**. Reference is old pre-rebalance value. No fix needed.

### Difference 3: Homing Missile blast radius and score factor (Active prestige weapon, ID 24)

**Current Standard.js (lines 4435-4436):**
```javascript
weapon.terrain.blast(1, ..., 80 - weapon.scene.tank1.hitRadius, data, blowTank, ...)
weapon.defaultUpdateScore(..., 80, 60/80)
```

**Reference:**
```javascript
weapon.terrain.blast(1, ..., 60 - weapon.scene.tank1.hitRadius, data, blowTank, ...)
weapon.defaultUpdateScore(..., 60, 20/60)
```

**Server WEAPON_DATA:** `blastRadius: 80, damageFactor: 60/80`

**Verdict:** Current Standard.js **matches the server**. Reference blast radius (60) and damage factor (20/60) are old pre-rebalance values. No fix needed.

### Difference 4: Cruiser score factor (Active prestige weapon, ID 29)

**Current Standard.js (line 5343):**
```javascript
weapon.defaultUpdateScore(..., 80, 80/80)
```

**Reference:**
```javascript
weapon.defaultUpdateScore(..., 80, 60/80)
```

**Server WEAPON_DATA:** `damageFactor: 80/80`

**Verdict:** Current Standard.js **matches the server**. Reference damage factor (60/80) is old pre-rebalance value. No fix needed.

### Difference 5: logos.js appended in reference (non-code)

The reference file includes `logos.js` content concatenated after the weapon classes. This is artifact of the text dump format. Not a weapon code difference.

---

## Dead Weapon Classes (Never Instantiated)

These 10 classes exist in Standard.js but are NOT included in `array.js` and never instantiated:

| ID | Class Name | Name | Why Dead |
|----|-----------|------|----------|
| 3 | fiveshot | 5 Shot | Removed in Litepaper v2.0 |
| 6 | tracer | Tracer | Removed in Litepaper v2.0 |
| 8 | dirtmover | Dirt Mover | Removed in Litepaper v2.0 |
| 13 | dirtslinger | Dirt Slinger | Removed in Litepaper v2.0 |
| 14 | zapper | Zapper | Removed in Litepaper v2.0 |
| 18 | worm | Worm | Removed in Litepaper v2.0 |
| 19 | homingworm | Homing Worm | Removed in Litepaper v2.0 |
| 23 | firecracker | Firecracker | Removed in Litepaper v2.0 |
| 27 | mountainmover | Mountain Mover | Removed in Litepaper v2.0 |
| 28 | scattershot | Scatter Shot | Removed in Litepaper v2.0 |

These classes are **safe to ignore** for visual audit purposes. The memory note "Standard.js still has 10 dead weapon classes — low-priority cleanup" confirms this. No changes needed to these classes for this phase.

Note: `logos.js` has 10 stub exports (`fiveshot`, `tracer`, etc.) added to prevent build errors from these dead classes. This is intentional.

---

## Common Pitfalls

### Pitfall 1: Confusing "reference = ground truth"
**What goes wrong:** Treating converted-repo.txt as the target state and trying to revert current Standard.js to match it.
**Why it happens:** The reference is the OLD version. The server weapon rebalance (physics.js WEAPON_DATA) happened AFTER the reference was taken.
**How to avoid:** Always cross-check Standard.js blast params against `server/services/physics.js` WEAPON_DATA, not the reference.

### Pitfall 2: Heatseeker homing algorithm scope
**What goes wrong:** Reverting heatseeker to the reference algorithm, breaking the improved homing.
**Why it happens:** The diff shows the current version is "different" from reference.
**How to avoid:** The current heatseeker is intentionally improved. Memory: "Fix heatseeker homing, win/loss stats". Do not revert.

### Pitfall 3: Blast radius vs damage factor confusion
**What goes wrong:** Misreading `weapon.terrain.blast(1, x, y, RADIUS - hitRadius, ...)` — the actual client blast radius passed to terrain.blast is already reduced by `weapon.scene.tank1.hitRadius`.
**Why it happens:** The `blastRadius` in WEAPON_DATA is the nominal radius; the terrain gets `blastRadius - hitRadius`.
**How to avoid:** When verifying blast radius, compare WEAPON_DATA.blastRadius to the value BEFORE the `- hitRadius` subtraction in Standard.js.

### Pitfall 4: Score factor vs blast radius independence
**What goes wrong:** Changing blast radius without updating score factor or vice versa.
**Why it happens:** They look like separate values but the server computes `damage = blastRadius * damageFactor` — both must be consistent.
**How to avoid:** `defaultUpdateScore(x, y, radius, factor)` — radius and factor must match WEAPON_DATA exactly.

---

## Architecture Patterns

### How Active Weapons Are Wired

```
array.js                        Standard.js
  ↓ imports *                     ↓ exports 30 classes
  ↓ new Allweapons.singleshot()   (20 instantiated, 10 dead)
  ↓ weaponArray[id] = instance
  ↓
Weapon.js (client)
  ↓ this.activeWeapon = weaponArray[id]
  ↓ calls create(), shoot(), update(), onTerrainHit(), blast()
  ↓
main/index.js scene
  ↓ receives server 'physicsResult' event
  ↓ calls weapon.applyServerResult(data) for rendering only
```

### Server-Authoritative Model

The client weapons are **rendering only**. Damage, hit detection, and trajectory are computed server-side in `physics.js`. The client weapon classes handle:
- Projectile sprite creation (`create()`)
- Visual trail effects (`update()` → `weapon.updateTail()`)
- Blast animation (`blast()` → `weapon.terrain.blast()`)
- Score display (`weapon.defaultUpdateScore()`)

The `defaultUpdateScore` call in client Standard.js triggers visual HP bar updates only; actual damage is applied server-side.

### Blast Color Gradients by Weapon Type

Each weapon has a characteristic blast gradient:
- singleshot: pink `rgba(255,51,153,0)` → `rgba(230,0,115,1)`
- bigshot: red `rgba(255,0,0,0)` → `rgba(255,0,0,1)`
- heatseeker: dark red → bright red `rgba(120,0,0,1)` → `rgba(230,0,0,1)`
- crazyivan: yellow/black `rgba(0,0,0,0.4)` → `rgba(255,255,0,1)`
- spider: gray `rgba(100,100,100,1)` → `rgba(220,220,220,1)` line segments
- skipper: dark yellow → bright yellow `rgba(50,50,0,1)` → `rgba(240,240,20,1)`
- piledriver: orange-red gradient (6-hit drill pattern)
- sniperrifle: pinpoint blast radius=1
- groundhog: tunnel-pattern blast (emerges from terrain)
- hailstorm: cyan balls raining down
- napalm: fire particle spread (20 particles, orange/gold)
- chainreaction: 15 scattered red explosions with offset array

---

## Code Examples

### Blast Function Pattern (verified from Standard.js)
```javascript
// Source: Standard.js — singleshot blast (representative pattern)
blast = (weapon, blowTank = false) => {
    var grd = [
        {relativePosition: 0, color: 'rgba(255,51,153,0)'},
        {relativePosition: 1, color: 'rgba(230,0,115,1)'}
    ]
    var data = {
        thickness: 15,
        gradient: grd,
        blowPower: 200,
        soundEffect: 'expmedium2',
        soundConfig: {}
    }
    // blast radius: WEAPON_DATA.blastRadius - hitRadius
    weapon.terrain.blast(
        1,
        Math.floor(this.projectile.body.x),
        Math.floor(this.projectile.body.y),
        46 - weapon.scene.tank1.hitRadius,  // blastRadius=46 from WEAPON_DATA
        data,
        blowTank,
        this.id.toString()
    )
    // score: (blastRadius, damageFactor) must match WEAPON_DATA
    weapon.defaultUpdateScore(x, y, 46, 60/46)
    this.projectile.destroy(true)
    weapon.scene.textures.remove('projectile')
    weapon.turret.activeWeapon = null
}
```

### Score Factor Verification Pattern
To verify any weapon's client blast params match server, check:
```javascript
// Standard.js blast call:
weapon.defaultUpdateScore(x, y, RADIUS, FACTOR)

// Server physics.js WEAPON_DATA entry:
id: { blastRadius: RADIUS, damageFactor: FACTOR }
```

---

## State of the Art

| Area | Reference State | Current State | Change |
|------|----------------|---------------|--------|
| Heatseeker homing | `diff/10` turn rate, 200px radius, angle from tank | `diff*0.15`, 250px radius, angle toward tank, sprite rotation | Intentional improvement |
| Pineapple subBlastFactor | `30/20` | `32/20` | Weapon rebalance |
| Homing Missile blastRadius | 60 | 80 | Weapon rebalance |
| Homing Missile damageFactor | `20/60` | `60/80` | Weapon rebalance |
| Cruiser damageFactor | `60/80` | `80/80` | Weapon rebalance |

---

## Open Questions

1. **Prestige weapons in-game testing**
   - What we know: Code is correct vs server. Chainreaction, pineapple, homingmissile, tommygun, cruiser are all instantiated in array.js.
   - What's unclear: Whether these 5 weapons have been tested in-game since the server rebalance that changed their params.
   - Recommendation: Manual playtesting of prestige weapons should be part of WVA-03 verification.

2. **Heatseeker visual behavior with new algorithm**
   - What we know: Turn rate increased from 0.1 to 0.15, detection radius expanded 200→250px.
   - What's unclear: Whether the sprite rotation (`setRotation`) works correctly with Phaser physics body angle vs sprite angle.
   - Recommendation: Confirm heatseeker visually rotates to face travel direction in testing.

3. **Server physics for Napalm**
   - What we know: Server WEAPON_DATA says `blastRadius: 60, damageFactor: 20/60`. Napalm client fires 20 sub-particles and scores them via `scoreTween` + `constantUpdateScore`, not `defaultUpdateScore`.
   - What's unclear: Whether the client's particle-based scoring is reconciled with server's area-damage model.
   - Recommendation: Out of scope for this visual audit; server handles damage authoritatively.

---

## Sources

### Primary (HIGH confidence)
- Direct file diff: `client/src/weapons/packs/Standard/Standard.js` vs `converted-repo.txt` lines 39234-45139
- `server/services/physics.js` WEAPON_DATA (lines 19-47) — authoritative weapon parameters
- `client/src/weapons/array.js` — definitive list of all 20 active weapon instantiations
- `client/src/data/weapons.js` — 15 base weapon definitions
- `client/src/data/tiers.js` — 5 prestige weapon definitions (IDs: 21, 22, 24, 26, 29)

### Secondary (MEDIUM confidence)
- Git commit history: "Fix heatseeker homing" (commit 2e86aab) confirms heatseeker rewrite was deliberate
- Project MEMORY.md: "Crazy Ivan scatter effect was just updated to use server-provided scatter points"

---

## Metadata

**Confidence breakdown:**
- Active weapon catalog: HIGH — verified from array.js instantiation list
- Diff results: HIGH — automated diff, exact line numbers
- Server alignment: HIGH — cross-checked against physics.js WEAPON_DATA
- Dead weapon list: HIGH — verified no instantiation in array.js
- Prestige weapon status: HIGH — verified in tiers.js + array.js

**Research date:** 2026-02-19
**Valid until:** Stable — no external dependencies. Re-run if Standard.js or physics.js changes.
