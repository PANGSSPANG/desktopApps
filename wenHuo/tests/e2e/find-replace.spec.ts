import { expect, test, type Page } from '@playwright/test';
import { createProject, launchApp, typeInEditor, waitSaved } from './helpers';

/** 打开查找替换面板并填入内容 */
async function openFind(page: Page, query: string, replacement: string) {
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查找', exact: true }).click();
  await page.getByPlaceholder('查找内容').fill(query);
  await page.getByPlaceholder(/替换为/).fill(replacement);
}

test('分割线之后把 2 个字替换成 1 个字，从第一个字开始替换', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '替换测试');
    await typeInEditor(page, '前文');
    await waitSaved(page);

    // 先插入分割线，再在它下面写 ab —— 复现「偏移一位，ab 变成 ac」
    await page.getByRole('button', { name: '分隔线' }).click();
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('ab');
    await waitSaved(page);

    await openFind(page, 'ab', 'c');
    await page.getByRole('button', { name: '替换', exact: true }).click();

    const text = await page.locator('.ProseMirror').innerText();
    expect(text).toContain('c');
    expect(text).not.toContain('ac');
    expect(text).not.toContain('ab');
  } finally {
    await handle.close();
  }
});

test('分割线下方的文字也能替换', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '分割线测试');
    await typeInEditor(page, '上方');
    await waitSaved(page);

    await page.getByRole('button', { name: '分隔线' }).click();
    await page.locator('.ProseMirror').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('下方');
    await waitSaved(page);

    await openFind(page, '下方', '替换后');
    await page.getByRole('button', { name: '替换', exact: true }).click();

    await expect(page.locator('.ProseMirror')).toContainText('替换后');
    await expect(page.locator('.ProseMirror')).not.toContainText('下方');
  } finally {
    await handle.close();
  }
});

test('章节标记为已完成后，正文不能再输入', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '锁定测试');
    await typeInEditor(page, '第一版正文');
    await waitSaved(page);

    await page.getByRole('button', { name: '已完成', exact: true }).click();
    await expect(page.getByText('本章已完成，正文只读')).toBeVisible();

    await page.locator('.ProseMirror').click();
    await page.keyboard.type('偷改');
    await page.waitForTimeout(500);

    await expect(page.locator('.ProseMirror')).toHaveText('第一版正文');
    await expect(page.getByRole('button', { name: '加粗' })).toBeDisabled();
  } finally {
    await handle.close();
  }
});
