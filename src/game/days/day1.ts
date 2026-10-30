import * as THREE from 'three';
import { type Ctx, runChat, shortCall, exclusive, change } from '../run';
import { stage, lines, ask, end } from '../story';
import { DAY1_BEATS, CALL_IN, DINNER, DAY1_SMALLTALK, BUSY, NIGHT1 } from '../../content/v2/day1';
import { SPOTS } from '../../scene/station';
import { rescueIn, type CrewKey } from '../../engine/crisis';
import { valveTask } from '../../ui/tasks/valve';
import { syncTask } from '../../ui/tasks/sync';
import { keypadTask } from '../../ui/tasks/keypad';
import type { TaskResult } from '../../ui/tasks/panel';
import { audio } from '../../audio/audio';
import { wait } from '../../ui/overlays';

/** A marker floating in the middle of each room, for "go here" moments. */
const ROOM_MARK: Record<string, THREE.Vector3> = {
  command: new THREE.Vector3(-5.4, 5.4, -2),
  lab: new THREE.Vector3(0, 5.4, -2),
  quarters: new THREE.Vector3(5.4, 5.4, -2),
  ballast: new THREE.Vector3(-5.4, 2.0, -2),
  power: new THREE.Vector3(0, 2.0, -2),
  dive: new THREE.Vector3(5.4, 2.0, -2),
};

/**
 * Wait until the player goes to a room: tapping it, its marker, or
 * someone who works there all count.
 */
export async function goToRoom(ctx: Ctx, room: string, now: string) {
  ctx.objectives.now(now);
  ctx.st.setHotspots([{ id: `go:${room}`, at: ROOM_MARK[room] }]);
  const e = await ctx.next(
    (e) => (e.type === 'room' && e.room.id === room) || (e.type === 'crew' && e.crew.home === room) || (e.type === 'hotspot' && e.id === `go:${room}`),
  );
  ctx.st.setHotspots([]);
  if (e.type !== 'room') await ctx.goTo(room);
}

/** Show the task marker and keep offering the task until it is done. */
async function doTask(ctx: Ctx, spot: string, now: string) {
  ctx.objectives.now(now);
  ctx.st.setHotspots([{ id: spot, at: SPOTS[spot as keyof typeof SPOTS] }]);
  for (;;) {
    await ctx.next((e) => e.type === 'hotspot' && e.id === spot);
    let r: TaskResult = { quality: null };
    await exclusive(ctx, async () => {
      if (spot === 'valve') r = await valveTask(ctx.root, { title: 'Trim tank 2', instruction: 'Bleed the tank into the green band, then let go.' });
      else if (spot === 'sync')
        r = await syncTask(ctx.root, {
          title: 'Backup generator',
          instruction: 'Match the generator to the station bus, then close the breaker in phase.',
          seed: ctx.state.seed,
        });
      else
        r = await keypadTask(ctx.root, {
          title: 'Moon pool gate',
          instruction: 'Enter the gate code to cycle the seals.',
          code: ctx.state.hatchCode,
          onNeedCode: () => void ctx.ov.radio('RAMIRES', `${ctx.state.hatchCode.split('').join(' ')}. Try to keep up, Commander.`),
        });
    });
    if (r.quality !== null) {
      change(ctx, { flags: [`d1_${spot}`] });
      ctx.st.setHotspots([]);
      return;
    }
  }
}

/**
 * Day 1, Routine. One thread through the station: Mara sends you to
 * Rook, Rook to Teo, Teo to Hana, and the evening brings everyone
 * together before the knock in the night.
 */
export async function day1(ctx: Ctx) {
  const { ov, objectives, hud } = ctx;
  await ov.dayCard(1, rescueIn(ctx.state), 'Routine');
  hud.setHint('Tap a room to go there. Tap someone to talk.');

  // Calls stay open between scenes: small talk once each, then busy.
  const talked = new Set<CrewKey>();
  ctx.onCall = (id) =>
    exclusive(ctx, async () => {
      if (talked.has(id)) return shortCall(ctx, id, BUSY[id]);
      talked.add(id);
      await runChat(ctx, DAY1_SMALLTALK[id]);
    });

  await ov.radio('OKAFOR', CALL_IN.text as string, 3600);
  for (const beat of DAY1_BEATS) {
    await goToRoom(ctx, beat.room, beat.now);
    objectives.hide();
    await stage(ctx, beat.cast, beat.marks);
    await lines(ctx, beat.cast, beat.open);
    if (beat.ask) await ask(ctx, beat.cast, beat.ask.prompt, beat.ask.choices);
    end(ctx);
    ctx.st.showStation(beat.room);
    if (beat.task) {
      await doTask(ctx, beat.task.spot, beat.task.now);
      objectives.hide();
      await stage(ctx, beat.cast);
      await lines(ctx, beat.cast, beat.task.after);
      end(ctx);
      ctx.st.showStation(beat.room);
    }
    change(ctx, { trust: { [beat.cast[0]]: 1 } });
  }
  await evening(ctx);
  await night1(ctx);
}

/** Everyone together in Quarters, the one meal they share. */
async function evening(ctx: Ctx) {
  const { st, objectives, hud } = ctx;
  objectives.now(DINNER.now);
  const cast = DINNER.marks.map((m) => m.id);
  // Watch them head off for a moment, then cut to the table.
  for (const m of DINNER.marks) void st.sendCrew(m.id, { room: m.room, x: m.x, z: m.z });
  await ctx.goTo(null);
  await wait(6000);
  await hud.transition(() => {
    for (const m of DINNER.marks) st.placeCrew(m.id, { room: m.room, x: m.x, z: m.z });
    st.showStation('quarters');
  });
  objectives.hide();
  await stage(ctx, cast);
  await lines(ctx, cast, DINNER.open);
  await ask(ctx, cast, DINNER.ask.prompt, DINNER.ask.choices);
  await lines(ctx, cast, [{ who: 'ilya', text: 'Lights out, everyone. Same again tomorrow.' }]);
  end(ctx, cast);
}

/** The lights go down, and something knocks three times. */
async function night1(ctx: Ctx) {
  const { st, ov } = ctx;
  await ctx.goTo('ballast');
  ctx.roster.show(false);
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
  ctx.roster.show(true);
}
