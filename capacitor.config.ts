import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync, existsSync } from 'node:fs';
const build = existsSync('dist-android/mobile-build.json')
  ? JSON.parse(readFileSync('dist-android/mobile-build.json', 'utf8'))
  : { development: false };
const config: CapacitorConfig = {
  appId: 'fr.preuvix.app',
  appName: 'Preuvix',
  webDir: 'dist-android',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: build.development === true },
  plugins: { SystemBars: { insetsHandling: 'css' } },
};
export default config;
