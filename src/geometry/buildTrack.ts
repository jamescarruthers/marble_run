import * as THREE from 'three';
import { DROP_PER_TILE } from '../constants';
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

  // Each path cell sits DROP_PER_TILE world units below the previous one so
  // their tilted groove edges line up into one continuous gradient. Cells
  // that aren't on the path stay at the grid's flat baseline (y from cell.centre).
  const pathYOffset = new Map<number, number>();
  for (let i = 0; i < pathCellIds.length; i++) {
    pathYOffset.set(pathCellIds[i]!, -i * DROP_PER_TILE);
  }

  for (let cellId = 0; cellId < assignments.length; cellId++) {
    const a = assignments[cellId]!;
    if (a.name === 'EMPTY') continue;
    const piece = PIECE_BY_NAME[a.name];
    if (!piece) continue;
    const base = piece.build();
    if (!base.getAttribute('position')) continue;
    const cell = grid.cells[cellId]!;
    const yOff = pathYOffset.get(cellId) ?? 0;
    const centre: [number, number, number] = [cell.centre[0], cell.centre[1] + yOff, cell.centre[2]];
    const placed = transformToCell(base, centre, a.rotation, grid.scale);
    meshes.push({ parent: piece.name, geom: placed });
    colliderSources.push(placed);
  }

  const collisionGeom = mergeIndexed(colliderSources);

  const startCell = grid.cells[startCellId]!;
  const endCell = grid.cells[endCellId]!;
  const startY = startCell.centre[1] + (pathYOffset.get(startCellId) ?? 0);
  const endY = endCell.centre[1] + (pathYOffset.get(endCellId) ?? 0);
  // Marble drops in from above the START tile's bell so it can fall into the funnel.
  const startPos = new THREE.Vector3(startCell.centre[0], startY + grid.scale * 0.6, startCell.centre[2]);
  const endPos = new THREE.Vector3(endCell.centre[0], endY, endCell.centre[2]);
  const path = pathCellIds.map((id, i) => {
    const c = grid.cells[id]!;
    return new THREE.Vector3(c.centre[0], c.centre[1] - i * DROP_PER_TILE, c.centre[2]);
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
