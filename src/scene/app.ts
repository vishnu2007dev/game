import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './room';
import { buildConsole, BAT_DOWN, BAT_UP, GUARD_OPEN, type PanelSwitch } from './console';
import { Tweens, ease } from './tween';
import { flapTexture } from './decals';
import { audio } from '../audio/audio';
import { Fx } from './fx';
import { buildStation, type CrewDef, type RoomDef, type Hotspot } from './station';
import type { DoorKey } from '../engine/crisis';
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
  /** Switch to the station cutaway (overview, or one room). */
  showStation(room?: string | null): void;
  /** Close up on one crew member at their post; they stop and turn to talk. */
  showCrew(id: string): void;
  /** Where a room's centre is on screen right now, in CSS pixels. */
  screenPoint(roomId: string): { x: number; y: number; visible: boolean };
  /** Same, for a hotspot marker. */
  hotspotPoint(id: string): { x: number; y: number; visible: boolean };
  setDoor(id: DoorKey, closed: boolean): void;
  setHotspots(spots: Hotspot[]): void;
  /** Live suit camera on one crew member, drawn into the element's box; null turns it off. */
  faceCam(id: string | null, frame?: HTMLElement): void;
  /** Switch to the detailed control room scene. */
  showControlRoom(): void;
  /** Events from the station view, for the interface layer. */
  onStation: (e: StationEvent) => void;
  /** Resolves when the crew models have loaded. */
  crewReady: Promise<void>;
}

export type StationEvent =
  | { type: 'overview' }
  | { type: 'room'; room: RoomDef }
  | { type: 'crew'; crew: CrewDef }
  | { type: 'control' }
  | { type: 'read' }
  | { type: 'door'; id: DoorKey }
  | { type: 'hotspot'; id: string };

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
  // Start at a sensible resolution; the loop below lowers it if frames are slow.
  const maxRatio = Math.min(devicePixelRatio, tier === 'high' ? 1.5 : 1.25);
  let pixelRatio = maxRatio;
  renderer.setPixelRatio(pixelRatio);
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

  const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.03, 90);
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
  const renderPass = composer.passes[0] as unknown as { mainScene: THREE.Scene };

  // The station cutaway is its own scene, sharing the live screen textures.
  const world = buildStation([overview.texture, trends.texture, cctv.texture]);
  world.scene.environment = scene.environment;
  world.scene.environmentIntensity = 0.25;
  let view: 'room' | 'station' = 'room';
  let stationRoom: string | null = null;
  /** Crew member the camera is closed up on, if any. */
  let stationCrew: string | null = null;
  let panX = 0;
  const snapCamera = new URLSearchParams(location.search).has('snap');
  const stationCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 34, started: false };
  const stationRay = new THREE.Raycaster();
  const stationPick = (x: number, y: number) => {
    const r = canvas.getBoundingClientRect();
    stationRay.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
    const marker = stationRay.intersectObjects([...world.hotspotHits, ...world.doorHits], false)[0];
    if (marker) {
      const [kind, id] = marker.object.name.split(':');
      return kind === 'door' ? { door: id as DoorKey } : { spot: id };
    }
    const crewHit = stationRay.intersectObjects(world.crew.map((c) => c.member.hit), false)[0];
    if (crewHit) return { crew: world.crew.find((c) => c.member.hit === crewHit.object)!.def };
    const roomHit = stationRay.intersectObjects(world.rooms.map((q) => q.hit), false)[0];
    if (roomHit) return { room: world.rooms.find((q) => q.hit === roomHit.object)! };
    return null;
  };
  const stationTap = (x: number, y: number) => {
    const hit = stationPick(x, y);
    if (hit?.door) return station.onStation({ type: 'door', id: hit.door });
    if (hit?.spot) return station.onStation({ type: 'hotspot', id: hit.spot });
    if (hit?.crew) {
      station.showCrew(hit.crew.id);
      return;
    }
    if (hit?.room) {
      if (stationRoom === hit.room.id && hit.room.id === 'command') return station.onStation({ type: 'control' });
      station.showStation(hit.room.id);
      return;
    }
    if (stationRoom) station.showStation(null);
  };

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
  // Suit camera for calls: a second small render of the station scene,
  // straight to the screen inside the call panel's frame, no post.
  let cam: { id: string; frame: HTMLElement } | null = null;
  const faceCamera = new THREE.PerspectiveCamera(32, 4 / 3, 0.05, 30);
  const renderFaceCam = () => {
    if (!cam) return;
    const c = world.crew.find((q) => q.def.id === cam!.id);
    const r = cam.frame.getBoundingClientRect();
    if (!c || r.width < 2) return;
    const p = c.member.root.position;
    const yaw = c.member.root.rotation.y;
    const head = new THREE.Vector3(p.x, p.y + 1.62, p.z);
    faceCamera.position.set(head.x + Math.sin(yaw) * 0.85, head.y + 0.04, head.z + Math.cos(yaw) * 0.85);
    faceCamera.lookAt(head.x, head.y - 0.06, head.z);
    faceCamera.aspect = r.width / r.height;
    faceCamera.updateProjectionMatrix();
    const y = innerHeight - r.bottom;
    renderer.setScissorTest(true);
    renderer.setScissor(r.left, y, r.width, r.height);
    renderer.setViewport(r.left, y, r.width, r.height);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.render(world.scene, faceCamera);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  };
  /** A world point in CSS pixels, for interface markers. */
  const project = (at: THREE.Vector3) => {
    const p = at.clone().project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + ((p.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - p.y) / 2) * rect.height,
      visible: view === 'station' && p.z < 1,
    };
  };

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
  focus.onChange = (t) => {
    hud.setFocused(t ? t.name : null);
    if (t) station.onStation({ type: 'read' });
  };
  hud.back.addEventListener('click', () => focus.focus(null));
  const canvas = renderer.domElement;
  let downAt: [number, number] | null = null;
  let dragFrom: number | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    downAt = [e.clientX, e.clientY];
    dragFrom = e.clientX;
  });
  canvas.addEventListener('pointermove', (e) => {
    // Sideways drag pans the station overview on narrow screens.
    if (view !== 'station' || dragFrom === null || stationRoom || !(e.buttons & 1)) return;
    panX = THREE.MathUtils.clamp(panX - ((e.clientX - dragFrom) / innerWidth) * 12, -6.5, 6.5);
    dragFrom = e.clientX;
  });
  canvas.addEventListener('pointerup', (e) => {
    dragFrom = null;
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 10) return;
    downAt = null;
    if (view === 'station') return stationTap(e.clientX, e.clientY);
    const sw = pickSwitch(e.clientX, e.clientY);
    if (sw >= 0) return operate(sw);
    if (ringing && pickPhone(e.clientX, e.clientY)) return station.onPhone();
    const hit = focus.pick(e.clientX, e.clientY, canvas);
    if (hit) focus.toggle(hit);
    else if (focus.focused) focus.focus(null);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (view === 'station') return canvas.classList.toggle('can-focus', !!stationPick(e.clientX, e.clientY));
    canvas.classList.toggle('can-focus', pickSwitch(e.clientX, e.clientY) >= 0 || !!focus.pick(e.clientX, e.clientY, canvas));
  });
  addEventListener('keydown', (e) => {
    if (view === 'station') {
      if (e.key === 'Escape' && stationRoom) station.showStation(null);
      return;
    }
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
    crewReady: world.ready,
    onStation: () => {},
    showStation(roomId = null) {
      view = 'station';
      stationRoom = roomId ?? null;
      stationCrew = null;
      world.hold(null);
      // Screenshot runs cut straight to the new framing.
      if (snapCamera) stationCam.started = false;
      renderPass.mainScene = world.scene;
      camera.near = 0.08;
      camera.updateProjectionMatrix();
      cine = null;
      const r = roomId ? world.rooms.find((q) => q.id === roomId) : null;
      station.onStation(r ? { type: 'room', room: r } : { type: 'overview' });
    },
    showCrew(id) {
      const c = world.crew.find((q) => q.def.id === id);
      if (!c) return;
      view = 'station';
      renderPass.mainScene = world.scene;
      camera.near = 0.08;
      camera.updateProjectionMatrix();
      cine = null;
      stationRoom = c.def.home;
      stationCrew = id;
      if (snapCamera) stationCam.started = false;
      world.hold(id);
      station.onStation({ type: 'crew', crew: c.def });
    },
    setDoor: (id, closed) => world.setDoor(id, closed),
    faceCam(id, frame) {
      cam = id && frame ? { id, frame } : null;
      world.hold(id ?? stationCrew);
    },
    setHotspots: (spots) => world.setHotspots(spots),
    hotspotPoint(id) {
      return project(world.hotspotAt(id) ?? new THREE.Vector3(0, -100, 0));
    },
    screenPoint(roomId) {
      return project(world.rooms.find((q) => q.id === roomId)!.centre);
    },
    showControlRoom() {
      stationCrew = null;
      world.hold(null);
      view = 'room';
      stationRoom = null;
      renderPass.mainScene = scene;
      camera.near = 0.03;
      camera.updateProjectionMatrix();
      focus.pose.pos.copy(shot.pos);
      focus.pose.look.copy(shot.look);
      frame(camera, camera.aspect);
      camera.updateProjectionMatrix();
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
  let frameTimes = 0;
  let frameCount = 0;

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
    if (view === 'station') {
      night += (nightTarget - night) * Math.min(1, dt * 1.5);
      world.setDim(night);
      world.update(t, dt);
      const aim = stationCrew
        ? world.crewPose(stationCrew, camera.aspect)
        : stationRoom
          ? world.roomPose(stationRoom, camera.aspect)
          : world.overviewPose(camera.aspect);
      if (!stationRoom) {
        aim.pos.x += panX;
        aim.look.x += panX;
      }
      // Gentle parallax and a slow drift keep the dollhouse view alive.
      aim.pos.x += eased.x * 0.25 + Math.sin(t * 0.13) * 0.15;
      aim.pos.y += -eased.y * 0.15;
      const k = stationCam.started ? 1 - Math.exp(-dt * 3) : 1;
      stationCam.started = true;
      stationCam.pos.lerp(aim.pos, k);
      stationCam.look.lerp(aim.look, k);
      stationCam.fov += (aim.fov - stationCam.fov) * k;
      camera.fov = stationCam.fov;
      camera.updateProjectionMatrix();
      camera.position.copy(stationCam.pos);
      camera.lookAt(stationCam.look);
      tweens.tick(t);
      if (t - lastHmi > 0.1) {
        lastHmi = t;
        overview.draw(t);
        trends.draw(t);
        overview.texture.needsUpdate = true;
        trends.texture.needsUpdate = true;
        cctv.draw(t);
        cctv.texture.needsUpdate = true;
      }
      composer.render();
      renderFaceCam();
      if (frames === 3) window.__READY = true;
      return;
    }
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

    // Dynamic resolution: if the average frame is slow, render fewer
    // pixels; if there is headroom, step back up. Checked once a second.
    frameTimes += dt;
    frameCount++;
    if (frameTimes > 1) {
      const fps = frameCount / frameTimes;
      const next = fps < 45 ? Math.max(0.6, pixelRatio - 0.15) : fps > 57 ? Math.min(maxRatio, pixelRatio + 0.1) : pixelRatio;
      if (Math.abs(next - pixelRatio) > 0.01) {
        pixelRatio = next;
        renderer.setPixelRatio(pixelRatio);
        composer.setSize(innerWidth, innerHeight);
      }
      frameTimes = 0;
      frameCount = 0;
    }

    if (frames === 3) window.__READY = true;
  });

  return station;
}
