import type { DayScript, GameState } from '../engine/types';

const has = (s: GameState, f: string) => s.flags.includes(f);
const byTruth = (s: GameState, t: Record<GameState['truth'], string>) => t[s.truth];

// Act 1, The Failure. Days 1 to 3 teach the controls, introduce the
// crew, and plant clues for all three truths so no run can be told
// apart this early.

export const COLD_OPEN = {
  alarm: 'FLOOD ALARM: C2 BALLAST ROOM',
  instruction: 'Close the door between C1 and C2',
  hint: 'Flip open the red guard on the first switch, then throw the switch',
  switchIndex: 0,
  seconds: 25,
  success: "Door's sealed. Nice work, Commander. Now let's see how bad it is.",
  missed: "I closed it from this side. We lost a few minutes, but it's holding.",
};

export const DAYS: DayScript[] = [
  {
    day: 1,
    objective: 'Get C2 under control',
    report: [
      { text: 'C2 FLOODING HAS STOPPED', certainty: 'CONFIRMED' },
      { text: 'C2 WATER LEVEL 42%', certainty: 'CONFIRMED' },
      { text: 'PUMP 2 BURNED OUT', certainty: 'CONFIRMED' },
      { text: 'HULL STRESS ABOVE NORMAL', certainty: 'LIKELY' },
      { text: 'NOISE ON HYDROPHONE AT 03:44', certainty: 'UNSURE' },
      { text: 'CREW 6 OF 6 ACCOUNTED FOR', certainty: 'CONFIRMED' },
    ],
    calls: [
      {
        from: 'mara',
        lines: [
          "Door's holding. C2 is half full of seawater.",
          "Pump 2 burned out and pump 1 can't keep up alone. Two ways to do this.",
          'I can pull power from the lab and run pump 1 flat out. Lab goes dark for a day. Hana will scream.',
          "Or I rebuild pump 2 by hand. Slower, and I've been awake for twenty hours.",
        ],
        choices: [
          {
            label: 'Take power from the lab',
            hint: 'Water drains fast. Hana loses a day of work.',
            effect: { meters: { hull: 6, power: -8 }, trust: { mara: 1, hana: -1 }, flags: ['lab_dark'] },
            reply: 'Good. Fast is what we need. I will tell Hana it was my idea. It was not.',
          },
          {
            label: 'Rebuild pump 2 by hand',
            hint: 'Slower drain. Mara gets no sleep.',
            effect: { meters: { hull: 2, morale: 3 }, trust: { mara: 1, hana: 1 }, fatigue: { mara: 2 }, flags: ['pump2_rebuilt'] },
            reply: "Fine. Don't call me for six hours unless something is on fire. Or flooding. Again.",
          },
        ],
      },
      {
        from: 'hana',
        lines: [
          "Commander, before anyone says it: my drilling did not cause this. The cores were clean.",
          'Look at strain gauge 4 instead. That hull did not crack from the inside. Something pushed on it.',
          'My survey is three days from finished. Please do not shut the rig down.',
        ],
        claim: {
          text: 'My drilling did not cause this',
          isTrue: (s) => s.truth !== 'fault',
          detail: (s) =>
            s.truth === 'fault'
              ? 'DRILL VIBRATION MATCHES CRACK PATTERN IN C2 HULL PLATE'
              : 'DRILL WAS IDLE FOR 6 HOURS BEFORE THE FLOOD',
        },
        choices: [
          {
            label: 'Stop all drilling until rescue',
            hint: 'Safer hull. Hana takes it badly.',
            effect: { meters: { hull: 4, morale: -4 }, trust: { hana: -2 }, flags: ['drill_stopped'] },
            reply: 'Three years of work. Fine. It is your station.',
          },
          {
            label: 'Keep drilling, carefully',
            hint: 'Hana is grateful. The hull is a gamble.',
            effect: (s) => ({
              meters: { morale: 4, hull: s.truth === 'fault' ? -6 : 0 },
              trust: { hana: 2 },
              flags: ['drill_on'],
            }),
            reply: 'Thank you. I will keep the bit slow. You will not regret this.',
          },
        ],
      },
    ],
    night: [
      { time: '22:14', who: 'RAMIRES', text: 'Anyone else hear that? Like knocking. Outside the dive bay.' },
      { time: '22:15', who: 'VENN', text: 'It is the hull settling, Teo. Three thousand metres of water. It settles. Go to sleep.' },
      { time: '22:31', who: 'BRANDT', text: 'Switching to channel 4. Private.' },
      { time: '22:31', who: 'SYSTEM', text: 'CHANNEL 4 ENCRYPTED. CONTENT NOT LOGGED.' },
      { time: '23:02', who: 'ADEYEMI', text: 'Logged a power dip in C3 at 22:58. Probably the pumps.' },
      {
        time: '23:40',
        who: 'LOG',
        clue: true,
        text: (s: GameState) =>
          byTruth(s, {
            fault: 'SATO, PRIVATE NOTE: Ran the numbers again. The crack follows the drill line. I cannot tell them.',
            saboteur: 'C2 VALVE PANEL OPENED AT 03:41, SIX MINUTES BEFORE THE FLOOD. BADGE NOT READ.',
            presence: 'HYDROPHONE: UNKNOWN CONTACT, BEARING 210, LARGE. LOST AFTER 4 SECONDS.',
          }),
      },
    ],
  },
  {
    day: 2,
    objective: 'Keep the air clean',
    report: [
      { text: 'C2 WATER LEVEL 18%', certainty: 'CONFIRMED', when: { flag: 'lab_dark' } },
      { text: 'C2 WATER LEVEL 31%', certainty: 'CONFIRMED', when: { notFlag: 'lab_dark' } },
      { text: 'CO2 FILTER CLOGGED', certainty: 'CONFIRMED' },
      { text: 'OXYGEN SLOWLY FALLING', certainty: 'CONFIRMED' },
      { text: 'BRANDT ASKED FOR COMMS ACCESS', certainty: 'CONFIRMED' },
      { text: 'KNOCKING SOUNDS NEAR C6', certainty: 'UNSURE' },
    ],
    calls: [
      {
        from: 'ilya',
        lines: [
          'The air is going stale. Headaches already. The CO2 filter is clogged.',
          'We have two spare filters for thirteen days. I can fit one now.',
          'Or we ration: everyone moves slowly, works less, sleeps more. Nobody will like it.',
        ],
        choices: [
          {
            label: 'Fit a spare filter now',
            hint: 'Air recovers. One spare left.',
            effect: { meters: { air: 14 }, trust: { ilya: 1 }, flags: ['spare_used'] },
            reply: 'Done. You will feel it in an hour. Let us hope the last one lasts.',
          },
          {
            label: 'Ration the air',
            hint: 'Saves the spare. Morale drops.',
            effect: { meters: { air: 5, morale: -7 }, trust: { ilya: -1 } },
            reply: 'I will tell them. Expect complaints. Expect them slowly, at least.',
          },
        ],
      },
      {
        from: 'lise',
        lines: [
          'Commander. The research drives in C2 are still in the sample vault.',
          'If the water reaches them we lose three years of company data. It is only research data.',
          'Teo can be in and out in forty minutes. I would consider it a personal favour.',
        ],
        claim: {
          text: 'It is only research data',
          isTrue: (s) => s.truth !== 'saboteur',
          detail: (s) =>
            s.truth === 'saboteur'
              ? 'DRIVE INDEX INCLUDES: STATION_INCIDENT_LOG, VALVE_ACCESS_LOG'
              : 'DRIVE INDEX: CORE SAMPLES, SURVEY DATA ONLY',
        },
        choices: [
          {
            label: 'Send Teo in for the drives',
            hint: 'Lise owes you. Teo takes the risk.',
            effect: { meters: { morale: -2 }, trust: { lise: 2, teo: -1 }, fatigue: { teo: 1 }, flags: ['drives_recovered'] },
            reply: 'Thank you. I will make sure the company knows who kept their head.',
          },
          {
            label: 'Refuse. Nobody risks a dive for data.',
            hint: 'The crew approves. Lise does not.',
            effect: { meters: { morale: 5 }, trust: { lise: -2, teo: 1 }, flags: ['drives_refused'] },
            reply: 'I see. I will note your decision in my report.',
          },
        ],
      },
    ],
    emergency: {
      alarm: 'PUMP 1 OVERHEATING',
      instruction: 'Shut off the ballast pump before it burns out',
      switchIndex: 2,
      seconds: 15,
      success: { effect: { meters: { power: 2 } }, line: "Pump's off and cooling. Good reflexes. I'll restart it in an hour." },
      missed: { effect: { meters: { power: -6, hull: -3 } }, line: 'I killed it from the breaker. It is scorched, but it will run.', from: 'mara' },
    },
    night: [
      { time: '21:50', who: 'OKAFOR', text: 'Pump 1 is cooked around the edges. It will hold. Probably.' },
      {
        time: '22:20',
        who: 'RAMIRES',
        text: (s) =>
          has(s, 'drives_recovered')
            ? 'Got her drives. Vault door was already unlocked. Who unlocks a vault in a flood?'
            : 'Brandt cornered me in the galley. Asked me to go for the drives anyway. I said no.',
      },
      { time: '22:47', who: 'SATO', text: 'If anyone touches my samples while the lab is dark I will know.' },
      {
        time: '23:15',
        who: 'LOG',
        clue: true,
        text: (s) =>
          byTruth(s, {
            fault: 'HULL STRAIN GAUGE 4 RISES EVERY TIME THE DRILL RIG RUNS.',
            saboteur: 'CHANNEL 4 OPENED AGAIN. OUTBOUND MESSAGE SENT TO SURFACE. RECIPIENT HIDDEN.',
            presence: 'DIVE BAY CAMERA: SOMETHING BRUSHED THE OUTER HATCH AT 23:09. NOBODY INSIDE.',
          }),
      },
      { time: '23:58', who: 'VENN', text: 'Everyone sleep. That is a medical order.' },
    ],
  },
  {
    day: 3,
    objective: 'Find out what hit the station',
    report: [
      { text: 'HULL STRESS STEADY', certainty: 'LIKELY' },
      { text: 'C2 WATER LEVEL FALLING', certainty: 'CONFIRMED' },
      { text: 'HYDROPHONE: 3 CONTACTS IN THE NIGHT', certainty: 'UNSURE' },
      { text: 'C4 LAB DOOR OPENED AT 02:10', certainty: 'CONFIRMED' },
      { text: 'POWER DIP IN C3 AT 01:58', certainty: 'CONFIRMED' },
    ],
    calls: [
      {
        from: 'teo',
        lines: [
          'Commander, I want to go outside. Something hit us on the first night, and the knocking came back.',
          'Twenty minutes on the hull. I check the C2 plate and come straight back.',
          'Sitting in here guessing is worse than the cold.',
        ],
        choices: [
          {
            label: 'Let Teo dive',
            hint: 'You learn what is out there. Teo is exposed.',
            effect: { meters: { morale: 4 }, trust: { teo: 2 }, fatigue: { teo: 1 }, flags: ['teo_dived', 'clue_hull'] },
            reply: (s) =>
              byTruth(s, {
                fault: 'Back in. The crack runs in a straight line from the drill rig. Like it was cut.',
                saboteur: 'Back in. The C2 vent valve is open. Hand wheel turned. From inside, Commander.',
                presence: 'Back in. There are scrape marks on the plate. Long ones. Fresh. I did not stay.',
              }),
          },
          {
            label: 'Too dangerous. Stay inside.',
            hint: 'Teo stays safe and resents it.',
            effect: { meters: { morale: -4 }, trust: { teo: -1 } },
            reply: 'Understood. I will be here, listening to it knock.',
          },
        ],
      },
      {
        from: 'rook',
        lines: [
          'Someone used the C2 valve panel just before the flood. The badge reader did not log who.',
          'I can rebuild the camera footage from the backup. It takes the whole processing budget for one scan.',
          'Your call. I would want to know.',
        ],
        choices: [
          {
            label: 'Rebuild the footage (uses 1 scan)',
            hint: 'Costs one of your scans.',
            when: { notFlag: 'no_scans' },
            effect: { scans: -1, trust: { rook: 1 }, flags: ['clue_footage'] },
            reply: (s) =>
              byTruth(s, {
                fault: 'Footage is clean. Nobody at the panel. It logged a fault on its own when the hull flexed.',
                saboteur: 'Got a frame. Someone in a company jacket, back to the camera. Height about 1.7 metres.',
                presence: 'Nobody there. But every light in C2 dims at once, three seconds before the flood. Like a pulse.',
              }),
          },
          {
            label: 'Leave it. Focus on staying alive.',
            hint: 'Keep your scans.',
            effect: { trust: { rook: -1 } },
            reply: 'Okay. I will keep the backup, in case you change your mind.',
          },
        ],
      },
    ],
    night: [
      { time: '21:30', who: 'VENN', text: 'Teo is not sleeping. Neither is Hana. Neither am I, if I am honest.' },
      { time: '22:05', who: 'BRANDT', text: 'Surface says the rescue vessel is on schedule. Ten days.' },
      {
        time: '22:40',
        who: 'LOG',
        clue: true,
        text: (s) =>
          byTruth(s, {
            fault: 'DRILL RIG LOG: RUN AT 02:10 WITHOUT AUTHORISATION. OPERATOR: SATO.',
            saboteur: 'BADGE LOG REPAIRED: C2 VALVE PANEL, 03:41, BADGE 0006.',
            presence: 'HYDROPHONE: CONTACT CIRCLING THE STATION. DISTANCE 40 METRES. CLOSING.',
          }),
      },
      { time: '23:20', who: 'ADEYEMI', text: 'Whatever this is, it did not start with the flood. I am going back through the old logs.' },
    ],
  },
];
