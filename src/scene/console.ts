import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SURFACES, surfaceMaterial } from './textures';
import { projectUV, fasteners, shadows } from './util';
import { dymoLabel, printedText, stickyNote, PrinterPaper, flapTexture, FONT } from './decals';
import { mulberry32 } from './textures';

export const DESK_Y = 0.75;

export interface ScreenSet {
  center: THREE.Texture;
  left: THREE.Texture;
  right: THREE.Texture;
}

export interface Console {
  group: THREE.Group;
  lamp: { light: THREE.SpotLight; bulb: THREE.Mesh };
  beacon: { pivot: THREE.Object3D; dome: THREE.MeshStandardMaterial; lights: THREE.SpotLight[] };
  indicators: { mat: THREE.MeshStandardMaterial; mode: 'flash' | 'steady' | 'off'; color: THREE.Color }[];
  screens: { mesh: THREE.Mesh; size: [number, number] }[];
  flaps: THREE.Mesh[];
  switches: PanelSwitch[];
  /** Invisible plane over the switch panel, used to lean in to it. */
  panel: { mesh: THREE.Mesh; size: [number, number] };
  paper: PrinterPaper;
  sheet: THREE.Mesh;
  handset: THREE.Group;
}

export interface PanelSwitch {
  hinge: THREE.Group;
  bat: THREE.Mesh;
  /** Generous invisible box so the switch is easy to hit on a phone. */
  hit: THREE.Mesh;
  lamp: { mat: THREE.MeshStandardMaterial; mode: 'flash' | 'steady' | 'off'; color: THREE.Color };
  open: boolean;
  thrown: boolean;
}

/** Toggle bat angle when resting down and when thrown up. */
export const BAT_DOWN = Math.PI / 2 - 0.45;
export const BAT_UP = Math.PI / 2 + 0.45;
export const GUARD_OPEN = -1.95;

/** A rounded box whose UVs follow world position, for continuous wear. */
function box(w: number, h: number, d: number, mat: THREE.Material, r = 0.006, at = new THREE.Vector3(), tile = 0.9) {
  const geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  projectUV(geo, at, tile, 'xy');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(at);
  return shadows(mesh);
}

/** A cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, segs = 16) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, segs);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return shadows(mesh);
}

export function buildConsole(screens: ScreenSet): Console {
  const group = new THREE.Group();
  const enamel = surfaceMaterial(SURFACES.consoleEnamel(), { color: 0xffffff });
  const enamelDark = surfaceMaterial(SURFACES.consoleEnamel(), { color: 0x6a6c68 });
  const black = surfaceMaterial(SURFACES.powderBlack(), {});
  const rubber = surfaceMaterial(SURFACES.rubberMat(), {});
  const alu = surfaceMaterial(SURFACES.aluminium(), { metalness: 0.9 });
  const beige = surfaceMaterial(SURFACES.beigePlastic(), {});
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 1, roughness: 0.18 });
  const screwMat = new THREE.MeshStandardMaterial({ color: 0x8a8d90, metalness: 0.85, roughness: 0.35 });
  const indicators: Console['indicators'] = [];
  const screenMeshes: Console['screens'] = [];

  // Desk top, front apron and kick plate.
  group.add(box(2.4, 0.04, 0.8, enamel, 0.012, new THREE.Vector3(0, DESK_Y - 0.02, -0.33)));
  group.add(box(2.36, 0.7, 0.03, enamelDark, 0.006, new THREE.Vector3(0, 0.37, 0.05)));
  // Worn edge where forearms rest: a strip of black rubber edging.
  const edge = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 2.36, 4, 12), rubber);
  edge.rotation.z = Math.PI / 2;
  edge.position.set(0, DESK_Y - 0.018, 0.07);
  group.add(shadows(edge));
  // Desk mat.
  group.add(box(0.92, 0.004, 0.4, rubber, 0.002, new THREE.Vector3(-0.02, DESK_Y + 0.002, -0.24), 0.6));

  // Instrument cabinet: centre section plus two angled wings.
  const cabH = 0.66;
  const cabY = DESK_Y + cabH / 2;
  const centreW = 0.86;
  group.add(box(centreW, cabH, 0.24, enamel, 0.01, new THREE.Vector3(0, cabY, -0.85)));
  group.add(box(centreW + 0.02, 0.04, 0.3, enamelDark, 0.012, new THREE.Vector3(0, DESK_Y + cabH + 0.02, -0.84)));

  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * (centreW / 2), 0, -0.73);
    wing.rotation.y = side * -0.52;
    const w = 0.68;
    wing.add(box(w, cabH, 0.24, enamel, 0.01, new THREE.Vector3(side * (w / 2), cabY, -0.12)));
    wing.add(box(w + 0.02, 0.04, 0.3, enamelDark, 0.012, new THREE.Vector3(side * (w / 2), DESK_Y + cabH + 0.02, -0.11)));
    group.add(wing);
    wings.push(wing);
  }

  // Monitors: rugged panel PCs in black powder coated bezels.
  const monitor = (parent: THREE.Object3D, tex: THREE.Texture, sw: number, sh: number, pos: THREE.Vector3, tilt: number, tag: string) => {
    const m = new THREE.Group();
    m.position.copy(pos);
    m.rotation.x = tilt;
    const bw = sw + 0.07;
    const bh = sh + 0.075;
    m.add(box(bw, bh, 0.05, black, 0.008));
    // Screen sits in a shallow recess with a thin inner lip.
    const lip = new THREE.Mesh(new THREE.PlaneGeometry(sw + 0.012, sh + 0.012), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.7 }));
    lip.position.z = 0.0252;
    m.add(lip);
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.22,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1,
      envMapIntensity: 0.6,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), screenMat);
    screen.position.z = 0.0256;
    screen.name = `screen:${tag}`;
    m.add(screen);
    screenMeshes.push({ mesh: screen, size: [sw, sh] });
    // Corner screws and a status LED.
    const cs = [
      [-bw / 2 + 0.014, bh / 2 - 0.014],
      [bw / 2 - 0.014, bh / 2 - 0.014],
      [-bw / 2 + 0.014, -bh / 2 + 0.014],
      [bw / 2 - 0.014, -bh / 2 + 0.014],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0.026));
    m.add(fasteners(cs, { radius: 0.0045, material: screwMat, segments: 12 }));
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x2bd156, emissiveIntensity: 2.4 });
    const led = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 12), ledMat);
    led.position.set(bw / 2 - 0.03, -bh / 2 + 0.016, 0.0252);
    m.add(led);
    const plate = printedText(tag, { height: 0.0085, color: '#8d9093', font: FONT.mono, weight: 500, align: 'left' });
    plate.position.set(-bw / 2 + 0.03, -bh / 2 + 0.016, 0.0255);
    m.add(plate);
    parent.add(m);
    return m;
  };

  const centreMon = monitor(group, screens.center, 0.64, 0.4, new THREE.Vector3(0, DESK_Y + 0.4, -0.712), -0.07, 'OPS 1  STATION');
  monitor(wings[0], screens.left, 0.5, 0.3125, new THREE.Vector3(-0.34, DESK_Y + 0.38, 0.03), -0.07, 'OPS 2  LIFE SUPPORT');
  monitor(wings[1], screens.right, 0.5, 0.3125, new THREE.Vector3(0.34, DESK_Y + 0.38, 0.03), -0.07, 'OPS 3  CCTV');

  // Someone's reminder, stuck to the bezel.
  const note = stickyNote(['PUMP 2 STICKS', 'RESET AT', 'BREAKER 7'], 11);
  // Stuck on the bezel edge, clear of the display.
  note.position.set(-0.372, 0.13, 0.027);
  note.rotation.z = 0.06;
  centreMon.add(note);

  // Sloped control strip in front of the centre section.
  const slopeDepth = 0.23;
  const rise = 0.11;
  const alpha = Math.atan2(rise, slopeDepth);
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  profile.lineTo(0, 0.022);
  profile.lineTo(slopeDepth, 0.022 + rise);
  profile.lineTo(slopeDepth, 0);
  profile.closePath();
  const slopeGeo = new THREE.ExtrudeGeometry(profile, { depth: centreW, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
  slopeGeo.rotateY(Math.PI / 2);
  slopeGeo.translate(-centreW / 2, DESK_Y, -0.5);
  slopeGeo.computeVertexNormals();
  projectUV(slopeGeo, new THREE.Vector3(), 0.9, 'xz');
  group.add(shadows(new THREE.Mesh(slopeGeo, enamel)));

  const panel = new THREE.Group();
  panel.position.set(0, DESK_Y + 0.022 + rise / 2 + 0.005, -0.5 - slopeDepth / 2);
  panel.rotation.x = -(Math.PI / 2 - alpha);
  group.add(panel);
  // Engraved black faceplate the controls are mounted through.
  panel.add(box(0.8, 0.2, 0.004, black, 0.003, new THREE.Vector3(0, 0, 0.0)));

  const coverMat = new THREE.MeshPhysicalMaterial({
    color: 0xc0180f,
    transparent: true,
    opacity: 0.78,
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
    depthWrite: false,
  });
  const switchDefs = [
    { label: 'DOOR C1 C2', lamp: 0xffa31a, mode: 'off' as const, open: false },
    { label: 'DOOR C2 C3', lamp: 0x37d36b, mode: 'steady' as const, open: false },
    { label: 'BALLAST', lamp: 0xffa31a, mode: 'off' as const, open: false },
    { label: 'VENT', lamp: 0x37d36b, mode: 'off' as const, open: false },
  ];
  const switches: PanelSwitch[] = [];
  switchDefs.forEach((s, i) => {
    const x = -0.33 + i * 0.105;
    panel.add(box(0.052, 0.064, 0.004, alu, 0.003, new THREE.Vector3(x, 0, 0.004)));
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 6), chrome);
    nut.rotation.x = Math.PI / 2;
    nut.position.set(x, 0, 0.009);
    panel.add(shadows(nut));
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0036, 0.03, 12), chrome);
    bat.geometry.translate(0, 0.015, 0);
    bat.position.set(x, 0, 0.011);
    // Toggles rest down; the bat leans toward the operator.
    bat.rotation.x = BAT_DOWN;
    panel.add(shadows(bat));
    const batTip = new THREE.Mesh(new THREE.SphereGeometry(0.0038, 12, 8), chrome);
    batTip.position.set(0, 0.03, 0);
    bat.add(batTip);
    // Hinged guard cover over each switch.
    const hinge = new THREE.Group();
    hinge.position.set(x, 0.03, 0.006);
    hinge.rotation.x = s.open ? GUARD_OPEN : 0;
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.042, 0.06, 0.032, 2, 0.004), coverMat);
    cover.position.set(0, -0.03, 0.016);
    hinge.add(cover);
    panel.add(hinge);
    // Indicator lamp above.
    const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.008, 20), black);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.set(x, 0.062, 0.006);
    panel.add(shadows(bezel));
    const lensMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(s.lamp).multiplyScalar(0.25), emissive: s.lamp, emissiveIntensity: s.mode === 'off' ? 0 : 3, roughness: 0.25 });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 0.062, 0.01);
    panel.add(lens);
    const lamp = { mat: lensMat, mode: s.mode, color: new THREE.Color(s.lamp) };
    indicators.push(lamp);
    const label = dymoLabel(s.label, { seed: 20 + i, height: 0.012 });
    label.position.set(x, -0.058, 0.0045);
    label.rotation.z = (i % 2 ? 1 : -1) * 0.012;
    panel.add(label);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.14, 0.07), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x, 0.004, 0.02);
    hit.name = `switch:${i}`;
    panel.add(hit);
    switches.push({ hinge, bat, hit, lamp, open: s.open, thrown: false });
  });
  const panelTarget = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  panelTarget.position.set(0, 0, 0.03);
  panel.add(panelTarget);

  // Rotary mode selector with engraved positions.
  const selX = 0.13;
  const dial = document.createElement('canvas');
  dial.width = dial.height = 256;
  const dx = dial.getContext('2d')!;
  dx.translate(128, 128);
  dx.fillStyle = '#e6e3da';
  dx.strokeStyle = '#e6e3da';
  dx.font = `600 30px ${FONT.label}`;
  dx.textAlign = 'center';
  dx.textBaseline = 'middle';
  ['NORM', 'SCAN', 'MAN'].forEach((t, i) => {
    const a = -Math.PI / 2 + (i - 1) * 0.85;
    dx.lineWidth = 4;
    dx.beginPath();
    dx.moveTo(Math.cos(a) * 62, Math.sin(a) * 62);
    dx.lineTo(Math.cos(a) * 76, Math.sin(a) * 76);
    dx.stroke();
    dx.fillText(t, Math.cos(a) * 102, Math.sin(a) * 102);
  });
  const dialTex = new THREE.CanvasTexture(dial);
  dialTex.colorSpace = THREE.SRGBColorSpace;
  const dialPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshStandardMaterial({ map: dialTex, transparent: true, roughness: 0.6 }));
  dialPlate.position.set(selX, -0.004, 0.0025);
  panel.add(dialPlate);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.017, 0.02, 28), new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.45 }));
  knob.rotation.x = Math.PI / 2;
  knob.position.set(selX, -0.004, 0.012);
  panel.add(shadows(knob));
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.018, 0.002), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }));
  pointer.position.set(selX, 0.002, 0.0225);
  panel.add(pointer);

  // Emergency stop: red mushroom head on a yellow legend plate.
  const esX = 0.29;
  const es = document.createElement('canvas');
  es.width = es.height = 256;
  const ex = es.getContext('2d')!;
  ex.fillStyle = '#e2b012';
  ex.beginPath();
  ex.arc(128, 128, 124, 0, Math.PI * 2);
  ex.fill();
  ex.fillStyle = '#151515';
  ex.font = `700 26px ${FONT.label}`;
  ex.textAlign = 'center';
  // Legend running round the top of the ring.
  const legend = 'EMERGENCY STOP';
  for (let i = 0; i < legend.length; i++) {
    const a = -Math.PI / 2 + (i - (legend.length - 1) / 2) * 0.17;
    ex.save();
    ex.translate(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100);
    ex.rotate(a + Math.PI / 2);
    ex.fillText(legend[i], 0, 8);
    ex.restore();
  }
  const esTex = new THREE.CanvasTexture(es);
  esTex.colorSpace = THREE.SRGBColorSpace;
  const ring = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48), new THREE.MeshStandardMaterial({ map: esTex, roughness: 0.5, transparent: true }));
  ring.position.set(esX, 0, 0.0025);
  panel.add(ring);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.016, 24), black);
  neck.rotation.x = Math.PI / 2;
  neck.position.set(esX, 0, 0.01);
  panel.add(shadows(neck));
  const mushroom = new THREE.Mesh(
    new THREE.SphereGeometry(0.026, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xa8110c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 }),
  );
  mushroom.rotation.x = Math.PI / 2;
  mushroom.scale.set(1, 0.42, 1);
  mushroom.position.set(esX, 0, 0.017);
  panel.add(shadows(mushroom));

  // Split-flap rescue countdown, mounted on the bulkhead above.
  const flapBoard = new THREE.Group();
  flapBoard.position.set(0.33, 1.72, -0.98);
  group.add(flapBoard);
  flapBoard.add(box(0.5, 0.2, 0.08, black, 0.01));
  const flaps: THREE.Mesh[] = [];
  ['1', '3'].forEach((ch, i) => {
    const fx = -0.1 + i * 0.086;
    flapBoard.add(box(0.078, 0.112, 0.012, new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.6 }), 0.003, new THREE.Vector3(fx, -0.012, 0.042)));
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.096), new THREE.MeshStandardMaterial({ map: flapTexture(ch), roughness: 0.42, metalness: 0.1 }));
    flap.position.set(fx, -0.012, 0.0485);
    flapBoard.add(flap);
    flaps.push(flap);
  });
  const etaLabel = printedText('RESCUE VESSEL  ETA', { height: 0.022, color: '#cfcac0', align: 'left' });
  etaLabel.position.set(-0.225, 0.07, 0.0405);
  flapBoard.add(etaLabel);
  const days = printedText('DAYS', { height: 0.04, color: '#cfcac0', weight: 700, align: 'left' });
  days.position.set(0.09, -0.016, 0.0405);
  flapBoard.add(days);
  flapBoard.add(
    fasteners(
      [
        [-0.235, 0.085],
        [0.235, 0.085],
        [-0.235, -0.085],
        [0.235, -0.085],
      ].map(([x, y]) => new THREE.Vector3(x, y, 0.041)),
      { radius: 0.005, material: screwMat, segments: 12 },
    ),
  );
  // Cable from the board down behind the cabinet.
  group.add(rod(new THREE.Vector3(0.55, 1.62, -1.0), new THREE.Vector3(0.55, 1.2, -1.0), 0.005, black));

  // Dot matrix printer with the morning report curling out.
  const printer = new THREE.Group();
  printer.position.set(0.76, DESK_Y, -0.36);
  printer.rotation.y = -0.32;
  group.add(printer);
  printer.add(box(0.38, 0.1, 0.27, beige, 0.012, new THREE.Vector3(0, 0.05, 0)));
  printer.add(box(0.34, 0.03, 0.1, surfaceMaterial(SURFACES.beigePlastic(), { color: 0x8a8578 }), 0.008, new THREE.Vector3(0, 0.105, -0.05)));
  printer.add(box(0.3, 0.012, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 }), 0.003, new THREE.Vector3(0, 0.122, -0.01)));
  const platen = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 }));
  platen.rotation.z = Math.PI / 2;
  platen.position.set(0.2, 0.08, -0.03);
  printer.add(shadows(platen));
  const online = new THREE.Mesh(new THREE.CircleGeometry(0.003, 12), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x2bd156, emissiveIntensity: 2.5 }));
  online.position.set(0.14, 0.06, 0.1355);
  printer.add(online);
  const onlineTxt = printedText('ON LINE', { height: 0.009, color: '#3a3830', font: FONT.mono, weight: 500, align: 'left' });
  onlineTxt.position.set(0.149, 0.06, 0.1356);
  printer.add(onlineTxt);
  const prModel = printedText('PR-24', { height: 0.014, color: '#4a463c', weight: 700, align: 'left' });
  prModel.position.set(-0.17, 0.06, 0.1356);
  printer.add(prModel);

  const paper = new PrinterPaper([
    'HELIOS DEEP  MORNING REPORT',
    'DAY 1                03:47',
    '----------------------------',
    'C2 FLOODING        CONFIRMED',
    'DOOR C1 C2 OPEN    CONFIRMED',
    'PUMP 2 FAILED      CONFIRMED',
    'HULL STRESS HIGH   LIKELY',
    'NOISE ON HYDROPHONE',
    '  CHECK SENSOR     UNSURE',
    '----------------------------',
    'CREW  6 OF 6 ACCOUNTED FOR',
    'RESCUE IN 13 DAYS',
  ]);
  // Sheet path: out of the slot, up, then over the back.
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.02),
    new THREE.Vector3(0, 0.2, -0.01),
    new THREE.Vector3(0, 0.29, -0.035),
    new THREE.Vector3(0, 0.33, -0.1),
    new THREE.Vector3(0, 0.3, -0.17),
    new THREE.Vector3(0, 0.18, -0.2),
  ]);
  const sheetGeo = new THREE.PlaneGeometry(0.24, 1, 1, 48);
  const sp = sheetGeo.attributes.position as THREE.BufferAttribute;
  const suv = sheetGeo.attributes.uv as THREE.BufferAttribute;
  const pathLen = path.getLength();
  for (let i = 0; i < sp.count; i++) {
    // s runs from the slot (0) to the end hanging over the back (1).
    const s = 1 - suv.getY(i);
    const p = path.getPointAt(s);
    sp.setXYZ(i, sp.getX(i), p.y, p.z);
    // The freshest lines sit just above the slot, the report header
    // higher up the rising sheet. The canvas is 0.48 m of paper.
    suv.setY(i, 0.6 + (s * pathLen) / 0.48);
  }
  paper.texture.wrapT = THREE.RepeatWrapping;
  sheetGeo.computeVertexNormals();
  const sheet = new THREE.Mesh(sheetGeo, new THREE.MeshStandardMaterial({ map: paper.texture, roughness: 0.92, side: THREE.DoubleSide }));
  printer.add(shadows(sheet));

  // Sound powered phone with a coiled cord.
  const phone = new THREE.Group();
  phone.position.set(-0.76, DESK_Y, -0.36);
  phone.rotation.y = 0.34;
  group.add(phone);
  const phoneMat = surfaceMaterial(SURFACES.powderBlack(), { color: 0x6f7468 });
  phone.add(box(0.17, 0.055, 0.22, phoneMat, 0.012, new THREE.Vector3(0, 0.0275, 0)));
  phone.add(box(0.07, 0.02, 0.17, black, 0.006, new THREE.Vector3(-0.03, 0.064, -0.005)));
  const handset = new THREE.Group();
  handset.position.set(-0.03, 0.09, -0.005);
  phone.add(handset);
  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.017, 0.15, 6, 16), black);
  grip.rotation.x = Math.PI / 2;
  handset.add(shadows(grip));
  for (const z of [-0.095, 0.095]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.03, 28), black);
    cup.position.set(0, -0.012, z);
    handset.add(shadows(cup));
  }
  // Station selector on the phone base.
  const sel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.016, 24), chrome);
  sel.position.set(0.05, 0.063, 0.05);
  phone.add(shadows(sel));
  const phoneLbl = dymoLabel('CALL', { seed: 31, height: 0.012 });
  phoneLbl.rotation.x = -Math.PI / 2;
  phoneLbl.position.set(0.05, 0.0556, 0.085);
  phone.add(phoneLbl);
  // Coiled cord from the handset to the base.
  const coil: THREE.Vector3[] = [];
  const turns = 22;
  for (let i = 0; i <= turns * 12; i++) {
    const f = i / (turns * 12);
    const a = f * turns * Math.PI * 2;
    const cx = -0.03 + 0.0 * f;
    const cy = 0.075 - f * 0.06 - Math.sin(f * Math.PI) * 0.02;
    const cz = 0.1 + f * 0.05 + Math.sin(f * Math.PI) * 0.03;
    coil.push(new THREE.Vector3(cx + Math.cos(a) * 0.008, cy + Math.sin(a) * 0.008, cz + f * 0.0));
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 600, 0.0022, 6), black);
  phone.add(shadows(cord));

  // Articulated desk lamp with a warm bulb.
  const lampMat = surfaceMaterial(SURFACES.powderBlack(), { color: 0x4a4f48 });
  // Clamped at the far left of the desk, head low over the work area
  // so it never covers a screen.
  const lb = new THREE.Vector3(-1.08, DESK_Y, -0.2);
  const elbow = new THREE.Vector3(-1.04, DESK_Y + 0.4, -0.3);
  const head = new THREE.Vector3(-0.8, DESK_Y + 0.3, -0.05);
  const target = new THREE.Vector3(-0.42, DESK_Y, -0.18);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.025, 40), lampMat);
  base.position.copy(lb).add(new THREE.Vector3(0, 0.0125, 0));
  group.add(shadows(base));
  group.add(rod(lb.clone().add(new THREE.Vector3(0, 0.02, 0)), elbow, 0.008, lampMat));
  group.add(rod(lb.clone().add(new THREE.Vector3(0.02, 0.02, 0)), elbow.clone().add(new THREE.Vector3(0.02, 0, 0)), 0.003, chrome));
  group.add(rod(elbow, head, 0.008, lampMat));
  for (const j of [elbow, head]) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.014, 20, 12), lampMat);
    ball.position.copy(j);
    group.add(shadows(ball));
  }
  const shadeDir = target.clone().sub(head).normalize();
  const shadeGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.012, 0.0),
      new THREE.Vector2(0.03, 0.02),
      new THREE.Vector2(0.06, 0.075),
      new THREE.Vector2(0.075, 0.12),
      new THREE.Vector2(0.077, 0.124),
    ],
    48,
  );
  const shade = new THREE.Mesh(shadeGeo, new THREE.MeshStandardMaterial({ color: 0x3d4240, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
  shade.position.copy(head);
  shade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shadeDir);
  group.add(shadows(shade));
  const bulbPos = head.clone().addScaledVector(shadeDir, 0.06);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.024, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc58a, emissiveIntensity: 9 }));
  bulb.position.copy(bulbPos);
  group.add(bulb);
  const lampLight = new THREE.SpotLight(0xffb46e, 6.5, 0, 0.78, 0.65, 2);
  lampLight.position.copy(bulbPos.clone().addScaledVector(shadeDir, 0.03));
  lampLight.target.position.copy(target);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.01;
  lampLight.shadow.radius = 6;
  lampLight.shadow.camera.near = 0.05;
  lampLight.shadow.camera.far = 4;
  group.add(lampLight, lampLight.target);

  // Mug of cold coffee.
  const mugPts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) mugPts.push(new THREE.Vector2(0.036 + Math.sin(i * 0.12) * 0.001, (i / 10) * 0.095));
  mugPts.push(new THREE.Vector2(0.032, 0.095));
  for (let i = 10; i >= 1; i--) mugPts.push(new THREE.Vector2(0.032, (i / 10) * 0.095 + 0.006));
  mugPts.unshift(new THREE.Vector2(0, 0));
  const mugMat = new THREE.MeshPhysicalMaterial({ color: 0x2a3440, roughness: 0.35, clearcoat: 0.7 });
  const mug = new THREE.Mesh(new THREE.LatheGeometry(mugPts, 48), mugMat);
  mug.position.set(-0.44, DESK_Y, -0.13);
  group.add(shadows(mug));
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.032, 32), new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 0.15 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(-0.44, DESK_Y + 0.07, -0.13);
  group.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 12, 24, Math.PI), mugMat);
  handle.rotation.z = -Math.PI / 2;
  handle.position.set(-0.475, DESK_Y + 0.05, -0.13);
  group.add(shadows(handle));

  // Laminated flood response checklist.
  group.add(checklist());

  // Rotating beacon on the bulkhead.
  const beacon = new THREE.Group();
  beacon.position.set(0.8, 1.95, -0.95);
  group.add(beacon);
  beacon.add(box(0.05, 0.03, 0.09, black, 0.004, new THREE.Vector3(0, -0.06, -0.04)));
  const bBase = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.035, 32), black);
  bBase.position.y = -0.045;
  beacon.add(shadows(bBase));
  const domeMat = new THREE.MeshPhysicalMaterial({ color: 0x7a0c06, emissive: 0xff2a14, emissiveIntensity: 1.5, roughness: 0.2, transparent: true, opacity: 0.92, clearcoat: 1 });
  const dome = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.035, 8, 32), domeMat);
  dome.position.y = 0.0;
  beacon.add(dome);
  const pivot = new THREE.Object3D();
  beacon.add(pivot);
  const beaconLights: THREE.SpotLight[] = [];
  for (const dir of [1, -1]) {
    const l = new THREE.SpotLight(0xff2412, 26, 7, 0.32, 0.5, 2);
    l.position.set(0, 0, 0);
    l.target.position.set(dir, -0.18, 0);
    pivot.add(l, l.target);
    beaconLights.push(l);
  }

  return {
    group,
    lamp: { light: lampLight, bulb },
    beacon: { pivot, dome: domeMat, lights: beaconLights },
    indicators,
    screens: screenMeshes,
    flaps,
    switches,
    panel: { mesh: panelTarget, size: [0.84, 0.26] },
    paper,
    sheet,
    handset,
  };
}

function checklist() {
  const w = 600;
  const h = 850;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ece8dd';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#b8211a';
  x.fillRect(0, 0, w, 96);
  x.fillStyle = '#ffffff';
  x.font = `700 46px ${FONT.label}`;
  x.textBaseline = 'middle';
  x.fillText('FLOOD RESPONSE  C2', 30, 50);
  x.fillStyle = '#1d1d1d';
  x.font = `500 25px ${FONT.mono}`;
  const steps = [
    '1  ACKNOWLEDGE THE ALARM',
    '2  CLOSE DOOR C1 C2',
    '   LIFT GUARD. SWITCH DOWN.',
    '3  CHECK PUMP 1 IS ON',
    '4  IF PUMP 2 FAILED',
    '   RESET AT BREAKER 7',
    '5  MUSTER CREW BY PHONE',
    '6  LOG TIME AND LEVEL',
    '',
    'DO NOT OPEN DOOR C1 C2 UNTIL',
    'C2 LEVEL BELOW 10 %',
  ];
  steps.forEach((s, i) => x.fillText(s, 30, 150 + i * 46));
  // Tick boxes beside each numbered step.
  x.strokeStyle = '#1d1d1d';
  x.lineWidth = 2;
  steps.forEach((s, i) => {
    if (/^\d/.test(s)) x.strokeRect(w - 70, 150 + i * 46 - 16, 30, 30);
  });
  x.fillStyle = '#6a6a6a';
  x.font = `500 18px ${FONT.mono}`;
  x.fillText('HD-OPS-07  REV 4', 30, h - 40);
  // Lamination: slight grime where thumbs hold it.
  const rand = mulberry32(2);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(80,70,50,${rand() * 0.05})`;
    x.beginPath();
    x.arc(rand() * 120, h - rand() * 160, 10 + rand() * 30, 0, Math.PI * 2);
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const card = new THREE.Mesh(
    new THREE.PlaneGeometry(0.148, 0.21),
    new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  );
  card.rotation.x = -Math.PI / 2;
  card.rotation.z = 0.12;
  card.position.set(0.3, DESK_Y + 0.0045, -0.2);
  card.receiveShadow = true;
  return card;
}
