import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { createProject, launchApp, typeInEditor, waitSaved } from './helpers';

test('写中文、自动保存、重启后内容还在', async () => {
  const first = await launchApp();
  await createProject(first.page, '端到端测试');
  await typeInEditor(first.page, '青云观上有一棵松');
  await waitSaved(first.page);

  const userDataDir = first.userDataDir;
  await first.app.close();

  // 用同一个 userData 重新启动，模拟"关掉再打开"
  const second = await launchApp({ userDataDir });
  try {
    await expect(second.page.locator('.ProseMirror')).toContainText('青云观上有一棵松', {
      timeout: 20_000,
    });
  } finally {
    await second.app.close();
  }
});

test('搜索中文并跳转，面板自动关闭', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '搜索测试');
    await typeInEditor(page, '玄清站在青云观前');
    await waitSaved(page);

    await page.keyboard.press('Control+k');
    await expect(page.getByPlaceholder(/搜索章节/)).toBeVisible();

    await page.getByPlaceholder(/搜索章节/).fill('青云观');
    // 卷章树里也有同名按钮；搜索结果在遮罩层里、DOM 靠后，取 last
    const hit = page.getByTestId('search-hit').first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    // 面板应关闭，正文可见
    await expect(page.getByPlaceholder(/搜索章节/)).toHaveCount(0);
    await expect(page.locator('.ProseMirror')).toContainText('青云观');
  } finally {
    await handle.close();
  }
});

test('快照：留点 → 改稿 → 恢复回到旧版本', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '快照测试');
    await typeInEditor(page, '第一版正文');
    await waitSaved(page);

    await page.getByRole('button', { name: '＋ 给当前正文留个快照' }).click();
    const noteInput = page.getByPlaceholder('比如：改回第三稿的开头');
    await noteInput.fill('存点');
    await page.getByRole('button', { name: '保存快照' }).click();

    // 存完后输入面板收起，列表里出现这条快照
    await expect(noteInput).toHaveCount(0, { timeout: 10_000 });
    const snapshotItem = page.getByRole('button', { name: /手动 存点/ }).first();
    await expect(snapshotItem).toBeVisible({ timeout: 10_000 });

    await page.locator('.ProseMirror').click();
    await page.keyboard.press('End');
    await page.keyboard.type('又写了点别的');
    await waitSaved(page);

    await snapshotItem.click();
    // 先点预览面板的「恢复并覆盖当前正文」，再在确认框里点「恢复并覆盖」（这里必须 exact）
    await page.getByRole('button', { name: '恢复并覆盖当前正文' }).click();
    await page.getByRole('button', { name: '恢复并覆盖', exact: true }).click();

    // 先确认库里的正文确实被恢复成了旧版
    await page.waitForTimeout(1200);
    const db = new Database(join(handle.userDataDir, 'wenhuo.db'), { readonly: true });
    const row = db.prepare('SELECT plain_text FROM chapters LIMIT 1').get() as {
      plain_text: string;
    };
    db.close();
    expect(row.plain_text).toBe('第一版正文');

    await expect(page.locator('.ProseMirror')).toContainText('第一版正文');
    await expect(page.locator('.ProseMirror')).not.toContainText('又写了点别的');
  } finally {
    await handle.close();
  }
});
