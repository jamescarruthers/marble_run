import RAPIER from '@dimforge/rapier3d-compat';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './ui/styles.css';

// Rapier ships its physics kernel as WASM; it must be initialised before any
// RAPIER.* constructor is invoked. The -compat build bundles a single-threaded
// WASM payload so no COOP/COEP headers are required, which matters for GitHub
// Pages. Awaiting here gates the whole app on the kernel being ready.
RAPIER.init().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
