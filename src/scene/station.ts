import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SURFACES, surfaceMaterial, makeSurface } from './textures';
import { projectUV, shadows } from './util';
import { printedText } from './decals';
import { CrewMember, loadCrewAssets, type Clip, type CrewLook } from './crew';

// Station layout in metres. The camera looks from +Z at a cutaway: the
// near half of the pressure hull is removed so both decks show at once.
const HULL = { x0: -6.5, x1: 6.5, y0: -0.4, y1: 5.6, r: 2.1, wall: 0.28, depth: 3.2 };
const LOWER = { floor: 0, ceil: 2.6 };
const UPPER = { floor: 2.85, ceil: 5.35 };
const WALL_X = 2.0;
/** Crew walk along this line, near the cut so they read clearly. */
export const LANE_Z = -0.95;
const DOOR = { z0: -1.45, z1: -0.45 };

export interface RoomDef {
  id: string;
  name: string;
  deck: 'upper' | 'lower';
  x0: number;
  x1: number;
  light: number;
  /** What the room is for, shown when the player looks inside. */
  blurb: string;
}

export const ROOMS: RoomDef[] = [
  { id: 'command', name: 'C1 Command', deck: 'upper', x0: -6.1, x1: -WALL_X, light: 0xb9c7d6, blurb: 'Your post. Every screen and switch on the station.' },
  { id: 'lab', name: 'C4 Lab', deck: 'upper', x0: -WALL_X, x1: WALL_X, light: 0xa7e0c2, blurb: 'Core samples from the drill. Hana does not like visitors.' },
  { id: 'quarters', name: 'C5 Quarters', deck: 'upper', x0: WALL_X, x1: 6.1, light: 0xffc890, blurb: 'Bunks, lockers, the medical bay.' },
  { id: 'ballast', name: 'C2 Ballast', deck: 'lower', x0: -6.1, x1: -WALL_X, light: 0xffb36a, blurb: 'Tanks and pumps that keep the station on the seabed.' },
  { id: 'power', name: 'C3 Power', deck: 'lower', x0: -WALL_X, x1: WALL_X, light: 0xc9d8ff, blurb: 'The generator and every breaker on the station.' },
  { id: 'dive', name: 'C6 Dive Bay', deck: 'lower', x0: WALL_X, x1: 6.1, light: 0x7fd6e6, blurb: 'The moon pool. The only way in or out.' },
];

export interface CrewDef extends CrewLook {
  name: string;
  role: string;
  /** One line in their own voice, shown when the player meets them. */
  line: string;
  home: string;
  spots: { x: number; z: number; clip: Clip; face: number }[];
}

export const CREW: CrewDef[] = [
  {
    id: 'mara', name: 'Mara Okafor', callsign: 'OKAFOR', role: 'Hydraulics engineer', suit: '#b5531f', helmet: '#c86a2a', home: 'ballast',
    line: 'Pipes, pumps, valves. If it holds water, it is mine.',
    spots: [
      { x: -4.6, z: -2.1, clip: 'Fixing_Kneeling', face: Math.PI },
      { x: -3.2, z: -1.9, clip: 'Interact', face: Math.PI },
      { x: -5.2, z: -1.1, clip: 'Idle_Loop', face: 0.4 },
    ],
  },
  {
    id: 'rook', name: 'Rook Adeyemi', callsign: 'ADEYEMI', role: 'Electrician', suit: '#2c557f', helmet: '#3a6a99', home: 'power',
    line: 'Power, doors, lights. You want something switched, you call me.',
    spots: [
      { x: 0.9, z: -2.2, clip: 'Interact', face: Math.PI },
      { x: -0.9, z: -1.6, clip: 'Idle_Torch_Loop', face: Math.PI * 0.85 },
      { x: 0.2, z: -1.0, clip: 'Idle_Loop', face: 0.2 },
    ],
  },
  {
    id: 'ilya', name: 'Ilya Venn', callsign: 'VENN', role: 'Medic', suit: '#c9c9c2', helmet: '#e2e2db', home: 'quarters',
    line: 'I keep you breathing. I am also the only one who can test for anything.',
    spots: [
      { x: 4.9, z: -1.9, clip: 'Interact', face: Math.PI },
      { x: 3.4, z: -1.3, clip: 'Idle_Talking_Loop', face: -0.3 },
      { x: 5.3, z: -1.2, clip: 'Sitting_Idle_Loop', face: -0.6 },
    ],
  },
  {
    id: 'teo', name: 'Teo Ramires', callsign: 'RAMIRES', role: 'Diver', suit: '#b18f1f', helmet: '#d1a92a', home: 'dive',
    line: 'Anything outside the hull is my job. I am the one who goes out there.',
    spots: [
      { x: 3.0, z: -1.9, clip: 'Idle_Loop', face: 0.6 },
      { x: 5.0, z: -2.2, clip: 'Interact', face: Math.PI },
      { x: 4.1, z: -1.2, clip: 'Crouch_Idle_Loop', face: 0 },
    ],
  },
  {
    id: 'hana', name: 'Hana Sato', callsign: 'SATO', role: 'Biologist', suit: '#476b3d', helmet: '#5a8550', home: 'lab',
    line: 'The drill found something in the cores. I would like to finish studying it.',
    spots: [
      { x: -1.0, z: -2.1, clip: 'Interact', face: Math.PI },
      { x: 1.1, z: -2.1, clip: 'Idle_Loop', face: Math.PI },
      { x: 0.2, z: -1.2, clip: 'Idle_Talking_Loop', face: 0.3 },
    ],
  },
];

/** Floor height of the room a point is in. */
const floorOf = (deck: 'upper' | 'lower') => (deck === 'upper' ? UPPER.floor : LOWER.floor);

export interface Station {
  scene: THREE.Scene;
  rooms: (RoomDef & { hit: THREE.Mesh; centre: THREE.Vector3 })[];
  crew: { def: CrewDef; member: CrewMember }[];
  ready: Promise<void>;
  update(t: number, dt: number): void;
  overviewPose(aspect: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
  roomPose(id: string, aspect: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
}

function hullShape(inset: number) {
  const { x0, x1, y0, y1, r } = HULL;
  const s = new THREE.Shape();
  const a = x0 + inset;
  const b = x1 - inset;
  const c = y0 + inset;
  const d = y1 - inset;
  const rr = r - inset;
  s.moveTo(a + rr, c);
  s.lineTo(b - rr, c);
  s.quadraticCurveTo(b, c, b, c + rr);
  s.lineTo(b, d - rr);
  s.quadraticCurveTo(b, d, b - rr, d);
  s.lineTo(a + rr, d);
  s.quadraticCurveTo(a, d, a, d - rr);
  s.lineTo(a, c + rr);
  s.quadraticCurveTo(a, c, a + rr, c);
  return s;
}

function box(w: number, h: number, d: number, mat: THREE.Material, at: THREE.Vector3, r = 0.02, tile = 1.2) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  projectUV(geo, at, tile, 'xy');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(at);
  return shadows(m);
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildStation(screens: THREE.Texture[]): Station {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010506);
  scene.fog = new THREE.FogExp2(0x02090c, 0.045);

  const hullPaint = surfaceMaterial(SURFACES.hullPaint(), {});
  const deck = surfaceMaterial(SURFACES.deckPlate(), { metalness: 0.35 });
  const enamel = surfaceMaterial(SURFACES.consoleEnamel(), {});
  const black = surfaceMaterial(SURFACES.powderBlack(), {});
  const steel = surfaceMaterial(SURFACES.aluminium(), { metalness: 0.8 });
  const outerPaint = surfaceMaterial(
    makeSurface({ color: '#5a5f55', seed: 91, mottle: 0.15, grime: 0.8, grimeColor: '#1d2a22', streaks: 30, scratches: 40, rough: 0.7, bump: 1 }),
    {},
  );
  const cutFace = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.6, metalness: 0.5 });

  // Pressure hull: a thick ring, extruded back from the cut plane.
  const ring = hullShape(0);
  ring.holes.push(hullShape(HULL.wall));
  const hullGeo = new THREE.ExtrudeGeometry(ring, { depth: HULL.depth, bevelEnabled: false, curveSegments: 18 });
  hullGeo.translate(0, 0, -HULL.depth);
  projectUV(hullGeo, v(0, 0, 0), 2.4, 'xy');
  // Material groups: 0 is the cut faces, 1 is the curved walls, inside
  // and out; only the inside is ever seen from the camera.
  const hull = new THREE.Mesh(hullGeo, [cutFace, hullPaint]);
  hull.receiveShadow = true;
  scene.add(hull);
  // Back wall: plated, with ring frames every metre and a half.
  const back = new THREE.Mesh(new THREE.ShapeGeometry(hullShape(HULL.wall), 18), hullPaint);
  projectUV(back.geometry, v(0, 0, 0), 1.6, 'xy');
  back.position.z = -HULL.depth + 0.001;
  back.receiveShadow = true;
  scene.add(back);
  for (let x = -5.25; x <= 5.3; x += 1.5) {
    const frame = box(0.08, HULL.y1 - HULL.y0 - 0.9, 0.1, hullPaint, v(x, (HULL.y0 + HULL.y1) / 2, -HULL.depth + 0.05), 0.01);
    scene.add(frame);
  }
  // Cut-face frame ring: a slightly lighter edge so the section reads.
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.02, bevelEnabled: false, curveSegments: 18 }), new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.45, metalness: 0.6 }));
  edge.position.z = 0.001;
  scene.add(edge);

  // Decks.
  const deckW = HULL.x1 - HULL.x0 - 2 * HULL.wall - 0.2;
  scene.add(box(deckW, 0.12, HULL.depth, deck, v(0, LOWER.floor - 0.06, -HULL.depth / 2), 0.01, 1.6));
  scene.add(box(deckW, 0.22, HULL.depth, deck, v(0, UPPER.floor - 0.11, -HULL.depth / 2), 0.01, 1.6));
  // Underside of the upper deck: beams and cable runs, seen from below.
  for (let x = -5.5; x <= 5.6; x += 1.1) scene.add(box(0.1, 0.16, HULL.depth, steel, v(x, UPPER.floor - 0.3, -HULL.depth / 2), 0.01));

  // Bulkheads between rooms, with a door gap near the front.
  for (const deckDef of [LOWER, UPPER]) {
    const h = deckDef.ceil - deckDef.floor + 0.05;
    for (const x of [-WALL_X, WALL_X]) {
      const y = deckDef.floor + h / 2;
      const backLen = DOOR.z0 + HULL.depth;
      scene.add(box(0.12, h, backLen, hullPaint, v(x, y, -HULL.depth + backLen / 2), 0.01));
      scene.add(box(0.12, h, -DOOR.z1, hullPaint, v(x, y, DOOR.z1 / 2), 0.01));
      // Lintel over the door and a frame around it.
      scene.add(box(0.12, h - 2.05, DOOR.z1 - DOOR.z0, hullPaint, v(x, deckDef.floor + 2.05 + (h - 2.05) / 2, (DOOR.z0 + DOOR.z1) / 2), 0.01));
      scene.add(box(0.2, 0.08, DOOR.z1 - DOOR.z0 + 0.16, black, v(x, deckDef.floor + 2.05, (DOOR.z0 + DOOR.z1) / 2), 0.02));
    }
  }

  // Room contents and lights.
  const rooms = ROOMS.map((r) => {
    const f = floorOf(r.deck);
    const ceil = r.deck === 'upper' ? UPPER.ceil : LOWER.ceil;
    const cx = (r.x0 + r.x1) / 2;
    const light = new THREE.PointLight(r.light, 5.5, 7, 1.6);
    light.position.set(cx, ceil - 0.25, -1.4);
    scene.add(light);
    // Strip light fixture on the ceiling.
    scene.add(box(1.6, 0.05, 0.14, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: r.light, emissiveIntensity: 2.2 }), v(cx, ceil - 0.06, -1.6), 0.02));
    const label = printedText(r.name.toUpperCase(), { height: 0.22, color: 'rgba(220,214,196,0.55)', weight: 700, letterSpacing: 10 });
    // In front of the wall frames so they never cut through the lettering.
    label.position.set(cx, ceil - 0.45, -HULL.depth + 0.12);
    scene.add(label);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(r.x1 - r.x0, ceil - f, HULL.depth), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(cx, f + (ceil - f) / 2, -HULL.depth / 2);
    hit.name = `room:${r.id}`;
    scene.add(hit);
    return { ...r, hit, centre: v(cx, f + 1.2, -1.3) };
  });

  furnish(scene, { enamel, black, steel, hullPaint }, screens);

  // Outside: seabed, legs, floodlights and marine snow.
  const sand = surfaceMaterial(
    makeSurface({ color: '#2b2a24', seed: 101, mottle: 0.25, grime: 0.6, grimeColor: '#141410', scratches: 0, rough: 0.95, bump: 2, peel: 2 }),
    {},
  );
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(80, 40, 80, 40), sand);
  const bp = bed.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(bp.getX(i) * 0.4) * 0.25 + Math.cos(bp.getY(i) * 0.7 + bp.getX(i) * 0.1) * 0.2);
  bed.geometry.computeVertexNormals();
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -1.5;
  bed.receiveShadow = true;
  scene.add(bed);
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    scene.add(box(0.22, 1.2, 0.22, outerPaint, v(x, -0.95, -0.6), 0.03));
    scene.add(box(0.22, 1.2, 0.22, outerPaint, v(x, -0.95, -2.6), 0.03));
    scene.add(box(0.7, 0.08, 0.7, outerPaint, v(x, -1.5, -0.6), 0.02));
  }
  for (const x of [-3.5, 3.5]) {
    const flood = new THREE.SpotLight(0x9fd6e0, 60, 22, 0.55, 0.6, 1.4);
    flood.position.set(x, HULL.y1 + 0.2, -1.6);
    flood.target.position.set(x * 2.2, -1.5, 3);
    scene.add(flood, flood.target);
    scene.add(box(0.3, 0.18, 0.3, black, v(x, HULL.y1 + 0.12, -1.6), 0.04));
  }
  scene.add(new THREE.HemisphereLight(0x3d5c66, 0x050505, 0.35));
  const snow = marineSnow();
  scene.add(snow.points);

  // Crew.
  const crew: Station['crew'] = [];
  const agents: Agent[] = [];
  const ready = loadCrewAssets().then((a) => {
    for (const def of CREW) {
      const member = new CrewMember(def, a);
      const room = ROOMS.find((r) => r.id === def.home)!;
      const spot = def.spots[0];
      member.root.position.set(spot.x, floorOf(room.deck), spot.z);
      member.root.rotation.y = spot.face;
      member.play(spot.clip, 0);
      scene.add(member.root);
      crew.push({ def, member });
      agents.push(new Agent(def, member, room));
    }
  });

  const overviewPose = (aspect: number) => {
    // Fit the whole hull; on portrait screens the player drags sideways.
    const fov = 34;
    const halfW = aspect >= 1 ? 7.4 : 4.2;
    const dist = halfW / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / aspect;
    const z = Math.max(dist, 11);
    return { pos: v(0, 2.9, z), look: v(0, 2.45, -1.2), fov };
  };
  const roomPose = (id: string, aspect: number) => {
    const r = rooms.find((q) => q.id === id)!;
    const fov = 38;
    const halfW = (r.x1 - r.x0) / 2 + 0.35;
    const dist = Math.max(halfW / Math.tan(THREE.MathUtils.degToRad(fov / 2)) / Math.max(aspect, 0.6), 3.4);
    const f = floorOf(r.deck);
    return { pos: v(r.centre.x, f + 1.55, Math.min(dist, 9)), look: v(r.centre.x, f + 1.05, -1.4), fov };
  };

  return {
    scene,
    rooms,
    crew,
    ready,
    update(t, dt) {
      snow.update(dt);
      for (const a of agents) a.update(t, dt);
      for (const c of crew) c.member.update(dt);
    },
    overviewPose,
    roomPose,
  };
}

/**
 * Very small crew brain for the overview: pick a spot in the home room,
 * walk there along the lane, work there for a while, repeat.
 */
class Agent {
  private target: THREE.Vector3 | null = null;
  private path: THREE.Vector3[] = [];
  private until = 0;
  private spot: CrewDef['spots'][number];
  constructor(
    private def: CrewDef,
    private m: CrewMember,
    private room: RoomDef,
  ) {
    this.spot = def.spots[0];
    this.until = 4 + Math.random() * 6;
  }

  update(t: number, dt: number) {
    const p = this.m.root.position;
    if (!this.target) {
      if (t < this.until) return;
      // Choose a different spot and walk there via the lane.
      const options = this.def.spots.filter((s) => s !== this.spot);
      this.spot = options[Math.floor(Math.random() * options.length)];
      const y = p.y;
      this.path = [v(p.x, y, LANE_Z), v(this.spot.x, y, LANE_Z), v(this.spot.x, y, this.spot.z)];
      this.target = this.path.shift()!;
      this.m.play('Walk_Loop', 0.3);
      return;
    }
    const to = this.target.clone().sub(p);
    to.y = 0;
    const d = to.length();
    const speed = 1.05;
    if (d < 0.03) {
      this.target = this.path.shift() ?? null;
      if (!this.target) {
        this.settle();
        this.m.play(this.spot.clip, 0.4);
        this.until = t + 6 + Math.random() * 8;
      }
      return;
    }
    p.addScaledVector(to.normalize(), Math.min(d, speed * dt));
    // Turn smoothly toward the walking direction.
    const want = Math.atan2(to.x, to.z);
    let diff = want - this.m.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.m.root.rotation.y += diff * Math.min(1, dt * 8);
    void this.room;
  }

  /** Face the work spot once arrived. */
  settle() {
    this.m.root.rotation.y = this.spot.face;
  }
}

function marineSnow() {
  const n = 900;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, Math.random() * 14 - 2, Math.random() * 22 - 14], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb9b4, size: 0.035, transparent: true, opacity: 0.55, depthWrite: false }));
  return {
    points,
    update(dt: number) {
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] -= dt * 0.08;
        pos[i * 3] += Math.sin(i + pos[i * 3 + 1]) * dt * 0.02;
        if (pos[i * 3 + 1] < -2) pos[i * 3 + 1] = 12;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Props for each room: just enough that every room is recognisable at a glance. */
function furnish(
  scene: THREE.Scene,
  m: { enamel: THREE.Material; black: THREE.Material; steel: THREE.Material; hullPaint: THREE.Material },
  screens: THREE.Texture[],
) {
  const U = UPPER.floor;
  const L = LOWER.floor;
  const zb = -HULL.depth + 0.45;
  const glow = (c: number, i = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });

  // Command: console with the same live screens as the control room.
  scene.add(box(3.2, 0.78, 0.8, m.enamel, v(-4.05, U + 0.39, zb + 0.1)));
  scene.add(box(3.2, 0.7, 0.25, m.enamel, v(-4.05, U + 1.12, zb - 0.15)));
  screens.forEach((tex, i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.53), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1 }));
    s.position.set(-5.05 + i * 1.0, U + 1.12, zb - 0.02);
    scene.add(s);
  });
  scene.add(box(0.5, 0.5, 0.5, m.black, v(-4.05, U + 0.25, zb + 0.9), 0.08));

  // Lab: benches, sample columns, the core on the bench.
  scene.add(box(3.4, 0.9, 0.7, m.enamel, v(0, U + 0.45, zb)));
  for (const x of [-1.2, -0.6, 0.6, 1.2]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 24), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0, transparent: true, opacity: 0.25, roughness: 0.05, clearcoat: 1 }));
    tank.position.set(x, U + 1.35, zb);
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.6, 20), glow(0x4fd28c, 1.4));
    liquid.position.set(x, U + 1.2, zb);
    scene.add(tank, liquid);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 16), glow(0x2b6b58, 0.8));
  core.rotation.z = Math.PI / 2;
  core.position.set(0, U + 0.96, zb + 0.15);
  scene.add(core);

  // Quarters: bunks, lockers, med cabinet with a red cross plate.
  scene.add(box(2.0, 0.08, 0.8, m.steel, v(4.9, U + 0.5, zb + 0.05)));
  scene.add(box(2.0, 0.08, 0.8, m.steel, v(4.9, U + 1.5, zb + 0.05)));
  scene.add(box(1.9, 0.14, 0.72, new THREE.MeshStandardMaterial({ color: 0x3d4a52, roughness: 0.95 }), v(4.9, U + 0.61, zb + 0.05)));
  scene.add(box(1.9, 0.14, 0.72, new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.95 }), v(4.9, U + 1.61, zb + 0.05)));
  for (const x of [2.5, 3.0, 3.5]) scene.add(box(0.46, 1.9, 0.5, m.enamel, v(x, U + 0.95, zb - 0.05), 0.02));
  const cross = printedText('+ MED', { height: 0.18, color: '#c0392b', weight: 700 });
  cross.position.set(3.0, U + 1.6, zb + 0.21);
  scene.add(cross);

  // Ballast: a big tank, pipework and the valve wheel Mara will need.
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.2, 8, 28), m.hullPaint);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-4.1, L + 1.05, zb + 0.05);
  scene.add(shadows(tank));
  for (const y of [0.35, 2.15]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 16), m.steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(-4.1, L + y, zb - 0.25);
    scene.add(pipe);
  }
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 10, 32), new THREE.MeshStandardMaterial({ color: 0xb0261b, roughness: 0.5 })));
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.48, 8), m.steel);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  wheel.position.set(-2.7, L + 1.3, zb + 0.4);
  scene.add(wheel);

  // Power: generator, breaker cabinets with status lamps, cable drops.
  scene.add(box(1.6, 1.3, 0.9, m.enamel, v(-0.6, L + 0.65, zb + 0.1)));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 32), m.steel);
  drum.rotation.z = Math.PI / 2;
  drum.position.set(-0.6, L + 1.6, zb + 0.1);
  scene.add(shadows(drum));
  for (let i = 0; i < 3; i++) {
    const x = 0.8 + i * 0.42;
    scene.add(box(0.38, 1.8, 0.45, m.black, v(x, L + 0.9, zb - 0.05), 0.02));
    for (let j = 0; j < 4; j++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.02, 10), glow(j === 2 && i === 1 ? 0xffa31a : 0x37d36b, 3));
      lamp.position.set(x - 0.1 + j * 0.065, L + 1.6, zb + 0.18);
      scene.add(lamp);
    }
  }

  // Dive bay: the moon pool, suits on the rack, the hatch.
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshStandardMaterial({ color: 0x021a22, emissive: 0x0d6a7d, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.2 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(4.1, L + 0.005, -1.6);
  scene.add(pool);
  scene.add(box(1.96, 0.04, 1.46, m.black, v(4.1, L + 0.01, -1.6), 0.01));
  const poolLight = new THREE.PointLight(0x2fb6cf, 3, 4, 1.5);
  poolLight.position.set(4.1, L + 0.3, -1.6);
  scene.add(poolLight);
  for (const x of [2.6, 3.1, 5.6]) {
    const helmetBall = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshPhysicalMaterial({ color: 0xc9a227, roughness: 0.4, clearcoat: 0.8 }));
    helmetBall.position.set(x, L + 1.85, zb - 0.05);
    scene.add(helmetBall);
    scene.add(box(0.35, 1.2, 0.18, new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.8 }), v(x, L + 1.05, zb - 0.1), 0.04));
  }
}
