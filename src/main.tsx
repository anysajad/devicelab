import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { restoreLastProject } from './projects/bootstrap';

import './index.css';
import App from './App';

// Restore the last project synchronously before React renders.
// This must happen before createRoot() to avoid a visible flash.
restoreLastProject();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
