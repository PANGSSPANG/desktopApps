import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { Book, BookFormat } from '@shared/types'
import { createAppPaths } from '../../src/main/storage/paths'
import { LibraryRepository } from '../../src/main/storage/library-repo'
import { parseLibraryFile } from '../../src/main/storage/library-schema'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'electricreader-repo-'))
  roots.push(root)
  return root
}

function makeBook(id: string, title = '测试书', format: BookFormat = 'epub'): Book {
  const now = new Date().toISOString()
  return {
    id,
    format,
    title,
    author: '作者',
    fileSize: 1024,
    addedAt: now,
    status: 'unread',
    progress: {
      locator: {
        href: 'OEBPS/chapter1.xhtml',
        type: 'application/xhtml+xml',
        locations: { progression: 0, totalProgression: 0 },
      },
      percent: 0,
      updatedAt: now,
    },
  }
}

const ID = 'a'.repeat(64)
const ID2 = 'b'.repeat(64)

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('书库索引', () => {
  it('starts empty and writes a schema v1 file', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()

    const data = await repo.getData()
    expect(data.books).toEqual([])
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
    expect(JSON.parse(await readFile(paths.libraryFile, 'utf8'))).toMatchObject({
      schemaVersion: 2,
    })
  })

  it('persists books, progress, settings and window state', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()

    await repo.appendBook(makeBook(ID))
    const updated = await repo.updateProgress(
      ID,
      {
        href: 'OEBPS/chapter2.xhtml',
        type: 'application/xhtml+xml',
        cfi: 'epubcfi(/6/6!/4/2/1:0)',
        locations: { progression: 0.5, totalProgression: 0.42 },
      },
      42,
    )
    expect(updated.status).toBe('reading')
    expect(updated.lastReadAt).toBeTruthy()

    await repo.updateSettings({ fontSize: 160, theme: 'dark' })
    await repo.saveWindowState({ x: 30, y: 40, width: 1200, height: 800, maximized: true })

    const reloaded = new LibraryRepository(paths)
    await reloaded.init()
    const data = await reloaded.getData()
    expect(data.books).toHaveLength(1)
    expect(data.books[0]?.progress.percent).toBe(42)
    expect(data.books[0]?.progress.locator.cfi).toBe('epubcfi(/6/6!/4/2/1:0)')
    expect(data.settings.fontSize).toBe(160)
    expect(reloaded.getWindowState()?.maximized).toBe(true)
  })

  it('marks books whose managed copy disappeared', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()
    await repo.appendBook(makeBook(ID))
    await writeFile(paths.bookFile(ID, 'epub'), 'epub')

    expect((await repo.getData()).books[0]?.fileMissing).toBeUndefined()
    await rm(paths.bookFile(ID, 'epub'))
    expect((await repo.getData()).books[0]?.fileMissing).toBe(true)
  })

  it('tracks TXT copies with the .txt extension', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()
    await repo.appendBook(makeBook(ID, 'TXT 书', 'txt'))
    await writeFile(paths.bookFile(ID, 'txt'), 'text')

    const data = await repo.getData()
    expect(data.books[0]?.format).toBe('txt')
    expect(data.books[0]?.fileMissing).toBeUndefined()
  })

  it('recovers from .bak when library.json is corrupted', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()
    await repo.appendBook(makeBook(ID))
    await repo.updateSettings({ fontSize: 145 })

    await cp(paths.libraryFile, paths.libraryBackupFile)
    await writeFile(paths.libraryFile, '{ this is not json')

    const recovered = new LibraryRepository(paths)
    await recovered.init()
    expect(recovered.loadWarning).toContain('备份')
    expect((await recovered.getData()).books[0]?.title).toBe('测试书')
    expect((await recovered.getData()).settings.fontSize).toBe(145)

    const files = await readdir(root)
    expect(files.some((name) => name.startsWith('library.corrupt-'))).toBe(true)
  })

  it('rejects an unsupported schema version instead of silently migrating', () => {
    expect(() => parseLibraryFile({ schemaVersion: 3, books: [], settings: {} })).toThrow(
      '不支持的书库版本',
    )
    expect(() => parseLibraryFile({ books: [] })).toThrow('不支持的书库版本')
  })

  it('migrates schema v1 books to epub format', () => {
    const legacyBook = makeBook(ID)
    const parsed = parseLibraryFile({
      schemaVersion: 1,
      books: [{ ...legacyBook, format: undefined }],
      settings: DEFAULT_SETTINGS,
    })
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.books[0]?.format).toBe('epub')
  })

  it('rewrites a v1 index as v2 on startup', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    await rm(paths.booksDir, { recursive: true, force: true })
    await writeFile(
      paths.libraryFile,
      JSON.stringify({
        schemaVersion: 1,
        books: [{ ...makeBook(ID), format: undefined }],
        settings: DEFAULT_SETTINGS,
      }),
    )

    const repo = new LibraryRepository(paths)
    await repo.init()
    const persisted = JSON.parse(await readFile(paths.libraryFile, 'utf8'))
    expect(persisted.schemaVersion).toBe(2)
    expect((await repo.getData()).books[0]?.format).toBe('epub')
  })

  it('drops malformed book entries but keeps the valid ones', () => {
    const parsed = parseLibraryFile({
      schemaVersion: 1,
      books: [makeBook(ID), { id: 'not-a-hash', title: '坏条目' }],
      settings: { fontSize: 1000, theme: 'neon' },
    })
    expect(parsed.books).toHaveLength(1)
    expect(parsed.settings.fontSize).toBe(130)
    expect(parsed.settings.theme).toBe('light')
  })

  it('serializes concurrent progress writes without corrupting the index', async () => {
    const root = await tempRoot()
    const paths = createAppPaths(root)
    const repo = new LibraryRepository(paths)
    await repo.init()
    await repo.appendBook(makeBook(ID))
    await repo.appendBook(makeBook(ID2))

    await Promise.all([
      repo.updateProgress(ID, { href: 'a.xhtml', type: 'x', locations: { progression: 0.2 } }, 20),
      repo.updateProgress(ID2, { href: 'b.xhtml', type: 'x', locations: { progression: 0.6 } }, 60),
      repo.updateSettings({ theme: 'sepia' }),
    ])

    const data = await repo.getData()
    expect(data.books.find((book) => book.id === ID)?.progress.percent).toBe(20)
    expect(data.books.find((book) => book.id === ID2)?.progress.percent).toBe(60)
    expect(data.settings.theme).toBe('sepia')
    expect(JSON.parse(await readFile(paths.libraryFile, 'utf8')).books).toHaveLength(2)
  })
})
