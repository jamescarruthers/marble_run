import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TrackBuild } from '../geometry';
import { Engine } from './engine';

const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 8;

/**
 * Rigid-body physics marble. The trough BufferGeometry is reused verbatim as a
 * static trimesh collider so the marble bounces off the actual surface the
 * user sees. A big catch-all ground plane is placed well below the track so
 * marbles that fly out of the open rim don't fall forever.
 *
 * Rapier's trimesh colliders are infinitely thin — fast-moving spheres can
 * tunnel — so we enable CCD on the marble.
 */
export class RapierEngine implements Engine {
  private world: RAPIER.World;
  private marbleBody: RAPIER.RigidBody;
  private startPos: THREE.Vector3;
  private accum = 0;
  private finishedAt: number | null = null;
  private endPos: THREE.Vector3;

  constructor(track: TrackBuild, marbleRadius: number) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Trough trimesh ---------------------------------------------------------
    const pos = track.tube.getAttribute('position') as THREE.BufferAttribute;
    const index = track.tube.getIndex();
    if (!index) throw new Error('track tube geometry must be indexed');
    const verts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      verts[i * 3] = pos.getX(i);
      verts[i * 3 + 1] = pos.getY(i);
      verts[i * 3 + 2] = pos.getZ(i);
    }
    const idx = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) idx[i] = index.getX(i);

    const troughBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.35).setRestitution(0.25),
      troughBody,
    );

    // Safety net ground ------------------------------------------------------
    const box = new THREE.Box3();
    for (const p of track.path) box.expandByPoint(p);
    const groundY = (box.isEmpty() ? 0 : box.min.y) - 2.0;
    const ground = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(30, 0.1, 30).setFriction(0.5).setRestitution(0.2),
      ground,
    );

    // Marble -----------------------------------------------------------------
    this.startPos = track.startPos.clone();
    this.endPos = track.endPos.clone();
    const marbleDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this.startPos.x, this.startPos.y + 0.05, this.startPos.z)
      .setCcdEnabled(true)
      .setLinearDamping(0.04)
      .setAngularDamping(0.05);
    this.marbleBody = this.world.createRigidBody(marbleDesc);
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(marbleRadius)
        .setFriction(0.28)
        .setRestitution(0.55)
        .setDensity(2500),
      this.marbleBody,
    );
  }

  reset(): void {
    this.marbleBody.setTranslation(
      { x: this.startPos.x, y: this.startPos.y + 0.05, z: this.startPos.z },
      true,
    );
    this.marbleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.marbleBody.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.finishedAt = null;
  }

  step(dtWall: number): void {
    this.world.timestep = FIXED_DT;
    this.accum += Math.min(0.1, dtWall); // cap to avoid spiral-of-death after tab blur
    let steps = 0;
    while (this.accum >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.world.step();
      this.accum -= FIXED_DT;
      steps++;
    }
    if (this.finishedAt === null) {
      const t = this.marbleBody.translation();
      const dx = t.x - this.endPos.x;
      const dy = t.y - this.endPos.y;
      const dz = t.z - this.endPos.z;
      if (dx * dx + dy * dy + dz * dz < 0.25 * 0.25) this.finishedAt = performance.now();
    }
  }

  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
    const t = this.marbleBody.translation();
    const r = this.marbleBody.rotation();
    out.pos.set(t.x, t.y, t.z);
    out.quat.set(r.x, r.y, r.z, r.w);
  }

  isFinished(): boolean {
    return this.finishedAt !== null;
  }

  dispose(): void {
    // Rapier World owns all bodies/colliders; freeing it releases the lot.
    this.world.free();
  }
}
