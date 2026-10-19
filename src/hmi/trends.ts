import * as THREE from 'three';
import { HMI, HMI_FONT } from './palette';
import { mulberry32 } from '../scene/textures';

interface Trend {
  tag: string;
  label: string;
  unit: string;
  /** Normal operating band, drawn as a pale strip behind the line. */
  band: [number, number];
  range: [number, number];
  history: number[];
  /** Value the signal is drifting toward and how noisy it is. */
  target: number;
  noise: number;
  warnAbove?: number;
  warnBelow?: number;
  decimals: number;
}

const SAMPLES = 90;

/**
 * Four trend tiles in the style of a high performance HMI: thin line,
 * normal band, current value in large figures, and colour only when out
 * of range.
 */
export class TrendScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly w = 1280;
  readonly h = 800;
  private rand = mulberry32(19);
  private trends: Trend[];
  private lastSample = -1;

  constructor() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    const make = (t: Omit<Trend, 'history'>, start: number, drift: number): Trend => {
      const history: number[] = [];
      let v = start;
      for (let i = 0; i < SAMPLES; i++) {
        // Values sit steady and then move once the incident starts.
        if (i > SAMPLES * 0.7) v += drift;
        history.push(v + (this.rand() - 0.5) * t.noise);
      }
      return { ...t, history };
    };
    this.trends = [
      make({ tag: 'SG-104', label: 'HULL STRAIN', unit: '%', band: [20, 60], range: [0, 100], target: 84, noise: 1.4, warnAbove: 70, decimals: 0 }, 41, 1.6),
      make({ tag: 'EB-A', label: 'MAIN BUS A', unit: '%', band: [55, 90], range: [0, 100], target: 61, noise: 1.2, warnBelow: 50, decimals: 0 }, 78, -0.7),
      make({ tag: 'AT-301', label: 'CABIN O2', unit: '%', band: [19.5, 21.5], range: [17, 23], target: 20.4, noise: 0.06, warnBelow: 19.5, decimals: 1 }, 20.8, -0.015),
      make({ tag: 'AT-305', label: 'CABIN CO2', unit: '%', band: [0, 0.5], range: [0, 1.5], target: 0.62, noise: 0.02, warnAbove: 0.5, decimals: 2 }, 0.31, 0.012),
    ];
  }

  draw(t: number) {
    // One new sample per second, so the newest point creeps across.
    const sample = Math.floor(t);
    if (sample !== this.lastSample) {
      this.lastSample = sample;
      for (const tr of this.trends) {
        const last = tr.history[tr.history.length - 1];
        const next = last + (tr.target - last) * 0.08 + (this.rand() - 0.5) * tr.noise;
        tr.history.push(next);
        tr.history.shift();
      }
    }
    const { ctx, w, h } = this;
    ctx.fillStyle = HMI.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = HMI.bgDeep;
    ctx.fillRect(0, 0, w, 64);
    ctx.fillStyle = HMI.white;
    ctx.font = `600 36px ${HMI_FONT.label}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('LIFE SUPPORT', 26, 33);
    ctx.fillStyle = HMI.textDim;
    ctx.fillText('TRENDS  15 MIN', 208, 33);

    const pad = 18;
    const tileW = (w - pad * 3) / 2;
    const tileH = (h - 64 - pad * 3) / 2;
    this.trends.forEach((tr, i) => {
      const x = pad + (i % 2) * (tileW + pad);
      const y = 64 + pad + Math.floor(i / 2) * (tileH + pad);
      this.tile(tr, x, y, tileW, tileH, t);
    });
  }

  private tile(tr: Trend, x: number, y: number, w: number, h: number, t: number) {
    const { ctx } = this;
    const v = tr.history[tr.history.length - 1];
    const out = (tr.warnAbove !== undefined && v > tr.warnAbove) || (tr.warnBelow !== undefined && v < tr.warnBelow);
    ctx.fillStyle = HMI.panel;
    ctx.fillRect(x, y, w, h);
    if (out) {
      ctx.strokeStyle = HMI.warn;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    }
    ctx.fillStyle = HMI.text;
    ctx.font = `600 32px ${HMI_FONT.label}`;
    ctx.fillText(tr.label, x + 20, y + 32);
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 22px ${HMI_FONT.mono}`;
    ctx.fillText(tr.tag, x + 20, y + 64);
    ctx.textAlign = 'right';
    ctx.fillStyle = out ? HMI.warn : HMI.white;
    ctx.font = `600 64px ${HMI_FONT.mono}`;
    ctx.fillText(v.toFixed(tr.decimals), x + w - 74, y + 46);
    ctx.font = `500 26px ${HMI_FONT.mono}`;
    ctx.fillStyle = HMI.textDim;
    ctx.fillText(tr.unit, x + w - 22, y + 50);
    ctx.textAlign = 'left';

    // Plot area.
    const px = x + 20;
    const py = y + 96;
    const pw = w - 40;
    const ph = h - 120;
    const [lo, hi] = tr.range;
    const toY = (val: number) => py + ph - ((val - lo) / (hi - lo)) * ph;
    ctx.fillStyle = 'rgba(160,170,180,0.10)';
    ctx.fillRect(px, toY(tr.band[1]), pw, toY(tr.band[0]) - toY(tr.band[1]));
    ctx.strokeStyle = HMI.lineDim;
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= 6; gx++) {
      ctx.beginPath();
      ctx.moveTo(px + (gx / 6) * pw, py);
      ctx.lineTo(px + (gx / 6) * pw, py + ph);
      ctx.stroke();
    }
    const limit = tr.warnAbove ?? tr.warnBelow;
    if (limit !== undefined) {
      ctx.setLineDash([10, 8]);
      ctx.strokeStyle = 'rgba(242,169,0,0.55)';
      ctx.beginPath();
      ctx.moveTo(px, toY(limit));
      ctx.lineTo(px + pw, toY(limit));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = out ? HMI.warn : HMI.text;
    ctx.lineWidth = 3;
    ctx.beginPath();
    // Sub-second scroll so the line moves smoothly between samples.
    const frac = t - Math.floor(t);
    tr.history.forEach((val, i) => {
      const sx = px + ((i - frac) / (SAMPLES - 1)) * pw;
      const sy = toY(val);
      if (i === 0) ctx.moveTo(Math.max(px, sx), sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
    ctx.fillStyle = out ? HMI.warn : HMI.white;
    ctx.beginPath();
    ctx.arc(px + pw - (frac / (SAMPLES - 1)) * pw, toY(v), 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
