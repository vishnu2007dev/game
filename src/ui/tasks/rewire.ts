import { TaskPanel, taskCanvas, INK, type TaskResult } from './panel';
import { audio } from '../../audio/audio';
import { mulberry32 } from '../../engine/rng';

const WIRES = [
  { name: 'RED', color: '#c8392b' },
  { name: 'YELLOW', color: '#d9a51a' },
  { name: 'BLUE', color: '#2f74b5' },
  { name: 'GREEN', color: '#3f9b55' },
];

/**
 * Junction box: four loose wires on the left, four labelled terminals on
 * the right in a different order. Drag each wire to its terminal.
 */
export function rewireTask(root: HTMLElement, opts: { title: string; instruction: string; seed: number }): Promise<TaskResult> {
  const panel = new TaskPanel(root, { kicker: 'Hands on', title: opts.title, instruction: opts.instruction });
  const W = 520;
  const H = 300;
  const { canvas, ctx, point } = taskCanvas(panel.area, W, H);
  const rand = mulberry32(opts.seed);
  const order = [0, 1, 2, 3].sort(() => rand() - 0.5);
  const left = WIRES.map((_, i) => ({ x: 70, y: 60 + i * 60 }));
  const right = order.map((_, i) => ({ x: 450, y: 60 + i * 60 }));
  const done = new Set<number>();
  let drag: { wire: number; x: number; y: number } | null = null;
  let mistakes = 0;
  panel.say('Drag a wire end to its terminal.');

  canvas.addEventListener('pointerdown', (e) => {
    const p = point(e);
    const i = left.findIndex((l, k) => !done.has(k) && Math.hypot(p.x - l.x, p.y - l.y) < 30);
    if (i < 0) return;
    drag = { wire: i, ...p };
    canvas.setPointerCapture(e.pointerId);
    audio.play('click', { volume: 0.3 });
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) Object.assign(drag, point(e));
  });
  canvas.addEventListener('pointerup', () => {
    if (!drag) return;
    const slot = right.findIndex((r) => Math.hypot(drag!.x - r.x, drag!.y - r.y) < 34);
    if (slot >= 0 && order[slot] === drag.wire) {
      done.add(drag.wire);
      audio.play('toggle', { volume: 0.6 });
      panel.say(`${WIRES[drag.wire].name} connected.`, 'good');
      if (done.size === WIRES.length) {
        panel.say('All four live. Junction box closed.', 'good');
        void panel.finish({ quality: Math.max(0.4, 1 - mistakes * 0.15) });
      }
    } else if (slot >= 0) {
      mistakes++;
      audio.play('zap', { volume: 0.5 });
      panel.say(`Wrong terminal. That one is ${WIRES[order[slot]].name}.`, 'bad');
    }
    drag = null;
  });

  const draw = () => {
    ctx.fillStyle = INK.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK.panel;
    ctx.fillRect(400, 30, 100, 240);
    ctx.font = `600 11px ${INK.font}`;
    ctx.textAlign = 'right';
    right.forEach((r, i) => {
      const w = WIRES[order[i]];
      ctx.fillStyle = INK.dim;
      ctx.fillText(w.name, r.x - 22, r.y + 4);
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9ba3a9';
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    WIRES.forEach((w, i) => {
      const a = left[i];
      let b: { x: number; y: number } = { x: a.x + 30, y: a.y + 6 };
      if (done.has(i)) b = right[order.indexOf(i)];
      else if (drag?.wire === i) b = drag;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(10, a.y);
      ctx.bezierCurveTo((10 + b.x) / 2, a.y + 40, (10 + b.x) / 2, b.y - 40, b.x, b.y);
      ctx.stroke();
      // Bare copper at the free end.
      if (!done.has(i)) {
        ctx.fillStyle = '#c98a4a';
        ctx.beginPath();
        ctx.arc(b.x, b.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (canvas.isConnected) requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return panel.result;
}
