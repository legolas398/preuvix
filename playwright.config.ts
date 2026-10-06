import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:3011',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx server/index.ts',
    url: 'http://localhost:3011/api/config',
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      PRIVATE_PROTOTYPE: 'true',
      PREMIUM_TRANSMISSION_TEST: process.env.PREUVIX_TEST_PREMIUM === 'true' ? 'true' : 'false',
      OWNER_PASSWORD: 'browser-test-password-only',
      APP_ORIGIN: 'http://localhost:3011',
      PORT: '3011',
      HOST: '127.0.0.1',
      DATA_DIR: '.tools/browser-data',
      NODE_ENV: 'development',
      COOKIE_SECURE: 'false',
      TSA_URL: '',
      TSA_NAME: '',
      TSA_CA_FILE: '',
      TSA_POLICY_OID: '',
      TSA_SIGNER_SHA256: '',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      STRIPE_PRICE_ID: '',
      STRIPE_ALLOW_LIVE: 'false',
    },
  },
});
