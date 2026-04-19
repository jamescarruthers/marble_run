import { useFrame, useThree } from '@react-three/fiber';
import { Environment, SoftShadows } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useStore } from '../store';
import { buildGrid } from '../grid';
import { driveGenerate } from '../wfc';
import { buildTrack, TrackBuild } from '../geometry';
import { Track } from './Track';
import { Marble } from './Marble';
import { Sky } from './Sky';
import { Engine, NullEngine, RapierEngine } from '../physics';
import { MARBLE_RADIUS, PALETTE } from '../constants';

function emptyTrack(): TrackBuild {
  return {
    meshes: [],
    collisionGeom: new THREE.BufferGeometry(),
    dynamics: [] as never[],
    startPos: new THREE.Vector3(0, 0.3, 0),
    endPos: new THREE.Vector3(0, 0, 0),
    path: [new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(0, 0, 0)],
    pathCellCount: 0,
  };
}

// Classic game-style isometric: 45° around Y, ~35.264° tilt downward (atan(1/√2)).
const ISO_DIR = new THREE.Vector3(1, Math.SQRT1_2 * Math.SQRT2, 1).normalize();

export function Scene() {
  const seed = useStore((s) => s.seed);
  const speed = useStore((s) => s.speed);
  const runState = useStore((s) => s.runState);
  const setRunState = useStore((s) => s.setRunState);

  const { track, engine } = useMemo(() => {
    const grid = buildGrid(seed);
    const result = driveGenerate(grid);
    const t = result
      ? buildTrack(grid, result.assignments, result.pathCellIds, result.startCellId, result.endCellId)
      : emptyTrack();
    let eng: Engine;
    try {
      eng = new RapierEngine(t, MARBLE_RADIUS);
    } catch (err) {
      console.warn('Rapier engine failed:', err);
      eng = new NullEngine(t.startPos);
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

  // Frame the board with an orthographic isometric camera pinned to ISO_DIR.
  const { groundY, target, camPos, zoom } = useMemo(() => {
    const box = new THREE.Box3();
    for (const m of track.meshes) {
      m.geom.computeBoundingBox();
      if (m.geom.boundingBox) box.union(m.geom.boundingBox);
    }
    if (box.isEmpty()) {
      return {
        groundY: 0,
        target: new THREE.Vector3(),
        camPos: ISO_DIR.clone().multiplyScalar(20),
        zoom: 80,
      };
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const boardExtent = Math.max(size.x, size.z);
    return {
      groundY: box.min.y - 0.05,
      target: center,
      camPos: center.clone().add(ISO_DIR.clone().multiplyScalar(30)),
      zoom: 640 / Math.max(1, boardExtent + 2),
    };
  }, [track]);

  const three = useThree();
  useEffect(() => {
    const cam = three.camera as THREE.OrthographicCamera;
    cam.position.copy(camPos);
    cam.lookAt(target);
    cam.zoom = zoom;
    cam.updateProjectionMatrix();
  }, [three.camera, camPos, target, zoom]);

  return (
    <>
      <Sky />
      <SoftShadows size={32} samples={12} focus={0.8} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={[PALETTE.sky, PALETTE.cream, 0.65]} />
      <directionalLight
        position={[8, 14, 6]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      <Environment preset="sunset" background={false} />
      <Track track={track} />
      <Marble ref={marbleRef} />
      <Ground y={groundY} />
    </>
  );
}

function Ground({ y }: { y: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshPhysicalMaterial color={PALETTE.cream} roughness={0.95} />
    </mesh>
  );
}
