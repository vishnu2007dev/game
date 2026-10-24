import type { CrewKey, CrisisCondition, CrisisEffect, Line } from '../../engine/crisis';

/** One reply the player can give, what it does, and what comes back. */
export interface ChatChoice {
  label: string;
  /** What it costs or risks, one short line. */
  hint?: string;
  effect?: CrisisEffect;
  /** Their answer. */
  reply?: Line[];
  /** Node to continue at; the call ends when there is none. */
  next?: string;
  when?: CrisisCondition;
}

export interface ChatNode {
  lines: Line[];
  choices?: ChatChoice[];
  /** Applied when the node is reached. */
  effect?: CrisisEffect;
}

/** A whole conversation with one person. Starts at the node called start. */
export interface Chat {
  with: CrewKey;
  nodes: Record<string, ChatNode> & { start: ChatNode };
}

/** A hands-on task in a room, and who talks you through it. */
export interface TaskDef {
  id: string;
  /** Checklist text. */
  label: string;
  room: string;
  /** Hotspot to tap. */
  spot: string;
  kind: 'valve' | 'sync' | 'keypad' | 'call';
  /** Who is nearby, and what they say on the radio once it is done. */
  by: CrewKey;
  done: Line;
}
