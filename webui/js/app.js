import { createNoise2D } from 'https://cdn.jsdelivr.net/npm/simplex-noise@4.0.3/+esm';

// ============================================
// PORTED FROM CLI: color.js
// ============================================
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, v * 255)));
}

function rgbToOklab({ r, g, b }) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

function oklabToRgb({ L, a, b }) {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  return {
    r: linearToSrgb(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3),
  };
}

function lerpColor(color1, color2, t) {
  const lab1 = rgbToOklab(color1);
  const lab2 = rgbToOklab(color2);
  return oklabToRgb({
    L: lab1.L + (lab2.L - lab1.L) * t,
    a: lab1.a + (lab2.a - lab1.a) * t,
    b: lab1.b + (lab2.b - lab1.b) * t,
  });
}

function bilinearInterpolate(nw, ne, sw, se, u, v) {
  const top = lerpColor(nw, ne, u);
  const bottom = lerpColor(sw, se, u);
  return lerpColor(top, bottom, v);
}

// ============================================
// PORTED FROM CLI: noise.js
// ============================================
class NoiseGenerator {
  constructor(seed = Math.random()) {
    const prng = this.createPRNG(seed);
    this.noise2D = createNoise2D(prng);
  }

  createPRNG(seed) {
    let state = typeof seed === 'number' ? seed : this.hashString(seed);
    return () => {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  get2D(x, y, scale = 1) {
    return this.noise2D(x / scale, y / scale);
  }

  fbm2D(x, y, { octaves = 4, lacunarity = 2, persistence = 0.5, scale = 1 } = {}) {
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D((x * frequency) / scale, (y * frequency) / scale);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return value / maxValue;
  }
}

// ============================================
// PORTED FROM CLI: gradient.js
// ============================================
class MeshGradient {
  constructor(colors, width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.colors = colors.map(c => (typeof c === 'string' ? hexToRgb(c) : c));
    this.options = {
      gridSize: options.gridSize || this.calculateGridSize(colors.length),
      sharp: options.sharp ?? false,
    };
    this.grid = this.createColorGrid();
  }

  calculateGridSize(numColors) {
    const sqrt = Math.ceil(Math.sqrt(numColors));
    return { cols: sqrt, rows: Math.ceil(numColors / sqrt) };
  }

  createColorGrid() {
    const { cols, rows } = this.options.gridSize;
    const grid = [];
    for (let row = 0; row < rows; row++) {
      const gridRow = [];
      for (let col = 0; col < cols; col++) {
        const colorIndex = row * cols + col;
        const color = this.colors[colorIndex % this.colors.length];
        gridRow.push({ x: col / (cols - 1 || 1), y: row / (rows - 1 || 1), color });
      }
      grid.push(gridRow);
    }
    return grid;
  }

  getColorAt(u, v) {
    const { cols, rows } = this.options.gridSize;
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));
    const cellX = u * (cols - 1);
    const cellY = v * (rows - 1);
    const col = Math.min(Math.floor(cellX), cols - 2);
    const row = Math.min(Math.floor(cellY), rows - 2);
    let localU = cellX - col;
    let localV = cellY - row;
    if (this.options.sharp) {
      localU = localU * localU * (3 - 2 * localU);
      localV = localV * localV * (3 - 2 * localV);
    }
    const nw = this.grid[row][col].color;
    const ne = this.grid[row][col + 1]?.color || nw;
    const sw = this.grid[row + 1]?.[col]?.color || nw;
    const se = this.grid[row + 1]?.[col + 1]?.color || nw;
    return bilinearInterpolate(nw, ne, sw, se, localU, localV);
  }
}

class WarpedGradient {
  constructor(colors, width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.warp = options.warp ?? 50;
    this.warpSize = options.warpSize ?? 200;
    this.warpShape = options.warpShape ?? 'simplex';
    this.noise = options.noise ?? 0;
    this.seed = options.seed ?? Math.random() * 10000;
    this.sharp = options.sharp ?? false;
    this.gradient = new MeshGradient(colors, width, height, { sharp: this.sharp });
    this.noiseGen = new NoiseGenerator(this.seed);
    this.cellPoints = this.generateCellPoints();
  }

  generateCellPoints() {
    const numCells = 16;
    const points = [];
    const prng = this.noiseGen.createPRNG(this.seed + 999);
    for (let i = 0; i < numCells; i++) {
      for (let j = 0; j < numCells; j++) {
        points.push({ x: (i + prng()) / numCells, y: (j + prng()) / numCells });
      }
    }
    return points;
  }

  warpCoordinates(x, y) {
    if (this.warp === 0 || this.warpShape === 'flat') return { x, y };
    const amount = (this.warp / 100) * Math.min(this.width, this.height) * 0.3;
    const scale = this.warpSize;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const nx = x / this.width;
    const ny = y / this.height;
    let dx = 0, dy = 0;

    switch (this.warpShape) {
      case 'simplex':
        dx = this.noiseGen.get2D(x, y, scale);
        dy = this.noiseGen.get2D(x + 5000, y + 5000, scale);
        break;
      case 'value':
        dx = this.valueNoise(nx, ny, scale);
        dy = this.valueNoise(nx + 10, ny + 10, scale);
        break;
      case 'smooth':
        dx = this.smoothNoise(nx, ny, scale);
        dy = this.smoothNoise(nx + 10, ny + 10, scale);
        break;
      case 'fbm':
        dx = this.noiseGen.fbm2D(x, y, { scale, octaves: 5, persistence: 0.5 });
        dy = this.noiseGen.fbm2D(x + 5000, y + 5000, { scale, octaves: 5, persistence: 0.5 });
        break;
      case 'worley':
        const w = this.worleyNoise(nx, ny);
        dx = w.dx; dy = w.dy;
        break;
      case 'voronoi':
        const v = this.voronoiNoise(nx, ny);
        dx = v.dx; dy = v.dy;
        break;
      case 'domain':
        const warpedX = x + this.noiseGen.get2D(x, y, scale * 2) * amount * 0.5;
        const warpedY = y + this.noiseGen.get2D(x + 3000, y + 3000, scale * 2) * amount * 0.5;
        dx = this.noiseGen.get2D(warpedX, warpedY, scale);
        dy = this.noiseGen.get2D(warpedX + 5000, warpedY + 5000, scale);
        break;
      case 'waves':
        const freqX = (2 * Math.PI) / (scale * 0.5);
        const freqY = (2 * Math.PI) / (scale * 0.5);
        dx = Math.sin(y * freqX + x * 0.01);
        dy = Math.sin(x * freqY + y * 0.01);
        break;
      case 'circular':
        const distC = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const angleC = Math.atan2(y - cy, x - cx);
        const radialWarp = Math.sin(distC / scale * Math.PI * 2);
        dx = Math.cos(angleC) * radialWarp;
        dy = Math.sin(angleC) * radialWarp;
        break;
      case 'oval':
        const distOX = (x - cx) / cx;
        const distOY = (y - cy) / cy;
        const distO = Math.sqrt(distOX ** 2 + distOY ** 2);
        const angleO = Math.atan2(distOY, distOX);
        const ovalWarp = Math.sin(distO * Math.PI * scale / 100);
        dx = Math.cos(angleO) * ovalWarp * (1 + 0.5 * Math.cos(angleO * 2));
        dy = Math.sin(angleO) * ovalWarp * (1 + 0.5 * Math.sin(angleO * 2));
        break;
      case 'rows':
        dx = 0; dy = Math.sin(y / scale * Math.PI * 4);
        break;
      case 'columns':
        dx = Math.sin(x / scale * Math.PI * 4); dy = 0;
        break;
      case 'gravity':
        const gravityStrength = 1 - (y / this.height);
        dx = this.noiseGen.get2D(x, y, scale) * 0.3;
        dy = gravityStrength * gravityStrength;
        break;
      default:
        dx = this.noiseGen.get2D(x, y, scale);
        dy = this.noiseGen.get2D(x + 5000, y + 5000, scale);
    }
    return { x: x + dx * amount, y: y + dy * amount };
  }

  valueNoise(nx, ny, scale) {
    const gridSize = scale / 50;
    const gx = nx * gridSize, gy = ny * gridSize;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0;
    const hash = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453;
      return n - Math.floor(n);
    };
    const v00 = hash(x0, y0) * 2 - 1, v10 = hash(x0 + 1, y0) * 2 - 1;
    const v01 = hash(x0, y0 + 1) * 2 - 1, v11 = hash(x0 + 1, y0 + 1) * 2 - 1;
    const top = v00 + fx * (v10 - v00);
    const bottom = v01 + fx * (v11 - v01);
    return top + fy * (bottom - top);
  }

  smoothNoise(nx, ny, scale) {
    const gridSize = scale / 50;
    const gx = nx * gridSize, gy = ny * gridSize;
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    let fx = gx - x0, fy = gy - y0;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const hash = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453;
      return n - Math.floor(n);
    };
    const v00 = hash(x0, y0) * 2 - 1, v10 = hash(x0 + 1, y0) * 2 - 1;
    const v01 = hash(x0, y0 + 1) * 2 - 1, v11 = hash(x0 + 1, y0 + 1) * 2 - 1;
    const top = v00 + fx * (v10 - v00);
    const bottom = v01 + fx * (v11 - v01);
    return top + fy * (bottom - top);
  }

  worleyNoise(nx, ny) {
    let minDist = Infinity, closestPoint = { x: 0, y: 0 };
    for (const point of this.cellPoints) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const px = point.x + ox, py = point.y + oy;
          const dist = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
          if (dist < minDist) { minDist = dist; closestPoint = { x: px, y: py }; }
        }
      }
    }
    return { dx: (nx - closestPoint.x) * 4, dy: (ny - closestPoint.y) * 4, dist: minDist };
  }

  voronoiNoise(nx, ny) {
    let minDist1 = Infinity, minDist2 = Infinity, closest1 = { x: 0, y: 0 };
    for (const point of this.cellPoints) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const px = point.x + ox, py = point.y + oy;
          const dist = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
          if (dist < minDist1) { minDist2 = minDist1; minDist1 = dist; closest1 = { x: px, y: py }; }
          else if (dist < minDist2) { minDist2 = dist; }
        }
      }
    }
    const edge = minDist2 - minDist1;
    return { dx: (nx - closest1.x) * 4 + edge * 2, dy: (ny - closest1.y) * 4 + edge * 2, dist: minDist1, edge };
  }

  addGrain(color, x, y) {
    if (this.noise === 0) return color;
    const grainAmount = (this.noise / 100) * 50;
    const grain = this.noiseGen.get2D(x * 3, y * 3, 1) * grainAmount;
    return {
      r: Math.max(0, Math.min(255, color.r + grain)),
      g: Math.max(0, Math.min(255, color.g + grain)),
      b: Math.max(0, Math.min(255, color.b + grain)),
    };
  }

  getPixelColor(x, y) {
    const warped = this.warpCoordinates(x, y);
    const u = warped.x / this.width;
    const v = warped.y / this.height;
    let color = this.gradient.getColorAt(u, v);
    color = this.addGrain(color, x, y);
    return color;
  }

  render() {
    const pixels = new Uint8ClampedArray(this.width * this.height * 4);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const color = this.getPixelColor(x, y);
        const i = (y * this.width + x) * 4;
        pixels[i] = color.r;
        pixels[i + 1] = color.g;
        pixels[i + 2] = color.b;
        pixels[i + 3] = 255;
      }
    }
    return pixels;
  }
}

// Box blur (same as CLI)
function boxBlur(data, width, height, radius) {
  if (radius <= 0) return data;
  const output = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const i = (ny * width + nx) * 4;
          r += data[i]; g += data[i + 1]; b += data[i + 2];
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

// ============================================
// UI STATE & RENDERING
// ============================================
// Initial palette will be generated using Analogous algorithm
let colors = [];
let palettes = []; // Will be loaded from nice-color-palettes

// Load curated palettes
fetch('https://unpkg.com/nice-color-palettes@3.0.0/1000.json')
  .then(r => r.json())
  .then(data => { palettes = data; })
  .catch(() => { console.warn('Could not load color palettes'); });
let positions = []; // {x, y, scale} for each color (0-1 normalized)
let activeColorIndex = -1;
let isDragging = false;
let showMarkers = false;

// Debounce utility
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

const debouncedRender = debounce(render, 100);

// Generate positions based on selected algorithm
function generatePositions() {
  const seed = +seedInput.value;
  const rand = mulberry32(seed);
  const count = colors.length;
  const positionType = positionTypeInput.value;

  switch (positionType) {
    case 'grid':
      // Arrange in a grid
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      positions = colors.map((_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          x: 0.15 + (col / Math.max(1, cols - 1)) * 0.7,
          y: 0.15 + (row / Math.max(1, rows - 1)) * 0.7,
          scale: 0.8 + rand() * 0.4
        };
      });
      break;

    case 'centered':
      // All near center with small variations
      positions = colors.map(() => ({
        x: 0.4 + rand() * 0.2,
        y: 0.4 + rand() * 0.2,
        scale: 0.8 + rand() * 0.4
      }));
      break;

    case 'edges':
      // Concentrated around edges
      positions = colors.map(() => {
        const edge = Math.floor(rand() * 4); // 0=top, 1=right, 2=bottom, 3=left
        let x, y;

        switch (edge) {
          case 0: // top
            x = 0.1 + rand() * 0.8;
            y = 0.05 + rand() * 0.2;
            break;
          case 1: // right
            x = 0.75 + rand() * 0.2;
            y = 0.1 + rand() * 0.8;
            break;
          case 2: // bottom
            x = 0.1 + rand() * 0.8;
            y = 0.75 + rand() * 0.2;
            break;
          default: // left
            x = 0.05 + rand() * 0.2;
            y = 0.1 + rand() * 0.8;
        }

        return { x, y, scale: 0.8 + rand() * 0.4 };
      });
      break;

    case 'random':
    default:
      // Random positions (original algorithm)
      positions = colors.map(() => ({
        x: 0.15 + rand() * 0.7,
        y: 0.15 + rand() * 0.7,
        scale: 0.8 + rand() * 0.4
      }));
  }
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// DOM
const gradientContainer = document.getElementById('gradient');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const warpInput = document.getElementById('warp');
const warpSizeInput = document.getElementById('warp-size');
const warpTypeInput = document.getElementById('warp-type');
const positionTypeInput = document.getElementById('position-type');
const noiseInput = document.getElementById('noise');
const seedInput = document.getElementById('seed');
const colorsList = document.getElementById('colors-list');
const codeOutput = document.getElementById('code-output');

// Base64 URL-safe alphabet
const B64_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_';

// Pack bits into base64 string
function packBits(bits) {
  let result = '';
  for (let i = 0; i < bits.length; i += 6) {
    const chunk = bits.slice(i, i + 6).padEnd(6, '0');
    const value = parseInt(chunk, 2);
    result += B64_CHARS[value];
  }
  return result;
}

// Unpack base64 string to bits
function unpackBits(str) {
  let bits = '';
  for (let i = 0; i < str.length; i++) {
    const value = B64_CHARS.indexOf(str[i]);
    if (value === -1) return null; // Invalid character
    bits += value.toString(2).padStart(6, '0');
  }
  return bits;
}

// Add bits to bit string
function addBits(bits, value, length) {
  return bits + value.toString(2).padStart(length, '0');
}

// Read bits from bit string
function readBits(bits, pos, length) {
  return { value: parseInt(bits.substr(pos, length), 2), pos: pos + length };
}

// Encode settings to compact base64 hash
function encodeSettings() {
  const warpTypes = ['simplex', 'fbm', 'domain', 'circular', 'oval', 'waves', 'rows', 'columns', 'gravity', 'flat'];
  const positionTypes = ['random', 'grid', 'centered', 'edges'];
  const algorithms = ['analogous', 'complementary', 'monochromatic', 'triadic', 'curated'];

  let bits = '';
  // Pack settings into bits
  bits = addBits(bits, parseInt(widthInput.value), 11);           // 11 bits: 0-2047
  bits = addBits(bits, parseInt(heightInput.value), 11);          // 11 bits: 0-2047
  bits = addBits(bits, parseInt(warpInput.value), 7);             // 7 bits: 0-100
  bits = addBits(bits, parseInt(warpSizeInput.value), 10);        // 10 bits: 0-1023
  bits = addBits(bits, warpTypes.indexOf(warpTypeInput.value), 4); // 4 bits: 0-15
  bits = addBits(bits, positionTypes.indexOf(positionTypeInput.value), 2); // 2 bits: 0-3
  bits = addBits(bits, parseInt(noiseInput.value), 7);            // 7 bits: 0-100
  bits = addBits(bits, parseInt(seedInput.value), 10);            // 10 bits: 0-999
  bits = addBits(bits, algorithms.indexOf(document.getElementById('color-algorithm').value), 3); // 3 bits: 0-7
  bits = addBits(bits, colors.length, 4);                         // 4 bits: 0-15

  // Pack colors (24 bits each: RGB)
  for (const color of colors) {
    const rgb = parseInt(color.replace('#', ''), 16);
    bits = addBits(bits, rgb, 24);
  }

  // Pack positions (26 bits each: x:11, y:11, scale:4)
  const w = parseInt(widthInput.value);
  const h = parseInt(heightInput.value);
  for (const pos of positions) {
    bits = addBits(bits, Math.round(pos.x * w), 11);              // x as absolute pixels
    bits = addBits(bits, Math.round(pos.y * h), 11);              // y as absolute pixels
    bits = addBits(bits, Math.round((pos.scale - 0.8) * 15 / 0.4), 4); // scale: 0.8-1.2 → 0-15
  }

  return packBits(bits);
}

// Decode settings from compact base64 hash
function decodeSettings(hash) {
  if (!hash || hash.length < 10) return false;

  const bits = unpackBits(hash);
  if (!bits) return false;

  const warpTypes = ['simplex', 'fbm', 'domain', 'circular', 'oval', 'waves', 'rows', 'columns', 'gravity', 'flat'];
  const positionTypes = ['random', 'grid', 'centered', 'edges'];
  const algorithms = ['analogous', 'complementary', 'monochromatic', 'triadic', 'curated'];

  let pos = 0;
  let r;

  r = readBits(bits, pos, 11); widthInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 11); heightInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 7); warpInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 10); warpSizeInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 4); warpTypeInput.value = warpTypes[r.value] || 'simplex'; pos = r.pos;
  r = readBits(bits, pos, 2); positionTypeInput.value = positionTypes[r.value] || 'random'; pos = r.pos;
  r = readBits(bits, pos, 7); noiseInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 10); seedInput.value = r.value; pos = r.pos;
  r = readBits(bits, pos, 3); document.getElementById('color-algorithm').value = algorithms[r.value] || 'analogous'; pos = r.pos;
  r = readBits(bits, pos, 4); const colorCount = r.value; pos = r.pos;

  // Decode colors (24 bits each)
  colors = [];
  for (let i = 0; i < colorCount; i++) {
    if (pos + 24 <= bits.length) {
      r = readBits(bits, pos, 24);
      colors.push('#' + r.value.toString(16).padStart(6, '0'));
      pos = r.pos;
    }
  }

  // Decode positions (26 bits each: x:11, y:11, scale:4)
  const w = parseInt(widthInput.value);
  const h = parseInt(heightInput.value);
  positions = [];
  for (let i = 0; i < colorCount; i++) {
    if (pos + 26 <= bits.length) {
      r = readBits(bits, pos, 11); const x = r.value / w; pos = r.pos;
      r = readBits(bits, pos, 11); const y = r.value / h; pos = r.pos;
      r = readBits(bits, pos, 4); const scale = r.value / 15 * 0.4 + 0.8; pos = r.pos;
      positions.push({ x, y, scale });
    } else {
      break;
    }
  }

  // If positions weren't in the hash or incomplete, generate them
  if (positions.length < colorCount) {
    generatePositions();
  }

  return true;
}

// Update URL with current settings
function updateURL() {
  const hash = encodeSettings();
  const newURL = window.location.pathname + '#' + hash;
  window.history.replaceState({}, '', newURL);
}

function render() {
  const startTime = performance.now();

  const w = +widthInput.value || 1024;
  const h = +heightInput.value || 1024;
  const warp = +warpInput.value;
  const warpSize = +warpSizeInput.value;
  const warpShape = warpTypeInput.value;
  const noise = +noiseInput.value;
  const seed = +seedInput.value;

  // Ensure positions array matches colors
  while (positions.length < colors.length) {
    const rand = mulberry32(seed + positions.length * 1000);
    positions.push({ x: 0.15 + rand() * 0.7, y: 0.15 + rand() * 0.7, scale: 0.8 + rand() * 0.4 });
  }
  while (positions.length > colors.length) {
    positions.pop();
  }

  canvas.width = w;
  canvas.height = h;

  // Set aspect ratio using CSS
  gradientContainer.style.aspectRatio = `${w} / ${h}`;

  // Render using radial gradients at positions
  const baseRadius = Math.min(w, h) * 0.5;
  const noiseGen = new NoiseGenerator(seed);

  // Create pixel array
  const pixels = new Uint8ClampedArray(w * h * 4);

  // Fill with last color as background
  const bgColor = hexToRgb(colors[colors.length - 1] || '#ffffff');
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = bgColor.r;
    pixels[i + 1] = bgColor.g;
    pixels[i + 2] = bgColor.b;
    pixels[i + 3] = 255;
  }

  // Pre-calculate warp for all pixels (once per pixel instead of once per color per pixel)
  const warpedCoords = new Float32Array(w * h * 2); // x, y pairs
  if (warp > 0 && warpShape !== 'flat') {
    const amount = (warp / 100) * Math.min(w, h) * 0.3;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let dx = 0, dy = 0;

        switch (warpShape) {
          case 'simplex':
            dx = noiseGen.get2D(x, y, warpSize);
            dy = noiseGen.get2D(x + 5000, y + 5000, warpSize);
            break;
          case 'fbm':
            dx = noiseGen.fbm2D(x, y, { scale: warpSize, octaves: 5, persistence: 0.5 });
            dy = noiseGen.fbm2D(x + 5000, y + 5000, { scale: warpSize, octaves: 5, persistence: 0.5 });
            break;
          case 'waves':
            const freq = (2 * Math.PI) / (warpSize * 0.5);
            dx = Math.sin(y * freq + x * 0.01);
            dy = Math.sin(x * freq + y * 0.01);
            break;
          case 'circular':
            const distC = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
            const angleC = Math.atan2(y - h / 2, x - w / 2);
            const radialWarp = Math.sin(distC / warpSize * Math.PI * 2);
            dx = Math.cos(angleC) * radialWarp;
            dy = Math.sin(angleC) * radialWarp;
            break;
          case 'domain':
            // Domain warping
            const warpedX = x + noiseGen.get2D(x, y, warpSize * 2) * amount * 0.5;
            const warpedY = y + noiseGen.get2D(x + 3000, y + 3000, warpSize * 2) * amount * 0.5;
            dx = noiseGen.get2D(warpedX, warpedY, warpSize);
            dy = noiseGen.get2D(warpedX + 5000, warpedY + 5000, warpSize);
            break;
          case 'oval':
            const distOX = (x - w / 2) / (w / 2);
            const distOY = (y - h / 2) / (h / 2);
            const distO = Math.sqrt(distOX ** 2 + distOY ** 2);
            const angleO = Math.atan2(distOY, distOX);
            const ovalWarp = Math.sin(distO * Math.PI * warpSize / 100);
            dx = Math.cos(angleO) * ovalWarp * (1 + 0.5 * Math.cos(angleO * 2));
            dy = Math.sin(angleO) * ovalWarp * (1 + 0.5 * Math.sin(angleO * 2));
            break;
          case 'rows':
            dx = 0;
            dy = Math.sin(y / warpSize * Math.PI * 4);
            break;
          case 'columns':
            dx = Math.sin(x / warpSize * Math.PI * 4);
            dy = 0;
            break;
          case 'gravity':
            const gravityStrength = 1 - (y / h);
            dx = noiseGen.get2D(x, y, warpSize) * 0.3;
            dy = gravityStrength * gravityStrength;
            break;
          default:
            dx = noiseGen.get2D(x, y, warpSize);
            dy = noiseGen.get2D(x + 5000, y + 5000, warpSize);
        }
        const idx = (y * w + x) * 2;
        warpedCoords[idx] = x + dx * amount;
        warpedCoords[idx + 1] = y + dy * amount;
      }
    }
  } else {
    // No warp - just copy original coordinates
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 2;
        warpedCoords[idx] = x;
        warpedCoords[idx + 1] = y;
      }
    }
  }

  // Draw each color as a radial gradient (back to front)
  for (let ci = colors.length - 1; ci >= 0; ci--) {
    const color = hexToRgb(colors[ci]);
    const pos = positions[ci];
    const cx = pos.x * w;
    const cy = pos.y * h;
    const radius = baseRadius * pos.scale;

    // Bounding box optimization
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(w - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(h - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const warpIdx = (y * w + x) * 2;
        const wx = warpedCoords[warpIdx];
        const wy = warpedCoords[warpIdx + 1];

        // Distance from warped position to circle center (squared to avoid sqrt)
        const dx = wx - cx;
        const dy = wy - cy;
        const distSq = dx * dx + dy * dy;
        const radiusSq = radius * radius;

        if (distSq < radiusSq) {
          const dist = Math.sqrt(distSq);

          // Smooth falloff
          let alpha = 1 - (dist / radius);
          alpha = alpha * alpha * (3 - 2 * alpha); // smoothstep

          const i = (y * w + x) * 4;
          // Blend with existing color
          pixels[i] = pixels[i] * (1 - alpha) + color.r * alpha;
          pixels[i + 1] = pixels[i + 1] * (1 - alpha) + color.g * alpha;
          pixels[i + 2] = pixels[i + 2] * (1 - alpha) + color.b * alpha;
        }
      }
    }
  }

  // Add noise/grain
  if (noise > 0) {
    const grainAmount = (noise / 100) * 50;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const grain = noiseGen.get2D(x * 3, y * 3, 1) * grainAmount;
        const i = (y * w + x) * 4;
        pixels[i] = Math.max(0, Math.min(255, pixels[i] + grain));
        pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + grain));
        pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + grain));
      }
    }
  }

  // Draw to canvas
  const imageData = new ImageData(pixels, w, h);
  ctx.putImageData(imageData, 0, 0);

  // Update debug markers (but not during drag - we update those directly)
  if (showMarkers && !isDragging) {
    renderDebugMarkers();
  }

  updateCode();
  updateURL();

  const endTime = performance.now();
  console.log(`Render time: ${(endTime - startTime).toFixed(2)}ms (${w}x${h})`);
}

function renderDebugMarkers() {
  // Remove existing markers
  gradientContainer.querySelectorAll('.debug-marker').forEach(m => m.remove());

  // Use display size for marker positioning
  const displayW = gradientContainer.clientWidth;
  const displayH = gradientContainer.clientHeight;
  const baseRadius = Math.min(displayW, displayH) * 0.5;

  positions.forEach((pos, i) => {
    const cx = pos.x * displayW;
    const cy = pos.y * displayH;
    const radius = baseRadius * pos.scale;

    // Radius indicator
    const radiusEl = document.createElement('div');
    radiusEl.className = 'debug-marker debug-radius';
    radiusEl.dataset.index = i;
    radiusEl.style.left = cx + 'px';
    radiusEl.style.top = cy + 'px';
    radiusEl.style.width = (radius * 2) + 'px';
    radiusEl.style.height = (radius * 2) + 'px';
    gradientContainer.appendChild(radiusEl);

    // Center handle
    const centerEl = document.createElement('div');
    centerEl.className = 'debug-marker debug-center';
    centerEl.dataset.index = i;
    centerEl.style.left = cx + 'px';
    centerEl.style.top = cy + 'px';
    centerEl.style.backgroundColor = colors[i];
    gradientContainer.appendChild(centerEl);
  });
}

function removeDebugMarkers() {
  gradientContainer.querySelectorAll('.debug-marker').forEach(m => m.remove());
}

function updateCode() {
  codeOutput.textContent = generateCLI();
}

function generateCLI() {
  const colorsStr = colors.map(c => c.replace('#', '')).join(';');
  const w = widthInput.value;
  const h = heightInput.value;
  const warp = warpInput.value;
  const warpSize = warpSizeInput.value;
  const warpType = warpTypeInput.value;
  const positionType = positionTypeInput.value;
  const noise = noiseInput.value;
  const seed = seedInput.value;
  const format = document.getElementById('download-format').value;
  const ext = format === 'png' ? 'png' : 'jpg';
  return `warpgrad -W ${w} -H ${h} --colors '${colorsStr}' -w ${warp} -s ${warpSize} -t ${warpType} -p ${positionType} -n ${noise} --seed ${seed} -o output.${ext}`;
}

let sortable = null;

function renderColorsList() {
  colorsList.innerHTML = '';
  colors.forEach((color, i) => {
    const item = document.createElement('div');
    item.className = 'color-item';
    item.dataset.index = i;
    item.innerHTML = `
      <input type="color" class="color-picker" value="${color}" data-index="${i}">
      <input type="text" class="color-hex" value="${color.replace('#', '')}" data-index="${i}">
      <button class="color-remove" data-index="${i}">&times;</button>
    `;
    colorsList.appendChild(item);
  });

  colorsList.querySelectorAll('.color-picker').forEach(el => {
    el.addEventListener('input', e => {
      colors[+e.target.dataset.index] = e.target.value;
      e.target.nextElementSibling.value = e.target.value.replace('#', '');
      debouncedRender();
    });
  });

  colorsList.querySelectorAll('.color-hex').forEach(el => {
    el.addEventListener('input', e => {
      const hex = '#' + e.target.value.replace('#', '');
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        colors[+e.target.dataset.index] = hex;
        e.target.previousElementSibling.value = hex;
        debouncedRender();
      }
    });
  });

  colorsList.querySelectorAll('.color-remove').forEach(el => {
    el.addEventListener('click', e => {
      if (colors.length > 2) {
        const idx = +e.target.dataset.index;
        colors.splice(idx, 1);
        positions.splice(idx, 1);
        renderColorsList();
        debouncedRender();
      }
    });
  });

  if (sortable) sortable.destroy();
  sortable = new Sortable(colorsList, {
    animation: 300,
    easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    forceFallback: true,
    onStart: () => colorsList.classList.add('sorting'),
    onEnd: (evt) => {
      colorsList.classList.remove('sorting');
      if (evt.oldIndex !== evt.newIndex) {
        const [movedColor] = colors.splice(evt.oldIndex, 1);
        colors.splice(evt.newIndex, 0, movedColor);
        const [movedPos] = positions.splice(evt.oldIndex, 1);
        positions.splice(evt.newIndex, 0, movedPos);
        updateColorIndices();
        debouncedRender();
      }
    }
  });
}

function updateColorIndices() {
  colorsList.querySelectorAll('.color-item').forEach((item, i) => {
    item.dataset.index = i;
    item.querySelector('.color-picker').dataset.index = i;
    item.querySelector('.color-hex').dataset.index = i;
    item.querySelector('.color-remove').dataset.index = i;
  });
}

function randomColor() {
  return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

// HSL to RGB conversion
function hslToRgb(h, s, l) {
  h = h / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function rgbToHex(rgb) {
  return '#' + [rgb.r, rgb.g, rgb.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// RGB to HSL conversion
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
    h *= 360;
  }
  return { h, s, l };
}

// Check if hex color is super light (lightness >= 0.75)
function isSuperLight(hexColor) {
  const rgb = hexToRgb(hexColor);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return hsl.l >= 0.75;
}

// Ensure at least one super light color in palette
function ensureSuperLightColor(colors) {
  // Check if there's already a super light color
  const hasSuperLight = colors.some(c => isSuperLight(c));

  if (!hasSuperLight && colors.length > 0) {
    // Replace the last color with a super light version
    const lastColor = colors[colors.length - 1];
    const rgb = hexToRgb(lastColor);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    // Make it super light (0.8-0.85 lightness, reduced saturation)
    const superLight = hslToRgb(hsl.h, hsl.s * 0.5, 0.8 + Math.random() * 0.05);
    colors[colors.length - 1] = rgbToHex(superLight);
  }

  return colors;
}

// Color harmony algorithms
function generateAnalogousColors(count) {
  const baseHue = Math.random() * 360;
  const colors = [];
  const spread = 60; // degrees on color wheel

  for (let i = 0; i < count; i++) {
    const hue = (baseHue + (i / (count - 1)) * spread - spread / 2) % 360;
    // 60% chance of very light color
    const isVeryLight = Math.random() < 0.6;
    const sat = isVeryLight
      ? 0.2 + Math.random() * 0.2  // Low saturation (0.2-0.4) for pastel
      : 0.5 + Math.random() * 0.3; // Higher saturation (0.5-0.8) for vibrant
    const light = isVeryLight
      ? 0.78 + Math.random() * 0.12  // Very light (0.78-0.9)
      : 0.4 + Math.random() * 0.3;   // Medium (0.4-0.7)
    colors.push(rgbToHex(hslToRgb(hue, sat, light)));
  }
  return ensureSuperLightColor(colors);
}

function generateComplementaryColors(count) {
  const baseHue = Math.random() * 360;
  const colors = [];

  for (let i = 0; i < count; i++) {
    // Alternate between base hue and complement (180 degrees apart)
    const hue = i % 2 === 0 ? baseHue : (baseHue + 180) % 360;
    const isVeryLight = Math.random() < 0.6;
    const sat = isVeryLight
      ? 0.2 + Math.random() * 0.2
      : 0.5 + Math.random() * 0.3;
    const light = isVeryLight
      ? 0.78 + Math.random() * 0.12
      : 0.45 + Math.random() * 0.25;
    colors.push(rgbToHex(hslToRgb(hue, sat, light)));
  }
  return ensureSuperLightColor(colors);
}

function generateMonochromaticColors(count) {
  const baseHue = Math.random() * 360;
  const colors = [];

  for (let i = 0; i < count; i++) {
    const ratio = i / (count - 1 || 1);
    const sat = 0.2 + ratio * 0.4; // Range: 0.2-0.6
    const light = 0.4 + ratio * 0.5; // Range: 0.4-0.9
    colors.push(rgbToHex(hslToRgb(baseHue, sat, light)));
  }
  return ensureSuperLightColor(colors);
}

function generateTriadicColors(count) {
  const baseHue = Math.random() * 360;
  const colors = [];

  for (let i = 0; i < count; i++) {
    // Use 3 hues 120 degrees apart
    const hue = (baseHue + (i % 3) * 120) % 360;
    const isVeryLight = Math.random() < 0.6;
    const sat = isVeryLight
      ? 0.2 + Math.random() * 0.2
      : 0.5 + Math.random() * 0.3;
    const light = isVeryLight
      ? 0.78 + Math.random() * 0.12
      : 0.45 + Math.random() * 0.25;
    colors.push(rgbToHex(hslToRgb(hue, sat, light)));
  }
  return ensureSuperLightColor(colors);
}

// Update slider fill for WebKit browsers
function updateSliderFill(input) {
  const value = input.value;
  const min = input.min || 0;
  const max = input.max || 100;
  const percentage = ((value - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(to right, #1f2937 0%, #1f2937 ${percentage}%, #d1d5db ${percentage}%, #d1d5db 100%)`;
}

// Event listeners
[warpInput, warpSizeInput, noiseInput].forEach(input => {
  // Initialize fill
  updateSliderFill(input);

  input.addEventListener('input', () => {
    updateSliderFill(input);
    debouncedRender();
  });
});

[widthInput, heightInput].forEach(input => {
  const validateAndClamp = () => {
    // Validate and clamp to 64-2048 range
    let value = parseInt(input.value);
    if (isNaN(value) || value < 64) {
      value = 64;
    } else if (value > 2048) {
      value = 2048;
    }
    input.value = value;
  };

  input.addEventListener('blur', () => {
    validateAndClamp();
    // Positions are normalized (0-1), no need to recalculate
    debouncedRender();
  });

  input.addEventListener('change', () => {
    validateAndClamp();
    // Positions are normalized (0-1), no need to recalculate
    debouncedRender();
  });
});

// Seed input validation
const validateAndClampSeed = () => {
  let value = parseInt(seedInput.value);
  if (isNaN(value) || value < 100) {
    value = 100;
  } else if (value > 999) {
    value = 999;
  }
  seedInput.value = value;
};

seedInput.addEventListener('blur', () => {
  validateAndClampSeed();
  generatePositions();
  debouncedRender();
});

seedInput.addEventListener('change', () => {
  validateAndClampSeed();
  generatePositions();
  debouncedRender();
});

warpTypeInput.addEventListener('change', debouncedRender);

positionTypeInput.addEventListener('change', () => {
  generatePositions();
  debouncedRender();
});

document.getElementById('download-format').addEventListener('change', updateCode);

document.getElementById('add-color').addEventListener('click', () => {
  const algorithm = document.getElementById('color-algorithm').value;
  let newColor;

  switch (algorithm) {
    case 'analogous':
      // Generate analogous color based on existing colors
      if (colors.length > 0) {
        const lastColor = colors[colors.length - 1];
        const rgb = hexToRgb(lastColor);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        // Shift hue by a small amount
        const newHue = (hsl.h + 20 + Math.random() * 20) % 360;
        const isVeryLight = Math.random() < 0.6;
        const sat = isVeryLight ? 0.2 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;
        const light = isVeryLight ? 0.78 + Math.random() * 0.12 : 0.4 + Math.random() * 0.3;
        newColor = rgbToHex(hslToRgb(newHue, sat, light));
      } else {
        newColor = generateAnalogousColors(1)[0];
      }
      break;

    case 'complementary':
      // Alternate between base hue and complement
      if (colors.length > 0) {
        const lastColor = colors[colors.length - 1];
        const rgb = hexToRgb(lastColor);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const newHue = (hsl.h + 180) % 360; // Complement
        const isVeryLight = Math.random() < 0.6;
        const sat = isVeryLight ? 0.2 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;
        const light = isVeryLight ? 0.78 + Math.random() * 0.12 : 0.45 + Math.random() * 0.25;
        newColor = rgbToHex(hslToRgb(newHue, sat, light));
      } else {
        newColor = generateComplementaryColors(1)[0];
      }
      break;

    case 'monochromatic':
      // Same hue, different lightness
      if (colors.length > 0) {
        const firstColor = colors[0];
        const rgb = hexToRgb(firstColor);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const sat = 0.2 + Math.random() * 0.4;
        const light = 0.4 + Math.random() * 0.5;
        newColor = rgbToHex(hslToRgb(hsl.h, sat, light));
      } else {
        newColor = generateMonochromaticColors(1)[0];
      }
      break;

    case 'triadic':
      // Cycle through 3 hues 120 degrees apart
      if (colors.length > 0) {
        const firstColor = colors[0];
        const rgb = hexToRgb(firstColor);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const offset = (colors.length % 3) * 120;
        const newHue = (hsl.h + offset) % 360;
        const isVeryLight = Math.random() < 0.6;
        const sat = isVeryLight ? 0.2 + Math.random() * 0.2 : 0.5 + Math.random() * 0.3;
        const light = isVeryLight ? 0.78 + Math.random() * 0.12 : 0.45 + Math.random() * 0.25;
        newColor = rgbToHex(hslToRgb(newHue, sat, light));
      } else {
        newColor = generateTriadicColors(1)[0];
      }
      break;

    case 'curated':
    default:
      // Random color from a random palette
      if (palettes.length > 0) {
        const palette = palettes[Math.floor(Math.random() * palettes.length)];
        newColor = palette[Math.floor(Math.random() * palette.length)];
      } else {
        newColor = randomColor();
      }
      break;
  }

  colors.push(newColor);

  // Add position for new color
  const seed = +seedInput.value;
  const rand = mulberry32(seed + colors.length);
  const positionType = positionTypeInput.value;

  let newPosition;
  switch (positionType) {
    case 'centered':
      newPosition = {
        x: 0.4 + rand() * 0.2,
        y: 0.4 + rand() * 0.2,
        scale: 0.8 + rand() * 0.4
      };
      break;
    case 'edges':
      const edge = Math.floor(rand() * 4);
      let x, y;
      switch (edge) {
        case 0: x = 0.1 + rand() * 0.8; y = 0.05 + rand() * 0.2; break;
        case 1: x = 0.75 + rand() * 0.2; y = 0.1 + rand() * 0.8; break;
        case 2: x = 0.1 + rand() * 0.8; y = 0.75 + rand() * 0.2; break;
        default: x = 0.05 + rand() * 0.2; y = 0.1 + rand() * 0.8;
      }
      newPosition = { x, y, scale: 0.8 + rand() * 0.4 };
      break;
    case 'grid':
    case 'random':
    default:
      newPosition = {
        x: 0.15 + rand() * 0.7,
        y: 0.15 + rand() * 0.7,
        scale: 0.8 + rand() * 0.4
      };
  }

  positions.push(newPosition);
  renderColorsList();
  debouncedRender();
});

document.getElementById('randomize-colors').addEventListener('click', () => {
  const currentCount = colors.length;
  const algorithm = document.getElementById('color-algorithm').value;

  switch (algorithm) {
    case 'analogous':
      colors = generateAnalogousColors(currentCount);
      break;

    case 'complementary':
      colors = generateComplementaryColors(currentCount);
      break;

    case 'monochromatic':
      colors = generateMonochromaticColors(currentCount);
      break;

    case 'triadic':
      colors = generateTriadicColors(currentCount);
      break;

    case 'curated':
    default:
      // Curated palettes algorithm
      if (palettes.length > 0) {
        // Pick a random curated palette (5 colors)
        const palette = [...palettes[Math.floor(Math.random() * palettes.length)]];

        if (currentCount <= 5) {
          // Just take colors from palette
          colors = palette.slice(0, currentCount);
        } else {
          // Use all 5 palette colors and interpolate more
          colors = [...palette];

          // Find the lightest color for interpolation
          let lightestIdx = 0;
          let maxL = 0;
          palette.forEach((hex, i) => {
            const lab = rgbToOklab(hexToRgb(hex));
            if (lab.L > maxL) {
              maxL = lab.L;
              lightestIdx = i;
            }
          });

          // Add interpolated colors to reach currentCount
          while (colors.length < currentCount) {
            if (colors.length % 2 === 1) {
              // Add a lighter version of the lightest color
              const lightestLab = rgbToOklab(hexToRgb(palette[lightestIdx]));
              const lighterLab = {
                L: Math.min(1, lightestLab.L * (1.1 + Math.random() * 0.1)),
                a: lightestLab.a * (0.4 + Math.random() * 0.2),
                b: lightestLab.b * (0.4 + Math.random() * 0.2)
              };
              const lighterRgb = oklabToRgb(lighterLab);
              const lighterHex = '#' + [lighterRgb.r, lighterRgb.g, lighterRgb.b].map(v => v.toString(16).padStart(2, '0')).join('');
              colors.push(lighterHex);
            } else {
              // Add a variant of a random color
              const randomIdx = Math.floor(Math.random() * palette.length);
              const randomLab = rgbToOklab(hexToRgb(palette[randomIdx]));
              const variantLab = {
                L: randomLab.L * (0.85 + Math.random() * 0.2),
                a: randomLab.a * (1.1 + Math.random() * 0.3),
                b: randomLab.b * (1.1 + Math.random() * 0.3)
              };
              const variantRgb = oklabToRgb(variantLab);
              const variantHex = '#' + [variantRgb.r, variantRgb.g, variantRgb.b].map(v => v.toString(16).padStart(2, '0')).join('');
              colors.push(variantHex);
            }
          }
        }
        // Ensure at least one super light color
        colors = ensureSuperLightColor(colors);
      } else {
        // Fallback to random colors if palettes not loaded
        colors = colors.map(() => randomColor());
      }
      break;
  }

  // Shuffle positions
  seedInput.value = Math.floor(Math.random() * 900) + 100; // Random 3-digit number (100-999)
  generatePositions();
  renderColorsList();
  debouncedRender();
});

document.getElementById('copy-code').addEventListener('click', () => {
  const btn = document.getElementById('copy-code');
  navigator.clipboard.writeText(codeOutput.textContent);
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>Copied!`;
  setTimeout(() => {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>CLI`;
  }, 1500);
});

// Download - uses the same canvas that's displayed
document.getElementById('download-btn').addEventListener('click', () => {
  const format = document.getElementById('download-format').value;
  const link = document.createElement('a');
  if (format === 'png') {
    link.download = 'gradient.png';
    link.href = canvas.toDataURL('image/png');
  } else {
    link.download = 'gradient.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.9);
  }
  link.click();
});

// Copy URL
document.getElementById('copy-url').addEventListener('click', () => {
  const btn = document.getElementById('copy-url');
  const url = window.location.href;
  navigator.clipboard.writeText(url);
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>Copied!`;
  setTimeout(() => {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>Copy URL`;
  }, 1500);
});

// ============================================
// DRAG INTERACTION
// ============================================
gradientContainer.addEventListener('mouseenter', () => {
  showMarkers = true;
  renderDebugMarkers();
});

gradientContainer.addEventListener('mouseleave', () => {
  if (!isDragging) {
    showMarkers = false;
    removeDebugMarkers();
  }
});

gradientContainer.addEventListener('mousedown', (e) => {
  const center = e.target.closest('.debug-center');
  if (!center) return;

  e.preventDefault();
  activeColorIndex = +center.dataset.index;
  isDragging = true;
  center.classList.add('dragging');
});

// Double-click to remove color
gradientContainer.addEventListener('dblclick', (e) => {
  const center = e.target.closest('.debug-center');
  if (!center) return;
  if (colors.length <= 2) return; // Keep at least 2 colors

  const idx = +center.dataset.index;
  colors.splice(idx, 1);
  positions.splice(idx, 1);
  renderColorsList();
  render();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging || activeColorIndex < 0) return;

  // Safety check: if mouse button is not pressed, reset drag state
  if (e.buttons === 0) {
    isDragging = false;
    activeColorIndex = -1;
    gradientContainer.querySelectorAll('.debug-center.dragging').forEach(c => c.classList.remove('dragging'));
    return;
  }

  const rect = gradientContainer.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  // Update position
  positions[activeColorIndex].x = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / w));
  positions[activeColorIndex].y = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / h));

  // Update marker position immediately (cheap) - use display size
  const displayW = gradientContainer.clientWidth;
  const displayH = gradientContainer.clientHeight;
  const center = gradientContainer.querySelector(`.debug-center[data-index="${activeColorIndex}"]`);
  const radiusEl = gradientContainer.querySelector(`.debug-radius[data-index="${activeColorIndex}"]`);
  if (center) {
    center.style.left = (positions[activeColorIndex].x * displayW) + 'px';
    center.style.top = (positions[activeColorIndex].y * displayH) + 'px';
  }
  if (radiusEl) {
    radiusEl.style.left = (positions[activeColorIndex].x * displayW) + 'px';
    radiusEl.style.top = (positions[activeColorIndex].y * displayH) + 'px';
  }

  // Debounced canvas re-render (expensive)
  debouncedRender();
});

document.addEventListener('mouseup', (e) => {
  if (!isDragging) return;

  isDragging = false;
  gradientContainer.querySelectorAll('.debug-center.dragging').forEach(c => c.classList.remove('dragging'));

  // Check if mouse left the container
  const rect = gradientContainer.getBoundingClientRect();
  const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
    e.clientY >= rect.top && e.clientY <= rect.bottom;
  if (!inside) {
    showMarkers = false;
    removeDebugMarkers();
  }

  activeColorIndex = -1;
});

// Scroll to resize
gradientContainer.addEventListener('wheel', (e) => {
  if (!showMarkers) return;

  // Find which marker is under cursor
  const center = document.elementFromPoint(e.clientX, e.clientY)?.closest('.debug-center');
  if (!center) return;

  e.preventDefault();
  const idx = +center.dataset.index;
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  positions[idx].scale = Math.max(0.3, Math.min(2, positions[idx].scale + delta));

  // Update radius indicator immediately (cheap) - use display size
  const displayW = gradientContainer.clientWidth;
  const displayH = gradientContainer.clientHeight;
  const baseRadius = Math.min(displayW, displayH) * 0.5;
  const radiusEl = gradientContainer.querySelector(`.debug-radius[data-index="${idx}"]`);
  if (radiusEl) {
    const newRadius = baseRadius * positions[idx].scale;
    radiusEl.style.width = (newRadius * 2) + 'px';
    radiusEl.style.height = (newRadius * 2) + 'px';
  }

  // Debounced canvas re-render (expensive)
  debouncedRender();
}, { passive: false });

// Resize handler
window.addEventListener('resize', debounce(() => {
  render();
}, 200));

// Handle browser back/forward navigation
window.addEventListener('hashchange', () => {
  if (loadFromURL()) {
    generatePositions();
    renderColorsList();
    render();
  }
});

// Load settings from URL hash
function loadFromURL() {
  const hash = window.location.hash.substring(1); // Remove '#'

  if (hash && decodeSettings(hash)) {
    // Settings loaded successfully from hash
    // Update slider fills
    [warpInput, warpSizeInput, noiseInput].forEach(input => {
      updateSliderFill(input);
    });
    return true;
  }

  return false;
}

// Initialize
const hasHash = loadFromURL();

// If no hash, generate random seed and colors
if (!hasHash) {
  seedInput.value = Math.floor(Math.random() * 900) + 100; // Random 3-digit number (100-999)
  colors = generateAnalogousColors(4);
  generatePositions();
} else if (positions.length === 0) {
  // Hash loaded but no positions in hash (backward compatibility)
  generatePositions();
}

renderColorsList();
render();
updateURL();
