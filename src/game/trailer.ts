import * as THREE from 'three';
import { audio } from '../audio/audio';
import type { Station } from '../scene/app';
import type { Overlays } from '../ui/overlays';

class Skipped extends Error {}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Camera shots, in metres, around the control room.
const SHOTS = {
  wide: { pos: v(0, 1.48, 1.35), look: v(0, 1.2, -0.9) },
  push: { pos: v(0, 1.32, 0.58), look: v(0, 1.16, -0.9) },
  panel: { pos: v(0.14, 1.03, -0.22), look: v(-0.02, 0.84, -0.62) },
  screens: { pos: v(0.22, 1.22, 0.12), look: v(0.05, 1.12, -0.75) },
  pipe: { pos: v(0.05, 1.5, 0.35), look: v(0.32, 2.04, -0.78) },
  flaps: { pos: v(0.3, 1.66, -0.42), look: v(0.33, 1.7, -0.98) },
  porthole: { pos: v(-0.27, 1.69, -0.5), look: v(-0.3, 1.72, -1.04) },
  pullback: { pos: v(0, 1.52, 1.5), look: v(0, 1.18, -0.9) },
};

const PANEL = v(-0.05, 0.9, -0.52);
const ESTOP = v(0.29, 0.86, -0.58);
const PIPE_BURST = v(0.34, 2.12, -0.73);
const CONSOLE = v(0, 1.12, -0.6);
// Metal the arcs jump between: switch bats, the e-stop ring, the selector.
const PANEL_POINTS = [v(-0.33, 0.9, -0.6), v(-0.225, 0.9, -0.6), v(-0.12, 0.9, -0.6), v(-0.015, 0.9, -0.6), v(0.13, 0.88, -0.6), v(0.29, 0.88, -0.58)];
// Monitor bezel corners, panel, lamp head, beacon, flap board, pipe.
const ROOM_POINTS = [
  v(-0.36, 1.38, -0.69), v(0.36, 1.38, -0.69), v(-0.36, 0.93, -0.69), v(0.36, 0.93, -0.69),
  v(-0.6, 1.1, -0.45), v(0.6, 1.1, -0.45), v(-0.1, 0.88, -0.58), v(0.25, 0.88, -0.58),
  v(-0.8, 1.05, -0.05), v(0.8, 1.95, -0.92), v(0.33, 1.62, -0.92), v(0.34, 2.06, -0.7),
];

/** Puts the room back to a normal working night before the intro starts. */
function calm(st: Station) {
  st.repair();
  st.setAlarm(false);
  st.setCrack(0);
  const view = st.overview.view;
  view.banner = null;
  view.rooms = view.rooms.map((r) => ({ ...r, status: 'NORMAL', level: 'normal' }));
  view.water = 0;
  view.doorOpen = false;
  view.pump1 = 'ON';
  view.pump2 = 'ON';
  view.alarms = [{ time: '03:30', level: 'LOW', text: 'ROUTINE SELF TEST PASSED', state: 'CLEARED' }];
  st.trends.setTargets({ hull: 96, power: 92, air: 95, morale: 80 });
}

/**
 * The opening trailer: the station comes apart in about 35 seconds.
 * Resolves when it ends or is skipped, leaving the room wrecked and lit
 * only by emergency red, ready for the title question.
 */
export async function playTrailer(st: Station, ov: Overlays) {
  const abort = new AbortController();
  const aborted = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Skipped()), { once: true }));
  aborted.catch(() => {});
  const step = <T>(p: Promise<T>) => Promise.race([p, aborted]);
  const wait = (ms: number) => step(new Promise<void>((r) => setTimeout(r, ms)));
  const removeSkip = ov.skip(() => abort.abort());
  const timers: number[] = [];
  const every = (ms: number, fn: () => void) => timers.push(window.setInterval(fn, ms));

  calm(st);
  await st.spinFlaps(0.01, '05');
  ov.curtain(true, 0);
  await st.shot(SHOTS.wide, 0.01);
  audio.startAmbience();

  try {
    await wait(400);
    await step(ov.caption('03:47. Helios Deep research station.', 'log', 900));
    await step(ov.caption('3012 metres below the surface.', 'log', 700));

    // Quiet push-in on a room that is working perfectly.
    ov.curtain(false, 2200);
    const push = st.shot(SHOTS.push, 7);
    await wait(3800);
    audio.play('groan', { volume: 0.8 });
    st.shake(0.4, 1.2);
    await step(push);

    // First hit: the lights stutter and the alarm starts.
    audio.play('thud');
    audio.play('powerDown', { volume: 0.5 });
    st.shake(1.4, 1);
    st.setPower(1, true);
    st.setScreen(1, { glitch: 0.4 });
    st.overview.view.banner = { text: 'HULL BREACH: C2 BALLAST ROOM', level: 'alarm' };
    st.overview.view.rooms[1] = { status: 'FLOODING', level: 'alarm', crew: 0 };
    st.overview.view.water = 0.2;
    await wait(700);
    st.setAlarm(true);
    await wait(900);
    st.setPower(0.85, false);

    // The switch panel shorts out.
    await step(st.shot(SHOTS.panel, 0.8));
    st.fx.sparkBurst(PANEL, 220, v(0, 1, 0.8));
    st.fx.arcBetween(PANEL_POINTS, 0.8);
    audio.play('zap');
    audio.play('sparks');
    st.shake(0.8, 0.5);
    await wait(1100);
    st.fx.sparkBurst(ESTOP, 160, v(-0.3, 1, 0.6));
    audio.play('zap', { volume: 0.8, pan: 0.3 });
    await wait(1000);

    // Screens die one at a time.
    await step(st.shot(SHOTS.screens, 0.9));
    st.setScreen(2, { glitch: 0.9 });
    audio.play('zap', { volume: 0.6, pan: 0.6 });
    await wait(700);
    st.setScreen(2, { dead: true });
    st.setScreen(1, { glitch: 1 });
    await wait(600);
    st.setScreen(1, { dead: true });
    audio.play('zap', { volume: 0.6, pan: -0.6 });
    st.setScreen(0, { glitch: 0.6 });
    await wait(900);

    // A pipe overhead lets go.
    await step(st.shot(SHOTS.pipe, 0.9));
    audio.play('boom', { volume: 0.6 });
    audio.play('spray');
    st.fx.startSpray(PIPE_BURST, v(0.15, -1, 0.7), 9);
    st.shake(1.6, 1.2);
    st.overview.view.water = 0.55;
    await wait(1800);

    // The rescue board spins and lands on five.
    await step(st.shot(SHOTS.flaps, 0.8));
    await step(st.spinFlaps(1.5, '05'));
    await wait(600);

    // The viewport cracks, and something passes behind it.
    await step(st.shot(SHOTS.porthole, 0.9));
    st.setPresence(1);
    audio.play('crack');
    const crackStart = performance.now();
    await step(
      new Promise<void>((r) => {
        const id = setInterval(() => {
          const p = Math.min(1, (performance.now() - crackStart) / 2200);
          st.setCrack(p);
          if (p >= 1) {
            clearInterval(id);
            r();
          }
        }, 50);
        timers.push(id);
      }),
    );
    audio.play('crack', { volume: 0.7 });
    await wait(900);

    // Everything goes at once.
    const pull = st.shot(SHOTS.pullback, 2.6);
    audio.play('riser');
    st.setPower(0.7, true);
    st.setScreen(0, { glitch: 1 });
    every(260, () => {
      st.fx.arcBetween(ROOM_POINTS, 0.35);
      if (Math.random() < 0.6) st.fx.sparkBurst(CONSOLE.clone().add(v((Math.random() - 0.5) * 1.2, (Math.random() - 0.4) * 0.6, 0.2)), 90);
      audio.play('zap', { volume: 0.5, pan: Math.random() * 2 - 1 });
    });
    await step(pull);
    await wait(1300);
  } catch (e) {
    if (!(e instanceof Skipped)) throw e;
    audio.stopAll(0.1);
  } finally {
    timers.forEach((id) => clearInterval(id));
    removeSkip();
  }

  // The blast, then the wreck under emergency light.
  ov.flash();
  audio.play('boom');
  st.shake(2, 1.4);
  st.setAlarm(false);
  st.setPower(0);
  [0, 1, 2].forEach((i) => st.setScreen(i, { dead: true }));
  st.setCrack(1);
  ov.curtain(true, 80);
  await new Promise((r) => setTimeout(r, 1400));
  audio.play('heartbeat');
  await st.shot(SHOTS.wide, 0.01);
  ov.curtain(false, 2500);
}

/** Small sparks keep spitting from the wreck while the title shows. */
export function smoulder(st: Station) {
  const id = window.setInterval(() => {
    if (Math.random() < 0.5) {
      st.fx.sparkBurst(PANEL.clone().add(v((Math.random() - 0.5) * 0.6, 0, 0)), 40);
      audio.play('sparks', { volume: 0.35, pan: Math.random() - 0.5 });
    }
  }, 1800);
  return () => clearInterval(id);
}

/** Frames to let particles travel before a still is captured. */
const frames = (n: number) =>
  new Promise<void>((r) => {
    const tick = () => (n-- <= 0 ? r() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });

/**
 * Debug: pose the room as one moment of the trailer without the timing,
 * so each shot can be checked as a still (`?still=pipe`).
 */
export async function trailerStill(st: Station, name: string) {
  calm(st);
  await st.spinFlaps(0.01, '05');
  const broken = () => {
    st.setAlarm(true);
    st.overview.view.banner = { text: 'HULL BREACH: C2 BALLAST ROOM', level: 'alarm' };
    st.overview.view.rooms[1] = { status: 'FLOODING', level: 'alarm', crew: 0 };
    st.overview.view.water = 0.4;
  };
  switch (name) {
    case 'calm':
      await st.shot(SHOTS.push, 0.01);
      break;
    case 'alarm':
      broken();
      st.setScreen(1, { glitch: 0.5 });
      await st.shot(SHOTS.wide, 0.01);
      break;
    case 'panel':
      broken();
      await st.shot(SHOTS.panel, 0.01);
      await frames(2);
      st.fx.arcBetween(PANEL_POINTS, 900);
      st.fx.sparkBurst(PANEL, 220, v(0, 1, 0.8));
      await frames(1);
      st.fx.sparkBurst(PANEL, 220, v(0, 1, 0.8));
      await frames(1);
      break;
    case 'screens':
      broken();
      st.setScreen(2, { dead: true });
      st.setScreen(1, { glitch: 1 });
      st.setScreen(0, { glitch: 0.6 });
      await st.shot(SHOTS.screens, 0.01);
      break;
    case 'pipe':
      broken();
      await st.shot(SHOTS.pipe, 0.01);
      st.fx.startSpray(PIPE_BURST, v(0.15, -1, 0.7), 60);
      await frames(8);
      break;
    case 'porthole':
      broken();
      st.setPresence(1);
      st.setCrack(1);
      await st.shot(SHOTS.porthole, 0.01);
      break;
    case 'blast':
      broken();
      st.setPower(0.7, true);
      [0, 1, 2].forEach((i) => st.setScreen(i, { dead: i > 0, glitch: 1 }));
      st.fx.startSpray(PIPE_BURST, v(0.15, -1, 0.7), 60);
      await st.shot(SHOTS.pullback, 0.01);
      st.fx.arcBetween(ROOM_POINTS, 900);
      st.fx.sparkBurst(CONSOLE, 200);
      await frames(4);
      break;
    case 'wreck':
      st.setPower(0);
      [0, 1, 2].forEach((i) => st.setScreen(i, { dead: true }));
      st.setCrack(1);
      st.fx.startSpray(PIPE_BURST, v(0.15, -1, 0.7), 60);
      await st.shot(SHOTS.wide, 0.01);
      await frames(6);
      break;
  }
  await frames(3);
}
