/// <reference types="vite/client" />
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

// Optional: seed mock sessions for local UI development.
// Triggered with `?seed=1` so it never fires against real data.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('seed') === '1') {
  void import('./dev-seed.js').then(({ seedDevData }) => seedDevData());
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
