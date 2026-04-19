/** Face/direction indices shared between the grid, pieces, and driver. */
export const DIR = { N: 0, E: 1, S: 2, W: 3, T: 4, B: 5 } as const;
export const OPP = [2, 3, 0, 1, 5, 4] as const;
