import { HalfEdgeMesh } from './halfEdge';

/** Merge coincident vertices (within epsilon). Rewrites face indices. */
export function weld(m: HalfEdgeMesh, epsilon = 1e-4): HalfEdgeMesh {
  const cellSize = epsilon * 10;
  const buckets = new Map<string, number[]>();
  const remap = new Array<number>(m.verts.length).fill(-1);
  const verts: HalfEdgeMesh['verts'] = [];
  for (const v of m.verts) {
    const bx = Math.floor(v.pos[0] / cellSize);
    const by = Math.floor(v.pos[1] / cellSize);
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        const key = `${bx + dx},${by + dy}`;
        const list = buckets.get(key);
        if (!list) continue;
        for (const id of list) {
          const w = verts[id]!;
          const dxp = w.pos[0] - v.pos[0];
          const dyp = w.pos[1] - v.pos[1];
          if (dxp * dxp + dyp * dyp < epsilon * epsilon) {
            found = id;
            // promote pinned: if either was pinned, the welded vertex is pinned
            if (v.pinned) w.pinned = true;
            break;
          }
        }
      }
    }
    if (found >= 0) {
      remap[v.id] = found;
    } else {
      const newId = verts.length;
      verts.push({ id: newId, pos: [v.pos[0], v.pos[1]], pinned: v.pinned });
      remap[v.id] = newId;
      const key = `${bx},${by}`;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(newId);
    }
  }
  const faces: HalfEdgeMesh['faces'] = m.faces.map((f, i) => ({
    id: i,
    verts: f.verts.map((vid) => remap[vid]!),
  }));
  return { verts, faces };
}
