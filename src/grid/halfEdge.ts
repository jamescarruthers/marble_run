export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface HEVert {
  id: number;
  pos: Vec2;
  pinned?: boolean;
}

/** A face is represented as an ordered list of vertex ids. For triangles, length 3; for quads, length 4. */
export interface HEFace {
  id: number;
  verts: number[]; // vertex ids in CCW order
  /** triangle pair used during pairing step; transient */
  marked?: boolean;
}

export interface HalfEdgeMesh {
  verts: HEVert[];
  faces: HEFace[];
}

export function newMesh(): HalfEdgeMesh {
  return { verts: [], faces: [] };
}

export function addVert(m: HalfEdgeMesh, pos: Vec2, pinned = false): number {
  const id = m.verts.length;
  m.verts.push({ id, pos, pinned });
  return id;
}

export function addFace(m: HalfEdgeMesh, verts: number[]): number {
  const id = m.faces.length;
  m.faces.push({ id, verts });
  return id;
}

export function faceCentroid(m: HalfEdgeMesh, f: HEFace): Vec2 {
  let x = 0,
    y = 0;
  for (const vid of f.verts) {
    const v = m.verts[vid]!;
    x += v.pos[0];
    y += v.pos[1];
  }
  return [x / f.verts.length, y / f.verts.length];
}

export function edgeMid(m: HalfEdgeMesh, a: number, b: number): Vec2 {
  const va = m.verts[a]!.pos;
  const vb = m.verts[b]!.pos;
  return [(va[0] + vb[0]) * 0.5, (va[1] + vb[1]) * 0.5];
}

/** Build a shared-edge lookup: key "a|b" with a<b → list of (faceId, positionInFace) */
export function buildEdgeMap(m: HalfEdgeMesh): Map<string, Array<{ faceId: number; i: number }>> {
  const out = new Map<string, Array<{ faceId: number; i: number }>>();
  for (const f of m.faces) {
    const n = f.verts.length;
    for (let i = 0; i < n; i++) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % n]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      let e = out.get(k);
      if (!e) {
        e = [];
        out.set(k, e);
      }
      e.push({ faceId: f.id, i });
    }
  }
  return out;
}
