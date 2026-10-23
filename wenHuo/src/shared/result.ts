import type { ErrorCode } from './errors';

/**
 * 跨进程统一的返回包装。
 *
 * 主进程绝不向渲染层抛异常：所有 IPC 结果都是 Result<T>，
 * 渲染层的 api 层负责解包与提示，技术细节只进日志。
 */
export interface AppErrorPayload {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppErrorPayload };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T = never>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

export function isOk<T>(result: Result<T>): result is { ok: true; data: T } {
  return result.ok;
}
