export const PALETTE = {
  pink: '#FFC2D4',
  mint: '#B6E8D8',
  butter: '#FFE8A3',
  sky: '#BFDFF7',
  skyDeep: '#D9C7F5',
  lavender: '#E2D4F0',
  cream: '#FFF7EC',
  bark: '#6B5B73',
  shadow: '#2F2440',
} as const;

/** World-unit scale factor applied to all grid positions. Bigger = chunkier tiles. */
export const GRID_SCALE = 2.0;

export const GRID_DEFAULTS = {
  chunkRadius: 3,
  layers: 4,
  layerHeight: 1.0,
  relaxIterations: 80,
  relaxStep: 0.12,
};

export const MARBLE_RADIUS = 0.12;

/** Radius of the track tube rendered into each cell (before grid scaling). */
export const TRACK_TUBE_RADIUS = 0.16;

/** Height bands in unit-cube y coords (before warp). */
export const HEIGHT_BANDS = { L: 0.22, M: 0.5, H: 0.78 } as const;
