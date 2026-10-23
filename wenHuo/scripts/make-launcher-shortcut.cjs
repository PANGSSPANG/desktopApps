/**
 * 在打包目录里生成一个「双击即用」的快捷方式（兼容模式）。
 *
 * 背景：部分受限环境（虚拟桌面 / 远程会话 / 受管机器）里 Chromium 沙箱初始化失败，
 * 双击 wenhuo.exe 会在加载应用代码前就退出。快捷方式预先带上 --no-sandbox，
 * 双击它的体验和双击 exe 一样。
 *
 * 用法：node scripts/make-launcher-shortcut.cjs [打包目录，默认 release/win-unpacked]
 */
const { existsSync } = require('node:fs');
const path = require('node:path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'release', 'win-unpacked'));
const exe = path.join(dir, 'wenhuo.exe');
const lnk = path.join(dir, '文火（兼容模式）.lnk');

if (!existsSync(exe)) {
  console.error(`找不到 ${exe}，请先打包。`);
  process.exit(1);
}

let shell;
try {
  shell = new (require('node:vm').runInNewContext('WScript.Shell'))();
} catch {
  shell = null;
}

if (!shell) {
  const { execFileSync } = require('node:child_process');
  const script = [
    '$s = New-Object -ComObject WScript.Shell;',
    `$l = $s.CreateShortcut('${lnk.replace(/'/g, "''")}');`,
    `$l.TargetPath = '${exe.replace(/'/g, "''")}';`,
    `$l.Arguments = '--no-sandbox';`,
    `$l.WorkingDirectory = '${dir.replace(/'/g, "''")}';`,
    `$l.IconLocation = '${exe.replace(/'/g, "''")},0';`,
    `$l.Description = '文火（受限环境兼容模式）';`,
    '$l.Save();',
  ].join(' ');
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' });
}

console.log(`已生成快捷方式：${lnk}`);
