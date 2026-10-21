import { mulberry32 } from './rng';

// The v2 run: five days on Helios Deep. Pure data and functions, no
// rendering, so every rule here can be tested and replayed from a seed.

export type CrewKey = 'mara' | 'rook' | 'ilya' | 'teo' | 'hana';
export type RoomKey = 'command' | 'lab' | 'quarters' | 'ballast' | 'power' | 'dive';
/** Bulkhead doors, named by the two rooms they join, plus the ladder hatch. */
export type DoorKey = 'command-lab' | 'lab-quarters' | 'ballast-power' | 'power-dive' | 'trunk';
export type StationMeter = 'hull' | 'power' | 'air';

export const CREW_KEYS: CrewKey[] = ['mara', 'rook', 'ilya', 'teo', 'hana'];
export const ROOM_KEYS: RoomKey[] = ['command', 'lab', 'quarters', 'ballast', 'power', 'dive'];
export const DOOR_KEYS: DoorKey[] = ['command-lab', 'lab-quarters', 'ballast-power', 'power-dive', 'trunk'];
export const LAST_DAY = 5;

export interface CrewState {
  /** -3 refuses your orders, +3 would follow you anywhere. */
  trust: number;
  /** 0 untouched to 3 soaked. Hidden from the player. */
  exposure: number;
  /** Set once exposure reaches 2. Hidden until it shows. */
  infected: boolean;
  alive: boolean;
  room: RoomKey;
}

export interface Crisis {
  seed: number;
  day: number;
  crew: Record<CrewKey, CrewState>;
  meters: Record<StationMeter, number>;
  /** Water level per room, 0 dry to 1 full. */
  water: Record<RoomKey, number>;
  /** true when the door is shut. */
  doors: Record<DoorKey, boolean>;
  flags: string[];
  /** The one working for the company. Chosen by the seed, revealed at the end. */
  liar: CrewKey;
  /** A seeded four digit code, for the dive hatch on Day 1. */
  hatchCode: string;
  /** What happened, for night logs and the ending. */
  log: { day: number; text: string }[];
}

export interface CrisisEffect {
  meters?: Partial<Record<StationMeter, number>>;
  trust?: Partial<Record<CrewKey, number>>;
  exposure?: Partial<Record<CrewKey, number>>;
  water?: Partial<Record<RoomKey, number>>;
  doors?: Partial<Record<DoorKey, boolean>>;
  move?: Partial<Record<CrewKey, RoomKey>>;
  flags?: string[];
  log?: string;
}

export interface CrisisCondition {
  flag?: string;
  notFlag?: string;
  /** Trust of one person at or above a value. */
  trustAtLeast?: [CrewKey, number];
  liar?: CrewKey;
}

export const HOMES: Record<CrewKey, RoomKey> = { mara: 'ballast', rook: 'power', ilya: 'quarters', teo: 'dive', hana: 'lab' };

/** A fresh run. The seed decides the liar and the hatch code, so a shared seed replays the same story. */
export function newCrisis(seed: number): Crisis {
  const rand = mulberry32(seed);
  const liar = CREW_KEYS[Math.floor(rand() * CREW_KEYS.length)];
  const hatchCode = Array.from({ length: 4 }, () => Math.floor(rand() * 10)).join('');
  const crew = Object.fromEntries(CREW_KEYS.map((k) => [k, { trust: 0, exposure: 0, infected: false, alive: true, room: HOMES[k] }])) as Record<CrewKey, CrewState>;
  return {
    seed,
    day: 1,
    crew,
    meters: { hull: 82, power: 76, air: 88 },
    water: { command: 0, lab: 0, quarters: 0, ballast: 0, power: 0, dive: 0 },
    doors: { 'command-lab': false, 'lab-quarters': false, 'ballast-power': false, 'power-dive': false, trunk: false },
    flags: [],
    liar,
    hatchCode,
    log: [],
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Apply an effect and return a new state. Never changes the input. */
export function apply(s: Crisis, e: CrisisEffect): Crisis {
  const n: Crisis = {
    ...s,
    crew: Object.fromEntries(Object.entries(s.crew).map(([k, v]) => [k, { ...v }])) as Crisis['crew'],
    meters: { ...s.meters },
    water: { ...s.water },
    doors: { ...s.doors },
    flags: [...s.flags],
    log: [...s.log],
  };
  for (const [k, d] of Object.entries(e.meters ?? {}) as [StationMeter, number][]) n.meters[k] = clamp(n.meters[k] + d, 0, 100);
  for (const [k, d] of Object.entries(e.trust ?? {}) as [CrewKey, number][]) n.crew[k].trust = clamp(n.crew[k].trust + d, -3, 3);
  for (const [k, d] of Object.entries(e.exposure ?? {}) as [CrewKey, number][]) {
    const c = n.crew[k];
    c.exposure = clamp(c.exposure + d, 0, 3);
    if (c.exposure >= 2) c.infected = true;
  }
  for (const [k, v] of Object.entries(e.water ?? {}) as [RoomKey, number][]) n.water[k] = clamp(v, 0, 1);
  for (const [k, v] of Object.entries(e.doors ?? {}) as [DoorKey, boolean][]) n.doors[k] = v;
  for (const [k, v] of Object.entries(e.move ?? {}) as [CrewKey, RoomKey][]) n.crew[k].room = v;
  for (const f of e.flags ?? []) if (!n.flags.includes(f)) n.flags.push(f);
  if (e.log) n.log.push({ day: n.day, text: e.log });
  return n;
}

export function check(s: Crisis, c?: CrisisCondition): boolean {
  if (!c) return true;
  if (c.flag && !s.flags.includes(c.flag)) return false;
  if (c.notFlag && s.flags.includes(c.notFlag)) return false;
  if (c.trustAtLeast && s.crew[c.trustAtLeast[0]].trust < c.trustAtLeast[1]) return false;
  if (c.liar && s.liar !== c.liar) return false;
  return true;
}

/** Text that can change with the state. */
export type Line = string | ((s: Crisis) => string);
export const say = (s: Crisis, l: Line) => (typeof l === 'function' ? l(s) : l);

/** Rooms joined by each door. */
export const DOOR_ROOMS: Record<DoorKey, [RoomKey, RoomKey]> = {
  'command-lab': ['command', 'lab'],
  'lab-quarters': ['lab', 'quarters'],
  'ballast-power': ['ballast', 'power'],
  'power-dive': ['power', 'dive'],
  trunk: ['dive', 'quarters'],
};

/**
 * Water finds its way through open doors on the same deck: each step,
 * a flooded room spills a share of its excess into each open neighbour.
 */
export function spread(s: Crisis, rate: number): Crisis {
  const water = { ...s.water };
  for (const d of DOOR_KEYS) {
    if (d === 'trunk' || s.doors[d]) continue;
    const [a, b] = DOOR_ROOMS[d];
    const diff = s.water[a] - s.water[b];
    if (Math.abs(diff) < 0.02) continue;
    const flow = diff * rate;
    water[a] = clamp(water[a] - flow, 0, 1);
    water[b] = clamp(water[b] + flow, 0, 1);
  }
  return { ...s, water };
}

/** Overnight: the station wears down a little and the day turns over. */
export function endDay(s: Crisis): Crisis {
  const worn = apply(s, { meters: { hull: -2, air: -2 } });
  return { ...worn, day: Math.min(LAST_DAY, s.day + 1) };
}

export const rescueIn = (s: Crisis) => LAST_DAY - s.day + 1;

const SAVE_KEY = 'helios.run';

/** Checkpoint at the start of a day. Storage can be refused; the game still runs. */
export function save(s: Crisis) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Private windows and full storage: no checkpoint this time.
  }
}

export function load(): Crisis | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as Crisis) : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
