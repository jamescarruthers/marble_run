import { useMemo } from 'react';
import * as THREE from 'three';
import { TrackBuild } from '../geometry';
import { materialForParent } from './materials';

interface Props {
  track: TrackBuild;
}

export function Track({ track }: Props) {
  const grouped = useMemo(() => {
    const by = new Map<string, THREE.BufferGeometry[]>();
    for (const m of track.meshes) {
      let list = by.get(m.parent);
      if (!list) {
        list = [];
        by.set(m.parent, list);
      }
      list.push(m.geom);
    }
    return by;
  }, [track]);

  return (
    <group>
      {[...grouped.entries()].map(([parent, geoms]) => (
        <group key={parent}>
          {geoms.map((g, i) => (
            <mesh key={i} geometry={g} material={materialForParent(parent)} castShadow receiveShadow />
          ))}
        </group>
      ))}
    </group>
  );
}
