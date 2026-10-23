import path from 'node:path'
import type { BookFormat } from '@shared/types'

export interface AppPaths {
  root: string
  libraryFile: string
  libraryBackupFile: string
  booksDir: string
  bookFile: (id: string, format?: BookFormat) => string
  coverDir: (id: string) => string
  coverFile: (id: string) => string
}

export const BOOK_ID_PATTERN = /^[a-f0-9]{64}$/

export function isBookId(value: string): boolean {
  return BOOK_ID_PATTERN.test(value)
}

/** 所有落盘路径都从这里推导，禁止在业务里手拼分隔符。 */
export function createAppPaths(root: string): AppPaths {
  const booksDir = path.join(root, 'books')
  return {
    root,
    libraryFile: path.join(root, 'library.json'),
    libraryBackupFile: path.join(root, 'library.json.bak'),
    booksDir,
    bookFile: (id, format = 'epub') => path.join(booksDir, `${id}.${format}`),
    coverDir: (id) => path.join(booksDir, id),
    coverFile: (id) => path.join(booksDir, id, 'cover.jpg'),
  }
}
