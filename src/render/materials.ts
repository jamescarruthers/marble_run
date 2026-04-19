import * as THREE from 'three';
import { PALETTE } from '../constants';

export const trackMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(PALETTE.mint),
  roughness: 0.85,
  clearcoat: 0.3,
  clearcoatRoughness: 0.8,
  sheen: 0.2,
});

export const startMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(PALETTE.butter),
  roughness: 0.8,
  clearcoat: 0.2,
});

export const endMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(PALETTE.pink),
  roughness: 0.8,
  clearcoat: 0.2,
});

export const marbleMaterial = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(PALETTE.pink),
  roughness: 0.3,
  transmission: 0.1,
  thickness: 0.4,
  clearcoat: 1.0,
});

export function materialForParent(parent: string): THREE.Material {
  if (parent === 'START') return startMaterial;
  if (parent === 'END') return endMaterial;
  return trackMaterial;
}
