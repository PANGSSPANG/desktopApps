import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTxt, exportTxt } from '@main/modules/export-txt';
import { createChapter, getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { saveChapter } from '@main/modules/chapter';
import { createTempDb } from './helpers/temp-db';

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

describe('TXT 导出', () => {
  it('卷章顺序、标题与正文齐全，且带 BOM 与 CRLF', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, {
        title: '青云志',
        author: '某某',
        genre: 'webnovel',
      });
      const tree = getTree(db, project.id);
      const volumeId = tree.volumes[0]?.id as string;
      const firstChapterId = tree.volumes[0]?.chapters[0]?.id as string;

      saveChapter(db, {
        chapterId: firstChapterId,
        contentJson: docJson('开篇一节。'),
        plainText: '开篇一节。',
      });

      const afterCreate = createChapter(db, volumeId, '第二章');
      const secondChapterId = afterCreate.volumes[0]?.chapters[1]?.id as string;
      saveChapter(db, {
        chapterId: secondChapterId,
        contentJson: docJson('第二章正文。'),
        plainText: '第二章正文。',
      });

      const text = buildTxt(db, project.id);

      expect(text.startsWith('\uFEFF')).toBe(true);
      expect(text).toContain('《青云志》');
      expect(text).toContain('作者：某某');
      expect(text).toContain('第一卷');
      expect(text).toContain('第一章');
      expect(text).toContain('开篇一节。');
      expect(text).toContain('第二章正文。');

      // 章节顺序：第一章在第二章之前
      expect(text.indexOf('第一章')).toBeLessThan(text.indexOf('第二章'));
      expect(text).toContain('\r\n');
    } finally {
      cleanup();
    }
  });

  it('exportTxt 真正写盘，内容与 buildTxt 一致', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const target = join(tmpdir(), `wenhuo-export-${Date.now()}.txt`);

      const result = exportTxt(db, project.id, target);
      const written = readFileSync(target, 'utf8');

      expect(result.filePath).toBe(target);
      expect(result.bytes).toBeGreaterThan(0);
      expect(written).toBe(buildTxt(db, project.id));
      expect(written.charCodeAt(0)).toBe(0xfeff);

      rmSync(target, { force: true });
    } finally {
      cleanup();
    }
  });
});
