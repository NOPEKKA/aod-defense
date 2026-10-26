import { defineConfig } from '@playwright/test';

/**
 * QA runs against the Vite dev server in the locally installed Chrome
 * (no Playwright browser download). SwiftShader flags keep WebGL working headless.
 */
export default defineConfig({
  testDir: './qa',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8080',
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
