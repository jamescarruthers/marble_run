import * as THREE from 'three';
import { Grid3D } from '../grid';
import { CellAssignment } from '../wfc/drive';
import { PIECE_BY_NAME } from './pieces';

export interface TrackMesh {
  parent: string;
  geom: THREE.BufferGeometry;
}

export interface TrackBuild {
  meshes: TrackMesh[];
  collisionGeom: THREE.BufferGeometry;
  /** Reserved for pieces that emit dynamic bodies (wheels, paddles). Empty today. */
  dynamics: never[];
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  path: THREE.Vector3[];
  pathCellCount: number;
}

/**
 * Place each path-cell's piece mesh at its world-space cell centre, rotated
 * by k·90° around Y. No bilinear warp is needed — every cell is an identical
 * axis-aligned cube, so a uniform scale + translate lines everything up.
 */
export function buildTrack(
  grid: Grid3D,
  assignments: CellAssignment[],
  pathCellIds: number[],
  startCellId: number,
  endCellId: number,
): TrackBuild {
  const meshes: TrackMesh[] = [];
  const colliderSources: THREE.BufferGeometry[] = [];

  for (let cellId = 0; cellId < assignments.length; cellId++) {
    const a = assignments[cellId]!;
    if (a.name === 'EMPTY') continue;
    const piece = PIECE_BY_NAME[a.name];
    if (!piece) continue;
    const base = piece.build();
    if (!base.getAttribute('position')) continue;
    const cell = grid.cells[cellId]!;
    const placed = transformToCell(base, cell.centre, a.rotation, grid.scale);
    meshes.push({ parent: piece.name, geom: placed });
    colliderSources.push(placed);
  }

  const collisionGeom = mergeIndexed(colliderSources);

  const startCell = grid.cells[startCellId]!;
  const endCell = grid.cells[endCellId]!;
  const startPos = new THREE.Vector3(startCell.centre[0], startCell.centre[1] + grid.scale * 0.4, startCell.centre[2]);
  const endPos = new THREE.Vector3(endCell.centre[0], endCell.centre[1], endCell.centre[2]);
  const path = pathCellIds.map((id) => {
    const c = grid.cells[id]!;
    return new THREE.Vector3(c.centre[0], c.centre[1], c.centre[2]);
  });

  return {
    meshes,
    collisionGeom,
    dynamics: [] as never[],
    startPos,
    endPos,
    path,
    pathCellCount: pathCellIds.length,
  };
}

/** Clone the unit-cube geometry, scale + rotate k·90° about Y, translate to `centre`. */
function transformToCell(
  geom: THREE.BufferGeometry,
  centre: [number, number, number],
  rotation: 0 | 1 | 2 | 3,
  scale: number,
): THREE.BufferGeometry {
  const out = geom.clone();
  const pos = out.getAttribute('position') as THREE.BufferAttribute;
  const cosT = [1, 0, -1, 0][rotation]!;
  const sinT = [0, 1, 0, -1][rotation]!;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rx = x * cosT + z * sinT;
    const rz = -x * sinT + z * cosT;
    pos.setXYZ(i, rx * scale + centre[0], y * scale + centre[1], rz * scale + centre[2]);
  }
  pos.needsUpdate = true;
  out.computeVertexNormals();
  return out;
}

function mergeIndexed(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalV = 0;
  let totalI = 0;
  for (const g of geoms) {
    const p = g.getAttribute('position');
    if (!p) continue;
    totalV += p.count;
    const idx = g.getIndex();
    totalI += idx ? idx.count : p.count;
  }
  if (totalV === 0) return new THREE.BufferGeometry();
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
