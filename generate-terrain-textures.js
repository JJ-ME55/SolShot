const sharp = require('sharp');
const path = require('path');

const SIZE = 64; // tile size for repeating pattern
const OUT = path.join(__dirname, 'client/public/assets/images');

// Olive-earth palette matching the layer colors from terrain.js
// Layer 1 (surface, brightest) → Layer 5 (deepest) → 6 (base fill)
const LAYERS = [
  { file: '1.png', r: 107, g: 123, b: 61 },   // Olive surface
  { file: '2.png', r: 92,  g: 106, b: 53 },    // Dark olive
  { file: '3.png', r: 74,  g: 86,  b: 42 },    // Earth
  { file: '4.png', r: 58,  g: 69,  b: 31 },    // Dark earth
  { file: '5.png', r: 42,  g: 51,  b: 31 },    // Deepest
  { file: '6.png', r: 35,  g: 42,  b: 25 },    // Base fill (darkest)
];

async function generateTexture(layer) {
  const pixels = Buffer.alloc(SIZE * SIZE * 3);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 3;
      // Add subtle noise for natural look (±12 per channel)
      const noise = Math.floor(Math.random() * 25) - 12;
      pixels[idx]     = Math.max(0, Math.min(255, layer.r + noise));
      pixels[idx + 1] = Math.max(0, Math.min(255, layer.g + noise));
      pixels[idx + 2] = Math.max(0, Math.min(255, layer.b + Math.floor(noise * 0.5)));
    }
  }

  await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png()
    .toFile(path.join(OUT, layer.file));

  console.log(`Created ${layer.file} (${layer.r},${layer.g},${layer.b})`);
}

async function main() {
  for (const layer of LAYERS) {
    await generateTexture(layer);
  }
  console.log('\nAll terrain textures generated!');
}

main().catch(err => { console.error(err); process.exit(1); });
