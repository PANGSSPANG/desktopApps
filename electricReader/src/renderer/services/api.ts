import type {
  Book,
  ImportSummary,
  LibraryData,
  ProgressUpdate,
  ReaderSettings,
  Result,
} from '@shared/types'
import type { ElectricReaderApi } from '@shared/ipc-contract'

declare global {
  interface Window {
    api: ElectricReaderApi
  }
}

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

function bridge(): ElectricReaderApi {
  if (!window.api) throw new ApiError('NO_BRIDGE', '应用桥接不可用，请重启 electricReader')
  return window.api
}

async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const result = await promise
  if (!result.ok) throw new ApiError(result.code, result.message)
  return result.data
}

export const api = {
  getLibrary: (): Promise<LibraryData> => unwrap(bridge().getLibrary()),
  importFromDialog: (): Promise<ImportSummary> => unwrap(bridge().importFromDialog()),
  importPaths: (paths: string[]): Promise<ImportSummary> => unwrap(bridge().importPaths(paths)),
  deleteBook: (bookId: string): Promise<LibraryData> => unwrap(bridge().deleteBook(bookId)),
  relocateBook: (bookId: string): Promise<Book> => unwrap(bridge().relocateBook(bookId)),
  setBookStatus: (bookId: string, status: Book['status']): Promise<LibraryData> =>
    unwrap(bridge().setBookStatus(bookId, status)),
  readBook: (bookId: string): Promise<Uint8Array> => unwrap(bridge().readBook(bookId)),
  saveProgress: (update: ProgressUpdate): Promise<Book> => unwrap(bridge().saveProgress(update)),
  flushProgress: (update: ProgressUpdate): void => {
    try {
      bridge().flushProgress(update)
    } catch {
      // 退出路径不能再弹错。
    }
  },
  updateSettings: (patch: Partial<ReaderSettings>): Promise<ReaderSettings> =>
    unwrap(bridge().updateSettings(patch)),
  getPathForFile: (file: File): string => {
    try {
      return bridge().getPathForFile(file)
    } catch {
      return ''
    }
  },
}
