#!/usr/bin/env node

import { Jimp } from 'jimp';
import { program } from 'commander';
import { WarpedGradient, WARP_SHAPES, POSITION_TYPES } from './gradient.js';

program
  .name('warpgrad')
  .description('Generate mesh gradients with warp distortion')
  .version('1.0.0')
  .requiredOption('-W, --width <number>', 'Image width in pixels', parseInt)
  .requiredOption('-H, --height <number>', 'Image height in pixels', parseInt)
  .requiredOption('-c, --colors <colors>', 'Semicolon-separated hex colors (e.g., "2483A5;E0B94B;477459")')
  .option('-w, --warp <number>', 'Warp amount (0-100)', parseFloat, 50)
  .option('-s, --warp-size <number>', 'Warp scale/size (larger = smoother)', parseFloat, 200)
  .option('-t, --warp-type <type>', `Warp shape: ${WARP_SHAPES.join(', ')}`, 'simplex')
  .option('-p, --centers <type>', `Color center positions: ${POSITION_TYPES.join(', ')}`, 'grid')
  .option('-n, --noise <number>', 'Noise/grain amount (0-100)', parseFloat, 0)
  .option('-b, --blur <number>', 'Blur radius (0-50)', parseFloat, 0)
  .option('--seed <value>', 'Random seed for reproducible results')
  .option('--no-sharp', 'Use smooth interpolation instead of sharp Bézier')
  .option('-f, --format <format>', 'Output format: jpeg, png', 'jpeg')
  .option('-q, --quality <number>', 'JPEG quality (0-100)', parseFloat, 90)
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .parse();

const opts = program.opts();

// Parse colors
const colors = opts.colors.split(';').map(c => c.trim().replace('#', ''));

if (colors.length < 2) {
  console.error('Error: At least 2 colors required');
  process.exit(1);
}

// Validate dimensions
if (opts.width < 1 || opts.height < 1) {
  console.error('Error: Width and height must be positive');
  process.exit(1);
}

if (opts.width > 4096 || opts.height > 4096) {
  console.error('Error: Maximum dimension is 4096px');
  process.exit(1);
}

// Validate warp type
const warpType = opts.warpType.toLowerCase();
if (!WARP_SHAPES.includes(warpType)) {
  console.error(`Error: Invalid warp type '${opts.warpType}'. Valid types: ${WARP_SHAPES.join(', ')}`);
  process.exit(1);
}

// Validate centers/position type
const positionType = opts.centers.toLowerCase();
if (!POSITION_TYPES.includes(positionType)) {
  console.error(`Error: Invalid centers type '${opts.centers}'. Valid types: ${POSITION_TYPES.join(', ')}`);
  process.exit(1);
}

// Create gradient
const gradient = new WarpedGradient(colors, opts.width, opts.height, {
  warp: Math.max(0, Math.min(100, opts.warp)),
  warpSize: Math.max(10, opts.warpSize),
  warpShape: warpType,
  positionType: positionType,
  noise: Math.max(0, Math.min(100, opts.noise)),
  seed: opts.seed ?? Math.random() * 10000,
  sharp: opts.sharp,
});

// Render pixels
let pixels = gradient.render();

// Apply blur if specified
const blurRadius = Math.max(0, Math.min(50, Math.round(opts.blur || 0)));
if (blurRadius > 0) {
  pixels = boxBlur(pixels, opts.width, opts.height, blurRadius);
}

// Create image with Jimp
const image = new Jimp({ width: opts.width, height: opts.height });

// Copy pixel data
for (let y = 0; y < opts.height; y++) {
  for (let x = 0; x < opts.width; x++) {
    const i = (y * opts.width + x) * 4;
    // Use >>> 0 to convert to unsigned 32-bit integer
    const color = ((pixels[i] << 24) | (pixels[i + 1] << 16) | (pixels[i + 2] << 8) | pixels[i + 3]) >>> 0;
    image.setPixelColor(color, x, y);
  }
}

// Box blur implementation
function boxBlur(data, width, height, radius) {
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const i = (ny * width + nx) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
      }

      const i = (y * width + x) * 4;
      output[i] = r / count;
      output[i + 1] = g / count;
      output[i + 2] = b / count;
      output[i + 3] = 255;
    }
  }

  return output;
}

// Output
const format = opts.format.toLowerCase();
const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';

if (opts.output) {
  await image.write(opts.output, { quality: opts.quality });
  console.error(`Written to ${opts.output}`);
} else {
  const buffer = await image.getBuffer(mimeType, { quality: opts.quality });
  process.stdout.write(buffer);
}
