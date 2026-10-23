import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTextIfExists, writeFileAtomic } from '../../src/main/storage/atomic'

const roots: string[] = []

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'electricreader-atomic-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('原子写与 .bak 回滚', () => {
  it('writes atomically and keeps the previous version as .bak', async () => {
    const root = await tempRoot()
    const target = path.join(root, 'library.json')
    await writeFileAtomic(target, '{"version":1}')
    await writeFileAtomic(target, '{"version":2}')

    expect(await readFile(target, 'utf8')).toBe('{"version":2}')
    expect(await readFile(`${target}.bak`, 'utf8')).toBe('{"version":1}')

    const leftovers = (await readdir(root)).filter((name) => name.endsWith('.tmp'))
    expect(leftovers).toHaveLength(0)
  })

  it('can skip backups for regenerable files', async () => {
    const root = await tempRoot()
    const target = path.join(root, 'cover.jpg')
    await writeFileAtomic(target, 'old')
    await writeFileAtomic(target, 'new', { backup: false })
    expect(await readFile(target, 'utf8')).toBe('new')
    expect(await readTextIfExists(`${target}.bak`)).toBeNull()
  })

  it('returns null for a missing file instead of throwing', async () => {
    const root = await tempRoot()
    expect(await readTextIfExists(path.join(root, 'missing.json'))).toBeNull()
  })

  it('does not leave a partial target when the source is invalid', async () => {
    const root = await tempRoot()
    const target = path.join(root, 'nested', 'data.json')
    await expect(writeFileAtomic(target, new Uint8Array([1]))).resolves.toBeUndefined()
    expect(await readFile(target)).toEqual(Buffer.from([1]))

    await writeFile(path.join(root, 'nested', 'keep.txt'), 'keep')
    expect(await readFile(path.join(root, 'nested', 'keep.txt'), 'utf8')).toBe('keep')
  })
})
