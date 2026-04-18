import { FlowSide, FlowVert, TileFaces } from './sockets';

export interface AuthoredTile {
  name: string;
  weight: number;
  rotations: 1 | 4;
  faces: TileFaces;
  meshKey: string;
  collisionKey: string;
  /** true if tile is pre-placed and should not appear in the default domain */
  special?: 'START' | 'END';
}

export interface Tile {
  id: number;
  parent: string;
  rotation: 0 | 1 | 2 | 3;
  weight: number;
  faces: TileFaces;
  meshKey: string;
  collisionKey: string;
  special?: 'START' | 'END';
}

const closed: FlowSide = { open: false };
const vClosed: FlowVert = { open: false };
const dropIn: FlowVert = { open: true, dir: 'drop_in' };
const dropOut: FlowVert = { open: true, dir: 'drop_out' };

// NOTE: in practice we use 'both' on sides; directionality is derived from gravity +
// the authored mesh geometry at render/physics time, not from socket direction. Keeping
// `in`/`out` allowed by the type but not used reduces WFC contradiction cascades
// without losing gravity compatibility (that's encoded in the T/B drop_in/drop_out).
const sH = (_dir: 'in' | 'out' | 'both'): FlowSide => ({ open: true, height: 2, dir: 'both' });
const sM = (_dir: 'in' | 'out' | 'both'): FlowSide => ({ open: true, height: 1, dir: 'both' });
const sL = (_dir: 'in' | 'out' | 'both'): FlowSide => ({ open: true, height: 0, dir: 'both' });

export const AUTHORED_TILES: AuthoredTile[] = [
  {
    name: 'EMPTY',
    weight: 0.5,
    rotations: 1,
    faces: { N: closed, E: closed, S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'none',
    collisionKey: 'none',
  },
  {
    name: 'SOLID',
    weight: 0.3,
    rotations: 1,
    faces: { N: closed, E: closed, S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'solid',
    collisionKey: 'none',
  },
  {
    name: 'START',
    weight: 0.0,
    rotations: 4,
    faces: { N: sH('out'), E: closed, S: closed, W: closed, T: dropIn, B: vClosed },
    meshKey: 'start',
    collisionKey: 'start',
    special: 'START',
  },
  {
    name: 'END',
    weight: 0.0,
    rotations: 4,
    faces: { N: sL('in'), E: closed, S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'end',
    collisionKey: 'end',
    special: 'END',
  },
  {
    name: 'SLOPE_HL',
    weight: 5.0,
    rotations: 4,
    faces: { N: sH('in'), E: closed, S: sL('out'), W: closed, T: vClosed, B: vClosed },
    meshKey: 'slope_hl',
    collisionKey: 'slope_hl',
  },
  {
    name: 'FLAT_MM',
    weight: 1.5,
    rotations: 4,
    faces: { N: sM('both'), E: closed, S: sM('both'), W: closed, T: vClosed, B: vClosed },
    meshKey: 'flat_mm',
    collisionKey: 'flat_mm',
  },
  {
    name: 'FLAT_LL',
    weight: 2.0,
    rotations: 4,
    faces: { N: sL('both'), E: closed, S: sL('both'), W: closed, T: vClosed, B: vClosed },
    meshKey: 'flat_ll',
    collisionKey: 'flat_ll',
  },
  {
    name: 'FLAT_HH',
    weight: 2.0,
    rotations: 4,
    faces: { N: sH('both'), E: closed, S: sH('both'), W: closed, T: vClosed, B: vClosed },
    meshKey: 'flat_hh',
    collisionKey: 'flat_hh',
  },
  {
    name: 'CURVE_LL',
    weight: 2.0,
    rotations: 4,
    faces: { N: sL('both'), E: sL('both'), S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'curve_ll',
    collisionKey: 'curve_ll',
  },
  {
    name: 'CURVE_HH',
    weight: 2.0,
    rotations: 4,
    faces: { N: sH('both'), E: sH('both'), S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'curve_hh',
    collisionKey: 'curve_hh',
  },
  {
    name: 'CURVE_R_HL',
    weight: 4.0,
    rotations: 4,
    faces: { N: sH('in'), E: sL('out'), S: closed, W: closed, T: vClosed, B: vClosed },
    meshKey: 'curve_r_hl',
    collisionKey: 'curve_r_hl',
  },
  {
    name: 'CURVE_L_HL',
    weight: 4.0,
    rotations: 4,
    faces: { N: sH('in'), E: closed, S: closed, W: sL('out'), T: vClosed, B: vClosed },
    meshKey: 'curve_l_hl',
    collisionKey: 'curve_l_hl',
  },
  {
    name: 'DROP',
    weight: 3.0,
    rotations: 4,
    faces: { N: sL('in'), E: closed, S: closed, W: closed, T: vClosed, B: dropOut },
    meshKey: 'drop',
    collisionKey: 'drop',
  },
  {
    name: 'CATCHER',
    weight: 3.0,
    rotations: 4,
    faces: { N: sH('out'), E: closed, S: closed, W: closed, T: dropIn, B: vClosed },
    meshKey: 'catcher',
    collisionKey: 'catcher',
  },
  {
    name: 'PIPE',
    weight: 2.0,
    rotations: 1,
    faces: { N: closed, E: closed, S: closed, W: closed, T: dropIn, B: dropOut },
    meshKey: 'pipe',
    collisionKey: 'pipe',
  },
];
