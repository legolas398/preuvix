import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  testDir: './tests/android',
  outputDir: '.tools/android-test-results',
  workers: 1,
  timeout: 90000,
  use: {
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    viewport: { width: 390, height: 844 },
    trace: 'retain-on-failure',
  },
  webServer: {
    ...(base.webServer as object),
    command: 'npx tsx server/index.ts',
    url: 'http://localhost:3013/api/config',
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      ...(base.webServer as { env: Record<string, string> }).env,
      MOBILE_ENABLED: 'true',
      APP_ORIGIN: 'http://localhost:3013',
      PORT: '3013',
      DATA_DIR: '.tools/android-browser-data',
    },
  },
});
