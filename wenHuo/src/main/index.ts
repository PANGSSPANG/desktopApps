import { copyFileSync, existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';
import { openDatabase } from './db/connection';
import { currentVersion, migrate } from './db/migrate';
import { MIGRATIONS } from './db/migrations';
import { registerIpc } from './ipc/handlers';
import { createLogger, type Logger } from './logger';
import { createAppPaths, ensureAppPaths } from './paths';
import { canWriteDir, pickUserDataDir } from './user-data';
import { maybeAutoBackup } from './services/auto-backup';
import { createMainWindow } from './window';

// 受限环境（如沙箱里跑 dev）允许把数据目录指到可写位置，必须在 ready 之前设置。
const userDataOverride = process.env['WENHUO_USER_DATA'];
if (userDataOverride) {
  app.setPath('userData', resolve(userDataOverride));
}

/**
 * 钉死数据目录为绝对路径。
 *
 * 某些环境拿不到 %APPDATA%，Electron 会退回相对路径 `appData`；一旦之后工作目录发生变化
 * （例如从 out/ 目录启动），日志与数据库就会落到父目录不存在的位置，主进程随之抛 ENOENT。
 * 这种退化情况下改用 home 下的固定目录；用户显式设置的 WENHUO_USER_DATA 则按当前目录解析。
 */
const rawUserData = app.getPath('userData');
const absoluteUserData = isAbsolute(rawUserData)
  ? rawUserData
  : join(app.getPath('home') || rawUserData, '.wenhuo');

// 受限环境里 %APPDATA% 可能不可写（EPERM），逐个候选探测，别让用户只看到"打不开"
const chosenUserData =
  pickUserDataDir(
    [
      userDataOverride ? resolve(userDataOverride) : '',
      absoluteUserData,
      join(app.getPath('home') || process.cwd(), '.wenhuo'),
      join(dirname(app.getPath('exe')), 'data'),
      join(process.cwd(), '.appdata'),
    ].filter(Boolean),
    canWriteDir,
  ) ?? absoluteUserData;

app.setPath('userData', chosenUserData);

let logger: Logger | null = null;
let fatalReported = false;

/** 未捕获异常只提示一次，且日志失败也不能再抛。 */
function reportFatal(source: string, error: unknown): void {
  try {
    logger?.error(`uncaught ${source}`, error);
    if (!logger) process.stderr.write(`[wenhuo] uncaught ${source}: ${String(error)}\n`);
  } catch {
    // 日志本身失败也忽略
  }

  if (fatalReported || !app.isReady()) return;
  fatalReported = true;
  try {
    dialog.showErrorBox(
      '文火遇到问题',
      '应用遇到了意外错误，已记录到日志。\n如果界面出现异常，请重启应用；日志可在应用数据目录的 logs/main.log 查看。',
    );
  } catch {
    // 连弹窗都失败就放弃
  }
}

process.on('uncaughtException', (error) => reportFatal('exception', error));
process.on('unhandledRejection', (reason) => reportFatal('rejection', reason));

/**
 * 单实例锁只是"体验优化"，不能当成启动前置条件：
 * 某些受限环境里 Chromium 无法在 userData 下创建锁文件，
 * 若因此直接 quit，用户只会看到应用闪退而拿不到任何信息。
 */
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  console.warn('[wenhuo] 未能获取单实例锁（可能是权限问题），继续以单窗口模式启动。');
}

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    reportFatal('startup', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function start(): void {
  const root = resolve(app.getPath('userData'));
  const paths = createAppPaths(root);

  try {
    ensureAppPaths(paths);
  } catch (error) {
    dialog.showErrorBox(
      '文火启动失败',
      `无法创建数据目录：${paths.root}\n请检查目录权限，或通过环境变量 WENHUO_USER_DATA 指定其他位置。`,
    );
    throw error;
  }

  logger = createLogger(join(paths.logsDir, 'main.log'));
  logger.info('application starting', { root: paths.root, version: app.getVersion() });

  try {
    const db = openDatabase(paths.dbFile);
    const targetVersion = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
    const version = currentVersion(db);

    // 迁移前先留一份副本：升级失败时用户至少还能拿回旧库。
    if (existsSync(paths.dbFile) && version < targetVersion) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      const backup = join(paths.recoveryDir, `pre-migrate-v${version}-${Date.now()}.db`);
      copyFileSync(paths.dbFile, backup);
      logger.info('database backed up before migration', { backup });
    }

    const report = migrate(db);
    logger.info('database ready', {
      from: report.from,
      to: report.to,
      applied: report.applied,
    });

    // 每天首次启动留一份自动备份；失败只记日志，不阻断启动
    maybeAutoBackup(db, paths, app.getVersion(), logger);

    registerIpc({ db, paths, logger });
    createMainWindow(logger);
  } catch (error) {
    logger.error('bootstrap failed', error);
    dialog.showErrorBox('文火启动失败', '数据库组件加载失败，请重新安装应用。');
    app.quit();
  }
}
