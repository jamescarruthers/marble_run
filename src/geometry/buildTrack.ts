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

const TROUGH_RADIUS = 0.15;
/** How far below the curve centre the marble rests, in world units. */
export const MARBLE_SIT_OFFSET = TROUGH_RADIUS * 0.55;

/**
 * Build a single continuous open-top trough along the BFS-walked path through
 * the grid's cell centres. The trough is half a tube (rim at the top, open so
 * the marble is visible) swept along a Catmull-Rom curve. Frames are built
 * from world-up rather than Frenet so the rim stays flat as the track twists.
 */
export function buildTrack(grid: Grid3D, pathCellIds: number[]): TrackBuild {
  const points = pathCellIds.map((id) => cellWorldCentre(grid, id));

  if (points.length >= 1) {
    points[0] = points[0]!.clone().add(new THREE.Vector3(0, 0.25, 0));
  }
  if (points.length >= 1) {
    const last = points[points.length - 1]!;
    points[points.length - 1] = last.clone().add(new THREE.Vector3(0, 0.15, 0));
  }

  const curve = new THREE.CatmullRomCurve3(points, false, 'chordal', 0.5);
  const segments = Math.max(24, pathCellIds.length * 12);
  const tube = buildTrough(curve, segments, TROUGH_RADIUS, 12);

  const startBell = makeBell();
  startBell.translate(points[0]!.x, points[0]!.y, points[0]!.z);
  const endCup = makeCup();
  const endP = points[points.length - 1]!;
  endCup.translate(endP.x, endP.y - 0.05, endP.z);

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

/**
 * Sweep a half-circle cross-section (open at the top) along `curve`. Frames
 * are built from world-up so the rim stays horizontal even on sloped sections.
 * If the tangent is nearly vertical we fall back to world-X for the reference
 * so the cross product is well-conditioned.
 */
function buildTrough(
  curve: THREE.CatmullRomCurve3,
  tubular: number,
  radius: number,
  radial: number,
): THREE.BufferGeometry {
  const positions = new Float32Array((tubular + 1) * (radial + 1) * 3);
  const normals = new Float32Array((tubular + 1) * (radial + 1) * 3);
  const indices: number[] = [];

  const tmpT = new THREE.Vector3();
  const tmpU = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const worldX = new THREE.Vector3(1, 0, 0);

  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, tmpP);
    curve.getTangentAt(u, tmpT).normalize();
    // reference up: world up unless the tangent is too close to it
    tmpU.copy(Math.abs(tmpT.dot(worldUp)) > 0.95 ? worldX : worldUp);
    tmpB.crossVectors(tmpT, tmpU).normalize();      // "right"
    tmpN.crossVectors(tmpB, tmpT).normalize();      // "up" for this slice
    for (let j = 0; j <= radial; j++) {
      // angle sweeps PI → 2PI so we trace the bottom half: left rim → bottom → right rim.
      const a = Math.PI + (j / radial) * Math.PI;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const nx = c * tmpB.x + s * tmpN.x;
      const ny = c * tmpB.y + s * tmpN.y;
      const nz = c * tmpB.z + s * tmpN.z;
      const idx = (i * (radial + 1) + j) * 3;
      positions[idx] = tmpP.x + radius * nx;
      positions[idx + 1] = tmpP.y + radius * ny;
      positions[idx + 2] = tmpP.z + radius * nz;
      // Normal points *inward* (toward the curve) so the inside of the trough
      // is lit — that's the side the user actually sees.
      normals[idx] = -nx;
      normals[idx + 1] = -ny;
      normals[idx + 2] = -nz;
    }
  }

  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      const c = (i + 1) * (radial + 1) + (j + 1);
      const d = i * (radial + 1) + (j + 1);
      // wind so the inward-facing side is front — matches the inverted normals.
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setIndex(indices);
  return g;
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
