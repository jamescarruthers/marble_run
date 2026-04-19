import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { TrackBuild } from '../geometry';
import { Engine } from './engine';

const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 8;

export interface WheelState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  radius: number;
}

/**
 * Rigid-body physics marble. The combined tile-piece mesh is used as a static
 * trimesh collider so the marble bounces off the same surface the user sees.
 * A catch-all cuboid sits below the bbox to catch strays. Dynamic pieces
 * (wheels) become free-spinning cylinders constrained by a revolute joint.
 */
export class RapierEngine implements Engine {
  private world: RAPIER.World;
  private marbleBody: RAPIER.RigidBody;
  private startPos: THREE.Vector3;
  private accum = 0;
  private finishedAt: number | null = null;
  private endPos: THREE.Vector3;
  private wheels: Array<{ body: RAPIER.RigidBody; radius: number }> = [];

  constructor(track: TrackBuild, marbleRadius: number) {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

    // Static trimesh of all piece geometry ----------------------------------
    const pos = track.collisionGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
    const index = track.collisionGeom.getIndex();
    if (pos && index) {
      const verts = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        verts[i * 3] = pos.getX(i);
        verts[i * 3 + 1] = pos.getY(i);
        verts[i * 3 + 2] = pos.getZ(i);
      }
      const idx = new Uint32Array(index.count);
      for (let i = 0; i < index.count; i++) idx[i] = index.getX(i);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(verts, idx).setFriction(0.35).setRestitution(0.25),
        body,
      );
    }

    // Safety net ground -----------------------------------------------------
    const box = new THREE.Box3();
    for (const p of track.path) box.expandByPoint(p);
    box.expandByPoint(track.startPos);
    box.expandByPoint(track.endPos);
    const groundY = (box.isEmpty() ? 0 : box.min.y) - 2.5;
    const ground = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, groundY, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(40, 0.1, 40).setFriction(0.5).setRestitution(0.2),
      ground,
    );

    // Dynamic wheels --------------------------------------------------------
    for (const dyn of track.dynamics) {
      if (dyn.kind !== 'wheel') continue;
      const p = dyn.worldPos;
      const wheelDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setAngularDamping(0.3);
      const wheelBody = this.world.createRigidBody(wheelDesc);
      // Approximate the paddle wheel as a short thin cylinder about the y axis.
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.05, dyn.radius)
          .setFriction(0.3)
          .setRestitution(0.35)
          .setDensity(600),
        wheelBody,
      );
      // Anchor it with a revolute joint to a tiny fixed stub so it spins in
      // place about its y axis without translating.
      const anchorBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z),
      );
      const joint = RAPIER.JointData.revolute(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      );
      this.world.createImpulseJoint(joint, anchorBody, wheelBody, true);
      this.wheels.push({ body: wheelBody, radius: dyn.radius });
    }

    // Marble ----------------------------------------------------------------
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
    this.accum += Math.min(0.1, dtWall);
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
      if (dx * dx + dy * dy + dz * dz < 0.35 * 0.35) this.finishedAt = performance.now();
    }
  }

  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
    const t = this.marbleBody.translation();
    const r = this.marbleBody.rotation();
    out.pos.set(t.x, t.y, t.z);
    out.quat.set(r.x, r.y, r.z, r.w);
  }

  readWheels(out: WheelState[]): void {
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i]!;
      const t = w.body.translation();
      const q = w.body.rotation();
      let slot = out[i];
      if (!slot) {
        slot = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), radius: w.radius };
        out[i] = slot;
      }
      slot.position.set(t.x, t.y, t.z);
      slot.quaternion.set(q.x, q.y, q.z, q.w);
      slot.radius = w.radius;
    }
    out.length = this.wheels.length;
  }

  isFinished(): boolean {
    return this.finishedAt !== null;
  }

  dispose(): void {
    this.world.free();
  }
}
