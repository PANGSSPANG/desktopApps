import { describe, expect, it } from 'vitest';
import { formatChapterTitle } from '@shared/chapter-title';
import { createChapter, createVolume, deleteChapter, getTree } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { createTempDb } from './helpers/temp-db';

/** 展示用标题 = 派生章号 + 去掉旧前缀的名字 */
function displayTitles(db: ReturnType<typeof createTempDb>['db'], projectId: string): string[] {
  return (getTree(db, projectId).volumes[0]?.chapters ?? []).map((item) =>
    formatChapterTitle(item.number, item.title),
  );
}

describe('派生章号', () => {
  it('首章编号为 1', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const tree = getTree(db, project.id);
      expect(tree.volumes[0]?.title).toBe('第一卷');
      expect(tree.volumes[0]?.chapters[0]?.number).toBe(1);
      expect(displayTitles(db, project.id)).toEqual(['第一章']);
    } finally {
      cleanup();
    }
  });

  it('新增章节按位置连续编号', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const volumeId = getTree(db, project.id).volumes[0]?.id as string;
      createChapter(db, volumeId);
      createChapter(db, volumeId);
      expect(displayTitles(db, project.id)).toEqual(['第一章', '第二章', '第三章']);
    } finally {
      cleanup();
    }
  });

  it('删掉第一章后，原第二章的编号自动变成 1', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const volumeId = getTree(db, project.id).volumes[0]?.id as string;
      const firstId = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;
      createChapter(db, volumeId, '青云观');

      deleteChapter(db, firstId);
      expect(displayTitles(db, project.id)).toEqual(['第一章 青云观']);

      createChapter(db, volumeId);
      expect(displayTitles(db, project.id)).toEqual(['第一章 青云观', '第二章']);
    } finally {
      cleanup();
    }
  });

  it('旧标题里的「第X章」前缀不会重复展示', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const tree = getTree(db, project.id);
      const chapterId = tree.volumes[0]?.chapters[0]?.id as string;
      db.prepare('UPDATE chapters SET title = ? WHERE id = ?').run('第一章 玄清', chapterId);

      expect(displayTitles(db, project.id)).toEqual(['第一章 玄清']);
    } finally {
      cleanup();
    }
  });

  it('卷仍然是「第X卷」，新增卷不重名', () => {
    const { db, cleanup } = createTempDb();
    try {
      const project = createProject(db, { title: '青云志', genre: 'webnovel' });
      const tree = createVolume(db, project.id);
      expect(tree.volumes.map((volume) => volume.title)).toEqual(['第一卷', '第二卷']);
    } finally {
      cleanup();
    }
  });
});
