import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const PARK = -100;

interface StreakOpts {
  max: number;
  /** Line width in screen pixels. */
  width: number;
  gravity: number;
  drag: number;
  /** Seconds of travel each streak shows, so fast particles read as motion. */
  trail: number;
  blending: THREE.Blending;
  opacity: number;
  /** What happens on hitting the floor: sparks bounce, water splashes away. */
  onFloor: 'bounce' | 'die';
}

/**
 * Particles drawn as short motion streaks with real pixel width. A spark
 * or water droplet in flight reads as a streak, not a dot.
 */
class Streaks {
  readonly mesh: LineSegments2;
  readonly material: LineMaterial;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private segs: Float32Array;
  private cols: Float32Array;
  private posBuf: THREE.InterleavedBuffer;
  private colBuf: THREE.InterleavedBuffer;
  private cursor = 0;
  /** Surface height under a point: the desk, or the cabinet top behind it. */
  floor: (x: number, z: number) => number = () => 0;

  constructor(
    private o: StreakOpts,
    private ramp: THREE.Color[],
  ) {
    this.pos = new Float32Array(o.max * 3);
    this.vel = new Float32Array(o.max * 3);
    this.life = new Float32Array(o.max);
    this.maxLife = new Float32Array(o.max);
    this.segs = new Float32Array(o.max * 6).fill(PARK);
    this.cols = new Float32Array(o.max * 6);
    const geo = new LineSegmentsGeometry();
    geo.setPositions(this.segs);
    geo.setColors(this.cols);
    // Keep the instanced buffers and write into them every frame.
    this.posBuf = (geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    this.colBuf = (geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
    this.segs = this.posBuf.array as Float32Array;
    this.cols = this.colBuf.array as Float32Array;
    this.material = new LineMaterial({
      linewidth: o.width,
      vertexColors: true,
      transparent: true,
      opacity: o.opacity,
      depthWrite: false,
      blending: o.blending,
      toneMapped: false,
      worldUnits: false,
    });
    this.mesh = new LineSegments2(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  emit(at: THREE.Vector3, count: number, dir: THREE.Vector3, spread: number, speed: [number, number], life: [number, number]) {
    const v = new THREE.Vector3();
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.o.max;
      this.pos.set([at.x, at.y, at.z], i * 3);
      v.set(dir.x + (Math.random() - 0.5) * spread, dir.y + (Math.random() - 0.5) * spread, dir.z + (Math.random() - 0.5) * spread)
        .normalize()
        .multiplyScalar(speed[0] + Math.random() * (speed[1] - speed[0]));
      this.vel.set([v.x, v.y, v.z], i * 3);
      this.maxLife[i] = this.life[i] = life[0] + Math.random() * (life[1] - life[0]);
    }
  }

  update(dt: number) {
    const { gravity, drag, trail } = this.o;
    const damp = Math.exp(-drag * dt);
    const c = new THREE.Color();
    for (let i = 0; i < this.o.max; i++) {
      const k = i * 3;
      const s = i * 6;
      if (this.life[i] <= 0) {
        this.segs[s + 1] = this.segs[s + 4] = PARK;
        continue;
      }
      this.life[i] -= dt;
      this.vel[k + 1] -= gravity * dt;
      this.vel[k] *= damp;
      this.vel[k + 1] *= damp;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const floorY = this.floor(this.pos[k], this.pos[k + 2]);
      if (this.pos[k + 1] < floorY && this.vel[k + 1] < 0) {
        if (this.o.onFloor === 'die') {
          this.life[i] = 0;
        } else {
          this.pos[k + 1] = floorY;
          this.vel[k + 1] *= -0.3;
          this.vel[k] *= 0.5;
          this.vel[k + 2] *= 0.5;
        }
      }
      // Head at the particle, tail back along its velocity.
      this.segs[s] = this.pos[k];
      this.segs[s + 1] = this.pos[k + 1];
      this.segs[s + 2] = this.pos[k + 2];
      this.segs[s + 3] = this.pos[k] - this.vel[k] * trail;
      this.segs[s + 4] = this.pos[k + 1] - this.vel[k + 1] * trail;
      this.segs[s + 5] = this.pos[k + 2] - this.vel[k + 2] * trail;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      const idx = Math.min(this.ramp.length - 1, Math.floor((1 - f) * this.ramp.length));
      c.copy(this.ramp[idx]).multiplyScalar(0.25 + f);
      // Bright head, dimmer tail.
      this.cols[s] = c.r;
      this.cols[s + 1] = c.g;
      this.cols[s + 2] = c.b;
      this.cols[s + 3] = c.r * 0.3;
      this.cols[s + 4] = c.g * 0.3;
      this.cols[s + 5] = c.b * 0.3;
    }
    this.posBuf.needsUpdate = true;
    this.colBuf.needsUpdate = true;
  }
}

/** Soft disc sprite for mist. */
function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Fine water mist that hangs around a jet and slowly falls. */
class Mist {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private cursor = 0;
  constructor(private max: number) {
    this.pos = new Float32Array(max * 3).fill(PARK);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, map: mistTexture(), color: 0x9fb4bf, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }
  emit(at: THREE.Vector3, count: number, dir: THREE.Vector3) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const s = 0.4 + Math.random() * 0.9;
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([dir.x * s + (Math.random() - 0.5) * 0.8, dir.y * s + (Math.random() - 0.5) * 0.5, dir.z * s + (Math.random() - 0.5) * 0.8], i * 3);
      this.life[i] = 0.8 + Math.random() * 1.2;
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      const k = i * 3;
      if (this.life[i] <= 0) {
        this.pos[k + 1] = PARK;
        continue;
      }
      this.life[i] -= dt;
      this.vel[k + 1] -= 0.6 * dt;
      for (let a = 0; a < 3; a++) {
        this.vel[k + a] *= Math.exp(-1.8 * dt);
        this.pos[k + a] += this.vel[k + a] * dt;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * Electric arcs: jagged polylines re-shaped every frame. All arcs share
 * one segment buffer that is written in place, drawn twice: a wide soft
 * glow and a thin hot core.
 */
class Arcs {
  readonly glow: LineSegments2;
  readonly core: LineSegments2;
  private segs: Float32Array;
  private buf: THREE.InterleavedBuffer;
  private segs2: Float32Array;
  private buf2: THREE.InterleavedBuffer;
  private live: { a: THREE.Vector3; b: THREE.Vector3; until: number }[] = [];
  private readonly per = 28;

  constructor(
    private count: number,
    glowMat: LineMaterial,
    coreMat: LineMaterial,
  ) {
    // Same per-vertex colour setup as the particle streaks; the colour
    // itself comes from each material's tint over white vertices.
    // Each layer gets its own geometry: two meshes sharing one instanced
    // line geometry did not draw. HDR brightness lives in the vertex
    // colours; material tints stay at or below 1.
    const n = count * this.per * 6;
    const make = () => {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(new Float32Array(n).fill(PARK));
      const hot = new Float32Array(n);
      for (let i = 0; i < n; i += 3) hot.set([3.6, 4.6, 6.2], i);
      geo.setColors(hot);
      return geo;
    };
    const glowGeo = make();
    const coreGeo = make();
    this.buf = (glowGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    this.segs = this.buf.array as Float32Array;
    this.buf2 = (coreGeo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    this.segs2 = this.buf2.array as Float32Array;
    this.glow = new LineSegments2(glowGeo, glowMat);
    this.core = new LineSegments2(coreGeo, coreMat);
    this.glow.frustumCulled = this.core.frustumCulled = false;
    for (let i = 0; i < count; i++) this.live.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), until: -1 });
  }

  strike(i: number, a: THREE.Vector3, b: THREE.Vector3, until: number) {
    const arc = this.live[i % this.count];
    arc.a.copy(a);
    arc.b.copy(b);
    arc.until = until;
  }

  update(t: number) {
    let any = false;
    const p = new THREE.Vector3();
    const prev = new THREE.Vector3();
    this.live.forEach((arc, n) => {
      const base = n * this.per * 6;
      // Arcs strobe: on some frames an arc drops out completely.
      const on = t < arc.until && Math.random() > 0.2;
      if (!on) {
        for (let k = 0; k < this.per * 6; k++) this.segs[base + k] = PARK;
        return;
      }
      any = true;
      const len = arc.a.distanceTo(arc.b);
      prev.copy(arc.a);
      for (let i = 1; i <= this.per; i++) {
        const f = i / this.per;
        p.lerpVectors(arc.a, arc.b, f);
        // Two scales of jitter: a slow wander along the arc plus fine
        // crackle, so it reads as plasma rather than a zigzag.
        const env = Math.sin(f * Math.PI);
        const wander = Math.sin(f * 7 + n * 3.1 + t * 40) * len * 0.08 * env;
        const fine = len * 0.045 * env;
        if (i < this.per) {
          p.x += wander + (Math.random() - 0.5) * fine;
          p.y += wander * 0.6 + (Math.random() - 0.5) * fine;
          p.z += (Math.random() - 0.5) * fine * 0.5;
        }
        const o = base + (i - 1) * 6;
        this.segs[o] = prev.x;
        this.segs[o + 1] = prev.y;
        this.segs[o + 2] = prev.z;
        this.segs[o + 3] = p.x;
        this.segs[o + 4] = p.y;
        this.segs[o + 5] = p.z;
        prev.copy(p);
      }
    });
    this.segs2.set(this.segs);
    this.buf.needsUpdate = true;
    this.buf2.needsUpdate = true;
    return any;
  }
}

/** Every effect the trailer and the later emergencies use. */
export class Fx {
  readonly group = new THREE.Group();
  private sparks: Streaks;
  private spray: Streaks;
  private mist: Mist;
  private arcs: Arcs;
  private arcCore: LineMaterial;
  private arcGlow: LineMaterial;
  private flash: THREE.PointLight;
  private flashUntil = 0;
  private flashPeak = 0;
  private sprayAt: THREE.Vector3 | null = null;
  private sprayDir = new THREE.Vector3();
  private sprayUntil = 0;
  /** Scene time from the last update, so callers never mix clocks. */
  private now = 0;

  constructor() {
    this.sparks = new Streaks(
      { max: 700, width: 2.2, gravity: 6, drag: 0.9, trail: 0.025, blending: THREE.AdditiveBlending, opacity: 1, onFloor: 'bounce' },
      [new THREE.Color(5, 4.6, 3.8), new THREE.Color(4, 2.4, 0.9), new THREE.Color(2.4, 0.9, 0.2), new THREE.Color(0.7, 0.15, 0.02)],
    );
    const surfaces = (_x: number, z: number) => (z < -0.73 ? 1.43 : 0.76);
    this.sparks.floor = surfaces;
    this.spray = new Streaks(
      { max: 1400, width: 1.6, gravity: 7, drag: 0.5, trail: 0.045, blending: THREE.NormalBlending, opacity: 0.7, onFloor: 'die' },
      [new THREE.Color(0.85, 0.93, 0.98), new THREE.Color(0.62, 0.74, 0.82), new THREE.Color(0.42, 0.52, 0.6)],
    );
    this.spray.floor = surfaces;
    this.mist = new Mist(260);
    this.arcGlow = new LineMaterial({ vertexColors: true, linewidth: 6, transparent: true, opacity: 0.4, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
    this.arcGlow.color.setRGB(0.12, 0.22, 0.6, THREE.LinearSRGBColorSpace);
    this.arcCore = new LineMaterial({ vertexColors: true, linewidth: 1.4, transparent: true, opacity: 1, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending, worldUnits: false });
    this.arcCore.color.setRGB(1, 1, 1, THREE.LinearSRGBColorSpace);
    this.arcs = new Arcs(6, this.arcGlow, this.arcCore);
    this.group.add(this.sparks.mesh, this.spray.mesh, this.mist.points, this.arcs.glow, this.arcs.core);
    this.flash = new THREE.PointLight(0xbfe4ff, 0, 5, 2);
    this.group.add(this.flash);
  }

  /** Line widths are in pixels, so the materials need the viewport size. */
  setSize(w: number, h: number) {
    for (const m of [this.sparks.material, this.spray.material, this.arcCore, this.arcGlow]) m.resolution.set(w, h);
  }

  sparkBurst(at: THREE.Vector3, count = 160, dir = new THREE.Vector3(0, 1, 0.6)) {
    this.sparks.emit(at, count, dir, 1.4, [0.6, 2.4], [0.5, 1.4]);
    this.light(at, 6, 0.12, 0xffc27a);
  }

  /** Arcs jump around a centre, always on the near side so surfaces do not hide them. */
  arcStorm(centre: THREE.Vector3, radius: number, seconds: number) {
    const t = this.now;
    for (let i = 0; i < 6; i++) {
      const r = () => new THREE.Vector3((Math.random() - 0.5) * radius, (Math.random() - 0.5) * radius * 0.6, Math.random() * radius * 0.25);
      this.arcs.strike(i, centre.clone().add(r()), centre.clone().add(r()), t + seconds * (0.4 + Math.random() * 0.6));
    }
    this.light(centre, 10, seconds, 0xbfe4ff);
  }

  /** Arcs jumping between real metal points, the way a short really looks. */
  arcBetween(points: THREE.Vector3[], seconds: number) {
    const t = this.now;
    for (let i = 0; i < 6; i++) {
      const a = points[Math.floor(Math.random() * points.length)];
      let b = points[Math.floor(Math.random() * points.length)];
      if (b === a) b = points[(points.indexOf(a) + 1) % points.length];
      this.arcs.strike(i, a, b, t + seconds * (0.4 + Math.random() * 0.6));
    }
    const mid = points.reduce((m, q) => m.add(q), new THREE.Vector3()).multiplyScalar(1 / points.length);
    this.light(mid, 10, seconds, 0xbfe4ff);
  }

  startSpray(at: THREE.Vector3, dir: THREE.Vector3, seconds: number) {
    this.sprayAt = at.clone();
    this.sprayDir.copy(dir).normalize();
    this.sprayUntil = this.now + seconds;
  }

  light(at: THREE.Vector3, peak: number, seconds: number, colour: number) {
    this.flash.position.copy(at);
    this.flash.color.set(colour);
    this.flashPeak = peak;
    this.flashUntil = performance.now() / 1000 + seconds;
  }

  update(t: number, dt: number) {
    this.now = t;
    if (this.sprayAt && t < this.sprayUntil) {
      this.spray.emit(this.sprayAt, Math.ceil(700 * dt), this.sprayDir, 0.35, [2.6, 4.2], [0.4, 0.9]);
      this.mist.emit(this.sprayAt, Math.ceil(90 * dt), this.sprayDir);
    }
    this.sparks.update(dt);
    this.spray.update(dt);
    this.mist.update(dt);
    const live = this.arcs.update(t);
    const left = this.flashUntil - performance.now() / 1000;
    this.flash.intensity = left > 0 ? this.flashPeak * (live ? 0.4 + Math.random() * 0.8 : Math.min(1, left * 8)) : 0;
  }
}
