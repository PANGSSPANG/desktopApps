import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { todayKey } from '@shared/date-key';
import {
  AUTO_BACKUP_KEEP,
  AUTO_BACKUP_PREFIX,
  autoBackupDir,
  maybeAutoBackup,
  pruneAutoBackups,
  shouldCreateAutoBackup,
} from '@main/services/auto-backup';
import { createAppPaths, ensureAppPaths } from '@main/paths';
import { createProject } from '@main/modules/project';
import { writePrefs } from '@main/modules/prefs';
import { createLogger } from '@main/logger';
import { createTempDb } from './helpers/temp-db';

// 日志写到临时目录，避免测试在仓库根目录留下 .test-logs
const silentLogger = createLogger(
  join(mkdtempSync(join(tmpdir(), 'wenhuo-test-log-')), 'auto-backup.log'),
);

function setup() {
  const temp = createTempDb();
  const root = join(temp.dir, 'userData');
  const paths = createAppPaths(root);
  ensureAppPaths(paths);
  return { ...temp, paths };
}

describe('自动备份策略', () => {
  it('同一天只备份一次', () => {
    expect(shouldCreateAutoBackup('2026-10-22', null)).toBe(true);
    expect(shouldCreateAutoBackup('2026-10-22', '2026-10-21')).toBe(true);
    expect(shouldCreateAutoBackup('2026-10-22', '2026-10-22')).toBe(false);
  });

  it('首次启动生成一份 auto 备份，当天再次启动不再生成', () => {
    const { db, paths, cleanup } = setup();
    try {
      createProject(db, { title: '青云志', genre: 'novel' });

      const first = maybeAutoBackup(db, paths, '0.1.0', silentLogger, new Date());
      expect(first).not.toBeNull();
      expect(first?.fileName).toBe(`${AUTO_BACKUP_PREFIX}${todayKey()}.zip`);
      expect(existsSync(first?.filePath as string)).toBe(true);

      const second = maybeAutoBackup(db, paths, '0.1.0', silentLogger, new Date());
      expect(second).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('关闭自动备份后不再生成', () => {
    const { db, paths, cleanup } = setup();
    try {
      writePrefs(db, { autoBackup: false });
      expect(maybeAutoBackup(db, paths, '0.1.0', silentLogger, new Date())).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('保留份数取自设置', () => {
    const { db, paths, cleanup } = setup();
    try {
      writePrefs(db, { autoBackupKeep: 2 });
      const dir = autoBackupDir(paths);
      mkdirSync(dir, { recursive: true });
      for (let index = 1; index <= 4; index += 1) {
        writeFileSync(join(dir, `${AUTO_BACKUP_PREFIX}2026-02-0${index}.zip`), 'x');
      }
      expect(pruneAutoBackups(paths, 2)).toHaveLength(2);
    } finally {
      cleanup();
    }
  });

  it('只保留最近 N 份自动备份，且不碰手动备份', () => {
    const { paths, cleanup } = setup();
    try {
      const dir = autoBackupDir(paths);
      mkdirSync(dir, { recursive: true });
      for (let index = 0; index < AUTO_BACKUP_KEEP + 3; index += 1) {
        writeFileSync(join(dir, `${AUTO_BACKUP_PREFIX}2026-01-0${index + 1}.zip`), 'x');
      }
      writeFileSync(join(dir, 'wenhuo-backup-manual.zip'), 'x');

      const removed = pruneAutoBackups(paths);
      expect(removed).toHaveLength(3);

      const left = readdirSync(dir);
      expect(left.filter((name) => name.startsWith(AUTO_BACKUP_PREFIX))).toHaveLength(
        AUTO_BACKUP_KEEP,
      );
      expect(left).toContain('wenhuo-backup-manual.zip');
    } finally {
      cleanup();
    }
  });

  it('备份失败只记日志，不抛出', () => {
    const { db, paths, cleanup } = setup();
    try {
      // 把 backups 目录换成同名文件，让压缩写入失败
      const dir = autoBackupDir(paths);
      writeFileSync(dir, 'blocked');

      expect(() => maybeAutoBackup(db, paths, '0.1.0', silentLogger, new Date())).not.toThrow();
    } finally {
      cleanup();
    }
  });
});
