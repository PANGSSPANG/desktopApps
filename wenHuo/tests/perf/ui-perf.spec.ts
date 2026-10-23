import { _electron as electron, expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

/** 读正文前 24 个字做指纹：切章后内容必然不同，用它判断切换完成 */
async function fingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = (
      globalThis as unknown as {
        document: { querySelector(selector: string): { textContent: string | null } | null };
      }
    ).document;
    return doc.querySelector('.ProseMirror')?.textContent?.slice(0, 24) ?? '';
  });
}

async function waitForEditorChange(page: Page, before: string, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const current = await fingerprint(page);
    if (current && current !== before) return;
    await page.waitForTimeout(20);
  }
}

/**
 * UI 层性能实测（50 万字库）。
 *
 * 先跑 `node scripts/seed-perf-project.cjs <dir> 170` 造库，再用真实 Electron 打开：
 * 量启动到可交互、连续切 20 章、搜索出结果的时间。
 * 门槛按 PRD §3.4 放宽（测试机有冷启动/无 GPU 因素），超了会失败。
 */
const STARTUP_LIMIT = 5000;
const SWITCH_P95_LIMIT = 300;
const SEARCH_LIMIT = 600;

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

test('50 万字：启动、切章、搜索', async () => {
  const perfRoot = join(process.cwd(), '.perf-tmp');
  mkdirSync(perfRoot, { recursive: true });
  const userDataDir = mkdtempSync(join(perfRoot, 'run-'));

  execFileSync(process.execPath, [
    join(process.cwd(), 'scripts', 'seed-perf-project.cjs'),
    userDataDir,
    '170',
  ]);

  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  env['WENHUO_USER_DATA'] = userDataDir;
  delete env['ELECTRON_RUN_AS_NODE'];

  const startedAt = Date.now();
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: process.cwd(),
    env,
  });

  try {
    const page = await app.firstWindow();
    await page.waitForSelector('#root > *', { timeout: 60_000 });
    const startup = Date.now() - startedAt;

    // 确保进了项目（造库时写入了 lastProjectId）
    await page.waitForSelector('.ProseMirror', { timeout: 30_000 });
    await page.waitForTimeout(500);

    const rows = page.locator('[role="button"]').filter({ hasText: /^第.+章/ });
    const count = Math.min(20, await rows.count());

    const switches: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index);
      const before = await fingerprint(page);
      const begin = Date.now();
      await row.click();
      await waitForEditorChange(page, before, 5_000);
      switches.push(Date.now() - begin);
    }

    // 搜索：打开面板、输入三字词、等结果
    const searchStart = Date.now();
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/搜索章节/).fill('青云观');
    await page.waitForSelector('[data-testid="search-hit"]', { timeout: 30_000 });
    const search = Date.now() - searchStart;
    await page.keyboard.press('Escape');

    const switchP95 = p95(switches);
    process.stdout.write(
      [
        `\n启动到可交互: ${startup}ms（阈值 ${STARTUP_LIMIT}）`,
        `切章 ${count} 次 p95: ${switchP95}ms（阈值 ${SWITCH_P95_LIMIT}，明细 ${switches.join(',')}）`,
        `搜索出结果: ${search}ms（阈值 ${SEARCH_LIMIT}）`,
      ].join('\n'),
    );

    expect(startup).toBeLessThan(STARTUP_LIMIT);
    expect(switchP95).toBeLessThan(SWITCH_P95_LIMIT);
    expect(search).toBeLessThan(SEARCH_LIMIT);
  } finally {
    await app.close();
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
