import type { CrewDef } from '../scene/station';
import { audio } from '../audio/audio';
import { el, type, choose, wait } from './overlays';

/**
 * A call with one crew member: their live suit camera at the top, the
 * conversation as typed messages, and your replies as choices. The
 * camera frame is a transparent window; the 3D view draws the picture
 * into it from behind.
 */
export class ChatPanel {
  private el = el('section', 'ch');
  private frame: HTMLElement;
  private who: HTMLElement;
  private role: HTMLElement;
  private body: HTMLElement;
  private foot: HTMLElement;
  private clock = 0;

  constructor(root: HTMLElement) {
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="ch-cam">
        <div class="ch-frame"></div>
        <p class="ch-cam-tag"><span class="ch-rec"></span><span class="ch-cam-name"></span></p>
        <p class="ch-cam-time"></p>
      </div>
      <header class="ch-head">
        <span class="ch-swatch"></span>
        <span class="ch-who"></span>
        <span class="ch-role"></span>
        <span class="ch-signal" aria-label="Signal strong"><i></i><i></i><i></i><i></i></span>
      </header>
      <div class="ch-body"></div>
      <footer class="ch-foot"></footer>`;
    this.frame = this.el.querySelector('.ch-frame')!;
    this.who = this.el.querySelector('.ch-who')!;
    this.role = this.el.querySelector('.ch-role')!;
    this.body = this.el.querySelector('.ch-body')!;
    this.foot = this.el.querySelector('.ch-foot')!;
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** Open the panel for a person. Returns the camera frame for the 3D view to draw into. */
  open(c: CrewDef): HTMLElement {
    this.who.textContent = c.name;
    this.role.textContent = c.role;
    this.el.querySelector<HTMLElement>('.ch-swatch')!.style.background = c.suit;
    this.el.querySelector('.ch-cam-name')!.textContent = `Suit cam  ${c.callsign}`;
    this.body.innerHTML = '';
    this.foot.innerHTML = '';
    this.el.hidden = false;
    this.el.classList.remove('is-leaving');
    audio.play('pickup');
    const time = this.el.querySelector('.ch-cam-time')!;
    const start = performance.now();
    clearInterval(this.clock);
    const tick = () => {
      const s = Math.floor((performance.now() - start) / 1000);
      time.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    this.clock = window.setInterval(tick, 1000);
    return this.frame;
  }

  /** A message from them, typed out. */
  async say(text: string) {
    const p = el('p', 'ch-msg');
    this.body.appendChild(p);
    await type(p, text, this.el, 55);
    this.scroll();
    await wait(220);
  }

  /** Your side of the conversation. */
  you(text: string) {
    this.body.appendChild(el('p', 'ch-msg is-you', text));
    this.scroll();
  }

  /** Offer replies; resolves with the index picked. */
  async choose(choices: { label: string; hint?: string }[]) {
    this.foot.innerHTML = '';
    const buttons = choices.map((c, i) => {
      const b = el('button', 'ch-choice') as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `<kbd>${i + 1}</kbd><span class="ch-choice-label"></span><span class="ch-choice-hint"></span>`;
      b.querySelector('.ch-choice-label')!.textContent = c.label;
      b.querySelector('.ch-choice-hint')!.textContent = c.hint ?? '';
      this.foot.appendChild(b);
      return b;
    });
    this.scroll();
    const i = await choose(buttons);
    this.foot.innerHTML = '';
    this.you(choices[i].label);
    return i;
  }

  /** End of the call: wait for Hang up, then close. */
  async hangUp(label = 'Hang up') {
    this.foot.innerHTML = '';
    const b = el('button', 'ch-hang', label) as HTMLButtonElement;
    b.type = 'button';
    this.foot.appendChild(b);
    await choose([b]);
    this.close();
  }

  close() {
    clearInterval(this.clock);
    this.el.classList.add('is-leaving');
    audio.play('click');
    setTimeout(() => (this.el.hidden = true), 250);
  }

  private scroll() {
    this.body.scrollTop = this.body.scrollHeight;
  }
}
