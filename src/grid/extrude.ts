import { buildEdgeMap, HalfEdgeMesh, Vec3 } from './halfEdge';

export interface PrismCell {
  id: number;
  qFaceId: number;
  layer: number;
  /** world-space quad corners, CCW from above */
  bottomQuad: [Vec3, Vec3, Vec3, Vec3];
  topQuad: [Vec3, Vec3, Vec3, Vec3];
  /** neighbour cell ids (or -1 if none). sides[i] = neighbour across edge (v_i, v_{i+1}) */
  top: number;
  bottom: number;
  sides: [number, number, number, number];
  /** for each side i, the edge index on the neighbour that corresponds to this shared edge */
  sidesNeighbourEdge: [number, number, number, number];
  /** quad face centroid in xy, convenient for labeling */
  centerXY: [number, number];
}

export interface Grid3D {
  seed: number;
  layers: number;
  layerHeight: number;
  mesh: HalfEdgeMesh;
  cells: PrismCell[];
  /** index cells by (qFaceId, layer) */
  cellAt: (qFaceId: number, layer: number) => number;
  /** quad face ids that belong to the outer ring (have ≥1 edge without a neighbour) */
  boundaryQuadFaceIds: Set<number>;
}

/**
 * Extrudes the 2D quad mesh into prismatic 3D cells. Non-quad faces are skipped
 * (leftover unpaired triangles become "holes"; the boundary constraint handles them).
 */
export function extrude(mesh2d: HalfEdgeMesh, layers: number, layerHeight: number, seed: number): Grid3D {
  // precompute per-quad neighbour lookup via shared-edge map
  const edgeMap = buildEdgeMap(mesh2d);
  const quadFaceIds: number[] = [];
  for (const f of mesh2d.faces) if (f.verts.length === 4) quadFaceIds.push(f.id);
  const quadIdSet = new Set(quadFaceIds);

  // map qFaceId → side neighbours (length 4) and the neighbour's matching edge index
  const sideNeighbourByQ = new Map<number, { nb: [number, number, number, number]; nbEdge: [number, number, number, number] }>();
  const boundary = new Set<number>();
  for (const qid of quadFaceIds) {
    const f = mesh2d.faces[qid]!;
    const nb: [number, number, number, number] = [-1, -1, -1, -1];
    const nbEdge: [number, number, number, number] = [-1, -1, -1, -1];
    for (let i = 0; i < 4; i++) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % 4]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      const list = edgeMap.get(k) ?? [];
      const other = list.find((e) => e.faceId !== qid && quadIdSet.has(e.faceId));
      if (other) {
        nb[i] = other.faceId;
        nbEdge[i] = other.i;
      } else boundary.add(qid);
    }
    sideNeighbourByQ.set(qid, { nb, nbEdge });
  }

  // build cells
  const cells: PrismCell[] = [];
  const idxByQL = new Map<string, number>();
  for (let layer = 0; layer < layers; layer++) {
    for (const qid of quadFaceIds) {
      const f = mesh2d.faces[qid]!;
      const zBot = layer * layerHeight;
      const zTop = (layer + 1) * layerHeight;
      const bot: [Vec3, Vec3, Vec3, Vec3] = [
        [mesh2d.verts[f.verts[0]!]!.pos[0], mesh2d.verts[f.verts[0]!]!.pos[1], zBot],
        [mesh2d.verts[f.verts[1]!]!.pos[0], mesh2d.verts[f.verts[1]!]!.pos[1], zBot],
        [mesh2d.verts[f.verts[2]!]!.pos[0], mesh2d.verts[f.verts[2]!]!.pos[1], zBot],
        [mesh2d.verts[f.verts[3]!]!.pos[0], mesh2d.verts[f.verts[3]!]!.pos[1], zBot],
      ];
      const top: [Vec3, Vec3, Vec3, Vec3] = [
        [bot[0][0], bot[0][1], zTop],
        [bot[1][0], bot[1][1], zTop],
        [bot[2][0], bot[2][1], zTop],
        [bot[3][0], bot[3][1], zTop],
      ];
      const cx = (bot[0][0] + bot[1][0] + bot[2][0] + bot[3][0]) / 4;
      const cy = (bot[0][1] + bot[1][1] + bot[2][1] + bot[3][1]) / 4;
      const id = cells.length;
      cells.push({
        id,
        qFaceId: qid,
        layer,
        bottomQuad: bot,
        topQuad: top,
        top: -1,
        bottom: -1,
        sides: [-1, -1, -1, -1],
        sidesNeighbourEdge: [-1, -1, -1, -1],
        centerXY: [cx, cy],
      });
      idxByQL.set(`${qid}|${layer}`, id);
    }
  }
  // wire neighbours
  for (const cell of cells) {
    const info = sideNeighbourByQ.get(cell.qFaceId)!;
    for (let i = 0; i < 4; i++) {
      const nb = info.nb[i]!;
      if (nb >= 0) {
        const idx = idxByQL.get(`${nb}|${cell.layer}`);
        if (idx !== undefined) {
          cell.sides[i] = idx;
          cell.sidesNeighbourEdge[i] = info.nbEdge[i]!;
        }
      }
    }
    const below = idxByQL.get(`${cell.qFaceId}|${cell.layer - 1}`);
    if (below !== undefined) cell.bottom = below;
    const above = idxByQL.get(`${cell.qFaceId}|${cell.layer + 1}`);
    if (above !== undefined) cell.top = above;
  }

  return {
    seed,
    layers,
    layerHeight,
    mesh: mesh2d,
    cells,
    cellAt: (qFaceId, layer) => idxByQL.get(`${qFaceId}|${layer}`) ?? -1,
    boundaryQuadFaceIds: boundary,
  };
}
