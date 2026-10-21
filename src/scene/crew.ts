import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { printedText, FONT } from './decals';

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

/**
 * Paint the suit straight onto the mannequin using its skin weights: the
 * bone that owns a vertex decides whether it is glove, boot, hood or
 * suit, and bind-pose height adds reflective tape and a harness belt.
 */
function paintSuit(mesh: THREE.SkinnedMesh, look: CrewLook) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx = geo.attributes.skinIndex as THREE.BufferAttribute;
  const wgt = geo.attributes.skinWeight as THREE.BufferAttribute;
  const bones = mesh.skeleton.bones.map((b) => b.name);
  const suit = hex(look.suit);
  const suitDark = suit.clone().multiplyScalar(0.62);
  const glove = hex('#1b1c1e');
  const boot = hex('#211f1c');
  const hood = hex('#16181a');
  const tape = hex('#b9bec2');
  const belt = hex('#141414');
  const colours = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let best = 0;
    let bone = '';
    for (let k = 0; k < 4; k++) {
      const w = wgt.getComponent(i, k);
      if (w > best) {
        best = w;
        bone = bones[idx.getComponent(i, k)] ?? '';
      }
    }
    const x = pos.getX(i);
    const y = pos.getY(i);
    const ax = Math.abs(x);
    if (/hand|f_|thumb/.test(bone)) c.copy(glove);
    else if (/foot|toe/.test(bone) || (/shin/.test(bone) && y < 0.34)) c.copy(boot);
    else if (/head|neck/.test(bone)) c.copy(hood);
    else if (/shin/.test(bone) && y > 0.38 && y < 0.43) c.copy(tape);
    else if (/upper_arm/.test(bone) && ax > 0.33 && ax < 0.37) c.copy(tape);
    else if (/hips|spine\.001|spine001/.test(bone) && y > 0.96 && y < 1.01) c.copy(belt);
    else if (/thigh|hips/.test(bone)) c.copy(suitDark);
    else c.copy(suit);
    colours.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

/** A commercial diving helmet: painted shell, dark glass faceplate, neck dam. */
function helmet(look: CrewLook) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: look.helmet, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.155, 40, 28), paint);
  shell.scale.set(1, 1.08, 1.12);
  g.add(shell);
  // Faceplate: a slice of a slightly larger sphere across the front.
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x05080a,
    roughness: 0.04,
    metalness: 0.6,
    clearcoat: 1,
    envMapIntensity: 2.5,
    emissive: 0x1a1208,
    emissiveIntensity: 0.6,
  });
  // Sphere phi of PI/2 points along +Z, the way the mannequin faces.
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.158, 40, 20, Math.PI / 2 - Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.38), glass);
  visor.scale.copy(shell.scale);
  g.add(visor);
  // Faceplate frame and side bolts.
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.009, 10, 40), new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.5, metalness: 0.6 }));
  frame.scale.set(1.15, 0.85, 1);
  frame.position.set(0, -0.005, 0.16);
  g.add(frame);
  // Neck dam where the helmet meets the suit.
  const dam = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.03, 14, 36), new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.85 }));
  dam.rotation.x = Math.PI / 2;
  dam.position.y = -0.16;
  g.add(dam);
  // Helmet lamp on the right side, glowing so it blooms.
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 18), new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.5 }));
  lampBody.rotation.x = Math.PI / 2;
  lampBody.position.set(-0.15, 0.06, 0.05);
  g.add(lampBody);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.019, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 6 }));
  lens.position.set(-0.15, 0.06, 0.081);
  g.add(lens);
  const tag = printedText(look.callsign, { height: 0.026, color: '#1a1a1a', weight: 700, font: FONT.label });
  tag.position.set(0, 0.11, 0.1);
  tag.rotation.x = -0.75;
  g.add(tag);
  return g;
}

/** Air cylinder and harness straps on the back. */
function airTank() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9196, roughness: 0.35, metalness: 0.8 });
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 8, 20), steel);
  g.add(tank);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x3a3b3d, metalness: 0.7, roughness: 0.4 }));
  valve.position.y = 0.27;
  g.add(valve);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
  strap.rotation.x = Math.PI / 2;
  g.add(strap);
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
    const suitMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.78,
      sheen: 0.6,
      sheenRoughness: 0.7,
      sheenColor: new THREE.Color(look.suit).lerp(new THREE.Color('#ffffff'), 0.3),
    });
    let skinned: THREE.SkinnedMesh | null = null;
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.geometry = m.geometry.clone();
        paintSuit(m, look);
        m.material = suitMat;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        skinned = m;
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
    const head = bone('DEF-head');
    const h = helmet(look);
    h.position.set(0, 1.665, 0.02);
    body.add(h);
    h.updateMatrixWorld(true);
    head.attach(h);
    const tank = airTank();
    tank.position.set(0, 1.27, -0.2);
    body.add(tank);
    tank.updateMatrixWorld(true);
    bone('DEF-spine.003').attach(tank);
    const plate = printedText(look.callsign, { height: 0.045, color: '#e9e6dc', weight: 700 });
    const plateBack = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.6 }));
    plateBack.position.set(0.08, 1.33, 0.16);
    plate.position.set(0.08, 1.33, 0.1605);
    plate.scale.setScalar(0.85);
    body.add(plateBack, plate);
    plateBack.updateMatrixWorld(true);
    plate.updateMatrixWorld(true);
    bone('DEF-spine.003').attach(plateBack);
    bone('DEF-spine.003').attach(plate);

    this.mixer = new THREE.AnimationMixer(body);
    for (const [name, clip] of a.clips) this.actions.set(name, this.mixer.clipAction(clip));

    this.hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.6), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = 0.95;
    this.hit.name = `crew:${look.id}`;
    this.root.add(this.hit);
    void skinned;
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
