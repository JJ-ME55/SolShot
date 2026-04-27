/**
 * Static weapon metadata for the React UI shop.
 * 15 launch weapons — Litepaper v2.0
 * IDs and stats match server WEAPON_CATALOG exactly.
 */

const TIER_COLORS = {
  FREE:      '#8a9a80',   /* muted sage — design ref */
  STANDARD:  '#7a9060',   /* olive green */
  TACTICAL:  '#4fc0b4',   /* teal */
  RARE:      '#c8a84a',   /* amber */
  EPIC:      '#9945FF',   /* sol purple */
  LEGENDARY: '#d83030',   /* red */
  PRESTIGE:  '#14F195',   /* sol green */
};

const WEAPONS = [
  { id: 0,  name: 'Single Shot',   tier: 'FREE',      goldCost: 0,    blastRadius: 46,  damageFactor: 0.76, type: 'single',         desc: 'Standard issue. Reliable, no cost. Infinite ammo.' },
  { id: 25, name: 'Dirt Ball',      tier: 'STANDARD',  goldCost: 150,  blastRadius: 0,   damageFactor: 0,    type: 'terrain_create',  desc: 'Raises terrain on impact. Defensive utility.' },
  { id: 12, name: 'Magic Wall',     tier: 'STANDARD',  goldCost: 150,  blastRadius: 0,   damageFactor: 0,    type: 'wall',            desc: 'Erects terrain wall. Blocks incoming fire.' },
  { id: 20, name: 'Skipper',        tier: 'TACTICAL',  goldCost: 200,  blastRadius: 52,  damageFactor: 1.06, type: 'bouncer',         desc: 'Bounces across terrain surface. Trick shots.' },
  { id: 2,  name: '3 Shot',         tier: 'TACTICAL',  goldCost: 200,  blastRadius: 46,  damageFactor: 0.48, type: 'multi',           desc: 'Three projectiles fan out mid-air.' },
  { id: 10, name: 'Spider',         tier: 'TACTICAL',  goldCost: 200,  blastRadius: 28,  damageFactor: 0.79, type: 'spider',          desc: 'Splits into crawling sub-munitions on proximity.' },
  { id: 5,  name: 'Heatseeker',     tier: 'TACTICAL',  goldCost: 350,  blastRadius: 80,  damageFactor: 0.63, type: 'homing',          desc: 'Homes toward opponent tank. Guided forgiveness.' },
  { id: 15, name: 'Napalm',         tier: 'RARE',      goldCost: 400,  blastRadius: 60,  damageFactor: 0.42, type: 'area',            desc: 'Area burn, melts terrain. Damage over time.' },
  { id: 7,  name: 'Pile Driver',    tier: 'RARE',      goldCost: 400,  blastRadius: 46,  damageFactor: 0.54, type: 'drill',           desc: 'Drills down through terrain. 6 sequential blasts.' },
  { id: 11, name: 'Sniper Rifle',   tier: 'RARE',      goldCost: 500,  blastRadius: 1,   damageFactor: 100,  type: 'sniper',          desc: 'Pinpoint 1px blast. 100 damage on direct hit. Miss = zero.' },
  { id: 1,  name: 'Big Shot',       tier: 'RARE',      goldCost: 600,  blastRadius: 90,  damageFactor: 0.39, type: 'single',          desc: 'Massive blast radius. Maximum aim forgiveness.' },
  { id: 17, name: 'Ground Hog',     tier: 'EPIC',      goldCost: 600,  blastRadius: 70,  damageFactor: 0.86, type: 'tunnel',          desc: 'Tunnels through terrain, emerges and detonates.' },
  { id: 4,  name: 'Jackhammer',     tier: 'EPIC',      goldCost: 700,  blastRadius: 36,  damageFactor: 0.39, type: 'drill',           desc: 'Drills vertically into terrain. 5 chain blasts.' },
  { id: 16, name: 'Hail Storm',     tier: 'EPIC',      goldCost: 700,  blastRadius: 36,  damageFactor: 0.33, type: 'rain',            desc: 'Rains projectiles over wide area. Damage over time.' },
  { id: 9,  name: 'Crazy Ivan',     tier: 'LEGENDARY', goldCost: 2500, blastRadius: 36,  damageFactor: 0.61, type: 'scatter',         desc: '15 random explosions. Total chaos.' },
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
const ICON_NAME_OVERRIDES = {
  'Dirt Ball': 'Dirtball',
};

function getWeaponIconUrl(weaponName) {
  const base = ICON_NAME_OVERRIDES[weaponName] || weaponName.replace(/ /g, '_');
  return `${process.env.PUBLIC_URL}/assets/images/logos/standard/${base}.png`;
}

/**
 * Find weapon metadata by ID.
 */
function getWeaponById(id) {
  return WEAPONS.find((w) => w.id === id) || null;
}

export default WEAPONS;
export { TIER_COLORS, getTierColor, getWeaponIconUrl, getWeaponById };
