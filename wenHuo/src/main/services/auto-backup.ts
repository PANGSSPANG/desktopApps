import { existsSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { todayKey } from '@shared/date-key';
import type { BackupInfo } from '@shared/types';
import type { Db } from '../db/connection';
import type { Logger } from '../logger';
import type { AppPaths } from '../paths';
import { readPrefs } from '../modules/prefs';
import { createBackup, listBackups } from './backup';

/** 每天最多留一份自动备份，最多保留 7 份（一周）。 */
export const AUTO_BACKUP_KEEP = 7;
export const AUTO_BACKUP_PREFIX = 'wenhuo-auto-';
const LAST_AUTO_KEY = 'backup.lastAutoDate';

/** 今天还没自动备份过就该做一次。 */
export function shouldCreateAutoBackup(today: string, lastAutoDate: string | null): boolean {
  return lastAutoDate !== today;
}

function readSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function autoBackupDir(paths: AppPaths): string {
  return join(paths.root, 'backups');
}

/** 超出保留份数的自动备份按时间从旧到新删除；手动备份永不自动清理。 */
export function pruneAutoBackups(paths: AppPaths, keep: number = AUTO_BACKUP_KEEP): string[] {
  const dir = autoBackupDir(paths);
  if (!existsSync(dir)) return [];

  const items = readdirSync(dir)
    .filter((name) => name.startsWith(AUTO_BACKUP_PREFIX) && name.endsWith('.zip'))
    .map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const removed: string[] = [];
  for (const item of items.slice(keep)) {
    unlinkSync(join(dir, item.name));
    removed.push(item.name);
  }
  return removed;
}

/**
 * 启动时的每日自动备份。
 *
 * 只在「今天还没备份过」时做一份，并顺手把超出 7 份的旧自动备份删掉。
 * 任何一步失败都只记日志，绝不影响启动。
 */
export function maybeAutoBackup(
  db: Db,
  paths: AppPaths,
  appVersion: string,
  logger: Logger,
  now: Date = new Date(),
): BackupInfo | null {
  const prefs = readPrefs(db);
  if (!prefs.autoBackup) return null;

  const today = todayKey(now);
  const last = readSetting(db, LAST_AUTO_KEY);
  if (!shouldCreateAutoBackup(today, last)) return null;

  try {
    const info = createBackup(db, paths, appVersion);
    const target = join(autoBackupDir(paths), `${AUTO_BACKUP_PREFIX}${today}.zip`);
    renameSync(info.filePath, target);

    writeSetting(db, LAST_AUTO_KEY, today);
    const removed = pruneAutoBackups(paths, prefs.autoBackupKeep);
    logger.info('auto backup created', { file: `${AUTO_BACKUP_PREFIX}${today}.zip`, removed });
    return { ...info, filePath: target, fileName: `${AUTO_BACKUP_PREFIX}${today}.zip` };
  } catch (error) {
    logger.warn('auto backup failed', { message: error instanceof Error ? error.message : error });
    return null;
  }
}

/** 给设置页/调试用：当前保留的自动备份（新到旧）。 */
export function listAutoBackups(paths: AppPaths): BackupInfo[] {
  return listBackups(paths).filter((item) => item.fileName.startsWith(AUTO_BACKUP_PREFIX));
}
