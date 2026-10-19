import * as THREE from 'three';
import { HMI, HMI_FONT, clock } from './palette';
import { initialView, type Level, type StationView } from './view';

const COMPARTMENTS = [
  { id: 'C1', name: 'COMMAND', x: 0, w: 0.17 },
  { id: 'C2', name: 'BALLAST', x: 0.17, w: 0.16 },
  { id: 'C3', name: 'POWER', x: 0.33, w: 0.17 },
  { id: 'C4', name: 'LAB', x: 0.5, w: 0.165 },
  { id: 'C5', name: 'QUARTERS', x: 0.665, w: 0.17 },
  { id: 'C6', name: 'DIVE BAY', x: 0.835, w: 0.165 },
];

const levelColour = { HIGH: HMI.alarm, MED: HMI.warn, LOW: HMI.text };

const colourOf = (l: Level): string => (l === 'alarm' ? HMI.alarm : l === 'warn' ? HMI.warn : HMI.text);

/**
 * Station overview: a cutaway of the six rooms, the ballast pipe and the
 * alarm list. Wording is plain so a first-time player understands it,
 * while the layout follows real control room screens.
 */
export class OverviewScreen {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  readonly w = 1600;
  readonly h = 1000;
  view: StationView = initialView();
  /** Seconds added to the station clock, so each morning starts later. */
  clockOffset = 0;

  constructor() {
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }

  draw(t: number) {
    const { ctx, w } = this;
    const flash = Math.floor(t * 2) % 2 === 0;

    ctx.fillStyle = HMI.bg;
    ctx.fillRect(0, 0, w, this.h);

    // Title bar.
    ctx.fillStyle = HMI.bgDeep;
    ctx.fillRect(0, 0, w, 80);
    ctx.textBaseline = 'middle';
    ctx.font = `600 46px ${HMI_FONT.label}`;
    ctx.fillStyle = HMI.white;
    ctx.fillText('HELIOS DEEP', 32, 41);
    ctx.fillStyle = HMI.textDim;
    ctx.fillText('STATION MAP', 260, 41);
    ctx.textAlign = 'right';
    ctx.font = `500 34px ${HMI_FONT.mono}`;
    ctx.fillStyle = HMI.text;
    ctx.fillText(`DAY ${this.view.day}   ${clock(t + this.clockOffset)}`, w - 32, 41);
    ctx.textAlign = 'left';

    // The alarm banner flashes until the operator deals with it. With no
    // alarm the strip stays gray, which is the point of a calm screen.
    const banner = this.view.banner;
    if (banner) {
      const on = banner.level === 'alarm' ? HMI.alarm : HMI.warn;
      const off = banner.level === 'alarm' ? '#5a1714' : '#5a4310';
      ctx.fillStyle = flash ? on : off;
      ctx.fillRect(0, 80, w, 100);
      ctx.fillStyle = flash ? (banner.level === 'alarm' ? '#ffffff' : '#1a1a1a') : '#f0dcd0';
      ctx.font = `700 60px ${HMI_FONT.label}`;
      ctx.fillText(banner.text, 32, 132);
      ctx.textAlign = 'right';
      ctx.font = `600 34px ${HMI_FONT.mono}`;
      ctx.fillText('ACTIVE', w - 32, 132);
    } else {
      ctx.fillStyle = HMI.panel;
      ctx.fillRect(0, 80, w, 100);
      ctx.fillStyle = HMI.textDim;
      ctx.font = `600 44px ${HMI_FONT.label}`;
      ctx.fillText('NO ACTIVE ALARMS', 32, 132);
    }
    ctx.textAlign = 'left';

    this.drawMap(t, flash);
    this.drawAlarms(flash);
  }

  private drawMap(t: number, flash: boolean) {
    const { ctx, w } = this;
    const left = 40;
    const right = w - 40;
    const top = 222;
    const bottom = 556;
    const hullW = right - left;
    const r = 80;

    // Flood water inside C2, clipped to the hull.
    const v = this.view;
    const c2 = COMPARTMENTS[1];
    const cx = left + c2.x * hullW;
    const cw = c2.w * hullW;
    const level = Math.max(0.005, v.water + Math.sin(t * 0.7) * 0.004);
    const waterTop = bottom - (bottom - top) * level;
    const wave = (x: number) => waterTop + Math.sin(x * 0.05 + t * 3) * 3;
    ctx.save();
    roundRect(ctx, left, top, hullW, bottom - top, r);
    ctx.clip();
    ctx.fillStyle = HMI.water;
    ctx.beginPath();
    ctx.moveTo(cx, bottom);
    for (let x = 0; x <= cw; x += 8) ctx.lineTo(cx + x, wave(x));
    ctx.lineTo(cx + cw, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = HMI.waterHi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= cw; x += 8) (x ? ctx.lineTo : ctx.moveTo).call(ctx, cx + x, wave(x));
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = HMI.line;
    ctx.lineWidth = 5;
    roundRect(ctx, left, top, hullW, bottom - top, r);
    ctx.stroke();

    COMPARTMENTS.forEach((c, i) => {
      const x = left + c.x * hullW;
      if (i > 0) {
        // Bulkhead wall with its door near the floor.
        ctx.strokeStyle = HMI.line;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom - 78);
        ctx.moveTo(x, bottom - 16);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        if (i === 1 && v.doorOpen) {
          // The open door: an outlined gap, flashing amber.
          ctx.strokeStyle = flash ? HMI.warn : HMI.lineDim;
          ctx.lineWidth = 4;
          ctx.strokeRect(x - 13, bottom - 78, 26, 62);
        } else {
          ctx.fillStyle = HMI.line;
          ctx.fillRect(x - 6, bottom - 78, 12, 62);
        }
      }
      const room = v.rooms[i];
      const tx = x + (i === 0 ? 52 : 18);
      ctx.fillStyle = room.level === 'normal' ? HMI.text : HMI.white;
      ctx.font = `600 40px ${HMI_FONT.label}`;
      ctx.fillText(`${c.id} ${c.name}`, tx, top + 48);
      ctx.font = `600 32px ${HMI_FONT.mono}`;
      ctx.fillStyle = colourOf(room.level);
      ctx.fillText(room.status, tx, top + 104);
      ctx.font = `500 28px ${HMI_FONT.mono}`;
      ctx.fillStyle = HMI.textDim;
      ctx.fillText(room.crew === 1 ? '1 PERSON' : `${room.crew} PEOPLE`, tx, top + 148);
    });

    // Label for the open door, below the hull so it never hits the water.
    const doorX = left + COMPARTMENTS[1].x * hullW;
    ctx.fillStyle = v.doorOpen ? HMI.warn : HMI.textDim;
    ctx.font = `600 28px ${HMI_FONT.mono}`;
    ctx.fillText(v.doorOpen ? 'DOOR OPEN' : 'DOOR SHUT', doorX - 70, bottom + 38);

    if (flash && v.rooms[1].level === 'alarm') {
      ctx.strokeStyle = HMI.alarm;
      ctx.lineWidth = 7;
      ctx.strokeRect(cx + 6, top + 6, cw - 12, bottom - top - 12);
    }
    ctx.fillStyle = HMI.white;
    ctx.font = `600 30px ${HMI_FONT.mono}`;
    if (v.water > 0.12) ctx.fillText(`WATER ${Math.round(v.water * 100)}%`, cx + 18, waterTop + 44);

    // Ballast pipe with its two pumps and two valves.
    const py = 664;
    ctx.strokeStyle = HMI.line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left + 300, py);
    ctx.lineTo(right - 40, py);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + cw * 0.5, bottom);
    ctx.lineTo(cx + cw * 0.5, py);
    ctx.stroke();
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 28px ${HMI_FONT.mono}`;
    ctx.fillText('PUMPS', left + 20, py + 10);
    const p1c = v.pump1 === 'ON' ? HMI.text : v.pump1 === 'HOT' ? HMI.alarm : HMI.textDim;
    const p2c = v.pump2 === 'ON' ? HMI.text : HMI.warn;
    pump(ctx, left + 0.38 * hullW, py, 'PUMP 1', v.pump1, p1c, v.pump1 === 'OFF' ? 0 : t);
    pump(ctx, left + 0.52 * hullW, py, 'PUMP 2', v.pump2, p2c, v.pump2 === 'ON' ? t : 0);
    valve(ctx, left + 0.68 * hullW, py, 'VALVE', 'OPEN', HMI.text);
    ctx.fillStyle = HMI.textDim;
    ctx.textAlign = 'right';
    ctx.fillText('TO SEA', right - 40, py - 22);
    ctx.textAlign = 'left';
  }

  private drawAlarms(flash: boolean) {
    const { ctx, w, h } = this;
    const top = 770;
    ctx.fillStyle = HMI.bgDeep;
    ctx.fillRect(0, top, w, h - top);
    ctx.fillStyle = HMI.textDim;
    ctx.font = `500 26px ${HMI_FONT.mono}`;
    const cols = [32, 170, 330, w - 120];
    ['TIME', 'LEVEL', 'WHAT HAPPENED'].forEach((label, i) => ctx.fillText(label, cols[i], top + 32));
    ctx.textAlign = 'right';
    ctx.fillText('STATUS', w - 32, top + 32);
    ctx.textAlign = 'left';
    ctx.strokeStyle = HMI.lineDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, top + 56);
    ctx.lineTo(w - 20, top + 56);
    ctx.stroke();
    ctx.font = `500 34px ${HMI_FONT.mono}`;
    this.view.alarms.slice(0, 3).forEach((alarm, i) => {
      const a = { ...alarm, color: alarm.state === 'CLEARED' ? HMI.textDim : levelColour[alarm.level] };
      const y = top + 98 + i * 52;
      const fresh = a.state === 'NEW';
      // A filled marker, so colour is never the only cue.
      ctx.fillStyle = fresh && !flash ? HMI.bgDeep : a.color;
      ctx.fillRect(cols[1] - 26, y - 14, 14, 28);
      ctx.fillStyle = fresh ? HMI.white : HMI.text;
      ctx.fillText(a.time, cols[0], y);
      ctx.fillStyle = a.color;
      ctx.fillText(a.level, cols[1], y);
      ctx.fillStyle = fresh ? HMI.white : HMI.text;
      ctx.fillText(a.text, cols[2], y);
      ctx.textAlign = 'right';
      ctx.fillStyle = fresh ? a.color : HMI.textDim;
      ctx.fillText(a.state, w - 32, y);
      ctx.textAlign = 'left';
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

/** Pump symbol: a circle with a discharge triangle that turns when on. */
function pump(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string, state: string, color: string, t: number) {
  ctx.fillStyle = HMI.bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 2.5);
  ctx.beginPath();
  ctx.moveTo(-15, 11);
  ctx.lineTo(15, 11);
  ctx.lineTo(0, -17);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  label(ctx, x, y, tag, state, color);
}

/** Valve symbol: two triangles tip to tip. */
function valve(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string, state: string, color: string) {
  ctx.fillStyle = HMI.bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 26, y - 17);
  ctx.lineTo(x + 26, y + 17);
  ctx.lineTo(x + 26, y - 17);
  ctx.lineTo(x - 26, y + 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  label(ctx, x, y, tag, state, color);
}

function label(ctx: CanvasRenderingContext2D, x: number, y: number, tag: string, state: string, color: string) {
  ctx.textAlign = 'center';
  ctx.font = `500 26px ${HMI_FONT.mono}`;
  ctx.fillStyle = HMI.textDim;
  ctx.fillText(tag, x, y + 56);
  ctx.font = `600 28px ${HMI_FONT.mono}`;
  ctx.fillStyle = color;
  ctx.fillText(state, x, y + 86);
  ctx.textAlign = 'left';
}
