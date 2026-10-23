import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { EpubCover } from '../../src/main/epub/metadata'
import { ImportService } from '../../src/main/epub/import-service'
import { LibraryRepository } from '../../src/main/storage/library-repo'
import { createAppPaths, type AppPaths } from '../../src/main/storage/paths'
import { writeTestEpub } from '../helpers/epub-fixture'
import { writeTestTxt } from '../helpers/txt-fixture'

const roots: string[] = []

interface Fixtures {
  valid: string
  duplicate: string
  txt: string
  txtDuplicate: string
  bad: string
  unsupported: string
}

interface Harness {
  root: string
  paths: AppPaths
  repo: LibraryRepository
  service: ImportService
  fixtures: Fixtures
}

async function harness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'electricreader-import-'))
  roots.push(root)
  const paths = createAppPaths(root)
  const repo = new LibraryRepository(paths)
  await repo.init()

  const service = new ImportService(repo, paths, async (bookId: string, cover: EpubCover) => {
    await mkdir(paths.coverDir(bookId), { recursive: true })
    await writeFile(path.join(paths.coverDir(bookId), 'cover.jpg'), Buffer.from(cover.data))
    return true
  })

  const fixture = path.join(root, 'fixture.epub')
  await writeTestEpub(fixture)
  const duplicateSource = path.join(root, 'copy-of-fixture.epub')
  await writeFile(duplicateSource, await readFile(fixture))

  const txt = path.join(root, 'novel.txt')
  await writeTestTxt(txt)
  const txtDuplicate = path.join(root, 'copy-of-novel.txt')
  await writeFile(txtDuplicate, await readFile(txt))

  return {
    root,
    paths,
    repo,
    service,
    fixtures: {
      valid: fixture,
      duplicate: duplicateSource,
      txt,
      txtDuplicate,
      bad: path.join(root, 'bad.epub'),
      unsupported: path.join(root, 'not-supported.pdf'),
    },
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('导入管线', () => {
  it('copies the book in, writes metadata and creates a cover', async () => {
    const h = await harness()
    const summary = await h.service.importFiles([h.fixtures.valid])
    expect(summary.errors).toEqual([])
    expect(summary.duplicates).toEqual([])
    expect(summary.imported).toHaveLength(1)

    const book = summary.imported[0]
    expect(book?.id).toMatch(/^[a-f0-9]{64}$/)
    expect(book?.format).toBe('epub')
    expect(book?.title).toBe('夜航测试书')
    expect(book?.status).toBe('unread')
    expect((await stat(h.paths.bookFile(book!.id, 'epub'))).isFile()).toBe(true)
    expect((await stat(h.paths.coverFile(book!.id))).isFile()).toBe(true)
    expect((await h.repo.getData()).books).toHaveLength(1)
  })

  it('imports TXT as a first-class book and deduplicates by content', async () => {
    const h = await harness()
    const first = await h.service.importFiles([h.fixtures.txt])
    expect(first.errors).toEqual([])
    expect(first.imported).toHaveLength(1)

    const book = first.imported[0]
    expect(book?.format).toBe('txt')
    expect(book?.title).toBe('TXT 夜航')
    expect(book?.author).toBe('林川')
    expect((await stat(h.paths.bookFile(book!.id, 'txt'))).isFile()).toBe(true)
    await expect(stat(h.paths.coverDir(book!.id))).rejects.toMatchObject({ code: 'ENOENT' })

    const second = await h.service.importFiles([h.fixtures.txtDuplicate])
    expect(second.imported).toHaveLength(0)
    expect(second.duplicates).toHaveLength(1)
  })

  it('rejects empty TXT without writing a partial copy', async () => {
    const h = await harness()
    const empty = path.join(h.root, 'empty.txt')
    await writeFile(empty, ' \n\n ')
    const summary = await h.service.importFiles([empty])
    expect(summary.errors[0]?.code).toBe('EMPTY')
    expect((await h.repo.getData()).books).toHaveLength(0)
  })

  it('deduplicates by content hash even when the filename differs', async () => {
    const h = await harness()
    const first = await h.service.importFiles([h.fixtures.valid])
    const second = await h.service.importFiles([h.fixtures.duplicate])

    expect(first.imported).toHaveLength(1)
    expect(second.imported).toHaveLength(0)
    expect(second.duplicates).toHaveLength(1)
    expect(second.duplicates[0]?.id).toBe(first.imported[0]?.id)
    expect((await h.repo.getData()).books).toHaveLength(1)
  })

  it('reports unsupported and corrupt files without leaving partial copies', async () => {
    const h = await harness()
    await writeFile(h.fixtures.bad, 'not a zip')
    await writeFile(h.fixtures.unsupported, 'plain text')

    const before = (await readdir(h.paths.booksDir)).length
    const summary = await h.service.importFiles([h.fixtures.bad, h.fixtures.unsupported])

    expect(summary.imported).toHaveLength(0)
    expect(summary.errors.map((issue) => issue.code).sort()).toEqual(['CORRUPT', 'UNSUPPORTED'])
    expect((await readdir(h.paths.booksDir)).length).toBe(before)
  })

  it('restores a missing managed copy and preserves reading progress', async () => {
    const h = await harness()
    const imported = await h.service.importFiles([h.fixtures.valid])
    const id = imported.imported[0]!.id
    await h.repo.updateProgress(
      id,
      { href: 'OEBPS/chapter2.xhtml', type: 'x', locations: { progression: 0.3 } },
      33,
    )
    await rm(h.paths.bookFile(id, 'epub'))
    await rm(h.paths.coverDir(id), { recursive: true, force: true })

    const restored = await h.service.importFiles([h.fixtures.valid])
    expect(restored.imported).toHaveLength(1)
    expect(restored.duplicates).toHaveLength(0)
    expect((await h.repo.getData()).books[0]?.progress.percent).toBe(33)
    expect((await stat(h.paths.bookFile(id, 'epub'))).isFile()).toBe(true)
  })

  it('removes managed files on delete', async () => {
    const h = await harness()
    const imported = await h.service.importFiles([h.fixtures.valid])
    const id = imported.imported[0]!.id
    await h.service.delete(id)

    await expect(stat(h.paths.bookFile(id, 'epub'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(h.paths.coverDir(id))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes a TXT copy on delete', async () => {
    const h = await harness()
    const imported = await h.service.importFiles([h.fixtures.txt])
    const id = imported.imported[0]!.id
    await h.service.delete(id)
    await expect(stat(h.paths.bookFile(id, 'txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects relocation when the selected file has a different hash', async () => {
    const h = await harness()
    const imported = await h.service.importFiles([h.fixtures.valid])
    const id = imported.imported[0]!.id
    await writeTestEpub(h.fixtures.duplicate, { title: '另一本书' })
    await expect(h.service.relocate(id, h.fixtures.duplicate)).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
    })
  })
})
