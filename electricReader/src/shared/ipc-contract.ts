import type {
  Book,
  ImportSummary,
  LibraryData,
  ProgressUpdate,
  ReaderSettings,
  Result,
} from './types'

export const IPC = {
  libraryGet: 'library:get',
  libraryImportDialog: 'library:import-dialog',
  libraryImportPaths: 'library:import-paths',
  libraryDelete: 'library:delete',
  libraryRelocate: 'library:relocate',
  librarySetStatus: 'library:set-status',
  bookRead: 'book:read',
  progressSave: 'progress:save',
  progressFlush: 'progress:flush',
  settingsUpdate: 'settings:update',
} as const

export interface ElectricReaderApi {
  getLibrary(): Promise<Result<LibraryData>>
  importFromDialog(): Promise<Result<ImportSummary>>
  importPaths(paths: string[]): Promise<Result<ImportSummary>>
  deleteBook(bookId: string): Promise<Result<LibraryData>>
  relocateBook(bookId: string): Promise<Result<Book>>
  setBookStatus(bookId: string, status: Book['status']): Promise<Result<LibraryData>>
  readBook(bookId: string): Promise<Result<Uint8Array>>
  saveProgress(update: ProgressUpdate): Promise<Result<Book>>
  flushProgress(update: ProgressUpdate): void
  updateSettings(patch: Partial<ReaderSettings>): Promise<Result<ReaderSettings>>
  getPathForFile(file: File): string
}
