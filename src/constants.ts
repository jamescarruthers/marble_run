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

export const GRID_DEFAULTS = {
  chunkRadius: 3,
  layers: 4,
  layerHeight: 1.0,
  relaxIterations: 60,
  relaxStep: 0.15,
};

export const MARBLE_RADIUS = 0.06;

/** Height bands in unit-cube y coords (before warp). */
export const HEIGHT_BANDS = { L: 0.16, M: 0.5, H: 0.84 } as const;
