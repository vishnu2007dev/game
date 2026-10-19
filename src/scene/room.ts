import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SURFACES, surfaceMaterial, makeSurface } from './textures';
import { projectUV, fasteners, shadows } from './util';
import { buildPorthole, type Porthole } from './porthole';
import { dymoLabel, printedText, FONT } from './decals';

export interface Room {
  group: THREE.Group;
  porthole: Porthole;
  materials: Record<string, THREE.Material>;
}

const WALL_Z = -1.05;

/**
 * The control room shell: hull plating, ring frames, overhead pipework,
 * the viewport and stencilled markings. Everything is in metres.
 */
export function buildRoom(): Room {
  const group = new THREE.Group();
  const hull = SURFACES.hullPaint();
  const hullMat = surfaceMaterial(hull, { color: 0xffffff });
  const frameMat = surfaceMaterial(hull, { color: 0xc8ccd0 });
  const steelMat = surfaceMaterial(SURFACES.powderBlack(), { metalness: 0.55, color: 0x9a9da0 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0x5b5f62, roughness: 0.45, metalness: 0.8 });
  const deck = surfaceMaterial(SURFACES.deckPlate(), { metalness: 0.4 });

  // Back wall: welded plates with visible seams and a dark void behind.
  const backing = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 1 }));
  backing.position.set(0, 1.2, WALL_Z - 0.02);
  group.add(backing);
  const colW = 0.6;
  const rows: [number, number][] = [
    [0, 0.92],
    [0.92, 1.96],
    [1.96, 2.45],
  ];
  for (let c = -4; c < 4; c++) {
    for (const [y0, y1] of rows) {
      const w = colW - 0.008;
      const h = y1 - y0 - 0.008;
      const geo = new RoundedBoxGeometry(w, h, 0.02, 2, 0.004);
      const cx = c * colW + colW / 2;
      const cy = (y0 + y1) / 2;
      projectUV(geo, new THREE.Vector3(cx, cy, 0), 1.3, 'xy');
      const panel = new THREE.Mesh(geo, hullMat);
      panel.position.set(cx, cy, WALL_Z);
      group.add(shadows(panel));
    }
  }

  // Ring frames: the curved ribs every submersible structure is built on.
  const frameXs = [-1.5, 1.5];
  const rivets: THREE.Vector3[] = [];
  for (const fx of frameXs) {
    const web = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 0.12), frameMat);
    web.position.set(fx, 1.2, WALL_Z + 0.06);
    group.add(shadows(web));
    const flange = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.5, 0.012), frameMat);
    flange.position.set(fx, 1.2, WALL_Z + 0.126);
    group.add(shadows(flange));
    for (let y = 0.1; y < 2.4; y += 0.075) {
      rivets.push(new THREE.Vector3(fx - 0.05, y, WALL_Z + 0.134), new THREE.Vector3(fx + 0.05, y, WALL_Z + 0.134));
    }
  }
  // Horizontal stringer under the deckhead.
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 0.1), frameMat);
  stringer.position.set(0, 2.02, WALL_Z + 0.05);
  group.add(shadows(stringer));
  for (let x = -2; x <= 2; x += 0.075) rivets.push(new THREE.Vector3(x, 2.0, WALL_Z + 0.104));
  // Seam rivets along the panel joints.
  for (let c = -4; c <= 4; c++) {
    for (let y = 0.95; y < 1.95; y += 0.09) rivets.push(new THREE.Vector3(c * colW, y, WALL_Z + 0.012));
  }
  for (let x = -2.4; x < 2.4; x += 0.09) {
    rivets.push(new THREE.Vector3(x, 0.92, WALL_Z + 0.012), new THREE.Vector3(x, 1.96, WALL_Z + 0.012));
  }
  const rivetGeo = new THREE.SphereGeometry(0.006, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  rivetGeo.rotateX(Math.PI / 2);
  const rivetMesh = new THREE.InstancedMesh(rivetGeo, hullMat, rivets.length);
  const m = new THREE.Matrix4();
  rivets.forEach((p, i) => rivetMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(shadows(rivetMesh));

  // Side walls, angled in like the curve of a pressure hull.
  for (const side of [-1, 1]) {
    const geo = new RoundedBoxGeometry(2.0, 2.5, 0.02, 2, 0.004);
    const wall = new THREE.Mesh(geo, hullMat);
    wall.position.set(side * 1.75, 1.2, -0.25);
    wall.rotation.y = side * -Math.PI * 0.42;
    group.add(shadows(wall));
  }

  // Deck and deckhead.
  const floor = new THREE.Mesh(projectUV(new THREE.PlaneGeometry(5, 3), new THREE.Vector3(), 1.6, 'xy'), deck);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -0.2);
  group.add(shadows(floor, false, true));
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), surfaceMaterial(hull, { color: 0x6c7176 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 2.42, -0.2);
  group.add(shadows(ceiling, false, true));

  // Overhead pipework with flanges and identification bands.
  const pipeMat = surfaceMaterial(
    makeSurface({ color: '#5e6a63', seed: 81, mottle: 0.08, grime: 0.5, streaks: 10, scratches: 30, rough: 0.5, bump: 0.8 }),
    { metalness: 0.2 },
  );
  const pipes: { y: number; z: number; r: number; band: string; text: string }[] = [
    { y: 2.24, z: WALL_Z + 0.16, r: 0.055, band: '#3c7a43', text: 'SEAWATER COOLING' },
    { y: 2.12, z: WALL_Z + 0.32, r: 0.038, band: '#9aa3ab', text: 'LP AIR' },
    { y: 2.3, z: WALL_Z + 0.46, r: 0.03, band: '#b38a2a', text: 'BALLAST VENT' },
  ];
  for (const p of pipes) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 4.4, 32), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, p.y, p.z);
    group.add(shadows(pipe));
    for (let x = -1.8; x <= 1.8; x += 1.2) {
      const fl = new THREE.Mesh(new THREE.CylinderGeometry(p.r * 1.55, p.r * 1.55, 0.03, 32), pipeMat);
      fl.rotation.z = Math.PI / 2;
      fl.position.set(x, p.y, p.z);
      group.add(shadows(fl));
      // Hanger strap up to the deckhead.
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2.42 - p.y, 0.03), steelMat);
      hanger.position.set(x + 0.2, p.y + (2.42 - p.y) / 2, p.z);
      group.add(shadows(hanger));
    }
    // Colour band and the flow legend painted beside it.
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r * 1.004, p.r * 1.004, 0.09, 32),
      new THREE.MeshStandardMaterial({ color: p.band, roughness: 0.6 }),
    );
    band.rotation.z = Math.PI / 2;
    band.position.set(-0.55, p.y, p.z);
    group.add(band);
    const legend = printedText(`${p.text}  >>`, { height: Math.min(0.03, p.r * 0.6), color: '#e2ded2', align: 'left' });
    legend.position.set(-0.45, p.y, p.z + p.r + 0.002);
    group.add(legend);
  }

  // Cable tray running across the room above the console.
  const tray = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.012, 0.22), steelMat);
  tray.position.set(0, 2.05, -0.5);
  group.add(shadows(tray));
  const cableColours = [0x1b1c1d, 0x2a2b2c, 0x3b3426, 0x1d2731, 0x262626];
  for (let i = 0; i < 9; i++) {
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.009 + (i % 3) * 0.003, 0.009 + (i % 3) * 0.003, 4.4, 10),
      new THREE.MeshStandardMaterial({ color: cableColours[i % cableColours.length], roughness: 0.7 }),
    );
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0, 2.066 + (i % 2) * 0.012, -0.59 + i * 0.022);
    group.add(shadows(cable));
  }

  // Viewport on the back wall, upper left.
  const porthole = buildPorthole(surfaceMaterial(SURFACES.powderBlack(), { metalness: 0.6, color: 0x7d8185 }), boltMat);
  porthole.group.position.set(-0.3, 1.72, WALL_Z + 0.012);
  group.add(porthole.group);
  // Hole in the plating behind the viewport so the view is not hidden.
  // The panel there is rebuilt as a frame around the opening.
  hideBehindPorthole(group, porthole.group.position);
  const rating = printedText('VIEWPORT  RATED 3500 M  DO NOT STRIKE', { height: 0.014, color: '#d8d4c8', font: FONT.mono, weight: 500 });
  rating.position.set(-0.3, 1.465, WALL_Z + 0.012);
  group.add(rating);

  // Stencilled compartment marking, faded and over-painted at the edges.
  const stencil = printedText('C1  COMMAND', { height: 0.075, color: 'rgba(220,214,196,0.42)', weight: 700, letterSpacing: 12 });
  stencil.position.set(1.05, 1.66, WALL_Z + 0.012);
  group.add(stencil);
  const frameNo = printedText('FR 14', { height: 0.045, color: 'rgba(230,224,206,0.7)', weight: 700 });
  frameNo.position.set(1.5, 1.82, WALL_Z + 0.134);
  group.add(frameNo);

  // Safety placard beside the viewport.
  const placard = dymoLabel('EMERGENCY AIR  EAB  UNDER CONSOLE', { tape: '#7a1414', seed: 4, height: 0.02 });
  placard.position.set(1.08, 1.52, WALL_Z + 0.012);
  group.add(placard);

  // Fasteners for the frames.
  group.add(
    fasteners(
      frameXs.flatMap((fx) => [0.25, 0.85, 1.45, 2.05].map((y) => new THREE.Vector3(fx, y, WALL_Z + 0.133))),
      { radius: 0.01, material: boltMat },
    ),
  );

  return {
    group,
    porthole,
    materials: { hull: hullMat, frame: frameMat, steel: steelMat, bolt: boltMat, pipe: pipeMat },
  };
}

/** Cut the wall panel behind the viewport into four strips around it. */
function hideBehindPorthole(group: THREE.Group, at: THREE.Vector3) {
  // Square opening inscribed in the viewport so the flange covers it.
  const hole = 0.19;
  for (const child of [...group.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !(mesh.geometry instanceof RoundedBoxGeometry)) continue;
    const p = mesh.position;
    if (Math.abs(p.z - WALL_Z) > 0.001) continue;
    const params = (mesh.geometry as RoundedBoxGeometry & { parameters: { width: number; height: number } }).parameters;
    const halfW = params.width / 2;
    const halfH = params.height / 2;
    if (at.x < p.x - halfW || at.x > p.x + halfW || at.y < p.y - halfH || at.y > p.y + halfH) continue;
    group.remove(mesh);
    const x0 = p.x - halfW;
    const x1 = p.x + halfW;
    const y0 = p.y - halfH;
    const y1 = p.y + halfH;
    const strips: [number, number, number, number][] = [
      [x0, at.x - hole, y0, y1],
      [at.x + hole, x1, y0, y1],
      [at.x - hole, at.x + hole, y0, at.y - hole],
      [at.x - hole, at.x + hole, at.y + hole, y1],
    ];
    for (const [a, b, c, d] of strips) {
      if (b - a < 0.01 || d - c < 0.01) continue;
      const geo = new THREE.BoxGeometry(b - a, d - c, 0.02);
      projectUV(geo, new THREE.Vector3((a + b) / 2, (c + d) / 2, 0), 1.3, 'xy');
      const strip = new THREE.Mesh(geo, mesh.material);
      strip.position.set((a + b) / 2, (c + d) / 2, p.z);
      group.add(shadows(strip));
    }
  }
}
