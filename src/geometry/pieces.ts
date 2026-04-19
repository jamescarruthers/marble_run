import * as THREE from 'three';
import { HEIGHT_BANDS, TRACK_TUBE_RADIUS } from '../constants';

/**
 * Authored preset pieces in a unit cube [-0.5, 0.5]^3 (y up). A cell of
 * world-size `scale` just copies the mesh and multiplies coordinates by
 * `scale` in buildTrack — there's no bilinear warp because all cells are
 * axis-aligned cubes of identical shape.
 *
 * Face convention: N = +z, E = +x, S = −z, W = −x, T = +y, B = −y.
 */

export type Height = 'L' | 'M' | 'H';

const bandY = (h: Height): number =>
  (h === 'L' ? HEIGHT_BANDS.L : h === 'M' ? HEIGHT_BANDS.M : HEIGHT_BANDS.H) - 0.5;

function sideAnchor(d: 0 | 1 | 2 | 3, h: Height): THREE.Vector3 {
  const y = bandY(h);
  switch (d) {
    case 0:
      return new THREE.Vector3(0, y, 0.5);
    case 1:
      return new THREE.Vector3(0.5, y, 0);
    case 2:
      return new THREE.Vector3(0, y, -0.5);
    case 3:
      return new THREE.Vector3(-0.5, y, 0);
  }
}
const topAnchor = (): THREE.Vector3 => new THREE.Vector3(0, 0.5, 0);
const bottomAnchor = (): THREE.Vector3 => new THREE.Vector3(0, -0.5, 0);

function tube(points: THREE.Vector3[], radius = TRACK_TUBE_RADIUS): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, Math.max(16, points.length * 6), radius, 10, false);
}

function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalV = 0;
  let totalI = 0;
  for (const g of geoms) {
    g.computeVertexNormals();
    const p = g.getAttribute('position');
    if (!p) continue;
    totalV += p.count;
    const idx = g.getIndex();
    totalI += idx ? idx.count : p.count;
  }
  const positions = new Float32Array(totalV * 3);
  const normals = new Float32Array(totalV * 3);
  const indices = new Uint32Array(totalI);
  let vOff = 0;
  let iOff = 0;
  for (const g of geoms) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined;
    const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) {
      positions[(vOff + i) * 3] = pos.getX(i);
      positions[(vOff + i) * 3 + 1] = pos.getY(i);
      positions[(vOff + i) * 3 + 2] = pos.getZ(i);
      if (nrm) {
        normals[(vOff + i) * 3] = nrm.getX(i);
        normals[(vOff + i) * 3 + 1] = nrm.getY(i);
        normals[(vOff + i) * 3 + 2] = nrm.getZ(i);
      }
    }
    const idx = g.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices[iOff + i] = idx.getX(i) + vOff;
      iOff += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOff + i] = vOff + i;
      iOff += pos.count;
    }
    vOff += pos.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  return out;
}

export type PieceName = 'EMPTY' | 'STRAIGHT' | 'CURVE_L' | 'CURVE_R' | 'DROP' | 'PIPE' | 'START' | 'END';

export interface Piece {
  name: PieceName;
  /** Rotations are 90°-around-Y; 1, 2 or 4 distinct variants. */
  rotations: 1 | 2 | 4;
  build: () => THREE.BufferGeometry;
}

export const PIECES: Piece[] = [
  {
    name: 'EMPTY',
    rotations: 1,
    build: () => new THREE.BufferGeometry(),
  },
  {
    name: 'STRAIGHT',
    // Canonical entry N (face 0) at M height, exit S (face 2) at M height. Flat.
    rotations: 2,
    build: () =>
      tube([sideAnchor(0, 'M'), new THREE.Vector3(0, bandY('M'), 0), sideAnchor(2, 'M')]),
  },
  {
    name: 'CURVE_L',
    // Canonical entry N, exit W. Left turn when marble is heading south.
    rotations: 4,
    build: () =>
      tube([
        sideAnchor(0, 'M'),
        new THREE.Vector3(-0.15, bandY('M'), 0.15),
        new THREE.Vector3(-0.3, bandY('M'), 0.0),
        sideAnchor(3, 'M'),
      ]),
  },
  {
    name: 'CURVE_R',
    // Canonical entry N, exit E. Right turn when marble is heading south.
    rotations: 4,
    build: () =>
      tube([
        sideAnchor(0, 'M'),
        new THREE.Vector3(0.15, bandY('M'), 0.15),
        new THREE.Vector3(0.3, bandY('M'), 0.0),
        sideAnchor(1, 'M'),
      ]),
  },
  {
    name: 'PIPE',
    // Straight vertical pass-through: T → B.
    rotations: 1,
    build: () => tube([topAnchor(), new THREE.Vector3(0, 0, 0), bottomAnchor()]),
  },
  {
    name: 'DROP',
    // Side entry N at M height, falls straight through the floor (B).
    rotations: 4,
    build: () =>
      tube([
        sideAnchor(0, 'M'),
        new THREE.Vector3(0, bandY('M') - 0.05, 0),
        new THREE.Vector3(0, bandY('L') - 0.05, 0),
        bottomAnchor(),
      ]),
  },
  {
    name: 'START',
    // Drop-bell at the top of the cell, chute emerges on face N at M height.
    rotations: 4,
    build: () => {
      const funnel = new THREE.CylinderGeometry(0.3, 0.12, 0.3, 24, 2, true);
      funnel.translate(0, 0.25, 0);
      const lip = new THREE.TorusGeometry(0.3, 0.03, 10, 24);
      lip.rotateX(Math.PI / 2);
      lip.translate(0, 0.4, 0);
      const chute = tube([new THREE.Vector3(0, 0.2, 0), new THREE.Vector3(0, bandY('M') + 0.05, 0.1), sideAnchor(0, 'M')]);
      return merge([funnel, lip, chute]);
    },
  },
  {
    name: 'END',
    // Catch cup. Entry on N at M height.
    rotations: 4,
    build: () => {
      const cup = new THREE.CylinderGeometry(0.32, 0.22, 0.35, 24, 2, true);
      cup.translate(0, -0.2, 0);
      const base = new THREE.CircleGeometry(0.22, 24);
      base.rotateX(-Math.PI / 2);
      base.translate(0, -0.38, 0);
      const lip = new THREE.TorusGeometry(0.32, 0.03, 10, 24);
      lip.rotateX(Math.PI / 2);
      lip.translate(0, -0.02, 0);
      const inlet = tube([sideAnchor(0, 'M'), new THREE.Vector3(0, -0.1, 0)]);
      return merge([cup, base, lip, inlet]);
    },
  },
];

export const PIECE_BY_NAME: Record<PieceName, Piece> = PIECES.reduce(
  (a, p) => {
    a[p.name] = p;
    return a;
  },
  {} as Record<PieceName, Piece>,
);
