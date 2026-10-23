import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import type {
  Book,
  BookFormat,
  ImportDuplicateItem,
  ImportErrorItem,
  ImportSummary,
} from '@shared/types'
import { EMPTY_LOCATOR } from '@shared/defaults'
import type { AppPaths } from '../storage/paths'
import type { LibraryRepository } from '../storage/library-repo'
import { removePath } from '../storage/atomic'
import { readTxtDocument, TxtError } from '../txt/txt-book'
import { EpubError, readEpubMetadata, type EpubCover } from './metadata'

export class ImportServiceError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImportServiceError'
    this.code = code
  }
}

export type CoverWriter = (bookId: string, cover: EpubCover, paths: AppPaths) => Promise<boolean>

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk as Buffer))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function isFile(target: string): Promise<boolean> {
  try {
    const info = await stat(target)
    return info.isFile()
  } catch {
    return false
  }
}

function partPathFor(target: string): string {
  return `${target}.part-${process.pid}-${randomBytes(6).toString('hex')}`
}

async function copyAtomic(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const part = partPathFor(target)
  try {
    await copyFile(source, part)
    await rename(part, target)
  } catch (error) {
    await unlink(part).catch(() => undefined)
    throw error
  }
}

function toIssue(fileName: string, error: unknown): ImportErrorItem {
  if (error instanceof EpubError) return { fileName, code: error.code, message: error.message }
  if (error instanceof TxtError) return { fileName, code: error.code, message: error.message }
  if (error instanceof ImportServiceError) {
    return { fileName, code: error.code, message: error.message }
  }
  return {
    fileName,
    code: 'IMPORT_FAILED',
    message: '导入失败，请确认文件可读且磁盘空间充足后重试',
  }
}

interface SourceMetadata {
  format: BookFormat
  title: string
  author?: string
  language?: string
  cover?: EpubCover
}

async function readSourceMetadata(filePath: string, format: BookFormat): Promise<SourceMetadata> {
  if (format === 'txt') {
    const text = await readTxtDocument(filePath)
    return {
      format,
      title: text.title,
      ...(text.author ? { author: text.author } : {}),
      language: text.language,
    }
  }
  const epub = await readEpubMetadata(filePath)
  return {
    format,
    title: epub.title,
    ...(epub.author ? { author: epub.author } : {}),
    ...(epub.language ? { language: epub.language } : {}),
    ...(epub.cover ? { cover: epub.cover } : {}),
  }
}

export class ImportService {
  constructor(
    private readonly repo: LibraryRepository,
    private readonly paths: AppPaths,
    private readonly writeCover: CoverWriter,
  ) {}

  async importFiles(filePaths: readonly string[]): Promise<ImportSummary> {
    const summary: ImportSummary = { imported: [], duplicates: [], errors: [] }
    for (const filePath of filePaths.slice(0, 500)) {
      const fileName = path.basename(filePath)
      try {
        const result = await this.importOne(filePath)
        if (result.kind === 'duplicate') summary.duplicates.push(result.duplicate)
        else summary.imported.push(result.book)
      } catch (error) {
        summary.errors.push(toIssue(fileName, error))
      }
    }
    return summary
  }

  private async importOne(
    filePath: string,
  ): Promise<
    { kind: 'imported'; book: Book } | { kind: 'duplicate'; duplicate: ImportDuplicateItem }
  > {
    const extension = path.extname(filePath).toLowerCase()
    if (extension !== '.epub' && extension !== '.txt') {
      throw new ImportServiceError('UNSUPPORTED', '仅支持 .epub / .txt 文件，其他格式未做静默降级')
    }
    if (!(await isFile(filePath))) {
      throw new ImportServiceError('FILE_NOT_FOUND', '文件不存在或已被移动，请重新选择')
    }

    const format: BookFormat = extension === '.txt' ? 'txt' : 'epub'
    const id = await hashFile(filePath)
    const existing = this.repo.getBook(id)
    const target = this.paths.bookFile(id, existing?.format ?? format)
    const targetExists = await isFile(target)

    if (existing && targetExists) {
      return { kind: 'duplicate', duplicate: { id, title: existing.title } }
    }
    if (existing && existing.format !== format) {
      throw new ImportServiceError(
        'FORMAT_CONFLICT',
        `相同内容已以 ${existing.format.toUpperCase()} 格式存在，请先移除原书`,
      )
    }

    const metadata = await readSourceMetadata(filePath, format)
    const info = await stat(filePath)
    const bookFileExists = await isFile(target)

    if (!bookFileExists) await copyAtomic(filePath, target)

    if (metadata.cover) {
      const wroteCover = await this.tryWriteCover(id, metadata.cover)
      if (!wroteCover && !existing) await removePath(this.paths.coverDir(id))
    }

    if (existing) {
      // 同内容副本被手动删除后重新导入：恢复文件，保留原阅读进度。
      const refreshed = await this.repo.refreshBookFile(id, {
        fileSize: info.size,
        title: metadata.title,
        ...(metadata.author ? { author: metadata.author } : {}),
        ...(metadata.language ? { language: metadata.language } : {}),
      })
      if (!refreshed) throw new ImportServiceError('IMPORT_FAILED', '恢复书籍失败，请重试')
      return { kind: 'imported', book: refreshed }
    }

    const now = new Date().toISOString()
    const book: Book = {
      id,
      format,
      title: metadata.title,
      ...(metadata.author ? { author: metadata.author } : {}),
      ...(metadata.language ? { language: metadata.language } : {}),
      fileSize: info.size,
      addedAt: now,
      status: 'unread',
      progress: {
        locator: structuredClone(EMPTY_LOCATOR),
        percent: 0,
        updatedAt: now,
      },
    }

    try {
      await this.repo.appendBook(book)
      return { kind: 'imported', book }
    } catch (error) {
      await removePath(target).catch(() => undefined)
      await removePath(this.paths.coverDir(id)).catch(() => undefined)
      throw error
    }
  }

  async relocate(bookId: string, filePath: string): Promise<Book> {
    const book = this.repo.getBook(bookId)
    if (!book) throw new ImportServiceError('BOOK_NOT_FOUND', '书籍不存在，可能已被删除')
    const expectedExtension = book.format === 'txt' ? '.txt' : '.epub'
    if (path.extname(filePath).toLowerCase() !== expectedExtension) {
      throw new ImportServiceError(
        'UNSUPPORTED',
        `请选择与原书一致的 ${book.format.toUpperCase()} 文件`,
      )
    }
    if (!(await isFile(filePath))) {
      throw new ImportServiceError('FILE_NOT_FOUND', '文件不存在或已被移动，请重新选择')
    }
    const id = await hashFile(filePath)
    if (id !== bookId) {
      throw new ImportServiceError(
        'HASH_MISMATCH',
        '选择的文件与书库中的记录不是同一本（内容校验不一致）',
      )
    }
    const metadata = await readSourceMetadata(filePath, book.format)
    const info = await stat(filePath)
    await copyAtomic(filePath, this.paths.bookFile(bookId, book.format))
    if (metadata.cover) {
      await this.tryWriteCover(bookId, metadata.cover)
    } else {
      await removePath(this.paths.coverDir(bookId)).catch(() => undefined)
    }
    const refreshed = await this.repo.refreshBookFile(bookId, {
      fileSize: info.size,
      title: metadata.title,
      ...(metadata.author ? { author: metadata.author } : {}),
      ...(metadata.language ? { language: metadata.language } : {}),
    })
    if (!refreshed) throw new ImportServiceError('BOOK_NOT_FOUND', '书籍不存在，可能已被删除')
    return refreshed
  }

  async delete(bookId: string): Promise<void> {
    await removePath(this.paths.bookFile(bookId, 'epub'))
    await removePath(this.paths.bookFile(bookId, 'txt'))
    await removePath(this.paths.coverDir(bookId))
  }

  private async tryWriteCover(bookId: string, cover: EpubCover): Promise<boolean> {
    try {
      return await this.writeCover(bookId, cover, this.paths)
    } catch {
      return false
    }
  }
}

export { hashFile }
