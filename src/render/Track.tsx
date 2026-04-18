import { TrackBuild } from '../geometry';
import { endMaterial, startMaterial, trackMaterial } from './materials';

interface Props {
  track: TrackBuild;
}

export function Track({ track }: Props) {
  return (
    <group>
      <mesh geometry={track.tube} material={trackMaterial} castShadow receiveShadow />
      <mesh geometry={track.startBell} material={startMaterial} castShadow receiveShadow />
      <mesh geometry={track.endCup} material={endMaterial} castShadow receiveShadow />
    </group>
  );
}
