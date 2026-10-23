import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

function serialize(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  return String(error);
}

export function createLogger(file: string): Logger {
  try {
    mkdirSync(dirname(file), { recursive: true });
  } catch {
    // 目录建不出来也不该让应用起不来，写入时会再试一次并兜底到 stderr
  }

  function rotate(): void {
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
    } catch {
      // 首次写入或文件被占用时忽略，绝不让日志影响主流程
    }
  }

  /**
   * 日志绝不能抛异常。
   *
   * 之前这里直接 appendFileSync：一旦目录不存在（比如 %APPDATA% 取不到、
   * userData 退化成相对路径后工作目录又变了），主进程就会抛 ENOENT；
   * 而窗口焦点事件每触发一次就再抛一次，于是不停弹 "A JavaScript error occurred"。
   */
  function write(level: string, message: string, extra: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}${extra ? ` ${extra}` : ''}\n`;
    try {
      rotate();
      appendFileSync(file, line, 'utf8');
      return;
    } catch {
      // 目录可能在运行期被删掉，重试一次
    }
    try {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, line, 'utf8');
      return;
    } catch {
      // 最终兜底：只写 stderr，不影响业务流程
      try {
        process.stderr.write(line);
      } catch {
        // 连 stderr 都不可用就彻底放弃
      }
    }
  }

  return {
    info(message, meta) {
      write('INFO', message, meta ? JSON.stringify(meta) : '');
    },
    warn(message, meta) {
      write('WARN', message, meta ? JSON.stringify(meta) : '');
    },
    error(message, error, meta) {
      const payload = [
        error === undefined ? '' : serialize(error),
        meta ? JSON.stringify(meta) : '',
      ]
        .filter(Boolean)
        .join(' ');
      write('ERROR', message, payload);
    },
  };
}
