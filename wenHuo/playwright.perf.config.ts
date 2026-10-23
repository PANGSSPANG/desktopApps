import { defineConfig } from '@playwright/test';

/** UI 性能实测单独一套配置，不跟常规 E2E 混跑。 */
export default defineConfig({
  testDir: 'tests/perf',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
