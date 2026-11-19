import { defineConfig, devices } from '@playwright/test';

const WEB = process.env.WEB_URL ?? 'http://localhost:3100';

// Requiere API, web y base sembrada en marcha (quickstart.md). En CI los arranca el workflow.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB, locale: 'es-EC', timezoneId: 'America/Guayaquil', trace: 'retain-on-failure' },
  projects: [
    { name: 'movil', use: { ...devices['Pixel 7'] } },
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] } },
  ],
});
