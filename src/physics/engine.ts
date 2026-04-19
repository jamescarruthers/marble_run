import * as THREE from 'three';
import { MARBLE_SIT_OFFSET, TrackBuild } from '../geometry';

export interface Engine {
  reset(): void;
  step(dtWall: number): void;
  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void;
  isFinished(): boolean;
  dispose(): void;
}

/**
 * Kinematic engine: arc-length parameterised CatmullRom curve along the track's
 * resolved flow path. Gives a stable, deterministic marble animation that we can
 * always render while the MuJoCo backend is a longer, deployment-sensitive job.
 */
export class KinematicEngine implements Engine {
  private curve: THREE.CatmullRomCurve3;
  private lengths: number[]; // cumulative arc length samples
  private totalLen: number;
  private marbleRadius: number;
  private s = 0; // arc length
  private speed = 1.2; // m/s base
  private tmpTangent = new THREE.Vector3();
  private accumQuat = new THREE.Quaternion();

  constructor(track: TrackBuild, marbleRadius: number) {
    const pts = track.path.length >= 2 ? track.path : [new THREE.Vector3(), new THREE.Vector3(0, -1, 0)];
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
    this.marbleRadius = marbleRadius;
    this.lengths = this.curve.getLengths(200);
    this.totalLen = this.lengths[this.lengths.length - 1]!;
  }

  reset(): void {
    this.s = 0;
    this.accumQuat.identity();
  }

  step(dtWall: number): void {
    if (this.totalLen <= 0) return;
    // simple gravity-ish speed scaling: faster when falling, slower on flats
    this.curve.getTangentAt(Math.min(0.999, this.s / this.totalLen), this.tmpTangent);
    const gravAccel = -this.tmpTangent.y; // +y = up; tangent.y<0 means descending
    this.speed += gravAccel * 4.0 * dtWall;
    this.speed = Math.max(0.5, Math.min(3.5, this.speed));
    this.s = Math.min(this.totalLen, this.s + this.speed * dtWall);
    // update rolling quaternion about axis perpendicular to tangent (cross with +y)
    const axis = new THREE.Vector3().crossVectors(this.tmpTangent, new THREE.Vector3(0, 1, 0)).normalize();
    const dTheta = (this.speed * dtWall) / this.marbleRadius;
    if (Number.isFinite(dTheta) && axis.lengthSq() > 1e-6) {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, dTheta);
      this.accumQuat.premultiply(q);
    }
  }

  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
    if (this.totalLen <= 0) {
      out.pos.set(0, 0, 0);
      out.quat.identity();
      return;
    }
    const u = Math.min(0.999, this.s / this.totalLen);
    this.curve.getPointAt(u, out.pos);
    // Sink to the bottom of the open trough so the marble rides visibly
    // inside it, with its bottom touching the floor.
    out.pos.y -= MARBLE_SIT_OFFSET - this.marbleRadius;
    out.quat.copy(this.accumQuat);
  }

  isFinished(): boolean {
    return this.s >= this.totalLen - 1e-4;
  }

  dispose(): void {
    // nothing to clean up
  }
}
