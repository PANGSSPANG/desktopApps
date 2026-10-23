import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { EpubError, parseEpubBuffer } from '../../src/main/epub/metadata'
import { buildTestEpub } from '../helpers/epub-fixture'

const text = (value: string) => strToU8(value)

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`
}

function epub2Package(options: { cover: boolean }): string {
  const coverItem = options.cover
    ? '<item id="cover-img" href="cover.png" media-type="image/png"/>'
    : ''
  const coverMeta = options.cover ? '<meta name="cover" content="cover-img"/>' : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>旧格式之书</dc:title>
    <dc:creator>旧作者</dc:creator>
    <dc:language>zh</dc:language>
    ${coverMeta}
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    ${coverItem}
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="ch1"/></spine>
  <guide><reference type="cover" title="Cover" href="chapter1.xhtml"/></guide>
</package>`
}

function epub2(): Uint8Array {
  return zipSync({
    mimetype: text('application/epub+zip'),
    'META-INF/container.xml': text(containerXml()),
    'OEBPS/content.opf': text(epub2Package({ cover: true })),
    'OEBPS/cover.png': new Uint8Array([137, 80, 78, 71]),
    'OEBPS/toc.ncx': text(
      '<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"/>',
    ),
    'OEBPS/chapter1.xhtml': text('<html><body><p>正文</p></body></html>'),
  })
}

describe('EPUB 元数据抽取', () => {
  it('reads title, author, language, cover and spine from EPUB 3', () => {
    const metadata = parseEpubBuffer(buildTestEpub(), 'fallback')
    expect(metadata.title).toBe('夜航测试书')
    expect(metadata.author).toBe('林川')
    expect(metadata.language).toBe('zh-CN')
    expect(metadata.spineCount).toBe(3)
    expect(metadata.cover?.mediaType).toBe('image/png')
    expect(metadata.cover?.data.byteLength).toBeGreaterThan(100)
  })

  it('supports EPUB 2 meta[name=cover]', () => {
    const metadata = parseEpubBuffer(epub2(), 'fallback')
    expect(metadata.title).toBe('旧格式之书')
    expect(metadata.cover?.href).toBe('OEBPS/cover.png')
  })

  it('falls back to the provided filename when title is empty', () => {
    const metadata = parseEpubBuffer(buildTestEpub({ title: '' }), '我的文件名')
    expect(metadata.title).toBe('我的文件名')
  })

  it('does not fail when there is no cover', () => {
    const files = unzipSync(buildTestEpub())
    delete files['OEBPS/cover.png']
    const opf = new TextDecoder().decode(files['OEBPS/content.opf'])
    files['OEBPS/content.opf'] = text(
      opf.replace(/<item id="cover"[^>]*>/, '').replace('properties="nav"', 'properties="nav"'),
    )
    const metadata = parseEpubBuffer(zipSync(files), 'fallback')
    expect(metadata.cover).toBeUndefined()
    expect(metadata.title).toBe('夜航测试书')
  })
})

describe('EPUB 错误分支', () => {
  it('reports corrupt archives', () => {
    expect(() => parseEpubBuffer(new Uint8Array([1, 2, 3, 4]), 'bad')).toThrowError(EpubError)
    try {
      parseEpubBuffer(new Uint8Array([1, 2, 3, 4]), 'bad')
    } catch (error) {
      expect((error as EpubError).code).toBe('CORRUPT')
    }
  })

  it('reports missing OPF', () => {
    const files = { mimetype: text('application/epub+zip') }
    try {
      parseEpubBuffer(zipSync(files), 'none')
      throw new Error('expected error')
    } catch (error) {
      expect((error as EpubError).code).toBe('NO_OPF')
    }
  })

  it('reports DRM-protected content', () => {
    const files = unzipSync(buildTestEpub())
    files['META-INF/encryption.xml'] = text(`<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
  xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/chapter1.xhtml"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`)
    try {
      parseEpubBuffer(zipSync(files), 'drm')
      throw new Error('expected error')
    } catch (error) {
      expect((error as EpubError).code).toBe('DRM')
    }
  })

  it('allows font-only obfuscation', () => {
    const files = unzipSync(buildTestEpub())
    files['META-INF/encryption.xml'] = text(`<?xml version="1.0"?>
<encryption xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="OEBPS/font.otf"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`)
    expect(parseEpubBuffer(zipSync(files), 'font').title).toBe('夜航测试书')
  })
})
