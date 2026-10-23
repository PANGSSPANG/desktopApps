import { describe, expect, it } from 'vitest';
import { AppError } from '@shared/errors';
import { formatChapterTitle } from '@shared/chapter-title';
import { createChapter, createVolume, getTree, moveVolume } from '@main/modules/manuscript';
import { createProject, listProjects, renameProject } from '@main/modules/project';
import { createTempDb } from './helpers/temp-db';

function setup() {
  const temp = createTempDb();
  const project = createProject(temp.db, { title: '青云志', genre: 'novel' });
  return { ...temp, project };
}

describe('卷排序（moveVolume）', () => {
  it('把第三卷拖到第一卷之前', () => {
    const { db, project, cleanup } = setup();
    try {
      createVolume(db, project.id, '第二卷');
      const withThird = createVolume(db, project.id, '第三卷');
      const first = withThird.volumes[0]?.id as string;
      const third = withThird.volumes[2]?.id as string;

      const tree = moveVolume(db, third, first);
      expect(tree.volumes.map((volume) => volume.title)).toEqual(['第三卷', '第一卷', '第二卷']);
    } finally {
      cleanup();
    }
  });

  it('拖到末尾（beforeVolumeId 为 null）', () => {
    const { db, project, cleanup } = setup();
    try {
      createVolume(db, project.id, '第二卷');
      const first = getTree(db, project.id).volumes[0]?.id as string;

      const tree = moveVolume(db, first, null);
      expect(tree.volumes.map((volume) => volume.title)).toEqual(['第二卷', '第一卷']);
    } finally {
      cleanup();
    }
  });

  it('卷顺序决定章号：第二卷的章排在后面', () => {
    const { db, project, cleanup } = setup();
    try {
      const withSecond = createVolume(db, project.id, '第二卷');
      const firstVolumeId = withSecond.volumes[0]?.id as string;
      const secondVolumeId = withSecond.volumes[1]?.id as string;
      createChapter(db, secondVolumeId, '乙章');
      createChapter(db, firstVolumeId, '甲章');

      // 把第二卷拖到最前
      moveVolume(db, secondVolumeId, firstVolumeId);

      const tree = getTree(db, project.id);
      const first = tree.volumes[0]?.chapters[0];
      expect(tree.volumes[0]?.title).toBe('第二卷');
      expect(first?.number).toBe(1);
      expect(formatChapterTitle(first?.number ?? 0, first?.title ?? '')).toBe('第一章 乙章');
    } finally {
      cleanup();
    }
  });

  it('卷不存在时报错', () => {
    const { db, cleanup } = setup();
    try {
      expect(() => moveVolume(db, 'ghost', null)).toThrow(AppError);
    } finally {
      cleanup();
    }
  });
});

describe('项目重命名', () => {
  it('改名后书架与详情都更新', () => {
    const { db, project, cleanup } = setup();
    try {
      renameProject(db, project.id, '新书名');
      expect(listProjects(db)[0]?.title).toBe('新书名');
    } finally {
      cleanup();
    }
  });

  it('空书名被拒绝', () => {
    const { db, project, cleanup } = setup();
    try {
      expect(() => renameProject(db, project.id, '   ')).toThrow(AppError);
    } finally {
      cleanup();
    }
  });
});
