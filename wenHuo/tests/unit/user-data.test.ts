import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canWriteDir, pickUserDataDir } from '@main/user-data';

describe('数据目录回退', () => {
  it('canWriteDir 能识别可写目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wenhuo-ud-'));
    try {
      expect(canWriteDir(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canWriteDir 遇到同名文件占位时返回 false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wenhuo-ud-'));
    try {
      const blocked = join(dir, 'blocked');
      writeFileSync(blocked, 'x');
      expect(existsSync(blocked)).toBe(true);
      expect(canWriteDir(blocked)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('按顺序取第一个可写候选', () => {
    const writable = new Set(['/b', '/c']);
    expect(pickUserDataDir(['/a', '/b', '/c'], (dir) => writable.has(dir))).toBe('/b');
  });

  it('全部不可写时返回 null', () => {
    expect(pickUserDataDir(['/a', '/b'], () => false)).toBeNull();
  });

  it('跳过空候选', () => {
    expect(pickUserDataDir(['', '/b'], (dir) => dir === '/b')).toBe('/b');
  });
});
