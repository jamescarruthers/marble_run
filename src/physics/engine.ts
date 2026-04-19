import * as THREE from 'three';

export interface Engine {
  reset(): void;
  step(dtWall: number): void;
  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void;
  isFinished(): boolean;
  dispose(): void;
}

/** Static fallback used only if RapierEngine fails to initialise. Keeps the
 *  scene renderable without crashing. */
export class NullEngine implements Engine {
  private pos: THREE.Vector3;
  constructor(startPos: THREE.Vector3) {
    this.pos = startPos.clone();
  }
  reset(): void {}
  step(): void {}
  readMarble(out: { pos: THREE.Vector3; quat: THREE.Quaternion }): void {
    out.pos.copy(this.pos);
    out.quat.identity();
  }
  isFinished(): boolean {
    return false;
  }
  dispose(): void {}
}
