import { useStore } from '../store';

export function ControlBar() {
  const regenerate = useStore((s) => s.regenerate);
  const drop = useStore((s) => s.drop);
  const runState = useStore((s) => s.runState);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 p-6 flex justify-center">
      <div className="card pointer-events-auto flex items-center gap-3 flex-wrap">
        <button className="chunky-btn primary" onClick={regenerate}>
          Regenerate
        </button>
        <button
          className="chunky-btn accent"
          onClick={drop}
          disabled={runState === 'running'}
        >
          {runState === 'finished' ? 'Drop Again' : 'Drop Marble'}
        </button>
        <label className="flex items-center gap-2 font-display font-semibold">
          Speed
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
          <span className="w-10 text-right">{speed.toFixed(2)}x</span>
        </label>
        <button className="chunky-btn" onClick={toggleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
    </div>
  );
}
