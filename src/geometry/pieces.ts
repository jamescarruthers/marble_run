import * as THREE from 'three';
import { GROOVE_DEPTH, GROOVE_WIDTH, TILE_THICKNESS } from '../constants';

/**
 * Pieces are shallow unit-cube tiles (a thin slab at the bottom of the cell
 * with a curved groove carved into the top). The groove is defined by a 2-D
 * centerline in the tile's XZ plane, sampled at each grid vertex and
 * subtracting a half-circle cross-section where the vertex is close enough
 * to the centerline.
 *
 * Face convention (same as the grid): N = +z, E = +x, S = −z, W = −x.
 */

export type PieceName = 'EMPTY' | 'STRAIGHT' | 'CURVE_L' | 'CURVE_R' | 'START' | 'END';

export interface Piece {
  name: PieceName;
  rotations: 1 | 2 | 4;
  build: () => THREE.BufferGeometry;
}

/**
 * Approximate shortest distance from point (px, pz) to the open polyline
 * defined by `line`. Good enough for small N (≤ a few points).
 */
function distToPolyline(px: number, pz: number, line: ReadonlyArray<readonly [number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx;
    const cz = az + t * dz;
    const ex = px - cx;
    const ez = pz - cz;
    const d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) best = d;
  }
  return best;
}

/** Densify a centerline by linear interpolation so that the distance lookup
 *  is accurate for curved pieces. */
function densify(line: ReadonlyArray<readonly [number, number]>, steps = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, az] = line[i]!;
    const [bx, bz] = line[i + 1]!;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([ax + t * (bx - ax), az + t * (bz - az)]);
    }
  }
  out.push([line[line.length - 1]![0], line[line.length - 1]![1]]);
  return out;
}

/**
 * Build the tile mesh for a given groove centerline. Produces an indexed
 * BufferGeometry with:
 *   - a res×res top surface (with dipped groove)
 *   - four side walls from the top edge down to the slab bottom
 *   - a flat bottom face
 *
 * All coordinates are in the unit cube [-0.5, 0.5]^3; the slab top is at y=0
 * and the bottom is at y=−TILE_THICKNESS.
 */
function buildTileMesh(centerline: ReadonlyArray<readonly [number, number]>): THREE.BufferGeometry {
  const res = 28;
  const halfW = GROOVE_WIDTH / 2;
  const line = densify(centerline, 8);

  // Top grid of vertices with y dipped where close to the centerline.
  const h = res + 1;
  const topY = new Float32Array(h * h);
  const positions: number[] = [];
  for (let i = 0; i < h; i++) {
    for (let j = 0; j < h; j++) {
      const x = -0.5 + i / res;
      const z = -0.5 + j / res;
      const d = distToPolyline(x, z, line);
      let y = 0;
      if (d < halfW) {
        // concave half-circle, gentle at the rim, steepest at the centre.
        const t = d / halfW;
        const arc = Math.sqrt(Math.max(0, 1 - t * t));
        y = -arc * GROOVE_DEPTH;
      }
      topY[i * h + j] = y;
      positions.push(x, y, z);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const a = i * h + j;
      const b = (i + 1) * h + j;
      const c = (i + 1) * h + (j + 1);
      const d = i * h + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  // Side walls — one quad strip per tile side, following the dipped top profile.
  // Each side has (res+1) top samples; the bottom is a single Y.
  const bottomY = -TILE_THICKNESS;
  const ring = res + 1;
  const addSideStrip = (topIdxs: number[]): void => {
    const base = positions.length / 3;
    // push top verts (reuse positions for normals convenience)
    for (let k = 0; k < ring; k++) {
      const ti = topIdxs[k]!;
      positions.push(positions[ti * 3]!, positions[ti * 3 + 1]!, positions[ti * 3 + 2]!);
    }
    // bottom verts
    for (let k = 0; k < ring; k++) {
      const ti = topIdxs[k]!;
      positions.push(positions[ti * 3]!, bottomY, positions[ti * 3 + 2]!);
    }
    for (let k = 0; k < ring - 1; k++) {
      const t0 = base + k;
      const t1 = base + k + 1;
      const b0 = base + ring + k;
      const b1 = base + ring + k + 1;
      indices.push(t0, b0, t1, t1, b0, b1);
    }
  };
  // S side (z = -0.5): j=0, i varies 0..res
  addSideStrip(Array.from({ length: ring }, (_, k) => k * h + 0));
  // E side (x = +0.5): i=res, j varies
  addSideStrip(Array.from({ length: ring }, (_, k) => res * h + k));
  // N side (z = +0.5): j=res, i varies (reversed for outward normal)
  addSideStrip(Array.from({ length: ring }, (_, k) => (res - k) * h + res));
  // W side (x = -0.5): i=0, j varies (reversed)
  addSideStrip(Array.from({ length: ring }, (_, k) => 0 * h + (res - k)));

  // Flat bottom face (two triangles).
  const bl = positions.length / 3;
  positions.push(-0.5, bottomY, -0.5);
  positions.push(0.5, bottomY, -0.5);
  positions.push(0.5, bottomY, 0.5);
  positions.push(-0.5, bottomY, 0.5);
  indices.push(bl, bl + 2, bl + 1, bl, bl + 3, bl + 2);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// Merge helper for pieces that combine a tile with extra caps (bell, cup).
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

// ---------------------------------------------------------------------------
// Piece centerlines (canonical rotation 0).
// N = +z (entry), E = +x, S = −z, W = −x. Entry is always on face N.
// ---------------------------------------------------------------------------

const CENTERLINES: Record<Exclude<PieceName, 'EMPTY' | 'START' | 'END'>, Array<[number, number]>> & {
  START: Array<[number, number]>;
  END: Array<[number, number]>;
} = {
  // straight N → S
  STRAIGHT: [
    [0, 0.5],
    [0, 0],
    [0, -0.5],
  ],
  // Right curve: N → E. Quadratic-ish arc through the tile corner region.
  CURVE_R: [
    [0, 0.5],
    [0.05, 0.2],
    [0.2, 0.05],
    [0.5, 0],
  ],
  // Left curve: N → W.
  CURVE_L: [
    [0, 0.5],
    [-0.05, 0.2],
    [-0.2, 0.05],
    [-0.5, 0],
  ],
  // START + END are single-sided: groove runs from N edge to tile centre,
  // where the bell/cup sits.
  START: [
    [0, 0.5],
    [0, 0.1],
    [0, 0.0],
  ],
  END: [
    [0, 0.5],
    [0, 0.1],
    [0, 0.0],
  ],
};

function bell(): THREE.BufferGeometry {
  const funnel = new THREE.CylinderGeometry(0.22, 0.1, 0.28, 20, 2, true);
  funnel.translate(0, 0.14, 0);
  const lip = new THREE.TorusGeometry(0.22, 0.025, 10, 20);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, 0.28, 0);
  return merge([funnel, lip]);
}

function cup(): THREE.BufferGeometry {
  const cylinder = new THREE.CylinderGeometry(0.22, 0.16, 0.22, 20, 2, true);
  cylinder.translate(0, 0.11, 0);
  const base = new THREE.CircleGeometry(0.16, 20);
  base.rotateX(-Math.PI / 2);
  base.translate(0, 0, 0);
  const lip = new THREE.TorusGeometry(0.22, 0.025, 10, 20);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, 0.22, 0);
  return merge([cylinder, base, lip]);
}

export const PIECES: Piece[] = [
  {
    name: 'EMPTY',
    rotations: 1,
    build: () => new THREE.BufferGeometry(),
  },
  {
    name: 'STRAIGHT',
    rotations: 2,
    build: () => buildTileMesh(CENTERLINES.STRAIGHT),
  },
  {
    name: 'CURVE_R',
    rotations: 4,
    build: () => buildTileMesh(CENTERLINES.CURVE_R),
  },
  {
    name: 'CURVE_L',
    rotations: 4,
    build: () => buildTileMesh(CENTERLINES.CURVE_L),
  },
  {
    name: 'START',
    rotations: 4,
    build: () => merge([buildTileMesh(CENTERLINES.START), bell()]),
  },
  {
    name: 'END',
    rotations: 4,
    build: () => merge([buildTileMesh(CENTERLINES.END), cup()]),
  },
];

export const PIECE_BY_NAME: Record<PieceName, Piece> = PIECES.reduce(
  (a, p) => {
    a[p.name] = p;
    return a;
  },
  {} as Record<PieceName, Piece>,
);
