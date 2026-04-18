import { AuthoredTile, Tile } from './tiles';
import { rotateFaces } from './sockets';

export function expandTiles(authored: AuthoredTile[]): Tile[] {
  const out: Tile[] = [];
  for (const a of authored) {
    const rots = a.rotations;
    for (let k = 0; k < rots; k++) {
      out.push({
        id: out.length,
        parent: a.name,
        rotation: k as 0 | 1 | 2 | 3,
        weight: a.weight,
        faces: rotateFaces(a.faces, k),
        meshKey: a.meshKey,
        collisionKey: a.collisionKey,
        special: a.special,
      });
    }
  }
  return out;
}
