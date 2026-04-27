/**
 * Prestige tier definitions — Litepaper v2.0
 * Each tier requires burning SHOT tokens permanently.
 * Cumulative: 200 + 500 + 1200 + 2500 + 4000 = 8,400 SHOT to Diamond
 */

const PRESTIGE_TIERS = [
  { tier: 0, name: 'Unranked',  color: '#969696', cost: 0,    reward: 'None',            weapons: [] },
  { tier: 1, name: 'Bronze',    color: '#cd7f32', cost: 200,  reward: 'Homing Missile',  weapons: [24] },
  { tier: 2, name: 'Silver',    color: '#c0c0c0', cost: 500,  reward: 'Cruiser',         weapons: [29] },
  { tier: 3, name: 'Gold',      color: '#ffcc00', cost: 1200, reward: 'Tommy Gun',       weapons: [26] },
  { tier: 4, name: 'Platinum',  color: '#b4a0ff', cost: 2500, reward: 'Chain Reaction',  weapons: [21] },
  { tier: 5, name: 'Diamond',   color: '#64c8ff', cost: 4000, reward: 'Pineapple',       weapons: [22] },
];

const COSMETIC_ITEMS = [
  // ── SHOT BURNS: Tank Camo Patterns ──
  { id: 'camo_forest',    name: 'Forest Camo',      tier: 'TACTICAL',  type: 'PATTERN', price: '50 SHOT',    desc: 'Woodland camouflage pattern for tank body' },
  { id: 'camo_desert',    name: 'Desert Camo',      tier: 'TACTICAL',  type: 'PATTERN', price: '50 SHOT',    desc: 'Arid environment sandy camouflage' },
  { id: 'camo_arctic',    name: 'Arctic Camo',      tier: 'RARE',      type: 'PATTERN', price: '100 SHOT',   desc: 'Snow and ice winter camouflage' },
  { id: 'camo_digital',   name: 'Digital Camo',     tier: 'RARE',      type: 'PATTERN', price: '150 SHOT',   desc: 'Modern pixelated digital pattern' },
  { id: 'camo_lava',      name: 'Lava Camo',        tier: 'EPIC',      type: 'PATTERN', price: '300 SHOT',   desc: 'Molten lava cracks across the hull' },
  { id: 'camo_void',      name: 'Void Camo',        tier: 'LEGENDARY', type: 'PATTERN', price: '600 SHOT',   desc: 'Deep space void with star particles' },

  // ── SHOT BURNS: Projectile Trails ──
  { id: 'trail_fire',     name: 'Fire Trail',       tier: 'TACTICAL',  type: 'TRAIL',   price: '75 SHOT',    desc: 'Flaming trail behind projectiles' },
  { id: 'trail_neon',     name: 'Neon Trail',       tier: 'RARE',      type: 'TRAIL',   price: '150 SHOT',   desc: 'Glowing neon streak effect' },
  { id: 'trail_plasma',   name: 'Plasma Trail',     tier: 'EPIC',      type: 'TRAIL',   price: '250 SHOT',   desc: 'Crackling plasma energy trail' },
  { id: 'trail_phantom',  name: 'Ghost Trail',      tier: 'LEGENDARY', type: 'TRAIL',   price: '500 SHOT',   desc: 'Ethereal phantom afterimage trail' },

  // ── SHOT BURNS: Explosion Effects ──
  { id: 'blast_ring',     name: 'Shockwave',        tier: 'TACTICAL',  type: 'BLAST',   price: '75 SHOT',    desc: 'Expanding shockwave ring on impact' },
  { id: 'blast_skull',    name: 'Skull Blast',       tier: 'RARE',     type: 'BLAST',   price: '200 SHOT',   desc: 'Skull-shaped explosion cloud' },
  { id: 'blast_lightning', name: 'Thunder Strike',   tier: 'EPIC',     type: 'BLAST',   price: '350 SHOT',   desc: 'Lightning bolt explosion effect' },
  { id: 'blast_nuke',     name: 'Mushroom Cloud',    tier: 'LEGENDARY', type: 'BLAST',  price: '750 SHOT',   desc: 'Mini mushroom cloud on every hit' },

  // ── SHOT BURNS: Tank Skins ──
  { id: 'skin_stealth',   name: 'Stealth Black',    tier: 'RARE',      type: 'SKIN',    price: '200 SHOT',   desc: 'Matte black tactical finish' },
  { id: 'skin_chrome',    name: 'Chrome Plated',    tier: 'EPIC',      type: 'SKIN',    price: '400 SHOT',   desc: 'Mirror-finish chrome tank body' },
  { id: 'tank_gold',      name: 'Gold Plated',      tier: 'LEGENDARY', type: 'SKIN',    price: '1000 SHOT',  desc: 'Full 24K gold tank body' },
  { id: 'skin_diamond',   name: 'Diamond Encrusted', tier: 'LEGENDARY', type: 'SKIN',   price: '2000 SHOT',  desc: 'Diamond-studded tank. Ultimate flex.' },

  // ── SHOT BURNS: Kill Effects ──
  { id: 'kill_confetti',  name: 'Confetti Kill',    tier: 'TACTICAL',  type: 'KILL',    price: '100 SHOT',   desc: 'Confetti burst when you destroy a tank' },
  { id: 'kill_fireworks', name: 'Fireworks',        tier: 'RARE',      type: 'KILL',    price: '200 SHOT',   desc: 'Fireworks display on kill shot' },
  { id: 'kill_lightning', name: 'Lightning Strike',  tier: 'EPIC',     type: 'KILL',    price: '400 SHOT',   desc: 'Lightning bolts rain down on destroyed tank' },
  { id: 'kill_nuke',      name: 'Tactical Nuke',    tier: 'LEGENDARY', type: 'KILL',    price: '800 SHOT',   desc: 'Screen-shaking nuclear explosion on kill' },

  // ── SOL SHOP: Premium Exclusives ──
  { id: 'sol_camo',       name: 'Solana Gradient',  tier: 'LEGENDARY', type: 'PATTERN', price: '0.1 SOL',    desc: 'Official Solana purple-green gradient' },
  { id: 'sol_turret',     name: 'Phantom Turret',   tier: 'EPIC',      type: 'SKIN',   price: '0.05 SOL',   desc: 'Phantom wallet-themed turret design' },
  { id: 'sol_trail',      name: 'SOL Trail',        tier: 'EPIC',      type: 'TRAIL',   price: '0.03 SOL',   desc: 'Solana logo particles in projectile trail' },
  { id: 'sol_blast',      name: 'SOL Burst',        tier: 'RARE',      type: 'BLAST',   price: '0.02 SOL',   desc: 'Solana logo explosion effect' },
  { id: 'sol_kill',       name: 'Validator Kill',   tier: 'LEGENDARY', type: 'KILL',    price: '0.08 SOL',   desc: '"VALIDATED" stamp slams down on kill' },
  { id: 'sol_skin_saga',  name: 'Saga Edition',     tier: 'LEGENDARY', type: 'SKIN',    price: '0.15 SOL',   desc: 'Solana Saga phone-inspired tank design' },
];

const TIER_COLORS = {
  FREE:      '#8a9a80',   /* muted sage */
  STANDARD:  '#7a9060',   /* olive green */
  TACTICAL:  '#4fc0b4',   /* teal */
  RARE:      '#c8a84a',   /* amber */
  EPIC:      '#9945FF',   /* sol purple */
  LEGENDARY: '#d83030',   /* red */
  PRESTIGE:  '#14F195',   /* sol green */
};

export { PRESTIGE_TIERS, COSMETIC_ITEMS, TIER_COLORS };
export default PRESTIGE_TIERS;
