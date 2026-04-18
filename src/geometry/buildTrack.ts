import * as THREE from 'three';
import { Grid3D } from '../grid';

export interface TrackBuild {
  /** One continuous tube BufferGeometry along the walked path. */
  tube: THREE.BufferGeometry;
  /** Decorative start bell at the top of the path. */
  startBell: THREE.BufferGeometry;
  /** Decorative end cup at the bottom of the path. */
  endCup: THREE.BufferGeometry;
  /** World-space waypoints used for both geometry and the marble simulator. */
  path: THREE.Vector3[];
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  /** Mostly for diagnostics. */
  pathCellCount: number;
}

const TUBE_RADIUS = 0.09;

/**
 * Build a single continuous tube through the centres of the cells in `pathCellIds`.
 * This intentionally replaces the earlier tile-warp pipeline: its per-cell
 * authored meshes were hard to keep aligned across irregular prisms and the
 * result didn't read as a connected track. A tube through cell centres does.
 */
export function buildTrack(grid: Grid3D, pathCellIds: number[]): TrackBuild {
  const points = pathCellIds.map((id) => cellWorldCentre(grid, id));

  // Lift the first and last points a touch above their cells so the bell/cup
  // decorations have room, and slope the second-to-last point toward the cup.
  if (points.length >= 1) {
    points[0] = points[0]!.clone().add(new THREE.Vector3(0, 0.25, 0));
  }
  if (points.length >= 1) {
    const last = points[points.length - 1]!;
    points[points.length - 1] = last.clone().add(new THREE.Vector3(0, 0.15, 0));
  }

  // Build the main tube. CatmullRomCurve3 with 'chordal' parameterisation copes
  // well with irregular spacing.
  const curve = new THREE.CatmullRomCurve3(points, false, 'chordal', 0.5);
  const segments = Math.max(16, pathCellIds.length * 10);
  const tube = new THREE.TubeGeometry(curve, segments, TUBE_RADIUS, 10, false);

  // Decorative endpoints.
  const startBell = makeBell();
  startBell.translate(points[0]!.x, points[0]!.y, points[0]!.z);
  const endCup = makeCup();
  const endP = points[points.length - 1]!;
  endCup.translate(endP.x, endP.y - 0.05, endP.z);

  // For the physics/marble we reuse the same curve sample so it follows exactly.
  const marblePath = curve.getSpacedPoints(segments);

  return {
    tube,
    startBell,
    endCup,
    path: marblePath,
    startPos: points[0]!.clone(),
    endPos: endP.clone(),
    pathCellCount: pathCellIds.length,
  };
}

function cellWorldCentre(grid: Grid3D, cellId: number): THREE.Vector3 {
  const c = grid.cells[cellId]!;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of c.bottomQuad) {
    x += v[0];
    z += v[1];
    y += v[2];
  }
  for (const v of c.topQuad) {
    x += v[0];
    z += v[1];
    y += v[2];
  }
  return new THREE.Vector3(x / 8, y / 8, z / 8);
}

function makeBell(): THREE.BufferGeometry {
  const funnel = new THREE.CylinderGeometry(0.28, 0.1, 0.35, 20, 2, true);
  funnel.translate(0, 0.17, 0);
  const lip = new THREE.TorusGeometry(0.28, 0.02, 8, 20);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, 0.34, 0);
  return mergeGeoms([funnel, lip]);
}

function makeCup(): THREE.BufferGeometry {
  const cup = new THREE.CylinderGeometry(0.28, 0.22, 0.3, 20, 2, true);
  cup.translate(0, -0.15, 0);
  const base = new THREE.CircleGeometry(0.22, 20);
  base.rotateX(-Math.PI / 2);
  base.translate(0, -0.3, 0);
  return mergeGeoms([cup, base]);
}

function mergeGeoms(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of geoms) {
    g.computeVertexNormals();
    total += (g.attributes.position as THREE.BufferAttribute).count;
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let off = 0;
  for (const g of geoms) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      pos[(off + i) * 3] = p.getX(i);
      pos[(off + i) * 3 + 1] = p.getY(i);
      pos[(off + i) * 3 + 2] = p.getZ(i);
      nrm[(off + i) * 3] = n.getX(i);
      nrm[(off + i) * 3 + 1] = n.getY(i);
      nrm[(off + i) * 3 + 2] = n.getZ(i);
    }
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
