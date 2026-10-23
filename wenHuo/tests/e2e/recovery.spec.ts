import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { WenhuoApi } from '@shared/ipc';
import { createProject, launchApp } from './helpers';

/**
 * 崩溃恢复链路：草稿日志里有内容 → 重启后出现恢复横幅 → 恢复进正文。
 *
 * 直接注入草稿日志（`window.api.draft.stash`）而不是靠"来不及保存"：
 * 自动保存只有 800ms，真实崩溃窗口太窄，等它自然发生会让用例不稳定。
 * 注入路径与编辑器每 5 秒写日志时调用的完全是同一个 IPC。
 */
test('重启后能发现草稿日志并恢复到正文', async () => {
  const first = await launchApp();
  const userDataDir = first.userDataDir;
  try {
    const { page } = first;
    await createProject(page, '崩溃恢复测试');

    const stashed = await page.evaluate(async () => {
      // 渲染层没有 DOM 类型（e2e 走 node tsconfig），这里只取 contextBridge 暴露的 api
      const api = (globalThis as unknown as { api: WenhuoApi }).api;
      const boot = await api.app.bootstrap();
      const projectId = boot.ok ? boot.data.lastProjectId : null;
      if (!projectId) return 'no-project';
      const tree = await api.manuscript.tree(projectId);
      const chapterId = tree.ok ? tree.data.volumes[0]?.chapters[0]?.id : undefined;
      if (!chapterId) return 'no-chapter';

      const doc = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '崩溃前的遗言' }] }],
      };
      const result = await api.draft.stash({
        chapterId,
        contentJson: JSON.stringify(doc),
        plainText: '崩溃前的遗言',
      });
      return result.ok ? 'ok' : result.error.message;
    });
    expect(stashed).toBe('ok');

    // 等草稿文件真正落盘再关应用，避免"刚写就被关掉"造成用例偶发失败
    const draftsDir = join(userDataDir, 'drafts');
    await expect
      .poll(() => (existsSync(draftsDir) ? readdirSync(draftsDir).length : 0), { timeout: 10_000 })
      .toBeGreaterThan(0);
  } finally {
    // 正常关闭时应用会清空草稿目录（视为干净退出），所以这里必须模拟崩溃：硬杀进程
    await first.app
      .evaluate(({ app }) => {
        process.kill(process.pid, 'SIGKILL');
        app.exit(0);
      })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  const second = await launchApp({ userDataDir });
  try {
    await expect(second.page.getByText(/检测到 \d+ 份未保存的草稿/)).toBeVisible({
      timeout: 20_000,
    });
    await second.page.getByRole('button', { name: '恢复', exact: true }).first().click();
    await expect(second.page.locator('.ProseMirror')).toContainText('崩溃前的遗言', {
      timeout: 20_000,
    });
  } finally {
    await second.close();
  }
});
