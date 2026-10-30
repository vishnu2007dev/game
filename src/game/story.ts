import type { Ctx } from './run';
import { change, crewDef } from './run';
import { say, type CrewKey, type CrisisEffect, type Line } from '../engine/crisis';
import type { Clip } from '../scene/crew';

/** Where someone stands for a scene. */
export interface Mark {
  id: CrewKey;
  room: string;
  x: number;
  z: number;
}

/** One line of a scene. `you` lines are the commander, over the intercom. */
export interface SceneLine {
  who: CrewKey | 'you';
  text: Line;
  /** What the speaker does while saying it; talking by default. */
  clip?: Clip;
}

export interface SceneChoice {
  label: string;
  hint?: string;
  effect?: CrisisEffect;
  /** What gets said back, by whom. */
  reply?: SceneLine[];
}

/**
 * Stage a scene: walk the cast to their marks, turn them toward each
 * other and a little toward the camera, frame them, and play the lines.
 * The camera stays on them until `end` is called.
 */
export async function stage(ctx: Ctx, cast: CrewKey[], marks: Mark[] = []) {
  ctx.st.frameCast(cast);
  ctx.roster.show(false);
  const arrived = await Promise.all(marks.map((m) => ctx.st.sendCrew(m.id, { room: m.room, x: m.x, z: m.z })));
  if (arrived.includes(false)) console.warn('A scene mark could not be reached');
  faceEachOther(ctx, cast);
}

/** Everyone in the cast turns toward the middle of the group, opened up a little to the camera. */
export function faceEachOther(ctx: Ctx, cast: CrewKey[]) {
  const pts = cast.map((id) => ctx.st.crewAt(id));
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length;
  cast.forEach((id, i) => {
    const p = pts[i];
    let dx = cx - p.x;
    let dz = cz - p.z;
    const len = Math.hypot(dx, dz) || 1;
    // Mix in a third of "toward the camera" so faces stay readable.
    dx = dx / len;
    dz = dz / len + 0.6;
    ctx.st.act(id, 'Idle_Loop', cast.length === 1 ? 0 : Math.atan2(dx, dz));
  });
}

/** Play lines in order; the speaker talks, everyone else listens. */
export async function lines(ctx: Ctx, cast: CrewKey[], script: SceneLine[]) {
  for (const l of script) {
    if (l.who !== 'you') {
      for (const id of cast) if (id !== l.who) ctx.st.act(id, 'Idle_Loop');
      ctx.st.act(l.who, l.clip ?? 'Idle_Talking_Loop');
    }
    const def = l.who === 'you' ? null : crewDef(l.who);
    await ctx.subs.line(def ? def.name : 'You', def ? def.suit : '#f2a900', say(ctx.state, l.text));
  }
  for (const id of cast) ctx.st.act(id, 'Idle_Loop');
}

/** Cut in: offer things to say, apply the choice and play the reply. Returns the index chosen. */
export async function ask(ctx: Ctx, cast: CrewKey[], prompt: string, choices: SceneChoice[]) {
  const i = await ctx.subs.ask(prompt, choices);
  const c = choices[i];
  if (c.effect) change(ctx, c.effect);
  if (c.reply) await lines(ctx, cast, c.reply);
  return i;
}

/** End a scene: subtitles off, camera back to the room, crew back to work unless they should stay. */
export function end(ctx: Ctx, release: CrewKey[] = []) {
  ctx.subs.hide();
  ctx.st.frameCast(null);
  ctx.roster.show(true);
  for (const id of release) ctx.st.release(id);
}
