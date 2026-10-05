import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/.tools/**', '**/data/**', '**/test-results/**'] } },
  build: { outDir: 'dist' },
});
