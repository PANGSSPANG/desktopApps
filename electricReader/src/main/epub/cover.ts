import { mkdir } from 'node:fs/promises'
import { nativeImage } from 'electron'
import type { AppPaths } from '../storage/paths'
import { writeFileAtomic } from '../storage/atomic'
import type { EpubCover } from './metadata'

const THUMBNAIL_WIDTH = 240
const JPEG_QUALITY = 82

/**
 * 封面缩略图在导入时一次性落盘，书架永远不读原图。
 * 用 Electron 自带 nativeImage 解码，避免引入 sharp 这类原生模块。
 */
export async function writeCoverThumbnail(
  bookId: string,
  cover: EpubCover,
  paths: AppPaths,
): Promise<boolean> {
  if (cover.mediaType === 'image/svg+xml') return false
  const image = nativeImage.createFromBuffer(Buffer.from(cover.data))
  if (image.isEmpty()) return false

  const resized = image.resize({ width: THUMBNAIL_WIDTH, quality: 'best' })
  const jpeg = resized.toJPEG(JPEG_QUALITY)
  if (jpeg.byteLength === 0) return false

  await mkdir(paths.coverDir(bookId), { recursive: true })
  await writeFileAtomic(paths.coverFile(bookId), jpeg, { backup: false })
  return true
}
