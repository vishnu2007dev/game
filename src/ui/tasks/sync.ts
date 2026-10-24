import { TaskPanel, taskCanvas, INK, type TaskResult } from './panel';
import { audio } from '../../audio/audio';
import { mulberry32 } from '../../engine/rng';
import { el } from '../overlays';

/**
 * Bring the backup generator onto the station bus, the way it is done in
 * a real switchroom. The synchroscope needle turns at the slip between
 * generator and bus: trim the governor until it creeps, then close the
 * breaker as it passes twelve o'clock.
 */
export function syncTask(root: HTMLElement, opts: { title: string; instruction: string; seed: number }): Promise<TaskResult> {
  const panel = new TaskPanel(root, { kicker: 'Hands on', title: opts.title, instruction: opts.instruction });
  const W = 520;
  const H = 300;
  const { canvas, ctx, point } = taskCanvas(panel.area, W, H);
  const rand = mulberry32(opts.seed ^ 0x5eed);
  const BUS = 50;
  const sign = rand() < 0.5 ? -1 : 1;
  let gen = BUS + sign * (1.1 + rand() * 1.0);
  let angle = rand() * Math.PI * 2;
  /** Window either side of twelve o'clock, and the slip that counts as in step. */
  const WINDOW = (18 * Math.PI) / 180;
  const SLOW = 0.15;
  const scope = { x: 150, y: 150, r: 112 };
  const knob = { x: 400, y: 112, r: 46 };
  let dragging = false;
  let lastY = 0;
  let misses = 0;
  let done = false;
  let flash = 0;

  const button = el('button', 'tk-breaker', 'Close breaker') as HTMLButtonElement;
  button.type = 'button';
  panel.area.appendChild(button);
  panel.say('Trim the governor until the needle slows to a crawl.');

  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    if (Math.abs(p.x - knob.x) > 90) return;
    dragging = true;
    lastY = p.y;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging || done) return;
    const y = point(e).y;
    // Drag up to speed the generator up: 80 px is one hertz.
    gen = Math.min(BUS + 3, Math.max(BUS - 3, gen + (lastY - y) / 80));
    lastY = y;
  });
  const up = () => (dragging = false);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') gen = Math.min(BUS + 3, gen + 0.05);
    if (e.key === 'ArrowDown') gen = Math.max(BUS - 3, gen - 0.05);
    if (e.key === ' ' || e.key === 'Enter') button.click();
  });

  button.addEventListener('click', () => {
    if (done) return;
    const slip = gen - BUS;
    const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    if (Math.abs(slip) <= SLOW && off <= WINDOW) {
      done = true;
      audio.play('toggle');
      setTimeout(() => audio.play('thud', { volume: 0.7 }), 120);
      panel.say('In phase. Generator on the bus.', 'good');
      button.disabled = true;
      void panel.finish({ quality: Math.max(0.4, 1 - misses * 0.2) });
      return;
    }
    misses++;
    flash = 1;
    audio.play('zap', { volume: 0.6 });
    panel.say(Math.abs(slip) > SLOW ? 'Breaker tripped. Too much slip: trim the governor first.' : 'Breaker tripped. Out of phase: wait for twelve o clock.'.replace(' ', "'"), 'bad');
  });

  let prev = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.25, (now - prev) / 1000);
    prev = now;
    const slip = gen - BUS;
    // One revolution per second per hertz of slip, as on a real synchroscope.
    if (!done) angle += slip * Math.PI * 2 * dt;
    flash = Math.max(0, flash - dt * 2);
    canvas.dataset.angle = String(Math.round((Math.atan2(Math.sin(angle), Math.cos(angle)) * 180) / Math.PI));
    canvas.dataset.slip = slip.toFixed(2);
    if (!done && !flash) {
      if (Math.abs(slip) > SLOW) panel.say(slip > 0 ? 'Generator fast. Drag the governor down.' : 'Generator slow. Drag the governor up.');
      else panel.say('Slow enough. Close the breaker as the needle reaches the top.', 'good');
    }
    draw(slip);
    if (canvas.isConnected) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  function draw(slip: number) {
    ctx.fillStyle = INK.bg;
    ctx.fillRect(0, 0, W, H);
    // Synchroscope face.
    ctx.fillStyle = '#0a0d0f';
    ctx.beginPath();
    ctx.arc(scope.x, scope.y, scope.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    // In-phase window at twelve o'clock.
    ctx.strokeStyle = INK.good;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(scope.x, scope.y, scope.r - 14, -Math.PI / 2 - WINDOW, -Math.PI / 2 + WINDOW);
    ctx.stroke();
    // Ticks.
    ctx.strokeStyle = INK.dim;
    ctx.lineWidth = 2;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r0 = scope.r - (i % 6 === 0 ? 30 : 24);
      ctx.beginPath();
      ctx.moveTo(scope.x + Math.cos(a) * r0, scope.y + Math.sin(a) * r0);
      ctx.lineTo(scope.x + Math.cos(a) * (scope.r - 20), scope.y + Math.sin(a) * (scope.r - 20));
      ctx.stroke();
    }
    ctx.fillStyle = INK.dim;
    ctx.font = `500 11px ${INK.font}`;
    ctx.textAlign = 'center';
    ctx.fillText('SLOW', scope.x - 62, scope.y + 4);
    ctx.fillText('FAST', scope.x + 62, scope.y + 4);
    ctx.fillText('SYNCHROSCOPE', scope.x, scope.y + scope.r + 18);
    // Needle.
    const na = angle - Math.PI / 2;
    ctx.strokeStyle = flash ? INK.bad : INK.text;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(scope.x - Math.cos(na) * 18, scope.y - Math.sin(na) * 18);
    ctx.lineTo(scope.x + Math.cos(na) * (scope.r - 22), scope.y + Math.sin(na) * (scope.r - 22));
    ctx.stroke();
    ctx.fillStyle = '#5b6066';
    ctx.beginPath();
    ctx.arc(scope.x, scope.y, 10, 0, Math.PI * 2);
    ctx.fill();
    // Governor knob: a ridged dial whose marker follows the setting.
    const turn = ((gen - BUS) / 3) * Math.PI * 0.8;
    ctx.save();
    ctx.translate(knob.x, knob.y);
    ctx.rotate(turn);
    ctx.fillStyle = '#23292e';
    ctx.beginPath();
    ctx.arc(0, 0, knob.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3d454c';
    ctx.lineWidth = 3;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (knob.r - 8), Math.sin(a) * (knob.r - 8));
      ctx.lineTo(Math.cos(a) * knob.r, Math.sin(a) * knob.r);
      ctx.stroke();
    }
    ctx.fillStyle = INK.warn;
    ctx.fillRect(-3, -knob.r + 6, 6, 18);
    ctx.restore();
    ctx.fillStyle = INK.dim;
    ctx.font = `500 11px ${INK.font}`;
    ctx.fillText('GOVERNOR', knob.x, knob.y + knob.r + 18);
    ctx.fillText('DRAG UP OR DOWN', knob.x, knob.y + knob.r + 32);
    // Frequency readout.
    const inStep = Math.abs(slip) <= SLOW;
    ctx.font = `600 16px ${INK.font}`;
    ctx.fillStyle = inStep ? INK.good : INK.text;
    ctx.fillText(`GEN ${gen.toFixed(1)} Hz`, knob.x, H - 46);
    ctx.fillStyle = INK.dim;
    ctx.fillText(`BUS ${BUS.toFixed(1)} Hz`, knob.x, H - 24);
  }

  return panel.result;
}
