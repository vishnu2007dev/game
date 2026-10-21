import { TaskPanel, type TaskResult } from './panel';
import { audio } from '../../audio/audio';
import { el } from '../overlays';

/**
 * A four digit gate code. The code is never shown here: it was said on a
 * call, and the player has to remember it or call back.
 */
export function keypadTask(root: HTMLElement, opts: { title: string; instruction: string; code: string; onNeedCode?: () => void }): Promise<TaskResult> {
  const panel = new TaskPanel(root, { kicker: 'Hands on', title: opts.title, instruction: opts.instruction });
  const wrap = el('div', 'tk-keypad');
  const display = el('p', 'tk-display', '____');
  const keys = el('div', 'tk-keys');
  wrap.append(display, keys);
  panel.area.appendChild(wrap);
  let entry = '';
  let tries = 0;
  const show = () => (display.textContent = entry.padEnd(4, '_'));
  const press = (k: string) => {
    if (k === 'CLR') entry = '';
    else if (k === 'OK') {
      if (entry.length < 4) return;
      tries++;
      if (entry === opts.code) {
        audio.play('confirm');
        display.classList.add('is-good');
        panel.say('Gate cycled. Seals hold.', 'good');
        void panel.finish({ quality: Math.max(0.5, 1 - (tries - 1) * 0.2) });
        return;
      }
      audio.play('deny');
      display.classList.add('is-bad');
      setTimeout(() => display.classList.remove('is-bad'), 500);
      panel.say(tries > 1 ? 'Denied. Ask Teo for the code again.' : 'Denied. That is not the code.', 'bad');
      entry = '';
    } else if (entry.length < 4) entry += k;
    audio.play('click', { volume: 0.4 });
    show();
  };
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'OK']) {
    const b = el('button', `tk-key${k === 'OK' ? ' is-ok' : ''}`, k) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => press(k));
    keys.appendChild(b);
  }
  const onKey = (e: KeyboardEvent) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Enter') press('OK');
    else if (e.key === 'Backspace') press('CLR');
  };
  addEventListener('keydown', onKey);
  void panel.result.then(() => removeEventListener('keydown', onKey));
  if (opts.onNeedCode) {
    const ask = el('button', 'tk-ask', 'I do not have the code') as HTMLButtonElement;
    ask.type = 'button';
    ask.addEventListener('click', () => {
      opts.onNeedCode!();
      void panel.finish({ quality: null });
    });
    wrap.appendChild(ask);
  }
  panel.say('Enter the four digit gate code.');
  return panel.result;
}
