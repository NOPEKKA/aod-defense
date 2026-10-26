import { defineConfig } from '@playwright/test';

/**
 * QA runs against the Vite dev server in the locally installed Chrome
 * (no Playwright browser download). SwiftShader flags keep WebGL working headless.
 * AODD_PORT picks the dev-server port (parallel agents each use their own).
 */
const port = Number(process.env.AODD_PORT ?? 8080);

export default defineConfig({
  testDir: './qa',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: `npx vite --config vite/config.dev.mjs --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
