import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src',
  // Use headless by default (no browser window)
  use: {
    headless: true,
    launchOptions: {
      // These flags reduce cross-origin restrictions but do NOT bypass CORS enforced by fetch.
      args: [
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-features=BlockInsecurePrivateNetworkRequests,BlockInsecurePrivateNetworkRequestsFromPrivate',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Make tests more deterministic
  retries: 0,
  timeout: 60_000,
});
