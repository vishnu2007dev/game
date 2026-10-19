export type Meter = 'hull' | 'power' | 'air' | 'morale';
export type Truth = 'fault' | 'saboteur' | 'presence';
export type CrewId = 'mara' | 'ilya' | 'teo' | 'hana' | 'rook' | 'lise';
export type RoomId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6';

export interface CrewMember {
  id: CrewId;
  name: string;
  role: string;
  /** -3 (refuses orders) to +3 (would follow you anywhere). */
  trust: number;
  /** 0 rested to 3 exhausted. */
  fatigue: number;
  alive: boolean;
}

export interface GameState {
  seed: number;
  truth: Truth;
  day: number;
  meters: Record<Meter, number>;
  crew: Record<CrewId, CrewMember>;
  flags: string[];
  scans: number;
  /** What the player believes happened, if they have said. */
  theory?: Truth;
}

/** Text that can change with the secret truth or the state. */
export type Text = string | ((s: GameState) => string);

export interface Effect {
  meters?: Partial<Record<Meter, number>>;
  trust?: Partial<Record<CrewId, number>>;
  fatigue?: Partial<Record<CrewId, number>>;
  flags?: string[];
  scans?: number;
}

export interface Condition {
  flag?: string;
  notFlag?: string;
  truth?: Truth | Truth[];
  below?: [Meter, number];
}

export interface Choice {
  label: string;
  /** One short line on what it costs or risks, shown under the label. */
  hint?: string;
  effect: Effect | ((s: GameState) => Effect);
  /** What the caller says back. */
  reply: Text;
  when?: Condition;
}

export interface Claim {
  /** The statement a scan can test, quoted from the call. */
  text: string;
  /** True or false depending on the run. */
  isTrue: (s: GameState) => boolean;
  /** Extra line printed with the scan result. */
  detail?: Text;
}

export interface Call {
  from: CrewId;
  lines: Text[];
  claim?: Claim;
  choices: Choice[];
  when?: Condition;
}

export interface ReportLine {
  text: Text;
  /** How sure the station's sensors are. */
  certainty: 'CONFIRMED' | 'LIKELY' | 'UNSURE';
  when?: Condition;
}

export interface Emergency {
  alarm: string;
  instruction: string;
  /** Index of the switch on the panel the player must throw. */
  switchIndex: number;
  seconds: number;
  success: { effect: Effect; line: Text };
  /** Missing it is never fatal: a crew member covers, at a cost. */
  missed: { effect: Effect; line: Text; from: CrewId };
}

export interface NightLine {
  time: string;
  who: string;
  text: Text;
  when?: Condition;
  /** Marks a line that holds a clue, for the end of day summary. */
  clue?: boolean;
}

export interface DayScript {
  day: number;
  objective: string;
  report: ReportLine[];
  calls: Call[];
  emergency?: Emergency;
  night: NightLine[];
}
