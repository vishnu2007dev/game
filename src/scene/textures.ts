import * as THREE from 'three';

// Seeded PRNG so every surface is generated the same way on every load.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Periodic value noise. Periods are integers so the result tiles.
class ValueNoise {
  private v: Float32Array;
  constructor(private px: number, private py: number, rand: () => number) {
    this.v = new Float32Array(px * py);
    for (let i = 0; i < this.v.length; i++) this.v[i] = rand();
  }
  at(u: number, v: number): number {
    const X = u * this.px;
    const Y = v * this.py;
    const xi = Math.floor(X);
    const yi = Math.floor(Y);
    const xf = X - xi;
    const yf = Y - yi;
    const x0 = ((xi % this.px) + this.px) % this.px;
    const y0 = ((yi % this.py) + this.py) % this.py;
    const x1 = (x0 + 1) % this.px;
    const y1 = (y0 + 1) % this.py;
    const s = xf * xf * (3 - 2 * xf);
    const t = yf * yf * (3 - 2 * yf);
    const a = this.v[y0 * this.px + x0];
    const b = this.v[y0 * this.px + x1];
    const c = this.v[y1 * this.px + x0];
    const d = this.v[y1 * this.px + x1];
    return a + (b - a) * s + (c - a) * t + (a - b - c + d) * s * t;
  }
}

class Fbm {
  private layers: ValueNoise[];
  constructor(px: number, py: number, octaves: number, rand: () => number) {
    this.layers = Array.from({ length: octaves }, (_, i) => new ValueNoise(px << i, py << i, rand));
  }
  at(u: number, v: number): number {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (const l of this.layers) {
      sum += l.at(u, v) * amp;
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface SurfaceOptions {
  color: string;
  size?: number;
  seed?: number;
  /** Low frequency colour variation, 0 to 1. */
  mottle?: number;
  /** Amount of dark grime patches, 0 to 1. */
  grime?: number;
  grimeColor?: string;
  /** Number of vertical water or rust streaks. */
  streaks?: number;
  streakColor?: string;
  /** Number of fine scratches that expose bare metal. */
  scratches?: number;
  scratchColor?: string;
  rough: number;
  roughVariation?: number;
  /** Strength of the generated normal map. */
  bump?: number;
  /** Fine orange-peel texture of powder coat or paint. */
  peel?: number;
  /** Directional brushing, for aluminium. */
  brushed?: boolean;
  repeat?: [number, number];
}

export interface Surface {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

const cache = new Map<string, Surface>();
let textureScale = 1;

/** Lower texture resolution on weak devices. */
export function setTextureScale(scale: number) {
  textureScale = scale;
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return [c, ctx];
}

function finish(tex: THREE.Texture, repeat: [number, number], srgb: boolean) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds colour, roughness and normal maps for a worn painted or bare
 * metal surface. All three maps share the same random features so a
 * scratch is visible, shinier and slightly recessed at the same spot.
 */
export function makeSurface(opts: SurfaceOptions): Surface {
  const key = JSON.stringify(opts);
  const hit = cache.get(key);
  if (hit) return hit;

  const size = Math.max(128, Math.round((opts.size ?? 512) * textureScale));
  const rand = mulberry32(opts.seed ?? 7);
  const base = hexToRgb(opts.color);
  const grimeRgb = hexToRgb(opts.grimeColor ?? '#141210');

  const mottleN = new Fbm(2, 2, 3, rand);
  // Grime collects in small patches, not big clouds.
  const grimeN = new Fbm(10, 10, 4, rand);
  const peelN = new Fbm(96, 96, 2, rand);
  const brushN = opts.brushed ? new Fbm(2, 160, 2, rand) : null;

  const [colC, colX] = canvas(size);
  const [roughC, roughX] = canvas(size);
  const [hC, hX] = canvas(size);
  const col = colX.createImageData(size, size);
  const rough = roughX.createImageData(size, size);
  const height = hX.createImageData(size, size);

  const mottle = opts.mottle ?? 0.08;
  const grime = opts.grime ?? 0;
  const peel = opts.peel ?? 0.5;
  const rv = opts.roughVariation ?? 0.1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;
      const m = (mottleN.at(u, v) - 0.5) * 2 * mottle;
      const g = smooth(0.58, 0.82, grimeN.at(u, v)) * grime;
      const p = peelN.at(u, v);
      const b = brushN ? brushN.at(u, v) : 0.5;
      const shade = 1 + m + (p - 0.5) * 0.035 + (b - 0.5) * (brushN ? 0.14 : 0);
      for (let k = 0; k < 3; k++) {
        const c = base[k] * shade;
        col.data[i + k] = Math.max(0, Math.min(255, c * (1 - g * 0.75) + grimeRgb[k] * g * 0.75));
      }
      col.data[i + 3] = 255;
      const r = opts.rough + (mottleN.at(v, u) - 0.5) * rv + g * 0.18 + (b - 0.5) * (brushN ? 0.12 : 0);
      const rb = Math.max(0, Math.min(255, r * 255));
      rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = rb;
      rough.data[i + 3] = 255;
      const h = 128 + (p - 0.5) * 36 * peel + (b - 0.5) * (brushN ? 30 : 0);
      height.data[i] = height.data[i + 1] = height.data[i + 2] = Math.max(0, Math.min(255, h));
      height.data[i + 3] = 255;
    }
  }
  colX.putImageData(col, 0, 0);
  roughX.putImageData(rough, 0, 0);
  hX.putImageData(height, 0, 0);

  // Water stains and rust run down from seams and fasteners.
  const streakRgb = hexToRgb(opts.streakColor ?? '#3a2a1c');
  for (let s = 0; s < (opts.streaks ?? 0); s++) {
    const x = rand() * size;
    const y0 = rand() * size * 0.7;
    const len = size * (0.08 + rand() * 0.45);
    const w = 1 + rand() * size * 0.012;
    const alpha = 0.12 + rand() * 0.3;
    const gc = colX.createLinearGradient(0, y0, 0, y0 + len);
    gc.addColorStop(0, `rgba(${streakRgb.join(',')},${alpha})`);
    gc.addColorStop(1, `rgba(${streakRgb.join(',')},0)`);
    colX.fillStyle = gc;
    colX.fillRect(x, y0, w, len);
    const gr = roughX.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, `rgba(255,255,255,${alpha * 0.4})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    roughX.fillStyle = gr;
    roughX.fillRect(x, y0, w, len);
  }

  // Scratches through paint: lighter, smoother and slightly recessed.
  const scratchRgb = hexToRgb(opts.scratchColor ?? '#9a9890');
  for (let s = 0; s < (opts.scratches ?? 0); s++) {
    const x = rand() * size;
    const y = rand() * size;
    const ang = rand() * Math.PI * 2;
    const len = size * (0.01 + rand() * 0.07);
    const bend = (rand() - 0.5) * len * 0.4;
    const ex = x + Math.cos(ang) * len;
    const ey = y + Math.sin(ang) * len;
    const mx = (x + ex) / 2 - Math.sin(ang) * bend;
    const my = (y + ey) / 2 + Math.cos(ang) * bend;
    const width = 0.4 + rand() * 1.1;
    const a = 0.25 + rand() * 0.5;
    for (const [ctx, style] of [
      [colX, `rgba(${scratchRgb.join(',')},${a})`],
      [roughX, `rgba(40,40,40,${a})`],
      [hX, `rgba(70,70,70,${a})`],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
    }
  }

  // Normal map from the height field (Sobel, wrapping at the edges).
  const hd = hX.getImageData(0, 0, size, size).data;
  const [nC, nX] = canvas(size);
  const nd = nX.createImageData(size, size);
  // Keep the slope the same in world terms whatever the resolution.
  const bump = (opts.bump ?? 1) * (size / 512);
  const hAt = (x: number, y: number) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = hAt(x + 1, y) - hAt(x - 1, y);
      const dy = hAt(x, y + 1) - hAt(x, y - 1);
      let nx = -dx * bump * 2;
      let ny = dy * bump * 2;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const i = (y * size + x) * 4;
      nd.data[i] = (nx * 0.5 + 0.5) * 255;
      nd.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      nd.data[i + 3] = 255;
    }
  }
  nX.putImageData(nd, 0, 0);

  const repeat = opts.repeat ?? [1, 1];
  const surface: Surface = {
    map: finish(new THREE.CanvasTexture(colC), repeat, true),
    roughnessMap: finish(new THREE.CanvasTexture(roughC), repeat, false),
    normalMap: finish(new THREE.CanvasTexture(nC), repeat, false),
  };
  cache.set(key, surface);
  return surface;
}

/** Clone a surface's textures with a different tiling. */
export function withRepeat(s: Surface, rx: number, ry: number): Surface {
  const c = (t: THREE.Texture) => {
    const n = t.clone();
    n.repeat.set(rx, ry);
    n.needsUpdate = true;
    return n;
  };
  return { map: c(s.map), roughnessMap: c(s.roughnessMap), normalMap: c(s.normalMap) };
}

export function surfaceMaterial(
  s: Surface,
  extra: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: s.map,
    roughnessMap: s.roughnessMap,
    normalMap: s.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 1,
    metalness: 0,
    ...extra,
  });
}

// Shared surface library. Colours are picked from real industrial
// finishes: light gray console enamel, navy gray hull paint, black
// powder coat, and raw aluminium.
export const SURFACES = {
  hullPaint: () =>
    makeSurface({
      color: '#3b434b',
      seed: 11,
      mottle: 0.1,
      grime: 0.55,
      streaks: 26,
      streakColor: '#2b2118',
      scratches: 40,
      scratchColor: '#7c7a72',
      rough: 0.62,
      roughVariation: 0.16,
      bump: 1.2,
      peel: 0.8,
    }),
  consoleEnamel: () =>
    makeSurface({
      color: '#8d8f88',
      seed: 23,
      mottle: 0.03,
      grime: 0.18,
      grimeColor: '#3a3833',
      scratches: 70,
      scratchColor: '#c8c7c0',
      rough: 0.5,
      roughVariation: 0.12,
      bump: 0.6,
      peel: 1,
    }),
  powderBlack: () =>
    makeSurface({
      color: '#1d1f21',
      seed: 31,
      mottle: 0.06,
      grime: 0.2,
      grimeColor: '#0c0c0c',
      scratches: 50,
      scratchColor: '#4d4f50',
      rough: 0.58,
      roughVariation: 0.1,
      bump: 0.7,
      peel: 1.2,
    }),
  rubberMat: () =>
    makeSurface({
      color: '#18191a',
      seed: 41,
      mottle: 0.05,
      grime: 0.3,
      grimeColor: '#2a2a28',
      scratches: 24,
      scratchColor: '#303132',
      rough: 0.86,
      roughVariation: 0.08,
      bump: 0.9,
      peel: 1.6,
    }),
  aluminium: () =>
    makeSurface({
      color: '#a7aaad',
      seed: 53,
      mottle: 0.04,
      grime: 0.15,
      scratches: 40,
      scratchColor: '#d5d7d8',
      rough: 0.38,
      roughVariation: 0.1,
      bump: 0.5,
      brushed: true,
    }),
  beigePlastic: () =>
    makeSurface({
      color: '#a6a194',
      seed: 61,
      mottle: 0.05,
      grime: 0.3,
      grimeColor: '#5a5448',
      scratches: 20,
      scratchColor: '#c4bfb2',
      rough: 0.55,
      roughVariation: 0.08,
      bump: 0.5,
      peel: 0.6,
    }),
  deckPlate: () =>
    makeSurface({
      color: '#2a2d30',
      seed: 71,
      mottle: 0.12,
      grime: 0.6,
      streaks: 0,
      scratches: 120,
      scratchColor: '#5c5d5c',
      rough: 0.55,
      roughVariation: 0.2,
      bump: 1,
      peel: 0.4,
    }),
};
