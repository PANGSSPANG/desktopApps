import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 选一个真正可写的数据目录。
 *
 * 背景：某些受限环境（虚拟桌面、受管机器、沙箱会话）里 %APPDATA% 不可写，
 * 应用会在建 `projects/` 时 EPERM 直接退出，用户只看到"打不开"。
 * 这里按优先级逐个探测，第一个能建的就用它，而不是死守默认路径。
 */
export type WriteProbe = (dir: string) => boolean;

/** 真实探测：建目录 + 写一个临时文件 + 删掉。 */
export function canWriteDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.write-test-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function pickUserDataDir(candidates: readonly string[], probe: WriteProbe): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (probe(candidate)) return candidate;
  }
  return null;
}
