import { describe, it, expect } from 'vitest';
import { buildGrid } from './grid';
import { driveGenerate } from './wfc';
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
  it('produces a connected piece assignment for several seeds', () => {
    let solvedCount = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = buildGrid(seed, { chunkRadius: 2, layers: 3 });
      const res = driveGenerate(g);
      if (!res) continue;
      solvedCount++;
      expect(res.assignments.length).toBe(g.cells.length);
      expect(res.pathCellIds.length).toBeGreaterThanOrEqual(2);
      const track = buildTrack(
        g,
        res.assignments,
        res.pathCellIds,
        res.startCellId,
        res.endCellId,
      );
      expect(track.meshes.length).toBeGreaterThan(0);
      const xml = serializeMJCF(track);
      expect(xml).toContain('<mujoco');
    }
    expect(solvedCount).toBeGreaterThan(4);
  });
});
