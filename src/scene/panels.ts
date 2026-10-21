import * as THREE from 'three';
import { mulberry32 } from './textures';

// Painted canvas surfaces for the station interior: wall lining with
// seams and screws, tread plate floors, ceiling tiles, the hatched cut
// faces of the cutaway, and hazard edging. Each draws a colour, height
// and roughness layer together so seams catch the light where they show.

interface Layers {
  color: CanvasRenderingContext2D;
  height: CanvasRenderingContext2D;
  rough: CanvasRenderingContext2D;
  size: number;
  rand: () => number;
}

export interface PanelSurface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

const cache = new Map<string, PanelSurface>();

function layer(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c.getContext('2d', { willReadFrequently: true })!;
}

function build(key: string, size: number, seed: number, bump: number, draw: (l: Layers) => void): PanelSurface {
  const hit = cache.get(key);
  if (hit) return hit;
  const l: Layers = { color: layer(size), height: layer(size), rough: layer(size), size, rand: mulberry32(seed) };
  l.height.fillStyle = '#808080';
  l.height.fillRect(0, 0, size, size);
  draw(l);
  // Normal map from the height layer, wrapping so the tile repeats.
  const h = l.height.getImageData(0, 0, size, size).data;
  const out = l.height.createImageData(size, size);
  const at = (x: number, y: number) => h[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * bump;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * bump;
      const n = new THREE.Vector3(-dx, dy, 1).normalize();
      const i = (y * size + x) * 4;
      out.data[i] = (n.x * 0.5 + 0.5) * 255;
      out.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      out.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  nc.getContext('2d')!.putImageData(out, 0, 0);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const s = { map: tex(l.color.canvas, true), normalMap: tex(nc, false), roughnessMap: tex(l.rough.canvas, false) };
  cache.set(key, s);
  return s;
}

/** Fine speckle and soft blotches so flat paint never looks digital. */
function grain(l: Layers, ctx: CanvasRenderingContext2D, amount: number, dark = '0,0,0', light = '255,255,255') {
  const { size, rand } = l;
  for (let i = 0; i < 90; i++) {
    const r = size * (0.03 + rand() * 0.12);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const a = amount * (0.25 + rand() * 0.5);
    g.addColorStop(0, `rgba(${rand() < 0.6 ? dark : light},${a})`);
    g.addColorStop(1, `rgba(${dark},0)`);
    ctx.save();
    ctx.translate(rand() * size, rand() * size);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  for (let i = 0; i < size * 6; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? dark : light},${amount * 0.35 * rand()})`;
    ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
  }
}

/**
 * Interior wall lining: tall painted panels with recessed seams, screw
 * heads at the corners and scuffs low down. One tile is 2.4 m square,
 * four panels wide and two high.
 */
export function wallLining(color: string, seed = 7): PanelSurface {
  return build(`wall${color}${seed}`, 1024, seed, 2.2, (l) => {
    const { color: c, height: h, rough: r, size, rand } = l;
    c.fillStyle = color;
    c.fillRect(0, 0, size, size);
    r.fillStyle = '#8a8a8a';
    r.fillRect(0, 0, size, size);
    const cols = 4;
    const rows = 2;
    const pw = size / cols;
    const ph = size / rows;
    // Slight tint change per panel: they were painted in different batches.
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        c.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${rand() * 0.06})` : `rgba(255,255,255,${rand() * 0.04})`;
        c.fillRect(i * pw, j * ph, pw, ph);
        // Scuffs near the bottom edge of the lower panels.
        if (j === rows - 1)
          for (let k = 0; k < 14; k++) {
            c.fillStyle = `rgba(20,18,16,${0.05 + rand() * 0.08})`;
            c.fillRect(i * pw + rand() * pw, size - rand() * ph * 0.25, 4 + rand() * 30, 1 + rand() * 3);
          }
      }
    grain(l, c, 0.07);
    // Seams: a dark groove with a lit lower lip.
    c.lineWidth = 4;
    h.lineWidth = 6;
    for (let i = 0; i <= cols; i++) {
      c.strokeStyle = 'rgba(10,12,12,0.75)';
      c.beginPath();
      c.moveTo(i * pw, 0);
      c.lineTo(i * pw, size);
      c.stroke();
      h.strokeStyle = '#303030';
      h.beginPath();
      h.moveTo(i * pw, 0);
      h.lineTo(i * pw, size);
      h.stroke();
    }
    for (let j = 0; j <= rows; j++) {
      c.strokeStyle = 'rgba(10,12,12,0.75)';
      c.beginPath();
      c.moveTo(0, j * ph);
      c.lineTo(size, j * ph);
      c.stroke();
      h.strokeStyle = '#303030';
      h.beginPath();
      h.moveTo(0, j * ph);
      h.lineTo(size, j * ph);
      h.stroke();
    }
    // Screws, four per panel corner and two along each long edge.
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++)
        for (const [u, v] of [
          [0.08, 0.04],
          [0.92, 0.04],
          [0.08, 0.96],
          [0.92, 0.96],
          [0.08, 0.5],
          [0.92, 0.5],
        ]) {
          const x = i * pw + u * pw;
          const y = j * ph + v * ph;
          c.fillStyle = 'rgba(30,32,32,0.8)';
          c.beginPath();
          c.arc(x, y, 4.5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(200,200,190,0.25)';
          c.beginPath();
          c.arc(x - 1, y - 1, 2, 0, Math.PI * 2);
          c.fill();
          h.fillStyle = '#b0b0b0';
          h.beginPath();
          h.arc(x, y, 4, 0, Math.PI * 2);
          h.fill();
        }
    grain(l, r, 0.2, '60,60,60', '200,200,200');
  });
}

/** Diamond tread steel plate for the decks. One tile is 1.2 m. */
export function treadPlate(seed = 11): PanelSurface {
  return build(`tread${seed}`, 512, seed, 3, (l) => {
    const { color: c, height: h, rough: r, size, rand } = l;
    c.fillStyle = '#34373a';
    c.fillRect(0, 0, size, size);
    r.fillStyle = '#7a7a7a';
    r.fillRect(0, 0, size, size);
    grain(l, c, 0.18);
    const step = size / 24;
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++) {
        const cx = (x + 0.5) * step;
        const cy = (y + 0.5) * step;
        const ang = (x + y) % 2 ? Math.PI / 4 : -Math.PI / 4;
        for (const ctx of [c, h, r]) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(ang);
          ctx.fillStyle = ctx === c ? 'rgba(150,152,150,0.35)' : ctx === h ? '#d8d8d8' : '#3c3c3c';
          ctx.beginPath();
          ctx.ellipse(0, 0, step * 0.42, step * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
    // Worn path where boots go: shinier and lighter.
    for (let i = 0; i < 40; i++) {
      r.fillStyle = `rgba(30,30,30,${rand() * 0.25})`;
      r.fillRect(rand() * size, rand() * size, 20 + rand() * 60, 4 + rand() * 10);
    }
  });
}

/** Ceiling tiles with a grid of perforations. One tile is 1.2 m. */
export function ceilingTile(seed = 13): PanelSurface {
  return build(`ceil${seed}`, 512, seed, 1.5, (l) => {
    const { color: c, height: h, rough: r, size } = l;
    c.fillStyle = '#5d6264';
    c.fillRect(0, 0, size, size);
    r.fillStyle = '#b0b0b0';
    r.fillRect(0, 0, size, size);
    grain(l, c, 0.08);
    const half = size / 2;
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        c.fillStyle = 'rgba(0,0,0,0.28)';
        for (let x = 0; x < 14; x++)
          for (let y = 0; y < 14; y++) {
            c.beginPath();
            c.arc(i * half + 30 + x * 14, j * half + 30 + y * 14, 1.8, 0, Math.PI * 2);
            c.fill();
          }
      }
    c.strokeStyle = 'rgba(20,22,22,0.9)';
    h.strokeStyle = '#404040';
    c.lineWidth = h.lineWidth = 6;
    for (const ctx of [c, h]) {
      ctx.strokeRect(0, 0, half, half);
      ctx.strokeRect(half, 0, half, half);
      ctx.strokeRect(0, half, half, half);
      ctx.strokeRect(half, half, half, half);
    }
  });
}

/**
 * The cut faces of the cutaway, drawn the way section drawings mark
 * solid material: near black with a faint diagonal hatch.
 */
export function sectionHatch(): PanelSurface {
  return build('hatch', 256, 3, 0.6, (l) => {
    const { color: c, rough: r, size } = l;
    c.fillStyle = '#16191b';
    c.fillRect(0, 0, size, size);
    r.fillStyle = '#9a9a9a';
    r.fillRect(0, 0, size, size);
    c.strokeStyle = 'rgba(120,128,130,0.22)';
    c.lineWidth = 2;
    for (let i = -size; i < size * 2; i += 16) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + size, size);
      c.stroke();
    }
  });
}

/** Yellow and black hazard striping for deck edges. */
export function hazardStripes(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#c99a12';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#141414';
  for (let x = -64; x < 320; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 32, 0);
    ctx.lineTo(x + 64, 0);
    ctx.lineTo(x + 32, 32);
    ctx.fill();
  }
  // Wear on the stripes.
  const rand = mulberry32(5);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(40,36,30,${rand() * 0.4})`;
    ctx.fillRect(rand() * 256, rand() * 32, 1 + rand() * 6, 1 + rand() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Soft round contact shadow, for crew and loose props. */
let blob: THREE.Texture | null = null;
export function blobShadow(): THREE.Texture {
  if (blob) return blob;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.7)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blob = new THREE.CanvasTexture(c);
  return blob;
}

export function panelMaterial(s: PanelSurface, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    map: s.map,
    normalMap: s.normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: s.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...extra,
  });
}

/** Vertical dark-to-clear gradient, for soft occlusion where surfaces meet. */
let fade: THREE.Texture | null = null;
export function occlusionFade(): THREE.Texture {
  if (fade) return fade;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  fade = new THREE.CanvasTexture(c);
  return fade;
}
