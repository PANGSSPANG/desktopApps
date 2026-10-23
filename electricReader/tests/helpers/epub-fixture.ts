import { deflateSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { strToU8, zipSync } from 'fflate'

export interface TestEpubOptions {
  title?: string
  author?: string
  language?: string
  chapters?: number
  paragraphsPerChapter?: number
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, checksum])
}

export function makeCoverPng(width = 480, height = 720): Uint8Array {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const rowLength = width * 3 + 1
  const raw = Buffer.alloc(rowLength * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0
    for (let x = 0; x < width; x += 1) {
      const offset = y * rowLength + 1 + x * 3
      raw[offset] = Math.round(70 + (x / width) * 90)
      raw[offset + 1] = Math.round(58 + (y / height) * 50)
      raw[offset + 2] = Math.round(46 + ((x + y) / (width + height)) * 35)
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const png = Buffer.concat([
    signature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  return new Uint8Array(png)
}

function chapterXhtml(index: number, paragraphs: number): string {
  const body = Array.from({ length: paragraphs }, (_, paragraph) => {
    const number = paragraph + 1
    return `<p>第 ${index} 章的第 ${number} 段。夜色落在窗台上，纸页翻动时发出很轻的响声。阅读器把这一页放进柔和的光里，让人愿意再多读一段。这里是用于定位的稳定句子 ${index}-${number}。</p>`
  }).join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>第 ${index} 章</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>第 ${index} 章 · 夜航</h1>
${body}
<h2 id="section-${index}">这一章的结尾</h2>
<p>合上书页之前，再读一段。这里仍然有文字，位置应当被准确记住。</p>
</body>
</html>`
}

function navXhtml(chapters: number): string {
  const items = Array.from({ length: chapters }, (_, i) => {
    const index = i + 1
    const nested =
      index === 1 ? `<ol><li><a href="chapter1.xhtml#section-1">第一节 · 窗边</a></li></ol>` : ''
    return `<li><a href="chapter${index}.xhtml">第 ${index} 章 · 夜航</a>${nested}</li>`
  }).join('')
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>目录</h1><ol>${items}</ol></nav>
</body>
</html>`
}

export function buildTestEpub(options: TestEpubOptions = {}): Uint8Array {
  const title = options.title ?? '夜航测试书'
  const author = options.author ?? '林川'
  const language = options.language ?? 'zh-CN'
  const chapters = Math.max(1, options.chapters ?? 3)
  const paragraphs = Math.max(5, options.paragraphsPerChapter ?? 30)

  const chapterItems = Array.from({ length: chapters }, (_, i) => {
    const index = i + 1
    return `<item id="ch${index}" href="chapter${index}.xhtml" media-type="application/xhtml+xml"/>`
  }).join('\n')
  const spineItems = Array.from(
    { length: chapters },
    (_, i) => `<itemref idref="ch${i + 1}"/>`,
  ).join('\n')

  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:electricreader-test-book</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>${language}</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="style" href="style.css" media-type="text/css"/>
    ${chapterItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`),
    'OEBPS/nav.xhtml': strToU8(navXhtml(chapters)),
    'OEBPS/cover.png': makeCoverPng(),
    'OEBPS/style.css': strToU8(
      'body { margin: 0; font-family: serif; } h1 { font-size: 2em; } p { margin: 0 0 1em; }',
    ),
  }

  for (let index = 1; index <= chapters; index += 1) {
    files[`OEBPS/chapter${index}.xhtml`] = strToU8(chapterXhtml(index, paragraphs))
  }

  return zipSync(files, {
    level: 6,
    mtime: new Date('2026-01-01T00:00:00Z'),
  })
}

export async function writeTestEpub(target: string, options: TestEpubOptions = {}): Promise<void> {
  await writeFile(target, buildTestEpub(options))
}
