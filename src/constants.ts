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

/** World-unit size of one tile. */
export const GRID_SCALE = 2.0;

export const GRID_DEFAULTS = {
  width: 6,
  depth: 6,
  layers: 1,
};

export const MARBLE_RADIUS = 0.11;

/** Thickness of a tile slab (y span) in unit-cube coords before GRID_SCALE. */
export const TILE_THICKNESS = 0.22;
/** Full width of the carved groove in unit-cube coords. */
export const GROOVE_WIDTH = 0.34;
/** How deep the groove dips below the slab's top face. */
export const GROOVE_DEPTH = 0.15;
