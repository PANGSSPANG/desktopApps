import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export interface AppHandle {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  close(): Promise<void>;
}

/**
 * 起一个真实 Electron 实例。
 * userData 每个用例独立，避免互相污染；--no-sandbox 是受限环境的必需参数。
 */
export async function launchApp(options: { userDataDir?: string } = {}): Promise<AppHandle> {
  // 不用系统 %TEMP%：部分 Windows 机器上 Temp 目录不可写（安全软件/受控文件夹访问），
  // 会让应用启动时直接报「无法创建数据目录」。用例目录放在仓库内，天然可写且好清理。
  const root = join(process.cwd(), '.e2e-tmp');
  mkdirSync(root, { recursive: true });
  const userDataDir = options.userDataDir ?? mkdtempSync(join(root, 'run-'));

  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--disable-gpu'],
    cwd: process.cwd(),
    env: (() => {
      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === 'string') env[key] = value;
      }
      env['WENHUO_USER_DATA'] = userDataDir;
      // 宿主的 ELECTRON_RUN_AS_NODE 会让 Electron 以 Node 模式启动，直接起不来
      delete env['ELECTRON_RUN_AS_NODE'];
      return env;
    })(),
  });

  const page = await (async () => {
    try {
      return await app.firstWindow();
    } catch (error) {
      // 启动失败时别留下垃圾目录，并把原始错误抛给用例
      await app.close().catch(() => undefined);
      rmSync(userDataDir, { recursive: true, force: true });
      throw error;
    }
  })();
  // 首次启动停书架、再次启动可能直接进项目，所以只等界面渲染出来
  await page.waitForSelector('#root > *', { timeout: 30_000 });

  return {
    app,
    page,
    userDataDir,
    async close() {
      try {
        await app.close();
      } finally {
        rmSync(userDataDir, { recursive: true, force: true });
      }
    },
  };
}

/** 新建一本书，返回书名。 */
export async function createProject(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: '新建项目' }).click();
  await page.getByLabel('书名').fill(title);
  await page.getByRole('button', { name: '创建' }).click();
  await expect(page.getByRole('button', { name: '← 书架' })).toBeVisible();
}

/** 在正文里输入文字（ProseMirror 编辑区）。 */
export async function typeInEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator('.ProseMirror');
  await editor.click();
  await page.keyboard.type(text);
}

/** 等到「已保存」出现。 */
export async function waitSaved(page: Page): Promise<void> {
  await expect(page.getByText(/已保存 \d{2}:\d{2}/).first()).toBeVisible({ timeout: 15_000 });
}
