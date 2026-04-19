import { GRID_SCALE } from '../constants';

export interface GridCell {
  id: number;
  /** Integer lattice coords. x,z are horizontal; y is the layer (0=top). */
  ix: number;
  iy: number;
  iz: number;
  /** Neighbours indexed N=0, E=1, S=2, W=3, T=4 (above), B=5 (below). */
  neighbours: [number, number, number, number, number, number];
  /** World-space centre of this cell. */
  centre: [number, number, number];
}

export interface Grid3D {
  width: number;
  depth: number;
  layers: number;
  scale: number;
  /** Cells in id order, where id = iy*width*depth + iz*width + ix. */
  cells: GridCell[];
  cellAt: (ix: number, iy: number, iz: number) => number;
  seed: number;
}

export interface GridOptions {
  width?: number;
  depth?: number;
  layers?: number;
  scale?: number;
}

const DEFAULTS = { width: 5, depth: 5, layers: 3 };

/**
 * Build a simple W × D × Layers axis-aligned cube grid. Layer 0 is the topmost
 * layer (marble enters there) and layer N-1 is the bottom. Each cell is a
 * `scale`-sized cube in world space, centred on its integer coordinate.
 *
 * Neighbours are indexed N=+z, E=+x, S=-z, W=-x, T=+y (above), B=-y (below),
 * matching the piece face convention used everywhere else. `T` points toward
 * a higher physical position, so in our "layer 0 = top" scheme T = previous
 * layer (smaller iy); B = next layer (larger iy).
 */
export function buildGrid(seed: number, opts: GridOptions = {}): Grid3D {
  const width = opts.width ?? DEFAULTS.width;
  const depth = opts.depth ?? DEFAULTS.depth;
  const layers = opts.layers ?? DEFAULTS.layers;
  const scale = opts.scale ?? GRID_SCALE;

  const idAt = (ix: number, iy: number, iz: number): number => {
    if (ix < 0 || ix >= width || iy < 0 || iy >= layers || iz < 0 || iz >= depth) return -1;
    return iy * width * depth + iz * width + ix;
  };

  const cells: GridCell[] = [];
  // World origin: centre the grid on x/z, put layer 0 at y = (layers−1)·scale.
  const xOffset = ((width - 1) * scale) / 2;
  const zOffset = ((depth - 1) * scale) / 2;
  for (let iy = 0; iy < layers; iy++) {
    for (let iz = 0; iz < depth; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const id = cells.length;
        cells.push({
          id,
          ix,
          iy,
          iz,
          neighbours: [-1, -1, -1, -1, -1, -1],
          centre: [
            ix * scale - xOffset,
            (layers - 1 - iy) * scale,
            iz * scale - zOffset,
          ],
        });
      }
    }
  }
  for (const c of cells) {
    c.neighbours[0] = idAt(c.ix, c.iy, c.iz + 1); // N = +z
    c.neighbours[1] = idAt(c.ix + 1, c.iy, c.iz); // E = +x
    c.neighbours[2] = idAt(c.ix, c.iy, c.iz - 1); // S = -z
    c.neighbours[3] = idAt(c.ix - 1, c.iy, c.iz); // W = -x
    c.neighbours[4] = idAt(c.ix, c.iy - 1, c.iz); // T = layer above (smaller iy)
    c.neighbours[5] = idAt(c.ix, c.iy + 1, c.iz); // B = layer below (larger iy)
  }

  return { width, depth, layers, scale, cells, seed, cellAt: idAt };
}

// Consumers used to import these types; re-export the new shape under the same name.
export type Vec3 = [number, number, number];
