import { audio } from '../audio/audio';

export type CoachTarget = { el: HTMLElement } | { point: () => { x: number; y: number; visible: boolean } } | null;

/**
 * Tutorial prompts: one short instruction at a time, with a marker on
 * the thing to use, a step count and a way out.
 */
export class Coach {
  private el = document.createElement('aside');
  private text: HTMLElement;
  private step: HTMLElement;
  private next: HTMLButtonElement;
  private ring = document.createElement('div');
  private marked: HTMLElement | null = null;
  private raf = 0;
  onSkip: () => void = () => {};

  constructor(private root: HTMLElement) {
    this.el.className = 'co';
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <p class="co-step"></p>
      <p class="co-text"></p>
      <div class="co-actions">
        <button type="button" class="co-next" hidden>Next</button>
        <button type="button" class="co-skip">Skip tutorial</button>
      </div>`;
    this.text = this.el.querySelector('.co-text')!;
    this.step = this.el.querySelector('.co-step')!;
    this.next = this.el.querySelector('.co-next')!;
    this.el.querySelector('.co-skip')!.addEventListener('click', () => {
      audio.play('click');
      this.onSkip();
    });
    this.ring.className = 'co-ring';
    this.ring.hidden = true;
    this.el.hidden = true;
    root.append(this.el, this.ring);
  }

  /**
   * Show one step. Resolves when the Next button is pressed, if there is
   * one; otherwise the caller decides when the step is done.
   */
  say(step: string, text: string, target: CoachTarget, withNext?: string): Promise<void> {
    this.clearTarget();
    this.el.hidden = false;
    this.root.classList.add('is-coaching');
    this.step.textContent = step;
    this.text.textContent = text;
    this.el.classList.remove('is-in');
    void this.el.offsetWidth;
    this.el.classList.add('is-in');
    audio.play('confirm', { volume: 0.35 });
    if (target && 'el' in target) {
      this.marked = target.el;
      target.el.classList.add('is-coached');
    } else if (target) {
      const follow = () => {
        const p = target.point();
        // Off to one side: sit on the screen edge with an arrow that way.
        const m = 44;
        const off = p.x < m || p.x > innerWidth - m || p.y < m || p.y > innerHeight - m;
        const x = Math.min(Math.max(p.x, m), innerWidth - m);
        const sideways = p.x < m || p.x > innerWidth - m;
        const y = sideways ? innerHeight * 0.5 : Math.min(Math.max(p.y, m), innerHeight - m);
        this.ring.hidden = !p.visible;
        this.ring.classList.toggle('is-off', off);
        this.ring.dataset.dir = p.x < m ? 'left' : p.x > innerWidth - m ? 'right' : p.y < m ? 'up' : 'down';
        this.ring.style.transform = `translate(${x}px, ${y}px)`;
        this.raf = requestAnimationFrame(follow);
      };
      follow();
    }
    this.next.hidden = !withNext;
    if (!withNext) return Promise.resolve();
    this.next.textContent = withNext;
    return new Promise((done) =>
      this.next.addEventListener(
        'click',
        () => {
          audio.play('click');
          done();
        },
        { once: true },
      ),
    );
  }

  private clearTarget() {
    cancelAnimationFrame(this.raf);
    this.ring.hidden = true;
    this.marked?.classList.remove('is-coached');
    this.marked = null;
  }

  hide() {
    this.clearTarget();
    this.el.hidden = true;
    this.root.classList.remove('is-coaching');
  }
}
