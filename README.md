# marble_run

Procedural kawaii marble-run toy. Generates an irregular Townscaper-style quad
grid, drives tile placement through it, warps tiles into the prism cells, and
renders the result in Three.js with a rolling marble.

## Quickstart

```bash
npm install
npm run dev     # Vite dev server
npm run build   # production bundle
npm test        # vitest unit/smoke tests
```

## Pipeline

- `src/grid/` — half-edge mesh, `triHexChunk` → `randomPairing` → `conwayOrtho`
  → `weld` → `relax` (Stålberg squaring force) → `extrude` into prismatic 3D
  cells, each with neighbour info plus shared-edge neighbour-edge indices.
- `src/wfc/` — flow sockets, authored tile set with per-rotation expansion,
  bitset domains, per-edge compat table, AC-3 propagate, entropy collapse, and
  `drive.ts` — a driven generator that BFS-walks a path start→end and picks
  tiles cell-by-cell. The pure WFC solver in `solve.ts` is kept for future
  work but `drive.ts` is what the app uses today — it guarantees a connected
  track for any seed.
- `src/geometry/` — authored tile meshes in the unit cube, trilinear warp into
  each prism, and `buildTrack` which walks the resolved flow graph to assemble
  the visible meshes plus the marble's world-space path.
- `src/physics/` — kinematic `Engine` that advances the marble along a
  CatmullRom arc-length parameterisation of the path under a light
  gravity-biased speed model. `mjcf.ts` is a scaffold for the full MuJoCo WASM
  backend described in the build brief — swapping the engine is a local change
  in `Scene.tsx`.
- `src/render/` — R3F scene, track/marble/sky, pastel toon-ish materials.
- `src/ui/` — Tailwind-styled `ControlBar` (Regenerate / Drop / Speed / Mute).

## Open items

- MuJoCo WASM backend: `physics/mjcf.ts` has the serializer scaffold but the
  actual engine is kinematic for this first playable cut. The spec's capsule
  collision skeletons per tile aren't authored yet.
- Full undriven WFC with path constraints (DeBroglie-style) — today we use
  the driven walker because unconstrained WFC rarely produces a connected
  start→end path with this tile set.
- Contact-driven squash-and-stretch, rolling-sound and end-ping audio cues
  are not yet wired to the kinematic engine.
