import { describe, expect, it } from 'vitest';
import { createChapter, createVolume, getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { buildMarkdown } from '@main/modules/export-markdown';
import { buildTxt } from '@main/modules/export-txt';
import { saveChapter } from '@main/modules/chapter';
import { createTempDb } from './helpers/temp-db';

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'novel' });
  const firstVolumeId = getTree(temp.db, project.id).volumes[0]?.id as string;
  const firstChapterId = getTree(temp.db, project.id).volumes[0]?.chapters[0]?.id as string;

  saveChapter(temp.db, {
    chapterId: firstChapterId,
    contentJson: docJson('第一卷的正文'),
    plainText: '第一卷的正文',
  });

  const withSecond = createVolume(temp.db, project.id, '第二卷');
  const secondVolumeId = withSecond.volumes[1]?.id as string;
  createChapter(temp.db, secondVolumeId, '乙章');
  const secondChapterId = getTree(temp.db, project.id).volumes[1]?.chapters[0]?.id as string;
  saveChapter(temp.db, {
    chapterId: secondChapterId,
    contentJson: docJson('第二卷的正文'),
    plainText: '第二卷的正文',
  });

  return { ...temp, project, firstVolumeId, secondVolumeId };
}

describe('按卷导出', () => {
  it('只导出指定卷的章节', () => {
    const { db, project, secondVolumeId, cleanup } = setup();
    try {
      const txt = buildTxt(db, project.id, secondVolumeId);
      expect(txt).toContain('第二卷');
      expect(txt).toContain('第二卷的正文');
      expect(txt).not.toContain('第一卷的正文');
    } finally {
      cleanup();
    }
  });

  it('不传卷时导出整本', () => {
    const { db, project, cleanup } = setup();
    try {
      const txt = buildTxt(db, project.id);
      expect(txt).toContain('第一卷的正文');
      expect(txt).toContain('第二卷的正文');
    } finally {
      cleanup();
    }
  });

  it('Markdown 按卷导出时标题层级仍正确', () => {
    const { db, project, firstVolumeId, cleanup } = setup();
    try {
      const markdown = buildMarkdown(db, project.id, firstVolumeId);
      expect(markdown).toContain('# 第一卷');
      expect(markdown).toContain('## 第一章');
      expect(markdown).not.toContain('第二卷的正文');
    } finally {
      cleanup();
    }
  });
});
