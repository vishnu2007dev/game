import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { printedText, FONT } from './decals';
import { blobShadow } from './panels';

export type Clip =
  | 'Idle_Loop'
  | 'Walk_Loop'
  | 'Jog_Fwd_Loop'
  | 'Idle_Talking_Loop'
  | 'Interact'
  | 'Fixing_Kneeling'
  | 'Sitting_Idle_Loop'
  | 'Crouch_Fwd_Loop'
  | 'Crouch_Idle_Loop'
  | 'Death01'
  | 'Hit_Chest'
  | 'Idle_Torch_Loop'
  | 'Push_Loop'
  | 'Swim_Idle_Loop';

const CLIPS: Clip[] = [
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Idle_Talking_Loop',
  'Interact',
  'Fixing_Kneeling',
  'Sitting_Idle_Loop',
  'Crouch_Fwd_Loop',
  'Crouch_Idle_Loop',
  'Death01',
  'Hit_Chest',
  'Idle_Torch_Loop',
  'Push_Loop',
  'Swim_Idle_Loop',
];

export interface CrewLook {
  id: string;
  /** Surname printed on the chest plate and shown on the helmet. */
  callsign: string;
  suit: string;
  helmet: string;
  /** Skin tone of the face behind the visor. */
  skin: string;
}

interface Assets {
  template: THREE.Object3D;
  clips: Map<Clip, THREE.AnimationClip>;
}

let assets: Promise<Assets> | null = null;

/** Loads the CC0 mannequin and its clips once, shared by every crew member. */
export function loadCrewAssets(base = './models/'): Promise<Assets> {
  if (assets) return assets;
  const loader = new GLTFLoader();
  // The private preview host does not serve .glb, so that build ships each
  // model as base64 inside a .json file (see scripts/artifact-build.mjs).
  const packed = import.meta.env.VITE_PACKED_MODELS === '1';
  const load = async (path: string) => {
    if (!packed) return loader.loadAsync(`${base}${path}.glb`);
    const { glb } = (await (await fetch(`${base}${path}.json`)).json()) as { glb: string };
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
    return loader.parseAsync(bytes.buffer, base);
  };
  assets = (async () => {
    const model = await load('mannequin');
    const clips = new Map<Clip, THREE.AnimationClip>();
    await Promise.all(
      CLIPS.map(async (name) => {
        const g = await load(`anim/${name}`);
        const clip = g.animations[0];
        clip.name = name;
        clips.set(name, clip);
      }),
    );
    return { template: model.scene, clips };
  })();
  return assets;
}

const hex = (h: string) => new THREE.Color(h);

/** Strongest bone for each vertex. */
function boneOf(mesh: THREE.SkinnedMesh) {
  const idx = mesh.geometry.attributes.skinIndex as THREE.BufferAttribute;
  const wgt = mesh.geometry.attributes.skinWeight as THREE.BufferAttribute;
  const names = mesh.skeleton.bones.map((b) => b.name);
  const out: string[] = [];
  for (let i = 0; i < idx.count; i++) {
    let best = 0;
    let bone = '';
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > best) {
        best = w;
        bone = names[idx.getComponent(i, k)] ?? '';
      }
    }
    out.push(bone);
  }
  return out;
}

/**
 * Paint the suit straight onto the mannequin using its skin weights: the
 * bone that owns a vertex decides whether it is glove, boot, hood or
 * suit, and bind-pose height adds reflective tape and a darker yoke.
 */
function paintSuit(mesh: THREE.SkinnedMesh, look: CrewLook, bones: string[]) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const suit = hex(look.suit);
  const suitDark = suit.clone().multiplyScalar(0.7);
  const yoke = suit.clone().lerp(hex('#202224'), 0.3);
  const glove = hex('#202123');
  const boot = hex('#1c1b19');
  const hood = hex('#15171a');
  const tape = hex('#c4c8c9');
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const bone = bones[i];
    const x = pos.getX(i);
    const y = pos.getY(i);
    const ax = Math.abs(x);
    if (/hand|f_|thumb/.test(bone)) c.copy(glove);
    else if (/foot|toe/.test(bone) || (/shin/.test(bone) && y < 0.3)) c.copy(boot);
    else if (/head/.test(bone)) c.copy(hood);
    else if (/shin/.test(bone) && y > 0.3 && y < 0.345) c.copy(tape);
    else if (/forearm/.test(bone) && ax > 0.56 && ax < 0.6) c.copy(tape);
    else if (/neck|shoulder/.test(bone) || (/spine\.003|spine003/.test(bone) && y > 1.36) || (/upper_arm/.test(bone) && ax < 0.3)) c.copy(yoke);
    else if (/thigh|hips/.test(bone)) c.copy(suitDark);
    else c.copy(suit);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/**
 * How far each vertex is pushed out to turn the slim mannequin into a
 * person in a padded coverall. Pushes along the averaged normal of all
 * vertices sharing a position, so hard edges swell together instead of
 * splitting apart.
 */
function inflate(mesh: THREE.SkinnedMesh, bones: string[], joints: boolean) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  const key = (i: number) => `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`;
  const sum = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = sum.get(k) ?? new THREE.Vector3();
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
    sum.set(k, v);
  }
  const push = new Float32Array(pos.count * 3);
  const smooth = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const bone = bones[i];
    const y = pos.getY(i);
    let a = 0.02;
    if (/hand|f_|thumb/.test(bone)) a = 0.009;
    else if (/foot|toe/.test(bone)) a = 0.022;
    else if (/shin/.test(bone)) a = y < 0.3 ? 0.03 : 0.022;
    else if (/thigh/.test(bone)) a = 0.026;
    else if (/hips/.test(bone)) a = 0.03;
    else if (/spine/.test(bone)) a = 0.026;
    else if (/shoulder/.test(bone)) a = 0.016;
    else if (/upper_arm/.test(bone)) a = 0.02;
    else if (/forearm/.test(bone)) a = 0.02;
    else if (/neck/.test(bone)) a = 0.03;
    else if (/head/.test(bone)) a = 0.004;
    if (joints) a += 0.008;
    n.copy(sum.get(key(i))!).normalize();
    smooth.set([n.x, n.y, n.z], i * 3);
    n.multiplyScalar(a);
    push.set([n.x, n.y, n.z], i * 3);
  }
  geo.setAttribute('aPush', new THREE.BufferAttribute(push, 3));
  // Smooth shading too: fabric over padding has no hard edges.
  geo.setAttribute('normal', new THREE.BufferAttribute(smooth, 3));
}

/**
 * Coverall fabric: the inflate offset in the vertex shader, and in the
 * fragment shader soft creases and a fine weave bumped from the bind-pose
 * position, so the folds stay put on the body as it moves.
 */
function suitMaterial(look: CrewLook) {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.82,
    sheen: 0.7,
    sheenRoughness: 0.65,
    sheenColor: new THREE.Color(look.suit).lerp(new THREE.Color('#ffffff'), 0.25),
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPush;\nvarying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += aPush;\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vRest;
float hsh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hsh(i), hsh(i + vec3(1,0,0)), f.x), mix(hsh(i + vec3(0,1,0)), hsh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hsh(i + vec3(0,0,1)), hsh(i + vec3(1,0,1)), f.x), mix(hsh(i + vec3(0,1,1)), hsh(i + vec3(1,1,1)), f.x), f.y), f.z);
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  // Creases run around the limbs: stretch the noise along the body axis.
  vec3 q = vRest * vec3(9.0, 34.0, 9.0);
  float h = vnoise(q) * 0.65 + vnoise(q * 2.3) * 0.25 + vnoise(vRest * 420.0) * 0.04;
  vec3 dpdx = dFdx(-vViewPosition);
  vec3 dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(h) * 0.012;
  float dhy = dFdy(h) * 0.012;
  vec3 r1 = cross(dpdy, normal);
  vec3 r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  normal = normalize(abs(det) * normal - grad);
}`,
      );
  };
  return m;
}

const darkRubber = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.85 });
const webbing = new THREE.MeshStandardMaterial({ color: 0x1b1c1d, roughness: 0.92 });
const gunmetal = new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.45, metalness: 0.7 });
const steel = new THREE.MeshStandardMaterial({ color: 0x9a9fa4, roughness: 0.3, metalness: 0.85 });

const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);

/**
 * A full-face work helmet: painted shell with a window cut for a wide
 * tinted visor. Behind the glass the face of the person inside is only
 * a warm shape, lit by the helmet's own interior light.
 */
const VISOR = { phi0: Math.PI / 2 - Math.PI * 0.29, phiLen: Math.PI * 0.58, theta0: Math.PI * 0.31, thetaLen: Math.PI * 0.34 };
function helmet(look: CrewLook) {
  const g = new THREE.Group();
  const R = 0.17;
  const scale = new THREE.Vector3(1, 1.06, 1.08);
  const paint = new THREE.MeshPhysicalMaterial({ color: look.helmet, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.3 });
  // Shell: a sphere with the visor window removed, in sphere coordinates
  // so the opening matches the glass exactly.
  const shellGeo = new THREE.SphereGeometry(R, 72, 48);
  {
    const p = shellGeo.attributes.position as THREE.BufferAttribute;
    const src = shellGeo.index!;
    const idx: number[] = [];
    const inset = 0.02;
    for (let i = 0; i < src.count; i += 3) {
      const t = [src.getX(i), src.getX(i + 1), src.getX(i + 2)];
      const x = t.reduce((a, k) => a + p.getX(k), 0) / 3;
      const y = t.reduce((a, k) => a + p.getY(k), 0) / 3;
      const z = t.reduce((a, k) => a + p.getZ(k), 0) / 3;
      const theta = Math.acos(THREE.MathUtils.clamp(y / Math.hypot(x, y, z), -1, 1));
      const phi = Math.atan2(z, -x);
      const open = phi > VISOR.phi0 + inset && phi < VISOR.phi0 + VISOR.phiLen - inset && theta > VISOR.theta0 + inset && theta < VISOR.theta0 + VISOR.thetaLen - inset;
      if (!open) idx.push(...t);
    }
    shellGeo.setIndex(idx);
  }
  const shell = new THREE.Mesh(shellGeo, paint);
  shell.scale.copy(scale);
  g.add(shell);
  const liner = new THREE.Mesh(new THREE.SphereGeometry(R - 0.008, 32, 24), new THREE.MeshStandardMaterial({ color: 0x0b0c0d, roughness: 0.95, side: THREE.BackSide }));
  liner.scale.copy(scale);
  g.add(liner);
  // The face: only a soft warm shape behind dark glass.
  const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.7, emissive: look.skin, emissiveIntensity: 0.12 });
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), skin);
  face.scale.set(0.8, 1.05, 0.88);
  face.position.set(0, -0.015, 0.035);
  g.add(face);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.36), new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.95 }));
  hair.position.set(0, -0.005, 0.03);
  g.add(hair);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x6f7f84,
    roughness: 0.02,
    metalness: 0.2,
    transparent: true,
    opacity: 0.74,
    clearcoat: 1,
    envMapIntensity: 3.2,
    depthWrite: false,
  });
  const visor = new THREE.Mesh(new THREE.SphereGeometry(R + 0.003, 64, 32, VISOR.phi0, VISOR.phiLen, VISOR.theta0, VISOR.thetaLen), glass);
  visor.scale.copy(scale);
  visor.renderOrder = 2;
  g.add(visor);
  // Gasket around the window, traced along the edge of the glass.
  const edge: THREE.Vector3[] = [];
  const at = (phi: number, theta: number) => new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(R + 0.004).multiply(scale);
  const N = 24;
  for (let i = 0; i < N; i++) edge.push(at(VISOR.phi0 + (VISOR.phiLen * i) / N, VISOR.theta0));
  for (let i = 0; i < N; i++) edge.push(at(VISOR.phi0 + VISOR.phiLen, VISOR.theta0 + (VISOR.thetaLen * i) / N));
  for (let i = 0; i < N; i++) edge.push(at(VISOR.phi0 + VISOR.phiLen - (VISOR.phiLen * i) / N, VISOR.theta0 + VISOR.thetaLen));
  for (let i = 0; i < N; i++) edge.push(at(VISOR.phi0, VISOR.theta0 + VISOR.thetaLen - (VISOR.thetaLen * i) / N));
  const gasket = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge, true, 'catmullrom', 0.1), 160, 0.008, 8, true), gunmetal);
  g.add(gasket);
  // Side housings, the lamp on the right.
  for (const x of [-0.172, 0.172]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.035, 24), gunmetal);
    ear.rotation.z = Math.PI / 2;
    ear.position.set(x, -0.01, -0.01);
    g.add(ear);
  }
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.065, 18), gunmetal);
  lampBody.rotation.x = Math.PI / 2;
  lampBody.position.set(-0.155, 0.085, 0.07);
  g.add(lampBody);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.017, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 5 }));
  lens.position.set(-0.155, 0.085, 0.103);
  g.add(lens);
  const tag = printedText(look.callsign, { height: 0.026, color: '#151515', weight: 700, font: FONT.label });
  tag.position.set(0, 0.135, 0.105);
  tag.rotation.x = -0.9;
  g.add(tag);
  return g;
}

/** Neck ring the helmet seats into, worn on the shoulders. */
function collar() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 12, 48), gunmetal);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1, 0.85, 1);
  g.add(ring);
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.05, 40, 1, true), darkRubber);
  seal.position.y = -0.03;
  g.add(seal);
  return g;
}

/** Backpack frame with an air cylinder and the regulator hose. */
function backpack() {
  const g = new THREE.Group();
  const pack = rbox(0.34, 0.44, 0.12, 0.035, new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.7 }));
  g.add(pack);
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.34, 10, 24), steel);
  tank.position.set(0, 0.02, -0.11);
  g.add(tank);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 12), gunmetal);
  valve.position.set(0, 0.27, -0.11);
  g.add(valve);
  for (const y of [-0.12, 0.14]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.079, 0.012, 8, 24), webbing);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, y, -0.11);
    g.add(band);
  }
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v3(0, 0.29, -0.1), v3(0.12, 0.34, -0.02), v3(0.16, 0.3, 0.08), v3(0.13, 0.24, 0.16)]), 20, 0.013, 8),
    darkRubber,
  );
  g.add(hose);
  return g;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Utility belt with pouches, worn at the hips. */
function belt() {
  const g = new THREE.Group();
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 40), webbing);
  strap.rotation.x = Math.PI / 2;
  strap.scale.set(1, 0.72, 1.6);
  g.add(strap);
  const buckle = rbox(0.07, 0.045, 0.02, 0.006, gunmetal);
  buckle.position.set(0, 0, 0.125);
  g.add(buckle);
  for (const [x, z, r] of [
    [0.16, 0.05, 0.9],
    [-0.16, 0.05, -0.9],
    [-0.12, -0.09, -2.3],
  ] as const) {
    const pouch = rbox(0.075, 0.09, 0.045, 0.012, new THREE.MeshStandardMaterial({ color: 0x26282a, roughness: 0.85 }));
    pouch.position.set(x, -0.03, z);
    pouch.rotation.y = r;
    g.add(pouch);
  }
  return g;
}

/** Work boot: a rubber lower and a padded shaft around the ankle. */
function boot() {
  const g = new THREE.Group();
  const sole = rbox(0.13, 0.04, 0.3, 0.015, new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.9 }));
  sole.position.set(0, 0.02, 0.04);
  g.add(sole);
  const upper = rbox(0.125, 0.11, 0.27, 0.045, darkRubber);
  upper.position.set(0, 0.085, 0.035);
  g.add(upper);
  const toe = rbox(0.12, 0.06, 0.08, 0.03, gunmetal);
  toe.position.set(0, 0.06, 0.15);
  g.add(toe);
  return g;
}
export class CrewMember {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  /** Invisible box used to pick this person with a tap. */
  readonly hit: THREE.Mesh;

  constructor(
    readonly look: CrewLook,
    a: Assets,
  ) {
    const body = SkeletonUtils.clone(a.template);
    this.root.add(body);
    const suitMat = suitMaterial(look);
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.geometry = m.geometry.clone();
        const bones = boneOf(m);
        paintSuit(m, look, bones);
        const old = m.material as THREE.Material;
        inflate(m, bones, old.name === 'M_Joints');
        m.material = suitMat;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      }
    });
    body.updateMatrixWorld(true);
    // Accessories are placed in model space at the rest pose and then
    // re-parented to their bones, so they follow every animation.
    const bone = (name: string) => {
      let found: THREE.Object3D | undefined;
      body.traverse((o) => {
        if (!found && o.name.replace(/[.]/g, '') === name.replace(/[.]/g, '')) found = o;
      });
      return found!;
    };
    const wear = (obj: THREE.Object3D, boneName: string, x: number, y: number, z: number) => {
      obj.position.set(x, y, z);
      body.add(obj);
      obj.updateMatrixWorld(true);
      bone(boneName).attach(obj);
      obj.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      return obj;
    };
    wear(helmet(look), 'DEF-head', 0, 1.655, 0.015);
    wear(collar(), 'DEF-spine.003', 0, 1.49, -0.01);
    wear(backpack(), 'DEF-spine.003', 0, 1.22, -0.2);
    wear(belt(), 'DEF-hips', 0, 0.98, -0.01);
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 0.089 : -0.089;
      wear(boot(), `DEF-foot.${side}`, sx, 0, -0.02);
      const pad = rbox(0.11, 0.13, 0.05, 0.02, darkRubber);
      wear(pad, `DEF-shin.${side}`, sx, 0.52, 0.085);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.048, 0.07, 20), darkRubber);
      cuff.rotation.z = Math.PI / 2;
      wear(cuff, `DEF-forearm.${side}`, side === 'L' ? 0.69 : -0.69, 1.441, -0.068);
    }
    // Name tape and a radio on the chest.
    const plateBack = rbox(0.17, 0.05, 0.012, 0.004, new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.7 }));
    wear(plateBack, 'DEF-spine.003', 0.085, 1.3, 0.165);
    const plate = printedText(look.callsign, { height: 0.04, color: '#e9e6dc', weight: 700 });
    plate.scale.setScalar(0.8);
    wear(plate, 'DEF-spine.003', 0.085, 1.3, 0.172);
    const radio = rbox(0.06, 0.1, 0.035, 0.008, gunmetal);
    wear(radio, 'DEF-spine.003', -0.09, 1.33, 0.165);
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.006, 8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0x3cff6a, emissiveIntensity: 4 }));
    wear(led, 'DEF-spine.003', -0.075, 1.37, 0.184);

    this.mixer = new THREE.AnimationMixer(body);
    for (const [name, clip] of a.clips) this.actions.set(name, this.mixer.clipAction(clip));

    // Contact shadow so the crew stand on the deck instead of floating.
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    this.root.add(shadow);

    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.95;
    this.hit.name = `crew:${look.id}`;
    this.root.add(this.hit);
    this.play('Idle_Loop', 0);
  }

  /** Crossfade to a clip. One-shot clips hold their last frame. */
  play(name: Clip, fade = 0.35, speed = 1) {
    const next = this.actions.get(name)!;
    if (next === this.current) {
      next.timeScale = speed;
      return;
    }
    next.reset();
    next.timeScale = speed;
    next.setLoop(name.includes('Loop') || name === 'Fixing_Kneeling' ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = true;
    // Start loops at a random phase so the crew never move in sync.
    if (name.includes('Loop')) next.time = Math.random() * next.getClip().duration;
    next.play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}
