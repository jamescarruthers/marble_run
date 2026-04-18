import { Grid3D, PrismCell } from '../grid';
import { rngFrom } from '../util/rng';

export interface DriveResult {
  /** Cell ids in visit order from top-layer start to bottom-layer end. */
  pathCellIds: number[];
  startCellId: number;
  endCellId: number;
}

/**
 * Pick a top-layer interior start cell and a bottom-layer interior end cell,
 * then BFS a shortest path between them biased toward downward moves so the
 * track visibly descends. Returns the list of cell ids in visit order.
 *
 * We intentionally don't pick specific tiles here any more — the renderer
 * draws a single tube through the cell centres, so the geometry can't go out
 * of alignment with the grid.
 */
export function driveGenerate(grid: Grid3D): DriveResult | null {
  const rng = rngFrom(grid.seed ^ 0x9e3779b9);

  const topCandidates = grid.cells.filter(
    (c) => c.layer === grid.layers - 1 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  const botCandidates = grid.cells.filter(
    (c) => c.layer === 0 && !grid.boundaryQuadFaceIds.has(c.qFaceId),
  );
  if (topCandidates.length === 0 || botCandidates.length === 0) return null;

  const startCell = topCandidates[Math.floor(rng() * topCandidates.length)]!;
  const endCell = botCandidates[Math.floor(rng() * botCandidates.length)]!;

  const path = biasedBFS(grid, startCell, endCell, rng);
  if (!path || path.length < 2) return null;
  return { pathCellIds: path, startCellId: startCell.id, endCellId: endCell.id };
}

function biasedBFS(grid: Grid3D, start: PrismCell, end: PrismCell, rng: () => number): number[] | null {
  const prev = new Int32Array(grid.cells.length).fill(-1);
  const visited = new Uint8Array(grid.cells.length);
  const queue: number[] = [start.id];
  visited[start.id] = 1;
  while (queue.length) {
    const c = queue.shift()!;
    if (c === end.id) break;
    const cell = grid.cells[c]!;
    const neighbours: number[] = [];
    // Prefer down → sideways → up so paths spiral down naturally.
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
  if (prev[end.id] === -1 && start.id !== end.id) return null;
  const out: number[] = [];
  for (let c = end.id; c !== -1; c = prev[c]!) out.push(c);
  out.reverse();
  return out;
}
