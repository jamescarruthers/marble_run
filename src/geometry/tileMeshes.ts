import * as THREE from 'three';
import { HEIGHT_BANDS } from '../constants';

/** All tile meshes live in the unit cube [-0.5, 0.5]^3 with y=up.
 *  Face convention in unit cube: N = +z, E = +x, S = -z, W = -x, T = +y, B = -y.
 *  Height bands are y coords: L=-0.34, M=0, H=0.34 (relative to unit cube center).
 */
const bandY = (h: 0 | 1 | 2): number => {
  const raw = h === 0 ? HEIGHT_BANDS.L : h === 1 ? HEIGHT_BANDS.M : HEIGHT_BANDS.H;
  return raw - 0.5; // shift so unit cube centered at origin in y
};

const TRACK_RADIUS = 0.08;

function makeTube(path: THREE.Curve<THREE.Vector3>, radius = TRACK_RADIUS): THREE.BufferGeometry {
  return new THREE.TubeGeometry(path, 20, radius, 8, false);
}

function catmullTube(points: THREE.Vector3[], radius = TRACK_RADIUS): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  return makeTube(curve, radius);
}

/** Centre of face d in unit cube. d: 0=N,1=E,2=S,3=W. */
function sideAnchor(d: 0 | 1 | 2 | 3, h: 0 | 1 | 2): THREE.Vector3 {
  const y = bandY(h);
  switch (d) {
    case 0:
      return new THREE.Vector3(0, y, 0.5);
    case 1:
      return new THREE.Vector3(0.5, y, 0);
    case 2:
      return new THREE.Vector3(0, y, -0.5);
    case 3:
      return new THREE.Vector3(-0.5, y, 0);
  }
}

function topAnchor(): THREE.Vector3 {
  return new THREE.Vector3(0, 0.5, 0);
}
function bottomAnchor(): THREE.Vector3 {
  return new THREE.Vector3(0, -0.5, 0);
}

const meshCache = new Map<string, THREE.BufferGeometry>();

function cache(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = meshCache.get(key);
  if (!g) {
    g = build();
    meshCache.set(key, g);
  }
  return g;
}

/** Get the visual geometry for a tile by its meshKey (rotation 0). Rotation handled by warp. */
export function getTileMesh(meshKey: string): THREE.BufferGeometry | null {
  switch (meshKey) {
    case 'none':
      return null;
    case 'solid':
      return cache('solid', () => {
        const g = new THREE.BoxGeometry(0.7, 0.7, 0.7, 4, 4, 4);
        return g;
      });
    case 'start':
      return cache('start', () => {
        // funnel: cone rim at top, exit at N side at H
        const parts: THREE.BufferGeometry[] = [];
        const cone = new THREE.CylinderGeometry(0.28, 0.08, 0.35, 16, 2, true);
        cone.translate(0, 0.2, 0);
        parts.push(cone);
        const exit = catmullTube([new THREE.Vector3(0, bandY(2) + 0.02, 0), sideAnchor(0, 2)]);
        parts.push(exit);
        return mergeBuffers(parts);
      });
    case 'end':
      return cache('end', () => {
        // cup: open cylinder on bottom
        const cup = new THREE.CylinderGeometry(0.3, 0.22, 0.3, 16, 2, true);
        cup.translate(0, -0.25, 0);
        const lip = new THREE.TorusGeometry(0.3, 0.03, 8, 16);
        lip.rotateX(Math.PI / 2);
        lip.translate(0, -0.1, 0);
        const inlet = catmullTube([sideAnchor(0, 0), new THREE.Vector3(0, -0.25, 0)]);
        return mergeBuffers([cup, lip, inlet]);
      });
    case 'slope_hl':
      return cache('slope_hl', () => {
        // N (H) → S (L)
        return catmullTube([sideAnchor(0, 2), new THREE.Vector3(0, bandY(1), 0), sideAnchor(2, 0)]);
      });
    case 'flat_mm':
      return cache('flat_mm', () => {
        return catmullTube([sideAnchor(0, 1), new THREE.Vector3(0, bandY(1), 0), sideAnchor(2, 1)]);
      });
    case 'flat_ll':
      return cache('flat_ll', () => {
        return catmullTube([sideAnchor(0, 0), new THREE.Vector3(0, bandY(0), 0), sideAnchor(2, 0)]);
      });
    case 'flat_hh':
      return cache('flat_hh', () => {
        return catmullTube([sideAnchor(0, 2), new THREE.Vector3(0, bandY(2), 0), sideAnchor(2, 2)]);
      });
    case 'curve_ll':
      return cache('curve_ll', () => {
        return catmullTube([sideAnchor(0, 0), new THREE.Vector3(0.1, bandY(0), 0.1), sideAnchor(1, 0)]);
      });
    case 'curve_hh':
      return cache('curve_hh', () => {
        return catmullTube([sideAnchor(0, 2), new THREE.Vector3(0.1, bandY(2), 0.1), sideAnchor(1, 2)]);
      });
    case 'curve_r_hl':
      return cache('curve_r_hl', () => {
        // N(H) → E(L). Right turn = CW from above.
        return catmullTube([
          sideAnchor(0, 2),
          new THREE.Vector3(0.1, bandY(1), 0.1),
          new THREE.Vector3(0.25, bandY(0) + 0.1, -0.05),
          sideAnchor(1, 0),
        ]);
      });
    case 'curve_l_hl':
      return cache('curve_l_hl', () => {
        return catmullTube([
          sideAnchor(0, 2),
          new THREE.Vector3(-0.1, bandY(1), 0.1),
          new THREE.Vector3(-0.25, bandY(0) + 0.1, -0.05),
          sideAnchor(3, 0),
        ]);
      });
    case 'drop':
      return cache('drop', () => {
        // N(L in) → B (drop out)
        return catmullTube([sideAnchor(0, 0), new THREE.Vector3(0, bandY(0) - 0.1, 0), bottomAnchor()]);
      });
    case 'catcher':
      return cache('catcher', () => {
        return catmullTube([topAnchor(), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, bandY(2) + 0.05, 0.2), sideAnchor(0, 2)]);
      });
    case 'pipe':
      return cache('pipe', () => {
        return catmullTube([topAnchor(), new THREE.Vector3(0, 0, 0), bottomAnchor()], TRACK_RADIUS * 1.2);
      });
  }
  return null;
}

/** Merges a list of BufferGeometry into one (position+normal only). */
function mergeBuffers(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of geoms) total += (g.attributes.position as THREE.BufferAttribute).count;
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  let off = 0;
  for (const g of geoms) {
    g.computeVertexNormals();
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

/** Returns the local (unit-cube) entry/exit points of each tile's flow graph.
 *  Keys: 'N'|'E'|'S'|'W'|'T'|'B'. Values are in unit-cube coords (y up).
 *  These are used both by physics and by path construction.
 */
export function tileSocketAnchors(meshKey: string): Partial<Record<'N' | 'E' | 'S' | 'W' | 'T' | 'B', THREE.Vector3>> {
  switch (meshKey) {
    case 'start':
      return { T: topAnchor(), N: sideAnchor(0, 2) };
    case 'end':
      return { N: sideAnchor(0, 0) };
    case 'slope_hl':
      return { N: sideAnchor(0, 2), S: sideAnchor(2, 0) };
    case 'flat_mm':
      return { N: sideAnchor(0, 1), S: sideAnchor(2, 1) };
    case 'flat_ll':
      return { N: sideAnchor(0, 0), S: sideAnchor(2, 0) };
    case 'flat_hh':
      return { N: sideAnchor(0, 2), S: sideAnchor(2, 2) };
    case 'curve_ll':
      return { N: sideAnchor(0, 0), E: sideAnchor(1, 0) };
    case 'curve_hh':
      return { N: sideAnchor(0, 2), E: sideAnchor(1, 2) };
    case 'curve_r_hl':
      return { N: sideAnchor(0, 2), E: sideAnchor(1, 0) };
    case 'curve_l_hl':
      return { N: sideAnchor(0, 2), W: sideAnchor(3, 0) };
    case 'drop':
      return { N: sideAnchor(0, 0), B: bottomAnchor() };
    case 'catcher':
      return { T: topAnchor(), N: sideAnchor(0, 2) };
    case 'pipe':
      return { T: topAnchor(), B: bottomAnchor() };
    default:
      return {};
  }
}

/** Return an interior center point the path should pass through for each meshKey. */
export function tileCenterPoint(meshKey: string): THREE.Vector3 {
  switch (meshKey) {
    case 'slope_hl':
    case 'flat_mm':
      return new THREE.Vector3(0, bandY(1), 0);
    case 'curve_r_hl':
      return new THREE.Vector3(0.15, bandY(1), 0.05);
    case 'curve_l_hl':
      return new THREE.Vector3(-0.15, bandY(1), 0.05);
    case 'drop':
      return new THREE.Vector3(0, bandY(0) - 0.1, 0);
    case 'catcher':
      return new THREE.Vector3(0, 0.2, 0);
    case 'pipe':
      return new THREE.Vector3(0, 0, 0);
    case 'start':
      return new THREE.Vector3(0, 0.2, 0);
    case 'end':
      return new THREE.Vector3(0, -0.25, 0);
    default:
      return new THREE.Vector3();
  }
}
