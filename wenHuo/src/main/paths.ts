import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AppPaths {
  root: string;
  dbFile: string;
  projectsDir: string;
  logsDir: string;
  draftsDir: string;
  recoveryDir: string;
}

export function createAppPaths(root: string): AppPaths {
  return {
    root,
    dbFile: join(root, 'wenhuo.db'),
    projectsDir: join(root, 'projects'),
    logsDir: join(root, 'logs'),
    draftsDir: join(root, 'drafts'),
    recoveryDir: join(root, 'recovery'),
  };
}

export function ensureAppPaths(paths: AppPaths): void {
  for (const dir of [
    paths.root,
    paths.projectsDir,
    paths.logsDir,
    paths.draftsDir,
    paths.recoveryDir,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function projectDataDir(paths: AppPaths, projectId: string): string {
  return join(paths.projectsDir, projectId);
}

export function projectAttachmentsDir(paths: AppPaths, projectId: string): string {
  return join(projectDataDir(paths, projectId), 'attachments');
}

/**
 * 目录是否真的可写：只判断 exists 不够，受限环境里目录存在但创建文件会 EPERM。
 * 用一次真实的写-删探测，失败即认为不可写。
 */
export function isDirWritable(dir: string): boolean {
  const probe = join(dir, `.wenhuo-write-probe-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe, 'ok', 'utf8');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/** 依次尝试候选目录，返回第一个真正可写的；都不可写则回落到最后一个（调用方自己的数据目录）。 */
export function firstWritableDir(candidates: readonly string[], fallback: string): string {
  for (const candidate of candidates) {
    if (candidate && isDirWritable(candidate)) return candidate;
  }
  return fallback;
}
