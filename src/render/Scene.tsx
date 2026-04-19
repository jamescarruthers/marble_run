import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, SoftShadows } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildGrid } from '../grid';
import { driveGenerate } from '../wfc';
import { buildTrack, TrackBuild } from '../geometry';
import { Track } from './Track';
import { Marble } from './Marble';
import { Sky } from './Sky';
import { Engine, KinematicEngine, RapierEngine } from '../physics';
import { MARBLE_RADIUS, PALETTE } from '../constants';

function emptyTrack(): TrackBuild {
  const fallback = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)];
  const curve = new THREE.CatmullRomCurve3(fallback);
  const tube = new THREE.TubeGeometry(curve, 2, 0.05, 6, false);
  return {
    tube,
    startBell: new THREE.BufferGeometry(),
    endCup: new THREE.BufferGeometry(),
    path: fallback,
    startPos: fallback[0]!.clone(),
    endPos: fallback[1]!.clone(),
    pathCellCount: 0,
  };
}

export function Scene() {
  const seed = useStore((s) => s.seed);
  const speed = useStore((s) => s.speed);
  const runState = useStore((s) => s.runState);
  const setRunState = useStore((s) => s.setRunState);

  const { track, engine } = useMemo(() => {
    const grid = buildGrid(seed);
    const result = driveGenerate(grid);
    const t = result ? buildTrack(grid, result.pathCellIds) : emptyTrack();
    let eng: Engine;
    try {
      eng = new RapierEngine(t, MARBLE_RADIUS);
    } catch (err) {
      // If WASM hasn't loaded yet (shouldn't happen because main.tsx awaits it)
      // or the trough mesh was degenerate, fall back to the kinematic slider.
      console.warn('Rapier engine failed, falling back to kinematic:', err);
      eng = new KinematicEngine(t, MARBLE_RADIUS);
    }
    return { track: t, engine: eng };
  }, [seed]);

  const marbleRef = useRef<THREE.Mesh>(null!);
  const scratch = useMemo(
    () => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion() }),
    [],
  );

  useEffect(() => {
    if (runState === 'idle') engine.reset();
  }, [runState, engine]);

  useEffect(() => () => engine.dispose(), [engine]);

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

  const { bbox, target, camPos } = useMemo(() => {
    const box = new THREE.Box3();
    for (const p of track.path) box.expandByPoint(p);
    track.tube.computeBoundingBox();
    if (track.tube.boundingBox) box.union(track.tube.boundingBox);
    if (box.isEmpty()) {
      return { bbox: box, target: new THREE.Vector3(), camPos: new THREE.Vector3(6, 6, 6) };
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 1.1 + 1.5;
    return {
      bbox: box,
      target: center,
      camPos: center.clone().add(new THREE.Vector3(radius, radius * 0.6, radius)),
    };
  }, [track]);

  const three = useThree();
  useEffect(() => {
    three.camera.position.copy(camPos);
    three.camera.lookAt(target);
    three.camera.updateProjectionMatrix();
  }, [three.camera, camPos, target]);

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
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <Environment preset="sunset" background={false} />
      <Track track={track} />
      <Marble ref={marbleRef} />
      <Ground y={bbox.isEmpty() ? 0 : bbox.min.y - 0.05} />
      <OrbitControls target={target.toArray()} maxPolarAngle={Math.PI * 0.49} />
    </>
  );
}

function Ground({ y }: { y: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <circleGeometry args={[20, 64]} />
      <meshPhysicalMaterial color={PALETTE.cream} roughness={0.95} />
    </mesh>
  );
}
