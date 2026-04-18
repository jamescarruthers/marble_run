import { useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, SoftShadows } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildGrid } from '../grid';
import { expandTiles, AUTHORED_TILES, driveGenerate } from '../wfc';
import { buildTrack } from '../geometry';
import { Track } from './Track';
import { Marble } from './Marble';
import { Sky } from './Sky';
import { KinematicEngine } from '../physics/engine';
import { MARBLE_RADIUS, PALETTE } from '../constants';

export function Scene() {
  const seed = useStore((s) => s.seed);
  const speed = useStore((s) => s.speed);
  const runState = useStore((s) => s.runState);
  const setRunState = useStore((s) => s.setRunState);

  const { track, engine } = useMemo(() => {
    const grid = buildGrid(seed);
    const tiles = expandTiles(AUTHORED_TILES);
    const result = driveGenerate(grid, tiles);
    if (!result) {
      console.warn('WFC solve failed after restarts; rendering empty track.');
      return {
        track: { meshes: [], path: [], startPos: new THREE.Vector3(), endPos: new THREE.Vector3(), pathCellCount: 0 },
        engine: new KinematicEngine(
          { meshes: [], path: [new THREE.Vector3(), new THREE.Vector3(0, -1, 0)], startPos: new THREE.Vector3(), endPos: new THREE.Vector3(0, -1, 0), pathCellCount: 0 },
          MARBLE_RADIUS,
        ),
      };
    }
    const trackBuild = buildTrack(grid, tiles, result.collapsed, result.startCellId, result.endCellId);
    const eng = new KinematicEngine(trackBuild, MARBLE_RADIUS);
    return { track: trackBuild, engine: eng };
  }, [seed]);

  const marbleRef = useRef<THREE.Mesh>(null!);
  const scratch = useMemo(
    () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() }),
    [],
  );

  useEffect(() => {
    if (runState === 'idle') engine.reset();
  }, [runState, engine]);

  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);

  useFrame((_, dt) => {
    if (runState === 'running') {
      engine.step(dt * speed);
      if (engine.isFinished()) setRunState('finished');
    }
    engine.readMarble(scratch);
    if (marbleRef.current) {
      marbleRef.current.position.copy(scratch.pos);
      marbleRef.current.quaternion.copy(scratch.quat);
    }
  });

  const target = useMemo(() => {
    const p = track.path;
    if (p.length === 0) return new THREE.Vector3();
    const mid = p[Math.floor(p.length / 2)]!;
    return mid.clone();
  }, [track]);

  return (
    <>
      <Sky />
      <SoftShadows size={32} samples={12} focus={0.8} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={[PALETTE.sky, PALETTE.cream, 0.7]} />
      <directionalLight
        position={[6, 10, 4]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <Environment preset="sunset" background={false} />
      <Track track={track} />
      <Marble ref={marbleRef} />
      <Ground />
      <OrbitControls target={target.toArray()} maxPolarAngle={Math.PI * 0.49} />
    </>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <circleGeometry args={[18, 64]} />
      <meshPhysicalMaterial color={PALETTE.cream} roughness={0.95} />
    </mesh>
  );
}
