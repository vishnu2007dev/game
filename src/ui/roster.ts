import type { CrewDef } from '../scene/station';
import { ROOMS } from '../scene/station';
import { audio } from '../audio/audio';

/**
 * The crew list: who is aboard, where they are, and a live pulse from
 * their suit monitor. On wide screens it stays open on the right; on a
 * phone it folds into a Crew button that opens it as a sheet.
 */
export class Roster {
  readonly el = document.createElement('section');
  private rows = new Map<string, { row: HTMLButtonElement; bpm: HTMLElement; base: number }>();
  private toggle: HTMLButtonElement;
  private timer = 0;
  onPick: (id: string) => void = () => {};
  onCall: (id: string) => void = () => {};

  constructor(root: HTMLElement, crew: CrewDef[]) {
    this.el.className = 'ro';
    this.el.setAttribute('aria-label', 'Crew');
    this.el.innerHTML = `
      <button type="button" class="ro-toggle" aria-expanded="false">Crew <span>5</span></button>
      <div class="ro-panel">
        <header class="ro-head"><span>Crew</span><span class="ro-ok">5 of 5 well</span></header>
        <ol class="ro-list"></ol>
      </div>`;
    this.toggle = this.el.querySelector('.ro-toggle')!;
    this.toggle.addEventListener('click', () => this.setOpen(!this.el.classList.contains('is-open')));
    const list = this.el.querySelector('.ro-list')!;
    crew.forEach((c, i) => {
      const li = document.createElement('li');
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ro-row';
      const room = ROOMS.find((r) => r.id === c.home)!;
      row.innerHTML = `
        <span class="ro-swatch"></span>
        <span class="ro-name"></span>
        <span class="ro-role"></span>
        <span class="ro-room"></span>
        <span class="ro-pulse"><i></i><b></b></span>`;
      row.querySelector<HTMLElement>('.ro-swatch')!.style.background = c.suit;
      row.querySelector('.ro-name')!.textContent = c.callsign;
      row.querySelector('.ro-role')!.textContent = c.role;
      row.querySelector('.ro-room')!.textContent = room.name.split(' ')[0];
      row.setAttribute('aria-label', `${c.name}, ${c.role}, in ${room.name}`);
      row.title = `${c.name}, ${c.role}`;
      row.addEventListener('click', () => {
        audio.play('click');
        this.setOpen(false);
        this.onPick(c.id);
      });
      const call = document.createElement('button');
      call.type = 'button';
      call.className = 'ro-call';
      call.textContent = 'Call';
      call.setAttribute('aria-label', `Call ${c.name}`);
      call.addEventListener('click', () => {
        this.setOpen(false);
        this.onCall(c.id);
      });
      li.className = 'ro-item';
      li.append(row, call);
      list.appendChild(li);
      this.rows.set(c.id, { row, bpm: row.querySelector('.ro-pulse b')!, base: 64 + ((i * 7) % 15) });
    });
    root.appendChild(this.el);
    this.el.hidden = true;
  }

  show(on: boolean) {
    this.el.hidden = !on;
    clearInterval(this.timer);
    if (!on) return;
    const beat = () => {
      const t = performance.now() / 1000;
      for (const [, r] of this.rows) r.bpm.textContent = String(Math.round(r.base + Math.sin(t * 0.3 + r.base) * 4 + Math.random() * 2));
    };
    beat();
    this.timer = window.setInterval(beat, 1100);
  }

  setOpen(open: boolean) {
    this.el.classList.toggle('is-open', open);
    this.toggle.setAttribute('aria-expanded', String(open));
  }

  /** Mark one person as the one being talked about. */
  highlight(id: string | null) {
    for (const [k, r] of this.rows) r.row.classList.toggle('is-current', k === id);
  }

  /** What the tutorial points at: the list itself, or the button on a phone. */
  get target(): HTMLElement {
    return getComputedStyle(this.toggle).display === 'none' ? this.el.querySelector('.ro-panel')! : this.toggle;
  }
}
