import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../Theme';
import MobileApp from './MobileApp';
import '../styles.css';
import '@fontsource/outfit/latin-400.css';
import '@fontsource/outfit/latin-600.css';
import '@fontsource/syne/latin-700.css';
import '../typography.css';
import '../themes.css';
import './mobile.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <MobileApp />
    </ThemeProvider>
  </React.StrictMode>,
);
