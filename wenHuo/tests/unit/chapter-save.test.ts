import { describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { getChapter, patchChapter, saveChapter } from '@main/modules/chapter';
import { getTree } from '@main/modules/manuscript';
import { createProject, listProjects } from '@main/modules/project';
import { getOverview } from '@main/modules/stats';
import { createTempDb } from './helpers/temp-db';

function docJson(text: string): string {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
}

describe('项目与卷章', () => {
  it('新建项目自带第一卷与第一章', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      expect(project.title).toBe('青云志');
      expect(project.genre).toBe('webnovel');
      expect(project.totalWords).toBe(0);

      const tree = getTree(db, project.id);
      expect(tree.volumes).toHaveLength(1);
      expect(tree.volumes[0]?.title).toBe('第一卷');
      expect(tree.volumes[0]?.chapters).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  it('书架按最近编辑排序', () => {
    const { db, cleanup } = createTempDb();
    try {
      createProject(db, { title: '甲', genre: 'novel' });
      createProject(db, { title: '乙', genre: 'webnovel' });
      const projects = listProjects(db);
      expect(projects).toHaveLength(2);
      expect(projects[0]?.title).toBe('乙');
    } finally {
      cleanup();
    }
  });

  it('书名为空时拒绝创建', () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(() => createProject(db, { title: '   ', genre: 'novel' })).toThrow(AppError);
    } finally {
      cleanup();
    }
  });
});

describe('章节保存', () => {
  it('保存后回写字数、正文与全书统计', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const chapterId = getTree(db, project.id).volumes[0]?.chapters[0]?.id;
      expect(chapterId).toBeTruthy();

      const saved = saveChapter(db, {
        chapterId: chapterId as string,
        contentJson: docJson('青云观上有一棵松'),
        plainText: '青云观上有一棵松',
      });

      expect(saved.wordCount).toBe(8);
      expect(saved.sessionWords).toBe(8);

      const detail = getChapter(db, chapterId as string);
      expect(detail.wordCount).toBe(8);
      expect(detail.contentJson).toContain('青云观');

      const stats = getOverview(db, project.id);
      expect(stats.todayWords).toBe(8);
      expect(stats.totalWords).toBe(8);
    } finally {
      cleanup();
    }
  });

  it('删字后今日字数为净增量', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const chapterId = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;

      saveChapter(db, { chapterId, contentJson: docJson('一二三四五'), plainText: '一二三四五' });
      saveChapter(db, { chapterId, contentJson: docJson('一二'), plainText: '一二' });

      const stats = getOverview(db, project.id);
      expect(stats.todayWords).toBe(2);
      expect(stats.totalWords).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('净增量为负时展示下限为 0', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const chapterId = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;

      db.prepare('UPDATE chapters SET word_count = 5, plain_text = ? WHERE id = ?').run(
        '一二三四五',
        chapterId,
      );
      saveChapter(db, { chapterId, contentJson: docJson(''), plainText: '' });

      const stats = getOverview(db, project.id);
      expect(stats.todayWords).toBe(0);
      expect(stats.totalWords).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('baseHash 不一致时拒绝覆盖', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const chapterId = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;

      saveChapter(db, { chapterId, contentJson: docJson('第一版'), plainText: '第一版' });

      let code = '';
      try {
        saveChapter(db, {
          chapterId,
          contentJson: docJson('第二版'),
          plainText: '第二版',
          baseHash: 'stale-hash',
        });
      } catch (error) {
        code = error instanceof AppError ? error.code : 'unknown';
      }
      expect(code).toBe('CONFLICT_STALE_CONTENT');
    } finally {
      cleanup();
    }
  });

  it('已完成章节拒绝保存，改回草稿后可继续', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const chapterId = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;
      saveChapter(db, { chapterId, contentJson: docJson('第一版'), plainText: '第一版' });

      patchChapter(db, chapterId, { status: 'done' });

      let code = '';
      try {
        saveChapter(db, { chapterId, contentJson: docJson('偷改'), plainText: '偷改' });
      } catch (error) {
        code = error instanceof AppError ? error.code : 'unknown';
      }
      expect(code).toBe('CHAPTER_LOCKED');

      patchChapter(db, chapterId, { status: 'draft' });
      expect(() =>
        saveChapter(db, { chapterId, contentJson: docJson('改回后'), plainText: '改回后' }),
      ).not.toThrow();
    } finally {
      cleanup();
    }
  });
});
