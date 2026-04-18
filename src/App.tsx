import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Scene } from './render/Scene';
import { ControlBar } from './ui/ControlBar';

export default function App() {
  return (
    <div className="w-full h-full relative">
      <Canvas
        shadows
        camera={{ position: [6, 6, 6], fov: 40 }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <header className="fixed top-4 left-4 card">
        <div className="font-display text-2xl font-bold">marble run</div>
        <div className="text-sm opacity-70">procedural kawaii track toy</div>
      </header>
      <ControlBar />
    </div>
  );
}
