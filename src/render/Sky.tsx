import * as THREE from 'three';
import { useMemo } from 'react';
import { PALETTE } from '../constants';

export function Sky() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(PALETTE.sky) },
        bottomColor: { value: new THREE.Color(PALETTE.skyDeep) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main() {
          float t = clamp(vPos.y / 40.0 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide,
    });
  }, []);
  return (
    <mesh material={material}>
      <sphereGeometry args={[60, 24, 16]} />
    </mesh>
  );
}
