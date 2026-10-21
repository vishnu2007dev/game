import { type Ctx, runChat, shortCall, exclusive, change, crewDef } from '../run';
import { DAY1_TASKS, DAY1_CHATS, DAY1_SMALLTALK, BUSY, DAY1_OPEN, NIGHT1 } from '../../content/v2/day1';
import { SPOTS } from '../../scene/station';
import { say, rescueIn, type CrewKey } from '../../engine/crisis';
import { valveTask } from '../../ui/tasks/valve';
import { rewireTask } from '../../ui/tasks/rewire';
import { keypadTask } from '../../ui/tasks/keypad';
import { audio } from '../../audio/audio';
import { wait } from '../../ui/overlays';

/**
 * Day 1, Routine checks. Four jobs in four rooms, in any order. The day
 * ends when all four are done, and then the night has a knock in it.
 */
export async function day1(ctx: Ctx) {
  const { st, ov, objectives, hud } = ctx;
  await ov.dayCard(1, rescueIn(ctx.state));
  objectives.set('Morning checks', DAY1_TASKS.map((t) => ({ id: t.id, label: t.label })));
  const placeSpots = () =>
    st.setHotspots(
      DAY1_TASKS.filter((t) => t.spot && !objectives.isDone(t.id)).map((t) => ({ id: t.spot, at: SPOTS[t.spot as keyof typeof SPOTS] })),
    );
  placeSpots();
  hud.setHint('Tap an amber marker to start a check. Tap someone to talk.');
  void ov.radio(DAY1_OPEN.radio.who, DAY1_OPEN.radio.text);

  const talked = new Set<CrewKey>();
  ctx.onCall = (id) =>
    exclusive(ctx, async () => {
      if (id === 'teo' && !objectives.isDone('keypad')) return runChat(ctx, DAY1_CHATS.teoCode);
      if (id === 'hana' && !objectives.isDone('cores')) {
        await runChat(ctx, DAY1_CHATS.hanaCores);
        done('cores');
        return;
      }
      if (talked.has(id)) return shortCall(ctx, id, BUSY[id]);
      talked.add(id);
      await runChat(ctx, DAY1_SMALLTALK[id]);
    });

  let finish!: () => void;
  const finished = new Promise<null>((r) => (finish = () => r(null)));
  const done = (id: string) => {
    objectives.tick(id);
    if (objectives.allDone) finish();
    const task = DAY1_TASKS.find((t) => t.id === id)!;
    const line = say(ctx.state, task.done);
    if (line) void ov.radio(crewDef(task.by).callsign, line);
    change(ctx, { flags: [`d1_${id}`], trust: { [task.by]: 1 } });
    placeSpots();
  };

  const work = async (spot: string) => {
    const task = DAY1_TASKS.find((t) => t.spot === spot);
    if (!task || objectives.isDone(task.id)) return;
    await exclusive(ctx, async () => {
      let r;
      if (task.kind === 'valve') {
        r = await valveTask(ctx.root, { title: 'Trim tank 2', instruction: 'Bleed the tank into the green band, then let go.' });
      } else if (task.kind === 'rewire') {
        r = await rewireTask(ctx.root, { title: 'Junction box J4', instruction: 'Match each wire to its terminal.', seed: ctx.state.seed });
      } else {
        r = await keypadTask(ctx.root, {
          title: 'Moon pool gate',
          instruction: 'Enter the gate code to cycle the seals.',
          code: ctx.state.hatchCode,
          onNeedCode: () => void ov.radio(DAY1_OPEN.needCode.who, DAY1_OPEN.needCode.text),
        });
      }
      if (r.quality !== null) done(task.id);
    });
  };

  while (!objectives.allDone) {
    const e = await Promise.race([ctx.next((e) => e.type === 'hotspot'), finished]);
    if (e?.type === 'hotspot') void work(e.id);
  }
  while (ctx.busy) await wait(200);

  await ov.radio(DAY1_OPEN.allDone.who, DAY1_OPEN.allDone.text, 3200);
  objectives.hide();
  st.setHotspots([]);
  hud.setHint('');
  await night1(ctx);
}

/** The lights go down, and something knocks three times. */
async function night1(ctx: Ctx) {
  const { st, ov, hud } = ctx;
  await ctx.goTo('ballast');
  st.setNight(true);
  await wait(2500);
  for (let i = 0; i < 3; i++) {
    audio.play('thud', { volume: 0.9 });
    st.shake(0.5, 0.4);
    await wait(1100);
  }
  st.setScreen(2, { glitch: 1 });
  for (const r of NIGHT1.radio) await ov.radio(r.who, r.text, 1800);
  st.setScreen(2, { glitch: 0 });
  await ov.nightLog(1, NIGHT1.log(ctx.state));
  st.setNight(false);
}
