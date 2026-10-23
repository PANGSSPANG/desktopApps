import { readFile, stat } from 'node:fs/promises'
import { dialog, ipcMain, nativeTheme, type BrowserWindow } from 'electron'
import { isBookStatus, normalizeLocator, normalizeSettings } from '@shared/defaults'
import { IPC } from '@shared/ipc-contract'
import type {
  Book,
  BookStatus,
  ImportSummary,
  LibraryData,
  ProgressUpdate,
  ReaderSettings,
} from '@shared/types'
import type { ImportService } from '../epub/import-service'
import type { LibraryRepository } from '../storage/library-repo'
import { readTxtBook } from '../txt/txt-book'
import { isBookId, type AppPaths } from '../storage/paths'
import { AppError, toResult } from './result'

interface IpcContext {
  repo: LibraryRepository
  paths: AppPaths
  imports: ImportService
  getWindow: () => BrowserWindow | null
}

const MAX_BOOK_BYTES = 1024 * 1024 * 1024

export function applyNativeTheme(settings: ReaderSettings): void {
  nativeTheme.themeSource = settings.followSystem
    ? 'system'
    : settings.theme === 'dark'
      ? 'dark'
      : 'light'
}

function emptySummary(): ImportSummary {
  return { imported: [], duplicates: [], errors: [] }
}

function showOpenDialog(
  context: IpcContext,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const win = context.getWindow()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

function normalizeUpdate(raw: unknown): ProgressUpdate {
  if (typeof raw !== 'object' || raw === null) {
    throw new AppError('INVALID_PROGRESS', '阅读位置数据无效')
  }
  const input = raw as Record<string, unknown>
  if (typeof input.bookId !== 'string' || !isBookId(input.bookId)) {
    throw new AppError('INVALID_PROGRESS', '阅读位置缺少有效书籍标识')
  }
  const locator = normalizeLocator(input.locator)
  if (!locator) throw new AppError('INVALID_PROGRESS', '阅读位置缺少章节信息')
  const percent =
    typeof input.percent === 'number' && Number.isFinite(input.percent) ? input.percent : 0
  return { bookId: input.bookId, locator, percent }
}

async function importViaDialog(context: IpcContext): Promise<ImportSummary> {
  const result = await showOpenDialog(context, {
    title: '导入电子书',
    buttonLabel: '导入',
    filters: [{ name: '电子书（EPUB / TXT）', extensions: ['epub', 'txt'] }],
    properties: ['openFile', 'multiSelections'],
  })
  if (result.canceled || result.filePaths.length === 0) return emptySummary()
  return context.imports.importFiles(result.filePaths)
}

export function registerBookIpc(context: IpcContext): void {
  const { repo, paths, imports } = context

  ipcMain.handle(IPC.libraryGet, () => toResult(() => repo.getData()))

  ipcMain.handle(IPC.libraryImportDialog, () => toResult(() => importViaDialog(context)))

  ipcMain.handle(IPC.libraryImportPaths, (_event, rawPaths: unknown) =>
    toResult(async () => {
      if (!Array.isArray(rawPaths) || rawPaths.some((item) => typeof item !== 'string')) {
        throw new AppError('INVALID_INPUT', '拖入的文件路径无效，请重新拖拽 EPUB / TXT 文件')
      }
      const pathsToImport = rawPaths
        .filter((item): item is string => typeof item === 'string')
        .slice(0, 500)
      if (pathsToImport.length === 0) return emptySummary()
      return imports.importFiles(pathsToImport)
    }),
  )

  ipcMain.handle(IPC.libraryDelete, (_event, bookId: unknown) =>
    toResult<LibraryData>(async () => {
      if (typeof bookId !== 'string' || !isBookId(bookId)) {
        throw new AppError('INVALID_INPUT', '书籍标识无效')
      }
      const removed = await repo.removeBook(bookId)
      if (!removed) throw new AppError('BOOK_NOT_FOUND', '这本书已不在书库中')
      await imports.delete(bookId).catch((error: unknown) => {
        console.error('清理书籍文件失败，已从索引移除', error)
      })
      return repo.getData()
    }),
  )

  ipcMain.handle(IPC.libraryRelocate, (_event, bookId: unknown) =>
    toResult<Book>(async () => {
      if (typeof bookId !== 'string' || !isBookId(bookId)) {
        throw new AppError('INVALID_INPUT', '书籍标识无效')
      }
      const book = repo.getBook(bookId)
      if (!book) throw new AppError('BOOK_NOT_FOUND', '这本书已不在书库中')
      const extension = book.format === 'txt' ? 'txt' : 'epub'
      const result = await showOpenDialog(context, {
        title: `重新定位 ${extension.toUpperCase()}`,
        buttonLabel: '选择文件',
        filters: [
          {
            name: `${extension.toUpperCase()} 电子书`,
            extensions: [extension],
          },
        ],
        properties: ['openFile'],
      })
      const filePath = result.filePaths[0]
      if (result.canceled || !filePath) {
        throw new AppError('CANCELLED', '已取消')
      }
      return imports.relocate(bookId, filePath)
    }),
  )

  ipcMain.handle(IPC.librarySetStatus, (_event, bookId: unknown, rawStatus: unknown) =>
    toResult<LibraryData>(async () => {
      if (typeof bookId !== 'string' || !isBookId(bookId)) {
        throw new AppError('INVALID_INPUT', '书籍标识无效')
      }
      if (!isBookStatus(rawStatus)) {
        throw new AppError('INVALID_INPUT', '阅读状态无效')
      }
      await repo.setStatus(bookId, rawStatus satisfies BookStatus)
      return repo.getData()
    }),
  )

  ipcMain.handle(IPC.bookRead, (_event, bookId: unknown) =>
    toResult<Uint8Array>(async () => {
      if (typeof bookId !== 'string' || !isBookId(bookId)) {
        throw new AppError('INVALID_INPUT', '书籍标识无效')
      }
      const book = repo.getBook(bookId)
      if (!book) throw new AppError('BOOK_NOT_FOUND', '这本书已不在书库中')
      const filePath = paths.bookFile(bookId, book.format)
      const info = await stat(filePath).catch(() => null)
      if (!info?.isFile()) {
        throw new AppError('FILE_MISSING', '书籍文件缺失，请回到书架点击「重新定位」，或移除这本书')
      }
      if (info.size > MAX_BOOK_BYTES) {
        throw new AppError('TOO_LARGE', '这本书超过 1GB，当前版本无法打开')
      }
      if (book.format === 'txt') {
        const { data } = await readTxtBook(filePath, bookId)
        return data
      }
      const data = await readFile(filePath)
      return new Uint8Array(data)
    }),
  )

  ipcMain.handle(IPC.progressSave, (_event, raw: unknown) =>
    toResult<Book>(async () => {
      const update = normalizeUpdate(raw)
      return repo.updateProgress(update.bookId, update.locator, update.percent)
    }),
  )

  ipcMain.on(IPC.progressFlush, (_event, raw: unknown) => {
    try {
      const update = normalizeUpdate(raw)
      void repo
        .updateProgress(update.bookId, update.locator, update.percent)
        .catch((error: unknown) => console.error('退出前保存进度失败', error))
    } catch (error) {
      console.error('退出前进度数据无效', error)
    }
  })

  ipcMain.handle(IPC.settingsUpdate, (_event, rawPatch: unknown) =>
    toResult<ReaderSettings>(async () => {
      if (typeof rawPatch !== 'object' || rawPatch === null) {
        throw new AppError('INVALID_INPUT', '设置数据无效')
      }
      const merged = normalizeSettings({
        ...repo.getSettings(),
        ...(rawPatch as Partial<ReaderSettings>),
      })
      const saved = await repo.updateSettings(merged)
      applyNativeTheme(saved)
      return saved
    }),
  )
}
