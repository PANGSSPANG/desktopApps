import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstWritableDir, isDirWritable } from '@main/paths';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-paths-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('isDirWritable', () => {
  it('临时目录可写', () => {
    withTempDir((dir) => {
      expect(isDirWritable(dir)).toBe(true);
    });
  });

  it('不存在的目录会被创建并判定可写', () => {
    withTempDir((dir) => {
      expect(isDirWritable(join(dir, 'a', 'b'))).toBe(true);
    });
  });

  it('路径被同名文件占用时判定不可写', () => {
    withTempDir((dir) => {
      const file = join(dir, 'occupied');
      writeFileSync(file, 'x');
      expect(isDirWritable(join(file, 'sub'))).toBe(false);
    });
  });
});

describe('firstWritableDir', () => {
  it('跳过不可写项，返回第一个可写目录', () => {
    withTempDir((dir) => {
      const file = join(dir, 'blocker');
      writeFileSync(file, 'x');
      const good = join(dir, 'good');
      expect(firstWritableDir(['', join(file, 'sub'), good], dir)).toBe(good);
    });
  });

  it('全部不可写时回落到兜底目录', () => {
    withTempDir((dir) => {
      const file = join(dir, 'blocker2');
      writeFileSync(file, 'x');
      expect(firstWritableDir([join(file, 'a'), join(file, 'b')], dir)).toBe(dir);
    });
  });
});
