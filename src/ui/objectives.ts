import { el } from './overlays';
import { audio } from '../audio/audio';

/**
 * The day's checklist, under the room name: a heading with a count and
 * one line per job, ticked as they are done. On a phone it shows the
 * count and the next job only.
 */
export class Objectives {
  private el = el('section', 'ob');
  private title = el('p', 'ob-title');
  private count = el('span', 'ob-count');
  private list = el('ol', 'ob-list');
  private items: { id: string; li: HTMLElement; done: boolean }[] = [];

  constructor(root: HTMLElement) {
    this.el.setAttribute('aria-label', 'Objectives');
    const head = el('header', 'ob-head');
    head.append(this.title, this.count);
    this.el.append(head, this.list);
    this.el.hidden = true;
    root.appendChild(this.el);
  }

  set(title: string, items: { id: string; label: string }[]) {
    this.title.textContent = title;
    this.list.innerHTML = '';
    this.items = items.map((it) => {
      const li = el('li', 'ob-item');
      li.append(el('span', 'ob-box'), el('span', 'ob-label', it.label));
      this.list.appendChild(li);
      return { id: it.id, li, done: false };
    });
    this.refresh();
    this.el.hidden = false;
  }

  tick(id: string) {
    const it = this.items.find((i) => i.id === id);
    if (!it || it.done) return;
    it.done = true;
    it.li.classList.add('is-done');
    audio.play('confirm', { volume: 0.5 });
    this.refresh();
  }

  isDone(id: string) {
    return this.items.find((i) => i.id === id)?.done ?? false;
  }

  get allDone() {
    return this.items.length > 0 && this.items.every((i) => i.done);
  }

  /** One line telling the player what to do next, instead of a list. */
  now(text: string) {
    this.title.textContent = 'Now';
    this.count.textContent = '';
    this.list.innerHTML = '';
    const li = el('li', 'ob-item is-next ob-now');
    li.append(el('span', 'ob-label', text));
    this.list.appendChild(li);
    this.items = [];
    this.el.hidden = false;
    this.el.classList.remove('is-in');
    void this.el.offsetWidth;
    this.el.classList.add('is-in');
    audio.play('confirm', { volume: 0.3 });
  }

  hide() {
    this.el.hidden = true;
  }

  private refresh() {
    const n = this.items.filter((i) => i.done).length;
    this.count.textContent = `${n} of ${this.items.length}`;
    const next = this.items.find((i) => !i.done);
    for (const i of this.items) i.li.classList.toggle('is-next', i === next);
  }
}
