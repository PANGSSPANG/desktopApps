import { describe, expect, it } from 'vitest';
import { formatChapterTitle } from '@shared/chapter-title';
import { createChapter, createVolume, getTree, moveChapter } from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
import { createTempDb } from './helpers/temp-db';

function titles(db: ReturnType<typeof createTempDb>['db'], projectId: string): string[] {
  return (getTree(db, projectId).volumes[0]?.chapters ?? []).map((item) =>
    formatChapterTitle(item.number, item.title),
  );
}

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'novel' });
  const volumeId = getTree(temp.db, project.id).volumes[0]?.id as string;
  createChapter(temp.db, volumeId, '二');
  createChapter(temp.db, volumeId, '三');
  return { ...temp, project, volumeId };
}

describe('拖拽排序（moveChapter）', () => {
  it('把第三章拖到第一章之前', () => {
    const { db, project, volumeId, cleanup } = setup();
    try {
      const chapters = getTree(db, project.id).volumes[0]?.chapters ?? [];
      const first = chapters[0]?.id as string;
      const third = chapters[2]?.id as string;

      const tree = moveChapter(db, {
        chapterId: third,
        targetVolumeId: volumeId,
        beforeChapterId: first,
      });

      expect(tree.volumes[0]?.chapters.map((item) => item.title)).toEqual(['三', '第一章', '二']);
      expect(titles(db, project.id)).toEqual(['第一章 三', '第二章', '第三章 二']);
    } finally {
      cleanup();
    }
  });

  it('移动到卷末（beforeChapterId 为 null）', () => {
    const { db, project, volumeId, cleanup } = setup();
    try {
      const first = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;
      const tree = moveChapter(db, {
        chapterId: first,
        targetVolumeId: volumeId,
        beforeChapterId: null,
      });
      expect(tree.volumes[0]?.chapters.map((item) => item.title)).toEqual(['二', '三', '第一章']);
    } finally {
      cleanup();
    }
  });

  it('跨卷移动后章号按新位置重排', () => {
    const { db, project, volumeId, cleanup } = setup();
    try {
      const treeWithSecond = createChapter(db, volumeId, '甲');
      const first = treeWithSecond.volumes[0]?.chapters[3]?.id as string;
      // 新建第二卷（createVolume 走的是 addVolume 同一条路径）
      const withVolume = createVolume(db, project.id, '第二卷');
      const secondVolumeId = withVolume.volumes[1]?.id as string;

      moveChapter(db, {
        chapterId: first,
        targetVolumeId: secondVolumeId,
        beforeChapterId: null,
      });

      const tree = getTree(db, project.id);
      expect(tree.volumes[1]?.chapters.map((item) => item.title)).toEqual(['甲']);
      expect(tree.volumes[1]?.chapters[0]?.number).toBe(4);
    } finally {
      cleanup();
    }
  });

  it('移动到不存在的卷会报错', () => {
    const { db, project, cleanup } = setup();
    try {
      const first = getTree(db, project.id).volumes[0]?.chapters[0]?.id as string;
      expect(() =>
        moveChapter(db, { chapterId: first, targetVolumeId: 'ghost', beforeChapterId: null }),
      ).toThrow();
    } finally {
      cleanup();
    }
  });
});
