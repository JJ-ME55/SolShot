/**
 * CS:S-style damage application + kill tracking.
 *
 * Port of c:\Users\jacob\fps-staking-game\src\engine\damage.ts.
 * Pure state-machine + factory. No DOM, no Three.js. Used by sim/runner.js
 * after sim/combat.js resolves a hit, to apply damage to the victim's
 * PlayerHealth and detect kills.
 *
 * MUST stay in sync with the client engine file. Bump SOURCE_COMMIT on every
 * re-sync from BillionaireBonkClub/shootout master.
 *
 * Port date: 2026-06-05.
 *
 * Notes:
 *  - Source imports WeaponType / WeaponConfig / HitResult / HitboxZone for typing
 *    only. At runtime we just read `weaponConfig.type`, `weaponConfig.baseDamage`,
 *    `hitResult.zone`, etc. as plain duck-typed objects. The string `'KNIFE'` is
 *    used for knife KillEvent.weaponType — matches WeaponType.KNIFE's enum value.
 */

export const SOURCE_COMMIT = '6e51da6aaf936ab9ba162546bfc25ffdc35c3925'; // bump on every Fish-sync

// ========== PLAYER HEALTH CLASS ==========

export class PlayerHealth {
  constructor() {
    this.hp = 100;
    this.armor = 100;
    this.hasHelmet = true;
    this.alive = true;

    // Tagging state
    this.tagSpeedMultiplier = 1.0;  // 1.0 = no slowdown
    this.tagTimeRemaining = 0;       // Seconds of tag remaining
  }

  /**
   * Full reset: 100 HP, 100 armor, helmet, alive
   */
  reset() {
    this.hp = 100;
    this.armor = 100;
    this.hasHelmet = true;
    this.alive = true;
    this.tagSpeedMultiplier = 1.0;
    this.tagTimeRemaining = 0;
  }

  /**
   * Update tagging timer each tick
   */
  update(dt) {
    if (this.tagTimeRemaining > 0) {
      this.tagTimeRemaining -= dt;

      if (this.tagTimeRemaining <= 0) {
        // Tag expired, restore normal speed
        this.tagSpeedMultiplier = 1.0;
        this.tagTimeRemaining = 0;
      }
    }
  }
}

// ========== DAMAGE RESULT TYPE ==========
// (Source defines a TS interface here — dissolves at runtime.
//  Shape: { damageDealt, armorDamaged, killed, isHeadshot, zone, remainingHp,
//           remainingArmor, tagSpeedMultiplier })

// ========== KILL EVENT TYPE ==========
// (Source defines a TS interface here — dissolves at runtime.
//  Shape: { killerId, victimId, weaponType, isHeadshot, damageDealt })

// ========== DAMAGE SYSTEM CLASS ==========

export class DamageSystem {
  constructor() {
    this.players = new Map();
    this.killEvents = [];
  }

  /**
   * Register a new player in the system
   */
  registerPlayer(id) {
    this.players.set(id, new PlayerHealth());
  }

  /**
   * Remove a player from the system
   */
  removePlayer(id) {
    this.players.delete(id);
  }

  /**
   * Get player health state
   */
  getHealth(id) {
    return this.players.get(id);
  }

  /**
   * Reset a single player's health
   */
  resetPlayer(id) {
    const health = this.players.get(id);
    if (health) {
      health.reset();
    }
  }

  /**
   * Reset all players' health (round start)
   */
  resetAll() {
    for (const health of Array.from(this.players.values())) {
      health.reset();
    }
    this.killEvents = [];
  }

  /**
   * Update all players' tagging timers
   */
  update(dt) {
    for (const health of Array.from(this.players.values())) {
      health.update(dt);
    }
  }

  /**
   * Apply damage from a weapon hit
   * CS:S damage order (CRITICAL): base * multiplier * armor
   *
   * @param shooterId - ID of shooter
   * @param hitResult - Hit result from hitscan test
   * @param weaponConfig - Weapon configuration with base damage
   * @returns DamageResult with all damage details, or null if target not found
   */
  applyDamage(shooterId, hitResult, weaponConfig) {
    const target = this.players.get(hitResult.targetId);
    if (!target || !target.alive) return null;

    // STEP 1: Base damage * hitbox multiplier
    const rawDamage = weaponConfig.baseDamage * hitResult.multiplier;

    // STEP 2: Determine if armor protects this zone
    let armorProtects = false;
    if (hitResult.armorProtected && target.armor > 0) {
      if (hitResult.zone === 'head') {
        // Head only protected if helmet present
        armorProtects = target.hasHelmet;
      } else {
        // Chest/stomach/arms protected by armor
        armorProtects = true;
      }
    }
    // Legs NEVER protected (armorProtected is false for leg zones)

    // STEP 3: Apply armor reduction if applicable
    let damageDealt;
    let armorConsumed;

    if (armorProtects) {
      // Armor absorbs 50% of damage
      const armorAbsorption = rawDamage * 0.5;
      damageDealt = rawDamage - armorAbsorption;

      // Armor durability: takes half of what it absorbs
      armorConsumed = armorAbsorption * 0.5;

      // Clamp armor consumed to remaining armor
      armorConsumed = Math.min(armorConsumed, target.armor);

      // If armor runs out mid-calculation, remaining damage goes to HP at full rate
      // (This is a simplification - CS:S has complex armor breakage, but this is close enough)
    } else {
      // No armor protection
      damageDealt = rawDamage;
      armorConsumed = 0;
    }

    // Round damage values
    damageDealt = Math.round(damageDealt);
    armorConsumed = Math.round(armorConsumed);

    // STEP 4: Apply damage to target
    target.hp -= damageDealt;
    target.armor -= armorConsumed;

    // Clamp values
    target.hp = Math.max(0, target.hp);
    target.armor = Math.max(0, target.armor);

    // STEP 5: Check for kill
    const killed = target.hp <= 0;
    if (killed) {
      target.alive = false;

      // Generate kill event
      this.killEvents.push({
        killerId: shooterId,
        victimId: hitResult.targetId,
        weaponType: weaponConfig.type,
        isHeadshot: hitResult.isHeadshot,
        damageDealt,
      });
    }

    // STEP 6: Apply tagging
    // Tag duration: 0.1s (100ms, CS:GO style)
    const tagDuration = 0.1;

    // Speed reduction scales with damage: 1.0 - min(0.8, damage/100)
    // 10 damage = 10% slow, 50 damage = 50% slow, 80+ damage = capped at 80% slow
    const tagMultiplier = 1.0 - Math.min(0.8, damageDealt / 100);

    // New hit replaces existing tag (does not stack)
    target.tagSpeedMultiplier = tagMultiplier;
    target.tagTimeRemaining = tagDuration;

    return {
      damageDealt,
      armorDamaged: armorConsumed,
      killed,
      isHeadshot: hitResult.isHeadshot,
      zone: hitResult.zone,
      remainingHp: target.hp,
      remainingArmor: target.armor,
      tagSpeedMultiplier: tagMultiplier,
    };
  }

  /**
   * Apply knife damage
   * Left-click: 40 damage flat, ignores armor
   * Right-click backstab: 200 damage (instant kill)
   *
   * @param attackerId - ID of attacker
   * @param targetId - ID of target
   * @param isBackstab - Whether this is a backstab (right-click from behind)
   * @returns DamageResult, or null if target not found
   */
  applyKnifeDamage(attackerId, targetId, isBackstab) {
    const target = this.players.get(targetId);
    if (!target || !target.alive) return null;

    // Knife damage bypasses armor completely
    const damageDealt = isBackstab ? 200 : 40;

    // Apply damage
    target.hp -= damageDealt;
    target.hp = Math.max(0, target.hp);

    // Check for kill
    const killed = target.hp <= 0;
    if (killed) {
      target.alive = false;

      // Generate kill event
      this.killEvents.push({
        killerId: attackerId,
        victimId: targetId,
        weaponType: 'KNIFE', // matches WeaponType.KNIFE enum value
        isHeadshot: false, // Knife kills are never headshots
        damageDealt,
      });
    }

    // Apply tagging (even on non-lethal hits)
    const tagDuration = 0.1;
    const tagMultiplier = 1.0 - Math.min(0.8, damageDealt / 100);
    target.tagSpeedMultiplier = tagMultiplier;
    target.tagTimeRemaining = tagDuration;

    return {
      damageDealt,
      armorDamaged: 0, // Knife ignores armor
      killed,
      isHeadshot: false,
      zone: 'chest', // Arbitrary zone for knife
      remainingHp: target.hp,
      remainingArmor: target.armor,
      tagSpeedMultiplier: tagMultiplier,
    };
  }

  /**
   * Get all kill events since last clear
   */
  getKillEvents() {
    return [...this.killEvents];
  }

  /**
   * Clear kill events (called after processing)
   */
  clearKillEvents() {
    this.killEvents = [];
  }
}

// ========== SELF-TEST FUNCTION ==========
// Source's _selfTestDamage() exists for in-browser console verification. Skipping
// in the port — server-side coverage lives in tests/shootout/damage.test.js.
