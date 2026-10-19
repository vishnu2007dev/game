export type Level = 'normal' | 'warn' | 'alarm';

/** Everything the station overview screen shows, set by the game. */
export interface StationView {
  day: number;
  banner: { text: string; level: 'alarm' | 'warn' } | null;
  rooms: { status: string; level: Level; crew: number }[];
  /** C2 flood water, 0 to 1. */
  water: number;
  doorOpen: boolean;
  pump1: 'ON' | 'OFF' | 'HOT';
  pump2: 'ON' | 'FAILED' | 'BEING FIXED';
  alarms: { time: string; level: 'HIGH' | 'MED' | 'LOW'; text: string; state: 'NEW' | 'SEEN' | 'CLEARED' }[];
}

export function initialView(): StationView {
  return {
    day: 1,
    banner: { text: 'FLOOD ALARM: C2 BALLAST ROOM', level: 'alarm' },
    rooms: [
      { status: 'NORMAL', level: 'normal', crew: 1 },
      { status: 'FLOODING', level: 'alarm', crew: 0 },
      { status: 'NORMAL', level: 'normal', crew: 1 },
      { status: 'NORMAL', level: 'normal', crew: 2 },
      { status: 'NORMAL', level: 'normal', crew: 1 },
      { status: 'NORMAL', level: 'normal', crew: 1 },
    ],
    water: 0.42,
    doorOpen: true,
    pump1: 'ON',
    pump2: 'FAILED',
    alarms: [
      { time: '03:47', level: 'HIGH', text: 'C2 BALLAST ROOM IS FLOODING', state: 'NEW' },
      { time: '03:46', level: 'MED', text: 'DOOR BETWEEN C1 AND C2 IS OPEN', state: 'NEW' },
      { time: '03:46', level: 'MED', text: 'HULL STRESS ABOVE NORMAL', state: 'SEEN' },
    ],
  };
}
