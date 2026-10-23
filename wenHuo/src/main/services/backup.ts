import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { AppError } from '@shared/errors';
import type { BackupInfo } from '@shared/types';
import type { Db } from '../db/connection';
import type { AppPaths } from '../paths';

const FORMAT = 'wenhuo-backup';
const MANIFEST = 'manifest.json';
const DB_ENTRY = 'wenhuo.db';

interface Manifest {
  format: string;
  version: number;
  appVersion: string;
  createdAt: number;
  projectCount: number;
  chapterCount: number;
}

function backupDir(paths: AppPaths): string {
  const dir = join(paths.root, 'backups');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function countRows(db: Db): { projects: number; chapters: number } {
  const projects = db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number };
  const chapters = db.prepare('SELECT COUNT(*) AS count FROM chapters').get() as { count: number };
  return { projects: Number(projects.count), chapters: Number(chapters.count) };
}

/**
 * 全库备份：整本 SQLite（含所有项目）+ manifest。
 *
 * 用 `VACUUM INTO` 取一份一致快照，而不是直接复制 db 文件——
 * WAL 模式下直接复制会漏掉还没 checkpoint 的写入。
 */
export function createBackup(db: Db, paths: AppPaths, appVersion: string): BackupInfo {
  const snapshotPath = join(paths.recoveryDir, `backup-snapshot-${Date.now()}.db`);
  mkdirSync(paths.recoveryDir, { recursive: true });

  try {
    db.exec(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);
    const dbBytes = readFileSync(snapshotPath);
    const counts = countRows(db);
    const createdAt = Date.now();

    const manifest: Manifest = {
      format: FORMAT,
      version: 1,
      appVersion,
      createdAt,
      projectCount: counts.projects,
      chapterCount: counts.chapters,
    };

    const archive = zipSync({
      [MANIFEST]: [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }],
      [DB_ENTRY]: [new Uint8Array(dbBytes), { level: 6 }],
    });

    const fileName = `wenhuo-backup-${new Date(createdAt).toISOString().replace(/[:.]/g, '-')}.zip`;
    const filePath = join(backupDir(paths), fileName);
    writeFileSync(filePath, archive);

    return {
      filePath,
      fileName,
      createdAt,
      bytes: archive.byteLength,
      projectCount: counts.projects,
      chapterCount: counts.chapters,
    };
  } finally {
    rmSync(snapshotPath, { force: true });
  }
}

function readManifestFromZip(filePath: string): { manifest: Manifest; dbBytes: Uint8Array } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(readFileSync(filePath)));
  } catch {
    throw new AppError('BACKUP_FAILED', '这个文件不是有效的备份包（无法解压）。');
  }

  const manifestEntry = files[MANIFEST];
  const dbEntry = files[DB_ENTRY];
  if (!manifestEntry || !dbEntry) {
    throw new AppError('BACKUP_FAILED', '这个压缩包里没有文火备份所需的文件。');
  }

  let manifest: Manifest;
  try {
    manifest = JSON.parse(strFromU8(manifestEntry)) as Manifest;
  } catch {
    throw new AppError('BACKUP_FAILED', '备份包的清单损坏，无法读取。');
  }

  if (manifest.format !== FORMAT) {
    throw new AppError('BACKUP_FAILED', '这不是文火生成的备份包。');
  }

  return { manifest, dbBytes: dbEntry };
}

export function listBackups(paths: AppPaths): BackupInfo[] {
  const dir = join(paths.root, 'backups');
  if (!existsSync(dir)) return [];

  const items: BackupInfo[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.zip')) continue;
    const filePath = join(dir, name);
    try {
      const { manifest } = readManifestFromZip(filePath);
      items.push({
        filePath,
        fileName: name,
        createdAt: manifest.createdAt,
        bytes: statSync(filePath).size,
        projectCount: manifest.projectCount,
        chapterCount: manifest.chapterCount,
      });
    } catch {
      // 坏包直接跳过，不阻塞列表
    }
  }

  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export interface RestoreResult {
  filePath: string;
  safetyCopyPath: string;
  projectCount: number;
  chapterCount: number;
}

/**
 * 从备份恢复：先把现状复制一份到 recovery/，再替换数据库文件。
 * 调用方必须随后重启应用（连接已经关闭）。
 */
export function restoreBackup(db: Db, paths: AppPaths, zipPath: string): RestoreResult {
  const { manifest, dbBytes } = readManifestFromZip(zipPath);

  mkdirSync(paths.recoveryDir, { recursive: true });
  const safetyCopyPath = join(paths.recoveryDir, `before-restore-${Date.now()}.db`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  writeFileSync(safetyCopyPath, readFileSync(paths.dbFile));

  // WAL 残留会让恢复后的库读到旧页，必须清掉
  rmSync(`${paths.dbFile}-wal`, { force: true });
  rmSync(`${paths.dbFile}-shm`, { force: true });

  const tmpPath = `${paths.dbFile}.restoring`;
  writeFileSync(tmpPath, dbBytes);
  renameSync(tmpPath, paths.dbFile);

  return {
    filePath: basename(zipPath),
    safetyCopyPath,
    projectCount: manifest.projectCount,
    chapterCount: manifest.chapterCount,
  };
}
