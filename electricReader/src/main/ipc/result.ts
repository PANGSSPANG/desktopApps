import type { Result } from '@shared/types'

export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

function isStructured(error: unknown): error is { name: string; code: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    typeof (error as { message: unknown }).message === 'string' &&
    ['AppError', 'ImportServiceError', 'EpubError', 'TxtError'].includes(
      (error as { name?: string }).name ?? '',
    )
  )
}

/** 异常不跨越 IPC：统一收敛为可展示的 Result。 */
export async function toResult<T>(task: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await task() }
  } catch (error) {
    if (isStructured(error)) {
      return { ok: false, code: error.code, message: error.message }
    }
    console.error('IPC 操作失败', error)
    return {
      ok: false,
      code: 'INTERNAL',
      message: '操作未完成，请重试；如果问题持续，请重启 electricReader',
    }
  }
}
