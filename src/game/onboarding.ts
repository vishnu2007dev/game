import type { Station, StationEvent } from '../scene/app';
import { CREW } from '../scene/station';
import type { StationHud } from '../ui/stationHud';
import type { Roster } from '../ui/roster';
import type { Coach } from '../ui/coach';

/** Resolves with the next station event that matches. */
export type Waiter = (match: (e: StationEvent) => boolean) => Promise<StationEvent>;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Meet the crew: the camera goes to each person at their post, they stop
 * work and turn to you, and their card types out what they do.
 */
export async function meetCrew(st: Station, hud: StationHud, roster: Roster) {
  hud.allowBack(false);
  for (const [i, def] of CREW.entries()) {
    st.showCrew(def.id);
    roster.highlight(def.id);
    hud.heading('Your crew', 'Five people, 3012 metres down. You will need every one of them.');
    hud.allowBack(false);
    const last = i === CREW.length - 1;
    const pick = await hud.crew(def, { progress: `${i + 1} of ${CREW.length}`, next: last ? 'Done' : 'Next', skip: last ? undefined : 'Skip introductions' });
    if (pick === 'skip') break;
  }
  roster.highlight(null);
  hud.hideCard();
  await hud.transition(() => st.showStation(null));
}

/**
 * Tutorial: five things to try, each waiting for the player to actually
 * do it. Skippable at any point.
 */
export async function tutorial(st: Station, hud: StationHud, roster: Roster, coach: Coach, next: Waiter) {
  let skip!: () => void;
  const skipped = new Promise<'skip'>((r) => (skip = () => r('skip')));
  coach.onSkip = () => skip();
  const steps: [string, () => HTMLElement | ((() => ReturnType<Station['screenPoint']>)) | null, (e: StationEvent) => boolean][] = [
    ['Tap any room to look inside.', () => () => st.screenPoint('power'), (e) => e.type === 'room' || e.type === 'crew'],
    ['Tap Back to station to step out again.', () => hud.backButton, (e) => e.type === 'overview'],
    ['This is your crew list. Tap a name to find that person, wherever they are.', () => roster.target, (e) => e.type === 'crew'],
    [`Command is your post. ${innerWidth < innerHeight ? 'Drag the station to find it, then tap' : 'Tap'} it to go in, and tap it again to sit at your desk.`, () => () => st.screenPoint('command'), (e) => e.type === 'control'],
    ['Tap a screen to read it. Tap it again to sit back.', () => null, (e) => e.type === 'read'],
  ];
  for (const [i, [text, target, done]] of steps.entries()) {
    const t = target();
    void coach.say(`${i + 1} of ${steps.length}`, text, t === null ? null : t instanceof HTMLElement ? { el: t } : { point: t });
    if ((await Promise.race([next(done), skipped])) === 'skip') {
      coach.hide();
      return;
    }
    await wait(500);
  }
  await Promise.race([coach.say('Ready', 'That is the station. Your first shift starts now.', null, 'Start Day 1'), skipped]);
  coach.hide();
}
