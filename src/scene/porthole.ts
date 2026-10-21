import * as THREE from 'three';
import { mulberry32 } from './textures';

// The view outside is drawn in a single shader on the window disc. It
// offsets each layer by the view direction, so marine snow at different
// depths moves with real parallax as the camera shifts.
const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uPresence;
  uniform vec3 uCam;
  uniform mat3 uToLocal;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  // Sparse drifting particles. Most cells are empty.
  float snow(vec2 p, float scale, float t, float density) {
    p *= scale;
    p.y += t;
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float h = hash(cell);
    if (h > density) return 0.0;
    vec2 pos = vec2(hash(cell + 3.1), hash(cell + 7.7));
    pos.x += sin(t * 0.7 + h * 40.0) * 0.12;
    float size = mix(0.035, 0.11, hash(cell + 1.3));
    float d = length(f - pos);
    return smoothstep(size, 0.0, d) * mix(0.35, 1.0, hash(cell + 9.2));
  }

  void main() {
    vec3 dir = normalize(uToLocal * normalize(vWorld - uCam));
    vec2 base = (vUv - 0.5) * 2.0;
    // Parallax for a layer at depth d behind the glass.
    #define LAYER(d) (base + dir.xy / max(0.2, -dir.z) * (d))
    float t = uTime;

    vec2 far = LAYER(3.0);
    // Black water with a faint blue-green scatter from the station's lights.
    vec3 col = mix(vec3(0.002, 0.008, 0.012), vec3(0.01, 0.045, 0.055), smoothstep(-1.6, 1.2, far.y));

    // Work light cone shining down from above the window.
    vec2 lp = LAYER(1.2);
    float cone = smoothstep(0.62, 0.0, abs(lp.x + 0.25 - lp.y * 0.18) - (1.2 - lp.y) * 0.18);
    cone *= smoothstep(-2.0, 0.9, lp.y) * smoothstep(1.6, 0.6, lp.y);
    float haze = noise(lp * 1.4 + vec2(0.0, t * 0.05));
    col += vec3(0.05, 0.16, 0.17) * cone * (0.8 + 0.2 * haze);

    // Light shafts flicker as the water above them moves.
    float caust = noise(lp * 6.0 + vec2(t * 0.25, t * 0.18)) * noise(lp * 5.3 - vec2(t * 0.2, t * 0.31));
    col += vec3(0.04, 0.12, 0.12) * cone * smoothstep(0.25, 0.6, caust);

    // Something very large passes at the edge of the light.
    if (uPresence > 0.0) {
      vec2 sp = LAYER(2.4);
      float sx = mod(t * 0.06, 3.0) - 1.5;
      float body = smoothstep(0.55, 0.2, length((sp - vec2(sx * 2.0, -0.4)) * vec2(0.35, 1.0)));
      col *= 1.0 - body * 0.85 * uPresence;
    }

    // Three depths of marine snow.
    float s = 0.0;
    s += snow(LAYER(2.5), 9.0, t * 0.10, 0.35) * 0.35;
    s += snow(LAYER(1.4), 6.0, t * 0.16, 0.30) * 0.6;
    s += snow(LAYER(0.5), 3.5, t * 0.24, 0.22) * 1.0;
    float lit = 0.25 + cone * 1.6;
    col += vec3(0.55, 0.66, 0.62) * s * lit;

    // Thick glass darkens and tints toward the rim.
    float r = length(base);
    col *= mix(1.0, 0.25, smoothstep(0.65, 1.0, r));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Condensation droplets and a few runs, drawn on the inside of the glass. */
function condensation() {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const rand = mulberry32(9);
  ctx.clearRect(0, 0, s, s);
  for (let i = 0; i < 520; i++) {
    const x = rand() * s;
    const y = rand() * s;
    // Droplets gather more near the bottom of the cold glass.
    const r = (0.6 + rand() * 2.6) * (0.6 + (y / s) * 0.9);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(200,220,220,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = s * (0.2 + rand() * 0.6);
    const y = s * (0.15 + rand() * 0.4);
    const len = s * (0.15 + rand() * 0.3);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(220,235,235,0.05)');
    g.addColorStop(1, 'rgba(220,235,235,0.32)');
    ctx.strokeStyle = g;
    ctx.lineWidth = 2 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 4, y + len * 0.3, x - 5, y + len * 0.7, x + 2, y + len);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Porthole {
  group: THREE.Group;
  update(time: number, camera: THREE.Camera): void;
  setPresence(v: number): void;
  /** 0 is intact; 1 is a fully spread fracture. */
  setCrack(progress: number): void;
}

/**
 * Pressure fracture in the glass: branching cracks spreading from one
 * impact point, drawn up to the given progress.
 */
function crackPainter() {
  const s = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const rand = mulberry32(31);
  type Seg = { x: number; y: number; a: number; len: number; w: number; depth: number; start: number };
  const segs: { x0: number; y0: number; x1: number; y1: number; w: number; start: number }[] = [];
  const grow = (g: Seg) => {
    let { x, y, a } = g;
    const steps = 6 + Math.floor(rand() * 6);
    for (let i = 0; i < steps; i++) {
      a += (rand() - 0.5) * 0.7;
      const l = (g.len / steps) * (0.6 + rand() * 0.8);
      const nx = x + Math.cos(a) * l;
      const ny = y + Math.sin(a) * l;
      segs.push({ x0: x, y0: y, x1: nx, y1: ny, w: g.w, start: g.start + (i / steps) * 0.5 });
      if (g.depth < 3 && rand() < 0.28) grow({ x: nx, y: ny, a: a + (rand() - 0.5) * 1.6, len: g.len * 0.55, w: g.w * 0.6, depth: g.depth + 1, start: g.start + (i / steps) * 0.5 });
      x = nx;
      y = ny;
    }
  };
  const ix = s * 0.58;
  const iy = s * 0.42;
  for (let i = 0; i < 9; i++) grow({ x: ix, y: iy, a: (i / 9) * Math.PI * 2 + rand() * 0.4, len: s * (0.25 + rand() * 0.3), w: 3.2, depth: 0, start: rand() * 0.15 });
  // Concentric ring fractures around the impact.
  const rings = [s * 0.05, s * 0.11];
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let drawn = -1;
  return {
    tex,
    draw(p: number) {
      const q = Math.round(p * 40) / 40;
      if (q === drawn) return;
      drawn = q;
      ctx.clearRect(0, 0, s, s);
      ctx.lineCap = 'round';
      for (const g of segs) {
        if (g.start > q) continue;
        // Bright edge where light catches the fracture, dark core.
        ctx.strokeStyle = 'rgba(230,245,250,0.85)';
        ctx.lineWidth = g.w + 1.5;
        ctx.beginPath();
        ctx.moveTo(g.x0, g.y0);
        ctx.lineTo(g.x1, g.y1);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(20,30,34,0.7)';
        ctx.lineWidth = g.w * 0.45;
        ctx.stroke();
      }
      if (q > 0.3) {
        ctx.strokeStyle = 'rgba(220,240,245,0.6)';
        ctx.lineWidth = 2;
        for (const r of rings) {
          ctx.beginPath();
          ctx.arc(ix, iy, r * Math.min(1, q * 1.5), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      tex.needsUpdate = true;
    },
  };
}

export function buildPorthole(steel: THREE.Material, boltMat: THREE.Material): Porthole {
  const group = new THREE.Group();
  const R = 0.19;

  const uniforms = {
    uTime: { value: 0 },
    uPresence: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uToLocal: { value: new THREE.Matrix3() },
  };
  const view = new THREE.Mesh(
    new THREE.CircleGeometry(R, 64),
    new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag }),
  );
  view.position.z = -0.02;
  group.add(view);

  // Glass with reflections and condensation on the room side.
  const glass = new THREE.Mesh(
    new THREE.CircleGeometry(R, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: condensation(),
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 2.2,
      depthWrite: false,
    }),
  );
  glass.position.z = -0.004;
  group.add(glass);

  const crack = crackPainter();
  const crackMesh = new THREE.Mesh(
    new THREE.CircleGeometry(R, 64),
    new THREE.MeshBasicMaterial({ map: crack.tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  crackMesh.position.z = -0.002;
  crackMesh.visible = false;
  group.add(crackMesh);

  // Recessed sleeve through the hull, so the glass looks thick.
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.06, 64, 1, true), steel);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = -0.03;
  group.add(sleeve);

  // Heavy clamping ring.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.022, 0.028, 24, 96), steel);
  ring.scale.z = 0.7;
  group.add(ring);
  const flange = new THREE.Mesh(new THREE.RingGeometry(R + 0.03, R + 0.085, 96), steel);
  flange.position.z = -0.012;
  group.add(flange);

  const bolts: THREE.Vector3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    bolts.push(new THREE.Vector3(Math.cos(a) * (R + 0.062), Math.sin(a) * (R + 0.062), 0.0));
  }
  const boltGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.012, 6);
  boltGeo.rotateX(Math.PI / 2);
  const boltMesh = new THREE.InstancedMesh(boltGeo, boltMat, bolts.length);
  const m = new THREE.Matrix4();
  bolts.forEach((p, i) => {
    m.makeRotationZ(i * 0.37).setPosition(p);
    boltMesh.setMatrixAt(i, m);
  });
  group.add(boltMesh);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o !== view && o !== glass) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    group,
    update(time, camera) {
      uniforms.uTime.value = time;
      uniforms.uCam.value.copy(camera.position);
      group.updateWorldMatrix(true, false);
      // World direction into the porthole's own frame for the parallax.
      uniforms.uToLocal.value.setFromMatrix4(group.matrixWorld).invert();
    },
    setPresence(v) {
      uniforms.uPresence.value = v;
    },
    setCrack(p) {
      crackMesh.visible = p > 0;
      if (p > 0) crack.draw(p);
    },
  };
}
