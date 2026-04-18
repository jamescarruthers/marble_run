import { HalfEdgeMesh, Vec2 } from './halfEdge';

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
const rot90 = (a: Vec2): Vec2 => [a[1], -a[0]];

function centroid(m: HalfEdgeMesh, vs: number[]): Vec2 {
  let x = 0,
    y = 0;
  for (const i of vs) {
    const v = m.verts[i]!;
    x += v.pos[0];
    y += v.pos[1];
  }
  return [x / vs.length, y / vs.length];
}

/**
 * Stålberg squaring-force relaxation. Accumulates per-vertex deltas across all
 * quads, then applies them. Triangles are also relaxed toward their centroid
 * to keep unpaired tris from distorting too much (light laplacian-style pull).
 */
export function relax(m: HalfEdgeMesh, iterations = 60, stepSize = 0.15): HalfEdgeMesh {
  for (let iter = 0; iter < iterations; iter++) {
    const delta: Vec2[] = m.verts.map(() => [0, 0]);
    const weight: number[] = m.verts.map(() => 0);
    for (const f of m.faces) {
      const c = centroid(m, f.verts);
      if (f.verts.length === 4) {
        // squaring force
        let force: Vec2 = [0, 0];
        for (const vid of f.verts) {
          force = add(force, sub(m.verts[vid]!.pos, c));
          force = rot90(force);
        }
        for (let i = 0; i < 4; i++) {
          const vid = f.verts[i]!;
          const target = add(c, force);
          const d = sub(target, m.verts[vid]!.pos);
          delta[vid] = add(delta[vid]!, d);
          weight[vid] = weight[vid]! + 1;
          force = rot90(force);
        }
      } else {
        // laplacian pull (gentler) for non-quads
        for (const vid of f.verts) {
          const d = sub(c, m.verts[vid]!.pos);
          delta[vid] = add(delta[vid]!, scale(d, 0.25));
          weight[vid] = weight[vid]! + 0.25;
        }
      }
    }
    for (const v of m.verts) {
      if (v.pinned) continue;
      const w = weight[v.id]!;
      if (w <= 0) continue;
      const d = scale(delta[v.id]!, stepSize / w);
      v.pos = add(v.pos, d);
    }
  }
  return m;
}
