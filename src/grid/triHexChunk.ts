import { addFace, addVert, HalfEdgeMesh, newMesh } from './halfEdge';

/**
 * Seeds a hexagonal chunk of equilateral triangles with `radius` rings.
 * Uses axial coordinates. Each lattice point gets a vertex; triangles connect
 * triples (q, r), (q+1, r), (q, r+1) and (q+1, r-1), (q+1, r), (q, r+1).
 */
export function triHexChunk(radius: number): HalfEdgeMesh {
  const m = newMesh();
  // axial → cartesian. Edge length = 1.
  const q2x = (q: number, r: number) => q + r * 0.5;
  const r2y = (r: number) => r * (Math.sqrt(3) / 2);

  const indexOf = new Map<string, number>();
  const addPoint = (q: number, r: number) => {
    const key = `${q},${r}`;
    const existing = indexOf.get(key);
    if (existing !== undefined) return existing;
    const onBoundary = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === radius;
    const id = addVert(m, [q2x(q, r), r2y(r)], onBoundary);
    indexOf.set(key, id);
    return id;
  };

  // populate vertices in the hex
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) addPoint(q, r);
  }

  const has = (q: number, r: number) => indexOf.has(`${q},${r}`);

  // triangles: for each lattice point (q,r), two triangles pointing up & down if neighbors exist
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      // upward triangle: (q,r), (q+1,r), (q,r+1)
      if (has(q + 1, r) && has(q, r + 1)) {
        addFace(m, [addPoint(q, r), addPoint(q + 1, r), addPoint(q, r + 1)]);
      }
      // downward triangle: (q+1,r), (q+1,r-1+1)=… actually: (q+1,r), (q,r+1), and (q+1, r+1... no.
      // Standard pair for axial up-pointing grid: second triangle is (q+1, r), (q+1, r-1)?
      // Use the canonical pairing: triangles (q,r)(q+1,r-1)(q+1,r) and (q,r)(q+1,r)(q,r+1)... already did the first.
      // Down-pointing: (q,r), (q-1,r+1), ... instead emit only up-triangles to avoid duplicates.
    }
  }
  // Emit the "down" triangles: (q,r),(q,r+1),(q-1,r+1) — covers the other half of each rhombus.
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      if (has(q, r + 1) && has(q - 1, r + 1)) {
        // ensure CCW. Use positions.
        addFace(m, [indexOf.get(`${q},${r}`)!, indexOf.get(`${q},${r + 1}`)!, indexOf.get(`${q - 1},${r + 1}`)!]);
      }
    }
  }

  ensureCCW(m);
  return m;
}

/** Flip faces that ended up clockwise so all are CCW. */
function ensureCCW(m: HalfEdgeMesh) {
  for (const f of m.faces) {
    if (signedArea(m, f.verts) < 0) f.verts.reverse();
  }
}

function signedArea(m: HalfEdgeMesh, vs: number[]): number {
  let a = 0;
  for (let i = 0; i < vs.length; i++) {
    const p = m.verts[vs[i]!]!.pos;
    const q = m.verts[vs[(i + 1) % vs.length]!]!.pos;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return 0.5 * a;
}
