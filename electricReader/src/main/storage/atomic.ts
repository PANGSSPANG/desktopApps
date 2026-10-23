import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { access, copyFile, mkdir, open, rename, rm } from 'node:fs/promises'
import path from 'node:path'

export interface AtomicWriteOptions {
  /** 是否把现有文件复制为 .bak；封面等可再生文件可关闭。 */
  backup?: boolean
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function fsyncFile(target: string): Promise<void> {
  const handle = await open(target, 'r+')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/**
 * write -> fsync -> backup -> rename。重命名在同一目录内完成，避免跨卷非原子移动。
 * Windows 不支持对目录 fsync，因此仅文件级同步。
 */
export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<void> {
  const directory = path.dirname(target)
  await mkdir(directory, { recursive: true })

  const temp = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  )
  const handle = await open(temp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }

  try {
    if (options.backup !== false && (await pathExists(target))) {
      await copyFile(target, `${target}.bak`).catch(() => undefined)
    }
    await rename(temp, target)
    await fsyncFile(target).catch(() => undefined)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}

export async function readTextIfExists(target: string): Promise<string | null> {
  try {
    const handle = await open(target, 'r')
    try {
      return await handle.readFile('utf8')
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return null
    throw error
  }
}

export function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  )
}

export async function removePath(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true })
}
