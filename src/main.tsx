import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { restoreLastProject } from './projects/bootstrap';
import { useProjectManagerStore } from './projects/manager/useProjectManagerStore';
import { applyTheme, useAppStore } from './store/useAppStore';

import './index.css';
import App from './App';

// Restore the last project synchronously before React renders.
// This must happen before createRoot() to avoid a visible flash.
// The returned booted info is passed to the project manager store
// to reflect the exact workspace state without independently
// reconstructing it.
const booted = restoreLastProject();
useProjectManagerStore.getState().initialize(booted);

// Apply the persisted theme preference before first paint to avoid a
// light->dark flash for dark-mode users.
applyTheme(useAppStore.getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
