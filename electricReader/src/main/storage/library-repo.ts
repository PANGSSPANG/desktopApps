import { access, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { clampPercent, normalizeLocator, normalizeSettings } from '@shared/defaults'
import type {
  Book,
  BookStatus,
  LibraryData,
  Locator,
  ReaderSettings,
  WindowState,
} from '@shared/types'
import { isBookId, type AppPaths } from './paths'
import { readTextIfExists, writeFileAtomic } from './atomic'
import {
  SCHEMA_VERSION,
  compareBooks,
  createLibraryFile,
  parseLibraryFile,
  parseWindowState,
  readSchemaVersion,
  type LibraryFile,
} from './library-schema'

async function exists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export class LibraryRepository {
  private state: LibraryFile | null = null
  private pending: Promise<void> = Promise.resolve()
  private lastLoadWarning: string | null = null

  constructor(private readonly paths: AppPaths) {}

  get loadWarning(): string | null {
    return this.lastLoadWarning
  }

  async init(): Promise<void> {
    await this.pathsReady()
    await this.load()
  }

  private async pathsReady(): Promise<void> {
    await mkdir(this.paths.booksDir, { recursive: true })
  }

  private async load(): Promise<void> {
    const mainRaw = await readTextIfExists(this.paths.libraryFile)
    if (mainRaw !== null) {
      try {
        const parsed = JSON.parse(mainRaw) as unknown
        this.state = parseLibraryFile(parsed)
        if (readSchemaVersion(parsed) !== SCHEMA_VERSION) {
          await this.persist(this.state)
        }
        return
      } catch (error) {
        this.lastLoadWarning = error instanceof Error ? error.message : '书库索引无法解析'
        await this.archiveCorrupt(this.paths.libraryFile)
      }
    }

    const backupRaw = await readTextIfExists(this.paths.libraryBackupFile)
    if (backupRaw !== null) {
      try {
        this.state = parseLibraryFile(JSON.parse(backupRaw) as unknown)
        await this.persist(this.state, false)
        this.lastLoadWarning = '书库索引已从备份恢复'
        return
      } catch (error) {
        this.lastLoadWarning = error instanceof Error ? error.message : '书库备份无法解析'
      }
    }

    this.state = createLibraryFile()
    await this.persist(this.state, false)
  }

  private async archiveCorrupt(target: string): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const archived = path.join(this.paths.root, `library.corrupt-${stamp}.json`)
    await rename(target, archived).catch(() => undefined)
  }

  private async persist(state: LibraryFile, backup = true): Promise<void> {
    const payload: LibraryFile = {
      schemaVersion: SCHEMA_VERSION,
      books: state.books,
      settings: state.settings,
      ...(state.windowState ? { windowState: state.windowState } : {}),
    }
    await writeFileAtomic(this.paths.libraryFile, `${JSON.stringify(payload, null, 2)}\n`, {
      backup,
    })
  }

  private requireState(): LibraryFile {
    if (!this.state) throw new Error('书库尚未初始化')
    return this.state
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.pending.then(task, task)
    this.pending = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private mutate<T>(change: (draft: LibraryFile) => T): Promise<T> {
    return this.enqueue(async () => {
      const draft = structuredClone(this.requireState())
      const value = change(draft)
      await this.persist(draft)
      this.state = draft
      return value
    })
  }

  async getData(): Promise<LibraryData> {
    const state = this.requireState()
    const missing = new Set<string>()
    await Promise.all(
      state.books.map(async (book) => {
        if (!(await exists(this.paths.bookFile(book.id, book.format)))) missing.add(book.id)
      }),
    )
    return {
      books: state.books
        .map((book) => ({
          ...structuredClone(book),
          ...(missing.has(book.id) ? { fileMissing: true } : {}),
        }))
        .sort(compareBooks),
      settings: { ...state.settings },
    }
  }

  getSettings(): ReaderSettings {
    return { ...this.requireState().settings }
  }

  getWindowState(): WindowState | undefined {
    return this.requireState().windowState
  }

  getBook(bookId: string): Book | undefined {
    if (!isBookId(bookId)) return undefined
    const book = this.requireState().books.find((item) => item.id === bookId)
    return book ? structuredClone(book) : undefined
  }

  hasBook(bookId: string): boolean {
    return this.requireState().books.some((book) => book.id === bookId)
  }

  async appendBook(book: Book): Promise<Book> {
    return this.mutate((draft) => {
      const existing = draft.books.find((item) => item.id === book.id)
      if (existing) return structuredClone(existing)
      draft.books.push(structuredClone(book))
      return structuredClone(book)
    })
  }

  async removeBook(bookId: string): Promise<Book | undefined> {
    return this.mutate((draft) => {
      const index = draft.books.findIndex((book) => book.id === bookId)
      if (index < 0) return undefined
      const [removed] = draft.books.splice(index, 1)
      return removed ? structuredClone(removed) : undefined
    })
  }

  async refreshBookFile(
    bookId: string,
    patch: Pick<Book, 'fileSize'> & Partial<Pick<Book, 'title' | 'author' | 'language'>>,
  ): Promise<Book | undefined> {
    return this.mutate((draft) => {
      const book = draft.books.find((item) => item.id === bookId)
      if (!book) return undefined
      book.fileSize = patch.fileSize
      if (patch.title) book.title = patch.title
      if (patch.author) book.author = patch.author
      if (patch.language) book.language = patch.language
      return structuredClone(book)
    })
  }

  async updateProgress(bookId: string, locator: Locator, percent: number): Promise<Book> {
    const normalized = normalizeLocator(locator)
    if (!normalized) throw new Error('位置数据无效')
    const safePercent = clampPercent(percent)
    return this.mutate((draft) => {
      const book = draft.books.find((item) => item.id === bookId)
      if (!book) throw new Error('书籍不存在')
      const now = new Date().toISOString()
      book.progress = {
        locator: normalized,
        percent: safePercent,
        updatedAt: now,
      }
      book.lastReadAt = now
      if (safePercent >= 99) {
        book.status = 'finished'
      } else if (book.status === 'unread') {
        book.status = 'reading'
      }
      return structuredClone(book)
    })
  }

  async setStatus(bookId: string, status: BookStatus): Promise<Book> {
    return this.mutate((draft) => {
      const book = draft.books.find((item) => item.id === bookId)
      if (!book) throw new Error('书籍不存在')
      book.status = status
      if (status !== 'unread') book.lastReadAt = new Date().toISOString()
      return structuredClone(book)
    })
  }

  async updateSettings(patch: Partial<ReaderSettings>): Promise<ReaderSettings> {
    return this.mutate((draft) => {
      draft.settings = normalizeSettings({ ...draft.settings, ...patch })
      return { ...draft.settings }
    })
  }

  async saveWindowState(windowState: WindowState): Promise<void> {
    await this.mutate((draft) => {
      const parsed = parseWindowState(windowState)
      if (parsed) draft.windowState = parsed
      else delete draft.windowState
    })
  }
}
