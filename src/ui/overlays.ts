import { audio } from '../audio/audio';

/**
 * Every 2D element drawn over the 3D room. Styled as operations
 * paperwork and radio transcripts: small caps labels, monospace body,
 * square controls, no floating cards.
 */

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Type text into an element. A click or key on `skipOn` finishes it at once. */
export async function type(target: HTMLElement, text: string, skipOn: HTMLElement, cps = 60) {
  let skip = false;
  const onSkip = () => (skip = true);
  skipOn.addEventListener('pointerdown', onSkip);
  addEventListener('keydown', onSkip);
  for (let i = 0; i <= text.length; i++) {
    if (skip) {
      target.textContent = text;
      break;
    }
    target.textContent = text.slice(0, i);
    if (i % 3 === 0) audio.play('typing', { volume: 0.5 });
    await wait(1000 / cps);
  }
  skipOn.removeEventListener('pointerdown', onSkip);
  removeEventListener('keydown', onSkip);
}

/** Resolve on a click of one of `buttons`, or its number key, or Enter for a single button. */
export function choose(buttons: HTMLButtonElement[]): Promise<number> {
  return new Promise((resolve) => {
    const done = (i: number) => {
      removeEventListener('keydown', onKey);
      audio.play('click');
      resolve(i);
    };
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= buttons.length && !buttons[n - 1].disabled) done(n - 1);
      else if (e.key === 'Enter' && buttons.length === 1) done(0);
    };
    buttons.forEach((b, i) => b.addEventListener('click', () => done(i), { once: true }));
    addEventListener('keydown', onKey);
    buttons[0]?.focus({ preventScroll: true });
  });
}

export interface CallChoice {
  label: string;
  hint?: string;
}

export interface MeterDelta {
  key: string;
  label: string;
  value: number;
}

export class Overlays {
  private root = el('div', 'ov');
  private top = el('div', 'ov-top');
  private objective = el('div', 'ov-objective');
  private meters = el('div', 'ov-meters');
  private bottom = el('div', 'ov-bottom');
  private meterEls = new Map<string, { value: HTMLElement; delta: HTMLElement; last: number }>();

  constructor(parent: HTMLElement) {
    this.top.append(this.objective, this.meters);
    this.root.append(this.top, this.bottom);
    parent.appendChild(this.root);
    this.top.hidden = true;
  }

  /** First tap: needed before any sound can play in a browser. */
  async pressStart() {
    const g = el('section', 'ov-start');
    g.innerHTML = `
      <div class="ov-start-inner">
        <p class="ov-kicker">Helios Deep</p>
        <button type="button" class="ov-btn ov-btn-primary" id="start-intro">Play intro</button>
        <p class="ov-small">Sound on. Headphones if you have them.</p>
      </div>`;
    this.root.appendChild(g);
    const btn = g.querySelector<HTMLButtonElement>('#start-intro')!;
    btn.focus({ preventScroll: true });
    await new Promise<void>((r) => btn.addEventListener('click', () => r(), { once: true }));
    await audio.unlock();
    g.classList.add('is-leaving');
    await wait(400);
    g.remove();
  }

  /** Black curtain over the scene, faded in or out. */
  curtain(on: boolean, ms = 600) {
    let c = this.root.querySelector<HTMLElement>('.ov-curtain');
    if (!c) {
      c = el('div', 'ov-curtain');
      this.root.appendChild(c);
    }
    c.style.transitionDuration = `${ms}ms`;
    requestAnimationFrame(() => c!.classList.toggle('is-on', on));
  }

  /** Full-screen white flash for the blast. */
  flash() {
    const f = el('div', 'ov-flash');
    this.root.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  /** Skip control shown for the whole trailer. */
  skip(onSkip: () => void, label = 'Skip intro') {
    const b = el('button', 'ov-btn ov-skip', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => onSkip(), { once: true });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSkip();
    addEventListener('keydown', onKey);
    this.root.appendChild(b);
    return () => {
      removeEventListener('keydown', onKey);
      b.remove();
    };
  }

  /** Trailer caption: a typed log line, or a large statement. */
  async caption(text: string, kind: 'log' | 'big', ms: number) {
    const c = el('p', `ov-caption is-${kind}`);
    this.root.appendChild(c);
    if (kind === 'log') await type(c, text, c, 34);
    else c.textContent = text;
    await wait(ms);
    c.classList.add('is-leaving');
    await wait(400);
    c.remove();
  }

  /** The question the trailer ends on. */
  async titleCard(): Promise<'begin' | 'replay'> {
    const t = el('section', 'ov-title');
    t.innerHTML = `
      <div class="ov-title-inner">
        <p class="ov-title-line">Five days until rescue.</p>
        <h1 class="ov-title-q">Can you keep them alive?</h1>
        <div class="ov-title-actions">
          <button type="button" class="ov-btn ov-btn-primary" id="title-begin">Begin</button>
          <button type="button" class="ov-btn" id="title-replay">Replay intro</button>
        </div>
      </div>`;
    this.root.appendChild(t);
    audio.play('hit');
    const begin = t.querySelector<HTMLButtonElement>('#title-begin')!;
    const replay = t.querySelector<HTMLButtonElement>('#title-replay')!;
    const pick = await choose([begin, replay]);
    t.classList.add('is-leaving');
    await wait(400);
    t.remove();
    return pick === 0 ? 'begin' : 'replay';
  }

  /** Holding screen until the station and crew arrive in the next build. */
  /** End of what this preview build can play. */
  async comingNext(line: string, small: string, action = 'Play again'): Promise<'replay'> {
    const t = el('section', 'ov-title');
    t.innerHTML = `
      <div class="ov-title-inner">
        <p class="ov-kicker">Next build</p>
        <p class="ov-title-line"></p>
        <p class="ov-small"></p>
        <div class="ov-title-actions">
          <button type="button" class="ov-btn ov-btn-primary" id="next-replay"></button>
        </div>
      </div>`;
    t.querySelector('.ov-title-line')!.textContent = line;
    t.querySelector('.ov-small')!.textContent = small;
    const b = t.querySelector<HTMLButtonElement>('#next-replay')!;
    b.textContent = action;
    this.root.appendChild(t);
    await choose([b]);
    t.remove();
    return 'replay';
  }

  /** Title screen. Doubles as the user gesture that unlocks audio. */
  async gate() {
    const g = el('section', 'ov-gate');
    g.setAttribute('aria-labelledby', 'gate-title');
    g.innerHTML = `
      <div class="ov-gate-inner">
        <p class="ov-kicker">A deep sea thriller</p>
        <h1 id="gate-title">HELIOS DEEP</h1>
        <p class="ov-tagline">Rescue is 13 days away.<br>Someone on your crew is lying.</p>
        <button type="button" class="ov-btn ov-btn-primary" id="gate-start">Begin shift</button>
        <p class="ov-small">Sound on. Preview: days 1 to 3, about 10 minutes.</p>
      </div>`;
    this.root.appendChild(g);
    const btn = g.querySelector<HTMLButtonElement>('#gate-start')!;
    btn.focus({ preventScroll: true });
    await new Promise<void>((r) => btn.addEventListener('click', () => r(), { once: true }));
    await audio.unlock();
    audio.play('click');
    g.classList.add('is-leaving');
    await wait(700);
    g.remove();
  }

  /** Black opening card, typed like a log line. */
  async coldOpen(lines: string[]) {
    const c = el('section', 'ov-card');
    const p = el('p', 'ov-card-log');
    c.appendChild(p);
    this.root.appendChild(c);
    for (const line of lines) {
      const row = el('span');
      p.appendChild(row);
      await type(row, line, c, 38);
      p.appendChild(document.createElement('br'));
      await wait(380);
    }
    await wait(500);
    c.classList.add('is-leaving');
    await wait(600);
    c.remove();
  }

  async dayCard(day: number, rescueIn: number) {
    const c = el('section', 'ov-card');
    c.innerHTML = `<p class="ov-card-day">DAY ${day}</p><p class="ov-card-sub">RESCUE IN ${rescueIn} DAYS</p>`;
    this.root.appendChild(c);
    await wait(2200);
    c.classList.add('is-leaving');
    await wait(700);
    c.remove();
  }

  setObjective(day: number, text: string) {
    this.top.hidden = false;
    this.objective.innerHTML = '';
    this.objective.append(el('span', 'ov-label', `DAY ${day}   TODAY`), el('span', 'ov-objective-text', text));
  }

  setMeters(list: MeterDelta[]) {
    for (const m of list) {
      let entry = this.meterEls.get(m.key);
      if (!entry) {
        const cell = el('div', 'ov-meter');
        const label = el('span', 'ov-label', m.label);
        const value = el('span', 'ov-meter-value');
        const delta = el('span', 'ov-meter-delta');
        cell.append(label, value, delta);
        this.meters.appendChild(cell);
        entry = { value, delta, last: m.value };
        this.meterEls.set(m.key, entry);
      }
      const diff = Math.round(m.value - entry.last);
      entry.value.textContent = String(Math.round(m.value));
      entry.value.parentElement!.classList.toggle('is-low', m.value < 45);
      if (diff !== 0) {
        // Show the change for a few seconds so every choice has a visible cost.
        entry.delta.textContent = diff > 0 ? `+${diff}` : `${diff}`;
        entry.delta.className = `ov-meter-delta ${diff > 0 ? 'is-up' : 'is-down'} is-shown`;
        const d = entry.delta;
        setTimeout(() => d.classList.remove('is-shown'), 3500);
      }
      entry.last = m.value;
    }
  }

  /** The phone rings; resolves when the player answers. */
  async incoming(name: string, role: string, answerFromPhone: Promise<void>) {
    const s = el('section', 'ov-incoming');
    s.innerHTML = `<span class="ov-ring" aria-hidden="true"></span>
      <span class="ov-incoming-text"><span class="ov-label">Incoming call</span>${name}, ${role.toLowerCase()}</span>`;
    const btn = el('button', 'ov-btn ov-btn-primary', 'Answer') as HTMLButtonElement;
    btn.type = 'button';
    s.appendChild(btn);
    this.bottom.appendChild(s);
    await Promise.race([choose([btn]), answerFromPhone]);
    s.remove();
    audio.play('pickup');
  }

  /**
   * A phone call: lines typed out, an optional scan of one claim, then
   * the choices. Resolves with the chosen index.
   */
  async call(opts: {
    callsign: string;
    role: string;
    lines: string[];
    claim?: { text: string; scansLeft: number; run: () => Promise<{ isTrue: boolean; detail: string }> };
    choices: CallChoice[];
  }): Promise<{ panel: HTMLElement; index: number }> {
    const panel = el('section', 'ov-call');
    panel.setAttribute('aria-live', 'polite');
    const head = el('header', 'ov-call-head');
    head.append(el('span', 'ov-signal'), el('span', 'ov-call-who', opts.callsign), el('span', 'ov-label', opts.role));
    const body = el('div', 'ov-call-body');
    panel.append(head, body);
    this.bottom.appendChild(panel);
    for (const line of opts.lines) {
      const p = el('p', 'ov-line');
      body.appendChild(p);
      await type(p, line, panel);
      await wait(260);
    }

    if (opts.claim) {
      const scan = el('div', 'ov-scan');
      const btn = el('button', 'ov-btn ov-btn-scan') as HTMLButtonElement;
      btn.type = 'button';
      btn.innerHTML = `<span class="ov-label">Scan claim</span><span>“${opts.claim.text}”</span><span class="ov-scan-left">${opts.claim.scansLeft} left</span>`;
      btn.disabled = opts.claim.scansLeft <= 0;
      const result = el('p', 'ov-scan-result');
      scan.append(btn, result);
      panel.appendChild(scan);
      const claim = opts.claim;
      btn.addEventListener(
        'click',
        async () => {
          btn.disabled = true;
          audio.play('sonar');
          result.textContent = 'CHECKING STATION LOGS';
          result.className = 'ov-scan-result is-busy';
          const r = await claim.run();
          await wait(900);
          result.className = `ov-scan-result ${r.isTrue ? 'is-true' : 'is-false'}`;
          result.innerHTML = '';
          result.append(el('strong', '', r.isTrue ? 'TRUE' : 'NOT TRUE'), el('span', '', r.detail));
          audio.play(r.isTrue ? 'confirm' : 'deny');
        },
        { once: true },
      );
    }

    const list = el('div', 'ov-choices');
    const buttons = opts.choices.map((c, i) => {
      const b = el('button', 'ov-choice') as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `<kbd>${i + 1}</kbd><span class="ov-choice-label"></span><span class="ov-choice-hint"></span>`;
      b.querySelector('.ov-choice-label')!.textContent = c.label;
      b.querySelector('.ov-choice-hint')!.textContent = c.hint ?? '';
      list.appendChild(b);
      return b;
    });
    panel.appendChild(list);
    const index = await choose(buttons);
    list.remove();
    panel.querySelector('.ov-scan')?.remove();
    const picked = el('p', 'ov-picked', `You: ${opts.choices[index].label}`);
    body.appendChild(picked);
    return { panel, index };
  }

  /** The caller answers your decision, then the call ends on Continue. */
  async reply(panel: HTMLElement, text: string) {
    const body = panel.querySelector('.ov-call-body')!;
    const p = el('p', 'ov-line');
    body.appendChild(p);
    await type(p, text, panel);
    const btn = el('button', 'ov-btn', 'Hang up') as HTMLButtonElement;
    btn.type = 'button';
    panel.appendChild(btn);
    await choose([btn]);
    panel.classList.add('is-leaving');
    await wait(300);
    panel.remove();
  }

  /** A short radio line that clears itself. */
  async radio(callsign: string, text: string, ms = 4200) {
    const r = el('section', 'ov-radio');
    r.append(el('span', 'ov-call-who', callsign), el('span', 'ov-radio-text'));
    this.bottom.appendChild(r);
    await type(r.querySelector('.ov-radio-text')!, text, r);
    await wait(ms);
    r.classList.add('is-leaving');
    await wait(300);
    r.remove();
  }

  /** The morning printout, readable at any screen size. */
  async report(day: number, lines: { text: string; certainty: string }[]) {
    const wrap = el('section', 'ov-report-wrap');
    const paper = el('div', 'ov-paper');
    paper.innerHTML = `<p class="ov-paper-head">HELIOS DEEP   MORNING REPORT<br>DAY ${day}</p>`;
    const table = el('ul', 'ov-paper-lines');
    paper.appendChild(table);
    wrap.appendChild(paper);
    this.root.appendChild(wrap);
    for (const l of lines) {
      const li = el('li');
      const sure = el('span', `ov-sure is-${l.certainty.toLowerCase()}`, l.certainty);
      li.append(el('span', '', l.text), sure);
      table.appendChild(li);
      audio.play('printer', { volume: 0.5, pan: 0.5 });
      await wait(260);
    }
    const key = el('p', 'ov-paper-key', 'CONFIRMED is fact. LIKELY is probably true. UNSURE may be a faulty sensor.');
    paper.appendChild(key);
    const btn = el('button', 'ov-btn', 'Tear off') as HTMLButtonElement;
    btn.type = 'button';
    wrap.appendChild(btn);
    await choose([btn]);
    wrap.classList.add('is-leaving');
    await wait(350);
    wrap.remove();
  }

  /** Countdown banner for a timed emergency. */
  emergency(alarm: string, instruction: string, hint: string, seconds: number) {
    const e = el('section', 'ov-emergency');
    e.setAttribute('role', 'alert');
    e.innerHTML = `<p class="ov-emergency-alarm"></p><p class="ov-emergency-do"></p><p class="ov-emergency-hint"></p>
      <div class="ov-timer"><div class="ov-timer-fill"></div><span class="ov-timer-num"></span></div>`;
    e.querySelector('.ov-emergency-alarm')!.textContent = alarm;
    e.querySelector('.ov-emergency-do')!.textContent = instruction;
    e.querySelector('.ov-emergency-hint')!.textContent = hint;
    this.root.appendChild(e);
    const fill = e.querySelector<HTMLElement>('.ov-timer-fill')!;
    const num = e.querySelector<HTMLElement>('.ov-timer-num')!;
    return {
      update(left: number) {
        fill.style.transform = `scaleX(${Math.max(0, left / seconds)})`;
        num.textContent = `${Math.ceil(left)} S`;
        e.classList.toggle('is-urgent', left < 6);
      },
      hint(text: string) {
        e.querySelector('.ov-emergency-hint')!.textContent = text;
      },
      async close(result: 'done' | 'missed') {
        e.classList.add(result === 'done' ? 'is-done' : 'is-missed');
        await wait(900);
        e.remove();
      },
    };
  }

  /** The night's radio and system log. Clue lines are marked. */
  async nightLog(day: number, lines: { time: string; who: string; text: string; clue?: boolean }[]) {
    const s = el('section', 'ov-night');
    s.innerHTML = `<header class="ov-night-head"><span class="ov-label">Comms log</span><span>Night of day ${day}</span></header>`;
    const list = el('ol', 'ov-night-lines');
    s.appendChild(list);
    this.root.appendChild(s);
    for (const l of lines) {
      const li = el('li', l.clue ? 'is-clue' : '');
      const text = el('span', 'ov-night-text');
      li.append(el('span', 'ov-night-time', l.time), el('span', 'ov-night-who', l.who), text);
      if (l.clue) li.appendChild(el('span', 'ov-clue-tag', 'Clue'));
      list.appendChild(li);
      await type(text, l.text, s, 70);
      await wait(320);
    }
    const btn = el('button', 'ov-btn ov-btn-primary', 'Sleep') as HTMLButtonElement;
    btn.type = 'button';
    s.appendChild(btn);
    await choose([btn]);
    s.classList.add('is-leaving');
    await wait(400);
    s.remove();
  }

  /** End of the playable preview: summary and the player's theory. */
  async end(summary: { meters: MeterDelta[]; clues: string[]; survived: number }) {
    this.top.hidden = true;
    const s = el('section', 'ov-end');
    s.innerHTML = `
      <p class="ov-kicker">End of day 3</p>
      <h2>Ten days until rescue.</h2>
      <div class="ov-end-grid">
        <div><p class="ov-label">Station</p><ul class="ov-end-meters"></ul></div>
        <div><p class="ov-label">What you found</p><ul class="ov-end-clues"></ul></div>
      </div>
      <p class="ov-end-q">So far, what do you think happened down here?</p>
      <div class="ov-end-theories"></div>`;
    const mList = s.querySelector('.ov-end-meters')!;
    for (const m of summary.meters) {
      const li = el('li');
      li.append(el('span', '', m.label), el('span', 'ov-end-num', `${Math.round(m.value)}%`));
      mList.appendChild(li);
    }
    const cList = s.querySelector('.ov-end-clues')!;
    for (const c of summary.clues) cList.appendChild(el('li', '', c));
    const options = ['An accident', 'Someone on the crew did it', 'Something is out there'];
    const t = s.querySelector('.ov-end-theories')!;
    const buttons = options.map((o, i) => {
      const b = el('button', 'ov-choice') as HTMLButtonElement;
      b.type = 'button';
      b.innerHTML = `<kbd>${i + 1}</kbd><span class="ov-choice-label">${o}</span>`;
      t.appendChild(b);
      return b;
    });
    this.root.appendChild(s);
    const pick = await choose(buttons);
    t.innerHTML = '';
    t.append(
      el('p', 'ov-end-note', `Noted: ${options[pick].toLowerCase()}. Days 4 to 13 are still being built, along with the truth. Every new shift picks a different one.`),
    );
    const again = el('button', 'ov-btn ov-btn-primary', 'Start a new shift') as HTMLButtonElement;
    again.type = 'button';
    t.appendChild(again);
    await choose([again]);
    return pick;
  }
}
