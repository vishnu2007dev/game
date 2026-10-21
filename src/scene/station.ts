import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SURFACES, surfaceMaterial, makeSurface } from './textures';
import { projectUV, shadows } from './util';
import { printedText, FONT } from './decals';
import { wallLining, treadPlate, ceilingTile, sectionHatch, hazardStripes, panelMaterial, occlusionFade } from './panels';
import { CrewMember, loadCrewAssets, type Clip, type CrewLook } from './crew';

// Station layout in metres. The camera looks from +Z at a cutaway: the
// near half of the pressure hull is sliced off at z = 0, so both decks
// and all six rooms show at once, the way a ship's section drawing does.
// Rooms are boxes inside the hull; the gaps between them and the hull
// carry the pipes, cables and ballast a real habitat hides there.
const HULL = { x0: -9.7, x1: 9.7, y0: -1.2, y1: 7.6, r: 2.6, wall: 0.3, depth: 4.6 };
const LOWER = { floor: 0, ceil: 3.0 };
const UPPER = { floor: 3.4, ceil: 6.4 };
/** Bulkheads between the middle rooms and the outer ones. */
const WALL_X = 2.7;
/** End bulkheads, where the rooms stop and the hull ends begin. */
const END_X = 8.1;
const BACK = -4.0;
/** Crew walk along this line, near the cut so they read clearly. */
export const LANE_Z = -1.5;
const DOOR = { z0: -2.9, z1: -1.9, h: 2.1 };
const SEABED = -3.0;
/** Moon pool opening in the dive bay floor. */
const POOL = { x0: 3.9, x1: 6.1, z0: -3.2, z1: -1.6 };
/** Ladder trunk between the dive bay and the quarters. */
const TRUNK = { x0: 7.2, x1: 8.0, z0: BACK, z1: -3.2 };

export interface RoomDef {
  id: string;
  name: string;
  deck: 'upper' | 'lower';
  x0: number;
  x1: number;
  light: number;
  /** Paint colour of the wall lining. */
  paint: string;
  /** What the room is for, shown when the player looks inside. */
  blurb: string;
}

export const ROOMS: RoomDef[] = [
  { id: 'command', paint: '#6f7a80', name: 'C1 Command', deck: 'upper', x0: -END_X, x1: -WALL_X, light: 0xcfdbe6, blurb: 'Your post. Every screen and switch on the station.' },
  { id: 'lab', paint: '#7d8a82', name: 'C4 Lab', deck: 'upper', x0: -WALL_X, x1: WALL_X, light: 0xc4ecd6, blurb: 'Core samples from the drill. Hana does not like visitors.' },
  { id: 'quarters', paint: '#857a6c', name: 'C5 Quarters', deck: 'upper', x0: WALL_X, x1: END_X, light: 0xffd2a1, blurb: 'Bunks, lockers, the medical bay.' },
  { id: 'ballast', paint: '#6b6a62', name: 'C2 Ballast', deck: 'lower', x0: -END_X, x1: -WALL_X, light: 0xffc184, blurb: 'Tanks and pumps that keep the station on the seabed.' },
  { id: 'power', paint: '#6a7078', name: 'C3 Power', deck: 'lower', x0: -WALL_X, x1: WALL_X, light: 0xd6e2ff, blurb: 'The generator and every breaker on the station.' },
  { id: 'dive', paint: '#5f7176', name: 'C6 Dive Bay', deck: 'lower', x0: WALL_X, x1: END_X, light: 0xa6e6f0, blurb: 'The moon pool. The only way in or out.' },
];

export interface CrewDef extends CrewLook {
  name: string;
  role: string;
  /** One line in their own voice, shown when the player meets them. */
  line: string;
  home: string;
  /** Places to work in the home room. face is the turn in radians, 0 faces the camera. */
  spots: { x: number; z: number; clip: Clip; face: number }[];
}

const RIGHT = Math.PI / 2;
const LEFT = -Math.PI / 2;
const AWAY = Math.PI;

export const CREW: CrewDef[] = [
  {
    id: 'mara', name: 'Mara Okafor', callsign: 'OKAFOR', role: 'Hydraulics engineer', suit: '#b5531f', helmet: '#c86a2a', skin: '#6b4330', home: 'ballast',
    line: 'Pipes, pumps, valves. If it holds water, it is mine.',
    spots: [
      { x: -3.45, z: -2.2, clip: 'Interact', face: RIGHT },
      { x: -5.6, z: -1.75, clip: 'Idle_Torch_Loop', face: AWAY * 0.8 },
      { x: -6.9, z: -1.6, clip: 'Idle_Loop', face: 0.5 },
    ],
  },
  {
    id: 'rook', name: 'Rook Adeyemi', callsign: 'ADEYEMI', role: 'Electrician', suit: '#2c557f', helmet: '#3a6a99', skin: '#4f3324', home: 'power',
    line: 'Power, doors, lights. You want something switched, you call me.',
    spots: [
      { x: 1.4, z: -2.85, clip: 'Interact', face: AWAY },
      { x: -1.1, z: -2.1, clip: 'Idle_Torch_Loop', face: AWAY * 0.82 },
      { x: 0.3, z: -1.4, clip: 'Idle_Loop', face: 0.2 },
    ],
  },
  {
    id: 'ilya', name: 'Ilya Venn', callsign: 'VENN', role: 'Medic', suit: '#c9c9c2', helmet: '#e2e2db', skin: '#d8b49a', home: 'quarters',
    line: 'I keep you breathing. I am also the only one who can test for anything.',
    spots: [
      { x: 6.75, z: -2.0, clip: 'Interact', face: RIGHT },
      { x: 4.0, z: -2.1, clip: 'Idle_Talking_Loop', face: 0.3 },
      { x: 5.4, z: -1.4, clip: 'Idle_Loop', face: -0.3 },
    ],
  },
  {
    id: 'teo', name: 'Teo Ramires', callsign: 'RAMIRES', role: 'Diver', suit: '#b18f1f', helmet: '#d1a92a', skin: '#b5835e', home: 'dive',
    line: 'Anything outside the hull is my job. I am the one who goes out there.',
    spots: [
      { x: 3.4, z: -1.5, clip: 'Idle_Loop', face: 0.5 },
      { x: 6.55, z: -2.4, clip: 'Interact', face: LEFT },
      { x: 5.0, z: -1.25, clip: 'Crouch_Idle_Loop', face: AWAY * 0.9 },
    ],
  },
  {
    id: 'hana', name: 'Hana Sato', callsign: 'SATO', role: 'Biologist', suit: '#476b3d', helmet: '#5a8550', skin: '#dcb594', home: 'lab',
    line: 'The drill found something in the cores. I would like to finish studying it.',
    spots: [
      { x: 0.3, z: -2.85, clip: 'Interact', face: AWAY },
      { x: -1.1, z: -2.0, clip: 'Idle_Torch_Loop', face: LEFT * 1.2 },
      { x: 1.2, z: -1.5, clip: 'Idle_Talking_Loop', face: 0.3 },
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
  s.absarc(b - rr, c + rr, rr, -Math.PI / 2, 0, false);
  s.lineTo(b, d - rr);
  s.absarc(b - rr, d - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(a + rr, d);
  s.absarc(a + rr, d - rr, rr, Math.PI / 2, Math.PI, false);
  s.lineTo(a, c + rr);
  s.absarc(a + rr, c + rr, rr, Math.PI, Math.PI * 1.5, false);
  return s;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function box(w: number, h: number, d: number, mat: THREE.Material, at: THREE.Vector3, r = 0.02, tile = 1.2) {
  const geo = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2));
  projectUV(geo, at, tile, 'xy');
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(at);
  return shadows(m);
}

/**
 * A structural block that may be cut by the section plane: a face lying
 * on z = 0 shows the hatched cut, the others take the given materials.
 */
function slab(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  faces: { side: THREE.Material; top?: THREE.Material; bottom?: THREE.Material; cut: THREE.Material },
  tile = 2.4,
) {
  const at = v((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  projectUV(geo, at, tile, 'xy');
  const cutsPlane = Math.abs(z1) < 0.01;
  const m = new THREE.Mesh(geo, [faces.side, faces.side, faces.top ?? faces.side, faces.bottom ?? faces.side, cutsPlane ? faces.cut : faces.side, faces.side]);
  m.position.copy(at);
  m.receiveShadow = true;
  return m;
}

/** A flat panel, UV mapped in world metres so neighbouring panels line up. */
function plane(w: number, h: number, mat: THREE.Material, at: THREE.Vector3, facing: 'front' | 'up' | 'left' | 'right', tile: number) {
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, mat);
  if (facing === 'up') m.rotation.x = -Math.PI / 2;
  if (facing === 'left') m.rotation.y = -Math.PI / 2;
  if (facing === 'right') m.rotation.y = Math.PI / 2;
  m.position.copy(at);
  m.updateMatrixWorld(true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
    if (facing === 'front') uv.setXY(i, p.x / tile, p.y / tile);
    else if (facing === 'up') uv.setXY(i, p.x / tile, p.z / tile);
    else uv.setXY(i, p.z / tile, p.y / tile);
  }
  m.receiveShadow = true;
  return m;
}

/**
 * Soft contact shadow along every edge where a room's walls meet its
 * floor and ceiling, and down the back corners. Cheap stand-in for
 * ambient occlusion, and most of what makes a box read as a room.
 */
function occlude(scene: THREE.Scene, r: RoomDef, floor: number, ceil: number) {
  const mat = new THREE.MeshBasicMaterial({ map: occlusionFade(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const w = r.x1 - r.x0;
  const h = ceil - floor;
  const cx = (r.x0 + r.x1) / 2;
  const add = (pw: number, ph: number, at: THREE.Vector3, rot: THREE.Euler) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    m.position.copy(at);
    m.rotation.copy(rot);
    m.renderOrder = 1;
    scene.add(m);
  };
  const E = 0.006;
  // Back wall, at the floor and the ceiling. The texture is dark at v = 1.
  add(w, 0.7, v(cx, floor + 0.35, BACK + E), new THREE.Euler(0, 0, Math.PI));
  add(w, 0.5, v(cx, ceil - 0.25, BACK + E), new THREE.Euler(0, 0, 0));
  // Floor and ceiling along the back wall.
  add(w, 0.8, v(cx, floor + E, BACK + 0.4), new THREE.Euler(-Math.PI / 2, 0, 0));
  add(w, 0.6, v(cx, ceil - E, BACK + 0.3), new THREE.Euler(Math.PI / 2, 0, Math.PI));
  // Floor along each side wall, and the back corners.
  for (const s of [-1, 1]) {
    const edge = s < 0 ? r.x0 : r.x1;
    const x = Math.abs(edge) === END_X ? edge : edge - s * 0.1;
    add(-BACK, 0.6, v(x - s * 0.3, floor + E, BACK / 2), new THREE.Euler(-Math.PI / 2, 0, -s * Math.PI / 2));
    add(h, 0.6, v(x - s * 0.3, floor + h / 2, BACK + E), new THREE.Euler(0, 0, -s * Math.PI / 2));
    add(-BACK, 0.6, v(x - s * E, floor + 0.3, BACK / 2), new THREE.Euler(0, -s * Math.PI / 2, Math.PI));
  }
}

/** A small safety or instruction plate on a wall. */
function sign(lines: string[], at: THREE.Vector3, opts: { bg: string; ink: string; w: number }) {
  const g = new THREE.Group();
  const h = 0.06 + lines.length * 0.07;
  g.add(box(opts.w, h, 0.012, new THREE.MeshStandardMaterial({ color: opts.bg, roughness: 0.6 }), v(0, 0, 0), 0.006));
  lines.forEach((line, i) => {
    const t = printedText(line, { height: 0.05, color: opts.ink, weight: 700, font: FONT.label, letterSpacing: 6 });
    t.position.set(0, h / 2 - 0.065 - i * 0.07, 0.008);
    g.add(t);
  });
  g.position.copy(at);
  return g;
}

const glow = (c: number, i = 2) => new THREE.MeshStandardMaterial({ color: 0x0c0c0c, emissive: c, emissiveIntensity: i });

export function buildStation(screens: THREE.Texture[]): Station {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x01070a);
  scene.fog = new THREE.FogExp2(0x02090c, 0.02);

  const lining = panelMaterial(wallLining('#727c78', 7));
  const liningWorn = panelMaterial(wallLining('#666b67', 19));
  const tread = panelMaterial(treadPlate(), { metalness: 0.55, normalScale: new THREE.Vector2(0.8, 0.8) });
  const ceiling = panelMaterial(ceilingTile());
  const cut = new THREE.MeshStandardMaterial({ map: sectionHatch().map, roughness: 0.9, metalness: 0.2 });
  const hullPaint = surfaceMaterial(SURFACES.hullPaint(), {});
  const enamel = surfaceMaterial(SURFACES.consoleEnamel(), {});
  const black = surfaceMaterial(SURFACES.powderBlack(), {});
  const steel = surfaceMaterial(SURFACES.aluminium(), { metalness: 0.8 });
  const beige = surfaceMaterial(SURFACES.beigePlastic(), {});
  const voidPaint = new THREE.MeshStandardMaterial({ color: 0x1b2024, roughness: 0.8, metalness: 0.3 });
  const outerPaint = surfaceMaterial(
    makeSurface({ color: '#5d5a47', seed: 91, mottle: 0.2, grime: 0.9, grimeColor: '#1d2a22', streaks: 40, streakColor: '#3a2a18', scratches: 40, rough: 0.75, bump: 1.2 }),
    {},
  );

  // Pressure hull: a thick ring cut at z = 0 and running back past the
  // rooms. The cut face is hatched; a light line traces each edge.
  const ring = hullShape(0);
  ring.holes.push(hullShape(HULL.wall));
  const hullGeo = new THREE.ExtrudeGeometry(ring, { depth: HULL.depth, bevelEnabled: false, curveSegments: 24 });
  hullGeo.translate(0, 0, -HULL.depth);
  projectUV(hullGeo, v(0, 0, 0), 2.4, 'xy');
  scene.add(new THREE.Mesh(hullGeo, [cut, voidPaint]));
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8a9196, roughness: 0.5, metalness: 0.5 });
  for (const inset of [0, HULL.wall - 0.03]) {
    const line = hullShape(inset);
    line.holes.push(hullShape(inset + 0.03));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(line, 24), edgeMat);
    m.position.z = 0.003;
    scene.add(m);
  }
  const back = new THREE.Mesh(new THREE.ShapeGeometry(hullShape(HULL.wall), 24), voidPaint);
  back.position.z = -HULL.depth + 0.01;
  scene.add(back);

  // Decks. The cut edge of each floor carries a hazard strip.
  const stripes = hazardStripes();
  const stripe = (x0: number, x1: number, y: number) => {
    const tex = stripes.clone();
    tex.repeat.set((x1 - x0) / 0.5, 1);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 0.07), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    m.position.set((x0 + x1) / 2, y - 0.035, 0.004);
    scene.add(m);
  };
  const deckFaces = { side: cut, top: tread, bottom: cut, cut };
  // Lower deck, with the moon pool opening.
  scene.add(slab(-END_X, POOL.x0, -0.3, 0, BACK, 0, deckFaces, 1.2));
  scene.add(slab(POOL.x1, END_X, -0.3, 0, BACK, 0, deckFaces, 1.2));
  scene.add(slab(POOL.x0, POOL.x1, -0.3, 0, BACK, POOL.z0, deckFaces, 1.2));
  scene.add(slab(POOL.x0, POOL.x1, -0.3, 0, POOL.z1, 0, deckFaces, 1.2));
  stripe(-END_X, END_X, 0);
  // Middle deck: floor above, ceiling below, open for the ladder trunk.
  const midFaces = { side: cut, top: tread, bottom: ceiling, cut };
  scene.add(slab(-END_X, TRUNK.x0, LOWER.ceil, UPPER.floor, BACK, 0, midFaces, 1.2));
  scene.add(slab(TRUNK.x1, END_X, LOWER.ceil, UPPER.floor, BACK, 0, midFaces, 1.2));
  scene.add(slab(TRUNK.x0, TRUNK.x1, LOWER.ceil, UPPER.floor, TRUNK.z1, 0, midFaces, 1.2));
  stripe(-END_X, END_X, UPPER.floor);
  scene.add(slab(-END_X, END_X, UPPER.ceil, UPPER.ceil + 0.3, BACK, 0, { side: cut, bottom: ceiling, cut }, 1.2));
  // Beams under each deck, cut in section.
  for (const y of [LOWER.ceil, UPPER.ceil]) {
    for (let x = -7.2; x <= 7.3; x += 1.8) {
      if (Math.abs(Math.abs(x) - WALL_X) < 0.4) continue;
      scene.add(slab(x - 0.06, x + 0.06, y - 0.18, y, BACK, 0, { side: black, cut }));
    }
  }

  // Back walls, one per room, lined with painted panels.
  const paint = new Map(ROOMS.map((r, i) => [r.id, panelMaterial(wallLining(r.paint, 7 + i * 12))]));
  for (const r of ROOMS) {
    const f = floorOf(r.deck);
    const ceil = r.deck === 'upper' ? UPPER.ceil : LOWER.ceil;
    scene.add(plane(r.x1 - r.x0, ceil - f, paint.get(r.id)!, v((r.x0 + r.x1) / 2, (f + ceil) / 2, BACK), 'front', 2.4));
    occlude(scene, r, f, ceil);
  }
  // Bulkheads: the end walls, and the walls between rooms with a door.
  const roomAt = (x: number, d: typeof LOWER) => ROOMS.find((r) => floorOf(r.deck) === d.floor && x > r.x0 && x < r.x1)!;
  for (const d of [LOWER, UPPER]) {
    const faces = { side: d === LOWER ? liningWorn : lining, cut };
    const tint = (m: THREE.Mesh, x: number) => {
      const mats = m.material as THREE.Material[];
      mats[0] = paint.get(roomAt(x + 0.3, d).id) ?? mats[0];
      mats[1] = paint.get(roomAt(x - 0.3, d)?.id ?? '') ?? mats[1];
      return m;
    };
    scene.add(tint(slab(-END_X - 0.2, -END_X, d.floor, d.ceil, BACK, 0, faces), -END_X));
    scene.add(tint(slab(END_X, END_X + 0.2, d.floor, d.ceil, BACK, 0, faces), END_X - 0.6));
    for (const x of [-WALL_X, WALL_X]) {
      scene.add(tint(slab(x - 0.1, x + 0.1, d.floor, d.ceil, BACK, DOOR.z0, faces), x));
      scene.add(tint(slab(x - 0.1, x + 0.1, d.floor, d.ceil, DOOR.z1, 0, faces), x));
      scene.add(tint(slab(x - 0.1, x + 0.1, d.floor + DOOR.h, d.ceil, DOOR.z0, DOOR.z1, faces), x));
      // Heavy coaming around the doorway.
      for (const z of [DOOR.z0 + 0.04, DOOR.z1 - 0.04]) scene.add(box(0.3, DOOR.h + 0.1, 0.08, black, v(x, d.floor + DOOR.h / 2, z), 0.02));
      scene.add(box(0.3, 0.1, DOOR.z1 - DOOR.z0, black, v(x, d.floor + DOOR.h + 0.03, (DOOR.z0 + DOOR.z1) / 2), 0.02));
      scene.add(box(0.3, 0.12, DOOR.z1 - DOOR.z0, black, v(x, d.floor + 0.06, (DOOR.z0 + DOOR.z1) / 2), 0.02));
    }
  }

  // Lights and labels per room.
  const rooms = ROOMS.map((r) => {
    const f = floorOf(r.deck);
    const ceil = r.deck === 'upper' ? UPPER.ceil : LOWER.ceil;
    const cx = (r.x0 + r.x1) / 2;
    const w = r.x1 - r.x0;
    // Ceiling panel light: an area light so walls get a soft falloff.
    const area = new THREE.RectAreaLight(r.light, 9, w - 1.6, 1.1);
    area.position.set(cx, ceil - 0.02, -2.0);
    area.lookAt(cx, f, -2.0);
    scene.add(area);
    const fill = new THREE.PointLight(r.light, 2.2, 7, 2);
    fill.position.set(cx, f + 1.4, -0.6);
    scene.add(fill);
    for (const z of [-2.55, -1.45]) {
      scene.add(box(w - 1.8, 0.05, 0.32, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: r.light, emissiveIntensity: 2.4 }), v(cx, ceil - 0.03, z), 0.01));
      scene.add(box(w - 1.7, 0.03, 0.4, black, v(cx, ceil - 0.005, z), 0.01));
    }
    // Stencilled room name top left of the back wall, with a colour bar.
    const [code, ...rest] = r.name.split(' ');
    const label = printedText(`${code}  ${rest.join(' ').toUpperCase()}`, { height: 0.24, color: 'rgba(18,20,22,0.82)', weight: 700, letterSpacing: 12, align: 'left', font: FONT.label });
    label.position.set(r.x0 + 0.55, ceil - 0.36, BACK + 0.012);
    scene.add(label);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.26), new THREE.MeshStandardMaterial({ color: new THREE.Color(r.light).multiplyScalar(0.8), emissive: r.light, emissiveIntensity: 0.35 }));
    bar.position.set(r.x0 + 0.42, ceil - 0.36, BACK + 0.012);
    scene.add(bar);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, ceil - f, -BACK), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(cx, f + (ceil - f) / 2, BACK / 2);
    hit.name = `room:${r.id}`;
    scene.add(hit);
    return { ...r, hit, centre: v(cx, f + 1.3, -2.0) };
  });

  const props = furnish(scene, { enamel, black, steel, beige, hullPaint }, screens);
  services(scene, { black, cut });

  // Outside: seabed, legs, ballast tanks, the docking trunk, the umbilical.
  const sand = surfaceMaterial(
    makeSurface({ color: '#34322a', seed: 101, mottle: 0.3, grime: 0.6, grimeColor: '#16150f', scratches: 0, rough: 0.95, bump: 2, peel: 2 }),
    {},
  );
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(120, 70, 120, 70), sand);
  const bp = bed.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const y = bp.getY(i);
    bp.setZ(i, Math.sin(x * 0.31) * 0.3 + Math.cos(y * 0.55 + x * 0.12) * 0.25 + Math.max(0, Math.abs(x) - 18) * 0.12);
  }
  bed.geometry.computeVertexNormals();
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, SEABED, -10);
  bed.receiveShadow = true;
  scene.add(bed);
  const ext = outside(scene, { outerPaint, black, steel });
  for (const x of [-6, 6]) {
    const flood = new THREE.SpotLight(0xa9dbe4, 90, 26, 0.6, 0.65, 1.3);
    flood.position.set(x, HULL.y0 - 0.2, -0.6);
    flood.target.position.set(x * 1.6, SEABED, 4);
    scene.add(flood, flood.target);
    scene.add(box(0.36, 0.22, 0.3, black, v(x, HULL.y0 - 0.15, -0.6), 0.04));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), glow(0xd8f4ff, 4));
    lens.rotation.x = 0.6;
    lens.position.set(x, HULL.y0 - 0.2, -0.44);
    scene.add(lens);
  }
  scene.add(new THREE.HemisphereLight(0x3f6470, 0x060504, 0.4));
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
      agents.push(new Agent(def, member));
    }
  });

  const overviewPose = (aspect: number) => {
    // Fit the whole station; on portrait screens the player drags sideways.
    const fov = 30;
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfW = aspect >= 1 ? 10.6 : 4.2;
    const z = Math.max(halfW / tan / aspect, 6.4 / tan);
    return { pos: v(0, 3.6, z), look: v(0, 3.0, -2), fov };
  };
  const roomPose = (id: string, aspect: number) => {
    const r = rooms.find((q) => q.id === id)!;
    const fov = 36;
    const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const halfW = (r.x1 - r.x0) / 2 + 0.25;
    const f = floorOf(r.deck);
    const dist = Math.min(Math.max(halfW / tan / Math.max(aspect, 0.5), 1.75 / tan), 13);
    return { pos: v(r.centre.x, f + 1.75, dist), look: v(r.centre.x, f + 1.3, -2.0), fov };
  };

  return {
    scene,
    rooms,
    crew,
    ready,
    update(t, dt) {
      snow.update(dt);
      props.update(t);
      ext.update(t);
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
  private heading = 0;
  constructor(
    private def: CrewDef,
    private m: CrewMember,
  ) {
    this.spot = def.spots[0];
    this.heading = this.spot.face;
    this.until = 4 + Math.random() * 6;
  }

  update(t: number, dt: number) {
    const p = this.m.root.position;
    this.turn(dt);
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
    if (d < 0.03) {
      this.target = this.path.shift() ?? null;
      if (!this.target) {
        this.heading = this.spot.face;
        this.m.play(this.spot.clip, 0.4);
        this.until = t + 6 + Math.random() * 8;
      }
      return;
    }
    p.addScaledVector(to.normalize(), Math.min(d, 1.05 * dt));
    this.heading = Math.atan2(to.x, to.z);
  }

  /** Turn smoothly toward the current heading. */
  private turn(dt: number) {
    let diff = this.heading - this.m.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.m.root.rotation.y += diff * Math.min(1, dt * 6);
  }
}

function marineSnow() {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 50, Math.random() * 18 - 3, Math.random() * 34 - 20], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fb9b4, size: 0.04, transparent: true, opacity: 0.5, depthWrite: false }));
  return {
    points,
    update(dt: number) {
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] -= dt * 0.08;
        pos[i * 3] += Math.sin(i + pos[i * 3 + 1]) * dt * 0.02;
        if (pos[i * 3 + 1] < -3) pos[i * 3 + 1] = 15;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Pipe run between two points, with flanges at the ends. */
function pipe(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), mat));
  for (const s of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.6, r * 1.6, 0.04, 20), mat);
    fl.position.y = (s * len) / 2 - s * 0.02;
    g.add(fl);
  }
  g.position.copy(a).add(b).multiplyScalar(0.5);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return shadows(g);
}

/**
 * What fills the gaps between the rooms and the hull: pipes and cable
 * bundles running the length of the station, cut in section at z = 0.
 */
function services(scene: THREE.Scene, m: { black: THREE.Material; cut: THREE.Material }) {
  const painted = [0x6d2a20, 0x2a4c63, 0x6b6a2f, 0x3d4a3c].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.4 }));
  const bore = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const run = (x: number, y: number, r: number, mat: THREE.Material) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, HULL.depth - 0.1, 20, 1, true), mat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, y, -HULL.depth / 2);
    scene.add(p);
    // The cut end: a ring of pipe wall around a dark bore.
    const end = new THREE.Mesh(new THREE.RingGeometry(r * 0.75, r, 24), mat);
    end.position.set(x, y, 0.002);
    scene.add(end);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.75, 24), bore);
    hole.position.set(x, y, 0.001);
    scene.add(hole);
  };
  // Bilge, under the lower deck.
  run(-6.2, -0.62, 0.17, painted[0]);
  run(-4.9, -0.58, 0.12, painted[1]);
  run(-1.5, -0.6, 0.2, painted[2]);
  run(1.0, -0.62, 0.14, painted[0]);
  run(2.2, -0.58, 0.1, painted[3]);
  run(7.0, -0.55, 0.12, painted[1]);
  // Overhead, above the upper deck.
  run(-5.8, 6.98, 0.16, painted[1]);
  run(-3.6, 6.95, 0.12, painted[3]);
  run(-0.6, 7.0, 0.18, painted[2]);
  run(3.4, 6.95, 0.12, painted[0]);
  run(5.6, 6.98, 0.15, painted[1]);
  // Cable trays.
  for (const [x, y] of [
    [-2.2, 6.86],
    [1.4, 6.86],
    [-3.2, -0.5],
    [4.6, -0.5],
  ]) {
    scene.add(slab(x - 0.35, x + 0.35, y - 0.05, y + 0.05, -HULL.depth + 0.05, 0, { side: m.black, cut: m.cut }));
    for (let i = 0; i < 5; i++) run(x - 0.24 + i * 0.12, y + 0.1, 0.045, m.black);
  }
  // Hull ends: stacked pressure bottles.
  for (const s of [-1, 1]) {
    const x = s * 8.85;
    for (let i = 0; i < 4; i++) run(x + (i % 2 ? 0.2 : -0.2) * s, 1.0 + i * 1.3, 0.22, i % 2 ? painted[3] : painted[1]);
    run(x, 5.9, 0.14, painted[0]);
  }
}

/** Props for each room: enough that every room is recognisable at a glance. */
function furnish(
  scene: THREE.Scene,
  m: { enamel: THREE.Material; black: THREE.Material; steel: THREE.Material; beige: THREE.Material; hullPaint: THREE.Material },
  screens: THREE.Texture[],
) {
  const U = UPPER.floor;
  const L = LOWER.floor;
  const zb = BACK;
  const add = (o: THREE.Object3D) => scene.add(shadows(o));
  const red = new THREE.MeshStandardMaterial({ color: 0xa3241a, roughness: 0.5 });
  const safety = new THREE.MeshStandardMaterial({ color: 0xc99a12, roughness: 0.5 });
  const darkGlass = new THREE.MeshPhysicalMaterial({ color: 0x0b1214, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, clearcoat: 1 });

  // Command: the long console with the same live screens as the desk.
  add(box(4.0, 0.82, 0.95, m.enamel, v(-5.4, U + 0.41, zb + 0.55)));
  add(box(4.0, 0.05, 1.0, m.black, v(-5.4, U + 0.845, zb + 0.55), 0.01));
  add(box(4.0, 0.95, 0.3, m.enamel, v(-5.4, U + 1.32, zb + 0.18)));
  screens.forEach((tex, i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.66), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1 }));
    s.position.set(-6.6 + i * 1.2, U + 1.33, zb + 0.335);
    scene.add(s);
    add(box(1.13, 0.74, 0.03, m.black, v(-6.6 + i * 1.2, U + 1.33, zb + 0.32), 0.01));
  });
  for (let i = 0; i < 10; i++) {
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.018, 10), glow(i === 3 ? 0xff3b2a : 0x46d07a, 3));
    lamp.rotation.x = -Math.PI / 2;
    lamp.position.set(-6.9 + i * 0.32, U + 0.872, zb + 0.85);
    scene.add(lamp);
  }
  // Two chairs pulled up to the console.
  for (const x of [-6.2, -4.4]) {
    const chair = new THREE.Group();
    chair.add(box(0.5, 0.08, 0.5, m.black, v(0, 0.48, 0), 0.03));
    chair.add(box(0.5, 0.55, 0.08, m.black, v(0, 0.8, 0.24), 0.03));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 10), m.steel);
    post.position.y = 0.24;
    chair.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.04, 5), m.black);
    base.position.y = 0.03;
    chair.add(base);
    chair.position.set(x, U, zb + 1.55);
    chair.rotation.y = x < -5 ? 0.2 : -0.15;
    add(chair);
  }
  // Comms rack on the end wall and a clock above the console.
  add(box(0.6, 2.0, 0.55, m.black, v(-7.75, U + 1.0, -2.3)));
  for (let i = 0; i < 6; i++) add(box(0.5, 0.2, 0.02, m.enamel, v(-7.75, U + 0.4 + i * 0.28, -2.02), 0.01));
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 32), m.black);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(-3.3, U + 2.25, zb + 0.03);
  add(clock);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.6 }));
  face.position.set(-3.3, U + 2.25, zb + 0.055);
  scene.add(face);

  // Lab: specimen tank, bench with sample columns, glovebox, shelves.
  const tankAt = v(-1.85, U, zb + 0.75);
  const tankGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1.8, 40, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xbfe8dc, roughness: 0.04, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
  );
  tankGlass.position.set(tankAt.x, U + 1.15, tankAt.z);
  scene.add(tankGlass);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1.55, 40), new THREE.MeshStandardMaterial({ color: 0x0a2a22, emissive: 0x1d8a62, emissiveIntensity: 0.55, transparent: true, opacity: 0.75, roughness: 0.2 }));
  water.position.set(tankAt.x, U + 1.05, tankAt.z);
  scene.add(water);
  // The thing from the drill: a dark, knotted mass suspended in the tank.
  const thing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 3), new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 0.35, emissive: 0x0f3d2a, emissiveIntensity: 0.6 }));
  {
    const p = thing.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k = 1 + 0.35 * Math.sin(x * 19 + y * 7) * Math.cos(z * 13 - y * 5);
      p.setXYZ(i, x * k, y * k * 1.3, z * k);
    }
    thing.geometry.computeVertexNormals();
  }
  thing.position.set(tankAt.x, U + 1.05, tankAt.z);
  scene.add(thing);
  for (const y of [0.2, 2.08]) add(box(1.15, 0.12, 1.15, m.black, v(tankAt.x, U + y, tankAt.z), 0.04));
  const tankLight = new THREE.PointLight(0x46e0a0, 1.6, 3.2, 2);
  tankLight.position.set(tankAt.x, U + 1.2, tankAt.z + 0.65);
  scene.add(tankLight);
  add(box(2.6, 0.9, 0.75, m.enamel, v(0.25, U + 0.45, zb + 0.42)));
  add(box(2.65, 0.04, 0.8, m.black, v(0.25, U + 0.92, zb + 0.42), 0.01));
  [-0.7, -0.35, 0.0, 0.35].forEach((x, i) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.6, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    col.position.set(x, U + 1.24, zb + 0.3);
    scene.add(col);
    const h = 0.3 + i * 0.06;
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, h, 16), glow(0x4fd28c, 1.0));
    liquid.position.set(x, U + 0.94 + h / 2, zb + 0.3);
    scene.add(liquid);
  });
  // Microscope.
  const scope = new THREE.Group();
  scope.add(box(0.22, 0.04, 0.26, m.black, v(0, 0.02, 0), 0.01));
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.36, 12), m.beige);
  arm.position.set(0, 0.2, -0.08);
  scope.add(arm);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 12), m.black);
  tube.position.set(0, 0.34, 0);
  tube.rotation.x = 0.4;
  scope.add(tube);
  scope.position.set(0.95, U + 0.94, zb + 0.5);
  add(scope);
  // Glovebox.
  add(box(1.0, 0.95, 0.8, m.enamel, v(2.05, U + 0.475, zb + 0.45)));
  add(box(1.0, 0.85, 0.8, m.enamel, v(2.05, U + 1.43, zb + 0.45)));
  const gbGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.65), darkGlass);
  gbGlass.position.set(2.05, U + 1.43, zb + 0.855);
  scene.add(gbGlass);
  for (const x of [1.85, 2.25]) {
    const port = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 20), m.black);
    port.position.set(x, U + 1.3, zb + 0.86);
    scene.add(port);
  }
  // Shelf of jars above the bench.
  add(box(2.4, 0.04, 0.3, m.steel, v(0.25, U + 1.95, zb + 0.15), 0.01));
  const jarGlass = new THREE.MeshStandardMaterial({ color: 0x8c9a6e, roughness: 0.3, transparent: true, opacity: 0.8 });
  for (let i = 0; i < 9; i++) {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), i % 3 ? jarGlass : m.beige);
    jar.position.set(-0.8 + i * 0.25, U + 2.05, zb + 0.15);
    scene.add(jar);
  }

  // Quarters: a bunk stack, lockers, a medical bed and cabinet.
  const bunk = new THREE.Group();
  for (const y of [0.45, 1.5]) {
    bunk.add(box(2.0, 0.08, 0.85, m.steel, v(0, y, 0), 0.01));
    bunk.add(box(1.9, 0.14, 0.78, new THREE.MeshStandardMaterial({ color: y < 1 ? 0x3d4a52 : 0x4a3f36, roughness: 0.95 }), v(0, y + 0.11, 0), 0.05));
    bunk.add(box(0.5, 0.1, 0.6, new THREE.MeshStandardMaterial({ color: 0xbab6aa, roughness: 0.9 }), v(-0.7, y + 0.23, 0), 0.04));
    bunk.add(box(2.0, 0.2, 0.04, m.steel, v(0, y + 0.15, 0.42), 0.01));
  }
  for (const x of [-1, 1]) bunk.add(box(0.06, 2.0, 0.06, m.steel, v(x, 1.0, 0.4), 0.01));
  bunk.position.set(4.0, U, zb + 0.45);
  add(bunk);
  for (let i = 0; i < 3; i++) {
    const x = 5.45 + i * 0.47;
    add(box(0.45, 2.0, 0.55, i === 1 ? m.beige : m.enamel, v(x, U + 1.0, zb + 0.29), 0.02));
    for (let j = 0; j < 3; j++) add(box(0.25, 0.015, 0.01, m.black, v(x, U + 1.75 - j * 0.03, zb + 0.57), 0.003));
    add(box(0.03, 0.12, 0.02, m.steel, v(x + 0.15, U + 1.1, zb + 0.575), 0.005));
  }
  const bed = new THREE.Group();
  bed.add(box(0.8, 0.12, 1.9, m.steel, v(0, 0.7, 0), 0.02));
  bed.add(box(0.75, 0.1, 1.85, new THREE.MeshStandardMaterial({ color: 0xd8dcd6, roughness: 0.8 }), v(0, 0.81, 0), 0.04));
  for (const z of [-0.85, 0.85]) bed.add(box(0.7, 0.64, 0.05, m.steel, v(0, 0.32, z), 0.01));
  bed.position.set(7.6, U, -2.0);
  add(bed);
  add(box(0.7, 0.65, 0.3, new THREE.MeshStandardMaterial({ color: 0xe4e2db, roughness: 0.5 }), v(7.0, U + 1.6, zb + 0.15)));
  const cross = new THREE.Group();
  cross.add(new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.08), red), new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.26), red));
  cross.position.set(7.0, U + 1.6, zb + 0.305);
  scene.add(cross);
  const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.9, 8), m.steel);
  ivPole.position.set(7.15, U + 0.95, -1.15);
  add(ivPole);
  const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 10), new THREE.MeshPhysicalMaterial({ color: 0xd9eef0, transparent: true, opacity: 0.6, roughness: 0.2 }));
  bag.position.set(7.15, U + 1.75, -1.15);
  scene.add(bag);

  // Ballast: the trim tank on saddles, pumps, overhead pipework and the
  // isolation valve on the bulkhead that Mara will need.
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 2.6, 10, 36), m.hullPaint);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(-5.95, L + 1.1, zb + 0.95);
  add(tank);
  for (const x of [-6.95, -4.95]) add(box(0.3, 0.5, 1.1, m.black, v(x, L + 0.25, zb + 0.95), 0.02));
  for (const x of [-6.25, -5.35]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.765, 0.03, 8, 40), m.black);
    band.rotation.y = Math.PI / 2;
    band.position.set(x, L + 1.1, zb + 0.95);
    add(band);
  }
  const sight = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.9), new THREE.MeshStandardMaterial({ color: 0x163a44, emissive: 0x1b6e80, emissiveIntensity: 0.6 }));
  sight.position.set(-4.65, L + 1.1, zb + 1.72);
  scene.add(sight);
  for (const x of [-3.9, -3.25]) {
    add(box(0.5, 0.18, 0.8, m.black, v(x, L + 0.09, zb + 0.5), 0.02));
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x2f5c7a, roughness: 0.5, metalness: 0.3 }));
    motor.rotation.x = Math.PI / 2;
    motor.position.set(x, L + 0.42, zb + 0.4);
    add(motor);
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.2, 24), m.black);
    casing.rotation.x = Math.PI / 2;
    casing.position.set(x, L + 0.42, zb + 0.75);
    add(casing);
    add(pipe(v(x, L + 0.6, zb + 0.75), v(x, LOWER.ceil - 0.62, zb + 0.75), 0.06, m.steel));
  }
  add(pipe(v(-6.8, LOWER.ceil - 0.62, zb + 0.75), v(-3.0, LOWER.ceil - 0.62, zb + 0.75), 0.08, m.steel));
  add(pipe(v(-5.95, L + 1.85, zb + 0.95), v(-5.95, LOWER.ceil - 0.62, zb + 0.95), 0.07, m.steel));
  add(box(0.7, 0.5, 0.05, m.enamel, v(-3.55, L + 1.65, zb + 0.03)));
  for (const x of [-3.72, -3.38]) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshStandardMaterial({ color: 0xe9e5d8, roughness: 0.5 }));
    g.position.set(x, L + 1.66, zb + 0.06);
    scene.add(g);
    const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.09), red);
    needle.geometry.translate(0, 0.04, 0);
    needle.position.set(x, L + 1.66, zb + 0.062);
    needle.rotation.z = x < -3.5 ? -0.6 : 0.9;
    scene.add(needle);
  }
  // Valve on the bulkhead, facing into the room.
  const wheel = new THREE.Group();
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.028, 10, 36), red));
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.52, 8), m.steel);
    spoke.rotation.z = (i * Math.PI) / 3;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), m.steel);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  wheel.rotation.y = -Math.PI / 2;
  wheel.position.set(-WALL_X - 0.28, L + 1.25, -2.2);
  add(wheel);
  add(pipe(v(-WALL_X - 0.1, L + 1.25, -2.2), v(-WALL_X - 0.24, L + 1.25, -2.2), 0.09, m.steel));

  // Power: generator on its skid, the switchboard.
  add(box(2.3, 0.22, 1.2, m.black, v(-1.25, L + 0.11, zb + 0.75), 0.02));
  add(box(1.3, 0.95, 0.95, new THREE.MeshStandardMaterial({ color: 0x5c6a43, roughness: 0.55, metalness: 0.3 }), v(-1.65, L + 0.7, zb + 0.75), 0.05));
  const alt = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.9, 32), m.steel);
  alt.rotation.z = Math.PI / 2;
  alt.position.set(-0.55, L + 0.66, zb + 0.75);
  add(alt);
  for (let i = 0; i < 6; i++) {
    const fin = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.012, 6, 32), m.black);
    fin.rotation.y = Math.PI / 2;
    fin.position.set(-0.9 + i * 0.14, L + 0.66, zb + 0.75);
    scene.add(fin);
  }
  add(pipe(v(-1.95, L + 1.2, zb + 0.75), v(-1.95, LOWER.ceil - 0.2, zb + 0.75), 0.09, m.steel));
  for (let i = 0; i < 4; i++) {
    const x = 0.55 + i * 0.5;
    add(box(0.48, 2.1, 0.5, i === 3 ? m.enamel : m.black, v(x, L + 1.05, zb + 0.27), 0.02));
    for (let j = 0; j < 4; j++) {
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), glow(j === 2 && i === 1 ? 0xffa31a : 0x37d36b, 3));
      lamp.position.set(x - 0.15 + j * 0.1, L + 1.75, zb + 0.525);
      scene.add(lamp);
    }
    const meter = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.5 }));
    meter.position.set(x, L + 1.45, zb + 0.525);
    scene.add(meter);
    add(box(0.06, 0.18, 0.05, red, v(x + 0.12, L + 1.1, zb + 0.54), 0.01));
  }

  // Dive bay: the moon pool, air bottles, helmets, the ladder up.
  const wellH = 1.2;
  const wellMat = new THREE.MeshStandardMaterial({ color: 0x2b3a3c, roughness: 0.6, metalness: 0.4 });
  const pcx = (POOL.x0 + POOL.x1) / 2;
  const pcz = (POOL.z0 + POOL.z1) / 2;
  scene.add(plane(POOL.x1 - POOL.x0, wellH, wellMat, v(pcx, -wellH / 2, POOL.z0), 'front', 1));
  scene.add(plane(POOL.z1 - POOL.z0, wellH, wellMat, v(POOL.x0, -wellH / 2, pcz), 'right', 1));
  scene.add(plane(POOL.z1 - POOL.z0, wellH, wellMat, v(POOL.x1, -wellH / 2, pcz), 'left', 1));
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x03262e, emissive: 0x0f7c8f, emissiveIntensity: 0.9, roughness: 0.06, metalness: 0.1, clearcoat: 1, transparent: true, opacity: 0.92 });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0, 24, 18), waterMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set(pcx, -0.45, pcz);
  scene.add(surface);
  const poolLight = new THREE.PointLight(0x37c4dc, 4, 4.5, 1.6);
  poolLight.position.set(pcx, 0.15, pcz);
  scene.add(poolLight);
  for (const x of [POOL.x0, pcx, POOL.x1]) add(box(0.05, 1.0, 0.05, safety, v(x, 0.5, POOL.z0 - 0.08), 0.01));
  add(box(POOL.x1 - POOL.x0, 0.05, 0.05, safety, v(pcx, 1.0, POOL.z0 - 0.08), 0.01));
  for (const x of [POOL.x1 - 0.55, POOL.x1 - 0.15]) add(box(0.04, 1.6, 0.04, m.steel, v(x, -0.2, POOL.z0 + 0.06), 0.01));
  for (let i = 0; i < 5; i++) add(box(0.4, 0.03, 0.03, m.steel, v(POOL.x1 - 0.35, -0.9 + i * 0.3, POOL.z0 + 0.06), 0.01));
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 1.0, 8, 18), i === 2 ? new THREE.MeshStandardMaterial({ color: 0xd6d3c6, roughness: 0.4 }) : m.steel);
    b.position.set(3.1 + i * 0.27, L + 0.66, zb + 0.22);
    add(b);
  }
  add(box(1.45, 0.06, 0.08, m.black, v(3.64, L + 0.9, zb + 0.36), 0.01));
  add(box(1.6, 0.04, 0.35, m.steel, v(3.65, L + 1.75, zb + 0.18), 0.01));
  const helmetPaint = new THREE.MeshPhysicalMaterial({ color: 0xc9a227, roughness: 0.4, clearcoat: 0.8 });
  const visorDark = new THREE.MeshStandardMaterial({ color: 0x0c1012, roughness: 0.1, metalness: 0.5 });
  for (const x of [3.15, 3.65, 4.15]) {
    const hm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), helmetPaint);
    hm.position.set(x, L + 1.94, zb + 0.2);
    add(hm);
    const vz = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), visorDark);
    vz.position.set(x, L + 1.94, zb + 0.37);
    scene.add(vz);
  }
  add(box(0.85, 0.9, 0.7, new THREE.MeshStandardMaterial({ color: 0x8a2d22, roughness: 0.55, metalness: 0.3 }), v(6.75, L + 0.45, zb + 0.4), 0.04));
  add(box(0.45, 0.6, 0.2, m.enamel, v(6.75, L + 1.45, zb + 0.1), 0.02));
  const ladderX = (TRUNK.x0 + TRUNK.x1) / 2;
  for (const dx of [-0.22, 0.22]) add(box(0.05, UPPER.floor + 1.0, 0.05, m.steel, v(ladderX + dx, (UPPER.floor + 1.0) / 2, TRUNK.z0 + 0.25), 0.01));
  for (let y = 0.3; y < UPPER.floor + 0.9; y += 0.3) add(box(0.44, 0.03, 0.03, m.steel, v(ladderX, y, TRUNK.z0 + 0.25), 0.01));
  add(box(TRUNK.x1 - TRUNK.x0 + 0.1, 0.1, 0.08, safety, v(ladderX, U + 0.05, TRUNK.z1), 0.01));

  // Signage.
  const yellowSign = { bg: '#d2a419', ink: '#141414' };
  const whiteSign = { bg: '#e2ded2', ink: '#1a1a1a' };
  scene.add(sign(['ALL CALLS', 'ARE LOGGED'], v(-7.25, U + 2.2, zb + 0.02), { ...whiteSign, w: 0.5 }));
  scene.add(sign(['BIOHAZARD', 'AUTHORISED ONLY'], v(2.05, U + 2.15, zb + 0.02), { ...yellowSign, w: 0.7 }));
  scene.add(sign(['LIGHTS OUT 2200'], v(4.0, U + 2.4, zb + 0.02), { ...whiteSign, w: 0.7 }));
  scene.add(sign(['DANGER', '440 V'], v(1.3, L + 2.3, zb + 0.02), { ...yellowSign, w: 0.42 }));
  scene.add(sign(['TRIM TANK 2', 'MAX 6 BAR'], v(-7.3, L + 2.0, zb + 0.02), { ...whiteSign, w: 0.6 }));
  scene.add(sign(['NEVER DIVE', 'ALONE'], v(6.75, L + 2.15, zb + 0.02), { ...yellowSign, w: 0.55 }));

  return {
    update(t: number) {
      // A slow swell in the moon pool, and the thing turning in its tank.
      const p = surface.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3 + t * 1.1) * 0.015 + Math.cos(p.getY(i) * 4 - t * 0.8) * 0.012);
      p.needsUpdate = true;
      thing.rotation.y = t * 0.05;
      thing.position.y = U + 1.05 + Math.sin(t * 0.4) * 0.03;
    },
  };
}

/** The station's outside: legs, external tanks, docking trunk, mast, umbilical and the drill. */
function outside(scene: THREE.Scene, m: { outerPaint: THREE.Material; black: THREE.Material; steel: THREE.Material }) {
  const add = (o: THREE.Object3D) => scene.add(shadows(o));
  const yellow = new THREE.MeshStandardMaterial({ color: 0x8a6a1c, roughness: 0.7, metalness: 0.3 });
  // Legs: braced pairs on mud mats.
  for (const x of [-7.4, -2.6, 2.6, 7.4]) {
    for (const z of [-0.9, -3.7]) {
      add(box(0.3, -SEABED + HULL.y0 + 0.6, 0.3, m.outerPaint, v(x, (SEABED + HULL.y0 + 0.6) / 2, z), 0.04));
      add(box(1.0, 0.1, 1.0, m.outerPaint, v(x, SEABED + 0.05, z), 0.03));
    }
    add(pipe(v(x, SEABED + 0.3, -0.9), v(x, HULL.y0 + 0.2, -3.7), 0.05, m.outerPaint));
    add(pipe(v(x, SEABED + 0.3, -3.7), v(x, HULL.y0 + 0.2, -0.9), 0.05, m.outerPaint));
  }
  // External ballast tanks slung under the hull.
  for (const z of [-1.5, -3.1]) {
    const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 9.0, 10, 28), yellow);
    t.rotation.z = Math.PI / 2;
    t.position.set(0, HULL.y0 - 0.45, z);
    add(t);
  }
  // Docking trunk and hatch on top, with the mast and its beacon.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.0, 36), m.outerPaint);
  trunk.position.set(-1.0, HULL.y1 + 0.4, -2.3);
  add(trunk);
  const hatchRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 10, 36), m.black);
  hatchRing.rotation.x = Math.PI / 2;
  hatchRing.position.set(-1.0, HULL.y1 + 0.92, -2.3);
  add(hatchRing);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 12), m.steel);
  mast.position.set(4.5, HULL.y1 + 1.1, -2.0);
  add(mast);
  const beaconMat = glow(0xff3020, 5);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), beaconMat);
  beacon.position.set(4.5, HULL.y1 + 2.35, -2.0);
  scene.add(beacon);
  // Umbilical to the surface, three kilometres up.
  const cable = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([v(-1.0, HULL.y1 + 0.95, -2.3), v(-1.3, HULL.y1 + 3, -2.6), v(-3.5, HULL.y1 + 7, -4), v(-8, 30, -8)]), 60, 0.11, 10),
    m.black,
  );
  scene.add(cable);
  // The drill: a lattice derrick out on the seabed, its work light on.
  const derrick = new THREE.Group();
  const H = 11;
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    derrick.add(pipe(v(x * 1.3, 0, z * 1.3), v(x * 0.35, H, z * 0.35), 0.07, yellow));
  for (let y = 1.2; y < H; y += 1.6) {
    const k = 1.3 - (0.95 * y) / H;
    for (const [a, b] of [
      [v(-k, y, -k), v(k, y, -k)],
      [v(-k, y, k), v(k, y, k)],
      [v(-k, y, -k), v(-k, y, k)],
      [v(k, y, -k), v(k, y, k)],
    ])
      derrick.add(pipe(a, b, 0.035, yellow));
  }
  derrick.position.set(17, SEABED, -9);
  add(derrick);
  const work = new THREE.SpotLight(0xffe6b0, 70, 24, 0.5, 0.6, 1.4);
  work.position.set(17, SEABED + H - 0.5, -8);
  work.target.position.set(16, SEABED, -7);
  scene.add(work, work.target);
  const workLens = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), glow(0xffe6b0, 6));
  workLens.position.copy(work.position);
  scene.add(workLens);
  scene.add(pipe(v(8.6, SEABED + 0.2, -2.5), v(17, SEABED + 0.2, -8.2), 0.16, m.black));
  // Boulders on the seabed.
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x24231f, roughness: 0.95 });
  let s = 7;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const r = 0.2 + rand() * 0.9;
    const b = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), rockMat);
    b.scale.set(1, 0.55 + rand() * 0.3, 1.1);
    let x = (rand() - 0.5) * 50;
    if (Math.abs(x) < 11) x += Math.sign(x || 1) * 11;
    b.position.set(x, SEABED + r * 0.2, -rand() * 22 + 2);
    b.rotation.y = rand() * 6;
    add(b);
  }
  return {
    update(t: number) {
      // The mast beacon flashes once every two seconds.
      beaconMat.emissiveIntensity = t % 2 < 0.15 ? 8 : 0.3;
    },
  };
}
