import { audio } from '../audio/audio';
import { el, wait } from './overlays';

/**
 * Film subtitles for story scenes: who is speaking, in their suit colour,
 * and the line typed out. A tap, click or Space moves on early; otherwise
 * each line stays up long enough to read. Can also offer a row of things
 * to say when you want to cut in.
 */
export class Subtitles {
  private el = el('section', 'sb');
  private who = el('p', 'sb-who');
  private text = el('p', 'sb-text');
  private choices = el('div', 'sb-choices');
  private more = el('p', 'sb-more', 'Tap to continue');

  constructor(private root: HTMLElement) {
    this.el.setAttribute('aria-live', 'polite');
    this.el.append(this.who, this.text, this.choices, this.more);
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  /** Show one line; resolves when it has been read or tapped past. */
  async line(name: string, colour: string, text: string) {
    this.el.hidden = false;
    this.root.classList.add('is-scene');
    this.choices.innerHTML = '';
    this.who.textContent = name;
    this.who.style.setProperty('--who', colour);
    this.text.textContent = '';
    this.more.hidden = true;
    let skip = false;
    const onSkip = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== ' ' && e.key !== 'Enter') return;
      skip = true;
    };
    addEventListener('pointerdown', onSkip);
    addEventListener('keydown', onSkip);
    for (let i = 0; i <= text.length && !skip; i++) {
      this.text.textContent = text.slice(0, i);
      if (i % 3 === 0) audio.play('typing', { volume: 0.3 });
      await wait(22);
    }
    this.text.textContent = text;
    skip = false;
    this.more.hidden = false;
    const readFor = 1400 + text.length * 38;
    const start = performance.now();
    while (!skip && performance.now() - start < readFor) await wait(60);
    removeEventListener('pointerdown', onSkip);
    removeEventListener('keydown', onSkip);
    this.more.hidden = true;
  }

  /** Offer things to say; resolves with the index chosen. */
  ask(prompt: string, options: { label: string; hint?: string }[]): Promise<number> {
    this.el.hidden = false;
    this.root.classList.add('is-scene');
    this.who.textContent = 'You';
    this.who.style.setProperty('--who', '#f2a900');
    this.text.textContent = prompt;
    this.more.hidden = true;
    this.choices.innerHTML = '';
    return new Promise((done) => {
      const onKey = (e: KeyboardEvent) => {
        const n = Number(e.key);
        if (n >= 1 && n <= options.length) pick(n - 1);
      };
      const pick = (i: number) => {
        removeEventListener('keydown', onKey);
        audio.play('click');
        this.choices.innerHTML = '';
        done(i);
      };
      options.forEach((o, i) => {
        const b = el('button', 'sb-choice') as HTMLButtonElement;
        b.type = 'button';
        b.innerHTML = `<kbd>${i + 1}</kbd><span class="sb-choice-label"></span><span class="sb-choice-hint"></span>`;
        b.querySelector('.sb-choice-label')!.textContent = o.label;
        b.querySelector('.sb-choice-hint')!.textContent = o.hint ?? '';
        b.addEventListener('click', () => pick(i), { once: true });
        this.choices.appendChild(b);
      });
      addEventListener('keydown', onKey);
    });
  }

  hide() {
    this.el.hidden = true;
    this.root.classList.remove('is-scene');
  }
}
