import { Grid3D, PrismCell } from '../grid';
import { rngFrom } from '../util/rng';
import { CollapsedCell } from './solve';
import { DIR } from './sockets';
import { AUTHORED_TILES, Tile } from './tiles';

/**
 * Driven generation: randomly walk a path from a top-layer interior cell down to a
 * bottom-layer interior cell, then assign each cell on the path a tile that realises
 * the required in/out face pattern. Remaining cells become EMPTY. Guarantees a
 * connected, gravity-compatible path every time.
 */
export function driveGenerate(grid: Grid3D, tiles: Tile[]): {
  collapsed: CollapsedCell[];
  startCellId: number;
  endCellId: number;
} | null {
  const rng = rngFrom(grid.seed ^ 0x9e3779b9);

  // Pick start (top layer interior) and end (bottom layer interior)
  const topCandidates = grid.cells.filter(
    (c) => c.layer === grid.layers - 1 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  const botCandidates = grid.cells.filter(
    (c) => c.layer === 0 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  if (topCandidates.length === 0 || botCandidates.length === 0) return null;
  const startCell = topCandidates[Math.floor(rng() * topCandidates.length)]!;
  const endCell = botCandidates[Math.floor(rng() * botCandidates.length)]!;

  // Pick horizontal neighbour of start to exit toward, and of end to enter from.
  const startExit = pickHorizontalNeighbour(startCell, rng);
  const endEntry = pickHorizontalNeighbour(endCell, rng);
  if (startExit < 0 || endEntry < 0) return null;
  const afterStart = startCell.sides[startExit]!;
  const beforeEnd = endCell.sides[endEntry]!;

  const middle = biasedWalk(grid, afterStart, beforeEnd, rng, new Set([startCell.id, endCell.id]));
  if (!middle) return null;
  const pathCellIds = [startCell.id, ...middle, endCell.id];

  // Figure out the entry/exit direction for each cell on the path.
  // entries[i] and exits[i] are direction indices 0..5.
  const entries: (number | null)[] = new Array(pathCellIds.length).fill(null);
  const exits: (number | null)[] = new Array(pathCellIds.length).fill(null);
  for (let i = 0; i < pathCellIds.length - 1; i++) {
    const a = grid.cells[pathCellIds[i]!]!;
    const b = pathCellIds[i + 1]!;
    const d = dirFromTo(a, b);
    if (d < 0) return null;
    exits[i] = d;
    const nextDir = d === DIR.T ? DIR.B : d === DIR.B ? DIR.T : a.sidesNeighbourEdge[d]!;
    entries[i + 1] = nextDir;
  }

  // Start cell: entry is T (drop_in from above). End cell: exit is N-or-whatever (cup).
  const collapsed: CollapsedCell[] = grid.cells.map(() => {
    const emptyTile = tiles.find((t) => t.parent === 'EMPTY')!;
    return { tileId: emptyTile.id, parent: 'EMPTY', rotation: 0 };
  });

  for (let i = 0; i < pathCellIds.length; i++) {
    const cellId = pathCellIds[i]!;
    const entry = i === 0 ? DIR.T : entries[i]!;
    const exit = i === pathCellIds.length - 1 ? null : exits[i]!;
    const tile = pickTileFor(tiles, entry, exit, i === 0, i === pathCellIds.length - 1);
    if (!tile) return null;
    collapsed[cellId] = { tileId: tile.id, parent: tile.parent, rotation: tile.rotation };
  }

  return { collapsed, startCellId: startCell.id, endCellId: endCell.id };
}

function pickHorizontalNeighbour(cell: PrismCell, rng: () => number): number {
  const avail: number[] = [];
  for (let i = 0; i < 4; i++) if (cell.sides[i]! >= 0) avail.push(i);
  if (avail.length === 0) return -1;
  return avail[Math.floor(rng() * avail.length)]!;
}

function biasedWalk(
  grid: Grid3D,
  startId: number,
  endId: number,
  rng: () => number,
  blocked: Set<number>,
): number[] | null {
  const prev = new Int32Array(grid.cells.length).fill(-1);
  const visited = new Uint8Array(grid.cells.length);
  const queue: number[] = [startId];
  visited[startId] = 1;
  for (const b of blocked) visited[b] = 1;
  visited[startId] = 1;
  let found = false;
  while (queue.length) {
    const c = queue.shift()!;
    if (c === endId) {
      found = true;
      break;
    }
    const cell = grid.cells[c]!;
    const neighbours: number[] = [];
    if (cell.bottom >= 0) neighbours.push(cell.bottom);
    if (cell.top >= 0) neighbours.push(cell.top);
    for (let i = 0; i < 4; i++) if (cell.sides[i]! >= 0) neighbours.push(cell.sides[i]!);
    // shuffle for variety with each seed
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
  if (!found) return null;
  // reconstruct
  const path: number[] = [];
  for (let c = endId; c !== -1; c = prev[c]!) path.push(c);
  path.reverse();
  return path;
}

function dirFromTo(from: PrismCell, toId: number): number {
  if (from.top === toId) return DIR.T;
  if (from.bottom === toId) return DIR.B;
  for (let i = 0; i < 4; i++) if (from.sides[i] === toId) return i;
  return -1;
}

/**
 * Pick a tile for a path cell given its entry direction and exit direction.
 * entry/exit are direction indices 0..5 (N=0,E=1,S=2,W=3,T=4,B=5).
 * For horizontal entries/exits, we pick tiles by parent name and rotation such that
 * the entry/exit directions become open faces on the tile at those positions.
 */
function pickTileFor(
  tiles: Tile[],
  entry: number,
  exit: number | null,
  isStart: boolean,
  isEnd: boolean,
): Tile | null {
  if (isStart) {
    // need T = drop_in and exit on some side. START has T open + N open at H.
    if (exit === null || exit === DIR.T || exit === DIR.B) return null;
    return findByParentWithExit(tiles, 'START', exit);
  }
  if (isEnd) {
    // END has one side open at L (N by default). Orient so entry face is N.
    if (entry === DIR.T || entry === DIR.B) return null;
    return findByParentWithEntry(tiles, 'END', entry);
  }
  // Otherwise, pick a tile whose two open faces are the entry+exit directions.
  // Candidate patterns:
  //   horizontal→horizontal: FLAT, SLOPE, or CURVE (straight or 90°).
  //   horizontal-in→down-out (B): DROP
  //   top-in (T)→horizontal-out: CATCHER
  if (entry === DIR.T && exit === DIR.B) {
    return tiles.find((t) => t.parent === 'PIPE') ?? null;
  }
  if (entry === DIR.T && exit !== null && exit !== DIR.B && exit !== DIR.T) {
    return findByParentWithExit(tiles, 'CATCHER', exit);
  }
  if (exit === DIR.B && entry !== DIR.T && entry !== DIR.B) {
    return findByParentWithEntry(tiles, 'DROP', entry);
  }
  if (entry < 4 && exit !== null && exit < 4) {
    // straight (entry opposite exit) or curve (adjacent)
    const isStraight = (entry + 2) % 4 === exit;
    const parents = isStraight ? ['SLOPE_HL', 'FLAT_MM', 'FLAT_LL', 'FLAT_HH'] : ['CURVE_R_HL', 'CURVE_L_HL', 'CURVE_LL', 'CURVE_HH'];
    for (const p of parents) {
      const t = findByTwoSides(tiles, p, entry, exit);
      if (t) return t;
    }
  }
  return null;
}

/** Find a tile whose exit face is at direction `exitSide` (horizontal) and is the tile's canonical "out". */
function findByParentWithExit(tiles: Tile[], parent: string, exitSide: number): Tile | null {
  // Look up the authored tile; find which canonical side is its "out" (open side other than T/B).
  const authored = AUTHORED_TILES.find((t) => t.name === parent);
  if (!authored) return null;
  const openSides: number[] = [];
  const sides = [authored.faces.N, authored.faces.E, authored.faces.S, authored.faces.W];
  for (let i = 0; i < 4; i++) if (sides[i]!.open) openSides.push(i);
  if (openSides.length === 0) return null;
  const canon = openSides[0]!;
  // rotation k rotates canon → (canon + k) mod 4 in the rotated tile.
  const k = (exitSide - canon + 4) % 4;
  return tiles.find((t) => t.parent === parent && t.rotation === k) ?? null;
}

function findByParentWithEntry(tiles: Tile[], parent: string, entrySide: number): Tile | null {
  // Entry and exit are the same kind of query for a single-open-side tile.
  return findByParentWithExit(tiles, parent, entrySide);
}

function findByTwoSides(tiles: Tile[], parent: string, sideA: number, sideB: number): Tile | null {
  const authored = AUTHORED_TILES.find((t) => t.name === parent);
  if (!authored) return null;
  const sides = [authored.faces.N, authored.faces.E, authored.faces.S, authored.faces.W];
  const openSides: number[] = [];
  for (let i = 0; i < 4; i++) if (sides[i]!.open) openSides.push(i);
  if (openSides.length < 2) return null;
  const [canonA, canonB] = openSides as [number, number];
  // We need rotation k such that {(canonA+k)%4, (canonB+k)%4} == {sideA, sideB}.
  for (let k = 0; k < 4; k++) {
    const a = (canonA + k) % 4;
    const b = (canonB + k) % 4;
    if ((a === sideA && b === sideB) || (a === sideB && b === sideA)) {
      return tiles.find((t) => t.parent === parent && t.rotation === k) ?? null;
    }
  }
  return null;
}
