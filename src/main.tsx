import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppBoundary from './AppBoundary';
import { ThemeProvider } from './Theme';
import './styles.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/syne/latin-700.css';
import './typography.css';
import './design.css';
import './themes.css';
import './journey.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppBoundary>
        <React.Suspense
          fallback={
            <main className="loading-page" role="status">
              Chargement de votre espace…
            </main>
          }
        >
          <App />
        </React.Suspense>
      </AppBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
