import * as THREE from 'three';

export interface Pose {
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

interface Target {
  mesh: THREE.Mesh;
  size: [number, number];
  name: string;
}

/**
 * Lets the player lean in to read a monitor. The camera glides from the
 * desk view to a pose square on to the chosen screen, framed so the
 * whole display fits, and glides back on release.
 */
export class FocusController {
  focused: Target | null = null;
  readonly pose: Pose = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private started = false;
  onChange: (t: Target | null) => void = () => {};

  constructor(
    private camera: THREE.PerspectiveCamera,
    readonly targets: Target[],
  ) {}

  pick(clientX: number, clientY: number, el: HTMLElement): Target | null {
    const r = el.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.targets.map((t) => t.mesh),
      false,
    );
    if (!hits.length) return null;
    return this.targets.find((t) => t.mesh === hits[0].object) ?? null;
  }

  focus(t: Target | null) {
    this.focused = t;
    this.onChange(t);
  }

  toggle(t: Target | null) {
    this.focus(t && t !== this.focused ? t : null);
  }

  /** Pose that frames a screen, leaving a little bezel visible. */
  private framing(t: Target): Pose {
    const p = t.mesh.getWorldPosition(new THREE.Vector3());
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(t.mesh.getWorldQuaternion(new THREE.Quaternion()));
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const tanV = Math.tan(vfov / 2);
    const fill = 0.9;
    const dH = t.size[1] / 2 / (tanV * fill);
    const dW = t.size[0] / 2 / (tanV * this.camera.aspect * fill);
    const d = Math.max(dH, dW);
    return { pos: p.clone().addScaledVector(n, d), look: p };
  }

  /** Ease the live pose toward the rest pose or the focused screen. */
  update(dt: number, rest: Pose, instant = false) {
    const goal = this.focused ? this.framing(this.focused) : rest;
    if (!this.started || instant) {
      this.pose.pos.copy(goal.pos);
      this.pose.look.copy(goal.look);
      this.started = true;
      return this.pose;
    }
    // Exponential smoothing: frame rate independent and never overshoots.
    const k = 1 - Math.exp(-dt * 7);
    this.pose.pos.lerp(goal.pos, k);
    this.pose.look.lerp(goal.look, k);
    return this.pose;
  }
}
