import * as THREE from 'three';
import { Grid3D } from '../grid';
import { CollapsedCell } from '../wfc/solve';
import { DIR } from '../wfc/sockets';
import { Tile } from '../wfc/tiles';
import { getTileMesh, tileCenterPoint, tileSocketAnchors } from './tileMeshes';
import { warpGeometry, warpPoint } from './warp';

export interface TrackBuild {
  meshes: Array<{ geom: THREE.BufferGeometry; parent: string }>;
  /** Path in world space that the marble follows, start→end. */
  path: THREE.Vector3[];
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  /** Number of cells on the resolved path (diagnostic). */
  pathCellCount: number;
}

/** Build visual track meshes + a marble path in world space by walking start→end. */
export function buildTrack(
  grid: Grid3D,
  tiles: Tile[],
  collapsed: CollapsedCell[],
  startCellId: number,
  endCellId: number,
): TrackBuild {
  const meshes: TrackBuild['meshes'] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const cell = grid.cells[i]!;
    const cc = collapsed[i]!;
    const tile = tiles[cc.tileId]!;
    const base = getTileMesh(tile.meshKey);
    if (!base) continue;
    const geom = warpGeometry(base, cell, tile.rotation);
    meshes.push({ geom, parent: cc.parent });
  }

  // Build the flow path by walking the directed graph from start→end.
  // For each visited cell emit: entry-socket anchor, center, exit-socket anchor (all warped to world).
  const path: THREE.Vector3[] = [];
  const visited = new Set<number>();
  const stack: Array<{ cell: number; entryDir: number | null }> = [
    { cell: startCellId, entryDir: null },
  ];
  let found = false;
  while (stack.length && !found) {
    const frame = stack[stack.length - 1]!;
    const { cell: cid } = frame;
    if (visited.has(cid)) {
      stack.pop();
      continue;
    }
    visited.add(cid);
    const cell = grid.cells[cid]!;
    const cc = collapsed[cid]!;
    const tile = tiles[cc.tileId]!;
    const anchors = tileSocketAnchors(tile.meshKey);
    const anchorsRot = rotateAnchors(anchors, tile.rotation);

    // Emit the anchor for the entry face if any, then the centre
    if (frame.entryDir !== null) {
      const entryKey = dirKey(frame.entryDir);
      const a = anchorsRot[entryKey];
      if (a) path.push(warpPoint(a, cell, 0));
    } else {
      // start cell — begin at its "T" (drop_in) or center
      const a = anchorsRot.T ?? tileCenterPoint(tile.meshKey);
      path.push(warpPoint(a, cell, 0));
    }
    path.push(warpPoint(tileCenterPoint(tile.meshKey), cell, 0));

    if (cid === endCellId) {
      found = true;
      break;
    }

    // pick an exit: any open face that is not the entry face and leads to an unvisited cell
    let advanced = false;
    for (let d = 0; d < 6; d++) {
      if (frame.entryDir !== null && d === frame.entryDir) continue;
      const face = faceByDir(tile, d);
      if (!face.open) continue;
      const nid = neighbourByDir(cell, d);
      if (nid < 0) continue;
      if (visited.has(nid)) continue;
      const exitKey = dirKey(d);
      const a = anchorsRot[exitKey];
      if (a) path.push(warpPoint(a, cell, 0));
      // neighbour enters via its opposite face; for sides we use the stored neighbour-edge,
      // for vertical the usual T↔B swap.
      let entryOnN: number;
      if (d === DIR.T) entryOnN = DIR.B;
      else if (d === DIR.B) entryOnN = DIR.T;
      else entryOnN = cell.sidesNeighbourEdge[d]!;
      stack.push({ cell: nid, entryDir: entryOnN });
      advanced = true;
      break;
    }
    if (!advanced) {
      // dead end — backtrack
      stack.pop();
      // remove the last two points we emitted (entry+center), since this branch didn't work
      path.length = Math.max(0, path.length - 2);
      visited.delete(cid);
    }
  }

  const startWorld = path[0] ?? new THREE.Vector3();
  const endWorld = path[path.length - 1] ?? startWorld.clone();
  return { meshes, path, startPos: startWorld, endPos: endWorld, pathCellCount: visited.size };
}

function faceByDir(tile: Tile, d: number) {
  if (d === DIR.T) return tile.faces.T;
  if (d === DIR.B) return tile.faces.B;
  const fs = [tile.faces.N, tile.faces.E, tile.faces.S, tile.faces.W];
  return fs[d]!;
}

function neighbourByDir(cell: import('../grid').PrismCell, d: number): number {
  if (d === DIR.T) return cell.top;
  if (d === DIR.B) return cell.bottom;
  return cell.sides[d] ?? -1;
}

function dirKey(d: number): 'N' | 'E' | 'S' | 'W' | 'T' | 'B' {
  return (['N', 'E', 'S', 'W', 'T', 'B'] as const)[d]!;
}

/** Rotate a tile's socket anchor map for a 90°*k rotation around +y. */
function rotateAnchors(
  anchors: ReturnType<typeof tileSocketAnchors>,
  k: 0 | 1 | 2 | 3,
): Record<'N' | 'E' | 'S' | 'W' | 'T' | 'B', THREE.Vector3 | undefined> {
  // The rotation convention in rotateFaces is: rotated.N = original.(N - k). Equivalently
  // a point that in the authored tile lived on face X now lives on face X+k.
  // So if original had an anchor at N, the rotated tile has that same rotated point on face N+k.
  const remap: Record<string, 'N' | 'E' | 'S' | 'W'> = {
    N: (['N', 'E', 'S', 'W'] as const)[(0 + k) % 4]!,
    E: (['N', 'E', 'S', 'W'] as const)[(1 + k) % 4]!,
    S: (['N', 'E', 'S', 'W'] as const)[(2 + k) % 4]!,
    W: (['N', 'E', 'S', 'W'] as const)[(3 + k) % 4]!,
  };
  const cosT = [1, 0, -1, 0][k]!;
  const sinT = [0, 1, 0, -1][k]!;
  const rotate = (v: THREE.Vector3) => {
    const x = v.x * cosT + v.z * sinT;
    const z = -v.x * sinT + v.z * cosT;
    return new THREE.Vector3(x, v.y, z);
  };
  const out: Record<'N' | 'E' | 'S' | 'W' | 'T' | 'B', THREE.Vector3 | undefined> = {
    N: undefined,
    E: undefined,
    S: undefined,
    W: undefined,
    T: anchors.T ? anchors.T.clone() : undefined,
    B: anchors.B ? anchors.B.clone() : undefined,
  };
  for (const src of ['N', 'E', 'S', 'W'] as const) {
    const v = anchors[src];
    if (!v) continue;
    out[remap[src]!] = rotate(v);
  }
  return out;
}
