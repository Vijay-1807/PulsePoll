import { defineConfig } from '@playwright/test'

// Dedicated config for generating README screenshots.
// Run from frontend/:  npx playwright test --config screenshots/playwright.config.ts
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 120_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
