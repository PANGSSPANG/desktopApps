import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { openDatabase, type Db } from '@main/db/connection';
import { currentVersion, migrate } from '@main/db/migrate';
import { listProjects, createProject } from '@main/modules/project';
import { createAppPaths, ensureAppPaths } from '@main/paths';
import { createBackup, listBackups, restoreBackup } from '@main/services/backup';

let cleanupFns: (() => void)[] = [];

afterEach(() => {
  for (const fn of cleanupFns.reverse()) fn();
  cleanupFns = [];
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-backup-'));
  const paths = createAppPaths(dir);
  ensureAppPaths(paths);
  const dbFile = join(dir, 'wenhuo.db');
  let db: Db = openDatabase(dbFile);
  migrate(db);

  cleanupFns.push(() => {
    try {
      db.close();
    } catch {
      // 已关闭
    }
    rmSync(dir, { recursive: true, force: true });
  });

  return {
    paths,
    dbFile,
    getDb: () => db,
    reopen: () => {
      db = openDatabase(dbFile);
      return db;
    },
  };
}

describe('备份', () => {
  it('创建备份：zip 里有 manifest 与数据库', () => {
    const ctx = setup();
    createProject(ctx.getDb(), { title: '青云志', genre: 'novel' });

    const info = createBackup(ctx.getDb(), ctx.paths, '0.1.0');

    expect(existsSync(info.filePath)).toBe(true);
    expect(info.projectCount).toBe(1);
    expect(info.chapterCount).toBe(1);

    const files = unzipSync(new Uint8Array(readFileSync(info.filePath)));
    expect(Object.keys(files)).toContain('manifest.json');
    expect(Object.keys(files)).toContain('wenhuo.db');
    const manifest = JSON.parse(strFromU8(files['manifest.json'] as Uint8Array)) as {
      format: string;
      projectCount: number;
    };
    expect(manifest.format).toBe('wenhuo-backup');
    expect(manifest.projectCount).toBe(1);
  });

  it('列表按时间倒序读取本地备份', () => {
    const ctx = setup();
    createBackup(ctx.getDb(), ctx.paths, '0.1.0');
    createBackup(ctx.getDb(), ctx.paths, '0.1.0');

    const items = listBackups(ctx.paths);
    expect(items.length).toBe(2);
    expect(items[0]!.createdAt).toBeGreaterThanOrEqual(items[1]!.createdAt);
  });

  it('恢复备份会替换数据库，并留下恢复前副本', () => {
    const ctx = setup();
    createProject(ctx.getDb(), { title: '备份时的书', genre: 'novel' });
    const info = createBackup(ctx.getDb(), ctx.paths, '0.1.0');

    createProject(ctx.getDb(), { title: '备份后加的书', genre: 'novel' });
    expect(listProjects(ctx.getDb())).toHaveLength(2);

    const result = restoreBackup(ctx.getDb(), ctx.paths, info.filePath);
    expect(existsSync(result.safetyCopyPath)).toBe(true);

    const reopened = ctx.reopen();
    expect(currentVersion(reopened)).toBe(1);
    expect(listProjects(reopened).map((project) => project.title)).toEqual(['备份时的书']);
  });

  it('损坏或非本应用的压缩包会被拒绝', () => {
    const ctx = setup();
    const bogus = join(ctx.paths.root, 'bogus.zip');
    const archive = zipSync({ 'hello.txt': [strToU8('not a backup'), { level: 6 }] });
    writeFileSync(bogus, archive);

    expect(() => restoreBackup(ctx.getDb(), ctx.paths, bogus)).toThrow(AppError);
  });
});
