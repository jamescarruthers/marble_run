import { bsSet, makeBitset } from './bitset';
import { DIR, mateSide, mateVert, FlowSide } from './sockets';
import { Tile } from './tiles';

/**
 * For irregular quad meshes, two neighbouring cells do not share the same
 * "N/E/S/W" label for their common edge. We build a compat table indexed by
 * (tile, edgeIndex, neighbourEdgeIndex) for horizontal edges, plus standard
 * vertical T/B tables.
 *
 * Returns an object:
 *   sideAllowed[tile * 16 + myEdge*4 + nbEdge] → bitset of tiles valid as neighbour
 *   topAllowed[tile]  → bitset (tiles above)
 *   botAllowed[tile]  → bitset (tiles below)
 */
export interface CompatTable {
  sideAllowed: Uint32Array[];
  topAllowed: Uint32Array[];
  botAllowed: Uint32Array[];
  tilesN: number;
}

function sideOf(t: Tile, edge: number): FlowSide {
  return [t.faces.N, t.faces.E, t.faces.S, t.faces.W][edge]!;
}

export function buildCompatTable(tiles: Tile[]): CompatTable {
  const N = tiles.length;
  const sideAllowed: Uint32Array[] = new Array(N * 16);
  const topAllowed: Uint32Array[] = new Array(N);
  const botAllowed: Uint32Array[] = new Array(N);
  for (let i = 0; i < sideAllowed.length; i++) sideAllowed[i] = makeBitset(N);
  for (let i = 0; i < N; i++) {
    topAllowed[i] = makeBitset(N);
    botAllowed[i] = makeBitset(N);
  }

  for (let a = 0; a < N; a++) {
    const ta = tiles[a]!;
    for (let b = 0; b < N; b++) {
      const tb = tiles[b]!;
      for (let ea = 0; ea < 4; ea++) {
        for (let eb = 0; eb < 4; eb++) {
          if (mateSide(sideOf(ta, ea), sideOf(tb, eb))) {
            bsSet(sideAllowed[a * 16 + ea * 4 + eb]!, b, true);
          }
        }
      }
      if (mateVert(ta.faces.T, tb.faces.B)) bsSet(topAllowed[a]!, b, true);
      if (mateVert(tb.faces.T, ta.faces.B)) bsSet(botAllowed[a]!, b, true);
    }
  }
  return { sideAllowed, topAllowed, botAllowed, tilesN: N };
}

// Re-export DIR for callers that used the old shape.
export { DIR };
