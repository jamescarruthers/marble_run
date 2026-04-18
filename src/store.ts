import { create } from 'zustand';

export type RunState = 'idle' | 'running' | 'finished';

interface AppState {
  seed: number;
  speed: number;
  runState: RunState;
  muted: boolean;
  regenerate: () => void;
  drop: () => void;
  setSpeed: (v: number) => void;
  setRunState: (s: RunState) => void;
  toggleMute: () => void;
}

export const useStore = create<AppState>((set) => ({
  seed: Math.floor(Math.random() * 1e9),
  speed: 1.0,
  runState: 'idle',
  muted: false,
  regenerate: () => set({ seed: Math.floor(Math.random() * 1e9), runState: 'idle' }),
  drop: () => set({ runState: 'running' }),
  setSpeed: (v) => set({ speed: v }),
  setRunState: (s) => set({ runState: s }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
}));
