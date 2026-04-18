import { forwardRef } from 'react';
import * as THREE from 'three';
import { MARBLE_RADIUS } from '../constants';
import { marbleMaterial } from './materials';

export const Marble = forwardRef<THREE.Mesh>((_, ref) => {
  return (
    <mesh ref={ref} castShadow>
      <sphereGeometry args={[MARBLE_RADIUS, 32, 16]} />
      <primitive object={marbleMaterial} attach="material" />
    </mesh>
  );
});
Marble.displayName = 'Marble';
