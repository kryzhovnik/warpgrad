import { hexToRgb, bilinearInterpolate, rgbToOklab, oklabToRgb } from './color.js';
import { NoiseGenerator } from './noise.js';

// Available position types for color centers
export const POSITION_TYPES = ['random', 'grid', 'centered', 'edges'];

// Available warp shape types
export const WARP_SHAPES = [
  'flat',
  'simplex',
  'circular',
  'value',
  'worley',
  'fbm',
  'voronoi',
  'domain',
  'waves',
  'smooth',
  'oval',
  'rows',
  'columns',
  'gravity',
];

// Seeded PRNG (mulberry32)
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MeshGradient {
  constructor(colors, width, height, options = {}) {
    this.width = width;
    this.height = height;
    this.colors = colors.map(c => (typeof c === 'string' ? hexToRgb(c) : c));
    this.colorsLab = this.colors.map(rgbToOklab);
    this.options = {
      gridSize: options.gridSize || this.calculateGridSize(colors.length),
      sharp: options.sharp ?? false,
      positionType: options.positionType ?? 'grid',
      seed: options.seed ?? 0,
    };

    this.positions = this.generatePositions();
    this.grid = this.createColorGrid();
  }

  calculateGridSize(numColors) {
    const sqrt = Math.ceil(Math.sqrt(numColors));
    return { cols: sqrt, rows: Math.ceil(numColors / sqrt) };
  }

  generatePositions() {
    const rand = mulberry32(this.options.seed);
    const count = this.colors.length;
    const positionType = this.options.positionType;

    switch (positionType) {
      case 'centered':
        // All near center with small variations
        return this.colors.map(() => ({
          x: 0.4 + rand() * 0.2,
          y: 0.4 + rand() * 0.2,
        }));

      case 'edges':
        // Concentrated around edges
        return this.colors.map(() => {
          const edge = Math.floor(rand() * 4);
          let x, y;
          switch (edge) {
            case 0: x = 0.1 + rand() * 0.8; y = 0.05 + rand() * 0.2; break;
            case 1: x = 0.75 + rand() * 0.2; y = 0.1 + rand() * 0.8; break;
            case 2: x = 0.1 + rand() * 0.8; y = 0.75 + rand() * 0.2; break;
            default: x = 0.05 + rand() * 0.2; y = 0.1 + rand() * 0.8;
          }
          return { x, y };
        });

      case 'random':
        // Random positions
        return this.colors.map(() => ({
          x: 0.15 + rand() * 0.7,
          y: 0.15 + rand() * 0.7,
        }));

      case 'grid':
      default: {
        // Arrange in a grid
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        return this.colors.map((_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return {
            x: cols === 1 ? 0.5 : 0.15 + (col / (cols - 1)) * 0.7,
            y: rows === 1 ? 0.5 : 0.15 + (row / (rows - 1)) * 0.7,
          };
        });
      }
    }
  }

  createColorGrid() {
    const { cols, rows } = this.options.gridSize;
    const positions = this.positions;
    const grid = [];

    for (let row = 0; row < rows; row++) {
      const gridRow = [];
      for (let col = 0; col < cols; col++) {
        const colorIndex = row * cols + col;
        const color = this.colors[colorIndex % this.colors.length];
        const pos = positions[colorIndex % positions.length];
        gridRow.push({
          x: pos.x,
          y: pos.y,
          color,
        });
      }
      grid.push(gridRow);
    }

    return grid;
  }

  getColorAt(u, v) {
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));

    if (this.options.positionType !== 'grid') {
      return this.getPointColorAt(u, v);
    }

    const { cols, rows } = this.options.gridSize;
    const cellX = u * (cols - 1);
    const cellY = v * (rows - 1);

    const col = Math.min(Math.floor(cellX), cols - 2);
    const row = Math.min(Math.floor(cellY), rows - 2);

    let localU = cellX - col;
    let localV = cellY - row;

    if (this.options.sharp) {
      localU = this.sharpen(localU);
      localV = this.sharpen(localV);
    }

    const nw = this.grid[row][col].color;
    const ne = this.grid[row][col + 1]?.color || nw;
    const sw = this.grid[row + 1]?.[col]?.color || nw;
    const se = this.grid[row + 1]?.[col + 1]?.color || nw;

    return bilinearInterpolate(nw, ne, sw, se, localU, localV);
  }

  getPointColorAt(u, v) {
    const minDim = Math.min(this.width, this.height);
    const scaleX = this.width / minDim;
    const scaleY = this.height / minDim;
    const falloff = this.options.sharp ? 2 : 1;
    const power = falloff / 2;
    const epsilon = 1e-6;
    let totalWeight = 0;
    let L = 0;
    let a = 0;
    let b = 0;

    for (let i = 0; i < this.positions.length; i++) {
      const pos = this.positions[i];
      const dx = (u - pos.x) * scaleX;
      const dy = (v - pos.y) * scaleY;
      const distSq = dx * dx + dy * dy;

      if (distSq < epsilon) {
        return this.colors[i];
      }

      const weight = 1 / Math.pow(distSq + epsilon, power);
      const lab = this.colorsLab[i];
      L += lab.L * weight;
      a += lab.a * weight;
      b += lab.b * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return this.colors[0];
    }

    return oklabToRgb({
      L: L / totalWeight,
      a: a / totalWeight,
      b: b / totalWeight,
    });
  }

  sharpen(t) {
    return t * t * (3 - 2 * t);
  }

  smooth(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
}

export class WarpedGradient {
  constructor(colors, width, height, options = {}) {
    this.width = width;
    this.height = height;

    this.warp = options.warp ?? 50;
    this.warpSize = options.warpSize ?? 200;
    this.warpShape = options.warpShape ?? 'simplex';
    this.noise = options.noise ?? 0;
    this.seed = options.seed ?? Math.random() * 10000;
    this.sharp = options.sharp ?? false;
    this.positionType = options.positionType ?? 'grid';

    this.gradient = new MeshGradient(colors, width, height, {
      sharp: this.sharp,
      positionType: this.positionType,
      seed: this.seed,
    });
    this.noiseGen = new NoiseGenerator(this.seed);

    // Pre-generate Worley/Voronoi cell points
    this.cellPoints = this.generateCellPoints();
  }

  // Generate random cell points for Worley/Voronoi noise
  generateCellPoints() {
    const numCells = 16; // 4x4 grid of cells
    const points = [];
    const prng = this.noiseGen.createPRNG(this.seed + 999);

    for (let i = 0; i < numCells; i++) {
      for (let j = 0; j < numCells; j++) {
        points.push({
          x: (i + prng()) / numCells,
          y: (j + prng()) / numCells,
        });
      }
    }
    return points;
  }

  // Get warped coordinates based on warp shape
  warpCoordinates(x, y) {
    if (this.warp === 0 || this.warpShape === 'flat') {
      return { x, y };
    }

    const amount = (this.warp / 100) * Math.min(this.width, this.height) * 0.3;
    const scale = this.warpSize;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const nx = x / this.width;  // Normalized 0-1
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
        dx = w.dx;
        dy = w.dy;
        break;

      case 'voronoi':
        const v = this.voronoiNoise(nx, ny);
        dx = v.dx;
        dy = v.dy;
        break;

      case 'domain':
        // Domain warping: warp the coordinates, then sample noise at warped position
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
        const maxDist = Math.sqrt(cx ** 2 + cy ** 2);
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
        dx = 0;
        dy = Math.sin(y / scale * Math.PI * 4);
        break;

      case 'columns':
        dx = Math.sin(x / scale * Math.PI * 4);
        dy = 0;
        break;

      case 'gravity':
        // Pull towards bottom, stronger at top
        const gravityStrength = 1 - (y / this.height);
        dx = this.noiseGen.get2D(x, y, scale) * 0.3;
        dy = gravityStrength * gravityStrength;
        break;

      default:
        dx = this.noiseGen.get2D(x, y, scale);
        dy = this.noiseGen.get2D(x + 5000, y + 5000, scale);
    }

    return {
      x: x + dx * amount,
      y: y + dy * amount,
    };
  }

  // Value noise (blocky, grid-based)
  valueNoise(nx, ny, scale) {
    const gridSize = scale / 50;
    const gx = nx * gridSize;
    const gy = ny * gridSize;

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);

    const fx = gx - x0;
    const fy = gy - y0;

    // Hash function for grid values
    const hash = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453;
      return n - Math.floor(n);
    };

    const v00 = hash(x0, y0) * 2 - 1;
    const v10 = hash(x0 + 1, y0) * 2 - 1;
    const v01 = hash(x0, y0 + 1) * 2 - 1;
    const v11 = hash(x0 + 1, y0 + 1) * 2 - 1;

    // Bilinear interpolation
    const top = v00 + fx * (v10 - v00);
    const bottom = v01 + fx * (v11 - v01);
    return top + fy * (bottom - top);
  }

  // Smooth noise (cubic interpolation)
  smoothNoise(nx, ny, scale) {
    const gridSize = scale / 50;
    const gx = nx * gridSize;
    const gy = ny * gridSize;

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);

    let fx = gx - x0;
    let fy = gy - y0;

    // Smoothstep
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);

    const hash = (x, y) => {
      const n = Math.sin(x * 12.9898 + y * 78.233 + this.seed) * 43758.5453;
      return n - Math.floor(n);
    };

    const v00 = hash(x0, y0) * 2 - 1;
    const v10 = hash(x0 + 1, y0) * 2 - 1;
    const v01 = hash(x0, y0 + 1) * 2 - 1;
    const v11 = hash(x0 + 1, y0 + 1) * 2 - 1;

    const top = v00 + fx * (v10 - v00);
    const bottom = v01 + fx * (v11 - v01);
    return top + fy * (bottom - top);
  }

  // Worley noise (distance to nearest cell point)
  worleyNoise(nx, ny) {
    let minDist = Infinity;
    let closestPoint = { x: 0, y: 0 };

    for (const point of this.cellPoints) {
      // Check with wrapping for seamless tiling
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const px = point.x + ox;
          const py = point.y + oy;
          const dist = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
          if (dist < minDist) {
            minDist = dist;
            closestPoint = { x: px, y: py };
          }
        }
      }
    }

    // Direction away from closest point
    const dx = (nx - closestPoint.x) * 4;
    const dy = (ny - closestPoint.y) * 4;

    return { dx, dy, dist: minDist };
  }

  // Voronoi noise (cell-based with edge detection)
  voronoiNoise(nx, ny) {
    let minDist1 = Infinity;
    let minDist2 = Infinity;
    let closest1 = { x: 0, y: 0 };

    for (const point of this.cellPoints) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const px = point.x + ox;
          const py = point.y + oy;
          const dist = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);

          if (dist < minDist1) {
            minDist2 = minDist1;
            minDist1 = dist;
            closest1 = { x: px, y: py };
          } else if (dist < minDist2) {
            minDist2 = dist;
          }
        }
      }
    }

    // Edge factor based on difference between closest distances
    const edge = minDist2 - minDist1;
    const dx = (nx - closest1.x) * 4 + edge * 2;
    const dy = (ny - closest1.y) * 4 + edge * 2;

    return { dx, dy, dist: minDist1, edge };
  }

  addGrain(color, x, y) {
    if (this.noise === 0) {
      return color;
    }

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
