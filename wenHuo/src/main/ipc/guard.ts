import { ipcMain } from 'electron';
import { AppError, toErrorCode, toResultMessage } from '@shared/errors';
import { err, ok, type Result } from '@shared/result';
import type { Logger } from '../logger';

/**
 * 所有 IPC handler 的唯一入口：捕获异常、记录日志、统一包成 Result。
 * 禁止在业务代码里直接 ipcMain.handle。
 */
export function handle<O>(
  channel: string,
  logger: Logger,
  fn: (payload: unknown) => O | Promise<O>,
): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<Result<O>> => {
    try {
      return ok(await fn(payload));
    } catch (error) {
      logger.error(`ipc ${channel} failed`, error);
      return err(toErrorCode(error), toResultMessage(error));
    }
  });
}

export function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new AppError('INVALID_ARGUMENT');
  return payload as Record<string, unknown>;
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new AppError('INVALID_ARGUMENT', `${field}必须为字符串。`);
  return value;
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
