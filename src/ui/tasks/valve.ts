import { TaskPanel, taskCanvas, INK, type TaskResult } from './panel';
import { audio } from '../../audio/audio';

/**
 * Bleed a tank: turn the handwheel clockwise to drop the pressure into
 * the green band, anticlockwise to bring it back up. It has to sit in
 * the band for a moment before it counts.
 */
export function valveTask(root: HTMLElement, opts: { title: string; instruction: string; start?: number }): Promise<TaskResult> {
  const panel = new TaskPanel(root, { kicker: 'Hands on', title: opts.title, instruction: opts.instruction });
  const W = 520;
  const H = 300;
  const { canvas, ctx, point } = taskCanvas(panel.area, W, H);
  const band = [0.42, 0.56];
  let pressure = opts.start ?? 0.86;
  let shown = pressure;
  let angle = 0;
  let dragging = false;
  let last = 0;
  let settledFor = 0;
  let done = false;
  let ticked = 0;
  const wheel = { x: 380, y: 150, r: 92 };
  const gauge = { x: 140, y: 160, r: 108 };

  const angleAt = (p: { x: number; y: number }) => Math.atan2(p.y - wheel.y, p.x - wheel.x);
  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    if (Math.hypot(p.x - wheel.x, p.y - wheel.y) > wheel.r + 40) return;
    dragging = true;
    last = angleAt(p);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || done) return;
    const a = angleAt(point(e));
    let d = a - last;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    last = a;
    angle += d;
    // A full turn moves the needle about a fifth of the scale.
    pressure = Math.min(0.98, Math.max(0.05, pressure - d * 0.032));
    ticked += Math.abs(d);
    if (ticked > 0.5) {
      ticked = 0;
      audio.play('click', { volume: 0.25 });
    }
  });
  const up = () => (dragging = false);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // Keyboard: arrows turn the wheel.
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pressure = Math.max(0.05, pressure - 0.02);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pressure = Math.min(0.98, pressure + 0.02);
    angle += e.key.startsWith('Arrow') ? 0.3 : 0;
  });

  let prev = performance.now();
  const frame = (now: number) => {
    const real = (now - prev) / 1000;
    const dt = Math.min(0.1, real);
    prev = now;
    shown += (pressure - shown) * Math.min(1, dt * 6);
    // Judge the real pressure; the needle only shows it with a little lag.
    const inBand = pressure > band[0] && pressure < band[1];
    if (!done) {
      settledFor = inBand && !dragging && Math.abs(shown - pressure) < 0.02 ? settledFor + real : 0;
      if (inBand) panel.say(dragging ? 'In the band. Let go to hold it there.' : 'Holding.', 'good');
      else panel.say(pressure > band[1] ? 'Too high. Turn clockwise.' : 'Too low. Turn back anticlockwise.', pressure > band[1] + 0.2 ? 'plain' : 'bad');
      if (settledFor > 0.8) {
        done = true;
        panel.say('Pressure steady. Tank bled.', 'good');
        void panel.finish({ quality: 1 });
      }
    }
    draw(shown > band[0] && shown < band[1]);
    if (canvas.isConnected) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function draw(inBand: boolean) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = INK.bg;
    ctx.fillRect(0, 0, W, H);
    // Gauge: a 240 degree dial, green band marked.
    const a0 = Math.PI * 0.75;
    const span = Math.PI * 1.5;
    ctx.lineWidth = 14;
    ctx.strokeStyle = INK.line;
    ctx.beginPath();
    ctx.arc(gauge.x, gauge.y, gauge.r, a0, a0 + span);
    ctx.stroke();
    ctx.strokeStyle = INK.good;
    ctx.beginPath();
    ctx.arc(gauge.x, gauge.y, gauge.r, a0 + span * band[0], a0 + span * band[1]);
    ctx.stroke();
    ctx.strokeStyle = INK.bad;
    ctx.beginPath();
    ctx.arc(gauge.x, gauge.y, gauge.r, a0 + span * 0.85, a0 + span);
    ctx.stroke();
    ctx.fillStyle = INK.dim;
    ctx.font = `500 11px ${INK.font}`;
    ctx.textAlign = 'center';
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (span * i) / 10;
      ctx.fillText(String(i), gauge.x + Math.cos(a) * (gauge.r - 26), gauge.y + Math.sin(a) * (gauge.r - 26) + 4);
    }
    const na = a0 + span * shown;
    ctx.strokeStyle = INK.text;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(gauge.x, gauge.y);
    ctx.lineTo(gauge.x + Math.cos(na) * (gauge.r - 8), gauge.y + Math.sin(na) * (gauge.r - 8));
    ctx.stroke();
    ctx.fillStyle = INK.text;
    ctx.beginPath();
    ctx.arc(gauge.x, gauge.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 22px ${INK.font}`;
    ctx.fillStyle = inBand ? INK.good : INK.text;
    ctx.fillText(`${(shown * 10).toFixed(1)} BAR`, gauge.x, gauge.y + 62);
    ctx.font = `500 11px ${INK.font}`;
    ctx.fillStyle = INK.dim;
    ctx.fillText('TRIM TANK 2', gauge.x, gauge.y + 82);
    // Handwheel, turning with the drag.
    ctx.save();
    ctx.translate(wheel.x, wheel.y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#a3241a';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.arc(0, 0, wheel.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#c23a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, wheel.r - 5, Math.PI * 1.1, Math.PI * 1.6);
    ctx.stroke();
    ctx.strokeStyle = '#8c9196';
    ctx.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * wheel.r, Math.sin(a) * wheel.r);
      ctx.stroke();
    }
    ctx.fillStyle = '#5b6066';
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = INK.dim;
    ctx.font = `500 11px ${INK.font}`;
    ctx.fillText('DRAG AROUND THE WHEEL', wheel.x, H - 14);
  }

  return panel.result;
}
