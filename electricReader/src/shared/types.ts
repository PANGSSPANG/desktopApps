export type BookStatus = 'unread' | 'reading' | 'finished'
export type BookFormat = 'epub' | 'txt'

export type ThemeName = 'light' | 'sepia' | 'dark'

export type FontSize = 100 | 115 | 130 | 145 | 160
export type LineHeight = 1.5 | 1.7 | 1.9
export type MaxWidth = 640 | 720 | 820 | 960
export type FontFamily = 'serif' | 'sans'
export type PageTurn = 'keys' | 'click' | 'both'

/**
 * 与 Readium Locator 对齐的跨进程位置契约。
 * cfi 是 epub.js 的精确锚点；locations 与 text 用于跨内核与兜底恢复。
 */
export interface Locator {
  href: string
  type: string
  title?: string
  cfi?: string
  locations: {
    progression: number
    totalProgression?: number
  }
  text?: {
    before?: string
    highlight?: string
    after?: string
  }
}

export interface BookProgress {
  locator: Locator
  percent: number
  updatedAt: string
}

export interface Book {
  id: string
  format: BookFormat
  title: string
  author?: string
  language?: string
  fileSize: number
  addedAt: string
  lastReadAt?: string
  status: BookStatus
  progress: BookProgress
  /** 派生字段：每次读取书库时由主进程检查副本是否存在。 */
  fileMissing?: boolean
}

export interface ReaderSettings {
  fontSize: FontSize
  lineHeight: LineHeight
  maxWidth: MaxWidth
  theme: ThemeName
  followSystem: boolean
  fontFamily: FontFamily
  indentFirstLine: boolean
  pageTurn: PageTurn
}

export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

export interface LibraryData {
  books: Book[]
  settings: ReaderSettings
}

export interface ImportErrorItem {
  fileName: string
  code: string
  message: string
}

export interface ImportDuplicateItem {
  id: string
  title: string
}

export interface ImportSummary {
  imported: Book[]
  duplicates: ImportDuplicateItem[]
  errors: ImportErrorItem[]
}

export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export interface ProgressUpdate {
  bookId: string
  locator: Locator
  percent: number
}

export interface TocItem {
  id: string
  href: string
  label: string
  children: TocItem[]
}

export const BOOK_FORMAT_LABELS: Record<BookFormat, string> = {
  epub: 'EPUB',
  txt: 'TXT',
}

export const BOOK_STATUS_LABELS: Record<BookStatus, string> = {
  unread: '未读',
  reading: '在读',
  finished: '已读',
}

export const THEME_LABELS: Record<ThemeName, string> = {
  light: '浅色',
  sepia: '羊皮纸',
  dark: '深色',
}

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  100: '小',
  115: '较小',
  130: '标准',
  145: '较大',
  160: '大',
}

export const LINE_HEIGHT_LABELS: Record<LineHeight, string> = {
  1.5: '紧凑',
  1.7: '标准',
  1.9: '宽松',
}

export const MAX_WIDTH_LABELS: Record<MaxWidth, string> = {
  640: '窄',
  720: '标准',
  820: '宽',
  960: '更宽',
}
