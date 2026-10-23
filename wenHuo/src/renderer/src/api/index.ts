import type { Result } from '@shared/result';

/** 渲染层唯一允许的 Result 解包点：失败转成可展示的 AppError。 */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.data;
  throw new ApiError(result.error.code, result.error.message);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '出现了意外错误，操作未完成。';
}

export const api = window.api;
