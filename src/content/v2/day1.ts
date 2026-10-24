import type { Crisis, CrewKey } from '../../engine/crisis';
import type { Chat, TaskDef } from './types';

// Day 1, Routine checks. Nothing goes wrong today. The point is to learn
// the station by touching it, and to get to know the five people on it
// before anything happens to them.

/** The code read out digit by digit, the way you say it on a radio. */
const spoken = (s: Crisis) => s.hatchCode.split('').join(' ');

export const DAY1_TASKS: TaskDef[] = [
  {
    id: 'valve',
    label: 'Bleed trim tank 2 in Ballast',
    room: 'ballast',
    spot: 'valve',
    kind: 'valve',
    by: 'mara',
    done: 'Nice hands, Commander. Tank is back in the green. I will make an engineer of you yet.',
  },
  {
    id: 'sync',
    label: 'Sync the backup generator in Power',
    room: 'power',
    spot: 'sync',
    kind: 'sync',
    by: 'rook',
    done: 'Clean close. The last commander slammed it in out of phase and blew every fuse on the lower deck.',
  },
  {
    id: 'keypad',
    label: 'Test the moon pool gate in the Dive Bay',
    room: 'dive',
    spot: 'keypad',
    kind: 'keypad',
    by: 'teo',
    done: 'Gate cycled. Good. If I ever need to get back in fast, I am counting on that code.',
  },
  {
    id: 'cores',
    label: 'Call Hana for the drill core report',
    room: 'lab',
    spot: '',
    kind: 'call',
    by: 'hana',
    done: '',
  },
];

/** Calls that move the day along. */
export const DAY1_CHATS: Record<'teoCode' | 'hanaCores', Chat> = {
  teoCode: {
    with: 'teo',
    nodes: {
      start: {
        lines: ['Ramires.', 'The gate code? They sent a commander down here without the codes. Of course they did.'],
        choices: [
          {
            label: 'Just the code, Teo.',
            reply: [(s) => `${spoken(s)}. Say it back to yourself. People get it wrong down here.`],
            effect: { flags: ['got_code'] },
          },
          {
            label: 'First day. Help me out?',
            hint: 'Honesty goes a long way with Teo.',
            reply: [(s) => `Ha. Honest. I like that. It is ${spoken(s)}.`, 'And do not write it on a sticky note. The last commander did.'],
            effect: { flags: ['got_code'], trust: { teo: 1 } },
          },
        ],
      },
    },
  },
  hanaCores: {
    with: 'hana',
    nodes: {
      start: {
        lines: [
          'Sato. You want the core report.',
          'Cores eleven to fourteen came up from four hundred metres under the seabed. That rock has been sealed for a very long time.',
          'One odd thing. They smell like the sea. Fresh sea. Rock that old should smell of nothing at all.',
        ],
        choices: [
          {
            label: 'Is it dangerous?',
            hint: 'She hates being doubted.',
            effect: { trust: { hana: -1 }, flags: ['cores_reported'] },
            reply: ['Everything is dangerous if you lick it, Commander. They are sealed. Let me work.'],
          },
          {
            label: 'Sounds like a discovery.',
            hint: 'She will like that.',
            effect: { trust: { hana: 1 }, flags: ['cores_reported', 'hana_encouraged'] },
            reply: ['It might be the biggest one of my life. Thank you for saying so.', 'Do me a favour. Do not tell the company yet.'],
          },
          {
            label: 'Keep them sealed. Nobody opens them.',
            hint: 'Safe. She will take it as an order.',
            effect: { flags: ['cores_reported', 'cores_sealed'] },
            reply: ['They have been sealed since they came up.', 'Fine. Noted. Sealed.'],
          },
        ],
      },
    },
  },
};

/** What each person says if you just call them. Once a day; after that they are busy. */
export const DAY1_SMALLTALK: Record<CrewKey, Chat> = {
  mara: {
    with: 'mara',
    nodes: {
      start: {
        lines: ['Okafor. If it is about the tank, it is fine. Everything down here is fine until it is not.'],
        choices: [
          { label: 'How long have you been down here?', effect: { trust: { mara: 1 } }, reply: ['Fourteen months. My daughter learned to walk on a video call.', 'Five more days. Then I am going to hold her and not let go.'] },
          { label: 'Get some sleep after the checks.', reply: ['Sleep. I remember sleep. Fine, Commander.'] },
        ],
      },
    },
  },
  rook: {
    with: 'rook',
    nodes: {
      start: {
        lines: ['Adeyemi. Power is green. Mostly green. Let us call it green.'],
        choices: [
          { label: 'Mostly?', effect: { flags: ['rook_breaker7'], trust: { rook: 1 } }, reply: ['Breaker seven trips if you look at it. The company says it is within spec.', 'The company is three kilometres up.'] },
          { label: 'Good. Keep it that way.', reply: ['Yes, Commander. Very commanding.'] },
        ],
      },
    },
  },
  ilya: {
    with: 'ilya',
    nodes: {
      start: {
        lines: ['Venn, medical bay. Nobody is bleeding, which is how I like my mornings.'],
        choices: [
          { label: 'How is the crew holding up?', effect: { trust: { ilya: 1 } }, reply: ['Tired. Teo is not sleeping. Hana sleeps in the lab. Mara does not sleep at all.', 'Normal, then.'] },
          { label: 'Anything I should worry about?', reply: ['Ask me again in five days.'] },
        ],
      },
    },
  },
  teo: {
    with: 'teo',
    nodes: {
      start: {
        lines: ['Ramires. Still here.'],
        choices: [
          { label: 'What is it like out there?', effect: { trust: { teo: 1 } }, reply: ['Dark. Quiet. Too quiet, some days. Out there you can hear your own heart.'] },
          { label: 'Just checking in.', reply: ['Checked.'] },
        ],
      },
    },
  },
  hana: {
    with: 'hana',
    nodes: {
      start: {
        lines: ['Sato. Busy. Very busy. Was there something?'],
        choices: [{ label: 'No. Carry on.', reply: ['Thank you.'] }],
      },
    },
  },
};

/** Lines when someone has already talked today. */
export const BUSY: Record<CrewKey, string> = {
  mara: 'Okafor. Hands full, Commander. Call me if something breaks.',
  rook: 'Adeyemi. I am inside a cabinet right now. Later.',
  ilya: 'Venn. With a patient. Well, with paperwork. Later.',
  teo: 'Ramires. Gearing up. Talk later.',
  hana: 'Sato. Please. I am in the middle of something.',
};

export const DAY1_OPEN = {
  radio: { who: 'OKAFOR', text: 'Morning, Commander. Your checks are on the list. Tap a marker to start one.' },
  allDone: { who: 'OKAFOR', text: 'That is the lot. Good first shift. Get some rest, we will keep the lights on.' },
  needCode: { who: 'RAMIRES', text: 'You need the gate code? Call me. Tap my name in the crew list, then Call.' },
};

/** The night: something knocks on the hull. */
export const NIGHT1 = {
  radio: [
    { who: 'RAMIRES', text: 'Commander. Did you hear that?' },
    { who: 'OKAFOR', text: 'Pressure hull is fine. It is the cold. Metal ticks.' },
    { who: 'RAMIRES', text: 'Metal does not knock three times.' },
  ],
  log: (s: Crisis) => [
    { time: '22:40', who: 'OKAFOR', text: 'Trim tank holding at 4.9 bar.' },
    { time: '23:15', who: 'ADEYEMI', text: s.flags.includes('rook_breaker7') ? 'Breaker seven tripped again. Reset it.' : 'Breaker tripped in Power. Reset.' },
    { time: '01:52', who: 'HYDROPHONE', text: 'Three impacts on the hull. Lower deck, outside the Ballast room.', clue: true },
    { time: '01:53', who: 'RAMIRES', text: 'That was not us. Nobody is outside.' },
    { time: '02:30', who: 'LAB DOOR', text: 'Core store opened. Card: SATO.', clue: true },
  ],
};
