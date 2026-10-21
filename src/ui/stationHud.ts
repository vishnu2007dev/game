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
  onBack: () => void = () => {};

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
    this.hint.textContent = `${innerWidth < innerHeight ? 'Drag to look along the station. ' : ''}Tap a room to look inside. Tap someone to meet them.`;
    this.back.hidden = true;
    this.card.hidden = true;
  }

  room(r: RoomDef) {
    this.place.textContent = r.name;
    this.blurb.textContent = r.blurb;
    this.hint.textContent = r.id === 'command' ? 'Tap the room again to sit at your desk.' : 'Tap someone to meet them.';
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

  crew(c: CrewDef) {
    this.card.innerHTML = `
      <p class="sh-card-role"><span class="sh-swatch"></span><span></span></p>
      <h2 class="sh-card-name"></h2>
      <p class="sh-card-line"></p>`;
    this.card.querySelector<HTMLElement>('.sh-swatch')!.style.background = c.suit;
    this.card.querySelector('.sh-card-role span:last-child')!.textContent = c.role;
    this.card.querySelector('.sh-card-name')!.textContent = c.name;
    this.card.querySelector('.sh-card-line')!.textContent = `“${c.line}”`;
    this.card.hidden = false;
    audio.play('confirm', { volume: 0.5 });
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
