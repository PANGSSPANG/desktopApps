import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { unzipSync } from 'fflate'

export type EpubErrorCode = 'DRM' | 'CORRUPT' | 'NO_OPF' | 'UNSUPPORTED' | 'TOO_LARGE'

export class EpubError extends Error {
  readonly code: EpubErrorCode

  constructor(code: EpubErrorCode, message: string) {
    super(message)
    this.name = 'EpubError'
    this.code = code
  }
}

export interface EpubCover {
  data: Uint8Array
  mediaType: string
  href: string
}

export interface EpubMetadata {
  title: string
  author?: string
  language?: string
  cover?: EpubCover
  spineCount: number
}

type XmlRecord = Record<string, unknown>

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
])

const FONT_OBFUSCATION = ['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']

const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024
const MAX_COVER_BYTES = 20 * 1024 * 1024

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
})

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayOf(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return cleanText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = textOf(item)
      if (text) return text
    }
    return undefined
  }
  if (isRecord(value)) return textOf(value['#text'])
  return undefined
}

function allText(value: unknown): string[] {
  return arrayOf(value)
    .map((item) => textOf(item))
    .filter((item): item is string => Boolean(item))
}

function attr(value: unknown, name: string): string | undefined {
  if (!isRecord(value)) return undefined
  const raw = value[`@_${name}`]
  if (typeof raw === 'string') return cleanText(raw, 2000)
  if (typeof raw === 'number') return String(raw)
  return undefined
}

function cleanText(value: string, max = 500): string {
  let cleaned = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    const isControl =
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    if (!isControl) cleaned += character
  }
  return cleaned.replace(/\s+/g, ' ').trim().slice(0, max)
}

function parseXml(data: Uint8Array, label: string): XmlRecord {
  try {
    const result = parser.parse(new TextDecoder('utf-8', { fatal: false }).decode(data)) as unknown
    if (!isRecord(result)) throw new Error('empty')
    return result
  } catch {
    throw new EpubError('CORRUPT', `${label} 的 XML 无法解析，文件可能已损坏`)
  }
}

function decodePart(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

function zipPath(value: string): string | null {
  const withoutFragment = value.split('#')[0]?.split('?')[0] ?? ''
  const decoded = decodePart(withoutFragment)
  if (decoded === null) return null
  const normalized = path.posix.normalize(decoded).replace(/^\/+/, '')
  if (!normalized || normalized.startsWith('../') || normalized === '..') return null
  return normalized
}

function resolveHref(baseDir: string, href: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null
  const decoded = decodePart(href.split('#')[0]?.split('?')[0] ?? '')
  if (decoded === null) return null
  const joined = path.posix.join(baseDir, decoded)
  const normalized = path.posix.normalize(joined).replace(/^\/+/, '')
  if (!normalized || normalized.startsWith('../')) return null
  return normalized
}

function detectDrm(files: Record<string, Uint8Array>): void {
  if (files['META-INF/rights.xml']) {
    throw new EpubError('DRM', '这本书带有 DRM 版权保护，electricReader 无法打开')
  }
  const encryption = files['META-INF/encryption.xml']
  if (!encryption) return
  const xml = new TextDecoder('utf-8', { fatal: false }).decode(encryption)
  if (!/<(?:[A-Za-z0-9_-]+:)?EncryptedData[\s>]/i.test(xml)) return
  const algorithms = [...xml.matchAll(/Algorithm\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1] ?? '',
  )
  const onlyFontObfuscation =
    algorithms.length > 0 && algorithms.every((algorithm) => FONT_OBFUSCATION.includes(algorithm))
  if (!onlyFontObfuscation) {
    throw new EpubError('DRM', '这本书带有 DRM 版权保护，electricReader 无法打开')
  }
}

function readZip(files: Record<string, Uint8Array>, target: string): Uint8Array | undefined {
  return files[target]
}

function findContainerPath(files: Record<string, Uint8Array>): string {
  const containerData = files['META-INF/container.xml']
  if (!containerData) {
    throw new EpubError('NO_OPF', 'EPUB 缺少 META-INF/container.xml，无法定位书籍内容')
  }
  const root = parseXml(containerData, 'container.xml')
  const container = isRecord(root.container) ? root.container : undefined
  const rootfiles = container && isRecord(container.rootfiles) ? container.rootfiles : undefined
  const candidates = arrayOf(rootfiles?.rootfile)
  for (const candidate of candidates) {
    const fullPath = attr(candidate, 'full-path')
    const mediaType = attr(candidate, 'media-type')
    if (fullPath && (!mediaType || mediaType === 'application/oebps-package+xml')) {
      const parsed = zipPath(fullPath)
      if (parsed) return parsed
    }
  }
  throw new EpubError('NO_OPF', 'EPUB 的 container.xml 没有有效的 OPF 路径')
}

interface ManifestItem {
  id: string
  href: string
  mediaType: string
  properties: string[]
  resolved: string | null
}

function readManifestItems(pkg: XmlRecord, opfDir: string): ManifestItem[] {
  const manifest = isRecord(pkg.manifest) ? pkg.manifest : undefined
  const items = arrayOf(manifest?.item)
  const result: ManifestItem[] = []
  for (const raw of items) {
    const id = attr(raw, 'id')
    const href = attr(raw, 'href')
    const mediaType = attr(raw, 'media-type') ?? ''
    if (!id || !href) continue
    result.push({
      id,
      href,
      mediaType,
      properties: (attr(raw, 'properties') ?? '').split(/\s+/).filter(Boolean),
      resolved: resolveHref(opfDir, href),
    })
  }
  return result
}

function findCover(
  pkg: XmlRecord,
  metadata: XmlRecord,
  items: ManifestItem[],
  files: Record<string, Uint8Array>,
  opfDir: string,
): EpubCover | undefined {
  const byId = new Map(items.map((item) => [item.id, item]))
  let coverItem: ManifestItem | undefined

  coverItem = items.find(
    (item) => item.properties.includes('cover-image') && IMAGE_TYPES.has(item.mediaType),
  )

  if (!coverItem) {
    for (const meta of arrayOf(metadata.meta)) {
      if (attr(meta, 'name')?.toLowerCase() !== 'cover') continue
      const content = attr(meta, 'content')
      if (content) coverItem = byId.get(content)
      if (coverItem) break
    }
  }

  if (!coverItem && isRecord(pkg.guide)) {
    for (const reference of arrayOf(pkg.guide.reference)) {
      const type = attr(reference, 'type')?.toLowerCase() ?? ''
      const href = attr(reference, 'href')
      if (!type.includes('cover') || !href) continue
      const resolved = resolveHref(opfDir, href)
      if (!resolved) continue
      const target = items.find((item) => item.resolved === resolved)
      if (target && IMAGE_TYPES.has(target.mediaType)) {
        coverItem = target
        break
      }
    }
  }

  if (!coverItem) {
    coverItem = items.find(
      (item) =>
        IMAGE_TYPES.has(item.mediaType) &&
        (item.id.toLowerCase().includes('cover') || item.href.toLowerCase().includes('cover')),
    )
  }

  if (!coverItem) {
    let largest: ManifestItem | undefined
    let largestSize = -1
    for (const item of items) {
      if (!IMAGE_TYPES.has(item.mediaType) || !item.resolved) continue
      const size = files[item.resolved]?.byteLength ?? -1
      if (size > largestSize) {
        largest = item
        largestSize = size
      }
    }
    coverItem = largest
  }

  if (!coverItem || !coverItem.resolved) return undefined
  const data = readZip(files, coverItem.resolved)
  if (!data || data.byteLength === 0 || data.byteLength > MAX_COVER_BYTES) return undefined
  return {
    data,
    mediaType: coverItem.mediaType,
    href: coverItem.resolved,
  }
}

export function parseEpubBuffer(buffer: Uint8Array, fallbackTitle: string): EpubMetadata {
  let files: Record<string, Uint8Array>
  let exceeded = false
  let total = 0
  try {
    files = unzipSync(buffer, {
      filter: (file) => {
        total += file.originalSize
        if (total > MAX_UNCOMPRESSED_BYTES) {
          exceeded = true
          return false
        }
        return true
      },
    })
  } catch {
    throw new EpubError('CORRUPT', 'EPUB 压缩包已损坏，无法解压')
  }
  if (exceeded) {
    throw new EpubError('TOO_LARGE', 'EPUB 解压后体积超过 2GB，暂时无法打开')
  }

  const mimetype = files.mimetype
  if (mimetype) {
    const value = new TextDecoder('utf-8', { fatal: false }).decode(mimetype).trim()
    if (value && value !== 'application/epub+zip') {
      throw new EpubError('UNSUPPORTED', '这不是标准 EPUB 文件，electricReader 仅支持 EPUB')
    }
  }

  detectDrm(files)

  const opfPath = findContainerPath(files)
  const opfData = files[opfPath]
  if (!opfData) throw new EpubError('NO_OPF', 'EPUB 声明的 OPF 文件不存在，文件可能已损坏')

  const root = parseXml(opfData, 'OPF')
  const pkg = isRecord(root.package) ? root.package : undefined
  if (!pkg) throw new EpubError('NO_OPF', 'OPF 缺少 package 根节点，文件可能已损坏')
  const metadata = isRecord(pkg.metadata) ? pkg.metadata : {}
  const opfDir = path.posix.dirname(opfPath)
  const items = readManifestItems(pkg, opfDir)

  const titles = allText(metadata.title)
  const creators = [...new Set(allText(metadata.creator))]
  const languages = allText(metadata.language)
  const spine = isRecord(pkg.spine) ? pkg.spine : undefined
  const spineCount = arrayOf(spine?.itemref).length
  const cover = findCover(pkg, metadata, items, files, opfDir)

  return {
    title: (titles[0] ?? cleanText(fallbackTitle)) || '未命名书籍',
    ...(creators.length > 0 ? { author: creators.join(' / ').slice(0, 500) } : {}),
    ...(languages[0] ? { language: languages[0].slice(0, 64) } : {}),
    ...(cover ? { cover } : {}),
    spineCount,
  }
}

export async function readEpubMetadata(filePath: string): Promise<EpubMetadata> {
  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    throw new EpubError('CORRUPT', '无法读取 EPUB 文件，文件可能已被移动或删除')
  }
  const fallback = path.basename(filePath, path.extname(filePath))
  return parseEpubBuffer(buffer, fallback)
}
