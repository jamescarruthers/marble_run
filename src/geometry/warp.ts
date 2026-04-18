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
 * Unit-cube face convention (must match the socket/face labels):
 *   N = +z (face index 0)  →  prism side[0] = edge (v0 → v1)
 *   E = +x (face index 1)  →  prism side[1] = edge (v1 → v2)
 *   S = −z (face index 2)  →  prism side[2] = edge (v2 → v3)
 *   W = −x (face index 3)  →  prism side[3] = edge (v3 → v0)
 *   T = +y, B = −y.
 *
 * To keep the "unit cube face i → prism side i" mapping consistent, the
 * bilinear parameters are chosen so that (u=0, v=0) hits v0, (u=1, v=0) hits v1,
 * (u=1, v=1) hits v2, (u=0, v=1) hits v3. That requires v to run N → S, i.e.
 * v = 0.5 − p.z (not p.z + 0.5). Without this, every tile's N-face anchor
 * warps to the prism's S-side edge, so no two neighbouring tubes meet.
 */
export function warp(p: THREE.Vector3, cell: PrismCell, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
  const u = p.x + 0.5; // 0..1 (W→E)
  const v = 0.5 - p.z; // 0..1 (N→S)
  const h = p.y + 0.5; // 0..1 (B→T)

  const [b0, b1, b2, b3] = cell.bottomQuad;
  const [t0, t1, t2, t3] = cell.topQuad;

  // grid coords are [x, y, z_up]; three.js wants (x, y_up, z). Rewrite with y=z_grid.
  tmpA.set(b0[0], b0[2], b0[1]); // v0  → (u=0, v=0)
  tmpB.set(b1[0], b1[2], b1[1]); // v1  → (u=1, v=0)
  tmpC.set(b2[0], b2[2], b2[1]); // v2  → (u=1, v=1)
  tmpD.set(b3[0], b3[2], b3[1]); // v3  → (u=0, v=1)
  const ab = tmpA.lerp(tmpB, u); // v=0 edge  (v0 → v1)
  const dc = tmpD.lerp(tmpC, u); // v=1 edge  (v3 → v2)
  const bot = ab.lerp(dc, v).clone();

  tmpA.set(t0[0], t0[2], t0[1]);
  tmpB.set(t1[0], t1[2], t1[1]);
  tmpC.set(t2[0], t2[2], t2[1]);
  tmpD.set(t3[0], t3[2], t3[1]);
  const abT = tmpA.lerp(tmpB, u);
  const dcT = tmpD.lerp(tmpC, u);
  const top = abT.lerp(dcT, v);

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
