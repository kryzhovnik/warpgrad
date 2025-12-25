import { createNoise2D, createNoise3D } from 'simplex-noise';

export class NoiseGenerator {
  constructor(seed = Math.random()) {
    // Create seeded PRNG using simple LCG
    const prng = this.createPRNG(seed);
    this.noise2D = createNoise2D(prng);
    this.noise3D = createNoise3D(prng);
  }

  createPRNG(seed) {
    // Simple seeded PRNG (Mulberry32)
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

  // Get 2D noise value at position, returns -1 to 1
  get2D(x, y, scale = 1) {
    return this.noise2D(x / scale, y / scale);
  }

  // Get 3D noise value (useful for animation), returns -1 to 1
  get3D(x, y, z, scale = 1) {
    return this.noise3D(x / scale, y / scale, z / scale);
  }

  // Fractal Brownian Motion for more organic noise
  fbm2D(x, y, { octaves = 4, lacunarity = 2, persistence = 0.5, scale = 1 } = {}) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D((x * frequency) / scale, (y * frequency) / scale);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }
}
