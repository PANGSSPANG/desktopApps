import { defineConfig } from '@playwright/test';

/**
 * E2E 直接驱动真实 Electron 进程（Playwright 的 _electron），
 * 用本机 node_modules 里的 Electron 二进制，不需要下载浏览器。
 *
 * 串行执行：每个用例都会起一个带独立 userData 的应用实例。
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    trace: 'off',
  },
});
