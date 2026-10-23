import { defineConfig } from '@playwright/test'

/**
 * E2E 驱动真实 Electron：helper 固定占用 CDP 端口 19222，
 * 因此必须串行，不能开 worker 并行。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
