import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  TxtError,
  buildTxtEpub,
  decodeTxtBuffer,
  parseTxtBuffer,
  parseTxtText,
} from '../../src/main/txt/txt-book'

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value)

const sample = `书名：测试文本
作者：某人

第一章 开始
第一段。
第二段。

第二章 继续
第三段。
这是第二章里的普通句子。`

describe('TXT 编码识别', () => {
  it('decodes UTF-8 with BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('你好，世界')])
    const decoded = decodeTxtBuffer(bytes)
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text).toBe('你好，世界')
  })

  it('decodes UTF-16LE with BOM', () => {
    const body = Buffer.from('第一章 测试', 'utf16le')
    const bytes = new Uint8Array([0xff, 0xfe, ...body])
    const decoded = decodeTxtBuffer(bytes)
    expect(decoded.encoding).toBe('utf-16le')
    expect(decoded.text).toBe('第一章 测试')
  })

  it('falls back to GB18030 for Chinese legacy files', () => {
    // "第一章 测试" 的 GBK 字节
    const bytes = new Uint8Array([0xb5, 0xda, 0xd2, 0xbb, 0xd5, 0xc2, 0x20, 0xb2, 0xe2, 0xca, 0xd4])
    const decoded = decodeTxtBuffer(bytes)
    expect(decoded.encoding).toBe('gb18030')
    expect(decoded.text).toBe('第一章 测试')
  })
})

describe('TXT 章节解析', () => {
  it('extracts title, author and chapter boundaries', () => {
    const document = parseTxtText(sample, 'fallback.txt')
    expect(document.title).toBe('测试文本')
    expect(document.author).toBe('某人')
    expect(document.chapters).toHaveLength(2)
    expect(document.chapters[0]?.title).toBe('第一章 开始')
    expect(document.chapters[0]?.paragraphs).toEqual(['第一段。', '第二段。'])
    expect(document.chapters[1]?.title).toBe('第二章 继续')
    expect(document.chapters[1]?.paragraphs).toEqual(['第三段。', '这是第二章里的普通句子。'])
  })

  it('keeps content before the first heading as a preface', () => {
    const document = parseTxtText('序言内容\n第一章 开始\n正文内容', 'fallback')
    expect(document.chapters).toHaveLength(2)
    expect(document.chapters[0]?.title).toBe('开篇')
    expect(document.chapters[0]?.paragraphs).toEqual(['序言内容'])
  })

  it('creates a single readable chapter when no heading exists', () => {
    const document = parseTxtText('只有正文。\n第二段。', '无章节')
    expect(document.title).toBe('无章节')
    expect(document.chapters).toHaveLength(1)
    expect(document.chapters[0]?.title).toBe('正文')
    expect(document.chapters[0]?.paragraphs).toEqual(['只有正文。', '第二段。'])
  })

  it('groups chapters under volumes for a multi-level TOC', () => {
    const document = parseTxtText(
      `第一卷 风起
第一章 起点
内容一
第二章 继续
内容二
第二卷 云涌
第三章 远方
内容三`,
      '分卷书',
    )
    expect(document.chapters).toHaveLength(3)
    expect(document.chapters[0]?.volume).toBe('第一卷 风起')
    expect(document.chapters[1]?.volume).toBe('第一卷 风起')
    expect(document.chapters[2]?.volume).toBe('第二卷 云涌')

    const epub = buildTxtEpub(document, 'c'.repeat(64))
    const nav = strFromU8(unzipSync(epub)['OEBPS/nav.xhtml']!)
    expect(nav).toContain('第一卷 风起')
    expect(nav).toContain('第二卷 云涌')
    expect(nav).toContain('<ol>')
    expect(nav.indexOf('第一卷 风起')).toBeLessThan(nav.indexOf('第一章 起点'))
  })

  it('recognizes Markdown headings and numbered sections', () => {
    const document = parseTxtText(
      `卷三 归途
Chapter One Start
正文一
（一）小节
正文二
1、编号
正文三
## Markdown 标题
正文四`,
      '格式书',
    )
    expect(document.chapters.map((chapter) => chapter.title)).toEqual([
      'Chapter One Start',
      '（一）小节',
      '1、编号',
      'Markdown 标题',
    ])
    expect(document.chapters[0]?.volume).toBe('卷三 归途')
  })

  it('rejects empty files', () => {
    expect(() => parseTxtText('   \n\t\n', '空')).toThrowError(TxtError)
    try {
      parseTxtText('', '空')
    } catch (error) {
      expect((error as TxtError).code).toBe('EMPTY')
    }
  })
})

describe('TXT → EPUB 阅读文档', () => {
  it('builds a valid archive with nav and chapter files', () => {
    const document = parseTxtBuffer(utf8(sample), 'fallback')
    const epub = buildTxtEpub(document, 'a'.repeat(64))
    const files = unzipSync(epub)

    expect(files.mimetype).toBeDefined()
    expect(strFromU8(files.mimetype!)).toBe('application/epub+zip')
    expect(files['OEBPS/content.opf']).toBeDefined()
    expect(files['OEBPS/nav.xhtml']).toBeDefined()

    const nav = strFromU8(files['OEBPS/nav.xhtml']!)
    expect(nav).toContain('第一章 开始')
    expect(nav).toContain('第二章 继续')
    expect(nav).toContain('text-0-0.xhtml#chapter-0')
    expect(files['OEBPS/text-0-0.xhtml']).toBeDefined()
    expect(files['OEBPS/text-1-0.xhtml']).toBeDefined()
  })

  it('splits very long chapters into multiple spine documents', () => {
    const longText = `第一章 很长\n${'一段文字。'.repeat(10_000)}`
    const document = parseTxtText(longText, 'long')
    const epub = buildTxtEpub(document, 'b'.repeat(64))
    const files = unzipSync(epub)
    const chunks = Object.keys(files).filter((name) => name.startsWith('OEBPS/text-0-'))
    expect(chunks.length).toBeGreaterThan(1)
  })
})
