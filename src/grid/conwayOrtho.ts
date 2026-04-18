import { addFace, addVert, buildEdgeMap, faceCentroid, HalfEdgeMesh, newMesh } from './halfEdge';

/**
 * Conway "Ortho" operator: subdivide each face into `n` quads, where `n` is the
 * face's vertex count. Every triangle becomes 3 quads; every quad becomes 4 quads.
 *
 * Construction per face with n corners:
 *   - add a centroid vertex C
 *   - for each edge (vi, vi+1), we need a shared midpoint M_i (shared with the neighbour face)
 *   - also, each original vertex v_i maps to itself
 *   - emit n quads: [v_i, M_i, C, M_{i-1}]  (indices in CCW)
 */
export function conwayOrtho(m: HalfEdgeMesh): HalfEdgeMesh {
  const out = newMesh();
  // copy original vertices, preserving ids
  for (const v of m.verts) addVert(out, v.pos, v.pinned);
  // Midpoint cache keyed by undirected edge
  const mid = new Map<string, number>();
  const midOf = (a: number, b: number): number => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let id = mid.get(k);
    if (id !== undefined) return id;
    const pa = m.verts[a]!.pos;
    const pb = m.verts[b]!.pos;
    const pinned = !!(m.verts[a]!.pinned && m.verts[b]!.pinned);
    id = addVert(out, [(pa[0] + pb[0]) * 0.5, (pa[1] + pb[1]) * 0.5], pinned);
    mid.set(k, id);
    return id;
  };
  // touch all edges first so shared midpoints exist
  buildEdgeMap(m);

  for (const f of m.faces) {
    const n = f.verts.length;
    const c = faceCentroid(m, f);
    const centroidId = addVert(out, c, false);
    // precompute midpoints for all face edges
    const mids: number[] = [];
    for (let i = 0; i < n; i++) {
      mids.push(midOf(f.verts[i]!, f.verts[(i + 1) % n]!));
    }
    for (let i = 0; i < n; i++) {
      const vi = f.verts[i]!;
      const mi = mids[i]!;
      const miPrev = mids[(i - 1 + n) % n]!;
      addFace(out, [vi, mi, centroidId, miPrev]);
    }
  }
  return out;
}
