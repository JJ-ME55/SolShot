/**
 * Prestige tier definitions and cosmetic item data.
 */

const PRESTIGE_TIERS = [
  { tier: 0,  name: 'Unranked',     color: '#6b7b8d', cost: 0,       reward: 'None' },
  { tier: 1,  name: 'Private',      color: '#cccccc', cost: 100,     reward: 'Basic camo pattern' },
  { tier: 2,  name: 'Corporal',     color: '#00ccff', cost: 250,     reward: 'Corporal insignia trail' },
  { tier: 3,  name: 'Sergeant',     color: '#00ccff', cost: 500,     reward: 'Sergeant blast effect' },
  { tier: 4,  name: 'Lieutenant',   color: '#9966ff', cost: 1000,    reward: 'Lieutenant turret skin' },
  { tier: 5,  name: 'Captain',      color: '#9966ff', cost: 2500,    reward: 'Captain tank body' },
  { tier: 6,  name: 'Major',        color: '#ff9900', cost: 5000,    reward: 'Major terrain theme' },
  { tier: 7,  name: 'Colonel',      color: '#ff9900', cost: 10000,   reward: 'Colonel victory anim' },
  { tier: 8,  name: 'General',      color: '#ffcc00', cost: 25000,   reward: 'General exclusive skin' },
  { tier: 9,  name: 'Commander',    color: '#ffcc00', cost: 50000,   reward: 'Commander full set' },
  { tier: 10, name: 'Supreme',      color: '#ff3300', cost: 100000,  reward: 'Supreme legendary set' },
];

const COSMETIC_ITEMS = [
  { id: 'camo_forest',    name: 'Forest Camo',      tier: 'TACTICAL',  type: 'PATTERN', price: '50 SHOT',   desc: 'Woodland camouflage pattern' },
  { id: 'camo_desert',    name: 'Desert Camo',      tier: 'TACTICAL',  type: 'PATTERN', price: '50 SHOT',   desc: 'Arid environment camouflage' },
  { id: 'camo_arctic',    name: 'Arctic Camo',      tier: 'RARE',      type: 'PATTERN', price: '100 SHOT',  desc: 'Snow and ice camouflage' },
  { id: 'camo_digital',   name: 'Digital Camo',     tier: 'RARE',      type: 'PATTERN', price: '150 SHOT',  desc: 'Modern digital pattern' },
  { id: 'trail_fire',     name: 'Fire Trail',       tier: 'EPIC',      type: 'TRAIL',   price: '200 SHOT',  desc: 'Flaming projectile trail' },
  { id: 'trail_neon',     name: 'Neon Trail',       tier: 'EPIC',      type: 'TRAIL',   price: '200 SHOT',  desc: 'Glowing neon projectile trail' },
  { id: 'blast_skull',    name: 'Skull Blast',      tier: 'LEGENDARY', type: 'BLAST',   price: '500 SHOT',  desc: 'Skull-shaped explosion effect' },
  { id: 'tank_gold',      name: 'Gold Plated',      tier: 'LEGENDARY', type: 'SKIN',    price: '1000 SHOT', desc: 'Full gold tank body' },
  { id: 'sol_camo',       name: 'Solana Gradient',  tier: 'LEGENDARY', type: 'PATTERN', price: '0.1 SOL',   desc: 'Solana brand gradient' },
  { id: 'sol_turret',     name: 'Phantom Turret',   tier: 'EPIC',      type: 'SKIN',    price: '0.05 SOL',  desc: 'Phantom wallet-themed turret' },
];

const TIER_COLORS = {
  FREE: '#6b7b8d',
  TACTICAL: '#00ccff',
  RARE: '#9966ff',
  EPIC: '#ff9900',
  LEGENDARY: '#ffcc00',
};

export { PRESTIGE_TIERS, COSMETIC_ITEMS, TIER_COLORS };
export default PRESTIGE_TIERS;
