import { defineConfig, devices } from '@playwright/test';

const PORT = 8137;

// Yerelde önceden kurulu bir Chromium varsa PW_CHROMIUM ile gösterilebilir.
const executablePath = process.env.PW_CHROMIUM || undefined;

export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Uygulama dili tarayıcıdan algılanır; testler Türkçe tarayıcıyla çalışır.
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    launchOptions: { executablePath },
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'masaustu', use: { ...devices['Desktop Chrome'], locale: 'tr-TR', viewport: { width: 1400, height: 960 }, launchOptions: { executablePath } } },
    { name: 'mobil', use: { ...devices['Pixel 7'], locale: 'tr-TR', launchOptions: { executablePath } }, grep: /@mobil/ }
  ],
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI
  }
});
