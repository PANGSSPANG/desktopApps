import { describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { saveChapter } from '@main/modules/chapter';
import {
  createChapter,
  createVolume,
  deleteChapter,
  deleteVolume,
  getTree,
} from '@main/modules/manuscript';
import { createProject } from '@main/modules/project';
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
  const tree = getTree(temp.db, project.id);
  const volumeId = tree.volumes[0]?.id as string;
  const chapterId = tree.volumes[0]?.chapters[0]?.id as string;

  saveChapter(temp.db, {
    chapterId,
    contentJson: docJson('开篇一节。'),
    plainText: '开篇一节。',
  });

  return { ...temp, project, volumeId, chapterId };
}

describe('删除卷与章节', () => {
  it('删除章节后树里不再有它', () => {
    const { db, project, chapterId, cleanup } = setup();
    try {
      const tree = deleteChapter(db, chapterId);
      expect(tree.volumes[0]?.chapters).toHaveLength(0);
      expect(getTree(db, project.id).volumes[0]?.chapters).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('删除卷会连带删除其中章节', () => {
    const { db, project, volumeId, cleanup } = setup();
    try {
      const tree = deleteVolume(db, volumeId);
      expect(tree.volumes).toHaveLength(0);

      const chapters = db.prepare('SELECT COUNT(*) AS count FROM chapters').get() as {
        count: number;
      };
      expect(chapters.count).toBe(0);
      expect(getTree(db, project.id).volumes).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('删除不存在的卷报 NOT_FOUND', () => {
    const { db, cleanup } = setup();
    try {
      expect(() => deleteVolume(db, 'ghost-volume')).toThrow(AppError);
    } finally {
      cleanup();
    }
  });

  it('新建卷后再删除，剩下章节仍完整', () => {
    const { db, project, cleanup } = setup();
    try {
      const withSecond = createVolume(db, project.id, '第二卷');
      const secondVolumeId = withSecond.volumes[1]?.id as string;
      createChapter(db, secondVolumeId, '孤章');

      const tree = deleteVolume(db, secondVolumeId);
      expect(tree.volumes).toHaveLength(1);
      expect(tree.volumes[0]?.chapters).toHaveLength(1);
    } finally {
      cleanup();
    }
  });
});
