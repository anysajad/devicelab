import { useEffect } from 'react';

import { applyTheme, useAppStore } from './store/useAppStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { PreviewWorkspace } from './preview';

function App() {
  const theme = useAppStore((s) => s.theme);

  // Follow OS-level preference changes while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system') return;
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return (
    <Layout>
      <ErrorBoundary>
        <PreviewWorkspace />
      </ErrorBoundary>
    </Layout>
  );
}

export default App;
