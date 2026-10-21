import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './room';
import { buildConsole, BAT_DOWN, BAT_UP, GUARD_OPEN, type PanelSwitch } from './console';
import { Tweens, ease } from './tween';
import { flapTexture } from './decals';
import { audio } from '../audio/audio';
import { Fx } from './fx';
import { glitch, dead } from '../hmi/glitch';
import { buildPost } from './post';
import { detectTier, prefersReducedMotion } from './quality';
import { setTextureScale } from './textures';
import { OverviewScreen } from '../hmi/overview';
import { TrendScreen } from '../hmi/trends';
import { CctvScreen } from '../hmi/cctv';
import { FocusController, type Pose } from './focus';
import { buildHud } from '../ui/hud';

declare global {
  interface Window {
    __READY?: boolean;
    __STILL?: boolean;
  }
}

/** What the game can do to the room. */
export interface Station {
  overview: OverviewScreen;
  cctv: CctvScreen;
  trends: TrendScreen;
  switches: PanelSwitch[];
  /** Called when the player opens a guard or throws a switch. */
  onSwitch: (index: number, action: 'guard' | 'throw' | 'reset') => void;
  /** Called when the player clicks the phone handset. */
  onPhone: () => void;
  /** Work a switch as if clicked: lift the guard, then throw it. */
  operate(index: number): void;
  setAlarm(on: boolean): void;
  setLamp(index: number, mode: 'flash' | 'steady' | 'off'): void;
  leanToPanel(on: boolean): void;
  setRescueDays(n: number): Promise<void>;
  printReport(lines: string[]): Promise<void>;
  ring(on: boolean): void;
  shake(strength: number, seconds: number): void;
  /** Dim the room for night logs and day changes. */
  setNight(on: boolean): void;
  fx: Fx;
  /** Mains power: 1 normal, 0 blackout. Flicker makes it stutter. */
  setPower(level: number, flicker?: boolean): void;
  /** Screen failure per monitor: 0 centre, 1 left, 2 right. */
  setScreen(index: number, state: { glitch?: number; dead?: boolean }): void;
  setCrack(progress: number): void;
  /** Something large passing outside the viewport, 0 or 1. */
  setPresence(v: number): void;
  spinFlaps(seconds: number, final: string): Promise<void>;
  /** Move the camera to a scripted shot, or back to the player (null). */
  shot(pose: { pos: THREE.Vector3; look: THREE.Vector3 } | null, seconds?: number): Promise<void>;
  /** Restore everything the trailer may have broken. */
  repair(): void;
}

/** Camera framing for landscape and portrait screens. */
function frame(camera: THREE.PerspectiveCamera, aspect: number) {
  if (aspect >= 1.2) {
    camera.fov = 50;
    return { pos: new THREE.Vector3(0, 1.36, 0.95), look: new THREE.Vector3(0, 1.25, -0.9) };
  }
  if (aspect >= 0.8) {
    camera.fov = 58;
    return { pos: new THREE.Vector3(0, 1.36, 1.0), look: new THREE.Vector3(-0.12, 1.2, -0.9) };
  }
  // Portrait phones: step back and widen so the main screen, the rescue
  // board and the controls all fit in one column.
  camera.fov = 64;
  return { pos: new THREE.Vector3(0, 1.34, 1.0), look: new THREE.Vector3(-0.03, 1.22, -0.9) };
}

export function startScene(root: HTMLElement): Station {
  const tier = detectTier();
  const reduced = prefersReducedMotion();
  setTextureScale(tier === 'high' ? 1 : 0.5);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, tier === 'high' ? 2 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  root.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.06;

  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.03, 20);
  let shot = frame(camera, innerWidth / innerHeight);

  const overview = new OverviewScreen();
  const trends = new TrendScreen();
  const cctv = new CctvScreen();
  overview.draw(0);
  trends.draw(0);
  cctv.draw(0);

  const room = buildRoom();
  scene.add(room.group);
  const desk = buildConsole({ center: overview.texture, left: trends.texture, right: cctv.texture });
  scene.add(desk.group);
  scene.updateMatrixWorld(true);

  // Faint skylight bounce so the darkest corners are not pure black.
  scene.add(new THREE.HemisphereLight(0x6f8796, 0x0a0908, 0.12));

  // Each monitor lights the desk in front of it.
  const screenLights: { light: THREE.RectAreaLight; base: number }[] = [];
  for (const { mesh, size } of desk.screens) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    const pos = mesh.getWorldPosition(new THREE.Vector3()).addScaledVector(normal, 0.01);
    const light = new THREE.RectAreaLight(0xaeb9c4, size[0] > 0.6 ? 3.2 : 2.4, size[0], size[1]);
    light.position.copy(pos);
    light.lookAt(pos.clone().add(normal));
    scene.add(light);
    screenLights.push({ light, base: light.intensity });
  }
  const hemi = scene.children.find((c) => (c as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
  const hemiBase = hemi.intensity;
  // Dim red emergency lighting that takes over in a blackout.
  const emergencyLight = new THREE.PointLight(0xff2a14, 0, 4, 2);
  emergencyLight.position.set(0, 2.1, -0.2);
  scene.add(emergencyLight);
  const fx = new Fx();
  scene.add(fx.group);

  // Cold water light through the viewport.
  const sea = new THREE.PointLight(0x2f9bab, 0.8, 3.2, 2);
  sea.position.set(-0.3, 1.72, -0.85);
  scene.add(sea);
  // Red wash that pulses with the beacon.
  const redWash = new THREE.PointLight(0xff1e10, 0.6, 4, 2);
  redWash.position.set(0.8, 1.88, -0.7);
  scene.add(redWash);

  const composer = buildPost(renderer, scene, camera, tier);

  // Reading the monitors: click or tap a screen to lean in, Back, Esc or
  // another click to sit back. Keys 1 to 3 jump to each screen.
  const names = ['Station overview', 'Life support', 'Security cameras'];
  const focus = new FocusController(camera, [
    ...desk.screens.map((s, i) => ({ mesh: s.mesh, size: s.size, name: names[i] })),
    { mesh: desk.panel.mesh, size: desk.panel.size, name: 'Switch panel' },
  ]);
  const panelTarget = focus.targets[3];
  const tweens = new Tweens();
  let station: Station;

  // Switch handling. The first click lifts the guard, the second throws
  // the switch, a third resets it. Hit boxes are oversized for thumbs.
  const switchRay = new THREE.Raycaster();
  const pickSwitch = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    switchRay.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const hit = switchRay.intersectObjects(desk.switches.map((s) => s.hit), false)[0];
    return hit ? desk.switches.findIndex((s) => s.hit === hit.object) : -1;
  };
  // The phone gets a generous hit box too, for answering by hand.
  const phoneHit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
  desk.handset.parent!.add(phoneHit);
  phoneHit.position.set(0, 0.06, 0);
  const pickPhone = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    switchRay.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    return switchRay.intersectObject(phoneHit, false).length > 0;
  };
  const operate = (i: number) => {
    const sw = desk.switches[i];
    if (!sw.open) {
      sw.open = true;
      audio.play('guard');
      tweens.run(0.22, (k) => (sw.hinge.rotation.x = GUARD_OPEN * k), ease.out);
      station.onSwitch(i, 'guard');
    } else if (!sw.thrown) {
      sw.thrown = true;
      audio.play('toggle');
      navigator.vibrate?.(30);
      tweens.run(0.16, (k) => (sw.bat.rotation.x = BAT_DOWN + (BAT_UP - BAT_DOWN) * k), ease.snap);
      station.onSwitch(i, 'throw');
    } else {
      sw.thrown = false;
      audio.play('toggle', { volume: 0.7 });
      tweens.run(0.16, (k) => (sw.bat.rotation.x = BAT_UP + (BAT_DOWN - BAT_UP) * k), ease.snap);
      station.onSwitch(i, 'reset');
    }
  };
  const touch = matchMedia('(pointer: coarse)').matches;
  const hud = buildHud(root, touch);
  focus.onChange = (t) => hud.setFocused(t ? t.name : null);
  hud.back.addEventListener('click', () => focus.focus(null));
  const canvas = renderer.domElement;
  let downAt: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
    downAt = null;
    const sw = pickSwitch(e.clientX, e.clientY);
    if (sw >= 0) return operate(sw);
    if (ringing && pickPhone(e.clientX, e.clientY)) return station.onPhone();
    const hit = focus.pick(e.clientX, e.clientY, canvas);
    if (hit) focus.toggle(hit);
    else if (focus.focused) focus.focus(null);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    canvas.classList.toggle('can-focus', pickSwitch(e.clientX, e.clientY) >= 0 || !!focus.pick(e.clientX, e.clientY, canvas));
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') focus.focus(null);
    const n = Number(e.key);
    if (n >= 1 && n <= focus.targets.length) focus.toggle(focus.targets[n - 1]);
  });

  // Pointer parallax: the head moves a few centimetres, not the room.
  const pointer = new THREE.Vector2();
  const eased = new THREE.Vector2();
  addEventListener('pointermove', (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  });

  const resize = () => {
    camera.aspect = innerWidth / innerHeight;
    shot = frame(camera, camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    fx.setSize(innerWidth, innerHeight);
  };
  addEventListener('resize', resize);
  resize();

  // Room state the game can change.
  let alarmOn = true;
  let ringing = false;
  let nextRing = 0;
  let shakeUntil = 0;
  let shakeStrength = 0;
  let night = 0;
  let nightTarget = 0;
  const flapTex = new Map<string, THREE.Texture>();
  const flapFor = (ch: string) => {
    if (!flapTex.has(ch)) flapTex.set(ch, flapTexture(ch));
    return flapTex.get(ch)!;
  };
  let rescueShown = '13';
  let power = 1;
  let flicker = false;
  const screenFx = [0, 1, 2].map(() => ({ glitch: 0, dead: false }));
  let cine: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  const camLook = new THREE.Vector3();
  const setFlap = (flap: THREE.Mesh, ch: string) => {
    (flap.material as THREE.MeshStandardMaterial).map = flapFor(ch === ' ' ? '' : ch);
    (flap.material as THREE.MeshStandardMaterial).needsUpdate = true;
  };
  const lampLight = desk.lamp.light;
  const lampBase = lampLight.intensity;

  station = {
    overview,
    cctv,
    trends,
    switches: desk.switches,
    onSwitch: () => {},
    onPhone: () => {},
    operate,
    setAlarm(on) {
      alarmOn = on;
      if (on) audio.startAlarm();
      else audio.stopAlarm();
    },
    setLamp(i, mode) {
      desk.switches[i].lamp.mode = mode;
    },
    leanToPanel(on) {
      focus.focus(on ? panelTarget : null);
    },
    async setRescueDays(n) {
      const next = String(n).padStart(2, ' ');
      const prev = rescueShown.padStart(2, ' ');
      rescueShown = next;
      await Promise.all(
        desk.flaps.map(async (flap, i) => {
          if (next[i] === prev[i]) return;
          await new Promise((r) => setTimeout(r, i * 120));
          audio.play('flap');
          // A few intermediate cards fall before the new one lands.
          for (let step = 0; step < 4; step++) {
            await tweens.run(0.06, (k) => (flap.scale.y = 1 - k * 0.92), ease.inOut);
            const ch = step === 3 ? next[i] : String((Number(prev[i]) + step + 1) % 10);
            (flap.material as THREE.MeshStandardMaterial).map = flapFor(ch === ' ' ? '' : ch);
            (flap.material as THREE.MeshStandardMaterial).needsUpdate = true;
            await tweens.run(0.06, (k) => (flap.scale.y = 0.08 + k * 0.92), ease.out);
          }
        }),
      );
    },
    async printReport(lines) {
      desk.paper.lines = lines;
      desk.paper.draw();
      const map = (desk.sheet.material as THREE.MeshStandardMaterial).map!;
      const ticks = setInterval(() => audio.play('printer', { volume: 0.6, pan: 0.5 }), 420);
      await tweens.run(2.2, (k) => (map.offset.y = (1 - k) * -0.35), ease.inOut);
      clearInterval(ticks);
    },
    ring(on) {
      ringing = on;
      nextRing = 0;
      if (!on) desk.handset.rotation.set(0, 0, 0);
    },
    shake(strength, seconds) {
      if (reduced) return;
      shakeStrength = strength;
      shakeUntil = clock.getElapsedTime() + seconds;
    },
    setNight(on) {
      nightTarget = on ? 1 : 0;
    },
    fx,
    setPower(level, stutter = false) {
      power = level;
      flicker = stutter;
    },
    setScreen(i, st) {
      Object.assign(screenFx[i], st);
    },
    setCrack(p) {
      room.porthole.setCrack(p);
    },
    setPresence(v) {
      room.porthole.setPresence(v);
    },
    async spinFlaps(seconds, final) {
      const end = performance.now() + seconds * 1000;
      while (performance.now() < end) {
        desk.flaps.forEach((f) => setFlap(f, String(Math.floor(Math.random() * 10))));
        audio.play('flap', { volume: 0.5 });
        await new Promise((r) => setTimeout(r, 90));
      }
      desk.flaps.forEach((f, i) => setFlap(f, final[i] ?? ' '));
      rescueShown = final;
      audio.play('flap');
    },
    async shot(pose, seconds = 2) {
      const fromPos = camera.position.clone();
      const fromLook = camLook.clone();
      if (!pose) {
        // Hand the camera back to the player from wherever it is now.
        focus.pose.pos.copy(camera.position);
        focus.pose.look.copy(camLook);
        cine = null;
        return;
      }
      cine = { pos: fromPos.clone(), look: fromLook.clone() };
      const c = cine;
      await tweens.run(
        seconds,
        (k) => {
          c.pos.lerpVectors(fromPos, pose.pos, k);
          c.look.lerpVectors(fromLook, pose.look, k);
        },
        ease.inOut,
      );
    },
    repair() {
      power = 1;
      flicker = false;
      screenFx.forEach((f) => Object.assign(f, { glitch: 0, dead: false }));
      room.porthole.setCrack(0);
      alarmOn = false;
    },
  };

  const clock = new THREE.Clock();
  let frames = 0;
  let lastHmi = -1;
  let lastCctv = -1;
  const rest: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  let lastT = 0;

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    frames++;

    const dt = Math.min(0.1, t - lastT);
    lastT = t;
    if (!reduced) eased.lerp(pointer, 0.04);
    // Parallax only at the desk; reading a screen should hold still.
    const sway = focus.focused ? 0 : 1;
    rest.pos.copy(shot.pos).add(new THREE.Vector3(eased.x * 0.035 * sway, -eased.y * 0.02 * sway, 0));
    rest.look.copy(shot.look).add(new THREE.Vector3(eased.x * 0.01 * sway, -eased.y * 0.006 * sway, 0));
    const pose = cine ?? focus.update(dt, rest, reduced);
    const breathe = reduced ? 0 : Math.sin(t * 0.55) * (focus.focused ? 0.0008 : 0.004);
    camera.position.copy(pose.pos);
    camera.position.y += breathe;
    if (t < shakeUntil) {
      const fade = (shakeUntil - t) * shakeStrength;
      camera.position.x += (Math.random() - 0.5) * 0.01 * fade;
      camera.position.y += (Math.random() - 0.5) * 0.01 * fade;
    }
    camera.lookAt(pose.look);
    camLook.copy(pose.look);
    tweens.tick(t);
    fx.update(t, dt);

    // Mains power drives the lamp, the screens and the fill light. A
    // stutter drops out at random, like a failing bus.
    const live = flicker ? (Math.random() < 0.18 ? 0.05 : power) : power;
    for (const sl of screenLights) sl.light.intensity = sl.base * live;
    desk.screens.forEach((sc, i) => {
      const m = sc.mesh.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = screenFx[i].dead ? 0.25 : Math.max(0.15, live);
    });
    hemi.intensity = hemiBase * (0.3 + 0.7 * live);
    emergencyLight.intensity = (1 - power) * 1.1;

    // Night dims the practical lights; the screens stay on.
    night += (nightTarget - night) * Math.min(1, dt * 1.5);
    lampLight.intensity = lampBase * (1 - night * 0.75) * live;
    (desk.lamp.bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 9 * live;

    // The phone rings in bursts and the handset rattles in its cradle.
    if (ringing) {
      if (t > nextRing) {
        audio.play('phoneRing', { pan: -0.5 });
        nextRing = t + 2.8;
      }
      const burst = (nextRing - t) > 1.6;
      desk.handset.rotation.z = burst && !reduced ? Math.sin(t * 90) * 0.02 : 0;
    }

    // Screens refresh at their own rates, like real panel PCs.
    if (t - lastHmi > 0.1) {
      lastHmi = t;
      overview.draw(t);
      trends.draw(t);
      [overview, trends].forEach((sc, i) => {
        const f = screenFx[i === 0 ? 0 : 1];
        if (f.dead) dead(sc.canvas, Math.random() < 0.3);
        else if (f.glitch > 0) glitch(sc.canvas, f.glitch);
        sc.texture.needsUpdate = true;
      });
    }
    if (t - lastCctv > 1 / 12) {
      lastCctv = t;
      cctv.draw(t);
      if (screenFx[2].dead) dead(cctv.canvas, Math.random() < 0.3);
      else if (screenFx[2].glitch > 0) glitch(cctv.canvas, screenFx[2].glitch);
      cctv.texture.needsUpdate = true;
    }

    // Beacon: two reflectors turning at about 40 rpm, only in an alarm.
    const spin = reduced ? 0 : t * 4.2;
    desk.beacon.pivot.rotation.y = spin;
    const facing = Math.max(0, Math.cos(spin)) ** 6 + Math.max(0, Math.cos(spin + Math.PI)) ** 6;
    desk.beacon.dome.emissiveIntensity = alarmOn ? 1.4 + facing * 6 : 0.08;
    for (const l of desk.beacon.lights) l.visible = alarmOn;
    redWash.intensity = alarmOn ? 0.35 + facing * 0.9 : 0;

    const flashOn = Math.floor(t * 2) % 2 === 0;
    for (const ind of desk.indicators) {
      ind.mat.emissiveIntensity = ind.mode === 'off' ? 0 : ind.mode === 'flash' ? (flashOn ? 4 : 0.15) : 2.6;
    }

    room.porthole.update(t, camera);
    composer.render();

    if (frames === 3) window.__READY = true;
  });

  return station;
}
