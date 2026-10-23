/**
 * 受限环境下的 dev 启动器：把用户数据目录指到仓库内的 .appdata。
 *
 * 有些环境（沙箱、受管终端）不允许进程在 %APPDATA% 下创建文件，
 * Electron 会在 Chromium 初始化阶段直接崩溃，连主进程日志都来不及写。
 * 这个脚本只做一件事：注入 WENHUO_USER_DATA 再拉起 electron-vite dev，
 * 不改任何产品行为，正式使用时仍走 `pnpm dev` 与系统标准数据目录。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '..');
const electronVite = path.join(
  repo,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite',
);

const child = spawn(electronVite, ['dev'], {
  cwd: repo,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    WENHUO_USER_DATA: path.join(repo, '.appdata'),
    // 受限环境里 Chromium 的原生沙箱无法初始化，需要用 electron-vite 的 NO_SANDBOX 开关
    NO_SANDBOX: process.env.NO_SANDBOX ?? '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
