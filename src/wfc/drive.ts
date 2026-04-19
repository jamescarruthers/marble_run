import { Grid3D } from '../grid';
import { PieceName } from '../geometry/pieces';
import { rngFrom, Rng } from '../util/rng';

export interface CellAssignment {
  name: PieceName;
  rotation: 0 | 1 | 2 | 3;
}

export interface DriveResult {
  assignments: CellAssignment[];
  pathCellIds: number[];
  startCellId: number;
  endCellId: number;
}

const EMPTY: CellAssignment = { name: 'EMPTY', rotation: 0 };
const OPP = [2, 3, 0, 1, 5, 4] as const;

/**
 * Single-layer driven generator. Picks a random start cell and a random end
 * cell on the same layer (layer 0 since we're flat now), BFS a path between
 * them through horizontal neighbours, and assign a piece + rotation per path
 * cell from the (entry, exit) face pair.
 */
export function driveGenerate(grid: Grid3D): DriveResult | null {
  const rng = rngFrom(grid.seed ^ 0x9e3779b9);
  const cells = grid.cells;
  if (cells.length < 2) return null;

  // Prefer start + end on opposite edges of the board for a longer walk.
  const edgeCells = cells.filter((c) => c.ix === 0 || c.ix === grid.width - 1 || c.iz === 0 || c.iz === grid.depth - 1);
  if (edgeCells.length < 2) return null;

  const startCell = edgeCells[Math.floor(rng() * edgeCells.length)]!;
  // end cell: pick from cells whose manhattan distance is at least half the grid
  const minDist = Math.max(2, Math.floor((grid.width + grid.depth) / 2));
  const endCandidates = cells.filter((c) => {
    const d = Math.abs(c.ix - startCell.ix) + Math.abs(c.iz - startCell.iz);
    return d >= minDist && c.id !== startCell.id;
  });
  if (!endCandidates.length) return null;
  const endCell = endCandidates[Math.floor(rng() * endCandidates.length)]!;

  // Force first move out of start and last move into end to be horizontal
  // (they always are on a single layer, but this also picks which face of
  // start/end the groove emerges from).
  const startExit = pickHorizontalNeighbour(grid, startCell.id, rng);
  const endEntry = pickHorizontalNeighbour(grid, endCell.id, rng);
  if (startExit < 0 || endEntry < 0) return null;
  const afterStart = grid.cells[startCell.id]!.neighbours[startExit]!;
  const beforeEnd = grid.cells[endCell.id]!.neighbours[endEntry]!;

  const middle = bfs(grid, afterStart, beforeEnd, rng, new Set([startCell.id, endCell.id]));
  if (!middle) return null;
  const path = [startCell.id, ...middle, endCell.id];

  const entries: (number | null)[] = new Array(path.length).fill(null);
  const exits: (number | null)[] = new Array(path.length).fill(null);
  for (let i = 0; i < path.length - 1; i++) {
    const a = grid.cells[path[i]!]!;
    const bId = path[i + 1]!;
    const d = a.neighbours.indexOf(bId);
    if (d < 0) return null;
    exits[i] = d;
    entries[i + 1] = OPP[d]!;
  }

  const assignments: CellAssignment[] = grid.cells.map(() => EMPTY);
  for (let i = 0; i < path.length; i++) {
    const entry = i === 0 ? null : entries[i] ?? null;
    const exit = i === path.length - 1 ? null : exits[i] ?? null;
    const picked = pickPiece(entry, exit, i === 0, i === path.length - 1);
    if (!picked) return null;
    assignments[path[i]!] = picked;
  }

  return {
    assignments,
    pathCellIds: path,
    startCellId: startCell.id,
    endCellId: endCell.id,
  };
}

// ---------------------------------------------------------------------------

function pickHorizontalNeighbour(grid: Grid3D, cellId: number, rng: Rng): number {
  const cell = grid.cells[cellId]!;
  const avail: number[] = [];
  for (let d = 0; d < 4; d++) if (cell.neighbours[d]! >= 0) avail.push(d);
  if (!avail.length) return -1;
  return avail[Math.floor(rng() * avail.length)]!;
}

function bfs(grid: Grid3D, startId: number, endId: number, rng: Rng, blocked: Set<number> = new Set()): number[] | null {
  const prev = new Int32Array(grid.cells.length).fill(-1);
  const visited = new Uint8Array(grid.cells.length);
  visited[startId] = 1;
  for (const b of blocked) visited[b] = 1;
  visited[startId] = 1;
  const queue: number[] = [startId];
  while (queue.length) {
    const c = queue.shift()!;
    if (c === endId) break;
    const cell = grid.cells[c]!;
    const neighbours: number[] = [];
    for (let d = 0; d < 4; d++) if (cell.neighbours[d]! >= 0) neighbours.push(cell.neighbours[d]!);
    for (let i = neighbours.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [neighbours[i], neighbours[j]] = [neighbours[j]!, neighbours[i]!];
    }
    for (const n of neighbours) {
      if (visited[n]) continue;
      visited[n] = 1;
      prev[n] = c;
      queue.push(n);
    }
  }
  if (prev[endId] === -1 && startId !== endId) return null;
  const out: number[] = [];
  for (let c = endId; c !== -1; c = prev[c]!) out.push(c);
  out.reverse();
  return out;
}

/**
 * Map an (entry, exit) face pair to a piece + rotation. Rotation k of a piece
 * moves its canonical face i to face (i+k)%4; our canonical entry is always
 * N (face 0), so to place canonical entry on world face `f` we set k = f.
 */
function pickPiece(entry: number | null, exit: number | null, isStart: boolean, isEnd: boolean): CellAssignment | null {
  if (isStart) {
    if (exit === null || exit >= 4) return null;
    return { name: 'START', rotation: rot4(exit) };
  }
  if (isEnd) {
    if (entry === null || entry >= 4) return null;
    return { name: 'END', rotation: rot4(entry) };
  }
  if (entry === null || exit === null || entry >= 4 || exit >= 4) return null;
  const turn = (exit - entry + 4) % 4;
  if (turn === 2) return { name: 'STRAIGHT', rotation: rot4(entry) };
  if (turn === 1) return { name: 'CURVE_R', rotation: rot4(entry) };
  if (turn === 3) return { name: 'CURVE_L', rotation: rot4(entry) };
  return null;
}

function rot4(k: number): 0 | 1 | 2 | 3 {
  return (((k % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
