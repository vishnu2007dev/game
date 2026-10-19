import { CREW } from '../content/crew';
import { mulberry32 } from './rng';
import type { Condition, CrewId, Effect, GameState, Meter, Text, Truth } from './types';

export const TRUTHS: Truth[] = ['fault', 'saboteur', 'presence'];
export const METERS: Meter[] = ['hull', 'power', 'air', 'morale'];
export const RESCUE_DAYS = 13;

/** A fresh run. The secret truth comes from the seed, so a shared seed replays the same story. */
export function newGame(seed: number): GameState {
  const rand = mulberry32(seed);
  const truth = TRUTHS[Math.floor(rand() * TRUTHS.length)];
  const crew = Object.fromEntries(
    CREW.map((c) => [c.id, { id: c.id, name: c.name, role: c.role, trust: 0, fatigue: 0, alive: true }]),
  ) as unknown as GameState['crew'];
  return {
    seed,
    truth,
    day: 1,
    // Start comfortable: the opening days teach, they do not punish.
    meters: { hull: 72, power: 66, air: 82, morale: 64 },
    crew,
    flags: [],
    scans: 4,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Apply an effect and return a new state. Never mutates the input. */
export function apply(s: GameState, e: Effect): GameState {
  const next: GameState = {
    ...s,
    meters: { ...s.meters },
    crew: Object.fromEntries(Object.entries(s.crew).map(([k, v]) => [k, { ...v }])) as GameState['crew'],
    flags: [...s.flags],
  };
  for (const [m, d] of Object.entries(e.meters ?? {}) as [Meter, number][]) next.meters[m] = clamp(next.meters[m] + d, 0, 100);
  for (const [c, d] of Object.entries(e.trust ?? {}) as [CrewId, number][]) next.crew[c].trust = clamp(next.crew[c].trust + d, -3, 3);
  for (const [c, d] of Object.entries(e.fatigue ?? {}) as [CrewId, number][]) next.crew[c].fatigue = clamp(next.crew[c].fatigue + d, 0, 3);
  for (const f of e.flags ?? []) if (!next.flags.includes(f)) next.flags.push(f);
  if (e.scans) next.scans = clamp(next.scans + e.scans, 0, 9);
  return next;
}

export function check(s: GameState, c?: Condition): boolean {
  if (!c) return true;
  if (c.flag && !s.flags.includes(c.flag)) return false;
  if (c.notFlag && s.flags.includes(c.notFlag)) return false;
  if (c.truth && !(Array.isArray(c.truth) ? c.truth : [c.truth]).includes(s.truth)) return false;
  if (c.below && !(s.meters[c.below[0]] < c.below[1])) return false;
  return true;
}

export function say(s: GameState, t: Text): string {
  return typeof t === 'function' ? t(s) : t;
}

/** Overnight: the crew rest a little and the station wears down a little. */
export function endDay(s: GameState): GameState {
  const rested = apply(s, {
    meters: { hull: -2, air: -3 },
    fatigue: Object.fromEntries(Object.keys(s.crew).map((k) => [k, -1])) as Partial<Record<CrewId, number>>,
  });
  return { ...rested, day: s.day + 1 };
}

export function rescueIn(s: GameState) {
  return Math.max(0, RESCUE_DAYS - s.day + 1);
}

/** Plain words for a meter value, used on screens and in summaries. */
export function meterWord(m: Meter, v: number): 'OK' | 'LOW' | 'CRITICAL' {
  const warn = m === 'morale' ? 40 : 45;
  const crit = m === 'morale' ? 20 : 25;
  return v < crit ? 'CRITICAL' : v < warn ? 'LOW' : 'OK';
}
