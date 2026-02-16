/**
 * Static weapon metadata for the React UI shop.
 * IDs and stats match server WEAPON_CATALOG exactly.
 */

const TIER_COLORS = {
  FREE: '#cccccc',
  TACTICAL: '#00ccff',
  RARE: '#9966ff',
  EPIC: '#ff9900',
  LEGENDARY: '#ffcc00',
};

const WEAPONS = [
  { id: 0,  name: 'Single Shot',   tier: 'FREE',      goldCost: 0,    blastRadius: 46,  damageFactor: 1.30, type: 'single',  desc: 'Standard issue. Reliable, no cost.' },
  { id: 1,  name: 'Big Shot',      tier: 'RARE',      goldCost: 700,  blastRadius: 90,  damageFactor: 0.33, type: 'single',  desc: 'Massive blast radius, lower damage per hit.' },
  { id: 2,  name: '3 Shot',        tier: 'TACTICAL',  goldCost: 400,  blastRadius: 46,  damageFactor: 1.30, type: 'multi',   desc: 'Triple burst. Three projectiles spread.' },
  { id: 3,  name: '5 Shot',        tier: 'RARE',      goldCost: 800,  blastRadius: 46,  damageFactor: 0.65, type: 'multi',   desc: 'Five-round volley. Reduced per-hit damage.' },
  { id: 4,  name: 'Jackhammer',    tier: 'EPIC',      goldCost: 1000, blastRadius: 46,  damageFactor: 0.43, type: 'multi',   desc: 'Rapid-fire barrage of 10 rounds.' },
  { id: 5,  name: 'Heatseeker',    tier: 'TACTICAL',  goldCost: 500,  blastRadius: 60,  damageFactor: 0.67, type: 'homing',  desc: 'Guided missile. Locks on to enemy.' },
  { id: 7,  name: 'Pile Driver',   tier: 'RARE',      goldCost: 600,  blastRadius: 80,  damageFactor: 0.50, type: 'drill',   desc: 'Penetrates terrain, explodes underground.' },
  { id: 9,  name: 'Crazy Ivan',    tier: 'LEGENDARY', goldCost: 2500, blastRadius: 46,  damageFactor: 0.43, type: 'scatter', desc: 'Erratic cluster bombs. Unpredictable devastation.' },
  { id: 10, name: 'Spider',        tier: 'TACTICAL',  goldCost: 400,  blastRadius: 46,  damageFactor: 0.43, type: 'spider',  desc: 'Crawls along terrain, then detonates.' },
  { id: 11, name: 'Sniper Rifle',  tier: 'RARE',      goldCost: 700,  blastRadius: 16,  damageFactor: 3.75, type: 'single',  desc: 'Tiny blast, massive damage. Precision kills.' },
  { id: 12, name: 'Magic Wall',    tier: 'TACTICAL',  goldCost: 200,  blastRadius: 0,   damageFactor: 0,    type: 'wall',    desc: 'Defensive barrier. Blocks enemy fire.' },
  { id: 15, name: 'Napalm',        tier: 'RARE',      goldCost: 600,  blastRadius: 80,  damageFactor: 0.50, type: 'area',    desc: 'Scorched earth. Wide area denial.' },
  { id: 16, name: 'Hail Storm',    tier: 'EPIC',      goldCost: 1200, blastRadius: 46,  damageFactor: 0.43, type: 'rain',    desc: 'Rains projectiles from above. Area saturation.' },
];

/**
 * Get the CSS hex color for a weapon tier.
 */
function getTierColor(tier) {
  return TIER_COLORS[tier] || TIER_COLORS.FREE;
}

/**
 * Get weapon icon URL from public assets.
 */
function getWeaponIconUrl(weaponName) {
  const filename = weaponName.replace(/ /g, '_') + '.webp';
  return `${process.env.PUBLIC_URL}/assets/images/logos/standard/${filename}`;
}

/**
 * Find weapon metadata by ID.
 */
function getWeaponById(id) {
  return WEAPONS.find((w) => w.id === id) || null;
}

export default WEAPONS;
export { TIER_COLORS, getTierColor, getWeaponIconUrl, getWeaponById };
