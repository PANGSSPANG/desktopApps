/**
 * 启动诊断：一次跑完「环境事实 + 四组启动对照」，输出可直接贴出来的表格。
 *
 * 用法：
 *   node scripts/diagnose-launch.cjs
 *   node scripts/diagnose-launch.cjs --exe "C:\path\to\wenhuo.exe" --seconds 10
 *   node scripts/diagnose-launch.cjs --dump     # 顺带开启崩溃转储（需管理员）
 *
 * 背景：这台机器上出现过「同一份 exe，在工作区里启动必崩、拷到外面就正常」。
 * 靠人肉逐个变量试很慢，脚本把常见变量固定成四组，升级后重跑即可对比。
 */
const { spawn } = require('node:child_process');
const { cpSync } = require('node:fs');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const argv = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const root = path.resolve(__dirname, '..');
const exePath = path.resolve(
  argValue('exe', path.join(root, 'release', 'win-unpacked', 'wenhuo.exe')),
);
const waitMs = Number(argValue('seconds', '8')) * 1000;

const report = [];
const say = (text = '') => {
  report.push(text);
  console.log(text);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 删除临时目录：进程可能还占着文件，失败就重试，绝不让诊断脚本自己崩掉。 */
function safeRemove(dir) {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch {
    /* 清不掉就留给系统临时目录 */
  }
}

/** 负数退出码转成十六进制，0x80000003 这类 CHECK 失败更容易被认出来。 */
function formatExitCode(code) {
  if (code === null || code === undefined) return '无码';
  if (typeof code === 'string') return code;
  const unsigned = code >>> 0;
  return unsigned > 0x7fffffff ? `0x${unsigned.toString(16)}` : String(code);
}

function probeWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    return '✅ 可写';
  } catch (error) {
    return `❌ 不可写（${error.code || error.message}）`;
  }
}

function readTail(file, lines = 2) {
  try {
    const text = readFileSync(file, 'utf8').trim();
    return text ? text.split('\n').slice(-lines).join(' | ') : null;
  } catch {
    return null;
  }
}

/** 用文件描述符接管输出，避免管道 stdio 在受限环境里被拒。 */
async function launchOnce({ exe, args = [], env = {}, cwd }) {
  const ioDir = mkdtempSync(path.join(tmpdir(), 'wenhuo-diag-io-'));
  const errFile = path.join(ioDir, 'stderr.log');
  const outFd = openSync(path.join(ioDir, 'stdout.log'), 'a');
  const errFd = openSync(errFile, 'a');

  const child = spawn(exe, args, {
    cwd: cwd || path.dirname(exe),
    env: { ...process.env, ...env },
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });

  let exitCode = null;
  let exited = false;
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
  });
  child.on('error', (error) => {
    exited = true;
    exitCode = `spawn-error: ${error.code || error.message}`;
  });

  await sleep(waitMs);
  const alive = !exited;
  if (alive) child.kill();

  const stderr = readTail(errFile, 3);
  return {
    alive,
    exitCode,
    stderr,
    cleanup: () => rmSync(ioDir, { recursive: true, force: true }),
  };
}

async function runScenario(label, options, dataDirs) {
  const result = await launchOnce(options);
  const logFile = [
    ...dataDirs.map((dir) => path.join(dir, 'logs', 'main.log')),
    path.join(process.env['APPDATA'] || '', 'wenhuo', 'logs', 'main.log'),
    path.join(process.env['LOCALAPPDATA'] || '', 'wenhuo', 'logs', 'main.log'),
  ].find((file) => readTail(file));

  const where = logFile ? path.basename(path.dirname(path.dirname(logFile))) : '无日志';
  const tail = logFile ? readTail(logFile, 1) : null;
  say(
    `| ${label} | ${result.alive ? '✅ 存活' : `❌ 退出（${formatExitCode(result.exitCode)}）`} | ${
      tail ? `${where}: ${tail}` : '无日志'
    } |`,
  );
  if (result.stderr) say(`| ↳ stderr | ${'`' + result.stderr.replace(/\|/g, '\\|') + '`'} | |`);

  result.cleanup();
  return result;
}

function collectEnvironment() {
  say(`# 文火启动诊断 ${new Date().toISOString()}`);
  say();
  say('## 环境');
  say();
  say(`- exe：\`${exePath}\``);
  say(
    `- 存在：${existsSync(exePath)}${existsSync(exePath) ? `（${Math.round(statSync(exePath).size / 1024 / 1024)} MB）` : ''}`,
  );
  say(`- 当前目录：\`${process.cwd()}\``);
  say(`- 平台：${process.platform} ${process.arch}，Node ${process.version}`);
  say(`- 相关环境变量：WENHUO_USER_DATA=${process.env['WENHUO_USER_DATA'] || '(未设置)'}`);
  say('');

  const candidates = [
    path.join(process.env['APPDATA'] || '', 'wenhuo'),
    path.join(process.env['LOCALAPPDATA'] || '', 'wenhuo'),
    path.join(path.dirname(exePath), 'data'),
    path.join(root, '.appdata'),
  ].filter((dir) => dir && path.isAbsolute(dir));

  say('## 数据目录可写性');
  say();
  for (const dir of candidates) say(`- \`${dir}\` → ${probeWritable(dir)}`);
  for (const dir of candidates) rmSync(dir, { recursive: true, force: true });
  say();
}

function enableCrashDump() {
  const key = `HKLM\\SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting\\LocalDumps\\${path.basename(exePath)}`;
  const dumpDir = path.join(root, '.dumps');
  mkdirSync(dumpDir, { recursive: true });
  for (const command of [
    `reg add "${key}" /v DumpFolder /t REG_EXPAND_SZ /d "${dumpDir}" /f`,
    `reg add "${key}" /v DumpType /t REG_DWORD /d 2 /f`,
  ]) {
    spawn('cmd', ['/c', command], { stdio: 'ignore', windowsHide: true });
  }
  say(`## 崩溃转储已开启 → \`${dumpDir}\`（需管理员；关闭请删注册表项）`);
  say('复现后可用 WinDbg 打开 .dmp 并加载 Electron 的 PDB 看触发 CHECK 的位置。');
  say();
}

async function main() {
  if (!existsSync(exePath)) {
    console.error(`找不到 exe：${exePath}\n先 pnpm build 或加 --exe 指定路径`);
    process.exit(1);
  }

  collectEnvironment();

  const tmpData = mkdtempSync(path.join(tmpdir(), 'wenhuo-diag-data-'));
  const exeDir = path.dirname(exePath);

  say(`## 启动对照（每组等待 ${Math.round(waitMs / 1000)} 秒）`);
  say();
  say('| 场景 | 结果 | 最后一条日志 |');
  say('| --- | --- | --- |');

  await runScenario('① 原样启动', { exe: exePath }, [exeDir, path.join(exeDir, 'data'), root]);
  await runScenario('② 加 --no-sandbox', { exe: exePath, args: ['--no-sandbox'] }, [
    path.join(exeDir, 'data'),
    exeDir,
  ]);
  await runScenario(
    '③ --no-sandbox + 指定数据目录',
    { exe: exePath, args: ['--no-sandbox'], env: { WENHUO_USER_DATA: tmpData } },
    [tmpData],
  );

  // ④ 把整个目录拷到临时位置再启动，隔离「exe 所在路径」这个变量
  const copyRoot = mkdtempSync(path.join(tmpdir(), 'wenhuo-diag-copy-'));
  cpSync(exeDir, copyRoot, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}data`),
  });
  say();
  safeRemove(path.join(exeDir, 'data'));
  safeRemove(path.join(root, '.appdata'));
  if (existsSync(path.join(copyRoot, 'wenhuo.exe'))) {
    await runScenario('④ 拷到临时目录原样启动', { exe: path.join(copyRoot, 'wenhuo.exe') }, [
      copyRoot,
    ]);
  } else {
    say('| ④ 拷到临时目录 | ⏭ 跳过（缺主程序） | |');
  }

  if (argv.includes('--dump')) enableCrashDump();

  say();
  say('## 怎么读这张表');
  say();
  say('- ① 失败、② 成功 → 环境沙箱问题，用 `--no-sandbox` 启动器；');
  say('- ② 失败、③ 成功 → 数据目录不可写，看上面「可写性」；');
  say('- ① 失败、④ 成功 → **exe 所在目录**有问题（本项目工作区即如此），换目录运行；');
  say('- ④ 也失败 → 应用自身问题，看上面的 stderr 与 `Get-WinEvent -LogName Application`。');

  safeRemove(tmpData);
  safeRemove(copyRoot);

  const reportPath = path.join(root, 'diagnose-report.md');
  writeFileSync(reportPath, `${report.join('\n')}\n`, 'utf8');
  console.log(`\n报告已保存：${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
