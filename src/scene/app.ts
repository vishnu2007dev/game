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
  const lookAt = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    frames++;

    if (!reduced) eased.lerp(pointer, 0.04);
    const breathe = reduced ? 0 : Math.sin(t * 0.55) * 0.004;
    camera.position.copy(shot.pos).add(new THREE.Vector3(eased.x * 0.035, -eased.y * 0.02 + breathe, 0));
    lookAt.copy(shot.look).add(new THREE.Vector3(eased.x * 0.01, -eased.y * 0.006, 0));
    camera.lookAt(lookAt);

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
