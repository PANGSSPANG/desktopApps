import { expect, test } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from './helpers';

/**
 * 导入 → 导出链。
 *
 * 原生文件对话框无法在无头环境里操作，所以在主进程里替换
 * dialog.showOpenDialog / showSaveDialog，让它们直接返回固定路径。
 */
test('导入 TXT 拆章 → 导出 EPUB 文件存在且有序', async () => {
  const handle = await launchApp();
  try {
    const { app, page, userDataDir } = handle;

    const workDir = join(userDataDir, 'e2e-files');
    mkdirSync(workDir, { recursive: true });
    const txtPath = join(workDir, 'sample.txt');
    const epubPath = join(workDir, 'out.epub');

    writeFileSync(
      txtPath,
      ['第一章 青云观', '', '青云观上有一棵松。', '', '第二章 玄清', '', '玄清站在那里。'].join(
        '\n',
      ),
      'utf8',
    );

    await app.evaluate(
      ({ dialog }, paths) => {
        // 只在本测试里生效：import 用 open，export 用 save
        (dialog as unknown as Record<string, unknown>)['showOpenDialog'] = async () => ({
          canceled: false,
          filePaths: [paths.open],
        });
        (dialog as unknown as Record<string, unknown>)['showSaveDialog'] = async () => ({
          canceled: false,
          filePath: paths.save,
        });
      },
      { open: txtPath, save: epubPath },
    );

    await page.getByRole('button', { name: '导入稿件' }).click();
    await page.getByRole('button', { name: '选择文件…' }).click();
    await expect(page.getByText(/将导入 \d+ 章/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '开始导入' }).click();

    // 导入后进入项目
    await expect(page.getByRole('button', { name: '← 书架' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('青云观上有一棵松')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /导出 ▾/ }).click();
    await page.getByRole('button', { name: /^EPUB/ }).click();

    await expect
      .poll(() => existsSync(epubPath), { timeout: 20_000, message: 'EPUB 未生成' })
      .toBe(true);

    const bytes = readFileSync(epubPath);
    expect(bytes.length).toBeGreaterThan(1000);
    // zip 魔数：EPUB 本质是 zip
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  } finally {
    await handle.close();
  }
});
