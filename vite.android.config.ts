import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { backendOrigin } from './src/mobile/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const development = mode === 'android-development';
  const url = backendOrigin(
    process.env.VITE_BACKEND_URL ||
      env.VITE_BACKEND_URL ||
      (development ? 'http://10.0.2.2:3000' : ''),
    development,
  );
  return {
    plugins: [
      react(),
      {
        name: 'preuvix-android-entry',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) =>
            html
              .replace('/src/main.tsx', '/src/mobile/main.tsx')
              .replace(
                'width=device-width, initial-scale=1.0',
                'width=device-width, initial-scale=1.0, viewport-fit=cover',
              )
              .replace(
                '<meta charset="UTF-8" />',
                `<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org; media-src 'self' blob:; connect-src 'self' ${url}; font-src 'self' data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'">`,
              ),
        },
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'mobile-build.json',
            source: JSON.stringify({ development, backend: url }),
          });
        },
      },
    ],
    define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify(url) },
    build: { outDir: 'dist-android' },
    server: { host: '127.0.0.1' },
  };
});
