import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../Theme';
import App from '../App';
import AppBoundary from '../AppBoundary';
import NativeShell from './NativeShell';
import '../styles.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '../typography.css';
import '../design.css';
import '../themes.css';
import '../journey.css';
import './mobile.css';
import './shared.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppBoundary>
        <NativeShell>
          <React.Suspense
            fallback={
              <main className="loading-page" role="status">
                Chargement de votre espace…
              </main>
            }
          >
            <App />
          </React.Suspense>
        </NativeShell>
      </AppBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
