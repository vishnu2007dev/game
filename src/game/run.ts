import type { Station, StationEvent } from '../scene/app';
import { CREW } from '../scene/station';
import type { StationHud } from '../ui/stationHud';
import type { Roster } from '../ui/roster';
import type { Overlays } from '../ui/overlays';
import type { ChatPanel } from '../ui/chat';
import type { Objectives } from '../ui/objectives';
import type { Coach } from '../ui/coach';
import type { Subtitles } from '../ui/subtitles';
import { apply, say, check, type Crisis, type CrewKey, type CrisisEffect, type DoorKey } from '../engine/crisis';
import type { Chat, ChatChoice, ChatNode } from '../content/v2/types';

/** Everything a day needs to run: the scene, the interface and the run state. */
export interface Ctx {
  root: HTMLElement;
  st: Station;
  hud: StationHud;
  roster: Roster;
  ov: Overlays;
  chat: ChatPanel;
  objectives: Objectives;
  coach: Coach;
  subs: Subtitles;
  /** Resolves on the next station event that matches. */
  next: (match: (e: StationEvent) => boolean) => Promise<StationEvent>;
  state: Crisis;
  /** Set by the current day: what happens when the player calls someone. */
  onCall: (id: CrewKey) => Promise<void>;
  /** True while a task or call has the player's attention. */
  busy: boolean;
  /** Go to the station view, leaving the desk if needed; null is the overview. */
  goTo: (room: string | null) => Promise<void>;
}

export const crewDef = (id: CrewKey) => CREW.find((c) => c.id === id)!;

export function change(ctx: Ctx, e: CrisisEffect) {
  ctx.state = apply(ctx.state, e);
  syncDoors(ctx);
}

/** Make the 3D doors match the run state. */
export function syncDoors(ctx: Ctx) {
  for (const [id, shut] of Object.entries(ctx.state.doors) as [DoorKey, boolean][]) ctx.st.setDoor(id, shut);
}

/**
 * Play a conversation: their lines, your choice, its effect, their reply,
 * and on to the next node until the call ends. Their suit camera runs
 * for the whole call.
 */
export async function runChat(ctx: Ctx, chat: Chat) {
  const def = crewDef(chat.with);
  const frame = ctx.chat.open(def);
  ctx.st.faceCam(def.id, frame);
  let node: ChatNode | undefined = chat.nodes.start;
  while (node) {
    if (node.effect) change(ctx, node.effect);
    for (const l of node.lines) await ctx.chat.say(say(ctx.state, l));
    const options: ChatChoice[] = (node.choices ?? []).filter((c) => check(ctx.state, c.when));
    if (!options.length) break;
    const i = await ctx.chat.choose(options);
    const pick: ChatChoice = options[i];
    if (pick.effect) change(ctx, pick.effect);
    for (const l of pick.reply ?? []) await ctx.chat.say(say(ctx.state, l));
    node = pick.next ? chat.nodes[pick.next] : undefined;
  }
  await ctx.chat.hangUp();
  ctx.st.faceCam(null);
}

/** A one line call that just ends, for when someone is busy. */
export async function shortCall(ctx: Ctx, id: CrewKey, line: string) {
  const frame = ctx.chat.open(crewDef(id));
  ctx.st.faceCam(id, frame);
  await ctx.chat.say(line);
  await ctx.chat.hangUp();
  ctx.st.faceCam(null);
}

/** Run something that takes the player's attention, one at a time. */
export async function exclusive(ctx: Ctx, job: () => Promise<void>) {
  if (ctx.busy) return;
  ctx.busy = true;
  try {
    await job();
  } finally {
    ctx.busy = false;
  }
}
