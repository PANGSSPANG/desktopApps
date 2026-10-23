import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLogger } from '@main/logger';

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-log-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('logger', () => {
  it('目录不存在时自动创建并写入', () => {
    withTempDir((dir) => {
      const file = join(dir, 'logs', 'main.log');
      const logger = createLogger(file);
      logger.info('hello', { chapterId: 'c1' });

      expect(existsSync(file)).toBe(true);
      const content = readFileSync(file, 'utf8');
      expect(content).toContain('[INFO] hello');
      expect(content).toContain('c1');
    });
  });

  it('写入路径不可用时绝不抛异常（原先是主进程崩溃点）', () => {
    withTempDir((dir) => {
      // 用一个普通文件占住 logs 这个名字，使 mkdir 必然失败
      const blocker = join(dir, 'logs');
      writeFileSync(blocker, 'x');

      const logger = createLogger(join(blocker, 'main.log'));
      expect(() => logger.info('still alive')).not.toThrow();
      expect(() => logger.warn('still alive')).not.toThrow();
      expect(() => logger.error('still alive', new Error('boom'))).not.toThrow();
    });
  });

  it('日志被删掉后仍能继续写', () => {
    withTempDir((dir) => {
      const file = join(dir, 'logs', 'main.log');
      const logger = createLogger(file);
      logger.info('first');
      rmSync(join(dir, 'logs'), { recursive: true, force: true });

      expect(() => logger.info('second')).not.toThrow();
      expect(existsSync(file)).toBe(true);
    });
  });
});
