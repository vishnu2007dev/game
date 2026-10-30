import type { Crisis, CrewKey } from '../../engine/crisis';
import type { Chat } from './types';
import type { Mark, SceneLine, SceneChoice } from '../../game/story';

// Day 1, Routine. Nothing goes wrong today. Each job leads to the next
// person, so by the evening the player has stood in every room and met
// everyone face to face before anything happens to them.

/** The code read out digit by digit, the way you say it on a radio. */
const spoken = (s: Crisis) => s.hatchCode.split('').join(' ');

interface Beat {
  /** The "Now:" line while the player makes their way there. */
  now: string;
  room: string;
  cast: CrewKey[];
  marks: Mark[];
  /** Said as you arrive. */
  open: SceneLine[];
  /** An optional moment to cut in. */
  ask?: { prompt: string; choices: SceneChoice[] };
  /** The job, if there is one, and what is said after it. */
  task?: { spot: string; now: string; after: SceneLine[] };
}

export const CALL_IN: SceneLine = {
  who: 'mara',
  text: 'Commander? Okafor, down in Ballast. Trim tank two is drifting again. Come and give me a hand?',
};

export const DAY1_BEATS: Beat[] = [
  {
    now: 'Go down to Ballast. Mara is waiting.',
    room: 'ballast',
    cast: ['mara'],
    marks: [{ id: 'mara', room: 'ballast', x: -4.3, z: -1.7 }],
    open: [
      { who: 'mara', text: 'There you are. Welcome to the basement.' },
      { who: 'mara', text: 'Tank two creeps up a little every night. Nobody knows why. We just bleed it off in the morning.' },
      { who: 'mara', text: 'The valve is on the bulkhead. Bring the needle into the green and hold it there.' },
    ],
    ask: {
      prompt: 'Say something while you walk over.',
      choices: [
        {
          label: 'How long have you been down here?',
          effect: { trust: { mara: 1 } },
          reply: [
            { who: 'mara', text: 'Fourteen months. My daughter learned to walk on a video call.' },
            { who: 'mara', text: 'Five more days. Then I am going to hold her and not let go.' },
          ],
        },
        {
          label: 'Show me how it is done.',
          reply: [{ who: 'mara', text: 'Clockwise to bleed it. Gently. It bites if you rush it.' }],
        },
      ],
    },
    task: {
      spot: 'valve',
      now: 'Bleed trim tank 2. Tap the valve on the bulkhead.',
      after: [
        { who: 'mara', text: 'Nice hands. I will make an engineer of you yet.' },
        { who: 'mara', text: 'Next door, Rook has been fighting the backup generator all night. Go and save him from himself.' },
      ],
    },
  },
  {
    now: 'Go next door to Power. Rook needs a hand.',
    room: 'power',
    cast: ['rook'],
    marks: [{ id: 'rook', room: 'power', x: -0.4, z: -2.0 }],
    open: [
      { who: 'rook', text: 'Come on. Come on, you old tin can. Fifty hertz. That is all I ask.' },
      { who: 'rook', text: 'Oh. Commander. You did not hear any of that.' },
    ],
    ask: {
      prompt: 'Say something.',
      choices: [
        {
          label: 'Do you always talk to the machines?',
          effect: { trust: { rook: 1 } },
          reply: [{ who: 'rook', text: 'Only the ones that listen. Which is more than I can say for the company.' }],
        },
        {
          label: 'What is wrong with it?',
          reply: [{ who: 'rook', text: 'Nothing a steady hand cannot fix. Trim the governor, close the breaker when the needle comes round. I keep missing.' }],
        },
      ],
    },
    task: {
      spot: 'sync',
      now: 'Bring the backup generator online. Tap the control panel.',
      after: [
        { who: 'rook', text: 'Clean close. The last commander slammed it in out of phase and blew every fuse on the lower deck.' },
        { who: 'rook', text: 'Teo wants the moon pool gate tested before his dive. He is funny about new commanders. Go and say hello.' },
      ],
    },
  },
  {
    now: 'Go through to the Dive Bay and see Teo.',
    room: 'dive',
    cast: ['teo'],
    marks: [{ id: 'teo', room: 'dive', x: 4.4, z: -1.3 }],
    open: [
      { who: 'teo', text: 'Ramires. You are the new one.' },
      { who: 'teo', text: 'The gate seals the moon pool. If it fails while I am out there, I do not come back in. So we test it every day.' },
      { who: 'teo', text: (s) => `Code is ${spoken(s)}. Remember it. I will not write it down for you.` },
    ],
    ask: {
      prompt: 'Say something.',
      choices: [
        {
          label: 'What is it like out there?',
          effect: { trust: { teo: 1 } },
          reply: [{ who: 'teo', text: 'Dark. Quiet. Too quiet, some days. Out there you can hear your own heart.' }],
        },
        {
          label: 'Say the code once more?',
          reply: [{ who: 'teo', text: (s) => `${spoken(s)}. Last time.` }],
        },
      ],
    },
    task: {
      spot: 'keypad',
      now: 'Test the gate. Tap the keypad and enter Teo’s code.'.replace('’', "'"),
      after: [
        { who: 'teo', text: 'Seals hold. Good.' },
        { who: 'teo', text: 'Hana has been in the lab since the cores came up. Someone should check she is eating. It will not be me.' },
      ],
    },
  },
  {
    now: 'Go up to the Lab and check on Hana.',
    room: 'lab',
    cast: ['hana'],
    marks: [{ id: 'hana', room: 'lab', x: -0.9, z: -2.1 }],
    open: [
      { who: 'hana', text: 'Do not touch the tank. Please.' },
      { who: 'hana', text: 'Cores eleven to fourteen came up from four hundred metres under the seabed. That rock has been sealed for a very long time.' },
      { who: 'hana', text: 'And they smell like the sea. Fresh sea. Rock that old should smell of nothing at all.' },
    ],
    ask: {
      prompt: 'What do you say?',
      choices: [
        {
          label: 'Is it dangerous?',
          hint: 'She hates being doubted.',
          effect: { trust: { hana: -1 }, flags: ['cores_reported'] },
          reply: [{ who: 'hana', text: 'Everything is dangerous if you lick it, Commander. They are sealed. Let me work.' }],
        },
        {
          label: 'Sounds like a discovery.',
          hint: 'She will like that.',
          effect: { trust: { hana: 1 }, flags: ['cores_reported', 'hana_encouraged'] },
          reply: [
            { who: 'hana', text: 'It might be the biggest one of my life. Thank you for saying so.' },
            { who: 'hana', text: 'Do me a favour. Do not tell the company yet.' },
          ],
        },
        {
          label: 'Keep them sealed. Nobody opens them.',
          hint: 'Safe. She will take it as an order.',
          effect: { flags: ['cores_reported', 'cores_sealed'] },
          reply: [{ who: 'hana', text: 'They have been sealed since they came up. Fine. Noted. Sealed.' }],
        },
      ],
    },
  },
];

/** Evening: everyone in Quarters for the only meal they eat together. */
export const DINNER = {
  now: 'Evening. The crew are gathering in Quarters.',
  marks: [
    { id: 'ilya', room: 'quarters', x: 3.7, z: -1.5 },
    { id: 'mara', room: 'quarters', x: 4.5, z: -2.1 },
    { id: 'rook', room: 'quarters', x: 5.3, z: -1.6 },
    { id: 'hana', room: 'quarters', x: 6.1, z: -2.2 },
    { id: 'teo', room: 'quarters', x: 4.9, z: -1.0 },
  ] as Mark[],
  open: [
    { who: 'ilya', text: 'Day one of five. Four to go. I have counted them twice.' },
    { who: 'rook', text: 'The company says the rescue sub is on schedule. The company also said the generator was new.' },
    { who: 'mara', text: 'Leave it, Rook.' },
    { who: 'hana', text: 'The cores are the reason any of us are paid. You could be a little more grateful to the rock.' },
    { who: 'teo', text: 'I am grateful to the rock. I would just like to be grateful from the surface.' },
  ] as SceneLine[],
  ask: {
    prompt: 'They look at you. Say something to the crew.',
    choices: [
      {
        label: 'Five days. We get everyone home.',
        hint: 'A promise. They will remember it.',
        effect: { trust: { mara: 1, teo: 1, ilya: 1 }, flags: ['promised_home'] },
        reply: [{ who: 'ilya', text: 'I will hold you to that, Commander.' }],
      },
      {
        label: 'Good work today, all of you.',
        effect: { trust: { rook: 1, hana: 1 } },
        reply: [{ who: 'rook', text: 'Careful. If the company hears you praising us they will cut the coffee.' }],
      },
      {
        label: 'Get some sleep. Long day tomorrow.',
        reply: [{ who: 'mara', text: 'Commander has spoken. Lights out.' }],
      },
    ] as SceneChoice[],
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
