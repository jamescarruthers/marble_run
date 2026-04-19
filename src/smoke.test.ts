import { describe, it, expect } from 'vitest';
import { buildGrid } from './grid';
import { driveGenerate } from './wfc';
import { buildTrack } from './geometry';
import { serializeMJCF } from './physics';

describe('cube grid', () => {
  it('builds a W×D×Layers lattice with correct neighbour wiring', () => {
    const g = buildGrid(1234, { width: 3, depth: 3, layers: 2 });
    expect(g.cells.length).toBe(3 * 3 * 2);
    // pick an interior cell on the top layer and sanity check its 6 neighbours
    const c = g.cells[g.cellAt(1, 0, 1)]!;
    expect(c.neighbours[0]).toBe(g.cellAt(1, 0, 2)); // N
    expect(c.neighbours[5]).toBe(g.cellAt(1, 1, 1)); // B
    expect(c.neighbours[4]).toBe(-1); // no layer above layer 0
  });
});

describe('driven generator', () => {
  it('produces a valid assignment for several seeds', () => {
    let solved = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const g = buildGrid(seed, { width: 6, depth: 6, layers: 1 });
      const res = driveGenerate(g);
      if (!res) continue;
      solved++;
      expect(res.assignments.length).toBe(g.cells.length);
      expect(res.pathCellIds.length).toBeGreaterThanOrEqual(2);
      const track = buildTrack(g, res.assignments, res.pathCellIds, res.startCellId, res.endCellId);
      expect(track.meshes.length).toBeGreaterThan(0);
      const xml = serializeMJCF(track);
      expect(xml).toContain('<mujoco');
    }
    expect(solved).toBeGreaterThanOrEqual(8);
  });
});
