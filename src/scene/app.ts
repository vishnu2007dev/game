import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './room';
import { buildConsole } from './console';
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
  }
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

export function startScene(root: HTMLElement) {
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
  for (const { mesh, size } of desk.screens) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
    const pos = mesh.getWorldPosition(new THREE.Vector3()).addScaledVector(normal, 0.01);
    const light = new THREE.RectAreaLight(0xaeb9c4, size[0] > 0.6 ? 3.2 : 2.4, size[0], size[1]);
    light.position.copy(pos);
    light.lookAt(pos.clone().add(normal));
    scene.add(light);
  }

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
  const focus = new FocusController(
    camera,
    desk.screens.map((s, i) => ({ mesh: s.mesh, size: s.size, name: names[i] })),
  );
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
    const hit = focus.pick(e.clientX, e.clientY, canvas);
    if (hit) focus.toggle(hit);
    else if (focus.focused) focus.focus(null);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    canvas.classList.toggle('can-focus', !!focus.pick(e.clientX, e.clientY, canvas));
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
  };
  addEventListener('resize', resize);
  resize();

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
    const pose = focus.update(dt, rest, reduced);
    const breathe = reduced ? 0 : Math.sin(t * 0.55) * (focus.focused ? 0.0008 : 0.004);
    camera.position.copy(pose.pos);
    camera.position.y += breathe;
    camera.lookAt(pose.look);

    // Screens refresh at their own rates, like real panel PCs.
    if (t - lastHmi > 0.1) {
      lastHmi = t;
      overview.draw(t);
      overview.texture.needsUpdate = true;
      trends.draw(t);
      trends.texture.needsUpdate = true;
    }
    if (t - lastCctv > 1 / 12) {
      lastCctv = t;
      cctv.draw(t);
      cctv.texture.needsUpdate = true;
    }

    // Beacon: two reflectors turning at about 40 rpm.
    const spin = reduced ? 0 : t * 4.2;
    desk.beacon.pivot.rotation.y = spin;
    const facing = Math.max(0, Math.cos(spin)) ** 6 + Math.max(0, Math.cos(spin + Math.PI)) ** 6;
    desk.beacon.dome.emissiveIntensity = 1.4 + facing * 6;
    redWash.intensity = 0.35 + facing * 0.9;

    const flashOn = Math.floor(t * 2) % 2 === 0;
    for (const ind of desk.indicators) {
      ind.mat.emissiveIntensity = ind.mode === 'off' ? 0 : ind.mode === 'flash' ? (flashOn ? 4 : 0.15) : 2.6;
    }

    room.porthole.update(t, camera);
    composer.render();

    if (frames === 3) window.__READY = true;
  });
}
