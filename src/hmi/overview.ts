import * as THREE from 'three';
import { HMI, HMI_FONT, clock } from './palette';

interface Compartment {
  id: string;
  name: string;
  x: number;
  w: number;
  data: [string, string][];
}

const COMPARTMENTS: Compartment[] = [
  { id: 'C1', name: 'COMMAND', x: 0, w: 0.17, data: [['P', '1.01 BAR'], ['O2', '20.6 %'], ['CREW', '1']] },
  { id: 'C2', name: 'BALLAST', x: 0.17, w: 0.15, data: [['P', '1.38 BAR'], ['LVL', '42 %'], ['CREW', '0']] },
  { id: 'C3', name: 'POWER', x: 0.32, w: 0.17, data: [['P', '1.02 BAR'], ['BUS A', '61 %'], ['CREW', '1']] },
  { id: 'C4', name: 'LAB', x: 0.49, w: 0.17, data: [['P', '1.01 BAR'], ['O2', '20.3 %'], ['CREW', '2']] },
  { id: 'C5', name: 'QUARTERS', x: 0.66, w: 0.17, data: [['P', '1.01 BAR'], ['O2', '20.5 %'], ['CREW', '1']] },
  { id: 'C6', name: 'DIVE', x: 0.83, w: 0.17, data: [['P', '1.04 BAR'], ['O2', '20.9 %'], ['CREW', '1']] },
];

const ALARMS = [
  { time: '03:47:09', pri: 'P1', tag: 'LAH-201', text: 'C2 BALLAST FLOOD LEVEL HIGH HIGH', state: 'UNACK', color: HMI.alarm },
  { time: '03:46:58', pri: 'P2', tag: 'ZT-112', text: 'BHD DOOR 1-2 NOT CLOSED', state: 'UNACK', color: HMI.warn },
  { time: '03:46:51', pri: 'P2', tag: 'SG-104', text: 'HULL STRAIN GAUGE 4 DEVIATION', state: 'ACK', color: HMI.warn },
  { time: '03:41:12', pri: 'P3', tag: 'FT-330', text: 'CO2 SCRUBBER FLOW LOW', state: 'ACK', color: HMI.warn },
];

/**
 * Station overview screen: a mimic diagram of the six compartments,
 * the ballast main, and the alarm summary. Drawn to a canvas that is
 * used as the emissive texture of the centre monitor.
 */
export class OverviewScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly w = 1600;
  readonly h = 1000;

  constructor() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  draw(t: number) {
    const { ctx, w, h } = this;
    const flash = Math.floor(t * 2) % 2 === 0;

    ctx.fillStyle = HMI.bg;
    ctx.fillRect(0, 0, w, h);

    // Title bar.
    ctx.fillStyle = HMI.bgDeep;
    ctx.fillRect(0, 0, w, 74);
    ctx.fillStyle = HMI.white;
    ctx.font = `600 40px ${HMI_FONT.label}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('HELIOS DEEP', 30, 38);
    ctx.fillStyle = HMI.textDim;
    ctx.fillText('STATION OVERVIEW', 230, 38);
    ctx.font = `500 30px ${HMI_FONT.mono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = HMI.text;
    ctx.fillText(`DEPTH 3012 M    DAY 01    ${clock(t)}`, w - 30, 38);
    ctx.textAlign = 'left';

    // Unacknowledged P1 alarm banner flashes until acknowledged.
    ctx.fillStyle = flash ? HMI.alarm : '#5a1714';
    ctx.fillRect(0, 74, w, 78);
    ctx.fillStyle = flash ? '#ffffff' : '#e9b9b5';
    ctx.font = `600 44px ${HMI_FONT.label}`;
    ctx.fillText('P1   FLOOD ALARM   C2 BALLAST   LEVEL HIGH HIGH', 30, 114);
    ctx.textAlign = 'right';
    ctx.font = `600 32px ${HMI_FONT.mono}`;
    ctx.fillText('UNACK', w - 30, 114);
    ctx.textAlign = 'left';

    this.drawMimic(t, flash);
    this.drawAlarmList(flash);
  }

  private drawMimic(t: number, flash: boolean) {
    const { ctx, w } = this;
    const left = 60;
    const right = w - 60;
    const top = 210;
    const bottom = 560;
    const hullW = right - left;
    const r = 90;

    // Sea outside the hull.
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 26px ${HMI_FONT.mono}`;
    ctx.fillText('SEA 301.6 BAR   4.1 C', left, 194);
    ctx.textAlign = 'right';
    ctx.fillText('HULL TRIM -0.4 DEG', right, 194);
    ctx.textAlign = 'left';

    // Compartment water fill is drawn inside the hull clip.
    ctx.save();
    roundRect(ctx, left, top, hullW, bottom - top, r);
    ctx.clip();
    const c2 = COMPARTMENTS[1];
    const cx = left + c2.x * hullW;
    const cw = c2.w * hullW;
    const level = 0.42 + Math.sin(t * 0.7) * 0.004;
    const waterTop = bottom - (bottom - top) * level;
    ctx.fillStyle = HMI.water;
    ctx.beginPath();
    ctx.moveTo(cx, bottom);
    for (let x = 0; x <= cw; x += 8) {
      ctx.lineTo(cx + x, waterTop + Math.sin(x * 0.05 + t * 3) * 3);
    }
    ctx.lineTo(cx + cw, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = HMI.waterHi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= cw; x += 8) {
      const y = waterTop + Math.sin(x * 0.05 + t * 3) * 3;
      if (x === 0) ctx.moveTo(cx + x, y);
      else ctx.lineTo(cx + x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Hull outline.
    ctx.strokeStyle = HMI.line;
    ctx.lineWidth = 5;
    roundRect(ctx, left, top, hullW, bottom - top, r);
    ctx.stroke();

    // Bulkheads and the door state on each one.
    COMPARTMENTS.forEach((c, i) => {
      const x = left + c.x * hullW;
      if (i > 0) {
        ctx.strokeStyle = HMI.line;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom - 70);
        ctx.moveTo(x, bottom - 18);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        // Door between compartments: a gap is open, a bar is closed.
        const openDoor = i === 1;
        if (openDoor) {
          ctx.strokeStyle = flash ? HMI.warn : HMI.lineDim;
          ctx.lineWidth = 4;
          ctx.strokeRect(x - 12, bottom - 70, 24, 52);
          ctx.fillStyle = HMI.warn;
          ctx.font = `600 22px ${HMI_FONT.mono}`;
          ctx.textAlign = 'center';
          ctx.fillText('OPEN', x, bottom - 88);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = HMI.line;
          ctx.fillRect(x - 6, bottom - 70, 12, 52);
        }
      }

      const isFlood = c.id === 'C2';
      const tx = x + (i === 0 ? 56 : 20);
      ctx.fillStyle = isFlood ? HMI.white : HMI.text;
      ctx.font = `600 36px ${HMI_FONT.label}`;
      ctx.fillText(`${c.id}  ${c.name}`, tx, top + 46);
      ctx.font = `500 23px ${HMI_FONT.mono}`;
      c.data.forEach(([k, v], j) => {
        const alarmed = isFlood && k === 'LVL';
        ctx.fillStyle = alarmed ? HMI.alarm : HMI.textDim;
        ctx.fillText(k, tx, top + 94 + j * 36);
        ctx.fillStyle = alarmed ? HMI.alarm : HMI.text;
        ctx.fillText(v, tx + 70, top + 94 + j * 36);
      });
    });

    // Alarmed compartment outline.
    const c2x = left + COMPARTMENTS[1].x * hullW;
    const c2w = COMPARTMENTS[1].w * hullW;
    if (flash) {
      ctx.strokeStyle = HMI.alarm;
      ctx.lineWidth = 7;
      ctx.strokeRect(c2x + 6, top + 6, c2w - 12, bottom - top - 12);
    }
    // Level transmitter tag beside the water.
    ctx.fillStyle = HMI.alarm;
    ctx.font = `600 24px ${HMI_FONT.mono}`;
    ctx.fillText('LAH-201', c2x + 20, bottom - (bottom - top) * 0.42 - 16);

    // Ballast main with pumps and valves.
    const py = 646;
    ctx.strokeStyle = HMI.line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 40, py);
    ctx.lineTo(right - 40, py);
    ctx.stroke();
    // Risers from compartments to the main.
    for (const fx of [0.245, 0.405, 0.575]) {
      ctx.beginPath();
      ctx.moveTo(left + fx * hullW, bottom);
      ctx.lineTo(left + fx * hullW, py);
      ctx.stroke();
    }
    pump(ctx, left + 0.2 * hullW, py, 'P-201', 'RUN', HMI.text, t);
    pump(ctx, left + 0.35 * hullW, py, 'P-202', 'TRIP', HMI.warn, 0);
    valve(ctx, left + 0.5 * hullW, py, 'XV-210', 'OPEN', HMI.text);
    valve(ctx, left + 0.68 * hullW, py, 'XV-211', 'CLSD', HMI.textDim);
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 24px ${HMI_FONT.mono}`;
    ctx.fillText('BALLAST MAIN', right - 230, py - 18);
    ctx.fillText('TO SEA', right - 120, py + 40);
  }

  private drawAlarmList(flash: boolean) {
    const { ctx, w, h } = this;
    const top = 776;
    ctx.fillStyle = HMI.bgDeep;
    ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 24px ${HMI_FONT.mono}`;
    const cols = [30, 200, 280, 450, w - 150];
    ['TIME', 'PRI', 'TAG', 'DESCRIPTION', 'STATE'].forEach((label, i) => ctx.fillText(label, cols[i], top + 30));
    ctx.strokeStyle = HMI.lineDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, top + 50);
    ctx.lineTo(w - 20, top + 50);
    ctx.stroke();
    ctx.font = `500 28px ${HMI_FONT.mono}`;
    ALARMS.forEach((a, i) => {
      const y = top + 86 + i * 46;
      const unack = a.state === 'UNACK';
      // Priority marker: a filled shape so colour is never the only cue.
      ctx.fillStyle = unack && !flash ? HMI.bgDeep : a.color;
      ctx.fillRect(cols[1] - 22, y - 12, 14, 24);
      ctx.fillStyle = unack ? HMI.white : HMI.text;
      ctx.fillText(a.time, cols[0], y);
      ctx.fillStyle = a.color;
      ctx.fillText(a.pri, cols[1], y);
      ctx.fillStyle = unack ? HMI.white : HMI.text;
      ctx.fillText(a.tag, cols[2], y);
      ctx.fillText(a.text, cols[3], y);
      ctx.fillStyle = unack ? a.color : HMI.textDim;
      ctx.fillText(a.state, cols[4], y);
    });
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** P&ID pump symbol: a circle with a discharge triangle. */
function pump(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string, state: string, color: string, t: number) {
  ctx.fillStyle = HMI.bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  // A running pump shows a slowly turning impeller mark.
  ctx.rotate(t * 2.5);
  ctx.beginPath();
  ctx.moveTo(-14, 10);
  ctx.lineTo(14, 10);
  ctx.lineTo(0, -16);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = color;
  ctx.font = `600 24px ${HMI_FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.fillText(tag, x, y + 54);
  ctx.fillText(state, x, y + 80);
  ctx.textAlign = 'left';
}

/** P&ID gate valve symbol: two triangles tip to tip. */
function valve(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string, state: string, color: string) {
  ctx.fillStyle = state === 'OPEN' ? HMI.bg : HMI.lineDim;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 24, y - 16);
  ctx.lineTo(x + 24, y + 16);
  ctx.lineTo(x + 24, y - 16);
  ctx.lineTo(x - 24, y + 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `600 24px ${HMI_FONT.mono}`;
  ctx.textAlign = 'center';
  ctx.fillText(tag, x, y + 54);
  ctx.fillText(state, x, y + 80);
  ctx.textAlign = 'left';
}
