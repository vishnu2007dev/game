import * as THREE from 'three';
import { mulberry32 } from './textures';

export const FONT = {
  label: '"Barlow Condensed", "Arial Narrow", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
  dot: '"VT323", ui-monospace, monospace',
  hand: '"Caveat", cursive',
};

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * Embossed label maker tape. Letters sit slightly off the baseline and
 * at slight angles because the wheel never lines up perfectly.
 */
export function dymoLabel(text: string, opts: { tape?: string; seed?: number; height?: number } = {}) {
  const h = 96;
  const rand = mulberry32(opts.seed ?? text.length * 97);
  const ctx0 = document.createElement('canvas').getContext('2d')!;
  ctx0.font = `600 58px ${FONT.label}`;
  const letterW = text.split('').map((ch) => ctx0.measureText(ch).width + 7);
  const w = Math.ceil(letterW.reduce((a, b) => a + b, 0) + 56);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = opts.tape ?? '#141516';
  ctx.fillRect(0, 0, w, h);
  // Glossy tape: faint horizontal sheen and edge shading.
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `600 58px ${FONT.label}`;
  ctx.textBaseline = 'middle';
  let x = 28;
  text.split('').forEach((ch, i) => {
    const dy = (rand() - 0.5) * 4;
    const rot = (rand() - 0.5) * 0.05;
    ctx.save();
    ctx.translate(x, h / 2 + 3 + dy);
    ctx.rotate(rot);
    // Embossed plastic turns whitish where it is stretched.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(ch, 1.5, 2);
    ctx.fillStyle = '#e9e7e0';
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    x += letterW[i];
  });
  const height = opts.height ?? 0.016;
  const geo = new THREE.PlaneGeometry((w / h) * height, height);
  const mat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.3, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `label:${text}`;
  return mesh;
}

/** Engraved or screen printed panel lettering on a transparent background. */
export function printedText(
  text: string,
  opts: { color?: string; weight?: number; height?: number; font?: string; align?: CanvasTextAlign; letterSpacing?: number } = {},
) {
  const px = 96;
  const font = `${opts.weight ?? 600} ${px}px ${opts.font ?? FONT.label}`;
  const ctx0 = document.createElement('canvas').getContext('2d')!;
  ctx0.font = font;
  const spacing = opts.letterSpacing ?? 4;
  const w = Math.ceil(ctx0.measureText(text).width + spacing * text.length + 16);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(px * 1.25);
  const ctx = c.getContext('2d')!;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = opts.color ?? '#e6e3da';
  let x = 8;
  for (const ch of text) {
    ctx.fillText(ch, x, c.height / 2 + 4);
    x += ctx.measureText(ch).width + spacing;
  }
  const height = opts.height ?? 0.012;
  const geo = new THREE.PlaneGeometry((c.width / c.height) * height, height);
  if (opts.align === 'left') geo.translate(((c.width / c.height) * height) / 2, 0, 0);
  if (opts.align === 'right') geo.translate(-((c.width / c.height) * height) / 2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: tex(c),
    transparent: true,
    roughness: 0.6,
    metalness: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  return new THREE.Mesh(geo, mat);
}

/** A slightly curled sticky note with a handwritten reminder. */
export function stickyNote(lines: string[], seed = 3) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const rand = mulberry32(seed);
  ctx.fillStyle = '#e8d66a';
  ctx.fillRect(0, 0, s, s);
  // Adhesive strip is a touch darker; the paper picks up dirt at the edge.
  ctx.fillStyle = 'rgba(120,100,20,0.10)';
  ctx.fillRect(0, 0, s, 90);
  const edge = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s * 0.75);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(70,55,10,0.22)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#1b2440';
  ctx.font = `700 92px ${FONT.hand}`;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.save();
    ctx.translate(34 + rand() * 10, 120 + i * 112);
    ctx.rotate(-0.04 + rand() * 0.05);
    ctx.fillText(line, 0, 0);
    ctx.restore();
  });
  // Underline the last word, the way people do.
  ctx.strokeStyle = '#1b2440';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(40, 130 + lines.length * 112);
  ctx.quadraticCurveTo(220, 118 + lines.length * 112, 420, 128 + lines.length * 112);
  ctx.stroke();

  const geo = new THREE.PlaneGeometry(0.075, 0.075, 8, 8);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const x = pos.getX(i);
    // Bottom edge curls away from the surface it is stuck to.
    const curl = Math.max(0, -y - 0.01) ** 2 * 3.2 + Math.max(0, x - 0.02) * Math.max(0, -y) * 0.6;
    pos.setZ(i, curl);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: tex(c), roughness: 0.9, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/**
 * Continuous form printer paper with tractor holes, faint green bars and
 * dot matrix text. Returns the texture so the printer can keep printing.
 */
export class PrinterPaper {
  canvas = document.createElement('canvas');
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  constructor(public lines: string[]) {
    this.canvas.width = 768;
    this.canvas.height = 1536;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = tex(this.canvas);
    this.draw();
  }
  draw() {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.fillStyle = '#e9e5d8';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 96) {
      ctx.fillStyle = 'rgba(120,160,120,0.12)';
      ctx.fillRect(56, y, w - 112, 48);
    }
    // Perforation and tractor holes.
    ctx.fillStyle = '#2a2a28';
    for (let y = 24; y < h; y += 48) {
      ctx.beginPath();
      ctx.arc(26, y, 9, 0, Math.PI * 2);
      ctx.arc(w - 26, y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(52, 0);
    ctx.lineTo(52, h);
    ctx.moveTo(w - 52, 0);
    ctx.lineTo(w - 52, h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `38px ${FONT.dot}`;
    ctx.textBaseline = 'top';
    const rand = mulberry32(5);
    this.lines.forEach((line, i) => {
      // Ribbon ink is uneven: some lines print lighter than others.
      const ink = 0.62 + rand() * 0.3;
      ctx.fillStyle = `rgba(28,28,34,${ink})`;
      ctx.fillText(line, 76, 40 + i * 44);
    });
    // A coffee ring from a mug that was set down on the printout.
    ctx.strokeStyle = 'rgba(110,70,30,0.22)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.78, 92, 0.3, Math.PI * 1.85);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(110,70,30,0.16)';
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.78, 100, 0, Math.PI * 2);
    ctx.stroke();
    this.texture.needsUpdate = true;
  }
}

/** One character card for a split-flap display. */
export function flapTexture(ch: string) {
  const w = 256;
  const h = 360;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#26272a');
  g.addColorStop(0.49, '#1c1d1f');
  g.addColorStop(0.51, '#202124');
  g.addColorStop(1, '#151618');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.font = `700 300px ${FONT.label}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ece8dc';
  ctx.fillText(ch, w / 2, h / 2 + 18);
  // The split between the two flap halves.
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, h / 2 - 3, w, 6);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, h / 2 + 3, w, 2);
  // Hinge pins at each side.
  ctx.fillStyle = '#3a3b3e';
  ctx.fillRect(0, h / 2 - 8, 10, 16);
  ctx.fillRect(w - 10, h / 2 - 8, 10, 16);
  return tex(c);
}
