import { describe, it, expect } from 'vitest';
import { buildGrid } from './grid';
import { AUTHORED_TILES, driveGenerate, expandTiles } from './wfc';
import { buildTrack } from './geometry';
import { serializeMJCF } from './physics';

describe('grid pipeline', () => {
  it('generates a mesh with quads', () => {
    const g = buildGrid(1234, { chunkRadius: 2, layers: 3 });
    expect(g.cells.length).toBeGreaterThan(0);
    expect(g.mesh.faces.some((f) => f.verts.length === 4)).toBe(true);
  });
});

describe('driven generator', () => {
  it('produces a connected track for several seeds', () => {
    const tiles = expandTiles(AUTHORED_TILES);
    let solvedCount = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = buildGrid(seed, { chunkRadius: 2, layers: 3 });
      const res = driveGenerate(g, tiles);
      if (!res) continue;
      solvedCount++;
      expect(res.collapsed.length).toBe(g.cells.length);
      const track = buildTrack(g, tiles, res.collapsed, res.startCellId, res.endCellId);
      expect(track.path.length).toBeGreaterThan(2);
      const xml = serializeMJCF(track);
      expect(xml).toContain('<mujoco');
    }
    expect(solvedCount).toBeGreaterThan(4);
  });
});
