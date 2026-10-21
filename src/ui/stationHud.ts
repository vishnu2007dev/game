import type { CrewDef, RoomDef } from '../scene/station';
import { audio } from '../audio/audio';

/**
 * Interface for the station view: where you are, what the room is for,
 * who someone is when you tap them, and a way back.
 */
export class StationHud {
  private el = document.createElement('div');
  private place: HTMLElement;
  private blurb: HTMLElement;
  private hint: HTMLElement;
  private back: HTMLButtonElement;
  private card: HTMLElement;
  private fade: HTMLElement;
  private cardToken = 0;
  /** A game hint that replaces the default room hints while it is set. */
  private gameHint = '';
  onBack: () => void = () => {};
  /** Set when calls are possible; the crew card then offers a Call button. */
  onCall: ((id: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.el.className = 'sh';
    this.el.innerHTML = `
      <header class="sh-top">
        <p class="sh-kicker">Helios Deep   3012 m   Day 1</p>
        <p class="sh-place" id="sh-place">Station</p>
        <p class="sh-blurb" id="sh-blurb"></p>
      </header>
      <aside class="sh-card" id="sh-card" hidden aria-live="polite"></aside>
      <footer class="sh-bottom">
        <button type="button" class="sh-back" id="sh-back" hidden>Back to station</button>
        <p class="sh-hint" id="sh-hint"></p>
      </footer>
      <div class="sh-fade" id="sh-fade"></div>`;
    root.appendChild(this.el);
    this.place = this.el.querySelector('#sh-place')!;
    this.blurb = this.el.querySelector('#sh-blurb')!;
    this.hint = this.el.querySelector('#sh-hint')!;
    this.back = this.el.querySelector('#sh-back')!;
    this.card = this.el.querySelector('#sh-card')!;
    this.fade = this.el.querySelector('#sh-fade')!;
    this.back.addEventListener('click', () => {
      audio.play('click');
      this.onBack();
    });
    this.el.hidden = true;
  }

  show(on: boolean) {
    this.el.hidden = !on;
  }

  overview() {
    this.place.textContent = 'Station';
    this.blurb.textContent = 'Five crew. Six rooms. Two decks on the seabed.';
    this.hint.textContent = this.gameHint || `${innerWidth < innerHeight ? 'Drag to look along the station. ' : ''}Tap a room to look inside. Tap someone to meet them.`;
    this.back.hidden = true;
    this.card.hidden = true;
  }

  room(r: RoomDef) {
    this.place.textContent = r.name;
    this.blurb.textContent = r.blurb;
    this.hint.textContent = r.id === 'command' ? 'Tap the room again to sit at your desk.' : this.gameHint || 'Tap someone to meet them.';
    this.back.textContent = 'Back to station';
    this.back.hidden = false;
    this.card.hidden = true;
  }

  controlRoom() {
    this.place.textContent = 'C1 Command';
    this.blurb.textContent = 'Your desk. Tap a screen to read it.';
    this.hint.textContent = '';
    this.back.textContent = 'Back to station';
    this.back.hidden = false;
    this.card.hidden = true;
  }

  /**
   * The card for one crew member. Their line types out as if spoken over
   * the suit radio. With next, the card carries a button and the promise
   * resolves when it is pressed.
   */
  crew(c: CrewDef, opts: { progress?: string; next?: string; skip?: string } = {}): Promise<'next' | 'skip'> {
    const token = ++this.cardToken;
    this.card.innerHTML = `
      <p class="sh-card-role"><span class="sh-swatch"></span><span></span><span class="sh-card-step"></span></p>
      <h2 class="sh-card-name"></h2>
      <p class="sh-card-line"><span class="sh-card-typed"></span><span class="sh-card-ghost"></span></p>
      <div class="sh-card-actions">
        <button type="button" class="sh-card-next" hidden></button>
        <button type="button" class="sh-card-skip" hidden></button>
      </div>`;
    this.card.querySelector<HTMLElement>('.sh-swatch')!.style.background = c.suit;
    this.card.querySelector('.sh-card-role span:nth-child(2)')!.textContent = c.role;
    this.card.querySelector('.sh-card-step')!.textContent = opts.progress ?? '';
    this.card.querySelector('.sh-card-name')!.textContent = c.name;
    // The full line sits invisible under the typed part so the card never resizes.
    const line = `“${c.line}”`;
    const typed = this.card.querySelector<HTMLElement>('.sh-card-typed')!;
    const ghost = this.card.querySelector<HTMLElement>('.sh-card-ghost')!;
    ghost.textContent = line;
    let i = 0;
    const tick = () => {
      if (token !== this.cardToken) return;
      i++;
      typed.textContent = line.slice(0, i);
      ghost.textContent = line.slice(i);
      if (i % 3 === 0) audio.play('typing', { volume: 0.25 });
      if (i < line.length) setTimeout(tick, 24);
    };
    setTimeout(tick, 250);
    this.card.hidden = false;
    audio.play('confirm', { volume: 0.5 });
    const next = this.card.querySelector<HTMLButtonElement>('.sh-card-next')!;
    const skip = this.card.querySelector<HTMLButtonElement>('.sh-card-skip')!;
    if (!opts.next && this.onCall) {
      const onCall = this.onCall;
      next.hidden = false;
      next.textContent = `Call ${c.callsign.charAt(0)}${c.callsign.slice(1).toLowerCase()}`;
      next.addEventListener('click', () => onCall(c.id), { once: true });
    }
    if (!opts.next) return Promise.resolve('next');
    next.hidden = false;
    next.textContent = opts.next;
    skip.hidden = !opts.skip;
    skip.textContent = opts.skip ?? '';
    return new Promise((done) => {
      next.addEventListener('click', () => {
        audio.play('click');
        done('next');
      });
      skip.addEventListener('click', () => {
        audio.play('click');
        done('skip');
      });
    });
  }

  hideCard() {
    this.cardToken++;
    this.card.hidden = true;
  }

  setHint(text: string) {
    this.gameHint = text;
    this.hint.textContent = text;
  }

  /** Header text for moments that are not a room, like the introductions. */
  heading(place: string, blurb: string, hint = '') {
    this.place.textContent = place;
    this.blurb.textContent = blurb;
    this.hint.textContent = hint;
  }

  get backButton(): HTMLElement {
    return this.back;
  }

  /** Show or hide the Back button, for scripted moments. */
  allowBack(on: boolean) {
    this.back.hidden = !on;
  }

  /** Fade to black, run the change, fade back in. */
  async transition(change: () => void) {
    this.fade.classList.add('is-on');
    await new Promise((r) => setTimeout(r, 450));
    change();
    await new Promise((r) => setTimeout(r, 150));
    this.fade.classList.remove('is-on');
  }
}
