// Development only: the five crew lined up in a lit bay, for judging the
// suits up close. Open /crewlab.html?clip=Idle_Loop&cam=close on the dev server.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildPost } from '../scene/post';
import { CrewMember, loadCrewAssets, type Clip } from '../scene/crew';
import { CREW } from '../scene/station';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e10);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 50);
const close = q.get('cam') === 'close';
camera.position.set(close ? 0.4 : 0, close ? 1.6 : 1.3, close ? 1.6 : 6.5);
camera.lookAt(close ? 0.3 : 0, close ? 1.5 : 0.95, 0);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.8 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const key = new THREE.SpotLight(0xffe2c0, 40, 20, 0.6, 0.5, 1.5);
key.position.set(2.5, 4, 3.5);
key.castShadow = true;
scene.add(key, new THREE.HemisphereLight(0x6a8a96, 0x101010, 0.6));
const rim = new THREE.PointLight(0x7fd6e6, 6, 8);
rim.position.set(-2, 2.2, -1.5);
scene.add(rim);
const composer = buildPost(renderer, scene, camera, 'high');
const clip = (q.get('clip') ?? 'Idle_Loop') as Clip;
const a = await loadCrewAssets();
const crew = CREW.map((def, i) => {
  const m = new CrewMember(def, a);
  m.root.position.x = (i - 2) * 1.1;
  m.root.rotation.y = Number(q.get('turn') ?? 0);
  m.play(clip, 0);
  scene.add(m.root);
  return m;
});
const clock = new THREE.Clock();
for (const m of crew) m.update(Number(q.get('t') ?? 0.5));
(window as unknown as { __ready: boolean }).__ready = true;
renderer.setAnimationLoop(() => {
  const dt = q.has('freeze') ? 0 : Math.min(clock.getDelta(), 0.05);
  for (const m of crew) m.update(dt);
  composer.render();
});
