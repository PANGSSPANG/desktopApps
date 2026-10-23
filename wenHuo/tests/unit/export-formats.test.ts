import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { saveChapter } from '@main/modules/chapter';
import { renderEpub } from '@main/modules/export-epub';
import { renderMarkdown } from '@main/modules/export-markdown';
import { loadManuscript } from '@main/modules/manuscript-content';
import { createChapter, getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { createTempDb } from './helpers/temp-db';

function docJson(paragraphs: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  });
}

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', author: '某某', genre: 'novel' });
  const tree = getTree(temp.db, project.id);
  const volumeId = tree.volumes[0]?.id as string;
  const firstChapterId = tree.volumes[0]?.chapters[0]?.id as string;

  saveChapter(temp.db, {
    chapterId: firstChapterId,
    contentJson: docJson(['开篇一节。', '第二段。']),
    plainText: '开篇一节。\n\n第二段。',
  });

  const after = createChapter(temp.db, volumeId, '第二章');
  const secondChapterId = after.volumes[0]?.chapters[1]?.id as string;
  saveChapter(temp.db, {
    chapterId: secondChapterId,
    contentJson: docJson(['第二章正文。']),
    plainText: '第二章正文。',
  });

  return { ...temp, project };
}

describe('Markdown 导出', () => {
  it('卷用 #、章用 ##，并带 front matter', () => {
    const { db, project, cleanup } = setup();
    try {
      const markdown = renderMarkdown(loadManuscript(db, project.id));

      expect(markdown.startsWith('---\n')).toBe(true);
      expect(markdown).toContain('title: 青云志');
      expect(markdown).toContain('author: 某某');
      expect(markdown).toContain('# 第一卷');
      expect(markdown).toContain('## 第一章');
      expect(markdown).toContain('## 第二章');
      expect(markdown.indexOf('## 第一章')).toBeLessThan(markdown.indexOf('## 第二章'));
      expect(markdown).toContain('开篇一节。');
      expect(markdown).toContain('第二段。');
    } finally {
      cleanup();
    }
  });

  it('空段落不会产生连续三个换行', () => {
    const { db, project, cleanup } = setup();
    try {
      const markdown = renderMarkdown(loadManuscript(db, project.id));
      expect(markdown).not.toMatch(/\n{3,}/);
    } finally {
      cleanup();
    }
  });
});

describe('EPUB 导出', () => {
  it('mimetype 是第一个条目且不压缩', () => {
    const { db, project, cleanup } = setup();
    try {
      const bytes = renderEpub(loadManuscript(db, project.id));
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

      expect(view.getUint32(0, true)).toBe(0x04034b50); // local file header
      expect(view.getUint16(8, true)).toBe(0); // 0 = stored
      const nameLength = view.getUint16(26, true);
      expect(new TextDecoder().decode(bytes.subarray(30, 30 + nameLength))).toBe('mimetype');
    } finally {
      cleanup();
    }
  });

  it('包含 container / opf / nav / ncx 与章节页', () => {
    const { db, project, cleanup } = setup();
    try {
      const files = unzipSync(renderEpub(loadManuscript(db, project.id)));
      const names = Object.keys(files);

      expect(strFromU8(files['mimetype'] as Uint8Array)).toBe('application/epub+zip');
      expect(names).toContain('META-INF/container.xml');
      expect(names).toContain('OEBPS/content.opf');
      expect(names).toContain('OEBPS/nav.xhtml');
      expect(names).toContain('OEBPS/toc.ncx');
      expect(names).toContain('OEBPS/chapter-001.xhtml');
      expect(names).toContain('OEBPS/chapter-002.xhtml');

      const opf = strFromU8(files['OEBPS/content.opf'] as Uint8Array);
      expect(opf).toContain('<dc:language>zh-CN</dc:language>');
      expect(opf).toContain('青云志');

      const nav = strFromU8(files['OEBPS/nav.xhtml'] as Uint8Array);
      expect(nav).toContain('第一章');
      expect(nav).toContain('第二章');

      const chapter = strFromU8(files['OEBPS/chapter-001.xhtml'] as Uint8Array);
      expect(chapter).toContain('开篇一节。');
      expect(chapter).toContain('第二段。');
    } finally {
      cleanup();
    }
  });

  it('正文里的尖括号与 & 会被转义', () => {
    const { db, project, cleanup } = setup();
    try {
      const tree = getTree(db, project.id);
      const chapterId = tree.volumes[0]?.chapters[0]?.id as string;
      saveChapter(db, {
        chapterId,
        contentJson: docJson(['<script> & "引号"']),
        plainText: '<script> & "引号"',
      });

      const files = unzipSync(renderEpub(loadManuscript(db, project.id)));
      const chapter = strFromU8(files['OEBPS/chapter-001.xhtml'] as Uint8Array);

      expect(chapter).toContain('&lt;script&gt; &amp;');
      expect(chapter).not.toContain('<script>');
    } finally {
      cleanup();
    }
  });
});
