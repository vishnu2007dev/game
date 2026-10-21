import { el } from '../overlays';
import { audio } from '../../audio/audio';

export interface TaskResult {
  /** 0 to 1, how cleanly it was done. null when the player stepped away. */
  quality: number | null;
}

/**
 * The frame every hands-on task opens in: a dark instrument panel with a
 * title, one line of instruction, the working area, a status line and a
 * way to step away and come back later.
 */
export class TaskPanel {
  readonly el = el('section', 'tk');
  readonly area: HTMLElement;
  private status: HTMLElement;
  private resolve!: (r: TaskResult) => void;
  readonly result: Promise<TaskResult>;

  constructor(root: HTMLElement, opts: { kicker: string; title: string; instruction: string }) {
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', opts.title);
    this.el.innerHTML = `
      <div class="tk-box">
        <header class="tk-head">
          <p class="tk-kicker"></p>
          <h2 class="tk-title"></h2>
          <p class="tk-do"></p>
        </header>
        <div class="tk-area"></div>
        <footer class="tk-foot">
          <p class="tk-status" aria-live="polite"></p>
          <button type="button" class="tk-later">Do it later</button>
        </footer>
      </div>`;
    this.el.querySelector('.tk-kicker')!.textContent = opts.kicker;
    this.el.querySelector('.tk-title')!.textContent = opts.title;
    this.el.querySelector('.tk-do')!.textContent = opts.instruction;
    this.area = this.el.querySelector('.tk-area')!;
    this.status = this.el.querySelector('.tk-status')!;
    this.result = new Promise((r) => (this.resolve = r));
    this.el.querySelector('.tk-later')!.addEventListener('click', () => {
      audio.play('click');
      this.finish({ quality: null });
    });
    root.appendChild(this.el);
    audio.play('confirm', { volume: 0.4 });
  }

  say(text: string, tone: 'plain' | 'good' | 'bad' = 'plain') {
    this.status.textContent = text;
    this.status.className = `tk-status is-${tone}`;
  }

  /** Close with a result after a short beat so the player sees it land. */
  async finish(r: TaskResult) {
    if (r.quality !== null) {
      this.el.classList.add('is-done');
      audio.play('confirm');
      await new Promise((ok) => setTimeout(ok, 900));
    }
    this.el.classList.add('is-leaving');
    setTimeout(() => this.el.remove(), 250);
    this.resolve(r);
  }
}

/** A canvas sized in CSS pixels with a sharp backing store, and pointer positions in the same units. */
export function taskCanvas(area: HTMLElement, w: number, h: number) {
  const c = document.createElement('canvas');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = w * dpr;
  c.height = h * dpr;
  c.className = 'tk-canvas';
  c.style.aspectRatio = `${w} / ${h}`;
  area.appendChild(c);
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const point = (e: PointerEvent) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };
  return { canvas: c, ctx, point };
}

/** Station instrument colours, matching the HMI screens. */
export const INK = {
  bg: '#14181b',
  panel: '#1d2328',
  line: '#3a434a',
  text: '#d7dde1',
  dim: '#7f8a92',
  good: '#4fc77a',
  warn: '#f2a900',
  bad: '#d7261e',
  font: '"IBM Plex Mono", ui-monospace, monospace',
  label: '"Barlow Condensed", "Arial Narrow", sans-serif',
};
