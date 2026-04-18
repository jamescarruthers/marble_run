import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// For GitHub Pages project sites the site is served at /<repo>/, so the build must
// emit relative-anchored asset paths. `VITE_BASE` is set by the Pages workflow.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  plugins: [react()],
  base,
  server: { port: 5173 },
});
