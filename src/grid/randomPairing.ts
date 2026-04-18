import { buildEdgeMap, HalfEdgeMesh } from './halfEdge';
import { Rng } from '../util/rng';

/**
 * Step 2: Greedily pair adjacent triangles into quads.
 * Input mesh has only triangle faces. Output has a mix of triangles (unpaired) and
 * quads formed by dropping the shared edge between two triangles. Winding is preserved CCW.
 */
export function randomPairing(m: HalfEdgeMesh, rng: Rng): HalfEdgeMesh {
  const edges = buildEdgeMap(m);
  // collect interior edges: those shared by exactly 2 triangles.
  const candidates: Array<{ faceA: number; faceB: number; a: number; b: number }> = [];
  for (const [k, list] of edges) {
    if (list.length !== 2) continue;
    const [a, b] = k.split('|').map(Number) as [number, number];
    candidates.push({ faceA: list[0]!.faceId, faceB: list[1]!.faceId, a, b });
  }
  // shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  const paired = new Uint8Array(m.faces.length);
  const newFaces: Array<{ verts: number[]; replaces?: [number, number] }> = [];

  for (const c of candidates) {
    if (paired[c.faceA] || paired[c.faceB]) continue;
    const fA = m.faces[c.faceA]!;
    const fB = m.faces[c.faceB]!;
    // build quad: start from fA vertices; when we hit the edge (a,b), splice in fB's opposite vertex.
    const quad = mergeTrianglesAcrossEdge(fA.verts, fB.verts, c.a, c.b);
    if (!quad) continue;
    paired[c.faceA] = 1;
    paired[c.faceB] = 1;
    newFaces.push({ verts: quad, replaces: [c.faceA, c.faceB] });
  }

  // emit remaining triangles as is
  const out: HalfEdgeMesh = { verts: m.verts, faces: [] };
  for (const f of m.faces) {
    if (!paired[f.id]) out.faces.push({ id: out.faces.length, verts: f.verts });
  }
  for (const nf of newFaces) out.faces.push({ id: out.faces.length, verts: nf.verts });
  return out;
}

function mergeTrianglesAcrossEdge(
  a: number[],
  b: number[],
  ea: number,
  eb: number,
): number[] | null {
  // Find the vertex in b not in {ea, eb}
  const other = b.find((v) => v !== ea && v !== eb);
  if (other === undefined) return null;
  // Walk a: when we traverse the directed edge (x, y) == (ea, eb) or (eb, ea), insert `other` between them.
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = a[(i + 1) % a.length]!;
    out.push(x);
    if ((x === ea && y === eb) || (x === eb && y === ea)) {
      out.push(other);
    }
  }
  // out should have 4 unique vertex ids
  if (out.length !== 4) return null;
  const uniq = new Set(out);
  if (uniq.size !== 4) return null;
  return out;
}
