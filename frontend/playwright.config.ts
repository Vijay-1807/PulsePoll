import { defineConfig, devices } from '@playwright/test'

// Default: runs against the local dev stack. The Go backend must be running on
// :8080 (docker compose up -d && go run ./cmd/server); the Vite dev server is
// started automatically with the /api proxy to it.
//
// Point it at any other deployment (prod compose on :8081, a live URL) with:
//   PW_BASE_URL=http://localhost:8081 npx playwright test
const baseURL = process.env.PW_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: undefined },
    },
  ],
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
