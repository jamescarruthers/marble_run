import { GRID_DEFAULTS, GRID_SCALE } from '../constants';
import { rngFrom } from '../util/rng';
import { conwayOrtho } from './conwayOrtho';
import { extrude, Grid3D } from './extrude';
import { randomPairing } from './randomPairing';
import { relax } from './relax';
import { triHexChunk } from './triHexChunk';
import { weld } from './weld';

export type { Grid3D, PrismCell } from './extrude';
export type { HalfEdgeMesh, HEFace, HEVert, Vec2, Vec3 } from './halfEdge';

export interface GridOptions {
  chunkRadius?: number;
  layers?: number;
  layerHeight?: number;
  relaxIterations?: number;
  relaxStep?: number;
  /** World-unit scale applied after relaxation — larger values mean chunkier cells. */
  scale?: number;
}

export function buildGrid(seed: number, opts: GridOptions = {}): Grid3D {
  const chunkRadius = opts.chunkRadius ?? GRID_DEFAULTS.chunkRadius;
  const layers = opts.layers ?? GRID_DEFAULTS.layers;
  const layerHeight = opts.layerHeight ?? GRID_DEFAULTS.layerHeight;
  const relaxIter = opts.relaxIterations ?? GRID_DEFAULTS.relaxIterations;
  const relaxStep = opts.relaxStep ?? GRID_DEFAULTS.relaxStep;
  const scale = opts.scale ?? GRID_SCALE;

  const rng = rngFrom(seed);
  let mesh = triHexChunk(chunkRadius);
  mesh = randomPairing(mesh, rng);
  mesh = conwayOrtho(mesh);
  mesh = weld(mesh);
  mesh = relax(mesh, relaxIter, relaxStep);
  // Uniform scale of the 2D mesh; layerHeight is scaled when passed to extrude.
  for (const v of mesh.verts) {
    v.pos = [v.pos[0] * scale, v.pos[1] * scale];
  }
  return extrude(mesh, layers, layerHeight * scale, seed);
}
