import { HalfEdgeMesh, Vec2 } from './halfEdge';

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];

function centroid(m: HalfEdgeMesh, vs: number[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const i of vs) {
    const v = m.verts[i]!;
    x += v.pos[0];
    y += v.pos[1];
  }
  return [x / vs.length, y / vs.length];
}

/**
 * Stålberg squaring-force relaxation.
 *
 * For each quad with CCW corners c_k and centroid C, the "best-fit" square has
 * corners C + rot90^k(e), where e is the least-squares fit
 *   e = (1/4) Σ_k rot(-k·90°) · (c_k − C).
 * We compute the target corner for each vertex, accumulate (target − c_k) into a
 * per-vertex delta, and apply a small fraction each iteration. Triangles get a
 * gentle pull toward their centroid so unpaired tris don't distort the mesh.
 */
export function relax(m: HalfEdgeMesh, iterations = 60, stepSize = 0.1): HalfEdgeMesh {
  const cosM = [1, 0, -1, 0]; // cos(-k·90°) = cos(k·90°) for k=0..3
  const sinM = [0, -1, 0, 1]; // sin(-k·90°)
  const cosP = [1, 0, -1, 0]; // cos(k·90°)
  const sinP = [0, 1, 0, -1];

  for (let iter = 0; iter < iterations; iter++) {
    const delta: Vec2[] = m.verts.map(() => [0, 0]);
    const weight: number[] = m.verts.map(() => 0);
    for (const f of m.faces) {
      const C = centroid(m, f.verts);
      if (f.verts.length === 4) {
        // accumulate rotated corner offsets to find best-fit-square vector e
        let ex = 0;
        let ey = 0;
        for (let k = 0; k < 4; k++) {
          const p = m.verts[f.verts[k]!]!.pos;
          const vx = p[0] - C[0];
          const vy = p[1] - C[1];
          // rotate by -k·90°
          ex += vx * cosM[k]! - vy * sinM[k]!;
          ey += vx * sinM[k]! + vy * cosM[k]!;
        }
        ex *= 0.25;
        ey *= 0.25;
        // apply target_k = C + rot90^k(e)
        for (let k = 0; k < 4; k++) {
          const vid = f.verts[k]!;
          const tx = ex * cosP[k]! - ey * sinP[k]!;
          const ty = ex * sinP[k]! + ey * cosP[k]!;
          const target: Vec2 = [C[0] + tx, C[1] + ty];
          const d = sub(target, m.verts[vid]!.pos);
          delta[vid] = add(delta[vid]!, d);
          weight[vid] = weight[vid]! + 1;
        }
      } else {
        // triangles (and other polys): soft laplacian pull toward centroid
        for (const vid of f.verts) {
          const d = sub(C, m.verts[vid]!.pos);
          delta[vid] = add(delta[vid]!, scale(d, 0.25));
          weight[vid] = weight[vid]! + 0.25;
        }
      }
    }
    for (const v of m.verts) {
      if (v.pinned) continue;
      const w = weight[v.id]!;
      if (w <= 0) continue;
      v.pos = add(v.pos, scale(delta[v.id]!, stepSize / w));
    }
  }
  return m;
}
