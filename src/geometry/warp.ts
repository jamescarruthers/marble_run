import * as THREE from 'three';
import { PrismCell } from '../grid';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/**
 * Trilinearly interpolates a point inside the unit cube [-0.5, 0.5]^3
 * into the prism defined by the cell's bottom and top quads.
 *
 * Unit-cube convention: x = W→E (quad edge 3→0 bottom → edge 3→0 top), y = up (layer axis),
 * z = S→N. Face labels: N = +z, E = +x, S = -z, W = -x, T = +y, B = -y.
 *
 * bottomQuad CCW order from above: v0 (SW), v1 (SE), v2 (NE), v3 (NW).
 */
export function warp(p: THREE.Vector3, cell: PrismCell, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const u = p.x + 0.5; // 0..1 (W→E)
  const v = p.z + 0.5; // 0..1 (S→N)
  const h = p.y + 0.5; // 0..1 (B→T)

  const [b0, b1, b2, b3] = cell.bottomQuad;
  const [t0, t1, t2, t3] = cell.topQuad;

  // bilerp bottom
  tmpA.set(b0[0], b0[2], b0[1]); // (x,y,z) → three js (x, z_world→y up, y_world→z). In our grid, z is up; convert.
  tmpB.set(b1[0], b1[2], b1[1]);
  tmpC.set(b2[0], b2[2], b2[1]);
  tmpD.set(b3[0], b3[2], b3[1]);
  const sx1 = tmpA.lerp(tmpB, u);
  const nx1 = tmpD.lerp(tmpC, u);
  const bot = sx1.lerp(nx1, v).clone();

  tmpA.set(t0[0], t0[2], t0[1]);
  tmpB.set(t1[0], t1[2], t1[1]);
  tmpC.set(t2[0], t2[2], t2[1]);
  tmpD.set(t3[0], t3[2], t3[1]);
  const sx2 = tmpA.lerp(tmpB, u);
  const nx2 = tmpD.lerp(tmpC, u);
  const top = sx2.lerp(nx2, v);

  out.copy(bot).lerp(top, h);
  return out;
}

/** Warp a BufferGeometry's position attribute in place. Rotation k rotates around world-up (+y three). */
export function warpGeometry(geom: THREE.BufferGeometry, cell: PrismCell, rotation: 0 | 1 | 2 | 3): THREE.BufferGeometry {
  const cloned = geom.clone();
  const pos = cloned.attributes.position as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  const out = new THREE.Vector3();
  // apply rotation around y in unit-cube space before warp
  const cosT = [1, 0, -1, 0][rotation]!;
  const sinT = [0, 1, 0, -1][rotation]!;
  for (let i = 0; i < pos.count; i++) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    // rotate xz around origin by k*90°
    const x = p.x * cosT + p.z * sinT;
    const z = -p.x * sinT + p.z * cosT;
    p.x = x;
    p.z = z;
    warp(p, cell, out);
    pos.setXYZ(i, out.x, out.y, out.z);
  }
  pos.needsUpdate = true;
  cloned.computeVertexNormals();
  return cloned;
}

/** Warp a single point through rotation + prism. */
export function warpPoint(p: THREE.Vector3, cell: PrismCell, rotation: 0 | 1 | 2 | 3, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const cosT = [1, 0, -1, 0][rotation]!;
  const sinT = [0, 1, 0, -1][rotation]!;
  const x = p.x * cosT + p.z * sinT;
  const z = -p.x * sinT + p.z * cosT;
  const local = new THREE.Vector3(x, p.y, z);
  return warp(local, cell, out);
}
