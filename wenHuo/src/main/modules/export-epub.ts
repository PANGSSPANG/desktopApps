import { randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { formatChapterTitle } from '@shared/chapter-title';
import type { Manuscript } from './manuscript-content';

/**
 * EPUB 3（兼容 EPUB 2 阅读器）。
 *
 * 规范要求：mimetype 必须是压缩包里的**第一个条目**且**不压缩**，
 * 否则多数阅读器会直接判定文件损坏——这条比内容更常见地导致"导出的书打不开"。
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function paragraphs(plainText: string): string[] {
  return plainText
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function chapterPage(title: string, body: string): string {
  const content = paragraphs(body)
    .map((text) => `      <p>${escapeXml(text)}</p>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${escapeXml(title)}</title>
    <link rel="stylesheet" type="text/css" href="styles.css" />
  </head>
  <body>
    <section epub:type="chapter">
      <h2>${escapeXml(title)}</h2>
${content}
    </section>
  </body>
</html>
`;
}

const STYLES = `body { font-family: "Songti SC", "Noto Serif SC", serif; line-height: 1.8; margin: 1.2em; }
h2 { font-size: 1.2em; font-weight: 600; margin: 0 0 1em; }
p { text-indent: 2em; margin: 0 0 0.6em; }
`;

export function renderEpub(manuscript: Manuscript): Uint8Array {
  const bookId = `urn:uuid:${randomUUID()}`;
  const chapters = manuscript.volumes.flatMap((volume) =>
    volume.chapters.map((chapter) => ({ volume: volume.title, ...chapter })),
  );

  if (chapters.length === 0) {
    chapters.push({ volume: '', id: 'empty', number: 1, title: '空书', plainText: '' });
  }

  const chapterFiles = chapters.map((chapter, index) => {
    const name = `chapter-${String(index + 1).padStart(3, '0')}.xhtml`;
    return {
      ...chapter,
      name,
      content: chapterPage(formatChapterTitle(chapter.number, chapter.title), chapter.plainText),
    };
  });

  const navItems = chapterFiles
    .map(
      (chapter) =>
        `        <li><a href="${chapter.name}">${escapeXml(formatChapterTitle(chapter.number, chapter.title))}</a></li>`,
    )
    .join('\n');

  const manifest = [
    '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml" />',
    '    <item id="css" href="styles.css" media-type="text/css" />',
    ...chapterFiles.map(
      (chapter, index) =>
        `    <item id="c${index + 1}" href="${chapter.name}" media-type="application/xhtml+xml" />`,
    ),
  ].join('\n');

  const spine = chapterFiles.map((_, index) => `    <itemref idref="c${index + 1}" />`).join('\n');

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:title>${escapeXml(manuscript.title)}</dc:title>
    <dc:creator>${escapeXml(manuscript.author || '佚名')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>
`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN" xml:lang="zh-CN">
  <head><meta charset="utf-8" /><title>目录</title></head>
  <body>
    <nav epub:type="toc" id="toc">
      <h1>目录</h1>
      <ol>
${navItems}
      </ol>
    </nav>
  </body>
</html>
`;

  const navPoints = chapterFiles
    .map(
      (chapter, index) => `    <navPoint id="np${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(formatChapterTitle(chapter.number, chapter.title))}</text></navLabel>
      <content src="${chapter.name}" />
    </navPoint>`,
    )
    .join('\n');

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle><text>${escapeXml(manuscript.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>
`;

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`;

  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {
    // 必须第一个、必须不压缩
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': [strToU8(container), { level: 6 }],
    'OEBPS/content.opf': [strToU8(contentOpf), { level: 6 }],
    'OEBPS/nav.xhtml': [strToU8(nav), { level: 6 }],
    'OEBPS/toc.ncx': [strToU8(ncx), { level: 6 }],
    'OEBPS/styles.css': [strToU8(STYLES), { level: 6 }],
  };

  for (const chapter of chapterFiles) {
    files[`OEBPS/${chapter.name}`] = [strToU8(chapter.content), { level: 6 }];
  }

  return zipSync(files);
}
