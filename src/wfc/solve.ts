import { Grid3D } from '../grid';
import { hash, mulberry32, Rng } from '../util/rng';
import {
  Bitset,
  bsAndInto,
  bsClone,
  bsEmpty,
  bsFull,
  bsGet,
  bsIter,
  bsOrInto,
  bsPopcount,
  bsSet,
  bsZero,
} from './bitset';
import { buildCompatTable, CompatTable } from './compatTable';
import { DIR } from './sockets';
import { Tile } from './tiles';

export interface CollapsedCell {
  tileId: number;
  parent: string;
  rotation: 0 | 1 | 2 | 3;
}

export interface SolveResult {
  grid: Grid3D;
  tiles: Tile[];
  collapsed: CollapsedCell[];
  startCellId: number;
  endCellId: number;
}

export interface SolveOpts {
  maxRestarts?: number;
  debug?: boolean;
}

/** Compute the mask of tiles allowed at cell `n` (neighbour across dir d from c)
 *  given the current domain of cell c. */
function maskFor(
  grid: Grid3D,
  compat: CompatTable,
  domains: Bitset[],
  cId: number,
  dir: number,
  out: Uint32Array,
): { nId: number; bits: number[] } | null {
  const cell = grid.cells[cId]!;
  let nId: number;
  if (dir === DIR.T) nId = cell.top;
  else if (dir === DIR.B) nId = cell.bottom;
  else nId = cell.sides[dir] ?? -1;
  if (nId < 0) return null;
  const dom = domains[cId]!;
  const bits = bsIter(dom);
  if (bits.length === 0) return null;
  bsZero(out);
  if (dir === DIR.T) {
    for (const t of bits) bsOrInto(out, compat.topAllowed[t]!);
  } else if (dir === DIR.B) {
    for (const t of bits) bsOrInto(out, compat.botAllowed[t]!);
  } else {
    const nbEdge = cell.sidesNeighbourEdge[dir]!;
    for (const t of bits) bsOrInto(out, compat.sideAllowed[t * 16 + dir * 4 + nbEdge]!);
  }
  return { nId, bits };
}

function propagate(
  grid: Grid3D,
  compat: CompatTable,
  domains: Bitset[],
  startCell: number,
  debug?: (msg: string) => void,
): boolean {
  const stack: number[] = [startCell];
  const W = Math.ceil(compat.tilesN / 32);
  const mask = new Uint32Array(W);
  while (stack.length) {
    const c = stack.pop()!;
    for (let d = 0; d < 6; d++) {
      const ok = maskFor(grid, compat, domains, c, d, mask);
      if (!ok) continue;
      const changed = bsAndInto(domains[ok.nId]!, mask);
      if (changed) {
        if (bsEmpty(domains[ok.nId]!)) {
          if (debug) debug(`contradiction at cell ${ok.nId} from ${c} dir ${d}`);
          return false;
        }
        stack.push(ok.nId);
      }
    }
  }
  return true;
}

function entropy(dom: Bitset, weights: number[]): number {
  let sum = 0;
  let sumLog = 0;
  for (const t of bsIter(dom)) {
    const w = weights[t]!;
    if (w <= 0) continue;
    sum += w;
    sumLog += w * Math.log(w);
  }
  if (sum === 0) return 0;
  return Math.log(sum) - sumLog / sum;
}

function pickLowestEntropy(domains: Bitset[], weights: number[], rng: Rng): number {
  let best = -1;
  let bestVal = Infinity;
  for (let i = 0; i < domains.length; i++) {
    const dom = domains[i]!;
    const pc = bsPopcount(dom);
    if (pc <= 1) continue;
    const e = entropy(dom, weights) + rng() * 1e-6;
    if (e < bestVal) {
      bestVal = e;
      best = i;
    }
  }
  return best;
}

function collapseWeighted(dom: Bitset, _tiles: Tile[], weights: number[], rng: Rng): number {
  const bits = bsIter(dom);
  let total = 0;
  for (const t of bits) total += weights[t]!;
  if (total <= 0) {
    const pick = bits[Math.floor(rng() * bits.length)]!;
    bsZero(dom);
    bsSet(dom, pick, true);
    return pick;
  }
  let r = rng() * total;
  let chosen = bits[0]!;
  for (const t of bits) {
    r -= weights[t]!;
    if (r <= 0) {
      chosen = t;
      break;
    }
  }
  bsZero(dom);
  bsSet(dom, chosen, true);
  return chosen;
}

function baseDomain(tiles: Tile[]): Bitset {
  const dom = bsFull(tiles.length);
  for (let t = 0; t < tiles.length; t++) {
    if (tiles[t]!.special) bsSet(dom, t, false);
  }
  return dom;
}

function preCollapseStartEnd(
  grid: Grid3D,
  compat: CompatTable,
  domains: Bitset[],
  tiles: Tile[],
  rng: Rng,
  dbg?: (msg: string) => void,
): { start: number; end: number } | null {
  const startCandidates: number[] = [];
  const endCandidates: number[] = [];
  for (const c of grid.cells) {
    if (grid.boundaryQuadFaceIds.has(c.qFaceId)) continue;
    if (c.layer === grid.layers - 1) startCandidates.push(c.id);
    if (c.layer === 0) endCandidates.push(c.id);
  }
  if (startCandidates.length === 0 || endCandidates.length === 0) return null;

  const startCell = startCandidates[Math.floor(rng() * startCandidates.length)]!;
  const endCell = endCandidates[Math.floor(rng() * endCandidates.length)]!;
  const startTiles = tiles.map((t, i) => (t.special === 'START' ? i : -1)).filter((i) => i >= 0);
  const endTiles = tiles.map((t, i) => (t.special === 'END' ? i : -1)).filter((i) => i >= 0);
  const startPick = startTiles[Math.floor(rng() * startTiles.length)]!;
  const endPick = endTiles[Math.floor(rng() * endTiles.length)]!;

  bsSet(domains[startCell]!, startPick, true);
  bsSet(domains[endCell]!, endPick, true);
  for (let t = 0; t < tiles.length; t++) {
    if (t !== startPick) bsSet(domains[startCell]!, t, false);
    if (t !== endPick) bsSet(domains[endCell]!, t, false);
  }
  if (!propagate(grid, compat, domains, startCell, dbg)) {
    if (dbg) dbg(`start-propagate failed (startCell=${startCell}, startTile=${startPick})`);
    return null;
  }
  if (!propagate(grid, compat, domains, endCell, dbg)) {
    if (dbg) dbg(`end-propagate failed (endCell=${endCell}, endTile=${endPick})`);
    return null;
  }
  return { start: startCell, end: endCell };
}

function readout(domains: Bitset[], tiles: Tile[]): CollapsedCell[] {
  const out: CollapsedCell[] = new Array(domains.length);
  for (let i = 0; i < domains.length; i++) {
    const bits = bsIter(domains[i]!);
    const t = bits[0] ?? 0;
    const tile = tiles[t]!;
    out[i] = { tileId: t, parent: tile.parent, rotation: tile.rotation };
  }
  return out;
}

export function solve(grid: Grid3D, tiles: Tile[], opts: SolveOpts = {}): SolveResult | null {
  const maxRestarts = opts.maxRestarts ?? 20;
  const compat = buildCompatTable(tiles);
  const weights = tiles.map((t) => t.weight);
  const base = baseDomain(tiles);
  const debug = opts.debug ?? false;
  const reasons: Record<string, number> = {};
  const bump = (k: string) => (reasons[k] = (reasons[k] ?? 0) + 1);

  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    const rng = mulberry32(hash(grid.seed, attempt));
    const domains: Bitset[] = grid.cells.map(() => bsClone(base));

    const dbg = debug && attempt < 3 ? (msg: string) => console.log(`[attempt ${attempt}] ${msg}`) : undefined;
    const endpoints = preCollapseStartEnd(grid, compat, domains, tiles, rng, dbg);
    if (!endpoints) {
      bump('preCollapse');
      continue;
    }

    let ok = true;
    try {
      while (true) {
        const c = pickLowestEntropy(domains, weights, rng);
        if (c < 0) break;
        collapseWeighted(domains[c]!, tiles, weights, rng);
        if (!propagate(grid, compat, domains, c, dbg)) {
          ok = false;
          break;
        }
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      bump('contradiction');
      continue;
    }
    const collapsed = readout(domains, tiles);
    let complete = true;
    for (const d of domains) {
      if (bsPopcount(d) !== 1) {
        complete = false;
        break;
      }
    }
    if (!complete) {
      bump('incomplete');
      continue;
    }
    if (pathCheck(grid, collapsed, tiles, endpoints.start, endpoints.end)) {
      if (debug) console.log('[wfc] solved on attempt', attempt, reasons);
      return { grid, tiles, collapsed, startCellId: endpoints.start, endCellId: endpoints.end };
    }
    bump('noPath');
  }
  if (debug) console.log('[wfc] all attempts failed:', reasons);
  return null;
}

/** Reachability from start to end via open-socket mates. */
export function pathCheck(
  grid: Grid3D,
  collapsed: CollapsedCell[],
  tiles: Tile[],
  startCellId: number,
  endCellId: number,
): boolean {
  const visited = new Uint8Array(grid.cells.length);
  const stack = [startCellId];
  while (stack.length) {
    const c = stack.pop()!;
    if (visited[c]) continue;
    visited[c] = 1;
    if (c === endCellId) return true;
    const cell = grid.cells[c]!;
    const tile = tiles[collapsed[c]!.tileId]!;
    for (let d = 0; d < 6; d++) {
      const face = faceAt(tile, d);
      if (!face.open) continue;
      let n: number;
      let nFace: { open: boolean };
      if (d === DIR.T) {
        n = cell.top;
        if (n < 0) continue;
        nFace = tiles[collapsed[n]!.tileId]!.faces.B;
      } else if (d === DIR.B) {
        n = cell.bottom;
        if (n < 0) continue;
        nFace = tiles[collapsed[n]!.tileId]!.faces.T;
      } else {
        n = cell.sides[d]!;
        if (n < 0) continue;
        const nbEdge = cell.sidesNeighbourEdge[d]!;
        nFace = faceByEdge(tiles[collapsed[n]!.tileId]!, nbEdge);
      }
      if (!nFace.open) continue;
      stack.push(n);
    }
  }
  return false;
}

function faceAt(tile: Tile, d: number): { open: boolean } {
  if (d === DIR.T) return tile.faces.T;
  if (d === DIR.B) return tile.faces.B;
  return faceByEdge(tile, d);
}
function faceByEdge(tile: Tile, edge: number): { open: boolean } {
  return [tile.faces.N, tile.faces.E, tile.faces.S, tile.faces.W][edge]!;
}

void bsGet;
