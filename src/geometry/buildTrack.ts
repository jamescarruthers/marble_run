import * as THREE from 'three';
import { Grid3D } from '../grid';
import { CellAssignment } from '../wfc/drive';
import { PIECE_BY_NAME, PieceDynamic } from './pieces';
import { warpGeometry, warpPoint } from './warp';

export interface TrackMesh {
  /** Name of the authored piece this mesh came from — for material selection. */
  parent: string;
  geom: THREE.BufferGeometry;
}

export interface TrackBuild {
  /** Per-cell visual BufferGeometries (already warped into world space). */
  meshes: TrackMesh[];
  /** One combined indexed BufferGeometry used by Rapier as a trimesh collider. */
  collisionGeom: THREE.BufferGeometry;
  /** Dynamic bodies extracted from special pieces (wheels). */
  dynamics: PieceDynamic[];
  /** Marble drop position (slightly above the START bell). */
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  /** Debug: world-space waypoints along the path. */
  path: THREE.Vector3[];
  pathCellCount: number;
}

export function buildTrack(
  grid: Grid3D,
  assignments: CellAssignment[],
  pathCellIds: number[],
  startCellId: number,
  endCellId: number,
): TrackBuild {
  const meshes: TrackMesh[] = [];
  const colliderSources: THREE.BufferGeometry[] = [];
  const dynamics: PieceDynamic[] = [];

  for (let cellId = 0; cellId < assignments.length; cellId++) {
    const a = assignments[cellId]!;
    if (a.name === 'EMPTY') continue;
    const piece = PIECE_BY_NAME[a.name];
    if (!piece) continue;
    const base = piece.build();
    if (!base.getAttribute('position')) continue;
    const cell = grid.cells[cellId]!;
    const warped = warpGeometry(base, cell, a.rotation);
    meshes.push({ parent: piece.name, geom: warped });
    colliderSources.push(warped);

    if (piece.buildDynamics) {
      const origin = warpPoint(new THREE.Vector3(0, 0, 0), cell, a.rotation);
      const above = warpPoint(new THREE.Vector3(0, 0.5, 0), cell, a.rotation);
      const yAxis = above.clone().sub(origin).normalize();
      dynamics.push(...piece.buildDynamics({ origin, yAxis }));
    }
  }

  const collisionGeom = mergeIndexedGeoms(colliderSources);

  // Path waypoints come from cell centres (lifted a little toward the piece's
  // typical height) — used by the camera framing and marble start position.
  const path: THREE.Vector3[] = pathCellIds.map((id) => cellCentre(grid, id));
  const startCell = grid.cells[startCellId]!;
  const endCell = grid.cells[endCellId]!;
  // Marble spawn point: inside the START cell, near the top, so it falls naturally into the bell.
  const startPos = warpPoint(new THREE.Vector3(0, 0.35, 0), startCell, assignments[startCellId]!.rotation);
  const endPos = cellCentre(grid, endCell.id);

  return {
    meshes,
    collisionGeom,
    dynamics,
    startPos,
    endPos,
    path,
    pathCellCount: pathCellIds.length,
  };
}

function cellCentre(grid: Grid3D, cellId: number): THREE.Vector3 {
  const c = grid.cells[cellId]!;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of c.bottomQuad) {
    x += v[0];
    z += v[1];
    y += v[2];
  }
  for (const v of c.topQuad) {
    x += v[0];
    z += v[1];
    y += v[2];
  }
  return new THREE.Vector3(x / 8, y / 8, z / 8);
}

/** Merge many indexed BufferGeometries into one, preserving per-vertex position. */
function mergeIndexedGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertTotal = 0;
  let idxTotal = 0;
  for (const g of geoms) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    vertTotal += pos.count;
    const idx = g.getIndex();
    idxTotal += idx ? idx.count : pos.count;
  }
  if (vertTotal === 0) {
    return new THREE.BufferGeometry();
  }
  const positions = new Float32Array(vertTotal * 3);
  const normals = new Float32Array(vertTotal * 3);
  const indices = new Uint32Array(idxTotal);
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
