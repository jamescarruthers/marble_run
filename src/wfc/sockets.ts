export type SideDir = 'in' | 'out' | 'both';

export type FlowSide =
  | { open: false }
  | { open: true; height: 0 | 1 | 2; dir: SideDir };

export type VertDir = 'drop_in' | 'drop_out';

export type FlowVert = { open: false } | { open: true; dir: VertDir };

export interface TileFaces {
  N: FlowSide;
  E: FlowSide;
  S: FlowSide;
  W: FlowSide;
  T: FlowVert;
  B: FlowVert;
}

export const SIDE_KEYS: Array<'N' | 'E' | 'S' | 'W'> = ['N', 'E', 'S', 'W'];

/** Sides at positions N=0, E=1, S=2, W=3. A +1 CCW rotation around Z moves N→W, W→S, S→E, E→N
 *  i.e. rotation idx k rotates "NESW" such that rotated.N = original.(N - k mod 4).
 *  For simplicity we rotate by reindexing the NESW array.
 */
export function rotateFaces(faces: TileFaces, k: number): TileFaces {
  const arr: FlowSide[] = [faces.N, faces.E, faces.S, faces.W];
  // rotated[i] = arr[(i - k + 4) % 4]
  const r: FlowSide[] = [
    arr[(0 - k + 4) % 4]!,
    arr[(1 - k + 4) % 4]!,
    arr[(2 - k + 4) % 4]!,
    arr[(3 - k + 4) % 4]!,
  ];
  return { N: r[0]!, E: r[1]!, S: r[2]!, W: r[3]!, T: faces.T, B: faces.B };
}

export function mateSide(a: FlowSide, b: FlowSide): boolean {
  if (!a.open && !b.open) return true;
  if (a.open !== b.open) return false;
  if (!a.open || !b.open) return false;
  if (a.height !== b.height) return false;
  if (a.dir === 'both' || b.dir === 'both') return true;
  return (a.dir === 'in' && b.dir === 'out') || (a.dir === 'out' && b.dir === 'in');
}

/** lowerTopFace on the cell below, upperBotFace on the cell above. */
export function mateVert(lowerTopFace: FlowVert, upperBotFace: FlowVert): boolean {
  if (!lowerTopFace.open && !upperBotFace.open) return true;
  if (lowerTopFace.open !== upperBotFace.open) return false;
  if (!lowerTopFace.open || !upperBotFace.open) return false;
  return lowerTopFace.dir === 'drop_in' && upperBotFace.dir === 'drop_out';
}

/** Direction index convention used in solve/propagate.
 *  0=N, 1=E, 2=S, 3=W, 4=T (up), 5=B (down).
 */
export const DIR = { N: 0, E: 1, S: 2, W: 3, T: 4, B: 5 } as const;
export const OPP = [2, 3, 0, 1, 5, 4] as const;
