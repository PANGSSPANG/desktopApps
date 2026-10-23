import {
  EMPTY_LOCATOR,
  clampPercent,
  isBookFormat,
  isBookStatus,
  normalizeLocator,
  normalizeSettings,
} from '@shared/defaults'
import type { Book, BookProgress, LibraryData, ReaderSettings, WindowState } from '@shared/types'
import { isBookId } from './paths'

export interface LibraryFile {
  schemaVersion: 2
  books: Book[]
  settings: ReaderSettings
  windowState?: WindowState
}

export const SCHEMA_VERSION = 2

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, max)
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const time = Date.parse(value)
  if (Number.isNaN(time)) return undefined
  return new Date(time).toISOString()
}

function parseProgress(value: unknown, addedAt: string): BookProgress {
  const input = isRecord(value) ? value : {}
  return {
    locator: normalizeLocator(input.locator) ?? structuredClone(EMPTY_LOCATOR),
    percent: typeof input.percent === 'number' ? clampPercent(input.percent) : 0,
    updatedAt: isoDate(input.updatedAt) ?? addedAt,
  }
}

export function sanitizeBook(value: unknown): Book | null {
  if (!isRecord(value)) return null
  const id = text(value.id, 128)
  if (!id || !isBookId(id)) return null
  const title = text(value.title) ?? '未命名书籍'
  const addedAt = isoDate(value.addedAt) ?? new Date().toISOString()
  const fileSize =
    typeof value.fileSize === 'number' && Number.isFinite(value.fileSize) && value.fileSize >= 0
      ? Math.floor(value.fileSize)
      : 0
  const author = text(value.author)
  const language = text(value.language, 64)
  const lastReadAt = isoDate(value.lastReadAt)
  const status = isBookStatus(value.status) ? value.status : 'unread'
  const format = isBookFormat(value.format) ? value.format : 'epub'

  return {
    id,
    format,
    title,
    ...(author ? { author } : {}),
    ...(language ? { language } : {}),
    fileSize,
    addedAt,
    ...(lastReadAt ? { lastReadAt } : {}),
    status,
    progress: parseProgress(value.progress, addedAt),
  }
}

export function createLibraryFile(): LibraryFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    books: [],
    settings: normalizeSettings(undefined),
  }
}

export function parseWindowState(value: unknown): WindowState | undefined {
  if (!isRecord(value)) return undefined
  const width = typeof value.width === 'number' ? Math.round(value.width) : 0
  const height = typeof value.height === 'number' ? Math.round(value.height) : 0
  if (width < 640 || height < 480) return undefined
  const x =
    typeof value.x === 'number' && Number.isFinite(value.x) ? Math.round(value.x) : undefined
  const y =
    typeof value.y === 'number' && Number.isFinite(value.y) ? Math.round(value.y) : undefined
  return {
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
    width,
    height,
    maximized: value.maximized === true,
  }
}

/**
 * 磁盘索引是不可信输入：字段逐项收窄，坏条目丢弃但不拖垮整库。
 * v1 → v2 只增加 Book.format，旧书默认 epub；更高版本明确失败，绝不静默降级。
 */
export function parseLibraryFile(value: unknown): LibraryFile {
  if (!isRecord(value)) throw new Error('书库索引不是对象')
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error(`不支持的书库版本：${String(value.schemaVersion)}`)
  }
  if (!Array.isArray(value.books)) throw new Error('书库索引缺少 books 数组')

  const seen = new Set<string>()
  const books: Book[] = []
  for (const candidate of value.books) {
    const book = sanitizeBook(candidate)
    if (book && !seen.has(book.id)) {
      seen.add(book.id)
      books.push(book)
    }
  }

  const parsedWindowState = parseWindowState(value.windowState)
  return {
    schemaVersion: SCHEMA_VERSION,
    books,
    settings: normalizeSettings(value.settings),
    ...(parsedWindowState ? { windowState: parsedWindowState } : {}),
  }
}

export function readSchemaVersion(value: unknown): number | undefined {
  return isRecord(value) && typeof value.schemaVersion === 'number'
    ? value.schemaVersion
    : undefined
}

export function toLibraryData(file: LibraryFile, missingIds: ReadonlySet<string>): LibraryData {
  return {
    books: file.books
      .map((book) => ({
        ...structuredClone(book),
        ...(missingIds.has(book.id) ? { fileMissing: true } : {}),
      }))
      .sort(compareBooks),
    settings: { ...file.settings },
  }
}

export function compareBooks(a: Book, b: Book): number {
  const aTime = Date.parse(a.lastReadAt ?? a.addedAt)
  const bTime = Date.parse(b.lastReadAt ?? b.addedAt)
  return bTime - aTime
}
