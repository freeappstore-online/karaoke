import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:43721' },
  webServer: {
    command: 'pnpm --filter @karaoke/web dev --host 127.0.0.1 --port 43721 --strictPort',
    url: 'http://127.0.0.1:43721',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
