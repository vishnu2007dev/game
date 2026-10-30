import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/vt323/400.css';
import '@fontsource/caveat/700.css';
import './styles/base.css';
import './styles/overlays.css';
import { startScene, type StationEvent } from './scene/app';
import { CREW, ROOMS } from './scene/station';
import { Roster } from './ui/roster';
import { Coach } from './ui/coach';
import { meetCrew, tutorial } from './game/onboarding';
import { ChatPanel } from './ui/chat';
import { Objectives } from './ui/objectives';
import { Subtitles } from './ui/subtitles';
import { type Ctx, change, shortCall, exclusive, syncDoors } from './game/run';
import { day1 } from './game/days/day1';
import { newCrisis, save, type CrewKey, type DoorKey } from './engine/crisis';
import { randomSeed } from './engine/rng';
import { audio } from './audio/audio';
import { Overlays } from './ui/overlays';
import { playTrailer, smoulder, trailerStill, calm } from './game/trailer';
import { StationHud } from './ui/stationHud';

// Canvas text is drawn once into textures, so every face has to be
// loaded before the scene is built.
const faces = [
  '500 30px "Barlow Condensed"',
  '600 30px "Barlow Condensed"',
  '700 30px "Barlow Condensed"',
  '400 30px "IBM Plex Mono"',
  '500 30px "IBM Plex Mono"',
  '600 30px "IBM Plex Mono"',
  '30px "VT323"',
  '700 30px "Caveat"',
];

await Promise.all(faces.map((f) => document.fonts.load(f)));
const root = document.getElementById('app')!;
const station = startScene(root);
(window as unknown as { __station: unknown }).__station = station;
// v2 is built in steps. This step is the intro: trailer and title.
// The v1 director (src/game/director.ts) stays in the repo for reuse.
root.classList.add('is-cinematic');
const ov = new Overlays(root);
const still = new URLSearchParams(location.search).get('still');
if (still) {
  await trailerStill(station, still);
  if (still === 'wreck') void ov.titleCard();
  window.__STILL = true;
  await new Promise(() => {});
}
if (!new URLSearchParams(location.search).has('station')) await ov.pressStart();
// Station view: the cutaway, rooms, crew, and the control room as home.
const hud = new StationHud(root);
const roster = new Roster(root, CREW);
const coach = new Coach(root);
const listeners = new Set<(e: StationEvent) => void>();
/** Resolves on the next station event that matches. */
const nextEvent = (match: (e: StationEvent) => boolean) =>
  new Promise<StationEvent>((resolve) => {
    const fn = (e: StationEvent) => {
      if (!match(e)) return;
      listeners.delete(fn);
      resolve(e);
    };
    listeners.add(fn);
  });
const chat = new ChatPanel(root);
const objectives = new Objectives(root);
const subs = new Subtitles(root);
station.onStation = (e) => {
  if (e.type === 'door') toggleDoor(e.id);
  else if (e.type === 'overview') hud.overview();
  else if (e.type === 'room') hud.room(e.room);
  else if (e.type === 'crew') {
    hud.room(ROOMS.find((r) => r.id === e.crew.home)!);
    void hud.crew(e.crew);
  } else if (e.type === 'control') void enterControl();
  for (const fn of [...listeners]) fn(e);
};
roster.onPick = (id) => {
  if (inControl) leaveControl(() => station.showCrew(id));
  else station.showCrew(id);
};
let inControl = false;
async function enterControl() {
  await hud.transition(() => {
    calm(station);
    station.setPower(1);
    void station.spinFlaps(0.01, '05');
    station.showControlRoom();
    root.classList.remove('is-cinematic');
    hud.controlRoom();
    roster.show(false);
    inControl = true;
  });
}
function leaveControl(then: () => void) {
  void hud.transition(() => {
    inControl = false;
    root.classList.add('is-cinematic');
    roster.show(true);
    then();
  });
}
hud.onBack = () => {
  if (inControl) leaveControl(() => station.showStation('command'));
  else station.showStation(null);
};

// The run: game state and everything the days need to drive the station.
const ctx: Ctx = {
  root,
  st: station,
  hud,
  roster,
  ov,
  chat,
  objectives,
  coach,
  subs,
  next: nextEvent,
  state: newCrisis(randomSeed()),
  busy: false,
  onCall: (id) => exclusive(ctx, () => shortCall(ctx, id, 'Not now, Commander.')),
  goTo: (room) =>
    new Promise<void>((done) => {
      if (inControl)
        leaveControl(() => {
          station.showStation(room);
          done();
        });
      else {
        station.showStation(room);
        done();
      }
    }),
};
(window as unknown as { __ctx: Ctx }).__ctx = ctx;
syncDoors(ctx);
function toggleDoor(id: DoorKey) {
  const shut = !ctx.state.doors[id];
  change(ctx, { doors: { [id]: shut } });
  audio.play('toggle');
  setTimeout(() => audio.play('thud', { volume: 0.5 }), 900);
}
// The two door switches on the desk work the lower deck doors.
const SWITCH_DOORS: DoorKey[] = ['ballast-power', 'power-dive'];
station.onSwitch = (i, action) => {
  const id = SWITCH_DOORS[i];
  if (!id || action === 'guard') return;
  if (ctx.state.doors[id] !== (action === 'throw')) toggleDoor(id);
};
const call = (id: string) => void ctx.onCall(id as CrewKey);
roster.onCall = call;

// First visit: meet the crew, then the tutorial. Remembered per browser.
const params = new URLSearchParams(location.search);
const ONBOARDED = 'helios.onboarded';
const onboarded = () => {
  try {
    return localStorage.getItem(ONBOARDED) === '1';
  } catch {
    return false;
  }
};

const skipToStation = params.has('station');
for (;;) {
  if (!skipToStation) {
    await playTrailer(station, ov);
    const stop = smoulder(station);
    const pick = await ov.titleCard();
    stop();
    if (pick === 'replay') continue;
  }
  await station.crewReady;
  await hud.transition(() => {
    hud.show(true);
    roster.show(true);
    station.showStation(null);
  });
  if (params.has('tutorial') || (!skipToStation && !onboarded())) {
    await meetCrew(station, hud, roster);
    await tutorial(station, hud, roster, coach, nextEvent);
    try {
      localStorage.setItem(ONBOARDED, '1');
    } catch {
      // Private windows may refuse storage; the tutorial just shows again.
    }
  }
  // The days. Calls open up from the crew card and the crew list.
  hud.onCall = call;
  ctx.state = newCrisis(randomSeed());
  syncDoors(ctx);
  save(ctx.state);
  await day1(ctx);
  hud.onCall = null;
  await ov.comingNext('Day 2. Something breaks.', 'This preview ends after the first night. Day 2 is being built.');
}
