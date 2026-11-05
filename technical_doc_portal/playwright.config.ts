import { defineConfig } from "@playwright/test";

/**
 * End-to-end acceptance tests (scenarios A–F).
 * Runs a production build against a SEPARATE test database and storage folder,
 * which are reset before every run. Requires a local PostgreSQL and Google Chrome.
 *
 *   createdb nsk_portal_test   # once
 *   npm run test:e2e
 */
const PORT = 3100;
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/nsk_portal_test";
const testEnv = {
  DATABASE_URL: TEST_DB,
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: "./storage-test",
  APP_URL: `http://localhost:${PORT}`,
  OCR_CACHE_DIR: "./storage/.ocr-cache",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  SEED_ADMIN_EMAIL: "admin@nsk-portal.test",
  SEED_ADMIN_PASSWORD: "Admin-Portal-2026!",
  SEED_DEALER_EMAIL: "dealer@sample-dealer.test",
  SEED_DEALER_PASSWORD: "Dealer-Portal-2026!",
};
Object.assign(process.env, testEnv);

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    acceptDownloads: true,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: testEnv,
  },
});
