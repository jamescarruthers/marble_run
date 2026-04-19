import { Grid3D, PrismCell } from '../grid';
import { rngFrom, Rng } from '../util/rng';
import { PIECE_BY_NAME, PieceName } from '../geometry/pieces';
import { DIR } from './sockets';

export interface CellAssignment {
  name: PieceName;
  rotation: 0 | 1 | 2 | 3;
}

export interface DriveResult {
  /** One assignment per cell in the grid. Non-path cells are EMPTY. */
  assignments: CellAssignment[];
  /** Cells visited by the marble path, in order. */
  pathCellIds: number[];
  startCellId: number;
  endCellId: number;
}

const EMPTY_ASSIGN: CellAssignment = { name: 'EMPTY', rotation: 0 };

/** Driven generator: walk a BFS path through the grid, assign an authored piece
 *  + rotation to each path cell so the entry/exit faces match the walk, and
 *  leave every other cell as EMPTY. No WFC needed because EMPTY is compatible
 *  with everything and the path is the only part we care about visually.
 */
export function driveGenerate(grid: Grid3D): DriveResult | null {
  const rng = rngFrom(grid.seed ^ 0x9e3779b9);

  const topCandidates = grid.cells.filter(
    (c) => c.layer === grid.layers - 1 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  const botCandidates = grid.cells.filter(
    (c) => c.layer === 0 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  if (!topCandidates.length || !botCandidates.length) return null;

  const startCell = topCandidates[Math.floor(rng() * topCandidates.length)]!;
  const endCell = botCandidates[Math.floor(rng() * botCandidates.length)]!;
  const startExit = pickHorizontalNeighbour(startCell, rng);
  const endEntry = pickHorizontalNeighbour(endCell, rng);
  if (startExit < 0 || endEntry < 0) return null;

  const afterStart = startCell.sides[startExit]!;
  const beforeEnd = endCell.sides[endEntry]!;
  const middle = biasedBFS(grid, afterStart, beforeEnd, rng, new Set([startCell.id, endCell.id]));
  if (!middle) return null;
  const pathCellIds = [startCell.id, ...middle, endCell.id];

  // Assign a piece per cell.
  const assignments: CellAssignment[] = grid.cells.map(() => EMPTY_ASSIGN);
  const entries: (number | null)[] = new Array(pathCellIds.length).fill(null);
  const exits: (number | null)[] = new Array(pathCellIds.length).fill(null);
  for (let i = 0; i < pathCellIds.length - 1; i++) {
    const a = grid.cells[pathCellIds[i]!]!;
    const bId = pathCellIds[i + 1]!;
    const d = dirFromTo(a, bId);
    if (d < 0) return null;
    exits[i] = d;
    entries[i + 1] =
      d === DIR.T ? DIR.B : d === DIR.B ? DIR.T : a.sidesNeighbourEdge[d]!;
  }

  for (let i = 0; i < pathCellIds.length; i++) {
    const entry = i === 0 ? DIR.T : entries[i]!;
    const exit = i === pathCellIds.length - 1 ? null : exits[i]!;
    const picked = pickPiece(entry, exit, i === 0, i === pathCellIds.length - 1, rng);
    if (!picked) return null;
    assignments[pathCellIds[i]!] = picked;
  }

  return { assignments, pathCellIds, startCellId: startCell.id, endCellId: endCell.id };
}

// ---------------------------------------------------------------------------
// Path walking
// ---------------------------------------------------------------------------

function pickHorizontalNeighbour(cell: PrismCell, rng: Rng): number {
  const avail: number[] = [];
  for (let i = 0; i < 4; i++) if (cell.sides[i]! >= 0) avail.push(i);
  if (!avail.length) return -1;
  return avail[Math.floor(rng() * avail.length)]!;
}

function biasedBFS(
  grid: Grid3D,
  startId: number,
  endId: number,
  rng: Rng,
  blocked: Set<number>,
): number[] | null {
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
    if (cell.bottom >= 0) neighbours.push(cell.bottom);
    const sides: number[] = [];
    for (let i = 0; i < 4; i++) if (cell.sides[i]! >= 0) sides.push(cell.sides[i]!);
    for (let i = sides.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [sides[i], sides[j]] = [sides[j]!, sides[i]!];
    }
    neighbours.push(...sides);
    if (cell.top >= 0) neighbours.push(cell.top);
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

function dirFromTo(from: PrismCell, toId: number): number {
  if (from.top === toId) return DIR.T;
  if (from.bottom === toId) return DIR.B;
  for (let i = 0; i < 4; i++) if (from.sides[i] === toId) return i;
  return -1;
}

// ---------------------------------------------------------------------------
// Piece picker — turn (entry, exit) into (PieceName, rotation).
// ---------------------------------------------------------------------------

/**
 * Canonical rotation convention: a piece at rotation k has each face-i of the
 * rotated tile holding the mesh content originally at face (i−k). Equivalently
 * the original face-0 appears on face k, face-1 on (k+1)%4, etc.
 * So "rotate the piece until its canonical entry face lands on `eWorld`" is
 * just `k = (eWorld − canonicalEntry + 4) % 4`.
 */
function pickPiece(
  entry: number,
  exit: number | null,
  isStart: boolean,
  isEnd: boolean,
  rng: Rng,
): CellAssignment | null {
  if (isStart) {
    if (exit === null || exit === DIR.T || exit === DIR.B) return null;
    return orient('START', 0, exit);
  }
  if (isEnd) {
    if (entry === DIR.T || entry === DIR.B) return null;
    return orient('END', 0, entry);
  }
  // Vertical pass-through
  if ((entry === DIR.T && exit === DIR.B) || (entry === DIR.B && exit === DIR.T)) {
    return { name: 'PIPE', rotation: 0 };
  }
  // Top-in → side-out: CATCHER / WHEEL (and occasionally SPLITTER with one dead-leg)
  if (entry === DIR.T && exit !== null && exit < 4) {
    const roll = rng();
    const piece: PieceName = roll < 0.12 ? 'WHEEL' : roll < 0.22 ? 'SPLITTER' : 'CATCHER';
    if (piece === 'SPLITTER') {
      // SPLITTER canonical exits at E(1) and W(3). We need one of them on `exit`.
      // k such that (1+k)%4 == exit  →  k = (exit-1+4)%4
      return { name: 'SPLITTER', rotation: (((exit - 1 + 4) % 4) as 0 | 1 | 2 | 3) };
    }
    return orient(piece, 0, exit);
  }
  // Side-in → bottom-out: DROP
  if (entry < 4 && exit === DIR.B) {
    return orient('DROP', 0, entry);
  }
  // Top-in → bottom-out covered by PIPE above; B-in → side-out is unusual (anti-gravity),
  // treat it as CATCHER-style because the renderer doesn't care about direction.
  if (entry === DIR.B && exit !== null && exit < 4) {
    return orient('CATCHER', 0, exit);
  }
  // Side-in → top-out: reverse DROP visually
  if (entry < 4 && exit === DIR.T) {
    return orient('DROP', 0, entry);
  }
  // Horizontal entry → horizontal exit
  if (entry < 4 && exit !== null && exit < 4) {
    const turn = (exit - entry + 4) % 4;
    if (turn === 2) {
      // straight through — slope occasionally, otherwise flat at the entry's height band
      const pick = rng();
      const name: PieceName = pick < 0.45 ? 'SLOPE_HL' : pick < 0.7 ? 'STRAIGHT_M' : pick < 0.85 ? 'STRAIGHT_L' : 'STRAIGHT_H';
      return orient(name, 0, entry);
    }
    if (turn === 1) return orient('CURVE_R', 0, entry); // right turn from entry
    if (turn === 3) return orient('CURVE_L', 0, entry); // left turn from entry
  }
  return null;
}

/** Rotate piece `name` so its canonical entry face lines up with `worldEntry`. */
function orient(name: PieceName, canonicalEntry: number, worldEntry: number): CellAssignment {
  const piece = PIECE_BY_NAME[name];
  if (!piece) throw new Error(`unknown piece ${name}`);
  const k = ((worldEntry - canonicalEntry + 4) % 4) as 0 | 1 | 2 | 3;
  // clamp for pieces that aren't full-4 rotation symmetric
  const finalK = ((k % piece.rotations) as 0 | 1 | 2 | 3);
  return { name, rotation: finalK };
}
