import * as THREE from 'three';
import { PrismCell } from '../grid';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();

/**
 * Trilinear warp from the unit cube `[-0.5, 0.5]^3` into a prismatic cell.
 *
 * Face/edge convention (must match the tile socket labels):
 *   N = +z (face idx 0)  →  prism side[0]  (edge v0→v1)
 *   E = +x (face idx 1)  →  prism side[1]  (edge v1→v2)
 *   S = −z (face idx 2)  →  prism side[2]  (edge v2→v3)
 *   W = −x (face idx 3)  →  prism side[3]  (edge v3→v0)
 *   T = +y, B = −y.
 *
 * The bilinear parameters (u, v) map (0,0)→v0, (1,0)→v1, (1,1)→v2, (0,1)→v3.
 * That requires v to run N→S, so v = 0.5 − p.z, not p.z + 0.5.
 */
export function warp(
  p: THREE.Vector3,
  cell: PrismCell,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const u = p.x + 0.5;
  const v = 0.5 - p.z;
  const h = p.y + 0.5;
  const [b0, b1, b2, b3] = cell.bottomQuad;
  const [t0, t1, t2, t3] = cell.topQuad;
  // grid coords are (x, y_horizontal, z_up); three.js is (x, y_up, z_horizontal)
  tmpA.set(b0[0], b0[2], b0[1]);
  tmpB.set(b1[0], b1[2], b1[1]);
  tmpC.set(b2[0], b2[2], b2[1]);
  tmpD.set(b3[0], b3[2], b3[1]);
  const ab = tmpA.lerp(tmpB, u);
  const dc = tmpD.lerp(tmpC, u);
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

/** Warp a BufferGeometry into `cell` after rotating its points by `k·90°` around +y. */
export function warpGeometry(
  geom: THREE.BufferGeometry,
  cell: PrismCell,
  rotation: 0 | 1 | 2 | 3,
): THREE.BufferGeometry {
  const cloned = geom.clone();
  const pos = cloned.getAttribute('position') as THREE.BufferAttribute;
  const cosT = [1, 0, -1, 0][rotation]!;
  const sinT = [0, 1, 0, -1][rotation]!;
  const p = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const x = p.x * cosT + p.z * sinT;
    const z = -p.x * sinT + p.z * cosT;
    p.set(x, p.y, z);
    warp(p, cell, out);
    pos.setXYZ(i, out.x, out.y, out.z);
  }
  pos.needsUpdate = true;
  cloned.computeVertexNormals();
  return cloned;
}

/** Warp a single authored unit-cube point through rotation + prism. */
export function warpPoint(
  p: THREE.Vector3,
  cell: PrismCell,
  rotation: 0 | 1 | 2 | 3,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const cosT = [1, 0, -1, 0][rotation]!;
  const sinT = [0, 1, 0, -1][rotation]!;
  const x = p.x * cosT + p.z * sinT;
  const z = -p.x * sinT + p.z * cosT;
  return warp(new THREE.Vector3(x, p.y, z), cell, out);
}
