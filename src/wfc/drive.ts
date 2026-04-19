import { Grid3D } from '../grid';
import { PieceName } from '../geometry/pieces';
import { rngFrom, Rng } from '../util/rng';
import { DIR } from './sockets';

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

/**
 * BFS a path from a random top-layer cell to a random bottom-layer cell, then
 * pick (piece, rotation) for each path cell so entry/exit faces line up with
 * the walk. Horizontal→horizontal uses STRAIGHT/CURVE_L/CURVE_R; any step
 * between layers gets a DROP (down-only — the BFS never moves up).
 */
export function driveGenerate(grid: Grid3D): DriveResult | null {
  const rng = rngFrom(grid.seed ^ 0x9e3779b9);
  const topCells = grid.cells.filter((c) => c.iy === 0);
  const botCells = grid.cells.filter((c) => c.iy === grid.layers - 1);
  if (!topCells.length || !botCells.length) return null;

  const startCell = topCells[Math.floor(rng() * topCells.length)]!;
  const endCell = botCells[Math.floor(rng() * botCells.length)]!;

  // Force the first step out of start and last step into end to be horizontal
  // — START has a side exit and END has a side entry, not vertical.
  const startExit = pickHorizontalNeighbour(grid, startCell.id, rng);
  const endEntry = pickHorizontalNeighbour(grid, endCell.id, rng);
  if (startExit < 0 || endEntry < 0) return null;
  const afterStart = grid.cells[startCell.id]!.neighbours[startExit]!;
  const beforeEnd = grid.cells[endCell.id]!.neighbours[endEntry]!;

  const middle = bfs(grid, afterStart, beforeEnd, rng, new Set([startCell.id, endCell.id]));
  if (!middle) return null;
  const path = [startCell.id, ...middle, endCell.id];

  // Entry/exit directions for each path cell.
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
    const id = path[i]!;
    const entry = i === 0 ? DIR.T : entries[i]!;
    const exit = i === path.length - 1 ? null : exits[i]!;
    const picked = pickPiece(entry, exit, i === 0, i === path.length - 1);
    if (!picked) return null;
    assignments[id] = picked;
  }
  return {
    assignments,
    pathCellIds: path,
    startCellId: startCell.id,
    endCellId: endCell.id,
  };
}

// ---------------------------------------------------------------------------

const OPP = [2, 3, 0, 1, 5, 4] as const;

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
    // Preference: go down first, then sideways, never up.
    const ordered: number[] = [];
    if (cell.neighbours[DIR.B]! >= 0) ordered.push(cell.neighbours[DIR.B]!);
    const horiz: number[] = [];
    for (let d = 0; d < 4; d++) {
      if (cell.neighbours[d]! >= 0) horiz.push(cell.neighbours[d]!);
    }
    for (let i = horiz.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [horiz[i], horiz[j]] = [horiz[j]!, horiz[i]!];
    }
    ordered.push(...horiz);
    for (const n of ordered) {
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
 * Pick a (piece, rotation) given the entry/exit face indices (0..5).
 * Rotation k of a piece moves its canonical face i to face (i+k)%4, so to
 * place canonical entry face `ce` at world face `we` we set k = (we−ce)%4.
 */
function pickPiece(
  entry: number,
  exit: number | null,
  isStart: boolean,
  isEnd: boolean,
): CellAssignment | null {
  if (isStart) {
    if (exit === null || exit === DIR.T || exit === DIR.B) return null;
    return { name: 'START', rotation: rot4(exit) };
  }
  if (isEnd) {
    if (entry === DIR.T || entry === DIR.B) return null;
    return { name: 'END', rotation: rot4(entry) };
  }
  // vertical pass-through: T → B (or the reverse)
  if ((entry === DIR.T && exit === DIR.B) || (entry === DIR.B && exit === DIR.T)) {
    return { name: 'PIPE', rotation: 0 };
  }
  // vertical transits with a horizontal side
  if (entry < 4 && exit === DIR.B) {
    // side → down: DROP oriented with its canonical N entry at the world entry face.
    return { name: 'DROP', rotation: rot4(entry) };
  }
  if (entry === DIR.T && exit !== null && exit < 4) {
    // drop-in at top → exit via a side: reuse DROP rotated so its side opening faces
    // the exit (visual is an upside-down drop — OK for the "basic pieces" set).
    return { name: 'DROP', rotation: rot4(exit) };
  }
  // horizontal → horizontal
  if (entry < 4 && exit !== null && exit < 4) {
    const turn = (exit - entry + 4) % 4;
    if (turn === 2) return { name: 'STRAIGHT', rotation: rot4(entry) };
    if (turn === 1) return { name: 'CURVE_R', rotation: rot4(entry) };
    if (turn === 3) return { name: 'CURVE_L', rotation: rot4(entry) };
  }
  return null;
}

function rot4(k: number): 0 | 1 | 2 | 3 {
  return (((k % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}
