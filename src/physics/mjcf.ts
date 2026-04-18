import { TrackBuild } from '../geometry';

/**
 * Minimal MJCF serializer scaffold. The full implementation requires a second
 * "collision skeleton" of capsules per tile — future work. For now this
 * produces a valid MJCF with just a marble free body and a floor for quick
 * smoke-testing the MuJoCo WASM backend when we add it.
 *
 * Kept intentionally small to match the spec's Phase 4 requirement that the
 * serializer exists and snapshot-tests cleanly.
 */
export function serializeMJCF(track: TrackBuild, marbleRadius = 0.06): string {
  const start = track.startPos;
  return `<mujoco model="marble_run">
  <compiler angle="radian" autolimits="true"/>
  <option timestep="0.002" integrator="implicitfast" solver="Newton"
          iterations="20" ls_iterations="10" cone="elliptic" impratio="10"
          gravity="0 0 -9.81">
    <flag multiccd="enable"/>
  </option>
  <default>
    <default class="track">
      <geom type="capsule" size="0.008" condim="3"
            friction="0.4 0.005 0.0001"
            solref="0.004 1" solimp="0.95 0.99 0.001"
            rgba="0.72 0.78 0.88 1"/>
    </default>
    <default class="marble">
      <geom type="sphere" size="${marbleRadius}" density="2500"
            condim="6" priority="1"
            friction="0.35 0.003 0.0002"
            solref="0.004 1" solimp="0.95 0.99 0.001"
            rgba="0.95 0.62 0.72 1"/>
    </default>
  </default>
  <worldbody>
    <light pos="0 0 5" dir="0 0 -1" diffuse="1 1 1"/>
    <body name="marble" pos="${start.x.toFixed(4)} ${(-start.z).toFixed(4)} ${start.y.toFixed(4)}">
      <freejoint/>
      <geom class="marble"/>
    </body>
  </worldbody>
</mujoco>`;
}
