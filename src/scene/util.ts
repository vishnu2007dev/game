import * as THREE from 'three';

/**
 * Replace a geometry's UVs with a planar projection in world units, so
 * neighbouring panels sample one continuous texture instead of each
 * repeating the same patch.
 */
export function projectUV(
  geo: THREE.BufferGeometry,
  offset: THREE.Vector3,
  metresPerTile: number,
  plane: 'xy' | 'xz' | 'zy' = 'xy',
) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const normal = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    let a: number;
    let b: number;
    // Side faces use the axis they actually run along, otherwise the
    // texture smears into stripes on thin edges.
    const nx = normal ? Math.abs(normal.getX(i)) : 0;
    const ny = normal ? Math.abs(normal.getY(i)) : 0;
    const nz = normal ? Math.abs(normal.getZ(i)) : 0;
    if (plane === 'xy') {
      if (nx > 0.7) [a, b] = [z, y];
      else if (ny > 0.7) [a, b] = [x, z];
      else [a, b] = [x, y];
    } else if (plane === 'xz') {
      if (nz > 0.7) [a, b] = [x, y];
      else if (nx > 0.7) [a, b] = [z, y];
      else [a, b] = [x, z];
    } else {
      if (nz > 0.7) [a, b] = [x, y];
      else if (ny > 0.7) [a, b] = [x, z];
      else [a, b] = [z, y];
    }
    uv[i * 2] = a / metresPerTile;
    uv[i * 2 + 1] = b / metresPerTile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function shadows<T extends THREE.Object3D>(obj: T, cast = true, receive = true): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

/** Hex socket cap screws or rivets as one instanced mesh. */
export function fasteners(
  points: THREE.Vector3[],
  opts: { radius: number; height?: number; normal?: THREE.Vector3; material: THREE.Material; segments?: number },
) {
  const geo = new THREE.CylinderGeometry(opts.radius, opts.radius * 1.05, opts.height ?? opts.radius * 0.7, opts.segments ?? 6);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, opts.material, points.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const n = opts.normal ?? new THREE.Vector3(0, 0, 1);
  const base = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  points.forEach((p, i) => {
    // Each fastener is turned a little differently, like a real panel.
    q.setFromAxisAngle(n, (i * 1.7) % (Math.PI / 3)).multiply(base);
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
