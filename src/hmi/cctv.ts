import * as THREE from 'three';
import { HMI_FONT, clock } from './palette';
import { mulberry32 } from '../scene/textures';

interface Feed {
  cam: string;
  room: string;
  lost?: boolean;
  /** Where the work light sits in the frame, and how warm it is. */
  light: [number, number, number];
  tint: number;
  figures: { x: number; y: number; s: number; sway: number }[];
}

const FEEDS: Feed[] = [
  { cam: 'CAM 01', room: 'C1 COMMAND', light: [0.3, 0.1, 0.8], tint: 0.95, figures: [{ x: 0.62, y: 0.64, s: 1.0, sway: 0.4 }] },
  { cam: 'CAM 02', room: 'C2 BALLAST', lost: true, light: [0.5, 0.2, 0.6], tint: 0.8, figures: [] },
  { cam: 'CAM 04', room: 'C4 LAB', light: [0.7, 0.05, 0.9], tint: 1.0, figures: [{ x: 0.36, y: 0.62, s: 0.9, sway: 0.8 }, { x: 0.7, y: 0.7, s: 1.15, sway: 0.3 }] },
  { cam: 'CAM 06', room: 'C6 DIVE', light: [0.2, 0.3, 0.7], tint: 0.85, figures: [{ x: 0.5, y: 0.6, s: 0.8, sway: 1.2 }] },
];

/**
 * Low light security camera quad. Everything is grayscale, grainy and
 * slightly smeared, which reads as real footage and keeps the crew as
 * silhouettes rather than illustrated faces.
 */
export class CctvScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly w = 1280;
  readonly h = 800;
  private grain: HTMLCanvasElement[] = [];
  private scenes: HTMLCanvasElement[];

  constructor() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    // Pre-rendered grain frames, cycled instead of generating noise
    // every frame.
    const rand = mulberry32(77);
    for (let f = 0; f < 6; f++) {
      const g = document.createElement('canvas');
      g.width = 320;
      g.height = 200;
      const gx = g.getContext('2d')!;
      const img = gx.createImageData(g.width, g.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rand() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      gx.putImageData(img, 0, 0);
      this.grain.push(g);
    }
    this.scenes = FEEDS.map((f) => this.renderRoom(f));
  }

  /** Static room plate: walls, floor and fixtures in low light. */
  private renderRoom(f: Feed) {
    const c = document.createElement('canvas');
    c.width = 620;
    c.height = 368;
    const x = c.getContext('2d')!;
    const [lx, ly, lr] = f.light;
    const base = Math.round(28 * f.tint);
    x.fillStyle = `rgb(${base},${base},${base})`;
    x.fillRect(0, 0, c.width, c.height);
    // Ceiling mounted wide angle lens: converging floor lines.
    x.fillStyle = `rgb(${base + 12},${base + 12},${base + 12})`;
    x.beginPath();
    x.moveTo(0, c.height);
    x.lineTo(c.width * 0.18, c.height * 0.45);
    x.lineTo(c.width * 0.82, c.height * 0.45);
    x.lineTo(c.width, c.height);
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.5)';
    x.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.moveTo(c.width * (0.18 + i * 0.16), c.height * 0.45);
      x.lineTo(c.width * (-0.2 + i * 0.35), c.height);
      x.stroke();
    }
    // Wall equipment shapes.
    x.fillStyle = 'rgba(0,0,0,0.45)';
    x.fillRect(c.width * 0.06, c.height * 0.12, c.width * 0.18, c.height * 0.3);
    x.fillRect(c.width * 0.7, c.height * 0.08, c.width * 0.22, c.height * 0.34);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fillRect(c.width * 0.08, c.height * 0.15, c.width * 0.05, c.height * 0.04);
    // Work light pool.
    const g = x.createRadialGradient(c.width * lx, c.height * ly, 0, c.width * lx, c.height * ly, c.width * lr);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  draw(t: number) {
    const { ctx, w, h } = this;
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);
    const gap = 6;
    const fw = (w - gap) / 2;
    const fh = (h - gap) / 2;
    FEEDS.forEach((f, i) => {
      const x = (i % 2) * (fw + gap);
      const y = Math.floor(i / 2) * (fh + gap);
      this.feed(f, i, x, y, fw, fh, t);
    });
  }

  private feed(f: Feed, i: number, x: number, y: number, w: number, h: number, t: number) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const frame = Math.floor(t * 12 + i * 3);
    if (f.lost) {
      // Lost signal: heavy static with a slow rolling band.
      ctx.drawImage(this.grain[frame % this.grain.length], x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y, w, h);
      const band = ((t * 0.35) % 1) * h;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x, y + band, w, 24);
      ctx.fillStyle = '#e8e8e8';
      ctx.font = `600 40px ${HMI_FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('NO SIGNAL', x + w / 2, y + h / 2 + 10);
      ctx.textAlign = 'left';
    } else {
      ctx.drawImage(this.scenes[i], x, y, w, h);
      for (const fig of f.figures) {
        const sway = Math.sin(t * fig.sway + i) * 6;
        silhouette(ctx, x + fig.x * w + sway, y + fig.y * h, 70 * fig.s);
      }
      ctx.globalAlpha = 0.16;
      ctx.globalCompositeOperation = 'overlay';
      ctx.drawImage(this.grain[frame % this.grain.length], x, y, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      // Interlace lines.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let ly = y; ly < y + h; ly += 4) ctx.fillRect(x, ly, w, 1);
      // Lens vignette.
      const v = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, w * 0.62);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.7)');
      ctx.fillStyle = v;
      ctx.fillRect(x, y, w, h);
    }
    // Camera overlay in the standard white text with a dark outline.
    ctx.font = `500 24px ${HMI_FONT.mono}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.fillStyle = '#f0f0f0';
    const label = `${f.cam}  ${f.room}`;
    ctx.strokeText(label, x + 16, y + 34);
    ctx.fillText(label, x + 16, y + 34);
    const ts = `DAY 01  ${clock(t)}`;
    ctx.strokeText(ts, x + 16, y + h - 18);
    ctx.fillText(ts, x + 16, y + h - 18);
    ctx.restore();
  }
}

/** Head and shoulders of a person seen from a high camera, soft edged. */
function silhouette(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = 'rgba(8,8,8,0.88)';
  ctx.beginPath();
  ctx.ellipse(x, y - s * 0.95, s * 0.28, s * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.75, y + s * 0.9);
  ctx.quadraticCurveTo(x - s * 0.7, y - s * 0.55, x, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 0.7, y - s * 0.55, x + s * 0.75, y + s * 0.9);
  ctx.closePath();
  ctx.fill();
  // Rim light from the work lamp picks out one shoulder.
  ctx.strokeStyle = 'rgba(200,200,200,0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.05, y - s * 0.6);
  ctx.quadraticCurveTo(x + s * 0.62, y - s * 0.5, x + s * 0.7, y + s * 0.2);
  ctx.stroke();
  ctx.restore();
}
