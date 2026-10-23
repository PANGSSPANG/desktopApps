import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'

export type TxtEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030'

export interface TxtChapter {
  title: string
  paragraphs: string[]
  volume?: string
}

export interface TxtDocument {
  text: string
  chapters: TxtChapter[]
  title: string
  author?: string
  language: string
  encoding: TxtEncoding
}

export class TxtError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TxtError'
    this.code = code
  }
}

const MAX_CHAPTERS = 3000
const MAX_TXT_BYTES = 200 * 1024 * 1024
const CHAPTER_CHUNK_CHARS = 14_000

const CN_NUMBER = '0-9零〇一二三四五六七八九十百千万两'

const VOLUME_PATTERNS = [
  new RegExp(`^第\\s*[${CN_NUMBER}]+\\s*[卷部篇](?:[\\s:：、.\\-—]+[^\\n]{0,50})?$`),
  new RegExp(`^卷\\s*[${CN_NUMBER}]+(?:[\\s:：、.\\-—]+[^\\n]{0,50})?$`),
  /^(?:上|中|下|续|终)卷(?:[\s:：、.\-—]+[^\n]{0,50})?$/,
  /^(?:上部|中部|下部|上篇|中篇|下篇)(?:[\s:：、.\-—]+[^\n]{0,50})?$/,
  /^(?:Volume|VOLUME|Vol\.?)\s+[0-9IVXLCDM]+(?:[\s:：.\-—]+[^\n]{0,60})?$/,
  /^(?:Part|PART)\s+[0-9IVXLCDM]+(?:[\s:：.\-—]+[^\n]{0,60})?$/,
]

const CHAPTER_PATTERNS = [
  new RegExp(`^第\\s*[${CN_NUMBER}]+\\s*[章回节集](?:[\\s:：、.\\-—]+[^\\n]{0,50})?$`),
  /^(?:序章|序言|前言|引子|楔子|尾声|后记|附录|番外|终章|大结局|正文)(?:[\s:：、.\-—]+[^\n]{0,50})?$/,
  /^(?:Chapter|CHAPTER)\s+(?:\d+|[IVXLCDM]+|[A-Za-z]+)(?:[\s:：.\-—]+[^\n]{0,60})?$/,
  new RegExp(`^(?:[0-9]{1,3}|[一二三四五六七八九十]{1,4})[、.．]\\s*[^\\n]{1,40}$`),
  new RegExp(`^[（(](?:[0-9]{1,3}|[一二三四五六七八九十]{1,4})[）)]\\s*[^\\n]{1,40}$`),
]

export type TxtHeadingKind = 'volume' | 'chapter'

function decodeWith(label: string, bytes: Uint8Array, fatal: boolean): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(bytes)
  } catch {
    return null
  }
}

/** TXT 编码不可信：BOM → UTF-16 空字节特征 → UTF-8 严格解码 → GB18030 兜底。 */
export function decodeTxtBuffer(buffer: Uint8Array): { text: string; encoding: TxtEncoding } {
  if (buffer.byteLength > MAX_TXT_BYTES) {
    throw new TxtError('TOO_LARGE', 'TXT 文件超过 200MB，当前版本无法导入')
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    const text = decodeWith('utf-8', buffer.subarray(3), true)
    if (text !== null) return { text, encoding: 'utf-8' }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    const text = decodeWith('utf-16le', buffer.subarray(2), true)
    if (text !== null) return { text, encoding: 'utf-16le' }
  }
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const text = decodeWith('utf-16be', buffer.subarray(2), true)
    if (text !== null) return { text, encoding: 'utf-16be' }
  }

  const sampleLength = Math.min(buffer.byteLength, 4000)
  let evenNulls = 0
  let oddNulls = 0
  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] !== 0) continue
    if (index % 2 === 0) evenNulls += 1
    else oddNulls += 1
  }
  if (sampleLength > 100 && evenNulls > sampleLength / 10 && oddNulls < sampleLength / 100) {
    const text = decodeWith('utf-16be', buffer, true)
    if (text !== null) return { text, encoding: 'utf-16be' }
  }
  if (sampleLength > 100 && oddNulls > sampleLength / 10 && evenNulls < sampleLength / 100) {
    const text = decodeWith('utf-16le', buffer, true)
    if (text !== null) return { text, encoding: 'utf-16le' }
  }

  const utf8 = decodeWith('utf-8', buffer, true)
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' }
  const gb = decodeWith('gb18030', buffer, true)
  if (gb !== null) return { text: gb, encoding: 'gb18030' }

  throw new TxtError('UNSUPPORTED_ENCODING', '无法识别 TXT 编码，请将文件转存为 UTF-8 / GBK 后重试')
}

function cleanText(value: string): string {
  return value
    .split('\u0000')
    .join('')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/^\uFEFF/, '')
    .trim()
}

function classifyHeading(line: string): { kind: TxtHeadingKind; title: string } | null {
  let value = line.trim()
  const markdown = value.match(/^#{1,6}\s+(.+)$/)
  if (markdown?.[1]) value = markdown[1].trim()
  if (value.length < 2 || value.length > 80) return null
  if (/[。！？!?；;，,]$/.test(value)) return null
  if (VOLUME_PATTERNS.some((pattern) => pattern.test(value))) {
    return { kind: 'volume', title: value }
  }
  if (CHAPTER_PATTERNS.some((pattern) => pattern.test(value))) {
    return { kind: 'chapter', title: value }
  }
  // Markdown 标题即使不符合章节命名规则，也视为章节标题。
  if (markdown) return { kind: 'chapter', title: value }
  return null
}

interface MetaLines {
  title?: string
  author?: string
  skip: Set<number>
}

function readMetaLines(lines: string[]): MetaLines {
  const meta: MetaLines = { skip: new Set() }
  const limit = Math.min(lines.length, 30)
  for (let index = 0; index < limit; index += 1) {
    const value = lines[index]?.trim() ?? ''
    if (!value) continue
    const title = value.match(/^(?:书名|标题|Title)\s*[:：]\s*(.{1,120})$/i)
    if (title?.[1] && !meta.title) {
      meta.title = title[1].trim()
      meta.skip.add(index)
      continue
    }
    const author = value.match(/^(?:作者|Author)\s*[:：]\s*(.{1,80})$/i)
    if (author?.[1] && !meta.author) {
      meta.author = author[1].trim()
      meta.skip.add(index)
    }
  }
  return meta
}

/**
 * 章节识别只做“足够好”的启发式：中文章节/分卷、序章/番外、Chapter N、
 * 1. 标题、Markdown 标题。识别不到时退化为单章“正文”，保证任何 TXT 都能读。
 */
export function parseTxtText(
  raw: string,
  fallbackTitle: string,
  encoding: TxtEncoding = 'utf-8',
): TxtDocument {
  const text = cleanText(raw)
  if (!text) throw new TxtError('EMPTY', 'TXT 文件是空的，没有可阅读的内容')

  const lines = text.split('\n')
  const meta = readMetaLines(lines)
  const title = meta.title || fallbackTitle.trim() || '未命名书籍'

  const headings = new Map<number, { kind: TxtHeadingKind; title: string }>()
  let chapterHeadingCount = 0
  let volumeHeadingCount = 0
  for (let index = 0; index < lines.length; index += 1) {
    if (meta.skip.has(index)) continue
    const heading = classifyHeading(lines[index] ?? '')
    if (!heading || headings.size >= MAX_CHAPTERS) continue
    headings.set(index, heading)
    if (heading.kind === 'chapter') chapterHeadingCount += 1
    else volumeHeadingCount += 1
  }

  // 只有卷标题而没有章标题时，把卷当作章，避免整本书只剩一个“正文”。
  if (chapterHeadingCount === 0 && volumeHeadingCount > 0) {
    for (const [index, heading] of headings) {
      if (heading.kind === 'volume') headings.set(index, { ...heading, kind: 'chapter' })
    }
  }

  if (headings.size === 0) {
    const paragraphs = lines
      .map((line, index) => (meta.skip.has(index) ? '' : line.trim()))
      .filter(Boolean)
    return {
      text,
      chapters: [{ title: '正文', paragraphs }],
      title,
      ...(meta.author ? { author: meta.author } : {}),
      language: 'zh-CN',
      encoding,
    }
  }

  const chapters: TxtChapter[] = []
  const preamble: string[] = []
  let volumeIntro: string[] = []
  let currentVolume: string | undefined
  let currentChapter: TxtChapter | null = null

  const pushChapter = (): void => {
    if (!currentChapter) return
    chapters.push(currentChapter)
    currentChapter = null
  }

  const pushVolumeIntro = (): void => {
    if (!currentVolume || volumeIntro.length === 0) return
    chapters.push({ title: '卷首语', volume: currentVolume, paragraphs: volumeIntro })
    volumeIntro = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (meta.skip.has(index)) continue
    const value = (lines[index] ?? '').trim()
    if (!value) continue
    const heading = headings.get(index)

    if (heading?.kind === 'volume') {
      pushChapter()
      pushVolumeIntro()
      currentVolume = heading.title
      volumeIntro = []
      continue
    }
    if (heading?.kind === 'chapter') {
      pushChapter()
      pushVolumeIntro()
      currentChapter = {
        title: heading.title,
        ...(currentVolume ? { volume: currentVolume } : {}),
        paragraphs: [],
      }
      continue
    }

    if (currentChapter) currentChapter.paragraphs.push(value)
    else if (currentVolume) volumeIntro.push(value)
    else preamble.push(value)
  }

  pushChapter()
  pushVolumeIntro()

  if (preamble.length > 0) {
    chapters.unshift({ title: '开篇', paragraphs: preamble })
  }
  if (chapters.length === 0) {
    chapters.push({
      title: '正文',
      paragraphs: lines
        .map((line, index) => (meta.skip.has(index) ? '' : line.trim()))
        .filter(Boolean),
    })
  }

  return {
    text,
    chapters,
    title,
    ...(meta.author ? { author: meta.author } : {}),
    language: 'zh-CN',
    encoding,
  }
}

export function parseTxtBuffer(buffer: Uint8Array, fallbackTitle: string): TxtDocument {
  const decoded = decodeTxtBuffer(buffer)
  return parseTxtText(decoded.text, fallbackTitle, decoded.encoding)
}

export async function readTxtDocument(filePath: string): Promise<TxtDocument> {
  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    throw new TxtError('READ_FAILED', '无法读取 TXT 文件，文件可能已被移动或删除')
  }
  return parseTxtBuffer(buffer, path.basename(filePath, path.extname(filePath)))
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function splitLongParagraph(value: string): string[] {
  if (value.length <= CHAPTER_CHUNK_CHARS) return [value]
  const parts: string[] = []
  for (let offset = 0; offset < value.length; offset += CHAPTER_CHUNK_CHARS) {
    parts.push(value.slice(offset, offset + CHAPTER_CHUNK_CHARS))
  }
  return parts
}

function chapterChunks(chapter: TxtChapter): string[][] {
  const chunks: string[][] = []
  let current: string[] = []
  let size = 0
  for (const paragraph of chapter.paragraphs.flatMap(splitLongParagraph)) {
    if (current.length > 0 && size + paragraph.length > CHAPTER_CHUNK_CHARS) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(paragraph)
    size += paragraph.length
  }
  if (current.length > 0) chunks.push(current)
  if (chunks.length === 0) chunks.push([])
  return chunks
}

function xhtmlDocument(title: string, body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${body}</body>
</html>`
}

/**
 * 把 TXT 转成结构稳定的最小 EPUB 3，交给现有 ReaderEngine 分页。
 * 目录、CFI、进度因此全部复用 EPUB 链路，不需要第二套阅读内核。
 */
export function buildTxtEpub(document: TxtDocument, bookId: string): Uint8Array {
  const chapterFiles: Array<{
    href: string
    id: string
    title: string
    paragraphs: string[]
    first: boolean
  }> = []
  const chapterFirstHrefs: string[] = []

  document.chapters.forEach((chapter, chapterIndex) => {
    const chunks = chapterChunks(chapter)
    chunks.forEach((paragraphs, chunkIndex) => {
      const href = `text-${chapterIndex}-${chunkIndex}.xhtml`
      const id = `chapter-${chapterIndex}`
      chapterFiles.push({
        href,
        id,
        title: chapter.title,
        paragraphs,
        first: chunkIndex === 0,
      })
      if (chunkIndex === 0) chapterFirstHrefs[chapterIndex] = `${href}#${id}`
    })
  })

  const tocItems: Array<{
    title: string
    href: string
    children: Array<{ title: string; href: string }>
  }> = []
  let volumeGroup: (typeof tocItems)[number] | null = null
  document.chapters.forEach((chapter, index) => {
    const href = chapterFirstHrefs[index]
    if (!href) return
    if (chapter.volume) {
      if (!volumeGroup || volumeGroup.title !== chapter.volume) {
        volumeGroup = { title: chapter.volume, href, children: [] }
        tocItems.push(volumeGroup)
      }
      volumeGroup.children.push({ title: chapter.title, href })
    } else {
      volumeGroup = null
      tocItems.push({ title: chapter.title, href, children: [] })
    }
  })

  const navItems = tocItems
    .map((item) => {
      const children = item.children
        .map((child) => `<li><a href="${escapeXml(child.href)}">${escapeXml(child.title)}</a></li>`)
        .join('')
      return `<li><a href="${escapeXml(item.href)}">${escapeXml(item.title)}</a>${
        children ? `<ol>${children}</ol>` : ''
      }</li>`
    })
    .join('\n      ')

  const manifest = chapterFiles
    .map(
      (file, index) =>
        `<item id="text-${index}" href="${file.href}" media-type="application/xhtml+xml"/>`,
    )
    .join('\n    ')
  const spine = chapterFiles.map((_, index) => `<itemref idref="text-${index}"/>`).join('\n    ')

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:electricreader:txt:${bookId}</dc:identifier>
    <dc:title>${escapeXml(document.title)}</dc:title>
    ${document.author ? `<dc:creator>${escapeXml(document.author)}</dc:creator>` : ''}
    <dc:language>${document.language}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`),
    'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body><nav epub:type="toc" id="toc"><h1>目录</h1><ol>${navItems}</ol></nav></body>
</html>`),
    'OEBPS/style.css': strToU8(
      'body { margin: 0; font-family: serif; line-height: 1.7; } h1 { font-size: 1.6em; margin: 0 0 1em; } p { margin: 0 0 0.7em; }',
    ),
  }

  for (const file of chapterFiles) {
    const heading = file.first ? `<h1 id="${file.id}">${escapeXml(file.title)}</h1>` : ''
    const paragraphs = file.paragraphs
      .map((paragraph) => `<p>${escapeXml(paragraph)}</p>`)
      .join('\n')
    files[`OEBPS/${file.href}`] = strToU8(xhtmlDocument(file.title, `${heading}\n${paragraphs}`))
  }

  return zipSync(files, {
    level: 6,
    mtime: new Date('2026-01-01T00:00:00Z'),
  })
}

export async function readTxtBook(
  filePath: string,
  bookId: string,
): Promise<{
  document: TxtDocument
  data: Uint8Array
}> {
  const document = await readTxtDocument(filePath)
  return { document, data: buildTxtEpub(document, bookId) }
}
