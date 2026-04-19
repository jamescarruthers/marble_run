import * as THREE from 'three';
import { HEIGHT_BANDS, TRACK_TUBE_RADIUS } from '../constants';

/**
 * Authored preset pieces. Each piece is defined in the unit cube [-0.5, 0.5]^3
 * with y up. Face anchors live at the midpoint of each face at a specific
 * height band (L / M / H). Rotations are generated automatically.
 *
 * Face/axis convention (must match warp.ts and the WFC socket labels):
 *   N = +z, E = +x, S = −z, W = −x, T = +y, B = −y.
 */

export type Height = 'L' | 'M' | 'H';

export const bandY = (h: Height): number =>
  (h === 'L' ? HEIGHT_BANDS.L : h === 'M' ? HEIGHT_BANDS.M : HEIGHT_BANDS.H) - 0.5;

/** Anchor at the midpoint of face `d` at height band `h`. d: 0=N, 1=E, 2=S, 3=W. */
export function sideAnchor(d: 0 | 1 | 2 | 3, h: Height): THREE.Vector3 {
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
export const topAnchor = (): THREE.Vector3 => new THREE.Vector3(0, 0.5, 0);
export const bottomAnchor = (): THREE.Vector3 => new THREE.Vector3(0, -0.5, 0);

// ---------------------------------------------------------------------------
// Socket descriptor — what's open, at what height, with what flow dir.
// ---------------------------------------------------------------------------

export type SideSocket = null | { h: Height };
export type VertSocket = null | 'drop_in' | 'drop_out';

export interface PieceSockets {
  /** Sides indexed N, E, S, W at rotation 0. */
  sides: [SideSocket, SideSocket, SideSocket, SideSocket];
  top: VertSocket;
  bottom: VertSocket;
}

// ---------------------------------------------------------------------------
// Piece definitions
// ---------------------------------------------------------------------------

export type PieceName =
  | 'EMPTY'
  | 'STRAIGHT_L'
  | 'STRAIGHT_M'
  | 'STRAIGHT_H'
  | 'SLOPE_HL'
  | 'CURVE_R'
  | 'CURVE_L'
  | 'DROP'
  | 'CATCHER'
  | 'PIPE'
  | 'WHEEL'
  | 'SPLITTER'
  | 'START'
  | 'END';

export interface Piece {
  name: PieceName;
  sockets: PieceSockets;
  /** number of distinct rotations (1 for rotationally symmetric pieces). */
  rotations: 1 | 2 | 4;
  /** Build the tile's static visual + collision geometry in the unit cube. */
  build: () => THREE.BufferGeometry;
  /** Extra dynamic rigid bodies (e.g. the wheel). Optional. */
  buildDynamics?: (info: PieceDynamicInfo) => PieceDynamic[];
  /** default weight for WFC-style selection */
  weight?: number;
  /** True if this piece should *only* be placed via the driven pass. */
  special?: 'START' | 'END' | 'WHEEL' | 'SPLITTER';
}

export interface PieceDynamicInfo {
  /** World-space transform of the unit cube's origin (result of warping (0,0,0)). */
  origin: THREE.Vector3;
  /** Y axis of the prism in world space (should be mostly +Y). */
  yAxis: THREE.Vector3;
}

export interface PieceDynamic {
  kind: 'wheel';
  worldPos: THREE.Vector3;
  radius: number;
  axisLocal: THREE.Vector3; // axis of rotation in world space
  visual: THREE.BufferGeometry;
}

// -- Shared builders --------------------------------------------------------

function tube(points: THREE.Vector3[], radius = TRACK_TUBE_RADIUS): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  return new THREE.TubeGeometry(curve, Math.max(12, points.length * 6), radius, 10, false);
}

function merge(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Merge into a single BufferGeometry (position + normal + index) so callers
  // get one mesh per piece. Rebuilds indices per source geometry and re-bases.
  let totalVerts = 0;
  let totalIdx = 0;
  for (const g of geoms) {
    g.computeVertexNormals();
    const pos = g.getAttribute('position');
    if (!pos) continue;
    totalVerts += pos.count;
    const idx = g.getIndex();
    totalIdx += idx ? idx.count : pos.count;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIdx);
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

// -- Specific pieces --------------------------------------------------------

const closed: PieceSockets = { sides: [null, null, null, null], top: null, bottom: null };

export const PIECES: Piece[] = [
  {
    name: 'EMPTY',
    sockets: closed,
    rotations: 1,
    weight: 0.5,
    build: () => new THREE.BufferGeometry(),
  },
  {
    name: 'STRAIGHT_L',
    sockets: { sides: [{ h: 'L' }, null, { h: 'L' }, null], top: null, bottom: null },
    rotations: 2,
    weight: 2,
    build: () => tube([sideAnchor(0, 'L'), new THREE.Vector3(0, bandY('L'), 0), sideAnchor(2, 'L')]),
  },
  {
    name: 'STRAIGHT_M',
    sockets: { sides: [{ h: 'M' }, null, { h: 'M' }, null], top: null, bottom: null },
    rotations: 2,
    weight: 2,
    build: () => tube([sideAnchor(0, 'M'), new THREE.Vector3(0, bandY('M'), 0), sideAnchor(2, 'M')]),
  },
  {
    name: 'STRAIGHT_H',
    sockets: { sides: [{ h: 'H' }, null, { h: 'H' }, null], top: null, bottom: null },
    rotations: 2,
    weight: 2,
    build: () => tube([sideAnchor(0, 'H'), new THREE.Vector3(0, bandY('H'), 0), sideAnchor(2, 'H')]),
  },
  {
    name: 'SLOPE_HL',
    sockets: { sides: [{ h: 'H' }, null, { h: 'L' }, null], top: null, bottom: null },
    rotations: 4,
    weight: 5,
    build: () =>
      tube([
        sideAnchor(0, 'H'),
        new THREE.Vector3(0, bandY('M'), 0.1),
        new THREE.Vector3(0, bandY('M') - 0.08, -0.1),
        sideAnchor(2, 'L'),
      ]),
  },
  {
    name: 'CURVE_R',
    // N → E, descending from H to L (clockwise from above at canonical rotation)
    sockets: { sides: [{ h: 'H' }, { h: 'L' }, null, null], top: null, bottom: null },
    rotations: 4,
    weight: 4,
    build: () =>
      tube([
        sideAnchor(0, 'H'),
        new THREE.Vector3(0.15, bandY('M'), 0.15),
        new THREE.Vector3(0.3, bandY('L'), 0),
        sideAnchor(1, 'L'),
      ]),
  },
  {
    name: 'CURVE_L',
    // N → W, descending from H to L (counter-clockwise)
    sockets: { sides: [{ h: 'H' }, null, null, { h: 'L' }], top: null, bottom: null },
    rotations: 4,
    weight: 4,
    build: () =>
      tube([
        sideAnchor(0, 'H'),
        new THREE.Vector3(-0.15, bandY('M'), 0.15),
        new THREE.Vector3(-0.3, bandY('L'), 0),
        sideAnchor(3, 'L'),
      ]),
  },
  {
    name: 'DROP',
    // Side entry at L → drops out bottom
    sockets: { sides: [{ h: 'L' }, null, null, null], top: null, bottom: 'drop_out' },
    rotations: 4,
    weight: 3,
    build: () =>
      tube([sideAnchor(0, 'L'), new THREE.Vector3(0, bandY('L') - 0.1, 0.0), bottomAnchor()]),
  },
  {
    name: 'CATCHER',
    // Drops in from top → exits side at H
    sockets: { sides: [{ h: 'H' }, null, null, null], top: 'drop_in', bottom: null },
    rotations: 4,
    weight: 3,
    build: () =>
      merge([
        tube([
          topAnchor(),
          new THREE.Vector3(0, 0.2, 0),
          new THREE.Vector3(0, bandY('H') + 0.06, 0.15),
          sideAnchor(0, 'H'),
        ]),
        (() => {
          const rim = new THREE.TorusGeometry(0.18, 0.04, 10, 20);
          rim.rotateX(Math.PI / 2);
          rim.translate(0, 0.45, 0);
          return rim;
        })(),
      ]),
  },
  {
    name: 'PIPE',
    // Straight vertical drop
    sockets: { sides: [null, null, null, null], top: 'drop_in', bottom: 'drop_out' },
    rotations: 1,
    weight: 2.5,
    build: () => tube([topAnchor(), new THREE.Vector3(0, 0, 0), bottomAnchor()], TRACK_TUBE_RADIUS * 1.2),
  },
  {
    name: 'WHEEL',
    // Drops in from top, flings out via side at H. Wheel is a dynamic body
    // built at warp time in buildDynamics.
    sockets: { sides: [{ h: 'H' }, null, null, null], top: 'drop_in', bottom: null },
    rotations: 4,
    weight: 1.2,
    special: 'WHEEL',
    build: () => {
      // housing + splash chute
      const chute = tube([topAnchor(), new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, bandY('H') + 0.1, 0)]);
      const bowl = new THREE.CylinderGeometry(0.34, 0.3, 0.05, 24, 1, true);
      bowl.translate(0, bandY('H') + 0.02, 0);
      const spout = tube([
        new THREE.Vector3(0.2, bandY('H') + 0.06, 0.05),
        sideAnchor(0, 'H'),
      ]);
      return merge([chute, bowl, spout]);
    },
    buildDynamics: (info) => {
      const radius = 0.28;
      const wheelGeom = new THREE.CylinderGeometry(radius, radius, 0.1, 24);
      wheelGeom.rotateZ(Math.PI / 2); // lay flat? We actually want the wheel spinning around Y
      // For a horizontal paddle wheel we want the cylinder axis = world Y.
      wheelGeom.rotateZ(-Math.PI / 2); // back to upright. See buildTrack for final placement.
      const paddles: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        const p = new THREE.BoxGeometry(0.5, 0.06, 0.08);
        p.rotateY((i * Math.PI) / 2);
        paddles.push(p);
      }
      const visual = merge([wheelGeom, ...paddles]);
      return [
        {
          kind: 'wheel',
          worldPos: info.origin.clone().add(info.yAxis.clone().multiplyScalar(bandY('H') + 0.08)),
          radius,
          axisLocal: info.yAxis.clone(),
          visual,
        },
      ];
    },
  },
  {
    name: 'SPLITTER',
    // Drops in from top, exits both E and W at L
    sockets: { sides: [null, { h: 'L' }, null, { h: 'L' }], top: 'drop_in', bottom: null },
    rotations: 2,
    weight: 1.0,
    special: 'SPLITTER',
    build: () => {
      const pin = new THREE.ConeGeometry(0.1, 0.18, 12);
      pin.translate(0, bandY('M') + 0.1, 0);
      const rightLeg = tube([
        new THREE.Vector3(0, bandY('M'), 0),
        new THREE.Vector3(0.2, bandY('L') + 0.05, 0),
        sideAnchor(1, 'L'),
      ]);
      const leftLeg = tube([
        new THREE.Vector3(0, bandY('M'), 0),
        new THREE.Vector3(-0.2, bandY('L') + 0.05, 0),
        sideAnchor(3, 'L'),
      ]);
      const inlet = tube([topAnchor(), new THREE.Vector3(0, bandY('M') + 0.05, 0)]);
      return merge([inlet, pin, leftLeg, rightLeg]);
    },
  },
  {
    name: 'START',
    // Drops in from above (from the sky), exits side at H
    sockets: { sides: [{ h: 'H' }, null, null, null], top: 'drop_in', bottom: null },
    rotations: 4,
    weight: 0,
    special: 'START',
    build: () => {
      const funnel = new THREE.CylinderGeometry(0.3, 0.12, 0.35, 24, 2, true);
      funnel.translate(0, 0.2, 0);
      const lip = new THREE.TorusGeometry(0.3, 0.03, 10, 24);
      lip.rotateX(Math.PI / 2);
      lip.translate(0, 0.4, 0);
      const chute = tube([new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(0, bandY('H') + 0.05, 0.1), sideAnchor(0, 'H')]);
      return merge([funnel, lip, chute]);
    },
  },
  {
    name: 'END',
    sockets: { sides: [{ h: 'L' }, null, null, null], top: null, bottom: null },
    rotations: 4,
    weight: 0,
    special: 'END',
    build: () => {
      const cup = new THREE.CylinderGeometry(0.32, 0.22, 0.35, 24, 2, true);
      cup.translate(0, -0.2, 0);
      const base = new THREE.CircleGeometry(0.22, 24);
      base.rotateX(-Math.PI / 2);
      base.translate(0, -0.38, 0);
      const lip = new THREE.TorusGeometry(0.32, 0.03, 10, 24);
      lip.rotateX(Math.PI / 2);
      lip.translate(0, -0.02, 0);
      const inlet = tube([sideAnchor(0, 'L'), new THREE.Vector3(0, -0.2, 0)]);
      return merge([cup, base, lip, inlet]);
    },
  },
];

export const PIECE_BY_NAME: Record<PieceName, Piece> = PIECES.reduce(
  (acc, p) => {
    acc[p.name] = p;
    return acc;
  },
  {} as Record<PieceName, Piece>,
);
