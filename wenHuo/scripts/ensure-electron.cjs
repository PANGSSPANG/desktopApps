/**
 * 安装期兜底：确保 Electron 二进制真的下载到位。
 *
 * pnpm 默认不执行依赖的 postinstall，容易出现 node_modules 里有 electron 包
 * 却没有 dist/ 与 path.txt 的情况，此时 `electron-vite dev` 会报
 * "Error: Electron uninstall"。这里补一次，失败只警告不阻断安装。
 */
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function main() {
  let electronDir;
  try {
    electronDir = path.dirname(require.resolve('electron/package.json'));
  } catch {
    console.warn('[wenhuo] 未找到 electron 包，跳过二进制检查。');
    return;
  }

  if (
    existsSync(path.join(electronDir, 'path.txt')) &&
    existsSync(path.join(electronDir, 'dist'))
  ) {
    return;
  }

  console.log('[wenhuo] Electron 二进制缺失，正在补装…');
  try {
    execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
      },
    });
    console.log('[wenhuo] Electron 二进制安装完成。');
  } catch (error) {
    console.warn(
      `[wenhuo] Electron 二进制安装失败：${error instanceof Error ? error.message : String(error)}\n` +
        '        可手动执行：node node_modules/electron/install.js',
    );
  }
}

main();
