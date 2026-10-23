import { expect, test } from '@playwright/test';
import { createProject, launchApp } from './helpers';

test('删除项目：二次确认后从书架消失', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await createProject(page, '待删项目');
    await page.getByRole('button', { name: '← 书架' }).click();

    const card = page.getByText('待删项目').first();
    await expect(card).toBeVisible();

    await page.getByRole('button', { name: '删除', exact: true }).first().click();
    await page.getByRole('button', { name: '删除项目', exact: true }).click();

    await expect(page.getByText('待删项目')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('书架还是空的')).toBeVisible();
  } finally {
    await handle.close();
  }
});

test('设置页显示数据目录与备份选项', async () => {
  const handle = await launchApp();
  try {
    const { page } = handle;
    await page.getByRole('button', { name: '设置' }).click();

    await expect(page.getByText('数据', { exact: true })).toBeVisible();
    await expect(page.getByText('每天首次启动自动备份')).toBeVisible();
    await expect(page.getByText(/wenhuo-e2e|\.e2e-tmp/)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByText('设置', { exact: true })).toHaveCount(1);
  } finally {
    await handle.close();
  }
});
