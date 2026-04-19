import { TrackBuild } from '../geometry';
import { materialForParent } from './materials';

interface Props {
  track: TrackBuild;
}

export function Track({ track }: Props) {
  return (
    <group>
      {track.meshes.map((m, i) => (
        <mesh
          key={i}
          geometry={m.geom}
          material={materialForParent(m.parent)}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
